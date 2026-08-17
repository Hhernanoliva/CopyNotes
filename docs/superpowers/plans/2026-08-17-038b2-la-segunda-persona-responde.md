# Compartir una nota, parte B2: la segunda persona responde — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el invitado de una nota compartida pueda contestarla — tildar tareas, comentar una tarea y decir "Listo" sobre la nota entera — y que las tres pantallas y el agente digan **quién** hizo cada cosa.

**Architecture:** El invitado sigue sin poder tocar una fila que ya existe: todo lo que hace es **agregar líneas de bitácora**, que es lo único que el SQL de B1 le acepta. El tilde deja de ser un campo que viaja y pasa a **deducirse** de esas líneas, ordenadas por el número que reparte el servidor (`server_seq`), y la deducción se escribe en `block.checked` como cache con la marca `fromCloud`. La identidad sale del `actor` de cada línea (`'user'`, `'agent'`, `'member:<uuid>'`) resuelto contra el cachecito de nombres que B1 ya llena.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Dexie (IndexedDB), Supabase (PostgREST + funciones `security definer`), Vitest (dos proyectos: `node` y `jsdom`), Playwright.

## Global Constraints

- **Cero SQL nuevo.** B1 dejó construido todo el servidor que B2 usa: `push_shared_rows` pisa `actor` con `'member:' || auth.uid()` y sella `author_id` (`supabase/schema.sql:722`), `pull_shared_rows` devuelve `server_seq` y `author_id` (`:799`), y la política `read_share_members` deja que cualquier participante lea los nombres de la nota (`:970`). Ninguna tarea de este plan toca `supabase/schema.sql`. `pnpm rls:check` tiene que seguir dando **21/21** sin cambios.
- **JavaScript pelado dentro de archivos `.ts`/`.svelte`.** Sin anotaciones de tipo en código escrito a mano (CLAUDE.md). Tabs, comillas simples. **No correr `prettier`** — no es del proyecto y reformatea archivos enteros contra el estilo del repo.
- **El invitado nunca modifica una fila que ya existe.** Ni `blocks`, ni `notes`, ni su propio comentario anterior. Es lo que hace imposibles los choques, y el borde real es el SQL; el cliente lo espeja por cortesía y para que nada quede colgado.
- **Toda escritura derivada o de bookkeeping lleva `fromCloud: true`**, o el contador de "sin subir" se mueve y las dos puntas se rebotan la misma fila para siempre.
- **"¿Soy miembro de esta nota?" se resuelve ANTES de abrir la transacción** y se pasa como argumento. Una lectura encadenada adentro de `db.transaction` escapa la zona de Dexie y la cierra temprano (`PrematureCommitError`); `createTask` ya lleva el comentario que lo explica.
- **Regla de la guía y del CHANGELOG:** todo cambio visible se documenta en `docs/guia/` y en `CHANGELOG.md` **en el mismo commit que lo implementa**. Acá cae entero en la Tarea 9, que es la última antes del gate, porque hasta ahí no hay nada visible terminado.
- **Los commits a `main` no llevan trazas de agente.** Rama de trabajo: `feat/038-b2-responder` (ya creada, `fe22122`).
- Correr los tests con `pnpm test` (unit, las dos suites), `pnpm check` (tiene **4 errores preexistentes**, no son tuyos), `pnpm test:e2e`.
- **`pnpm test:e2e` pisa la CSP del `vite dev` que esté corriendo.** Si después de correrlo la app de desarrollo dice "Sin conexión con la nube", reiniciá el `vite dev`. Se descarta en 5 segundos: `curl -sI http://localhost:5173/ | grep -io "connect-src[^;]*"` tiene que mostrar el host de Supabase.

## Mapa de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/tasks/derive.ts` | La deducción pura: dada la lista de líneas de una tarea, ¿está hecha? Sin base de datos, sin `await`. |
| `src/lib/tasks/derive.test.ts` | node |
| `src/lib/sync/identity.ts` | Quién soy yo en el caño compartido: `'member:<uuid>'` o nada. Una sola lectura de la sesión. |
| `src/lib/sync/identity.test.ts` | node |
| `src/lib/storage/actor-names.test.ts` | node — las pruebas de las dos funciones nuevas de `share-names.ts` |
| `src/lib/tasks/action-labels.ts` | Las palabras de la bitácora, sacadas del `<script>` de `SettingsDialog` para poder probarlas (Tarea 5). |
| `src/lib/tasks/action-labels.test.ts` | node |
| `src/lib/editor/SharedFooter.svelte` | El pie de la nota compartida: el botón "Listo" del invitado y el registro que leen los dos. |
| `src/lib/tasks/note-level.test.ts` | node — la entrada de bitácora sin renglón |

**Modificar:**

| Archivo | Qué cambia |
|---|---|
| `src/lib/storage/activity.ts` | `bySeqAsc` gana el desempate por `id`; `appendActivity` acepta `blockId: null`. |
| `src/lib/storage/db.ts` | La migración que agrega `serverSeq` no hace falta (campo opcional), pero sí la lectura por índice si se agrega uno — **no se agrega**, ver Tarea 1. |
| `src/lib/storage/row-compare.ts` | `serverSeq` entra a `BOOKKEEPING`. |
| `src/lib/export-import/schema.ts` | `serverSeq` entra a `LOCAL_ONLY_FIELDS`; `activitySchema` acepta `action: 'listo'` (ya es `v.string()`, no cambia); `EXPORTED_FIELDS.activity` **no** lo lleva (lista blanca, queda afuera solo). |
| `src/lib/storage/share-names.ts` | `actorName()` e `isMine()`: cómo se firma una línea mirada desde este aparato. |
| `src/lib/sync/shared-merge.ts` | `mergeFromShared` guarda `serverSeq`; `sameInAllowList` deja de comparar `checked`. |
| `src/lib/sync/shared.ts` | `pullSharedNote` pasa `server_seq` y corre la deducción **al final de la tanda**; `reconcileShares` llena el cachecito de nombres de los miembros. |
| `src/lib/sync/invites.ts` | `listMembers` se reusa desde `reconcileShares` (hoy sólo lo llama `ShareDialog`). |
| `src/lib/tasks/actions.ts` | `setTaskChecked` y `addTaskNote` aceptan `fromCloud` y un `actor` que puede ser `'member:<uuid>'`; `addTaskNote` acepta una entrada de nota entera. |
| `src/lib/editor/agent-notes.ts` | El filtro pasa de "no es el usuario" a "no soy yo", y el `actor` viaja hasta la pantalla. |
| `src/lib/editor/Editor.svelte` | `guest`; el tilde del invitado; el comentario; el pie; los nombres. |
| `src/lib/editor/BlockRow.svelte` | El tilde y el menú de una sola puerta; la etiqueta de la itálica. |
| `src/lib/editor/BlockActionsMenu.svelte` | `noteOnly`. |
| `src/lib/components/SettingsDialog.svelte` | `actorLabel` deja de tener dos respuestas; los dos mapas de palabras se van a `tasks/action-labels.ts`. |
| `src/lib/bridge/ingest.test.ts` | El portón del agente en la nota ajena. |
| `mcp/lib/tools.test.js` | El tercer rol (vitest, `cd mcp && pnpm test`). |
| `src/lib/bridge/export.ts` | El nombre se resuelve al salir, no lo busca el que lee. |
| `src/lib/bridge/ingest.ts` | En una nota ajena el agente sólo completa y comenta. |
| `mcp/lib/tools.js` | El tercer rol. |
| `docs/guia/20-compartir-una-nota.md`, `docs/guia-de-uso.md`, `CHANGELOG.md` | Tarea 9. |

---

## Task 1: `server_seq` se guarda, y el desempate de la bitácora

El orden del tilde lo decide el servidor (§5), y un aparato que ya tiene la fila no la vuelve a pedir — así que el número no puede quedarse en la respuesta.

**Files:**
- Modify: `src/lib/sync/shared-merge.ts:55-66`
- Modify: `src/lib/storage/row-compare.ts:12`
- Modify: `src/lib/export-import/schema.ts:224`
- Modify: `src/lib/storage/activity.ts:14-16`
- Test: `src/lib/sync/shared-merge.test.ts` (jsdom), `src/lib/storage/activity.test.ts` (node), `src/lib/export-import/*.test.ts` (node)

**Interfaces:**
- Produces: `mergeFromShared(table, payload, changeSeq, serverSeq)` — cuarto parámetro **opcional**; cuando llega, la fila guardada lleva `serverSeq`.
- Produces: filas de `activity` con un campo `serverSeq` (número) o sin él.

**Por qué NO lleva índice de Dexie:** la deducción lee las líneas de una tarea, que ya vienen por el índice `blockId`, y las ordena en memoria — son unidades por tarea. Un índice nuevo obliga a una migración de versión de la base para no ganar nada.

- [ ] **Step 1: Escribir la prueba que falla — el número se guarda**

En `src/lib/sync/shared-merge.test.ts`, junto a las que ya están:

```js
it('guarda el server_seq de una línea de bitácora que llega', async () => {
	await mergeFromShared('activity', { id: 'a1', noteId: 'n1', blockId: 'b1', actor: 'user', action: 'done', text: '', seq: 5, at: '2026-08-17T10:00:00.000Z' }, 100, 4242);
	expect((await db.table('activity').get('a1')).serverSeq).toBe(4242);
});

it('sin server_seq no inventa uno', async () => {
	await mergeFromShared('activity', { id: 'a2', noteId: 'n1', blockId: 'b1', actor: 'user', action: 'done', text: '', seq: 6, at: '2026-08-17T10:00:00.000Z' }, 101);
	expect((await db.table('activity').get('a2')).serverSeq).toBeUndefined();
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- shared-merge`
Expected: FAIL — `expected undefined to be 4242`.

- [ ] **Step 3: Guardar el número**

En `src/lib/sync/shared-merge.ts`, reemplazar la firma y el objeto:

```js
// `serverSeq` es el orden que repartió el servidor, y es lo ÚNICO que puede
// decidir un tilde entre dos cuentas: `seq` sale del reloj de cada aparato y
// dos relojes no se pueden comparar (spec 038 §5). Viaja como cuarto parámetro
// y no adentro de la carga porque no es un campo de la fila del otro: es lo que
// el servidor anotó al recibirla, y por eso está fuera de la lista blanca.
export async function mergeFromShared(table, payload, changeSeq, serverSeq = undefined) {
	const clean = cleanSharedPayload(table, payload);
	const local = await db.table(table).get(clean.id);
	const merged = {
		...(local ?? (await birthFields(table))),
		...clean,
		...(serverSeq === undefined ? {} : { serverSeq }),
		changeSeq,
		cloudSeq: changeSeq,
		fromCloud: true
	};
	await db.table(table).put(merged);
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test -- shared-merge`
Expected: PASS.

- [ ] **Step 5: Las tres listas que un campo nuevo tiene que tocar**

Un caño nuevo o un campo nuevo se olvida de alguna lista y el error aparece semanas después (spec 040). Son tres, y las tres se comprueban con una prueba:

`src/lib/storage/row-compare.ts`:

```js
const BOOKKEEPING = new Set(['updatedAt', 'changeSeq', 'cloudSeq', 'fromCloud', 'serverSeq']);
```

`src/lib/export-import/schema.ts:224`:

```js
export const LOCAL_ONLY_FIELDS = ['changeSeq', 'cloudSeq', 'fromCloud', 'share', 'serverSeq'];
```

`EXPORTED_FIELDS.activity` **no se toca**: es lista blanca, así que `serverSeq` queda afuera sin hacer nada. Escribir la prueba que lo comprueba igual, porque "queda afuera solo" es exactamente la clase de afirmación que deja de ser cierta cuando alguien agrega un campo.

- [ ] **Step 6: Las pruebas de las tres listas**

En `src/lib/export-import/schema.test.ts` (o el archivo donde vivan las de `EXPORTED_FIELDS`):

```js
it('el server_seq no sale en el respaldo', () => {
	expect(EXPORTED_FIELDS.activity).not.toContain('serverSeq');
});

it('el server_seq de un archivo no entra', () => {
	expect(LOCAL_ONLY_FIELDS).toContain('serverSeq');
});
```

En `src/lib/storage/row-compare.test.ts`:

```js
it('un server_seq distinto no es un desacuerdo', () => {
	expect(sameToTheUser({ content: 'a', serverSeq: 1 }, { content: 'a', serverSeq: 9 })).toBe(true);
});
```

- [ ] **Step 7: El desempate de la bitácora**

`seq` salía de un contador monótono de UN aparato y no podía empatar. Dos cuentas son dos contadores leyendo el reloj, así que desde ahora sí. En `src/lib/storage/activity.ts`, **sin borrar el comentario que ya está**:

```js
function bySeqAsc(a, b) {
	// Dos cuentas son dos contadores leyendo el mismo reloj, así que desde spec
	// 038 el empate existe. El desempate por `id` no significa nada, y esa es la
	// gracia: es estable, así que las dos pantallas leen el mismo orden.
	return (a.seq ?? 0) - (b.seq ?? 0) || String(a.id).localeCompare(String(b.id));
}
```

- [ ] **Step 8: La prueba del desempate**

En `src/lib/storage/activity.test.ts`:

```js
it('dos líneas con el mismo seq salen siempre en el mismo orden', async () => {
	await db.table('activity').bulkAdd([
		{ id: 'zzz', noteId: 'n1', blockId: 'b1', actor: 'user', action: 'note', text: 'segunda', seq: 7, at: '2026-08-17T10:00:00.000Z', deletedAt: null },
		{ id: 'aaa', noteId: 'n1', blockId: 'b1', actor: 'user', action: 'note', text: 'primera', seq: 7, at: '2026-08-17T10:00:00.000Z', deletedAt: null }
	]);
	expect((await listActivityByBlock('b1')).map((r) => r.id)).toEqual(['aaa', 'zzz']);
});
```

- [ ] **Step 9: Todo verde**

Run: `pnpm test`
Expected: PASS, y el total sube respecto de los **1197** de la base.

- [ ] **Step 10: Commit**

```bash
git add src/lib/sync/shared-merge.ts src/lib/storage/row-compare.ts src/lib/storage/activity.ts src/lib/export-import/schema.ts src/lib/sync/shared-merge.test.ts src/lib/storage/activity.test.ts src/lib/storage/row-compare.test.ts src/lib/export-import/schema.test.ts
git commit -m "feat(compartir): el orden que reparte el servidor se guarda en cada línea"
```

---

## Task 2: La deducción, sola y sin base de datos

Lo único con lógica de verdad de todo B2. Vive aparte para poder probarla sin IndexedDB, sin red y sin Svelte.

**Files:**
- Create: `src/lib/tasks/derive.ts`
- Create: `src/lib/tasks/derive.test.ts`
- Modify: `src/lib/tasks/index.ts` (reexportar)

**Interfaces:**
- Produces: `deriveChecked(entries)` → `true`, `false` o `null`. `null` significa **"no tengo opinión"** y el llamador deja `block.checked` como está.

**Las tres reglas, y por qué cada una:**

1. Sólo miran las líneas `done` y `reopened`. Un `note` o un `created` no dicen nada del tilde.
2. El orden es por `server_seq`; **una línea sin `server_seq` va última**, porque todavía no llegó al servidor y nada puede haber llegado después de ella. Es además lo que la persona espera: el tilde que acaba de hacer se ve al toque y no parpadea cuando aterriza.
3. **Sin ninguna línea `done`/`reopened`, devuelve `null`.** Sin esto, una tarea tildada por un camino que no deja línea —un respaldo restaurado, un `[x]` pegado, una tarea anterior a que existiera la bitácora— se destildaría sola.

- [ ] **Step 1: Escribir las pruebas que fallan**

`src/lib/tasks/derive.test.ts`:

```js
import { describe, it, expect } from 'vitest';
import { deriveChecked } from './derive';

const linea = (action, serverSeq) => ({ action, serverSeq, actor: 'user' });

describe('deriveChecked', () => {
	it('sin líneas de tilde no opina', () => {
		expect(deriveChecked([])).toBe(null);
		expect(deriveChecked([linea('created', 1), linea('note', 2)])).toBe(null);
	});

	it('la última línea manda', () => {
		expect(deriveChecked([linea('done', 10), linea('reopened', 20)])).toBe(false);
		expect(deriveChecked([linea('reopened', 20), linea('done', 30)])).toBe(true);
	});

	it('el orden lo decide el servidor, no el que vino en la lista', () => {
		expect(deriveChecked([linea('done', 30), linea('reopened', 20)])).toBe(true);
	});

	it('una línea que todavía no subió va última', () => {
		expect(deriveChecked([linea('done', 99), linea('reopened', undefined)])).toBe(false);
	});

	it('dos sin subir se ordenan entre ellas por seq', () => {
		const a = { action: 'done', seq: 1 };
		const b = { action: 'reopened', seq: 2 };
		expect(deriveChecked([b, a])).toBe(false);
	});

	it('una línea borrada no cuenta', () => {
		expect(deriveChecked([linea('done', 10), { ...linea('reopened', 20), deletedAt: '2026-08-17T10:00:00.000Z' }])).toBe(true);
	});
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- derive`
Expected: FAIL — `Failed to resolve import "./derive"`.

- [ ] **Step 3: Escribir la deducción**

`src/lib/tasks/derive.ts`:

```js
// ¿Esta tarea está hecha? La respuesta sale de la bitácora, no del campo
// `block.checked` — que a partir de spec 038 §5 es un cache de esta cuenta.
//
// El invitado tiene prohibido tocar un renglón, así que su tilde es una línea
// más ('done' / 'reopened'), y los dos aparatos deducen lo mismo de la misma
// lista ordenada. Cuando el cache y la bitácora no coinciden, manda la bitácora.
//
// `null` no es "no está hecha": es "no tengo opinión". Una tarea puede estar
// tildada por un camino que no deja línea —un respaldo restaurado, un "[x]"
// pegado, una tarea anterior a la bitácora— y ahí el cache es el único dato que
// hay. Devolver `false` en ese caso destildaría tareas viejas solo.

const TILDE = new Set(['done', 'reopened']);

// Sin `serverSeq` la línea todavía no llegó al servidor, así que nada pudo
// llegar después: va última. `Infinity` lo dice sin una rama aparte.
const orden = (row) => (typeof row.serverSeq === 'number' ? row.serverSeq : Infinity);

export function deriveChecked(entries) {
	const tildes = (entries ?? []).filter((row) => TILDE.has(row.action) && !row.deletedAt);
	if (!tildes.length) return null;
	// Entre dos que todavía no subieron manda `seq`, el reloj local, y acá sí
	// alcanza: las dos salieron de este mismo aparato.
	const ordenadas = [...tildes].sort((a, b) => orden(a) - orden(b) || (a.seq ?? 0) - (b.seq ?? 0));
	return ordenadas.at(-1).action === 'done';
}
```

**Copiar, no ordenar en el lugar:** `.sort()` muta, y lo que llega es la lista que el llamador acaba de leer de Dexie y puede seguir usando.

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test -- derive`
Expected: PASS, 6 pruebas.

- [ ] **Step 5: Reexportar**

En `src/lib/tasks/index.ts`, junto a los otros:

```js
export { deriveChecked } from './derive';
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/tasks/derive.ts src/lib/tasks/derive.test.ts src/lib/tasks/index.ts
git commit -m "feat(compartir): deducir si una tarea está hecha desde la bitácora"
```

---

## Task 3: La deducción entra al caño, y `checked` deja de decidir si algo cambió

**Files:**
- Modify: `src/lib/sync/shared.ts:114-131`
- Modify: `src/lib/sync/shared-merge.ts:70-77`
- Test: `src/lib/sync/shared.test.ts` (node), `src/lib/sync/shared-merge.test.ts` (jsdom)

**Interfaces:**
- Consumes: `deriveChecked` (Tarea 2), `mergeFromShared(..., serverSeq)` (Tarea 1).
- Produces: `pullSharedNote` sigue devolviendo cuántas filas cambiaron; las escrituras derivadas **no** cuentan (no son novedades, son la consecuencia de una novedad que ya se contó).

**Las dos cosas que hay que hacer bien o no sirve:**

- **La deducción corre AL FINAL de la tanda, no fila por fila.** Una misma bajada puede traer el renglón del dueño (con su `checked` viejo) y la línea del invitado; aplicándolas de a una, la respuesta depende del orden dentro del paquete.
- **`sameInAllowList` deja de mirar `checked`.** Si lo mira, el renglón del dueño llega "distinto" en cada pasada mientras siga en la ventana de relectura de 50 filas, `applied` sube, `appliedVersion` sube, y **la nota abierta se refresca sola cada 30 segundos**. Es exactamente el desperdicio que el comentario arriba de `pullSharedNote` existe para evitar.

- [ ] **Step 1: La prueba que falla — `checked` no decide**

En `src/lib/sync/shared-merge.test.ts`:

```js
it('un checked distinto no cuenta como cambio: lo decide la bitácora', () => {
	const local = { id: 'b1', noteId: 'n1', content: 'hola', checked: true, type: 'todo' };
	const payload = { id: 'b1', noteId: 'n1', content: 'hola', checked: false, type: 'todo' };
	expect(sameInAllowList('blocks', local, payload)).toBe(true);
});

it('pero cualquier otro campo sí', () => {
	const local = { id: 'b1', noteId: 'n1', content: 'hola', checked: true, type: 'todo' };
	const payload = { id: 'b1', noteId: 'n1', content: 'chau', checked: true, type: 'todo' };
	expect(sameInAllowList('blocks', local, payload)).toBe(false);
});

it('un renglón que este aparato no tiene se escribe entero, checked incluido', async () => {
	await mergeFromShared('blocks', { id: 'b9', noteId: 'n1', content: 'nueva', type: 'todo', checked: true, order: 0 }, 10);
	expect((await db.table('blocks').get('b9')).checked).toBe(true);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- shared-merge`
Expected: FAIL en la primera — `expected false to be true`.

- [ ] **Step 3: Sacar `checked` de la comparación**

En `src/lib/sync/shared-merge.ts`, reemplazar `sameInAllowList`:

```js
// El cache no se compara: se deduce.
//
// Desde spec 038 §5 `block.checked` es un cache de la bitácora, no un dato que
// las dos puntas negocien. Comparándolo, el renglón del dueño —que sigue
// llevando su valor viejo— llega "distinto" en cada pasada mientras esté dentro
// de la ventana de relectura, y la nota abierta se refresca sola cada 30
// segundos por algo que nadie tocó.
//
// Sigue VIAJANDO en la fila, y tiene que seguir: un renglón que aterriza en un
// aparato que nunca lo vio no tiene ninguna línea de bitácora todavía, y ahí el
// valor que vino es el único que hay. Ese caso no pasa por acá — sin fila local,
// esta función devuelve false y la fila se escribe entera.
const NO_SE_COMPARAN = { blocks: new Set(['checked']) };

export function sameInAllowList(table, local, payload) {
	if (!local) return false;
	const saltear = NO_SE_COMPARAN[table];
	for (const field of SHARED_FIELDS[table] ?? []) {
		if (saltear?.has(field)) continue;
		if (payload[field] === undefined) continue;
		if (local[field] !== payload[field]) return false;
	}
	return true;
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test -- shared-merge`
Expected: PASS.

- [ ] **Step 5: La prueba que falla — la deducción corre al final de la tanda**

En `src/lib/sync/shared.test.ts`, siguiendo el patrón del servidor de mentira que ya está ahí (ramifica por nombre de `rpc`):

```js
it('aplica la tanda y DESPUÉS deduce, no al revés', async () => {
	// El renglón del dueño (checked viejo) y la línea del invitado, en el mismo
	// paquete y en el orden que las rompería si se aplicaran de a una.
	await db.table('blocks').put({ id: 'b1', noteId: 'n1', type: 'todo', content: 'llamar', checked: false, order: 0, changeSeq: 1, cloudSeq: 1 });
	const client = clienteFalso({
		pull_shared_rows: [
			{ table_name: 'activity', id: 'a1', change_seq: 5, server_seq: 100, deleted: false,
			  payload: { id: 'a1', noteId: 'n1', blockId: 'b1', actor: 'member:juan', action: 'done', text: '', seq: 5, at: '2026-08-17T10:00:00.000Z' } },
			{ table_name: 'blocks', id: 'b1', change_seq: 6, server_seq: 101, deleted: false,
			  payload: { id: 'b1', noteId: 'n1', type: 'todo', content: 'llamar al contador', checked: false, order: 0 } }
		]
	});
	await pullSharedNote(client, 'n1');
	expect((await db.table('blocks').get('b1')).checked).toBe(true);
	expect((await db.table('blocks').get('b1')).content).toBe('llamar al contador');
});

it('la escritura deducida no queda pendiente de subida', async () => {
	// ... mismo montaje ...
	const row = await db.table('blocks').get('b1');
	expect(row.cloudSeq).toBe(row.changeSeq);
});

it('una tarea sin líneas de tilde no se destilda sola', async () => {
	await db.table('blocks').put({ id: 'b2', noteId: 'n1', type: 'todo', content: 'vieja', checked: true, order: 1, changeSeq: 1, cloudSeq: 1 });
	const client = clienteFalso({
		pull_shared_rows: [
			{ table_name: 'activity', id: 'a2', change_seq: 7, server_seq: 102, deleted: false,
			  payload: { id: 'a2', noteId: 'n1', blockId: 'b2', actor: 'member:juan', action: 'note', text: 'ojo', seq: 7, at: '2026-08-17T10:00:00.000Z' } }
		]
	});
	await pullSharedNote(client, 'n1');
	expect((await db.table('blocks').get('b2')).checked).toBe(true);
});
```

**Ojo con el proyecto de vitest:** `shared.test.ts` corre en **node**, así que ninguna carga de `blocks` de estas pruebas puede llevar `html` — `cleanSharedPayload` lo pasa por `sanitizeHtml`, que necesita `DOMParser`. Si hace falta `html`, el archivo se muda al proyecto jsdom, y eso son **dos** cambios en `vite.config.ts` (agregarlo al `include` de jsdom **y** al `exclude` de node).

- [ ] **Step 6: Correr y ver el rojo**

Run: `pnpm test -- sync/shared`
Expected: FAIL — `expected false to be true` en la primera.

- [ ] **Step 7: Enganchar la deducción**

En `src/lib/sync/shared.ts`, reemplazar `pullSharedNote` y agregar la función que deduce:

```js
import { deriveChecked } from '../tasks/derive';
import { listActivityByBlock } from '../storage/activity';

// Vuelve a calcular el tilde de los renglones que esta tanda tocó, y sólo de
// esos. Corre UNA vez al final: una misma bajada puede traer el renglón del
// dueño (con su `checked` viejo) y la línea del invitado, y aplicándolas de a
// una la respuesta dependería del orden dentro del paquete.
//
// La escritura lleva `fromCloud` porque es un cache, no un cambio: sin eso el
// contador de "sin subir" se mueve, la otra punta la baja, deduce, escribe la
// suya, y las dos se rebotan la misma fila para siempre.
async function deriveTicks(blockIds) {
	for (const blockId of blockIds) {
		const block = await db.table('blocks').get(blockId);
		if (!block || block.type !== 'todo') continue;
		const checked = deriveChecked(await listActivityByBlock(blockId));
		if (checked === null || checked === block.checked) continue;
		await db.table('blocks').update(blockId, { checked, fromCloud: true });
	}
}

export async function pullSharedNote(client, noteId) {
	const cursor = await getShareCursor(noteId);
	const { data, error } = await client.rpc('pull_shared_rows', {
		p_note_id: noteId,
		p_cursor: Math.max(0, cursor - OVERLAP)
	});
	if (error) throw new Error(error.message);
	if (!data?.length) return 0;
	let applied = 0;
	// Los renglones que hay que volver a deducir: los que trajeron una línea de
	// bitácora y los que llegaron ellos mismos.
	const tocados = new Set();
	for (const row of data) {
		if (row.table_name === 'activity' && row.payload?.blockId) tocados.add(row.payload.blockId);
		if (row.table_name === 'blocks') tocados.add(row.id);
		const local = await db.table(row.table_name).get(row.id);
		if (sameInAllowList(row.table_name, local, row.payload)) continue;
		await mergeFromShared(row.table_name, row.payload, row.change_seq, row.server_seq);
		applied++;
	}
	// Después de aplicar la tanda entera, nunca adentro del bucle.
	await deriveTicks(tocados);
	await setShareCursor(noteId, data[data.length - 1].server_seq);
	return applied;
}
```

**Nota:** los renglones a deducir se juntan de TODAS las filas que vinieron, incluidas las que `sameInAllowList` saltea. Una línea de bitácora que este aparato ya tiene igual puede ser la que decide el tilde de un renglón que acaba de llegar por primera vez.

- [ ] **Step 8: Correr y ver el verde**

Run: `pnpm test -- sync/shared`
Expected: PASS.

- [ ] **Step 9: Comprobar que la prueba discrimina**

Mover `await deriveTicks(tocados)` adentro del bucle (justo después del `merge`) y correr. La primera prueba tiene que ponerse **roja**. Volver a dejarlo afuera.

Es el paso que separa "la prueba pasa" de "la prueba prueba algo". En esta rama ya entraron dos falsos positivos.

- [ ] **Step 10: Todo verde y commit**

```bash
pnpm test && pnpm check
git add src/lib/sync/shared.ts src/lib/sync/shared-merge.ts src/lib/sync/shared.test.ts src/lib/sync/shared-merge.test.ts
git commit -m "feat(compartir): el tilde se deduce al final de cada tanda que baja"
```

---

## Task 4: El invitado tilda

**Files:**
- Create: `src/lib/sync/identity.ts`, `src/lib/sync/identity.test.ts`
- Modify: `src/lib/tasks/actions.ts:168-191`
- Modify: `src/lib/editor/Editor.svelte:129`, `:1476-1489`, `:2281`
- Modify: `src/lib/editor/BlockRow.svelte:48`, `:752`
- Test: `src/lib/tasks/actions.test.ts` (node)

**Interfaces:**
- Produces: `myMemberActor()` → `'member:<uuid>'` o `null`.
- Produces: `setTaskChecked({ noteId, blockId, actor = 'user', fromCloud = false })`.
- Produces: prop `guest` en `BlockRow` — "sólo lectura, pero puede tildar y comentar".

- [ ] **Step 1: Quién soy — la prueba que falla**

`src/lib/sync/identity.test.ts`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: () => clienteActual }));
let clienteActual = null;

const { myMemberActor } = await import('./identity');

describe('myMemberActor', () => {
	it('sin nube configurada no hay identidad', async () => {
		clienteActual = null;
		expect(await myMemberActor()).toBe(null);
	});

	it('sin sesión tampoco', async () => {
		clienteActual = { auth: { getSession: async () => ({ data: { session: null } }) } };
		expect(await myMemberActor()).toBe(null);
	});

	it('con sesión, la firma que el servidor le va a poner', async () => {
		clienteActual = { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } };
		expect(await myMemberActor()).toBe('member:u-1');
	});
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- identity`
Expected: FAIL — no existe `./identity`.

- [ ] **Step 3: Escribir la identidad**

`src/lib/sync/identity.ts`:

```js
// Con qué firma escribe este aparato en una nota que le comparten.
//
// La misma que el servidor le va a poner igual (`push_shared_rows` pisa `actor`
// con `'member:' || auth.uid()`, `schema.sql:722`), y escribirla desde acá NO es
// confiar en el cliente: es que la línea se vea bien en esta pantalla desde el
// segundo cero. Si se escribiera `'user'` y se dejara que el servidor la
// corrigiera, la propia línea del invitado le cambiaría de nombre sola treinta
// segundos después, y de paso contaría como una novedad que baja.
//
// La firma sigue sin creerse: el servidor la pisa aunque coincida.

import { supabase } from './supabase';

export async function myMemberActor() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	const id = data?.session?.user?.id;
	return id ? `member:${id}` : null;
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test -- identity`
Expected: PASS, 3 pruebas.

- [ ] **Step 5: La prueba que falla — el tilde del invitado no queda pendiente**

En `src/lib/tasks/actions.test.ts`:

```js
it('el tilde de un invitado no mueve el contador de subida', async () => {
	const { blockId, noteId } = await sembrarTarea();
	const antes = (await db.table('blocks').get(blockId)).changeSeq;
	await setTaskChecked({ noteId, blockId, actor: 'member:u-1', fromCloud: true });
	const despues = await db.table('blocks').get(blockId);
	expect(despues.checked).toBe(true);
	expect(despues.changeSeq).toBe(antes);
});

it('y su línea de bitácora sí queda pendiente, firmada como él', async () => {
	const { blockId, noteId } = await sembrarTarea();
	await setTaskChecked({ noteId, blockId, actor: 'member:u-1', fromCloud: true });
	const linea = (await listActivityByBlock(blockId)).at(-1);
	expect(linea.actor).toBe('member:u-1');
	expect(linea.action).toBe('done');
	expect(linea.cloudSeq).toBeUndefined();
});

it('el tilde del dueño sigue igual que siempre', async () => {
	const { blockId, noteId } = await sembrarTarea();
	const antes = (await db.table('blocks').get(blockId)).changeSeq;
	await setTaskChecked({ noteId, blockId });
	expect((await db.table('blocks').get(blockId)).changeSeq).toBeGreaterThan(antes);
});
```

- [ ] **Step 6: Correr y ver el rojo**

Run: `pnpm test -- tasks/actions`
Expected: FAIL — el `changeSeq` sube igual.

- [ ] **Step 7: La rama de `setTaskChecked`**

En `src/lib/tasks/actions.ts`, reemplazar `setTaskChecked`. **El único cambio de fondo es el `fromCloud` en el `updateBlock`; la cascada, la transacción y el resto no se tocan.**

```js
// `actor` puede ser ahora `'member:<uuid>'` (spec 038 §6) y `fromCloud` dice que
// esta cuenta es MIEMBRO de la nota, no su dueña: la línea de bitácora es lo
// único suyo que puede viajar, y el renglón que escribe al lado es un cache
// local. Sin la marca, ese renglón queda `changedSinceCloud` para siempre —
// invisible para los dos contadores hoy, y subible a su propia bóveda el día que
// se salga de la compartición.
//
// El llamador resuelve el rol ANTES de llamar y lo pasa. No se puede preguntar
// acá: `notes` no está en el alcance de la transacción, y una lectura encadenada
// adentro escapa la zona de Dexie y la cierra temprano (`PrematureCommitError`,
// el mismo que `createTask` tiene comentado arriba).
export async function setTaskChecked({ noteId, blockId, actor = 'user', fromCloud = false }) {
	const noteBlocks = await listBlocksByNote(noteId);
	const plan = planToggleChecked(noteBlocks, blockId);
	if (!plan) return null;
	await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		for (const { id, checked } of plan.updates) {
			await updateBlock(id, fromCloud ? { checked, fromCloud: true } : { checked });
			await appendActivity({
				blockId: id,
				noteId,
				actor,
				action: checked ? 'done' : 'reopened',
				text: ''
			});
		}
	});
	return plan;
}
```

**No hay que tocar `appendActivity`:** su fila es lo único del invitado que sí tiene que viajar, así que va sin marca y queda pendiente, que es lo correcto.

- [ ] **Step 8: Correr y ver el verde**

Run: `pnpm test -- tasks/actions`
Expected: PASS.

- [ ] **Step 9: Destrabar la casilla en la pantalla**

`src/lib/editor/BlockRow.svelte`, en los props (línea ~48):

```js
		readOnly = false,
		// Sólo lectura, PERO puede tildar y comentar: es el invitado de una nota
		// compartida (spec 038 §5). Todo lo demás sigue cerrado — el candado de B1
		// tenía cuatro puertas que nadie había listado, así que acá se abren de a
		// una y a propósito.
		guest = false,
```

Línea ~752, la casilla:

```svelte
			disabled={readOnly && !guest}
```

- [ ] **Step 10: Pasarlo desde el editor**

`src/lib/editor/Editor.svelte`, junto a `readOnly` (línea ~129):

```js
	const readOnly = $derived(note === null || note.share === 'member');
	// Lo mismo mirado al revés: el invitado, que es el único que tiene permiso de
	// tildar y comentar sin poder escribir.
	const isMember = $derived(note?.share === 'member');
	// La firma se resuelve una vez, fuera de cualquier transacción.
	let myActor = $state(null);
	$effect(() => {
		let vivo = true;
		myMemberActor().then((valor) => {
			if (vivo) myActor = valor;
		});
		return () => {
			vivo = false;
		};
	});
```

En el `<BlockRow>` (línea ~2281), junto a `{readOnly}`:

```svelte
					guest={isMember}
```

Y `handleToggleChecked`:

```js
	async function handleToggleChecked(block) {
		// El rol se resuelve ACÁ, antes de entrar a la transacción (ver el
		// comentario de setTaskChecked).
		const plan = await setTaskChecked({
			noteId: note.id,
			blockId: block.id,
			actor: isMember ? (myActor ?? 'user') : 'user',
			fromCloud: isMember
		});
		if (!plan) return;
		recordSnapshot();
		for (const update of plan.updates) {
			const { id, ...changes } = update;
			const row = blocks.find((b) => b.id === id);
			if (row) Object.assign(row, changes);
		}
	}
```

- [ ] **Step 11: e2e — la casilla se puede apretar en una nota compartida**

Agregar al archivo e2e de compartir que dejó B1, sembrando IndexedDB con `indexedDB.open('copynotes')` pelado desde `page.evaluate` (las rutas `import('/src/...')` no existen contra la build de preview).

**Y su control:** la prueba tiene que comprobar primero que con `share: 'owner'` la casilla también anda, y que el resto del renglón sigue trabado. Una prueba de presencia sin control es igual de mentirosa que una de ausencia.

- [ ] **Step 12: Todo verde y commit**

```bash
pnpm test && pnpm check && pnpm test:e2e
git add -u && git add src/lib/sync/identity.ts src/lib/sync/identity.test.ts
git commit -m "feat(compartir): el invitado puede tildar tareas"
```

---

## Task 5: Los nombres, en las tres pantallas

**Files:**
- Modify: `src/lib/storage/share-names.ts`
- Create: `src/lib/storage/actor-names.test.ts`
- Modify: `src/lib/sync/shared.ts` (`reconcileShares`)
- Modify: `src/lib/editor/agent-notes.ts`, `src/lib/editor/agent-notes.test.ts`
- Modify: `src/lib/editor/Editor.svelte`, `src/lib/editor/BlockRow.svelte:941-949`
- Modify: `src/lib/components/SettingsDialog.svelte:425-448`

**Interfaces:**
- Produces: `actorName(actor, { noteId, role, myActor })` → texto.
- Produces: `isMine(actor, { role, myActor })` → booleano.
- Produces: `agentNotesByBlock(rows, ctx)` → `{ [blockId]: [{ id, text, actor }] }`.

**La tabla entera, que es de donde salen todas las pruebas:**

| `actor` de la línea | en el aparato del DUEÑO | en el del INVITADO |
|---|---|---|
| `'user'` | **Vos** | el nombre del dueño (`owner:<noteId>`), o *La otra persona* |
| el id de un agente | **Agente** (*IA* en la itálica de la nota) | igual |
| `member:<mi uuid>` | no existe | **Vos** |
| `member:<otro uuid>` | su nombre, o *Invitado* | su nombre, o *Invitado* |

**La trampa de la segunda fila, que la spec no dice y el código sí:** el `actor`
de una línea escrita por el agente **no es la palabra `'agent'`** — es el **id
del agente conectado** (`bridge/ingest.ts:34-38`, `resolveAgentActor`). Lo de hoy
funciona porque `actorLabel` es un ternario: todo lo que no es `'user'` es
"Agente". Una función nueva que compare contra `'agent'` deja al agente sin
nombre y no lo caza ninguna prueba que no use un id real. Por eso la regla acá es
**por descarte**: no soy yo, no es `'user'`, no empieza con `member:` ⇒ es un
agente.

**El agujero que esto cierra y no se ve de entrada:** hoy `agentNotesByBlock` filtra `actor !== 'user'`, escrito cuando "no es el usuario" tenía un solo significado. En el aparato del invitado, `'user'` es el **dueño**, así que sus comentarios se filtran y **el invitado no ve nada de lo que el dueño escribió**. El filtro tiene que pasar de "no es el usuario" a "no soy yo".

- [ ] **Step 1: Las pruebas que fallan — los nombres**

`src/lib/storage/actor-names.test.ts`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { rememberShareName, actorName, isMine } from './share-names';

const dueño = { noteId: 'n1', role: 'owner', myActor: null };
const invitado = { noteId: 'n1', role: 'member', myActor: 'member:u-2' };

describe('actorName', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
		await rememberShareName('owner:n1', 'Ana');
		await rememberShareName('u-2', 'Juan');
	});

	it('en tu nota, user sos vos', async () => {
		expect(await actorName('user', dueño)).toBe('Vos');
	});

	it('en la nota de otro, user es el dueño', async () => {
		expect(await actorName('user', invitado)).toBe('Ana');
	});

	it('sin nombre guardado del dueño, un texto que no miente', async () => {
		await db.table('shareMembers').clear();
		expect(await actorName('user', invitado)).toBe('La otra persona');
	});

	it('tu propia firma de miembro sos vos', async () => {
		expect(await actorName('member:u-2', invitado)).toBe('Vos');
	});

	it('la firma de otro miembro es su nombre', async () => {
		expect(await actorName('member:u-2', dueño)).toBe('Juan');
	});

	it('un miembro sin nombre guardado', async () => {
		expect(await actorName('member:u-9', dueño)).toBe('Invitado');
	});

	// El actor de una línea del agente es su ID, no la palabra 'agent'
	// (bridge/ingest.ts › resolveAgentActor). Una prueba con la palabra pasaría
	// sin probar nada.
	it('un id de agente es el agente', async () => {
		expect(await actorName('agt_7f21c9', dueño)).toBe('Agente');
		expect(await actorName('agt_7f21c9', invitado)).toBe('Agente');
	});
});

describe('isMine', () => {
	it('en tu nota, user sos vos', () => {
		expect(isMine('user', dueño)).toBe(true);
	});
	it('en la nota de otro, user NO sos vos', () => {
		expect(isMine('user', invitado)).toBe(false);
	});
	it('tu firma de miembro sos vos', () => {
		expect(isMine('member:u-2', invitado)).toBe(true);
	});
	it('la de otro no', () => {
		expect(isMine('member:u-9', invitado)).toBe(false);
	});
	it('un agente nunca sos vos', () => {
		expect(isMine('agt_7f21c9', dueño)).toBe(false);
		expect(isMine('agt_7f21c9', invitado)).toBe(false);
	});
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- actor-names`
Expected: FAIL — no existen `actorName` ni `isMine`.

- [ ] **Step 3: Escribirlas**

Al final de `src/lib/storage/share-names.ts`:

```js
// Cómo se firma una línea de bitácora MIRADA DESDE ESTE APARATO (spec 038 §6).
//
// El mismo `actor: 'user'` significa dos cosas distintas según de qué lado se
// mire: en tu nota sos vos, y en la que te comparten es el dueño. Sin esa
// distinción la pantalla del invitado le atribuye a él todo lo que hizo el otro,
// que es el error más caro que se puede cometer en una función cuyo trabajo
// entero es decir quién hizo qué.
//
// `role` es el rol de ESTE aparato en ESA nota ('owner', 'member' o nada).

const PREFIJO = 'member:';

export function isMine(actor, { role, myActor }) {
	if (actor === 'user') return role !== 'member';
	return Boolean(myActor) && actor === myActor;
}

export async function actorName(actor, { noteId, role, myActor }) {
	if (isMine(actor, { role, myActor })) return 'Vos';
	if (actor === 'user') return shareNameOr(`owner:${noteId}`, 'La otra persona');
	if (typeof actor === 'string' && actor.startsWith(PREFIJO))
		return shareNameOr(actor.slice(PREFIJO.length), 'Invitado');
	// Todo lo demás es un agente, y va POR DESCARTE a propósito: el `actor` de una
	// línea del agente es el ID del agente conectado, no la palabra 'agent'
	// (`bridge/ingest.ts` › resolveAgentActor). Comparando contra 'agent' esta
	// función devolvería el id crudo en pantalla.
	return 'Agente';
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test -- actor-names`
Expected: PASS, 12 pruebas.

- [ ] **Step 5: Llenar el cachecito en cada pasada**

Hoy los nombres de los miembros los lee sólo `ShareDialog`, así que un dueño que lee la bitácora sin abrir ese panel no tiene ningún nombre que mostrar. En `src/lib/sync/shared.ts`, dentro de `reconcileShares`, junto al bucle que ya guarda el nombre del dueño:

```js
	// Los nombres de los OTROS: una consulta por pasada para todas las notas
	// compartidas juntas, no una por nota. `share_members` le da `select` a
	// cualquier participante (`read_share_members`), así que sirve igual para el
	// dueño que quiere nombrar a Juan y para Juan que quiere nombrar a un tercero.
	const ids = (data ?? []).map((row) => row.note_id);
	if (ids.length) {
		const { data: miembros } = await client
			.from('share_members')
			.select('member_id, display_name')
			.in('note_id', ids);
		for (const row of miembros ?? []) {
			if (row.display_name) await rememberShareName(row.member_id, row.display_name);
		}
	}
```

**Un nombre nulo no se guarda**, por el mismo motivo que ya está escrito arriba para el del dueño: una compartición abierta antes de que los nombres existieran devuelve nulo para siempre, y escribirlo borraría el bueno.

- [ ] **Step 6: La prueba de que se llena**

En `src/lib/sync/shared.test.ts`, con el cliente falso ramificando también `.from('share_members')`:

```js
it('guarda los nombres de los miembros en cada pasada, sin abrir el panel', async () => {
	const client = clienteFalso({
		list_shares: [{ note_id: 'n1', role: 'owner', counterpart_label: null, emptied: false }],
		share_members: [{ member_id: 'u-2', display_name: 'Juan' }]
	});
	await reconcileShares(client);
	expect(await getShareName('u-2')).toBe('Juan');
});

it('un nombre vacío no pisa el que ya había', async () => {
	await rememberShareName('u-2', 'Juan');
	const client = clienteFalso({
		list_shares: [{ note_id: 'n1', role: 'owner', counterpart_label: null, emptied: false }],
		share_members: [{ member_id: 'u-2', display_name: null }]
	});
	await reconcileShares(client);
	expect(await getShareName('u-2')).toBe('Juan');
});
```

- [ ] **Step 7: El filtro de la itálica pasa de "no es el usuario" a "no soy yo"**

`src/lib/editor/agent-notes.ts` entero:

```js
// La "voz" de los OTROS en la nota: entradas de bitácora action:'note' que no
// escribió esta cuenta. Se muestran bajo la tarea, nunca dentro del comentario
// del usuario (block.note) — ese campo es exclusivo del dueño y no viaja.
//
// El filtro decía `actor !== 'user'` y se escribió cuando "no es el usuario"
// tenía un solo significado (spec 038 §6). En el aparato del invitado, `'user'`
// es el DUEÑO: con el filtro viejo, el invitado no veía un solo comentario del
// otro lado. Por eso pregunta "¿esto lo escribí yo?" y no "¿esto lo escribió el
// usuario?".
//
// El `actor` viaja hasta la pantalla porque la etiqueta se resuelve arriba, con
// un await que acá no se puede hacer.

import { isMine } from '$lib/storage/share-names';

export function agentNotesByBlock(activityRows, ctx = { role: null, myActor: null }) {
	const byBlock = {};
	const rows = (activityRows ?? [])
		.filter((row) => row.action === 'note' && row.blockId && !isMine(row.actor, ctx))
		.sort((a, b) => a.seq - b.seq);
	for (const row of rows) {
		(byBlock[row.blockId] ??= []).push({ id: row.id, text: row.text, actor: row.actor });
	}
	return byBlock;
}
```

**El `&& row.blockId` es nuevo y hace falta:** desde la Tarea 7 hay entradas de nota entera con `blockId: null`, y sin ese filtro se agruparían bajo la clave `"null"`.

- [ ] **Step 8: Actualizar `agent-notes.test.ts`**

Las pruebas que ya están pasan `ctx` vacío y siguen valiendo (con `role: null`, `'user'` sigue siendo mío). Agregar:

```js
it('en la nota de otro, los comentarios del DUEÑO se ven', () => {
	const rows = [{ id: 'a1', blockId: 'b1', action: 'note', actor: 'user', text: 'ojo con esto', seq: 1 }];
	const out = agentNotesByBlock(rows, { role: 'member', myActor: 'member:u-2' });
	expect(out.b1).toEqual([{ id: 'a1', text: 'ojo con esto', actor: 'user' }]);
});

it('y los propios no', () => {
	const rows = [{ id: 'a1', blockId: 'b1', action: 'note', actor: 'member:u-2', text: 'mío', seq: 1 }];
	expect(agentNotesByBlock(rows, { role: 'member', myActor: 'member:u-2' })).toEqual({});
});

it('una entrada de nota entera no se agrupa bajo ningún renglón', () => {
	const rows = [{ id: 'a1', blockId: null, action: 'note', actor: 'agent', text: 'suelta', seq: 1 }];
	expect(agentNotesByBlock(rows)).toEqual({});
});
```

- [ ] **Step 9: Resolver las etiquetas en el editor**

En `src/lib/editor/Editor.svelte`, donde hoy hay `agentNotes = agentNotesByBlock(loadedActivity)` (líneas ~532 y ~2001), reemplazar las **dos** por una llamada a una función nueva:

```js
	// La etiqueta se resuelve acá y no en `agent-notes.ts` porque sale de una
	// tabla de Dexie y ese archivo es puro a propósito (se prueba sin base).
	// Un nombre por actor, no uno por línea: una tarea puede tener quince.
	async function buildAgentNotes(rows) {
		const ctx = { noteId: note?.id, role: note?.share ?? null, myActor };
		const grouped = agentNotesByBlock(rows, ctx);
		const cache = new Map();
		for (const list of Object.values(grouped)) {
			for (const item of list) {
				// La itálica del renglón dice "IA" desde antes de que existiera
				// compartir, y esa palabra no cambia: acá sólo se agrega el caso nuevo.
				// El descarte es el mismo que el de `actorName` y por el mismo motivo
				// (el actor de un agente es su id, no la palabra 'agent').
				const esAgente = item.actor !== 'user' && !String(item.actor).startsWith('member:');
				if (esAgente) {
					item.label = 'IA';
					continue;
				}
				if (!cache.has(item.actor)) cache.set(item.actor, await actorName(item.actor, ctx));
				item.label = cache.get(item.actor);
			}
		}
		return grouped;
	}
```

Y en los dos llamadores: `agentNotes = await buildAgentNotes(loadedActivity);`. **Los dos**, o uno de los dos caminos queda viejo — es la tercera vez que este proyecto pierde algo por dejarlo en manos del llamador (`appliedVersion`, dos veces).

- [ ] **Step 10: La etiqueta en la itálica**

`src/lib/editor/BlockRow.svelte`, líneas ~941-949:

```svelte
			{#each agentNotes as agentNote (agentNote.id)}
				<p
					class="agent-note -mt-0.5 w-full min-w-0 pl-2 leading-snug break-words whitespace-pre-wrap italic"
				>
					<span class="agent-note-badge" aria-label={`Escrito por ${agentNote.label}`}
						>{agentNote.label}</span
					>
					{agentNote.text}
				</p>
			{/each}
```

**Mirar la clase `agent-note-badge` en el CSS antes de dar esto por bueno:** estaba dimensionada para dos letras ("IA") y ahora tiene que aguantar "Juan" o un nombre largo. Sacarle cualquier ancho fijo y dejar que crezca.

- [ ] **Step 11: Configuración › Agentes**

`src/lib/components/SettingsDialog.svelte`. La bitácora que muestra es de **todas** las notas (`listRecentActivity`), así que el rol se resuelve por nota, no una vez:

```js
	// Los roles se leen una vez para todo el feed y no una por línea.
	let rolesPorNota = $state(new Map());
	$effect(() => {
		let vivo = true;
		Promise.all([sharedNoteIdsByRole(), myMemberActor()]).then(([{ owner, member }, actor]) => {
			if (!vivo) return;
			const mapa = new Map();
			for (const id of owner) mapa.set(id, 'owner');
			for (const id of member) mapa.set(id, 'member');
			rolesPorNota = mapa;
			miActor = actor;
		});
		return () => {
			vivo = false;
		};
	});
```

`actorLabel` deja de tener dos respuestas posibles y pasa a resolverse igual que en la nota, con la etiqueta guardada por entrada al armar la lista (el `{actorLabel(entry.actor)}` de la línea ~932 pasa a `{entry.label}`).

Y `actionLabel`, que hoy elige mapa con `entry.actor === 'user'`, tiene que elegirlo con **`isMine`**: en la nota de otro, "marcó hecha" del dueño no es "marcaste hecha".

**Los dos mapas se mudan a un módulo propio**, `src/lib/tasks/action-labels.ts`, porque dentro del `<script>` de un `.svelte` no se pueden probar y la Tarea 7 les agrega una quinta palabra que **tiene que entrar en los dos**. Son veinte líneas movidas, no un refactor:

```js
// Las palabras de la bitácora. Dos mapas y no uno porque en castellano la
// primera persona conjuga distinto: "Vos marcó hecha" no se puede leer.
//
// Son mapas CERRADOS: una acción que no está renderiza su propio nombre crudo en
// pantalla, así que agregar una acción es agregarla acá dos veces.

export const ACTION_LABEL = {
	created: 'creó una tarea',
	done: 'marcó hecha',
	reopened: 'reabrió',
	note: 'dejó una nota'
};

export const ACTION_LABEL_USER = {
	created: 'creaste una tarea',
	done: 'marcaste hecha',
	reopened: 'reabriste',
	note: 'dejaste una nota'
};

// `ctx` es el mismo que el de `actorName`: el rol de este aparato en esa nota y
// mi firma de miembro. En la nota de otro, "marcó hecha" del dueño no es
// "marcaste hecha".
export function actionLabel(entry, ctx) {
	const labels = isMine(entry.actor, ctx) ? ACTION_LABEL_USER : ACTION_LABEL;
	return labels[entry.action] ?? entry.action;
}
```

y en `SettingsDialog.svelte` se importan en vez de declararse, llamando `actionLabel(entry, { role: rolesPorNota.get(entry.noteId) ?? null, myActor: miActor })`.

- [ ] **Step 12: Todo verde y commit**

```bash
pnpm test && pnpm check
git add -u && git add src/lib/storage/actor-names.test.ts
git commit -m "feat(compartir): cada línea de la bitácora dice quién la escribió"
```

---

## Task 6: El invitado comenta una tarea

**Files:**
- Modify: `src/lib/editor/BlockActionsMenu.svelte:30`, `:108-175`
- Modify: `src/lib/editor/BlockRow.svelte:146`, `:186-215`, `:1029-1041`
- Modify: `src/lib/editor/Editor.svelte` (`handleNoteInput` vecino nuevo)
- Modify: `src/lib/tasks/actions.ts:195-213` (`addTaskNote` acepta un `actor` de miembro — ya lo acepta, sólo hay que probarlo)
- Test: `src/lib/editor/*.test.ts` (jsdom), e2e

**Interfaces:**
- Consumes: `myActor`, `isMember` (Tarea 4); `buildAgentNotes` (Tarea 5).
- Produces: prop `noteOnly` en `BlockActionsMenu`; callback `onComment(block, text)` en `BlockRow`.

**Cómo funciona, en una línea:** se reusa el MISMO renglón editable en itálica que usa el dueño para su comentario, pero para el invitado no arranca cargado con `block.note` y no guarda al teclear: junta un borrador y lo manda de una vez con Enter o al perder el foco, como una línea de bitácora. El comentario aparece abajo, en la lista que la Tarea 5 acaba de aprender a etiquetar.

**Lo que hay que decir en pantalla y no está en el código:** el comentario del invitado **no se puede borrar ni editar**, ni por él ni por el dueño. El del dueño sí. Van al mismo lugar y se ven casi iguales, así que el marcador de posición del borrador lo dice: `Comentar (no se puede editar después)`.

- [ ] **Step 1: El menú de una sola puerta**

`src/lib/editor/BlockActionsMenu.svelte`, en los props:

```js
		contentActions = true,
		// El invitado de una nota compartida (spec 038 §6): de las seis puertas de
		// este menú queda UNA. Las otras cinco escriben el renglón, y eso es
		// exactamente lo que no puede hacer.
		noteOnly = false
```

Y envolver: el ítem "Dejar una nota" se muestra con `{#if contentActions}` como hoy; **todos los demás** pasan a `{#if !noteOnly}`.

- [ ] **Step 2: Mostrar el menú al invitado**

`src/lib/editor/BlockRow.svelte`, línea ~1029, reemplazando el `{#if !readOnly}`:

```svelte
		{#if !readOnly || guest}
			<BlockActionsMenu
				{pulseMenu}
				noteOnly={guest}
				contentActions={block.type !== 'separator'}
				onAddNote={openNote}
				...
```

- [ ] **Step 3: El borrador no se carga ni se guarda al teclear**

Línea ~146 y ~186-215 de `BlockRow.svelte`:

```js
	// Al invitado el renglón en itálica NO le muestra el comentario del dueño: ese
	// campo (`block.note`) ni siquiera viaja por el caño compartido. Le sirve de
	// hoja en blanco para escribir el suyo, que es otra cosa (una línea de
	// bitácora) y se manda entera de una vez.
	const noteVisible = $derived(showNote || (!guest && (block.note ?? '') !== ''));
```

En el `$effect` que siembra el editable (línea ~190):

```js
		if (!guest && noteEl && noteEl.textContent !== (block.note ?? '')) {
			noteEl.textContent = block.note ?? '';
		}
```

`handleNoteInput` no hace nada cuando `guest`:

```js
	function handleNoteInput() {
		if (guest) return;
		onNoteInput(block, noteEl.textContent);
	}

	// El borrador se manda entero: con Enter o al salir del renglón. Es una línea
	// de bitácora y una línea de bitácora no se edita después (spec 038 §4), así
	// que guardar al teclear dejaría una entrada por letra.
	function commitComment() {
		const text = (noteEl?.textContent ?? '').trim();
		showNote = false;
		if (noteEl) noteEl.textContent = '';
		if (text) onComment(block, text);
	}
```

Y en el `<div>` editable de la nota (línea ~858), cuando `guest`: `onblur={commitComment}` y un `onkeydown` que atrapa Enter (`event.preventDefault()` + `commitComment()`), más `data-placeholder="Comentar (no se puede editar después)"`.

- [ ] **Step 4: El editor escribe la línea**

`src/lib/editor/Editor.svelte`, al lado de `handleNoteInput`:

```js
	// El comentario del invitado NO es `block.note` —ese campo es del dueño y no
	// viaja— sino una línea de bitácora, que es lo único que el servidor le
	// acepta. Cae en la misma lista donde ya se leen las notas del agente, así
	// que aparece bajo la tarea sin ninguna pantalla nueva.
	async function handleComment(block, text) {
		await addTaskNote({ blockId: block.id, actor: myActor ?? 'user', text });
		loadedActivity = await listActivityByNote(note.id);
		agentNotes = await buildAgentNotes(loadedActivity);
	}
```

Y pasarlo: `onComment={handleComment}` en el `<BlockRow>`.

- [ ] **Step 5: La prueba de que la línea sale firmada**

En `src/lib/tasks/actions.test.ts`:

```js
it('el comentario de un invitado queda firmado como él y pendiente de subir', async () => {
	const { blockId } = await sembrarTarea();
	await addTaskNote({ blockId, actor: 'member:u-1', text: 'le dejé mensaje' });
	const linea = (await listActivityByBlock(blockId)).at(-1);
	expect(linea.actor).toBe('member:u-1');
	expect(linea.action).toBe('note');
	expect(linea.text).toBe('le dejé mensaje');
	expect(linea.cloudSeq).toBeUndefined();
});

it('y no puede pedirle al agente que rehaga nada', async () => {
	const { blockId, block } = await sembrarTarea();
	await addTaskNote({ blockId, actor: 'member:u-1', text: 'rehacelo' });
	expect(isRedoRequested(block, await listActivityByBlock(blockId))).toBe(false);
});
```

La segunda es la que vale la pena: `isRedoRequested` exige `actor === 'user'`, así que la puerta ya está cerrada — pero no había nada que lo dejara escrito, y es justo la clase de condición que alguien "simplifica" un año después.

- [ ] **Step 6: e2e con su control**

En una nota con `share: 'member'`: el menú `⋯` aparece, tiene **un solo** ítem, y al escribir + Enter aparece la itálica con el nombre debajo.

**El control obligatorio:** la misma prueba con `share: 'owner'` tiene que ver el menú **completo** (seis ítems). Sin el control, un menú que no se renderiza por cualquier motivo da verde en las dos mitades.

- [ ] **Step 7: Todo verde y commit**

```bash
pnpm test && pnpm check && pnpm test:e2e
git add -u
git commit -m "feat(compartir): el invitado puede comentar una tarea"
```

---

## Task 7: "Listo"

**Files:**
- Create: `src/lib/editor/SharedFooter.svelte`, `src/lib/tasks/note-level.test.ts`, `src/lib/tasks/action-labels.test.ts`
- Modify: `src/lib/tasks/actions.ts` (una función nueva), `src/lib/tasks/index.ts`
- Modify: `src/lib/editor/Editor.svelte` (montar el pie)
- Modify: `src/lib/tasks/action-labels.ts` (la quinta palabra, en los dos mapas)

**Interfaces:**
- Produces: `markNoteDone({ noteId, actor, text })` → la entrada `action: 'listo'`, `blockId: null`.

**Las tres cosas que arrastra, y las tres ya están resueltas o hay que resolverlas acá:**

1. **`blockId: null` no es una clave válida de IndexedDB**, así que la fila simplemente queda fuera del índice `blockId` y se lee por nota — que es exactamente lo que se quiere, pero hay que decirlo en voz alta porque parece un bug.
2. **El respaldo ya lo tolera**, por adelantado (`3e42b5e`): `activity.blockId` es `v.nullable(v.string())` y `dropDanglingActivity` no trata el nulo como un renglón que falta. **No hay nada que hacer, pero sí que comprobar** — el paso 4 de acá es el ida y vuelta.
3. **`'listo'` es una quinta acción y los dos mapas de `SettingsDialog` son cerrados**: una acción que no está renderiza su propio nombre crudo en pantalla.

**Por qué la palabra `'listo'` y no una inglesa** como el resto (`created`, `done`, `reopened`, `note`): `done` ya está tomada y significa "se tildó una tarea", que es otra cosa. Cualquier sinónimo inglés se confunde con ella al leer el código. `'listo'` es literalmente el botón.

- [ ] **Step 1: Las pruebas que fallan**

`src/lib/tasks/note-level.test.ts`:

```js
it('deja una entrada de la nota entera, sin renglón', async () => {
	await markNoteDone({ noteId: 'n1', actor: 'member:u-1', text: 'falta la factura' });
	const rows = await listActivityByNote('n1');
	expect(rows.at(-1)).toMatchObject({ blockId: null, action: 'listo', actor: 'member:u-1', text: 'falta la factura' });
});

it('sin aclaración también vale', async () => {
	await markNoteDone({ noteId: 'n1', actor: 'member:u-1' });
	expect((await listActivityByNote('n1')).at(-1).text).toBe('');
});

it('no aparece colgada de ningún renglón', async () => {
	await markNoteDone({ noteId: 'n1', actor: 'member:u-1' });
	expect(await listActivityByBlock(null)).toEqual([]);
});

it('queda pendiente de subir, como cualquier línea del invitado', async () => {
	await markNoteDone({ noteId: 'n1', actor: 'member:u-1' });
	expect((await listActivityByNote('n1')).at(-1).cloudSeq).toBeUndefined();
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- note-level`
Expected: FAIL — no existe `markNoteDone`.

- [ ] **Step 3: Escribirla**

En `src/lib/tasks/actions.ts`:

```js
// "Listo": una declaración sobre la NOTA, no sobre un renglón (spec 038 §8). No
// es una máquina de estados — no hay aprobación, no hay reapertura, no hay
// estado que consultar. El dueño la lee como una línea más.
//
// `blockId: null` no es una clave válida de IndexedDB, así que la fila queda
// fuera del índice `blockId` y se lee por nota. Eso es lo que se quiere, y está
// escrito porque parece un descuido.
//
// No abre transacción: es la única acción que escribe UNA fila y ninguna otra,
// así que no hay nada con qué quedar a medias. Por eso lleva el `bumpAgentData`
// explícito, igual que `addTaskNote`: sin escritura de renglón, la red de
// seguridad de `updateBlock` no se dispara.
export async function markNoteDone({ noteId, actor = 'user', text = '' }) {
	const activity = await appendActivity({ blockId: null, noteId, actor, action: 'listo', text });
	bumpAgentData();
	return { activity };
}
```

- [ ] **Step 4: Correr y ver el verde, más el ida y vuelta del respaldo**

Run: `pnpm test -- note-level`
Expected: PASS.

Y la prueba que vale una restauración, en `src/lib/export-import/*.test.ts`:

```js
it('un respaldo con un "Listo" se exporta y se vuelve a importar entero', async () => {
	await markNoteDone({ noteId: 'n1', actor: 'member:u-1', text: 'falta la factura' });
	const archivo = await buildBackup();
	expect(validateBackup(archivo).ok).toBe(true);
	// Y la fila sobrevive a la limpieza de entradas huérfanas.
	const importado = await importBackup(archivo);
	expect((await listActivityByNote('n1')).some((r) => r.action === 'listo')).toBe(true);
});
```

Esta es la que protege el agujero que `3e42b5e` cerró por adelantado. Si se pone roja, **no arreglar el "Listo"**: revisar que `activitySchema.blockId` siga siendo `v.nullable(v.string())` y que `dropDanglingActivity` siga saltando el nulo.

- [ ] **Step 5: Las dos palabras nuevas**

En `src/lib/tasks/action-labels.ts` (el módulo que creó la Tarea 5). **Los dos mapas, o el que falte muestra `listo` crudo en pantalla:**

```js
	listo: 'marcó Listo'   // en ACTION_LABEL
	listo: 'marcaste Listo' // en ACTION_LABEL_USER
```

Y la prueba que los ata, en `src/lib/tasks/action-labels.test.ts`, para que no se vuelvan a separar:

```js
it('los dos mapas cubren exactamente las mismas acciones', () => {
	expect(Object.keys(ACTION_LABEL).sort()).toEqual(Object.keys(ACTION_LABEL_USER).sort());
});

it('la quinta acción tiene palabra en los dos', () => {
	expect(actionLabel({ actor: 'member:u-1', action: 'listo' }, { role: 'owner', myActor: null })).toBe('marcó Listo');
	expect(actionLabel({ actor: 'user', action: 'listo' }, { role: 'owner', myActor: null })).toBe('marcaste Listo');
});

// Lo que pasa hoy con una acción que no está en el mapa, escrito para que se
// vea por qué la prueba de arriba existe.
it('una acción desconocida se muestra cruda', () => {
	expect(actionLabel({ actor: 'user', action: 'inventada' }, { role: null, myActor: null })).toBe('inventada');
});
```

- [ ] **Step 6: El pie**

`src/lib/editor/SharedFooter.svelte`. Props: `{ role, entries, onDone }` donde `entries` son las de `action: 'listo'` ya etiquetadas.

- Cuando `role === 'member'`: el botón `Listo` y un campo de texto opcional al lado (`placeholder="Algo que aclarar (opcional)"`). Al apretar: `onDone(text)`, se limpia el campo.
- Siempre que haya entradas (los dos lados): la lista, `✓ {label} marcó Listo · {fecha}` y la aclaración debajo si tiene.
- Cuando `role` no es `'owner'` ni `'member'`: no se renderiza nada.

Reglas de la casa que aplican acá: el botón mide al menos 44px de alto (táctil), el campo tiene su `<label>` aunque sea `sr-only`, y la fecha se dibuja con `new Date(at).toLocaleString('es')` como el resto.

- [ ] **Step 7: Montarlo**

En `src/lib/editor/Editor.svelte`, después de la lista de renglones:

```svelte
{#if note?.share}
	<SharedFooter
		role={note.share}
		entries={doneEntries}
		onDone={(text) => handleNoteDone(text)}
	/>
{/if}
```

con

```js
	// Las entradas de nota entera salen de la misma lectura que ya alimenta la
	// itálica de cada renglón; no hace falta una consulta más.
	const doneEntries = $derived(loadedActivity.filter((row) => row.action === 'listo'));

	async function handleNoteDone(text) {
		await markNoteDone({ noteId: note.id, actor: myActor ?? 'user', text });
		loadedActivity = await listActivityByNote(note.id);
	}
```

**Ojo:** `doneEntries` necesita su etiqueta resuelta igual que la itálica. Reusar el mismo camino de `buildAgentNotes` (un `actorName` por actor distinto, cacheado), no escribir un segundo resolvedor.

- [ ] **Step 8: Ver la pantalla de verdad**

Sacar una captura con Playwright y **mirarla** — los tests verdes no ven composición. Con el pie vacío, con una entrada, y con una entrada larga en una ventana angosta.

- [ ] **Step 9: Todo verde y commit**

```bash
pnpm test && pnpm check && pnpm test:e2e
git add -u && git add src/lib/editor/SharedFooter.svelte src/lib/tasks/note-level.test.ts
git commit -m "feat(compartir): el invitado puede decir Listo"
```

---

## Task 8: El agente

**Files:**
- Modify: `src/lib/bridge/export.ts:39-52`, `:90-104`
- Modify: `src/lib/bridge/ingest.ts`
- Modify: `mcp/lib/tools.js:194`, `:208-212`
- Test: `src/lib/bridge/export.test.ts` (jsdom), `mcp/` (ver abajo)

**Interfaces:**
- Produces: cada fila de `activity` dentro de `export.json` lleva `actorLabel` (texto ya resuelto).

**Por qué el nombre se resuelve al SALIR:** el cachecito de nombres es una tabla de Dexie y el servidor MCP corre en otro proceso, sin navegador. No puede buscarlo. Si el nombre no baja resuelto, el agente recibe `member:8f3a...` pelado.

**El techo que este plan acepta a propósito:** el **"Listo" de nota entera NO llega al agente**. `buildAgentExport` agrupa la bitácora por renglón (`activityByBlock[row.blockId]?.push(row)`), así que una fila con `blockId: null` se cae sola, y darle lugar significa un campo nuevo en la nota del payload **y** una herramienta MCP nueva para leerlo, porque hoy no hay ninguna que muestre la historia de una nota. El agente sí ve los tildes y los comentarios por tarea, que son el "qué pasó" que usa. Marcar el corte con un comentario `ponytail:` en `export.ts`.

- [ ] **Step 1: La prueba que falla**

En `src/lib/bridge/export.test.ts`:

```js
it('el nombre del invitado baja resuelto, no como member:<uuid>', async () => {
	await rememberShareName('u-2', 'Juan');
	const payload = await buildAgentExport();
	const linea = payload.notes[0].blocks[0].activity.at(-1);
	expect(linea.actorLabel).toBe('Juan');
	expect(linea.actor).toBe('member:u-2');
});

it('un invitado sin nombre guardado no rompe nada', async () => {
	const payload = await buildAgentExport();
	expect(payload.notes[0].blocks[0].activity.at(-1).actorLabel).toBe('Invitado');
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test -- bridge/export`
Expected: FAIL — `actorLabel` no existe.

- [ ] **Step 3: Resolverlo al salir**

En `buildAgentExport`, dentro del bucle por nota (donde ya se sabe `note.id` y por lo tanto el rol):

```js
		// El nombre se resuelve ACÁ, de este lado. El cachecito es una tabla de
		// Dexie y el servidor MCP corre en otro proceso: si baja `member:<uuid>`
		// pelado, no hay nadie del otro lado que lo pueda traducir.
		//
		// ponytail: sólo las entradas colgadas de un renglón. El "Listo" de nota
		// entera (blockId null) se cae en el agrupamiento de abajo y queda fuera
		// del export a propósito — darle lugar pide un campo nuevo en la nota Y una
		// herramienta MCP que hoy no existe. Si el agente tiene que enterarse del
		// "Listo", eso es el trabajo, no una línea más acá.
		const ctx = { noteId: note.id, role: await getShareRole(note.id), myActor: await myMemberActor() };
		for (const row of await listActivityByNote(note.id)) {
			if (!activityByBlock[row.blockId]) continue;
			activityByBlock[row.blockId].push({ ...row, actorLabel: await actorName(row.actor, ctx) });
		}
```

**Un nombre por actor distinto, no uno por línea** — cachear en un `Map` como en el editor; una nota con quince tildes de Juan haría quince lecturas de Dexie por exportación, y esto corre en cada escritura del agente.

- [ ] **Step 4: El tercer rol en el MCP**

`mcp/lib/tools.js`:

```js
const ACTION_VERBS = { created: 'creó', done: 'completó', reopened: 'reabrió', note: 'anotó' };

// Tres roles, no dos (spec 038 §6). Acá el rótulo no se MUESTRA: se actúa sobre
// él — un LLM que lee su propio nombre sobre la instrucción de un tercero es
// peor que una palabra mal puesta en una pantalla.
//
// El nombre viene resuelto desde la app (`actorLabel`): el cachecito de nombres
// es una tabla del navegador y este proceso no la puede leer.
//
// El agente va por descarte, no por igualdad: el `actor` de una línea del agente
// es el ID del agente conectado, no la palabra 'agent'.
function rolDe(entry) {
	if (entry.actor === 'user') return 'usuario';
	if (typeof entry.actor === 'string' && entry.actor.startsWith('member:'))
		return `${entry.actorLabel ?? 'invitado'} (invitado)`;
	return 'agente';
}
```

y en `historyResult`: `const rol = rolDe(entry);`

- [ ] **Step 5: La prueba del MCP**

`mcp/` corre vitest (`mcp/package.json` › `"test": "vitest run"`) y ya tiene
`mcp/lib/tools.test.js` con un bloque `describe('historyResult')`. Agregar ahí:

```js
it('una línea de un invitado sale con su nombre, no como del agente', () => {
	const payload = payloadConActividad([
		{ actor: 'user', action: 'created', text: 'Llamar al contador' },
		{ actor: 'member:u-2', actorLabel: 'Juan', action: 'note', text: 'le dejé mensaje' }
	]);
	const texto = historyResult(payload, 'bbbbbbbb').content[0].text;
	expect(texto).toContain('- Juan (invitado) anotó: le dejé mensaje');
	expect(texto).not.toContain('agente anotó');
});

it('un invitado sin nombre resuelto no se hace pasar por el agente', () => {
	const payload = payloadConActividad([{ actor: 'member:u-9', action: 'note', text: 'hola' }]);
	expect(historyResult(payload, 'bbbbbbbb').content[0].text).toContain('- invitado (invitado) anotó: hola');
});

it('y el agente sigue siendo el agente, con su id como actor', () => {
	const payload = payloadConActividad([{ actor: 'agt_7f21c9', action: 'note', text: 'propuesta' }]);
	expect(historyResult(payload, 'bbbbbbbb').content[0].text).toContain('- agente anotó: propuesta');
});
```

(`payloadConActividad` es un helper local que arma el mismo `expandPayload` que
las pruebas de al lado, con la lista de actividad pasada en la tarea `bbbbbbbb`.)

Run: `cd mcp && pnpm test`
Expected: PASS. **La tercera prueba es la que importa** — es la que se pone roja
si alguien escribe `entry.actor === 'agent'` en vez del descarte.

- [ ] **Step 6: El portón del agente en una nota ajena**

`src/lib/bridge/ingest.ts` no tiene ninguna rama de compartir, y §4 la pide: en
una nota donde esta cuenta es MIEMBRO, el agente **completa y comenta**, nada
más.

Sin esto: el invitado prende `agentVisible` en la nota que le compartieron, su
agente crea tareas, esas filas **nunca pueden salir** (el SQL las rechaza por
rol) y su copia se separa de la del dueño en silencio y para siempre.

El lugar exacto es `checkChange`, **después** de que se resuelve `note` (hoy
línea 96) y antes del control de "es una tarea". Y no cuesta ninguna consulta
más: `note.share` ya viene en la fila que se acaba de leer.

```js
	const note = await getNote(noteId);
	if (!note || note.agentVisible !== true) return { reason: REASON.notAgentVisible };

	// El mismo permiso que la pantalla, y por el mismo motivo (spec 038 §4): en
	// una nota que te comparten, completar y comentar. Crear no — una tarea
	// nueva del agente del invitado es una fila que el servidor rechaza por rol,
	// así que viviría sólo en su copia y el dueño no la vería nunca.
	//
	// `note.share` ya está en la fila de arriba: no hace falta preguntar de nuevo.
	if (note.share === 'member' && change.type === 'createTask') {
		return { reason: REASON.notAllowed };
	}
```

Y `completeTask` necesita lo mismo que `setTaskChecked` en la Tarea 4 — su
escritura de renglón en una nota ajena va con la marca:

```js
		async completeTask(change, actor, noteId, isMember) {
			const text = toCleanText(change.text);
			return () => completeTask({ blockId: change.blockId, actor, text, fromCloud: isMember });
		},
```

pasando `note.share === 'member'` como cuarto argumento en la llamada a
`handler(...)` de `checkChange`, y agregando `fromCloud = false` a `completeTask`
en `tasks/actions.ts` (mismo cambio de una línea que `setTaskChecked`: el
`updateBlock(id, { checked })` del bucle pasa a llevar la marca).

- [ ] **Step 6b: Las pruebas del portón**

En `src/lib/bridge/ingest.test.ts`:

```js
it('en una nota que te comparten el agente no crea tareas', async () => {
	await sembrarNota({ id: 'n1', agentVisible: true, share: 'member' });
	const res = await ingestAgentChange({ id: 'c1', type: 'createTask', noteId: 'n1', content: 'mía' });
	expect(res.ok).toBe(false);
	expect(res.reason).toBe(REASON.notAllowed);
});

// El control, sin el cual la de arriba pasa aunque el portón no exista.
it('pero en una nota tuya sí', async () => {
	await sembrarNota({ id: 'n2', agentVisible: true, share: null });
	const res = await ingestAgentChange({ id: 'c2', type: 'createTask', noteId: 'n2', content: 'mía' });
	expect(res.ok).toBe(true);
});

it('comentar y completar sí pasan en la nota ajena', async () => {
	await sembrarNota({ id: 'n1', agentVisible: true, share: 'member' });
	await sembrarTarea({ id: 'b1', noteId: 'n1' });
	expect((await ingestAgentChange({ id: 'c3', type: 'addNote', blockId: 'b1', text: 'ojo' })).ok).toBe(true);
	expect((await ingestAgentChange({ id: 'c4', type: 'completeTask', blockId: 'b1', text: '' })).ok).toBe(true);
});

it('y completar en la nota ajena no deja el renglón pendiente de subir', async () => {
	await sembrarNota({ id: 'n1', agentVisible: true, share: 'member' });
	await sembrarTarea({ id: 'b1', noteId: 'n1' });
	const antes = (await db.table('blocks').get('b1')).changeSeq;
	await ingestAgentChange({ id: 'c5', type: 'completeTask', blockId: 'b1', text: '' });
	expect((await db.table('blocks').get('b1')).changeSeq).toBe(antes);
});
```

- [ ] **Step 7: Todo verde y commit**

```bash
pnpm test && pnpm check
git add -u
git commit -m "feat(compartir): el agente ve quién es quién y no escribe en la nota ajena"
```

---

## Task 9: La guía y el CHANGELOG

Regla del proyecto: en el mismo commit que lo implementa. Acá va todo junto porque hasta esta altura no había nada terminado que el usuario pudiera ver.

**Files:**
- Modify: `docs/guia/20-compartir-una-nota.md`
- Modify: `docs/guia-de-uso.md` (la fecha de "Última actualización")
- Modify: `CHANGELOG.md`

- [ ] **Step 1: La guía**

Agregar a `docs/guia/20-compartir-una-nota.md`, en castellano llano, sin jerga:

- Qué puede hacer la persona a la que le compartís: tildar, comentar una tarea, decir Listo.
- Que **no** puede escribir, borrar, renombrar ni mover nada.
- Que su comentario **no se puede borrar ni editar** — ni ella ni vos. El tuyo sí.
- Cómo se ve quién hizo qué, y de dónde sale el nombre (lo escribís vos al generar el link).
- Que tu agente ve lo que ella escribió, con su nombre.

- [ ] **Step 2: El índice**

`docs/guia-de-uso.md`: actualizar "Última actualización".

- [ ] **Step 3: El CHANGELOG**

En la sección de la versión en curso, una viñeta por cambio visible:

```markdown
- La persona a la que le compartís una nota ya puede contestarla: marcar tareas
  como hechas, dejar un comentario en una tarea y avisarte "Listo".
- Cada cosa que pasa en una nota compartida dice quién la hizo, con el nombre
  que vos pusiste al invitar.
- Tu agente ve los comentarios de la otra persona, con su nombre.
```

- [ ] **Step 4: Commit**

```bash
git add docs/ CHANGELOG.md
git commit -m "docs(compartir): la guía y el CHANGELOG de que la otra persona conteste"
```

---

## Task 10: El gate manual con dos cuentas

**Nada se mergea hasta que esto pase entero.** El gate de B1 encontró **nueve** bugs, más que las siete tareas de construcción juntas, y ninguno era visible leyendo el código de a un archivo.

**La preparación, con lo aprendido en B1 (ahorra una hora):**

- **No hace falta empaquetar la `.app`** — nada de B2 depende del runtime empaquetado.
- **No hace falta una segunda cuenta de Google.** Crear una con mail y contraseña es instantáneo (`disable_signup:false`, `mailer_autoconfirm:true`); sirve un alias propio.
- **Cerrar los `vite` viejos antes de empezar** (`lsof -ti:5173-5180`), o el nuevo sale en otro puerto y el de siempre sirve código viejo.
- **Verificar la CSP ANTES de tocar nada:**
  ```bash
  curl -sI http://localhost:5173/ | grep -io "connect-src[^;]*"
  ```
  Tiene que mostrar el host de Supabase. Si no, reiniciar el `vite dev`. Sin esto, la falla llega disfrazada de "no hay internet" y cuesta media hora.
- **A = ventana normal** (la app de siempre de Hernán, con su sesión; crear una nota **nueva** de prueba). **B = ventana de incógnito** con la cuenta nueva. Son dos aparatos de verdad: otro IndexedDB.
- El link de invitación sale con el origen donde se genera, así que generado en `localhost:5173` se abre en B sin tocar nada.

**Los pasos, en orden. Cada uno tiene su "cómo se ve que falló":**

- [ ] **1.** A comparte una nota con tres tareas e invita a B con el nombre "Juan". B acepta.
- [ ] **2.** B tilda una tarea. **En A la tarea se tilda sola dentro de los 30 segundos.** *Falla si:* queda sin tildar (la deducción no corre) o si tilda y vuelve a destildar (el `checked` sigue viajando y ganando).
- [ ] **3.** Con la nota abierta en A y sin tocar nada, **contar cuántas veces se refresca en 3 minutos.** *Tiene que ser cero.* Es el bug que la Tarea 3 previene, y sólo se ve mirando.
- [ ] **4.** A destilda la misma tarea. **En B se destilda.** Los dos sentidos, no uno.
- [ ] **5.** B tilda una tarea **madre** con hijas. **En A se tildan la madre y las hijas.** La cascada son N líneas, no una.
- [ ] **6.** B comenta una tarea ("le dejé mensaje"). **En A aparece bajo la tarea, en itálica, con la etiqueta "Juan"** — no "IA", no `member:8f3a…`.
- [ ] **7.** A comenta la misma tarea con **su** comentario (el de siempre, el del menú ⋯). **En B NO aparece** (es `block.note`, no viaja) — y A lo sigue viendo. Esto no es un bug: es la diferencia entre los dos comentarios, y el paso existe para que quede medida y no se descubra como sorpresa.
- [ ] **8.** A deja una línea de bitácora en esa tarea desde Configuración › Agentes ("Rehacer"). **En B aparece con el nombre de A**, no con "Vos".
- [ ] **9.** B aprieta **Listo** con la aclaración "falta la factura". **En A aparece al pie: "Juan marcó Listo" + la aclaración.**
- [ ] **10.** En B, abrir el menú `⋯` de un renglón: **tiene un solo ítem**. Y probar las cuatro puertas que B1 cerró (pegar, la barra de formato, el chip de fecha, el título de la nota) — **siguen cerradas**.
- [ ] **11.** En A, Configuración › Agentes: la bitácora dice **"Juan marcó hecha"**, no "Agente marcó hecha" ni "Vos marcaste hecha".
- [ ] **12.** En A, con la nota visible para el agente: `get_task_history` de esa tarea dice **"Juan (invitado) anotó: le dejé mensaje"**.
- [ ] **13.** En B, **Configuración › "sin subir" tiene que llegar a cero** después de una pasada. Si se queda en un número que no baja, hay una fila atascada — que es justo lo que este plan afirma que no puede pasar.
- [ ] **14.** En A, **exportar un respaldo y volver a importarlo.** El "Listo" y los comentarios de Juan sobreviven. *Falla si:* el archivo no valida (revisar `activity.blockId` nullable) o el "Listo" desaparece con un aviso (revisar `dropDanglingActivity`).
- [ ] **15.** A saca a B de la compartición. **En B la nota se queda** (su copia es suya) y deja de recibir. En A, `pnpm rls:check` sigue dando **21/21**.

- [ ] **Step final: escribir el resultado**

Al terminar, escribir al final de ESTE archivo qué pasó paso por paso, con los bugs encontrados y su commit. El resultado del gate es el documento más útil que deja una rama — el de B1 se leyó tres veces.

---

## Notas de riesgo, para quien lo ejecute

**Las tres cosas que este plan puede tener mal, ordenadas por lo que costaría descubrirlas tarde:**

1. **La ventana de relectura y la deducción.** `pullSharedNote` re-pide 50 filas hacia atrás en cada pasada. El paso 3 del gate es lo único que comprueba que sacar `checked` de la comparación alcanza. Si en ese paso la nota se refresca igual, **no tapar el síntoma bajando `applied`**: buscar qué otro campo está llegando distinto en cada pasada.
2. **`refreshFromStorage` no reasigna `note`**, así que un rol que cambia con la nota abierta no se ve hasta re-montar (encontrado en B1). Alcanza porque falla del lado seguro, pero si algo de B2 "no se actualiza hasta cerrar y abrir la nota", esa es la causa antes que cualquier otra.
3. **Una prueba de ausencia sin control es un falso positivo esperando.** Pasó dos veces en la rama de B1. Toda prueba de "esto no está" lleva su control ("en el caso normal sí está") y, si lo que se espera tarda, una espera mayor a ese plazo — `toHaveCount(0)` no espera.

**Y lo que este plan deja afuera a propósito, para que no se lea como un olvido:**

- El **contador de novedades** en la lista de notas (§8, mitad B3).
- Que **deshacer no destilde** (§9, B3).
- La **consulta de moderación** (B3).
- El **"Listo" no llega al agente** (Tarea 8, con su razón escrita).
- **Un solo invitado por nota es lo probado.** El código no lo limita —los nombres se resuelven por uuid y el pie lista todas las entradas— pero el gate corre con dos cuentas, así que "varios invitados" queda sin medir.
