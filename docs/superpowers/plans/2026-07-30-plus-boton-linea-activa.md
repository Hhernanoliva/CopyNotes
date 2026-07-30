# Botón + en la línea activa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón `+` que aparece en el casillero del "grip" cuando el
renglón activo está vacío, y hace exactamente lo mismo que tipear `/`
(alternativa de mouse al atajo de teclado).

**Architecture:** Editor.svelte ya trackea en vivo cuál es el bloque
enfocado (`activeBlockId`). Se pasa como prop nueva `active` a BlockRow. Ahí,
un `$derived` decide si mostrar `+` en vez del grip. El click no agrega
lógica de menú nueva: usa `document.execCommand('insertText', false, '/')`
sobre el contenteditable ya enfocado, lo que dispara el mismo evento
`input` nativo que ya maneja `handleBlockInput` cuando el usuario tipea `/`
a mano — mismo pipeline, cero estado nuevo. Cruce visual grip↔+ con `fade`
de Svelte (Quiet Motion, 150ms), mismo patrón que el sol/luna del navbar.

**Tech Stack:** Svelte 5 (runes), Tailwind, `@lucide/svelte`, Playwright (e2e).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-plus-boton-linea-activa-design.md`
- `+` solo cuando: `block.content === ''` Y `active` Y `block.type` no es
  `code` ni `separator`.
- Ocupa el mismo casillero que el grip (no agrega ancho, no empuja nada — ya
  hay precedente de bug de layout shift en esta sesión, evitarlo de nuevo).
- Motion: `fade` de `svelte/transition` a `motionDuration(MOTION.fast)`
  (`$lib/motion`), con el guard `ready` en el `in:` inicial (mismo patrón que
  el check del checkbox en `BlockRow.svelte`).
- Fuera del tab-order (mismo criterio que el grip: ya existe camino 100%
  teclado vía `/`).
- Toda funcionalidad visible al usuario se documenta en `docs/guia/` en el
  mismo commit (regla del proyecto, `CLAUDE.md`).

---

### Task 1: Botón + con motion, prop `active`, y test e2e

**Files:**
- Modify: `src/lib/editor/Editor.svelte:1748` (agregar prop `active` al llamado de `BlockRow`)
- Modify: `src/lib/editor/BlockRow.svelte:9` (import `Plus`)
- Modify: `src/lib/editor/BlockRow.svelte:8` (import `fade`)
- Modify: `src/lib/editor/BlockRow.svelte:34` (prop `active = false`)
- Modify: `src/lib/editor/BlockRow.svelte:133-137` (derived `showPlus`)
- Modify: `src/lib/editor/BlockRow.svelte:512-514` (función `insertSlashTrigger`)
- Modify: `src/lib/editor/BlockRow.svelte:538-549` (template: swap grip↔+)
- Modify: `docs/guia/02-notas-y-tipos-de-renglon.md:25-26` (documentar el botón)
- Test: `e2e/slash.spec.ts`

**Interfaces:**
- Consumes: `activeBlockId` (ya existe en `Editor.svelte:107`, actualizado
  vía `onActive={(row) => (activeBlockId = row.id)}` en `Editor.svelte:1770`).
  `MOTION`, `motionDuration` de `$lib/motion` (ya importados en
  `BlockRow.svelte:10`). `tooltip` action (ya importada, `BlockRow.svelte:16`).
  `el` (contenteditable ref, ya existe en `BlockRow.svelte:88`).
- Produces: prop `active` en `BlockRow` (boolean, default `false`) — no lo
  consume ninguna otra tarea, este plan tiene una sola tarea.

- [ ] **Step 1: Escribir el test e2e que falla**

Agregar en `e2e/slash.spec.ts`, después del test `'Tab picks the highlighted
command, same as Enter'` (que termina con `});` cerca de la línea 70):

```typescript
test('the "+" button opens the same menu as typing "/"', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();

	const first = page.locator('main [data-block-id] .block-editable').first();
	await first.click();

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeHidden();

	const plusButton = page.getByRole('button', { name: 'Agregar bloque' });
	await expect(plusButton).toBeVisible();
	await plusButton.click();
	await expect(menu).toBeVisible();

	await page.keyboard.type('tarea');
	await page.keyboard.press('Enter');
	await expect(menu).toBeHidden();
	await expect(page.locator('main [role="checkbox"]').first()).toBeVisible();
});
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `npx playwright test e2e/slash.spec.ts -g "the .+. button" --reporter=line`
Expected: FAIL — `plusButton` no aparece (`toBeVisible()` timeout), porque
el botón todavía no existe.

- [ ] **Step 3: Pasar `active` desde Editor.svelte**

En `src/lib/editor/Editor.svelte`, línea 1748, agregar la prop justo después
de `focused`:

```svelte
					focused={focusBlockId === row.block.id}
					active={activeBlockId === row.block.id}
```

- [ ] **Step 4: Imports en BlockRow.svelte**

Línea 8, agregar `fade` al import existente de `svelte/transition`:

```svelte
	import { fade, scale } from 'svelte/transition';
```

Línea 9, agregar `Plus` al import existente de `@lucide/svelte`:

```svelte
	import { ChevronRight, Check, Copy, CopyPlus, GripVertical, Plus } from '@lucide/svelte';
```

- [ ] **Step 5: Prop `active`**

Línea 34, agregar la prop nueva junto a `focused`:

```svelte
		focused = false,
		active = false,
```

- [ ] **Step 6: `$derived` que decide si se muestra el +**

Cerca de la línea 133 (donde ya están `isLongCode`, `codePreview`, `dueLabel`
como `$derived`), agregar:

```javascript
	// El botón + es una alternativa de mouse a tipear "/", pensada para quien
	// no conoce el atajo (spec: docs/superpowers/specs/2026-07-30-plus-boton-linea-activa-design.md).
	const showPlus = $derived(
		active && block.content === '' && block.type !== 'code' && block.type !== 'separator'
	);
```

- [ ] **Step 7: Handler de click**

Después de la función `focusContent` (línea 512-514), agregar:

```javascript
	// Dispara el mismo evento `input` nativo que ya maneja handleInput cuando
	// el usuario tipea "/" a mano — mismo pipeline que abre el menú, cero
	// estado nuevo. Precedente en este archivo: document.execCommand('insertLineBreak')
	// ya simula una tecla física dentro del mismo flujo de eventos.
	function insertSlashTrigger() {
		el?.focus();
		document.execCommand('insertText', false, '/');
	}
```

- [ ] **Step 8: Template — swap grip↔+ con fade**

Reemplazar el bloque completo de las líneas 538-549 (el `<div>` del grip
handle, con su comentario) por:

```svelte
	<!-- Grip handle: grab to move this row (and any active selection). Shown on
	     hover/focus. Not editable, so dragging never fights text selection.
	     Keyboard users move rows with Alt+↑/↓, so this stays out of the tab order.
	     On the active empty line it swaps for a "+" that opens the same menu as
	     typing "/" — a mouse-first alternative for people who don't know the
	     shortcut. -->
	<div class="relative flex h-7 w-4 shrink-0 items-center justify-center">
		{#if showPlus}
			<button
				type="button"
				aria-label="Agregar bloque"
				use:tooltip={'Agregar (o escribí "/")'}
				onclick={insertSlashTrigger}
				in:fade={{ duration: ready ? motionDuration(MOTION.fast) : 0 }}
				out:fade={{ duration: motionDuration(MOTION.fast) }}
				class="cn-affordance cn-tap text-faint hover:text-foreground focus-visible:ring-ring absolute flex h-7 w-4 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<Plus size={14} aria-hidden="true" />
			</button>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				aria-hidden="true"
				use:tooltip={'Arrastrar para mover'}
				onpointerdown={(event) => {
					event.stopPropagation();
					onDragHandle?.(block.id, event);
				}}
				in:fade={{ duration: ready ? motionDuration(MOTION.fast) : 0 }}
				out:fade={{ duration: motionDuration(MOTION.fast) }}
				class="cn-affordance cn-tap text-faint hover:text-foreground absolute flex h-7 w-4 cursor-grab touch-none items-center justify-center rounded-sm opacity-0 transition-opacity duration-(--motion-fast) group-focus-within:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
			>
				<GripVertical size={14} aria-hidden="true" />
			</div>
		{/if}
	</div>
```

Nota: el `<div>` padre pasa de `flex h-7 w-4` (estático) a
`relative flex h-7 w-4` — los dos hijos son `absolute` para que, mientras
se cruzan, ninguno afecte el layout de la fila (mismo motivo que el fix de
"Guardado" de esta sesión).

- [ ] **Step 9: Correr `svelte-check`**

Run: `npx svelte-check --output human`
Expected: mismos 2 errores preexistentes de
`src/lib/storage/db.migrations.test.ts` (no relacionados), 0 errores en
`Editor.svelte` o `BlockRow.svelte`.

- [ ] **Step 10: Correr el test e2e y confirmar que pasa**

Run: `npx playwright test e2e/slash.spec.ts --reporter=line`
Expected: PASS — los 6 tests del archivo (5 existentes + el nuevo).

- [ ] **Step 11: Regresión — suite completa**

Run: `npx vitest run` y `npx playwright test --reporter=line`
Expected: todo verde, ningún test roto por el cambio de layout del grip.

- [ ] **Step 12: Documentar en la guía de usuario**

En `docs/guia/02-notas-y-tipos-de-renglon.md`, después de la línea 26,
agregar:

```markdown
- También podés tocar el botón **+** que aparece a la izquierda de un
  renglón vacío mientras lo estás escribiendo: abre el mismo menú, sin
  necesitar tipear `/`. Pensado para quien no conoce el atajo de teclado.
```

Actualizar además la fecha de "Última actualización" en
`docs/guia-de-uso.md` (línea 5) a la fecha del commit, con una frase corta
sobre el botón +.

- [ ] **Step 13: Commit**

```bash
git add src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte \
  e2e/slash.spec.ts docs/guia/02-notas-y-tipos-de-renglon.md docs/guia-de-uso.md
git commit -m "$(cat <<'EOF'
feat(editor): botón + como alternativa visual a "/"

En la línea activa vacía, el casillero del grip muestra un + en vez
del ícono de arrastrar. Al tocarlo dispara el mismo evento que tipear
"/" a mano, así que abre exactamente el mismo menú sin lógica nueva.
Pensado para quien no conoce el atajo de teclado.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
