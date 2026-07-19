# 025 - macOS Desktop Readiness

## Objective

Prepare CopyNotes for a future Tauri 2 macOS wrapper without adding Tauri or
native dependencies yet. This stage protects user text first: closing,
exporting, or importing must never race with a pending save.

The result should keep the current web/PWA experience unchanged while giving a
future desktop shell a small set of explicit integration points.

## Core Decisions

- The first desktop version keeps Dexie/IndexedDB. Do not migrate to SQLite or a
  Rust database without a proven product need.
- The PWA and the desktop app have separate local storage containers. The
  supported first migration path is: export a CopyNotes JSON backup in the PWA,
  then import it in the desktop app.
- A single pending-write barrier is the source of truth before database
  snapshots, imports, and future native window close events.
- UI code uses CopyNotes file and clipboard utilities. It does not choose
  browser or Tauri APIs itself.
- PWA lifecycle code runs only in the web/PWA runtime, never inside Tauri.
- WebKit coverage is required because Tauri on macOS embeds the same browser
  engine family as Safari.
- The permanent Tauri identifier and minimum macOS version are frozen in the
  Tauri scaffold stage, before the first build is shared outside the team.

## What Enters

- A registry for pending writes and editor flush functions.
- Tracking for every repository write that can be started from the UI.
- A reusable `settlePendingWrites()` barrier.
- Barrier use before full backup snapshots, note export, merge import, and
  replace-all import.
- One read transaction for a consistent full-database backup snapshot.
- Journal replay that removes its recovery copy only after every valid entry
  was written successfully.
- An asynchronous platform file contract for save and open operations.
- One clipboard path for rich block copy and plain selected-text copy.
- Central web/Tauri runtime detection.
- A focused Playwright WebKit readiness project.
- User-guide updates for the stronger backup behavior.

## What Does NOT Enter

- No `src-tauri` directory.
- No Rust toolchain or Tauri packages.
- No native file dialog, clipboard plugin, updater, or window-close listener.
- No signing, notarization, DMG, or App Store work.
- No automatic transfer of browser data into the desktop container.
- No storage-engine migration.
- No editor rewrite or unrelated product feature.

## Data And Safety Rules

### Pending-write barrier

Every repository mutation registers its complete operation when it starts and
unregisters only after it succeeds or fails. The editor also registers its
debounced-save flusher.

`settlePendingWrites()` must:

1. Ask every registered flusher to start its delayed saves now.
2. Wait for those flushers.
3. Wait for all tracked repository writes, including writes started while the
   barrier was already waiting.
4. Reject if a save fails, so callers never report a successful export or
   continue into a destructive import after a failed save.

The future Tauri close handler will call this same barrier before allowing the
window to close.

### Backup snapshot

A full dump first settles pending writes, then reads every backup table inside
one read transaction. This creates one coherent point-in-time snapshot instead
of combining tables read at different moments.

### Recovery journal

The local recovery journal stays until replay succeeds. Replaying the same
field updates more than once is safe; deleting the only recovery copy before a
failed replay is not.

### Platform files

The public file contract is asynchronous even though browser downloads start
immediately. Save returns a status (`saved` or `cancelled`); open returns either
the selected file name and text or `cancelled`. This allows a future Tauri file
dialog to be added without changing screens or export/import logic.

### Runtime identity

Runtime detection lives in one small platform module and returns `web` or
`tauri`. Backup metadata maps those values to `pwa` or `desktop`. Components do
not inspect Tauri globals independently.

## User Flows

- User types and immediately exports a full backup: the last characters are in
  the downloaded file.
- User types and immediately exports the current note: the last characters are
  in the Markdown or HTML file.
- User imports or replaces data while a delayed save exists: CopyNotes finishes
  that save before reading or replacing the database.
- While an import is being applied, its dialog cannot close and expose the old
  editor. It closes only after the restored data has loaded on screen.
- User cancels a file chooser: nothing changes and no success message appears.
- User reloads after an interrupted save: the journal replays and is cleared
  only after recovery succeeds.
- User opens the PWA: offline/install lifecycle continues as today.
- Future user opens the Tauri app: PWA registration and install prompts do not
  run there.

## Acceptance Criteria

- Every UI-reachable repository mutation is tracked as one complete operation.
- The editor's delayed title, block content, and block-note writes can be
  flushed from outside the editor.
- Full backup, current-note export, merge import, and replace-all import wait
  for pending writes.
- Import writes and sidebar-order normalization commit or roll back together;
  the import dialog stays locked until the refreshed editor is ready.
- Full backup reads all tables in one read transaction.
- A failed journal replay leaves the journal available for the next launch.
- All file save/open operations used by the UI go through the platform file
  contract and are awaited.
- All clipboard writes go through the CopyNotes clipboard utility.
- Tauri runtime detection prevents PWA lifecycle components from mounting.
- Existing Chromium checks still pass.
- A focused WebKit run covers app boot and an immediate-write backup.
- No Tauri or Rust dependency is added in this stage.

## Minimum Tests

- Vitest: the barrier runs flushers and waits for tracked writes started during
  settlement.
- Vitest: a failed tracked write makes the barrier reject.
- Vitest: journal success clears recovery data; replay failure keeps it.
- Vitest: a database dump waits for a pending write and includes its result.
- Vitest: backup metadata identifies PWA and desktop sources correctly.
- Playwright Chromium: existing critical flows remain green.
- Playwright WebKit: app boot plus typing and immediately downloading a backup
  includes the latest title and block text.

## Next Stage: Tauri Scaffold

After this spec is complete:

1. Install the stable Rust toolchain and Tauri 2 prerequisites.
2. Choose and freeze the permanent app identifier and minimum supported macOS.
3. Create `src-tauri` with `frontendDist` pointing at the static Svelte build.
4. Add only the native capabilities needed for file save/open, clipboard write,
   and controlled window close.
5. Call `settlePendingWrites()` from the native close path.
6. Verify IndexedDB across close/reopen, app update, and schema migration.
7. Import a real backup created by the PWA.
8. Only then prepare signing, notarization, and distribution artifacts.

## Agent Notes

Data integrity outranks native polish. Do not start the Tauri scaffold while a
backup or close can still race with pending writes. Keep this seam small: the
future desktop shell should adapt platform capabilities, not fork the product
logic.

## Scaffold Roadmap Progress

Steps 1–5 landed in commit `7b70dcd` (toolchain, frozen identifier
`com.copynotes.app` + macOS min 13.0, `src-tauri` with `frontendDist ../build`,
`core:default` capabilities only, close-through-`settlePendingWrites`).

Steps 6–7 verified on 2026-07-19:

- **Step 6 — IndexedDB across close/reopen and update.** Built the release
  `.app`, launched it, and read the WKWebView store directly at
  `~/Library/WebKit/com.copynotes.app/WebsiteData/.../IndexedDB/IndexedDB.sqlite3`.
  It is the real Dexie database (`notes`, `blocks`, `folders`, `settings`,
  `snippets`, `tags`, `tagAssignments`; schema version 50 — the full migration
  chain executed inside WebKit). A content fingerprint of the `Records` table was
  byte-identical before close, after a clean Apple-Event quit, and after
  relaunch. Rebuilding the app as `0.1.1` (new binary, same frozen identifier)
  and reopening left the fingerprint unchanged, so data survives an app update:
  the container path is keyed by the identifier, not the binary. Schema
  migration itself is the same bundled JS covered by the Vitest/Playwright web
  suite; the observed v50 confirms it runs under WebKit.
- **Step 7 — import a PWA backup.** `e2e/desktop-import.spec.ts` runs on the
  WebKit project (Tauri's macOS engine family). One context exports a real PWA
  backup (`exportedBy.source === 'pwa'`); a second, empty context imports it
  through the normal Backup dialog, and the migrated note appears and survives a
  reload. GUI-driven import in the actual `.app` needs a human click (no native
  file dialog in this stage; the file `<input>` is used); the WebKit test is the
  automatable faithful proxy.

## Step 8 — Signing, Notarization, Distribution (deferred)

Not executed: no Apple Developer account is available yet, and it is not needed
to run the app locally (Gatekeeper allows a right-click → Open for an unsigned
build). Do this only when the app will be handed to someone else. Requirements
and steps:

1. **Apple Developer Program membership** (USD 99/year). Note the **Team ID**.
2. **Developer ID Application certificate** in the login keychain (created from
   Xcode → Settings → Accounts, or the developer portal). This is for
   distribution outside the Mac App Store.
3. **Sign** via Tauri: set the signing identity so `tauri build` signs the
   `.app` and `.dmg`. Either export `APPLE_SIGNING_IDENTITY="Developer ID
   Application: <Name> (<TeamID>)"` or add it under `bundle.macOS.signingIdentity`
   in `tauri.conf.json`. Enable the hardened runtime (Tauri does this for signed
   builds); add an `entitlements` plist only if a capability needs it.
4. **Notarize**: submit with `notarytool`, authenticating with either an
   app-specific password (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) or an
   App Store Connect API key (`APPLE_API_KEY`, `APPLE_API_ISSUER`,
   `APPLE_API_KEY_PATH`). Tauri can drive notarization during `build` when these
   env vars are present.
5. **Staple** the notarization ticket to the `.app`/`.dmg`
   (`xcrun stapler staple`) so first launch works offline.
6. **Verify** before sharing: `codesign -dv --verbose=4 CopyNotes.app`,
   `spctl -a -vvv -t install CopyNotes.app`, and `xcrun stapler validate`.

Known issue observed during step 6/7: `bundle_dmg.sh` failed on a back-to-back
rebuild because the previous CopyNotes DMG volume was still mounted. Before a
distribution build, ensure no `/Volumes/CopyNotes*` is mounted (`hdiutil detach`
if needed); the `.app` bundle is unaffected.
