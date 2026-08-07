mod bridge;

// `window.open` no abre nada dentro del webview de Tauri: WebKit sólo atiende
// el pedido de ventana nueva si la app registró un manejador para eso, y esta
// no lo hace (wry `wry_web_view_ui_delegate.rs`, rama `if let Some(...)`). El
// enlace de una nota moría en silencio en la app de escritorio. Así que el
// frontend lo manda por acá y se abre en el navegador del sistema.
//
// La dirección llega desde el webview, o sea desde texto que escribió alguien,
// así que el esquema se vuelve a validar ACÁ y no se confía en que el frontend
// ya lo hizo: `open` de macOS abre archivos y aplicaciones, no sólo páginas, y
// un `file://` o la ruta de un binario entrarían solos. Con la lista blanca la
// dirección tampoco puede empezar con `-`, así que nunca se lee como una opción
// del comando.
fn is_openable(url: &str) -> bool {
  url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
  if !is_openable(&url) {
    return Err(format!("esquema no permitido: {url}"));
  }
  std::process::Command::new("/usr/bin/open")
    .arg(&url)
    .spawn()
    .map(|_| ())
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      open_external,
      bridge::bridge_mailbox_path,
      bridge::bridge_write_export,
      bridge::bridge_start_watch,
      bridge::bridge_write_outbox,
      bridge::bridge_ack,
      bridge::bridge_server_path,
      bridge::bridge_read_status
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::is_openable;

  #[test]
  fn solo_deja_pasar_paginas_y_correo() {
    assert!(is_openable("https://ejemplo.com"));
    assert!(is_openable("http://ejemplo.com"));
    assert!(is_openable("mailto:alguien@ejemplo.com"));

    // `open` abriría cualquiera de estas: un archivo del disco, una app, o un
    // esquema registrado por otro programa. Ninguna sale de un enlace de nota.
    assert!(!is_openable("file:///etc/passwd"));
    assert!(!is_openable("/Applications/Calculator.app"));
    assert!(!is_openable("javascript:alert(1)"));
    assert!(!is_openable("-a"));
    assert!(!is_openable(""));
  }
}
