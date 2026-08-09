# 035 - Passing the vault key between devices

Created: 2026-08-09. Designed with Hernán in chat the same day, right after spec
034 phase 2 shipped. It replaces the direction recorded on 2026-08-08 (derive
the key from a passphrase the person chooses) — that one was still on the table
when this conversation started, and the section "Why not a passphrase" says what
changed his mind.

Nothing here is built.

## En criollo (resumen para Hernán)

Sacar de la cabeza de la gente el código de 24 caracteres.

- **Hoy**: el primer aparato inventa la llave y te muestra un código para
  guardar. Nadie lo guarda. El día que sumás un segundo aparato, no lo tenés.
- **Con esto**: no hay nada que guardar. Cuando sumás un aparato nuevo, el viejo
  te muestra 8 caracteres que valen 10 minutos. Los escribís en el nuevo y las
  notas bajan. El código se usa y se tira.
- **Si no queda ningún aparato con la llave** (se rompió, te lo robaron), hay un
  botón: **Empezar de nuevo la nube**. Borra lo que hay en el servidor y vuelve
  a subir desde este aparato. Tus notas locales no se tocan nunca.
- **El servidor deja de guardar tu llave envuelta.** Hoy guarda una copia cerrada
  con el código; a partir de acá guarda sólo una marca de "esta cuenta tiene
  bóveda". Un secreto menos ahí arriba.
- **Lo que sí empeora, y no lo escondo**: para poder pasarle la llave a otro
  aparato, la llave se tiene que poder envolver. Hoy no se puede ni queriendo, y
  eso es una defensa que se pierde. Está explicado abajo, en "The cost".
- **Tu nube de hoy se borra una vez.** Las notas que hay ahí son de prueba (dicho
  por vos el 2026-08-09), así que no hay nada que cuidar: se vacía y se arranca
  limpio.

## Objective

Make a second device work without anybody having had to keep a secret.

The recovery code fails at the only moment it exists for. It is shown once,
weeks or months before it is needed, to a person who has no reason yet to care.
When the second device finally arrives, the code is gone — and with it the cloud
copy, because that is exactly what the code was holding up.

The replacement is not a better code. It is noticing that **the person always
has the first device in their hand when they set up the second one**, so the two
devices can talk to each other and nothing has to survive in between.

### Why not a passphrase

The direction agreed on 2026-08-08 was to derive the key from a "notes password"
the person chooses. It is a good design and it makes two rival vaults
structurally impossible, which is worth a lot. It was dropped for one reason:
a password is still something to remember, and a forgotten one is the same dead
cloud, only later. Passing the key between two devices the person is already
holding removes the memory step entirely rather than making it lighter.

What that costs, and what this spec pays for it, is written in "The cost" and in
"Empezar de nuevo la nube".

## What enters

### 1. The vault key becomes wrappable

`vault.ts` imports the key with `extractable: false` today, so the browser
refuses to hand its bytes to any script — ours included. That is what makes
passing it impossible, and it must change: new vaults are created with
`extractable: true`.

The wrapping itself is done with `crypto.subtle.wrapKey`, which exports and
encrypts inside the browser: the plaintext bytes never appear in a JavaScript
variable. That is a real difference from reading the key out by hand, and it is
the only reason this is acceptable at all.

**The cost.** Today a hostile script running inside the app could encrypt and
decrypt with the key but could not steal it. From here it could export it. The
things that keep such a script from running — the CSP built in `vite.config.ts`
and the HTML sanitiser every external input passes through
(`format/ingest.ts`) — are unchanged and are now load-bearing for one more
thing. This is a defence traded for a cloud that people can actually use, said
plainly rather than buried.

### 2. The pairing code

Eight characters from the Crockford base32 alphabet already used for the
recovery code (`vault.ts`), same forgiving normalisation: any case, any spacing,
`O`→`0`, `I`/`L`→`1`. Forty bits.

Forty bits is small on its own and large enough here, for reasons that only hold
together: the wrapped copy is on the server for ten minutes, the row is deleted
the moment it is used, an attacker needs to have breached the database *during*
those ten minutes to get the blob at all, and every guess costs a PBKDF2 at
600.000 rounds — the same cost the recovery code already pays. **If the expiry
or the delete-on-use ever go, the code length has to grow with them.**

### 3. `startPairing()` and `joinWithPairingCode(code)` in `vault.ts`

- `startPairing()` — generates the code, wraps this device's key with a key
  derived from it (PBKDF2, 600.000, fresh salt), replaces the account's pairing
  row, and returns the code and its expiry for the screen to show. Never returns
  key material.
- `joinWithPairingCode(code)` — reads the row, unwraps, and stores the key
  exactly as `restoreVault` does today. A wrong code fails here, in the
  browser's own authentication check, and leaves nothing behind: AES-GCM either
  opens or refuses, there is no "almost".

`restoreVault`, `normalizeRecoveryCode` as a public export, `getRecoveryBlob`
and the `encodeCode`/`CODE_BYTES` machinery for the 24-character code are
**deleted**. This spec removes more code than it adds.

### 4. `resetCloud()` — "Empezar de nuevo la nube"

Calls the new server function (below), then puts this device back to the state
of a fresh install *for the cloud only*: consent off, both cursors to zero,
parked conflicts cleared, every row's `cloudSeq` forgotten, the local vault
gone. That list already exists as `resetCloudState` in `sync/leave.ts` — this
reuses it rather than writing a second one.

Local notes are not touched. Not one row of `notes`, `blocks`, `snippets`,
`tags`, `tagAssignments`, `folders` or `activity`.

The screen asks for the word **BORRAR** typed by hand, not a second click. What
is lost is anything that lives in the cloud and not on this device, and the
screen says that in those words before the box appears.

### 5. Server (`supabase/schema.sql`)

- **`vaults` loses `salt` and `wrapped`, and gains a proof.** The wrapped copy of
  the key stops existing up there. What replaces it is one short known
  plaintext — the literal string `copynotes` — encrypted with the vault key:
  columns `iv` and `check_blob`. Anybody may read it and it opens nothing; the
  device that holds the right key can open it, and no other device can.

  **This is not decoration, and it was nearly missed.** The account's vault row
  is what answers "does this account already have a vault?", and its primary key
  is the owner, so a second insert comes back as `23505`. That one answer means
  two opposite things: *another device got here first* (stop everything) or
  *this is my own row from a previous run* (carry on). Today they are told apart
  by comparing the wrapped copy byte for byte — which is exactly what this spec
  deletes. Without a replacement, the choice would be between a device that
  never notices a rival vault and a device that accuses itself, which is the bug
  fixed in `a4c6e0d` (see "The bug this spec must not bring back").
  Opening the proof answers it properly: *my key opens this account's vault, so
  it is mine.*
- **New table `pairings`**: `owner_id` (primary key, so one live pairing per
  account), `salt`, `iv`, `wrapped`, `expires_at`. RLS: select, insert and
  **delete** your own row, nothing else — and the select policy carries
  `expires_at > now()`, so an expired row is invisible even to its owner and the
  expiry is the server's rule rather than a client's good manners. Asking for a
  second code deletes the first, in the same call; the device that finishes a
  pairing deletes the row it just used. No sweeper, no cron.
- **New function `reset_cloud()`**, `security definer`, deletes the caller's
  `records` and `vaults` rows and nothing else. A function and not a delete
  policy on purpose: `records` deliberately accepts no direct writes at all
  (everything goes through `push_records`), and opening a general delete would
  undo that. The owner filter is explicit inside, exactly as `push_records`
  does it, and `scripts/rls-check.mjs` attacks it.

### 6. Screens (`SettingsDialog.svelte`)

- **First device**: creating the vault no longer shows a code. One sentence
  instead: *"Tus notas se cifran en este aparato. Para verlas en otro, le vas a
  pedir un código a este."*
- **Signed in, vault ready**: a new **Sumar un aparato** button that reveals the
  code, big and monospaced, with the minutes it has left.
- **Signed in, no vault, account has one**: the box that today asks for the
  recovery code now asks for the pairing code, and says where to get it.
- **The dead end closes.** Today that box only renders when this device has *no*
  vault (`{:else if !vaultReady && accountHasVault}`), so a device holding a
  rival vault is told about the problem and offered no way out of it
  (diagnosed 2026-08-07). Both exits — ask the other device for a code, or start
  the cloud over — must be reachable from that state too.

## What does not enter

- **No QR.** It is the obvious next step and it is deliberately not in this
  spec: the QR would carry this same pairing code, so it is a camera reader
  bolted onto a finished path, not a second design. It also needs camera
  permission in the Tauri webview, which is its own afternoon.
- **No new dependency**, client or server.
- **Nothing about encryption of notes, sync, conflicts, or login.** No change to
  `records.ts`, `upload.ts`'s batching, `download.ts`, `conflicts.ts` or
  anything under spec 034.
- **No account-recovery for a lost cloud.** If every device is gone, the cloud
  copy is unreadable and the only move is starting over. That is the deal this
  product makes and the screens say it out loud.
- **No expiry sweeper.** One row per account, replaced on the next request; a
  stale row is a few hundred bytes that opens nothing after its expiry.

## Model of data affected

**IndexedDB**: today's vault row holds `{ id, key, salt, iv, wrapped, createdAt }`
and the last three were the recovery copy. New rows are `{ id, key, createdAt }`.

Existing rows are **deleted** by the migration rather than rewritten. Not a
shortcut: every key already stored is non-extractable, so it cannot be passed to
another device and cannot be re-wrapped — keeping it would leave a vault that
looks fine and quietly cannot do the one new thing. A device that comes out
empty is a device the screens already know how to talk to: it either pairs or
starts the cloud over. The notes on it are untouched and readable throughout.

**Cloud**: `vaults` loses three columns, `pairings` is new, `records` is
untouched.

**Hernán's own account**: emptied by hand, once, before any of this ships. The
notes in that cloud are test data (his words, 2026-08-09), so there is nothing
to preserve and no careful path to build for it.

## User flows

### First device

Configuración › Nube › entrar con Google → **Crear bóveda y permitir subir** →
the section shows the signed-in state and the sentence about the key. No code
screen, no "guardá esto".

### Second device

New device: Configuración › Nube › entrar con Google → *"Esta cuenta ya tiene
notas guardadas. Pedile el código al aparato donde ya las tenés."*
Old device: Configuración › Nube › **Sumar un aparato** → eight characters and a
countdown. Typed into the new one → the notes download exactly as they do today.

### Second device, code expired or mistyped

*"Ese código no es el que muestra el otro aparato."* or *"El código venció.
Pedí uno nuevo en el otro aparato."* Nothing is stored either way, and the box
stays where it was.

### No other device left

Configuración › Nube → **Empezar de nuevo la nube**, under the pairing box, in
small type. It says what disappears, asks for the word BORRAR, then empties the
cloud and re-uploads from this device.

### Two devices creating a vault at the same time

Unchanged where it matters: the first insert wins, the second is refused by the
primary key, and the losing device says so. What changes is that it now offers
the two ways out on the same screen.

## Acceptance criteria

1. Creating a vault never shows a recovery code, and no screen asks for one.
2. A device with the vault can produce a pairing code, and the code is shown
   with the time it has left.
3. A second device that types that code downloads and reads the notes.
4. A wrong code, and an expired code, each get their own Spanish sentence and
   change nothing on the device.
5. After a successful pairing the `pairings` row is gone from the server.
6. **Empezar de nuevo la nube** requires the typed word, empties `records` and
   `vaults` for that account only, leaves every local note untouched, and the
   device re-uploads afterwards as if newly installed.
7. A device holding a rival vault can reach both exits from the screen that
   reports the problem.
8. `scripts/rls-check.mjs` passes, including: account A cannot read or delete
   account B's `pairings` row, and `reset_cloud()` called by A deletes nothing
   of B's.
9. **Manual gate, two real devices**: pair, download, then start over from one
   of them and confirm the other reports the account has no vault.

## Minimum tests

- **Unit (`src/lib/sync/vault.test.ts`)**: wrap-then-unwrap returns a key that
  decrypts what the first one encrypted; a wrong code throws and stores nothing;
  the normaliser accepts case, spaces and dashes and the `O`/`0`, `I`/`L`/`1`
  substitutions; `createVault` returns no code.
- **Unit, with a fake clock**: the countdown the screen shows reaches zero at
  ten minutes and the button stops offering the code. This is the courtesy half.
  **The rule itself is server-side and is tested in `rls-check.mjs`**: a row
  whose `expires_at` has passed comes back as no row at all, to its own owner.
- **Unit (`src/lib/sync/leave.test.ts` or a new `reset.test.ts`)**: after
  `resetCloud()`, consent, cursors, conflicts, `cloudSeq` and the vault are all
  cleared and the note tables have exactly the rows they had before.
- **`scripts/rls-check.mjs`**: the two cross-account attacks in criterion 8,
  written as attacks, next to the existing seven.
- **E2E (`e2e/cloud-*.spec.ts`)**: the confirmation box refuses to enable the
  destructive button until the word matches. The pairing round trip itself is
  not e2e-able — it needs two browsers with two accounts' storage — and no fake
  should be built for it; criterion 9 is the manual gate.

## The bug this spec must not bring back

Found on 2026-08-09 while planning this work, fixed the same day in `a4c6e0d`,
and written down here because this spec touches the exact line that had it.

`uploadVaultBlob` remembers whether it already sent the vault row in a
module-level variable, which lives as long as the window does. Every app start
therefore retries the insert and collides with the row it left behind last time.
That collision was read as "another device created a vault first", so a healthy
device accused itself, threw before the first upload batch, and **stopped
syncing entirely from its second run onwards** — while showing a message that
sent the person looking for a recovery code they did not need. It is the state
Hernán's Mac was in on 2026-08-07 with 117 changes stuck, diagnosed then as a
race between two devices. There was never a second vault.

Two things follow for this spec:

1. The proof blob in `vaults` exists to answer that question, and any change
   that removes it has to answer it another way first.
2. `uploadVaultBlob`'s regression test (`upload.test.ts`, "no confunde su propia
   bóveda, de la corrida anterior, con la de otro") must survive the rewrite. It
   is the only thing standing between here and the same outage.

## Agent notes

- **Read `sync/leave.ts` before writing any reset.** `resetCloudState` already
  is the list of everything the cloud leaves behind on a device, it is already
  exercised by the account-switch path, and a second list would rot out of sync
  with it within a month.
- **`extractable: true` is the one line in this spec that weakens something.**
  If a future change makes the key derivable or the pairing unnecessary, put it
  back. It is not a detail to be copied forward without noticing.
- **Do not add an `upsert` to `vaults` while you are in there.** The `insert`
  and the primary key are what make the first vault win; the long comment in
  `upload.ts` explains what `upsert` did to the loser's records.
- The pairing row's expiry is enforced by the server (`expires_at` compared in
  the policy or in the read), never only by the client. A client-side check is a
  courtesy for the countdown, not the rule.
- `docs/guia/18-nube.md` is where all of this is explained to the user, and it
  changes in the same commit as the code, per `CLAUDE.md`. The whole "código de
  recuperación" section of that page goes away with the feature.
