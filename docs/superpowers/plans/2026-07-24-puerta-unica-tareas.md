# Puerta única de tareas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La lista de tareas que lee el agente MCP (`export.json`) nunca queda vieja — cualquier escritura del almacén la refresca — y las acciones importantes del usuario (completar/reabrir/crear/convertir tarea) dejan línea de bitácora.

**Architecture:** Red de seguridad en el piso más bajo: cada función de escritura de `src/lib/storage/blocks.ts` y `notes.ts` llama `bumpAgentData()`. El puente (`BridgeLifecycle.svelte`) agrupa los bumps con un trailing debounce de 500 ms antes de reescribir `export.json`. La bitácora de eventos del usuario se rutea por la capa de tareas (`src/lib/tasks/actions.ts`), que gana `setTaskChecked` (cascada + bitácora) y `convertToTask`, y extiende `createTask` con `order`/`checked`.

**Tech Stack:** SvelteKit + Svelte 5 runes, Dexie/IndexedDB, Vitest (+fake-indexeddb), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-puerta-unica-tareas-design.md` — leerla antes de empezar.

## Global Constraints

- Rama de trabajo: `feat/puerta-unica-tareas` (ya existe; el diseño está commiteado ahí).
- Código de proyecto = JavaScript plano dentro de `.ts`/`.svelte`: **sin anotaciones de tipo** (solo shadcn-svelte vendored las conserva).
- Svelte 5 runes: `$derived` para valores, `$effect` solo para acciones externas, cleanup siempre que haya timers/suscripciones.
- Commits: mensaje conventional en español, **SIN trailers de agente** (nada de `Co-Authored-By` ni "Generated with" — regla del repo, main deploya a Vercel).
- Tests focalizados: `npx vitest run <archivos>` (`pnpm test:unit -- --run <archivos>` NO filtra — corre la suite entera).
- `pnpm check` tiene 2 errores pre-existentes en `db.migrations.test.ts` — no introducir nuevos.
- Comentarios en el estilo del archivo tocado (Editor mezcla es/en; storage en inglés; capa de tareas en inglés).
- Verificado durante el diseño: `storage/journal.ts` (replay del arranque) escribe vía `updateNote`/`updateBlock` de los repos → la Task 1 lo cubre sin trabajo extra.

---

### Task 1: Red de seguridad — los repos bumpean en cada escritura

**Files:**
- Modify: `src/lib/storage/blocks.ts` (funciones `createBlock`, `putBlock`, `updateBlock`, `applyInsertionPlan`, `softDeleteBlock`, `softDeleteBlocks`)
- Modify: `src/lib/storage/notes.ts` (funciones `createNote`, `updateNote`, `softDeleteNote`)
- Test: `src/lib/storage/blocks.test.ts`, `src/lib/storage/notes.test.ts`

**Interfaces:**
- Consumes: `bumpAgentData()` / `agentData` de `$lib/bridge/signal.svelte` (módulo hoja, sin imports — no hay ciclo; compila en el entorno node de vitest, precedente: `tasks/actions.test.ts` ya lo importa).
- Produces: garantía de que TODA escritura de notas/bloques incrementa `agentData.version`. Ningún cambio de firma; los retornos de cada función quedan idénticos.

- [ ] **Step 1: Tests que fallan — blocks.test.ts**

Agregar al final de `src/lib/storage/blocks.test.ts` (el archivo ya importa `applyInsertionPlan`, `createBlock`, `getBlock`, `listBlocksByNote`, `softDeleteBlock`, `softDeleteBlocks`, `updateBlock`, `createNote`; agregar el import de signal):

```js
import { agentData } from '$lib/bridge/signal.svelte';

// Safety net: EVERY block write must bump the agent-data signal so the agent
// export can never go stale, no matter which code path wrote (spec 2026-07-24
// puerta única). Reads must not bump.
describe('agent-data safety net', () => {
	it('bumps on create, update, put and softDelete; not on reads', async () => {
		const note = await createNote();
		let before = agentData.version;
		const block = await createBlock({ noteId: note.id, content: 'a' });
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await updateBlock(block.id, { content: 'b' });
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await putBlock({ ...block, content: 'c' });
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await getBlock(block.id);
		await listBlocksByNote(note.id);
		expect(agentData.version).toBe(before);

		before = agentData.version;
		await softDeleteBlock(block.id);
		expect(agentData.version).toBeGreaterThan(before);
	});

	it('bumps on softDeleteBlocks and applyInsertionPlan', async () => {
		const note = await createNote();
		const a = await createBlock({ noteId: note.id, content: 'a' });
		const b = await createBlock({ noteId: note.id, content: 'b' });

		let before = agentData.version;
		await applyInsertionPlan({
			newBlocks: [
				{
					id: 'ins-1',
					noteId: note.id,
					parentBlockId: null,
					type: 'text',
					content: 'x',
					html: 'x',
					order: 2,
					collapsed: false,
					codeCollapsed: false,
					checked: false,
					note: '',
					dueDate: null,
					createdBy: 'user'
				}
			],
			updates: []
		});
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await softDeleteBlocks([a.id, b.id]);
		expect(agentData.version).toBeGreaterThan(before);
	});
});
```

Nota: `putBlock` hoy NO está en el import de blocks.test.ts — agregarlo a la lista de imports de `./blocks`.

- [ ] **Step 2: Tests que fallan — notes.test.ts**

Agregar al final de `src/lib/storage/notes.test.ts` (ya importa `createNote`, `getNote`, `listNotes`, `softDeleteNote`, `updateNote`):

```js
import { agentData } from '$lib/bridge/signal.svelte';

// Same safety net for notes: title and deletion travel to the agent export.
describe('agent-data safety net', () => {
	it('bumps on every note write, not on reads', async () => {
		let before = agentData.version;
		const note = await createNote({ title: 'A' });
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await updateNote(note.id, { title: 'B' });
		expect(agentData.version).toBeGreaterThan(before);

		before = agentData.version;
		await listNotes();
		await getNote(note.id);
		expect(agentData.version).toBe(before);

		before = agentData.version;
		await softDeleteNote(note.id);
		expect(agentData.version).toBeGreaterThan(before);
	});
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npx vitest run src/lib/storage/blocks.test.ts src/lib/storage/notes.test.ts`
Expected: FAIL — los 3 tests nuevos rojos (version no cambia); el resto verde.

- [ ] **Step 4: Implementar los bumps**

En `src/lib/storage/blocks.ts`, agregar el import:

```js
import { bumpAgentData } from '$lib/bridge/signal.svelte';
```

y un comentario-ancla arriba de la primera función que lo use:

```js
// Safety net (spec 2026-07-24 puerta única): every write in this repo bumps
// the agent-data signal AFTER the Dexie write resolves, so export.json can
// never go stale regardless of which code path wrote. Reads never bump.
```

Cambios por función (el bump va DESPUÉS de la escritura resuelta, antes del return; si la escritura lanza, no hay bump):

`createBlock`: después de `await blocks.add(block);` insertar `bumpAgentData();` (antes de `return block;`).

`putBlock`, cuerpo completo nuevo:

```js
export function putBlock(block) {
	return trackPendingWrite(async () => {
		const key = await blocks.put(block);
		bumpAgentData();
		return key;
	});
}
```

`updateBlock`: entre `await blocks.update(...)` y `return blocks.get(id);` insertar `bumpAgentData();`.

`applyInsertionPlan`: después del `await db.transaction(...)` (cierre del bloque) insertar `bumpAgentData();`.

`softDeleteBlock`: después de `await blocks.update(id, {...});` insertar `bumpAgentData();`.

`softDeleteBlocks`: después del `await db.transaction(...)` insertar `bumpAgentData();`.

En `src/lib/storage/notes.ts`, mismo import y mismo patrón:

`createNote`: después de `await notes.add(note);` → `bumpAgentData();`.
`updateNote`: entre `await notes.update(...)` y `return notes.get(id);` → `bumpAgentData();`.
`softDeleteNote`: después del `await db.transaction(...)` → `bumpAgentData();`.

- [ ] **Step 5: Verificar que pasan + sin regresiones**

Run: `npx vitest run src/lib/storage/ src/lib/tasks/ src/lib/bridge/`
Expected: PASS todo (los tests existentes de tasks ya contaban bumps con `toBeGreaterThan`, siguen verdes con bumps extra).

- [ ] **Step 6: Suite unit completa**

Run: `npx vitest run`
Expected: PASS (653 existentes + 3 nuevos). Si algún test existente contaba versiones con igualdad estricta, ajustarlo a `toBeGreaterThan` — pero no debería (G7 usó greaterThan).

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/blocks.ts src/lib/storage/notes.ts src/lib/storage/blocks.test.ts src/lib/storage/notes.test.ts
git commit -m "feat(bridge): red de seguridad — todo write de notas/bloques bumpea la señal del agente"
```

---

### Task 2: Re-export agrupado (debounce 500 ms) en el puente

**Files:**
- Create: `src/lib/bridge/schedule.ts`
- Create: `src/lib/bridge/schedule.test.ts`
- Modify: `src/lib/bridge/BridgeLifecycle.svelte`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `createExportScheduler(write, delay = 500)` → `{ schedule(), cancel() }`. Trailing debounce: `schedule()` reprograma; el `write` corre `delay` ms después del último `schedule()`. `cancel()` descarta el pendiente.

- [ ] **Step 1: Test que falla**

Crear `src/lib/bridge/schedule.test.ts`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExportScheduler } from './schedule';

afterEach(() => {
	vi.useRealTimers();
});

describe('createExportScheduler', () => {
	it('collapses a burst of schedules into one trailing write', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		vi.advanceTimersByTime(200);
		scheduler.schedule();
		vi.advanceTimersByTime(200);
		scheduler.schedule();
		expect(write).not.toHaveBeenCalled();
		vi.advanceTimersByTime(500);
		expect(write).toHaveBeenCalledTimes(1);
	});

	it('cancel drops the pending write', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		scheduler.cancel();
		vi.advanceTimersByTime(1000);
		expect(write).not.toHaveBeenCalled();
	});

	it('schedules again after a fired write (the last bump always exports)', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		vi.advanceTimersByTime(500);
		scheduler.schedule();
		vi.advanceTimersByTime(500);
		expect(write).toHaveBeenCalledTimes(2);
	});
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/bridge/schedule.test.ts`
Expected: FAIL — "Cannot find module './schedule'" (o equivalente).

- [ ] **Step 3: Implementar**

Crear `src/lib/bridge/schedule.ts`:

```js
// With the storage safety net every write bumps the agent signal, so a typing
// burst fires many bumps in a row. This trailing debounce folds them into ONE
// export.json write, `delay` ms after the burst goes quiet. The last schedule
// always ends in a write (unless cancelled on unmount — bounded by the
// mount-time export of the next launch).
export function createExportScheduler(write, delay = 500) {
	let timer = null;
	return {
		schedule() {
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				write();
			}, delay);
		},
		cancel() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
		}
	};
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/bridge/schedule.test.ts`
Expected: PASS 3/3.

- [ ] **Step 5: Cablear BridgeLifecycle**

En `src/lib/bridge/BridgeLifecycle.svelte`, agregar el import y reemplazar el primer `$effect` (el de `agentData.version`, líneas ~8-15) por:

```svelte
	import { createExportScheduler } from './schedule';
```

```js
	// Re-export whenever agent-relevant data changes. With the storage safety
	// net (every notes/blocks write bumps agentData.version) this fires on any
	// keystroke's save, so the scheduler folds bursts into one trailing write
	// 500 ms after quiet. Hiding a note re-exports too (≤500 ms later — same
	// order as the pre-existing read/write race window). writeAgentExport
	// no-ops off desktop. The mount run (version 0) keeps the boot export.
	const exportScheduler = createExportScheduler(() => {
		writeAgentExport().catch((error) => console.error('agent export failed', error));
	});
	$effect(() => {
		void agentData.version;
		exportScheduler.schedule();
		return () => exportScheduler.cancel();
	});
```

El segundo `$effect` (watcher del inbox) NO se toca: el re-export tras ingesta sigue inmediato.

- [ ] **Step 6: Verificar bridge + e2e de agente**

Run: `npx vitest run src/lib/bridge/ && pnpm test:e2e -- agent-activity.spec.ts agent-redo.spec.ts agent-visibility.spec.ts`
Expected: PASS (unit del puente + 4 e2e de agente verdes).

- [ ] **Step 7: Commit**

```bash
git add src/lib/bridge/schedule.ts src/lib/bridge/schedule.test.ts src/lib/bridge/BridgeLifecycle.svelte
git commit -m "feat(bridge): agrupar re-exports del agente con trailing debounce de 500 ms"
```

---

### Task 3: `setTaskChecked` en la capa + rutear editor y Agenda + borrar `toggleTodoCascade`

**Files:**
- Modify: `src/lib/tasks/actions.ts`, `src/lib/tasks/index.ts`
- Modify: `src/lib/editor/Editor.svelte` (`handleToggleChecked`, ~línea 1108)
- Modify: `src/lib/components/AgendaPanel.svelte` (`toggleTodo`, ~línea 45)
- Modify: `src/lib/storage/blocks.ts` (eliminar `toggleTodoCascade` + su import de `planToggleChecked`), `src/lib/storage/index.ts` (quitar el re-export, línea ~23)
- Test: `src/lib/tasks/actions.test.ts`; limpiar tests de `toggleTodoCascade` en `src/lib/storage/blocks.test.ts`

**Interfaces:**
- Consumes: `planToggleChecked(blocks, id)` de `$lib/blocks/cascade` (devuelve `{ updates: [{ id, checked }] }` o `null` si el target no es todo); `traceWrite` y `listBlocksByNote` ya presentes en `actions.ts`.
- Produces: `setTaskChecked({ noteId, blockId, actor = 'user' })` → aplica la cascada vía `traceWrite` (acción `done`/`reopened` por bloque afectado, una línea de bitácora cada uno) y devuelve el plan aplicado `{ updates }` o `null`. Exportada desde `$lib/tasks`.

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/tasks/actions.test.ts` (importar `setTaskChecked` desde `./actions`):

```js
describe('setTaskChecked', () => {
	it('checks a parent, cascades to todo children, one done line each', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre' });
		const child = await createBlock({ noteId: note.id, parentBlockId: parent.id, type: 'todo', content: 'hijo' });

		const plan = await setTaskChecked({ noteId: note.id, blockId: parent.id });

		expect(plan.updates).toEqual(
			expect.arrayContaining([
				{ id: parent.id, checked: true },
				{ id: child.id, checked: true }
			])
		);
		expect((await getBlock(parent.id)).checked).toBe(true);
		expect((await getBlock(child.id)).checked).toBe(true);
		expect((await listActivityByBlock(parent.id)).at(-1)).toMatchObject({ actor: 'user', action: 'done' });
		expect((await listActivityByBlock(child.id)).at(-1)).toMatchObject({ actor: 'user', action: 'done' });
	});

	it('unchecking the last checked child reopens the parent with a reopened line', async () => {
		const note = await createNote();
		const parent = await createBlock({ noteId: note.id, type: 'todo', content: 'padre', checked: true });
		const child = await createBlock({ noteId: note.id, parentBlockId: parent.id, type: 'todo', content: 'hijo', checked: true });

		await setTaskChecked({ noteId: note.id, blockId: child.id });

		expect((await getBlock(parent.id)).checked).toBe(false);
		expect((await getBlock(child.id)).checked).toBe(false);
		expect((await listActivityByBlock(parent.id)).at(-1)).toMatchObject({ actor: 'user', action: 'reopened' });
	});

	it('returns null and writes nothing for a non-todo target', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'x' });
		const plan = await setTaskChecked({ noteId: note.id, blockId: block.id });
		expect(plan).toBeNull();
		expect(await listActivityByBlock(block.id)).toEqual([]);
	});
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: FAIL — `setTaskChecked` no existe.

- [ ] **Step 3: Implementar en la capa**

En `src/lib/tasks/actions.ts`, agregar el import:

```js
import { planToggleChecked } from '$lib/blocks/cascade';
```

y la función (después de `reopenTask`):

```js
// The UI's check/uncheck door. Applies the editor's cascade (specs/003: the
// toggled value flows down to todo children, ancestors mirror their children)
// writing ONE bitácora line per affected task — done or reopened by its final
// value. Returns the applied plan so the caller can update its in-memory rows,
// or null when the target is not a todo.
export async function setTaskChecked({ noteId, blockId, actor = 'user' }) {
	const noteBlocks = await listBlocksByNote(noteId);
	const plan = planToggleChecked(noteBlocks, blockId);
	if (!plan) return null;
	for (const { id, checked } of plan.updates) {
		await traceWrite({
			blockId: id,
			changes: { checked },
			actor,
			action: checked ? 'done' : 'reopened',
			text: ''
		});
	}
	return plan;
}
```

En `src/lib/tasks/index.ts` agregar `setTaskChecked` a la lista exportada desde `'./actions'`.

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Rutear el editor**

En `src/lib/editor/Editor.svelte`:

1. Agregar import: `import { setTaskChecked } from '$lib/tasks';`
2. Reemplazar `handleToggleChecked` (hoy: `planToggleChecked` + `recordSnapshot` + `applyUpdates`) por:

```js
	async function handleToggleChecked(block) {
		// La capa de tareas aplica la cascada Y deja la bitácora (done/reopened
		// por tarea, actor user). El snapshot de Deshacer sale del estado en
		// memoria — que todavía no mutó — así que tomarlo después del write
		// preserva el mismo undo de antes.
		const plan = await setTaskChecked({ noteId: note.id, blockId: block.id });
		if (!plan) return;
		recordSnapshot();
		for (const update of plan.updates) {
			const { id, ...changes } = update;
			const row = blocks.find((b) => b.id === id);
			if (row) Object.assign(row, changes);
		}
	}
```

3. Si `planToggleChecked` queda sin usos en Editor.svelte (verificar con `grep -n planToggleChecked src/lib/editor/Editor.svelte`), quitarlo del import.

- [ ] **Step 6: Rutear Agenda**

En `src/lib/components/AgendaPanel.svelte`:

1. Quitar `toggleTodoCascade` del import de `'$lib/storage'`; agregar `import { setTaskChecked } from '$lib/tasks';`
2. En `toggleTodo`, reemplazar `await toggleTodoCascade(block.noteId, block.id);` por `await setTaskChecked({ noteId: block.noteId, blockId: block.id });` (el comentario de arriba sigue valiendo; ajustar la mención del nombre).

- [ ] **Step 7: Eliminar `toggleTodoCascade`**

1. `src/lib/storage/blocks.ts`: borrar la función `toggleTodoCascade` completa y el import `planToggleChecked` de `$lib/blocks/cascade`.
2. `src/lib/storage/index.ts`: quitar `toggleTodoCascade` del export (línea ~23).
3. `src/lib/storage/blocks.test.ts`: borrar los tests que la usan y su import (`grep -n toggleTodoCascade src/lib/storage/blocks.test.ts` para ubicarlos — su cobertura de cascada vive ahora en `setTaskChecked`).
4. Confirmar cero referencias: `grep -rn toggleTodoCascade src/` → sin resultados.

- [ ] **Step 8: Suite completa + e2e relacionadas**

Run: `npx vitest run && pnpm test:e2e -- critical-flows.spec.ts dates.spec.ts agent-redo.spec.ts`
Expected: PASS (dates.spec cubre la Agenda; critical-flows cubre el check del editor; agent-redo el ciclo completo).

- [ ] **Step 9: Commit**

```bash
git add src/lib/tasks/ src/lib/editor/Editor.svelte src/lib/components/AgendaPanel.svelte src/lib/storage/blocks.ts src/lib/storage/index.ts src/lib/storage/blocks.test.ts
git commit -m "feat(tasks): completar/reabrir pasa por la capa de tareas con cascada y bitácora"
```

---

### Task 4: `convertToTask` + rutear slash `/todo` y cambio de tipo

**Files:**
- Modify: `src/lib/tasks/actions.ts`, `src/lib/tasks/index.ts`
- Modify: `src/lib/editor/Editor.svelte` (rama `todo` del slash handler ~1546-1553; `setBlockType` ~547)
- Test: `src/lib/tasks/actions.test.ts`

**Interfaces:**
- Consumes: `traceWrite`, `getBlock` (ya en actions.ts).
- Produces: `convertToTask({ blockId, actor = 'user', checked = undefined })` → convierte el bloque a `todo` vía `traceWrite` con acción `created` y `text` = contenido actual; `checked` explícito manda, si se omite se preserva `block.checked ?? false` (paridad con `planBlockType`). Devuelve `{ block, activity }` o `undefined` si el bloque no existe. Exportada desde `$lib/tasks`.

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/tasks/actions.test.ts` (importar `convertToTask`):

```js
describe('convertToTask', () => {
	it('converts a text block to todo with a created line', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'comprar pan' });
		const result = await convertToTask({ blockId: block.id });
		expect(result.block.type).toBe('todo');
		expect(result.block.checked).toBe(false);
		expect(result.activity).toMatchObject({ actor: 'user', action: 'created', text: 'comprar pan' });
	});

	it('returns undefined for a missing block and does not bump', async () => {
		const { agentData } = await import('$lib/bridge/signal.svelte');
		const before = agentData.version;
		expect(await convertToTask({ blockId: 'nope' })).toBeUndefined();
		expect(agentData.version).toBe(before);
	});

	it('preserves an explicit checked (pasted "[x]" first line)', async () => {
		const note = await createNote();
		const block = await createBlock({ noteId: note.id, type: 'text', content: 'hecho' });
		const result = await convertToTask({ blockId: block.id, checked: true });
		expect(result.block.checked).toBe(true);
	});
});
```

Ojo con el segundo test: con la red de seguridad de Task 1, `createBlock`/`updateBlock` bumpean — por eso el test toma `before` DESPUÉS de no crear nada y solo llama `convertToTask` con id inexistente (`getBlock` es lectura → no bumpea).

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: FAIL — `convertToTask` no existe.

- [ ] **Step 3: Implementar**

En `src/lib/tasks/actions.ts` (después de `setTaskChecked`):

```js
// Converting an existing block INTO a todo (slash /todo, type menu, the reused
// first line of a paste). For the agent the task is born here → a 'created'
// line. An explicit `checked` wins (a pasted "[x]" line stays done); omitted,
// the block's previous checked survives — parity with planBlockType.
export async function convertToTask({ blockId, actor = 'user', checked = undefined }) {
	const block = await getBlock(blockId);
	if (!block) return undefined;
	return traceWrite({
		blockId,
		changes: { type: 'todo', checked: checked ?? (block.checked ?? false) },
		actor,
		action: 'created',
		text: block.content ?? ''
	});
}
```

En `src/lib/tasks/index.ts` agregar `convertToTask` al export.

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Rutear el editor**

En `src/lib/editor/Editor.svelte`:

1. Sumar `convertToTask` al import de `'$lib/tasks'`.
2. Rama final del slash handler (hoy termina en `row.type = command.id; ... await updateBlock(row.id, changes);`). Reemplazar ese bloque por:

```js
		row.type = command.id;
		if (command.id === 'code') row.html = row.content;
		if (command.id === 'todo') {
			// La tarea nace acá: la capa escribe el tipo y la línea 'created'.
			row.checked = false;
			await convertToTask({ blockId: row.id, checked: false });
		} else {
			await updateBlock(row.id, { type: command.id, html: row.html });
		}
		focusBlockId = row.id;
		focusCaret = anchor;
```

3. `setBlockType` (usada por headings hoy; la rama todo queda a prueba de futuro):

```js
	async function setBlockType(block, nextType) {
		const changes = planBlockType(block, nextType);
		Object.assign(block, changes);
		if (nextType === 'todo') {
			await convertToTask({ blockId: block.id, checked: changes.checked });
		} else {
			await updateBlock(block.id, changes);
		}
	}
```

- [ ] **Step 6: e2e del slash**

Run: `pnpm test:e2e -- slash.spec.ts critical-flows.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tasks/ src/lib/editor/Editor.svelte
git commit -m "feat(tasks): convertir a tarea pasa por la capa con línea 'created'"
```

---

### Task 5: `createTask` con `order`/`checked` + rutear Enter y pegado

**Files:**
- Modify: `src/lib/tasks/actions.ts` (firma de `createTask`)
- Modify: `src/lib/editor/Editor.svelte` (`handleEnter` ~846-874; `handlePasteLines` ~880-921)
- Test: `src/lib/tasks/actions.test.ts`

**Interfaces:**
- Consumes: `createTask` actual (crea todo + línea `created`, bump incondicional), `convertToTask` de Task 4.
- Produces: `createTask({ noteId, parentBlockId = null, content = '', html = undefined, actor = 'user', order = undefined, checked = false })` — `order` explícito se pasa a `createBlock` (inserción en posición); omitido, apéndice al final como hoy. `checked` viaja a `createBlock`. Retorno igual: `{ block, activity }`.

- [ ] **Step 1: Test que falla**

Agregar al `describe('createTask')` de `src/lib/tasks/actions.test.ts`:

```js
	it('respects an explicit order and checked (editor insertion)', async () => {
		const note = await createNote();
		await createBlock({ noteId: note.id, content: 'primero' });
		const { block } = await createTask({ noteId: note.id, content: 'tarea', order: 0, checked: true });
		expect(block.order).toBe(0);
		expect(block.checked).toBe(true);
	});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: FAIL — `order` llega 1 (apéndice) y `checked` llega false.

- [ ] **Step 3: Implementar**

Nueva firma y resolución de orden en `createTask` (el comentario existente sobre PrematureCommitError se conserva, ajustando la primera línea):

```js
export async function createTask({
	noteId,
	parentBlockId = null,
	content = '',
	html = undefined,
	actor = 'user',
	order = undefined,
	checked = false
}) {
	// Resolve sibling order BEFORE the transaction when the caller didn't pass
	// one (the editor passes plan.order for in-position inserts; the agent
	// omits it → append). createBlock's order inference does chained reads
	// that, wrapped in trackPendingWrite's native promise, escape Dexie's
	// transaction zone and commit it early (PrematureCommitError). Passing
	// order explicitly leaves only direct, single-hop Dexie ops inside the
	// transaction, which is what makes nesting safe here.
	let resolvedOrder = order;
	if (resolvedOrder === undefined) {
		const siblings = await listChildBlocks(noteId, parentBlockId);
		resolvedOrder = siblings.length;
	}
	const result = await db.transaction('rw', db.table('blocks'), db.table('activity'), async () => {
		const block = await createBlock({
			noteId,
			parentBlockId,
			type: 'todo',
			content,
			html: html ?? plainTextToHtml(content),
			order: resolvedOrder,
			checked,
			createdBy: actor
		});
		const activity = await appendActivity({
			blockId: block.id,
			noteId,
			actor,
			action: 'created',
			text: content
		});
		return { block, activity };
	});
	// createTask always inserts a block (createBlock has no missing-block path), so
	// unlike the guarded mutators this bump is unconditional.
	bumpAgentData();
	return result;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Rutear `handleEnter`**

En `src/lib/editor/Editor.svelte`, sumar `createTask` al import de `'$lib/tasks'` y reemplazar el final de `handleEnter` (desde `const plan = planEnter(...)`) por:

```js
		const plan = planEnter(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		const type = forcedType ?? inheritType(block.type);
		let created;
		if (type === 'todo') {
			// Una tarea nueva nace por la capa: bitácora 'created', actor user.
			({ block: created } = await createTask({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				order: plan.order
			}));
		} else {
			created = await createBlock({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				type,
				order: plan.order
			});
		}
		blocks = [...blocks, created];
		focusBlockId = created.id;
```

- [ ] **Step 6: Rutear `handlePasteLines`**

Dos cambios:

1. Primera línea reutilizando el bloque vacío (`if (isEmpty)`): reemplazar el cuerpo por

```js
		if (isEmpty) {
			const first = parsed[0];
			block.type = first.type;
			block.content = first.content;
			block.html = first.html ?? plainTextToHtml(first.content);
			const changes = {
				content: first.content,
				html: first.html ?? plainTextToHtml(first.content)
			};
			if (first.type === 'todo') {
				block.checked = first.checked;
				// Conversión, no creación: primero el contenido (así la línea
				// 'created' lo registra), después el tipo por la capa.
				await updateBlock(block.id, changes);
				await convertToTask({ blockId: block.id, checked: first.checked });
			} else {
				changes.type = first.type;
				await updateBlock(block.id, changes);
			}
			startIndex = 1;
		}
```

2. En el loop, reemplazar el `const created = await createBlock({...})` por:

```js
			const created =
				line.type === 'todo'
					? (
							await createTask({
								noteId: note.id,
								parentBlockId: plan.parentBlockId,
								order: plan.order,
								content: line.content,
								checked: line.checked
							})
						).block
					: await createBlock({
							noteId: note.id,
							parentBlockId: plan.parentBlockId,
							type: line.type,
							order: plan.order,
							content: line.content
						});
```

- [ ] **Step 7: Suite + e2e de flujo**

Run: `npx vitest run && pnpm test:e2e -- critical-flows.spec.ts move-blocks.spec.ts formatting-undo.spec.ts`
Expected: PASS (critical-flows cubre Enter/pegado; formatting-undo confirma que Deshacer sigue intacto).

- [ ] **Step 8: Commit**

```bash
git add src/lib/tasks/actions.ts src/lib/tasks/actions.test.ts src/lib/editor/Editor.svelte
git commit -m "feat(tasks): crear tareas desde Enter y pegado pasa por la capa (order/checked)"
```

---

### Task 6: Copy del feed (voseo), e2e nueva y guía de uso

Con la puerta única, las acciones del usuario aparecen en el feed de Configuración → Agentes, que hoy arma "Vos marcó hecha" (no conjuga; ya pasaba con "Vos dejó una nota" del canal Rehacer). Arreglo mínimo + e2e que prueba el flujo entero + guía.

**Files:**
- Modify: `src/lib/components/SettingsDialog.svelte` (~líneas 78-90 y ~197)
- Modify: `e2e/agent-redo.spec.ts` (solo el comentario stale de las líneas 4-6)
- Create: `e2e/user-task-activity.spec.ts`
- Modify: `docs/guia/17-agentes.md`, `docs/guia-de-uso.md` (fecha del índice)

**Interfaces:**
- Consumes: feed existente (`listRecentActivity(20)`, render `{actorLabel(entry.actor)} {ACTION_LABEL[...]}`); acciones de bitácora `created|done|reopened|note|edited`.
- Produces: `actionLabel(entry)` — conjuga según actor. Ningún cambio de datos.

- [ ] **Step 1: e2e que falla**

Crear `e2e/user-task-activity.spec.ts`:

```js
import { test, expect } from '@playwright/test';

// Puerta única: marcar una tarea en el editor pasa por la capa de tareas, que
// deja una línea de bitácora con actor user — visible en Configuración →
// Agentes con el verbo conjugado para "Vos". Seed por IndexedDB nativo
// (mismo patrón que agent-redo.spec: sin imports de la app, la app ya creó la DB).
async function seedTodoNote(page, { noteId, blockId }) {
	await page.evaluate(
		({ noteId, blockId }) =>
			new Promise((resolve, reject) => {
				const open = indexedDB.open('copynotes');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const now = new Date().toISOString();
					const tx = db.transaction(['notes', 'blocks'], 'readwrite');
					tx.objectStore('notes').put({
						id: noteId,
						title: 'Nota con tarea',
						agentVisible: true,
						sortOrder: -1,
						folderId: null,
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					tx.objectStore('blocks').put({
						id: blockId,
						noteId,
						parentBlockId: null,
						type: 'todo',
						content: 'Tarea pendiente',
						html: 'Tarea pendiente',
						order: 0,
						collapsed: false,
						codeCollapsed: false,
						checked: false,
						note: '',
						dueDate: null,
						createdBy: 'user',
						createdAt: now,
						updatedAt: now,
						deletedAt: null
					});
					tx.oncomplete = () => {
						db.close();
						resolve(null);
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
		{ noteId, blockId }
	);
}

test('checking a task in the editor leaves a user done line in the activity feed', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByLabel('Título de la nota')).toBeVisible();

	await seedTodoNote(page, { noteId: 'e2e-user-note', blockId: 'e2e-user-block' });

	await page.reload();
	await expect(page.getByLabel('Título de la nota')).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Lista de notas' })
		.getByRole('button', { name: 'Nota con tarea', exact: true })
		.click();

	const checkbox = page.locator('[role="checkbox"]').first();
	await expect(checkbox).toHaveAttribute('aria-checked', 'false');
	await checkbox.click();
	await expect(checkbox).toHaveAttribute('aria-checked', 'true');

	await page.getByRole('button', { name: 'Configuración' }).click();
	// El feed conjuga para el actor user: "Vos marcaste hecha".
	await expect(page.getByText('marcaste hecha')).toBeVisible();
});
```

- [ ] **Step 2: Verificar que falla**

Run: `pnpm test:e2e -- user-task-activity.spec.ts`
Expected: FAIL en el último assert si las Tasks 1-5 están bien ("marcó hecha" sin conjugar aparece, "marcaste hecha" no). Si falla ANTES del último assert, hay una regresión de las tasks previas — investigar antes de seguir.

- [ ] **Step 3: Conjugar el feed**

En `src/lib/components/SettingsDialog.svelte`, debajo de `ACTION_LABEL` agregar:

```js
	// Con la puerta única las acciones del usuario también entran al feed;
	// "Vos marcó hecha" no conjuga, así que el actor user tiene su propia tabla.
	const ACTION_LABEL_USER = {
		created: 'creaste una tarea',
		done: 'marcaste hecha',
		reopened: 'reabriste',
		note: 'dejaste una nota',
		edited: 'editaste'
	};
	function actionLabel(entry) {
		const labels = entry.actor === 'user' ? ACTION_LABEL_USER : ACTION_LABEL;
		return labels[entry.action] ?? entry.action;
	}
```

y en el template reemplazar `{ACTION_LABEL[entry.action] ?? entry.action}` por `{actionLabel(entry)}`.

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm test:e2e -- user-task-activity.spec.ts agent-redo.spec.ts agent-activity.spec.ts`
Expected: PASS 3 specs (agent-redo confirma que el feed del agente no cambió).

- [ ] **Step 5: Comentario stale + guía**

1. `e2e/agent-redo.spec.ts` líneas 4-6: el paréntesis "(the editor checkbox never calls the task-action layer, and the bridge is desktop-only)" quedó falso. Reemplazar por "(a user checkbox now logs actor `user`, and the bridge is desktop-only)".
2. `docs/guia/17-agentes.md`: agregar al tema (en español simple, sin jerga) que (a) la lista que ve el asistente se actualiza sola ante cualquier cambio — completar, crear, borrar o escribir una tarea, borrar una nota, cambiar un título — con una pequeña espera de medio segundo; y (b) tus propias acciones (marcar hecha, reabrir, crear una tarea) quedan anotadas en la actividad de Configuración → Agentes como "Vos…", así el asistente sabe qué hiciste vos y qué hizo él.
3. `docs/guia-de-uso.md`: "Última actualización" → 2026-07-24 (si no lo está ya).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SettingsDialog.svelte e2e/user-task-activity.spec.ts e2e/agent-redo.spec.ts docs/guia/17-agentes.md docs/guia-de-uso.md
git commit -m "feat(agentes): feed conjugado para acciones del usuario + e2e y guía de puerta única"
```

---

### Task 7: Verificación integral

**Files:** ninguno (solo correr y, si algo falla, arreglar en la task que corresponda).

- [ ] **Step 1: Unit completa**

Run: `npx vitest run`
Expected: PASS, 0 fallos (≈653 previos + ~13 nuevos).

- [ ] **Step 2: Tipos**

Run: `pnpm check`
Expected: SOLO los 2 errores pre-existentes de `db.migrations.test.ts`. Cualquier otro es de esta rama — arreglarlo.

- [ ] **Step 3: e2e completa**

Run: `pnpm test:e2e`
Expected: PASS. Nota conocida: `critical-flows:180` tuvo historial flaky — un fallo ahí se reintenta una vez antes de investigar.

- [ ] **Step 4: mcp**

Run: `cd mcp && npx vitest run && cd ..`
Expected: PASS 34 (el paquete mcp no se tocó; confirma que el contrato del buzón sigue intacto).

- [ ] **Step 5: Revisión final de rama**

Usar superpowers:requesting-code-review sobre `main..HEAD` antes de ofrecer merge. El merge y push los decide Hernán (main deploya a Vercel).

---

## Self-review notes (hechas al escribir el plan)

- Spec cubierta: red de seguridad (T1), debounce (T2), setTaskChecked+Agenda+borrar toggleTodoCascade (T3), convertToTask+slash+setBlockType (T4), createTask order/checked+Enter+pegado incl. borde de primera línea (T5), e2e+guía (T6). Journal replay: verificado que usa los repos → cubierto por T1.
- El copy del voseo (T6) no estaba en la spec: consecuencia directa de que las acciones user entran al feed ("Vos marcó hecha" ya era visible vía Rehacer). Alcance mínimo: una tabla + una función.
- Deshacer: `recordSnapshot` snapshotea el estado EN MEMORIA (verificado en Editor.svelte), por eso en T3 puede ir después del write a DB sin romper undo.
