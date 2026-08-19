# Cómo se publica CopyNotes de escritorio

> **Para quien llega sin contexto.** Esto explica **cómo funciona y por qué**.
> Para **hacerlo**, andá a `docs/release-checklist.md` §5, que es la lista de
> pasos. Para el detalle de cada decisión, al plan
> `docs/superpowers/plans/2026-08-11-actualizacion-automatica-escritorio.md`.
>
> Estado: **funcionando**. `v0.2.0` y `v0.2.1` publicadas y probadas a mano el
> 2026-08-19.

## La decisión que ordena todo lo demás

**La app no se actualiza sola.** Avisa —un punto sobre el engranaje— y la persona
decide si instala. Decisión de producto de Hernán, 2026-08-11.

De ahí sale todo el resto: usamos el plugin updater de Tauri **sólo para
preguntar** (`check()`), **nunca** `downloadAndInstall()` ni `relaunch()`, y
`tauri-plugin-process` **deliberadamente no se instala** para que `relaunch()` ni
exista. Si alguien quisiera convertir esto en auto-update, va a tener que
agregar una dependencia a propósito: no puede pasar por descuido.

Dos motivos concretos, no ideológicos:

1. Sin certificado de Apple, **cada versión nueva dispara dos carteles de macOS**
   (ver abajo). Una app que se reemplaza sola y después pide la contraseña del
   Mac sin que nadie lo espere es peor que una que avisa.
2. `relaunch()` **no dispara `onCloseRequested`**, así que se saltearía la
   barrera de guardado de `TauriLifecycle.svelte`. El día que se active
   auto-update, hay que llamar `settlePendingWrites()` → `writeAgentExport()`
   antes, y **abortar si la barrera devuelve `false`**.

## Las piezas

```txt
CHANGELOG.md                          fuente ÚNICA de las novedades
package.json  "version"               fuente ÚNICA del número de versión
scripts/changelog-section.mjs         imprime una sección; FALLA si no existe
.github/workflows/release.yml         compila, firma y publica (tag `v*`)
src-tauri/
  Cargo.toml                          tauri-plugin-updater = "2"
  src/lib.rs                          registra el plugin (#[cfg(desktop)])
  capabilities/default.json           permiso "updater:default"
  tauri.conf.json                     createUpdaterArtifacts + plugins.updater
src/lib/desktop/
  update-check.js                     lógica PURA (la única testeada)
  update-status.svelte.ts             el $state compartido + checkForUpdate()
  UpdateSection.svelte                la sección de Configuración
  TauriLifecycle.svelte               dispara el chequeo al arrancar
  download.ts                         DESKTOP_RELEASE_PUBLISHED + la URL
docs/release-checklist.md §5          el ritual de publicar
```

### Por qué el changelog es un archivo del repo y no el cuadro de texto de GitHub

**Porque `tauri-action` genera el `latest.json` en la misma corrida que crea la
release**, copiando adentro el texto que el workflow le pasó. Editar la
descripción de la release después **no regenera nada**: el `latest.json` ya quedó
escrito, y la app mostraría el texto de relleno para siempre.

O sea: **las novedades tienen que existir antes de compilar**. De ahí sale la
regla de `CLAUDE.md` (*Changelog Rule*): se escriben **en el mismo commit que la
funcionalidad**, gemela de la de `docs/guia/`.

Una fuente, tres destinos: el cuerpo de la release, el `notes` del `latest.json`
que ve quien todavía no actualizó, y —embebido con `?raw`— el bloque plegado
*"qué trajo tu versión"*, que anda **sin internet**.

### Una consulta, un estado, dos lectores

El punto vive en la barra (`+page.svelte`) y la sección adentro de Configuración,
que se monta y desmonta al abrirse. Si cada uno consultara por su cuenta habría
dos pedidos por sesión y, peor, **dos respuestas que pueden no coincidir**.

`checkForUpdate()` corre **una vez por arranque** en `TauriLifecycle` y llena
`updateStatus`. Los dos leen de ahí. Mismo patrón que `sync/status.svelte.ts`.

`describeUpdate()` devuelve **tres** estados, y el tercero es el que se suele
hacer mal: `'nueva'`, `'al-dia'`, `'sin-respuesta'`. No haber podido preguntar
(sin internet, GitHub caído, `tauri dev`) **no es un error del usuario**: no hay
nada que arreglar ni que decidir, así que se muestra la versión y se calla.

`current` y `latest` son campos **separados aunque valgan lo mismo**: la pantalla
dice las dos cosas a la vez, y colapsarlos hace que el texto anuncie como
instalada una versión que justamente todavía no lo es. Fue un defecto real del
plan y se verificó a ojo en la 0.2.0.

## Reglas que ya costaron caro

### La app publicada puede salir SIN NUBE, y compila igual

**Este es el error más caro del sistema porque no avisa.** Las
`PUBLIC_SUPABASE_*` las **hornea Vite al compilar** (`import.meta.env`), leídas
del `.env` local — que no se versiona, y así tiene que quedar. El runner de
GitHub no lo tiene. Resultado en la v0.2.0: la app arrancaba perfecta y en
Configuración › Nube decía *"esta copia de CopyNotes no tiene una nube
configurada"*, **sin forma de arreglarlo desde la app**.

Un build sin nube **compila, firma y publica sin una sola advertencia**. Por eso
el workflow las pasa por `env:` **y** la guardia del paso 3 las exige.

- **Verificado, no asumido** (2026-08-19): `mv .env .env.probando` + build con
  las variables sólo en el entorno ⇒ aparecen en `build/index.html` (el CSP) y en
  `build/_app/`. Restaurar el `.env` después.
- **No se puede verificar grepeando el `.app`.** Tauri embebe el frontend
  **comprimido** adentro del ejecutable. Se probó con un texto de la interfaz que
  sí estaba y tampoco aparecía. *Si un grep da cero, validá el método con un
  control antes de creerle.*

### No registrar el plugin sin `pubkey`

`tauri_plugin_updater` lee su configuración **al arrancar**. Registrarlo con
`plugins.updater` ausente hace fallar el `setup()` y **la app no abre**, ni en
`tauri dev`. El plugin de Rust y el `pubkey` van juntos o no van.

**Cómo se comprueba sin build completo:** `cargo build --bin copynotes` y correr
`./target/debug/copynotes` unos segundos en background. Si `setup()` falla, el
proceso muere. En la verificación real salió vivo **y** con
`update endpoint did not respond with a successful status code` en el log — o
sea, el plugin hizo la consulta de verdad y sólo fallaba porque todavía no había
release publicada. Dos verificaciones por el precio de una.

### `includeUpdaterJson: true` no genera nada por su cuenta

El `latest.json` lo produce el bundler, y sólo si `createUpdaterArtifacts` está
prendido; firmarlo necesita el `pubkey`. Sin eso la release sale **sin el archivo
que la app consulta**, y recién se nota mirando los adjuntos, después de ~25
minutos de compilar Rust. La guardia del paso 3 corta en segundos.

### El endpoint da 404 hasta que la release se publica

`/releases/latest/download/latest.json` **sólo resuelve para releases
publicadas**. Toda release sale como **borrador** (`releaseDraft: true`) — es la
única marcha atrás que este sistema tiene. Un 404 mientras hay borrador es
correcto, no un bug.

### `pnpm tauri info` no imprime la versión de la app

(CLI 2.11.4.) Para comprobar que `tauri.conf.json` resolvió
`"version": "../package.json"`: compilar y
`strings -a target/debug/copynotes | grep -oE 'CopyNotes0\.[0-9.]+'`. Ojo con
`Compiling copynotes v0.1.0` en la salida de cargo: **ese es el `Cargo.toml`**,
que queda en `0.1.0` a propósito porque no alimenta la versión del bundle.

### El `node_modules` plano de `mcp/`

Paso propio del workflow (`cd mcp && pnpm run build:flat`). Sin eso el `.app`
publicado viaja con symlinks rotos y **el puente de agentes muere en runtime**.

## Lo que macOS le hace a quien instala

Mientras no exista el certificado de Apple (USD 99/año, **diferido**), pasan dos
cosas en **cada** versión nueva. Las dos están documentadas en
`docs/guia/19-actualizaciones.md` y avisadas dentro de la app, porque el sistema
no da ninguna pista:

1. **Bloquea la app.** *"Apple no pudo verificar que «CopyNotes» no contenga
   software malicioso"*, con un solo botón (**Listo**). Se destraba en **Ajustes
   del Sistema › Privacidad y seguridad › "Abrir igualmente"**, y ese renglón
   sólo aparece si recién intentaste abrirla.
   **⚠️ El clic derecho → Abrir YA NO FUNCIONA**: Apple lo sacó. Cualquier
   documento que lo diga está viejo.
2. **Pide la contraseña del Mac** una vez, por `CopyNotes WebCrypto Master Key`.
   Lo dispara el cambio de firma (ad-hoc, distinta en cada build), no quién
   instala. **Denegarlo deja la nube muda en ese aparato sin decir por qué.**

Las notas **nunca** corren riesgo: IndexedDB se indexa por identificador de app
(`com.copynotes.app`), que no cambia. Lo único atado a la firma es el ítem del
llavero.

El día que exista el certificado, se van las dos, se borra el párrafo de
advertencia de `UpdateSection.svelte`, y **recién ahí** conviene auto-update de
verdad.

## Qué queda abierto

- **El certificado de Apple.** No hay que rehacer nada de esto; se suma (un paso
  que importa el `.p12` y las variables `APPLE_*` en `tauri-action`).
- **Windows y Linux.** El workflow de acá es **sólo macOS** (`runs-on:
  macos-latest`, `--target universal-apple-darwin`). Windows tiene su propio plan
  escrito y sin construir: `docs/superpowers/plans/2026-08-13-windows-escritorio.md`.
  **Quien lo ejecute tiene que releer este documento primero**: la guardia del
  paso 3, las `PUBLIC_SUPABASE_*` horneadas y el `node_modules` plano de `mcp/`
  aplican igual, y la firma de Windows es un mecanismo distinto del minisign de
  acá.
- **La url de descarga dentro del `latest.json`** apunta a
  `api.github.com/repos/.../releases/assets/{id}` en vez de al nombre del
  archivo (así lo escribe `tauri-action` para un borrador, y publicar **no**
  regenera el `latest.json`). Hoy es inofensivo porque **nunca descargamos**,
  sólo `check()`. Revisar antes de activar auto-update.
- **Sección `## 0.2.2` ya escrita** en `CHANGELOG.md`, esperando esa versión.
