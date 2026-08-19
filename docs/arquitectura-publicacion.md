# Cómo se publica CopyNotes de escritorio

> **Para quien llega sin contexto.** Esto explica **cómo funciona y por qué**.
> Para **hacerlo**, andá a `docs/release-checklist.md` §5, que es la lista de
> pasos. Para el detalle de cada decisión, al plan
> `docs/superpowers/plans/2026-08-11-actualizacion-automatica-escritorio.md`.
>
> Estado: **funcionando para macOS y Windows**. `v0.2.0`, `v0.2.1` y `v0.2.2`
> publicadas y probadas a mano el 2026-08-19. La `v0.2.2` es la primera que
> incluye el instalador de Windows.

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
.github/workflows/release.yml         3 trabajos: preparar → macos → windows
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

### Tres trabajos, en fila india

`preparar` (ubuntu) → `macos` → `windows`. No es paralelo, y no es por prolijidad:

- **`preparar` existe porque hay dos plataformas.** La guardia del actualizador y
  el texto de las novedades valen para las dos; duplicarlas en dos trabajos es
  duplicar algo que se separa solo con el tiempo. Expone las novedades como
  `outputs.body`.
- **`windows` va con `needs: [preparar, macos]`, no en paralelo.** Los dos
  trabajos de compilación **escriben el mismo `latest.json`**. `tauri-action`
  sabe fusionar las claves de cada plataforma, pero si los dos escriben a la vez
  el resultado depende de quién llegue último y **una de las dos plataformas se
  queda sin aviso de versión nueva**. Esperar cuesta minutos; el error cuesta una
  release.
- **`preparar` va nombrado en ese `needs` aunque `macos` ya dependa de él.** En
  GitHub Actions un trabajo **sólo puede leer los `outputs` de los que nombra**.
  Con `needs: macos` a secas, `needs.preparar.outputs.body` llega **vacío**: la
  release y el `latest.json` de Windows saldrían sin novedades, y nadie se
  entera hasta abrir el archivo. El plan original tenía este error.
- **`shell: bash` en el `build:flat` de Windows**, porque el script usa `rm -rf`.
  Los runners de Windows traen Git Bash, así que corre tal cual.
- **Windows sólo genera NSIS** (`args: --bundles nsis`). El bundler también sabe
  hacer `.msi`; mantener dos instaladores duplica el soporte sin ganar nada.

Comprobación después de publicar, la única que importa: bajar el `latest.json` y
ver que estén **las claves de `darwin` Y las de `windows-x86_64`, las dos
firmadas**. Si falta una, los trabajos se pisaron.

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

Paso propio del workflow (`cd mcp && pnpm run build:flat`), **en los dos
trabajos**. Sin eso el `.app` o el `.exe` publicado viaja con symlinks rotos y
**el puente de agentes muere en runtime**. Es el defecto que menos se nota: la
app abre, las notas andan, y **sólo falla el agente**.

### Windows no se puede compilar ni revisar desde la Mac

Ni siquiera `cargo check`. Probado y descartado el 2026-08-19:
`rustup target add x86_64-pc-windows-msvc` instala bien, pero `ring` —que entra
por el actualizador— compila C y muere con `fatal error: 'assert.h' file not
found`; falta el SDK de MSVC y `cargo check` igual corre los `build.rs`.
**GitHub Actions no es una comodidad, es el único camino**, y el primer
compilado va sin red de contención local.

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

## Lo que Windows le hace a quien instala

Tampoco va firmado, y el mecanismo es distinto del de Apple: **SmartScreen
decide por reputación del archivo**, no por certificado. Confirmado en una PC
real el 2026-08-19: pantalla azul *"Windows protegió su PC"* → **Más
información** → **Ejecutar de todos modos**. Una sola vez. Documentado en
`docs/guia/19-actualizaciones.md`.

Tres cosas que se suelen creer mal:

- **No tiene nada que ver con la Microsoft Store.** No publicar ahí no es lo que
  lo dispara.
- **Sólo salta si el archivo llegó por descarga** (la marca que Windows le pone
  a lo que baja un navegador). Copiarlo por pendrive o carpeta compartida **no
  muestra la advertencia** — y por eso probarlo así da un falso verde.
- **Un certificado OV barato no la elimina**: arranca sin reputación igual. Sólo
  uno EV la saca desde el día uno. Por eso: sin firma, igual que macOS.

La reputación se acumula sola con las descargas, así que esto se va con el
tiempo sin hacer nada.

**Una release en borrador da 404 a cualquiera que no tenga permiso de escritura
en el repo**, aunque el repo sea público. Para que un tercero pruebe el `.exe`
antes de publicar, hay que pasarle el archivo por otro medio; lo que dispara
SmartScreen es que **él** lo baje con un navegador, no de dónde venga.

## Qué queda abierto

- **El certificado de Apple.** No hay que rehacer nada de esto; se suma (un paso
  que importa el `.p12` y las variables `APPLE_*` en `tauri-action`).
- **El gate de agentes en Windows.** La `v0.2.2` se publicó **a propósito** con
  los pasos 6, 7 y 8 del gate sin correr (que el agente lea y escriba, el comando
  de Claude Code en PowerShell, y que el buzón no se pierda un cambio). Decisión
  de Hernán con el riesgo a la vista: una PC real confirmó instalar, no perder
  texto, los enlaces, una sola ventana y **entrar con Google + sincronizar**, o
  sea todo lo que hace alguien que no usa agentes. Lo que falta afecta sólo a
  quien conecte un agente desde Windows; si falla, sale una `0.2.3`. Pasos y
  cómo armar la máquina virtual, en
  `docs/superpowers/plans/2026-08-13-windows-escritorio.md` (Tarea 7).
- **El paso 9 del gate no se pudo correr** —instalar una versión nueva encima de
  una vieja y ver que no se pierdan notas— porque no existía una versión de
  Windows anterior a la `0.2.2`. Se prueba en la `0.2.3`.
- **Linux.** Sin plan y con un problema abierto: un Ubuntu ARM sobre una Mac con
  chip Apple **no corre el AppImage x64** que publicaríamos (Windows sí traduce,
  Linux no), así que no hay dónde probarlo sin conseguir una máquina. Análisis
  viejo en `docs/analisis-futuro-multiplataforma.md`.
- **La url de descarga dentro del `latest.json`** apunta a
  `api.github.com/repos/.../releases/assets/{id}` en vez de al nombre del
  archivo (así lo escribe `tauri-action` para un borrador, y publicar **no**
  regenera el `latest.json`). Hoy es inofensivo porque **nunca descargamos**,
  sólo `check()`. Revisar antes de activar auto-update.
- **El `CHANGELOG.md` no tiene sección abierta**: la `## 0.2.2` ya salió. La
  próxima funcionalidad visible abre `## 0.2.3` en el mismo commit que la
  implementa.
