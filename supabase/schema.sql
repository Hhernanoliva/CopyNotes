-- CopyNotes cloud schema — spec 030 phase 2.
--
-- Paste this whole file into the Supabase SQL Editor and run it. It is
-- idempotent: running it twice changes nothing. There is no Supabase CLI and no
-- migrations folder yet, on purpose — this is two tables, and a second schema
-- change is the moment to add that machinery, not before.
--
-- What the server holds: one encrypted blob per record, plus the wrapped copy of
-- the vault key. Nothing here can be read without a key the server never sees
-- (see src/lib/sync/records.ts and src/lib/sync/vault.ts).

-- ---------------------------------------------------------------------------
-- records — one encrypted blob per synced row
-- ---------------------------------------------------------------------------
--
-- Columns mirror exactly what `encryptRecord()` emits, plus the owner and the
-- two server stamps. Everything meaningful (text, title, dates, relations, the
-- private comment) lives inside `blob` and is unreadable here.
--
-- `server_seq` is the download cursor for phase 3: a sequence bumped by the
-- trigger below on every insert AND update, so "what changed on the server
-- since X" can never tie the way a timestamp can. Una secuencia SÍ puede quedar
-- visible fuera de orden con dos aparatos subiendo a la vez (el número se
-- reparte al empezar la escritura, no al confirmarla); el que baja lo resuelve
-- releyendo un tramo hacia atrás en cada pasada (`OVERLAP` en
-- src/lib/sync/download.ts), así que un hueco de menos de 50 escrituras se
-- recupera solo.

create sequence if not exists public.records_server_seq;

create table if not exists public.records (
	owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	-- One of SYNCED_TABLES in src/lib/storage/db.ts. Constrained so a broken or
	-- hostile client cannot fill the table with rows nothing will ever read.
	table_name text not null check (
		table_name in ('notes', 'blocks', 'snippets', 'tags', 'tagAssignments', 'folders', 'activity')
	),
	-- The local id. Only unique within its table, hence the composite key.
	id text not null,
	-- The device's monotonic change counter (spec 030 phase 1) = version marker.
	change_seq bigint not null,
	-- Tombstone. The blob of a deleted record still uploads: a delete is a write.
	deleted boolean not null default false,
	iv text not null,
	blob text not null,
	server_seq bigint not null default nextval('public.records_server_seq'),
	updated_at timestamptz not null default now(),
	primary key (owner_id, table_name, id)
);

create or replace function public.stamp_record()
returns trigger
language plpgsql
-- Empty search_path: the function only touches fully qualified names, so it
-- cannot be tricked by a schema someone else puts earlier in the path.
set search_path = ''
as $$
begin
	new.server_seq := nextval('public.records_server_seq');
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists stamp_record on public.records;

create trigger stamp_record
before insert or update on public.records
for each row execute function public.stamp_record();

-- Phase 3's download query: everything of mine past a cursor, in order.
create index if not exists records_owner_server_seq on public.records (owner_id, server_seq);

-- ---------------------------------------------------------------------------
-- push_records — the only door a record may come in through
-- ---------------------------------------------------------------------------
--
-- A plain upsert cannot say no. Two devices that each edited the same note
-- offline would both succeed, and the second one would overwrite a version it
-- had never seen: the first device's text was gone from the server before
-- anything could compare the two, and neither device ever noticed.
--
-- So every write declares the version it is standing on (`base_seq` = the
-- `change_seq` the device believes is up here). If that is not what the row
-- actually holds, the write is refused and its id comes back to the caller. The
-- device then downloads what it was missing, and the existing merge parks the
-- disagreement for the person to decide (src/lib/sync/download.ts).
--
-- `base_seq` null means "as far as I know this record does not exist up here",
-- so it may only insert. A refusal is not an error: the rest of the batch lands.
--
-- ponytail: a row-by-row loop rather than one set-based statement, because the
-- declared base is not a column of `records` and so cannot ride in `excluded`.
-- 200 rows in one round trip is nothing; revisit if a batch ever gets large.
--
-- Y "la única puerta" es literal desde acá: la política de abajo dejó de
-- permitir escrituras directas, así que esta función es el ÚNICO camino por el
-- que una fila puede entrar, cambiar o desaparecer. Para poder escribir con la
-- puerta cerrada corre como su dueño (`security definer`) y no como quien
-- llama, o sea que la seguridad a nivel de fila ya no la filtra: el filtro por
-- dueño de acá adentro pasa a ser la única defensa, y por eso es explícito en
-- las dos ramas —`auth.uid()` en el `insert`, `owner_id = auth.uid()` en el
-- `update`— y hay una prueba que lo ataca de frente (scripts/rls-check.mjs, la
-- número 7).

create or replace function public.push_records(payload jsonb)
returns table (rejected_table text, rejected_id text)
language plpgsql
-- Corre como su dueño para poder escribir en una tabla que ya no acepta
-- escrituras de nadie más. Ver el filtro por dueño explícito de abajo.
security definer
set search_path = ''
as $$
declare
	record_in record;
	written int;
begin
	-- Sin sesión no hay dueño, y sin dueño esta función escribiría filas de
	-- nadie. Fallar acá y de una, en vez de dejar que el `not null` de la
	-- columna lo descubra a mitad de la tanda.
	if auth.uid() is null then
		raise exception 'push_records necesita una sesión iniciada';
	end if;

	for record_in in
		select *
		from jsonb_to_recordset(payload) as fields (
			table_name text,
			id text,
			change_seq bigint,
			base_seq bigint,
			deleted boolean,
			iv text,
			blob text
		)
	loop
		written := 0;

		if record_in.base_seq is not null then
			update public.records as target
			   set change_seq = record_in.change_seq,
			       -- A payload that omits `deleted` arrives as NULL here, and an
			       -- explicit NULL overrides the column default instead of falling back
			       -- to it. Left alone that raises inside the loop, which aborts the
			       -- whole batch over one incomplete row. Absent means "not a
			       -- tombstone", the same thing the column's own default says.
			       deleted = coalesce(record_in.deleted, false),
			       iv = record_in.iv,
			       blob = record_in.blob
			 where target.owner_id = auth.uid()
			   and target.table_name = record_in.table_name
			   and target.id = record_in.id
			   and target.change_seq = record_in.base_seq;
			get diagnostics written = row_count;
		end if;

		-- Either the device claims the record is new, or it claimed a base and no
		-- row matched. The insert settles both: it lands only when there is truly
		-- nothing here, which also covers a server rebuilt from scratch while the
		-- devices still remember old versions.
		if written = 0 then
			-- `owner_id` explícito y no por el valor por defecto de la columna: con
			-- `security definer` la seguridad a nivel de fila ya no vuelve a
			-- comprobarlo, así que tiene que verse acá.
			insert into public.records (owner_id, table_name, id, change_seq, deleted, iv, blob)
			values (
				auth.uid(),
				record_in.table_name,
				record_in.id,
				record_in.change_seq,
				coalesce(record_in.deleted, false),
				record_in.iv,
				record_in.blob
			)
			on conflict (owner_id, table_name, id) do nothing;
			get diagnostics written = row_count;
		end if;

		if written = 0 then
			rejected_table := record_in.table_name;
			rejected_id := record_in.id;
			return next;
		end if;
	end loop;
end;
$$;

-- Signed-in accounts only. RLS inside the function still limits it to their own
-- rows; this just keeps anonymous callers from reaching it at all.
revoke all on function public.push_records(jsonb) from public;
grant execute on function public.push_records(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- reset_cloud — empezar de nuevo la nube
-- ---------------------------------------------------------------------------
--
-- La única forma de borrar algo de acá arriba, y tiene nombre a propósito.
-- `records` no acepta escrituras directas de nadie —todo entra por
-- `push_records`— así que abrir una política general de borrado desharía eso;
-- esta función borra exactamente lo de quien llama y nada más.
--
-- Es la salida de quien se quedó sin ningún aparato con la llave: lo que hay
-- arriba es ilegible para siempre, y lo honesto es poder vaciarlo y volver a
-- subir desde el aparato que todavía tiene las notas (spec 035).

create or replace function public.reset_cloud()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	-- Sin sesión no hay dueño, y sin dueño esto borraría filas de nadie.
	if auth.uid() is null then
		raise exception 'reset_cloud necesita una sesión iniciada';
	end if;
	-- Con `security definer` la seguridad a nivel de fila ya no vuelve a
	-- filtrar: el filtro por dueño de acá es la única defensa, y por eso está
	-- escrito en las tres.
	delete from public.records where owner_id = auth.uid();
	delete from public.pairings where owner_id = auth.uid();
	delete from public.vaults where owner_id = auth.uid();
end;
$$;

revoke all on function public.reset_cloud() from public;
grant execute on function public.reset_cloud() to authenticated;

-- ---------------------------------------------------------------------------
-- vaults — que esta cuenta tiene bóveda, y una prueba de cuál
-- ---------------------------------------------------------------------------
--
-- Ya no guarda la llave envuelta (spec 035): la llave se pasa de aparato a
-- aparato por `pairings`, y acá arriba no queda ninguna copia de ella.
--
-- Lo que queda es una prueba: el texto `copynotes` cifrado con la llave de la
-- bóveda. No abre nada y no le sirve a nadie, pero deja contestar una pregunta
-- que sin ella no tiene respuesta. La clave primaria es el dueño, así que crear
-- la bóveda dos veces choca con 23505 — y ese choque significa dos cosas
-- opuestas: que otro aparato llegó primero, o que la fila la dejó este mismo la
-- corrida anterior. El que puede abrir la prueba es el segundo caso. Confundir
-- los dos ya costó una salida de servicio (commit a4c6e0d).

create table if not exists public.vaults (
	owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
	iv text not null,
	check_blob text not null,
	created_at timestamptz not null default now()
);

-- El proyecto que ya existe: la copia envuelta se va, la prueba entra. `iv` se
-- queda donde estaba y ahora es el de la prueba.
alter table public.vaults add column if not exists check_blob text;
alter table public.vaults drop column if exists salt;
alter table public.vaults drop column if exists wrapped;

-- ---------------------------------------------------------------------------
-- pairings — la llave de paso, mientras dura
-- ---------------------------------------------------------------------------
--
-- Casi siempre está vacía. Cuando alguien suma un aparato, acá aparece la llave
-- de la bóveda envuelta con un código de 8 caracteres que muestra el aparato
-- viejo, y se va: la borra el que la usa, y la esconde el vencimiento.
--
-- Una fila por cuenta (la clave primaria es el dueño), así que pedir un código
-- nuevo pisa al anterior. Sin barrendero y sin cron: una fila vencida son unos
-- cientos de bytes que ya no abren nada y que el próximo pedido reemplaza.

create table if not exists public.pairings (
	owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
	salt text not null,
	iv text not null,
	wrapped text not null,
	expires_at timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Row-Level Security — the lock
-- ---------------------------------------------------------------------------
--
-- `using` decides which rows you may see or touch; `with check` decides which
-- rows you may write. Both are needed: without `with check`, an account could
-- insert rows stamped with somebody else's owner_id.
--
-- With RLS enabled and no policy, nobody reads anything — not even the owner.
-- That is the safe direction to fail in.
--
-- Y esa es la forma de todo lo de acá abajo: se permite LEER lo propio, y nada
-- más. Las dos tablas eran `for all` —leer, insertar, actualizar y borrar—, lo
-- que dejaba dos agujeros que no necesitan atacante:
--
--   * en `records`, un cliente viejo con un error, o un `delete` a mano, podía
--     saltearse el control de versiones de `push_records` y vaciar la copia de
--     la nube. Un borrado nunca viaja como fila borrada: viaja como lápida.
--   * en `vaults`, la llave envuelta se podía PISAR. Dos aparatos que crean su
--     bóveda casi a la vez terminaban con una llave que sólo abre la mitad de
--     los registros, y el código de recuperación del que perdió, muerto.
--
-- Nada de esto le saca nada a la app: nunca escribe en `records` fuera de
-- `push_records`, y de `vaults` sólo lee y crea la bóveda una vez.

alter table public.records enable row level security;
alter table public.vaults enable row level security;
alter table public.pairings enable row level security;

drop policy if exists own_records on public.records;

-- Leer lo propio. Escribir se hace por `push_records` y por ningún otro lado.
create policy own_records on public.records
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists own_vault on public.vaults;
drop policy if exists read_own_vault on public.vaults;
drop policy if exists create_own_vault on public.vaults;

create policy read_own_vault on public.vaults
for select
to authenticated
using (owner_id = auth.uid());

-- Crear, no pisar: la clave primaria es el dueño, así que la primera bóveda de
-- la cuenta gana y la segunda choca. El aparato que pierde la carrera se entera
-- y lo dice (src/lib/sync/upload.ts), en vez de dejar registros ilegibles.
create policy create_own_vault on public.vaults
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists read_own_pairing on public.pairings;
drop policy if exists create_own_pairing on public.pairings;
drop policy if exists drop_own_pairing on public.pairings;

-- Leer la propia, y sólo mientras vale. El vencimiento es regla del servidor y
-- no cortesía del cliente: una fila vencida no existe ni para su dueño.
create policy read_own_pairing on public.pairings
for select
to authenticated
using (owner_id = auth.uid() and expires_at > now());

create policy create_own_pairing on public.pairings
for insert
to authenticated
with check (owner_id = auth.uid());

-- Borrar la propia SIN mirar el vencimiento, a propósito: si el borrado también
-- filtrara por vencida, una fila muerta quedaría para siempre bloqueando el
-- insert de la próxima (la clave primaria es el dueño).
create policy drop_own_pairing on public.pairings
for delete
to authenticated
using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The live channel (spec 030 phase 3)
-- ---------------------------------------------------------------------------
--
-- Devices of one account share a private realtime topic named `cuenta:<uuid>`.
-- Nothing on it carries note content: presence says who is connected, and the
-- broadcast is an empty "come and look" that ends in the ordinary encrypted
-- download. But without this policy the topic would be public, and any signed-up
-- user who guessed an account id could watch when that person is online and
-- editing. That is metadata this product promises not to hand out.

drop policy if exists own_channel on realtime.messages;

create policy own_channel on realtime.messages
for all
to authenticated
using (realtime.topic() = 'cuenta:' || auth.uid()::text)
with check (realtime.topic() = 'cuenta:' || auth.uid()::text);
