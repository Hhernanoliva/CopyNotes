mod bridge;
mod oauth;

use tauri::Manager;

// `window.open` no abre nada dentro del webview de Tauri: WebKit sólo atiende
// el pedido de ventana nueva si la app registró un manejador para eso, y esta
// no lo hace (wry `wry_web_view_ui_delegate.rs`, rama `if let Some(...)`). El
// enlace de una nota moría en silencio en la app de escritorio. Así que el
// frontend lo manda por acá y se abre en el navegador del sistema.
//
// La dirección llega desde el webview, o sea desde texto que escribió alguien,
// así que el esquema se vuelve a validar ACÁ y no se confía en que el frontend
// ya lo hizo: el abridor del sistema abre archivos y aplicaciones, no sólo páginas, y
// un `file://` o la ruta de un binario entrarían solos. Con la lista blanca la
// dirección tampoco puede empezar con `-`, así que nunca se lee como una opción
// del comando.
fn is_openable(url: &str) -> bool {
  url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")
}

#[tauri::command]
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
  if !is_openable(&url) {
    return Err(format!("esquema no permitido: {url}"));
  }
  // El complemento oficial resuelve el abridor de cada sistema (`open` en
  // macOS, `ShellExecute` en Windows, `xdg-open` en Linux). Va DETRÁS de la
  // guardia, no en su lugar: la dirección sigue llegando desde texto que
  // escribió alguien, y el abridor de Windows lanza programas registrados por
  // otras apps con la misma facilidad con que `open` abre archivos.
  tauri_plugin_opener::OpenerExt::opener(&app)
    .open_url(url, None::<&str>)
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      // Ya hay una ventana viva: traerla al frente y dejar morir a este proceso.
      // macOS impide solo el doble arranque; Windows no, y ahí dos procesos
      // escribirían sobre la MISMA IndexedDB sin verse — el aviso entre pestañas
      // (BroadcastChannel) no cruza entre procesos distintos.
      if let Some(ventana) = app.get_webview_window("main") {
        let _ = ventana.unminimize();
        let _ = ventana.show();
        let _ = ventana.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .manage(oauth::Pending::default())
    .invoke_handler(tauri::generate_handler![
      open_external,
      oauth::oauth_start,
      oauth::oauth_wait,
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
      // Solo para PREGUNTAR si hay una versión nueva: la app nunca se
      // reemplaza a sí misma. `tauri-plugin-process` queda deliberadamente
      // afuera, así `relaunch()` no existe y esto no se puede volver
      // auto-update sin que alguien lo decida a propósito.
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
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

    // Dos esquemas que un complemento genérico abriría sin chistar: uno arranca
    // un cliente FTP, el otro es la puerta por la que Windows lanza programas
    // registrados por otras apps. La lista blanca es lo único que los frena.
    assert!(!is_openable("ftp://ejemplo.com/x"));
    assert!(!is_openable("ms-msdt:/id"));
    assert!(!is_openable("-a"));
    assert!(!is_openable(""));
  }

  // El complemento de instancia única busca la ventana por su etiqueta, y Tauri
  // le pone "main" a la primera cuando el archivo de configuración no dice otra
  // cosa. Si alguien agrega un `label` distinto, el segundo arranque dejaría de
  // traer la ventana al frente y parecería que la app no abre.
  #[test]
  fn la_ventana_principal_se_llama_main() {
    let conf: serde_json::Value =
      serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let ventanas = conf["app"]["windows"].as_array().unwrap();
    let etiqueta = ventanas[0]["label"].as_str().unwrap_or("main");
    assert_eq!(etiqueta, "main");
  }
}
