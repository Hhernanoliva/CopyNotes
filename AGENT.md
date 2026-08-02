# CopyNotes

Source of truth for product direction, architecture, and quality bar. Detailed feature decisions live in `specs/` — this file is the map, the specs are the territory. (Restructured 2026-07-16: section detail was verified against and absorbed into the specs; see the index below.)

## Product Vision

CopyNotes is a simple local-first notes organizer inspired by Workflowy, Bear, and Notion, but intentionally smaller and faster to understand. It focuses on writing, organizing, and copying text through a clean block-based experience: minimal and elegant like Bear, simple like an improved plain text editor, modular enough to grow through future agent-assisted features.

Primary audience: general users who want a simpler alternative to large note-taking tools (Bear/Notion/Workflowy users who don't want a heavy workspace).

**Status:** the MVP (spec 017, stages 0–7) is complete; current work is post-MVP. Two things shipped past it and change the map below: the **agent beta** (local MCP, spec 028) and **optional encrypted cloud sync** (specs 029/030, phases 0–3 in production 2026-07-30). The MVP completion checklist and quality gates are in `specs/017-mvp-implementation-plan.md`.

## Collaboration Style

Explain product and technical decisions to Hernan in clear Spanish, assuming he is not an engineer. No unexplained jargon; use simple analogies; explain why a choice matters for the product. The goal: he can approve, reject, or adjust confidently.

## Product Principles

- **Local-first, no account required.** Data lives on the device (Dexie/IndexedDB), autosaves, works offline, installs as PWA. Backup/export is part of trust, not an extra. An account exists now, but it is opt-in and adds a second copy — it never becomes the source of truth.
- **Privacy.** Without sync, everything is local. With sync, notes are encrypted on the device first: the server stores ciphertext and cannot read a word, and nothing is uploaded before explicit consent. **Never claim "zero-knowledge" publicly until the independent audit in `030` phase 4.**
- **Copying is a first-class workflow.** Block-only and block-with-children copy, clean output in other tools.
- **Narrow scope.** Write, organize, copy, reuse, backup. NOT a Notion competitor: no workspace databases, complex tables, heavy dashboards, or enterprise collaboration.
- **No user-facing AI.** No AI chat or assistant in the product. Agents connect from **outside** through MCP (beta, desktop; specs 011/012/023/028) and only reach what the user made visible.
- **Monetization:** free core experience; cloud sync is the intended Pro value (built, not yet paywalled), alongside advanced themes/exports/templates. Never paywall basic local note-taking.
- **Dark-first, calm, Bear-like.** Behavior over polish, but never careless UI; everything themeable through tokens (spec 016).

## Technical Direction

Stack: SvelteKit + Svelte 5, TypeScript tooling with plain-JS style code, Tailwind, shadcn-svelte + Bits UI, Lucide, mode-watcher, svelte-sonner, Dexie.js, Valibot, @vite-pwa/sveltekit (adapter-static), Vitest + Playwright. Library decisions are locked in `specs/014` (UI) and `specs/015` (non-UI) — read them before installing or replacing anything, including the editor (custom block editor; spec 015 has the revisit triggers).

Web-first and client-side: still **no server routes and no backend code of ours** (adapter-static). Since 2026-07-30 there is one external service, and only for people who opt in: **Supabase** provides the account (email + password today) and stores **ciphertext**. It is not a hosted copy of the app's data model — it holds one opaque blob per record plus the few fields needed to file it. The device remains the source of truth; the app is fully usable offline, forever, with no account. Tauri is the preferred desktop wrapper: keep browser APIs (persistence, file import/export, clipboard, PWA, shortcuts) wrapped behind small internal utilities so a desktop port stays easy.

**Sync is built, not future** (specs 029/030, replacing the "backend open" language of spec 010): records are encrypted on the device before upload, the vault key never leaves it, and no conflict is ever resolved by a silent last-write-wins. Anything touching this must keep four invariants:

- **Encryption belongs to the upload edge**, never to local storage — local rows stay plaintext so indexes, speed and the unload journal are unchanged (decision D1 in `030`).
- **`putFromCloud` in `storage/db.ts` is the only way a downloaded record may be written.** Any other path stamps it as a local change, and the two devices bounce it between them for ever.
- **Nothing leaves without consent**, and the gate is structural: `sync/pending.ts` returns an empty list until it is granted, so an uploader cannot find anything to send.
- **Realtime is sent only when a second device is actually connected** (`sync/live.ts`). It is billed per message; "just send always" is the difference between a US$25/month project and a US$1.250 one at scale.
- **A change arriving from outside never re-mounts the editor.** See the editor rule below — it is the invariant that broke first when sync got fast.

## Application Architecture

```txt
src/
  lib/
    actions/        Svelte actions shared across components: keyboard-inset
                    positioning, tooltips, tap-to-select (pick on pointerup)
    blocks/         block types, hierarchy, nesting, ordering, collapse, cascade
    editor/         editor UI, keyboard behavior, slash commands, selection, paste, history
    format/         inline formatting engine, sanitize/ingest gate, block types map
    storage/        Dexie setup, repositories, migrations — the ONLY data access path
    copy/           clipboard formatters and serialization
    snippets/       snippet creation, favorites, insertion
    tags/           tag creation, assignment, filtering
    search/         text + tag search engine (swappable behind one interface)
    export-import/  JSON backup, Markdown/HTML export, import validation
    theme/          dark/light, tokens, preference
    onboarding/     demo note, first-run
    pwa/            service worker, offline. NOT installability: the web build
                    stopped offering "install this page as an app" — that
                    look-alike cannot host the agent channel (see desktop/)
    desktop/        the Tauri seam: window-close write barrier, and the web-side
                    card + link that point people at the desktop download
    sync/           account, encryption at the upload edge, upload/download,
                    conflicts, and the live channel (specs 029/030)
    bridge/, mcp/   the agent channel: export file, mailbox, MCP server (028)
  routes/
specs/
e2e/
supabase/         schema.sql + how to set the project up. Not app code: it is
                  what gets pasted into the SQL editor, kept here to be reviewable
scripts/          rls-check.mjs — proves one account cannot reach another's rows
```

Rules that keep agents safe here:

- Feature code stays close to its module; extract shared logic only when truly reused.
- UI components never touch Dexie directly — repositories only. This is the seam where encryption and sync plug in, and why they could be added without the editor knowing.
- Pure logic (hierarchy, formatters, search, merge plans) lives in plain modules with Vitest coverage, separate from rendering.
- State: Svelte runes/stores for UI/session state (current note, selection, panels, query); anything that must survive a refresh flows through storage. No external state library.
- Editor is isolated behind boundaries (editor UI / block model / persistence / copy formatting / shortcuts) so a future editor swap can't force a rewrite.
- **An empty block does not store an empty string.** Deleting a row's last character leaves a browser-inserted `<br>` in the contenteditable, which `htmlToPlainText` reads as `"\n"` — so `block.content` for a visually empty row is often a phantom newline. Never infer what the user did from `block.content.length` (a length delta against the previous text is off by one right after a row is emptied, and it silently broke the `/` menu that way). Compare the text itself. The typed-trigger contract this produced lives in spec `003`.
- **A key that acts on a multi-block selection needs its own branch in `Editor.handleSelectionKeys`.** That handler runs in the capture phase and is the only place that sees the selection; a key without a branch there falls through to the focused row's own handler and silently acts on **one** block — which is exactly how Tab indented only the first of several selected lines. When adding a block-level key, add both paths or neither.
- **A multi-block selection moves as one unit or not at all.** Move, indent and outdent all resolve through `selectionRun` in `blocks/selection.ts`: the selected roots must be a contiguous run of siblings under a shared parent, otherwise the plan is `null` and nothing happens. A partially applied group move would tear the hierarchy apart in a way one Undo cannot describe; a no-op is the safe answer for selections that cross levels.
- **A menu that floats over a selection dies with the selection that opened it, and what is painted is decided by the selection, not by the menu's own state.** The group type menu (`/` over 2+ rows, spec `031`) keeps `selectionMenu` separate from the typed-`/` `slash` state, and the template gates on `groupMenu = $derived(hasSelection ? selectionMenu : null)`; the range-assignment sites (`shiftSelect`, `dragOver`, `extendSelection`) drop the menu too. Menu state that outlives its selection reappears later over rows nobody picked — and its Enter would convert those. Two traps found the hard way, both invisible in review: a bare `Shift` keydown arrives before the arrow in any `Shift+Arrow` and hits the group menu's catch-all, and a click on an already-selected row runs `dragReorder`'s `onSelectionClick` → `clearSelection()`, which is why the menu root has to stop `pointerdown` propagation.
- **A scrolling container clips every panel that opens outside its box — absolutely positioned ones included.** The floating formatting toolbar scrolls its button row sideways so it never exceeds a phone screen, and for ten days the color, link and "Más opciones" panels lived *inside* that scroller: measured at 13%, 46% and 1.6% visible. The shape that fixes it: an **outer, unclipped layer** carries the panels, an **inner row** carries the scroll, and the panels anchor to the toolbar's edge rather than to a button that may have scrolled out of reach. Two traps behind it, both cheap to repeat elsewhere: setting `overflow-x` alone promotes `overflow-y` from `visible` to `auto` (a horizontal scroller clips vertically too), and **Playwright scrolls a container before clicking**, so every e2e test stayed green while no human could reach the panels — the guard in `formatting.spec.ts` hit-tests the panel's four corners with `elementFromPoint` instead of asserting visibility, because "visible" is not "reachable".
- **A panel anchored to a row keeps that anchor in CSS; a pixel offset measured once is a lie the moment anything scrolls.** `keyboardInset` shifted any floating panel that crossed the bottom of `visualViewport` up by a computed number of pixels. On desktop `visualViewport` IS the window, so the `/` menu opened near the fold got a frozen `translateY`, sat glued to the SCREEN, and let its own row scroll out from under it. Two things make it right: the action now only fires when a real virtual keyboard is eating the viewport (`innerHeight - keyboardTop >= 100` — browser chrome shrinks it too and is not a keyboard), and "doesn't fit below" is answered by **flipping the anchor** (`top-full` → `bottom-full`), which is a layout relationship and survives every scroll for free. The offset also moved from `transform` to `translate`, because `.cn-pop`/`.cn-toolbar` transition `transform` for their entry animation and a transitioned offset arrives late — the panel visibly trails the scroll. Same trap waits in `DatePanel` and `TagPicker`: they share the action. **The floating toolbar is the case where CSS cannot hold the anchor** — it points at a text RANGE, not a row, so its position has to be measured; it was measured once per `selectionchange` and scrolling does not change the selection, so it stayed nailed to the screen while the marked text slid away underneath (the note scrolls in `<main>`, the toolbar lives outside it, so `window.scrollY` is always 0 and never corrected anything). It now re-measures `savedRange` on `scroll`/`resize`. The guard against the effect eating its own writes: depend on a `$derived` boolean `toolbarOpen`, and write the PROPERTY (`toolbar.rect = …`), never a fresh object.
- **An agent's request leaves the mailbox only when the app confirms it, and applying it commits together with recording its id.** The two halves hold each other up. Rust keeps `inbox/<id>.json` until the webview calls `bridge_ack` (`src-tauri/src/bridge.rs`), so a window that dies mid-flight replays the request on the next boot instead of losing it — and because it can now replay, `bridge/ingest.ts` writes the change and its dedupe entry in ONE Dexie transaction over `blocks + activity + settings`, or a crash between the two would apply that replay a second time. Reverting either half alone reopens the bug the other one closes. Two consequences to respect when touching this: every exit path of the `bridge://change` listener must ack (a file nobody acks comes back on every boot forever, garbage included), and every read a change needs — gates, agent identity, the new row's sibling order — is resolved BEFORE the transaction opens, because a chained Collection read inside it commits the transaction early (the trap `tasks/actions.ts` documents).
- **The bitácora records births and closures, not every keystroke: `created`, `done`, `reopened`, `note` — and nothing else.** `lib/tasks` is the single door for those four; writing a task's TEXT and DELETING it deliberately stay outside it, on the plain block repositories. Text edits would append a line per debounced save, which is pure noise and which the user guide already promises never happens; a deleted task needs no farewell line because `getBlock` filters soft-deleted rows, so the ingest gate already answers "not visible" to any agent still holding its id. This reads like a gap in the single door and has been re-reported as a bug twice — it is the decided shape (Hernán, 2026-08-01). If you ever do add an action, add its verb to BOTH `ACTION_LABEL` maps in `SettingsDialog.svelte` (user and agent conjugate differently) and remember `isRedoRequested` only looks at the LAST entry.
- **The agent kill switch cuts BOTH halves, and each half has a way of silently un-cutting itself.** `agentsPaused` (a plain setting) has to stop the write side *and* the read side, or "pausado" means nothing: `bridge/ingest.ts` rejects every request before any other gate with its own reason `agents-paused`, and `buildAgentExport` emits `{ notes: [], paused: true }` so the file on disk empties instead of going stale. Three details found by reviewing the first version of it, each of which had quietly re-opened one half: (1) the urgent re-export lives INSIDE `setAgentsPaused` and fires on failure too — `setSetting` journals to localStorage before touching Dexie, so a failed write still leaves the pause in force while `export.json` kept every visible note; (2) `agents-paused` is the only rejection NOT written to the dedupe ledger, because it is the only transient one and a timed-out request keeps its id for 30 s (`mcp/lib/mailbox.js`), long enough to replay a stale "paused" answer after resuming; (3) `paused` is read by `resolveNote` too, not just `list_notes`, or every lookup answers "note not found" and the model reports the user's notes as deleted. `agentVisible` is never touched, so resuming restores the previous state exactly. Not `backupSafe`: import writes only safe keys, which is what stops a restored file from un-pausing a device.
- **`buildAgentExport` runs on every agent write, so its cost must scale with NOTES, not with tasks.** The file the agent reads is rebuilt whole on each `bumpAgentData()`, and the first version asked for each task's bitácora separately — 50 visible tasks meant 50 serial IndexedDB round-trips per request. `activity` is indexed by `noteId`, so one read per note, split by `blockId` in memory, answers the same thing (`bridge/export.ts`). Any new per-task field the payload needs must be gathered the same way. A trap if you try to pin this down with a test: a spy on `$lib/storage` does **not** intercept — the barrel re-exports, and the Dexie `Table` object a test reaches is not the one `storage/activity.ts` captured — so assert the SHAPE of the result (each task keeps its own lines) and leave the query count to review.
- **Changes that arrive from outside the app — the cloud, an agent — update the open note in place; they never re-mount the editor.** `+page.svelte` keeps two doors on purpose: `handleDataChanged` (which bumps `dataVersion` and rebuilds the editor) is only for import/restore, where nothing on screen is worth preserving; everything else goes through `handleExternalChange` → `Editor.refreshFromStorage()`. Re-mounting drops the caret and, mid-typing, splits the line being written — invisible while sync was slow, constant once it took seconds. The safety rule lives in `editor/reconcile.ts`: **storage decides order and existence, but a row is never replaced while the caret is in it or while its save is in flight**, and a row skipped that way must be retried when the caret leaves.

## Quality Bar

A feature is not done until: the app runs without errors; risky logic has Vitest tests; critical flows have a Playwright check (convention: NO component-test layer — pure Vitest + Playwright only, spec 013); relevant docs/specs updated (user guide per `docs/guia/` rule in CLAUDE.md); nothing unrelated broke; data-loss risk was considered. Extra care in high-risk areas: persistence, import/export/backup restore, nested hierarchy, reordering, copy formatting, tags/search.

## Where Detail Lives (topic → spec)

| Topic | Spec |
|---|---|
| Project setup, tooling | `001` |
| Data model, Dexie, repositories, soft delete | `002` |
| Editor, block types, nesting, keyboard, slash, reorder, collapse | `003` |
| Copy actions, clipboard formats, outline copy | `004` |
| Snippets, favorites, insertion, template readiness | `005` |
| Tags, search, no-folders organization | `006` |
| Export/import/backup UX | `007` (format contract: `018`) |
| PWA, offline, themes, responsive, Tauri readiness | `008` |
| Layout, navigation, onboarding, demo note, help | `009` |
| Sync readiness, conflicts, future accounts | `010` |
| MCP readiness, audience, connection model, prompts | `011` |
| MCP permissions, audit, sessions, private notes, rollback | `012` |
| Testing strategy, definition of done | `013` |
| UI library decision | `014` |
| Non-UI libraries + editor decision & revisit triggers | `015` |
| Design system (Quiet Ink, approved — do not regenerate) | `016` |
| Build plan, stage order, MVP gates | `017` |
| Editor UX fixes (post-MVP) | `019` |
| Inline formatting + toolbar | `020` |
| Block dates & agenda | `021` |
| Sidebar organization: manual order, folders, snippet rename | `022` |
| MCP phasing & conservative first version | `023` |
| Quiet Motion: app-wide animation system | `024` |
| macOS desktop/Tauri preparation | `025` |
| Drag selected text to move it | `026` |
| Settings dialog + text size (Configuración) | `027` |
| Agent beta: local MCP, task-action layer, activity log | `028` |
| Cloud sync path (Pro): accounts, seams, conflicts | `029` |
| Zero-knowledge sync: encryption at the upload edge | `030` |
| Group type change: `/` over a multi-row selection | `031` |
| Text size on the selection: H1/H2/H3 without splitting the row | `032` |
| The formatting toolbar without a mouse: shortcuts + arrow navigation | `033` |

Every meaningful feature gets a numbered spec (Objective / What enters / What does not / Data / Flows / Acceptance / Tests / Agent notes). Read `AGENT.md` plus the relevant spec before implementing; never contradict this file.

## Agent-Controlled Development

The project must stay easy for AI agents to understand, modify, and extend safely: simple explicit architecture, clear feature boundaries, small focused modules, no clever abstractions, decisions documented in specs, tests around risky behavior. Agents drive development; the app itself exposes no AI to end users.
