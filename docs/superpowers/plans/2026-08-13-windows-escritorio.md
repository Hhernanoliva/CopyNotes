# CopyNotes para Windows — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado al 2026-08-19 (rama `feat/windows-escritorio`):** Tareas **1, 2, 3, 4
> y 5 HECHAS** (un commit cada una). La **6 ya estaba hecha** desde `32c442f`,
> salvo los textos de Windows de la guía, que viajaron con la Tarea 5. Falta
> sólo las **Tareas 7 y 8** (VM + PC ajena). El paso 7 de la Tarea 1 —el clic a
> un enlace en la app de escritorio de macOS— **lo verificó Hernán el 2026-08-19
> y abre bien**. Las casillas de abajo quedaron sin tildar; este bloque es el
> estado real.

**Goal:** que CopyNotes se compile, se instale y funcione entera en Windows 10/11 x64 — notas, nube y puente de agentes MCP incluidos — y salga publicada en la misma release que macOS.

**Architecture:** no hay arquitectura nueva. Se arreglan cinco bordes del código que hoy asumen macOS, se agrega un segundo trabajo al workflow de release, y se enciende el interruptor que muestra la descarga en la web. Toda la lógica de notas, almacenamiento y sincronización ya es multiplataforma y no se toca.

**Tech Stack:** Tauri 2 (Rust), SvelteKit + Svelte 5, Vitest, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-13-windows-desktop-design.md`. Leerla antes de empezar; explica el *por qué* de cada arreglo.

## Global Constraints

- **Windows 10 versión 1809 o posterior, y Windows 11. Sólo x64.** Un único instalador: `.exe` (NSIS). Sin `.msi`, sin ARM64 nativo, sin Microsoft Store.
- **Sin firma digital**, igual que la `.app` de macOS. No se agrega ningún paso de firma de código.
- **No se puede compilar Windows desde macOS.** Todo `.exe` sale de GitHub Actions. En la Mac sólo se verifican los tests y el comportamiento en macOS.
- **Código escrito a mano en JavaScript llano dentro de archivos `.ts`/`.svelte`**: sin anotaciones de tipos. El código generado o vendorizado (shadcn-svelte) conserva las suyas.
- **Comentarios y textos visibles en castellano**, siguiendo el estilo del archivo que se toca. Los comentarios explican *por qué*, no *qué*.
- **Los commits a `main` NO llevan trazas de agente.** Nada de `Co-Authored-By`.
- **Toda funcionalidad o cambio visible documenta en el mismo commit** que lo implementa: `docs/guia/` (con la fecha del índice `docs/guia-de-uso.md` actualizada) y una viñeta en `CHANGELOG.md` bajo `## 0.2.0`.
- **Fuera de alcance, no agregarlo aunque tiente:** Linux, política CSP estricta del webview, clasificación fina de plataformas por capacidades, MCP remoto o desde la PWA, `.msi`.

## Mapa de archivos

| Archivo | Qué pasa | Tarea |
|---|---|---|
| `src-tauri/Cargo.toml` | Modificar: dos dependencias nuevas | 1, 3 |
| `src-tauri/src/lib.rs` | Modificar: `open_external` multiplataforma + registrar los dos complementos | 1, 3 |
| `src-tauri/src/bridge.rs` | Modificar: `replace_atomically` usada por los dos sitios que renombran | 2 |
| `src/lib/platform/runtime.ts` | Modificar: agregar `isWindows()` | 4 |
| `src/lib/platform/index.ts` | Modificar: exportarla | 4 |
| `src/lib/bridge/mcp-config.js` | Modificar: `powershellQuote` + bandera en `claudeCodeCommand` | 4 |
| `src/lib/components/SettingsDialog.svelte:391` | Modificar: pasar la bandera | 4 |
| `.github/workflows/release.yml` | Modificar: tres trabajos en secuencia | 5 |
| `src/lib/desktop/download.ts:21` | Modificar: el interruptor a `true` | 6 |
| `e2e/desktop-prompt.spec.ts` | Reescribir: vuelven las aserciones del estado visible | 6 |
| `docs/guia/17-agentes.md` | Modificar: dónde se pega el comando en Windows | 4 |
| `docs/guia/01-empezar.md` | Modificar: la app de escritorio es para Mac **y** Windows | 6 |
| `docs/guia/19-actualizaciones.md` | Modificar: la pantalla azul de Windows | 6 |
| `docs/guia-de-uso.md` | Modificar: fecha y resumen del índice | 4, 6 |
| `CHANGELOG.md` | Modificar: viñeta bajo `## 0.2.0` | 6 |

Las tareas 1 a 4 son independientes entre sí y se pueden hacer en cualquier orden. La 5 y la 6 no dependen de código. La 7 y la 8 son manuales y dependen de todo lo anterior.

---

### Task 1: Abrir enlaces en cualquier sistema

`src-tauri/src/lib.rs:25` ejecuta `/usr/bin/open`, que sólo existe en macOS. Lo usan tres caminos, no uno: los enlaces de una nota (`BlockRow.svelte:580`), **entrar con Google** (`google-desktop.ts:29`) y el botón que baja la actualización (`UpdateSection.svelte:52`). En Windows, sin este arreglo, no se puede iniciar sesión.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nada.
- Produces: el comando `open_external(url: String)` sigue existiendo con el mismo nombre e igual firma vista desde el webview. El frontend no cambia. Internamente pasa a recibir también `app: tauri::AppHandle`, que Tauri inyecta sola.

- [ ] **Step 1: Agregar el caso que falta al test de la lista blanca**

En `src-tauri/src/lib.rs`, dentro de `mod tests`, agregar dos aserciones a `solo_deja_pasar_paginas_y_correo`, justo después de la de `javascript:alert(1)`:

```rust
    // Dos esquemas que un complemento genérico abriría sin chistar: uno arranca
    // un cliente FTP, el otro es la puerta por la que Windows lanza programas
    // registrados por otras apps. La lista blanca es lo único que los frena.
    assert!(!is_openable("ftp://ejemplo.com/x"));
    assert!(!is_openable("ms-msdt:/id"));
```

- [ ] **Step 2: Correr el test y verlo pasar**

Run: `cd src-tauri && cargo test`
Expected: PASS. La lista blanca ya rechaza todo lo que no empiece con `http://`, `https://` o `mailto:`, así que estas aserciones pasan de entrada. Son una red para que nadie afloje la guardia después.

- [ ] **Step 3: Agregar la dependencia**

En `src-tauri/Cargo.toml`, en `[dependencies]`, después de la línea de `tauri-plugin-log`:

```toml
tauri-plugin-opener = "2"
```

- [ ] **Step 4: Reemplazar la llamada a macOS**

En `src-tauri/src/lib.rs`, reemplazar el cuerpo de `open_external` (líneas 20-30) por:

```rust
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
```

Y actualizar el comentario de arriba de `is_openable`: donde dice «`open` de macOS abre archivos y aplicaciones», dejarlo como «el abridor del sistema abre archivos y aplicaciones».

- [ ] **Step 5: Registrar el complemento**

En `src-tauri/src/lib.rs`, dentro de `pub fn run()`, encadenar el complemento inmediatamente después de `tauri::Builder::default()`:

```rust
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .manage(oauth::Pending::default())
```

- [ ] **Step 6: Compilar y correr los tests**

Run: `cd src-tauri && cargo test`
Expected: PASS, sin advertencias nuevas. Si el compilador se queja de que `OpenerExt` no está en alcance, agregar `use tauri_plugin_opener::OpenerExt;` arriba del archivo y llamar `app.opener().open_url(...)`.

No hace falta tocar `src-tauri/capabilities/default.json`: los permisos de Tauri gobiernan lo que el **webview** puede invocar, y acá el complemento se llama desde Rust. El webview sigue llamando a `open_external`, que ya está permitido. Si el paso 7 falla con un error de permiso, entonces sí hay que agregar `opener:default` a ese archivo.

- [ ] **Step 7: Verificar a mano en macOS que los enlaces siguen abriendo**

Run: `pnpm tauri dev`
En la app: escribir `https://example.com` en un renglón, esperar a que se vuelva enlace, y hacerle clic.
Expected: se abre en el navegador del sistema. Este paso importa: es la única forma de comprobar que el complemento reemplazó bien al comando viejo — ningún test automático llega hasta acá.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "fix(escritorio): abrir enlaces sin depender de macOS

/usr/bin/open sólo existe en macOS, y open_external lo usan tres caminos:
los enlaces de una nota, entrar con Google y bajar la actualización. En
Windows eso deja la app sin inicio de sesión, no sólo sin enlaces.

La lista blanca (http/https/mailto) se queda intacta delante del
complemento: el abridor de Windows lanza programas registrados por otras
apps con la misma facilidad con que open abre archivos."
```

---

### Task 2: El renombre del buzón sobrevive a Windows

`bridge.rs:77` (`export.json`) y `bridge.rs:238` (outbox) escriben un temporal y lo renombran encima del definitivo. En Unix ese renombre no puede fallar porque otro proceso tenga el archivo abierto. En Windows sí: `MoveFileEx` devuelve "acceso denegado". Y `export.json` es justamente el archivo que el servidor MCP lee en cada llamada (`mcp/lib/mailbox.js:53`), mientras la app lo reescribe con cada cambio de notas. El antivirus agranda la ventana porque abre archivos para escanearlos sin avisar.

El síntoma no es un error visible: es "a veces el agente no ve el último cambio", intermitente.

**Files:**
- Modify: `src-tauri/src/bridge.rs`

**Interfaces:**
- Consumes: nada.
- Produces: `fn replace_atomically(tmp: &Path, target: &Path) -> Result<(), String>`, privada del módulo `bridge`. Reemplaza las dos llamadas sueltas a `fs::rename` que pisan un destino existente.

- [ ] **Step 1: Escribir los tests que fallan**

En `src-tauri/src/bridge.rs`, dentro de `mod tests`, agregar:

```rust
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
```

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `cd src-tauri && cargo test replace_atomically`
Expected: FAIL al compilar, con `cannot find function 'replace_atomically' in this scope`.

- [ ] **Step 3: Escribir la función**

En `src-tauri/src/bridge.rs`, justo después de `restrict` (después de la línea 20):

```rust
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
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `cd src-tauri && cargo test replace_atomically`
Expected: PASS, los dos.

- [ ] **Step 5: Usar la función en los dos sitios**

En `bridge_write_export`, reemplazar la línea 77:

```rust
    replace_atomically(&tmp, &target)?;
```

En `bridge_write_outbox`, reemplazar la línea 238:

```rust
    replace_atomically(&tmp, &target)?;
```

- [ ] **Step 6: Correr la suite entera de Rust**

Run: `cd src-tauri && cargo test`
Expected: PASS. Verificar además que no queda ninguna llamada suelta: `grep -n "fs::rename" src-tauri/src/bridge.rs` debe devolver sólo las dos de `ack_in` y del dead-letter, que renombran hacia un destino **nuevo** dentro de `processed/` y no pisan nada.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/bridge.rs
git commit -m "fix(agentes): el buzón no se pierde un cambio en Windows

fs::rename pisando un destino existente es infalible en Unix y no en
Windows: MoveFileEx da acceso denegado mientras otro proceso tenga el
destino abierto. export.json es justo el archivo que el servidor MCP lee
en cada llamada mientras la app lo reescribe, y el antivirus agranda la
ventana. Se veía como 'a veces el agente no ve el cambio', intermitente.

replace_atomically reintenta cinco veces con espera creciente. El tope no
es cosmético: sin él un error permanente colgaría el hilo para siempre."
```

---

### Task 3: Una sola ventana de la app

En macOS el sistema impide abrir la misma aplicación dos veces. En Windows no. Dos procesos separados escriben sobre la misma base IndexedDB sin enterarse uno del otro, y el aviso entre pestañas que existe hoy (`BroadcastChannel`) no cruza entre procesos. Esto es pérdida de datos, no una molestia.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: el registro del complemento de la Tarea 1, si ya se hizo. El orden entre los dos no importa salvo por lo que dice el Step 4.
- Produces: nada que otro código consuma.

- [ ] **Step 1: Escribir el test que fija la etiqueta de la ventana**

El callback del complemento busca la ventana principal por su etiqueta. Si alguien le pusiera una distinta en `tauri.conf.json`, el segundo arranque no traería nada al frente y la persona creería que la app no abre. En `src-tauri/src/lib.rs`, dentro de `mod tests`:

```rust
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
```

- [ ] **Step 2: Correr el test y verlo pasar**

Run: `cd src-tauri && cargo test la_ventana_principal`
Expected: PASS. `tauri.conf.json` no declara `label`, así que cae en el `unwrap_or("main")`, que es exactamente lo que Tauri hace.

- [ ] **Step 3: Agregar la dependencia**

En `src-tauri/Cargo.toml`, en `[dependencies]`:

```toml
tauri-plugin-single-instance = "2"
```

- [ ] **Step 4: Registrar el complemento PRIMERO**

En `src-tauri/src/lib.rs`, dentro de `pub fn run()`. El complemento de instancia única tiene que ir **antes que cualquier otro**, según su documentación: decide si este proceso sigue vivo, y esa decisión se toma antes de que los demás complementos hagan nada.

```rust
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
```

Agregar `use tauri::Manager;` arriba del archivo — `get_webview_window` viene de ese trait.

- [ ] **Step 5: Compilar y correr los tests**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 6: Verificar en macOS que la app sigue abriendo normal**

Run: `pnpm tauri dev`
Expected: la ventana abre como siempre. En macOS el complemento no cambia nada visible; lo que se está comprobando acá es que no rompió el arranque. El comportamiento de verdad se prueba en el paso 5 del gate (Tarea 7), en Windows.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs
git commit -m "fix(escritorio): una sola ventana de CopyNotes a la vez

Windows deja abrir la app dos veces; macOS no. Dos procesos sobre la misma
IndexedDB sin verse es pérdida de datos: BroadcastChannel avisa entre
pestañas del mismo proceso, no entre procesos distintos.

El complemento va registrado primero porque decide si este proceso sigue
vivo. El test fija la etiqueta 'main': si cambiara, el segundo arranque no
traería nada al frente y parecería que la app no abre."
```

---

### Task 4: El comando de agentes funciona en Windows

`src/lib/bridge/mcp-config.js:34` (`shellQuote`) cita al estilo POSIX. En PowerShell las comillas simples también son literales y sirven, pero el escape de una comilla simple difiere: POSIX cierra y reabre (`'\''`), PowerShell la duplica (`''`). El caso que rompe hoy es un usuario de Windows con espacio en el nombre.

**Files:**
- Modify: `src/lib/platform/runtime.ts`
- Modify: `src/lib/platform/index.ts`
- Modify: `src/lib/bridge/mcp-config.js`
- Modify: `src/lib/components/SettingsDialog.svelte:391`
- Test: `src/lib/bridge/mcp-config.test.js`
- Test: `src/lib/platform/runtime.test.ts`
- Modify: `docs/guia/17-agentes.md`, `docs/guia-de-uso.md`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `isWindows()` en `$lib/platform` — devuelve `true` en Windows, `false` en cualquier otro lado y también en SSR.
  - `claudeCodeCommand({ serverPath, mailboxPath }, windows = false)` — el segundo parámetro es nuevo y opcional; sin él el comportamiento es idéntico al de hoy.

- [ ] **Step 1: Escribir el test de `isWindows`**

En `src/lib/platform/runtime.test.ts`, agregar al final:

```ts
describe('isWindows', () => {
	const original = navigator.userAgent;

	afterEach(() => {
		Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
	});

	it('reconoce un userAgent de Windows', () => {
		Object.defineProperty(navigator, 'userAgent', {
			value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
			configurable: true
		});
		expect(isWindows()).toBe(true);
	});

	it('dice que no en macOS', () => {
		Object.defineProperty(navigator, 'userAgent', {
			value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
			configurable: true
		});
		expect(isWindows()).toBe(false);
	});
});
```

Agregar `isWindows` al `import` de arriba del archivo y `afterEach` al import de `vitest`.

- [ ] **Step 2: Escribir los tests del comando en Windows**

En `src/lib/bridge/mcp-config.test.js`, después del `describe('claudeCodeCommand', ...)` existente:

```js
describe('claudeCodeCommand en Windows', () => {
	// Un nombre de usuario CON espacio: es el caso que parte el comando hoy, y
	// en Windows es de lo más común.
	const winPaths = {
		serverPath: 'C:\\Program Files\\CopyNotes\\mcp\\server.js',
		mailboxPath: 'C:\\Users\\Juan Perez\\AppData\\Roaming\\com.copynotes.app\\mailbox'
	};

	it('cita al estilo PowerShell y deja las barras invertidas como están', () => {
		expect(claudeCodeCommand(winPaths, true)).toBe(
			"claude mcp add copynotes -s user -e CN_MAILBOX='C:\\Users\\Juan Perez\\AppData\\Roaming\\com.copynotes.app\\mailbox' -- node 'C:\\Program Files\\CopyNotes\\mcp\\server.js'"
		);
	});

	it('duplica la comilla simple en vez de cerrar la cita', () => {
		// PowerShell no entiende el truco POSIX de cerrar-escapar-reabrir. Si se
		// usara acá, el resto de la ruta quedaría FUERA de toda cita.
		expect(
			claudeCodeCommand({ serverPath: "C:\\Users\\o'brien\\s.js", mailboxPath: 'C:\\m' }, true)
		).toContain("node 'C:\\Users\\o''brien\\s.js'");
	});

	it('sin la bandera sigue siendo el comando de siempre', () => {
		expect(claudeCodeCommand(paths)).toContain(
			"CN_MAILBOX='/Users/h/Library/Application Support/com.copynotes.app/mailbox'"
		);
	});
});
```

- [ ] **Step 3: Correr los tests y verlos fallar**

Run: `pnpm test:unit -- --run src/lib/bridge/mcp-config.test.js src/lib/platform/runtime.test.ts`
Expected: FAIL. `isWindows is not a function`, y el comando de Windows sale con el escape POSIX.

- [ ] **Step 4: Escribir `isWindows`**

En `src/lib/platform/runtime.ts`, al final:

```ts
// Windows necesita otro escape en el comando que se copia desde Ajustes ›
// Agentes (ver mcp-config.js). Se mira el userAgent y no un complemento de
// Tauri: el webview lo hereda del motor del sistema, así que la respuesta es
// igual de confiable y no suma una dependencia. En SSR no hay navigator y la
// respuesta correcta es "no".
export function isWindows() {
	return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}
```

En `src/lib/platform/index.ts`, agregar `isWindows` a la lista exportada:

```ts
export { getRuntimeKind, isTauriRuntime, getBackupSource, openExternal, isWindows } from './runtime';
```

- [ ] **Step 5: Escribir la rama de PowerShell**

En `src/lib/bridge/mcp-config.js`, justo después de `shellQuote`:

```js
// PowerShell, que es la consola por defecto de Windows desde hace años. Sus
// comillas simples también son literales — adentro no expande nada — y la única
// que hay que escapar es la comilla simple misma, duplicándola. El truco POSIX
// de cerrar-escapar-reabrir NO funciona acá: dejaría el resto de la ruta fuera
// de toda cita. Citar hace falta igual, por el espacio en "Juan Perez".
function powershellQuote(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}
```

Y cambiar `claudeCodeCommand`:

```js
// Claude Code: un solo comando global. `windows` elige el dialecto de comillas;
// los demás clientes van en JSON y ahí JSON.stringify ya escapa las barras
// invertidas de Windows correctamente.
export function claudeCodeCommand({ serverPath, mailboxPath }, windows = false) {
	const quote = windows ? powershellQuote : shellQuote;
	return `claude mcp add copynotes -s user -e CN_MAILBOX=${quote(mailboxPath)} -- node ${quote(serverPath)}`;
}
```

- [ ] **Step 6: Pasar la bandera desde la pantalla de Ajustes**

En `src/lib/components/SettingsDialog.svelte`, línea 391:

```js
	const claudeCmd = $derived(paths ? claudeCodeCommand(paths, isWindows()) : '');
```

Y agregar `isWindows` al import de `$lib/platform` que ya existe en la línea 6.

- [ ] **Step 7: Correr los tests y verlos pasar**

Run: `pnpm test:unit -- --run src/lib/bridge/mcp-config.test.js src/lib/platform/runtime.test.ts`
Expected: PASS, todos.

- [ ] **Step 8: Documentar dónde se pega el comando en Windows**

En `docs/guia/17-agentes.md`, en la viñeta de **Claude Code** (línea 170), reemplazarla por:

```markdown
- **Claude Code:** copiá el comando (icono de copiar, dos hojas → tilde ✓) y
  pegalo en tu terminal **una sola vez**. En Windows, pegalo en **PowerShell**
  (el que abre con el botón derecho sobre el menú Inicio → *Terminal*), no en
  la ventana negra vieja: ahí las comillas no funcionan igual y el comando se
  parte si tu nombre de usuario tiene un espacio.
```

En `docs/guia-de-uso.md`, actualizar la fecha de "Última actualización" a la del día y sumar el cambio al resumen, siguiendo el estilo de las entradas que ya están.

- [ ] **Step 9: Correr la suite unitaria entera**

Run: `pnpm test`
Expected: PASS. Anotar el total de tests para comparar después.

- [ ] **Step 10: Commit**

```bash
git add src/lib/platform/runtime.ts src/lib/platform/index.ts src/lib/platform/runtime.test.ts \
        src/lib/bridge/mcp-config.js src/lib/bridge/mcp-config.test.js \
        src/lib/components/SettingsDialog.svelte docs/guia/17-agentes.md docs/guia-de-uso.md
git commit -m "fix(agentes): el comando de Claude Code sirve en Windows

Las comillas eran POSIX. En PowerShell las simples también son literales,
pero el escape difiere: POSIX cierra y reabre, PowerShell duplica. El caso
que rompía es un usuario de Windows con espacio en el nombre, que en
Windows es de lo más común.

Los otros clientes van en JSON y ya estaban bien: JSON.stringify escapa
las barras invertidas solo."
```

---

### Task 5: La fábrica compila Windows

Hoy `release.yml` es un único trabajo en `macos-latest`. Pasa a tres: uno que comprueba y prepara, y dos que compilan **en secuencia**. La secuencia no es un detalle: los dos escriben `latest.json`, el archivo que la app consulta para saber si hay versión nueva, y si se pisan alguien se queda sin aviso.

**Files:**
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: nada del código.
- Produces: el trabajo `preparar` expone `outputs.body` (las novedades sacadas del CHANGELOG) que los dos trabajos de compilación consumen.

- [ ] **Step 1: Mover la guardia y las novedades a un trabajo propio**

En `.github/workflows/release.yml`, reemplazar el bloque `jobs:` entero. El trabajo `preparar` junta las dos cosas que hoy viven dentro del único trabajo y que ahora necesitan los dos:

```yaml
jobs:
  # La guardia y las novedades valen para las dos plataformas, así que salen del
  # trabajo de compilación: duplicarlas en dos lugares es duplicar algo que se
  # separa solo con el tiempo.
  preparar:
    runs-on: ubuntu-latest
    outputs:
      body: ${{ steps.notas.outputs.body }}
    steps:
      - uses: actions/checkout@v4

      # Guardia barata contra el error más caro de este workflow. `includeUpdaterJson`
      # no genera nada por su cuenta: el `latest.json` lo produce el bundler sólo si
      # `createUpdaterArtifacts` está prendido, y firmarlo necesita el `pubkey`. Si
      # falta cualquiera de los dos, la release sale sin el archivo que la app
      # consulta y el aviso de versión nueva no le llega a nadie — pero recién se
      # nota al mirar los adjuntos, después de ~25 minutos de compilar Rust.
      # Cortar acá cuesta cinco segundos.
      - name: Comprobar que el actualizador está configurado
        run: |
          CONF=src-tauri/tauri.conf.json
          grep -q '"createUpdaterArtifacts": *true' "$CONF" \
            || { echo "::error::Falta \"createUpdaterArtifacts\": true en $CONF (Tarea 2 del plan)."; exit 1; }
          node -e '
            const pubkey = require("./src-tauri/tauri.conf.json").plugins?.updater?.pubkey ?? "";
            if (!pubkey || pubkey.includes("PEGAR")) {
              console.error("::error::Falta plugins.updater.pubkey en src-tauri/tauri.conf.json (Tarea 2 del plan).");
              process.exit(1);
            }
          '
          for secreto in TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD; do
            [ -n "${!secreto}" ] || { echo "::error::Falta el secreto $secreto en el repositorio."; exit 1; }
          done
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      # Las novedades tienen que estar ANTES de compilar: tauri-action las mete
      # adentro del latest.json en esa misma corrida, y ese archivo no se puede
      # editar después. Si CHANGELOG.md no tiene la sección, el script corta acá.
      - name: Sacar las novedades de esta versión del CHANGELOG
        id: notas
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          {
            echo 'body<<CHANGELOG_EOF'
            node scripts/changelog-section.mjs "$VERSION"
            echo ''
            echo 'CHANGELOG_EOF'
          } >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: Dejar el trabajo de macOS igual, colgado de `preparar`**

A continuación, en el mismo `jobs:`:

```yaml
  macos:
    needs: preparar
    runs-on: macos-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Instalar dependencias del frontend
        run: pnpm install --frozen-lockfile

      # `mcp/` NO es parte del workspace de pnpm y Tauri copia archivos, no
      # symlinks: sin este paso el .app viaja con symlinks rotos y el puente de
      # agentes muere con ERR_MODULE_NOT_FOUND en runtime.
      - name: node_modules plano para el servidor MCP
        working-directory: mcp
        run: pnpm run build:flat

      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'CopyNotes v__VERSION__'
          releaseBody: ${{ needs.preparar.outputs.body }}
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          # Un solo binario universal: anda en Mac con chip Apple y con Intel, y
          # tauri-action escribe las dos claves de darwin en latest.json
          # apuntando al mismo archivo. Un job en vez de dos.
          args: --target universal-apple-darwin
```

- [ ] **Step 3: Agregar el trabajo de Windows**

Al final del `jobs:`:

```yaml
  # `needs: macos` y no en paralelo: los dos trabajos escriben latest.json, el
  # archivo que la app consulta para saber si hay versión nueva. tauri-action
  # está pensado para fusionar las claves de cada plataforma, pero si los dos
  # escriben a la vez el resultado depende de quién llegue último y una de las
  # dos plataformas se queda sin aviso de actualización. Esperar cuesta minutos;
  # el error cuesta una release.
  windows:
    needs: macos
    runs-on: windows-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable

      - uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Instalar dependencias del frontend
        run: pnpm install --frozen-lockfile

      # Mismo paso que en macOS y por el mismo motivo. `shell: bash` porque el
      # script usa `rm -rf`, que la consola por defecto de Windows no conoce —
      # los runners de Windows traen Git Bash, así que corre tal cual está.
      - name: node_modules plano para el servidor MCP
        working-directory: mcp
        shell: bash
        run: pnpm run build:flat

      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'CopyNotes v__VERSION__'
          releaseBody: ${{ needs.preparar.outputs.body }}
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          # Sólo el instalador NSIS. El bundler también sabe hacer .msi, pero
          # mantener dos instaladores duplica el soporte sin ganar nada.
          args: --bundles nsis
```

Actualizar también el comentario de cabecera del archivo: donde dice «Compila y publica la app de escritorio», aclarar que ahora son macOS y Windows, y que van en secuencia por el `latest.json`.

- [ ] **Step 4: Verificar que el YAML es válido antes de gastar una etiqueta**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/release.yml','utf8'); if(!/needs: macos/.test(y)||!/windows-latest/.test(y)) { console.error('falta el trabajo de Windows'); process.exit(1);} console.log('ok')"`
Expected: `ok`.

Y además: `gh workflow view release --yaml | head -5` (si `gh` está disponible) o abrir el archivo en GitHub, que marca los errores de sintaxis. Un YAML mal formado no falla: el workflow directamente **no aparece**, que es peor.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: compilar también Windows, en secuencia con macOS

Tres trabajos. La guardia del actualizador y las novedades del CHANGELOG
salen a un trabajo propio porque ahora las necesitan los dos.

Windows va con needs: macos y no en paralelo. Los dos escriben latest.json
y si se pisan, una de las dos plataformas se queda sin aviso de versión
nueva. Esperar cuesta minutos; el error cuesta una release.

El paso build:flat va con shell: bash porque usa rm -rf."
```

---

### Task 6: Encender la descarga en la web

`src/lib/desktop/download.ts:21` tiene el interruptor apagado y las pruebas de `e2e/desktop-prompt.spec.ts` verifican justamente el estado oculto. Encenderlo muestra el cartel de abajo a la derecha y el enlace de Ajustes, los dos apuntando a la página de releases de GitHub, que lista todos los archivos y deja que cada persona elija el suyo.

**Esta tarea se hace al final**, cuando ya haya una release publicada de verdad. Encenderla antes manda a la gente a una página vacía.

**Files:**
- Modify: `src/lib/desktop/download.ts`
- Rewrite: `e2e/desktop-prompt.spec.ts`
- Modify: `docs/guia/01-empezar.md`, `docs/guia/19-actualizaciones.md`, `docs/guia-de-uso.md`, `CHANGELOG.md`

**Interfaces:**
- Consumes: nada.
- Produces: `DESKTOP_RELEASE_PUBLISHED` pasa a `true`. Nada más cambia de forma.

- [ ] **Step 1: Reescribir las pruebas para el estado visible**

Reemplazar `e2e/desktop-prompt.spec.ts` entero por:

```ts
import { test, expect } from '@playwright/test';
import { openApp } from './app';

// Con DESKTOP_RELEASE_PUBLISHED en true hay descargas publicadas, así que las
// puertas de entrada vuelven a mostrarse. Estas pruebas cuidan las cuatro reglas
// del cartel: aparece, lleva a la página de descargas, se acuerda de que lo
// cerraste, y no molesta en un teléfono donde no hay app de escritorio.

const CARD = '[aria-label="Descargar la app de escritorio"]';

test('el cartel ofrece la app de escritorio', async ({ page }) => {
	await openApp(page);
	await expect(page.locator(CARD)).toBeVisible();
	await expect(page.getByText('¿Usás agentes de IA?')).toBeVisible();

	const enlace = page.locator(CARD).getByRole('link', { name: 'Descargar' });
	await expect(enlace).toHaveAttribute(
		'href',
		'https://github.com/Hhernanoliva/CopyNotes/releases'
	);
});

test('cerrar el cartel se recuerda al recargar', async ({ page }) => {
	await openApp(page);
	await page.locator(CARD).getByRole('button', { name: 'Ahora no' }).click();
	await expect(page.locator(CARD)).toHaveCount(0);

	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
	await expect(page.locator(CARD)).toHaveCount(0);
});

test('ajustes ofrece el enlace de descarga', async ({ page }) => {
	await openApp(page);
	await page.getByRole('button', { name: /configuraci/i }).click();
	await expect(
		page.getByRole('link', { name: 'Descargar la app de escritorio' })
	).toBeVisible();
});

// En un teléfono no hay app de escritorio que instalar, así que el cartel no
// tiene por qué robar pantalla. El filtro es (pointer: fine) y no el ancho: una
// tablet apaisada es tan ancha como una laptop y sigue sin poder instalarla.
test.describe('en un teléfono', () => {
	test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

	test('el cartel no aparece', async ({ page }) => {
		await openApp(page);
		await expect(page.locator(CARD)).toHaveCount(0);
	});
});
```

- [ ] **Step 2: Correr las pruebas y verlas fallar**

Run: `pnpm test:e2e desktop-prompt`
Expected: FAIL. Las tres primeras porque el cartel y el enlace todavía están ocultos.

- [ ] **Step 3: Encender el interruptor**

En `src/lib/desktop/download.ts`, reemplazar las líneas 12-21 por:

```js
// Encendido desde la primera release publicada (macOS y Windows). Prende de una
// el cartel de abajo a la derecha (DesktopAppPrompt.svelte) y el enlace de
// Ajustes › Agentes (SettingsDialog.svelte).
//
// La dirección apunta a la lista de releases, no a un archivo suelto: ahí están
// los dos instaladores y cada persona baja el de su sistema. Detectar el sistema
// operativo sería más lindo y todavía no vale el código.
export const DESKTOP_RELEASE_PUBLISHED = true;
```

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `pnpm test:e2e desktop-prompt`
Expected: PASS, las cuatro.

Si alguna falla de forma intermitente, correrla repetida antes de tocar nada — en esta suite hay flakes preexistentes: `pnpm test:e2e desktop-prompt -- --repeat-each=10`.

- [ ] **Step 5: Documentar la pantalla azul de Windows**

En `docs/guia/19-actualizaciones.md`, después de la viñeta de la línea 30 (la de macOS y la app "dañada"), agregar:

```markdown
- **En Windows, la primera vez puede salir una pantalla azul** que dice *"Windows protegió su PC"*. Tampoco está roto: es por lo mismo, todavía no compramos el certificado. Tocá **"Más información"** y aparece el botón **"Ejecutar de todos modos"**. Una sola vez. Antes de eso, tu navegador puede avisarte que el archivo "no se descarga habitualmente" — es el mismo motivo y también se puede seguir. Esto se va solo con el tiempo, a medida que más gente lo descarga.
```

En `docs/guia/01-empezar.md`, en la viñeta de la línea 17, cambiar el final para que diga que hay app para Mac y para Windows:

```markdown
- **La app de escritorio es otra cosa.** Si entrás desde una computadora, abajo a la derecha aparece una tarjetita discreta: "¿Usás agentes de IA? Necesitás la app de escritorio". Hay una para **Mac** y otra para **Windows**. Solo la vas a necesitar si querés conectar un agente de IA (ver **[Agentes](17-agentes.md)**); para todo lo demás, la web alcanza. Si la cerrás, no vuelve a molestar. En el celular y la tablet no aparece, porque ahí no hay app de escritorio.
```

En `docs/guia-de-uso.md`, actualizar la fecha de "Última actualización" y sumar el cambio al resumen.

- [ ] **Step 6: Sumar la viñeta al CHANGELOG**

En `CHANGELOG.md`, bajo `## 0.2.0`, arriba de todo de la lista:

```markdown
- CopyNotes ahora tiene app de escritorio para Windows, además de la de Mac
```

- [ ] **Step 7: Correr la suite entera**

Run: `pnpm test && pnpm test:e2e`
Expected: PASS. Comparar el total con el que se anotó en la Tarea 4. Si aparece algún fallo en pruebas que no se tocaron, comprobar primero que sea preexistente corriéndolo contra la base (`git stash` + repetir) antes de darlo por culpa de este cambio.

- [ ] **Step 8: Commit**

```bash
git add src/lib/desktop/download.ts e2e/desktop-prompt.spec.ts \
        docs/guia/01-empezar.md docs/guia/19-actualizaciones.md docs/guia-de-uso.md CHANGELOG.md
git commit -m "feat(web): ofrecer la descarga de escritorio para Mac y Windows

El interruptor estaba apagado porque la página de releases estaba vacía.
Con la primera release publicada, vuelve el cartel de abajo a la derecha y
el enlace de Ajustes.

Apunta a la lista de releases y no a un archivo: ahí están los dos
instaladores y cada uno baja el suyo. Detectar el sistema sería más lindo
y todavía no vale el código.

Las pruebas vuelven a verificar el estado visible, incluida la regla de
que en un teléfono el cartel no aparece."
```

---

### Task 7: Gate manual en la máquina virtual

Esta tarea la hace Hernán, no un agente. Es la que decide si Windows sale o no.

**Bloqueada por dos prerrequisitos que no son código:**

- [ ] **Prerrequisito A: la Tarea 2 del plan de actualización automática**

Ver `docs/superpowers/plans/2026-08-11-actualizacion-automatica-escritorio.md`. Generar la clave de firma del actualizador, cargar `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en el repositorio, poner `"createUpdaterArtifacts": true` y el `pubkey` en `src-tauri/tauri.conf.json`, y hacer el repositorio público. Sin esto el workflow corta a los cinco segundos — y ya corta hoy también para macOS.

- [ ] **Prerrequisito B: la máquina virtual**

Windows 11 en Parallels o UTM sobre la Mac, con **Node** y **Cursor** instalados. Windows en chip Apple traduce programas x64, así que el mismo `.exe` que va a bajar la gente sirve para probar.

**Antes de empezar el gate:**

- [ ] Empujar la etiqueta de versión y esperar a que el workflow termine los tres trabajos.
- [ ] En la release **borrador**, comprobar que estén adjuntos: el `.dmg` de macOS, el `-setup.exe` de Windows, **y** el `latest.json`. Abrir `latest.json` y verificar que tenga las claves de `darwin` **y** de `windows-x86_64`. Si falta la de Windows, el problema es `--bundles nsis` y hay que agregar el artefacto del actualizador; no seguir con el gate hasta resolverlo.
- [ ] Bajar el `.exe` a la VM **desde el navegador**, no copiándolo desde la Mac: la advertencia de SmartScreen sólo se dispara con archivos que llegaron por descarga, y queremos verla.

**Los nueve pasos, sobre una Windows recién instalada:**

- [ ] **1. Instala y abre.** Ejecutar el `.exe`, atravesar la pantalla azul, completar el instalador, abrir CopyNotes. Comprueba que el motor de navegador (WebView2) se resuelva solo.
- [ ] **2. No pierde texto al cerrar.** Escribir una nota, cerrar la ventana con la X, volver a abrir. El texto está.
- [ ] **3. Los enlaces abren.** Escribir `https://example.com` en un renglón y hacerle clic. Abre en el navegador. (Tarea 1.)
- [ ] **4. Entrar con Google.** Desde la app instalada, iniciar sesión. Anotar si el cortafuegos de Windows pregunta algo: el servidor de vuelta escucha en `127.0.0.1` (`oauth.rs:56`), que es sólo la máquina misma, así que **no debería** — pero hay que verlo, no suponerlo.
- [ ] **5. Una sola ventana.** Doble clic al ícono, y con la app ya abierta, doble clic otra vez. Tiene que traer la ventana existente al frente, no abrir una segunda. (Tarea 3.)
- [ ] **6. El agente se conecta.** Instalar Node y Cursor. En Ajustes › Agentes, copiar y aplicar la configuración de Cursor. Pedirle al agente que lea una nota y que escriba otra. Las dos cosas funcionan.
- [ ] **7. El comando con espacio en el nombre.** Crear un usuario de Windows llamado por ejemplo `Juan Perez`, entrar con él, instalar CopyNotes y pegar el comando de **Claude Code** de Ajustes › Agentes en **PowerShell**. Es el caso exacto que rompía. (Tarea 4.) **Si falla acá**, el techo declarado en la spec §3.4 se cumplió: la salida es mostrar el JSON de configuración en vez del comando, como ya hacen los demás clientes. Anotarlo y seguir con el gate.
- [ ] **8. El agente no se pierde cambios.** Con el agente conectado, editar bastante seguido durante un minuto y pedirle al agente que lea de nuevo. Ve lo último. Caza el bug del renombre. (Tarea 2.)
- [ ] **9. Actualizar no borra notas.** Instalar la versión anterior, escribir una nota reconocible, instalar la nueva encima. La nota sigue ahí.

- [ ] **Anotar el resultado de los nueve pasos** en este archivo antes de seguir. Un paso que no se corrió no es un paso que pasó.

---

### Task 8: Confirmación en una PC real y publicación

Una máquina virtual no reemplaza a una computadora ajena: el antivirus y la reputación del archivo sólo se ven ahí.

- [ ] **Step 1: Pasarle el instalador a un conocido con Windows**

Que lo baje **desde el navegador**, con la dirección de la release borrador o por el medio que sea, pero descargado y no copiado.

- [ ] **Step 2: Que confirme cuatro cosas y describa una**

- [ ] Instala y abre (paso 1 del gate).
- [ ] Escribe una nota, cierra, vuelve a abrir, el texto está (paso 2).
- [ ] Un enlace abre en el navegador (paso 3).
- [ ] Doble clic dos veces = una sola ventana (paso 5).
- [ ] **Qué apareció exactamente en pantalla al bajar y al abrir el archivo**, con captura si se puede. Esto no es una comprobación: es información. Si el texto no coincide con lo que dice `docs/guia/19-actualizaciones.md`, hay que corregir la guía.

No se le pide MCP: eso ya quedó probado en la Tarea 7.

- [ ] **Step 3: Corregir la guía si el texto de la advertencia no coincide**

Si hace falta, ajustar la viñeta de `docs/guia/19-actualizaciones.md` con las palabras exactas que vio, actualizar la fecha del índice, y commitear.

- [ ] **Step 4: Encender la descarga**

Recién ahora, ejecutar la Tarea 6 entera.

- [ ] **Step 5: Publicar el borrador**

En GitHub, pasar la release de borrador a publicada. Es el único punto sin marcha atrás del proceso: hasta acá, `latest.json` no resuelve para nadie porque sólo se sirve desde releases publicadas.

- [ ] **Step 6: Comprobar que el aviso llega a las dos plataformas**

Con la release ya publicada, abrir una CopyNotes de escritorio con la versión anterior — una en la Mac, una en la VM — y verificar que aparezca el puntito sobre el engranaje ⚙️ y que **Configuración › Actualizaciones** muestre las novedades. Si aparece en una sola de las dos, el `latest.json` salió con una sola clave y los dos trabajos se pisaron pese al `needs:`.

---

## Notas para quien ejecute

- **Todo lo de Windows se verifica en Windows.** En la Mac se comprueba que los tests pasan y que macOS no se rompió. Ninguna Tarea 1-6 se puede dar por buena sin la 7.
- **Las Tareas 1 a 4 no dependen de los prerrequisitos de la Tarea 7.** Se pueden escribir, testear y commitear mientras Hernán arma la VM y genera la clave.
- **La Tarea 6 va al final**, después de que exista una release publicada. Encenderla antes manda gente a una página vacía.
- **Verificar antes de afirmar.** Ningún "listo" sin la salida del comando delante. Un fallo en pruebas que no se tocaron se comprueba contra la base antes de atribuirlo a este trabajo.
