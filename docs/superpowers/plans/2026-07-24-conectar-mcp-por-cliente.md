# Conectar el MCP por cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el bloque genérico "Conectar un agente (MCP)" de Ajustes › Agentes por tres configuraciones por cliente (Claude Code / OpenCode / Cursor) con la ruta del server ya rellenada, un deeplink de un clic para Cursor, el aviso "mantené la app abierta", y una señal "un agente se conectó" — más empaquetar el server MCP dentro de la app.

**Architecture:** El server MCP ya existe (`mcp/`, hito M4). Este trabajo (1) agrega un comando Rust `bridge_server_path` que resuelve la ruta del `server.js` (empaquetado o dev), espejado en `tauri.ts` como `getServerPath()`; (2) un módulo puro `src/lib/bridge/mcp-config.js` que arma los strings de config por cliente + el deeplink base64 de Cursor, con tests sin DOM; (3) reescribe la UI de `SettingsDialog.svelte` en tres sub-bloques; (4) una señal de vida: `server.js` escribe un heartbeat en el buzón y un comando Rust `bridge_read_status` lo lee; (5) empaqueta `mcp/` como recurso Tauri con un `node_modules` plano.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tauri 2 (Rust), Node MCP server (`@modelcontextprotocol/sdk@1.29.0`), vitest, Playwright.

## Global Constraints

- **Clientes objetivo:** Claude Code (CLI), OpenCode, Cursor. NO Claude Desktop (nada de `.mcpb`).
- **La ruta del server la rellena CopyNotes** — el usuario nunca la ve ni la edita.
- **Copiar-pegar a prueba de balas** para los tres; única excepción de "un clic": el deeplink oficial de Cursor.
- **Distribución:** server empaquetado dentro de la app (Tauri resource). Nada de npm/npx.
- **Desktop-only:** todo el bloque nuevo va bajo `{#if isTauriRuntime()}` → `{#if mailboxPath && serverPath}`. Off-desktop = la línea muted de hoy ("La conexión con agentes está disponible solo en la app de escritorio.").
- **Rutas con espacios:** el buzón vive en `~/Library/Application Support/com.copynotes.app/mailbox` (tiene un espacio). El comando de shell de Claude Code DEBE citar con comillas dobles las rutas (`CN_MAILBOX` y `server.js`). Los JSON no necesitan comillas extra (JSON.stringify escapa).
- **Código a mano = JavaScript plano** dentro de `.ts`/`.svelte` (sin anotaciones de tipo). El código vendored de shadcn/tauri conserva sus tipos.
- **Docs en el mismo commit:** todo cambio visible para el usuario se documenta en `docs/guia/17-agentes.md` en el MISMO commit que lo implementa, y se actualiza la fecha del índice `docs/guia-de-uso.md`.
- **Toolchain:** cargo NO está en el PATH por defecto — está en `~/.cargo/bin/cargo`. Antes de `cargo check`: `export PATH="$HOME/.cargo/bin:$PATH"`. Correr tests enfocados de vitest: `npx vitest run <archivo>` (NO `pnpm test:unit -- --run`, que corre toda la suite por un quirk de pnpm).

---

## File Structure

- **Create** `src/lib/bridge/mcp-config.js` — builders puros: `claudeCodeCommand`, `openCodeConfig`, `cursorConfig`, `cursorDeeplink`. Sin DOM, sin Tauri. Consumido por `SettingsDialog.svelte`.
- **Create** `src/lib/bridge/mcp-config.test.js` — tests de los builders.
- **Modify** `src-tauri/src/bridge.rs` — agregar `bridge_server_path` y `bridge_read_status`.
- **Modify** `src-tauri/src/lib.rs` — registrar los dos comandos nuevos en `generate_handler!`.
- **Modify** `src/lib/bridge/tauri.ts` — agregar `getServerPath()` y `getAgentStatus()`.
- **Create** `src/lib/bridge/tauri.test.js` — tests off-desktop null (si no existe ya).
- **Modify** `src/lib/components/SettingsDialog.svelte` — reescribir el bloque MCP en tres sub-bloques + aviso + señal.
- **Modify** `mcp/lib/mailbox.js` — agregar `touchAgentStatus()`.
- **Create** `mcp/lib/mailbox.test.js` (o extender el existente) — test de `touchAgentStatus`.
- **Modify** `mcp/server.js` — llamar `touchAgentStatus()` al conectar y en cada tool call.
- **Modify** `src-tauri/tauri.conf.json` — `bundle.resources` con `mcp/`.
- **Modify** `docs/guia/17-agentes.md` + `docs/guia-de-uso.md` — pasos por cliente + señal + fecha.
- **Modify** `e2e/agent-visibility.spec.ts` (o el que cubra Ajustes) — off-desktop muestra la línea muted.

---

## Task 1: Comando Rust `bridge_server_path`

**Files:**
- Modify: `src-tauri/src/bridge.rs` (agregar comando al final, junto a los otros)
- Modify: `src-tauri/src/lib.rs:6-10` (registrar en `generate_handler!`)

**Interfaces:**
- Produces: `#[tauri::command] bridge_server_path(app) -> Result<String, String>` — devuelve la ruta absoluta a `mcp/server.js` (empaquetado si existe, si no el del repo en dev).

- [ ] **Step 1: Escribir el comando en `bridge.rs`**

Agregar al final de `src-tauri/src/bridge.rs` (usa `app.path().resource_dir()` — `Manager` ya está importado arriba):

```rust
// Resolves the packaged MCP server's absolute path so the app can pre-fill it
// in the per-client MCP config shown in Settings. In a bundled app the server
// lives under the resource dir; in `tauri dev` it lives in the repo at
// ../mcp/server.js relative to this crate. Prefer the packaged copy; fall back
// to the dev path only when the resource is absent.
#[tauri::command]
pub fn bridge_server_path(app: tauri::AppHandle) -> Result<String, String> {
    if let Ok(res) = app.path().resource_dir() {
        let bundled = res.join("mcp/server.js");
        if bundled.exists() {
            return Ok(bundled.to_string_lossy().to_string());
        }
    }
    let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../mcp/server.js");
    Ok(dev.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Registrar en `lib.rs`**

En `src-tauri/src/lib.rs`, dentro de `tauri::generate_handler![ ... ]`, agregar la línea (después de `bridge::bridge_write_outbox`):

```rust
      bridge::bridge_write_outbox,
      bridge::bridge_server_path
```

- [ ] **Step 3: Compilar**

Run:
```bash
export PATH="$HOME/.cargo/bin:$PATH" && cargo check --manifest-path src-tauri/Cargo.toml
```
Expected: `Finished` sin errores (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/bridge.rs src-tauri/src/lib.rs
git commit -m "feat(bridge): comando bridge_server_path (ruta del server MCP empaquetado/dev)"
```

---

## Task 2: `getServerPath()` en el puente JS

**Files:**
- Modify: `src/lib/bridge/tauri.ts` (agregar export, espejando `getMailboxPath`)
- Test: `src/lib/bridge/tauri.test.js` (crear si no existe; si existe, agregar caso)

**Interfaces:**
- Consumes: `bridge_server_path` (Task 1).
- Produces: `getServerPath(): Promise<string|null>` — ruta del server, `null` off-desktop. `getAgentStatus` se agrega en Task 6.

- [ ] **Step 1: Escribir el test off-desktop**

Crear `src/lib/bridge/tauri.test.js` (o agregar al existente). `isTauriRuntime` se mockea a `false`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/platform', () => ({ isTauriRuntime: () => false }));

import { getServerPath } from './tauri';

describe('getServerPath (off desktop)', () => {
	it('returns null when not running under Tauri', async () => {
		expect(await getServerPath()).toBe(null);
	});
});
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx vitest run src/lib/bridge/tauri.test.js`
Expected: FAIL — `getServerPath is not a function` / export inexistente.

- [ ] **Step 3: Agregar `getServerPath` en `tauri.ts`**

Después de `getMailboxPath` en `src/lib/bridge/tauri.ts`:

```js
// Returns the packaged MCP server's absolute path so Settings can pre-fill it
// in each client's config. null off desktop.
export async function getServerPath() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke('bridge_server_path');
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/lib/bridge/tauri.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridge/tauri.ts src/lib/bridge/tauri.test.js
git commit -m "feat(bridge): getServerPath() espeja getMailboxPath (null off-desktop)"
```

---

## Task 3: Builders de config por cliente (puros)

**Files:**
- Create: `src/lib/bridge/mcp-config.js`
- Test: `src/lib/bridge/mcp-config.test.js`

**Interfaces:**
- Produces:
  - `claudeCodeCommand({ serverPath, mailboxPath }) -> string` — el comando `claude mcp add ...` con rutas citadas.
  - `openCodeConfig({ serverPath, mailboxPath }) -> string` — JSON con 2 espacios de indent, forma `{ mcp: { copynotes: {...} } }`.
  - `cursorConfig({ serverPath, mailboxPath }) -> string` — JSON con 2 espacios, forma `{ mcpServers: { copynotes: {...} } }`.
  - `cursorServerObject({ serverPath, mailboxPath }) -> object` — el objeto `{ command, args, env }` (base del deeplink y del JSON de Cursor).
  - `cursorDeeplink({ serverPath, mailboxPath }) -> string` — `cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config=<base64>`.
  - `toBase64Utf8(str) -> string` — helper UTF-8 safe.

- [ ] **Step 1: Escribir los tests (fallan)**

Crear `src/lib/bridge/mcp-config.test.js`. Usa una ruta CON espacio para probar el citado (el buzón real tiene "Application Support"):

```js
import { describe, it, expect } from 'vitest';
import {
	claudeCodeCommand,
	openCodeConfig,
	cursorConfig,
	cursorServerObject,
	cursorDeeplink,
	toBase64Utf8
} from './mcp-config';

const paths = {
	serverPath: '/Applications/CopyNotes.app/Contents/Resources/mcp/server.js',
	mailboxPath: '/Users/h/Library/Application Support/com.copynotes.app/mailbox'
};

describe('claudeCodeCommand', () => {
	it('is a single global claude mcp add command with both paths double-quoted', () => {
		const cmd = claudeCodeCommand(paths);
		expect(cmd).toBe(
			'claude mcp add copynotes -s user -e CN_MAILBOX="/Users/h/Library/Application Support/com.copynotes.app/mailbox" -- node "/Applications/CopyNotes.app/Contents/Resources/mcp/server.js"'
		);
	});
});

describe('openCodeConfig', () => {
	it('builds the opencode.json shape with type local and CN_MAILBOX env', () => {
		const parsed = JSON.parse(openCodeConfig(paths));
		expect(parsed).toEqual({
			mcp: {
				copynotes: {
					type: 'local',
					command: ['node', paths.serverPath],
					enabled: true,
					environment: { CN_MAILBOX: paths.mailboxPath }
				}
			}
		});
	});

	it('is pretty-printed with 2-space indent', () => {
		expect(openCodeConfig(paths)).toContain('\n  "mcp"');
	});
});

describe('cursorConfig / cursorServerObject', () => {
	it('builds the ~/.cursor/mcp.json mcpServers shape', () => {
		const parsed = JSON.parse(cursorConfig(paths));
		expect(parsed).toEqual({
			mcpServers: {
				copynotes: {
					command: 'node',
					args: [paths.serverPath],
					env: { CN_MAILBOX: paths.mailboxPath }
				}
			}
		});
	});

	it('cursorServerObject is exactly {command,args,env}', () => {
		expect(cursorServerObject(paths)).toEqual({
			command: 'node',
			args: [paths.serverPath],
			env: { CN_MAILBOX: paths.mailboxPath }
		});
	});
});

describe('cursorDeeplink', () => {
	it('encodes the server object as UTF-8-safe base64 that round-trips', () => {
		const link = cursorDeeplink(paths);
		expect(link.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config=')).toBe(true);
		const b64 = link.split('config=')[1];
		const decoded = JSON.parse(decodeURIComponent(escape(atob(b64))));
		expect(decoded).toEqual(cursorServerObject(paths));
	});
});

describe('toBase64Utf8', () => {
	it('survives non-ASCII (accents/ñ) round-trip', () => {
		const s = 'ñandú café';
		expect(decodeURIComponent(escape(atob(toBase64Utf8(s))))).toBe(s);
	});
});
```

- [ ] **Step 2: Correr — deben fallar**

Run: `npx vitest run src/lib/bridge/mcp-config.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `mcp-config.js`**

Crear `src/lib/bridge/mcp-config.js`:

```js
// Pure builders for the per-client MCP config strings shown in Settings >
// Agentes. No DOM, no Tauri — given { serverPath, mailboxPath } they return the
// exact command / JSON / deeplink each client expects. See the design spec
// 2026-07-24-conectar-mcp-por-cliente-design.md for the confirmed 2026 formats.

// UTF-8-safe base64 (btoa alone throws on non-Latin1). Mirror decode:
// decodeURIComponent(escape(atob(b64))).
export function toBase64Utf8(str) {
	return btoa(unescape(encodeURIComponent(str)));
}

// Claude Code: one global command. Paths are double-quoted so a space in the
// mailbox path ("Application Support") doesn't split the shell argument.
export function claudeCodeCommand({ serverPath, mailboxPath }) {
	return `claude mcp add copynotes -s user -e CN_MAILBOX="${mailboxPath}" -- node "${serverPath}"`;
}

export function openCodeConfig({ serverPath, mailboxPath }) {
	return JSON.stringify(
		{
			mcp: {
				copynotes: {
					type: 'local',
					command: ['node', serverPath],
					enabled: true,
					environment: { CN_MAILBOX: mailboxPath }
				}
			}
		},
		null,
		2
	);
}

// The bare server object both the Cursor JSON and the deeplink are built from.
export function cursorServerObject({ serverPath, mailboxPath }) {
	return {
		command: 'node',
		args: [serverPath],
		env: { CN_MAILBOX: mailboxPath }
	};
}

export function cursorConfig(paths) {
	return JSON.stringify({ mcpServers: { copynotes: cursorServerObject(paths) } }, null, 2);
}

export function cursorDeeplink(paths) {
	const config = toBase64Utf8(JSON.stringify(cursorServerObject(paths)));
	return `cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config=${config}`;
}
```

- [ ] **Step 4: Correr — deben pasar**

Run: `npx vitest run src/lib/bridge/mcp-config.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridge/mcp-config.js src/lib/bridge/mcp-config.test.js
git commit -m "feat(mcp): builders puros de config por cliente (Claude Code/OpenCode/Cursor + deeplink)"
```

---

## Task 4: UI por cliente en Ajustes › Agentes + guía

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte` (reemplazar el bloque MCP, líneas ~42-58 del `<script>` y ~253-320 del template)
- Modify: `docs/guia/17-agentes.md` (sección "Conectar un agente por MCP") — MISMO commit
- Modify: `docs/guia-de-uso.md` (fecha "Última actualización") — MISMO commit

**Interfaces:**
- Consumes: `getServerPath` (Task 2), `getMailboxPath` (ya), los builders de `mcp-config.js` (Task 3).
- Produces: bloque de UI reescrito. (La señal de Task 6 se agrega arriba de estos sub-bloques después.)

- [ ] **Step 1: `<script>` — importar builders + serverPath + derivados**

En `src/lib/components/SettingsDialog.svelte`, agregar al import de tauri:

```js
	import { getMailboxPath, getServerPath } from '$lib/bridge/tauri';
	import {
		claudeCodeCommand,
		openCodeConfig,
		cursorConfig,
		cursorDeeplink
	} from '$lib/bridge/mcp-config';
```

Agregar el estado y cargarlo en el `$effect` de apertura (junto a `mailboxPath`):

```js
	let serverPath = $state(null);
```

Dentro del `$effect(() => { if (!open) return; ... })`, junto al `getMailboxPath()`:

```js
		if (isTauriRuntime()) {
			getMailboxPath()
				.then((p) => (mailboxPath = p))
				.catch((error) => console.error('No se pudo obtener la carpeta del buzón', error));
			getServerPath()
				.then((p) => (serverPath = p))
				.catch((error) => console.error('No se pudo obtener la ruta del server MCP', error));
		}
```

Reemplazar el `$derived mcpConfig` (líneas ~42-58) por los cuatro derivados nuevos (guard `mailboxPath && serverPath`):

```js
	const paths = $derived(mailboxPath && serverPath ? { serverPath, mailboxPath } : null);
	const claudeCmd = $derived(paths ? claudeCodeCommand(paths) : '');
	const openCodeJson = $derived(paths ? openCodeConfig(paths) : '');
	const cursorJson = $derived(paths ? cursorConfig(paths) : '');
	const cursorLink = $derived(paths ? cursorDeeplink(paths) : '');
```

Reemplazar `copiedField` por un campo más granular y una función de copia genérica. Cambiar el estado inicial y las funciones `copyMailboxPath`/`copyMcpConfig`:

```js
	let copiedField = $state(null); // 'path' | 'claude' | 'opencode' | 'cursor' | null

	async function copyText(text, field) {
		if (!text) return;
		await navigator.clipboard.writeText(text);
		flashCopied(field);
	}
```

Borrar `copyMcpConfig` (ya no se usa). `copyMailboxPath` puede quedar o reemplazarse por `copyText(mailboxPath, 'path')`.

- [ ] **Step 2: Template — reemplazar el bloque de sub-bloques**

Reemplazar TODO el interior de `{#if mailboxPath}` (líneas ~254-315) por: aviso "app abierta" arriba, buzón (igual que hoy), y tres sub-bloques. Guard exterior pasa a `{#if mailboxPath && serverPath}`:

```svelte
			{#if isTauriRuntime()}
				{#if mailboxPath && serverPath}
					<div class="border-border flex flex-col gap-4 border-t pt-3">
						<div class="flex flex-col gap-0.5">
							<h4 class="text-sm font-bold">Conectar un agente (MCP)</h4>
							<p class="text-muted-foreground text-xs">
								El agente solo funciona con CopyNotes abierta.
							</p>
						</div>

						<!-- Buzón (informativo) -->
						<div class="flex flex-col gap-1">
							<span class="text-muted-foreground text-sm">Carpeta del buzón:</span>
							<div class="flex items-center gap-2">
								<code
									class="bg-muted text-foreground border-border min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs break-all"
									>{mailboxPath}</code
								>
								<button
									type="button"
									aria-label="Copiar carpeta del buzón"
									onclick={() => copyText(mailboxPath, 'path')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'path'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<!-- Claude Code -->
						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">Claude Code</span>
							<span class="text-muted-foreground text-xs">Pegá este comando en tu terminal una vez.</span>
							<div class="relative">
								<pre class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code>{claudeCmd}</code></pre>
								<button
									type="button"
									aria-label="Copiar comando de Claude Code"
									onclick={() => copyText(claudeCmd, 'claude')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'claude'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<!-- OpenCode -->
						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">OpenCode</span>
							<span class="text-muted-foreground text-xs">Pegá esto en <code class="font-mono">~/.config/opencode/opencode.json</code>.</span>
							<div class="relative">
								<pre class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code>{openCodeJson}</code></pre>
								<button
									type="button"
									aria-label="Copiar configuración de OpenCode"
									onclick={() => copyText(openCodeJson, 'opencode')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'opencode'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<!-- Cursor -->
						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">Cursor</span>
							<span class="text-muted-foreground text-xs">Un clic para agregarlo, o pegá el JSON en <code class="font-mono">~/.cursor/mcp.json</code>.</span>
							<a
								href={cursorLink}
								class="cn-tap bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
							>
								Añadir a Cursor
							</a>
							<div class="relative mt-1">
								<pre class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code>{cursorJson}</code></pre>
								<button
									type="button"
									aria-label="Copiar configuración de Cursor"
									onclick={() => copyText(cursorJson, 'cursor')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'cursor'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<p class="text-muted-foreground text-xs">Más detalles en la guía (tema 17).</p>
					</div>
				{/if}
			{:else}
				<p class="text-muted-foreground border-border border-t pt-3 text-sm">
					La conexión con agentes está disponible solo en la app de escritorio.
				</p>
			{/if}
```

- [ ] **Step 3: Reescribir la guía (MISMO commit)**

En `docs/guia/17-agentes.md`, reemplazar la sección "Conectar un agente por MCP" por pasos por cliente. Contenido (plain Spanish, sin jerga):

```markdown
## Conectar un agente por MCP

CopyNotes trae adentro el "server" que deja que un agente lea tus tareas
visibles y te ayude. Solo tenés que decirle a tu agente dónde está. En
**Ajustes › Agentes** vas a ver tres opciones ya listas con tus rutas puestas
— elegí la del programa que uses:

- **Claude Code:** copiá el comando y pegalo en tu terminal una sola vez.
- **OpenCode:** copiá el bloque y pegalo en tu archivo `opencode.json`.
- **Cursor:** tocá **"Añadir a Cursor"** (se abre Cursor y lo agrega solo). Si
  preferís, también podés copiar el JSON y pegarlo a mano.

**Importante:** el agente solo funciona con **CopyNotes abierta**. Si la cerrás,
deja de leer y escribir hasta que la vuelvas a abrir.

Cuando un agente se conecta, arriba de esas opciones vas a ver
**"Un agente se conectó"** con hace cuánto lo hizo. Si todavía no conectaste
ninguno, dice "Ningún agente conectado todavía".
```

(Ajustar el encabezado exacto al que ya exista en el archivo.)

- [ ] **Step 4: Fecha del índice (MISMO commit)**

En `docs/guia-de-uso.md`, actualizar la línea "Última actualización" a `2026-07-24`.

- [ ] **Step 5: Verificar off-desktop (e2e) + build web**

Run:
```bash
pnpm build
npx playwright test e2e/agent-visibility.spec.ts
```
Expected: PASS. En navegador la sección sigue mostrando la línea muted (sin sub-bloques). Si el spec no cubre Ajustes, agregar/ajustar un caso que abra Ajustes y afirme el texto "La conexión con agentes está disponible solo en la app de escritorio." y la ausencia de "Claude Code".

- [ ] **Step 6: Chequeo de tipos + toda la suite unit**

Run:
```bash
pnpm check
npx vitest run
```
Expected: 0 errores nuevos de svelte-check (los pre-existentes de `db.migrations.test.ts` pueden quedar); unit verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte docs/guia/17-agentes.md docs/guia-de-uso.md e2e/agent-visibility.spec.ts
git commit -m "feat(agentes): config MCP por cliente (Claude Code/OpenCode/Cursor + deeplink) + guía"
```

---

## Task 5: Heartbeat del server + comando Rust `bridge_read_status`

**Files:**
- Modify: `mcp/lib/mailbox.js` (agregar `touchAgentStatus`)
- Test: `mcp/lib/mailbox.test.js` (crear/extender)
- Modify: `mcp/server.js` (llamar `touchAgentStatus` al conectar y en cada tool call)
- Modify: `src-tauri/src/bridge.rs` (agregar `bridge_read_status`)
- Modify: `src-tauri/src/lib.rs` (registrar)

**Interfaces:**
- Produces:
  - `touchAgentStatus(): Promise<void>` — escribe `<CN_MAILBOX>/agent-status.json` = `{ lastSeen: <ISO> }` de forma atómica (tmp+rename). Fuera de `inbox/` → NO pasa por el gate de ingesta.
  - `#[tauri::command] bridge_read_status(app) -> Result<Option<String>, String>` — devuelve el texto crudo de `agent-status.json`, o `None` si no existe.

- [ ] **Step 1: Test de `touchAgentStatus` (falla)**

Crear/extender `mcp/lib/mailbox.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { touchAgentStatus } from './mailbox.js';

let dir;
beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'cn-mailbox-'));
	process.env.CN_MAILBOX = dir;
});
afterEach(async () => {
	delete process.env.CN_MAILBOX;
	await rm(dir, { recursive: true, force: true });
});

describe('touchAgentStatus', () => {
	it('writes agent-status.json with an ISO lastSeen at the mailbox root', async () => {
		await touchAgentStatus();
		const raw = await readFile(path.join(dir, 'agent-status.json'), 'utf8');
		const parsed = JSON.parse(raw);
		expect(typeof parsed.lastSeen).toBe('string');
		expect(new Date(parsed.lastSeen).toString()).not.toBe('Invalid Date');
	});

	it('leaves no .tmp file behind (atomic write)', async () => {
		const { readdir } = await import('node:fs/promises');
		await touchAgentStatus();
		const files = await readdir(dir);
		expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
		expect(files).toContain('agent-status.json');
	});
});
```

- [ ] **Step 2: Correr — falla**

Run: `cd mcp && npx vitest run lib/mailbox.test.js`
Expected: FAIL — `touchAgentStatus` no existe.

- [ ] **Step 3: Implementar `touchAgentStatus` en `mailbox.js`**

Agregar en `mcp/lib/mailbox.js` (reusa `mailboxDir`, `writeFile`, `rename`, `path`, `randomUUID` ya importados):

```js
/**
 * Heartbeat: writes <mailbox>/agent-status.json = { lastSeen } atomically
 * (tmp+rename). Lives at the mailbox ROOT, not inbox/, so the app's file
 * watcher never treats it as a change — it's a liveness signal, not a request.
 * Called on connect and on every tool call so the app can show "connected —
 * X ago". Failures are swallowed: a heartbeat write must never break a tool.
 */
export async function touchAgentStatus() {
	try {
		const dir = mailboxDir();
		const target = path.join(dir, 'agent-status.json');
		const tmp = path.join(dir, `agent-status.${randomUUID()}.tmp`);
		await writeFile(tmp, JSON.stringify({ lastSeen: new Date().toISOString() }));
		await rename(tmp, target);
	} catch {
		// best-effort liveness signal
	}
}
```

- [ ] **Step 4: Correr — pasa**

Run: `cd mcp && npx vitest run lib/mailbox.test.js`
Expected: PASS.

- [ ] **Step 5: Llamar el heartbeat en `server.js`**

En `mcp/server.js`: importar `touchAgentStatus` y envolver `submitChange` para que cada tool call refresque el heartbeat; y latir una vez al conectar.

Cambiar el import:
```js
import { readExport, submitChange, touchAgentStatus } from './lib/mailbox.js';
```

Antes de los `registerTool`, definir un submit que late:
```js
// Refresh the liveness heartbeat on every tool call so Settings can show how
// long ago an agent was active. Wraps submitChange without changing its result.
const submitWithHeartbeat = async (change) => {
	await touchAgentStatus();
	return submitChange(change);
};
```
y pasar `submitWithHeartbeat` en lugar de `submitChange` a los tres `makeToolHandler(...)`.

Después de `await server.connect(transport);`, latir una vez:
```js
await touchAgentStatus();
```

- [ ] **Step 6: `bridge_read_status` en Rust + registrar**

En `src-tauri/src/bridge.rs`:
```rust
// Reads the MCP server's liveness heartbeat (agent-status.json at the mailbox
// root, written by mcp/lib/mailbox.js). Returns the raw JSON text so the
// webview parses { lastSeen }, or None when no agent has ever connected.
#[tauri::command]
pub fn bridge_read_status(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = mailbox_dir(&app)?;
    let status = dir.join("agent-status.json");
    match fs::read_to_string(&status) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
```
En `src-tauri/src/lib.rs`, agregar a `generate_handler!`:
```rust
      bridge::bridge_server_path,
      bridge::bridge_read_status
```

- [ ] **Step 7: Compilar Rust**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
git add mcp/lib/mailbox.js mcp/lib/mailbox.test.js mcp/server.js src-tauri/src/bridge.rs src-tauri/src/lib.rs
git commit -m "feat(mcp): heartbeat de vida del agente (agent-status.json) + bridge_read_status"
```

---

## Task 6: Señal "un agente se conectó" en la UI

**Files:**
- Modify: `src/lib/bridge/tauri.ts` (agregar `getAgentStatus`)
- Test: `src/lib/bridge/tauri.test.js` (caso off-desktop null)
- Modify: `src/lib/components/SettingsDialog.svelte` (mostrar la señal arriba de los sub-bloques + guía ya cubierta en Task 4)

**Interfaces:**
- Consumes: `bridge_read_status` (Task 5).
- Produces: `getAgentStatus(): Promise<{ lastSeen: string } | null>` — parsea el JSON del heartbeat, `null` off-desktop o si no existe.

- [ ] **Step 1: Test off-desktop (falla)**

Agregar a `src/lib/bridge/tauri.test.js`:

```js
import { getAgentStatus } from './tauri';

describe('getAgentStatus (off desktop)', () => {
	it('returns null when not running under Tauri', async () => {
		expect(await getAgentStatus()).toBe(null);
	});
});
```

- [ ] **Step 2: Correr — falla**

Run: `npx vitest run src/lib/bridge/tauri.test.js`
Expected: FAIL — `getAgentStatus` no existe.

- [ ] **Step 3: Implementar `getAgentStatus` en `tauri.ts`**

```js
// Reads the MCP server's liveness heartbeat so Settings can show "un agente se
// conectó — hace X". Returns { lastSeen } or null (off desktop / never seen).
export async function getAgentStatus() {
	if (!isTauriRuntime()) return null;
	const { invoke } = await import('@tauri-apps/api/core');
	const raw = await invoke('bridge_read_status');
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: Correr — pasa**

Run: `npx vitest run src/lib/bridge/tauri.test.js`
Expected: PASS.

- [ ] **Step 5: Mostrar la señal en `SettingsDialog.svelte`**

En el `<script>`, importar `getAgentStatus` junto a los otros, agregar estado y cargarlo en el `$effect` de apertura:

```js
	let agentStatus = $state(null); // { lastSeen } | null

	// dentro del $effect(() => { if(!open) return; ... }) bajo isTauriRuntime():
			getAgentStatus()
				.then((s) => (agentStatus = s))
				.catch((error) => console.error('No se pudo leer el estado del agente', error));
```

Agregar un formateador relativo simple (si no existe uno reutilizable en el repo; buscar primero en `$lib` un `formatRelative`/"hace"):

```js
	function haceCuanto(iso) {
		const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
		if (s < 60) return 'hace instantes';
		const m = Math.floor(s / 60);
		if (m < 60) return `hace ${m} min`;
		const h = Math.floor(m / 60);
		if (h < 24) return `hace ${h} h`;
		const d = Math.floor(h / 24);
		return `hace ${d} d`;
	}

	const agentSignal = $derived(
		agentStatus?.lastSeen
			? `Un agente se conectó — ${haceCuanto(agentStatus.lastSeen)}`
			: 'Ningún agente conectado todavía'
	);
```

En el template, justo debajo del `<h4>Conectar un agente (MCP)</h4>` + aviso "app abierta", agregar la línea de señal:

```svelte
						<p class="text-muted-foreground text-sm">{agentSignal}</p>
```

- [ ] **Step 6: Chequeos**

Run:
```bash
npx vitest run src/lib/bridge/tauri.test.js
pnpm check
```
Expected: PASS; 0 errores nuevos de svelte-check.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bridge/tauri.ts src/lib/bridge/tauri.test.js src/lib/components/SettingsDialog.svelte
git commit -m "feat(agentes): señal 'un agente se conectó — hace X' en Ajustes"
```

---

## Task 7: Empaquetar `mcp/` como recurso de la app

**Files:**
- Modify: `src-tauri/tauri.conf.json` (`bundle.resources`)
- Create: `mcp/scripts/build-bundle.md` (receta del `node_modules` plano) — o documentar en `mcp/README.md`

**Interfaces:**
- Consumes: `bridge_server_path` (Task 1) resuelve `resource_dir()/mcp/server.js`.
- Produces: un `.app` que contiene `mcp/server.js`, `mcp/lib/`, y un `mcp/node_modules` plano.

**Riesgo #1:** `mcp/node_modules` lo instaló pnpm con symlinks al store `.pnpm`. Tauri copia archivos, no symlinks → hay que producir un `node_modules` **plano** (archivos reales) antes de bundlear.

- [ ] **Step 1: Producir un `node_modules` plano en `mcp/`**

Run (en `mcp/`):
```bash
cd mcp && rm -rf node_modules && pnpm install --config.node-linker=hoisted
```
Expected: `node_modules/` con archivos reales (no symlinks). Verificar:
```bash
find mcp/node_modules/@modelcontextprotocol -maxdepth 1 -type l | head
```
Expected: vacío (sin symlinks). Si `pnpm` deja symlinks igual, alternativa: `cd mcp && npm install --omit=dev` en un checkout limpio del paquete.

- [ ] **Step 2: Declarar los recursos en `tauri.conf.json`**

En `src-tauri/tauri.conf.json`, dentro de `"bundle"`, agregar:
```json
    "resources": {
      "../mcp/server.js": "mcp/server.js",
      "../mcp/lib": "mcp/lib",
      "../mcp/node_modules": "mcp/node_modules"
    },
```
(No incluir `mcp/*.test.js`, `mcp/lib/*.test.js`, lockfiles ni `.DS_Store`. `lib` copia recursivo; los `.test.js` dentro de `lib/` son inertes en runtime — aceptable para beta. Si se quiere excluirlos, mover los tests a `mcp/test/` en un follow-up.)

- [ ] **Step 3: Build del `.app` (GATE manual — Mac de Hernán)**

Run:
```bash
export PATH="$HOME/.cargo/bin:$PATH" && pnpm tauri build
```
Expected: genera el `.app`. Verificar que el server viajó:
```bash
find src-tauri/target -name server.js -path '*Resources/mcp*' | head
```
Expected: una ruta bajo `CopyNotes.app/Contents/Resources/mcp/server.js`.

- [ ] **Step 4: Round-trip real (GATE manual — Hernán)**

Abrir el `.app`, ir a Ajustes › Agentes, copiar la config de Claude Code / tocar "Añadir a Cursor", y confirmar que el agente lista tareas y crea una con CopyNotes abierta. Confirmar que aparece "Un agente se conectó — hace X".

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json mcp/README.md
git commit -m "build(mcp): empaquetar el server MCP como recurso de la app (node_modules plano)"
```

---

## Notas de ejecución

- **Tasks 1-3, 5-6** son verificables sin la Mac (cargo check + vitest + pnpm check). **Task 4** verifica off-desktop con Playwright + build web. **Task 7 Steps 3-4** son GATE manual en la Mac de Hernán (build del `.app` + round-trip real con clientes reales) — consistente con hitos previos ("desktop round-trip = manual").
- **Opción diferida (follow-up, no en este plan):** botón "Abrir carpeta de config" para OpenCode (abre `~/.config/opencode/` en Finder). Requiere `tauri-plugin-opener` + permiso de capability — dependencia nueva; se puede sumar después sin bloquear la feature.

## Self-Review (hecho)

- **Cobertura del spec:** (1) empaquetar server → Task 7; (2) `bridge_server_path` → Task 1 + `getServerPath` Task 2; (3) UI por cliente 3 sub-bloques → Task 4; deeplink Cursor → Task 3 (`cursorDeeplink`) + Task 4 (`<a href>`); (4) aviso "app abierta" → Task 4; (5) señal "un agente se conectó" → Task 5 (heartbeat + Rust) + Task 6 (UI). Pruebas unit (builders) → Task 3; e2e off-desktop → Task 4; guía → Task 4 (mismo commit). El botón "Abrir carpeta" de OpenCode del spec queda como follow-up explícito (dependencia de plugin) — única desviación, anotada.
- **Sin placeholders:** cada step trae el código/comando real.
- **Consistencia de tipos:** `{ serverPath, mailboxPath }` es la firma única de todos los builders; `getServerPath`/`getMailboxPath`/`getAgentStatus` devuelven `Promise<…|null>`; `bridge_read_status` devuelve `Option<String>` y `getAgentStatus` lo parsea a `{ lastSeen }`.
