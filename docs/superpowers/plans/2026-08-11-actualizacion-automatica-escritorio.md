# Aviso de versión nueva en la app de escritorio — Plan de implementación

> **Para quien lo ejecute (agente):** SUB-SKILL OBLIGATORIA: usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar tarea por tarea. Los pasos usan casillas (`- [ ]`) para ir tildando.

**Objetivo:** que CopyNotes de escritorio avise —con un punto en el engranaje— cuándo hay una versión nueva, muestre en Configuración **qué trae la que viene** y **qué trajo la que ya tenés**, y deje que la persona decida si la instala. La app **no** se actualiza sola.

**Arquitectura:** un `CHANGELOG.md` en la raíz es la fuente única de las novedades, escrito en el mismo commit que la funcionalidad. De ahí salen las dos cosas: el workflow lo lee para armar el cuerpo de la release y el `notes` del `latest.json` que la app consulta, y el build lo embebe para poder mostrar sin conexión qué trajo la versión instalada. El plugin `tauri-plugin-updater` se usa **solo para preguntar** (`check()`, nunca `downloadAndInstall()`). El botón "Descargar" abre la página de la release con `openExternal`.

**Stack:** Tauri 2.11.3, `tauri-plugin-updater` v2 (solo `check()`), GitHub Actions (`tauri-apps/tauri-action@v1`), minisign para firmar los artefactos.

---

## Decisiones ya tomadas (Hernán, 2026-08-11)

1. **No hay actualización automática.** La app avisa; la persona decide.
2. **El chequeo va por el lado de Rust.** El plugin updater usado solo para preguntar. Evita tocar la CSP y deja el camino abierto para auto-update real más adelante.
3. **El certificado de Apple queda para después.** No es un requisito de seguridad en esta forma.
4. **Tiene que haber una insignia en la barra.** Un aviso que vive adentro de Configuración, si nada lleva ahí, es un aviso que nadie ve.
5. **Las novedades se muestran en los dos momentos:** antes de actualizar (qué viene) y después (qué trajo la que instalaste). Con instalación manual es muy fácil bajar el `.dmg` sin leer nada; si el aviso desaparece al actualizar, esa persona no se entera nunca de qué cambió.

---

## Defecto encontrado revisando (y por qué el changelog es un archivo)

La versión anterior de este plan decía: publicá, y después **editá a mano el cuadro de texto de la release en GitHub** con las novedades.

**Eso no funciona.** `tauri-action` genera el `latest.json` —el archivo que la app consulta— **en la misma corrida** en que crea la release, copiando adentro el texto que el workflow le pasó. Editar la descripción de la release después no regenera nada: el `latest.json` ya quedó escrito con el texto de relleno, y la app mostraría *"(escribir acá qué trae esta versión)"*.

De ahí sale la forma correcta, que además es mejor por otros tres motivos: **las novedades tienen que existir antes de compilar**, o sea en un archivo del repo.

- Se escriben **en el mismo commit que la funcionalidad**, cuando todavía se sabe qué cambió — la misma regla que `CLAUDE.md` ya impone para `docs/guia/`.
- Se revisan en el diff, como cualquier otro cambio.
- Y como están en el repo, el build puede **embeberlas** y mostrar sin conexión qué trajo la versión instalada.

Una fuente, tres destinos: el cuerpo de la release, el `latest.json` que ve quien todavía no actualizó, y el bloque "qué trajo tu versión" adentro de la app.

---

## Corrección importante sobre una nota vieja

Existe una nota de proyecto del 2026-08-01 que dice que si alguien deniega el cartel del llavero de macOS, la app puede creer que no hay bóveda y ofrecerle crear una nueva **encima de la real**.

**Eso ya no es así, y quien ejecute este plan no debe planificar contra ese miedo.** La spec 035 (2026-08-10) lo cerró:

- `SettingsDialog.svelte:107` — `accountHasVault = vaultReady || (cloudSession ? await cloudVaultExists() : false)`: antes de ofrecer nada, le pregunta al servidor si la cuenta ya tiene bóveda.
- `SettingsDialog.svelte:676` — si la cuenta tiene bóveda pero este aparato no la puede abrir, la pantalla que sale es **"Esta cuenta ya tiene notas guardadas. Pedile el código al aparato donde ya las tenés"**, no la de crear.
- `upload.ts:161-168` — y si igual se creara una, la subida la frena con la prueba.

Queda un hueco angosto: denegar el llavero **y** estar sin internet o deslogueado **y** entrar a crear una bóveda. Tres condiciones, no un clic.

**Lo que sí sigue siendo cierto:**

> Cada build nueva tiene una firma distinta (firma ad-hoc), así que macOS pide una vez la contraseña del Mac por *"CopyNotes WebCrypto Master Key"*. Lo dispara el cambio de firma, no quién instala. Quien lo deniegue se queda **sin sincronización de la nube en ese aparato**, sin entender por qué.

Por eso el cartel **avisa del prompt antes de que aparezca**.

---

## Nota de diseño: por qué el punto va en el engranaje

`DataStatus.svelte:26-28` ya tiene una regla escrita:

> *"El engranaje es para decisiones —entrar, permitir, cerrar sesión—, no para marcadores; y un conflicto en una nota que no tenés abierta era invisible salvo que se te ocurriera ir a buscarlo ahí."*

Esa regla sacó del engranaje los **marcadores de estado continuo** ("guardando…", "3 conflictos"). "Hay una versión nueva" es lo otro: **una decisión**, del mismo tipo que "entrar" o "cerrar sesión", y se toma adentro de Configuración. Un punto que señala dónde vive una decisión está del lado correcto de la regla. Lo que sí estaría mal —y no se hace acá— es meterlo en `DataStatus`: eso es "el estado de **tus datos**", y una versión de la app no lo es.

De la misma nota se hereda una restricción: **las palabras van en el tooltip y el `aria-label`, nunca en el header**, porque *"el ancho del punto no puede cambiar o los íconos se mueven solos"*.

---

## Qué va a ver el usuario

**En la barra**, cuando hay versión nueva, un punto sobre el engranaje. Tooltip: *"Configuración — hay una versión nueva"*.

**En Configuración › Actualizaciones** (solo en la app de escritorio):

```
Actualizaciones

  Tenés la versión 0.2.0.

  ┌────────────────────────────────────────┐
  │  0.2.1 ya está disponible              │
  │                                        │
  │  • El menú "/" ahora abre en el        │
  │    celular sobre renglones con texto   │
  │  • Los enlaces se pueden clickear      │
  │                                        │
  │  [ Descargar ]                         │
  │                                        │
  │  Al abrir la versión nueva, macOS te   │
  │  va a pedir la contraseña del Mac una  │
  │  vez. Es normal — tocá "Permitir       │
  │  siempre", si no la nube deja de       │
  │  sincronizar en esta computadora.      │
  └────────────────────────────────────────┘

  ▸ Qué trajo tu versión (0.2.0)
```

- El segundo bloque está **plegado** y viene adentro de la app: funciona sin internet y sigue estando cuando ya estás al día.
- Sin novedad: *"Tenés la versión 0.2.0. Estás al día."*, sin punto en el engranaje, y el bloque plegado igual.
- Sin internet: *"Tenés la versión 0.2.0."* y el bloque plegado. No es un error del usuario.

---

## Global Constraints

- **`CHANGELOG.md` en la raíz es la única fuente de las novedades**, y se escribe **en el mismo commit que la funcionalidad** — igual que `docs/guia/`. Una sección `## X.Y.Z` por versión, viñetas en español, sin jerga.
- **Versión única en `package.json`.** `tauri.conf.json` la lee desde ahí (`"version": "../package.json"`). `src-tauri/Cargo.toml` y `mcp/package.json` **no** se sincronizan: ninguno alimenta la versión del bundle.
- **Versionado semántico:** `0.2.0` primera release pública. `0.y.0` = features, `0.y.z` = arreglos.
- **Nunca llamar `downloadAndInstall()` ni `relaunch()`.** `relaunch()` además **no dispara `onCloseRequested`**, así que se saltearía la barrera de guardado de `TauriLifecycle.svelte:21`. No se instala el plugin `process` para que ese camino no exista.
- **El chequeo corre UNA vez por arranque**, en `TauriLifecycle`. El punto y la sección leen el mismo estado: dos consultas con dos respuestas distintas es un bug esperando.
- **Las palabras del aviso van en el tooltip y el `aria-label`, nunca en el header** (`DataStatus.svelte:31-33`).
- **La clave privada de firma vive solo en GitHub Secrets** (`TAURI_SIGNING_PRIVATE_KEY`) y en el gestor de contraseñas de Hernán.
- **Toda release sale como borrador (`releaseDraft: true`)** y se publica a mano después de probarla. `latest.json` en `/releases/latest/download/` solo resuelve para releases publicadas.
- **El repo tiene que ser público** (`Hhernanoliva/CopyNotes`): es lo que hace gratis el hosting de releases *y* los runners de macOS en Actions.
- **Antes de cada `tauri build` hay que rehacer el `node_modules` plano de `mcp/`** (`cd mcp && pnpm run build:flat`). Sin eso el puente de agentes viaja roto adentro del `.app`.
- **No se toca la CSP.** El pedido a GitHub lo hace Rust, no el webview.
- El código escrito a mano es JavaScript plano dentro de `.ts`/`.svelte`: sin anotaciones de tipo.
- La guía de usuario (`docs/guia/`) se actualiza **en el mismo commit** que la funcionalidad visible.

---

## Estructura de archivos

**Nuevos**
- `CHANGELOG.md` — las novedades, en español, una sección por versión. Fuente única.
- `scripts/changelog-section.mjs` — imprime la sección de una versión. Lo usa el workflow; falla si la sección no existe.
- `.github/workflows/release.yml` — compila, firma y publica el borrador de la release.
- `src/lib/desktop/update-check.js` — lógica pura: leer el changelog y decidir qué mostrar. Es lo único que se testea.
- `src/lib/desktop/update-check.test.js` — sus tests.
- `src/lib/desktop/update-status.svelte.ts` — el estado compartido que leen el punto y la sección. Sigue el patrón de `sync/status.svelte.ts`.
- `src/lib/desktop/UpdateSection.svelte` — la sección de Configuración. Vive acá y no adentro de `SettingsDialog.svelte`, que ya tiene 1186 líneas.

**Modificados**
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json` — el plugin y su permiso.
- `package.json` — versión `0.2.0`, dependencia `@tauri-apps/plugin-updater`.
- `src/lib/desktop/TauriLifecycle.svelte` — disparar el chequeo al arrancar.
- `src/routes/+page.svelte:679-687` — el punto sobre el engranaje.
- `src/lib/components/SettingsDialog.svelte` — dos líneas que montan `<UpdateSection />`.
- `src/lib/desktop/download.ts:12-21` — `DESKTOP_RELEASE_PUBLISHED = true`.
- `e2e/desktop-prompt.spec.ts` — restaurar las aserciones de "se ve".
- `docs/guia/` + `docs/guia-de-uso.md` — tema nuevo.
- `docs/release-checklist.md` + `CLAUDE.md` — el ritual de publicar y la regla del changelog.

---

## Tarea 1: Una sola versión, no tres ✅ HECHA (`7e33c4d`, 2026-08-11)

**Archivos:**
- Modificar: `src-tauri/tauri.conf.json:4`
- Modificar: `package.json:3`

**Interfaces:**
- Produce: `package.json` como única fuente del número de versión.

- [x] **Paso 1: Ver el problema**

```bash
grep '"version"' package.json mcp/package.json src-tauri/tauri.conf.json && grep '^version' src-tauri/Cargo.toml
```
Esperado: cuatro `0.1.0` que hoy nadie mantiene sincronizados.

- [x] **Paso 2: Que `tauri.conf.json` lea la versión de `package.json`**

En `src-tauri/tauri.conf.json`, reemplazar la línea `"version": "0.1.0",` por:

```json
  "version": "../package.json",
```

- [x] **Paso 3: Subir `package.json` a la primera versión pública**

En `package.json`, cambiar `"version": "0.1.0"` por:

```json
	"version": "0.2.0",
```

- [x] **Paso 4: Verificar que Tauri la toma**

`pnpm tauri info` **no imprime la versión de la app** (CLI 2.11.4): lista Rust, node
y los plugins, nada más. La verificación que sí sirve es compilar y mirar la config
que Tauri embebió en el binario:

```bash
export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && touch build.rs && cargo build --bin copynotes
strings -a target/debug/copynotes | grep -oE 'CopyNotes0\.[0-9.]+'
```
Esperado: `CopyNotes0.2.0` — el `productName` pegado a la versión resuelta. Si la
ruta `../package.json` no resolviera, `cargo build` cortaría antes.
(`Compiling copynotes v0.1.0` en la salida de cargo es el `Cargo.toml`, que queda
en `0.1.0` a propósito. No es la versión del bundle.)

`src-tauri/Cargo.toml` y `mcp/package.json` quedan en `0.1.0` **a propósito**: ninguno alimenta la versión del bundle.

- [x] **Paso 5: Commit**

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: una sola fuente para el número de versión de la app"
```

---

## Tarea 2: Enchufar el chequeo (sin capacidad de instalar)

**Archivos:**
- Modificar: `src-tauri/Cargo.toml:20-25`, `src-tauri/src/lib.rs:48-57`, `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json`, `package.json`

**Interfaces:**
- Produce: `check()` de `@tauri-apps/plugin-updater`, que devuelve `null` o `{ available, version, body }`. La Tarea 4 lo consume.

> **Deliberado:** NO se instala `tauri-plugin-process` y NO se agrega `process:allow-restart`. Sin ellos `relaunch()` no existe y nadie puede convertir esto en auto-update por accidente.

- [ ] **Paso 1: Generar el par de claves de firma (lo hace Hernán, una vez)**

```bash
pnpm tauri signer generate -w ~/.tauri/copynotes-updater.key
```

Pide una contraseña — ponerla y **guardarla en el gestor de contraseñas junto con el archivo `.key`**. Imprime la clave **pública**: copiarla.

- [ ] **Paso 2: Cargar la clave privada en GitHub Secrets**

```bash
cat ~/.tauri/copynotes-updater.key | pbcopy
```
En `Settings → Secrets and variables → Actions`, crear `TAURI_SIGNING_PRIVATE_KEY` (lo pegado) y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (la del paso 1).

- [ ] **Paso 3: Confirmar que el repo es público**

```bash
gh repo view Hhernanoliva/CopyNotes --json visibility
```
Esperado: `{"visibility":"PUBLIC"}`. Si dice `PRIVATE`, hacerlo público antes de seguir.

- [ ] **Paso 4: Agregar la dependencia de Rust**

En `src-tauri/Cargo.toml`, dentro de `[dependencies]`:

```toml
tauri-plugin-updater = "2"
```

- [ ] **Paso 5: Agregar la dependencia de JavaScript**

```bash
pnpm add @tauri-apps/plugin-updater
```

- [ ] **Paso 6: Registrar el plugin**

En `src-tauri/src/lib.rs`, dentro de `.setup(|app| { ... })`, justo antes del `Ok(())` final:

```rust
      // Solo para PREGUNTAR si hay una versión nueva: la app nunca se
      // reemplaza a sí misma. `tauri-plugin-process` queda deliberadamente
      // afuera, así `relaunch()` no existe y esto no se puede volver
      // auto-update sin que alguien lo decida a propósito.
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
```

- [ ] **Paso 7: Dar el permiso**

`src-tauri/capabilities/default.json` completo:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "core:window:allow-destroy",
    "updater:default"
  ]
}
```

- [ ] **Paso 8: Configurar el actualizador**

En `src-tauri/tauri.conf.json`, agregar `"createUpdaterArtifacts": true` dentro de `"bundle"`, y un bloque `"plugins"` hermano de `"bundle"`:

```json
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "resources": {
      "../mcp/server.js": "mcp/server.js",
      "../mcp/lib": "mcp/lib",
      "../mcp/node_modules": "mcp/node_modules"
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "13.0"
    },
    "android": {
      "debugApplicationIdSuffix": ".debug"
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "PEGAR ACÁ LA CLAVE PÚBLICA DEL PASO 1",
      "endpoints": [
        "https://github.com/Hhernanoliva/CopyNotes/releases/latest/download/latest.json"
      ]
    }
  }
```

`createUpdaterArtifacts` se deja prendido aunque no instalemos nada: es lo que hace que `tauri-action` genere el `latest.json` que `check()` consulta.

- [ ] **Paso 9: Verificar que compila**

```bash
cd mcp && pnpm run build:flat && cd .. && export PATH="$HOME/.cargo/bin:$PATH" && pnpm tauri build --bundles app
find src-tauri/target -name "*.app.tar.gz*"
```
Esperado: compila y aparecen el `.app.tar.gz` y su `.sig`.

- [ ] **Paso 10: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json package.json pnpm-lock.yaml
git commit -m "feat(escritorio): consultar si hay una versión nueva publicada"
```

---

## Tarea 3: Leer el changelog y decidir qué mostrar ✅ HECHA (`d078f71`, 2026-08-11)

**Archivos:**
- Crear: `src/lib/desktop/update-check.js`
- Test: `src/lib/desktop/update-check.test.js`

**Interfaces:**
- Consume: nada.
- Produce:
  - `changelogSection(markdown, version)` → el texto de la sección `## <version>`, o `''` si no está.
  - `parseNotes(body)` → array de strings (las viñetas).
  - `describeUpdate({ current, update, failed })` → `{ state, current, latest, notes }`, con `state` en `'nueva' | 'al-dia' | 'sin-respuesta'`. **`current` es siempre la versión instalada y `latest` la disponible** — dos campos a propósito: la pantalla dice las dos cosas a la vez, y colapsarlas hace que el texto anuncie como instalada una versión que no lo está.

  Las Tareas 4, 5 y 6 usan estas tres.

- [x] **Paso 1: Escribir los tests que fallan**

Crear `src/lib/desktop/update-check.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { changelogSection, describeUpdate, parseNotes } from './update-check';

const CHANGELOG = `# Novedades

## 0.2.10

- Lo de la diez

## 0.2.1

- El menú abre en el celular
- Los enlaces se clickean

## 0.2.0

- Primera versión de escritorio
`;

describe('changelogSection', () => {
	it('saca la sección de una versión y corta en la siguiente', () => {
		expect(changelogSection(CHANGELOG, '0.2.1')).toBe(
			'- El menú abre en el celular\n- Los enlaces se clickean'
		);
	});

	it('la última sección llega hasta el final del archivo', () => {
		expect(changelogSection(CHANGELOG, '0.2.0')).toBe('- Primera versión de escritorio');
	});

	// 0.2.1 no puede quedarse con lo de 0.2.10 por empezar igual: publicar las
	// novedades equivocadas es peor que no publicar ninguna.
	it('no confunde una versión con otra que la tiene de prefijo', () => {
		expect(changelogSection(CHANGELOG, '0.2.1')).not.toContain('Lo de la diez');
		expect(changelogSection(CHANGELOG, '0.2.10')).toBe('- Lo de la diez');
	});

	it('devuelve vacío si la versión no está', () => {
		expect(changelogSection(CHANGELOG, '9.9.9')).toBe('');
		expect(changelogSection('', '0.2.0')).toBe('');
		expect(changelogSection(undefined, '0.2.0')).toBe('');
	});
});

describe('describeUpdate', () => {
	it('anuncia la versión nueva sin perder de vista la instalada', () => {
		const r = describeUpdate({
			current: '0.2.0',
			update: { available: true, version: '0.2.1', body: '- Arreglo A\n- Arreglo B' }
		});
		expect(r.state).toBe('nueva');
		// Las dos, y distintas: el texto dice "tenés la 0.2.0" y "hay 0.2.1".
		expect(r.current).toBe('0.2.0');
		expect(r.latest).toBe('0.2.1');
		expect(r.notes).toEqual(['Arreglo A', 'Arreglo B']);
	});

	it('dice que está al día cuando no hay nada nuevo', () => {
		for (const update of [null, { available: false }]) {
			const r = describeUpdate({ current: '0.2.0', update });
			expect(r.state).toBe('al-dia');
			expect(r.current).toBe('0.2.0');
			expect(r.latest).toBe('0.2.0');
		}
	});

	// Sin internet no es un error del usuario: no hay nada que arreglar y nada
	// que decidir. Se muestra la versión y se calla.
	it('no trata como error el no haber podido preguntar', () => {
		const r = describeUpdate({ current: '0.2.0', update: null, failed: true });
		expect(r.state).toBe('sin-respuesta');
		expect(r.current).toBe('0.2.0');
		expect(r.notes).toEqual([]);
	});

	it('una versión nueva sin notas escritas no rompe nada', () => {
		const r = describeUpdate({
			current: '0.2.0',
			update: { available: true, version: '0.2.1', body: '' }
		});
		expect(r.state).toBe('nueva');
		expect(r.latest).toBe('0.2.1');
		expect(r.notes).toEqual([]);
	});
});

describe('parseNotes', () => {
	it('acepta las tres viñetas que usa Markdown', () => {
		expect(parseNotes('- uno\n* dos\n+ tres')).toEqual(['uno', 'dos', 'tres']);
	});

	it('ignora renglones vacíos y títulos', () => {
		expect(parseNotes('## Novedades\n\n- uno\n\n- dos\n')).toEqual(['uno', 'dos']);
	});

	it('si no hay viñetas usa los renglones sueltos', () => {
		expect(parseNotes('Arreglamos el menú\nY los enlaces')).toEqual([
			'Arreglamos el menú',
			'Y los enlaces'
		]);
	});

	it('aguanta que no venga nada', () => {
		expect(parseNotes(undefined)).toEqual([]);
		expect(parseNotes('')).toEqual([]);
	});
});
```

- [x] **Paso 2: Correrlos y ver que fallan**

```bash
pnpm test:unit --run src/lib/desktop/update-check.test.js
```
Esperado: FALLA con `Failed to resolve import "./update-check"`.

- [x] **Paso 3: Escribir la implementación mínima**

Crear `src/lib/desktop/update-check.js`:

```js
// Todo lo que hay que saber para pintar la sección de Actualizaciones, sin
// tocar Tauri ni el DOM. Lo usan tres lugares: el componente, el estado
// compartido, y `scripts/changelog-section.mjs` (que corre en node, por eso
// este archivo no importa nada de SvelteKit).

// Saca de CHANGELOG.md el cuerpo de una versión: desde su `## X.Y.Z` hasta el
// `##` siguiente, o hasta el final si es la última.
//
// La comparación es EXACTA y no un `startsWith`: con prefijos, pedir 0.2.1
// devolvía lo de 0.2.10, y publicar las novedades de otra versión es peor que
// no publicar ninguna.
export function changelogSection(markdown, version) {
	const lines = String(markdown ?? '').split('\n');
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) return '';
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s/.test(line));
	return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

// El cuerpo puede venir con viñetas, con títulos, o suelto. Las tres formas
// tienen que leerse bien: lo escribe una persona, no un generador.
export function parseNotes(body) {
	const lines = String(body ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	const bullets = lines
		.filter((line) => /^[-*+]\s+/.test(line))
		.map((line) => line.replace(/^[-*+]\s+/, ''));
	if (bullets.length) return bullets;

	return lines.filter((line) => !line.startsWith('#'));
}

// Traduce lo que contestó `check()` a lo que hay que pintar.
//
// Son TRES estados, no dos, y el tercero es el que se suele hacer mal: no haber
// podido preguntar (sin internet, GitHub caído) no es un error del usuario. No
// hay nada que arreglar ni nada que decidir, así que se muestra la versión que
// tiene y se calla — un cartel rojo ahí sería ruido puro.
//
// `current` y `latest` son campos separados incluso cuando valen lo mismo: la
// pantalla dice las dos cosas a la vez, y un solo campo terminaría anunciando
// como instalada la versión que justamente todavía no lo está.
export function describeUpdate({ current, update, failed = false }) {
	if (failed) return { state: 'sin-respuesta', current, latest: current, notes: [] };
	if (!update?.available) return { state: 'al-dia', current, latest: current, notes: [] };
	return {
		state: 'nueva',
		current,
		latest: update.version,
		notes: parseNotes(update.body)
	};
}
```

- [x] **Paso 4: Correr los tests y verlos pasar**

```bash
pnpm test:unit --run src/lib/desktop/update-check.test.js
```
Esperado: 12 tests en verde.

- [x] **Paso 5: Commit**

```bash
git add src/lib/desktop/update-check.js src/lib/desktop/update-check.test.js
git commit -m "feat(escritorio): leer el changelog y decidir qué mostrar"
```

---

## Tarea 4: El chequeo al arrancar y el punto en el engranaje

**Archivos:**
- Crear: `src/lib/desktop/update-status.svelte.ts`
- Modificar: `src/lib/desktop/TauriLifecycle.svelte`
- Modificar: `src/routes/+page.svelte:679-687`

**Interfaces:**
- Consume: `describeUpdate` (Tarea 3); `check()` (Tarea 2); `getVersion()` de `@tauri-apps/api/app` (ya es dependencia, no instalar nada).
- Produce: `updateStatus` (objeto `$state` con `state`, `current`, `latest`, `notes`) y `checkForUpdate()`. La Tarea 5 lee `updateStatus`.

**Por qué el estado es compartido:** el punto vive en la barra y la sección adentro de Configuración, que se monta y desmonta al abrirse. Si cada uno consultara por su cuenta habría dos pedidos por sesión y, peor, dos respuestas que pueden no coincidir. Una consulta al arrancar, un estado, dos lectores. Mismo patrón que `sync/status.svelte.ts`.

- [ ] **Paso 1: Crear el estado compartido**

Crear `src/lib/desktop/update-status.svelte.ts`:

```js
import { describeUpdate } from './update-check';

// Lo que sabemos sobre versiones, en un solo lugar. Lo llena `checkForUpdate()`
// al arrancar (TauriLifecycle) y lo leen dos cosas: el punto del engranaje en el
// header y la sección de Configuración.
//
// Arranca en 'sin-respuesta' a propósito: hasta que el chequeo conteste no
// sabemos nada, y no saber se parece más a "no pude preguntar" que a "estás al
// día". La diferencia importa porque 'al-dia' es lo único que afirma algo.
export const updateStatus = $state({
	state: 'sin-respuesta',
	current: '',
	latest: '',
	notes: []
});

// Corre UNA vez por arranque. Nunca instala nada: `check()` solo lee el
// latest.json publicado. Ver la restricción global sobre downloadAndInstall.
export async function checkForUpdate() {
	const { getVersion } = await import('@tauri-apps/api/app');
	const current = await getVersion();
	try {
		const { check } = await import('@tauri-apps/plugin-updater');
		Object.assign(updateStatus, describeUpdate({ current, update: await check() }));
	} catch (error) {
		// En `tauri dev` no hay paquete publicado y esto siempre falla; sin
		// internet, también. Ninguno de los dos es un problema del usuario, así
		// que se registra en info y la pantalla no muestra nada rojo.
		console.info('No se pudo consultar si hay una versión nueva', error);
		Object.assign(updateStatus, describeUpdate({ current, update: null, failed: true }));
	}
}
```

- [ ] **Paso 2: Dispararlo al arrancar**

En `src/lib/desktop/TauriLifecycle.svelte`, agregar el import junto a los otros:

```js
	import { checkForUpdate } from './update-status.svelte';
```

y, dentro del `$effect` existente, como primera línea del cuerpo (antes de `let unlisten = null;`):

```js
		// Preguntar si hay versión nueva, una vez por arranque. No bloquea nada:
		// el resultado solo pinta un punto y una sección de Configuración, y si
		// falla el estado queda en 'sin-respuesta', que no muestra nada.
		checkForUpdate();
```

- [ ] **Paso 3: Poner el punto sobre el engranaje**

En `src/routes/+page.svelte`, agregar el import junto a los otros:

```js
	import { updateStatus } from '$lib/desktop/update-status.svelte';
```

y reemplazar el botón de Configuración (líneas 679-687) por:

```svelte
			<!-- El punto avisa que hay una versión nueva. Va acá y no en DataStatus
			     porque eso es "el estado de tus datos" y una versión de la app no lo
			     es; y no rompe la regla de que el engranaje no lleva marcadores,
			     porque señala una DECISIÓN que se toma adentro (ver el plan
			     2026-08-11). Las palabras van en el tooltip y el aria-label, nunca
			     en el header: el ancho de los íconos no puede cambiar. -->
			<button
				type="button"
				onclick={() => (settingsOpen = true)}
				aria-label={updateStatus.state === 'nueva'
					? `Configuración — la versión ${updateStatus.latest} está disponible`
					: 'Configuración'}
				use:tooltip={updateStatus.state === 'nueva'
					? 'Configuración — hay una versión nueva'
					: 'Configuración'}
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring relative flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
			>
				<Settings size={18} aria-hidden="true" />
				{#if updateStatus.state === 'nueva'}
					<span
						aria-hidden="true"
						class="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full"
					></span>
				{/if}
			</button>
```

Lo único que cambia respecto del original: `relative` en la clase, el `aria-label` y el `use:tooltip` condicionales, y el `<span>` del punto.

- [ ] **Paso 4: Verificar que nada se rompió**

```bash
pnpm check && pnpm test
```
Esperado: 0 errores, 0 warnings, suite unitaria en verde.

En el navegador el punto **nunca** aparece: `TauriLifecycle` solo se monta dentro de Tauri (`+layout.svelte:72`), así que `updateStatus.state` se queda en `'sin-respuesta'`. No hace falta ningún guard extra en el header.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/desktop/update-status.svelte.ts src/lib/desktop/TauriLifecycle.svelte src/routes/+page.svelte
git commit -m "feat(escritorio): avisar en la barra cuando hay una versión nueva"
```

---

## Tarea 5: El changelog y la sección en Configuración

**Archivos:**
- Crear: `CHANGELOG.md`
- Crear: `src/lib/desktop/UpdateSection.svelte`
- Modificar: `src/lib/components/SettingsDialog.svelte` (dos líneas)
- Modificar: `CLAUDE.md` (la regla del changelog)
- Modificar: `docs/guia/` + `docs/guia-de-uso.md`

**Interfaces:**
- Consume: `updateStatus` (Tarea 4); `changelogSection` y `parseNotes` (Tarea 3); `DESKTOP_DOWNLOAD_URL` de `./download`; `openExternal` de `$lib/platform`.
- Produce: `CHANGELOG.md`, que la Tarea 6 lee desde el workflow.

**Sobre el botón:** se usa `openExternal` (`src/lib/platform/runtime.ts:29`), que ya resuelve el caso difícil — dentro de la app de escritorio `window.open` **no abre nada y no avisa**, así que ahí manda el pedido por el comando Rust `open_external`. Un `<a target="_blank">` moriría en silencio en la `.app`. Es el mismo camino que ya usan `BlockRow.svelte` y `sync/google-desktop.ts`.

- [ ] **Paso 1: Crear el changelog**

Crear `CHANGELOG.md` en la raíz:

```markdown
# Novedades

Lo que cambia en cada versión de CopyNotes, contado para quien la usa.
La app lee este archivo: lo de acá aparece en Configuración › Actualizaciones.

Reglas: una sección `## X.Y.Z` por versión, la más nueva arriba, una viñeta por
cambio, en castellano y sin jerga técnica. Se escribe **en el mismo commit que
la funcionalidad**, no al publicar.

## 0.2.0

- Primera versión de escritorio publicada
- Los agentes se pueden conectar desde Claude Code, OpenCode y Cursor
- Tus notas se pueden guardar cifradas en la nube, si querés
```

- [ ] **Paso 2: Crear el componente**

Crear `src/lib/desktop/UpdateSection.svelte`:

```svelte
<script>
	import { openExternal } from '$lib/platform';
	import { DESKTOP_DOWNLOAD_URL } from './download';
	import { updateStatus } from './update-status.svelte';
	import { changelogSection, parseNotes } from './update-check';
	// El changelog viaja ADENTRO de la app, embebido en el build. Por eso el
	// bloque "qué trajo tu versión" funciona sin internet y sigue estando cuando
	// ya estás al día — que es justo cuando el aviso de arriba desaparece.
	import changelogRaw from '../../../CHANGELOG.md?raw';

	// Solo escritorio: SettingsDialog la monta dentro de `isTauriRuntime()`.
	//
	// No consulta nada: lee el resultado del chequeo que corrió al arrancar
	// (update-status.svelte.ts). Si consultara por su cuenta, el punto del
	// engranaje y esta sección podrían contradecirse.
	//
	// Esto muestra y nada más. Nunca `downloadAndInstall()`, nunca `relaunch()`:
	// la app no se reemplaza a sí misma, el botón manda a la página de descarga.
	const mine = $derived(parseNotes(changelogSection(changelogRaw, updateStatus.current)));
</script>

<section class="flex flex-col gap-3">
	<div class="flex flex-col gap-0.5">
		<h3 class="text-sm font-bold">Actualizaciones</h3>
		<p class="text-muted-foreground text-sm">
			{#if !updateStatus.current}
				Buscando…
			{:else if updateStatus.state === 'al-dia'}
				Tenés la versión {updateStatus.current}. Estás al día.
			{:else}
				Tenés la versión {updateStatus.current}.
			{/if}
		</p>
	</div>

	{#if updateStatus.state === 'nueva'}
		<div class="border-border flex flex-col gap-2 rounded-md border px-3 py-2">
			<p class="text-sm">
				<span class="font-medium">{updateStatus.latest} ya está disponible.</span>
			</p>

			{#if updateStatus.notes.length}
				<ul class="text-muted-foreground flex list-disc flex-col gap-0.5 pl-4 text-sm">
					{#each updateStatus.notes as nota (nota)}
						<li>{nota}</li>
					{/each}
				</ul>
			{/if}

			<button
				type="button"
				onclick={() => openExternal(DESKTOP_DOWNLOAD_URL)}
				class="cn-tap bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
			>
				Descargar
			</button>

			<!-- La mitad del valor de esta sección. La firma de la app cambia en cada
			     build, así que macOS pide la contraseña del Mac la primera vez que se
			     abre una versión nueva. Avisado acá deja de ser un susto; denegado,
			     la nube deja de sincronizar en esta computadora sin decir por qué.
			     Este párrafo se borra el día que exista el certificado de Apple. -->
			<p class="text-muted-foreground text-xs">
				Al abrir la versión nueva, macOS te va a pedir la contraseña del Mac una vez. Es
				normal — tocá <span class="text-foreground font-medium">"Permitir siempre"</span>. Si
				la denegás, la nube deja de sincronizar en esta computadora.
			</p>
		</div>
	{/if}

	<!-- Plegado y con `<details>`, que ya sabe abrirse con teclado y lectores de
	     pantalla sin que nosotros pongamos una línea de JavaScript. -->
	{#if mine.length}
		<details class="text-sm">
			<summary class="text-muted-foreground hover:text-foreground cursor-pointer">
				Qué trajo tu versión ({updateStatus.current})
			</summary>
			<ul class="text-muted-foreground mt-1.5 flex list-disc flex-col gap-0.5 pl-4">
				{#each mine as nota (nota)}
					<li>{nota}</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>
```

- [ ] **Paso 3: Montarla en Configuración**

En `src/lib/components/SettingsDialog.svelte`, agregar el import junto a los otros:

```js
	import UpdateSection from '$lib/desktop/UpdateSection.svelte';
```

y, justo antes del `<section>` de "Agentes" (línea ~881), agregar:

```svelte
		{#if isTauriRuntime()}
			<UpdateSection />
		{/if}
```

`isTauriRuntime` ya está importado en ese archivo y ya se usa así en la sección de Agentes.

- [ ] **Paso 4: Verificar que compila y que el changelog se embebió**

```bash
pnpm check && pnpm test && pnpm build
grep -rl "Primera versión de escritorio publicada" build/ | head -1
```
Esperado: `check` y `test` limpios, y el `grep` encuentra el texto adentro del build — eso prueba que el `?raw` funcionó. Si no lo encuentra, el import relativo no resolvió: revisar la profundidad de `../../../CHANGELOG.md` desde `src/lib/desktop/`.

El texto del changelog también viaja en el build web (el import es estático). Son unos pocos KB de texto público; es el precio de no tener un paso de generación.

- [ ] **Paso 5: Escribir la regla en CLAUDE.md**

En `CLAUDE.md`, junto a la sección "User Guide Rule", agregar:

```markdown
## Changelog Rule

`CHANGELOG.md` (raíz) es lo que la app de escritorio muestra en Configuración ›
Actualizaciones, y de ahí sale el cuerpo de cada GitHub Release. Toda
funcionalidad o cambio visible agrega su viñeta a la sección de la versión en
curso **en el mismo commit que lo implementa** — igual que `docs/guia/`. En
castellano, sin jerga, una viñeta por cambio. Escribirlo al publicar no sirve:
el `latest.json` se genera durante el build y ya no se puede editar después.
```

- [ ] **Paso 6: Documentar en la guía de usuario**

Crear `docs/guia/actualizaciones.md`, en español simple: que en la app de escritorio aparece **un punto en el engranaje** cuando hay versión nueva; que adentro de Configuración se ve qué trae y también **qué trajo la que ya tenés**; que **nunca se actualiza sola** ni interrumpe; que Descargar abre la página para bajarla; **y que al abrir la versión nueva macOS pide la contraseña del Mac una vez, hay que tocar "Permitir siempre", y qué pasa si se deniega**. Agregar la línea al índice de `docs/guia-de-uso.md` y actualizar su "Última actualización".

- [ ] **Paso 7: Commit**

```bash
git add CHANGELOG.md src/lib/desktop/UpdateSection.svelte src/lib/components/SettingsDialog.svelte CLAUDE.md docs/guia/actualizaciones.md docs/guia-de-uso.md
git commit -m "feat(escritorio): mostrar las novedades de la versión nueva y de la instalada"
```

---

## Tarea 6: Publicar releases con un tag

**Archivos:**
- Crear: `scripts/changelog-section.mjs`
- Crear: `.github/workflows/release.yml`

**Interfaces:**
- Consume: `changelogSection` (Tarea 3), `CHANGELOG.md` (Tarea 5), los secretos (Tarea 2).
- Produce: por cada tag `v*`, una GitHub Release **en borrador** con el `.dmg`, el `.app.tar.gz`, su `.sig` y el `latest.json` — este último ya con las novedades correctas adentro.

- [ ] **Paso 1: Crear el extractor**

Crear `scripts/changelog-section.mjs`:

```js
#!/usr/bin/env node
// Imprime las novedades de una versión, para que el workflow las use como
// cuerpo de la release y —lo que importa— como campo `notes` del latest.json.
//
// FALLA si la sección no existe. Publicar una versión con las novedades vacías
// significa que todo el mundo ve un cartel sin texto y nadie se entera hasta
// que ya está publicado; es mejor que se caiga el build.
import { readFileSync } from 'node:fs';
import { changelogSection } from '../src/lib/desktop/update-check.js';

const version = process.argv[2];
if (!version) {
	console.error('Uso: node scripts/changelog-section.mjs <version>');
	process.exit(1);
}

const section = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version);
if (!section) {
	console.error(`CHANGELOG.md no tiene una sección "## ${version}". Escribila antes de taguear.`);
	process.exit(1);
}

process.stdout.write(section);
```

- [ ] **Paso 2: Probarlo a mano**

```bash
node scripts/changelog-section.mjs 0.2.0
node scripts/changelog-section.mjs 9.9.9; echo "código de salida: $?"
```
Esperado: el primero imprime las viñetas de 0.2.0; el segundo imprime el error y sale con código `1`.

- [ ] **Paso 3: Crear el workflow**

Crear `.github/workflows/release.yml`:

```yaml
# Compila y publica la app de escritorio cuando se empuja un tag `vX.Y.Z`.
#
# Sale como BORRADOR a propósito: `latest.json` en /releases/latest/download/
# sólo resuelve para releases publicadas, así que mientras el borrador exista
# nadie recibe el aviso. Publicarlo a mano después de probarlo es la única
# marcha atrás que este sistema tiene.
#
# Sin firma de Apple todavía (decisión 2026-08-11): el .dmg va firmado ad-hoc y
# la primera apertura pide clic derecho → Abrir. Cuando exista el certificado,
# el cambio es agregar el paso que importa el .p12 y las variables APPLE_*.
name: release

on:
  push:
    tags:
      - 'v*'

jobs:
  publicar:
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

      # Las novedades tienen que estar ANTES de compilar: tauri-action las mete
      # adentro del latest.json en esta misma corrida, y ese archivo no se puede
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
          releaseBody: ${{ steps.notas.outputs.body }}
          releaseDraft: true
          prerelease: false
          includeUpdaterJson: true
          # Un solo binario universal: anda en Mac con chip Apple y con Intel, y
          # tauri-action escribe las dos claves de darwin en latest.json
          # apuntando al mismo archivo. Un job en vez de dos.
          args: --target universal-apple-darwin
```

- [ ] **Paso 4: Comprobar que el YAML es válido**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML OK')"
```
Esperado: `YAML OK`.

- [ ] **Paso 5: Commit**

```bash
git add scripts/changelog-section.mjs .github/workflows/release.yml
git commit -m "ci: publicar la app de escritorio con las novedades del CHANGELOG"
```

---

## Tarea 7: Primera release (v0.2.0) — GATE MANUAL

**No es código.** Es la primera vez que el sistema entero corre de punta a punta.

- [ ] **Paso 1: Correr las puertas automáticas**

```bash
pnpm check && pnpm test && pnpm test:e2e && pnpm build
```
Las cuatro en verde antes de seguir (`docs/release-checklist.md` §1).

- [ ] **Paso 2: Confirmar que el changelog tiene la sección de la versión a publicar**

```bash
node scripts/changelog-section.mjs 0.2.0
```
Esperado: imprime las viñetas. Si falla, escribirlas antes de taguear.

- [ ] **Paso 3: Crear el tag y empujarlo**

```bash
git tag v0.2.0
git push origin main --tags
```

- [ ] **Paso 4: Mirar el workflow**

En `https://github.com/Hhernanoliva/CopyNotes/actions`. Entre 15 y 30 minutos la primera vez (compila Rust desde cero).

- [ ] **Paso 5: Verificar los archivos del borrador**

Tienen que estar los cuatro:
- `CopyNotes_0.2.0_universal.dmg` — la descarga
- `CopyNotes.app.tar.gz` + `.sig`
- `latest.json`

Si falta el `.dmg`: en la Mac de Hernán ese bundler venía fallando. En un runner limpio no debería, pero si falla igual, sacar `dmg` de `targets` y publicar un `.zip` del `.app`.

- [ ] **Paso 6: ⚠️ Verificar que las novedades llegaron al `latest.json`**

Descargar el `latest.json` del borrador y mirar el campo `notes`. **Tiene que traer las viñetas del CHANGELOG**, no un texto de relleno ni vacío. Este es el paso que la versión anterior del plan tenía mal; si acá falla, el resto no sirve de nada.

- [ ] **Paso 7: Publicar**

Pasar la release de borrador a publicada. Recién ahí `latest.json` empieza a resolver.

- [ ] **Paso 8: Instalar y probar en la Mac**

Bajar el `.dmg` **desde el navegador** (no copiarlo del disco: hay que ver qué muestra Gatekeeper) e instalarlo en `/Applications`.

- [ ] Sin certificado, la primera apertura va a decir que la app está dañada: **clic derecho → Abrir**. Anotar el texto exacto que aparece, para la guía.
- [ ] Al abrir, macOS pide la contraseña del Mac por `CopyNotes WebCrypto Master Key`: tocar **"Permitir siempre"**.
- [ ] Entrar a Configuración › Nube y confirmar que **sigue reconociendo la bóveda existente** y que una nota que solo vive en la nube se lee.
- [ ] **El engranaje NO tiene punto** (esta es la última versión).
- [ ] Configuración › Actualizaciones dice **"Tenés la versión 0.2.0. Estás al día."** y el bloque plegado **"Qué trajo tu versión (0.2.0)"** muestra las viñetas.
- [ ] Verificar que el puente de agentes viajó entero:

```bash
ls /Applications/CopyNotes.app/Contents/Resources/mcp/server.js
find /Applications/CopyNotes.app -iname ".ignored_*"
```
Esperado: el primero existe, el segundo no devuelve nada. Después, desde Claude Code, pedir `list_notes`.

---

## Tarea 8: Encender la página de descargas

**Archivos:**
- Modificar: `src/lib/desktop/download.ts:12-21`
- Modificar: `e2e/desktop-prompt.spec.ts`

**Va después de la Tarea 7**, no antes: hasta que la primera release esté publicada, el enlace lleva a una página en blanco.

- [ ] **Paso 1: Ver qué afirman hoy los tests**

```bash
grep -n "toHaveCount(0)\|toBeVisible" e2e/desktop-prompt.spec.ts
```
Esperado: los dos tests actuales afirman el estado **oculto**.

- [ ] **Paso 2: Prender el interruptor**

En `src/lib/desktop/download.ts`, reemplazar el comentario `TODO(descarga)` completo y la constante (líneas 12-21) por:

```ts
// La primera release del .app está publicada (v0.2.0), así que la tarjeta y el
// enlace de Configuración › Agentes vuelven a estar a la vista.
export const DESKTOP_RELEASE_PUBLISHED = true;
```

- [ ] **Paso 3: Restaurar las aserciones del e2e**

> ⚠️ **No hagas `git checkout 8291696^ -- e2e/desktop-prompt.spec.ts`.** La versión vieja usa `page.goto('/')` a pelo, y desde `e2040ff` existe el helper `openApp(page)` que espera a que la app hidrate — es el arreglo del flake "el clic antes de la hidratación no hace nada", que ya volvió a morder una vez. Usá el archivo de acá abajo, que es el viejo **con** el helper.

Reemplazar `e2e/desktop-prompt.spec.ts` entero por:

```ts
import { test, expect } from '@playwright/test';
import { openApp } from './app';

const CARD = '[aria-label="Descargar la app de escritorio"]';
const RELEASES = 'https://github.com/Hhernanoliva/CopyNotes/releases';

test('shows the desktop download card on a mouse device and remembers dismissal', async ({
	page
}) => {
	await openApp(page);
	const card = page.locator(CARD);
	await expect(card).toBeVisible();
	await expect(card.getByText('¿Usás agentes de IA?')).toBeVisible();

	await expect(card.getByRole('link', { name: 'Descargar' })).toHaveAttribute('href', RELEASES);

	// The old PWA install card must stay gone.
	await expect(page.getByText('Instalá CopyNotes')).toHaveCount(0);

	await card.getByRole('button', { name: 'Ahora no' }).click();
	await expect(card).toBeHidden();

	await page.reload();
	await expect(page.locator(CARD)).toHaveCount(0);
});

test('stays hidden on a touch-only device', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		isMobile: true,
		viewport: { width: 390, height: 844 }
	});
	const page = await context.newPage();
	await openApp(page);
	await expect(page.locator(CARD)).toHaveCount(0);
	await context.close();
});

test('settings offers the download link on the web', async ({ page }) => {
	await openApp(page);
	await page.locator(CARD).getByRole('button', { name: 'Ahora no' }).click();
	await page.getByRole('button', { name: /configuraci/i }).click();
	const link = page.getByRole('link', { name: 'Descargar la app de escritorio' });
	await expect(link).toBeVisible();
	await expect(link).toHaveAttribute('href', RELEASES);
});
```

- [ ] **Paso 4: Correr el e2e**

```bash
pnpm test:e2e -- desktop-prompt
```
Esperado: en verde. Si algo falla de forma intermitente, revisar primero si es el patrón de "clic antes de la hidratación", no un bug nuevo.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/desktop/download.ts e2e/desktop-prompt.spec.ts
git commit -m "feat(web): mostrar la descarga de escritorio ahora que hay release publicada"
```

---

## Tarea 9: Probar el aviso de verdad (v0.2.0 → v0.2.1) — GATE MANUAL

**Es el único momento en que se puede comprobar que el aviso funciona:** hace falta una segunda versión publicada.

- [ ] **Paso 1: Escribir las novedades y publicar la versión siguiente**

En `CHANGELOG.md`, agregar arriba de todo:

```markdown
## 0.2.1

- Prueba del aviso de versión nueva
```

y después:

```bash
# Cambiar "version" a 0.2.1 en package.json (única fuente — Tarea 1)
git add package.json CHANGELOG.md
git commit -m "chore: versión 0.2.1"
git tag v0.2.1
git push origin main --tags
```
Esperar el workflow, verificar el `notes` del `latest.json`, y publicar la release.

- [ ] **Paso 2: Reabrir CopyNotes 0.2.0 — el punto**

- [ ] Aparece **un punto sobre el engranaje** en la barra de arriba.
- [ ] El tooltip dice **"Configuración — hay una versión nueva"**.
- [ ] El punto **no mueve los otros íconos** de lugar.

- [ ] **Paso 3: Abrir Configuración › Actualizaciones**

- [ ] Dice **"Tenés la versión 0.2.0."** (la instalada, no la nueva — esto fue un bug del plan y hay que verificarlo a ojo).
- [ ] Dice **"0.2.1 ya está disponible"** con la viñeta que escribiste en el CHANGELOG.
- [ ] El bloque plegado dice **"Qué trajo tu versión (0.2.0)"** con las viñetas de 0.2.0.
- [ ] Está el botón **Descargar** y el aviso sobre la contraseña del Mac.

- [ ] **Paso 4: Que el botón abra la página**

Tocar **Descargar**: se abre el navegador del sistema en la página de la release.

- [ ] **Paso 5: Instalar la 0.2.1 y verificar que no se perdió nada**

- [ ] La nota que escribiste en la 0.2.0 está entera.
- [ ] El tamaño de texto sigue como lo dejaste.
- [ ] La sesión de la nube sigue iniciada — no pide entrar de nuevo.
- [ ] Apareció el cartel de la contraseña **una vez** → "Permitir siempre" → la bóveda se sigue leyendo.
- [ ] El agente responde desde Claude Code **sin reconfigurar nada**.
- [ ] **El punto del engranaje desapareció**, dice "Tenés la versión 0.2.1. Estás al día." y el bloque plegado ahora muestra **las novedades de 0.2.1**.

- [ ] **Paso 6: Probar sin internet**

Modo avión → abrir la app. **Sin punto en el engranaje**, sin cartel de novedad, sin error — y el bloque **"Qué trajo tu versión" tiene que seguir funcionando**, porque viene adentro de la app.

- [ ] **Paso 7: Dejar escrito el ritual**

Agregar una sección **"5. Publicar una versión de escritorio"** a `docs/release-checklist.md`: comprobar que `CHANGELOG.md` tiene la sección de la versión (`node scripts/changelog-section.mjs X.Y.Z`), subir `version` en `package.json`, tag `vX.Y.Z`, empujar, esperar el workflow, **verificar el campo `notes` del `latest.json`**, probar el borrador, publicar.

```bash
git add docs/release-checklist.md
git commit -m "docs: cómo publicar una versión de escritorio"
```

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Cómo se cubre |
|---|---|---|---|
| Se publica una versión sin novedades escritas | Media | Medio — todos ven un cartel sin texto | `scripts/changelog-section.mjs` **corta el build** si la sección no existe. Falla antes de publicar, no después. |
| Alguien deniega el cartel del llavero | Media | Medio — la nube deja de sincronizar en ese aparato | El aviso en el propio cartel, antes de que pase. **No es pérdida de datos**: `accountHasVault` impide crear una bóveda rival. |
| El punto pasa desapercibido igual | Baja | Medio | Mismo lenguaje visual que el punto de estado de datos, que ya funciona. Si pasara, el escalón siguiente es un toast al arrancar — pero eso interrumpe. |
| Se pierde `copynotes-updater.key` | Baja | Medio | Copia en el gestor de contraseñas **además** de GitHub Secrets. |
| Se publica una versión rota | Media | Bajo — nadie se actualiza solo | `releaseDraft: true` + probar antes de publicar. Con instalación manual, una versión rota no llega a nadie que no la haya buscado. |
| El `node_modules` plano no se rehizo | Media | Alto — el `.app` publicado tiene el puente de agentes roto | Paso propio del workflow. Verificación de `.ignored_*` en el gate. |
| El `?raw` del CHANGELOG no resuelve | Baja | Medio — se pierde el bloque "qué trajo tu versión" | Se comprueba con `grep` sobre el build en la Tarea 5, paso 4. |
| La gente no actualiza nunca | Media | Bajo hoy | Costo aceptado de darle el control al usuario. |

---

## Lo que NO entra

- **Actualización automática.** La app no se reemplaza a sí misma. Por eso `tauri-plugin-process` no se instala.
- **Un toast al arrancar.** Interrumpe, y el punto en la barra cubre lo mismo sin tapar nada. Es el escalón siguiente si el punto resultara invisible.
- **Historial completo de versiones en la app.** Se muestra la instalada y, si la hay, la nueva. Quien quiera todo tiene `CHANGELOG.md` en GitHub.
- **Windows y Linux.** El workflow es solo macOS.
- **Certificado y notarización de Apple.** Diferido — ver abajo.
- **Generar el changelog desde los commits.** Los mensajes de commit son técnicos y en otro registro; esto lo lee gente que usa la app.
- **"Recordarme en X días" / descartar el punto.** El punto se va solo al instalar. Silenciarlo es estado que hay que guardar, migrar y testear, para una molestia que todavía nadie tuvo.

---

## Qué destraba el certificado de Apple (USD 99/año), cuando llegue

No hay que rehacer nada de este plan; se suma.

1. **Se va el "CopyNotes está dañada"** de la primera descarga.
2. **Se va el cartel de la contraseña del Mac**, para siempre — y con él, el párrafo de advertencia de la Tarea 5.
3. **Recién ahí conviene el auto-update de verdad**, porque el único motivo por el que hoy no conviene es ese cartel apareciendo sin que nadie lo espere. El cambio sería: instalar `tauri-plugin-process`, agregar el permiso `process:allow-restart`, y una función que llame `settlePendingWrites()` → `writeAgentExport()` → `downloadAndInstall()` → `relaunch()`, **abortando si `settlePendingWrites()` devuelve `false`** (`relaunch()` no dispara `onCloseRequested`, así que la barrera de `TauriLifecycle.svelte` no cubre ese camino).

En CI son dos cambios: el paso que importa el `.p12` y las variables `APPLE_*` en `tauri-action`.

---

## Resumen para decidir

| | |
|---|---|
| **Costo en dinero** | $0. GitHub Releases y Actions gratis con repo público. |
| **Costo en tiempo** | 3-4 horas de construcción + 1-2 horas de gates manuales. |
| **Costo por versión nueva** | Las viñetas ya están escritas (una por commit). Subir el número, tag, esperar 20 min, verificar, publicar. |
| **Dónde se escriben las novedades** | `CHANGELOG.md`, en el mismo commit que la funcionalidad. |
| **Dónde las ve el usuario** | Antes de actualizar: el cartel de la versión nueva. Después: el bloque "Qué trajo tu versión", que anda sin internet. |
| **Lo que queda abierto** | El certificado, cuando la incomodidad de la primera instalación pese más que USD 99. |
