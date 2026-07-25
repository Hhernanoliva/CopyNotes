# Canal agente v2 — lectura Markdown, permisos y privacidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El agente MCP lee cada nota 🤖 como Markdown proyectado (~211 tok vs ~2.772 hoy): título + carpeta + texto de contexto + tareas pendientes con id corto; bitácora bajo demanda; y sus anotaciones de bitácora se muestran al usuario inline en amarillo con badge "IA".

**Architecture:** El export (`src/lib/bridge/export.ts`) pasa a versión 2: bloques en orden de árbol (prosa + tareas pendientes, sin comentarios, sin completadas) + nombre de carpeta. El server MCP proyecta ese export a Markdown (`mcp/lib/resources.js`), genera ids cortos y los re-expande al recibir tool calls (`mcp/lib/ids.js`). La escritura no cambia de protocolo (mismas 3 tools + una nueva de historial). La UI muestra las notas de bitácora del agente bajo la tarea.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Dexie/IndexedDB, Vitest, MCP SDK (`@modelcontextprotocol/sdk`), Node puro en `mcp/`.

**Spec:** `docs/superpowers/specs/2026-07-25-canal-agente-v2-lectura-md-permisos-design.md` (leerla antes de empezar).

## Global Constraints

- Código de mano en JavaScript plano dentro de `.ts`/`.svelte`/`.js` — **sin anotaciones de tipos** (regla del proyecto).
- Textos de UI y mensajes al agente en **español**.
- TDD estricto: test que falla → implementación mínima → verde → commit.
- Nada de colores crudos en la UI: tokens/vars CSS siguiendo la convención shadcn (CLAUDE.md del proyecto).
- Comentarios (`block.note`) **jamás** entran al export. Notas sin 🤖 no aportan **nada**.
- Tests de la app: `pnpm test` (o focalizado `pnpm vitest --run <path>`). Tests de mcp: `cd mcp && pnpm test`.
- **Antes de tocar `mcp/`:** `cd mcp && pnpm install` (quedó instalado `--prod`, sin vitest).
- Commits en español, convención `feat(...)`/`docs(...)` como el historial de la rama.

---

### Task 1: `flattenTree` — orden de árbol completo en `hierarchy.ts`

El export necesita los bloques en orden de documento (padres antes que hijos, hermanos por `order`), **incluyendo** hijos de bloques colapsados (colapsado ≠ privado). `buildVisibleList` existente salta colapsados, así que no sirve; se agrega `flattenTree` reutilizando `childrenByParent`.

**Files:**
- Modify: `src/lib/blocks/hierarchy.ts`
- Test: `src/lib/blocks/hierarchy.test.ts` (existe; agregar describe)

**Interfaces:**
- Produces: `flattenTree(blocks)` → `[{ block, depth }]` en orden de documento, sin saltar colapsados.

- [ ] **Step 1: Test que falla**

En `src/lib/blocks/hierarchy.test.ts` agregar:

```js
import { flattenTree } from './hierarchy';

describe('flattenTree', () => {
	it('devuelve padres antes que hijos, hermanos por order, sin saltar colapsados', () => {
		const blocks = [
			{ id: 'b', parentBlockId: null, order: 1, collapsed: false },
			{ id: 'a', parentBlockId: null, order: 0, collapsed: true },
			{ id: 'a1', parentBlockId: 'a', order: 0, collapsed: false },
			{ id: 'a2', parentBlockId: 'a', order: 1, collapsed: false }
		];
		const flat = flattenTree(blocks);
		expect(flat.map(({ block }) => block.id)).toEqual(['a', 'a1', 'a2', 'b']);
		expect(flat.map(({ depth }) => depth)).toEqual([0, 1, 1, 0]);
	});
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `pnpm vitest --run src/lib/blocks/hierarchy.test.ts`
Expected: FAIL — `flattenTree` no exportada.

- [ ] **Step 3: Implementación mínima**

En `src/lib/blocks/hierarchy.ts` (debajo de `buildVisibleList`):

```js
// Orden de documento COMPLETO (para el export al agente): igual que
// buildVisibleList pero sin saltar descendientes de bloques colapsados —
// colapsar es presentación, no privacidad.
export function flattenTree(blocks) {
	const byParent = childrenByParent(blocks);
	const flat = [];
	function walk(parentId, depth) {
		for (const block of byParent.get(parentId) ?? []) {
			flat.push({ block, depth });
			walk(block.id, depth + 1);
		}
	}
	walk(null, 0);
	return flat;
}
```

- [ ] **Step 4: Verde**

Run: `pnpm vitest --run src/lib/blocks/hierarchy.test.ts`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/hierarchy.ts src/lib/blocks/hierarchy.test.ts
git commit -m "feat(bloques): flattenTree — orden de documento sin saltar colapsados"
```

---

### Task 2: Export v2 — prosa + carpeta + filtros de privacidad

`toAgentPayload` pasa de `tasks` (solo todos) a `blocks` (prosa + tareas pendientes, orden de árbol) + `folder`. Filtros: notas sin 🤖 nada; tareas completadas fuera; `separator` fuera; prosa vacía fuera; `block.note` (comentario) y `html` jamás se copian. Versión 1 → 2.

**Files:**
- Modify: `src/lib/bridge/export.ts`
- Test: `src/lib/bridge/export.test.ts` (reescribir los tests que asumen `tasks`)

**Interfaces:**
- Consumes: `flattenTree(blocks)` de Task 1; `listFolders('note')` de `$lib/storage` (filas `{ id, name }`).
- Produces: payload `{ format: 'copynotes.agent', version: 2, notes: [{ id, title, folder, blocks }] }` donde cada entrada de `blocks` es:
  - todo pendiente → `{ id, type: 'todo', content, depth, createdBy, activity }`
  - contexto (`text`/`bullet`/`heading1..3`/`code`) → `{ id, type, content, depth }`
- `toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById = {})` — firma nueva (4.º arg).

- [ ] **Step 1: Tests que fallan**

Reemplazar el describe `toAgentPayload` en `src/lib/bridge/export.test.ts` por:

```js
describe('toAgentPayload v2 (proyección + gate de privacidad)', () => {
	it('nota sin 🤖 no aporta NADA (ni título, ni prosa, ni tareas)', () => {
		const notes = [
			{ id: 'n1', title: 'Visible', agentVisible: true, folderId: null },
			{ id: 'n2', title: 'Privada', agentVisible: false, folderId: null }
		];
		const blocksByNote = {
			n1: [{ id: 'b1', parentBlockId: null, order: 0, type: 'todo', content: 'hacer', checked: false, createdBy: 'user', note: '' }],
			n2: [{ id: 'b2', parentBlockId: null, order: 0, type: 'text', content: 'secreto', checked: false, createdBy: 'user', note: '' }]
		};
		const payload = toAgentPayload(notes, blocksByNote, {}, {});
		expect(payload.version).toBe(2);
		expect(payload.notes.map((n) => n.id)).toEqual(['n1']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('incluye prosa como contexto y tareas pendientes, en orden de árbol, con depth', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: 'f1' }];
		const blocksByNote = {
			n1: [
				{ id: 'p1', parentBlockId: null, order: 0, type: 'text', content: 'contexto', checked: false, createdBy: 'user', note: '' },
				{ id: 't1', parentBlockId: null, order: 1, type: 'todo', content: 'pendiente', checked: false, createdBy: 'agent-uuid', note: '' },
				{ id: 't1a', parentBlockId: 't1', order: 0, type: 'todo', content: 'subtarea', checked: false, createdBy: 'user', note: '' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { t1: [{ action: 'created' }] }, { f1: 'Trabajo' });
		const note = payload.notes[0];
		expect(note.folder).toBe('Trabajo');
		expect(note.blocks.map((b) => b.id)).toEqual(['p1', 't1', 't1a']);
		expect(note.blocks.map((b) => b.depth)).toEqual([0, 0, 1]);
		expect(note.blocks[1].createdBy).toBe('agent-uuid');
		expect(note.blocks[1].activity).toEqual([{ action: 'created' }]);
		expect(note.blocks[0].activity).toBeUndefined();
	});

	it('excluye completadas, separadores, prosa vacía; comentario y html JAMÁS viajan', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: null }];
		const blocksByNote = {
			n1: [
				{ id: 'done', parentBlockId: null, order: 0, type: 'todo', content: 'hecha', checked: true, createdBy: 'user', note: '' },
				{ id: 'sep', parentBlockId: null, order: 1, type: 'separator', content: '', checked: false, createdBy: 'user', note: '' },
				{ id: 'empty', parentBlockId: null, order: 2, type: 'text', content: '   ', checked: false, createdBy: 'user', note: '' },
				{ id: 'ok', parentBlockId: null, order: 3, type: 'todo', content: 'pendiente', checked: false, createdBy: 'user', html: '<b>pendiente</b>', note: 'comentario privado' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { ok: [] }, {});
		expect(payload.notes[0].blocks.map((b) => b.id)).toEqual(['ok']);
		expect(payload.notes[0].folder).toBeNull();
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('comentario privado');
		expect(flat).not.toContain('hecha');
		expect(flat).not.toContain('<b>');
	});
});
```

En el describe de `buildAgentExport` (entry point con storage) agregar al final:

```js
	it('trae el nombre de la carpeta de la nota y nunca el comentario de un bloque', async () => {
		const folder = await createFolder('note', 'Trabajo');
		const note = await createNote({ title: 'Con carpeta' });
		await updateNote(note.id, { agentVisible: true, folderId: folder.id });
		await createBlock({ noteId: note.id, type: 'todo', content: 'tarea', note: 'privadísimo' });

		const payload = await buildAgentExport();
		const exported = payload.notes.find((n) => n.id === note.id);
		expect(exported.folder).toBe('Trabajo');
		expect(JSON.stringify(payload)).not.toContain('privadísimo');
	});
```

(Importar `createFolder` desde `$lib/storage` en la cabecera del test. Si `createBlock` no acepta `note`, revisar la firma en `src/lib/storage/blocks.ts` — sí lo acepta, default `''`.)

- [ ] **Step 2: Correr y ver el fallo**

Run: `pnpm vitest --run src/lib/bridge/export.test.ts`
Expected: FAIL — el payload actual tiene `tasks`, versión 1, sin `folder`.

- [ ] **Step 3: Implementación**

Reescribir `src/lib/bridge/export.ts`:

```js
// The export boundary is the privacy gate: notes whose agentVisible is not true
// MUST NOT leave the app through the bridge. v2: the agent sees each visible
// note's PROSE as context plus its PENDING tasks, in document (tree) order.
// A block's comment (`note` field) and completed tasks are physically
// discarded here — they never leave the app, no matter what the server does.

import { listNotes, listBlocksByNote, listActivityByBlock, listFolders } from '$lib/storage';
import { flattenTree } from '$lib/blocks/hierarchy';

export const AGENT_EXPORT_FORMAT = 'copynotes.agent';
export const AGENT_EXPORT_VERSION = 2;

const CONTEXT_TYPES = new Set(['text', 'bullet', 'heading1', 'heading2', 'heading3', 'code']);

function includeBlock(block) {
	if (block.type === 'todo') return block.checked !== true;
	if (!CONTEXT_TYPES.has(block.type)) return false;
	return (block.content ?? '').trim() !== '';
}

// Copies ONLY the allow-listed fields. `note` (the user's comment) and `html`
// are never read here — that omission is the second lock for comments.
function projectBlock(block, depth, activity) {
	if (block.type === 'todo') {
		return {
			id: block.id,
			type: 'todo',
			content: block.content,
			depth,
			createdBy: block.createdBy ?? 'user',
			activity: activity ?? []
		};
	}
	return { id: block.id, type: block.type, content: block.content, depth };
}

export function toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById = {}) {
	const visible = notes.filter((note) => note.agentVisible === true);
	return {
		format: AGENT_EXPORT_FORMAT,
		version: AGENT_EXPORT_VERSION,
		notes: visible.map((note) => ({
			id: note.id,
			title: note.title,
			folder: folderNamesById[note.folderId] ?? null,
			blocks: flattenTree(blocksByNote[note.id] ?? [])
				.filter(({ block }) => includeBlock(block))
				.map(({ block, depth }) =>
					projectBlock(block, depth, block.type === 'todo' ? activityByBlock[block.id] : undefined)
				)
		}))
	};
}

export async function buildAgentExport() {
	const notes = (await listNotes()).filter((note) => note.agentVisible === true);
	const folderNamesById = {};
	for (const folder of await listFolders('note')) folderNamesById[folder.id] = folder.name;
	const blocksByNote = {};
	const activityByBlock = {};
	for (const note of notes) {
		const blocks = await listBlocksByNote(note.id);
		blocksByNote[note.id] = blocks;
		for (const block of blocks) {
			if (block.type === 'todo' && block.checked !== true)
				activityByBlock[block.id] = await listActivityByBlock(block.id);
		}
	}
	return { ...toAgentPayload(notes, blocksByNote, activityByBlock, folderNamesById), exportedAt: new Date().toISOString() };
}
```

Nota: `projectBlock` mantiene `activity` en el export (el archivo local no cuesta tokens); la proyección Markdown del server (Task 4) es la que NO la muestra — queda disponible para la tool de historial (Task 5).

- [ ] **Step 4: Verde + suite entera de la app**

Run: `pnpm vitest --run src/lib/bridge/export.test.ts` → PASS.
Run: `pnpm test` → Expected: PASS. Si algo más consumía la forma `tasks` del payload (buscar con `grep -rn "\.tasks" src/lib/bridge src/lib/components`), ajustarlo aquí mismo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bridge/export.ts src/lib/bridge/export.test.ts
git commit -m "feat(bridge): export v2 — prosa como contexto, carpeta, solo tareas pendientes; comentarios jamás viajan"
```

---

### Task 3: `mcp/lib/ids.js` — ids cortos y re-expansión

Ids cortos por export (prefijo de 8, alargado si colisiona) y expansión prefijo→UUID para las tool calls. Puro, sin fs.

**Files:**
- Create: `mcp/lib/ids.js`
- Test: `mcp/lib/ids.test.js`

**Interfaces:**
- Consumes: payload v2 de Task 2 (`notes[].blocks[]`).
- Produces:
  - `SHORT_ID_LENGTH = 8`
  - `buildShortIds(exportPayload)` → `Map` UUID→id corto (tareas y notas, únicos dentro del export; ante colisión de prefijo se alarga de a 4 chars).
  - `expandId(exportPayload, shortOrFullId)` → `{ ok: true, id }` | `{ ok: false, reason: 'no-encontrado' | 'ambiguo' }`. Matchea por prefijo sobre ids de notas y de bloques todo; un UUID completo matchea consigo mismo.

- [ ] **Step 0: Entorno**

Run: `cd mcp && pnpm install` (repone vitest, quitado por el install `--prod` del empaquetado).

- [ ] **Step 1: Tests que fallan**

`mcp/lib/ids.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SHORT_ID_LENGTH, buildShortIds, expandId } from './ids.js';

const payload = {
	notes: [
		{
			id: 'aaaaaaaa-1111-4111-8111-111111111111',
			title: 'N',
			folder: null,
			blocks: [
				{ id: 'bbbbbbbb-2222-4222-8222-222222222222', type: 'todo', content: 't1', depth: 0, createdBy: 'user', activity: [] },
				{ id: 'cccccccc-3333-4333-8333-333333333333', type: 'text', content: 'prosa', depth: 0 }
			]
		}
	]
};

describe('buildShortIds', () => {
	it('acorta a 8 chars notas y tareas (la prosa no necesita id corto)', () => {
		const map = buildShortIds(payload);
		expect(map.get('aaaaaaaa-1111-4111-8111-111111111111')).toBe('aaaaaaaa');
		expect(map.get('bbbbbbbb-2222-4222-8222-222222222222')).toBe('bbbbbbbb');
		expect(map.has('cccccccc-3333-4333-8333-333333333333')).toBe(false);
	});

	it('alarga ante colisión de prefijo', () => {
		const clash = {
			notes: [
				{
					id: 'n1',
					blocks: [
						{ id: 'aaaaaaaa-1111-4111-8111-111111111111', type: 'todo', content: 'a', depth: 0, createdBy: 'user', activity: [] },
						{ id: 'aaaaaaaa-9999-4999-8999-999999999999', type: 'todo', content: 'b', depth: 0, createdBy: 'user', activity: [] }
					]
				}
			]
		};
		const map = buildShortIds(clash);
		const shorts = [...map.values()].filter((s) => s.startsWith('aaaaaaaa'));
		expect(new Set(shorts).size).toBe(shorts.length);
		expect(shorts.every((s) => s.length > SHORT_ID_LENGTH)).toBe(true);
	});
});

describe('expandId', () => {
	it('expande un prefijo único a su UUID', () => {
		expect(expandId(payload, 'bbbbbbbb')).toEqual({ ok: true, id: 'bbbbbbbb-2222-4222-8222-222222222222' });
	});
	it('un UUID completo pasa tal cual', () => {
		expect(expandId(payload, 'aaaaaaaa-1111-4111-8111-111111111111')).toEqual({
			ok: true,
			id: 'aaaaaaaa-1111-4111-8111-111111111111'
		});
	});
	it('sin match → no-encontrado; múltiples → ambiguo', () => {
		expect(expandId(payload, 'zzzz')).toEqual({ ok: false, reason: 'no-encontrado' });
		const clash = {
			notes: [
				{
					id: 'n1',
					blocks: [
						{ id: 'dddddddd-1', type: 'todo', content: 'a', depth: 0, createdBy: 'user', activity: [] },
						{ id: 'dddddddd-2', type: 'todo', content: 'b', depth: 0, createdBy: 'user', activity: [] }
					]
				}
			]
		};
		expect(expandId(clash, 'dddddddd')).toEqual({ ok: false, reason: 'ambiguo' });
	});
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd mcp && pnpm test -- ids`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementación**

`mcp/lib/ids.js`:

```js
// Short-id layer: agents read 8-char ids (cheap in tokens) and the server
// re-expands them to real UUIDs before submitting a change. Pure — the
// export payload itself is the mapping table, nothing is stored.

export const SHORT_ID_LENGTH = 8;

// Every id an agent may act on: note ids (create_task) and pending-task ids
// (complete_task / add_note / historial). Prose blocks are context only.
function actionableIds(exportPayload) {
	const ids = [];
	for (const note of exportPayload?.notes ?? []) {
		ids.push(note.id);
		for (const block of note.blocks ?? []) {
			if (block.type === 'todo') ids.push(block.id);
		}
	}
	return ids;
}

export function buildShortIds(exportPayload) {
	const ids = actionableIds(exportPayload);
	const map = new Map();
	for (const id of ids) {
		let len = SHORT_ID_LENGTH;
		let short = id.slice(0, len);
		// lengthen until the prefix is unique among ALL actionable ids
		while (ids.some((other) => other !== id && other.startsWith(short))) {
			len += 4;
			short = id.slice(0, len);
		}
		map.set(id, short);
	}
	return map;
}

export function expandId(exportPayload, shortOrFullId) {
	const matches = actionableIds(exportPayload).filter(
		(id) => id === shortOrFullId || id.startsWith(shortOrFullId)
	);
	const exact = matches.find((id) => id === shortOrFullId);
	if (exact) return { ok: true, id: exact };
	if (matches.length === 1) return { ok: true, id: matches[0] };
	return { ok: false, reason: matches.length === 0 ? 'no-encontrado' : 'ambiguo' };
}
```

- [ ] **Step 4: Verde**

Run: `cd mcp && pnpm test -- ids` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/ids.js mcp/lib/ids.test.js
git commit -m "feat(mcp): ids cortos por export y re-expansión prefijo→UUID"
```

---

### Task 4: Proyección Markdown en `mcp/lib/resources.js`

La lectura de una nota deja de ser JSON: Markdown en orden de documento. Sin bitácora, sin timestamps, sin UUIDs largos; las notas de bitácora del agente no aparecen (no están en el Markdown en absoluto — test explícito).

**Files:**
- Modify: `mcp/lib/resources.js` (reescribir), `mcp/server.js` (mimeType + texto)
- Test: `mcp/lib/resources.test.js` (reescribir)

**Interfaces:**
- Consumes: payload v2; `buildShortIds` de Task 3.
- Produces:
  - `notesToResources(exportPayload)` → igual que hoy pero `mimeType: 'text/markdown'`.
  - `noteToMarkdown(note, shortIds)` → string Markdown:
    - Cabecera: `## {título}` o `## {título}  ·  {carpeta}` si hay carpeta.
    - Bloques en orden: `text` → párrafo; `bullet` → `- texto` (sangría 2 espacios × depth); `heading1..3` → `#`/`##`/`###` + texto; `code` → fence ```; `todo` → `- [ ] {idCorto} {texto}` (sangría 2 espacios × depth).
  - `ACTIVITY_TAIL_LENGTH` se elimina (la bitácora ya no se proyecta aquí; el tail vive en Task 5).

- [ ] **Step 1: Tests que fallan**

Reescribir `mcp/lib/resources.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { notesToResources, noteToMarkdown } from './resources.js';
import { buildShortIds } from './ids.js';

const note = {
	id: 'aaaaaaaa-1111-4111-8111-111111111111',
	title: 'Proyecto X',
	folder: 'Trabajo',
	blocks: [
		{ id: 'h1', type: 'heading2', content: 'Contexto', depth: 0 },
		{ id: 'p1', type: 'text', content: 'Cliente quiere demo el viernes.', depth: 0 },
		{ id: 'c1', type: 'code', content: 'npm run build', depth: 0 },
		{
			id: 'bbbbbbbb-2222-4222-8222-222222222222',
			type: 'todo',
			content: 'Armar demo',
			depth: 0,
			createdBy: 'user',
			activity: [{ actor: 'user', action: 'note', text: 'secreto de bitácora', at: '2026-07-25T00:00:00Z' }]
		},
		{ id: 'dddddddd-4444-4444-8444-444444444444', type: 'todo', content: 'Subtarea', depth: 1, createdBy: 'agente-uuid', activity: [] }
	]
};
const payload = { notes: [note] };

describe('notesToResources', () => {
	it('una entrada por nota, mimeType markdown', () => {
		const resources = notesToResources(payload);
		expect(resources).toEqual([
			{ uri: 'copynotes://note/aaaaaaaa-1111-4111-8111-111111111111', name: 'Proyecto X', mimeType: 'text/markdown' }
		]);
	});
});

describe('noteToMarkdown', () => {
	it('proyecta cabecera con carpeta, contexto y tareas con id corto e indentación', () => {
		const md = noteToMarkdown(note, buildShortIds(payload));
		expect(md).toBe(
			[
				'## Proyecto X  ·  Trabajo',
				'',
				'## Contexto',
				'',
				'Cliente quiere demo el viernes.',
				'',
				'```',
				'npm run build',
				'```',
				'',
				'- [ ] bbbbbbbb Armar demo',
				'  - [ ] dddddddd Subtarea'
			].join('\n')
		);
	});

	it('sin carpeta la cabecera es solo el título', () => {
		const md = noteToMarkdown({ ...note, folder: null, blocks: [] }, new Map());
		expect(md).toBe('## Proyecto X');
	});

	it('NO filtra bitácora ni UUIDs largos ni timestamps', () => {
		const md = noteToMarkdown(note, buildShortIds(payload));
		expect(md).not.toContain('secreto de bitácora');
		expect(md).not.toContain('aaaaaaaa-1111');
		expect(md).not.toContain('2026-07-25T');
	});
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd mcp && pnpm test -- resources`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Reescribir `mcp/lib/resources.js`:

```js
// Pure mappers: export payload v2 → what an agent reads. Markdown, not JSON:
// measured on real data it's ~28% cheaper in chars and more in real tokens
// (no \" \n escaping). Read-only projection — tool calls stay structured.
// The bitácora is NOT projected here at all: it's on-demand via the
// get_task_history tool (see server.js), the single biggest token save.

const HEADING_MARKS = { heading1: '#', heading2: '##', heading3: '###' };

export function notesToResources(exportPayload) {
	const notes = exportPayload?.notes ?? [];
	return notes.map((note) => ({
		uri: `copynotes://note/${note.id}`,
		name: note.title ?? '',
		mimeType: 'text/markdown'
	}));
}

function blockToMarkdown(block, shortIds) {
	const indent = '  '.repeat(block.depth ?? 0);
	if (block.type === 'todo') return `${indent}- [ ] ${shortIds.get(block.id) ?? block.id} ${block.content}`;
	if (block.type === 'bullet') return `${indent}- ${block.content}`;
	if (block.type === 'code') return '```\n' + block.content + '\n```';
	if (HEADING_MARKS[block.type]) return `${HEADING_MARKS[block.type]} ${block.content}`;
	return block.content; // text
}

export function noteToMarkdown(note, shortIds) {
	const header = note.folder ? `## ${note.title}  ·  ${note.folder}` : `## ${note.title}`;
	const lines = [header];
	let previousWasTodo = false;
	for (const block of note?.blocks ?? []) {
		const isTodo = block.type === 'todo';
		// blank line between prose chunks; consecutive todos stay together
		if (!(previousWasTodo && isTodo)) lines.push('');
		lines.push(blockToMarkdown(block, shortIds));
		previousWasTodo = isTodo;
	}
	return lines.join('\n');
}
```

En `mcp/server.js`, reemplazar el import de resources y el callback de lectura:

```js
import { notesToResources, noteToMarkdown } from './lib/resources.js';
import { buildShortIds, expandId } from './lib/ids.js';
```

y el cuerpo del read callback del recurso:

```js
	async (uri, variables) => {
		const id = variables.id;
		const exp = await readExport();
		const note = (exp.notes ?? []).find((n) => n.id === id);
		if (!note) return { contents: [] };
		return {
			contents: [{ uri: uri.href, mimeType: 'text/markdown', text: noteToMarkdown(note, buildShortIds(exp)) }]
		};
	}
```

(La descripción del recurso se actualiza a: `'Cada nota visible para agentes, proyectada como Markdown: contexto + tareas pendientes con id corto.'`)

- [ ] **Step 4: Verde + suite mcp entera**

Run: `cd mcp && pnpm test` → Expected: PASS (los tests viejos de `ACTIVITY_TAIL_LENGTH`/`noteToResourceContent` fueron reemplazados en Step 1; si `mailbox.test.js` o `tools.test.js` referencian la forma vieja, ajustarlos).

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/resources.js mcp/lib/resources.test.js mcp/server.js
git commit -m "feat(mcp): lectura de notas en Markdown proyectado con ids cortos"
```

---

### Task 5: Tools — expansión de ids + `get_task_history`

Las 3 tools aceptan ids cortos (el server los expande antes de armar el change). Tool nueva `get_task_history`: bitácora bajo demanda, texto compacto, sin UUIDs ni timestamps.

**Files:**
- Modify: `mcp/lib/tools.js`, `mcp/server.js`
- Test: `mcp/lib/tools.test.js`

**Interfaces:**
- Consumes: `expandId(exportPayload, id)` de Task 3; payload v2.
- Produces:
  - `expandArgs(exportPayload, args)` → `{ ok: true, args }` con `noteId`/`blockId` expandidos, o `{ ok: false, reason }`.
  - `historyResult(exportPayload, blockId)` → CallToolResult con la bitácora de esa tarea como líneas `- {rol} {verbo}: {texto}` (rol: `usuario` si `actor === 'user'`, si no `agente`; verbos: `created`→`creó`, `done`→`completó`, `reopened`→`reabrió`, `note`→`anotó`; entradas más viejas primero; últimas 10).
  - Tool MCP `get_task_history` con input `{ blockId: z.string() }`.

- [ ] **Step 1: Tests que fallan**

Agregar a `mcp/lib/tools.test.js`:

```js
import { expandArgs, historyResult } from './tools.js';

const payload = {
	notes: [
		{
			id: 'aaaaaaaa-1111-4111-8111-111111111111',
			blocks: [
				{
					id: 'bbbbbbbb-2222-4222-8222-222222222222',
					type: 'todo',
					content: 't',
					depth: 0,
					createdBy: 'user',
					activity: [
						{ actor: 'user', action: 'created', text: 'Armar demo', at: '2026-07-24T00:00:00Z' },
						{ actor: 'agente-uuid', action: 'note', text: 'Empiezo por el build', at: '2026-07-25T00:00:00Z' }
					]
				}
			]
		}
	]
};

describe('expandArgs', () => {
	it('expande noteId y blockId cortos', () => {
		const res = expandArgs(payload, { noteId: 'aaaaaaaa', blockId: 'bbbbbbbb', content: 'x' });
		expect(res).toEqual({
			ok: true,
			args: {
				noteId: 'aaaaaaaa-1111-4111-8111-111111111111',
				blockId: 'bbbbbbbb-2222-4222-8222-222222222222',
				content: 'x'
			}
		});
	});
	it('id inexistente → error con reason', () => {
		expect(expandArgs(payload, { blockId: 'zzzz' })).toEqual({ ok: false, reason: 'no-encontrado' });
	});
	it('args sin ids pasan intactos', () => {
		expect(expandArgs(payload, { content: 'x' })).toEqual({ ok: true, args: { content: 'x' } });
	});
});

describe('historyResult', () => {
	it('devuelve la bitácora compacta, viejas primero, sin UUIDs ni timestamps', () => {
		const res = historyResult(payload, 'bbbbbbbb');
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toBe('- usuario creó: Armar demo\n- agente anotó: Empiezo por el build');
	});
	it('tarea inexistente → isError', () => {
		expect(historyResult(payload, 'zzzz').isError).toBe(true);
	});
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `cd mcp && pnpm test -- tools`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Agregar a `mcp/lib/tools.js`:

```js
import { expandId } from './ids.js';

// Agents act with SHORT ids (what the Markdown projection shows them). The
// server expands them back to real UUIDs before building a change — the app
// and its ingest gate only ever see full UUIDs.
export function expandArgs(exportPayload, args) {
	const resolved = { ...args };
	for (const key of ['noteId', 'blockId']) {
		if (resolved[key] === undefined) continue;
		const res = expandId(exportPayload, resolved[key]);
		if (!res.ok) return { ok: false, reason: res.reason };
		resolved[key] = res.id;
	}
	return { ok: true, args: resolved };
}

const HISTORY_TAIL = 10;
const ACTION_VERBS = { created: 'creó', done: 'completó', reopened: 'reabrió', note: 'anotó' };

// Bitácora on demand: the single read that was ~683 tokens inline is now paid
// only when the agent explicitly asks for one task's history.
export function historyResult(exportPayload, blockId) {
	const expanded = expandId(exportPayload, blockId);
	if (!expanded.ok) {
		return { content: [{ type: 'text', text: `Rechazado: ${expanded.reason}` }], isError: true };
	}
	for (const note of exportPayload?.notes ?? []) {
		const task = (note.blocks ?? []).find((b) => b.type === 'todo' && b.id === expanded.id);
		if (!task) continue;
		const lines = (task.activity ?? [])
			.slice(-HISTORY_TAIL)
			.map((entry) => {
				const rol = entry.actor === 'user' ? 'usuario' : 'agente';
				const verbo = ACTION_VERBS[entry.action] ?? entry.action;
				return `- ${rol} ${verbo}: ${entry.text}`;
			});
		return { content: [{ type: 'text', text: lines.join('\n') || 'Sin historial.' }], isError: false };
	}
	return { content: [{ type: 'text', text: 'Rechazado: no-encontrado' }], isError: true };
}
```

En `mcp/server.js`: envolver las 3 tools con la expansión y registrar la nueva. Reemplazar `makeToolHandler(...)` de cada tool por un handler que expande primero (el heartbeat queda igual):

```js
import { createTaskChange, completeTaskChange, addNoteChange, toolResult, expandArgs, historyResult } from './lib/tools.js';

// build → expand short ids against the live export → submit → result
const expandingHandler = (buildChange, okText) => async (args) => {
	const exp = await readExport();
	const expanded = expandArgs(exp, args);
	if (!expanded.ok) {
		return { content: [{ type: 'text', text: `Rechazado: ${expanded.reason}` }], isError: true };
	}
	return toolResult(await submitWithHeartbeat(buildChange(expanded.args)), okText);
};
```

y usarlo:

```js
server.registerTool(
	'create_task',
	{
		description: 'Crear una tarea (todo) en una nota visible para agentes.',
		inputSchema: { noteId: z.string(), content: z.string() }
	},
	expandingHandler(createTaskChange, 'Tarea creada.')
);
// ídem complete_task y add_note, mismos schemas y mensajes que hoy
```

Tool nueva (después de `add_note`):

```js
server.registerTool(
	'get_task_history',
	{
		description: 'Bitácora de una tarea (historial de acciones), bajo demanda.',
		inputSchema: { blockId: z.string() }
	},
	async ({ blockId }) => {
		await touchAgentStatus();
		return historyResult(await readExport(), blockId);
	}
);
```

(`makeToolHandler` queda sin uso en server.js pero lo siguen usando los tests de wiring — si ya nada lo consume tras ajustar tests, eliminarlo de `tools.js` y de sus tests.)

- [ ] **Step 4: Verde + suite mcp**

Run: `cd mcp && pnpm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/tools.js mcp/lib/tools.test.js mcp/server.js
git commit -m "feat(mcp): tools aceptan ids cortos y bitácora bajo demanda (get_task_history)"
```

---

### Task 6: UI — nota de bitácora del agente inline (amarillo + badge IA) + guía

Las entradas de bitácora `action: 'note'` con `actor !== 'user'` se muestran debajo de la tarea, junto al comentario del usuario (sin tocarlo): itálica, tinta ámbar por token CSS, badge "IA".

**Files:**
- Modify: `src/lib/editor/Editor.svelte` (~línea 363, carga de nota), `src/lib/editor/BlockRow.svelte` (~línea 695, tras el bloque del comentario), `src/app.css` (token nuevo)
- Modify: `docs/guia/17-agentes.md`, `docs/guia-de-uso.md` (fecha)
- Test: `src/lib/editor/agent-notes.test.ts` (nuevo, lógica pura)

**Interfaces:**
- Consumes: `listActivityByNote(noteId)` de `$lib/storage` (filas `{ blockId, actor, action, text, seq }`).
- Produces: `agentNotesByBlock(activityRows)` → `{ [blockId]: [{ text }] }` solo `action === 'note' && actor !== 'user'`, orden por `seq`. Prop nueva `agentNotes` (array) en `BlockRow`.

- [ ] **Step 1: Test que falla (lógica pura)**

`src/lib/editor/agent-notes.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { agentNotesByBlock } from './agent-notes';

describe('agentNotesByBlock', () => {
	it('agrupa por bloque solo las notas de agentes, en orden', () => {
		const rows = [
			{ blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'segunda', seq: 5 },
			{ blockId: 'b1', actor: 'user', action: 'note', text: 'del usuario', seq: 2 },
			{ blockId: 'b1', actor: 'agente-uuid', action: 'created', text: 'creó', seq: 1 },
			{ blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'primera', seq: 3 },
			{ blockId: 'b2', actor: 'agente-uuid', action: 'note', text: 'otra', seq: 4 }
		];
		expect(agentNotesByBlock(rows)).toEqual({
			b1: [{ text: 'primera' }, { text: 'segunda' }],
			b2: [{ text: 'otra' }]
		});
	});
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `pnpm vitest --run src/lib/editor/agent-notes.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementación mínima**

`src/lib/editor/agent-notes.ts`:

```js
// La "voz" del agente en la nota: entradas de bitácora action:'note' cuyo
// actor no es el usuario. Se muestran bajo la tarea, nunca dentro del
// comentario del usuario (block.note) — ese campo es exclusivo del usuario.

export function agentNotesByBlock(activityRows) {
	const byBlock = {};
	const rows = (activityRows ?? [])
		.filter((row) => row.action === 'note' && row.actor !== 'user')
		.sort((a, b) => a.seq - b.seq);
	for (const row of rows) {
		(byBlock[row.blockId] ??= []).push({ text: row.text });
	}
	return byBlock;
}
```

Run: `pnpm vitest --run src/lib/editor/agent-notes.test.ts` → PASS.

- [ ] **Step 4: Cablear Editor → BlockRow**

En `src/lib/editor/Editor.svelte`:
- Importar `listActivityByNote` desde `$lib/storage` y `agentNotesByBlock` desde `./agent-notes`.
- Estado nuevo junto a los existentes: `let agentNotes = $state({});`
- En la carga de la nota (~línea 363, donde hace `Promise.all([getNote(id), listBlocksByNote(id)])`): sumar `listActivityByNote(id)` al `Promise.all` y asignar `agentNotes = agentNotesByBlock(loadedActivity);`.
- Verificar el camino de refresco: cuando el agente agrega una nota por el buzón, la app aplica el cambio y el editor recarga la nota (mismo mecanismo que hoy refresca una tarea creada por el agente — buscar dónde se recarga tras un cambio del bridge y confirmar que ese camino vuelve a ejecutar la carga completa; si recarga solo bloques, sumar ahí la recarga de `agentNotes`).
- Pasar a cada `BlockRow`: `agentNotes={agentNotes[block.id] ?? []}`.

En `src/lib/editor/BlockRow.svelte`:
- Prop nueva en `$props()`: `agentNotes = []`.
- Render después del `{#if noteVisible}` del comentario (~línea 695):

```svelte
{#each agentNotes as agentNote (agentNote.text)}
	<p class="agent-note mt-0.5 w-full min-w-0 text-sm leading-relaxed break-words whitespace-pre-wrap italic">
		<span class="agent-note-badge" aria-label="Escrito por la IA">IA</span>
		{agentNote.text}
	</p>
{/each}
```

En `src/app.css` (siguiendo la convención de tokens del proyecto — variable custom porque Quiet Ink no tiene ámbar; definir en `:root` y en el bloque dark):

```css
:root {
	--agent-ink: oklch(0.55 0.12 85);
}
.dark {
	--agent-ink: oklch(0.8 0.12 85);
}
.agent-note {
	color: var(--agent-ink);
}
.agent-note-badge {
	border: 1px solid currentColor;
	border-radius: 0.25rem;
	padding: 0 0.25rem;
	margin-right: 0.375rem;
	font-size: 0.65rem;
	font-style: normal;
	vertical-align: 0.08em;
}
```

(Ajustar la forma exacta de declarar el token al patrón real de `src/app.css` — mirar cómo declara los demás; el contraste debe pasar AA sobre `background` en ambos temas: verificar con los valores reales de fondo.)

- [ ] **Step 5: Verificación visual + suite**

Run: `pnpm test` → PASS.
Verificación runtime (skill `verify` del proyecto si hace falta): abrir la app, en una nota 🤖 simular una nota de agente (`addTaskNote({ blockId, actor: 'test-agent', text: 'Nota de la IA' })` desde la consola o un test e2e corto) y confirmar: itálica ámbar + badge IA bajo la tarea, comentario del usuario intacto, ambos temas.

- [ ] **Step 6: Guía de usuario (mismo commit)**

En `docs/guia/17-agentes.md` agregar sección: qué ve el agente ahora (el texto de la nota como contexto, el nombre de la carpeta, solo tareas pendientes; los comentarios nunca), y cómo se ve lo que el agente escribe (texto ámbar en cursiva con marca "IA" debajo de la tarea, separado de tus comentarios). Actualizar "Última actualización" en `docs/guia-de-uso.md`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/agent-notes.ts src/lib/editor/agent-notes.test.ts src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte src/app.css docs/guia/17-agentes.md docs/guia-de-uso.md
git commit -m "feat(agentes): la voz del agente visible bajo la tarea — ámbar, cursiva y badge IA"
```

---

### Task 7: Spec 028 al día

`specs/028-agent-beta-local-mcp.md` es la fuente de verdad del modelo de privacidad/canal: actualizar al modelo v2.

**Files:**
- Modify: `specs/028-agent-beta-local-mcp.md`

**Interfaces:** n/a (documentación).

- [ ] **Step 1: Actualizar el spec**

Reflejar exactamente lo construido en Tasks 1-6:
- Lectura: Markdown proyectado (título + carpeta + contexto + tareas pendientes con id corto), medición que lo justifica (referenciar el design doc `docs/superpowers/specs/2026-07-25-canal-agente-v2-lectura-md-permisos-design.md`).
- Modelo de privacidad por tipo de contenido: prosa de nota 🤖 = candado simple (opt-in); comentarios (`block.note`) = doble candado, jamás viajan; completadas/bitácora inline/timestamps/UUIDs no viajan; notas de bitácora del agente no se le devuelven al agente, tareas pendientes creadas por el agente sí.
- Escritura: mismas 3 tools + `get_task_history`; ids cortos re-expandidos por el server; el ingest gate sigue siendo la única autoridad.
- Export versión 2 (forma del payload).

- [ ] **Step 2: Auto-chequeo de coherencia**

Releer el spec resultante contra `src/lib/bridge/export.ts` y `mcp/lib/resources.js` reales: cada afirmación del spec debe ser verificable en código. Sin "TBD".

- [ ] **Step 3: Commit**

```bash
git add specs/028-agent-beta-local-mcp.md
git commit -m "docs(specs): 028 al día — canal agente v2 (lectura Markdown, privacidad por tipo de contenido)"
```

---

### Task 8: Verificación final de la rama

- [ ] **Step 1: Suites completas**

Run: `pnpm test` → PASS (unit app).
Run: `cd mcp && pnpm test` → PASS (mcp).
Run: `pnpm check` → mismas 2 advertencias pre-existentes, ninguna nueva.

- [ ] **Step 2: Humo manual del canal**

Con la app en dev y el server MCP conectado (skill `verify` / receta de `mcp/README.md`): listar recursos, leer una nota 🤖 (debe ser Markdown con ids cortos), `create_task` con id corto de nota, `complete_task` con id corto de tarea, `add_note` + verla ámbar en la app, `get_task_history` de esa tarea.

- [ ] **Step 3: Cierre**

Usar la skill `superpowers:finishing-a-development-branch` (la rama `feat/conectar-mcp` además sigue sin `/code-review` ni push — decidir ahí si esta feature va en la misma rama o aparte).
