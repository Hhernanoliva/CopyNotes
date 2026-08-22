# Entrar en un renglón (zoom) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier renglón de una nota se pueda abrir como si fuera la nota entera — sus hijos ocupan la pantalla, el renglón pasa a ser el título editable de arriba, y un camino de migas devuelve a donde estaba.

**Architecture:** Entrar es una **lente**, no un dato. El editor ya carga la nota completa; lo único que cambia es desde qué renglón dibuja. Todas las funciones puras de jerarquía reciben un parámetro `rootId` con valor por defecto `null`, así que cada llamador y cada prueba actual siguen significando lo mismo. El estado `zoomBlockId` vive en el editor y lo único que se persiste es una preferencia local por aparato.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind, Dexie (IndexedDB), Vitest, Playwright.

**Spec:** `specs/043-zoom-into-row.md`

## Global Constraints

- El parámetro nuevo se llama **`rootId`** en todos lados y su valor por defecto es **`null`**. No inventar una segunda forma de decir lo mismo.
- **Ninguna tabla, ningún campo, ninguna migración.** `imageBodies`, `SYNCED_TABLES`, `BACKUP_TABLES`, `LOCAL_ONLY_FIELDS`, `BIRTH_DEFAULTS` y `resetCloudState()` no se tocan.
- Lo único que se persiste: `zoomRootByNote` en `storage/settings-registry.ts`, **`backupSafe: false`**, podado a **50** notas.
- Cambiar de raíz **no** pasa por `dataVersion` ni por `handleDataChanged`: esos re-montan el editor, roban el cursor y parten renglones a medio escribir.
- Toda escritura del renglón-título pasa por **`writeBlock`**. Un `updateBlock` directo desde el editor es un bug.
- Motion (spec 024): **la lista de renglones no se anima nunca**; **el renglón-título no se anima nunca** (es un `contenteditable`); sólo dos fundidos de 150 ms — el ícono de entrar (clase `transition-opacity duration-(--motion-fast)`, que el CSS global ya pone en cero con "reducir movimiento") y las migas (`in:fade` con `motionDuration(MOTION.fast)`).
- `flattenTree` (el export al agente) y `planIndent` **no se tocan**.
- Copiar, exportar y compartir siguen agarrando la **nota entera**.
- JavaScript plano dentro de `.ts`/`.svelte`: sin anotaciones de tipo. Comentarios en el idioma del archivo que se toca.
- **Guía y CHANGELOG en el mismo commit que la funcionalidad.** La sección `## 0.2.2` del `CHANGELOG.md` **ya está publicada**: la primera tarea que agregue una viñeta abre `## 0.2.3` arriba de todo.
- Los commits a `main` **no llevan trazas de agente** (nada de `Co-Authored-By` ni `Generated with`).
- Regla de las pruebas: **nombrar la línea que pone la prueba en rojo si se borra el control que dice probar.** Cada tarea la escribe explícita.

---

### Task 1: `rootId` en `blocks/hierarchy.ts`

**Files:**
- Modify: `src/lib/blocks/hierarchy.ts`
- Test: `src/lib/blocks/hierarchy.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `buildVisibleList(blocks, rootId = null)` → `[{ block, depth, hasChildren }]`, donde `depth` **0 es el primer nivel de la vista** (los hijos directos de `rootId`).
  - `ancestorIds(blocks, id)` → `[idMásLejano, …, idDelPadre]`, sin incluir `id`. Vacío si el bloque es de primer nivel o no existe.
  - `listDescendantIds(blocks, id)` (ya existía, sin cambios) → todos los descendientes de `id`; con `id === null` devuelve **todos** los bloques.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `describe('buildVisibleList', …)` en `src/lib/blocks/hierarchy.test.ts`:

```js
	// Se pone en rojo si `walk(rootId ?? null, 0)` vuelve a decir `walk(null, 0)`:
	// sin la raíz, la lista trae también 'a', 'b' y sus hermanos.
	it('con una raíz lista sólo sus descendientes, con la profundidad desde ahí', () => {
		const blocks = [
			block('a', null, 0),
			block('a1', 'a', 0),
			block('a1x', 'a1', 0),
			block('b', null, 1)
		];
		const visible = buildVisibleList(blocks, 'a');
		expect(visible.map((row) => row.block.id)).toEqual(['a1', 'a1x']);
		expect(visible.map((row) => row.depth)).toEqual([0, 1]);
	});

	// Colapsar es "acá no me lo muestres"; entrar es "quiero estar adentro".
	// Rojo si la caminata arranca en la raíz en vez de en sus hijos.
	it('ignora el collapsed de la propia raíz y respeta el de adentro', () => {
		const blocks = [
			block('a', null, 0, true),
			block('a1', 'a', 0, true),
			block('a1x', 'a1', 0),
			block('a2', 'a', 1)
		];
		const visible = buildVisibleList(blocks, 'a');
		expect(visible.map((row) => row.block.id)).toEqual(['a1', 'a2']);
	});

	// El control de la firma nueva: sin `rootId` nada cambió.
	it('sin rootId da exactamente la lista de siempre', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('b', null, 1)];
		expect(buildVisibleList(blocks).map((row) => row.block.id)).toEqual(['a', 'a1', 'b']);
	});
```

Agregar un `describe` nuevo en el mismo archivo:

```js
describe('ancestorIds', () => {
	// Rojo si la cadena se devuelve al revés o si incluye al propio renglón:
	// las migas la dibujan en ese orden y el renglón raíz no se repite ahí.
	it('devuelve los antepasados del más lejano al más cercano, sin el propio', () => {
		const blocks = [block('a', null, 0), block('a1', 'a', 0), block('a1x', 'a1', 0)];
		expect(ancestorIds(blocks, 'a1x')).toEqual(['a', 'a1']);
	});

	it('un renglón de primer nivel no tiene antepasados', () => {
		expect(ancestorIds([block('a', null, 0)], 'a')).toEqual([]);
	});

	// Rojo si se saca el `seen`: un dato roto colgaría la pantalla en un bucle.
	it('corta si los padres se muerden la cola', () => {
		const blocks = [
			{ id: 'a', parentBlockId: 'b', order: 0 },
			{ id: 'b', parentBlockId: 'a', order: 0 }
		];
		expect(ancestorIds(blocks, 'a').length).toBeLessThanOrEqual(2);
	});
});
```

Actualizar el import del archivo de prueba:

```js
import { buildVisibleList, listDescendantIds, flattenTree, ancestorIds } from './hierarchy';
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:unit -- --run src/lib/blocks/hierarchy.test.ts`
Expected: FAIL. Las de `buildVisibleList` fallan con la lista entera en vez de la rama; las de `ancestorIds` fallan con `ancestorIds is not a function`.

- [ ] **Step 3: Implementar**

En `src/lib/blocks/hierarchy.ts`, cambiar `buildVisibleList` y agregar `ancestorIds`:

```js
// Flatten the tree into the list the editor renders: parents before children,
// siblings by order, skipping descendants of collapsed blocks.
//
// `rootId` es desde dónde se dibuja (spec 043, "entrar en un renglón"): `null`
// es la nota entera y un id es "estoy parado adentro de ese renglón". El valor
// por defecto deja intactos a todos los llamadores y pruebas de antes.
//
// La caminata arranca en los HIJOS de la raíz, así que el `collapsed` de la
// propia raíz no se mira: colapsar es "acá no me lo muestres", entrar es
// "quiero estar adentro", y son dos cosas distintas.
export function buildVisibleList(blocks, rootId = null) {
	const byParent = childrenByParent(blocks);
	const visible = [];
	function walk(parentId, depth) {
		for (const block of byParent.get(parentId) ?? []) {
			visible.push({ block, depth, hasChildren: byParent.has(block.id) });
			if (!block.collapsed) walk(block.id, depth + 1);
		}
	}
	walk(rootId ?? null, 0);
	return visible;
}

// La cadena de antepasados de un renglón, del más lejano al más cercano y sin
// incluirlo. Las migas la dibujan (spec 043) y salir un nivel lee su último
// eslabón. El `seen` corta un dato roto donde los padres se muerden la cola:
// sin él la pantalla se cuelga, que es peor que una miga de menos.
export function ancestorIds(blocks, id) {
	const byId = new Map(blocks.map((block) => [block.id, block]));
	const chain = [];
	const seen = new Set();
	let current = byId.get(id);
	while (current) {
		const parentId = current.parentBlockId ?? null;
		if (parentId === null || seen.has(parentId)) break;
		seen.add(parentId);
		const parent = byId.get(parentId);
		if (!parent) break;
		chain.unshift(parentId);
		current = parent;
	}
	return chain;
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:unit -- --run src/lib/blocks/`
Expected: PASS, incluidas todas las pruebas viejas de `hierarchy`, `enter`, `indent`, `selection`, `drop` y `reorder` (el valor por defecto es justamente eso).

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/hierarchy.ts src/lib/blocks/hierarchy.test.ts
git commit -m "feat(043): buildVisibleList sabe desde qué renglón dibujar"
```

---

### Task 2: `rootId` en `blocks/enter.ts`

**Files:**
- Modify: `src/lib/blocks/enter.ts`
- Test: `src/lib/blocks/enter.test.ts`

**Interfaces:**
- Consumes: `buildVisibleList(blocks, rootId)`, `listDescendantIds(blocks, id)` de la Task 1.
- Produces:
  - `previousVisibleId(blocks, id, rootId = null)`
  - `planJoinWithPrevious(blocks, id, rootId = null)` → `{ intoId }` o `null`
  - `canDeleteOnBackspace(blocks, id, rootId = null)` → boolean

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar en `src/lib/blocks/enter.test.ts` (usa el helper `block(...)` que ya existe en ese archivo; si su firma no acepta `content`, agregar el campo a mano en el literal como en las pruebas de abajo):

```js
describe('la vista con raíz (spec 043)', () => {
	const rama = () => [
		{ id: 'r', parentBlockId: null, order: 0, type: 'text', content: 'Raíz' },
		{ id: 'c1', parentBlockId: 'r', order: 0, type: 'text', content: 'Uno' },
		{ id: 'c2', parentBlockId: 'r', order: 1, type: 'text', content: 'Dos' }
	];

	// Rojo si `previousVisibleId` sigue caminando la nota entera: ahí el anterior
	// de 'c1' es 'r', que está FUERA de la vista y es el renglón-título.
	it('previousVisibleId no cruza hacia arriba de la raíz', () => {
		expect(previousVisibleId(rama(), 'c1', 'r')).toBe(null);
		expect(previousVisibleId(rama(), 'c2', 'r')).toBe('c1');
	});

	// Rojo si `planJoinWithPrevious` no recibe la raíz: uniría el primer renglón
	// de la vista con el título, que es el síntoma que estas reglas evitan.
	it('planJoinWithPrevious devuelve null en el primero de la vista y une en el segundo', () => {
		expect(planJoinWithPrevious(rama(), 'c1', 'r')).toBe(null);
		expect(planJoinWithPrevious(rama(), 'c2', 'r')).toEqual({ intoId: 'c1' });
	});

	// Rojo si el conteo vuelve a ser `blocks.length`: ahí hay 2 bloques y
	// Backspace borraría el único renglón de la vista, dejándola sin dónde escribir.
	it('canDeleteOnBackspace cuenta los renglones de la vista', () => {
		const uno = [
			{ id: 'r', parentBlockId: null, order: 0, type: 'text', content: 'Raíz' },
			{ id: 'c1', parentBlockId: 'r', order: 0, type: 'text', content: '' }
		];
		expect(canDeleteOnBackspace(uno, 'c1', 'r')).toBe(false);
		expect(canDeleteOnBackspace(rama(), 'c2', 'r')).toBe(true);
	});

	// El control de la firma nueva: sin raíz, lo de siempre.
	it('sin rootId se comporta igual que antes', () => {
		expect(previousVisibleId(rama(), 'c1')).toBe('r');
		expect(canDeleteOnBackspace(rama(), 'c2')).toBe(true);
	});
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:unit -- --run src/lib/blocks/enter.test.ts`
Expected: FAIL — `previousVisibleId(…, 'c1', 'r')` devuelve `'r'`, `planJoinWithPrevious` devuelve `{ intoId: 'r' }` y `canDeleteOnBackspace(uno, 'c1', 'r')` devuelve `true`.

- [ ] **Step 3: Implementar**

En `src/lib/blocks/enter.ts`, cambiar el import y las tres funciones:

```js
import { buildVisibleList, listDescendantIds } from './hierarchy';
```

```js
// `rootId` es desde dónde se está mirando (spec 043). Con el valor por defecto
// —la nota entera— esto significa exactamente lo de siempre.
export function canDeleteOnBackspace(blocks, id, rootId = null) {
	// Cuenta los renglones DE LA VISTA, no los de la nota: adentro de un renglón
	// con un solo hijo, Backspace no puede dejar la vista sin dónde escribir.
	// `listDescendantIds(blocks, null)` son todos los bloques, así que sin raíz
	// esto es el viejo `blocks.length` (y además no cuenta huérfanos, que no se
	// dibujan en ningún lado).
	if (listDescendantIds(blocks, rootId).length <= 1) return false;
	return !blocks.some((block) => (block.parentBlockId ?? null) === id);
}
```

```js
export function previousVisibleId(blocks, id, rootId = null) {
	const visible = buildVisibleList(blocks, rootId);
	const index = visible.findIndex((row) => row.block.id === id);
	if (index <= 0) return null;
	return visible[index - 1].block.id;
}
```

En `planJoinWithPrevious`, agregar el parámetro y pasarlo:

```js
export function planJoinWithPrevious(blocks, id, rootId = null) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	if (!joinable(target) || target.note) return null;
	if (siblingsOf(blocks, id).length > 0) return null;
	// Con raíz, `index <= 0` cae en el PRIMER renglón de la vista: unir ahí
	// subiría el texto al renglón-título, que es un renglón fuera de la lista.
	const prevId = previousVisibleId(blocks, id, rootId);
	const previous = prevId ? blocks.find((block) => block.id === prevId) : null;
	if (!previous || !joinable(previous)) return null;
	if (previous.collapsed && siblingsOf(blocks, prevId).length > 0) return null;
	return { intoId: prevId };
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:unit -- --run src/lib/blocks/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/enter.ts src/lib/blocks/enter.test.ts
git commit -m "feat(043): Backspace se detiene en el borde de la vista"
```

---

### Task 3: `rootId` en `blocks/indent.ts`

**Files:**
- Modify: `src/lib/blocks/indent.ts`
- Test: `src/lib/blocks/indent.test.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces: `planOutdent(blocks, id, rootId = null)` → `{ updates }` o `null`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar dentro del `describe('planOutdent', …)` de `src/lib/blocks/indent.test.ts`:

```js
	// Rojo si la comparación vuelve a ser contra `null`: sin esto, Shift+Tab en
	// el primer nivel de la vista manda el renglón afuera de la vista, que es el
	// síntoma peor de esta app — se lee como pérdida de datos.
	it('devuelve null cuando el padre del renglón ES la raíz de la vista', () => {
		const blocks = [block('r', null, 0), block('c', 'r', 0)];
		expect(planOutdent(blocks, 'c', 'r')).toBe(null);
	});

	it('sigue sacando un nivel cuando el padre no es la raíz', () => {
		const blocks = [block('r', null, 0), block('c', 'r', 0), block('n', 'c', 0)];
		const plan = planOutdent(blocks, 'n', 'r');
		expect(plan.updates).toContainEqual({ id: 'n', parentBlockId: 'r', order: 1 });
	});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:unit -- --run src/lib/blocks/indent.test.ts`
Expected: FAIL — la primera devuelve un plan (mueve `'c'` al primer nivel de la nota) en vez de `null`.

- [ ] **Step 3: Implementar**

Una sola línea en `src/lib/blocks/indent.ts`:

```js
// `rootId` es desde dónde se está mirando (spec 043): el primer nivel de la
// vista es el borde, igual que el primer nivel de la nota cuando no hay raíz.
export function planOutdent(blocks, id, rootId = null) {
	const target = blocks.find((block) => block.id === id);
	if (!target || (target.parentBlockId ?? null) === (rootId ?? null)) return null;
```

(el resto del cuerpo queda igual)

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:unit -- --run src/lib/blocks/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/indent.ts src/lib/blocks/indent.test.ts
git commit -m "feat(043): Shift+Tab no saca un renglón de la vista"
```

---

### Task 4: `rootId` en `blocks/selection.ts` y `blocks/drop.ts`

**Files:**
- Modify: `src/lib/blocks/selection.ts`
- Modify: `src/lib/blocks/drop.ts`
- Test: `src/lib/blocks/selection.test.ts`, `src/lib/blocks/drop.test.ts`

**Interfaces:**
- Consumes: `buildVisibleList(blocks, rootId)` de la Task 1.
- Produces:
  - `selectionRange(blocks, anchorId, focusId, rootId = null)`
  - `neighborVisibleId(blocks, id, direction, rootId = null)`
  - `orderedSelectionRoots(blocks, selectedIds, rootId = null)`
  - `planTypeChangeSelection(blocks, selectedIds, type, rootId = null)`
  - `planDrop(blocks, draggedIds, newParentId, insertIndex, rootId = null)`
  - `planMoveSelection`, `planIndentSelection`, `planOutdentSelection`, `planDeleteSelection` **no cambian**: trabajan sobre `parentBlockId` y `order`, nunca sobre la lista visible.

**Por qué `planDrop` sí se toca, aunque la spec diga que no:** `planDrop` llama a `orderedSelectionRoots`, que camina la lista visible. Entrando en un renglón **colapsado** —caso que la spec permite por escrito— esa lista no contiene ni un solo renglón de la rama, así que `roots` queda vacío, `planDrop` devuelve `null` y **arrastrar deja de funcionar en silencio**. Es un parámetro opcional que sólo se pasa hacia adentro; la traducción de "profundidad 0 = la raíz de la vista" sigue en el llamador, como pide la spec.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar en `src/lib/blocks/selection.test.ts` (los helpers de ese archivo ya arman bloques; si el helper local no acepta `collapsed`, escribir los literales como acá):

```js
describe('la vista con raíz (spec 043)', () => {
	// La raíz COLAPSADA es el caso que rompe todo si `rootId` no viaja: sin él,
	// la lista visible de la nota no contiene ni un renglón de la rama.
	const rama = () => [
		{ id: 'r', parentBlockId: null, order: 0, collapsed: true, type: 'text', content: 'R' },
		{ id: 'c1', parentBlockId: 'r', order: 0, type: 'text', content: 'Uno' },
		{ id: 'c2', parentBlockId: 'r', order: 1, type: 'text', content: 'Dos' },
		{ id: 'c3', parentBlockId: 'r', order: 2, type: 'text', content: 'Tres' }
	];

	// Rojo si `selectionRange` no recibe la raíz: devuelve [] y Shift+↓ deja de
	// seleccionar adentro de un renglón colapsado.
	it('selectionRange marca el rango dentro de la vista', () => {
		expect(selectionRange(rama(), 'c1', 'c3', 'r')).toEqual(['c1', 'c2', 'c3']);
	});

	// Rojo si `neighborVisibleId` no recibe la raíz: devuelve null y las flechas
	// dejan de cruzar de renglón.
	it('neighborVisibleId camina la vista y se detiene en sus bordes', () => {
		expect(neighborVisibleId(rama(), 'c1', 1, 'r')).toBe('c2');
		expect(neighborVisibleId(rama(), 'c1', -1, 'r')).toBe(null);
	});

	it('orderedSelectionRoots ordena los renglones de la vista', () => {
		expect(orderedSelectionRoots(rama(), ['c3', 'c1'], 'r')).toEqual(['c1', 'c3']);
	});

	// Rojo si `planTypeChangeSelection` recorre la lista de la nota: no encuentra
	// ninguno de los seleccionados y devuelve null.
	it('planTypeChangeSelection convierte los renglones de la vista', () => {
		const plan = planTypeChangeSelection(rama(), ['c1', 'c2'], 'bullet', 'r');
		expect(plan.updates.map((update) => update.id)).toEqual(['c1', 'c2']);
	});

	// El control: `selectionRun` sigue exigiendo hermanos contiguos bajo un mismo
	// padre, y eso no depende de la raíz.
	it('la selección sigue sin ser una unidad si cruza padres', () => {
		const blocks = [...rama(), { id: 'n', parentBlockId: 'c1', order: 0, type: 'text', content: 'N' }];
		expect(planIndentSelection(blocks, ['c2', 'n'])).toBe(null);
	});
});
```

Agregar en `src/lib/blocks/drop.test.ts`:

```js
	// Rojo si `planDrop` no le pasa la raíz a `orderedSelectionRoots`: con la raíz
	// colapsada, `roots` queda vacío y el arrastre no hace nada, en silencio.
	it('mueve dentro de una raíz colapsada (spec 043)', () => {
		const blocks = [
			{ id: 'r', parentBlockId: null, order: 0, collapsed: true },
			{ id: 'c1', parentBlockId: 'r', order: 0 },
			{ id: 'c2', parentBlockId: 'r', order: 1 }
		];
		const plan = planDrop(blocks, ['c2'], 'r', 0, 'r');
		expect(plan.updates).toContainEqual({ id: 'c2', order: 0 });
	});

	// La traducción del llamador: profundidad 0 dentro de la vista cuelga de la
	// raíz de la vista, nunca del primer nivel de la nota.
	it('con la raíz como padre, el renglón queda colgando de ella', () => {
		const blocks = [
			{ id: 'r', parentBlockId: null, order: 0 },
			{ id: 'c1', parentBlockId: 'r', order: 0 },
			{ id: 'n', parentBlockId: 'c1', order: 0 }
		];
		const plan = planDrop(blocks, ['n'], 'r', 1, 'r');
		expect(plan.updates).toContainEqual({ id: 'n', order: 1, parentBlockId: 'r' });
	});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:unit -- --run src/lib/blocks/selection.test.ts src/lib/blocks/drop.test.ts`
Expected: FAIL — `selectionRange` devuelve `[]`, `neighborVisibleId` devuelve `null`, `planTypeChangeSelection` devuelve `null`, y el primer `planDrop` devuelve `null`.

- [ ] **Step 3: Implementar**

En `src/lib/blocks/selection.ts`:

```js
// `rootId` es desde dónde se está mirando (spec 043). Va en todas las funciones
// que caminan la lista VISIBLE: adentro de un renglón, "lo que veo" es la rama,
// y con una raíz colapsada la lista de la nota no trae ni uno de esos renglones.
function visibleIds(blocks, rootId = null) {
	return buildVisibleList(blocks, rootId).map((row) => row.block.id);
}
```

```js
export function selectionRange(blocks, anchorId, focusId, rootId = null) {
	const visible = visibleIds(blocks, rootId);
```

```js
export function neighborVisibleId(blocks, id, direction, rootId = null) {
	const visible = visibleIds(blocks, rootId);
```

```js
export function orderedSelectionRoots(blocks, selectedIds, rootId = null) {
	const set = new Set(selectedIds);
	const rootIds = new Set(
		blocks
			.filter((block) => set.has(block.id) && !set.has(block.parentBlockId ?? null))
			.map((block) => block.id)
	);
	return visibleIds(blocks, rootId).filter((id) => rootIds.has(id));
}
```

```js
export function planTypeChangeSelection(blocks, selectedIds, type, rootId = null) {
	const set = new Set(selectedIds);
	const updates = [];
	for (const id of visibleIds(blocks, rootId)) {
```

En `src/lib/blocks/drop.ts`:

```js
// `rootId` viaja sólo para `orderedSelectionRoots`, que camina la lista visible:
// con la raíz de la vista colapsada, sin él no encuentra ningún renglón y el
// arrastre no hace nada, en silencio (spec 043). La geometría no cambia: el
// llamador ya tradujo "profundidad 0" a `newParentId`.
export function planDrop(blocks, draggedIds, newParentId, insertIndex, rootId = null) {
	const parent = newParentId ?? null;
	const roots = orderedSelectionRoots(blocks, draggedIds, rootId);
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:unit -- --run src/lib/blocks/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blocks/selection.ts src/lib/blocks/selection.test.ts src/lib/blocks/drop.ts src/lib/blocks/drop.test.ts
git commit -m "feat(043): seleccionar y soltar dentro de la vista"
```

---

### Task 5: La preferencia `zoomRootByNote`

**Files:**
- Create: `src/lib/settings/zoom-root.ts`
- Create: `src/lib/settings/zoom-root.test.ts`
- Modify: `src/lib/storage/settings-registry.ts`
- Modify: `src/lib/storage/settings.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `MAX_NOTES` (50) y `rememberZoomRoot(map, noteId, blockId)` → objeto nuevo `{ [noteId]: blockId }`, con `noteId` reubicado al final y podado a `MAX_NOTES`. `blockId` `null` **borra** la entrada.
  - `KEY.zoomRootByNote` y `SETTINGS[KEY.zoomRootByNote] = { backupSafe: false }`.
  - `getZoomRoots()` → `Promise<objeto | undefined>` y `setZoomRoots(value)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/settings/zoom-root.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { MAX_NOTES, rememberZoomRoot } from './zoom-root';

describe('rememberZoomRoot', () => {
	it('guarda dónde quedó parada la persona en esa nota', () => {
		expect(rememberZoomRoot({}, 'n1', 'b1')).toEqual({ n1: 'b1' });
	});

	it('salir de la vista borra la entrada en vez de dejarla en null', () => {
		expect(rememberZoomRoot({ n1: 'b1' }, 'n1', null)).toEqual({});
	});

	// Rojo si se saca el `delete` de antes de volver a poner la clave: sin eso la
	// nota conserva su lugar viejo en el orden y la poda tira la más reciente.
	it('reescribir una nota la vuelve la más reciente', () => {
		const map = rememberZoomRoot(rememberZoomRoot({ n1: 'b1' }, 'n2', 'b2'), 'n1', 'bZ');
		expect(Object.keys(map)).toEqual(['n2', 'n1']);
	});

	// Rojo si se borra la línea del `slice`: la clave crece para siempre con cada
	// nota que alguna vez se abrió.
	it(`poda a ${MAX_NOTES} notas y tira las más viejas`, () => {
		let map = {};
		for (let i = 0; i < MAX_NOTES + 5; i += 1) map = rememberZoomRoot(map, `n${i}`, `b${i}`);
		expect(Object.keys(map).length).toBe(MAX_NOTES);
		expect(map.n0).toBeUndefined();
		expect(map[`n${MAX_NOTES + 4}`]).toBe(`b${MAX_NOTES + 4}`);
	});
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:unit -- --run src/lib/settings/zoom-root.test.ts`
Expected: FAIL con `Failed to resolve import "./zoom-root"`.

- [ ] **Step 3: Implementar**

Crear `src/lib/settings/zoom-root.ts`:

```js
// Dónde quedó parada esta persona dentro de cada nota, en ESTE aparato
// (spec 043). Puro y sin DOM ni storage, igual que sidebar-width.ts.
//
// No es un dato de la nota: por eso `backupSafe: false` en el registro, y por
// eso restaurar un respaldo no mueve a nadie de lugar.

// Sin poda, la clave crece para siempre con cada nota que alguna vez se abrió.
export const MAX_NOTES = 50;

// Guardar reescribe la clave: se borra primero para que vuelva a entrar ÚLTIMA.
// El orden de inserción de las claves de texto es el orden real de un objeto en
// JS, y es lo único que hay para saber cuál es la más vieja — sin sello de
// tiempo y sin una segunda lista que mantener en sincronía.
//
// ponytail: si alguna vez hiciera falta ordenar por "última vez que se miró" y
// no por "última vez que se cambió", ahí sí entra un `{ blockId, at }` por nota.
export function rememberZoomRoot(map, noteId, blockId) {
	const next = { ...(map ?? {}) };
	delete next[noteId];
	if (blockId) next[noteId] = blockId;
	const keys = Object.keys(next);
	for (const old of keys.slice(0, Math.max(0, keys.length - MAX_NOTES))) delete next[old];
	return next;
}
```

En `src/lib/storage/settings-registry.ts`, agregar la clave al mapa `KEY` (después de `sidebarWidth`):

```js
	zoomRootByNote: 'zoomRootByNote',
```

y su política en `SETTINGS`:

```js
	[KEY.zoomRootByNote]: { backupSafe: false }, // Dónde quedó parada ESTA persona dentro de cada nota, en ESTE aparato (spec 043). No es un dato de la nota: restaurar un respaldo no debe mover a nadie de lugar, y un aparato nuevo arranca viendo las notas enteras.
```

En `src/lib/storage/settings.ts`, agregar los dos envoltorios junto a los demás:

```js
// Un objeto { [noteId]: blockId }: en qué renglón está parada esta persona en
// cada nota (spec 043). Se poda al escribir con `rememberZoomRoot`.
export function getZoomRoots() {
	return getSetting(KEY.zoomRootByNote);
}

export function setZoomRoots(value) {
	return setSetting(KEY.zoomRootByNote, value);
}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:unit -- --run src/lib/settings/ src/lib/export-import/`
Expected: PASS. Las pruebas de respaldo tienen que seguir verdes sin tocarlas: la clave nueva no es `backupSafe`, así que no entra en `SAFE_SETTING_KEYS`.

- [ ] **Step 5: Verificar que la clave nueva no viaja**

Run: `pnpm test:unit -- --run src/lib/storage/`
Expected: PASS, y ninguna prueba de `settings-registry` cambia de valor esperado.

- [ ] **Step 6: Commit**

```bash
git add src/lib/settings/zoom-root.ts src/lib/settings/zoom-root.test.ts src/lib/storage/settings-registry.ts src/lib/storage/settings.ts
git commit -m "feat(043): la preferencia local de dónde estás parado"
```

---

### Task 6: El estado del zoom en el editor, el ítem del `⋯` y las migas

Es la tarea grande: acá el zoom existe y se puede usar de punta a punta. El renglón-título todavía no se dibuja (Task 7): mientras tanto se ve el camino de migas y la lista de la rama.

**Files:**
- Create: `src/lib/editor/ZoomBreadcrumbs.svelte`
- Modify: `src/lib/editor/Editor.svelte`
- Modify: `src/lib/editor/BlockRow.svelte`
- Modify: `src/lib/editor/BlockActionsMenu.svelte`
- Create: `docs/guia/22-entrar-en-un-renglon.md`
- Modify: `docs/guia-de-uso.md`
- Modify: `CHANGELOG.md`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `buildVisibleList(blocks, rootId)` y `ancestorIds(blocks, id)` (Task 1); las firmas con `rootId` de las Tasks 2-4.
- Produces (dentro de `Editor.svelte`, para las tareas siguientes):
  - `zoomBlockId` (`$state`), `zoomRoot` (`$derived`), `zoomCrumbs` (`$derived`), `zoomRootBlock` (`$derived`)
  - `async function setZoomRoot(id)` — cambia la raíz y hace el reset completo
  - `async function createFirstChild(parentId)`
- Produces (props nuevas de `BlockRow.svelte`): `canZoom` (boolean, calculada adentro), `onZoomIn`.
- Produces (props nuevas de `BlockActionsMenu.svelte`): `canZoom = false`, `onZoomIn`.

- [ ] **Step 1: Escribir el e2e que falla**

Crear `e2e/entrar-en-un-renglon.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { newNote } from './app';

// Spec 043: entrar en un renglón lo abre como si fuera la nota entera.

const blockTexts = (page) =>
	page.$$eval('main [data-block-id] .block-editable', (els) =>
		els.map((el) => el.textContent ?? '')
	);

// Arma: Padre > [Hijo 1, Hijo 2], y un Suelto al final de la nota.
async function notaConRama(page) {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('Padre');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 1');
	await page.keyboard.press('Tab');
	await page.waitForTimeout(150);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.type('Hijo 2');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(150);
	await page.keyboard.press('Shift+Tab');
	await page.waitForTimeout(150);
	await page.keyboard.type('Suelto');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
}

async function entrarDesdeElMenu(page, texto) {
	const row = page.locator('main [data-block-id]', { hasText: texto }).first();
	await row.hover();
	await row.getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Entrar acá' }).click();
}

test('entrar por el menú deja sólo la rama, y la miga devuelve la nota entera', async ({ page }) => {
	await notaConRama(page);

	await entrarDesdeElMenu(page, 'Padre');
	// Adentro se ven EXACTAMENTE los descendientes: ni el propio Padre en la
	// lista, ni el Suelto que vive en otra rama.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	const migas = page.getByRole('navigation', { name: 'Dónde estás' });
	await expect(migas).toBeVisible();

	await migas.getByRole('button').first().click();
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(migas).toBeHidden();
});

test('Shift+Tab en el primer nivel de la vista no saca el renglón de la vista', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	await page.getByText('Hijo 1', { exact: true }).click();
	await page.keyboard.press('Shift+Tab');
	await page.waitForTimeout(200);
	// Sigue adentro y sigue estando: sin la regla, se iba al primer nivel de la
	// nota y desaparecía de la pantalla.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
});

test('entrar con el menú "/" abierto lo cierra y no deja nada flotando', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Suelto', { exact: true }).click();
	await page.keyboard.press('End');
	await page.keyboard.type('/');
	await expect(page.locator('#slash-menu')).toBeVisible();

	await entrarDesdeElMenu(page, 'Padre');
	await expect(page.locator('#slash-menu')).toBeHidden();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL — no existe el ítem `Entrar acá` en el menú.

- [ ] **Step 3: El ítem del menú `⋯`**

En `src/lib/editor/BlockActionsMenu.svelte`, agregar el import del ícono:

```js
	import {
		MoreHorizontal,
		BookmarkPlus,
		Tag,
		StickyNote,
		ArrowUp,
		ArrowDown,
		ChevronsRight,
		Trash2
	} from '@lucide/svelte';
```

Agregar las dos props:

```js
		// Entrar en el renglón (spec 043). Va AFUERA del bloque `noteOnly` a
		// propósito: entrar es mirar, no escribir, así que el invitado de una nota
		// compartida también lo tiene. Falso en el separador, en la imagen y en el
		// propio renglón-título.
		canZoom = false,
		onZoomIn,
```

Y el ítem, arriba de `{#if !noteOnly}` y debajo del bloque de `contentActions` (comentario):

```svelte
			{#if canZoom}
				<button
					type="button"
					role="menuitem"
					onmousedown={(event) => event.preventDefault()}
					onclick={() => run(onZoomIn, false)}
					class="cn-touch-row text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
				>
					<ChevronsRight size={15} aria-hidden="true" />
					<span class="flex-1">Entrar acá</span>
					<kbd class="text-faint border-border rounded border px-1 text-xs">Alt+→</kbd>
				</button>
			{/if}
```

- [ ] **Step 4: Pasar la puerta desde `BlockRow`**

En `src/lib/editor/BlockRow.svelte`, agregar a `$props()`:

```js
		// Entrar en el renglón (spec 043). El separador y la imagen no lo llevan:
		// no tienen texto que pueda hacer de título.
		onZoomIn,
		// El renglón-título de la vista: se dibuja arriba y NO está en la lista.
		zoomTitle = false,
```

Agregar el derivado (junto a `showPlus`):

```js
	const canZoom = $derived(
		!zoomTitle && block.type !== 'separator' && block.type !== 'image'
	);
```

Y pasarlo al menú:

```svelte
			<BlockActionsMenu
				{pulseMenu}
				{canZoom}
				open={actionsMenuOpen}
				onOpenChange={onActionsMenuChange}
				noteOnly={guest}
				contentActions={block.type !== 'separator'}
				onAddNote={openNote}
				onZoomIn={() => onZoomIn?.(block)}
				onMoveUp={() => onMoveUp(block)}
```

- [ ] **Step 5: Las migas**

Crear `src/lib/editor/ZoomBreadcrumbs.svelte`:

```svelte
<script>
	import { ChevronRight } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import { MOTION, motionDuration } from '$lib/motion';

	// El camino hasta donde estás parado (spec 043). `crumbs` viene armado del
	// editor: el título de la nota primero (id null) y después cada antepasado
	// del renglón raíz. El renglón raíz NO se repite acá: ya es el título de abajo.
	let { crumbs, onGo } = $props();

	// Con más de cuatro escalones se abrevia el medio. El "…" no es un botón: los
	// escalones que tapa siguen a un clic de distancia desde el de al lado.
	const shown = $derived(
		crumbs.length > 4 ? [crumbs[0], { ellipsis: true }, ...crumbs.slice(-2)] : crumbs
	);
</script>

<!-- Se desplaza de costado en pantallas chicas. NINGÚN panel flotante puede
     vivir acá adentro: un contenedor con scroll recorta todo lo que se abra
     fuera de su caja, aunque esté posicionado en absoluto (AGENT.md).
     Fundido de 150ms y sin viaje: el espacio que ocupa aparece de una, porque
     animar alto o margen empuja el texto y eso la spec 024 lo prohíbe. -->
<nav
	aria-label="Dónde estás"
	class="text-muted-foreground mt-6 flex items-center gap-1 overflow-x-auto text-sm"
	in:fade={{ duration: motionDuration(MOTION.fast) }}
>
	{#each shown as crumb, index (crumb.id ?? (crumb.ellipsis ? 'ellipsis' : index))}
		{#if index > 0}
			<ChevronRight size={14} aria-hidden="true" class="text-faint shrink-0" />
		{/if}
		{#if crumb.ellipsis}
			<span class="text-faint shrink-0">…</span>
		{:else}
			<button
				type="button"
				onclick={() => onGo(crumb.id)}
				class="hover:text-foreground focus-visible:ring-ring max-w-[12rem] shrink-0 truncate rounded-sm px-1 py-0.5 text-left transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
				>{crumb.label}</button
			>
		{/if}
	{/each}
</nav>
```

- [ ] **Step 6: El estado del zoom en el editor**

En `src/lib/editor/Editor.svelte`, ampliar los imports:

```js
	import { buildVisibleList, listDescendantIds, ancestorIds } from '$lib/blocks/hierarchy';
	import ZoomBreadcrumbs from './ZoomBreadcrumbs.svelte';
	import { tick } from 'svelte';
```

Agregar el estado junto a las otras superficies del editor (arriba de `const selectedIds = …`):

```js
	// Entrar en un renglón (spec 043): `null` es la nota entera, un id es "estoy
	// parado adentro de ese renglón". Es una LENTE, no un dato: no hay campo en
	// ninguna fila, el editor sigue cargando la nota completa, y Deshacer, el
	// respaldo, la nube, el agente y compartir no se enteran de que esto existe.
	let zoomBlockId = $state(null);
	// La raíz que de verdad se dibuja. Un id que ya no está en `blocks` —lo borró
	// otro aparato, o la preferencia quedó vieja— vale como nota entera. Es un
	// derivado y no un efecto a propósito: la pantalla nunca puede quedar
	// esperando a que un efecto la rescate.
	//
	// `blocks` son los renglones VIVOS de ESTA nota, así que este `some` contesta
	// de una las tres preguntas de la spec: existe, no está borrado, y es de acá.
	const zoomRoot = $derived(
		zoomBlockId && blocks.some((block) => block.id === zoomBlockId) ? zoomBlockId : null
	);
	const zoomRootBlock = $derived(
		zoomRoot ? (blocks.find((block) => block.id === zoomRoot) ?? null) : null
	);
	const zoomCrumbs = $derived.by(() => {
		if (!zoomRoot || !note) return [];
		const byId = new Map(blocks.map((block) => [block.id, block]));
		return [
			{ id: null, label: note.title || 'Sin título' },
			...ancestorIds(blocks, zoomRoot).map((id) => ({
				id,
				label: byId.get(id)?.content || 'Sin texto'
			}))
		];
	});
```

Cambiar la lista visible:

```js
	const visible = $derived(buildVisibleList(blocks, zoomRoot));
```

Cambiar `selectedIds` para que el rango se calcule sobre la vista:

```js
	const selectedIds = $derived(
		selection ? selectionRange(blocks, selection.anchorId, selection.focusId, zoomRoot) : []
	);
```

> **Efecto de borde deseado, no lo "arregles":** el renglón-título no está en la vista, así que seleccionarlo con `Escape` produce un rango vacío y las teclas estructurales (Tab, Backspace, Alt+↑/↓ de grupo) no lo alcanzan. Es exactamente la regla de la spec — `Tab` y `Shift+Tab` en el título no hacen nada — conseguida gratis.

Agregar las dos funciones nuevas (junto a `clearSelection`):

```js
	// Entrar en un renglón sin hijos le crea el primero y manda el cursor ahí: una
	// vista sin renglones no tiene dónde escribir. En sólo lectura NO se crea
	// nada, porque mirar no puede escribir (spec 043).
	async function createFirstChild(parentId) {
		if (readOnly) return;
		recordSnapshot();
		const created = await createBlock({
			noteId: note.id,
			parentBlockId: parentId,
			type: 'text',
			order: 0
		});
		blocks = [...blocks, created];
		focusBlockId = created.id;
	}

	// Cambiar de raíz es un RESET (spec 043): lo que quedaba abierto apuntaba a
	// renglones que ya no se ven. No se re-monta el editor ni se toca
	// `dataVersion`: `blocks` es el mismo arreglo, el historial sigue vivo y no se
	// relee la base — re-montar robaría el cursor y partiría renglones a medio
	// escribir (AGENT.md, regla de los cambios de afuera).
	async function setZoomRoot(id) {
		const next = id ?? null;
		if (next === zoomRoot) return;
		const leaving = zoomRoot;
		reorder.cancel();
		textDrag.cancel();
		slash = null;
		selectionMenu = null;
		selection = null;
		datePanelFor = null;
		tagPickerFor = null;
		actionsMenuFor = null;
		// `toolbar = null` a secas y no `closeToolbar()`: esa función devuelve el
		// foco al renglón que la abrió, que puede ser uno que ya no se ve.
		toolbar = null;
		focusCaret = null;
		focusBlockId = null;
		zoomBlockId = next;
		const rows = buildVisibleList(blocks, next);
		if (activeBlockId && !rows.some((row) => row.block.id === activeBlockId)) {
			activeBlockId = null;
		}
		if (next && rows.length === 0) await createFirstChild(next);
		// Al salir, el renglón donde se estaba parado queda a la vista. Sin esto,
		// salir de una rama que estaba abajo en una nota larga devuelve la nota
		// desde arriba y hay que buscar a mano dónde se estaba. Sin suavizado: es
		// una reubicación, no un viaje (spec 024).
		if (leaving && rows.some((row) => row.block.id === leaving)) {
			await tick();
			listEl?.querySelector(`[data-block-id="${leaving}"]`)?.scrollIntoView({ block: 'center' });
		}
	}
```

- [ ] **Step 7: Cablear la raíz en los llamadores del editor**

Seis llamadas dentro de `Editor.svelte` reciben `zoomRoot`. Sin una sola de ellas, el síntoma es siempre el mismo: **un renglón que desaparece de la pantalla.**

En `handleBackspaceEmpty`, las tres llamadas:

```js
		const promote = planPromoteChildren(blocks, block.id);
		if (promote) {
			recordSnapshot();
			const prevId = previousVisibleId(blocks, block.id, zoomRoot);
			…
		}
		if (!canDeleteOnBackspace(blocks, block.id, zoomRoot)) return;
		recordSnapshot();
		const prevId = previousVisibleId(blocks, block.id, zoomRoot);
```

En `handleJoinPrevious`:

```js
		const plan = planJoinWithPrevious(blocks, block.id, zoomRoot);
```

En `handleDeleteBlock`:

```js
		const prevId = previousVisibleId(blocks, block.id, zoomRoot);
```

En `handleOutdent`:

```js
		const plan = planOutdent(blocks, block.id, zoomRoot);
```

En `handleVerticalArrow` y en `extendSelection`, las cuatro llamadas a `neighborVisibleId` llevan `zoomRoot` como cuarto argumento:

```js
		const neighborId = neighborVisibleId(blocks, block.id, direction, zoomRoot);
```
```js
			const focus = neighborVisibleId(blocks, selection.focusId, direction, zoomRoot);
```
```js
		const neighbor = neighborVisibleId(blocks, activeBlockId, direction, zoomRoot);
```
```js
			neighborVisibleId(blocks, last, 1, zoomRoot) ?? neighborVisibleId(blocks, first, -1, zoomRoot);
```

En `copySelection` (la llamada a `orderedSelectionRoots`) y en `applySelectionType` (la llamada a `planTypeChangeSelection`), el último argumento es `zoomRoot`:

```js
		const rootIds = orderedSelectionRoots(blocks, selectedIds, zoomRoot);
```
```js
		const plan = planTypeChangeSelection(blocks, selectedIds, type, zoomRoot);
```

- [ ] **Step 8: Dibujar las migas y colgar la puerta de entrada**

En el markup de `Editor.svelte`, entre el bloque de `TagChips` de la nota y el `<div … bind:this={listEl}>`:

```svelte
		{#if zoomCrumbs.length > 0}
			<ZoomBreadcrumbs crumbs={zoomCrumbs} onGo={(id) => setZoomRoot(id)} />
		{/if}
```

Y en el `<BlockRow>` de la lista, agregar la prop (junto a `onCopy`):

```svelte
					onZoomIn={(block) => setZoomRoot(block.id)}
```

- [ ] **Step 9: Correr el e2e y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los tres tests.

Run: `pnpm test:unit -- --run && pnpm check`
Expected: PASS, sin errores nuevos de `svelte-check`.

- [ ] **Step 10: La guía y el changelog**

Crear `docs/guia/22-entrar-en-un-renglon.md`:

```markdown
# Entrar en un renglón

Cuando una nota se hace larga, podés **entrar** en un renglón y trabajar ahí
adentro como si fuera una nota aparte: sus sub-ítems ocupan la pantalla y el
resto de la nota se queda esperando, intacto.

## Cómo se entra

- **En la compu:** pasá el mouse por el renglón y tocá la flechita doble `»`
  que aparece a la izquierda.
- **En cualquier aparato:** abrí el menú **⋯** del renglón y elegí
  **Entrar acá**.

## Cómo se sale

Arriba aparece un camino: `Mi nota › Casa ›`. Tocá el nombre de la nota para
volver a verla entera, o cualquier escalón del medio para quedarte en ese punto.
Al salir, CopyNotes te deja el renglón donde estabas a la vista, sin que tengas
que buscarlo.

## Qué cambia adentro

- Escribís, anidás, arrastrás y borrás igual que siempre. **Nada de lo que
  hagas puede sacar un renglón de la pantalla sin que vos lo pidas**: por
  ejemplo, sacar de nivel el primer renglón de la vista no hace nada.
- El renglón en el que entraste se ve arriba, grande, y **se puede editar ahí
  mismo**.
- Si entrás en un renglón que todavía no tiene nada adentro, CopyNotes le crea
  el primer sub-ítem y te deja el cursor listo para escribir.
- Entrar en un renglón **colapsado** te muestra igual lo que tiene adentro;
  cuando salís, sigue colapsado como estaba.

## Qué NO cambia

- **Copiar la nota, exportarla y compartirla siguen agarrando la nota entera**,
  estés donde estés. Para llevarte sólo una rama está *Copiar con subniveles*
  en el menú **⋯**.
- **Buscar** sigue buscando en toda la app, y tanto la búsqueda como la Agenda
  te muestran la nota entera cuando te llevan a un renglón.
- Cerrás la nota y volvés más tarde: **seguís adentro del mismo renglón**. Es
  una memoria de este aparato: no viaja en el respaldo ni a tus otros
  dispositivos.
```

En `docs/guia-de-uso.md`, agregar la línea del índice después de la 21 y actualizar la fecha de "Última actualización":

```markdown
22. [Entrar en un renglón](guia/22-entrar-en-un-renglon.md) — abrir un renglón como si fuera una nota aparte, el camino de migas para volver, qué cambia adentro y qué sigue agarrando la nota entera
```

En `CHANGELOG.md`, abrir la sección nueva arriba de `## 0.2.2` (que ya está publicada):

```markdown
## 0.2.3

- **Ahora podés entrar en un renglón y trabajar ahí adentro**, como si fuera una nota aparte: sus sub-ítems ocupan la pantalla y arriba queda un camino (`Mi nota › Casa ›`) para volver. Se entra desde el menú **⋯** del renglón con *Entrar acá*, y en la compu con la flechita doble que aparece al pasar el mouse
```

- [ ] **Step 11: Commit**

```bash
git add src/lib/editor/ZoomBreadcrumbs.svelte src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte src/lib/editor/BlockActionsMenu.svelte e2e/entrar-en-un-renglon.spec.ts docs/guia/22-entrar-en-un-renglon.md docs/guia-de-uso.md CHANGELOG.md
git commit -m "feat(043): entrar en un renglón desde el menú, con migas para volver"
```

---

### Task 7: El renglón-título

**Files:**
- Modify: `src/lib/editor/Editor.svelte`
- Modify: `src/lib/editor/BlockRow.svelte`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `zoomRoot`, `zoomRootBlock`, `setZoomRoot(id)`, `createFirstChild(parentId)` (Task 6); la prop `zoomTitle` de `BlockRow` (declarada en la Task 6).
- Produces:
  - `BlockRow` con `zoomTitle` dibuja el renglón sin manija, sin flechita y sin ícono de entrar, con tamaño de título, `Enter` que baja al primer hijo y `Tab` inerte.
  - Prop nueva de `BlockRow`: `onZoomTitleEnter`.
  - En `Editor.svelte`: el snippet `{#snippet blockRow(item, index, zoomTitle)}` y `async function focusFirstChildOfRoot()`.

- [ ] **Step 1: Escribir los e2e que fallan**

Agregar a `e2e/entrar-en-un-renglon.spec.ts` (reutiliza `notaConRama` y `entrarDesdeElMenu`):

```ts
test('el renglón-título se edita arriba y lo escrito sobrevive al salir', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	const titulo = page.locator('[data-zoom-title] .block-editable');
	await expect(titulo).toHaveText('Padre');
	await titulo.click();
	await page.keyboard.press('End');
	await page.keyboard.type(' remodelado');
	await page.waitForTimeout(700); // el guardado del tipeo va con retraso

	await page.getByRole('navigation', { name: 'Dónde estás' }).getByRole('button').first().click();
	await expect
		.poll(() => blockTexts(page))
		.toEqual(['Padre remodelado', 'Hijo 1', 'Hijo 2', 'Suelto']);
});

test('Enter en el renglón-título baja al primer hijo en vez de partirlo', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	const titulo = page.locator('[data-zoom-title] .block-editable');
	await titulo.click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(200);
	// Partirlo crearía un hermano de la raíz: un renglón fuera de la vista.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await expect(titulo).toHaveText('Padre');
	await page.keyboard.type('!');
	await expect.poll(() => blockTexts(page)).toEqual(['!Hijo 1', 'Hijo 2']);
});

test('entrar en un renglón sin hijos crea el primero y deja el cursor ahí', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Suelto');

	await expect(page.locator('[data-zoom-title] .block-editable')).toHaveText('Suelto');
	await page.keyboard.type('Primero');
	await expect.poll(() => blockTexts(page)).toEqual(['Primero']);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL en los tres nuevos — no existe `[data-zoom-title]`.

- [ ] **Step 3: La variante en `BlockRow`**

En `src/lib/editor/BlockRow.svelte`, agregar la prop:

```js
		// El renglón-título llama acá en vez de partirse: partirlo crearía un
		// hermano de la raíz, o sea un renglón fuera de la vista (spec 043).
		onZoomTitleEnter,
```

Marcar la fila y quitarle los tres gestos de lista. En el `<div class="cn-row …">`, agregar el atributo:

```svelte
	data-zoom-title={zoomTitle ? '' : undefined}
```

Envolver el hueco de la manija y el de la flechita/`+` para que no se dibujen en el título — los tres son gestos sobre un renglón que está en una lista, y éste no lo está:

```svelte
	{#if !zoomTitle}
		<!-- One handle, two outcomes: release without moving selects; movement drags.
		     It stays in the first slot even on an empty or image row. -->
		<div class="relative flex h-7 w-4 shrink-0 items-center justify-center">
			…  (el contenido actual, sin cambios)
		</div>
		<div
			class="flex h-7 w-5 shrink-0 items-center justify-center {hasChildren || showPlus
				? 'cn-row-secondary-control'
				: ''}"
		>
			…  (el contenido actual, sin cambios)
		</div>
	{/if}
```

Tamaño de título sin importar el tipo. Agregar el derivado junto a `canZoom`:

```js
	// El renglón-título se lee como el título de la nota SIEMPRE, sin importar el
	// tipo del bloque: es "dónde estoy parado" y tiene que leerse igual siempre.
	// El tipo se conserva en los datos y vuelve a verse al salir (spec 043).
	const editableTypeClass = $derived(
		zoomTitle
			? 'text-2xl font-bold tracking-tight md:text-3xl'
			: block.type === 'code'
				? `block-editable--code bg-muted px-3 py-2 font-mono text-sm leading-6 ${isLongCode ? 'rounded-t-md' : 'rounded-md'}`
				: 'text-base'
	);
	const editableHeadingClass = $derived(
		zoomTitle
			? ''
			: `${block.type === 'heading1' ? 'block-editable--h1' : ''} ${block.type === 'heading2' ? 'block-editable--h2' : ''} ${block.type === 'heading3' ? 'block-editable--h3' : ''}`
	);
```

y reemplazar el `class` del `<div … contenteditable …>` por:

```svelte
					class="block-editable min-h-7 w-full min-w-0 leading-relaxed break-words whitespace-pre-wrap outline-none {readOnly
					? 'cursor-default'
					: ''} {editableTypeClass} {block.type === 'todo' && block.checked
						? 'text-muted-foreground line-through'
						: ''} {editableHeadingClass}"
```

`Enter` y `Tab` en `handleSurfaceKeys`, arriba de las ramas que ya existen:

```js
		// El renglón-título no está en una lista: no se parte, no se anida y no se
		// saca de nivel. Las tres crearían un renglón fuera de la vista (spec 043).
		if (zoomTitle && (event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
			event.preventDefault();
			if (event.key === 'Enter') onZoomTitleEnter?.(block);
			return true;
		}
		if (zoomTitle && event.key === 'Tab' && event.shiftKey) {
			event.preventDefault();
			return true;
		}
```

- [ ] **Step 4: Dibujar el renglón-título desde el editor**

En `src/lib/editor/Editor.svelte`, mover el `<BlockRow …/>` que hoy vive dentro del `{#each visible …}` a un snippet, **sin cambiarle ni una prop**, y llamarlo desde los dos lugares. Es un movimiento mecánico: la única alternativa es repetir sesenta props a mano y que se despeguen en el primer cambio.

El snippet va arriba del markup del editor (después del `</script>` y antes del `{#if note}`):

```svelte
{#snippet blockRow(item, index, zoomTitle)}
	<BlockRow
		{zoomTitle}
		block={item.block}
		{readOnly}
		guest={isMember}
		depth={item.depth}
		hasChildren={item.hasChildren}
		… (TODAS las props actuales, con `row` renombrado a `item`)
		onZoomIn={(block) => setZoomRoot(block.id)}
		onZoomTitleEnter={focusFirstChildOfRoot}
	/>
{/snippet}
```

Dos props dependen de `zoomTitle`:

```svelte
		placeholder={zoomTitle
			? ''
			: index === 0 && visible.length === 1
				? 'Escribí algo, o "/" para elegir tipo…'
				: ''}
```

El renglón-título se dibuja **fuera de `listEl`**: `dragReorder` mide los renglones de la lista con `listEl.querySelector`, y el título no se arrastra ni se suelta. Entre las migas y el `<div … bind:this={listEl}>`:

```svelte
		{#if zoomRootBlock}
			<div class="mt-4">
				{@render blockRow({ block: zoomRootBlock, depth: 0, hasChildren: false }, 0, true)}
			</div>
		{/if}
```

Y dentro del `{#each}`:

```svelte
			{#each visible as row, index (row.block.id)}
				{@render blockRow(row, index, false)}
			{/each}
```

Agregar la función que baja al primer hijo, junto a `createFirstChild`:

```js
	// Enter en el renglón-título lleva el cursor al primer hijo, creándolo si no
	// hay ninguno (spec 043).
	async function focusFirstChildOfRoot() {
		if (!zoomRoot) return;
		const first = buildVisibleList(blocks, zoomRoot)[0];
		if (first) {
			focusBlockId = first.block.id;
			focusCaret = 0;
			return;
		}
		await createFirstChild(zoomRoot);
	}
```

- [ ] **Step 5: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los seis tests.

Run: `pnpm check`
Expected: sin errores nuevos.

- [ ] **Step 6: Ver la pantalla, no sólo el verde**

Sacar una captura con Playwright estando adentro de un renglón y mirarla: las migas arriba, el renglón-título grande y alineado con los renglones de abajo, sin manija ni flechita a su izquierda.

```bash
pnpm test:e2e entrar-en-un-renglon --headed
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte e2e/entrar-en-un-renglon.spec.ts
git commit -m "feat(043): el renglón donde entraste se edita arriba"
```

---

### Task 8: El ícono de entrar en escritorio

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte`
- Modify: `src/app.css`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `canZoom` y `onZoomIn` de `BlockRow` (Task 6).
- Produces: la clase `.cn-zoom-slot` en `src/app.css`.

- [ ] **Step 1: Escribir el e2e que falla**

Agregar a `e2e/entrar-en-un-renglon.spec.ts`:

```ts
test('en escritorio se entra con el ícono del renglón', async ({ page }) => {
	await notaConRama(page);

	const row = page.locator('main [data-block-id]', { hasText: 'Padre' }).first();
	await row.hover();
	await row.getByRole('button', { name: 'Entrar en el renglón' }).click();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	// El renglón-título no lo lleva: no está en una lista.
	await expect(
		page.locator('[data-zoom-title]').getByRole('button', { name: 'Entrar en el renglón' })
	).toHaveCount(0);
});

test('el separador no tiene por dónde entrar', async ({ page }) => {
	await newNote(page);
	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();
	await page.keyboard.type('/separador');
	await page.keyboard.press('Enter');
	await page.waitForTimeout(300);

	const separador = page.locator('main [data-block-id]').first();
	await separador.hover();
	await expect(
		separador.getByRole('button', { name: 'Entrar en el renglón' })
	).toHaveCount(0);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL — no existe ningún botón `Entrar en el renglón`.

- [ ] **Step 3: El hueco y el ícono**

En `src/lib/editor/BlockRow.svelte`, agregar `ChevronsRight` al import de `@lucide/svelte` y el tercer hueco justo después del `<div>` de la flechita/`+`, todavía dentro del `{#if !zoomTitle}`:

```svelte
		<!-- Entrar en el renglón (spec 043). Hueco PROPIO, no el de la flechita:
		     ese ya se reparte entre colapsar (con hijos) y "+" (sin hijos), y los
		     tres tienen que poder convivir. El hueco existe aunque el ícono no se
		     vea, o el texto salta al pasar el mouse.
		     El fundido de 150ms es el mismo `transition-opacity duration-(--motion-fast)`
		     que ya usan la manija y el ⋯, y el CSS global lo pone en cero con
		     "reducir movimiento" (spec 024). -->
		{#if canZoom}
			<div class="cn-zoom-slot h-7 w-5 shrink-0 items-center justify-center">
				<button
					type="button"
					tabindex="-1"
					aria-label="Entrar en el renglón"
					use:tooltip={'Entrar acá'}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={() => onZoomIn?.(block)}
					class="cn-affordance cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-5 items-center justify-center rounded-sm opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
				>
					<ChevronsRight size={14} aria-hidden="true" />
				</button>
			</div>
		{/if}
```

En `src/app.css`, junto a `.cn-row-secondary-control`:

```css
	/* El hueco del ícono de entrar existe SIEMPRE donde hay hover, para que el
	   texto no salte al pasar el mouse. En táctil no hay "pasar el mouse" y un
	   tercer blanco de 44px no entra en una pantalla de 320px: ahí no se dibuja
	   ni el ícono ni el hueco, y manda el menú ⋯ (spec 043). */
	.cn-zoom-slot {
		display: none;
	}
	@media (hover: hover) {
		.cn-zoom-slot {
			display: flex;
		}
	}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los ocho tests.

- [ ] **Step 5: Comprobar que en reposo la nota se ve igual**

Run: `pnpm test:e2e critical-flows move-blocks slash`
Expected: PASS. El corrimiento de ~20px es el costo aceptado; ninguna prueba que mida `padding-left` de la fila cambia, porque el hueco es un hijo y no padding.

- [ ] **Step 6: Actualizar la guía**

En `docs/guia/22-entrar-en-un-renglon.md` la sección *Cómo se entra* ya lo describe. Agregar una línea al final de esa sección:

```markdown
En celular y tablet la flechita no aparece —no hay "pasar el dedo por encima"—:
ahí se entra siempre desde el menú **⋯**.
```

Y agregar la mención en `docs/guia/15-usar-en-celular.md`, al final de la lista del menú `⋯`:

```markdown
- **Entrar acá** — abre ese renglón como si fuera una nota aparte (ver el tema 22)
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/BlockRow.svelte src/app.css e2e/entrar-en-un-renglon.spec.ts docs/guia/22-entrar-en-un-renglon.md docs/guia/15-usar-en-celular.md
git commit -m "feat(043): la flechita de entrar aparece al pasar el mouse"
```

---

### Task 9: El teclado (`Alt+→` / `Alt+←`) y la ayuda

**Files:**
- Modify: `src/lib/editor/Editor.svelte`
- Modify: `src/lib/components/HelpDialog.svelte`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `setZoomRoot(id)`, `zoomRoot`, `ancestorIds` (Tasks 1 y 6).
- Produces: nada para tareas posteriores.

- [ ] **Step 1: Escribir el e2e que falla**

Agregar a `e2e/entrar-en-un-renglon.spec.ts`:

```ts
test('Alt+→ entra en el renglón del cursor y Alt+← sale un nivel', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Padre', { exact: true }).click();
	await page.keyboard.press('Alt+ArrowRight');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	await page.keyboard.press('Alt+ArrowLeft');
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
});

test('con dos renglones seleccionados, Alt+←/→ se consumen y no hacen nada', async ({ page }) => {
	await notaConRama(page);

	await page.getByText('Hijo 1', { exact: true }).click();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Alt+ArrowRight');
	await page.waitForTimeout(200);
	// Sin la rama explícita, la tecla cae al renglón enfocado y entra en UNO en
	// silencio — así fue como Tab indentaba sólo el primero de varios (AGENT.md).
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toHaveCount(0);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL — `Alt+ArrowRight` no hace nada y la lista se queda entera.

- [ ] **Step 3: La rama del teclado**

En `handleSelectionKeys` de `src/lib/editor/Editor.svelte`, agregar la rama **después** de las ramas de deshacer/rehacer y **antes** de `if (event.shiftKey && (event.key === 'ArrowUp' …`. Va arriba del `if (!blockSelectionActive) …` a propósito: entrar es un gesto con el cursor puesto, sin selección.

```js
		// Entrar y salir de un renglón (spec 043). `Alt+→` entra en el del cursor,
		// `Alt+←` sale un nivel: al padre de la raíz, o a la nota entera.
		//
		// Con dos o más renglones marcados AMBAS se consumen y no hacen nada. Es
		// obligatorio, no una omisión: una tecla de bloque sin rama acá cae al
		// renglón enfocado y actúa sobre UNO en silencio (AGENT.md; así fue como
		// Tab indentaba sólo el primero de varios).
		//
		// Costo aceptado: en macOS, Option+flecha mueve el cursor palabra por
		// palabra y se lo pisa. Es la convención de Workflowy y ⌘+flecha sigue libre.
		if (
			event.altKey &&
			(event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
			selectionSurfaceId(event.target)
		) {
			claim(event);
			if (multiBlockSelection) return;
			if (event.key === 'ArrowLeft') {
				const chain = zoomRoot ? ancestorIds(blocks, zoomRoot) : [];
				setZoomRoot(chain.length > 0 ? chain[chain.length - 1] : null);
			} else {
				const id = selectionSurfaceId(event.target);
				const target = blocks.find((block) => block.id === id);
				if (target && target.type !== 'separator' && target.type !== 'image') setZoomRoot(id);
			}
			return;
		}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los diez tests.

- [ ] **Step 5: Las dos filas de la ayuda**

En `src/lib/components/HelpDialog.svelte`, agregar al final de los `items` del grupo `'Escribir'`:

```js
				{ keys: ['Alt', '→'], desc: 'Entrar en el renglón (verlo como si fuera la nota)' },
				{ keys: ['Alt', '←'], desc: 'Salir un nivel' }
```

- [ ] **Step 6: Documentar el atajo**

En `docs/guia/22-entrar-en-un-renglon.md`, agregar al final de *Cómo se entra*:

```markdown
- **Con el teclado:** `Alt+→` entra en el renglón donde está el cursor y
  `Alt+←` sale un nivel. En Mac, esa combinación deja de mover el cursor
  palabra por palabra mientras estás en una nota; `⌘+←/→` sigue funcionando
  para ir al principio o al final de la línea.
```

En `docs/guia/03-escribir-y-organizar.md`, agregar las dos filas a la tabla de teclas:

```markdown
| **Alt+→** | **Entra** en el renglón: lo abre como si fuera la nota entera (ver el tema 22) |
| **Alt+←** | **Sale** un nivel |
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/editor/Editor.svelte src/lib/components/HelpDialog.svelte e2e/entrar-en-un-renglon.spec.ts docs/guia/22-entrar-en-un-renglon.md docs/guia/03-escribir-y-organizar.md
git commit -m "feat(043): Alt+flecha entra y sale de un renglón"
```

---

### Task 10: Arrastrar dentro de la vista

**Files:**
- Modify: `src/lib/editor/dragReorder.svelte.js`
- Modify: `src/lib/editor/Editor.svelte`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `planDrop(blocks, draggedIds, newParentId, insertIndex, rootId)` y `orderedSelectionRoots(blocks, ids, rootId)` (Task 4); `zoomRoot` (Task 6).
- Produces: opción nueva de `createDragReorder({ … getRootId })`, con valor por defecto `() => null`.

- [ ] **Step 1: Escribir el e2e que falla**

Agregar a `e2e/entrar-en-un-renglon.spec.ts`:

```ts
test('arrastrar al margen izquierdo cuelga de la raíz de la vista, no de la nota', async ({
	page
}) => {
	await notaConRama(page);

	// Anidar Hijo 2 debajo de Hijo 1 para tener algo que sacar de nivel adentro.
	await page.getByText('Hijo 2', { exact: true }).click();
	await page.keyboard.press('Tab');
	await page.waitForTimeout(200);

	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	const origen = page.locator('main [data-block-id]', { hasText: 'Hijo 2' }).first();
	const handle = origen.getByRole('button', { name: 'Seleccionar o arrastrar renglón' });
	const caja = await origen.boundingBox();
	await handle.hover();
	await page.mouse.down();
	await page.mouse.move(caja.x - 80, caja.y + caja.height / 2, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(300);

	// Sigue adentro y sigue viéndose: si colgara del primer nivel de la NOTA,
	// se iría de la pantalla.
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	const fila = page.locator('main [data-block-id]', { hasText: 'Hijo 2' }).first();
	await expect(fila).toHaveCSS('padding-left', '0px');
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL — al soltar en el margen, `Hijo 2` queda colgando del primer nivel de la nota y desaparece de la vista, así que la lista queda en `['Hijo 1']`.

- [ ] **Step 3: Pasar la raíz al controlador de arrastre**

En `src/lib/editor/dragReorder.svelte.js`:

```js
export function createDragReorder({
	getBlocks,
	getSelectedIds,
	getListEl,
	onApply,
	// Desde qué renglón se está dibujando (spec 043). `null` es la nota entera.
	getRootId = () => null,
	onHandleClick = (..._args) => {},
	onSelectionClick = () => {}
}) {
```

`depthOf` y `measure` miden **la vista**:

```js
	function depthOf(blockId) {
		for (const { block, depth } of buildVisibleList(getBlocks(), getRootId())) {
			if (block.id === blockId) return depth;
		}
		return 0;
	}
```

```js
		for (const { block, depth, hasChildren } of buildVisibleList(getBlocks(), getRootId())) {
```

Las dos llamadas a `orderedSelectionRoots` (en `armFromPointer` y en `armFromHandle`):

```js
		draggedIds = orderedSelectionRoots(getBlocks(), ids, getRootId());
```

Y la traducción, en `onUp`. Es el único lugar donde se hace, como pide la spec: `resolveDrop` es geometría pura y no sabe de raíces, así que `planDrop` no se entera de que hubo una traducción.

```js
		const rootId = getRootId();
		// Profundidad 0 dentro de la vista es "colgando de la raíz de la vista",
		// nunca del primer nivel de la nota: eso sacaría el renglón de la pantalla.
		const plan = planDrop(
			getBlocks(),
			ids,
			target.newParentId ?? rootId,
			target.insertIndex,
			rootId
		);
```

En `src/lib/editor/Editor.svelte`, pasar la función al crear el controlador:

```js
	const reorder = createDragReorder({
		getBlocks: () => blocks,
		getSelectedIds: () => (blockSelectionActive ? selectedIds : []),
		getListEl: () => listEl,
		getRootId: () => zoomRoot,
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon move-blocks`
Expected: PASS. `move-blocks` cubre el arrastre sin raíz y tiene que seguir igual.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/dragReorder.svelte.js src/lib/editor/Editor.svelte e2e/entrar-en-un-renglon.spec.ts
git commit -m "feat(043): arrastrar al margen cuelga de la raíz de la vista"
```

---

### Task 11: Volver donde estabas, y qué pasa si el renglón se fue

**Files:**
- Modify: `src/lib/editor/Editor.svelte`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `rememberZoomRoot`, `getZoomRoots`, `setZoomRoots` (Task 5); `setZoomRoot`, `zoomBlockId`, `zoomRoot`, `createFirstChild` (Task 6).
- Produces: `function rememberZoom(blockId)` dentro de `Editor.svelte`.

- [ ] **Step 1: Escribir los e2e que fallan**

Agregar a `e2e/entrar-en-un-renglon.spec.ts`:

```ts
test('recargar estando adentro sigue adentro', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await page.waitForTimeout(400); // la preferencia se escribe fuera del clic

	await page.reload();
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toBeVisible();
});

test('buscar y saltar a un renglón de otra rama muestra la nota entera', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');
	await expect.poll(() => blockTexts(page)).toEqual(['Hijo 1', 'Hijo 2']);

	await page.keyboard.press('Control+k');
	await page.keyboard.type('Suelto');
	await page.waitForTimeout(400);
	await page.keyboard.press('Enter');
	await page.waitForTimeout(400);

	// El renglón buscado vive en otra rama: la nota entera es la única vista que
	// lo muestra.
	await expect.poll(() => blockTexts(page)).toEqual(['Padre', 'Hijo 1', 'Hijo 2', 'Suelto']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toHaveCount(0);
});
```

> Si el atajo de búsqueda de este entorno no es `Control+k`, usar el botón de buscar de la barra lateral: lo importante es llegar al renglón `Suelto` desde la búsqueda.

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL — al recargar vuelve la nota entera (no se guarda nada todavía).

- [ ] **Step 3: Guardar, leer y avisar**

En `src/lib/editor/Editor.svelte`, ampliar el import de storage con `getZoomRoots` y `setZoomRoots`, y agregar:

```js
	import { rememberZoomRoot } from '$lib/settings/zoom-root';
```

Agregar la escritura junto a `setZoomRoot`:

```js
	// Dónde quedó parada esta persona en esta nota, en ESTE aparato. Se escribe
	// sin esperar: perder esta escritura cuesta "volver a la nota entera", que es
	// exactamente lo que ya se ve si nunca se guardó nada.
	function rememberZoom(blockId) {
		getZoomRoots()
			.then((stored) => setZoomRoots(rememberZoomRoot(stored, noteId, blockId)))
			.catch(() => {});
	}
```

y llamarla desde `setZoomRoot`, justo después de `zoomBlockId = next;`:

```js
		zoomBlockId = next;
		rememberZoom(next);
```

Agregar el aviso de que el renglón se fue, debajo del bloque de derivados del zoom:

```js
	// El renglón donde se estaba parado desapareció desde afuera (otro aparato,
	// importar, restaurar): se sale a la nota entera y se avisa.
	//
	// Es un efecto y no un derivado a propósito, y no calcula nada: la pantalla ya
	// está bien (de eso se ocupa `zoomRoot`). Acá sólo se hacen las dos cosas que
	// van hacia afuera — el aviso y limpiar la preferencia vieja.
	//
	// Sólo avisa si ese renglón llegó a estar a la vista: una preferencia guardada
	// por un aparato que después borró el renglón se ignora en silencio, porque
	// nadie estuvo ahí en esta pantalla.
	let zoomRootSeen = null;
	$effect(() => {
		if (zoomRoot) {
			zoomRootSeen = zoomRoot;
			return;
		}
		if (zoomBlockId === null) return;
		const vanished = zoomRootSeen === zoomBlockId;
		zoomBlockId = null;
		zoomRootSeen = null;
		rememberZoom(null);
		if (vanished) toast('El renglón donde estabas ya no existe.');
	});
```

En el efecto de carga de la nota, agregar a la parte **síncrona** (junto a `selection = null; selectionMenu = null;`):

```js
		// La raíz es de ESTA nota: la próxima no hereda dónde estabas parado en la
		// anterior.
		zoomBlockId = null;
		zoomRootSeen = null;
```

y en la parte **asíncrona**, después de `await refreshTags();`:

```js
		// Volver a una nota deja a la persona donde estaba (spec 043). El salto
		// desde la búsqueda o la Agenda gana: ahí se pide un renglón que puede
		// estar en cualquier rama, y la nota entera es la única vista que lo
		// muestra siempre. Un id inválido o de otra nota lo descarta `zoomRoot`,
		// sin error y sin aviso.
		if (!jumpingToBlock) {
			const stored = await getZoomRoots();
			if (cancelled) return;
			const savedRoot = stored?.[id];
			if (savedRoot && loadedBlocks.some((block) => block.id === savedRoot)) {
				zoomBlockId = savedRoot;
				// La rama pudo quedarse sin hijos desde otro aparato: una vista sin
				// renglones no tiene dónde escribir.
				if (buildVisibleList(blocks, savedRoot).length === 0) await createFirstChild(savedRoot);
			}
		}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los trece tests.

- [ ] **Step 5: Comprobar que un respaldo no mueve a nadie de lugar**

Run: `pnpm test:unit -- --run src/lib/export-import/`
Expected: PASS sin cambiar ninguna expectativa: `zoomRootByNote` no es `backupSafe`, así que no entra ni al archivo ni al `replaceAllTables`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/Editor.svelte e2e/entrar-en-un-renglon.spec.ts
git commit -m "feat(043): volver a una nota te deja donde estabas"
```

---

### Task 12: Las reglas de borde que quedan

**Files:**
- Modify: `src/lib/editor/Editor.svelte`
- Test: `e2e/entrar-en-un-renglon.spec.ts`

**Interfaces:**
- Consumes: `setZoomRoot(id)`, `createFirstChild(parentId)`, `zoomRoot`, `ancestorIds` (Tasks 1, 6).
- Produces: nada para tareas posteriores.

Dos reglas de la spec todavía no tienen código:

1. **Borrar desde el `⋯` el renglón en el que se está parado** → primero se sale un nivel (a su padre, o a la nota), después se borra.
2. **Borrar desde el `⋯` el último renglón de la vista** → se borra y se crea uno vacío enfocado: la vista nunca queda sin dónde escribir. Hoy `handleDeleteBlock` sólo protege que la NOTA no quede sin renglones (`blocks.length === 0`), y adentro de una rama eso se cumple sobrado con la nota entera de testigo.

- [ ] **Step 1: Escribir los e2e que fallan**

Agregar a `e2e/entrar-en-un-renglon.spec.ts`:

```ts
async function borrarDesdeElMenu(page, texto) {
	const row = page.locator('main [data-block-id]', { hasText: texto }).first();
	await row.hover();
	await row.getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Eliminar' }).click();
}

test('borrar el renglón donde estás parado sale un nivel primero', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	const titulo = page.locator('[data-zoom-title]');
	await titulo.hover();
	await titulo.getByRole('button', { name: 'Más acciones' }).click();
	await page.getByRole('menuitem', { name: 'Eliminar' }).click();
	await page.waitForTimeout(300);

	// Se salió a la nota entera y Padre (con su rama) ya no está.
	await expect.poll(() => blockTexts(page)).toEqual(['Suelto']);
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toHaveCount(0);
});

test('borrar el último renglón de la vista deja uno vacío enfocado', async ({ page }) => {
	await notaConRama(page);
	await entrarDesdeElMenu(page, 'Padre');

	await borrarDesdeElMenu(page, 'Hijo 2');
	await page.waitForTimeout(250);
	await borrarDesdeElMenu(page, 'Hijo 1');
	await page.waitForTimeout(250);

	// Sigue adentro, con un renglón vacío listo para escribir.
	await expect(page.getByRole('navigation', { name: 'Dónde estás' })).toBeVisible();
	await expect.poll(() => blockTexts(page)).toEqual(['']);
	await page.keyboard.type('De nuevo');
	await expect.poll(() => blockTexts(page)).toEqual(['De nuevo']);
});
```

- [ ] **Step 2: Correr y ver el rojo**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: FAIL en los dos: el primero deja las migas apuntando a un renglón borrado (el aviso de la Task 11 dispara y el texto esperado no coincide con el momento); el segundo deja la vista sin ningún renglón.

- [ ] **Step 3: Implementar las dos reglas**

En `handleDeleteBlock` de `src/lib/editor/Editor.svelte`:

```js
	async function handleDeleteBlock(block) {
		if (!canDeleteFromMenu(blocks, block.id)) return;
		// Borrar el renglón donde se está parado: primero se sale un nivel (a su
		// padre, o a la nota entera), y recién después se borra. Al revés, la vista
		// se queda un instante apoyada en un renglón que ya no existe (spec 043).
		if (block.id === zoomRoot) {
			const chain = ancestorIds(blocks, block.id);
			await setZoomRoot(chain.length > 0 ? chain[chain.length - 1] : null);
		}
		recordSnapshot();
		const prevId = previousVisibleId(blocks, block.id, zoomRoot);
		const ids = [block.id, ...listDescendantIds(blocks, block.id)];
		await softDeleteBlocks(ids);
		const removed = new Set(ids);
		blocks = blocks.filter((row) => !removed.has(row.id));
		// canDeleteFromMenu sólo cuenta renglones, y acá se va el subárbol entero:
		// una nota con padre + hijo pasa el guardia y queda en cero. Igual que al
		// borrar una selección, la nota nunca se queda sin dónde escribir.
		if (blocks.length === 0) {
			const created = await createBlock({ noteId: note.id, type: 'text' });
			blocks = [created];
			focusBlockId = created.id;
			return;
		}
		// Lo mismo, mirado desde la vista: adentro de una rama la nota entera hace
		// de testigo y el guardia de arriba nunca se dispara, pero la VISTA sí
		// puede quedar sin un solo renglón donde escribir.
		if (zoomRoot && buildVisibleList(blocks, zoomRoot).length === 0) {
			await createFirstChild(zoomRoot);
			return;
		}
		focusBlockId = prevId ?? buildVisibleList(blocks, zoomRoot)[0]?.block.id ?? null;
	}
```

> La última línea también cambia: `blocks[0]?.id` podía ser un renglón de otra rama, o sea fuera de la vista.

Hacer lo mismo en `deleteSelection`, que borra un grupo: agregar, después de filtrar `blocks`, la misma red de la vista.

```js
		if (zoomRoot && buildVisibleList(blocks, zoomRoot).length === 0) {
			await createFirstChild(zoomRoot);
			return;
		}
```

- [ ] **Step 4: Correr y ver el verde**

Run: `pnpm test:e2e entrar-en-un-renglon`
Expected: PASS los quince tests.

Run: `pnpm test:unit -- --run && pnpm check`
Expected: PASS, sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/Editor.svelte e2e/entrar-en-un-renglon.spec.ts
git commit -m "feat(043): borrar nunca deja la vista sin dónde escribir"
```

---

### Task 13: Suite completa y gate a mano

**Files:**
- Modify: `docs/guia/22-entrar-en-un-renglon.md` (sólo si el gate encuentra algo que contar)
- Modify: `CHANGELOG.md` (ídem)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el veredicto.

- [ ] **Step 1: La suite entera**

```bash
pnpm test:unit -- --run
pnpm check
pnpm test:e2e
```

Expected: unit en verde; `svelte-check` sin errores nuevos; e2e en verde. **Un flake tiene que probarse preexistente contra `main`, no declararse** — correr la prueba sospechosa diez veces en la base antes de descartarla.

- [ ] **Step 2: El gate a mano en el navegador**

Ninguno de estos pasos lo cubre un e2e, y son los que la spec pone como criterio de aceptación. Correr `pnpm dev` y hacerlos en orden, anotando el resultado de cada uno:

1. Entrar en un renglón con el ícono, con el `⋯` y con `Alt+→`. Salir con la miga y con `Alt+←`.
2. Entrar en un renglón **colapsado**: se ven sus hijos. Salir: sigue colapsado.
3. Estando adentro, escribir en el renglón-título, recargar la página: el texto está y se sigue adentro.
4. Estando adentro, `Copiar nota` y exportar: entregan la **nota entera**.
5. Entrar en una rama a seis niveles de profundidad: las migas abrevian el medio (`Nota › … › X ›`) y cada escalón lleva a donde dice.
6. Con `Reducir movimiento` prendido en el sistema: entrar, salir y saltar migas siguen funcionando; no se pierde ninguna función.
7. Ventana angosta (simular un celular en el navegador): **no** se dibuja el ícono de entrar, el `⋯` sí tiene *Entrar acá*, y las migas se pueden desplazar de costado.
8. Con la nota compartida en sólo lectura (spec 038): el ícono de entrar y el ítem del menú **están**, entrar funciona, y entrar en un renglón sin hijos **no crea nada** — queda el título y la vista vacía.
9. Salir desde una rama que estaba **abajo** en una nota larga: el renglón donde se estaba queda a la vista, sin buscarlo.
10. Estando adentro, buscar un renglón de otra rama con `Cmd/Ctrl+K` y saltar: aparece la nota entera.
11. En reposo (sin el mouse encima) la nota se ve igual que antes, salvo el hueco reservado a la izquierda.
12. Con dos aparatos o dos pestañas: borrar desde el otro lado el renglón donde se está parado. Aparece *"El renglón donde estabas ya no existe."* y vuelve la nota entera.

- [ ] **Step 3: El gate en la app de escritorio**

Empaquetar y repetir los pasos 1, 3, 9 y 12 en la `.app`. Los cuatro comandos van en orden y **no los escribe Hernán**; saltear `build:flat` da una app que parece sana y sólo falla el agente. El `open` sobre una `.app` que ya está corriendo **no** relanza la build nueva: cerrarla primero.

- [ ] **Step 4: Contar el resultado**

Reportar a Hernán, en castellano simple: qué se puede hacer ahora, qué pasos del gate pasaron y cuáles no, y si algo quedó afuera. **Un paso del gate que pasa vacíamente es peor que uno que falla**: si un paso no se pudo comprobar de verdad, decirlo así.

- [ ] **Step 5: Cerrar**

Con el gate pasado, `git push`. Antes: `git status -sb` para confirmar que se sube `main` y no una rama tildada.

---

## Self-Review

**Cobertura de la spec:**

| Sección de la spec | Dónde entra |
|---|---|
| `zoomBlockId` en el editor | Task 6 |
| Ícono en escritorio | Task 8 |
| Ítem *Entrar acá* en el `⋯` | Task 6 |
| `Alt+→` / `Alt+←` | Task 9 |
| Migas | Task 6 |
| Renglón-título editable en el lugar | Task 7 |
| Memoria por nota | Tasks 5 y 11 |
| `Where The Root Enters The Pure Modules` | Tasks 1-4 |
| `Boundary Rules` (8 reglas) | Task 3 (Shift+Tab), Task 2 (Backspace ×2), Task 10 (arrastre), Task 12 (borrar ×2), Task 6 (colapsado, sin hijos), Task 11 (el renglón se fue) |
| `Changing The Root Is A Reset` | Task 6, `setZoomRoot` |
| `Motion` + `scrollIntoView` al salir | Tasks 6 y 8 |
| Sólo lectura / notas de invitado | Task 6 (ítem fuera de `noteOnly`), Task 7 (`createFirstChild` no escribe), gate paso 8 |
| Ayuda, guía, changelog | Tasks 6, 8, 9 |

**Dos apartamientos de la spec, a propósito:**

1. **`planDrop` sí recibe `rootId`** (Task 4). La spec dice que no se toca, pero `planDrop` llama a `orderedSelectionRoots`, que camina la lista visible: entrando en un renglón colapsado —caso que la spec permite por escrito— el arrastre dejaría de funcionar en silencio. Es un parámetro opcional hacia adentro; la traducción de "profundidad 0" sigue en `dragReorder`, como pide la spec.
2. **`selectionRange`, `neighborVisibleId` y `planTypeChangeSelection` también reciben `rootId`** (Task 4). La spec sólo nombra `visibleIds`, pero esa función es privada del módulo: sus tres consumidores exportados son los que el editor llama, y sin el parámetro la selección múltiple y el menú de grupo quedan muertos dentro de una raíz colapsada.

**Deuda anotada, no incluida:** bajar con `↓` desde el renglón-título no lleva al primer hijo (`Enter` sí). La spec no lo pide y `neighborVisibleId` devuelve `null` ahí porque el título no está en la vista. Si molesta al usarlo, es un caso de tres líneas en `handleVerticalArrow`.
