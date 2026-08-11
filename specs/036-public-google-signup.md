# 036 - Opening sign-up to strangers

Created: 2026-08-11. Designed with Hernán in chat the same day. Spec 034 built
the Google door and closed it as done; this spec is about who is allowed to walk
through it, and what a person who has never met CopyNotes finds on the other
side.

Nothing here is built.

## En criollo (resumen para Hernán)

Hoy la puerta existe y funciona; falta abrirla al público y escribir bien los
carteles.

- **Lo que ya está y no se toca**: el botón "Continuar con Google" (web y `.app`),
  el alta con email y contraseña, y los permisos de la base. Nada en el código
  está atado a tu cuenta.
- **Lo tuyo, a mano, diez minutos**: publicar la app en el panel de Google. No es
  un trámite ni se paga; es un interruptor.
- **La prueba que manda**: una cuenta de Google ajena, que nunca entró, haciendo
  el recorrido entero en el sitio de verdad.
- **Lo que toco yo**: tres textos y la guía. El clic del permiso **se queda**
  donde está: es el momento en que autorizás que tus notas salgan del aparato, y
  no se regala por ahorrar un toque.
- **Lo que se dice y hoy no se dice**: que la llave vive sólo en ese aparato. Un
  usuario nuevo con un solo teléfono no tiene red. No lo arreglamos ahora; lo
  decimos.

## Objective

Let any person with a Google account create their own CopyNotes account and end
up with their own vault, without Hernán touching anything for them.

The gap is not code. Measured on 2026-08-11:

- `GET /auth/v1/settings` on the project returns `disable_signup: false`,
  `google: true`, `mailer_autoconfirm: true`. The server door is open.
- `supabase/schema.sql` hangs every policy off `auth.uid()`. A new owner needs
  no seeding, no row created by hand.
- Nothing in `src/` contains an allow-list, an email check or a hard-coded uid.
- Two users exist because two people have ever signed in, not because of a cap.

What is left is one switch in Google Cloud, one honest test, and the fact that
the screens were written for the two people who already knew what a vault is.

## What enters

### 1. Publish the Google app (manual, once, by Hernán)

*Google Cloud › Google Auth Platform › Público* → **Publicar**. The three scopes
this app requests — `openid`, `.../auth/userinfo.email`,
`.../auth/userinfo.profile` — are non-sensitive, so publishing needs no human
review, shows no "unverified app" screen, and grants no expiring authorization.
([Google: Manage app audience](https://support.google.com/cloud/answer/15549945))

While in there, confirm *Clientes* still holds the Supabase callback,
`https://ntwwrxnsdiriqitzjjbi.supabase.co/auth/v1/callback` — not a CopyNotes
address. That field is the most common way this breaks, and checking it costs
five seconds.

Left in Testing the app is capped at 100 hand-listed accounts. The basic-scope
exception means strangers may well get in anyway, which is worse than either
outcome: it works until it doesn't, for reasons nobody can see. Publishing
removes the question.

### 2. The gate: a stranger's round trip

Run **before** any text is written, because a failure here rewrites the rest of
this spec.

With a Google account that is **not** Hernán's and has never signed in, on
`https://copynotes-beta.vercel.app`:

Configuración › Nube › Continuar con Google → approve at Google → land back
signed in → "Crear bóveda y permitir subir" → write a note → the status line
says it reached the cloud.

Then, from outside the screen: the Supabase admin API lists a **third** user,
created today, whose identity provider is `google`.

### 3. The three texts (only if the gate is clean)

All in `src/lib/components/SettingsDialog.svelte`, in the Nube section.

1. **Signed out.** One line above the Google button saying what the cloud is for
   and that CopyNotes works without it. Today the section opens with a login form
   and no explanation, which reads as a wall to a person who does not yet know
   the account is optional.

2. **The permission step** (`!vaultReady` branch, the "Crear bóveda y permitir
   subir" button). Say the three things that decide it: the notes go up
   **encrypted**, the key that opens them **never** leaves this device, and the
   permission can be withdrawn later. The button keeps doing both halves in one
   press — `createVault` refuses to run without consent on purpose, and splitting
   them would let a vault exist whose wrapped copy never reaches the server.

3. **Right after the vault exists.** The key lives only on this device. Say it,
   and point at the two exits that already exist: "Sumar un aparato" (a second
   device is a second copy of the key) and the file backup.

### 4. The guide

`docs/guia/18-nube.md` updated in the same commit as the texts, per the project
rule. Same three ideas, in the same words the screen uses.

## What does not enter

- **A GitHub button.** Free and supported, but the audience is not developers; it
  would be a second door to maintain for almost nobody.
- **Privacy policy and terms pages.** Needed for Google's *brand verification* —
  the lighter review that puts the CopyNotes name and logo on the consent screen.
  Not needed to publish. Deferred to whenever the product opens for real.
- **A recovery code or recovery passphrase.** The single-device risk is stated,
  not solved. Solving it is spec 030's passphrase-derived key, which ends in a
  full re-upload of the account; it does not get smuggled in behind a text change.
- **Merging the consent click into the Google button.** Explicitly rejected by
  Hernán on 2026-08-11: a click saved is not worth turning "Continuar con Google"
  into "acepto subir mis notas".
- **Any onboarding outside Configuración › Nube** — no banner, no welcome screen,
  no invitation on the landing page.

## Model of data affected

None. No table, no column, no stored setting, no migration. The only persisted
things involved — `vaults`, `records`, the upload consent flag — already exist
and are already created per account by the flow this spec leaves untouched.

## User flows

**A stranger, web, first time.** Opens CopyNotes, writes notes, never signs in —
this already works and stays working. Later, Configuración › Nube, reads one line
saying the account is for having the same notes on a second device, presses
Continuar con Google, approves, comes back signed in, reads what the permission
covers, presses "Crear bóveda y permitir subir", sees that the key lives only on
this device and that a second device is how you get a copy.

**A stranger, `.app`.** Same, except the button opens the system browser and the
app waits (spec 034 phase 2). Unchanged by this spec.

**A stranger who prefers a password.** The email and password form below the
divider still creates accounts, immediately, with no confirmation mail. Its known
hole — there is no "forgot my password", and the screen says so — is unchanged.

## Acceptance criteria

1. The Google app's publishing status reads **In production**.
2. A Google account that never signed in before completes the round trip on the
   production site and ends signed in, with the address bar clean.
3. That account creates its vault and a note written afterwards reaches the
   cloud.
4. The Supabase admin API shows the new user with a `google` identity, and the
   pre-existing two users are untouched.
5. Signed out, the Nube section states in one line that the account is optional
   and what it buys.
6. The permission step states: encrypted upload, key never leaves the device,
   revocable.
7. After the vault is created, the screen states that the key exists only on this
   device and names both exits (second device, file backup).
8. `docs/guia/18-nube.md` carries the same three statements, and the index date
   is updated.
9. Unit and e2e suites stay green (1013 / 160 at the time of writing).

## Minimum tests

The e2e suite runs against a build with no Supabase project on purpose
(`playwright.config.ts`), so every screen this spec touches renders as "no hay
nube configurada" there. That is a fact about the harness, not a reason to skip
verification:

- **The stranger round trip** (criteria 1-4) is manual, once, and is the real
  test. It cannot be automated without giving CI a Google account.
- **The three texts** (criteria 5-7) are verified by screenshot of each of the
  three states, read back, per the project's standing rule that green tests do
  not see composition.
- **No new unit test is added.** Nothing here has branching logic; a test
  asserting the wording of a paragraph tests the paragraph against itself.
- The existing suites run and stay green (criterion 9).

## Agent notes

- Do not re-derive whether Supabase allows sign-ups; it was measured on
  2026-08-11 and recorded above. Re-measure only if the gate fails.
- `cloudVaultExists()` is what decides between "create a vault" and "join the one
  this account already has". A stranger's account has neither, so the create
  branch is the one every new user meets.
- The CSP trap from spec 034 is a dev-server-only failure and will not appear on
  the production site. If the gate fails with "No se pudo conectar", check
  `curl -sI <site> | grep -i content-security` before suspecting the code.
