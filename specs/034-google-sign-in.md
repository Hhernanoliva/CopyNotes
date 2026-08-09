# 034 - Sign in with Google

Created: 2026-08-08. Hernan approved **phase 1 (web)** in chat on 2026-08-08 and
asked for phase 2 (desktop) to start right after phase 1 is verified on the real
site, by signing out and repeating the round trip inside the `.app`.

**Phase 1 shipped 2026-08-09** (`main` = `0d5aca7`): built, the round trip driven
by hand against the real Google, the identity gate passed, and the button
verified on `copynotes-beta.vercel.app`. Phase 2 has not started. What the build
taught is folded back into the sections below — three items in "What enters" say
the opposite of what they said before it was built, and say why.

## En criollo (resumen para Hernán)

Entrar a la cuenta con un toque, en vez de tipear email y contraseña.

- **Google te da la puerta, no la llave.** La llave que cifra tus notas sigue
  viviendo en el dispositivo y el servidor no la ve nunca. Esto no toca el
  cifrado ni la sincronización.
- **Fase 1, la web.** Un botón "Entrar con Google" arriba del formulario de
  siempre. El email y la contraseña **no** se van: quedan como red.
- **Fase 2, la app de escritorio.** Es otra cosa: la `.app` no tiene barra de
  direcciones, así que Google no tiene a dónde devolverte. Se resuelve abriendo
  tu navegador y dejando a la app esperando la vuelta en su propia computadora.
  Ya tenemos las dos piezas que hacen falta, así que no suma dependencias.
- **Lo que hacés vos a mano** (media hora, una sola vez): crear el proyecto en
  Google Cloud y pegar dos valores en Supabase. Los pasos están más abajo, en
  "Manual configuration".
- **El riesgo a mirar de cerca:** entrar con Google puede crear una cuenta
  *nueva* aunque el email sea el mismo, y todo lo que está en la nube cuelga del
  dueño de la cuenta. Por eso el primer paso después de entrar es comprobar que
  tus notas siguen ahí. Si no están, no se perdió nada: están en tus aparatos, y
  hay una salida escrita abajo.

## Objective

Remove the account password from what a person has to remember and type.

Two concrete complaints answer to this:

- There is no "I forgot my password" (`src/lib/sync/supabase.ts` says so on
  screen: *"por ahora no hay 'olvidé mi contraseña'"*). A lost password today is
  a lost account, and the notes in the cloud with it.
- Typing a password on a phone keyboard is the worst moment of the product, and
  the phone is exactly where a second device gets added.

What this does **not** do: give anybody the vault key. The account and the
encryption are two separate secrets by design (spec 030, decision D2), and this
spec does not move that line by a millimetre.

### Why this lands before the vault change

The vault work planned next (passphrase-derived key) ends in a **full re-upload**
of the account. Every row in `records` and `vaults` hangs off `owner_id`, which
is the auth user id. Signing in with Google can produce a *different* auth user
even for the same email address (see "Identity linking" below).

Doing Google first means any identity change happens while the cloud is still
disposable, and the vault migration's re-upload lands once, on the identity that
stays. The reverse order risks migrating twice.

## What enters

### Phase 1 — Web

1. **`signInWithGoogle()` in `src/lib/sync/supabase.ts`**, next to the existing
   password and code doors. Calls
   `supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
   where `redirectTo` is `window.location.origin` — the app's own root, which is
   already in Supabase's allow-list (see "Manual configuration").

2. **PKCE, not implicit.** `createClient` gains `flowType: 'pkce'`. Two reasons:
   the authorization code never lands in a URL that gets logged or shared, and
   it is the same flow phase 2 needs on the desktop, so the desktop half is an
   extra caller and not a second design.

3. **`detectSessionInUrl` stays `false`, and the app does the pickup itself.**
   This reverses what the first version of this spec said, and the reason is
   worth keeping: with `true`, supabase-js exchanges the code inside the client
   constructor, where a failure is caught, logged nowhere and swallowed. Built
   that way it shipped a login that, when it failed, showed the ordinary form
   again with **no message at all** — indistinguishable from a cancelled trip.
   `completeGoogleSignIn(code, flowId)` in `supabase.ts` calls
   `exchangeCodeForSession` explicitly, `SettingsDialog` routes it through
   `cloudAction`, and the reason reaches the screen. It is also the same call
   phase 2 makes, which is what item 2 promised.

4. **The trip has a name, and it has to be handed over.** supabase-js 2.111
   marks each PKCE trip with `sb_flow_id` in the address bar and keeps **one
   secret per trip**, falling back to a shared slot it calls legacy when nobody
   names the trip. It reads that id off `window.location.href` at exchange time,
   so cleaning the address first left the exchange leaning on the legacy slot.
   The id is read together with the code and passed as
   `exchangeCodeForSession(code, { flowId })`.

5. **The URL is cleaned before the exchange, `sb_flow_id` included.** Both the
   code and the id are read into variables first, so nothing is lost, and the
   address bar never holds a `?code=...` that could survive into a bookmark, a
   share or a screenshot — not even for the length of a network call.

6. **The button** in `SettingsDialog.svelte`, in the signed-out branch, above the
   email field, with a divider and the word "o" between it and the existing
   form. Google's brand rules apply: their wordmark, their "G", the required
   label text ("Continuar con Google" is allowed and reads better in Spanish
   than "Iniciar sesión con Google"), minimum height, no recolouring. It routes
   through `cloudAction`, like every other cloud button, so failures land in
   `cloudError` and not in the console.

7. **Hidden on desktop until phase 2.** `isTauriRuntime()` from `$lib/platform`
   gates the button. A button that opens Google inside a webview with no way
   back is worse than no button.

### Phase 2 — Desktop (`.app`)

The webview loads bundled files (`frontendDist: ../build` in
`src-tauri/tauri.conf.json`), so the app runs on an internal address that no
redirect from the outside can reach. Same wall that killed the magic-link login
in spec 030 — `supabase.ts` records that decision.

The way through, **loopback**:

1. `signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true,
   redirectTo: 'http://127.0.0.1:<port>' } })` returns the Google URL instead of
   navigating to it.
2. A new Rust command starts a one-shot `std::net::TcpListener` on
   `127.0.0.1:0` (the OS picks a free port), and returns the port.
3. `openExternal(url)` from `$lib/platform` — already built and already used for
   the links inside a note — opens the system browser.
4. The person approves in their own browser. Google returns to Supabase,
   Supabase redirects to `http://127.0.0.1:<port>/?code=...`.
5. The listener reads the request line, answers with a small "ya podés volver a
   CopyNotes" HTML page, shuts down, and hands the code back to the frontend.
6. `supabase().auth.exchangeCodeForSession(code)` completes the login.

**No new dependency, in either half.** The listener is standard library, and the
browser is opened by the command that already exists (`open_external` in
`src-tauri/src/lib.rs`).

Rejected alternative: a `copynotes://` deep link. It needs
`tauri-plugin-deep-link`, a URL scheme registered in the bundle, and it only
works on an installed build — so it cannot be tested in `tauri dev`. Loopback
costs about forty lines of Rust and works the same in dev and in the bundle.

## What does not enter

- **No new npm or cargo dependency**, in either phase.
- **Email and password stay.** They are the fallback if Google is down and, until
  phase 2 ships, the only door in the `.app`.
- **No other provider.** No GitHub, no Microsoft — and no Apple, which is the one
  worth writing down so it is not re-argued in three months:
  - Sign in with Apple requires the Apple Developer Program (US$99/year). This
    project does not have it: the `.app` is signed ad-hoc, which is why macOS
    treats every build as a new application.
  - Apple's client secret is a signed credential that **expires after six months
    at most**. Login would break one day with nobody having touched anything.
  - Apple's "Hide My Email" returns a `@privaterelay.appleid.com` address.
    Identity linking is decided by the email, so a relay address does not just
    risk a second account — it guarantees one. That is precisely the failure this
    spec is sequenced to avoid.
  - Apple hands over the name and email **only on the first authorization**. A
    failure at that moment is unrecoverable without the person revoking the app
    in their Apple ID settings.

  Revisit when CopyNotes goes to the App Store: guideline 4.8 makes Sign in with
  Apple mandatory once any third-party login is offered, and the Developer
  Program is already paid for by then.
- **No account-linking screens.** No "connect your Google account to your
  existing CopyNotes account" flow. Supabase either links by email or it does
  not; the app reports what happened and does not try to repair it.
- **Nothing about the vault, the recovery code, encryption or sync changes.** Not
  one line of `vault.ts`, `records.ts`, `upload.ts` or `download.ts`.
- **No sign-in with Google on mobile as an installed app.** The phone uses the
  web, which phase 1 covers.

## Model of data affected

Nothing in IndexedDB changes. No table, no field, no migration.

What changes is **which account owns the cloud rows**:

- `records.owner_id` and `vaults.owner_id` both default to `auth.uid()` and are
  filtered by it in every policy (`supabase/schema.sql`).
- If Google resolves to the **same** auth user, nothing at all happens: the rows
  are already his.
- If Google creates a **new** auth user, the old rows stay under the old id and
  become invisible to the new session. Nothing is deleted, and no local note is
  touched — the device keeps every note in plaintext, as always.

### Identity linking

Supabase links a new OAuth identity to an existing user when the email matches
**and** the existing identity's email is confirmed. This project runs with
"Confirm email" off, which marks sign-ups as confirmed, so linking is the
expected outcome — but "expected" is not "verified", and the cost of being wrong
is a cloud that looks empty.

So it is a **gate, not an assumption**: before the first Google sign-in, write
down the current user id from Supabase › Authentication › Users. After it, count
the users. One user, same id: linked. Two users: not linked.

If it did not link, the recovery is already the plan: the notes are on the
devices, and the vault work that follows re-uploads everything onto the
identity that stays. The old user's rows are then deleted from the Supabase
panel, once, by hand.

## Manual configuration (once, by Hernán)

**Google Cloud Console**

1. Create a project (or reuse one).
2. *APIs & Services › OAuth consent screen*: External. App name "CopyNotes",
   support email, developer email. Scopes: `email`, `profile`, `openid` — all
   three are non-sensitive, so no verification review is needed. Publish the app
   (leaving it in Testing mode limits it to explicitly listed accounts).
3. *Credentials › Create credentials › OAuth client ID › Web application*.
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   — the Supabase callback, **not** the CopyNotes address. Copy the client id
   and the client secret.

**Supabase dashboard**

4. *Authentication › Providers › Google*: enable, paste the client id and
   secret.
5. *Authentication › URL Configuration*: Site URL =
   `https://copynotes-beta.vercel.app`. Redirect URLs must include the site URL,
   `http://localhost:5173/**` for development, and — for phase 2 —
   `http://127.0.0.1:*` for the loopback listener.

Nothing here goes into `.env`: the client secret lives only in Supabase, and the
app already has everything it needs (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`).

## User flows

### Web, first time

Configuración › Nube › **Continuar con Google** → the tab navigates to Google →
account chooser → back to CopyNotes with `?code=...` → supabase-js exchanges it
→ the URL is cleaned → the Nube section shows the signed-in state and continues
into the existing vault flow, unchanged.

### Web, returning

The session is already in localStorage; the button is not on screen at all. Same
as today.

### Web, cancelled or refused

Google returns `?error=access_denied`. The app shows *"No se completó la entrada
con Google."* in `cloudError` and leaves the email form exactly where it was.
Nothing is stored.

### Desktop (phase 2)

Configuración › Nube › **Continuar con Google** → the system browser opens →
approval happens there → the browser lands on a small local page that says the
app can be closed → the `.app` window already shows the signed-in state.

### Desktop, browser closed before approving

The listener has no session to hand back. After 3 minutes it shuts itself down
and the app shows *"No llegó la respuesta de Google. Probá de nuevo."* The port
is released either way — the listener is one-shot and its timeout is not
optional.

## Acceptance criteria

**Phase 1**

1. A signed-out person on the web sees "Continuar con Google" above the email
   form, and the same person on the `.app` does not.
2. Completing the Google round trip leaves a session, and Configuración › Nube
   shows the account email.
3. After the round trip the address bar shows no `code`, no `access_token` and
   no `error` — and neither does the browser history entry.
4. Cancelling at Google leaves the app signed out with a Spanish message and the
   email form untouched.
5. Email + password sign-in still works, unchanged, in both web and `.app`.
6. **Identity gate (manual, once):** after the first Google sign-in, Supabase ›
   Authentication › Users holds exactly one user and its id is the id noted
   before. If it holds two, phase 1 is still "done" — but the finding is written
   into the vault spec that follows, because it changes the migration.

   **Passed on 2026-08-09: it linked.** `hhernanoliva@gmail.com` kept its id
   (`c659c685-…`, noted before the attempt) and came out holding two identities,
   `email + google`. No new user. **The vault migration that follows is
   unaffected**, which is the whole reason this spec was sequenced first.

   One thing the gate does not protect against, learned by doing it: **the email
   in the account chooser must be the one the cloud account uses**, and that is
   read from the Supabase panel, never assumed. A first attempt picked a
   different personal address and Google correctly minted a separate user, which
   then had to be deleted by hand.
7. The CSP e2e test still passes and the console shows no CSP violation during
   the round trip.

**Phase 2**

8. In the built `.app`, "Continuar con Google" opens the **system browser**, not
   a window inside the app.
9. Approving there leaves the `.app` signed in without any copy-paste.
10. Closing the browser without approving leaves the app signed out, with a
    message, and no process listening on the port afterwards.
11. `cargo test` covers the listener's port handling and its refusal to accept a
    second request.

## Minimum tests

Automated tests cannot drive a real Google consent screen, and faking one would
test the fake. So the automated line is drawn at everything up to the redirect,
and the round trip itself is a manual gate (criteria 2, 6, 8, 9, 10).

- **Unit (`src/lib/sync/supabase.test.ts`)**: `signInWithGoogle` calls
  `signInWithOAuth` with provider `google` and `redirectTo` equal to the current
  origin; a Supabase error comes back translated into Spanish through
  `spanishError`, not raw.
- **Unit (`src/lib/sync/supabase.test.ts`)**: `completeGoogleSignIn` hands the
  code **and its `flowId`** to `exchangeCodeForSession`, and a failed exchange
  comes back as a Spanish sentence — the PKCE error says "invalid request",
  which without its own branch lands on the message about the 6-digit code and
  sends the person to look at their email.
- **Unit (new, `src/lib/sync/oauth-return.test.ts`)**: the URL cleaner strips
  `code`, `error`, `error_description` and `sb_flow_id` while preserving any
  other query the app might carry, and does nothing when there is nothing to
  strip. Pure function, no DOM.
- **E2E (`e2e/cloud-login.spec.ts`)**: the address bar comes out clean and the
  Spanish message appears — both run with or without a cloud project.
  **The button's own visibility cannot be tested here and no attempt should be
  made to**: the e2e build is deliberately made without a Supabase project
  (`playwright.config.ts` explains why), so the whole Nube section renders as
  "this copy has no cloud configured" and there is no button on screen. There is
  no component-test layer either (spec 013). What protects the button is the
  manual pass.
- **E2E (existing `e2e/security-csp.spec.ts`)**: unchanged and still green — the
  policy is not touched by this spec.
- **Rust (phase 2, `src-tauri/src/lib.rs`)**: the listener returns a free port,
  parses `code` out of a well-formed request line, rejects a request without a
  code, and stops listening after the first one.

## Agent notes

- **A cloud call that dies as "no se pudo conectar" on a dev machine is a CSP
  snapshot, not a network problem, and it will cost an afternoon to anyone who
  believes the message.** `connect-src` is built in `vite.config.ts` from
  `PUBLIC_SUPABASE_URL` **when the dev server starts**. A `vite dev` left running
  from before that variable existed keeps serving `connect-src 'self' ipc: …`
  with no Supabase host, so every fetch to the cloud is blocked by the browser
  and arrives as `Failed to fetch` — which `spanishError` correctly translates
  as a connection problem. Two Google sign-ins died there. The check is one
  command, `curl -sI http://localhost:5173/ | grep -i content-security`, and the
  fix is restarting the dev server. Production is never affected: Vercel rebuilds
  the policy on every deploy. Note the asymmetry that makes it confusing —
  **the OAuth user IS created in Supabase**, because that half happens by
  navigation; only the exchange, which is a `fetch`, dies.
- The prerendered shell has no server, so there is no `+page.server.ts` callback
  route to add and none should be invented. The code is picked out of the URL on
  the client, by the app itself — see "What enters" items 3 to 5 for why
  supabase-js is deliberately not the one doing it.
- `openExternal` (`$lib/platform`) and `open_external`
  (`src-tauri/src/lib.rs`) already exist and already validate the scheme. Phase 2
  reuses them; it does not add a second way to open a link.
- The loopback listener must bind `127.0.0.1`, never `0.0.0.0`: the second one
  accepts a connection from the network.
- Google's brand rules are enforced by Google, not by us, but a rejected consent
  screen is a bad afternoon. Their button assets and spacing rules are the
  cheapest way to be sure.
