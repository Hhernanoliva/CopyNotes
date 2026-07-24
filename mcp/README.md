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

### Resources

One resource per note the user has marked **"Visible para agentes"** in the
app (`copynotes://note/{id}`, listed and read from `lib/resources.js`). Each
resource's content is that note's **tasks** (todo blocks) plus their
**bitácora** (an activity trail: who created/completed/reopened/noted each
task, and when). The app never exposes anything else from the note — no
prose, no other block types.

Resource reads always re-read the buzón's `export.json`, so they reflect the
app's live state (whatever CopyNotes last wrote there) rather than a cached
snapshot.

### Tools

| Tool | Input | Effect |
| --- | --- | --- |
| `create_task` | `{ noteId, content }` | Creates a new todo block in the given note. |
| `complete_task` | `{ blockId, summary? }` | Marks a task done; leaves a bitácora trace. |
| `add_note` | `{ blockId, text }` | Appends a note to a task's bitácora. |

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
