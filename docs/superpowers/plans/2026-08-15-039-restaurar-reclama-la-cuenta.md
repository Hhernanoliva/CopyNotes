# Restaurar un respaldo reclama la cuenta (spec 039) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Reemplazar todo" makes the file the truth on this device **and** in the
account, so a restore parks zero conflicts instead of one per row.

**Architecture:** Three pieces, in this order. A new `reset_records()` on the
server that empties only `records` for the caller. A new client function that
runs **after** the local restore committed: gate → `reset_records()` →
`syncNow()`. And the confirmation text, which has to say that this reaches the
cloud and the other devices. Nothing in `push_records` or `decide()` is touched:
both are load-bearing guards that each closed a real data-loss bug, and the
restore is what lacked a meaning of its own.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie/IndexedDB, Supabase
(PostgREST + `security definer` functions), vitest (`jsdom` and `node`
projects), Playwright for e2e.

## Global Constraints

- **Plain JavaScript inside `.ts`/`.svelte`** for hand-written code: no type
  annotations (project CLAUDE.md).
- **Do not run prettier.** It is not this project's formatter and reformats files
  against the repo style (tabs, single quotes).
- **Never touch `push_records`' refusal rule or `decide()`.** Spec 039 "What does
  not enter", and AGENT.md.
- **`supabase/schema.sql` is idempotent from its first line.** Every new policy
  or function carries its `drop ... if exists` / `create or replace` so the whole
  file can be pasted twice.
- **No network call inside a Dexie transaction** — it commits the transaction
  early. The cloud half runs strictly after `replaceAllTables` resolved.
- **Same commit as the code:** the guide topic (`docs/guia/11-respaldo.md`) and
  the `CHANGELOG.md` bullet under `## 0.2.0`, in plain Spanish, no jargon.
- **Commits to this branch carry no agent traces** (no `Co-Authored-By`).
- Hernán's decisions, already made: **no extra warning** when another device is
  connected (the confirmation text is enough), and **no "restaurar sólo en este
  aparato"** option.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/schema.sql` (modify, next to `delete_records`) | `reset_records()`: deletes `public.records where owner_id = auth.uid()`, nothing else. Plus its `revoke`/`grant` pair. |
| `scripts/rls-check.mjs` (modify) | One more check: A's `reset_records` empties A, leaves B's records **and** A's own vault standing. |
| `src/lib/sync/upload.ts` (modify, 1 word) | `export` the existing `ready()` gate so the restore reuses the single definition of "this device can upload". |
| `src/lib/sync/restore.ts` (create) | `claimAccountAfterRestore()` and `restoreReachesCloud()`. The only new client logic. |
| `src/lib/sync/restore.test.ts` (create) | The measurement from the spec, turned around: a **stateful** fake server with the real refusal rule. This is the test that matters. |
| `src/lib/components/BackupDialog.svelte` (modify) | Calls the claim after the local restore, the honest split of toasts, and the confirmation sentence about the cloud. |
| `e2e/sidebar-organization.spec.ts` (modify) | The existing no-cloud restore asserts the cloud sentence is **absent**. |
| `docs/guia/11-respaldo.md`, `docs/guia-de-uso.md`, `CHANGELOG.md` (modify) | What the person sees. |

The e2e suite runs with no Supabase project (see the comment at the top of
`e2e/cloud-conflict.spec.ts`), so the cloud-on wording cannot be asserted there.
It is verified in the manual gate, Task 5.

---

## Task 1: `reset_records()` on the server

**Files:**
- Modify: `supabase/schema.sql` — right after `delete_records` (around line 478) for the function, and next to the other `revoke`/`grant` lines (around line 634)
- Modify: `scripts/rls-check.mjs` — a new check between today's 14 and 15 (around line 310)

**Interfaces:**
- Consumes: nothing.
- Produces: RPC `reset_records()` → `void`. Raises `'reset_records necesita una sesión iniciada'` with no session.

- [x] **Step 1: Write the function**

In `supabase/schema.sql`, immediately after `delete_records`:

```sql
-- Vaciar la copia cifrada de la cuenta, y NADA más (spec 039).
--
-- Su única llamadora es restaurar un respaldo con "Reemplazar todo": ahí el
-- archivo es la verdad, y sin vaciar primero, cada fila declara `base_seq: null`
-- contra una fila que existe, `push_records` la rechaza —con razón— y queda un
-- conflicto POR FILA. Medido: 25 filas, 25 conflictos, 0 subidas.
--
-- Y NO se reusa `reset_cloud()`: esa además borra `vaults` y `pairings`, así que
-- restaurar un archivo costaría la llave de la bóveda y volver a emparejar todos
-- los aparatos. Restaurar no es "empezar de nuevo la nube", y las dos tienen que
-- seguir siendo separables.
create or replace function public.reset_records()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'reset_records necesita una sesión iniciada';
	end if;
	delete from public.records where owner_id = auth.uid();
end;
$$;
```

And with the other permission lines:

```sql
revoke all on function public.reset_records() from public;
grant execute on function public.reset_records() to authenticated;
```

- [x] **Step 2: Add the lock check**

In `scripts/rls-check.mjs`, after today's check 14 (`delete_records`) and its
"Repuesta, así la prueba siguiente tiene algo que vaciar" push, and **before**
`reset_cloud` (which wipes everything and would make this vacuous):

```javascript
	// 15. Restaurar un respaldo vacía `records` de quien llama y nada más. Las dos
	//     cuentas tienen una fila con el MISMO id a propósito. Y la bóveda de A
	//     tiene que seguir en pie: si esto borrara `vaults`, restaurar un archivo
	//     costaría la llave (por eso `reset_records` existe y no se reusa
	//     `reset_cloud`).
	unwrap(await a.client.rpc('reset_records'));
	const vacioDeA = unwrap(await a.client.from('records').select('id'));
	assert.equal(vacioDeA.length, 0, 'reset_records no vació lo de quien lo llamó');
	const intactoDeB = unwrap(await b.client.from('records').select('blob'));
	assert.equal(atob(intactoDeB[0].blob), 'secreto-de-B', 'reset_records de A borró la fila de B');
	const bovedaDeA = unwrap(await a.client.from('vaults').select('check_blob'));
	assert.equal(bovedaDeA.length, 1, 'reset_records se llevó la bóveda de A');
	console.log('✓ reset_records vacía lo propio, no lo ajeno, y no toca la bóveda');

	// Repuesta otra vez, así `reset_cloud` tiene algo que vaciar.
	await push(a.client, [{ ...record('secreto-de-A-v4'), change_seq: 11, base_seq: null }]);
```

Renumber the following comment (`// 15.` → `// 16.`) and change the closing line
to `'\nCandado OK: las dieciséis pruebas pasaron.'`.

- [x] **Step 3: Apply the SQL and run the lock**

Hernán pastes the whole `supabase/schema.sql` into the Supabase SQL editor (it is
idempotent, that is its promise). **Do not trust "ya lo pegué" — measure it**:

```bash
node --env-file=.env -e '
const url=process.env.PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await fetch(`${url}/rest/v1/rpc/reset_records`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:"{}"});
console.log(r.status, await r.text());'
```

A 404 with "Could not find the function in the schema cache" means it was not
applied. Anything else (including the "necesita una sesión iniciada" exception)
means the function is there.

Then: `pnpm rls:check` → expected **16/16**.

- [x] **Step 4: Commit**

```bash
git add supabase/schema.sql scripts/rls-check.mjs
git commit -m "feat(respaldo): vaciar la copia de la nube sin tocar la bóveda"
```

---

## Task 2: The client claims the account after a restore

**Files:**
- Modify: `src/lib/sync/upload.ts:70` — add `export` to `async function ready()`
- Create: `src/lib/sync/restore.ts`
- Create: `src/lib/sync/restore.test.ts`

**No `vite.config.ts` change.** The node project's `include` is
`src/**/*.{test,spec}.{js,ts}`, so a new file lands there by default, and this one
needs no DOM: the only html it touches is `plainTextToHtml`, which is
`escapeHtml` + `split` — pure string work, no `DOMParser`. (The two spec-038 test
files needed the jsdom half because they call `sanitizeHtml`.)

**Interfaces:**
- Consumes: `ready()` from `./upload` → `{ client, key } | null`; `syncNow()` from `./upload`.
- Produces:
  - `claimAccountAfterRestore()` → `Promise<boolean>`. `false` = this device has no cloud and nothing was touched. `true` = the account was emptied and the restored state uploaded. Throws only if `reset_records` itself failed.
  - `restoreReachesCloud()` → `Promise<boolean>`, for the confirmation text.

- [x] **Step 1: Write the failing test**

Create `src/lib/sync/restore.test.ts`. The fake server here is **stateful** on
purpose — that is what makes it reproduce the bug:

```javascript
// Restaurar un respaldo con la nube encendida (spec 039). Este archivo es la
// medición que abrió la spec, dada vuelta: con el código de antes, restaurar 25
// filas dejaba 25 conflictos y 0 subidas.
//
// El servidor de mentira de `upload.test.ts` no sirve acá: no guarda nada, y lo
// que hay que reproducir es justamente la regla de rechazo contra una fila que YA
// EXISTE. Éste guarda filas y reparte `server_seq` que nunca retrocede.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { softDeleteNote } from '../storage/notes';
import { dumpAllTables, replaceAllTables } from '../storage/backup';
import { grantUploadConsent } from './pending';
import { createVault } from './vault';

const server = vi.hoisted(() => ({ rows: new Map(), seq: 0, resets: 0, calls: [] }));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		auth: { getSession: async () => ({ data: { session: { user: { id: 'cuenta-1' } } } }) },
		rpc: async (name, args) => {
			server.calls.push(name);
			if (name === 'reset_records') {
				server.rows.clear();
				server.resets++;
				return { data: null, error: null };
			}
			if (name === 'push_records') {
				const rejected = [];
				for (const row of args.payload) {
					const key = `${row.table_name}:${row.id}`;
					const held = server.rows.get(key);
					// La regla de verdad: base nula contra una fila que existe es un
					// rechazo, y una base que no coincide también.
					if (held && (row.base_seq === null || held.change_seq !== row.base_seq)) {
						rejected.push({ rejected_table: row.table_name, rejected_id: row.id });
						continue;
					}
					server.rows.set(key, { ...row, server_seq: ++server.seq });
				}
				return { data: rejected, error: null };
			}
			return { data: [], error: null };
		},
		from: () => ({
			insert: async () => ({ error: null }),
			select: () => ({
				maybeSingle: async () => ({ data: null, error: null }),
				gt: (_column, value) => ({
					order: () => ({
						limit: async () => ({
							data: [...server.rows.values()]
								.filter((row) => row.server_seq > Number(value))
								.sort((a, b) => a.server_seq - b.server_seq),
							error: null
						})
					})
				})
			})
		})
	})
}));

async function loadSync() {
	vi.resetModules();
	const [upload, restore] = await Promise.all([import('./upload'), import('./restore')]);
	return { syncNow: upload.syncNow, claimAccountAfterRestore: restore.claimAccountAfterRestore };
}

async function seedFiveNotes() {
	for (let n = 0; n < 5; n++) {
		const note = await createNote({ title: `nota ${n}` });
		for (let b = 0; b < 4; b++) await createBlock({ noteId: note.id, content: `renglón ${n}.${b}` });
	}
}

beforeEach(async () => {
	server.rows.clear();
	server.resets = 0;
	server.calls.length = 0;
	await Promise.all(db.tables.map((table) => table.clear()));
	await grantUploadConsent();
	await createVault();
});

describe('restaurar un respaldo con la nube encendida', () => {
	it('no deja ningún conflicto, y el servidor termina con el archivo', async () => {
		const { syncNow, claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		await syncNow();
		const backup = await dumpAllTables();
		const filas = server.rows.size;
		expect(filas).toBe(25);

		// Lo que hizo Hernán: borrar, y después restaurar el respaldo. Un borrado es
		// una marca, no una destrucción, y viaja como lápida: el servidor termina la
		// pasada con las 25 filas puestas como borradas.
		for (const note of await db.table('notes').toArray()) await softDeleteNote(note.id);
		await syncNow();
		await replaceAllTables(backup);
		await claimAccountAfterRestore();
		// Cinco pasadas: un conflicto que aparece tarde también cuenta.
		for (let pass = 0; pass < 5; pass++) await syncNow();

		expect(await db.table('conflicts').count()).toBe(0);
		const vivas = [...server.rows.values()].filter((row) => !row.deleted);
		expect(vivas.length).toBe(25);
	});

	it('vacía el servidor ANTES de subir, no después', async () => {
		const { syncNow, claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		await syncNow();
		const backup = await dumpAllTables();
		server.calls.length = 0;

		await replaceAllTables(backup);
		await claimAccountAfterRestore();

		// Al revés (subir y después vaciar) el servidor queda vacío y el aparato
		// creyendo que subió todo: la cuenta pierde las notas en silencio.
		expect(server.calls.indexOf('reset_records')).toBeLessThan(server.calls.indexOf('push_records'));
	});

	it('sin nube no toca la red y lo dice', async () => {
		await db.table('vault').clear();
		const { claimAccountAfterRestore } = await loadSync();
		server.calls.length = 0;

		expect(await claimAccountAfterRestore()).toBe(false);
		expect(server.calls).toEqual([]);
	});

	it('la bóveda y el permiso de subir sobreviven a un restore', async () => {
		const { claimAccountAfterRestore } = await loadSync();
		await seedFiveNotes();
		const backup = await dumpAllTables();

		await replaceAllTables(backup);
		await claimAccountAfterRestore();

		expect(await db.table('vault').count()).toBe(1);
		expect(server.resets).toBe(1);
	});
});
```

- [x] **Step 2: Run it and watch it fail for the right reason**

Run: `pnpm vitest run src/lib/sync/restore.test.ts`
Expected: FAIL — `Cannot find module './restore'`. That is the only acceptable
first failure; anything else means the fake server is wrong, not the code.

- [x] **Step 3: Export the existing gate**

In `src/lib/sync/upload.ts`, line 70, add `export`:

```javascript
export async function ready() {
```

Leave its body and its comment alone. It is the single definition of "this device
may upload" (configured, session, consent, vault key) and a second copy would
drift.

- [x] **Step 4: Write `restore.ts`**

```javascript
// La mitad de la nube de "Reemplazar todo" (spec 039).
//
// Restaurar reescribe cada fila como una edición local nueva, y hace bien: un
// archivo no puede afirmar nada sobre un servidor (spec 018). El precio es que
// para la nube eso es indistinguible de "editó 1500 filas sin conexión", así que
// `push_records` rechaza cada una y `decide()` estaciona un conflicto por fila.
// Las dos guardas están bien y cada una cerró una pérdida de datos real. Lo que
// faltaba era que restaurar signifique algo: es la única operación donde la
// persona YA contestó la pregunta que el conflicto está por hacerle.
//
// Por eso acá no se toca nada de la sincronización. Se vacía la copia de la nube
// y se sube por el camino de siempre.

import { ready, syncNow } from './upload';

// ¿Restaurar en este aparato va a reemplazar también la copia de la nube? Lo
// pregunta el cartel de confirmación, que tiene que decir la verdad y nada más:
// sin nube, sin sesión, sin permiso de subir o sin bóveda, restaurar es un asunto
// de este aparato solo.
export async function restoreReachesCloud() {
	return (await ready()) !== null;
}

// Corre DESPUÉS de que el restore local ya commiteó, y nunca adentro de su
// transacción: una llamada de red adentro de una transacción de Dexie la cierra
// antes de tiempo.
//
// El orden —vaciar y después subir— es el único recuperable. Si falla acá, el
// aparato quedó restaurado y la nube vieja, y volver a restaurar el archivo lo
// arregla. Al revés, un corte deja la cuenta vacía y el aparato sin nada.
//
// `syncNow` es a propósito, y no un subidor propio: es el que consulta
// `list_shares()` ANTES de subir (spec 038), así una nota compartida no se va por
// el caño cifrado. La marca `share` no viaja en el respaldo, así que después de
// restaurar este aparato no sabe qué notas están compartidas hasta esa consulta.
export async function claimAccountAfterRestore() {
	const gate = await ready();
	if (!gate) return false;
	const { error } = await gate.client.rpc('reset_records');
	if (error) throw new Error(error.message);
	await syncNow();
	return true;
}
```

- [x] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/sync/restore.test.ts`
Expected: PASS, 4 tests.

Then the whole suite, because `ready` became public and `restore.ts` imports
`upload.ts`: `pnpm vitest run` → expected **1101** passing (1097 + 4).

- [x] **Step 6: Prove the test discriminates**

Comment out the `reset_records` call in `restore.ts` and re-run the file. The
first test must fail with **25** conflicts — the exact number from the spec's
measurement. Put the line back. A green test that cannot go red is not a test.

- [x] **Step 7: Commit**

```bash
git add src/lib/sync/restore.ts src/lib/sync/restore.test.ts src/lib/sync/upload.ts
git commit -m "feat(respaldo): restaurar reclama la cuenta en vez de pelearse con ella"
```

---

## Task 3: The screen — say where this reaches, and call it

**Files:**
- Modify: `src/lib/components/BackupDialog.svelte` — the `confirmingReplace` step (around line 387), `applyReplaceAll` (around line 191), and the handler that enters the confirm step (the "Reemplazar todo…" button, around line 381)
- Modify: `e2e/sidebar-organization.spec.ts` (around line 216)

**Interfaces:**
- Consumes: `claimAccountAfterRestore()`, `restoreReachesCloud()` from `$lib/sync/restore`.
- Produces: nothing for later tasks.

- [x] **Step 1: Read the flag when the danger step opens**

In the `<script>`, next to the other `$state`:

```javascript
	// Si el cartel va a hablar de la nube. Se lee al entrar al paso de confirmar y
	// no con `$derived`: es una pregunta a la base y a la sesión, no un valor.
	let replaceReachesCloud = $state(false);
```

And the button that enters the step becomes:

```svelte
					<button
						type="button"
						onclick={async () => {
							replaceReachesCloud = await restoreReachesCloud();
							step = 'confirmingReplace';
						}}
```

Keep every existing attribute of that button (classes, `disabled`) untouched.

- [x] **Step 2: Write the sentence**

In the `confirmingReplace` block, after the existing paragraph:

```svelte
			{#if replaceReachesCloud}
				<p class="text-muted-foreground text-sm">
					También reemplaza <span class="text-foreground font-bold">la copia de la nube</span>: este
					archivo pasa a ser la versión buena de tu cuenta, y tus otros dispositivos van a quedar
					igual que este.
				</p>
			{/if}
```

Three facts, which is what the spec asks of it: the file wins, the cloud copy is
replaced, the other devices follow.

- [x] **Step 3: Call the claim, and be honest when it fails**

`applyReplaceAll` becomes:

```javascript
	async function applyReplaceAll() {
		importing = true;
		try {
			const data = $state.snapshot(review.replaceData);
			await replaceAllTables({ ...data, settings: filterSafeSettings(data.settings) });
		} catch {
			toast.error('No se pudo restaurar. Tus datos no cambiaron.');
			importing = false;
			return;
		}
		// Desde acá el aparato YA está restaurado: ningún mensaje puede decir "tus
		// datos no cambiaron", sería mentira. La nube es un segundo intento posible,
		// el restore no.
		let claimed = false;
		try {
			claimed = await claimAccountAfterRestore();
		} catch {
			toast.error(
				'Tus notas se restauraron en este dispositivo, pero no se pudo reemplazar la copia de la nube. Volvé a restaurar el archivo cuando tengas conexión.'
			);
		}
		try {
			const refreshed = await finishImport();
			if (refreshed === false) {
				toast.error('El respaldo se restauró, pero la pantalla no pudo actualizarse. Recargá CopyNotes.');
			} else if (claimed) {
				toast.success('Respaldo restaurado desde cero. La nube ya tiene esta versión.');
			} else {
				toast.success('Respaldo restaurado desde cero.');
			}
		} finally {
			importing = false;
		}
	}
```

Add `claimAccountAfterRestore, restoreReachesCloud` to the imports from
`$lib/sync/restore`.

- [x] **Step 4: Guard the no-cloud case in e2e**

The e2e suite runs with **no Supabase project**, so this is where "a local-only
install is not told about a cloud it does not have" gets locked down. In
`e2e/sidebar-organization.spec.ts`, right after the "Reemplazar todo…" click:

```javascript
	// Sin nube configurada, el cartel no habla de la nube (spec 039): a quien usa
	// CopyNotes en un aparato solo, esa frase le sobra y lo asusta.
	await expect(page.getByText('la copia de la nube')).toHaveCount(0);
```

Run: `pnpm test:e2e e2e/sidebar-organization.spec.ts`
Expected: PASS.

- [x] **Step 5: See it with your own eyes**

Green tests do not see composition. Take a Playwright screenshot of the
confirmation step into the scratchpad and `Read` it, light and dark. The two
paragraphs plus the red button must not turn into a wall of text.

- [x] **Step 6: Write the guide and the changelog**

`docs/guia/11-respaldo.md`: in the "Reemplazar todo" part, say that if you have
the cloud on, restoring also replaces the cloud copy and the other devices end up
like this one — and that this is what makes the restore actually work. Bump
"Última actualización" in `docs/guia-de-uso.md`.

`CHANGELOG.md`, under `## 0.2.0`:

```markdown
- Restaurar un respaldo con la nube encendida ahora funciona de verdad: antes cada renglón quedaba como una pregunta sin contestar y el respaldo no servía para nada. Ahora el archivo pasa a ser la versión buena de tu cuenta, y el cartel te avisa que esto también llega a tus otros dispositivos
```

- [x] **Step 7: Commit**

```bash
git add src/lib/components/BackupDialog.svelte e2e/sidebar-organization.spec.ts docs/ CHANGELOG.md
git commit -m "feat(respaldo): el cartel dice que esto también reemplaza la nube"
```

---

## Task 4: The whole suite, and the branch

**Files:** none.

- [x] **Step 1: Everything green**

```bash
pnpm vitest run          # 1101 expected
pnpm test:e2e            # los flakes preexistentes están anotados en la memoria del proyecto
pnpm check               # 4 errores preexistentes, ni uno más
```

- [x] **Step 2: Commit anything left**

Nothing should be left. If something is, it belongs to the task it came from.

---

## Task 5: The manual gate — and the one it unblocks

Automated tests do not close this, and `tauri dev` does not either: the desktop
half needs a **packaged** build. Before touching anything, check the running app
is the build you just made — `open` on an already-running `.app` only brings the
old process to the front:

```bash
ps -eo pid,lstart,command | grep "CopyNotes.app/Contents/MacOS" | grep -v grep
```

- [x] **Step 1: Restore on A with the cloud on**

A has notes on both devices and "Todo subido". Download a backup on A, delete a
couple of notes, then restore that backup with "Reemplazar todo".

Expected: the notes come back, and **the conflict counter stays at zero**. Today
it shows one per row. Measure the server too: every row of the file present in
`records`.

- [x] **Step 2: The confirmation text**

It named the cloud and the other devices before you pressed it. This is the only
place that wording gets seen with cloud on (criterion 8).

- [x] **Step 3: B converges on its own**

Do not touch B. Within a sync pass it shows the restored state. This is
criterion 4 and the only end-to-end proof of it.

- [x] **Step 4: The vault survived**

A still holds its key and B was not asked to pair again (criterion 3). If either
was, `reset_cloud` got reused somewhere — that is the whole reason
`reset_records` exists.

- [ ] **Step 5: Step 5 of the 038 gate, finally**

This is what 039 was blocking. Run it from
`docs/superpowers/plans/2026-08-13-038a-segundo-cano.md`: on B, export a backup,
sign out, sign in again, restore the backup, and confirm that on the **first**
sync pass the shared note does **not** appear in `records` — criterion 24 of spec
038, the reason its Task 8 put the reconciliation before the upload.

- [ ] **Step 6: Write down what happened**

Append the result to this file, dated, and tick the 038 gate's step 5 in its own
plan. A gate with no written outcome gets re-run from scratch in three weeks.

---

---

## Resultado del gate manual — 2026-08-16

Corrido en la .app empaquetada (bundle 14:26), con la nube encendida, el iPhone y
la web de localhost cerrados de antemano — cerrarlos es **higiene de medición, no
un requisito del producto**: con B abierto, un cambio propio sin subir levantaría
un conflicto legítimo y no se podría distinguir del bug.

**PASADO.** Criterios 1, 2, 3, 4 y 8 probados con datos reales.

En vez de borrar notas y restaurar, se restauró **un respaldo del estado actual**
(`copynotes-backup-2026-08-16-1421.json`). Prueba lo mismo y no arriesga nada: si
algo fallaba, sus notas quedaban donde estaban. Y de paso probó el criterio 2 de la
spec 040 a escala real — el resumen dijo *"No hay nada nuevo para agregar: ya tenés
todo lo que trae este archivo. 1551 elementos idénticos ya existen y se omiten"*.

| medición | antes | después |
|---|---|---|
| `records` | 1758 | **1758** |
| `vaults` | 1 | **1** |
| `server_seq` más alto | 36976 | **40492** |
| conflictos estacionados | — | **0** (antes del arreglo: ~1500) |

Los tres números juntos son la prueba, y ninguno alcanza solo: **1758 → 1758** dice
que la nube se rellenó completa; **36976 → 40492** dice que cada fila es una
escritura NUEVA, o sea que de verdad se vació y se rellenó en vez de quedar igual de
casualidad; y `vaults` **1 → 1** dice que la llave sobrevivió — el motivo entero de
que exista `reset_records()` en lugar de reusar `reset_cloud()`.

- El cartel nombró la nube y los otros dispositivos, palabra por palabra (criterio 8).
- El iPhone, sin que nadie lo tocara: *"aparecen las notas y nada más"*. Ningún
  conflicto, ningún cartel (criterio 4, y la única prueba de punta a punta que
  existe de eso).

Queda el paso 5 (el de la spec 038), que ya no está bloqueado por esto.

## Self-review notes

- **Spec coverage:** §1 "a restore claims the account" (Task 2), §2
  `reset_records` and not `reset_cloud` (Task 1), §3 the order and the survivable
  crash (Task 2 steps 4 and the order test), §4 zero conflicts as the criterion
  (Task 2 step 1, first test), §5 the confirmation text (Task 3), §6 what the
  other devices do (Task 5 step 3 — it cannot be proven with one fake server, and
  the spec says so). Criteria 1-2 (Task 2), 3 (Tasks 1 and 5), 4 (Task 5), 6
  (Task 1), 7 (Task 2 third test + Task 3 step 4), 8 (Task 3), 9 (Task 3's split
  of the two catches).
- **Criterion 5** — a second device with genuinely unsent work keeps it and
  raises **one** conflict for that work — is not covered by a test here. It needs
  two independent devices against one server, which this fake cannot express
  without becoming a second implementation of the sync. It is real behaviour of
  `decide()`, already covered by `download.test.ts`, and the honest place for it
  is the two-device gate. **Named, not forgotten.**
- **Deliberately unchanged:** `push_records`, `decide()`, `LOCAL_ONLY_FIELDS`,
  "Importar y conservar lo mío", and restoring with no cloud.
- **The cursors were verified, not assumed** (the spec demanded this):
  `BACKUP_TABLES` is `SYNCED_TABLES` + `settings`, and `LOCAL_ONLY_FIELDS` strips
  `cloudSeq` on the way in, so **every** restored row lands unsent and is reached
  by `pending.ts` through the fresh `changeSeq`. Nothing has to move
  `syncUploadedThrough` or `syncDownloadedThrough`: the refill's `server_seq`
  values are above anything the device has seen, because the sequence never
  rewinds. That is why this plan touches neither.
- **The trash** (spec 039 "What does not enter") is still unspecced and is the
  thing that fixes the *common* case: nothing is ever destroyed, but there is no
  way to see or recover a deleted note from inside the app. It is why Hernán
  needed a person to edit a JSON by hand.
- **Type consistency:** `claimAccountAfterRestore()` and `restoreReachesCloud()`
  in every caller; `ready()` returns `{ client, key } | null` everywhere.
