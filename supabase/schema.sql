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
-- since X" can never tie the way a timestamp can. ponytail: a sequence can
-- commit out of order under concurrent writers, which a single-device uploader
-- is not; phase 3 revisits this if two devices ever upload at the same instant.

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
-- vaults — the wrapped copy of the vault key
-- ---------------------------------------------------------------------------
--
-- Exactly what `getRecoveryBlob()` returns. Useless without the recovery code,
-- which is shown once on the device and never stored anywhere — that is why the
-- server is allowed to hold this at all: it is what a second device needs.

create table if not exists public.vaults (
	owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
	salt text not null,
	iv text not null,
	wrapped text not null,
	created_at timestamptz not null default now()
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

alter table public.records enable row level security;
alter table public.vaults enable row level security;

drop policy if exists own_records on public.records;

create policy own_records on public.records
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists own_vault on public.vaults;

create policy own_vault on public.vaults
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

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
