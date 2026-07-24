use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::channel;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager};

// The Rust side owns the mailbox folder under the app's data dir. The webview
// never touches the filesystem directly; it calls these commands.
fn mailbox_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("mailbox");
    fs::create_dir_all(dir.join("inbox")).map_err(|e| e.to_string())?;
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
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn bridge_start_watch(app: tauri::AppHandle) -> Result<(), String> {
    let dir = mailbox_dir(&app)?;
    let inbox = dir.join("inbox");
    let processed = inbox.join("processed");
    fs::create_dir_all(&processed).map_err(|e| e.to_string())?;

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
        for event in rx {
            let Ok(event) = event else { continue };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                continue;
            }
            for path in event.paths {
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(text) = fs::read_to_string(&path) {
                    if let Err(e) = app.emit("bridge://change", text) {
                        log::warn!("bridge emit failed: {e}");
                    }
                    if let Some(name) = path.file_name() {
                        if let Err(e) = fs::rename(&path, processed.join(name)) {
                            log::warn!("bridge move-to-processed failed: {e}");
                        }
                    }
                }
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
    let target = outbox.join(format!("{id}.json"));
    let tmp = outbox.join(format!("{id}.json.tmp"));
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}
