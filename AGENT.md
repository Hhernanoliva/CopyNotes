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
- **Narrow scope.** Write, organize, copy, reuse, backup — and hand one note to one other person so they can respond to it (spec `038`). NOT a Notion competitor: no workspace databases, complex tables, heavy dashboards, or enterprise collaboration. A shared note has exactly one author; a guest may tick and comment, never rewrite.
- **No user-facing AI.** No AI chat or assistant in the product. Agents connect from **outside** through MCP (beta, desktop; specs 011/012/023/028) and only reach what the user made visible.
- **Monetization:** free core experience; cloud sync is the intended Pro value (built, not yet paywalled), alongside advanced themes/exports/templates. Never paywall basic local note-taking.
- **Dark-first, calm, Bear-like.** Behavior over polish, but never careless UI; everything themeable through tokens (spec 016).

## Technical Direction

Stack: SvelteKit + Svelte 5, TypeScript tooling with plain-JS style code, Tailwind, shadcn-svelte + Bits UI, Lucide, mode-watcher, svelte-sonner, Dexie.js, Valibot, @vite-pwa/sveltekit (adapter-static), Vitest + Playwright. Library decisions are locked in `specs/014` (UI) and `specs/015` (non-UI) — read them before installing or replacing anything, including the editor (custom block editor; spec 015 has the revisit triggers).

Web-first and client-side: still **no server routes and no backend code of ours** (adapter-static). Since 2026-07-30 there is one external service, and only for people who opt in: **Supabase** provides the account (email + password today) and stores **ciphertext**. It is not a hosted copy of the app's data model — it holds one opaque blob per record plus the few fields needed to file it. The device remains the source of truth; the app is fully usable offline, forever, with no account. Tauri is the preferred desktop wrapper: keep browser APIs (persistence, file import/export, clipboard, PWA, shortcuts) wrapped behind small internal utilities so a desktop port stays easy.

**Sync is built, not future** (specs 029/030/035, replacing the "backend open" language of spec 010): records are encrypted on the device before upload, the vault key never reaches the server, and no conflict is ever resolved by a silent last-write-wins. Anything touching this must keep these invariants:

- **Encryption belongs to the upload edge**, never to local storage — local rows stay plaintext so indexes, speed and the unload journal are unchanged (decision D1 in `030`).
- **`putFromCloud` in `storage/db.ts` is the only way a downloaded record may be written.** Any other path stamps it as a local change, and the two devices bounce it between them for ever.
- **Nothing leaves without consent**, and the gate is structural: `sync/pending.ts` returns an empty list until it is granted, so an uploader cannot find anything to send. `createVault` enforces the other half — the key cannot be created before consent, because a vault that never announces itself to the server is one the second device is told does not exist, so it builds a rival with a different key and the two stop being able to read each other.
- **The key reaches a second device by being wrapped for one trip and no other** (spec `035`): eight characters the old device shows for ten minutes, a `pairings` row that the server hides once it expires and that the joining device deletes, and nothing kept on either side. There is no recovery code and nothing for a person to store. Two things this cost, both load-bearing: the vault key is imported `extractable: true` — the one defence this design gives up, so that `wrapKey` can hand it over without its bytes ever entering JavaScript — and **a row hidden by a `select` policy cannot be deleted from outside either**, because Postgres must read a row to delete it, which is why `start_pairing` (`security definer`) is the only door into that table. Left as a plain insert, a code nobody used locked the next request for ever.

- **The server refuses a write that is not standing on the version it holds** (`push_records`), and **`sync/leave.ts` is the only way out of an account**: signing out must drop the key, the consent, both cursors and every row's `cloudSeq`, or the next account inherits them — uploading without ever being asked again, and reading a new server from the old one's cursor. See the two rules below.
- **Realtime is sent only when a second device is actually connected** (`sync/live.ts`). It is billed per message; "just send always" is the difference between a US$25/month project and a US$1.250 one at scale.
- **A change arriving from outside never re-mounts the editor.** See the editor rule below — it is the invariant that broke first when sync got fast.

## Application Architecture

```txt
src/
  lib/
    actions/        Svelte actions shared across components: keyboard-inset
                    positioning, flip-into-view (anchor above when it does not
                    fit below), tooltips, tap-to-select (pick on pointerup)
    blocks/         block types, hierarchy, nesting, ordering, collapse, cascade
    editor/         editor UI, keyboard behavior, slash commands, selection, paste, history
    format/         inline formatting engine, sanitize/ingest gate, block types map
    images/         capturas de pantalla (spec 041): el ingestor que puede decir
                    que no, la ÚNICA puerta a la tabla `imageBodies`, el alta
                    atómica bloque+bytes, y el texto `[Imagen: …]` con el que
                    una imagen se proyecta a cualquier lado que no pueda llevar
                    píxeles. Los bytes viven acá y en ningún otro lado
    storage/        Dexie setup, repositories, migrations — the ONLY data access
                    path — plus the cross-tab write signal (`tab-channel.js`)
    copy/           clipboard formatters and serialization
    snippets/       snippet creation, favorites, insertion
    tags/           tag creation, assignment, filtering
    search/         text + tag search engine (swappable behind one interface)
    export-import/  JSON backup, Markdown/HTML export, import validation, y el
                    paquete `.copynotes` — un ZIP con el método STORE escrito a
                    mano (sin librería: sin compresión, una bomba zip es
                    imposible por construcción)
    theme/          dark/light, tokens, preference
    onboarding/     demo note, first-run
    pwa/            service worker, offline. NOT installability: the web build
                    stopped offering "install this page as an app" — that
                    look-alike cannot host the agent channel (see desktop/)
    desktop/        the Tauri seam: window-close write barrier, the web-side
                    card + link that point at the desktop download, and the
                    "there is a new version" notice (check() only — the app
                    never replaces itself; see docs/arquitectura-publicacion.md)
    sync/           account, encryption at the upload edge, upload/download,
                    conflicts (+ the word-level diff the in-row panel shows),
                    leaving an account, and the live channel (specs 029/030)
    bridge/, mcp/   the agent channel: export file, mailbox, MCP server (028)
  routes/
specs/
e2e/
supabase/         schema.sql + how to set the project up. Not app code: it is
                  what gets pasted into the SQL editor, kept here to be reviewable
scripts/          rls-check.mjs — proves one account cannot reach another's rows
                  changelog-section.mjs — prints one CHANGELOG section; the
                  release build FAILS when the section is missing
.github/workflows/release.yml
                  tag `v*` → compile, sign, publish a DRAFT release
CHANGELOG.md      single source of the user-facing release notes, in Spanish
```

Rules that keep agents safe here:

- Feature code stays close to its module; extract shared logic only when truly reused.
- UI components never touch Dexie directly — repositories only. This is the seam where encryption and sync plug in, and why they could be added without the editor knowing.
- Pure logic (hierarchy, formatters, search, merge plans) lives in plain modules with Vitest coverage, separate from rendering.
- State: Svelte runes/stores for UI/session state (current note, selection, panels, query); anything that must survive a refresh flows through storage. No external state library.
- Editor is isolated behind boundaries (editor UI / block model / persistence / copy formatting / shortcuts) so a future editor swap can't force a rewrite.
- **An empty block does not store an empty string.** Deleting a row's last character leaves a browser-inserted `<br>` in the contenteditable, which `htmlToPlainText` reads as `"\n"` — so `block.content` for a visually empty row is often a phantom newline. Never infer what the user did from `block.content.length` (a length delta against the previous text is off by one right after a row is emptied, and it silently broke the `/` menu that way). Compare the text itself. The typed-trigger contract this produced lives in spec `003`.
- **When the browser already knows the answer, do not infer it from the text.** The typed triggers (`/`, `#`) had to tell "a person typed this" from "this arrived from a paste", and inferred it by comparing the text before and after: if anything before the caret changed, call it a paste. That proxy holds on a desktop, where one key is one event, and is simply false on a phone — the on-screen keyboard commits or autocorrects the word in progress **in the same `input` event that carries the trigger character**, so "something before the caret changed" is the normal case and the menu never opened on a row that already had text (an empty row worked, because there was no word to correct). `InputEvent.inputType` says it outright and was being thrown away in `BlockRow.handleInput`. Generalise past this instance: a heuristic over the *result* of an edit is a guess about the *intent* of an edit, and the platform usually ships the intent — `inputType`, `isComposing`, `isTrusted`, `event.detail`. Reach for those before writing a comparison. When one of these fixes lands, prefer **relaxing** the old rule over replacing it (Hernán's call here, and the right one: the shared trigger path serves desktop too, so an additive change cannot regress what already worked while the mobile fix is still unproven on a real device). Full contract, including why the exclusion list is a deny-list, in spec `003`.
- **A key that acts on a multi-block selection needs its own branch in `Editor.handleSelectionKeys`.** That handler runs in the capture phase and is the only place that sees the selection; a key without a branch there falls through to the focused row's own handler and silently acts on **one** block — which is exactly how Tab indented only the first of several selected lines. When adding a block-level key, add both paths or neither.
- **A multi-block selection moves as one unit or not at all.** Move, indent and outdent all resolve through `selectionRun` in `blocks/selection.ts`: the selected roots must be a contiguous run of siblings under a shared parent, otherwise the plan is `null` and nothing happens. A partially applied group move would tear the hierarchy apart in a way one Undo cannot describe; a no-op is the safe answer for selections that cross levels.
- **A menu that floats over a selection dies with the selection that opened it, and what is painted is decided by the selection, not by the menu's own state.** The group type menu (`/` over 2+ rows, spec `031`) keeps `selectionMenu` separate from the typed-`/` `slash` state, and the template gates on `groupMenu = $derived(hasSelection ? selectionMenu : null)`; the range-assignment sites (`shiftSelect`, `dragOver`, `extendSelection`) drop the menu too. Menu state that outlives its selection reappears later over rows nobody picked — and its Enter would convert those. Two traps found the hard way, both invisible in review: a bare `Shift` keydown arrives before the arrow in any `Shift+Arrow` and hits the group menu's catch-all, and a click on an already-selected row runs `dragReorder`'s `onSelectionClick` → `clearSelection()`, which is why the menu root has to stop `pointerdown` propagation.
- **A scrolling container clips every panel that opens outside its box — absolutely positioned ones included.** The floating formatting toolbar scrolls its button row sideways so it never exceeds a phone screen, and for ten days the color, link and "Más opciones" panels lived *inside* that scroller: measured at 13%, 46% and 1.6% visible. The shape that fixes it: an **outer, unclipped layer** carries the panels, an **inner row** carries the scroll, and the panels anchor to the toolbar's edge rather than to a button that may have scrolled out of reach. Two traps behind it, both cheap to repeat elsewhere: setting `overflow-x` alone promotes `overflow-y` from `visible` to `auto` (a horizontal scroller clips vertically too), and **Playwright scrolls a container before clicking**, so every e2e test stayed green while no human could reach the panels — the guard in `formatting.spec.ts` hit-tests the panel's four corners with `elementFromPoint` instead of asserting visibility, because "visible" is not "reachable".
- **A panel anchored to a row keeps that anchor in CSS; a pixel offset measured once is a lie the moment anything scrolls.** `keyboardInset` shifted any floating panel that crossed the bottom of `visualViewport` up by a computed number of pixels. On desktop `visualViewport` IS the window, so the `/` menu opened near the fold got a frozen `translateY`, sat glued to the SCREEN, and let its own row scroll out from under it. Two things make it right: the action now only fires when a real virtual keyboard is eating the viewport (`innerHeight - keyboardTop >= 100` — browser chrome shrinks it too and is not a keyboard), and "doesn't fit below" is answered by **flipping the anchor** (`top-full` → `bottom-full`), which is a layout relationship and survives every scroll for free. The offset also moved from `transform` to `translate`, because `.cn-pop`/`.cn-toolbar` transition `transform` for their entry animation and a transitioned offset arrives late — the panel visibly trails the scroll. Same trap waits in `DatePanel` and `TagPicker`: they share the action. **The floating toolbar is the case where CSS cannot hold the anchor** — it points at a text RANGE, not a row, so its position has to be measured; it was measured once per `selectionchange` and scrolling does not change the selection, so it stayed nailed to the screen while the marked text slid away underneath (the note scrolls in `<main>`, the toolbar lives outside it, so `window.scrollY` is always 0 and never corrected anything). It now re-measures `savedRange` on `scroll`/`resize`. The guard against the effect eating its own writes: depend on a `$derived` boolean `toolbarOpen`, and write the PROPERTY (`toolbar.rect = …`), never a fresh object. **The room a panel has is `visualViewport`, never `window.innerHeight`** — the on-screen keyboard does not shrink the window, only the visible part of it, so a panel on the last row was laid out into pixels that exist for the layout and not for the user. `actions/flipIntoView.js` (on the positioned wrapper, `DatePanel` today) answers "fits below?" against `vv.offsetTop + vv.height` and flips the anchor when it does not; `keyboardInset` (on the panel itself) stays as the nudge for when NEITHER side fits, now clamped so it can never push the panel's top off-screen — cut off at the top is worse than covered at the bottom, because the first options vanish with no way to scroll to them. Both re-measure on a `ResizeObserver`: a panel that grows after opening (the date calendar) or shrinks while filtering (the `/` menu) had its offset computed for the height it had at mount.
- **Owning a gesture the browser also owns means actively cancelling the browser's version, and `preventDefault()` on a pointer event does not do it.** `editor/textDrag.svelte.js` takes over drag-to-move for a text selection (spec `026`) because native contenteditable DnD is unreliable — but for ten months nothing stopped the native drag from *also* starting. Chrome decides to begin one from the mouse event stream, and the controller's `preventDefault()` lives on `pointermove`, past an early `return` for the first sub-threshold move: exactly the window where the decision is made. When the native drag completed, the browser moved the text itself and fired `input`, so the editor saved that already-moved html — and then `onUp` applied the planned move a second time, with offsets that no longer described anything, leaving the row's characters interleaved. The guard is a `dragstart` listener registered at **arm** time, not at activation. Two things this leaves behind: a gesture we own must cancel `dragstart` (and `selectstart`) explicitly, and **this class of bug has no e2e**, because Playwright's synthesised mouse never initiates a native drag — not even with `--headed` — so the suite stays green while a real trackpad breaks. When a drag bug is reported and the tests disagree, believe the human.
- **A native form control that owns its own overlay is not automatically the cheap answer — check what it fires before trusting it.** `<input type="date">` looked like the free way to pick any day, and on iOS it writes today's date and fires `change` the instant its picker opens, then again on every wheel tick. Applying on `change` stored a date the user never chose and closed the panel, which unmounted the input and dismissed the system picker — read by the user as "the calendar opens and closes by itself". Nothing distinguishes that first `change` from Android/desktop's, where the first one IS the commit. The rule this leaves: when a native control's overlay lives outside the DOM, our state must not depend on guessing when the user is *done* with it; if the interaction needs a final-pick signal the platform does not give, own the widget (spec `021`'s month grid). Its pure part (`monthGrid`/`addMonths`/`monthLabel`) belongs in `dates/core.ts` with the rest — the component only paints it.
- **An agent's request leaves the mailbox only when the app confirms it, and applying it commits together with recording its id.** The two halves hold each other up. Rust keeps `inbox/<id>.json` until the webview calls `bridge_ack` (`src-tauri/src/bridge.rs`), so a window that dies mid-flight replays the request on the next boot instead of losing it — and because it can now replay, `bridge/ingest.ts` writes the change and its dedupe entry in ONE Dexie transaction over `blocks + activity + settings`, or a crash between the two would apply that replay a second time. Reverting either half alone reopens the bug the other one closes. Two consequences to respect when touching this: every exit path of the `bridge://change` listener must ack (a file nobody acks comes back on every boot forever, garbage included), and every read a change needs — gates, agent identity, the new row's sibling order — is resolved BEFORE the transaction opens, because a chained Collection read inside it commits the transaction early (the trap `tasks/actions.ts` documents). **The id is therefore not optional and is checked first, before any gate**: the ledger is keyed by it, so a request without one had no net at all against that replay, and the answer is written to `outbox/<id>.json`, so it could not have been read either. `ingest.ts` rejects it with its own reason `missing-id` rather than applying it — `mcp/lib/mailbox.js` always mints one, so only a hand-written file can reach that branch.
- **The bitácora records births and closures, not every keystroke: `created`, `done`, `reopened`, `note` — and nothing else.** `lib/tasks` is the single door for those four; writing a task's TEXT and DELETING it deliberately stay outside it, on the plain block repositories. Text edits would append a line per debounced save, which is pure noise and which the user guide already promises never happens; a deleted task needs no farewell line because `getBlock` filters soft-deleted rows, so the ingest gate already answers "not visible" to any agent still holding its id. This reads like a gap in the single door and has been re-reported as a bug twice — it is the decided shape (Hernán, 2026-08-01). If you ever do add an action, add its verb to BOTH `ACTION_LABEL` maps in `SettingsDialog.svelte` (user and agent conjugate differently) and remember `isRedoRequested` only looks at the LAST entry.
- **The agent kill switch cuts BOTH halves, and each half has a way of silently un-cutting itself.** `agentsPaused` (a plain setting) has to stop the write side *and* the read side, or "pausado" means nothing: `bridge/ingest.ts` rejects every request before any other gate with its own reason `agents-paused`, and `buildAgentExport` emits `{ notes: [], paused: true }` so the file on disk empties instead of going stale. Three details found by reviewing the first version of it, each of which had quietly re-opened one half: (1) the urgent re-export lives INSIDE `setAgentsPaused` and fires on failure too — `setSetting` journals to localStorage before touching Dexie, so a failed write still leaves the pause in force while `export.json` kept every visible note; (2) `agents-paused` is the only rejection NOT written to the dedupe ledger, because it is the only transient one and a timed-out request keeps its id for 30 s (`mcp/lib/mailbox.js`), long enough to replay a stale "paused" answer after resuming; (3) `paused` is read by `resolveNote` too, not just `list_notes`, or every lookup answers "note not found" and the model reports the user's notes as deleted. `agentVisible` is never touched, so resuming restores the previous state exactly. **Not `backupSafe` — and that flag alone was not enough.** Import writes only safe keys, which covers the merge path; "Reemplazar todo" *clears* the settings table first and then repones only what the file carries, so the switch simply vanished and reverted to its default `false`: a restore un-paused the agents nobody had un-paused, and the kill switch failed open. `replaceAllTables` now reads the non-backup-safe rows before the clear and puts them back after the file's, so the device's own switches win. The rule generalises: **a preference marked "never leaves this device" must also be a preference that never *dies* on this device** — check both import paths whenever one is added. **And the read half only counts once the file on disk actually changed, so a failed write is a privacy event, not a log line.** `export.json` is what the agent reads; if `bridge_write_export` cannot replace it (full disk, permissions) the previous file stays and every visible note is still readable while the screen says "pausados". All three call sites swallowed that with `console.error`, so the mark is set in `writeAgentExport` itself — the single door they all pass through, and the one place a fourth caller cannot forget. `agentData.exportFailed` drives a line in Configuración › Agentes whose wording splits by state (paused: "la pausa todavía no se cumplió", they can still *read*; not paused: they are seeing an older version), and it clears itself on the next successful write, which any note edit triggers. The error still propagates. `mcp/lib/resources.js` deliberately keeps serving the stale file behind its 24-hour warning: reading with the app closed is a wanted feature, and a closed app cannot warn anybody.
- **`buildAgentExport` runs on every agent write, so its cost must scale with NOTES, not with tasks.** The file the agent reads is rebuilt whole on each `bumpAgentData()`, and the first version asked for each task's bitácora separately — 50 visible tasks meant 50 serial IndexedDB round-trips per request. `activity` is indexed by `noteId`, so one read per note, split by `blockId` in memory, answers the same thing (`bridge/export.ts`). Any new per-task field the payload needs must be gathered the same way. A trap if you try to pin this down with a test: a spy on `$lib/storage` does **not** intercept — the barrel re-exports, and the Dexie `Table` object a test reaches is not the one `storage/activity.ts` captured — so assert the SHAPE of the result (each task keeps its own lines) and leave the query count to review.
- **The editor has ONE door for writing a block: `writeBlock` in `Editor.svelte`. A bare `updateBlock` call from the editor is a bug, even when it looks like the direct, honest thing to do.** Typing schedules a save that fires 500 ms later and carries a *copy* of the text as it was when it was armed. Any write that goes around that queue leaves the timer armed, and half a second later the stale copy overwrites it. That is not a quirk of one call site: it produced `- ` + a pause reverting to `-` (the space converts the row to a bullet and writes directly; the bug only shows if the user then stops typing, because the next keystroke re-arms the save and hides it) and drag-to-move text silently reverting. `writeBlock` closes it by routing through `scheduleSave` under the same key — scheduling clears the previous timer — and it **merges** changes into whatever is pending rather than replacing them: under one key, replacing would drop fields the earlier save had not written yet, so collapsing a row would eat the sentence just typed. Two things ride along for free and must not be lost: every write gets a localStorage journal entry (a direct write in flight when the tab closes used to vanish with no retry), and immediate writes return their promise so a caller that reads the row afterwards can await it. **`flushPending` never rejects on purpose** — a failed write keeps its entry in `pending` with a `failed` flag, because that entry is the only retry left — so a caller must read the map, not the promise: the hidden-tab path re-journals after flushing instead of calling `clearJournal`, which used to throw away the only copy of a change that never reached disk. For the same reason `writeJournal([])` *clears* the journal rather than returning early: a list left behind after its writes landed is replayed on the next boot and overwrites newer text with the old one. Regression: `e2e/editor-saving.spec.ts` — and note the shape of that test, because a pause with **no** further typing is the only way the bug is visible. **The mirror image of that trap is `cancelPending`: dropping the queued save is only safe when the very next write carries the row's WHOLE text.** Five of the six call sites do exactly that (they recompute `content`/`html` from the live row after stripping a `/query` or a `#`, or they delete the row outright); the sixth, the group type change, cancelled and then wrote only `type`/`checked`, so whatever had been typed in the last half second never reached disk — on screen it was still there, and it came back as the old version on reload. Cancelling existed for a real reason (a queued content save landing *after* the conversion would put the old rich html back over the escaped plain-text html Código just wrote), and `await flushPending()` before the loop answers both halves at once: the text lands first, the conversion goes on top.
- **A record may only be written to the cloud by a device standing on the version the server actually holds.** `records` is never written with a bare upsert; everything goes through the `push_records` function in `supabase/schema.sql`, and **the server enforces that rather than trusting the client**: the policy grants `select` and nothing else, so the function is the only writer that exists. Paying for that, `push_records` runs `security definer` — row-level security no longer filters it — which makes the explicit owner filter in both branches (`auth.uid()` in the insert, `owner_id = auth.uid()` in the update) the single remaining defence, and `scripts/rls-check.mjs` attacks it head-on. What the closed door buys is not protection from a determined attacker (a stolen session can read `change_seq` and declare it as its base) but from what happens with no attacker at all: a buggy old client, or a hand-written `delete`, emptying the cloud copy behind the version control. A delete travels as a tombstone, never as a deleted row. `push_records` takes a `base_seq` (the device's `cloudSeq` — what it believes is up there), refuses the write when that is not what the row holds, and returns the ids it refused so the rest of the batch still lands. Without the guard, two devices that edited the same row offline both "won": the second overwrote a version it had never seen, and neither ever noticed — which made the whole parked-conflict machinery (`sync/conflicts.ts`, the in-row panel) unreachable, because the losing version was destroyed on the server before anything could compare them. Three consequences: `cloudSeq` is bookkeeping and must always be written with `fromCloud` so the change counter does not move (`markSentToCloud`); the download has to record the server's version when it recognises its own echo, or an upload whose reply was lost claims "this record is new" for ever and is refused on every retry; and `keepLocal` must stamp the *remote* version as its base, or "keep mine" bounces for ever and the decision never travels. **The other end of that same decision is `decide()` in `download.ts`: once a device has nothing unsent, whatever the server holds is applied, full stop — the two `changeSeq` numbers are never compared.** They are clock-derived and belong to different machines, and `keepLocal` is by definition the device that edited *first* insisting its lower number wins; taking "the newer of the two" therefore discarded the one decision the whole conflict machinery exists to deliver, silently, on the receiving device only. The server's chain is linear and authoritative — `push_records` already refused every write that did not stand on the version it held — so a device with nothing unsent does not get a vote. Only `localIsUnsent` may hold a download back, and it parks a conflict rather than dropping anything. **A schema change is not verified until `pnpm rls:check` runs against the real Supabase project** — a local Postgres passed all seven cases while the real project rejected a NULL `deleted` and aborted the whole batch. **`server_seq` orders commits only for a single writer, so the download cursor may not move strictly forward.** Postgres hands out the sequence value when a write *starts*, not when it commits: with two devices uploading at once, 101 can become visible before 100, and a cursor that only ever asks for "newer than the highest I have seen" skips 100 for ever — the change sits on the other device until somebody edits that row again. `downloadOnce` therefore queries from `cursor - OVERLAP` (50; it MUST stay below `BATCH` or a full batch would never advance and `downloadAll` would spin). Re-reading is free only because `decide()` recognises what it already has: `local.cloudSeq === change_seq` — a version already applied here that was then edited on top is the *base* of the pending upload, not a disagreement, and without that branch every re-read manufactured a conflict against the device's own starting point. **That is the FIRST question `decide()` asks, and the order is a contract: a matching `changeSeq` can no longer answer "my own echo" by itself.** `changeSeq` comes from the clock (`max(now, last + 1)`, `storage/change-seq.ts`) with nothing in it that names the device, so two devices editing the SAME row inside one millisecond mint the same number. Reading that as an echo wrote the server's version down as this device's base, which took the local text OUT of the pending list (`sync/pending.ts` counts a row as pending only while `cloudSeq !== changeSeq`): the edit never went up, no conflict was ever raised, and the two devices sat showing different text in silence until somebody happened to touch that row again. Equal numbers with nothing confirmed therefore return `confirm`, which decrypts and asks `sameToTheUser`: identical is the echo (record it — the lost-reply rescue is unchanged), different is a conflict like any other. The number cannot separate the two cases; only the content can, and the price is one decrypt per own echo, once per record, because the next pass lands on `skip`. `recordConflict` keeps the original `at` when the parked version is unchanged, so a standing decision does not jump to the top of the list every 30 seconds.
- **The vault key, the upload consent and both cursors belong to ONE account, and only `forgetCloudAccount` is a door the app controls.** A session can also end without passing through it — the refresh token expires, it is revoked from another device, site data is cleared — and signing into a *different* account then inherited all of it: uploads encrypted with the previous account's key (unreadable to the new one), consent nobody granted again, and a cursor counted in the old server's numbers, which silently skips everything before it. `syncAccountId` records whose device this is, and `syncNow` — the single door for both upload and download — calls `ensureAccountMatches` before anything else, resetting the same state `forgetCloudAccount` does when they disagree. A device with **no** recorded id is one from before this existed: it gets stamped and nothing is touched, or the first update would wipe a working vault. Notes always stay; this is bookkeeping about the cloud, never content.
- **An account has ONE vault, it is the first one, and the server is what decides that.** `cloudVaultExists()` asks before creating, but asking is not reserving: two devices can both be told "no vault here" and each create a key of its own. The upload used to send the key with `upsert`, so the last one to arrive won — and from that moment each device uploaded records the other could not open, while the loser's key silently became dead. The fix is not on the client: `vaults` grants `select` and `insert` and never `update` or `delete`, and the primary key is the owner, so the second vault collides. `uploadVaultBlob` reads that collision (Postgres `23505`) and **stops syncing with a message that says what happened and what to do**, because a device whose key is wrong for the account must not upload — every record it sent would be a parcel nobody can open.

  **That collision means two opposite things, and telling them apart needs the server's help** (spec `035`): the row up there can be another device's, or this device's own from the previous app run — `vaultBlobSent` lives as long as the window does, so every start retries the insert. Read as "somebody got here first", a healthy device accused itself and stopped uploading for ever from its second run onwards (`a4c6e0d`). So `vaults` holds a **proof** and not the key: a known text encrypted with the vault key, which the right key opens and no other does. Any change that drops it has to answer that question another way first. Preventing is only half of it: the damage is also visible from the *other* side, as a record that will not decrypt, and that must not surface as the generic "no se pudo sincronizar" either (it would send the person to check their wifi for ever). Both messages are marked `userFacing` — the one marker `reportSyncFailure` honours verbatim, ahead of the offline check, because a definite answer from the server is not a network hiccup the next tick will fix.
- **A write that replaces a WHOLE row is the dangerous kind: it carries the row's sync bookkeeping back in time along with its text.** Undo is the only place that does it (`restore` → `putBlock`), and it broke sync twice over, both times silently. First, `cloudSeq` — this device's note of which version the SERVER holds — travelled inside the snapshot, so an undo declared a base the server had abandoned and `push_records` refused that row for ever: the change applied here and never reached the other device. `putBlock` now keeps the live row's `cloudSeq` and lets the hooks stamp a fresh `changeSeq`. Second, and more general: **the `fromCloud` mark must be read by VALUE, never by the presence of the key.** Deleting it leaves the key in the stored row with `undefined`, so Dexie's diff for any later whole-row `put` contained `fromCloud` and the `updating` hook in `db.ts` read an ordinary local edit as "this came from the cloud" — no new `changeSeq`, so the change never entered the upload queue at all. Every row that had been through `markSentToCloud` or `putFromCloud` was in that state, which is every row that ever synced. The rule generalises past these two fields: **bookkeeping is about the row's relationship with the server, never about its contents** — a snapshot, a backup or an import must never restore it, and the two writers that legitimately move it (`putFromCloud`, `markSentToCloud`) say so with an explicit `fromCloud: true`.
- **Inserting a row writes ONE row. Renumbering its siblings is not a detail of ordering, it is a conflict generator.** `planInsertAfter` used to give the new row `previous + 1` and bump every sibling below it, so one Enter in the middle of a note wrote a record per remaining row — records the user never touched. With two devices editing the same note, both assigned the same number to the same neighbour, `push_records` correctly refused the second, and every collision was parked as a conflict to decide by hand: a five-row note reached five open conflicts and six changes that could not go up, without the two people ever sharing a line. The order now falls at the **midpoint** between the two neighbours and touches nobody else, and `sortByOrder` **breaks ties by id** — two devices inserting after the same row pick the same number without talking, and without a deterministic tie-break each one drew a different list from identical data. Consequences to respect: **fractional and negative orders are normal**, so the count of siblings says nothing about where a level ends (`nextFreeOrder`, never `siblings.length` — `createBlock`, `planIndent`, snippet insertion), and midpoints spend precision (~50 inserts into the *same* gap; the way out is renumbering that level once, not going back to +1 per neighbour). The plans that deliberately renumber a whole level (drag, Alt+arrows, group Tab) are left alone: they rewrite everyone at once, so they stay internally consistent.
- **A conflict is a question for a person, so a question with only one answer is never asked.** `decide()` compares version numbers, not contents: two writes that leave the row IDENTICAL to the reader — both devices reaching the same value on their own — still parked a conflict, and the screen asked which of two identical texts should win. Before parking, the decrypted remote row is now compared field by field against the local one with the self-rewriting bookkeeping excluded (`storage/row-compare.ts`, shared with the editor's `historyStale` so both answer the same question); when they match, the remote version is adopted — nothing changes on screen, the argument closes, and both devices end up standing on the same version. **`order` is deliberately NOT excluded**: two rows in different places are not the same thing to someone looking at the note, even when they read alike.
- **The header dot is the state of the user's data; ⚙ is for decisions.** Sync status and open conflicts used to live inside Configuración, which meant a conflict in a note you did not have open was invisible unless you thought to go looking for it. The dot now carries two independent layers — its colour is the local save (milliseconds), a violet ring plus a NUMBER means versions are waiting (persists until someone chooses) — and opens a panel with the status line, each conflict, which note it is in, and a way to jump there; `⚙` keeps the account, the consent, adding a device and signing out. Two rules came out of it and hold beyond this panel: **the colour is never the only signal** (hence the number, and `aria-label` on the sidebar mark — spec `016`), and **nothing the browser or the server hands back is printed verbatim.** `syncStatus.error` used to be rendered as-is, so a dropped connection reached the user as red `TypeError: Failed to fetch` — English, a data-type name, and an alarm for a foreseen situation in which nothing is lost. Failures are now split at the point they are caught (`reportSyncFailure`): `offline` is a state, said in Spanish and in grey; `error` is a real failure; the raw text survives in `errorDetail` and travels in the `title` for bug reports.
- **Changes that arrive from outside the app — the cloud, an agent — update the open note in place; they never re-mount the editor.** `+page.svelte` keeps two doors on purpose: `handleDataChanged` (which bumps `dataVersion` and rebuilds the editor) is only for import/restore, where nothing on screen is worth preserving; everything else goes through `handleExternalChange` → `Editor.refreshFromStorage()`. Re-mounting drops the caret and, mid-typing, splits the line being written — invisible while sync was slow, constant once it took seconds. The safety rule lives in `editor/reconcile.ts`: **storage decides order and existence, but a row is never replaced while the caret is in it or while its save is in flight**, and a row skipped that way must be retried when the caret leaves — *every* skipped row, including one that is missing from storage because the other device deleted it, or that deletion is never applied and the next edit re-uploads a row that no longer exists over there. Two traps sit on either side of that rule. **`activeBlockId` deliberately outlives the focus** (the snippets sidebar inserts where you were), so it cannot be the shield on its own: the shield asks `caretInside` too, or the last row touched stays guarded for ever and silently uploads its stale version. And **the undo history describes the user's edits, not the note's contents**: `history` holds whole-list snapshots and `diffBlocks` reads "not in the snapshot" as "the user deleted it", so a snapshot taken before a row arrived from the cloud *deletes that row* on Ctrl+Z — on both devices. `reconcileBlocks` therefore reports `historyStale` and the editor resets the history. **Membership is not the whole test, and reading it as such left half the hole open**: `restore` rewrites *everything* that differs between the snapshot and the screen, so a remote edit to the TEXT of a row that already existed is undone the same way — Ctrl+Z on some unrelated edit puts the old version back over the other device's line and then uploads it. The flag is therefore "any row arrived different", with the bookkeeping that rewrites itself excluded (`updatedAt`, `changeSeq`, `cloudSeq`, `fromCloud`) — include those and every sync tick that touches this note throws the undo stack away for nothing. A row that was *protected* (caret inside, save in flight) took nothing, so it does not make the history stale either; its deferred retry is what reports it later. Losing undo depth is cheap, overwriting the other device's line is not.
- **A row's DOM is written by one effect and its caret placed by another, and only declaration order keeps them in that sequence.** In `BlockRow.svelte` the sync effect (which rewrites `el.innerHTML` when state and DOM diverge) is declared BEFORE the focus effect that consumes `focusCaret` through `rangeAtPlainOffset(el, offset)` — and that helper measures the LIVE DOM. Svelte runs one component's effects in creation order, so the caret always lands on the text the change just produced. Swap them and every caret handed in together with new text — the seam a join leaves behind, the anchor a `/` pick returns to — is measured against the OLD text, clamped to its end, and then thrown away when `innerHTML` is rewritten a moment later. Nothing fails loudly: the caret simply ends up somewhere else, which reads as "the editor moved my cursor" and gets blamed on the feature that set the offset.
- **What a backup file is allowed to lean on depends on which button is pressed, and a row that survives a conflict has to take its contents with it.** Three separate holes in the same import path, all of which produced data the user could not see. (1) `planMerge` skips a row that is identical to its local twin — correct, except when that row's NOTE was duplicated by a conflict: its rows were "already here", stayed attached to the local note, and the imported copy landed with a title and nothing else. `planTable` therefore takes a `mustCopy` predicate, and blocks force a copy whenever `noteRemap` has their `noteId` (notes are planned first, so that map is complete). A forced copy is deliberately NOT counted as a conflict: nothing changed on both sides, and the summary line means "two versions of this exist". The same hole is still open one level down — a row whose PARENT ROW was duplicated without its note changing — because closing it needs a second pass (the parent may come after the child in the file). (2) `validateBackup` counts the LOCAL ids as existing, which is right for merging and false for "Reemplazar todo", which clears those rows moments before writing the file's: `BackupDialog` revalidates without them and hides the button when the file does not stand on its own. (3) A parent in another note, or a cycle of parents, passed validation and then never appeared on screen — measured: `buildVisibleList` only walks down from the root, so nothing in a cycle (or hanging off another note's row) is ever reachable, and the rows exist in the database while being invisible. Both are now reference errors. The rule behind all three: **an import may not produce a row the user cannot reach**, whether it is a note without its contents or a row no walk from the root can find.
- **Two tabs of the app share one database and nothing else, so a write has to announce itself — and the announcement belongs on the same door as the change stamp.** Each tab holds its own copy of the open note in memory; measured before touching anything, the second tab never refreshed — not on a timer, not on regaining focus — so typing on that stale copy overwrote the other tab's row with no conflict, no warning and no way to notice. (The damage was bounded, and worth knowing when weighing this class of bug: only the rows the stale tab itself wrote were lost, because the writes are per-row — rows *added* on the other side survived.) `storage/tab-channel.js` posts on a `BroadcastChannel`, and the post is fired from the same Dexie `creating`/`updating` hooks in `db.ts` that stamp `changeSeq`, for the same reason the stamp lives there: every write to a synced table passes through, so a repository added later cannot forget to announce. Records arriving from the cloud announce too — to the *other* tab they are an outside change like any other, and skipping them only leaves it stale until its own sync tick. Receiving enters through `handleExternalChange`, the door the cloud and the agents already use, so the note updates in place under the reconcile rules above (a row with the caret in it still waits for the caret to leave — that is correct, and the first version of the e2e failed because it expected otherwise). **Two properties are what keep this from becoming a feedback loop, and both must survive any change here:** the channel does not deliver to the context that posted, and receiving triggers a READ, never a write, so a refreshing tab announces nothing. The post is coalesced (150 ms, trailing) because the hooks fire per row — an import would otherwise emit thousands — and that delay doubles as the margin that lets the Dexie transaction commit before the other tab reads; too early would cost one stale read that the next announcement corrects, never a bad write.
- **A link inside a contenteditable is ours to open, ours to find, and ours to strip — the platform does none of the three.** (1) **The browser never navigates it**: a click parks the caret, so opening is code (`BlockRow.handleEditableClick`). In an editable note, a plain click/tap now keeps that caret and opens the local actions from spec `042`; only **Abrir** or `Ctrl/Cmd+click` navigates. That visible button is the phone/tablet path a modifier-only design lacked. Pointer **MOVEMENT** still separates a click from dragging across the link, never whether text ended selected: `applyLink` calls `selectNode`, so a new link is already selected. `Ctrl/Cmd+K` has three deliberate routes: selected text edits/adds its URL, a bare caret inside an existing link opens its actions, and any other caret lets the app search handle the key. A read-only note keeps direct click/tap navigation and always sends `Ctrl/Cmd+K` to search. (2) **`window.open` is a silent no-op in the Tauri webview.** WebKit only asks about a new window if the app registered a handler (`wry`'s `if let Some(new_window_req_handler)`), and Tauri only installs one if the app asks — CopyNotes does not, so links died with no error in the desktop build, and had since the Ctrl+Cmd version shipped. Every external URL goes through `platform/openExternal`, which branches to a Rust command on desktop; that command **re-validates the scheme in Rust** rather than trusting the webview, because `open` launches files and applications, not just pages, and the allow-list also guarantees the argument cannot begin with `-`. (3) **`document.execCommand('removeFormat')` does not touch `<a>`** — the editing spec lists the elements it unwraps and the anchor is not among them — so "Quitar formato" cleaned everything else and left the link standing, exactly as it had since the button existed while the user guide promised otherwise. `removeLinksInSelection` runs after it, and takes every anchor the selection *touches*, whole: half a linked word is a result nobody asks for and is harder to grab afterwards than the whole word. (4) **"Which link does this selection mean?" has two shapes and one door.** A caret *inside* the anchor is found by walking up; a selection covering the whole linked word has the ROW as its common ancestor and has to be found by looking *down*. The editor kept its own copy of that lookup that only walked up, so the moment marking the word became the way to edit a link, the popover opened with no address and no "Quitar", and re-applying wrapped an anchor inside an anchor. `anchorForRange` in `format/commands.ts` is the single door for reading, changing and removing; it demands the marked text match the anchor's exactly, because when text spills past the link the gesture is "link all of this", not "edit that one".
- **A floating panel opens because of a gesture the user made, not because of where the caret happens to be sitting.** The formatting toolbar had an escape hatch that opened it on a *collapsed* caret whenever it landed on formatted text — bold, italic, code, colour, link. Walking a row with the arrow keys therefore raised a panel over the text nobody had asked for, and it was reported as the toolbar "opening by itself". Inline size had already been carved out of that list for precisely this reason, with a comment saying so; the rule now covers every mark. Nothing is lost because the keyboard shortcuts never went through the toolbar (`handleKeyboardFormat` calls `runFormatCommand` directly) and a link cannot even be created from a bare caret — `applyLink` returns `false` without a range. The general shape: **an affordance that appears on state rather than on intent will appear at the wrong time**, and the fix is to tie it to the gesture (a selection, a click) that means the user wants it.
- **A full-width child in a row that is allowed to wrap takes a line of its own, and only on the phone.** The block row is `flex flex-wrap … md:flex-nowrap`, so on small screens `w-full` on the separator's surface could not sit beside the 16 px grip and the 20 px collapse slot and dropped below them: the row measured 64 px instead of 32, drawn as an empty band with the rule underneath. The editable text surface never had the problem because it asks for `min-w-0 flex-1` — "take what is left" — which is what any full-width sibling in a wrapping row wants. Worth remembering when reading a layout bug report as "just spacing": the desktop was correct throughout, so nothing was visible in review or in a desktop screenshot.
- **A login that comes back through the address bar is only as good as its error, and the two libraries involved hide theirs in different places.** Signing in with Google (spec `034`) leaves a one-use `code` in the URL, and the first build let supabase-js pick it up with `detectSessionInUrl: true`. That pickup runs inside the client constructor, where a failure is caught, logged nowhere and swallowed: a failed sign-in put the ordinary form back on screen with **no message**, indistinguishable from a trip the person cancelled. Two real sign-ins died that way before anything could be diagnosed, so `sync/supabase.ts` keeps `detectSessionInUrl: false` and the app exchanges the code itself (`completeGoogleSignIn` → `cloudAction` → `cloudError`) — the same call the desktop half needs, so phase 2 is a caller and not a second design. Two traps ride along. **The trip has a name**: supabase-js 2.111 marks each PKCE flow with `sb_flow_id` in the URL and stores one secret per flow, reading that id off `window.location.href` *at exchange time*; cleaning the address first silently demoted the exchange to the shared slot the library itself calls legacy, so the id is read with the code and handed over explicitly. And **`spanishError` must branch on the PKCE failure before the generic `/expired|invalid/`**, because the real message is "invalid request: both auth code and code verifier should be non-empty" — which otherwise reaches the user as the sentence about the 6-digit emailed code and sends them to look in their inbox. **The other half of that afternoon was not the code at all**: `connect-src` is computed in `vite.config.ts` when the dev server *starts*, so a `pnpm dev` left running from before `PUBLIC_SUPABASE_URL` existed serves a policy with no Supabase host, and every cloud `fetch` is blocked by the browser and surfaces as a connection error. `curl -sI http://localhost:5173/ | grep -i content-security` answers it in one command; restarting the dev server fixes it; production never sees it. **Corrección medida el 2026-08-17: no es sólo al arrancar.** El servidor lee esa política de `.svelte-kit/generated/server/internal.js` y la **recarga en caliente**, así que el build de e2e —que corre con `PUBLIC_SUPABASE_URL: ''` a propósito— se la reescribía a un `pnpm dev` que estuviera corriendo, sin reiniciarlo y sin imprimir nada. Correr la suite entre dos pruebas a mano dejaba la app sin nube, en silencio, con un `Failed to fetch` que apunta a la red. Arreglado con un `svelte-kit sync` (y su `unset`) después del build en `playwright.config.ts`; darle al build de e2e su propio `kit.outDir` se probó y **falla**, porque el plugin de PWA busca el precache en `.svelte-kit`. The asymmetry that makes it read like an app bug: **the OAuth user is created in Supabase anyway**, because that half travels by navigation — only the exchange, a `fetch`, dies.
- **Anything crossing into another language's syntax gets exactly one escaper, and anything arriving from outside is bounded before it is read.** Copy and note-export each carried their own `escapeHtml` plus their own fallback for a row with no stored `html`, and the two had already drifted: copy turned soft breaks into `<br>`, the export dropped them, so the same legacy row came out as two lines when copied and one when exported. Both now call `plainTextToHtml`/`escapeHtml` from `format/sanitize.ts` — the same pair the editor writes through, which is what makes `block.html` safe to feed to `innerHTML` in the first place. The generators' *shapes* stay separate on purpose (copy emits a loose subtree, the export builds a whole document); what was duplicated was the escaping, which is the part that can diverge without anyone seeing it. The same rule reaches past HTML: the Claude Code command in `bridge/mcp-config.js` is single-quoted with the POSIX `'\''` escape, because inside double quotes a home folder named with a `$(` in it executes when the person pastes the line (the other three clients build JSON or base64 and never touch a shell), and `platform/files.js` checks `file.size` against a 64 MB ceiling **before** reading, so a wrong pick cannot freeze the tab before anything can say what happened — surfaced as a `too-large` status rather than an exception, because the caller's existing `catch` said "this is not a backup", which sends the person looking in the wrong place.

- **Un camino que sólo existe con un diálogo del sistema de por medio no lo cubre ningún e2e, y "no pasa nada" nunca puede ser un resultado posible.** `platform/files.js` abría un `<input type=file>` y usaba el `focus` de la ventana para decidir que la persona había cancelado. Pero al cerrarse un diálogo nativo el foco vuelve **antes** de que llegue el archivo, así que la heurística le corría una carrera al sistema operativo: con 100 ms perdía en Chrome, con 1500 ms perdía en iOS (que copia el archivo desde iCloud antes de entregarlo). **Cualquier plazo es el plazo equivocado**; cancelar lo dice el navegador con su evento `cancel` y nadie más. Lo grave no fue la carrera sino su forma de fallar: cancelar es *no hacer nada*, indistinguible de "todavía está pensando". Y ningún test podía verlo — Playwright entrega el archivo con `setFiles`, sin diálogo nativo, así que la ventana nunca pierde el foco y ese código no se ejecuta; en la `.app` tampoco fallaba (otro motor, otro orden de eventos). Un camino así se prueba en jsdom despachando los eventos a mano (`platform/files.test.js`). Y todo tramo que pueda tirar una excepción entre "la persona apretó" y "la pantalla contestó" va envuelto: una excepción suelta ahí se va al vacío y la app se queda muda.
- **La web puede quedarse en una versión vieja sin decir nada, y eso hace perseguir bugs ya arreglados.** El service worker usa `registerType: 'autoUpdate'`: el nuevo se activa y toma el control de la pestaña abierta, pero el JavaScript ya cargado sigue siendo el viejo hasta que la página arranque de nuevo. Una pestaña que no vuelve a cargar de verdad —en un celular, días— se queda atrás en silencio. Costó tres rondas de diagnóstico y dos arreglos publicados descubrir que el teléfono corría código de antes. Por eso el cambio de control **ofrece** un cartelito con *Actualizar* (`pwa/web-update.js`, con su guardia: el PRIMER control es la primera visita, no una versión nueva) y se pregunta una vez por hora, porque antes se preguntaba sólo al arrancar. No se recarga solo a propósito: cortar una frase a la mitad por una mejora que nadie pidió es peor que la versión vieja. **Antes de diagnosticar cualquier reporte de la web, descartar el código viejo**: comparar el hash del bundle servido contra `pnpm build`, o probar en una preview (otro origen, sin nada guardado).

## Un tipo de bloque nuevo se rechaza en MÁS puertas de las que parece

Un tipo que no puede viajar a todos lados —hoy `image`, cuyos bytes viven fuera de
la fila— tiene que ser rechazado o degradado en **cada proyección**, y las
proyecciones son más de las que uno lista de memoria. En la spec 041 se cerraron
dos de las tres puertas de entrada y **cinco de las seis de salida**; lo que faltó
no lo encontró ninguna revisión por tarea, porque cada una miraba su propio diff.

**Las tres puertas de ENTRADA** (por donde nace una fila que este aparato no creó):

| puerta | archivo | qué hace |
|---|---|---|
| portapapeles y atajos | `format/ingest.ts` | degrada a texto. **Cualquier página web puede escribir nuestro formato de portapapeles**, así que es una frontera de confianza, no una comodidad |
| archivo de respaldo | `export-import/schema.ts` | rechaza el archivo entero |
| lo que LLEGA de otra persona | `sync/shared-payload.ts` (`cleanSharedPayload`) | degrada a texto. **Ésta es la que se olvidó** |

La de arriba se olvidó porque las otras dos se parecen entre sí y ésta no: la
salida del caño compartido es una **lista blanca** de campos, pero la entrada es
`{ ...payload }` — copia todo lo que mandó el otro. Una lista blanca que se olvida
un campo pierde una función; una lista negra que se olvida un campo es un agujero.

**Las seis proyecciones de SALIDA:** `copy/format.ts` (el portapapeles del sistema
— **ésta también se olvidó**), `note-export.ts` (que tiene CUATRO ramas: markdown y
html, cada una anidada y sin anidar), `bridge/export.ts` (el agente),
`snippets/snapshot.ts`, `sync/shared-payload.ts` (`toSharedPayload`, que tira), y
el respaldo. Escribí el texto de la proyección **en un solo módulo** y llamalo
desde las seis: en la 041 se duplicó dos veces antes de extraerlo.

Dos reglas más que costaron caro:

- **La lápida tiene que poder viajar igual.** `toSharedPayload` tira si la fila es
  una imagen viva, pero NO si está borrada: una lápida no lleva píxeles, y tirar
  ahí traba esa nota para siempre sin salida desde la pantalla. Borrar el bloque es
  justo lo que destraba.
- **Un rechazo que tira necesita su paraguas por nota.** Lo que tiraba
  `pushSharedNote` se escapaba del lazo y le caía a `syncNow`, que llama al caño
  compartido ANTES del cifrado ⇒ **una sola fila envenenada abortaba el ciclo
  entero, cada 30 segundos, para siempre**, con el aviso genérico y sin decir cuál
  nota. Un `try`/`catch` por nota; el ciclo sigue.

## Un caño de sincronización nuevo le debe cinco cosas al respaldo

Cada caño (la nube cifrada de la spec 030, el compartido de la 038, y lo que venga
después) le agrega campos a las filas y estado a las preferencias. El respaldo tiene
**cinco listas** que hay que tocar, y olvidarse de una no rompe nada hasta que
alguien necesita su respaldo. El caño 1 acertó las cuatro que existían entonces; el
caño 2 acertó tres de cinco, y **los dos errores los encontró una persona probando a
mano, semanas después de shippear**. Acordarse no es un mecanismo (spec 040).

| lista | si se la olvida |
|---|---|
| `LOCAL_ONLY_FIELDS` (`export-import/schema.ts`) | el archivo hace afirmaciones sobre un servidor en nombre de otro aparato. **El caño 2 se olvidó de `share`.** |
| `BACKUP_TABLES` (mismo archivo) | una tabla de este aparato se filtra a un archivo en claro, o una tabla con datos del usuario se borra en silencio en cada restauración |
| `SETTINGS[clave].backupSafe` (`storage/settings-registry.ts`) | restaurar un archivo le regala a un aparato permisos, cursores o una cuenta que nunca tuvo |
| `resetCloudState()` (`sync/leave.ts`) | "Empezar de nuevo la nube" deja atrás el estado del caño anterior |
| `BIRTH_DEFAULTS` (`storage/shape.ts`) | el caño escribe filas incompletas y **el respaldo que ese aparato exporta no se puede importar**. El caño 2 también se olvidó de esta. |

Dos están mecanizadas y hay que dejarlas hacer su trabajo: `EXPORTED_FIELDS` (una
clave no declarada rompe `storage/backup.test.ts`) y el respaldo mínimo de
`export-import/schema.test.ts` (un campo obligatorio nuevo rompe la prueba). Las
otras tres son prosa: leelas.

**Y una excepción que parece un olvido y no lo es:** `imageBodies` (spec 041) no
está ni en `SYNCED_TABLES` ni en `BACKUP_TABLES`, **a propósito y por motivos
distintos**. Fuera de la sincronización porque `sync/records.ts` hace
`JSON.stringify` y un `Blob` se convierte en `{}` sin error. Fuera del respaldo
porque sus filas no son JSON — los bytes viajan en el paquete `.copynotes`, por su
propio camino. Cada ausencia obliga algo: la primera, que la parte B suba los bytes
aparte; la segunda, que "Reemplazar todo" limpie esa tabla **a mano**, porque el
borrado recorre justamente `BACKUP_TABLES` (y esa limpieza va DENTRO de la misma
transacción, o Dexie la rechaza por estar fuera de alcance). Agregarla a cualquiera
de las dos listas parece un arreglo y no lo es.

## Una pantalla que sigue viva a través de un login tiene que SEGUIR la sesión

Entrar a la cuenta pasa **adentro de la página que ya está cargada**. Cualquier
pantalla que lea la sesión una sola vez, al montarse, se queda con la respuesta de
antes y no hay nada que la despierte: no hay recarga, no hay re-montaje.

`CloudLifecycle.svelte` tenía la lección escrita para el websocket, y `InviteAccept`
la repitió igual (spec 038, gate del 2026-08-17): la tarjeta de invitación quedaba
clavada en "entrá a tu cuenta" **para siempre**, y el botón de aceptar no aparecía
nunca. La invitación es justo lo que la persona vino a hacer.

**La forma correcta es `onAuthStateChange`**, que además emite la sesión inicial, así
que una sola suscripción cubre los dos casos — y de regalo, cerrar sesión devuelve la
pantalla a su estado sin sesión.

## Un candado de sólo lectura no es el `contenteditable`

`contenteditable="false"` frena el tecleo y **nada más**. Todo lo que escribe sin
pasar por el teclado sigue abierto, y la lista es más larga de lo que parece: el menú
`⋯` del renglón, el tirador de arrastre, la casilla de tarea, `runFormatCommand` (los
atajos entran por ahí), **el evento `paste`, que llega igual a un elemento no
editable**, la barra de formato flotante, el chip de fecha, la cruz de las etiquetas
— y **el título de la nota, que es un `<input>` aparte** al que la marca no llega si
sólo se la pasó a las filas.

El gate de la spec 038 encontró cuatro de esas abiertas después de que la tarea
"buscar las otras puertas" se diera por hecha. La forma de no repetirlo es
**enumerar los llamadores de las puertas de escritura** (`grep` de `updateBlock`,
`createBlock`, `deleteBlock`, `setTaskChecked`, y los `on*` que `BlockRow` recibe) y
tachar uno por uno, en vez de probar lo que se le ocurre a uno.

Y **una barra de acciones que aparece con todos sus botones inertes es peor que no
tenerla**: promete algo que no va a pasar. Si el candado apaga lo que hay detrás,
apagá también lo que lo ofrece.

**Un candado con excepciones necesita un permiso aparte, no un `readOnly` más
flojo.** La parte B2 de la spec 038 abre dos de esas puertas —la casilla de tarea y
un ítem del menú `⋯`— porque tildar y comentar es cómo el invitado contesta. Se hace
con un prop propio (`guest`), no aflojando `readOnly`: así cada puerta que se abre se
lee en el diff como una decisión, y las que quedaron cerradas no se abren de arrastre.
Y **la prueba que abre una puerta lleva su control en la MISMA nota**, comprobando que
lo demás sigue trabado; sin eso, una siembra que no marque la nota como ajena hace
pasar las dos mitades sin probar nada.

## Un número que la pantalla muestra se calcula en UNA función

Dos veces el mismo día (spec 038, 2026-08-17):

- **La campanita.** `syncShared` devolvía cuántas filas cambiaron y **el llamador**
  decidía tocar `syncStatus.appliedVersion`. Apareció un segundo llamador y se la
  olvidó, así que aceptar una invitación traía la nota a la base y la lista no la
  mostraba hasta recargar — y no se arreglaba solo, porque la pasada siguiente ya no
  tenía nada que avisar. La campanita vive **adentro** de `syncShared`.
- **La cola.** `syncStatus.pending` son DOS colas sumadas (`countPendingUploads` +
  `countSharedPending`), y la suma estaba escrita a mano en `upload.ts` y en
  `SettingsDialog`. El segundo se quedó con la mitad. Como `countPendingUploads`
  devuelve 0 sin permiso de subir, para un **invitado** esa mitad es la cola entera:
  la pantalla le decía siempre cero. Una puerta, `countAllPending`.

**Devolver el número y confiar en que el llamador lo use es una regla que se rompe el
día que aparece el segundo llamador**, y no falla ruidosamente: falla mostrando algo
viejo, que nadie reporta como bug.

## Un tercer actor rompe toda condición binaria sobre `actor`

Hasta la spec 038 había dos: `'user'` y el agente. Al aparecer el invitado
(`member:<uuid>`), **cada `actor === 'user'` / `actor !== 'user'` del código pasó a
significar otra cosa**, y ninguno falla ruidosamente. Los tres que aparecieron, y no
estaban en ningún plan:

- **`agentNotesByBlock` filtraba `actor !== 'user'`**, y en el aparato del invitado
  `'user'` es EL DUEÑO: el invitado no veía ni uno de sus comentarios. La pregunta
  correcta es **"¿esto lo escribí yo?"** (`isMine`), no "¿lo escribió el usuario?".
- **`actorLabel` tenía dos respuestas** ("Vos" / "Agente") para tres actores, así que
  el invitado figuraba como el agente en Configuración › Agentes.
- **El botón "Rehacer" salía con `actor !== 'user'`**, o sea que ofrecía pedirle a un
  agente que rehiciera lo que tildó una persona. Nadie lo listó: era correcto por
  accidente mientras el agente fuera lo único que no era el usuario.

**Al agregar un actor, `grep` de `actor` completo y tachar uno por uno** — igual que
con las puertas del candado, y por el mismo motivo.

**Y el cuarto caso, que ese `grep` NO encuentra** (gate de B2, 2026-08-19): el
arreglo del primero —cambiar `actor !== 'user'` por `!isMine(...)`— se rompió a su
vez, en la misma función. `isMine` es correcto, pero la regla que lo usaba cargaba
una premisa que nadie escribió: *"no muestres lo mío **porque ya lo veo en otro
lado**"*. El dueño ve lo suyo en `block.note`; el invitado no tiene ese campo, así
que se quedaba sin ningún lugar donde mirar su propio comentario. **La regla no era
"no muestres lo mío" sino "no lo muestres dos veces".**

Se escapó con la regla de arriba ya escrita, y por un motivo que vale para la
próxima: **la condición no nombra a `actor`, nombra "lo mío"**. Un `grep` de `actor`
no la ve. Al agregar un actor hay que revisar además **toda condición que esconda
algo por ser propio**, y preguntarse dónde más lo ve ese actor — si la respuesta es
"en ningún lado", esconderlo lo deja escribiendo contra una pared.

Y **el agente se reconoce POR DESCARTE, nunca comparando contra `'agent'`**: el
`actor` de una línea del agente es el id del agente conectado
(`bridge/ingest.ts` › `resolveAgentActor`). Una prueba escrita con la palabra pasa
sin probar nada. La única puerta es `isAgentActor()` en `storage/share-names.ts`.

## Quién soy yo se pregunta al escribir, no se lee de un estado

`myMemberActor()` es asíncrona, así que un `$state` que la guarda vale `null`
durante el primer instante de la pantalla. Firmar con el respaldo `'user'` en esa
ventana **no es un detalle cosmético**: en una nota ajena `'user'` significa el
dueño, o sea que el comentario recién escrito aparece atribuido a la otra persona
hasta que el servidor lo corrija. Se resuelve en el momento de escribir, por una
puerta única (`actorParaEscribir()`), y **antes** de abrir la transacción de Dexie.

Lo destapó una captura de pantalla, no un test: ninguna prueba automática de esta
rama puede montar una sesión de Supabase, así que el caso sólo se ve mirando.

**Consecuencia para los e2e, que ya hizo perder una vuelta:** sin sesión, `myActor`
es nulo e **`isMine` da falso siempre**, así que una línea escrita en un e2e sale con
actor `'user'` y se lee como de la otra parte. Una aserción que ahí dice "marcó" y no
"marcaste" **puede estar bien**: antes de corregirla, medir qué puede producir ese
entorno. El par que sí discrimina es la MISMA línea mirada con los dos roles.

## Un campo que se DEDUCE no se compara, y su escritura no es un cambio

Desde la spec 038 §5, `block.checked` de una nota compartida es un **cache**: la
verdad está en la bitácora (las líneas `done`/`reopened`, ordenadas por el
`server_seq` que reparte el servidor). Un campo así arrastra tres reglas, y las tres
fallan en silencio:

1. **Sale de la comparación de "¿cambió algo?"** (`sameInAllowList`). Si se lo
   compara, el renglón del otro lado —que sigue llevando su valor viejo— llega
   "distinto" en cada pasada mientras esté dentro de la ventana de relectura, y **la
   nota abierta se refresca sola cada 30 segundos** sin que nadie haya tocado nada.
2. **Se escribe con `fromCloud`.** Es un cache, no una edición: sin la marca entra a
   la cola de subida, la otra punta lo baja, deduce, escribe el suyo, y los dos se
   rebotan la misma fila para siempre.
3. **Se deduce al final de la tanda, nunca por fila.** Una misma bajada puede traer
   la línea nueva y el renglón con el valor viejo; deducir cuando aterriza la línea
   —que es como se escribe de primera— deja ganar al que venga después.

Y la deducción tiene que poder decir **"no tengo opinión"** (un `null`, distinto de
`false`). Una tarea puede estar tildada por un camino que no deja línea —un respaldo
restaurado, un `[x]` pegado, una anterior a que existiera la bitácora— y ahí el cache
es el único dato que hay: deducir `false` la destilda sola.

**Al comprobar que la prueba discrimina, la mutación obvia puede no servir.** Acá
mover la deducción adentro del bucle sigue en verde (la última corrida ve todo); la
que la pone roja es la realista, deducir sólo cuando llega una línea. Si la mutación
no rompe nada, la que está mal puede ser la mutación y no la prueba.

## Toda pantalla intermedia ofrece la salida barata, y antes que la cara

Un flujo de varios pasos (entrar → bóveda → permiso → sincronizar) se escribe como
una pantalla por decisión, y eso es correcto. El defecto aparece en las pantallas
**del medio**: cada una ofrece lo que hace falta para AVANZAR y ninguna ofrece
volver, porque volver no es parte de ninguno de los pasos y por eso no tiene dueño.

Encontrado el 2026-08-17 corriendo el gate de la spec 038. Un aparato con sesión, en
una cuenta con bóveda y sin la llave local, veía exactamente dos salidas: pedirle el
código a otro aparato —que puede no existir— y **Empezar de nuevo la nube**, que
vacía el servidor. Cerrar sesión existía sólo en la cuarta pantalla, la de "todo
listo". Entrar con la cuenta equivocada dejaba encerrado, con lo único destructivo
de la pantalla como única salida visible — y desde un aparato sin notas ese botón se
lleva la nube entera.

Las reglas que deja:

- **La salida barata está en TODAS las pantallas del flujo, no sólo en la final.**
  Si una pantalla puede alcanzarse por error, tiene que poder abandonarse sin costo.
- **Va antes que la destructiva en el orden de la pantalla.** Si la única salida a
  mano borra datos, la pantalla está mal aunque el botón pida escribir BORRAR.
- **Si el mismo control hace falta en N pantallas, va en un `snippet` y no copiado.**
  Faltaba en tres de cuatro; copiado, la próxima pantalla nueva se olvida de la
  mitad. (`SettingsDialog.svelte`: `leaveButton()` / `leaveConfirm()`.)
- **Ninguna prueba automática cubre este panel**: el build de e2e no tiene nube
  configurada, así que `cloudConfigured()` da falso y la sección entera no se
  renderiza. Lo que encuentra estos agujeros es una persona usándolo.

## Lo que se hornea al compilar no se puede arreglar después, y no avisa

`import.meta.env.PUBLIC_*` (la nube) y el texto del `CHANGELOG.md` (las
novedades) **quedan grabados dentro del artefacto en el momento de compilar**.
No se leen en runtime y no se pueden editar en la release ya publicada.

Eso convierte una variable ausente en un defecto **silencioso**: la `v0.2.0` se
compiló en GitHub sin las `PUBLIC_SUPABASE_*` —viven en el `.env` local, que no
se versiona— y salió sin nube. Compiló, se firmó y se publicó **sin una sola
advertencia**; se descubrió cuando un humano abrió Configuración › Nube y leyó
*"esta copia de CopyNotes no tiene una nube configurada"*.

La regla que deja: **todo lo que se hornea se comprueba antes de compilar, en un
paso que corta.** El workflow tiene una guardia que exige el `pubkey`,
`createUpdaterArtifacts` y los cuatro secretos, y falla en segundos en vez de a
los 25 minutos. Cualquier variable de build nueva **se agrega a esa guardia en el
mismo commit que la introduce**.

Corolario para verificar: **un `grep` vacío sobre un artefacto no prueba nada
hasta que el método se valida con un control positivo.** Tauri embebe el frontend
comprimido dentro del ejecutable, así que buscar la url de la nube ahí da cero
aunque esté. La comprobación que sirve es reproducir el entorno del runner
(`mv .env` aparte, variables sólo en el entorno, build, mirar la salida).

Detalle completo en `docs/arquitectura-publicacion.md`.

## Quality Bar

A feature is not done until: the app runs without errors; risky logic has Vitest tests; critical flows have a Playwright check (convention: NO component-test layer — pure Vitest + Playwright only, spec 013); relevant docs/specs updated (user guide per `docs/guia/` rule in CLAUDE.md); nothing unrelated broke; data-loss risk was considered. Extra care in high-risk areas: persistence, import/export/backup restore, nested hierarchy, reordering, copy formatting, tags/search.

Three rules about reading the suite, all learned by getting them wrong. **A test that fails SOMETIMES may be a bug that happens sometimes** — the date-panel case was explained away twice as harness noise ("the wait ran out", then "it measures mid-adjustment") before a poll held the bad value for five full seconds and settled the question; before calling any red "flaky", make the failing state *persist* or reproduce the exact geometry, and if you cannot decide, park the test with `test.fixme` and the evidence rather than leaving a red that trains everyone to ignore reds. **A red run is a claim, not a verdict** — before blaming a change (or excusing it as "already broken"), run the *same* `--repeat-each` command on the base commit and on yours and compare the rates; a single failure proves neither. **How long a test took to fail names its cause**: sub-second is an assertion failing, five seconds is a wait running out, and they lead to opposite investigations. And the standing trap behind most load-dependent flakes here: **the app is served prerendered, so its buttons exist in the HTML before the code is attached to them, and a click in that window is silently dropped** — an e2e test must wait for a post-boot signal (the seeded note's title) before touching anything, not just for `goto` to return.

**Y un rojo MASIVO casi nunca es el código.** 172 de 172 tests fallaron una vez con
"element(s) not found" en todo: el `webServer` de Playwright tiene
`reuseExistingServer` y había reusado un `pnpm preview` de otra sesión que servía un
`build/` inexistente. Ante un rojo total, medir el entorno antes de leer el diff:
`lsof -iTCP -sTCP:LISTEN -n -P | grep node`, matar lo viejo, volver a correr. Lo mismo
vale para `pnpm dev --host`, que se corre de puerto solo (5173 → 5174 → 5175) y deja
mal la URL que le pasaste a alguien.

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
| Sign in with Google: web (phase 1), desktop loopback (phase 2) | `034` |
| Restoring a backup when the cloud is on (measured: 1 conflict per row) | `039` |
| The backup contract: a file the app produced always imports | `040` |
| Screenshots in notes: paste, local bytes, `.copynotes` package, encrypted upload | `041` |
| Editable links + single-row selection | `042` |
| Entering a row (zoom): the view has a root, and every edge rule follows it | `043` |

Sin spec numerada, pero con documento propio:

| Topic | Where |
|---|---|
| Publicar el escritorio: cómo funciona y por qué | `docs/arquitectura-publicacion.md` |
| Publicar el escritorio: los pasos | `docs/release-checklist.md` §5 |

Every meaningful feature gets a numbered spec (Objective / What enters / What does not / Data / Flows / Acceptance / Tests / Agent notes). Read `AGENT.md` plus the relevant spec before implementing; never contradict this file.

## Agent-Controlled Development

The project must stay easy for AI agents to understand, modify, and extend safely: simple explicit architecture, clear feature boundaries, small focused modules, no clever abstractions, decisions documented in specs, tests around risky behavior. Agents drive development; the app itself exposes no AI to end users.
