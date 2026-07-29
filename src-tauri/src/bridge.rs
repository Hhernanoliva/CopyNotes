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
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

// Shared by the startup sweep and the live watch loop: read one inbox file,
// emit it to the webview, then move it to processed/ so it is never re-read.
fn process_inbox_file(app: &tauri::AppHandle, path: &Path, processed: &Path) {
    if let Ok(text) = fs::read_to_string(path) {
        if let Err(e) = app.emit("bridge://change", text) {
            log::warn!("bridge emit failed: {e}");
        }
        if let Some(name) = path.file_name() {
            if let Err(e) = fs::rename(path, processed.join(name)) {
                log::warn!("bridge move-to-processed failed: {e}");
            }
        }
    }
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
                process_inbox_file(&app, &path, &processed);
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
                process_inbox_file(&app, &path, &processed);
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
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
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
}
