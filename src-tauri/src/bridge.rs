use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::time::{Duration, SystemTime};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager};

// The mailbox carries the user's note text in the clear, so it must not be
// readable by every process running as another user on the machine (spec 030
// phase 0). Owner-only: 0700 for the folders, 0600 for the files. Best-effort —
// a filesystem that cannot express these modes must not break the bridge.
#[cfg(unix)]
fn restrict(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
}

#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) {}

// En Unix un `rename` sobre un destino existente no puede fallar por culpa de
// otro proceso. En Windows sí: `MoveFileEx` devuelve "acceso denegado" mientras
// alguien tenga el destino abierto — y `export.json` lo lee el servidor MCP en
// CADA llamada, mientras la app lo reescribe con cada cambio de notas. El
// antivirus agranda la ventana porque abre archivos para escanearlos sin avisar.
//
// La ventana dura milisegundos, así que unos pocos reintentos la cubren. El tope
// es obligatorio: sin él, un error permanente colgaría este hilo para siempre.
const REPLACE_ATTEMPTS: u32 = 5;
const REPLACE_BACKOFF: Duration = Duration::from_millis(20);

fn replace_atomically(tmp: &Path, target: &Path) -> Result<(), String> {
    let mut last = String::new();
    for attempt in 0..REPLACE_ATTEMPTS {
        match fs::rename(tmp, target) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last = error.to_string();
                if attempt + 1 < REPLACE_ATTEMPTS {
                    std::thread::sleep(REPLACE_BACKOFF * (attempt + 1));
                }
            }
        }
    }
    // El temporal se queda donde está a propósito: la próxima escritura lo pisa,
    // y borrarlo acá tiraría la única copia del contenido que no llegó a destino.
    Err(last)
}

// A file older than this is history nobody reads. Keeping them forever left a
// growing pile of the user's own task text on disk. Applies to inbox/processed/
// (requests already applied) and to outbox/ (answers the client read and
// deleted itself — what stays here is an answer nobody ever came back for).
const PROCESSED_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);

fn prune_stale_files(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        // A file whose mtime is in the future (clock skew) yields an Err from
        // duration_since — treat it as fresh and leave it alone.
        let age = entry
            .metadata()
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok());
        if age.is_some_and(|age| age > PROCESSED_TTL) {
            let _ = fs::remove_file(&path);
        }
    }
}

// The Rust side owns the mailbox folder under the app's data dir. The webview
// never touches the filesystem directly; it calls these commands.
fn mailbox_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("mailbox");
    fs::create_dir_all(dir.join("inbox")).map_err(|e| e.to_string())?;
    restrict(&dir, 0o700);
    restrict(&dir.join("inbox"), 0o700);
    Ok(dir)
}

#[tauri::command]
pub fn bridge_mailbox_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir = mailbox_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn bridge_write_export(app: tauri::AppHandle, contents: String) -> Result<String, String> {
    let dir = mailbox_dir(&app)?;
    let target = dir.join("export.json");
    let tmp = dir.join("export.json.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    // Lock it down BEFORE the rename, so the final path is never briefly
    // world-readable.
    restrict(&tmp, 0o600);
    replace_atomically(&tmp, &target)?;
    Ok(target.to_string_lossy().to_string())
}

// A name that becomes a path segment must not be able to escape the folder it
// belongs to. One rule, used by both the outbox (where the change id becomes a
// filename) and the ack (where an inbox filename comes back from the webview) —
// two copies would drift.
fn is_safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && !name.contains("..")
}

// Moves an applied request out of the inbox. Split from the command so it can be
// tested without an AppHandle. Idempotent: a file that is already gone is not an
// error, because a double ack must never fail a tool call.
fn ack_in(inbox: &Path, file: &str) -> Result<(), String> {
    if !is_safe_name(file) {
        return Err("invalid file".to_string());
    }
    let processed = inbox.join("processed");
    fs::create_dir_all(&processed).map_err(|e| e.to_string())?;
    restrict(&processed, 0o700);
    let source = inbox.join(file);
    if !source.is_file() {
        return Ok(());
    }
    fs::rename(&source, processed.join(file)).map_err(|e| e.to_string())
}

// Shared by the startup sweep and the live watch loop: read one inbox file and
// hand it to the webview. It is NOT archived here. A request leaves the inbox
// only once the webview confirms it (bridge_ack) — before that, a reload or a
// crash between the emit and the answer lost the request for good. Now it stays
// put and the next startup sweep finds it again; the JS side dedupes by change
// id, so a replay applies at most once (src/lib/bridge/ingest.ts).
//
// `boot` says the sweep found it, i.e. it waited while the app was closed — the
// webview counts those to tell the person what happened while they were away.
fn process_inbox_file(app: &tauri::AppHandle, path: &Path, processed: &Path, boot: bool) {
    let Some(name) = path.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
        return;
    };
    // A name nobody could ever ack is a dead letter: archive it now, or it comes
    // back on every single boot forever.
    if !is_safe_name(&name) {
        if let Err(e) = fs::rename(path, processed.join(&name)) {
            log::warn!("bridge dead-letter move failed: {e}");
        }
        return;
    }
    if let Ok(text) = fs::read_to_string(path) {
        let payload = serde_json::json!({ "file": name, "text": text, "boot": boot });
        if let Err(e) = app.emit("bridge://change", payload) {
            log::warn!("bridge emit failed: {e}");
        }
    }
}

#[tauri::command]
pub fn bridge_ack(app: tauri::AppHandle, file: String) -> Result<(), String> {
    let dir = mailbox_dir(&app)?;
    ack_in(&dir.join("inbox"), &file)
}

// Guards against spawning a second watcher thread when the webview reloads
// and BridgeLifecycle re-mounts, re-invoking this command. The Rust process
// survives webview reloads, so the first watcher keeps working — a second
// invocation is a no-op, not a duplicate thread that double-emits every file.
static WATCH_STARTED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn bridge_start_watch(app: tauri::AppHandle) -> Result<(), String> {
    if WATCH_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let dir = mailbox_dir(&app)?;
    let inbox = dir.join("inbox");
    let processed = inbox.join("processed");
    fs::create_dir_all(&processed).map_err(|e| e.to_string())?;
    restrict(&processed, 0o700);
    // Sweep the old piles once per app start. Cheap, and it never runs while an
    // agent is mid-request because the watcher has not started yet.
    prune_stale_files(&processed);
    prune_stale_files(&dir.join("outbox"));
    // The inbox joins them now that a request survives until it is acked: one
    // nobody could deliver in a week is not a pending order any more, it is the
    // user's own task text sitting on disk. Runs BEFORE the sweep below, so an
    // ancient request is never applied. prune_stale_files skips directories, so
    // processed/ (right inside inbox/) is not at risk.
    prune_stale_files(&inbox);

    std::thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                log::error!("bridge watcher init failed: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&inbox, RecursiveMode::NonRecursive) {
            log::error!("bridge watch({}) failed: {e}", inbox.display());
            return;
        }

        // Startup sweep: pick up files dropped in inbox/ while the app was
        // closed (the watcher only sees events from here on). Run AFTER
        // watch() is registered so a file that arrives mid-sweep is still
        // caught by the watcher too — a harmless double-emit, deduped on
        // the JS side by change.id.
        if let Ok(entries) = fs::read_dir(&inbox) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                process_inbox_file(&app, &path, &processed, true);
            }
        }

        for event in rx {
            let Ok(event) = event else { continue };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                continue;
            }
            for path in event.paths {
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                process_inbox_file(&app, &path, &processed, false);
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn bridge_write_outbox(app: tauri::AppHandle, id: String, contents: String) -> Result<String, String> {
    // id becomes a filename — reject path separators / traversal (untrusted origin).
    if id.is_empty()
        || id.len() > 128
        || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid id".to_string());
    }
    let dir = mailbox_dir(&app)?;
    let outbox = dir.join("outbox");
    fs::create_dir_all(&outbox).map_err(|e| e.to_string())?;
    restrict(&outbox, 0o700);
    let target = outbox.join(format!("{id}.json"));
    let tmp = outbox.join(format!("{id}.json.tmp"));
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    restrict(&tmp, 0o600);
    replace_atomically(&tmp, &target)?;
    Ok(target.to_string_lossy().to_string())
}

// Resolves the packaged MCP server's absolute path so the app can pre-fill it
// in the per-client MCP config shown in Settings. In a bundled app the server
// lives under the resource dir; in `tauri dev` it lives in the repo at
// ../mcp/server.js relative to this crate. Prefer the packaged copy; fall back
// to the dev path only when the resource is absent.
#[tauri::command]
pub fn bridge_server_path(app: tauri::AppHandle) -> Result<String, String> {
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("mcp/server.js");
        if bundled.exists() {
            return Ok(bundled.to_string_lossy().to_string());
        }
    }
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../mcp/server.js");
    Ok(dev.to_string_lossy().to_string())
}

// Reads the MCP server's liveness heartbeat (agent-status.json at the mailbox
// root, written by mcp/lib/mailbox.js). Returns the raw JSON text so the
// webview parses { lastSeen }, or None when no agent has ever connected.
#[tauri::command]
pub fn bridge_read_status(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = mailbox_dir(&app)?;
    let status = dir.join("agent-status.json");
    match fs::read_to_string(&status) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;

    // prune_stale_files deletes files, so the cutoff gets its own check: a fresh
    // request must survive the sweep that clears an ancient one.
    #[test]
    fn prune_stale_files_deletes_only_files_past_the_ttl() {
        let dir = std::env::temp_dir().join(format!("cn-prune-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let fresh = dir.join("fresh.json");
        let old = dir.join("old.json");
        fs::write(&fresh, "{}").unwrap();
        fs::write(&old, "{}").unwrap();

        let long_ago = SystemTime::now() - PROCESSED_TTL - Duration::from_secs(60);
        let times = fs::FileTimes::new().set_modified(long_ago);
        File::options()
            .write(true)
            .open(&old)
            .unwrap()
            .set_times(times)
            .unwrap();

        prune_stale_files(&dir);

        assert!(fresh.exists(), "a recent processed file must survive");
        assert!(!old.exists(), "a processed file past the TTL must be removed");

        let _ = fs::remove_dir_all(&dir);
    }

    // The whole point of the ack protocol: a request leaves the inbox ONLY when
    // the webview confirms it. An unconfirmed one has to still be there for the
    // next startup sweep to find.
    #[test]
    fn ack_archives_only_the_confirmed_file() {
        let inbox = std::env::temp_dir().join(format!("cn-ack-{}", std::process::id()));
        let _ = fs::remove_dir_all(&inbox);
        fs::create_dir_all(&inbox).unwrap();

        let done = inbox.join("aplicada.json");
        let waiting = inbox.join("sin-confirmar.json");
        fs::write(&done, "{}").unwrap();
        fs::write(&waiting, "{}").unwrap();

        ack_in(&inbox, "aplicada.json").unwrap();

        assert!(!done.exists(), "the acked request must leave the inbox");
        assert!(
            inbox.join("processed/aplicada.json").is_file(),
            "and land in processed/"
        );
        assert!(
            waiting.exists(),
            "an unacked request must stay for the next startup sweep"
        );

        // Acking twice is how a retry behaves; it must not fail.
        ack_in(&inbox, "aplicada.json").unwrap();

        let _ = fs::remove_dir_all(&inbox);
    }

    #[test]
    fn replace_atomically_pisa_el_destino_que_ya_existe() {
        let dir = std::env::temp_dir().join(format!("cn-replace-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let target = dir.join("export.json");
        let tmp = dir.join("export.json.tmp");
        fs::write(&target, "viejo").unwrap();
        fs::write(&tmp, "nuevo").unwrap();

        replace_atomically(&tmp, &target).unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "nuevo");
        assert!(!tmp.exists(), "el temporal se consume en el renombre");

        let _ = fs::remove_dir_all(&dir);
    }

    // Los reintentos cubren una ventana de milisegundos, no un destino imposible.
    // Sin un tope, un error permanente colgaría el hilo del webview para siempre:
    // la app se quedaría tildada al guardar, sin error y sin explicación.
    #[test]
    fn replace_atomically_se_rinde_en_vez_de_reintentar_para_siempre() {
        let dir = std::env::temp_dir().join(format!("cn-replace-err-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let tmp = dir.join("origen.json");
        fs::write(&tmp, "{}").unwrap();
        // Un directorio como destino no se puede pisar con un archivo en ningún
        // sistema, así que el renombre falla en los cinco intentos.
        let target = dir.join("soy-una-carpeta");
        fs::create_dir_all(&target).unwrap();

        let empezo = std::time::Instant::now();
        assert!(replace_atomically(&tmp, &target).is_err());
        assert!(
            empezo.elapsed() < Duration::from_secs(2),
            "el tope de reintentos tiene que cortar rápido"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ack_refuses_a_name_that_escapes_the_inbox() {
        let inbox = std::env::temp_dir().join(format!("cn-ack-esc-{}", std::process::id()));
        let _ = fs::remove_dir_all(&inbox);
        fs::create_dir_all(&inbox).unwrap();

        let outside = inbox.parent().unwrap().join("cn-victima.json");
        fs::write(&outside, "{}").unwrap();

        assert!(ack_in(&inbox, "../cn-victima.json").is_err());
        assert!(ack_in(&inbox, "sub/otro.json").is_err());
        assert!(ack_in(&inbox, "").is_err());
        assert!(outside.exists(), "nothing outside the inbox may be touched");

        let _ = fs::remove_file(&outside);
        let _ = fs::remove_dir_all(&inbox);
    }
}
