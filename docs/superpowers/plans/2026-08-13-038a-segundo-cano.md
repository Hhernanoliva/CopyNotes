# Nota compartida, parte A: el segundo caño y la mudanza (spec 038) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the second pipe — a set of server tables that hold one note's allow-listed fields in the clear — and move a note into it and back out again, so that a note travels by exactly one pipe at a time and the existing encrypted sync never notices.

**Architecture:** `records` is untouched. Beside it, `share_rows` holds a projection of a shared note's `notes` / `blocks` / `activity` rows, keyed by note, written only through `push_shared_rows` and read only through `pull_shared_rows`. On the device, `notes.share` (`null | 'owner' | 'member'`) decides which pipe a note uses: `sync/pending.ts` — the single door records leave through — skips a shared note's rows, and a new shared loop hands them up instead. An arriving shared row is a *projection*, so it is merged onto the local row and cleaned through the existing HTML gate, never `put` over it. Sharing and unsharing is a **move**: push to the new pipe, re-stamp `changeSeq`, then delete from the old one, in that order.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie (IndexedDB), Supabase (Postgres + RLS + `security definer` functions), Valibot, Vitest, Playwright.

## Por qué este plan está partido en dos, para Hernán

La spec 038 entera son ~15 días, el ítem más grande del proyecto. Partirla no es
una preferencia: **la spec misma lo pide**, y la costura es la única que se puede
probar sola.

- **Parte A (este plan): el caño y la mudanza.** Una nota sale de la bóveda, vive
  en claro en el servidor, y vuelve. Se prueba **con una sola cuenta y dos
  aparatos tuyos**, sin invitados, sin invitaciones y sin nadie que tilde nada.
  Es la parte que puede romper en silencio la sincronización que hoy anda bien,
  así que va primero y se prueba antes de que exista una segunda persona.
- **Parte B (el plan que sigue): la segunda persona.** Invitación, roles, el
  tilde derivado de la bitácora, "Listo", el contador de novedades, los nombres,
  y todo lo que pasa en el aparato del invitado.

Al terminar A **no hay nada nuevo que puedas mostrarle a alguien**: la nota se
comparte con vos mismo. Lo que hay es la mitad peligrosa, hecha y probada.

**Dos cosas te van a tocar a vos y no las puedo hacer yo:**

1. **Pegar `supabase/schema.sql` en el editor SQL de Supabase** (tarea 1). Crea
   tablas nuevas y **cambia `reset_cloud()`**, que es una función que borra. No
   es algo para hacer sin vos delante, y hasta que no esté, la rama no se puede
   pushear: el código nuevo habla con tablas que todavía no existen.
2. **`pnpm rls:check`** después, y el **gate manual de dos aparatos** (tarea 10).

**Una decisión que dejo abierta a propósito, para la parte B:** de dónde sale el
**nombre** que se muestra al lado de cada cosa que hizo el invitado. Lo obvio es
el mail de la cuenta, y eso significa que cada uno le ve el mail al otro. Es una
decisión tuya sobre privacidad, no mía, y la parte A no la necesita.

**RESUELTA el 2026-08-16: el nombre lo escribe el dueño al generar el link**, y
no se intercambia ningún mail. El razonamiento y lo que arrastra —que el invitado
también necesita un nombre para el dueño, o su pantalla le atribuye a él todo lo
que hizo el otro— está en la spec 038 §6.

## Global Constraints

- **Spec:** `specs/038-shared-note-ticket.md`. Read it before Task 1 — at minimum §1, §2, §3, §3b, §3c and "Model of data affected".
- **`AGENT.md` first**, per `CLAUDE.md`. It is the source of truth for product direction and the quality bar.
- **No new dependency**, npm or cargo, client or server.
- **Plain JavaScript inside `.ts` files.** No type annotations (`CLAUDE.md`). Generated shadcn-svelte components keep theirs.
- **Comments and user copy in Spanish** where the surrounding file is Spanish; explain *why*, never *what*.
- **No commit carries agent traces** — no `Co-Authored-By`, no "Generated with". This repo deploys to Vercel from `main`.
- **Branch `feat/nota-compartida`. Do not push to `main` until Task 1's SQL is applied to the real Supabase project by Hernán.**
- **The guide and the changelog change in the same commit as the code they describe** (`CLAUDE.md`): `docs/guia/` topic file + the "Última actualización" date in `docs/guia-de-uso.md`, and a bullet in `CHANGELOG.md`.
- **The invariant this whole plan exists to protect: a note travels by ONE pipe.** Both uploaders read the same `notes.share` field, so a caller added later cannot forget it by omission.
- **Every `security definer` function carries an explicit owner/member filter inside.** RLS no longer filters under `security definer`; that filter is the only defence left. `push_records` says so three times already.
- **Nothing in `sync/` is reused on the shared pipe without asking what it does with a field that is simply absent.** `putFromCloud` replaces it away, `sameToTheUser` calls it a disagreement, `takeRemote` does both.
- **Run `pnpm test` (unit) after every task.** The baseline before this plan is **1032 unit tests** and **160 e2e**; `pnpm check` has **4 pre-existing errors** that are not yours.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema.sql` (modify) | The four shared tables, their RLS, the six new functions, and `reset_cloud()` learning about shares |
| `scripts/rls-check.mjs` (modify) | Attacks the new surfaces from a second account |
| `src/lib/storage/db.ts` (modify) | `db.version(11)`: the non-synced `shareMembers` cache. Stays off `SYNCED_TABLES`. |
| `src/lib/storage/settings-registry.ts` (modify) | Declares the `share:` key prefix and its backup policy |
| `src/lib/storage/settings.ts` (modify) | `forgetSharePrefixes()` — the only way to clear a prefixed family |
| `src/lib/storage/shares.ts` (create) | The single reader/writer of `notes.share` and the three per-note settings keys. No network. |
| `src/lib/sync/pending.ts` (modify) | The gate: a shared note's `notes`/`blocks`/`activity` rows never leave by the encrypted pipe |
| `src/lib/sync/shared-payload.ts` (create) | The field allow-list (projection out) and the cleaning pass (projection in). Pure, no DB. |
| `src/lib/sync/shared-merge.ts` (create) | The merge write, the allow-list-scoped comparison, and the arrival defaults |
| `src/lib/sync/shared.ts` (create) | The shared loop: its own gate, its per-note cursor, push, pull, and `reconcileShares()` |
| `src/lib/sync/share-move.ts` (create) | `shareNote` / `unshareNote` — the move between pipes, in crash-safe order |
| `src/lib/sync/upload.ts` (modify) | Where the shared half runs inside `syncNow`, and the two-queue unsent count |
| `src/lib/sync/leave.ts` (modify) | Sign-out and "empezar de nuevo" drop the marks, the cursors and the membership cache |
| `src/lib/components/ShareDialog.svelte` (create) | The screen that states the privacy reduction and opens/closes the share |
| `src/lib/components/NoteSidebar.svelte` (modify) | The "Compartir" entry and the mark on a shared note |
| `docs/guia/`, `CHANGELOG.md` (modify) | What the person sees, in plain Spanish |

---

## Task 1: The server — four tables, six functions, and `reset_cloud` learning about shares

**Files:**
- Modify: `supabase/schema.sql` (append after the `pairings` section; RLS policies with the other policies at the end)
- Modify: `scripts/rls-check.mjs`

**Interfaces:**
- Produces, for every later task: `open_share(p_note_id text)`, `close_share(p_note_id text)`, `delete_records(payload jsonb)`, `push_shared_rows(p_note_id text, payload jsonb) → table(rejected_table text, rejected_id text)`, `pull_shared_rows(p_note_id text, p_cursor bigint) → table(table_name text, id text, change_seq bigint, deleted boolean, payload jsonb, author_id uuid, server_seq bigint)`, `list_shares() → table(note_id text, role text)`.
- `payload` for `delete_records` is `[{ "table_name": "...", "id": "..." }, ...]`.
- `payload` for `push_shared_rows` is `[{ "table_name": "...", "id": "...", "change_seq": n, "base_seq": n|null, "deleted": bool, "payload": {...} }, ...]`.

- [ ] **Step 1: Read the existing file end to end**

`supabase/schema.sql` is 413 lines and every comment in it is load-bearing. Note in particular: the `records` `check (table_name in (...))` tied to `SYNCED_TABLES`; the `stamp_record` trigger that hands out `server_seq` *before* the write commits (which is why the client re-reads an overlap window); and the three places that say why the owner filter is explicit.

- [ ] **Step 2: Add the four tables and their sequence**

Append after the `pairings` table:

```sql
-- ---------------------------------------------------------------------------
-- Compartir una nota (spec 038) — el segundo caño
-- ---------------------------------------------------------------------------
--
-- `records` guarda bultos que el servidor no puede abrir. Estas tablas guardan
-- una nota EN CLARO, porque la otra persona tiene que poder leerla y no tiene
-- la llave de la bóveda de quien la comparte. Es una baja de privacidad
-- deliberada, avisada en pantalla en el momento de compartir, y es el precio de
-- la función entera (spec 038, "Privacy").
--
-- La regla que sostiene todo lo demás: UNA NOTA VIAJA POR UN SOLO CAÑO. Si una
-- nota está acá, no está en `records`. El cliente lo garantiza de su lado
-- (src/lib/sync/pending.ts) y la mudanza borra el caño viejo como último paso.

create sequence if not exists public.share_server_seq;

create table if not exists public.shares (
	note_id text primary key,
	owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

create table if not exists public.share_members (
	note_id text not null references public.shares (note_id) on delete cascade,
	member_id uuid not null references auth.users (id) on delete cascade,
	-- 'owner' no se guarda acá: el dueño está en `shares.owner_id`. Esta tabla
	-- es sólo de invitados, y el rol existe para cuando haya un segundo.
	role text not null default 'member' check (role in ('member')),
	joined_at timestamptz not null default now(),
	primary key (note_id, member_id)
);

create table if not exists public.share_invites (
	token text primary key,
	note_id text not null references public.shares (note_id) on delete cascade,
	owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	expires_at timestamptz not null
);

-- Una fila de la nota, con SÓLO los campos de la lista blanca adentro de
-- `payload` (src/lib/sync/shared-payload.ts). `change_seq` va como columna, no
-- adentro del payload, igual que en `records`: es el sello de versión, no
-- contenido. `server_seq` hace dos trabajos — es el cursor de bajada Y, desde la
-- parte B, el orden que decide un tilde — así que `pull_shared_rows` lo
-- DEVUELVE, no sólo lo consume.
create table if not exists public.share_rows (
	note_id text not null references public.shares (note_id) on delete cascade,
	table_name text not null check (table_name in ('notes', 'blocks', 'activity')),
	id text not null,
	change_seq bigint not null,
	deleted boolean not null default false,
	payload jsonb not null,
	author_id uuid not null references auth.users (id) on delete cascade,
	server_seq bigint not null default nextval('public.share_server_seq'),
	updated_at timestamptz not null default now(),
	primary key (note_id, table_name, id)
);

create or replace function public.stamp_share_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.server_seq := nextval('public.share_server_seq');
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists stamp_share_row on public.share_rows;

create trigger stamp_share_row
before insert or update on public.share_rows
for each row execute function public.stamp_share_row();

create index if not exists share_rows_note_server_seq on public.share_rows (note_id, server_seq);
create index if not exists share_members_member on public.share_members (member_id);
```

- [ ] **Step 3: Add the membership helper and the six functions**

```sql
-- ¿Esta cuenta puede ver esta nota? Una sola definición, usada por todas las
-- funciones de abajo: si se escribiera cinco veces, la quinta se olvidaría.
create or replace function public.is_share_participant(p_note_id text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
	select exists (select 1 from public.shares where note_id = p_note_id and owner_id = auth.uid())
	    or exists (select 1 from public.share_members where note_id = p_note_id and member_id = auth.uid());
$$;

create or replace function public.open_share(p_note_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'open_share necesita una sesión iniciada';
	end if;
	-- `on conflict do nothing` y no un error: compartir dos veces la misma nota
	-- —dos aparatos del mismo dueño, o un reintento después de un corte— es la
	-- misma intención, no un problema.
	insert into public.shares (note_id, owner_id) values (p_note_id, auth.uid())
	on conflict (note_id) do nothing;
	-- Salvo que la nota ya sea de OTRO. Ahí sí es un error, y ruidoso.
	if not exists (select 1 from public.shares where note_id = p_note_id and owner_id = auth.uid()) then
		raise exception 'esa nota ya está compartida por otra cuenta';
	end if;
end;
$$;

create or replace function public.close_share(p_note_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'close_share necesita una sesión iniciada';
	end if;
	-- Sólo el dueño cierra. El `delete` en cascada de `shares` se lleva las
	-- filas, los miembros y las invitaciones; están declaradas así arriba.
	delete from public.shares where note_id = p_note_id and owner_id = auth.uid();
end;
$$;

-- La mitad que faltaba de la mudanza (spec 038 §2). `records` da `select` y nada
-- más, y sus filas son bultos cerrados con el `noteId` ADENTRO del sobre, así
-- que el servidor no puede contestar "cuáles son las filas de la nota X". El
-- cliente sí, y por eso manda la lista.
--
-- Borra filas de la cuenta de quien llama y nada más. `reset_cloud()` sigue
-- siendo la única forma de vaciar una cuenta entera.
create or replace function public.delete_records(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'delete_records necesita una sesión iniciada';
	end if;
	delete from public.records as target
	using jsonb_to_recordset(payload) as fields (table_name text, id text)
	where target.owner_id = auth.uid()
	  and target.table_name = fields.table_name
	  and target.id = fields.id;
end;
$$;

-- El control de versiones es el mismo de `push_records`: cada escritura declara
-- sobre qué versión se para. Lo que se agrega es el rol.
create or replace function public.push_shared_rows(p_note_id text, payload jsonb)
returns table (rejected_table text, rejected_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	row_in record;
	is_owner boolean;
	written int;
	stored_actor text;
begin
	if auth.uid() is null then
		raise exception 'push_shared_rows necesita una sesión iniciada';
	end if;
	select exists (select 1 from public.shares where note_id = p_note_id and owner_id = auth.uid())
	into is_owner;
	if not is_owner and not public.is_share_participant(p_note_id) then
		raise exception 'no sos parte de esa nota';
	end if;

	for row_in in
		select *
		from jsonb_to_recordset(payload) as fields (
			table_name text,
			id text,
			change_seq bigint,
			base_seq bigint,
			deleted boolean,
			payload jsonb
		)
	loop
		written := 0;

		-- El invitado sólo agrega bitácora, y sólo como alta. La clave primaria ya
		-- contesta "¿esta fila existe?", así que un `update` de un invitado no se
		-- fusiona: se rechaza. Y la firma no se le cree — se le pisa.
		if not is_owner then
			if row_in.table_name <> 'activity' then
				rejected_table := row_in.table_name;
				rejected_id := row_in.id;
				return next;
				continue;
			end if;
			stored_actor := 'member:' || auth.uid()::text;
			insert into public.share_rows (note_id, table_name, id, change_seq, deleted, payload, author_id)
			values (
				p_note_id,
				'activity',
				row_in.id,
				row_in.change_seq,
				coalesce(row_in.deleted, false),
				jsonb_set(row_in.payload, '{actor}', to_jsonb(stored_actor)),
				auth.uid()
			)
			on conflict (note_id, table_name, id) do nothing;
			get diagnostics written = row_count;
			if written = 0 then
				rejected_table := row_in.table_name;
				rejected_id := row_in.id;
				return next;
			end if;
			continue;
		end if;

		if row_in.base_seq is not null then
			update public.share_rows as target
			   set change_seq = row_in.change_seq,
			       deleted = coalesce(row_in.deleted, false),
			       payload = row_in.payload,
			       author_id = auth.uid()
			 where target.note_id = p_note_id
			   and target.table_name = row_in.table_name
			   and target.id = row_in.id
			   and target.change_seq = row_in.base_seq;
			get diagnostics written = row_count;
		end if;

		if written = 0 then
			insert into public.share_rows (note_id, table_name, id, change_seq, deleted, payload, author_id)
			values (
				p_note_id,
				row_in.table_name,
				row_in.id,
				row_in.change_seq,
				coalesce(row_in.deleted, false),
				row_in.payload,
				auth.uid()
			)
			on conflict (note_id, table_name, id) do nothing;
			get diagnostics written = row_count;
		end if;

		if written = 0 then
			rejected_table := row_in.table_name;
			rejected_id := row_in.id;
			return next;
		end if;
	end loop;
end;
$$;

create or replace function public.pull_shared_rows(p_note_id text, p_cursor bigint)
returns table (
	table_name text,
	id text,
	change_seq bigint,
	deleted boolean,
	payload jsonb,
	author_id uuid,
	server_seq bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.is_share_participant(p_note_id) then
		raise exception 'no sos parte de esa nota';
	end if;
	return query
	select r.table_name, r.id, r.change_seq, r.deleted, r.payload, r.author_id, r.server_seq
	  from public.share_rows as r
	 where r.note_id = p_note_id
	   and r.server_seq > p_cursor
	 order by r.server_seq asc
	 limit 200;
end;
$$;

-- "¿En qué estoy?" Sin esto, dos flujos de la spec no tienen por dónde empezar:
-- un aparato que nunca vio la nota no la tiene en ningún lado (su caño cifrado
-- la saltea por la regla del caño único), y después de restaurar un respaldo la
-- marca `share` no está a propósito.
create or replace function public.list_shares()
returns table (note_id text, role text)
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'list_shares necesita una sesión iniciada';
	end if;
	return query
	select s.note_id, 'owner'::text from public.shares as s where s.owner_id = auth.uid()
	union all
	select m.note_id, 'member'::text from public.share_members as m where m.member_id = auth.uid();
end;
$$;

revoke all on function public.open_share(text) from public;
revoke all on function public.close_share(text) from public;
revoke all on function public.delete_records(jsonb) from public;
revoke all on function public.push_shared_rows(text, jsonb) from public;
revoke all on function public.pull_shared_rows(text, bigint) from public;
revoke all on function public.list_shares() from public;
grant execute on function public.open_share(text) to authenticated;
grant execute on function public.close_share(text) to authenticated;
grant execute on function public.delete_records(jsonb) to authenticated;
grant execute on function public.push_shared_rows(text, jsonb) to authenticated;
grant execute on function public.pull_shared_rows(text, bigint) to authenticated;
grant execute on function public.list_shares() to authenticated;
```

- [ ] **Step 4: Teach `reset_cloud()` about shares**

Find the existing `reset_cloud()` and replace its body's delete block. It currently deletes `records`, `pairings` and `vaults`. Left as it is, "empezar de nuevo" leaves the note published up here with its members attached while the device stops believing it is shared — one note, two pipes, permanently, and nothing on either screen shows it.

```sql
	delete from public.records where owner_id = auth.uid();
	delete from public.pairings where owner_id = auth.uid();
	delete from public.vaults where owner_id = auth.uid();
	-- Spec 038: vaciar la cuenta cierra también lo compartido. Las que soy dueño
	-- se van enteras (la cascada de `shares` se lleva filas, miembros e
	-- invitaciones); de las ajenas me borro yo como miembro, o el aparato que
	-- acaba de borrar todo se volvería a bajar la nota de otro.
	delete from public.shares where owner_id = auth.uid();
	delete from public.share_members where member_id = auth.uid();
```

- [ ] **Step 5: Add the RLS policies**

With the other policies at the end of the file:

```sql
alter table public.shares enable row level security;
alter table public.share_members enable row level security;
alter table public.share_invites enable row level security;
alter table public.share_rows enable row level security;

-- Leer sí, escribir NUNCA en directo: toda escritura entra por una función, como
-- en `records`. Sin política de insert/update/delete, no hay ninguna.
create policy read_own_shares on public.shares
	for select to authenticated
	using (owner_id = auth.uid() or public.is_share_participant(note_id));

create policy read_share_members on public.share_members
	for select to authenticated
	using (public.is_share_participant(note_id));

create policy read_share_rows on public.share_rows
	for select to authenticated
	using (public.is_share_participant(note_id));

-- Las invitaciones no se leen por tabla: se canjean por función con el token.
-- Sin política de lectura, listarlas devuelve vacío para todo el mundo.
```

- [ ] **Step 6: Add the five attacks to `scripts/rls-check.mjs`**

Follow the file's existing shape (two clients, two accounts, one assertion per attack, a printed line per case). The five:

1. A member writing a `blocks` row through `push_shared_rows` — comes back in `rejected`.
2. A member writing another note's rows — `push_shared_rows` raises "no sos parte de esa nota".
3. A non-member calling `pull_shared_rows` — raises; and a direct `select` on `share_rows` returns 0 rows.
4. `delete_records` handed **another account's** ids deletes nothing (assert the row is still there afterwards via that account's own `select`).
5. `reset_cloud()` on account A leaves account B's `shares`, `share_rows` and `share_members` standing.

- [ ] **Step 7: Hernán applies the SQL, then run the checks**

This step is Hernán's, and it is a blocker for every task below that talks to the server (7, 8, 10):

```
1. Abrir el editor SQL del proyecto Supabase.
2. Pegar `supabase/schema.sql` entero y ejecutarlo.
3. Volver acá y correr `pnpm rls:check`.
```

Expected: every case prints `ok`. A local Postgres passing proves nothing here — spec 030 already had a local pass while the real project refused.

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql scripts/rls-check.mjs
git commit -m "feat(compartir): las tablas y funciones del caño compartido"
```

---

## Task 2: `notes.share`, the Dexie version, and the `share:` settings prefix

**Files:**
- Modify: `src/lib/storage/db.ts`
- Modify: `src/lib/storage/settings-registry.ts`
- Modify: `src/lib/storage/settings.ts`
- Create: `src/lib/storage/shares.ts`
- Test: `src/lib/storage/shares.test.ts`, and add cases to `src/lib/storage/settings-registry.test.ts`

**Interfaces:**
- Produces: `SHARE_PREFIX` (`'share:'`), `shareKey(kind, noteId)`, `isSharePrefixed(key)` from `settings-registry.ts`; `forgetSharePrefixes()` from `settings.ts`; and from `storage/shares.ts`: `getShareRole(noteId) → 'owner' | 'member' | null`, `setShareRole(noteId, role)`, `sharedNoteIds() → Set<string>`, `sharedNoteIdsByRole() → { owner: Set, member: Set }`, `getShareCursor(noteId) → number`, `setShareCursor(noteId, serverSeq)`.

- [ ] **Step 1: Write the failing tests**

`src/lib/storage/shares.test.ts`:

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createNote } from './notes';
import { getSetting, setSetting, forgetSharePrefixes } from './settings';
import {
	getShareRole,
	setShareRole,
	sharedNoteIds,
	sharedNoteIdsByRole,
	getShareCursor,
	setShareCursor
} from './shares';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('la marca de compartida', () => {
	it('empieza sin marca y se pone y se saca', async () => {
		const note = await createNote({ title: 'una' });

		expect(await getShareRole(note.id)).toBe(null);

		await setShareRole(note.id, 'owner');
		expect(await getShareRole(note.id)).toBe('owner');

		await setShareRole(note.id, null);
		expect(await getShareRole(note.id)).toBe(null);
	});

	it('separa las que comparto de las que me comparten', async () => {
		const mia = await createNote({ title: 'mía' });
		const ajena = await createNote({ title: 'ajena' });
		await setShareRole(mia.id, 'owner');
		await setShareRole(ajena.id, 'member');

		expect(await sharedNoteIds()).toEqual(new Set([mia.id, ajena.id]));
		const byRole = await sharedNoteIdsByRole();
		expect(byRole.owner).toEqual(new Set([mia.id]));
		expect(byRole.member).toEqual(new Set([ajena.id]));
	});
});

describe('el cursor por nota', () => {
	it('no vive en la fila de la nota, así que no la marca como cambiada', async () => {
		const note = await createNote({ title: 'una' });
		const before = (await db.table('notes').get(note.id)).changeSeq;

		await setShareCursor(note.id, 42);

		expect(await getShareCursor(note.id)).toBe(42);
		expect((await db.table('notes').get(note.id)).changeSeq).toBe(before);
	});

	it('arranca en cero para una nota que nunca bajó nada', async () => {
		expect(await getShareCursor('desconocida')).toBe(0);
	});
});

describe('olvidar lo compartido', () => {
	it('borra toda la familia con prefijo y no toca las demás preferencias', async () => {
		await setSetting('theme', 'dark');
		await setShareCursor('n1', 10);
		await setShareCursor('n2', 20);

		await forgetSharePrefixes();

		expect(await getShareCursor('n1')).toBe(0);
		expect(await getShareCursor('n2')).toBe(0);
		expect(await getSetting('theme')).toBe('dark');
	});
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:unit -- --run src/lib/storage/shares.test.ts`
Expected: FAIL, "Failed to resolve import ./shares".

- [ ] **Step 3: Declare the prefix in the registry**

In `src/lib/storage/settings-registry.ts`, after `SETTINGS`:

```js
// Las claves POR NOTA de compartir (spec 038). No pueden estar en el mapa de
// arriba —hay una por nota, y las notas no se conocen de antemano— así que lo
// declarado es el prefijo.
//
// Que `isBackupSafe` ya devuelva false para una clave desconocida es la
// respuesta correcta por accidente. Se declara igual, porque hay tres lugares
// que leen el REGISTRO y no la tabla: el filtro del respaldo, lo que
// `replaceAllTables` conserva, y `resetCloudState`, que borra clave por clave de
// una lista fija — y una clave por nota no puede estar en una lista fija.
export const SHARE_PREFIX = 'share:';

// cursor  = hasta dónde bajé de esa nota (server_seq)
// visto   = la entrada de bitácora más nueva que esta pantalla mostró (parte B)
// desde   = el sello a partir del cual viaja la bitácora (parte B)
export function shareKey(kind, noteId) {
	return `${SHARE_PREFIX}${kind}:${noteId}`;
}

export function isSharePrefixed(key) {
	return typeof key === 'string' && key.startsWith(SHARE_PREFIX);
}
```

- [ ] **Step 4: Add `forgetSharePrefixes` to `settings.ts`**

```js
// Borra la familia entera de claves por nota de compartir. Existe porque
// `resetCloudState` limpia de a una clave de una lista fija, y estas no pueden
// estar en ninguna lista fija: hay una por nota.
//
// ponytail: `setSetting(key, undefined)` deja la fila con el valor vacío en vez
// de borrarla — es lo que ya hace `leave.ts` con `syncAccountId`, pasa por el
// diario igual que cualquier otra escritura, y el techo es una fila diminuta por
// cada nota que se haya compartido alguna vez. Si eso llegara a importar, un
// `settings.bulkDelete(keys)` dentro del mismo `trackPendingWrite` lo cierra.
export function forgetSharePrefixes() {
	return trackPendingWrite(async () => {
		const keys = (await db.table('settings').toArray())
			.map((row) => row.key)
			.filter(isSharePrefixed);
		for (const key of keys) await setSetting(key, undefined);
	});
}
```

Import `isSharePrefixed` from `./settings-registry`. Verified: `setSetting` writes `{ key, value, updatedAt }` through the localStorage journal, and `getSetting` returns `row.value` — so an `undefined` value reads as absent everywhere, which is what `getShareCursor`'s `|| 0` already expects.

- [ ] **Step 5: Add the Dexie version**

In `src/lib/storage/db.ts`, after `db.version(10)`:

```js
// v11 (spec 038): el cachecito de nombres de los miembros de una nota
// compartida. NO es una tabla sincronizada y NO está en la lista del respaldo, y
// las dos ausencias son a propósito y por motivos distintos: subirla sería subir
// un cachecito de nombres ajenos, y meterla en el respaldo sería dejarlos en un
// archivo en claro. Quedarse afuera de `BACKUP_TABLES` es además lo que la salva
// de `replaceAllTables`, que vacía exactamente esa lista.
//
// `notes.share` y `activity.serverSeq` NO necesitan línea acá: los `stores` de
// Dexie declaran índices, no columnas, y a ninguno de los dos se lo busca por
// índice. Se llenan solos en la primera escritura.
db.version(11).stores({
	shareMembers: 'id'
});
```

- [ ] **Step 6: Write `storage/shares.ts`**

```js
// La única puerta a "¿esta nota está compartida, y de qué lado?" y a los valores
// por nota que la acompañan.
//
// Existe para que las dos subidoras lean el MISMO campo: la regla de la spec 038
// —una nota viaja por un caño solo— se rompe por omisión, no por error, y una
// sola lectura compartida es lo que impide que un llamador nuevo se la olvide.

import { db } from './db';
import { getSetting, setSetting } from './settings';
import { shareKey } from './settings-registry';

export async function getShareRole(noteId) {
	return (await db.table('notes').get(noteId))?.share ?? null;
}

// `fromCloud` a propósito: poner o sacar la marca es contabilidad sobre en qué
// caño va la nota, no una edición de la nota. Sin esto, compartir subiría la
// nota entera por el caño que justo estamos abandonando.
export function setShareRole(noteId, role) {
	return db.table('notes').update(noteId, { share: role ?? undefined, fromCloud: true });
}

export async function sharedNoteIdsByRole() {
	const owner = new Set();
	const member = new Set();
	await db.table('notes').each((note) => {
		if (note.share === 'owner') owner.add(note.id);
		else if (note.share === 'member') member.add(note.id);
	});
	return { owner, member };
}

export async function sharedNoteIds() {
	const { owner, member } = await sharedNoteIdsByRole();
	return new Set([...owner, ...member]);
}

export async function getShareCursor(noteId) {
	return Number(await getSetting(shareKey('cursor', noteId))) || 0;
}

// Sólo hacia adelante, igual que los dos cursores de la nube: una tanda que
// llega tarde no puede hacer retroceder la marca y releer media nota.
export async function setShareCursor(noteId, serverSeq) {
	if (serverSeq > (await getShareCursor(noteId))) {
		await setSetting(shareKey('cursor', noteId), serverSeq);
	}
}
```

- [ ] **Step 7: Add the registry test case**

In `src/lib/storage/settings-registry.test.ts`:

```js
it('una clave por nota de compartir nunca es respaldable', () => {
	expect(isBackupSafe(shareKey('cursor', 'n1'))).toBe(false);
	expect(isSharePrefixed(shareKey('cursor', 'n1'))).toBe(true);
	expect(isSharePrefixed('theme')).toBe(false);
});
```

- [ ] **Step 8: Run the tests**

Run: `pnpm test:unit -- --run src/lib/storage/`
Expected: PASS, including the pre-existing `db.migrations.test.ts` (it opens the real version chain, so a malformed v11 breaks it loudly).

- [ ] **Step 9: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/settings-registry.ts src/lib/storage/settings.ts src/lib/storage/shares.ts src/lib/storage/shares.test.ts src/lib/storage/settings-registry.test.ts
git commit -m "feat(compartir): la marca por nota y las claves con prefijo"
```

---

## Task 3: The gate — one note, one pipe

**Files:**
- Modify: `src/lib/sync/pending.ts`
- Test: `src/lib/sync/pending.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `sharedNoteIds()` from Task 2.
- Produces: `listPendingUploads` and `countPendingUploads` keep their signatures; both now exclude a shared note's `notes`/`blocks`/`activity` rows.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/sync/pending.test.ts`:

```js
describe('una nota viaja por un caño solo', () => {
	it('deja afuera las tres tablas de una nota compartida y NO la cuarta', async () => {
		await grantUploadConsent();
		const shared = await createNote({ title: 'compartida' });
		const own = await createNote({ title: 'mía' });
		await createBlock({ noteId: shared.id, content: 'de la compartida' });
		await createBlock({ noteId: own.id, content: 'de la mía' });
		await appendActivity({
			blockId: 'b-x',
			noteId: shared.id,
			actor: 'user',
			action: 'done',
			text: ''
		});
		const tag = await createTag({ name: 'etiqueta' });
		await assignTag(tag.id, 'note', shared.id);
		await setShareRole(shared.id, 'owner');

		const pending = await listPendingUploads();
		const ids = new Set(pending.map((entry) => entry.row.id));

		expect(ids.has(shared.id)).toBe(false);
		expect(ids.has(own.id)).toBe(true);
		expect(pending.some((entry) => entry.table === 'blocks' && entry.row.noteId === shared.id)).toBe(false);
		expect(pending.some((entry) => entry.table === 'activity' && entry.row.noteId === shared.id)).toBe(false);
		// Las etiquetas son la organización privada del dueño: viajan por el caño
		// cifrado o el segundo aparato pierde las etiquetas de todo lo que comparta.
		expect(pending.some((entry) => entry.table === 'tagAssignments')).toBe(true);
	});

	it('el conteo cuenta lo mismo que la lista', async () => {
		await grantUploadConsent();
		const shared = await createNote({ title: 'compartida' });
		await createBlock({ noteId: shared.id, content: 'texto' });
		await setShareRole(shared.id, 'owner');

		expect(await countPendingUploads()).toBe((await listPendingUploads()).length);
	});
});
```

(Import `appendActivity` from `../storage/activity`, `createTag`/`assignTag` from `../storage/tags` — check the exact exported names there first — and `setShareRole` from `../storage/shares`.)

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test:unit -- --run src/lib/sync/pending.test.ts`
Expected: FAIL — the shared note's rows come back in the list.

- [ ] **Step 3: Implement the gate**

In `src/lib/sync/pending.ts`:

```js
import { sharedNoteIds } from '../storage/shares';

// Las tres tablas cuyas filas viajan por el caño compartido. `tagAssignments`
// NO está y no es un olvido: son la organización privada del dueño, no viajan
// por el caño compartido (spec 038 §3), y si dejaran de viajar por el cifrado el
// segundo aparato del dueño perdería las etiquetas de cada nota que comparta.
const SHARED_TABLES = new Set(['notes', 'blocks', 'activity']);

// El hermano del permiso de arriba, y no su espejo: el permiso es un sí/no y
// esto es una búsqueda. NO puede ser un `.filter()`: ese callback es síncrono y
// no puede preguntarle nada a la base. El conjunto se lee UNA vez por llamada,
// antes de recorrer los índices.
function skipsSharedRows(shared) {
	return (table, row) => {
		if (!SHARED_TABLES.has(table)) return false;
		return shared.has(table === 'notes' ? row.id : row.noteId);
	};
}
```

Then in both functions, read the set once and add the predicate:

```js
export async function countPendingUploads() {
	if (!(await hasUploadConsent())) return 0;
	const mark = await uploadedThrough();
	const skip = skipsSharedRows(await sharedNoteIds());
	const counts = await Promise.all(
		SYNCED_TABLES.map((table) =>
			db
				.table(table)
				.where('changeSeq')
				.above(mark)
				.filter((row) => changedSinceCloud(row) && !skip(table, row))
				.count()
		)
	);
	return counts.reduce((total, count) => total + count, 0);
}
```

and the identical change in `listPendingUploads` (the predicate goes inside the same `.filter()`, **before** `.limit()`, or a batch could come back short of rows it should have carried).

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit -- --run src/lib/sync/pending.test.ts`
Expected: PASS, all of them, old and new.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/pending.ts src/lib/sync/pending.test.ts
git commit -m "feat(compartir): el caño cifrado saltea las filas de una nota compartida"
```

---

## Task 4: The payload — the allow-list out, the cleaning pass in

**Files:**
- Create: `src/lib/sync/shared-payload.ts`
- Test: `src/lib/sync/shared-payload.test.ts`

**Interfaces:**
- Produces: `toSharedPayload(table, row) → object`, `cleanSharedPayload(table, payload) → object`, `SHARED_FIELDS` (the allow-list, exported for the tests and for nothing else).
- Consumes: `sanitizeHtml` from `$lib/format`, `BLOCK_TYPES` from `$lib/format/blocktype`, `isValidDueDate` from `$lib/dates`.
- This file runs under **jsdom**, not node: `sanitizeHtml` needs a `DOMParser`. Name the test file so it lands in the jsdom project (check the `include` globs in `vite.config.ts` — the sanitize tests are the precedent to copy).

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { toSharedPayload, cleanSharedPayload } from './shared-payload';

describe('lo que viaja', () => {
	it('deja en casa la organización, y también un campo que nadie declaró', () => {
		const note = {
			id: 'n1',
			title: 'Título',
			updatedAt: '2026-08-13T00:00:00.000Z',
			deletedAt: null,
			folderId: 'f1',
			sortOrder: -3,
			agentVisible: true,
			createdAt: '2026-01-01T00:00:00.000Z',
			changeSeq: 99,
			cloudSeq: 98,
			inventadoDespues: 'no debería viajar'
		};

		expect(toSharedPayload('notes', note)).toEqual({
			id: 'n1',
			title: 'Título',
			updatedAt: '2026-08-13T00:00:00.000Z',
			deletedAt: null
		});
	});

	it('manda la estructura interna del renglón y no cómo lo mira quien lee', () => {
		const payload = toSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			parentBlockId: null,
			order: 2,
			type: 'todo',
			content: 'Llamar',
			html: '<strong>Llamar</strong>',
			checked: false,
			dueDate: '2026-08-20',
			deletedAt: null,
			collapsed: true,
			note: 'comentario privado del dueño',
			createdBy: 'agent',
			updatedAt: '2026-08-13T00:00:00.000Z'
		});

		expect(payload.order).toBe(2);
		expect(payload.collapsed).toBeUndefined();
		expect(payload.note).toBeUndefined();
		expect(payload.createdBy).toBeUndefined();
		expect(payload.updatedAt).toBeUndefined();
	});
});

describe('lo que llega se limpia, lo escribió quien lo escribió', () => {
	it('desarma el marcado que no está en la lista blanca y deja el texto', () => {
		const clean = cleanSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			type: 'todo',
			content: 'hola',
			html: '<img src=x onerror="robar()"><strong>hola</strong>',
			dueDate: '2026-08-20'
		});

		expect(clean.html).not.toContain('onerror');
		expect(clean.html).not.toContain('<img');
		expect(clean.html).toContain('<strong>hola</strong>');
	});

	it('un tipo desconocido cae a texto y una fecha imposible se va', () => {
		const clean = cleanSharedPayload('blocks', {
			id: 'b1',
			noteId: 'n1',
			type: 'no-existe',
			content: 'hola',
			html: 'hola',
			dueDate: '2026-02-30'
		});

		expect(clean.type).toBe('text');
		expect(clean.dueDate).toBe(null);
	});

	it('no toca lo que no es un renglón', () => {
		const note = { id: 'n1', title: 'Título', updatedAt: 'x', deletedAt: null };
		expect(cleanSharedPayload('notes', note)).toEqual(note);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test:unit -- --run src/lib/sync/shared-payload.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// Qué de una fila viaja por el caño compartido, y qué le pasa a una fila que
// llega. Dos direcciones, un archivo: la lista se lee entera de un vistazo y no
// se puede actualizar una mitad sola.
//
// SALIDA — lista blanca, prohibido salvo lo declarado, igual que
// `format/sanitize.ts` y por el mismo motivo: lo que falla de una lista NEGRA es
// una fuga que no se nota. Un campo agregado a la fila más adelante NO viaja
// hasta que alguien lo agregue acá a propósito.
//
// ENTRADA — esto es una frontera de confianza NUEVA. El caño cifrado trae
// bultos que escribió un aparato tuyo con tu llave; el compartido trae marcado
// escrito por el cliente de OTRA cuenta, y `block.html` es un sumidero de
// innerHTML. La regla que el proyecto ya aplica a un archivo de respaldo —"es
// sospechoso lo escriba quien lo escriba"— vale igual acá: que te hayan
// invitado no es motivo para ejecutar su marcado.

import { sanitizeHtml } from '$lib/format';
import { BLOCK_TYPES } from '$lib/format/blocktype';
import { isValidDueDate } from '$lib/dates';

export const SHARED_FIELDS = {
	notes: ['id', 'title', 'updatedAt', 'deletedAt'],
	blocks: [
		'id',
		'noteId',
		'parentBlockId',
		'order',
		'type',
		'content',
		'html',
		'checked',
		'dueDate',
		'deletedAt'
	],
	activity: ['id', 'blockId', 'noteId', 'actor', 'action', 'text', 'seq', 'at', 'deletedAt']
};

export function toSharedPayload(table, row) {
	const payload = {};
	for (const field of SHARED_FIELDS[table] ?? []) {
		if (row[field] !== undefined) payload[field] = row[field];
	}
	return payload;
}

export function cleanSharedPayload(table, payload) {
	if (table !== 'blocks') return payload;
	const type = BLOCK_TYPES.includes(payload.type) ? payload.type : 'text';
	return {
		...payload,
		type,
		...(typeof payload.html === 'string' ? { html: sanitizeHtml(payload.html) } : {}),
		// Un separador nunca lleva fecha, y una fecha con formato válido puede
		// seguir siendo un día que no existe. Misma regla que `format/ingest.ts`.
		dueDate:
			type === 'separator' ? null : isValidDueDate(payload.dueDate) ? payload.dueDate : null
	};
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit -- --run src/lib/sync/shared-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the new boundary to the sanitize contract**

In `src/lib/format/sanitize.ts`, the CONTRACT block lists every write boundary that funnels through `sanitizeHtml`. Add the fifth so the knowledge lives there and not only in the spec:

```
// Every write boundary (editing, internal paste, backup import, snippet
// insertion via format/ingest.ts, and a row arriving through the SHARED pipe
// via sync/shared-payload.ts — that markup was written by another account's
// client) and the render sink funnel through sanitizeHtml.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/shared-payload.ts src/lib/sync/shared-payload.test.ts src/lib/format/sanitize.ts
git commit -m "feat(compartir): la lista blanca de campos y la limpieza de lo que llega"
```

---

## Task 5: The merge write, the scoped comparison and the arrival defaults

**Files:**
- Create: `src/lib/sync/shared-merge.ts`
- Test: `src/lib/sync/shared-merge.test.ts`

**Interfaces:**
- Consumes: `SHARED_FIELDS`, `cleanSharedPayload` (Task 4); `topSortOrder` from `$lib/storage/organize`; `now` from `$lib/storage/ids`.
- Produces: `mergeFromShared(table, payload, changeSeq) → Promise<void>`, `sameInAllowList(table, local, payload) → boolean`.

- [ ] **Step 1: Write the failing tests**

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { setShareRole, getShareRole } from '../storage/shares';
import { mergeFromShared, sameInAllowList } from './shared-merge';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('una fila que llega se fusiona, no se pisa', () => {
	it('deja intacto todo lo que no viajó, la marca de compartida incluida', async () => {
		const note = await createNote({ title: 'vieja' });
		await db.table('notes').update(note.id, { folderId: 'f1', agentVisible: true, fromCloud: true });
		await setShareRole(note.id, 'owner');

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.title).toBe('nueva');
		expect(stored.folderId).toBe('f1');
		expect(stored.agentVisible).toBe(true);
		expect(stored.sortOrder).toBe(note.sortOrder);
		expect(await getShareRole(note.id)).toBe('owner');
	});

	it('no cuenta como cambio local: queda parada sobre la versión del servidor', async () => {
		const note = await createNote({ title: 'vieja' });

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.changeSeq).toBe(500);
		expect(stored.cloudSeq).toBe(500);
		expect(stored.fromCloud).toBeUndefined();
	});

	it('una nota que llega por primera vez trae los cuatro campos que sólo se crean', async () => {
		await mergeFromShared('notes', { id: 'n-nueva', title: 'del otro', deletedAt: null }, 10);

		const stored = await db.table('notes').get('n-nueva');
		expect(typeof stored.sortOrder).toBe('number');
		expect(stored.folderId).toBe(null);
		expect(stored.agentVisible).toBe(false);
		expect(typeof stored.createdAt).toBe('string');
	});

	it('y no los vuelve a poner cuando la fila ya estaba', async () => {
		const note = await createNote({ title: 'vieja' });
		await db.table('notes').update(note.id, { folderId: 'f1', sortOrder: 7, fromCloud: true });

		await mergeFromShared('notes', { id: note.id, title: 'nueva', deletedAt: null }, 500);

		const stored = await db.table('notes').get(note.id);
		expect(stored.sortOrder).toBe(7);
		expect(stored.folderId).toBe('f1');
	});

	it('limpia el marcado de lo que llega', async () => {
		await mergeFromShared(
			'blocks',
			{ id: 'b1', noteId: 'n1', type: 'todo', content: 'hola', html: '<img src=x onerror="y()">hola' },
			10
		);

		expect((await db.table('blocks').get('b1')).html).not.toContain('onerror');
	});
});

describe('comparar sólo lo que se mandó', () => {
	it('una carpeta local contra una ausente NO es un desacuerdo', () => {
		const local = { id: 'n1', title: 'T', deletedAt: null, folderId: 'f1', sortOrder: 3 };
		expect(sameInAllowList('notes', local, { id: 'n1', title: 'T', deletedAt: null })).toBe(true);
	});

	it('un título distinto sí lo es', () => {
		const local = { id: 'n1', title: 'T', deletedAt: null, folderId: 'f1' };
		expect(sameInAllowList('notes', local, { id: 'n1', title: 'otro', deletedAt: null })).toBe(false);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test:unit -- --run src/lib/sync/shared-merge.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// Escribir una fila que llegó por el caño compartido.
//
// NADA de `sync/` sirve tal cual acá, y las tres formas de romperse son
// distintas (spec 038 §3b). `putFromCloud` hace `put`, o sea que REEMPLAZA la
// fila guardada: aplicar así una carga compartida en el otro aparato del dueño
// borra `folderId`, `sortOrder`, `agentVisible`, `blocks.note` y —lo grave—
// `notes.share`, con lo cual la nota deja de estar marcada como compartida y a
// la pasada siguiente se va por el caño cifrado. `sameToTheUser` compara la
// unión de los campos de los dos lados, así que un `folderId` local contra uno
// ausente es un desacuerdo y estaciona un conflicto por diseño. Y `takeRemote`
// hace las dos cosas, porque pasa por `putFromCloud`.
//
// Así que el caño compartido tiene sus dos líneas propias, escritas AL LADO de
// las originales y no en lugar de ellas.

import { db } from '../storage/db';
import { now } from '../storage/ids';
import { topSortOrder } from '../storage/organize';
import { SHARED_FIELDS, cleanSharedPayload } from './shared-payload';

// Los cuatro campos que sólo se crean. `createNote` es el único lugar de la app
// que los inventa, y una nota que llega por acá no pasa por ahí: sin esto la
// nota queda SIN `sortOrder`, y una fila sin posición se ordena última y se
// queda última para siempre (`normalizeSidebarOrder` sólo corre al restaurar un
// respaldo, nunca al bajar de la nube).
async function birthFields(table) {
	if (table !== 'notes') return {};
	return {
		sortOrder: await topSortOrder('note'),
		folderId: null,
		agentVisible: false,
		createdAt: now()
	};
}

export async function mergeFromShared(table, payload, changeSeq) {
	const clean = cleanSharedPayload(table, payload);
	const local = await db.table(table).get(clean.id);
	const merged = {
		...(local ?? (await birthFields(table))),
		...clean,
		changeSeq,
		cloudSeq: changeSeq,
		fromCloud: true
	};
	await db.table(table).put(merged);
}

// "¿Son la misma para quien las mira?", pero mirando sólo lo que se mandó — la
// única lectura honesta cuando media fila nunca salió del otro aparato.
export function sameInAllowList(table, local, payload) {
	if (!local) return false;
	for (const field of SHARED_FIELDS[table] ?? []) {
		if (payload[field] === undefined) continue;
		if (local[field] !== payload[field]) return false;
	}
	return true;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit -- --run src/lib/sync/shared-merge.test.ts`
Expected: PASS.

Note on the third test: `mergeFromShared` writes with `put` and the `fromCloud` flag, which the `creating`/`updating` hooks in `db.ts` consume — so `changeSeq` is the one this function set, not a fresh stamp. That is the whole point, and the second test is what proves it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/shared-merge.ts src/lib/sync/shared-merge.test.ts
git commit -m "feat(compartir): fusionar la fila que llega en vez de pisarla"
```

---

## Task 6: The shared loop — its own gate, its cursor, push and pull

**Files:**
- Create: `src/lib/sync/shared.ts`
- Test: `src/lib/sync/shared.test.ts`

**Interfaces:**
- Consumes: `supabase()` from `./supabase`; `sharedNoteIdsByRole`, `getShareCursor`, `setShareCursor`, `setShareRole` from `../storage/shares`; `toSharedPayload` (Task 4); `mergeFromShared`, `sameInAllowList` (Task 5); `markSentToCloud` from `../storage/db`.
- Produces: `sharedReady() → Promise<client|null>`, `listSharedPending(noteId, role) → Promise<[{table, row}]>`, `countSharedPending() → Promise<number>`, `pushSharedNote(client, noteId, role)`, `pullSharedNote(client, noteId)`, `syncShared()`, `reconcileShares(client)`.

- [ ] **Step 1: Write the failing tests**

The network calls are stubbed the way `download.test.ts` and `upload.test.ts` already stub Supabase in this repo — read one of them first and copy the shape rather than inventing a second mocking style.

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { setShareRole, getShareCursor } from '../storage/shares';
import { listSharedPending, countSharedPending, pullSharedNote } from './shared';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('qué ofrece el caño compartido', () => {
	it('no ofrece nada de una nota que no está compartida', async () => {
		const note = await createNote({ title: 'mía' });
		await createBlock({ noteId: note.id, content: 'texto' });

		expect(await listSharedPending(note.id, 'owner')).toEqual([]);
	});

	it('ofrece las tres tablas de la nota del dueño', async () => {
		const note = await createNote({ title: 'compartida' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await setShareRole(note.id, 'owner');

		const pending = await listSharedPending(note.id, 'owner');

		expect(new Set(pending.map((entry) => entry.table))).toEqual(new Set(['notes', 'blocks']));
	});

	it('del invitado ofrece SÓLO la bitácora', async () => {
		const note = await createNote({ title: 'ajena' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await setShareRole(note.id, 'member');

		const pending = await listSharedPending(note.id, 'member');

		expect(pending.every((entry) => entry.table === 'activity')).toBe(true);
	});

	it('no necesita ni permiso de subir ni bóveda para tener cola', async () => {
		// Ni `grantUploadConsent()` ni una llave: un invitado que nunca consintió
		// subir sus notas y nunca creó una bóveda tiene que poder contestar igual.
		const note = await createNote({ title: 'ajena' });
		await setShareRole(note.id, 'member');

		expect(await countSharedPending()).toBeGreaterThanOrEqual(0);
	});
});

describe('la bajada por nota', () => {
	it('aplica lo que llega y guarda el cursor, sin tocar el sello de la nota', async () => {
		const note = await createNote({ title: 'vieja' });
		await setShareRole(note.id, 'owner');
		const before = (await db.table('notes').get(note.id)).changeSeq;
		const client = {
			rpc: vi.fn().mockResolvedValue({
				data: [
					{
						table_name: 'notes',
						id: note.id,
						change_seq: before + 10,
						deleted: false,
						payload: { id: note.id, title: 'nueva', deletedAt: null },
						author_id: 'u1',
						server_seq: 7
					}
				],
				error: null
			})
		};

		await pullSharedNote(client, note.id);

		expect((await db.table('notes').get(note.id)).title).toBe('nueva');
		expect(await getShareCursor(note.id)).toBe(7);
	});

	it('una pasada que sólo movió el cursor no encola ninguna subida', async () => {
		const note = await createNote({ title: 'una' });
		await setShareRole(note.id, 'owner');
		const before = (await db.table('notes').get(note.id)).changeSeq;
		const client = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };

		await pullSharedNote(client, note.id);

		expect((await db.table('notes').get(note.id)).changeSeq).toBe(before);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test:unit -- --run src/lib/sync/shared.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// El caño compartido (spec 038). El gemelo de `upload.ts` + `download.ts` para
// las notas que salieron de la bóveda.
//
// SUS PUERTAS NO SON LAS DEL OTRO CAÑO, y esto es lo primero que hay que
// entender del archivo. `syncNow` corre detrás de cuatro (nube configurada,
// sesión, permiso de subir, llave de la bóveda), y las dos últimas existen
// porque `records` va cifrado con una llave que este aparato puede no tener. Una
// nota compartida viaja en claro y no necesita ninguna de las dos: un invitado
// que nunca consintió subir sus propias notas, y que nunca creó una bóveda,
// tiene que poder recibir el ticket y contestarlo igual. Compartir una nota ES
// el permiso para esa nota, y se pide en la pantalla de compartir.
//
// Por eso `ready()` de `upload.ts` NO se reusa acá.

import { supabase } from './supabase';
import { db } from '../storage/db';
import { markSentToCloud } from '../storage/db';
import {
	sharedNoteIdsByRole,
	getShareCursor,
	setShareCursor,
	setShareRole
} from '../storage/shares';
import { toSharedPayload } from './shared-payload';
import { mergeFromShared } from './shared-merge';

const BATCH = 200;
// El servidor reparte `server_seq` al EMPEZAR la escritura, no al confirmarla,
// así que dos escritores pueden hacerla visible fuera de orden. Mismo motivo y
// mismo número que en `download.ts`; no reinventar el razonamiento.
const OVERLAP = 50;

const SHARED_TABLES = ['notes', 'blocks', 'activity'];

export async function sharedReady() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	if (!data.session) return null;
	return client;
}

const changedSinceCloud = (row) => row.cloudSeq !== row.changeSeq;

// Qué falta subir de UNA nota. El invitado ofrece sólo bitácora: es el espejo
// del lado del cliente de la comprobación de rol del SQL, y es el que un
// llamador nuevo no se puede olvidar.
export async function listSharedPending(noteId, role) {
	const tables = role === 'member' ? ['activity'] : SHARED_TABLES;
	const out = [];
	for (const table of tables) {
		const rows =
			table === 'notes'
				? [await db.table('notes').get(noteId)].filter(Boolean)
				: await db.table(table).where('noteId').equals(noteId).toArray();
		for (const row of rows) {
			if (changedSinceCloud(row)) out.push({ table, row });
		}
	}
	return out.sort((a, b) => a.row.changeSeq - b.row.changeSeq).slice(0, BATCH);
}

export async function countSharedPending() {
	const { owner, member } = await sharedNoteIdsByRole();
	let total = 0;
	for (const [ids, role] of [
		[owner, 'owner'],
		[member, 'member']
	]) {
		for (const noteId of ids) total += (await listSharedPending(noteId, role)).length;
	}
	return total;
}

export async function pushSharedNote(client, noteId, role) {
	const pending = await listSharedPending(noteId, role);
	if (!pending.length) return 0;
	const rows = pending.map(({ table, row }) => ({
		table_name: table,
		id: row.id,
		change_seq: row.changeSeq,
		base_seq: row.cloudSeq ?? null,
		deleted: Boolean(row.deletedAt),
		payload: toSharedPayload(table, row)
	}));
	const { data, error } = await client.rpc('push_shared_rows', {
		p_note_id: noteId,
		payload: rows
	});
	if (error) throw new Error(error.message);
	const refused = new Set((data ?? []).map((row) => `${row.rejected_table}:${row.rejected_id}`));
	let accepted = 0;
	for (const { table, row } of pending) {
		if (refused.has(`${table}:${row.id}`)) continue;
		await markSentToCloud(table, row.id, row.changeSeq);
		accepted++;
	}
	return accepted;
}

export async function pullSharedNote(client, noteId) {
	const cursor = await getShareCursor(noteId);
	const { data, error } = await client.rpc('pull_shared_rows', {
		p_note_id: noteId,
		p_cursor: Math.max(0, cursor - OVERLAP)
	});
	if (error) throw new Error(error.message);
	if (!data?.length) return 0;
	for (const row of data) {
		await mergeFromShared(row.table_name, row.payload, row.change_seq);
	}
	await setShareCursor(noteId, data[data.length - 1].server_seq);
	return data.length;
}

// "¿En qué estoy?" — y la respuesta manda sobre la marca local, no al revés.
//
// Corre ANTES de la subida cifrada de cada sesión, y eso es una condición de
// orden, no una preferencia. La marca `share` NO está en tres situaciones que
// pasan solas: después de restaurar un respaldo (no es respaldable a propósito),
// en un aparato que nunca vio la nota, y después de cerrar sesión — y
// `resetCloudState` deja `cloudSeq` vacío en TODAS las filas, así que en esos
// aparatos la nota entera está pendiente sin que nadie la edite. Si la subida
// cifrada corre primero, la nota se va por el caño equivocado y queda en los dos.
export async function reconcileShares(client) {
	const { data, error } = await client.rpc('list_shares');
	if (error) throw new Error(error.message);
	const fromServer = new Map((data ?? []).map((row) => [row.note_id, row.role]));
	const { owner, member } = await sharedNoteIdsByRole();
	for (const [noteId, role] of fromServer) await setShareRole(noteId, role);
	// Una nota que este aparato cree compartida y el servidor no: la compartición
	// se cerró en otro lado. Se le saca la marca y vuelve al caño cifrado, que es
	// lo que hace la otra mitad de la mudanza.
	for (const noteId of [...owner, ...member]) {
		if (!fromServer.has(noteId)) await setShareRole(noteId, null);
	}
	return fromServer;
}

export async function syncShared(client) {
	const shares = await reconcileShares(client);
	for (const [noteId, role] of shares) {
		await pushSharedNote(client, noteId, role);
		await pullSharedNote(client, noteId);
	}
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit -- --run src/lib/sync/shared.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/shared.ts src/lib/sync/shared.test.ts
git commit -m "feat(compartir): el lazo del caño compartido, con sus propias puertas"
```

---

## Task 7: The move between pipes

**Files:**
- Create: `src/lib/sync/share-move.ts`
- Test: `src/lib/sync/share-move.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 6.
- Produces: `shareNote(noteId) → Promise<void>`, `unshareNote(noteId) → Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```js
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { getShareRole } from '../storage/shares';
import { grantUploadConsent, listPendingUploads, markUploadedThrough } from './pending';
import { shareNote, unshareNote } from './share-move';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

function fakeClient() {
	return { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
}

describe('la mudanza', () => {
	it('deja la nota marcada y con base limpia en el caño nuevo', async () => {
		const note = await createNote({ title: 'una' });
		const block = await createBlock({ noteId: note.id, content: 'texto' });
		await db.table('notes').update(note.id, { cloudSeq: 5, fromCloud: true });

		await shareNote(fakeClient(), note.id);

		expect(await getShareRole(note.id)).toBe('owner');
		expect((await db.table('notes').get(note.id)).cloudSeq).toBeUndefined();
		expect((await db.table('blocks').get(block.id)).cloudSeq).toBeUndefined();
	});

	it('borra del caño viejo COMO ÚLTIMO PASO', async () => {
		const note = await createNote({ title: 'una' });
		const client = fakeClient();

		await shareNote(client, note.id);

		const calls = client.rpc.mock.calls.map(([name]) => name);
		expect(calls[0]).toBe('open_share');
		expect(calls.at(-1)).toBe('delete_records');
	});

	it('al volver, las filas se vuelven a encontrar aunque la marca global ya las haya pasado', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await shareNote(fakeClient(), note.id);
		// El aparato siguió trabajando: la marca "subido hasta acá" quedó muy por
		// encima del sello viejo de la nota. Es el caso que falla si sólo se
		// reinicia `cloudSeq`.
		await markUploadedThrough(Date.now() + 1_000_000);

		await unshareNote(fakeClient(), note.id);

		const pending = await listPendingUploads();
		expect(pending.some((entry) => entry.row.id === note.id)).toBe(true);
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test:unit -- --run src/lib/sync/share-move.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// Mover una nota de un caño al otro (spec 038 §2).
//
// EL ORDEN ES LA HISTORIA ENTERA, y está elegido por cómo falla cada mitad:
// borrar del caño viejo va ÚLTIMO. Una nota que queda un rato en los dos es un
// duplicado, que se ve y se arregla; una nota que no queda en ninguno es una
// nota que dejó de sincronizar, y eso no se ve nunca.
//
// Y reiniciar `cloudSeq` NO alcanza, en ninguna de las dos direcciones.
// `pending.ts` llega a una fila por `.where('changeSeq').above(marca)` —la marca
// global de "subido hasta acá"— ANTES de mirar `cloudSeq`. Una nota que vuelve
// al caño cifrado trae sellos viejos que quedaron por debajo de esa marca, así
// que el índice no la devuelve nunca y la nota deja de sincronizar en silencio:
// justo la falla que esta sección existe para evitar, entrando por la puerta de
// arriba de la que estaba vigilando. Por eso la mudanza RESELLA `changeSeq` en
// cada fila afectada, que además es honesto: el caño de destino nunca vio esa
// fila.

import { db } from '../storage/db';
import { setShareRole } from '../storage/shares';
import { pushSharedNote } from './shared';

const SHARED_TABLES = ['notes', 'blocks', 'activity'];

async function noteRows(noteId) {
	const note = await db.table('notes').get(noteId);
	const rows = note ? [{ table: 'notes', row: note }] : [];
	for (const table of ['blocks', 'activity']) {
		for (const row of await db.table(table).where('noteId').equals(noteId).toArray()) {
			rows.push({ table, row });
		}
	}
	return rows;
}

// Sello nuevo y base en cero, en una sola escritura por fila. `fromCloud` NO va
// acá a propósito: queremos que el sello suba, es lo que pone la fila en la cola
// del caño de destino — y el sello lo pone el gancho `updating` de `db.ts`, que
// es justamente lo que hace cuando la escritura NO viene de la nube. Poner un
// `changeSeq` a mano acá sería escribir un número que el gancho pisa igual.
async function restampForNewPipe(rows) {
	for (const { table, row } of rows) {
		await db.table(table).update(row.id, { cloudSeq: undefined });
	}
}

export async function shareNote(client, noteId) {
	const { error } = await client.rpc('open_share', { p_note_id: noteId });
	if (error) throw new Error(error.message);

	const rows = await noteRows(noteId);
	await setShareRole(noteId, 'owner');
	await restampForNewPipe(rows);
	await pushSharedNote(client, noteId, 'owner');

	// Último. Y con la lista puesta por el cliente, porque el servidor no puede
	// saber qué filas de `records` son de esta nota: son bultos cerrados con el
	// `noteId` adentro del sobre.
	const { error: deleteError } = await client.rpc('delete_records', {
		payload: rows.map(({ table, row }) => ({ table_name: table, id: row.id }))
	});
	if (deleteError) throw new Error(deleteError.message);
}

export async function unshareNote(client, noteId) {
	const rows = await noteRows(noteId);
	await setShareRole(noteId, null);
	await restampForNewPipe(rows);
	// El servidor último otra vez, por el mismo motivo: la cascada de `shares` se
	// lleva filas, miembros e invitaciones de una.
	const { error } = await client.rpc('close_share', { p_note_id: noteId });
	if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test:unit -- --run src/lib/sync/share-move.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/share-move.ts src/lib/sync/share-move.test.ts
git commit -m "feat(compartir): la mudanza entre caños, borrando el viejo al final"
```

---

## Task 8: Where the shared half runs, the two-queue count, and leaving the account

**Files:**
- Modify: `src/lib/sync/upload.ts`
- Modify: `src/lib/sync/leave.ts`
- Test: add to `src/lib/sync/leave.test.ts`; add to `src/lib/sync/upload.test.ts`

**Interfaces:**
- Consumes: `syncShared`, `sharedReady`, `countSharedPending` (Task 6); `forgetSharePrefixes` (Task 2).
- Produces: `syncStatus.pending` now sums both queues.

- [ ] **Step 1: Write the failing tests**

In `src/lib/sync/leave.test.ts`:

```js
it('salir de la cuenta se lleva las marcas de compartida y los cursores por nota', async () => {
	const note = await createNote({ title: 'compartida' });
	await setShareRole(note.id, 'owner');
	await setShareCursor(note.id, 42);

	await resetCloudStateForTest(); // whatever the file already calls to exercise it

	expect(await getShareRole(note.id)).toBe(null);
	expect(await getShareCursor(note.id)).toBe(0);
	expect(await db.table('shareMembers').count()).toBe(0);
});
```

(Match the existing file: it already exercises `resetCloudState` through `ensureAccountMatches` or `forgetCloudAccount`. Use the same entry point it uses; do not export a new one for the test.)

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm test:unit -- --run src/lib/sync/leave.test.ts`
Expected: FAIL — the mark and the cursor survive.

- [ ] **Step 3: Extend `resetCloudState`**

In `src/lib/sync/leave.ts`, inside `resetCloudState`, after the vault and conflicts are cleared:

```js
	// Spec 038. Las marcas de qué nota está compartida, los cursores por nota y
	// el cachecito de nombres son de la cuenta que se va: la próxima hereda un
	// aparato que cree estar compartiendo notas que no son suyas.
	//
	// Sacar la marca es también lo que OBLIGA a que `list_shares()` corra antes
	// de la próxima subida (ver `syncNow`): desde acá el aparato ya no sabe que
	// la nota está compartida, y su caño cifrado la ofrecería sin dudar.
	await db.table('notes').toCollection().modify({ share: undefined, fromCloud: true });
	await db.table('shareMembers').clear();
	await forgetSharePrefixes();
```

- [ ] **Step 4: Wire the shared half into `syncNow`**

In `src/lib/sync/upload.ts`, inside the `try` of `syncNow`, **before** the `const gate = await ready()` line:

```js
		// Spec 038, y el orden importa: esto va ANTES de la subida cifrada.
		//
		// `list_shares()` es lo único que le devuelve a este aparato la marca de
		// qué notas están compartidas, y esa marca falta sola en tres casos —
		// después de restaurar un respaldo, en un aparato nuevo, y después de
		// cerrar sesión. En cualquiera de los tres, la nota entera figura como
		// pendiente sin que nadie la haya editado, así que si `uploadBatch`
		// corriera primero la subiría al caño cifrado y la nota quedaría en los
		// dos. El comentario de abajo ("subir primero, así lo mío vuelve como
		// eco") sigue siendo cierto y es sobre el caño cifrado: esto es un paso
		// ANTES, no un cambio de ese orden.
		//
		// Fuera del `if (gate)` a propósito: sus puertas no son estas (ver
		// `sync/shared.ts`). Un invitado sin permiso de subir y sin bóveda tiene
		// que sincronizar su ticket igual.
		const sharedClient = await sharedReady();
		if (sharedClient) await syncShared(sharedClient);
```

And in the `finally` block, replace the pending line:

```js
		// Las dos colas. `countPendingUploads` arranca con el permiso de subir y
		// devuelve 0 sin él —correcto para el caño cifrado, que es su puerta— y
		// eso deja a un invitado leyendo "Todo subido" sobre cinco tildes sin
		// mandar. Y esa línea es el ÚNICO testigo del gate manual de dos aparatos,
		// así que no puede mentir.
		syncStatus.pending = (await countPendingUploads()) + (await countSharedPending());
```

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test`
Expected: PASS, baseline 1032 plus everything added so far.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/upload.ts src/lib/sync/leave.ts src/lib/sync/leave.test.ts src/lib/sync/upload.test.ts
git commit -m "feat(compartir): el lazo compartido corre antes de la subida cifrada"
```

---

## Task 9: The screen that says what sharing costs

**Files:**
- Create: `src/lib/components/ShareDialog.svelte`
- Modify: `src/lib/components/NoteSidebar.svelte`
- Modify: `docs/guia/` (new topic file), `docs/guia-de-uso.md`, `CHANGELOG.md`
- Test: `e2e/` — add to the existing suite

**UI flow:** Stage 1 is already done and approved (`specs/016-design-system.md`, Quiet Ink — do not regenerate it). This is Stage 3, build, with `web-design-guidelines` as the quality gate throughout. Reuse the existing shadcn-svelte dialog the app already uses for destructive confirmations; do not introduce a new dialog pattern.

- [ ] **Step 1: Write the screen**

Requirements, all of them non-negotiable and from the spec:

- The privacy sentence lives **here, at the moment of sharing** — not in Configuración: *"Mientras esté compartida, esta nota sale de la bóveda y deja de estar cifrada. El servidor puede leerla. Vuelve a la bóveda cuando cierres la compartición."*
- Confirming calls `shareNote`. Closing calls `unshareNote`.
- The two acts must not be confusable: *quitar el acceso* leaves the other person's copy, *borrar la nota* takes it. In part A there is nobody to remove yet, so the dialog has exactly two states — shared / not shared.
- The banned words stay banned: never "conocimiento cero" (that ban predates this and now has a second reason).

- [ ] **Step 2: Add the sidebar entry and the mark**

"Compartir" in the note's menu; a visible mark on a shared note in the list. Follow the existing menu item and badge patterns in `NoteSidebar.svelte`.

- [ ] **Step 3: See it with your own eyes**

Green tests do not see composition. Take a Playwright screenshot into the scratchpad and `Read` it — both states, light and dark.

- [ ] **Step 4: Write the guide and the changelog**

`docs/guia/` gets a new topic file (plain Spanish, what you see and how to use it, no jargon), the index gets its line and a fresh "Última actualización" date, and `CHANGELOG.md` gets its bullet in the current version's section. Same commit as the code — writing it at release time does not work, `latest.json` is generated during the build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ShareDialog.svelte src/lib/components/NoteSidebar.svelte docs/ CHANGELOG.md e2e/
git commit -m "feat(compartir): la pantalla que avisa que la nota sale de la bóveda"
```

---

## Task 10: The manual gate — one account, two machines

Automated tests do not close this one, and neither does `tauri dev`: the desktop gate needs a **packaged** build (see the packaging note in the project's working agreement — `build:flat` before `tauri build --bundles app`, or the app looks healthy and only the agent fails).

- [x] **Step 1: Confirm the two machines are the same account and both synced**

Both devices signed in, both showing "Todo subido", the same note visible on both.

- [x] **Step 2: Share, and watch the note change pipe**

On device A: share the note. Then, in the Supabase table editor:

- `shares` has one row.
- `share_rows` has the note's rows, and their `payload` contains **no** `folderId`, `sortOrder`, `agentVisible` or `note`.
- `records` no longer has the note's rows.

- [x] **Step 3: Watch device B pick it up without being told**

Device B was never told anything. Within 30 seconds it must: keep showing the note, keep its own folder and sidebar position for it, and show the shared mark. **Check its `folderId` before and after** — this is criterion 13, and it is the one that fails silently if `mergeFromShared` was written as a `put`.

- [x] **Step 4: Edit on both, offline and online**

Edit the note on A. It reaches B. Edit on B. It reaches A. No conflict is raised on either side.

- [x] **Step 5: The restore case** — cerrado el 2026-08-16 **con un test automático en vez de a mano**, y es mejor así.

On device B: export a backup, sign out, sign in again, restore the backup. The `share` mark is gone from the file by design. Confirm that on the **first** sync pass the note does **not** appear in `records` — this is criterion 24 and the reason Task 8 put the reconciliation before the upload.

**Resultado (2026-08-16).** Lo que este paso vigila es una sola cosa: el ORDEN dentro
de `syncNow` (la reconciliación antes de la subida cifrada). Ese orden estaba
sostenido por un comentario y **no tenía prueba**. Ahora la tiene, en
`sync/upload.test.ts` › "restaurar un respaldo no manda la nota compartida por el
caño cifrado":

- Una nota **sin marca de compartida** (que es exactamente lo que deja
  `replaceAllTables`, porque `share` no viaja en el archivo) más un servidor que la
  declara compartida en `list_shares` ⇒ ni la nota ni sus renglones aparecen en
  `push_records` en la primera pasada.
- Y su otra mitad, para que no pase con una subida que no sube nada: una nota que NO
  está compartida sí se sube en la misma pasada.

**Comprobado en rojo** moviendo la línea de `syncShared` después del bloque de subida
cifrada: las dos fallan, y la nota compartida aparece en `records`. Se restauró el
orden.

Por qué se cambió el método: el paso a mano probaba la misma invariante una vez y no
dejaba nada que la vigile después; el test la vigila en 16 ms para siempre. Lo que el
test NO cubre —que el servidor real conteste `list_shares` y que el restore borre la
marca— ya quedó probado con aparatos de verdad en los pasos 1-4 y 6 de este gate y en
la lista blanca de `EXPORTED_FIELDS` (spec 040).

- [x] **Step 6: Unshare, and watch it come back**

Close the share on A. `share_rows` empties, `records` refills, both devices keep the note and keep syncing it. Edit it on B afterwards and confirm the edit reaches A — that is the re-stamping in Task 7 doing its job.

- [x] **Step 7: "Empezar de nuevo la nube"**

With a note shared, press the red button on A. Confirm `shares` and `share_rows` are empty afterwards and that the note is back in the encrypted pipe on the next pass.

- [x] **Step 8: Write down what happened**

Append the result to this file, dated, the way the other plans in `docs/superpowers/plans/` record theirs. A gate with no written outcome gets re-run from scratch in three weeks.

---

## Self-review notes

- **Spec coverage for part A:** §1 (Task 1), §2 (Tasks 1, 3, 7, 8), §3 field allow-list and arrival defaults (Tasks 4, 5), §3b merge + scoped comparison + cleaning (Tasks 4, 5), the server model and `reset_cloud` (Task 1), Local — `notes.share`, the prefix, the Dexie version, the cursor off the row (Task 2), flows 1, 6, 8, 9 and 10 (Tasks 7, 8, 9), criteria 6, 7, 13, 23, 24, 25 and the sanitising half of 22 (Tasks 3, 5, 7, 8, 10).
- **Deliberately in part B, not missing:** §3c (the guest writes the `notes` row), §4 (roles as a lived thing), §5 (the derived tick), §6 (identity and the three actor renderers), §7 (invitations), §8 ("Listo", the news counter, the backup validator), §9 (undo), the member-side backup filter, criteria 1-5, 8-12, 14-21 and 26.
- **`sameInAllowList` is written in Task 5 and not called until part B.** It is written here because it belongs beside the merge it is the twin of, and because the test that proves an absent `folderId` is not a disagreement is the cheapest place to lock that decision down. Do not delete it as unused.
- **Type consistency:** `getShareRole` returns `'owner' | 'member' | null` everywhere; `setShareRole(noteId, null)` clears; `listSharedPending(noteId, role)` takes the role as its second argument in every caller; `mergeFromShared(table, payload, changeSeq)` in that order.

---

## Resultado del gate manual — 2026-08-14 (PARCIAL, sin terminar)

Corrido con **A = la .app empaquetada** y **B = el navegador en
`localhost:5173`**, misma cuenta. Son dos aparatos distintos para la nube y se
apagan los dos con un solo Wi-Fi (ver el método del gate en la memoria del
proyecto).

El SQL de la tarea 1 **está aplicado** en el proyecto real y `pnpm rls:check` da
**15/15**, incluidas las tres nuevas de compartir.

### Pasos 1 a 4: PASADOS

- **1.** Los dos aparatos en la misma cuenta, "Todo subido", la nota de prueba
  llegó sola a B.
- **2.** Al compartir: una compartición, dos filas en claro, **ningún campo
  privado viajó** (sin `folderId`, `sortOrder`, `agentVisible`, `note`,
  `collapsed`, `createdBy`), y la nota **salió de `records`**. El título se lee en
  claro en el servidor, que es exactamente lo que la pantalla avisa.
- **3. (criterio 13) PASADO.** En B la nota siguió existiendo, **siguió dentro de
  su carpeta**, y le apareció la marca de compartida. Es el que falla en silencio
  si la fusión se hubiera escrito como un `put`.
- **4.** El texto viaja en los dos sentidos y **no se estacionó ningún
  conflicto**.

### Cuatro bugs reales encontrados, los cuatro arreglados

1. **`fcc34b2` — la lápida se llevaba el texto puesto.** Al borrar una nota
   compartida, su título y sus 45 renglones quedaban LEGIBLES en el servidor para
   siempre. Encontrado con una nota real de Hernán; las filas se borraron a mano
   ese mismo día.
2. **`413e7fe` — lo que llegaba no despertaba la pantalla.** La edición del otro
   aparato aterrizaba en la base y la nota abierta se quedaba vieja hasta
   recargar: `appliedVersion` la movía sólo el caño cifrado.
3. **`7e6fa5c` — la marca de compartida viajaba en el respaldo.** La spec lo pide
   con todas las letras (`LOCAL_ONLY_FIELDS`) y este plan se lo salteó.
4. Un **falso positivo** que conviene no volver a cazar: "lo de B no aparece en
   A" con el cursor DENTRO de ese renglón es la regla del renglón protegido
   haciendo su trabajo, no un bug. Sacando el cursor aparece todo.

### Paso 5: NO CORRIDO

Se cortó porque la prueba destapó un problema mayor y ajeno a esta spec:
restaurar un respaldo con la nube encendida deja **un conflicto por fila** y el
respaldo queda inerte. Medido, y escrito como **spec `039-restore-vs-cloud.md`**.
El paso 5 de este gate **no se puede correr de forma limpia hasta que 039 esté
resuelta**, porque restaurar es justamente lo que hace.

### Pasos 6 y 7: PENDIENTES

- **6.** Cerrar la compartición y ver la nota volver al caño cifrado, y que una
  edición posterior en B llegue a A (eso prueba el resello de la tarea 7).
- **7.** El botón rojo con una nota compartida.

### Quinto bug, encontrado al final — ARREGLADO (2026-08-14)

**Al compartir una nota en B, en A no aparece la marca de compartida.**

Causa confirmada leyendo el código y reproducida en un test rojo: en
`+page.svelte` la lista de compartidas se recalcula con

```js
void notes.length;
void syncStatus.appliedVersion;
```

y `reconcileShares()` —que es quien pone la marca cuando el otro aparato
compartió— no mueve ninguno de los dos: no cambia la cantidad de notas, y
`pullSharedNote` no cuenta marcas. Las filas que sí llegan por el caño son
idénticas a las que este aparato ya tiene (la nota se compartió, no se editó), así
que `sameInAllowList` las saltea y la cuenta da 0. Es **la misma familia** que el
bug 2 de arriba, un nivel más arriba: la marca entra a la base y la pantalla no se
entera.

Arreglado en la misma línea que `413e7fe`: `reconcileShares` ahora devuelve
`{ shares, changed }` y `syncShared` arranca su cuenta en `changed`, así que una
marca nueva —o una que se fue porque la compartición se cerró en otro lado— toca
`appliedVersion` igual que una edición. De paso deja de reescribir cada 30
segundos las marcas que ya estaban iguales.

### Estado del servidor al cerrar

Queda **una compartición abierta** (`4a7d4705`, la nota de prueba) con sus 4
filas, todas como lápidas y con la carga vacía — o sea, el arreglo 1 funcionando.
La cuenta tiene 44 notas, todas marcadas como borradas: son todas de prueba, y
Hernán confirmó que no hay nada que recuperar por relevancia. Su respaldo de
`~/Downloads/copynotes-backup-2026-08-14-1221.json` tiene las 47 notas enteras
por si algún día hace falta.

### Cómo se retoma

```bash
# A: la .app empaquetada (4 comandos, ver la memoria del proyecto)
pnpm --dir mcp run build:flat && pnpm tauri build --bundles app && pnpm --dir mcp install
open src-tauri/target/release/bundle/macos/CopyNotes.app

# B: el navegador
pnpm dev            # y abrir http://localhost:5173
```

El llavero pide la contraseña del Mac en cada compilación nueva: **Permitir
siempre**, y nunca borrar ese ítem.

---

## Resultado del gate manual, segunda vuelta — 2026-08-15

Misma pareja de aparatos (A = la .app empaquetada, B = el navegador en
`localhost:5173`), con el arreglo `fed4293` adentro de la build.

### El quinto bug: verificado en el aparato real, en los dos sentidos

Con A abierta y **quieta**, desde B: cerrar la compartición ⇒ la marca
**desapareció sola** de A; volver a compartir ⇒ **apareció sola**. Las dos
direcciones, o sea que el número que devuelve `reconcileShares` cuenta tanto la
marca que entra como la que se va.

**Antes de eso hubo un falso negativo que costó una vuelta entera, y la causa vale
más que el bug:** `open` sobre una `.app` que YA está corriendo **no relanza
nada** — macOS trae al frente el proceso viejo. La primera medición se hizo contra
una instancia arrancada tres horas y media antes, o sea sin el arreglo. Se ve en un
comando:

```bash
ps -eo pid,lstart,command | grep "CopyNotes.app/Contents/MacOS"
```

Si la hora de arranque es anterior a la de la build, **la prueba no está midiendo
lo que se compiló**. Cerrar con Cmd+Q y recién entonces abrir.

### Paso 6: PASADO entero

Cerrar la compartición desde A: su fila de `shares` y sus `share_rows`
desaparecieron, y las 5 filas de la nota **volvieron a `records`** (1679 → 1684).
Antes de cerrarla se midió lo contrario y es la mitad que importa: mientras estuvo
compartida, **ninguna de sus filas estaba en `records`** — un caño solo.

Y la segunda mitad, que es donde podía morir en silencio: un renglón escrito en B
después de cerrar la compartición **llegó a A**. Eso es el resello de la tarea 7
funcionando; sin él la nota habría quedado por debajo de la marca global de
"subido hasta acá" y no habría sincronizado más, sin avisar.

### Paso 7: PASADO

Con la nota compartida otra vez (1 compartición, 7 filas, 1731 en `records`), el
botón rojo desde A: `shares`, `share_rows` y `records` quedaron **en cero**. Al
volver a encender la nube ("Crear bóveda y permitir subir"), la nota de prueba
**volvió al caño cifrado** (1738 filas, la nota entre ellas) y **sin marca de
compartida**: `resetCloudState` borra las marcas, y por eso `list_shares()`
corriendo antes de la subida es lo que decide el caño.

Dos cosas para la próxima:

- **El botón rojo apaga el permiso de subir y borra la llave de este aparato.** No
  hay "siguiente pasada" automática: hay que volver a encender la nube a mano.
- **Crea una llave NUEVA, y el otro aparato se queda con la vieja.** Hay que cerrar
  B ANTES de apretarlo, o B sube cifrado con una llave que A no puede abrir y a A
  **se le corta la bajada entera** (el mensaje "Hay datos en la nube que este
  aparato no puede abrir"). Acá se apretó antes de cerrar B y salió bien de
  casualidad: B no llegó a subir nada. Es el defecto conocido de la spec 035,
  ajeno a compartir.

### Paso 5: sigue BLOQUEADO

Restaurar un respaldo con la nube encendida deja un conflicto por fila
(spec `039-restore-vs-cloud.md`). Es lo único que le falta a este gate.

**Cerrado el 2026-08-16.** La spec 039 se construyó y su gate pasó con datos reales
(1758 → 1758 filas, `server_seq` 36976 → 40492, bóveda intacta, cero conflictos, el
segundo aparato al día sin que nadie lo tocara). El paso 5 de acá quedó cerrado con
un test automático — el detalle, arriba, en el paso.

### Estado del servidor al cerrar

0 comparticiones, 0 filas compartidas, 1738 filas cifradas, una sola bóveda (la
nueva de A, 2026-08-15 23:05 UTC). B quedó con la llave vieja: cuando vuelva a
usarse hay que sumarlo con el código que muestra A.
