# 037 - Asking before writing to anybody

Created: 2026-08-11, out of a question Hernán asked while planning spec 036:
whether the email addresses that arrive with a Google sign-in can be used to tell
people about CopyNotes.

Nothing here is built. This spec has four open decisions listed at the end; they
do not block writing it down, they block building it.

## En criollo (resumen para Hernán)

Con el botón de Google, el email de cada persona te llega **de arriba**, sin que
nadie te lo haya ofrecido. Esta spec es sobre no usarlo hasta que te lo ofrezcan.

- **Una casilla**, apagada, después de entrar: *"Quiero recibir novedades de
  CopyNotes"*. Nada más. Si nadie la toca, no tenés lista, y está bien.
- **Una página de privacidad** en el sitio, en castellano, que diga qué guardás,
  qué no podés ver (la llave), quién más toca los datos y cómo pedir la baja. Es
  la misma página que Google te va a pedir el día que quieras que su pantalla
  diga "CopyNotes" con tu logo en vez de una dirección de `supabase.co`.
- **CopyNotes no manda mails.** El envío se hace con una herramienta de afuera;
  desde acá sale sólo una lista de los que dijeron que sí.
- **Por qué la casilla y no la lista entera**: Gmail ya no te manda a "no
  deseados", te rechaza en la puerta si la gente te marca como spam. Una lista de
  cuarenta que aceptaron llega; una de doscientos que nunca pidieron nada te
  quema el dominio.

## Objective

Be able to tell people about CopyNotes without using a piece of data nobody
offered, and publish the privacy page that a product with accounts owes its
users.

Three separate walls make this the only sane shape:

- **Google's rules.** The Limited Use requirements forbid selling the data,
  handing it to data brokers, or using it for advertising. Product news to your
  own users is none of those — but the [User Data
  Policy](https://developers.google.com/terms/api-services-user-data-policy) also
  requires that data be used for the purposes disclosed to the person, so a use
  beyond signing in needs to be told and accepted first. The penalty for getting
  this wrong is not a bounced email; it is the OAuth app being suspended.
- **The law.** Argentina's Ley 25.326 allows advertising to your own users but
  requires every message to state the right to be removed, and requires honouring
  it. The GDPR, for any European who signs up, requires explicit prior opt-in.
  CAN-SPAM, for the US, accepts opt-out but demands a working unsubscribe and a
  real postal address. **An opt-in checkbox satisfies all three at once**, which
  is why there is one design here and not three.
- **The inbox.** Since November 2025 Gmail rejects non-compliant bulk mail at the
  server with a 550 — it does not land in spam, it does not land at all. The
  requirements are SPF, DKIM and DMARC on a domain you own, one-click unsubscribe
  (RFC 8058) honoured within two days, and a complaint rate under 0.3% (the
  practical target is 0.1%). ([bulk sender
  requirements](https://powerdmarc.com/bulk-email-sender-requirements/))

The last one is also why spec 036 records the domain as a prerequisite: nothing
can be signed from a `vercel.app` subdomain.

## What enters

### 1. The checkbox, after signing in — not before

It cannot live next to the Google button. Pressing that button navigates the tab
away to Google, and whatever was ticked before is gone by the time the person
comes back. Asking afterwards is also the more honest order: the question is
"now that you have an account, do you want news about it?", not a toll on the
way in.

It goes in the signed-in state of Configuración › Nube, one line, **unchecked by
default**, worded as what it is:

> Quiero recibir novedades de CopyNotes por email (pocas, y podés cortar cuando
> quieras).

Turning it off later is the same checkbox. No confirmation, no second screen.

### 2. Where the answer is stored

`auth.users.user_metadata.newsletter`, written with
`supabase.auth.updateUser({ data: { newsletter: true } })`.

No new table, no migration, no RLS policy: a person may write their own metadata
by definition, and this is a preference about themselves. It is also readable
from the admin API, which is all the sending side needs. The alternative — a
`profiles` table with its own policies — buys nothing at this size and costs a
migration.

It does **not** go in the settings registry (`storage/settings-registry.ts`):
that registry is for preferences that live on the device and travel in the file
backup. This one is an answer given to the server, about the account, and it must
not be restored onto a different account by importing a backup.

### 3. The privacy page

A new prerendered route, `/privacidad`, in plain Spanish, linked from
Configuración. What it must state, because these are the things a person actually
wants to know:

- **What exists about them**: an email address, an account id, the encrypted
  notes, and the metadata the server can see anyway (how many records, how big,
  when they sync) — the same list `uploadTerms` already shows on screen, so the
  two must not drift.
- **What CopyNotes cannot see**: the vault key, and therefore the contents. With
  the same beta caveat the app already carries — described as what the program
  does, not as an audited guarantee.
- **Who else touches it**: Supabase (hosting and database), Vercel (the site),
  Google (only if they used the Google button).
- **The email**: used for the account, and for news **only** if the checkbox was
  ticked; how to untick it; that unsubscribing from a message also works.
- **How to ask for deletion**, and what deletion means (the account and its rows
  go; the notes on their own devices are theirs and untouched).

### 4. Sending, which happens outside CopyNotes

The app gains no sending code, no templates, no campaign screen. What it gains is
one script, next to the one that already exists (`scripts/rls-check.mjs`, run via
`node --env-file=.env`):

`scripts/newsletter-list.mjs` — reads the admin API, prints the addresses whose
`user_metadata.newsletter` is `true`, one per line. That output is what gets
pasted into whatever tool does the sending (Resend, Postmark or SES — an open
decision below).

Two things the script must not pretend to solve, and the spec says so out loud:

- **The unsubscribe link in a message will not flip the flag in the app.** The
  sending tool keeps its own suppression list. The rule is: the tool's list wins,
  always, and the export is re-run before every send rather than kept.
- **Mail is sent from a subdomain** (`mail.<dominio>`), never from the domain the
  app lives on, so a bad send cannot damage the deliverability of account emails.

## What does not enter

- **Any sending from inside CopyNotes.** No SMTP, no provider SDK, no queue.
- **Templates, campaigns, open tracking, click tracking.** Open tracking in
  particular contradicts the rest of the product.
- **Terms of service.** Google's brand verification asks for a home page and a
  privacy policy; terms are a separate question and there is no product reason for
  them yet. Open decision below.
- **Brand verification itself.** It becomes possible once the domain and this page
  exist; it is a form to fill, not a feature to build.
- **Importing the flag from a file backup**, for the reason given in section 2.
- **Any second use of the address.** No "invite a friend", no "we noticed you
  stopped using it".

## Model of data affected

One field, server-side: `auth.users.user_metadata.newsletter`, a boolean, absent
until the person answers. Absent and `false` mean the same thing and both mean
"do not write to me".

No table, no column, no migration, no change to `records`, `vaults` or
`pairings`. Nothing in IndexedDB. Nothing in the file backup.

## User flows

**Someone who just made their account.** Signs in, creates the vault, and in the
signed-in Nube section sees an unticked checkbox offering news. Ignores it —
nothing happens, ever. Or ticks it, and the tick is saved immediately, no button.

**Someone who changes their mind, inside the app.** Unticks it. The next export
does not include them.

**Someone who changes their mind, from a message.** Presses unsubscribe in the
email. The sending tool suppresses them. The app checkbox still reads ticked —
this is the seam named in section 4, and the rule that resolves it is that the
tool's list wins.

**Someone who wants to know what is stored.** Configuración → the privacy link →
`/privacidad`, which loads offline like the rest of the app.

## Acceptance criteria

1. The checkbox appears only when signed in, starts unticked for an account that
   never answered, and saves without a button.
2. Ticking and unticking survive a reload, and survive signing out and back in on
   another device — because the answer lives on the account, not the device.
3. The answer is absent from the file backup: exporting with it ticked and
   importing on a device signed into another account leaves that account
   unticked.
4. `node --env-file=.env scripts/newsletter-list.mjs` prints exactly the
   addresses that ticked it, one per line, and nothing else.
5. `/privacidad` is reachable from Configuración, renders offline, and states the
   five things listed in section 3.
6. The data list on `/privacidad` matches the one in `uploadTerms` — same items,
   same claims.
7. No email is sent by any code in this repository.
8. Unit and e2e suites stay green.

## Minimum tests

- **Unit**: the toggle writes `{ newsletter: true }` and `{ newsletter: false }`
  through `updateUser`, and reads back an absent value as unticked. This is real
  branching logic and gets a real test.
- **Unit**: the backup export does not contain the key, and an import does not
  write it — criterion 3 is a data-loss-shaped risk (writing one person's answer
  onto another person's account) and deserves an assertion, not a screenshot.
- **e2e**: `/privacidad` loads and shows its heading. This one *can* be automated
  — unlike everything in the Nube section, the page needs no Supabase project.
- **Screenshot**: the checkbox in place, read back, per the standing rule that
  green tests do not see composition.
- **By hand, once**: run the script against the real project and confirm the list
  matches what the screens say.

## Open decisions

These need Hernán's answer before this is built:

1. **Which domain.** Everything here is blocked on it — the mail subdomain, the
   privacy page's address, the brand verification form.
2. **Which sending tool** — Resend, Postmark or SES. Affects nothing in the code
   (the script prints addresses either way); affects what gets configured in DNS.
3. **Terms of service page: yes or no.** No product reason yet. Only worth it if
   Google's form turns out to demand it.
4. **Who writes the privacy text.** The structure is in section 3; the wording can
   be drafted here and corrected by Hernán, which is how the guide pages were
   done.

## Agent notes

- Do not put the newsletter flag in `storage/settings-registry.ts`. That file is
  the single source for device preferences that travel in the backup, and this is
  neither.
- `uploadTerms` (`SettingsDialog.svelte:1130`) is the existing statement of what
  the server can see. The privacy page copies it rather than re-deriving it; if
  they disagree, the screen is right and the page is wrong.
- The claim "conocimiento cero" stays forbidden until an independent audit exists
  (spec 030). The privacy page describes the mechanism and says it is unaudited,
  exactly like the guide and the app already do.
