# Registro público con Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any stranger with a Google account create their own CopyNotes account and vault unaided, and tell them — where they will actually read it — that the key lives only on that device.

**Architecture:** Almost nothing is code. Spec 034 already built the Google door for everybody; spec 036 measured that the server allows sign-ups, that the policies hang off `auth.uid()`, and that no allow-list exists. What is left is one switch in the Google Cloud console (Hernán, by hand), one round trip driven by a real outside account, and one line of copy in `SettingsDialog.svelte` plus its guide page.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind, Supabase auth, WebCrypto (untouched here). No new dependency.

## Global Constraints

- Spec: `specs/036-public-google-signup.md`. Read it before Task 1.
- Plain Spanish on screen, no jargon — the person reading it is not an engineer.
- Design tokens only (`text-muted-foreground`, `text-foreground`, …). No raw colours, no renaming shadcn tokens.
- Hand-written code is plain JavaScript style inside `.ts`/`.svelte`. No type annotations.
- Every user-visible change updates `docs/guia/` **in the same commit** (project rule), plus the "Última actualización" date in `docs/guia-de-uso.md`.
- Commits must carry **no agent traces** — no `Co-Authored-By`, no tool names. This repo deploys to Vercel from `main`.
- Suites must end green: unit **1013**, e2e **160**.
- No new dependency, no new table, no migration.
- Never write a promise the app does not keep. Specifically: there is **no** button to withdraw upload consent, so no text may say there is one.

---

### Task 1: The stranger gate (manual, no code)

**Files:**
- Create: none
- Modify: none
- Test: manual, plus one `curl` against the Supabase admin API

This task is a gate, not a change. If it fails, stop and fix what it exposes before Task 2 — the copy is worthless on a door that does not open.

**Interfaces:**
- Consumes: nothing.
- Produces: a written verdict (pass/fail per criterion) pasted into the conversation, and the new user's uid if it passed.

- [ ] **Step 1: Publish the app in Google Cloud (Hernán, by hand)**

Google Cloud Console → **Google Auth Platform › Público** → **Publicar**.

The three scopes this app requests (`openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`) are non-sensitive: no human review, no "unverified app" screen, no expiring authorization. Publishing is reversible in one click.

- [ ] **Step 2: Confirm the redirect URI (Hernán, same visit)**

**Google Auth Platform › Clientes** → the web client → *URIs de redireccionamiento autorizados* must read exactly:

```
https://ntwwrxnsdiriqitzjjbi.supabase.co/auth/v1/callback
```

Not a CopyNotes address. *Orígenes autorizados de JavaScript* stays empty. This field is the most common way this breaks and checking it costs five seconds.

- [ ] **Step 3: Record the "before" count of users**

Run (from the repo root, `.env` supplies the keys):

```bash
KEY=$(grep -o 'SUPABASE_SERVICE_ROLE_KEY=.*' .env | cut -d= -f2-)
curl -s "https://ntwwrxnsdiriqitzjjbi.supabase.co/auth/v1/admin/users?per_page=50" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['users'])); [print(u['email'], u['id'], u['created_at']) for u in d['users']]"
```

Expected today: `2`, listing `hhernanoliva@gmail.com` and `copynotes.app@gmail.com`.

- [ ] **Step 4: Run the round trip with an outside Google account**

On `https://copynotes-beta.vercel.app`, in a private window, with a Google account that is **not** Hernán's and has never signed in to CopyNotes:

1. Configuración (⚙️) › Nube › **Continuar con Google**
2. Approve at Google
3. Land back inside CopyNotes, signed in, **address bar clean** (no `?code=`)
4. Press **Crear bóveda y permitir subir**
5. Write a note
6. The status dot / "estado de tus datos" reports the change reached the cloud

If step 3 fails with "No se pudo conectar", this is production, not the dev server, so the spec-034 CSP trap does not apply — capture the browser console and stop.

- [ ] **Step 5: Verify from outside the screen**

Re-run the command from Step 3. Expected: `3`, the new one created today. Then read that user's identities (the list endpoint does not include them):

```bash
KEY=$(grep -o 'SUPABASE_SERVICE_ROLE_KEY=.*' .env | cut -d= -f2-)
curl -s "https://ntwwrxnsdiriqitzjjbi.supabase.co/auth/v1/admin/users/<uid>" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  | python3 -c "import sys,json; u=json.load(sys.stdin); print([i['provider'] for i in u['identities']])"
```

Expected: `['google']`. The two pre-existing users must be untouched.

- [ ] **Step 6: Write the verdict**

Report criteria 1-4 of the spec, each pass or fail, with what was seen. Nothing is committed in this task.

---

### Task 2: The line a new user will actually read

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte` (the signed-in branch, the "Sumar un aparato" box, around line 758)
- Modify: `docs/guia/18-nube.md`
- Modify: `docs/guia-de-uso.md` (the "Última actualización" date)
- Test: screenshot, read back

**Interfaces:**
- Consumes: nothing from Task 1 except its verdict (this task only runs if the gate passed).
- Produces: nothing other tasks consume.

**Why here and not elsewhere:** the warning already exists, but only inside the **Cerrar sesión** confirmation (`SettingsDialog.svelte:821`) — a panel a contented new user never opens. The "Sumar un aparato" box is in the plain signed-in state, visible from the moment the vault is born, and it is already the box about second devices. One line, one place, no new state, no new component.

- [ ] **Step 1: Read the surrounding block**

Open `src/lib/components/SettingsDialog.svelte` and read the signed-in branch (the final `{:else}` of the cloud section, roughly lines 755-790). The target is the paragraph inside the "Sumar un aparato" box that today reads:

```
Para ver estas notas en otro aparato, entrá con tu cuenta allá y escribí el código
que aparece acá.
```

That paragraph renders only when `pairingCode` is empty (no code on screen). The new line must render in **both** halves, so it goes above the `{#if pairingCode}`, right under the `<h4>`.

- [ ] **Step 2: Add the line**

In the `Sumar un aparato` box, immediately after `<h4 class="text-sm font-bold">Sumar un aparato</h4>`, insert:

```svelte
<!-- El aviso vivía sólo adentro de la confirmación de "Cerrar sesión", que es
     justo el panel que alguien contento nunca abre (spec 036). Acá lo lee todo
     el mundo, desde el momento en que existe la bóveda, y al lado de la salida
     que propone. -->
<p class="text-muted-foreground text-sm">
	La llave que abre tus notas existe <span class="text-foreground font-medium"
		>sólo en este aparato</span
	>. Sumar un segundo es tener una copia: si este se pierde o se rompe, lo que está
	en la nube se abre desde el otro. Si sólo vas a usar este, guardá de vez en cuando
	un <span class="text-foreground font-medium">respaldo a archivo</span> desde Respaldo.
</p>
```

Nothing else changes: no new state, no new import, no logic.

- [ ] **Step 3: See it**

Start the app and take a screenshot of the signed-in Nube section, both with and without a pairing code on screen:

```bash
pnpm dev
```

Then drive it per the `verify` skill and save the captures to the scratchpad, and **read the images back**. Green tests do not see composition — this is the only check that does.

Expected: the line sits under the "Sumar un aparato" heading, above the button, reads in plain Spanish, and does not push the button off a phone-width screen (check at 390px wide).

- [ ] **Step 4: Update the guide**

In `docs/guia/18-nube.md`, in the section about adding a device, state the same thing in the same words: the key exists only on that device, a second device is a copy, and the file backup is the other exit. Do not invent a third exit; there isn't one.

Then update the "Última actualización" date in `docs/guia-de-uso.md` to today.

- [ ] **Step 5: Run the suites**

```bash
pnpm test:unit run
pnpm test:e2e
```

Expected: unit 1013 passing, e2e 160 passing. Neither suite sees this text — the e2e build has no Supabase project on purpose, so the whole Nube section renders as "no hay nube configurada". They are run to prove nothing else broke, not to prove this worked.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte docs/guia/18-nube.md docs/guia-de-uso.md
git commit -m "feat(nube): decir dónde vive la llave donde alguien lo pueda leer

El aviso existía, pero adentro de la confirmación de Cerrar sesión: el panel
que una persona contenta con su cuenta nueva no abre nunca. Ahora está en la
caja de Sumar un aparato, al lado de la salida que propone, visible desde que
la bóveda existe."
```

---

### Task 3: Close it out

**Files:**
- Modify: `specs/036-public-google-signup.md` (the header, with the outcome)
- Test: none

**Interfaces:**
- Consumes: Task 1's verdict, Task 2's commit hash.
- Produces: the spec's closing note.

- [ ] **Step 1: Write the outcome into the spec header**

Under the "Created" paragraph of `specs/036-public-google-signup.md`, add what actually happened: the date the app was published, the outcome of the stranger round trip, the uid of the third user, and the commit that carries the copy change. Follow the style of specs 034 and 035, which record what the build taught, not just what it planned.

- [ ] **Step 2: Commit**

```bash
git add specs/036-public-google-signup.md
git commit -m "docs(spec): 036 cerrada — un desconocido entró solo y se hizo su bóveda"
```

- [ ] **Step 3: Ask before pushing**

Do not push. Report to Hernán: the branch state, both commit hashes, the gate verdict, and ask whether to push to `main` (which deploys to Vercel).

---

## What this plan deliberately does not do

- No GitHub sign-in button.
- No privacy policy or terms pages (needed only for Google brand verification, which puts the CopyNotes name and logo on the consent screen — deferred).
- No recovery code and no recovery passphrase. The single-device risk is now stated on screen; solving it is spec 030's passphrase-derived key and ends in a full re-upload of the account.
- No merging of the consent click into the Google button (rejected by Hernán, 2026-08-11).
- No rewrite of the signed-out intro or of `uploadTerms` — both already say what spec 036 first asked for, and one of the requested additions ("revocable") would have been false.
