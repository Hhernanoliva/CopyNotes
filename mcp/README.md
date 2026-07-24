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

## What it does (current milestone: M1 — scaffold)

- `lib/mailbox.js` — the buzón client:
  - `readExport()` reads `<mailbox>/export.json` (agent-visible tasks +
    bitácora, written by the CopyNotes desktop app). Returns `{ notes: [] }`
    if the file is missing or unreadable.
  - `submitChange(change)` writes a change request to
    `<mailbox>/inbox/<id>.json` (atomically — see below) and polls
    `<mailbox>/outbox/<id>.json` for the app's result, up to a timeout.
- `server.js` — connects an MCP server to stdio. Does not yet expose any
  resources or tools.

Resources (exposing notes/tasks to MCP clients) land in **M2**. Tools
(change-request actions like toggling a task done) land in **M3**. The
user-facing setup guide (how to point Claude Desktop / OpenCode at this
server) is **M4** — this milestone is developer scaffolding only.

## Running it

CopyNotes (the desktop app) must be open, because it's the process that
watches `inbox/` and writes `outbox/` results — without it, `submitChange`
calls will time out and `readExport` will only see whatever `export.json`
was last written.

```sh
CN_MAILBOX=/path/to/mailbox node server.js
```

The mailbox path is shown inside the CopyNotes app (see Task M4 for the
in-app copy-this-path UI). The server logs a one-line "running on stdio"
message to **stderr** on startup — stdout is reserved for the JSON-RPC
stream and must never be written to directly (any `console.log` there would
corrupt the protocol).

To wire it into an MCP client, point the client's server launcher at
`node /absolute/path/to/mcp/server.js` with `CN_MAILBOX` set in its env.

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
pnpm test                          # runs mailbox.test.js via Vitest
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

- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`
- `@modelcontextprotocol/sdk/server/stdio.js` → `StdioServerTransport`

`zod@4.4.3` is installed alongside the SDK because tool/resource schema
registration (`registerTool`/`registerResource`, coming in M3) requires it
as a peer dependency.
