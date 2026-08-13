# CopyNotes para Windows — diseño

> **Estado:** aprobado por Hernán el 2026-08-13. Reemplaza, para Windows, la
> sección 8 de `docs/analisis-futuro-multiplataforma.md`, que era exploratoria.
> **Alcance:** sólo Windows. Linux queda para una sesión posterior.

## 1. Qué se construye

Una aplicación de escritorio para **Windows 10 (1809 o posterior) y Windows 11,
64 bits**, con la misma funcionalidad completa que la de macOS: notas, agenda,
respaldos, nube y el puente de agentes MCP. No hay versión recortada ni
funciones apagadas.

Decisiones tomadas:

- **Se compila en GitHub Actions, no en la Mac.** Tauri necesita el compilador de
  Microsoft; no existe forma razonable de generar un `.exe` desde macOS. Esto no
  es una preferencia, es el único camino.
- **Un solo instalador: `.exe` (NSIS).** El bundler también sabe hacer `.msi`,
  pero mantener dos instaladores duplica el soporte y el tiempo de compilación
  sin ganar nada.
- **Sin firma digital**, igual que la `.app` de macOS. La decisión se explica en
  §6.
- **Sólo x64.** Las máquinas Windows con procesador ARM ejecutan programas x64
  mediante traducción, así que quedan cubiertas sin un segundo binario.
- **Sale en la misma release que macOS**, como borrador, y se publica a mano
  después de pasar el gate. Es el mecanismo que `release.yml` ya tiene.

## 2. Por qué Windows sale casi gratis

La base ya es portable y conviene dejarlo escrito para no volver a investigarlo:

- Tauri 2 ya está integrado; `src-tauri/tauri.conf.json` no distingue plataformas
  salvo en `bundle.macOS.minimumSystemVersion`.
- Los íconos de Windows ya existen (`src-tauri/icons/icon.ico` y los
  `Square*Logo.png`), generados por `pnpm tauri icon`.
- Los atajos de teclado ya son `Ctrl/Cmd` en el código y en los textos visibles
  (`FloatingFormattingToolbar.svelte`, `HelpDialog.svelte`).
- El almacenamiento es Dexie/IndexedDB dentro del webview: idéntico en todos los
  sistemas.
- El buzón de agentes usa `app.path().app_data_dir()` y
  `app.path().resource_dir()`, que Tauri traduce sola. En Windows el buzón cae en
  `%APPDATA%\com.copynotes.app\mailbox`.
- El vigilante de carpeta (crate `notify`) es multiplataforma.
- Los permisos `0700` del buzón ya tienen una rama `#[cfg(not(unix))]` que no
  hace nada (`bridge.rs:19`). En Windows es aceptable: `%APPDATA%` ya está
  restringida al usuario por las ACL heredadas del perfil.

El trabajo real está en cinco bordes, listados abajo.

## 3. Los cinco arreglos

### 3.1 Abrir enlaces externos — el más grave

`src-tauri/src/lib.rs:25` ejecuta `/usr/bin/open`, que sólo existe en macOS.

El alcance es mayor de lo que parece. `open_external` lo usan **tres** caminos:

| Quién | Dónde |
|---|---|
| Enlaces dentro de una nota | `src/lib/editor/BlockRow.svelte:580` |
| **Entrar con Google** | `src/lib/sync/google-desktop.ts:29` |
| Bajar la actualización | `src/lib/desktop/UpdateSection.svelte:52` |

Sin este arreglo, en Windows no se puede iniciar sesión. Es el primero de la fila.

**Cambio:** reemplazar la llamada a `/usr/bin/open` por el complemento oficial
`tauri-plugin-opener`, que resuelve el abridor de cada sistema.

**Lo que NO cambia:** la función `is_openable` y su test se quedan exactamente
como están. Esa lista blanca (`http`, `https`, `mailto`) es lo que impide que un
enlace escrito en una nota abra un archivo del disco o un programa. El
complemento se suma detrás de la guardia, no la reemplaza.

Verificar durante la implementación si hace falta declarar un permiso en
`src-tauri/capabilities/default.json`. Al invocarse desde Rust y no desde el
webview, en principio no.

### 3.2 El renombre del buzón puede fallar en Windows

`bridge.rs:77` (`export.json`) y `bridge.rs:238` (outbox) escriben un archivo
temporal y lo renombran encima del definitivo. En Unix ese renombre es atómico y
nunca falla porque otro proceso tenga el archivo abierto.

**En Windows sí falla.** `MoveFileEx` devuelve "acceso denegado" si el destino
está abierto por otro proceso. Y `export.json` es justamente el archivo que el
servidor MCP lee en cada llamada (`mcp/lib/mailbox.js:53`), mientras la app lo
reescribe cada vez que cambian las notas. El antivirus lo empeora: abre archivos
para escanearlos sin avisar.

El síntoma no es un error visible. Es "a veces el agente no ve el último cambio",
intermitente e irreproducible.

**Cambio:** una función `replace_atomically(tmp, target)` en `bridge.rs`, usada
por los dos sitios, que reintente el renombre unas pocas veces con una pausa
corta antes de devolver error. Un solo lugar, no dos copias.

El mismo problema existe del lado Node en `mcp/lib/mailbox.js:168`
(`agent-status.json`). Ese archivo sólo guarda una marca de tiempo, así que
perder una escritura no rompe nada; se deja como está y se anota acá para no
volver a descubrirlo.

### 3.3 Dos ventanas de la app a la vez — pérdida de datos

En macOS el sistema impide abrir la misma aplicación dos veces. **En Windows no.**
Dos procesos separados escribirían sobre la misma base IndexedDB sin enterarse
uno del otro, y el aviso entre pestañas que existe hoy (`BroadcastChannel`) no
cruza entre procesos distintos.

**Cambio:** registrar `tauri-plugin-single-instance`. Cuando alguien abre la app
por segunda vez, el complemento le da el foco a la ventana que ya está abierta y
el proceso nuevo termina.

El complemento debe registrarse **antes que cualquier otro** en el
`tauri::Builder`, según su documentación.

### 3.4 El comando de Ajustes › Agentes usa comillas de Mac

`src/lib/bridge/mcp-config.js:35` (`shellQuote`) usa comillas simples al estilo
POSIX. En PowerShell funcionan como texto literal y sirven; en la consola vieja
(`cmd.exe`) no citan nada, así que **un usuario de Windows cuyo nombre tenga un
espacio** ("Juan Perez") recibe un comando partido. El escape de una comilla
simple también difiere: POSIX cierra y reabre (`'\''`), PowerShell la duplica
(`''`).

**Cambio:** una rama de Windows en `mcp-config.js` con el escape de PowerShell, y
un `isWindows()` nuevo en `$lib/platform` que la elija. La detección se hace con
`navigator.userAgent`; no hace falta un complemento ni una dependencia nueva.

**Lo que no se toca:** `openCodeConfig`, `cursorConfig` y `cursorDeeplink` van en
JSON, y `JSON.stringify` ya escapa las barras invertidas de Windows
correctamente. Están bien hoy.

**Techo conocido, declarado a propósito:** en Windows `claude` suele ser un
archivo `.cmd` instalado por npm, y PowerShell vuelve a interpretar los
argumentos al invocarlo. Puede pasar que ni el escape correcto sobreviva a ese
segundo paso. El paso 7 del gate (§5) existe justamente para descubrirlo con una
ruta con espacio. Si falla, la salida es mostrar el JSON de configuración en vez
del comando, que es el camino que los demás clientes ya usan.

### 3.5 `mcp/package.json` usa `rm -rf`

El script `build:flat` borra `node_modules` con `rm -rf`, que no existe en
Windows. Ese paso es obligatorio: Tauri copia archivos y no accesos directos, así
que sin él la app viaja con accesos rotos y el puente de agentes muere al
arrancar.

**Cambio:** declarar `shell: bash` en ese paso del workflow. Los runners de
Windows en GitHub Actions traen Git Bash, así que `rm -rf` funciona. Cero cambios
en el código.

## 4. La fábrica: `release.yml`

Hoy es un único trabajo en `macos-latest` con
`args: --target universal-apple-darwin`.

**Cambio:** dos trabajos, `macos` y `windows`, **en secuencia y no en paralelo**.

La secuencia importa: los dos trabajos escriben `latest.json`, el archivo que la
app consulta para saber si hay versión nueva. `tauri-action` está pensado para
fusionar las claves de cada plataforma en ese archivo, pero si los dos escriben a
la vez el resultado depende de quién llegue último y alguien se queda sin aviso.
Un `needs:` cuesta nada y elimina la carrera.

El trabajo de Windows:

- `runs-on: windows-latest`
- toolchain de Rust estable con el target `x86_64-pc-windows-msvc`
- el mismo `pnpm install --frozen-lockfile`
- el paso `build:flat` con `shell: bash` (§3.5)
- `tauri-action` con `--bundles nsis`

**Verificar durante la implementación:** que `--bundles nsis` siga generando el
artefacto del actualizador y su firma. `createUpdaterArtifacts` debería producirlo
junto al instalador, pero conviene mirar los adjuntos de la primera release
borrador antes de confiar.

**Se deja igual a propósito:** la guardia de los cinco segundos que corta si falta
la clave de firma o los secretos. Vale para los dos trabajos y sigue siendo la
protección más barata del workflow.

**Motor de navegador (WebView2):** se mantiene el modo por defecto de Tauri, que
lo descarga si falta. Windows 11 ya lo trae; en Windows 10 llega con Edge. La
consecuencia aceptada es que una máquina vieja y sin internet no pueda completar
la instalación la primera vez. Empotrar el instalador para cubrir ese caso engorda
el `.exe` para todos los demás.

## 5. Cómo se sabe que está bien

### Gate manual en una máquina virtual (Hernán)

Windows 11 en Parallels o UTM sobre la Mac. Las máquinas Windows con procesador
ARM ejecutan programas x64 por traducción, así que el mismo `.exe` que va a bajar
la gente sirve para probar.

Sobre una Windows recién instalada, sin Node ni nada más:

1. Instalar el `.exe` y que la app **abra**. Prueba que el motor de navegador se
   resuelva solo.
2. Escribir una nota, cerrar la ventana con la X, reabrir → el texto está.
3. Un enlace dentro de una nota → abre en el navegador (§3.1).
4. **Entrar con Google** desde la app instalada. El servidor de vuelta escucha en
   `127.0.0.1` (`oauth.rs:56`), que es sólo la máquina misma, así que el cortafuegos
   de Windows no debería preguntar nada — confirmarlo, no asumirlo.
5. Doble clic al ícono dos veces → **una sola ventana** (§3.3).
6. Instalar Node y Cursor, pegar el comando de Ajustes › Agentes → el agente lee y
   escribe notas.
7. Repetir el paso 6 con un usuario de Windows **cuyo nombre tenga un espacio**.
   Es el caso exacto que rompe hoy (§3.4).
8. Con el agente conectado, editar bastante seguido → el agente sigue viendo los
   cambios. Caza el bug del renombre (§3.2).
9. Instalar la versión anterior, actualizar a la nueva → las notas siguen ahí.

### Confirmación en una PC real (un conocido de Hernán)

Una máquina de verdad, con su antivirus y su Windows real. Confirma los pasos 1,
2, 3, 5 y **qué aparece exactamente en pantalla al bajar el `.exe`** (§6). No se
le pide MCP: eso ya quedó probado en el gate.

Una VM no sustituye esto. El antivirus y la reputación del archivo sólo se ven en
una máquina que no es la nuestra.

### Automático

Los tests de Rust de `is_openable`, del renombre con reintentos y del escape de
PowerShell corren en la Mac como cualquier otro. La suite unitaria y la e2e no
cambian de alcance, salvo las aserciones de `e2e/desktop-prompt.spec.ts` (§7).

## 6. La pantalla de SmartScreen

Sin firma digital, Windows puede mostrar al abrir el instalador una pantalla azul
que dice *"Windows protegió su PC"*, con un "Más información" que revela el botón
"Ejecutar de todos modos". Chrome y Edge suman una advertencia propia y distinta
antes de eso ("este archivo no se descarga habitualmente").

Tres cosas que conviene tener escritas porque se malinterpretan seguido:

- **No tiene relación con la Microsoft Store.** Windows no exige que un programa
  esté ahí.
- Lo que decide es la **reputación del archivo**: cuánta gente lo bajó y ejecutó
  antes. Programas conocidos que no están en la Store (VLC, Steam, Discord) no
  molestan porque están firmados y tienen reputación de sobra.
- La advertencia **sólo se dispara si el archivo llegó por el navegador**. Windows
  marca lo descargado, y esa marca es el disparador. El mismo `.exe` copiado desde
  un pendrive no muestra nada.

**Decisión:** salir sin firma, igual que la `.app` de macOS, y explicar el clic
extra en la guía.

El razonamiento, para no rediscutirlo: un certificado barato (OV, unos USD 100–250
al año) **no elimina la pantalla**. Arranca sin reputación y la advertencia sigue
apareciendo hasta que junte descargas. Sólo un certificado EV la saca desde el
primer día, y cuesta bastante más. Como macOS también sale sin firmar, pagar sólo
Windows sería incoherente. El día que haya presupuesto, se firman los dos juntos.

La reputación además se acumula sola con el uso, así que el problema se achica
sin hacer nada.

## 7. La puerta de entrada en la web

`src/lib/desktop/download.ts:21` tiene `DESKTOP_RELEASE_PUBLISHED = false`.
Pasarlo a `true` enciende de una:

- el cartel de abajo a la derecha (`DesktopAppPrompt.svelte`);
- el enlace en Ajustes › Agentes (`SettingsDialog.svelte:1113`).

**No hace falta detectar el sistema operativo.** Los dos ya apuntan a la página de
releases de GitHub, que lista todos los archivos adjuntos y deja que cada persona
elija el suyo. Una descarga distinta por sistema es más linda y no vale el código
todavía.

`canShowDownloadPrompt` filtra por `(pointer: fine)`, que ya deja afuera teléfonos
y tablets sin distinguir plataformas. Se queda como está.

Hay que **devolver a su lugar las aserciones de `e2e/desktop-prompt.spec.ts`**,
que hoy verifican el estado oculto.

## 8. Prerrequisitos que no son código

Los dos bloquean la publicación y ninguno depende del código:

1. **La Tarea 2 del plan de actualización automática**
   (`docs/superpowers/plans/2026-08-11-actualizacion-automatica-escritorio.md`):
   generar la clave de firma del actualizador, cargar
   `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en el
   repositorio, poner `createUpdaterArtifacts: true` y el `pubkey` en
   `tauri.conf.json`, y hacer el repositorio público. La guardia del workflow ya
   corta hoy si falta cualquiera de esas piezas, para macOS igual que para
   Windows.
2. **La máquina virtual con Windows 11**, con Node y Cursor instalados.

Los cinco arreglos (§3) y el workflow (§4) se pueden escribir sin ninguno de los
dos. Sólo el gate y la publicación los necesitan.

## 9. Fuera de alcance a propósito

- **Linux.** Sesión aparte. La mayor parte de este trabajo le sirve igual: los
  cinco arreglos, la matriz del workflow, la descarga y la guía. Lo que Linux
  suma es su propio motor de navegador (WebKitGTK, de la familia de Safari, no de
  Chrome como Windows) y el problema de dónde probarlo: un Linux virtual sobre
  chip Apple no ejecuta los binarios x64 que publicaríamos.
- **La política de seguridad estricta del webview** (punto 5 del análisis de
  julio). Mejora real, no bloquea Windows, y mezclarla acá hace el cambio más
  difícil de probar.
- **La clasificación fina de plataformas por capacidades** (punto 1 del mismo
  análisis). Se agrega sólo el `isWindows()` que §3.4 necesita.
- **MCP remoto o desde la PWA.** Windows usa la aplicación de escritorio y recibe
  el mismo MCP local que macOS; la pregunta de la PWA es sobre teléfonos y no se
  cruza con esto. Sigue como Opción C del análisis de julio, y ese documento pide
  con razón una especificación de seguridad propia antes de construirlo: el
  servidor remoto necesitaría descifrar notas, y hoy la llave vive sólo en los
  aparatos de cada persona.
- **`.msi`, ARM64 nativo y Microsoft Store.** Recién si aparece demanda.

## 10. Documentación obligatoria

Por las reglas del proyecto, en el **mismo commit** que implementa cada cambio
visible:

- `docs/guia/` — instalar en Windows, qué es la pantalla azul y qué hacer, y
  conectar un agente desde Windows. Actualizar la fecha del índice.
- `CHANGELOG.md` — una viñeta por cambio visible, en castellano y sin jerga. No
  sirve escribirlo al publicar: `latest.json` se genera durante la compilación y
  ya no se puede editar.

## 11. Referencias

- `docs/analisis-futuro-multiplataforma.md` — el análisis exploratorio de julio.
- `docs/superpowers/plans/2026-08-11-actualizacion-automatica-escritorio.md` — la
  Tarea 2 bloqueante.
- `specs/025-macos-desktop-readiness.md` — el equivalente de macOS.
- `specs/028-agent-beta-local-mcp.md` — alcance del MCP, local y de escritorio.
- `specs/034-google-sign-in.md` — el camino de OAuth que §3.1 desbloquea.
