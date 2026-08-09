// The desktop half of "Continuar con Google" (spec 034 phase 2).
//
// The webview loads bundled files, so it lives on an internal address no
// redirect from the outside can reach — the same wall that killed the magic
// link in spec 030. The way through is a loopback: the app opens the person's
// own browser, and listens on a port of its own machine for Google's trip back.
//
// Two commands and not one, because the port has to reach the frontend *before*
// the browser is opened (it goes into `redirectTo`), and the answer only arrives
// minutes later. Binding in the first command is also what makes the gap safe:
// a browser that comes back before `oauth_wait` runs is queued by the OS in the
// socket's backlog instead of being refused.
//
// Nothing is parsed here beyond "is this the trip back?": the address is handed
// to the frontend whole, and the same pure functions the web half already uses
// (`sync/oauth-return.ts`) read `code`, `sb_flow_id` and `error` out of it.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

// The person has to find their browser, pick an account and approve. Three
// minutes is generous for that and short enough that a forgotten window does
// not leave a socket open all day. Not optional: without it the wait never ends.
const WAIT_LIMIT: Duration = Duration::from_secs(180);
const POLL: Duration = Duration::from_millis(100);

// A browser sends more than the one request we care about — a preconnected
// socket with nothing on it, a `/favicon.ico`. Those are answered and ignored;
// only the address carrying the answer ends the wait.
const NOT_IT: &str = "HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n";

const PAGE: &str = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">\
<title>CopyNotes</title></head><body style=\"font-family:system-ui;text-align:center;padding:3rem\">\
<h1>Listo</h1><p>Ya pod&eacute;s volver a CopyNotes. Esta pesta&ntilde;a se puede cerrar.</p>\
</body></html>";

#[derive(Default)]
pub struct Pending(Mutex<Option<TcpListener>>);

fn lock(pending: &Pending) -> std::sync::MutexGuard<'_, Option<TcpListener>> {
  // A panic in another thread must not turn every later sign-in into an error:
  // what the mutex holds is a socket, and it is just as valid after a poisoning.
  pending
    .0
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[tauri::command]
pub fn oauth_start(state: tauri::State<Pending>) -> Result<u16, String> {
  // 127.0.0.1 and never 0.0.0.0: the second one would take connections from the
  // network, which means anybody on the same wifi could hand this app a code.
  // Port 0 lets the OS pick a free one — a fixed port is a port already taken.
  let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
  let port = listener
    .local_addr()
    .map_err(|error| error.to_string())?
    .port();
  listener
    .set_nonblocking(true)
    .map_err(|error| error.to_string())?;
  // Storing this drops whatever was there, which closes it: starting the trip
  // twice leaves one listener, not two, and no port held by a dead attempt.
  *lock(state.inner()) = Some(listener);
  Ok(port)
}

#[tauri::command]
pub async fn oauth_wait(state: tauri::State<'_, Pending>) -> Result<String, String> {
  // Taken out, not borrowed: the listener is one-shot, and a second wait finds
  // nothing instead of stealing the first one's answer.
  let listener = lock(state.inner())
    .take()
    .ok_or("No hay ninguna entrada con Google esperando.")?;
  // Waiting is blocking and can last three minutes; a command body runs on a
  // runtime thread that has other work to do.
  tauri::async_runtime::spawn_blocking(move || wait_for_return(listener))
    .await
    .map_err(|error| error.to_string())?
}

fn wait_for_return(listener: TcpListener) -> Result<String, String> {
  let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
  let deadline = Instant::now() + WAIT_LIMIT;
  loop {
    match listener.accept() {
      Ok((mut stream, _)) => {
        let line = read_request_line(&mut stream);
        match oauth_target(&line) {
          Some(target) => {
            let _ = stream.write_all(
              format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{PAGE}",
                PAGE.len()
              )
              .as_bytes()
            );
            let _ = stream.flush();
            // Returning drops the listener, so the port is released here: from
            // this point on nothing of this app is listening on the machine.
            return Ok(format!("http://127.0.0.1:{port}{target}"));
          }
          None => {
            let _ = stream.write_all(NOT_IT.as_bytes());
          }
        }
      }
      Err(ref error) if error.kind() == std::io::ErrorKind::WouldBlock => {
        if Instant::now() >= deadline {
          return Err("No llegó la respuesta de Google. Probá de nuevo.".into());
        }
        std::thread::sleep(POLL);
      }
      Err(error) => return Err(error.to_string()),
    }
  }
}

fn read_request_line(stream: &mut TcpStream) -> String {
  // On macOS a socket accepted from a non-blocking listener inherits that flag,
  // and a read would come back empty before the browser said anything.
  let _ = stream.set_nonblocking(false);
  let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
  let mut buffer = [0u8; 2048];
  // ponytail: one read. A request line arrives whole in the first packet in
  // practice; if a browser ever splits one, read in a loop until "\r\n".
  let read = stream.read(&mut buffer).unwrap_or(0);
  String::from_utf8_lossy(&buffer[..read])
    .lines()
    .next()
    .unwrap_or("")
    .to_string()
}

// `GET /?code=4%2F0Ab&sb_flow_id=e31b HTTP/1.1` → `/?code=4%2F0Ab&sb_flow_id=e31b`.
// Percent-encoding is left exactly as it arrived: the frontend reads it with
// `URL`, which decodes correctly, so there is no second decoder to keep honest.
fn oauth_target(request_line: &str) -> Option<String> {
  let mut parts = request_line.split(' ');
  if parts.next()? != "GET" {
    return None;
  }
  let target = parts.next()?;
  let (_, query) = target.split_once('?')?;
  // Anything without one of these is noise the browser sent on the side, not
  // Google's answer — including a refusal, which comes back as `error=`.
  let carries_answer = query
    .split('&')
    .any(|pair| matches!(pair.split('=').next(), Some("code") | Some("error")));
  carries_answer.then(|| target.to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn lee_la_vuelta_de_google_de_la_linea_del_pedido() {
    assert_eq!(
      oauth_target("GET /?code=4%2F0Ab&sb_flow_id=e31b HTTP/1.1"),
      Some("/?code=4%2F0Ab&sb_flow_id=e31b".to_string())
    );
    // Cancelar en Google también es una respuesta: termina la espera y la app
    // dice por qué, en vez de quedarse tres minutos mirando el puerto.
    assert_eq!(
      oauth_target("GET /?error=access_denied HTTP/1.1"),
      Some("/?error=access_denied".to_string())
    );
  }

  #[test]
  fn ignora_lo_que_manda_el_navegador_al_pasar() {
    // Nada de esto es la vuelta de Google. Si cualquiera terminara la espera, el
    // pedido de verdad llegaría a un puerto ya cerrado.
    assert_eq!(oauth_target("GET /favicon.ico HTTP/1.1"), None);
    assert_eq!(oauth_target("GET / HTTP/1.1"), None);
    assert_eq!(oauth_target("GET /?otra=cosa HTTP/1.1"), None);
    assert_eq!(oauth_target(""), None);
    // Un pedido que no es GET no viene de una barra de direcciones.
    assert_eq!(oauth_target("POST /?code=abc HTTP/1.1"), None);
  }

  #[test]
  fn el_oyente_atiende_un_pedido_y_suelta_el_puerto() {
    use std::net::TcpStream;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    listener.set_nonblocking(true).unwrap();

    let esperando = std::thread::spawn(move || wait_for_return(listener));

    let mut cliente = TcpStream::connect(("127.0.0.1", port)).unwrap();
    cliente
      .write_all(b"GET /?code=abc&sb_flow_id=e31b HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
      .unwrap();
    let mut respuesta = String::new();
    cliente.read_to_string(&mut respuesta).unwrap();
    assert!(respuesta.contains("200 OK"));
    assert!(respuesta.contains("Ya pod"));

    let direccion = esperando.join().unwrap().unwrap();
    assert_eq!(
      direccion,
      format!("http://127.0.0.1:{port}/?code=abc&sb_flow_id=e31b")
    );

    // Y después de eso no queda nada escuchando: el puerto vuelve a estar libre,
    // que es lo que se promete cuando la entrada termina, salga bien o mal.
    TcpListener::bind(("127.0.0.1", port)).expect("el puerto tiene que quedar libre");
  }
}
