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
- **Lo que toco yo**: un texto y la guía —los otros dos que iba a escribir ya
  estaban escritos, y uno de ellos habría sido mentira—. El clic del permiso **se queda**
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

## Prerequisite: the domain, decided 2026-08-11

**A real domain has to be in place before anyone is invited** — Hernán decided
this on 2026-08-11, and it is a prerequisite of *spreading the word*, not of this
spec's gate. Publishing the Google app and running the stranger round trip work
fine on `copynotes-beta.vercel.app` today.

Google is not the reason. Google never sees the CopyNotes address: the redirect
URI registered in the client is Supabase's callback, so changing the site's
domain changes nothing in the Google console. Two other things are:

1. **IndexedDB is per origin.** `copynotes-beta.vercel.app` and a future
   `copynotes.com` are two different boxes to the browser. Every note and — the
   expensive part — **the vault key** stay behind on the old origin. A person who
   follows the new address finds an empty app and an account that says it already
   has a vault, and needs a pairing code from a device that is really the same
   computer on the old address. For two people that is an afternoon; for a
   hundred strangers it is an incident. Moving before there are users costs
   nothing.
2. **Email can only be signed from a domain you own** (spec 037). Nothing can be
   sent from a `vercel.app` subdomain that Gmail will accept.

The move itself, when it happens: buy the domain, point it at Vercel, add the new
Site URL and Redirect URLs in Supabase. No code changes — `redirectTo` is
`window.location.origin`, and the desktop app returns through `127.0.0.1`.

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

### 3. The one text that is missing (only if the gate is clean)

This section was rewritten on 2026-08-11 after reading the screens instead of
remembering them. Two of the three texts planned here already exist, word for
word in spirit, and re-writing them would have been churn:

- **Signed out** already opens with *"Tus notas en más de un dispositivo… Sin
  cuenta, CopyNotes funciona igual."* (`SettingsDialog.svelte:541`). Nothing to
  do.
- **The permission step** already states what goes up, that it goes up
  encrypted, that the key does not, what the server still sees, and that this is
  unaudited beta (the `uploadTerms` snippet, `SettingsDialog.svelte:1130`).
  Nothing to do — and the third thing this spec first asked for, *"the permission
  can be withdrawn later"*, **must not be written**: there is no revoke button.
  The only exit is signing out, which drops the key. A screen that promises a
  door the app does not have is worse than a screen that stays quiet.

What is missing is the third one, and the reason it is missing is instructive.
The warning **does** exist — *"si este es tu único dispositivo, lo que ya subiste
deja de poder abrirse"* — but it lives inside the **Cerrar sesión** confirmation
(`SettingsDialog.svelte:821`), a panel a happy new user never opens. The person
who most needs it, the stranger who just made a vault on their only phone, is
exactly the person who will never see it.

So: **one line in the signed-in state**, inside the "Sumar un aparato" box,
saying the key exists only on this device and naming the two exits that already
exist — a second device (which is a second copy of the key) and the file backup.
One place, no new state, visible to every signed-in device from the moment the
vault is born.

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
   and what it buys — **already true**, verified at `SettingsDialog.svelte:541`.
6. The permission step states what goes up, that it is encrypted, and that the
   key does not — **already true**, verified in `uploadTerms`. No claim of a
   revoke that does not exist.
7. In the signed-in state, without opening any confirmation panel, the screen
   states that the key exists only on this device and names both exits (a second
   device, the file backup).
8. `docs/guia/18-nube.md` says the same thing in the same words, and the index
   date is updated.
9. Unit and e2e suites stay green (1013 / 160 at the time of writing).

## Minimum tests

The e2e suite runs against a build with no Supabase project on purpose
(`playwright.config.ts`), so every screen this spec touches renders as "no hay
nube configurada" there. That is a fact about the harness, not a reason to skip
verification:

- **The stranger round trip** (criteria 1-4) is manual, once, and is the real
  test. It cannot be automated without giving CI a Google account.
- **The missing line** (criterion 7) is verified by screenshot of the signed-in
  Nube section, read back, per the project's standing rule that green tests do
  not see composition. Criteria 5 and 6 were verified by reading the source on
  2026-08-11 and need no further work.
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
