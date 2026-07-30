# copynotes-mcp

Standalone MCP (Model Context Protocol) server for CopyNotes. It speaks MCP
over **stdio** to a client (Claude Desktop, OpenCode, ...) and relays to the
CopyNotes desktop app through a shared folder on disk (the "buzón" /
mailbox) rather than talking to the app's IndexedDB directly — IndexedDB
lives inside the app's own process and isn't reachable from here.

This package is **isolated** from the rest of the CopyNotes repo: it has its
own `package.json`, its own `pnpm-lock.yaml`, and its own `node_modules`. It
is not part of the SvelteKit build and is not a member of the repo-root pnpm
workspace (see "Isolation" below).

**CopyNotes (the desktop app) must be open** for any round-trip: it's the
process that watches the mailbox's `inbox/` folder, answers into `outbox/`,
and periodically refreshes `export.json`. Without it, tool calls time out
and resource reads only see whatever `export.json` was last written.

## What it exposes

### Resources (v2 — Markdown projection)

One resource per note the user has marked **"Visible para agentes"** in the
app (`copynotes://note/{id}`, listed and read from `lib/resources.js`). Each
resource's content is that note projected as **Markdown** (not JSON — measured
~28% cheaper in chars, more in real tokens):

- The note **title** and its **folder** name.
- The note's **prose as context** (text/bullet/heading/code blocks) — the user
  writes this to tell the agent what the tasks are about.
- Only the **pending tasks** (completed ones are dropped), each with a **short
  id** (8-char prefix — see `lib/ids.js`).

Never projected here: the user's per-block **comment** (`block.note`), completed
tasks, timestamps, long UUIDs, and the **bitácora** — the history is on-demand
via the `get_task_history` tool, the single biggest token save. Privacy model
and measurements: `docs/superpowers/specs/2026-07-25-canal-agente-v2-lectura-md-permisos-design.md`.

Resource reads always re-read the buzón's `export.json`, so they reflect the
app's live state (whatever CopyNotes last wrote there) rather than a cached
snapshot.

### Tools

Ids are the **short ids** the Markdown read shows; the server re-expands them to
full UUIDs (`lib/ids.js` → `expandArgs`) before submitting — a note prefix only
resolves to a note, a task prefix only to a task.

Discovery + read are also exposed as **tools** (not only as resources): most MCP
clients don't feed resources to the model on their own — the user has to attach
them by hand — so a plain prompt like *"open note X and do what it says"* can't
reach a note through the resource alone. `list_notes` + `read_note` make that
flow work everywhere with no hand-holding; `read_note` returns the SAME Markdown
the resource does (same privacy rules, same token cost).

| Tool | Input | Effect |
| --- | --- | --- |
| `list_notes` | `{}` | Lists agent-visible notes (name + short id). **Discovery/disambiguation only** — if the user already named a note, call `read_note`/`create_task` directly (both resolve by name). |
| `read_note` | `{ note }` | Reads a visible note (by short id or name) as Markdown. The note's OWN short id is in the header (id-first, like `list_notes`), so no extra `list_notes` is needed to learn it. |
| `create_task` | `{ noteId, content }` | Creates a todo block. `noteId` accepts a note **name or short id**. Success answer echoes the new task's short id (`Tarea creada: <short>`) so it can be acted on without a re-read. |
| `complete_task` | `{ blockId, summary? }` | Marks a task done (cascades to todo children like the UI); leaves a bitácora trace. |
| `add_note` | `{ blockId, text }` | Appends a note to a task's bitácora (shown amber "IA" under the task in the app). |
| `get_task_history` | `{ blockId }` | Returns a task's bitácora on demand (compact, no UUIDs/timestamps). |

**Shorter trips, fewer duplicates.** Each tool answer is shaped to avoid the next
call: `read_note` carries the note id `create_task` needs; `create_task` returns
the new task id; an ambiguous note name comes back with the candidate ids
(`Rechazado: ambiguo. ¿Cuál? …`) instead of forcing a `list_notes`. On a
`submitChange` timeout the request stays in the buzón and the answer says *not to
resend* — and a resend within a short window reuses the same request id, so the
app's ingest dedupe (`getProcessedChange`) applies it at most once.

Tools don't decide privacy themselves — each one builds a change request and
hands it to `submitChange()` (`lib/mailbox.js`), which writes it to
`inbox/<id>.json` and waits for the app's `outbox/<id>.json` answer. The
app's own ingest gate (`src/lib/bridge/ingest.ts` in the main repo) is the
sole authority: a rejected change comes back as `{ ok:false, reason }`,
surfaced here as an MCP tool error. So a tool call can always fail safely if
the note isn't agent-visible or the request is malformed — the server has no
way to force it through.

## Install

```sh
cd mcp
pnpm install
```

(Only needed once — see "Isolation" below for why this doesn't touch the
repo-root lockfile.)

> **Dev vs Build (importante):** para **desarrollar/testear** usá `pnpm install`
> (el de acá arriba). Para **empaquetar la app** (`pnpm tauri build`) hace falta
> un `node_modules` **plano** distinto — receta completa en
> [§ Empaquetado dentro de la app](#empaquetado-dentro-de-la-app-tauri-resource).
> Correr los tests reinstala en modo dev, así que **siempre rehacé el paso plano
> justo antes de buildear**.

## Run

```sh
CN_MAILBOX=/path/to/mailbox node server.js
```

The mailbox path is shown inside the CopyNotes app itself: **Configuración
› Agentes** (desktop build only) shows the exact folder plus a ready-to-paste
client config. The server logs a one-line "running on stdio" message to
**stderr** on startup — stdout is reserved for the JSON-RPC stream and must
never be written to directly (a stray `console.log` there would corrupt the
protocol).

## Client config

Point an MCP client (Claude Desktop, OpenCode, ...) at this server with its
launcher config, e.g.:

```json
{
  "mcpServers": {
    "copynotes": {
      "command": "node",
      "args": ["<ruta-a-CopyNotes>/mcp/server.js"],
      "env": { "CN_MAILBOX": "<mailbox path>" }
    }
  }
}
```

`<ruta-a-CopyNotes>` is wherever this repo lives on disk; `<mailbox path>` is
the folder shown in Configuración › Agentes.

## Mailbox folder layout

```
<mailbox>/
  export.json        # written by the app: agent-visible tasks + bitácora
  inbox/<id>.json     # written by us: a change request
  outbox/<id>.json    # written by the app: the result of that change
```

`submitChange` writes the inbox file **atomically**: it writes to
`inbox/<id>.json.tmp` first, then renames it to `inbox/<id>.json`. This is
required — the app's Rust-side folder watcher reacts to the first
filesystem "created" event for a new file, so a direct (non-atomic) write
could let the watcher read a half-written, truncated file and discard it.

## Development

```sh
pnpm install --ignore-workspace   # first time only, see "Isolation" below
pnpm test                          # runs the mailbox/resources/tools unit tests via Vitest
node --check server.js             # syntax check (server.js blocks on stdio if actually run)
```

### Isolation from the repo-root pnpm workspace

The CopyNotes repo root has a `pnpm-workspace.yaml`. Without any extra
guard, running `pnpm add`/`pnpm install` inside `mcp/` gets absorbed into
that workspace: pnpm adds an `mcp:` entry to the **root** `pnpm-lock.yaml`
and symlinks `mcp/node_modules/@modelcontextprotocol/sdk` into the root's
pnpm store — which would mean every `pnpm install` here touches the root
lockfile.

To prevent that, `mcp/` has its own `pnpm-workspace.yaml` (empty, just a
marker). pnpm resolves the workspace root by walking up until it finds a
`pnpm-workspace.yaml`, so having one inside `mcp/` makes pnpm stop right
there instead of continuing up to the repo root — `mcp/` becomes its own
workspace root with its own lockfile and store. `pnpm test`, `pnpm ls`,
etc. run correctly from inside `mcp/` without any extra flags. The
`--ignore-workspace` flag above is only a first-time belt-and-suspenders
note for anyone who deletes `mcp/pnpm-workspace.yaml` by mistake before
running install.

## Installed SDK version

`@modelcontextprotocol/sdk@1.29.0` (verified against the installed
package's `exports` map and `dist/esm` output — see
`.superpowers/sdd/task-M1-report.md` for the full verification notes).
Real import paths used, confirmed to exist in the installed `dist/esm`
output:

- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`, `ResourceTemplate`
- `@modelcontextprotocol/sdk/server/stdio.js` → `StdioServerTransport`

`zod@4.4.3` is installed alongside the SDK because tool/resource schema
registration (`registerTool`/`registerResource`) requires it as a peer
dependency.

## Empaquetado dentro de la app (Tauri resource)

El server MCP viaja **dentro** del `.app` como recurso Tauri — no se publica en
npm. `src-tauri/tauri.conf.json` declara en `bundle.resources`:

```json
"resources": {
  "../mcp/server.js": "mcp/server.js",
  "../mcp/lib": "mcp/lib",
  "../mcp/node_modules": "mcp/node_modules"
}
```

En runtime el comando Rust `bridge_server_path` resuelve
`resource_dir()/mcp/server.js` (o, en `tauri dev`, el `../mcp/server.js` del
repo). La app rellena esa ruta en Ajustes › Agentes.

### Riesgo: `node_modules` con symlinks

`pnpm install` deja `mcp/node_modules` con **symlinks** al store `.pnpm`. Tauri
copia archivos, no symlinks → hay que producir un `node_modules` **plano** antes
de bundlear. Paso de build (GATE manual, en la Mac):

```bash
# 1) node_modules plano y solo de producción (deja zod, quita vitest):
#    usá SIEMPRE el script (no el comando pnpm suelto a mano): instalar el
#    modo plano ENCIMA de un node_modules de dev (symlinks) deja zod y
#    @modelcontextprotocol/sdk metidos en carpetas ".ignored_zod" /
#    ".ignored_sdk" en vez de "zod" / "sdk" — el import falla en runtime
#    (ERR_MODULE_NOT_FOUND) aunque el paquete esté físicamente ahí. El
#    script hace el rm -rf primero para que esto no dependa de acordarse.
#    Repro'd 2026-07-29.
cd mcp && pnpm run build:flat && cd ..
# 2) build del .app (mcp/ viaja en los recursos):
export PATH="$HOME/.cargo/bin:$PATH" && pnpm tauri build
# 3) verificar que el server viajó y que ningún paquete quedó ".ignored_*":
find src-tauri/target -name server.js -path '*Resources/mcp*' | head
find src-tauri/target -iname '.ignored_*' -path '*Resources/mcp*'
```

Para volver al entorno de desarrollo (recuperar vitest y los symlinks):

```bash
cd mcp && pnpm install
```

> Nota: los `*.test.js` dentro de `lib/` viajan en el bundle pero son inertes en
> runtime (nadie los importa). Excluirlos moviéndolos a `mcp/test/` es un
> follow-up de limpieza, no bloqueante para la beta.
