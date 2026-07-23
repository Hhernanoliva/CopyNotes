use std::fs;
use std::path::PathBuf;
use tauri::Manager;

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
