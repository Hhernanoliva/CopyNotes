# Pasar la llave entre aparatos (spec 035) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 24-character recovery code with an 8-character pairing code that one device shows and another types, so nothing has to be kept between the day the vault is created and the day a second device arrives.

**Architecture:** The vault key becomes wrappable (`extractable: true`) so `crypto.subtle.wrapKey` can hand it to a peer without its bytes ever entering JavaScript. The old device wraps it under a key derived from a fresh 8-character code and parks it in a new `pairings` row that the server hides once it expires; the new device unwraps it and deletes the row. `vaults` stops holding the key entirely and holds a proof blob instead — a known plaintext encrypted with the vault key — which is how a device tells "this account's vault is mine" from "another device got here first". A new `reset_cloud()` server function backs the one escape hatch, "Empezar de nuevo la nube".

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie (IndexedDB), WebCrypto (AES-GCM + PBKDF2), Supabase (Postgres + RLS), Vitest, Playwright.

## Global Constraints

- **Spec:** `specs/035-device-pairing-vault.md`. Read it before Task 1.
- **No new dependency**, npm or cargo, client or server.
- **Plain JavaScript inside `.ts` files.** No type annotations (CLAUDE.md). Generated shadcn-svelte components keep theirs.
- **Comments and user copy in Spanish** where the surrounding file is Spanish; explain *why*, never *what*.
- **The guide changes in the same commit as the code it describes** (CLAUDE.md): `docs/guia/18-nube.md`, plus the "Última actualización" line and date in `docs/guia-de-uso.md`.
- **No commit carries agent traces** — no `Co-Authored-By`, no "Generated with". This repo deploys to Vercel from `main`.
- **Do not push to `main` until Task 1's SQL has been applied to the Supabase project by Hernán.** Every client task in this plan is incompatible with the schema in production today. Work on the branch `feat/pasar-la-llave`.
- **PBKDF2 stays at 600.000 rounds, SHA-256.** Same floor as the recovery code.
- **The pairing code is 8 Crockford base32 characters**, alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, shown as `XXXX-XXXX`, ten-minute expiry. Length, expiry and delete-on-use hold each other up — see the spec's "The pairing code" before changing any one of them.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema.sql` (modify) | `vaults` slims and gains the proof; `pairings` is born; `reset_cloud()` is born |
| `scripts/rls-check.mjs` (modify) | Attacks the two new surfaces from another account |
| `src/lib/sync/vault.ts` (modify) | Key creation, the proof blob, wrapping and unwrapping for a peer. No network. |
| `src/lib/sync/vault.test.ts` (modify) | The crypto contract |
| `src/lib/storage/db.ts` (modify) | v10: drop the old, unpassable vault rows |
| `src/lib/sync/pairing.ts` (create) | The network half of pairing: park the blob, take it, delete it |
| `src/lib/sync/pairing.test.ts` (create) | Ordering, expiry, wrong code, row deleted after use |
| `src/lib/sync/leave.ts` (modify) | `resetCloud()` — server first, then the existing local reset |
| `src/lib/sync/upload.ts` (modify) | `vaults` row becomes the proof; the 23505 fork now opens the proof |
| `src/lib/sync/upload.test.ts` (modify) | Keeps the a4c6e0d regression alive through the rewrite |
| `src/lib/components/SettingsDialog.svelte` (modify) | Three screens: show a code, ask for a code, start over |
| `docs/guia/18-nube.md` (modify) | What the person reads |

---

### Task 1: The server

Nothing in this task runs against a fake. It ends with a real query against the real project.

**Files:**
- Modify: `supabase/schema.sql` (the `vaults` block, around the "vaults — the wrapped copy of the vault key" heading, and the RLS block at the end)
- Modify: `scripts/rls-check.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.pairings (owner_id uuid pk, salt text, iv text, wrapped text, expires_at timestamptz)`; `public.vaults (owner_id uuid pk, iv text, check_blob text, created_at timestamptz)`; function `public.reset_cloud() returns void`.

- [ ] **Step 1: Rewrite the `vaults` block in `supabase/schema.sql`**

Replace the whole `vaults` section (its comment and its `create table`) with this. The `alter table` lines are what upgrade the existing project; the `create table` is for a fresh one.

```sql
-- ---------------------------------------------------------------------------
-- vaults — que esta cuenta tiene bóveda, y una prueba de cuál
-- ---------------------------------------------------------------------------
--
-- Ya no guarda la llave envuelta (spec 035): la llave se pasa de aparato a
-- aparato por `pairings` y acá arriba no queda ninguna copia de ella.
--
-- Lo que queda es una prueba: el texto `copynotes` cifrado con la llave de la
-- bóveda. No abre nada y no le sirve a nadie, pero deja que un aparato conteste
-- una pregunta que sin ella no tiene respuesta. La clave primaria es el dueño,
-- así que crear la bóveda dos veces choca con 23505 — y ese choque significa dos
-- cosas opuestas: que otro aparato llegó primero, o que la fila la dejó este
-- mismo la corrida anterior. El que puede abrir la prueba es el segundo caso.
-- Confundirlos ya costó una salida de servicio (ver el commit a4c6e0d).

create table if not exists public.vaults (
	owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
	iv text not null,
	check_blob text not null,
	created_at timestamptz not null default now()
);

-- El proyecto que ya existe: la copia envuelta se va, la prueba entra.
alter table public.vaults add column if not exists check_blob text;
alter table public.vaults drop column if exists salt;
alter table public.vaults drop column if exists wrapped;
```

Leave `iv` alone: it already exists and it is reused for the proof.

- [ ] **Step 2: Add the `pairings` table, right after the `vaults` block**

```sql
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
```

- [ ] **Step 3: Add `reset_cloud()`, right after `push_records`**

```sql
-- ---------------------------------------------------------------------------
-- reset_cloud — empezar de nuevo la nube
-- ---------------------------------------------------------------------------
--
-- La única forma de borrar algo de acá arriba, y tiene nombre a propósito.
-- `records` no acepta escrituras directas de nadie (todo entra por
-- `push_records`), así que abrir una política general de borrado desharía eso;
-- esta función borra exactamente lo de quien llama y nada más.
--
-- Es la salida de quien se quedó sin ningún aparato con la llave: lo que hay
-- arriba es ilegible para siempre, y lo honesto es poder vaciarlo y volver a
-- subir desde el aparato que todavía tiene las notas.

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
	-- Con `security definer` la seguridad a nivel de fila ya no vuelve a filtrar:
	-- el filtro por dueño de acá es la única defensa, y por eso está en las tres.
	delete from public.records where owner_id = auth.uid();
	delete from public.pairings where owner_id = auth.uid();
	delete from public.vaults where owner_id = auth.uid();
end;
$$;

revoke all on function public.reset_cloud() from public;
grant execute on function public.reset_cloud() to authenticated;
```

- [ ] **Step 4: Add the `pairings` policies to the RLS block at the end of the file**

```sql
alter table public.pairings enable row level security;

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
```

- [ ] **Step 5: Add the three attacks to `scripts/rls-check.mjs`**

Add them next to the existing numbered checks, following the file's style. `alice` and `bob` are the two accounts the script already creates; use whatever names that file uses.

```js
// 8. La llave de paso de una cuenta es invisible para la otra. Es la única
// ventana en la que la llave existe fuera de un aparato, así que si esto se
// rompe, se rompe todo lo demás con ello.
unwrap(
	await alice.client.from('pairings').insert({
		salt: btoa('sal-de-alice'),
		iv: btoa('123456789012'),
		wrapped: btoa('la-llave-de-alice'),
		expires_at: new Date(Date.now() + 600_000).toISOString()
	})
);
const espiada = unwrap(await bob.client.from('pairings').select('wrapped'));
assert.deepEqual(espiada, [], 'bob no puede ver la llave de paso de alice');

// 9. Y tampoco puede borrársela, que dejaría a alice sin poder sumar el aparato
// justo cuando lo está sumando.
await bob.client.from('pairings').delete().eq('owner_id', alice.id);
const sigue = unwrap(await alice.client.from('pairings').select('wrapped'));
assert.equal(sigue.length, 1, 'bob no puede borrar la llave de paso de alice');

// 10. Una fila vencida no la ve ni su propio dueño: el vencimiento lo decide el
// servidor, no el reloj del aparato.
unwrap(await alice.client.from('pairings').delete().eq('owner_id', alice.id));
unwrap(
	await alice.client.from('pairings').insert({
		salt: btoa('sal-vieja'),
		iv: btoa('123456789012'),
		wrapped: btoa('llave-vencida'),
		expires_at: new Date(Date.now() - 1000).toISOString()
	})
);
const vencida = unwrap(await alice.client.from('pairings').select('wrapped'));
assert.deepEqual(vencida, [], 'una llave de paso vencida no se lee');

// 11. Empezar de nuevo borra lo propio y nada de lo ajeno.
unwrap(await alice.client.rpc('reset_cloud'));
const deBob = unwrap(await bob.client.from('records').select('id'));
assert.equal(deBob.length > 0, true, 'reset_cloud de alice no tocó lo de bob');
```

Add `pairings` to whatever cleanup the script already does at the end, so a failed run leaves nothing behind.

- [ ] **Step 6: Hernán applies the SQL — MANUAL, BLOCKING**

Paste the whole of `supabase/schema.sql` into the Supabase SQL editor and run it. The file is idempotent. If an agent is executing this plan unattended, **stop here and leave the rest of this task for the human**; Tasks 2 to 5 do not need the server and can proceed.

- [ ] **Step 7: Run the lock check**

Run: `pnpm rls:check`
Expected: every check passes, including the four new ones.

- [ ] **Step 8: Commit**

```bash
git add supabase/schema.sql scripts/rls-check.mjs
git commit -m "feat(nube): el servidor guarda una prueba, no la llave"
```

---

### Task 2: The key becomes wrappable, and learns to travel

**Files:**
- Modify: `src/lib/sync/vault.ts`
- Modify: `src/lib/sync/vault.test.ts`
- Modify: `src/lib/storage/db.ts` (after the `db.version(9)` block, around line 142)

**Interfaces:**
- Consumes: nothing from Task 1 (no network here).
- Produces:
  - `createVault(): Promise<void>` — no longer returns a recovery code
  - `makePairingBlob(): Promise<{ code, expiresAt, blob: { salt, iv, wrapped } }>` — `code` is `"XXXX-XXXX"`, `expiresAt` an ISO string
  - `openPairingBlob(code, blob): Promise<CryptoKey>` — stores the key and returns it
  - `normalizePairingCode(code): string` — 8 chars, throws on anything else
  - `makeVaultProof(): Promise<{ iv, check_blob }>` and `proofOpens(proof): Promise<boolean>`
  - `hasVault()`, `getVaultKey()` unchanged
  - **Deleted:** `restoreVault`, `getRecoveryBlob`, `normalizeRecoveryCode`

- [ ] **Step 1: Write the failing tests**

Replace the two `describe` blocks in `src/lib/sync/vault.test.ts` with these. Keep the file's existing imports of `db`, `dumpAllTables`, `createNote`, `encryptRecord`, `decryptRecord`, `grantUploadConsent`, `setSetting`, `KEY`, and its `beforeEach`.

```js
import {
	createVault,
	getVaultKey,
	hasVault,
	makePairingBlob,
	makeVaultProof,
	normalizePairingCode,
	openPairingBlob,
	proofOpens
} from './vault';

const PAIRING = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

describe('la llave de la bóveda', () => {
	it('empieza ausente y aparece al crearla, sin código que guardar', async () => {
		expect(await hasVault()).toBe(false);

		// Ya no devuelve nada que haya que anotar en ningún lado: eso es la spec.
		expect(await createVault()).toBe(undefined);

		expect(await hasVault()).toBe(true);
		expect(await getVaultKey()).not.toBe(null);
	});

	it('cifra un registro que sólo esta bóveda puede volver a leer', async () => {
		await createVault();
		const key = await getVaultKey();

		const payload = await encryptRecord(key, 'notes', {
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});

		expect(JSON.stringify(payload)).not.toContain('banco');
		expect(await decryptRecord(key, payload)).toEqual({
			id: 'nota-1',
			title: 'Contraseñas del banco',
			deletedAt: null
		});
	});

	it('se niega a existir antes del permiso para subir', async () => {
		await setSetting(KEY.syncConsent, false);

		await expect(createVault()).rejects.toThrow(/permiso/i);
		expect(await hasVault()).toBe(false);
	});

	it('se niega a crear una segunda bóveda encima de la primera', async () => {
		await createVault();

		await expect(createVault()).rejects.toThrow();
	});

	it('queda afuera del respaldo JSON, que es texto plano', async () => {
		await createVault();
		await createNote({ title: 'una nota' });

		const dump = await dumpAllTables();

		expect(dump.vault).toBe(undefined);
	});
});

describe('la prueba que queda en el servidor', () => {
	it('la abre la llave que la hizo, y ninguna otra', async () => {
		await createVault();
		const proof = await makeVaultProof();

		expect(await proofOpens(proof)).toBe(true);

		// Otro aparato, otra llave: la misma prueba no abre. Es lo que distingue
		// "esta bóveda es mía" de "otro aparato llegó primero" (spec 035).
		await db.table('vault').clear();
		await createVault();

		expect(await proofOpens(proof)).toBe(false);
	});

	it('no lleva la llave adentro', async () => {
		await createVault();
		const proof = await makeVaultProof();

		// Lo que viaja es un texto conocido cifrado. Que no se pueda leer el texto
		// conocido es justamente lo que hace que la prueba no regale nada.
		expect(JSON.stringify(proof)).not.toContain('copynotes');
	});
});

describe('sumar un aparato con el código de paso', () => {
	it('la llave llega entera del otro lado', async () => {
		await createVault();
		const primera = await getVaultKey();
		const payload = await encryptRecord(primera, 'notes', {
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		const { code, blob } = await makePairingBlob();

		// El aparato nuevo: base vacía, más lo que el servidor tenía guardado.
		await db.table('vault').clear();
		expect(await hasVault()).toBe(false);

		const recibida = await openPairingBlob(code, blob);

		expect(await decryptRecord(recibida, payload)).toEqual({
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		expect(await hasVault()).toBe(true);
	});

	it('el aparato que se acaba de sumar puede sumar a un tercero', async () => {
		// Si la llave llegara sin permiso de envolverse, el segundo aparato sería
		// una vía muerta y nadie se enteraría hasta que hiciera falta.
		await createVault();
		const { code, blob } = await makePairingBlob();
		await db.table('vault').clear();
		await openPairingBlob(code, blob);

		const segunda = await makePairingBlob();

		expect(segunda.code).toMatch(PAIRING);
	});

	it('el código es corto, legible en voz alta y con vencimiento', async () => {
		await createVault();

		const { code, expiresAt } = await makePairingBlob();

		// Dos grupos de cuatro, sin letras que se confundan con números.
		expect(code).toMatch(PAIRING);
		const faltan = new Date(expiresAt).getTime() - Date.now();
		expect(faltan).toBeGreaterThan(9 * 60_000);
		expect(faltan).toBeLessThanOrEqual(10 * 60_000);
	});

	it('rechaza un código equivocado y no guarda nada', async () => {
		await createVault();
		const { blob } = await makePairingBlob();
		await db.table('vault').clear();

		await expect(openPairingBlob('ZZZZ-ZZZZ', blob)).rejects.toThrow();
		expect(await hasVault()).toBe(false);
	});

	it('perdona cómo la persona escribió el código', async () => {
		await createVault();
		const { code, blob } = await makePairingBlob();
		await db.table('vault').clear();

		const desprolijo = code.toLowerCase().replace('-', ' ');

		expect(await openPairingBlob(desprolijo, blob)).not.toBe(null);
	});

	it('lee o/O como cero e i/l como uno, como copia la gente', () => {
		expect(normalizePairingCode('o0Il-1lo0')).toBe('00111100');
	});

	it('rechaza un código de otro largo o con letras que nunca usa', () => {
		expect(() => normalizePairingCode('ABCD')).toThrow();
		expect(() => normalizePairingCode('UUUU-UUUU')).toThrow();
	});

	it('cada código es distinto del anterior', async () => {
		await createVault();

		const uno = await makePairingBlob();
		const dos = await makePairingBlob();

		expect(uno.code).not.toBe(dos.code);
		expect(uno.blob.wrapped).not.toBe(dos.blob.wrapped);
	});
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `pnpm vitest run src/lib/sync/vault.test.ts`
Expected: FAIL — `makePairingBlob is not a function`, and `createVault` still returning an object.

- [ ] **Step 3: Rewrite `src/lib/sync/vault.ts`**

Change the file's header comment: the second bullet about "a wrapped copy exists for other devices" and the paragraph about the recovery code are now wrong. Replace them with what the spec says — the key is passed between devices under a code that lives ten minutes, and the server holds a proof, not a copy.

Keep `VAULT_ID`, `KEY_BYTES`, `IV_BYTES`, `SALT_BYTES`, `DERIVE_ROUNDS`, `ALPHABET`, `encodeCode`, `keepStorage`, `hasVault`, `getVaultKey`. Delete `CODE_BYTES`, `CODE_LENGTH`, `normalizeRecoveryCode`, `getRecoveryBlob`, `restoreVault`.

```js
const PAIR_BYTES = 5; // 40 bits → exactamente 8 caracteres base32
const PAIR_LENGTH = 8;
const PAIRING_MINUTES = 10;
// El texto que se cifra con la llave y queda en el servidor como prueba. No es
// secreto: lo que prueba es quién puede abrirlo.
const PROOF_TEXT = 'copynotes';

// Lo que escribe la gente se perdona igual que antes: mayúsculas, espacios,
// guiones, y las letras que se copian mal a mano.
export function normalizePairingCode(code) {
	const cleaned = String(code)
		.toUpperCase()
		.replace(/[\s-]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (cleaned.length !== PAIR_LENGTH || [...cleaned].some((char) => !ALPHABET.includes(char))) {
		throw new Error('El código no tiene el formato correcto');
	}
	return cleaned;
}

// La llave que envuelve a la llave. `wrapKey`/`unwrapKey` y nada más: con esos
// permisos no puede cifrar una nota ni por error.
async function wrappingKey(code, salt) {
	const base = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(normalizePairingCode(code)),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: DERIVE_ROUNDS, hash: 'SHA-256' },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['wrapKey', 'unwrapKey']
	);
}

// `extractable: true`, y es la única defensa que la spec 035 entrega. Sin esto
// el navegador no envuelve la llave ni para dársela a otro aparato de la misma
// persona, y no hay forma de sumar un aparato sin que alguien haya guardado un
// código durante meses. Los bytes en claro NO pasan por acá: `wrapKey` exporta y
// cifra adentro del navegador. Lo que se pierde es que un script hostil que
// llegara a correr adentro de la app podría exportarla; lo que lo impide sigue
// siendo la CSP y el saneador de HTML.
function importVaultKey(raw) {
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function createVault() {
	if (await hasVault()) {
		throw new Error('Ya existe una bóveda en este dispositivo');
	}
	// Crear la llave y permitir subir son una sola decisión, y esta es la puerta
	// que lo hace cumplir en vez de la pantalla que lo pregunta. La bóveda existe
	// para servir a la nube: acá las notas están en claro igual (spec 030, D1).
	if (!(await hasUploadConsent())) {
		throw new Error('Primero hace falta el permiso para subir a la nube');
	}
	const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
	const key = await importVaultKey(raw);
	// La única copia legible de la llave muere acá; la CryptoKey sigue viva.
	raw.fill(0);
	await vault().put({ id: VAULT_ID, key, createdAt: now() });
	await keepStorage();
}

// La prueba que va al servidor: un texto conocido cifrado con esta llave. Sirve
// para una sola pregunta, y es una que sin ella no tiene respuesta: cuando el
// servidor dice "esta cuenta ya tiene bóveda", ¿es la mía o la de otro aparato?
export async function makeVaultProof() {
	const key = await getVaultKey();
	if (!key) throw new Error('Este dispositivo todavía no tiene la bóveda');
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const sealed = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(PROOF_TEXT)
	);
	return { iv: toBase64(iv), check_blob: toBase64(new Uint8Array(sealed)) };
}

export async function proofOpens(proof) {
	const key = await getVaultKey();
	if (!key || !proof?.iv || !proof?.check_blob) return false;
	try {
		const opened = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(proof.iv) },
			key,
			fromBase64(proof.check_blob)
		);
		return new TextDecoder().decode(opened) === PROOF_TEXT;
	} catch {
		// Otra llave. No es un error: es la respuesta.
		return false;
	}
}

// Lo que el aparato viejo le muestra al nuevo. El código se sortea acá y no se
// guarda en ningún lado: vive en la pantalla diez minutos y se acabó.
export async function makePairingBlob() {
	const row = await vault().get(VAULT_ID);
	if (!row) throw new Error('Este dispositivo todavía no tiene la bóveda');
	const codeBytes = crypto.getRandomValues(new Uint8Array(PAIR_BYTES));
	const code = encodeCode(codeBytes);
	codeBytes.fill(0);
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const wrapped = await crypto.subtle.wrapKey('raw', row.key, await wrappingKey(code, salt), {
		name: 'AES-GCM',
		iv
	});
	return {
		code,
		expiresAt: new Date(Date.now() + PAIRING_MINUTES * 60_000).toISOString(),
		blob: {
			salt: toBase64(salt),
			iv: toBase64(iv),
			wrapped: toBase64(new Uint8Array(wrapped))
		}
	};
}

// El otro lado. Un código equivocado falla acá, en la comprobación del propio
// navegador —AES-GCM abre o no abre, no hay "casi"— y no deja nada guardado.
//
// Llega `extractable: true` a propósito: el aparato que se acaba de sumar tiene
// que poder sumar a un tercero, o sería una vía muerta que nadie descubre hasta
// que hace falta.
export async function openPairingBlob(code, blob) {
	const key = await crypto.subtle.unwrapKey(
		'raw',
		fromBase64(blob.wrapped),
		await wrappingKey(code, fromBase64(blob.salt)),
		{ name: 'AES-GCM', iv: fromBase64(blob.iv) },
		{ name: 'AES-GCM' },
		true,
		['encrypt', 'decrypt']
	);
	await vault().put({ id: VAULT_ID, key, createdAt: now() });
	await keepStorage();
	return key;
}
```

- [ ] **Step 4: Add the Dexie migration in `src/lib/storage/db.ts`**

Right after the `db.version(9)` block:

```js
// v10 (spec 035): las bóvedas de antes no se pueden pasar a otro aparato. Su
// llave se importó sin permiso de exportación, así que el navegador no la
// entrega ni para envolverla, y una fila así se ve sana mientras no puede hacer
// lo único nuevo. Se borra: el aparato queda pidiendo el código del otro, que es
// un estado que las pantallas saben atender. Las notas no se tocan — están en
// claro en este dispositivo y no dependen de la bóveda para nada.
db.version(10)
	.stores({ vault: 'id' })
	.upgrade(async (tx) => {
		await tx.table('vault').clear();
	});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/sync/vault.test.ts src/lib/storage/db.migrations.test.ts`
Expected: PASS. If `db.migrations.test.ts` asserts a version number, update it to 10.

- [ ] **Step 6: Fix what stopped compiling, but do not design here**

Run: `pnpm test`
Expected: failures only in `upload.test.ts`, `leave.test.ts` and anything importing `restoreVault`/`getRecoveryBlob` — those are Tasks 3 and 4. Do not touch `SettingsDialog.svelte` yet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sync/vault.ts src/lib/sync/vault.test.ts src/lib/storage/db.ts src/lib/storage/db.migrations.test.ts
git commit -m "feat(nube): la llave se puede pasar a otro aparato"
```

---

### Task 3: The road to the server

**Files:**
- Create: `src/lib/sync/pairing.ts`
- Create: `src/lib/sync/pairing.test.ts`
- Modify: `src/lib/sync/upload.ts` (`uploadVaultBlob` around line 144, `cloudVaultBlob` around line 171)
- Modify: `src/lib/sync/upload.test.ts` (the `serverVault` fake and the two 23505 tests)
- Modify: `src/lib/sync/leave.ts` (add `resetCloud`, export `resetCloudState`)

**Interfaces:**
- Consumes: `makePairingBlob`, `openPairingBlob`, `normalizePairingCode`, `makeVaultProof`, `proofOpens` (Task 2); tables `pairings` and `vaults`, function `reset_cloud` (Task 1).
- Produces:
  - `startPairing(): Promise<{ code, expiresAt }>` (`pairing.ts`)
  - `joinWithPairingCode(code): Promise<CryptoKey>` (`pairing.ts`)
  - `resetCloud(): Promise<void>` (`leave.ts`)
  - `cloudVaultExists()` unchanged in name and meaning (`upload.ts`)

- [ ] **Step 1: Write `src/lib/sync/pairing.test.ts`**

```js
// El viaje de la llave entre dos aparatos, contra un servidor de mentira. Lo que
// se prueba acá no es Supabase: es el orden (pisar el código viejo antes de
// dejar el nuevo), que lo usado se borre, y que cada final feo tenga su frase.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createVault, getVaultKey, hasVault, makePairingBlob } from './vault';
import { encryptRecord, decryptRecord } from './records';
import { grantUploadConsent } from './pending';

// Lo que el servidor tiene guardado, y todo lo que se le pidió.
const server = vi.hoisted(() => ({ row: null, calls: [] }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		from: (table) => ({
			insert: async (row) => {
				server.calls.push(['insert', table]);
				server.row = row;
				return { error: null };
			},
			delete: () => ({
				eq: async () => {
					server.calls.push(['delete', table]);
					server.row = null;
					return { error: null };
				}
			}),
			select: () => ({
				maybeSingle: async () => {
					server.calls.push(['select', table]);
					return { data: server.row, error: null };
				}
			})
		})
	})
}));

import { startPairing, joinWithPairingCode } from './pairing';

beforeEach(async () => {
	server.row = null;
	server.calls.length = 0;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
});

describe('mostrar el código en el aparato que ya tiene la llave', () => {
	it('deja la llave envuelta arriba y devuelve el código para la pantalla', async () => {
		await createVault();

		const { code, expiresAt } = await startPairing();

		expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
		expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
		expect(server.row.wrapped).toEqual(expect.any(String));
		// El código de la pantalla NO viaja: lo que sube es la llave cerrada con él.
		expect(JSON.stringify(server.row)).not.toContain(code.replace('-', ''));
	});

	it('pisa el código anterior antes de dejar el nuevo', async () => {
		// La clave primaria es el dueño: sin borrar primero, el segundo pedido
		// chocaría y la persona se quedaría mirando un código que ya no vale.
		await createVault();

		await startPairing();
		server.calls.length = 0;
		await startPairing();

		expect(server.calls).toEqual([
			['delete', 'pairings'],
			['insert', 'pairings']
		]);
	});
});

describe('sumar el aparato nuevo', () => {
	it('baja la llave, la abre y borra lo que usó', async () => {
		await createVault();
		const original = await getVaultKey();
		const payload = await encryptRecord(original, 'notes', {
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		const { code } = await startPairing();
		// El aparato nuevo: la misma cuenta, ninguna llave.
		await db.table('vault').clear();
		server.calls.length = 0;

		const recibida = await joinWithPairingCode(code);

		expect(await decryptRecord(recibida, payload)).toEqual({
			id: 'nota-1',
			title: 'Sueldos 2026',
			deletedAt: null
		});
		// Usada una vez y borrada: la ventana en la que la llave existe fuera de un
		// aparato dura lo que dura el viaje, no diez minutos.
		expect(server.calls).toContainEqual(['delete', 'pairings']);
		expect(server.row).toBe(null);
	});

	it('cuando no hay nada arriba dice que venció, no que el código está mal', async () => {
		// El servidor esconde la fila vencida, así que "no hay fila" es exactamente
		// lo que ve un aparato que tardó. Decirle "código equivocado" lo mandaría a
		// mirar sus dedos en vez de a pedir otro.
		await createVault();
		await db.table('vault').clear();

		await expect(joinWithPairingCode('ABCD-EFGH')).rejects.toThrow(/venció/i);
		expect(await hasVault()).toBe(false);
	});

	it('con un código equivocado no guarda nada y lo dice en criollo', async () => {
		await createVault();
		await startPairing();
		await db.table('vault').clear();

		await expect(joinWithPairingCode('ZZZZ-ZZZZ')).rejects.toThrow(/no es el que muestra/i);
		expect(await hasVault()).toBe(false);
		// Y la llave sigue arriba: un dedo equivocado no puede dejar a la persona
		// sin poder reintentar.
		expect(server.row).not.toBe(null);
	});

	it('un código con formato imposible se rechaza antes de tocar el servidor', async () => {
		await createVault();
		await startPairing();
		server.calls.length = 0;

		await expect(joinWithPairingCode('ABC')).rejects.toThrow(/formato/i);
		expect(server.calls).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `pnpm vitest run src/lib/sync/pairing.test.ts`
Expected: FAIL — cannot resolve `./pairing`.

- [ ] **Step 3: Write `src/lib/sync/pairing.ts`**

```js
// Pasar la llave de un aparato a otro (spec 035).
//
// El aparato que ya tiene la bóveda muestra ocho caracteres; el nuevo los
// escribe. Entre medio, la llave viaja envuelta con ese código por una fila del
// servidor que vive diez minutos y se borra al usarse. El servidor nunca puede
// abrirla: lo único que la abre es lo que hay en la pantalla del otro aparato.
//
// La parte de criptografía vive en `vault.ts`, que no sabe de red. Acá está el
// viaje, que no sabe de criptografía.

import { supabase } from './supabase';
import { makePairingBlob, normalizePairingCode, openPairingBlob } from './vault';

function client() {
	const supa = supabase();
	if (!supa) throw new Error('Esta copia de CopyNotes no tiene nube configurada.');
	return supa;
}

async function ownerId(supa) {
	const { data } = await supa.auth.getSession();
	const id = data.session?.user?.id;
	if (!id) throw new Error('Hace falta entrar a tu cuenta antes de sumar un aparato.');
	return id;
}

export async function startPairing() {
	const supa = client();
	const owner = await ownerId(supa);
	const { code, expiresAt, blob } = await makePairingBlob();
	// Borrar antes de crear: la clave primaria es el dueño, así que una fila vieja
	// —vencida o no— haría chocar el insert, y la persona se quedaría mirando un
	// código que el otro aparato no va a poder usar.
	await supa.from('pairings').delete().eq('owner_id', owner);
	const { error } = await supa.from('pairings').insert({ ...blob, expires_at: expiresAt });
	if (error) throw new Error(error.message);
	return { code, expiresAt };
}

export async function joinWithPairingCode(code) {
	// Antes que nada y sin red: un código de largo imposible no es un viaje.
	normalizePairingCode(code);
	const supa = client();
	const owner = await ownerId(supa);
	const { data, error } = await supa.from('pairings').select('salt, iv, wrapped').maybeSingle();
	if (error) throw new Error(error.message);
	// El servidor esconde la fila vencida, así que "no hay nada" y "venció" son lo
	// mismo visto desde acá — y es lo que hay que decir, porque manda a la persona
	// a pedir otro código en vez de a revisar cómo lo escribió.
	if (!data) {
		throw new Error('El código venció. Pedí uno nuevo en el aparato donde ya tenés las notas.');
	}
	let key;
	try {
		key = await openPairingBlob(code, data);
	} catch {
		// AES-GCM abre o no abre. Un fallo acá es el código, no la red, y la fila
		// se queda arriba para que se pueda reintentar.
		throw new Error('Ese código no es el que muestra el otro aparato.');
	}
	// Usada una vez. La ventana en la que la llave existe fuera de un aparato dura
	// lo que dura el viaje, no los diez minutos completos.
	await supa.from('pairings').delete().eq('owner_id', owner);
	return key;
}
```

- [ ] **Step 4: Run the pairing tests**

Run: `pnpm vitest run src/lib/sync/pairing.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `uploadVaultBlob` and `cloudVaultBlob` in `src/lib/sync/upload.ts`**

`getRecoveryBlob` is gone, so the import at the top becomes `import { makeVaultProof, proofOpens, getVaultKey } from './vault';`.

```js
// Lo que este aparato deja arriba: la marca de que la cuenta tiene bóveda, y la
// prueba de cuál (spec 035). La llave NO sube: lo que sube es un texto conocido
// cifrado con ella, que no le sirve a nadie y que sólo abre quien la tiene.
//
// `insert`, nunca `upsert`. La primera bóveda de la cuenta gana; la segunda
// choca contra la clave primaria. Y ese choque significa dos cosas opuestas —
// otro aparato llegó primero, o esta fila la dejé yo la corrida anterior— que el
// servidor contesta igual, porque `vaultBlobSent` sólo vive lo que vive la
// ventana. Abrir la prueba es lo que las distingue. Confundirlas dejó una vez a
// un aparato sano acusándose a sí mismo y sin subir nada (commit a4c6e0d).
async function uploadVaultBlob(client) {
	if (vaultBlobSent) return;
	if (!(await getVaultKey())) return;
	const proof = await makeVaultProof();
	const { error } = await client.from('vaults').insert(proof);
	// 23505 = unique_violation en Postgres.
	if (error?.code === '23505') {
		if (await proofOpens(await cloudVaultProof())) {
			vaultBlobSent = true;
			return;
		}
		throw userFacing(
			'Esta cuenta ya tiene una bóveda creada en otro aparato. Sumá este aparato con el código que muestra el otro.'
		);
	}
	if (error) throw new Error(error.message);
	vaultBlobSent = true;
}

// La prueba que dejó el aparato que creó la bóveda de esta cuenta, o null.
export async function cloudVaultProof() {
	const client = supabase();
	if (!client) return null;
	const { data, error } = await client.from('vaults').select('iv, check_blob').maybeSingle();
	if (error) throw new Error(error.message);
	return data ?? null;
}

export async function cloudVaultExists() {
	return Boolean(await cloudVaultProof());
}
```

Delete the old `cloudVaultBlob` and update its callers: `SettingsDialog.svelte` imports it (Task 4 handles that file).

- [ ] **Step 6: Update `src/lib/sync/upload.test.ts`**

The fake server's `select()` already answers `maybeSingle` with `serverVault.row`; only what the rows hold changes. In the two 23505 tests, `serverVault.row` must now be a proof:

- "para y lo dice, en vez de pisar la llave del otro": set `serverVault.row = { iv: btoa('123456789012'), check_blob: btoa('de-otra-llave') }` before syncing, so `proofOpens` returns false. Update the expected sentence to the new wording.
- "no confunde su propia bóveda, de la corrida anterior, con la de otro": keep it, and set `serverVault.row = rowsFor('vaults')[0]` exactly as it does today — that row is now the proof this device just made, so `proofOpens` returns true. **This test is the regression guard from a4c6e0d and must not be deleted.**

- [ ] **Step 7: Add `resetCloud` to `src/lib/sync/leave.ts`**

Change `async function resetCloudState()` to `export async function resetCloudState()` and add, below `forgetCloudAccount`:

```js
// Empezar de nuevo la nube (spec 035): para quien se quedó sin ningún aparato
// con la llave. Lo que hay arriba es ilegible para siempre, así que lo honesto
// es poder vaciarlo y volver a subir desde el aparato que sí tiene las notas.
//
// El servidor primero, a propósito: si el borrado de allá falla, este aparato se
// queda exactamente como estaba —con su llave y su permiso— en vez de a mitad de
// camino, sin llave y con la nube llena de bultos que ya no puede abrir.
//
// Las notas locales no se tocan. Ni una fila.
export async function resetCloud() {
	const supa = supabase();
	if (!supa) throw new Error('Esta copia de CopyNotes no tiene nube configurada.');
	const { error } = await supa.rpc('reset_cloud');
	if (error) throw new Error(error.message);
	await resetCloudState();
}
```

Add `supabase` to the existing import from `./supabase`.

- [ ] **Step 8: Add the reset test to `src/lib/sync/leave.test.ts`**

Follow that file's existing mock of `./supabase` — add `rpc` to it, recording calls.

```js
it('empezar de nuevo vacía la nube y deja el aparato como recién instalado', async () => {
	await grantUploadConsent();
	await createVault();
	const nota = await createNote({ title: 'una nota' });

	await resetCloud();

	expect(llamadas).toContainEqual('reset_cloud');
	expect(await hasVault()).toBe(false);
	expect(await hasUploadConsent()).toBe(false);
	// Y lo único que importa de verdad: la nota sigue acá.
	expect(await db.table('notes').get(nota.id)).toBeTruthy();
});

it('si el servidor no pudo borrar, este aparato queda como estaba', async () => {
	await grantUploadConsent();
	await createVault();
	falla.rpc = { message: 'no se pudo' };

	await expect(resetCloud()).rejects.toThrow();

	// Media limpieza es peor que ninguna: sin llave, lo de arriba sería ilegible
	// y encima no se habría borrado.
	expect(await hasVault()).toBe(true);
	expect(await hasUploadConsent()).toBe(true);
});
```

- [ ] **Step 9: Run everything below the UI**

Run: `pnpm vitest run src/lib/sync`
Expected: PASS everywhere except any test that imports `SettingsDialog` (there are none).

- [ ] **Step 10: Commit**

```bash
git add src/lib/sync/pairing.ts src/lib/sync/pairing.test.ts src/lib/sync/upload.ts src/lib/sync/upload.test.ts src/lib/sync/leave.ts src/lib/sync/leave.test.ts
git commit -m "feat(nube): el código de paso viaja, y la nube se puede vaciar"
```

---

### Task 4: The screens and the guide

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte`
- Modify: `docs/guia/18-nube.md`
- Modify: `docs/guia-de-uso.md` (line 5: the date and the "Nuevo:" sentence)
- Modify: `e2e/cloud-login.spec.ts` (or the nearest cloud spec) for the typed confirmation

**Interfaces:**
- Consumes: `startPairing`, `joinWithPairingCode` (`$lib/sync/pairing`), `resetCloud` (`$lib/sync/leave`), `createVault`, `hasVault` (`$lib/sync/vault`), `cloudVaultExists` (`$lib/sync/upload`).
- Produces: no exports; this is the last consumer.

- [ ] **Step 1: Cut the recovery-code screen**

In `SettingsDialog.svelte`:
- Delete the `{:else if recoveryCode}` branch (currently lines 528–597): the code display, the copy button, the "download as file" button and the "ya lo guardé" checkbox.
- Delete the state that fed it: `recoveryCode`, `recoverySaved`, `codePending`, and the `recovery`/`recovery-file` cases in `copiedField`/`copyText`.
- Delete the `saveRecoveryFile` helper (around line 361) and its import if it is now unused.
- In `makeVault`, drop `const { recoveryCode: code } = await createVault()` down to `await createVault()`.
- Update the `joinCode` state name to `pairCode` and its `disabled` guard from `length < 24` to `length < 8`.

- [ ] **Step 2: Rewrite the "join" branch**

Replace the body of `{:else if !vaultReady && accountHasVault}` (around line 723) with:

```svelte
<p class="text-muted-foreground text-sm">
	Esta cuenta ya tiene notas guardadas. Para abrirlas acá, pedile el código al
	aparato donde ya las tenés: <span class="text-foreground font-medium"
		>Configuración › Nube › Sumar un aparato</span
	>.
</p>
<input
	id="pair-code"
	type="text"
	autocomplete="off"
	autocapitalize="characters"
	spellcheck="false"
	bind:value={pairCode}
	placeholder="XXXX-XXXX"
	class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 font-mono text-sm outline-none"
/>
<button
	type="button"
	onclick={joinWithCode}
	disabled={cloudBusy || pairCode.trim().length < 8}
	class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
>
	Traer mis notas
</button>
{#if downloading}
	<p class="text-muted-foreground text-sm" aria-live="polite">
		Trayendo tus notas… {downloading.applied}
	</p>
{/if}
{@render startOver()}
```

And the handler, next to the other `cloudAction` callers:

```js
function joinWithCode() {
	return cloudAction(async () => {
		await joinWithPairingCode(pairCode.trim());
		pairCode = '';
		await downloadEverything();
	});
}
```

Reuse whatever the current `joinVault` does after `restoreVault` for the download half — do not invent a second download path.

- [ ] **Step 3: Add "Sumar un aparato" to the signed-in branch**

Inside the final `{:else}` branch (around line 795), above the sign-out row:

```svelte
<div class="flex flex-col gap-2">
	<p class="text-muted-foreground text-sm">
		Para ver estas notas en otro aparato, entrá con tu cuenta allá y escribí este
		código. Vale diez minutos y se usa una sola vez.
	</p>
	{#if pairingCode}
		<code class="bg-muted text-foreground self-start rounded-md px-3 py-2 font-mono text-lg tracking-widest"
			>{pairingCode}</code
		>
		<p class="text-faint text-xs" aria-live="polite">
			{pairingLeft > 0 ? `Vence en ${pairingLeft} minuto${pairingLeft === 1 ? '' : 's'}.` : 'Venció. Pedí otro.'}
		</p>
	{:else}
		<button
			type="button"
			onclick={showPairingCode}
			disabled={cloudBusy}
			class="border-border text-foreground hover:bg-accent focus-visible:ring-ring self-start rounded-md border px-3 py-1.5 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
		>
			Sumar un aparato
		</button>
	{/if}
</div>
```

State and handler:

```js
let pairingCode = $state(null);
let pairingExpiresAt = $state(null);
// Un tic por minuto mientras hay código en pantalla, y nada el resto del tiempo.
let clockTick = $state(0);
const pairingLeft = $derived(
	pairingExpiresAt
		? Math.max(0, Math.ceil((new Date(pairingExpiresAt).getTime() - clockTick) / 60_000))
		: 0
);

$effect(() => {
	if (!pairingCode) return;
	clockTick = Date.now();
	const timer = setInterval(() => (clockTick = Date.now()), 30_000);
	return () => clearInterval(timer);
});

function showPairingCode() {
	return cloudAction(async () => {
		const { code, expiresAt } = await startPairing();
		pairingCode = code;
		pairingExpiresAt = expiresAt;
	});
}
```

Clear `pairingCode` and `pairingExpiresAt` whenever the dialog closes, wherever the component already resets per-open state.

- [ ] **Step 4: Add the "start over" snippet, reachable from both dead ends**

Define it once as a Svelte snippet near the other markup, and render it in the join branch (Step 2) and in the signed-in branch:

```svelte
{#snippet startOver()}
	<details class="mt-2">
		<summary class="text-faint cursor-pointer text-xs">No tengo el otro aparato</summary>
		<div class="mt-2 flex flex-col gap-2">
			<p class="text-muted-foreground text-sm">
				Se borra <span class="text-foreground font-medium">todo lo que está en la nube</span> y se
				vuelve a subir desde este aparato. Tus notas de acá no se tocan. Lo que esté en la nube y
				no esté en este aparato, se pierde.
			</p>
			<label class="text-muted-foreground text-sm" for="confirm-reset">
				Escribí BORRAR para confirmar
			</label>
			<input
				id="confirm-reset"
				type="text"
				autocomplete="off"
				bind:value={resetWord}
				class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 font-mono text-sm outline-none"
			/>
			<button
				type="button"
				onclick={startCloudOver}
				disabled={cloudBusy || resetWord.trim().toUpperCase() !== 'BORRAR'}
				class="bg-destructive text-destructive-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
			>
				Empezar de nuevo la nube
			</button>
		</div>
	</details>
{/snippet}
```

```js
let resetWord = $state('');

function startCloudOver() {
	return cloudAction(async () => {
		await resetCloud();
		resetWord = '';
		pairingCode = null;
	});
}
```

- [ ] **Step 5: Close the dead end**

`refreshCloud` decides which branch renders. A device holding a vault the account rejected has `vaultReady === true`, so neither the join branch nor the snippet above would ever render for it — which is the 2026-08-07 dead end.

Add one piece of state, set from the failure that reports it:

```js
// Este aparato tiene una bóveda que la cuenta no acepta: la de otro aparato
// llegó primero. Sin esto, la pantalla avisa del problema y no ofrece ninguna
// de las dos salidas (diagnosticado el 2026-08-07).
let vaultRejected = $state(false);
```

Set it in `cloudAction`'s catch when the message matches the rejection, and make the join branch's condition `{:else if (!vaultReady || vaultRejected) && accountHasVault}`.

- [ ] **Step 6: Update the guide, in this same commit**

In `docs/guia/18-nube.md`, replace the whole "El código de recuperación (esto es lo que no hay que perder)" section and the "Abrir tus notas en otro dispositivo" section with:

```markdown
## Abrir tus notas en otro aparato

No hay ningún código que guardar. Cuando quieras ver tus notas en otro aparato:

1. En el aparato **nuevo**, entrá con tu cuenta. CopyNotes te va a decir que esta
   cuenta ya tiene notas guardadas.
2. En el aparato **donde ya las tenés**, andá a **Configuración › Nube › Sumar un
   aparato**. Te muestra ocho caracteres.
3. Escribilos en el aparato nuevo y tocá **Traer mis notas**.

Ese código vale **diez minutos** y se usa una sola vez. No sirve de nada
guardarlo: la próxima vez pedís otro.

> **Por qué así.** La llave que abre tus notas vive sólo en tus aparatos, nunca
> en nuestro servidor. Para que aparezca en uno nuevo, alguien se la tiene que
> pasar — y ese alguien sos vos, con el aparato en la mano.

### Si no tenés el otro aparato

Se rompió, lo perdiste, lo formateaste. Entonces lo que está en la nube no lo
puede abrir nadie, nosotros tampoco. La salida es **Empezar de nuevo la nube**,
abajo de donde se pide el código: borra lo que hay en el servidor y vuelve a
subir desde este aparato. **Tus notas de este aparato no se tocan.** Lo que se
pierde es lo que estuviera sólo en la nube y en ningún aparato tuyo.
```

Update `docs/guia-de-uso.md` line 5: date `2026-08-09` and a new leading "Nuevo:" sentence about the code disappearing.

- [ ] **Step 7: E2E for the typed confirmation**

Add to the nearest cloud e2e spec. The suite builds without a Supabase project, so the cloud section renders "no hay nube configurada" — check what that file already does about it and follow it; if the destructive button cannot be reached without a cloud, **do not fake one**: note it and let criterion 9's manual gate cover it.

- [ ] **Step 8: Run everything**

Run: `pnpm test && pnpm check && pnpm test:e2e`
Expected: unit and e2e green; `pnpm check` shows only the 4 errors that already exist on `main`.

- [ ] **Step 9: Screenshot the three states**

Follow the `verify` skill: launch the app, sign in, and capture (a) the "Sumar un aparato" code, (b) the join box, (c) the open "No tengo el otro aparato" section. Read the images. Tests do not see composition.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte docs/guia/18-nube.md docs/guia-de-uso.md e2e
git commit -m "feat(nube): sumar un aparato con un código que dura diez minutos"
```

---

### Task 5: Hernán's cloud, and the two-device gate

**Files:** none. This task is done by hand, with Hernán.

- [ ] **Step 1: Empty the existing cloud**

The notes in that project are test data (his words, 2026-08-09), so there is nothing to preserve. In the Supabase SQL editor:

```sql
delete from public.records;
delete from public.vaults;
```

- [ ] **Step 2: On each device, sign out of the cloud once**

`Configuración › Nube › Cerrar sesión`. This is what drops the old, unpassable vault — v10 also clears it, but a device that has not reloaded yet still holds it in memory.

- [ ] **Step 3: The gate, on two real devices**

- Device A: sign in, create the vault, let it upload.
- Device A: **Sumar un aparato** → a code appears with a countdown.
- Device B: sign in → the join box appears → type the code → the notes arrive.
- Device B: **Sumar un aparato** works there too (a device that joined can add a third).
- Wait past ten minutes with a fresh code and confirm a late attempt says it expired.
- On B: **Empezar de nuevo la nube**, typing BORRAR, and confirm A reports the account has no vault on its next sync.

- [ ] **Step 4: Write the outcome into the spec**

Add a dated line to `specs/035-device-pairing-vault.md` saying what passed and what did not, the way spec 034 records its own gate.

---

## Self-Review

**Spec coverage:** every numbered item of "What enters" maps to a task — 1 and 2 → Task 2; 3 → Tasks 2 and 3; 4 → Task 3 (`resetCloud`) and Task 4 (the screen); 5 → Task 1; 6 → Task 4. "The bug this spec must not bring back" → Task 3, Step 6. Acceptance criteria 1–7 → Tasks 2–4; 8 → Task 1; 9 → Task 5.

**Known gaps, deliberate:**
- The pairing round trip has no e2e. It needs two browsers with two storage jars and a real server; criterion 9 is the manual gate and the spec says so.
- Task 1 Step 6 is a human step. An agent running unattended stops there and continues with Task 2.
