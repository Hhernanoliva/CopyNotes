# Accesibilidad Mobile/Tablet del Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el editor de CopyNotes sea usable con el dedo (celular/tablet): controles visibles y tocables, salida de anidación y notas sin teclas físicas, y menús que no queden tapados por el teclado en pantalla.

**Architecture:** Detección por **capacidad**, no por dispositivo. Cero bandera global `esTáctil`. Se usan tres señales estándar, cada una para su problema: consultas CSS `(hover: none)` / `(pointer: coarse)` para mostrar controles fijos y agrandar toques; el evento `beforeinput` para que Enter funcione aunque el teclado virtual no dispare la tecla clásica; y la API `visualViewport` para reposicionar menús flotantes por encima del teclado. Los cambios de comportamiento nuevo pasan por las mismas "puertas" (handlers) que ya usa el desktop, para no duplicar lógica.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind CSS v4, Vitest (unidad), Playwright chromium+webkit (e2e).

## Global Constraints

- Svelte 5 runes: `$derived` para valores, `$effect` solo para efectos externos con cleanup. No `onMount` para inicializar libs. No destructurar `$state`. (CLAUDE.md global)
- JavaScript plano dentro de `.ts`/`.svelte`: sin anotaciones de tipo salvo pedido explícito. Componentes shadcn generados quedan intactos. (CLAUDE.md proyecto)
- Tokens de diseño vía variables CSS shadcn (`muted-foreground`, `destructive`, …); nunca color crudo. Toque mínimo existente: `--touch-target: 2.75rem` (44px) ya definido en `src/app.css:180`. Reutilizarlo, no inventar otro.
- Toda feature visible al usuario se documenta en `docs/guia/` **en el mismo commit** y se actualiza la fecha del índice `docs/guia-de-uso.md`.
- Explicar decisiones a Hernán en español llano. Plan → aprobación → TDD.
- Commits en inglés, convencionales, con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Comandos de test: `npm run test -- <ruta>` (unidad, una corrida), `npm run test:e2e -- e2e/<archivo>` (chromium), `npm run test:e2e:webkit` (WebKit).

---

## File Structure

**Nuevos archivos**
- `src/lib/actions/keyboardInset.js` — acción Svelte que mantiene un elemento flotante por encima del teclado virtual usando `visualViewport`. Una responsabilidad: leer el alto tapado por el teclado y exponerlo/aplicarlo. Reutilizada por SlashMenu, DatePanel, TagPicker y la barra de formato.
- `src/lib/editor/mobileInput.ts` — funciones puras que traducen un evento `beforeinput` (inputType) a la intención del editor (`'enter' | 'softbreak' | null`). Testeable sin DOM.
- `e2e/mobile-a11y.spec.ts` — e2e con viewport de celular y `hasTouch` para lo que Playwright sí puede verificar (visibilidad de controles, tamaños, menú de acciones, alineación de fecha).

**Archivos modificados**
- `src/app.css` — reglas `@media (hover: none)` / `(pointer: coarse)` que fijan y agrandan los controles del editor. Clase utilitaria `cn-affordance`.
- `src/lib/editor/BlockRow.svelte` — clase compartida en grip/chevron/acciones; fecha alineada arriba; handler `beforeinput`; nuevas acciones en el menú.
- `src/lib/editor/BlockActionsMenu.svelte` — ítems "Agregar nota", "Mover arriba/abajo", "Eliminar".
- `src/lib/editor/Editor.svelte` — nuevo `handleDeleteBlock`; pasar props nuevas a la fila.
- `src/lib/editor/FloatingFormattingToolbar.svelte`, `SlashMenu.svelte`, `DatePanel.svelte`, `src/lib/components/TagPicker.svelte` — ancho acotado a viewport + acción `keyboardInset`.
- `src/lib/editor/FormattingButton.svelte`, `src/lib/components/TagChips.svelte` — área de toque 44px en puntero grueso.
- `docs/guia/` — topic de uso en celular/tablet.

**Orden por riesgo:** Fase C (confirmado, sin dispositivo) → Fase A (confirmado, sin dispositivo) → Fase B (necesita verificación en tu teléfono/tablet).

---

## FASE C — Ajustes puntuales (confirmados, bajo riesgo)

### Task C1: Fecha 📅 alineada arriba en líneas de varios renglones

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte:629-638`
- Test: `e2e/mobile-a11y.spec.ts`

**Interfaces:**
- Consumes: fila con `block.dueDate` y contenido largo.
- Produces: botón de fecha con top ≈ top de la fila (no centrado).

- [ ] **Step 1: Escribir el e2e que falla**

En `e2e/mobile-a11y.spec.ts`, con viewport de celular (`{ width: 390, height: 780 }`, `hasTouch: true`), crear una línea con texto que ocupe varios renglones y una fecha, luego verificar que el badge se alinea al tope:

```js
test('la fecha queda arriba en una línea de varios renglones', async ({ page }) => {
  await page.goto('/');
  const line = page.locator('[data-block-surface]').first();
  await line.click();
  await line.pressSequentially('palabra '.repeat(40)); // fuerza varios renglones
  // asignar fecha vía slash
  await line.pressSequentially('/fecha');
  await page.getByRole('option', { name: 'Fecha' }).click();
  await page.getByRole('button', { name: 'Hoy' }).click();

  const row = page.locator('[data-block-id]').first();
  const badge = page.getByRole('button', { name: 'Cambiar fecha' });
  const rowBox = await row.boundingBox();
  const badgeBox = await badge.boundingBox();
  // el tope del badge está cerca del tope de la fila (no centrado verticalmente)
  expect(badgeBox.y - rowBox.y).toBeLessThan(16);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "fecha queda arriba"`
Expected: FAIL — con `self-center` el badge queda hacia el medio; la diferencia supera 16px.

- [ ] **Step 3: Cambiar `self-center` por alineado arriba**

En `BlockRow.svelte:637`, dentro del `class` del botón de fecha, reemplazar `self-center` por `mt-1 self-start`. `mt-1` baja el badge para alinearlo con el primer renglón de texto (el editable tiene `min-h-7`).

```svelte
class="{overdue ? 'text-destructive' : 'text-muted-foreground'} hover:text-foreground focus-visible:ring-ring flex h-7 shrink-0 items-center gap-1 self-start mt-1 rounded-sm px-1.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "fecha queda arriba"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/BlockRow.svelte e2e/mobile-a11y.spec.ts
git commit -m "fix(editor): la fecha del renglón se alinea arriba, no al centro"
```

---

### Task C2: Barra de formato no se sale de pantalla angosta

**Files:**
- Modify: `src/lib/editor/FloatingFormattingToolbar.svelte:65-67` (contenedor) y `:33-42` (cálculo de posición)
- Test: `e2e/mobile-a11y.spec.ts`

**Interfaces:**
- Consumes: selección de texto en un celular angosto.
- Produces: barra cuyo ancho nunca supera el viewport; su contenido hace scroll horizontal interno si no entra.

- [ ] **Step 1: Escribir el e2e que falla**

```js
test('la barra de formato no supera el ancho de la pantalla', async ({ page }) => {
  await page.goto('/');
  const line = page.locator('[data-block-surface]').first();
  await line.click();
  await line.pressSequentially('texto para seleccionar');
  await line.press('Home');
  await line.press('Shift+End'); // selecciona todo el renglón
  const toolbar = page.getByRole('toolbar', { name: 'Formato de texto' });
  await toolbar.waitFor();
  const box = await toolbar.boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "barra de formato no supera"`
Expected: FAIL — la barra tiene ~13 botones en fila fija y se corta por el borde derecho.

- [ ] **Step 3: Acotar el ancho y permitir scroll interno**

En `FloatingFormattingToolbar.svelte`, contenedor raíz (`:67`): agregar `max-w-[calc(100vw-1rem)] overflow-x-auto` al `class`. En el cálculo de `left` (`:40`) ya se clampa al viewport, pero usando `box.width` que ahora puede ser mayor que el viewport; cambiar el clamp para no dejar el borde izquierdo negativo cuando la barra es tan ancha como la pantalla:

```js
const maxLeft = Math.max(margin, window.innerWidth - box.width - margin);
left = Math.min(Math.max(left, margin), maxLeft);
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "barra de formato no supera"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/FloatingFormattingToolbar.svelte e2e/mobile-a11y.spec.ts
git commit -m "fix(editor): la barra de formato se acota al ancho de pantalla en mobile"
```

---

## FASE A — Controles siempre alcanzables al tacto (confirmado)

### Task A1: Controles del editor visibles sin hover en punteros sin hover

**Files:**
- Modify: `src/app.css` (agregar bloque `@media (hover: none)`)
- Modify: `src/lib/editor/BlockRow.svelte:478` (grip), `:489-491` (chevron), `:657-658` (acciones) — sumar clase `cn-affordance`
- Test: `e2e/mobile-a11y.spec.ts`

**Interfaces:**
- Consumes: fila del editor en un contexto sin hover.
- Produces: grip, chevron y clúster de acciones con `opacity: 1` y `pointer-events: auto` cuando `(hover: none)`.

- [ ] **Step 1: Escribir el e2e que falla**

```js
test('los controles de la línea son visibles al tacto sin hover', async ({ page }) => {
  await page.goto('/');
  const line = page.locator('[data-block-surface]').first();
  await line.click();
  await line.pressSequentially('una línea');
  // sin hover: el botón de copiar debe estar visible (opacity 1)
  const copy = page.getByRole('button', { name: 'Copiar bloque' }).first();
  await expect(copy).toBeVisible();
  const opacity = await copy.evaluate((el) =>
    getComputedStyle(el.closest('.cn-affordance')).opacity);
  expect(Number(opacity)).toBe(1);
});
```
El proyecto de Playwright para este archivo debe emular sin-hover. En `e2e/mobile-a11y.spec.ts` fijar al inicio:

```js
test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
```
(`isMobile` hace que Chromium reporte `(hover: none)` y `(pointer: coarse)`.)

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "visibles al tacto"`
Expected: FAIL — hoy el clúster de acciones es `opacity-0` salvo hover/focus; sin `.cn-affordance` el selector ni existe.

- [ ] **Step 3: Sumar la clase compartida y la regla CSS**

En `BlockRow.svelte`, agregar `cn-affordance` al `class` de: el grip (`:478`), el botón chevron (`:489`, solo aplica cuando no está colapsado), y el contenedor de acciones (`:658`). No quitar las clases de hover/focus existentes — la regla nueva solo las vence cuando no hay hover.

En `src/app.css`, después del bloque de tooltip, agregar:

```css
/* En punteros sin hover (táctil), los controles de la línea no pueden
   depender de "pasar el mouse por encima": quedan siempre alcanzables. */
@media (hover: none) {
  .cn-affordance {
    opacity: 1 !important;
    pointer-events: auto !important;
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "visibles al tacto"`
Expected: PASS.

- [ ] **Step 5: Verificar que en desktop NO cambia (no romper la quietud actual)**

Run: `npm run test:e2e -- e2e/critical-flows.spec.ts`
Expected: PASS (el proyecto chromium por defecto tiene hover; la regla no aplica).

- [ ] **Step 6: Commit**

```bash
git add src/app.css src/lib/editor/BlockRow.svelte e2e/mobile-a11y.spec.ts
git commit -m "feat(editor): controles de línea visibles al tacto en punteros sin hover"
```

---

### Task A2: Área de toque de 44px en punteros gruesos

**Files:**
- Modify: `src/app.css` (bloque `@media (pointer: coarse)`)
- Modify: `src/lib/components/TagChips.svelte:12-20` (X de quitar etiqueta) — sumar clase `cn-tap`
- Modify: `src/lib/editor/FormattingButton.svelte:15` — sumar `cn-tap`
- Test: `e2e/mobile-a11y.spec.ts`

**Interfaces:**
- Consumes: controles chicos del editor (X de etiqueta 16px, botones de barra 32px).
- Produces: en `(pointer: coarse)`, cada control marcado tiene un área tocable ≥44px sin agrandar su ícono visible.

- [ ] **Step 1: Escribir el e2e que falla**

```js
test('la X de quitar etiqueta tiene área táctil de 44px', async ({ page }) => {
  await page.goto('/');
  const line = page.locator('[data-block-surface]').first();
  await line.click();
  await line.pressSequentially('con etiqueta #urgente ');
  const x = page.getByRole('button', { name: /Quitar etiqueta/ }).first();
  const box = await x.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
});
```
(Confirmar el `aria-label` real de la X en `TagChips.svelte` y ajustar el nombre del selector.)

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "área táctil de 44px"`
Expected: FAIL — la X mide 16px.

- [ ] **Step 3: Clase `cn-tap` que agranda el área sin agrandar el ícono**

En `src/app.css`, dentro de `@media (pointer: coarse)`:

```css
@media (pointer: coarse) {
  /* Agranda el área tocable a 44px mediante un pseudo-elemento invisible,
     sin cambiar el tamaño visual del control. */
  .cn-tap {
    position: relative;
  }
  .cn-tap::after {
    content: '';
    position: absolute;
    inset: 50%;
    width: var(--touch-target);
    height: var(--touch-target);
    transform: translate(-50%, -50%);
  }
}
```

Sumar `cn-tap` al `class` de: la X en `TagChips.svelte:17`, los botones de `FormattingButton.svelte:15`. (El grip, copiar, 3-puntitos y fecha ya miden 28px de alto; sumarles `cn-tap` también para llegar a 44px de toque — agregar la clase en `BlockRow.svelte` a esos botones.)

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "área táctil de 44px"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app.css src/lib/components/TagChips.svelte src/lib/editor/FormattingButton.svelte src/lib/editor/BlockRow.svelte e2e/mobile-a11y.spec.ts
git commit -m "feat(a11y): área de toque de 44px en controles del editor con puntero grueso"
```

---

### Task A3: Acciones de bloque en el menú (nota, mover, eliminar)

**Files:**
- Modify: `src/lib/editor/BlockActionsMenu.svelte` (nuevos props e ítems)
- Modify: `src/lib/editor/BlockRow.svelte:695-700` (pasar callbacks: `openNote`, `onMoveUp`, `onMoveDown`, `onDelete`)
- Modify: `src/lib/editor/Editor.svelte` (nuevo `handleDeleteBlock`; pasar `onDelete` a la fila en `:1565+`)
- Test: `src/lib/editor/note-delete.test.ts` (unidad de la guarda de borrado) + `e2e/mobile-a11y.spec.ts`

**Interfaces:**
- Consumes: `handleMoveUp`, `handleMoveDown`, `softDeleteBlock`, `previousVisibleId` (ya existen en Editor).
- Produces: `handleDeleteBlock(block)` en Editor; BlockActionsMenu con props `onAddNote`, `onMoveUp`, `onMoveDown`, `onDelete`.

- [ ] **Step 1: Escribir el test de unidad de la guarda de borrado**

El borrado desde el menú no debe dejar el editor vacío ni borrar en silencio un bloque con hijos. Función pura `canDeleteFromMenu(blocks, id)` en `src/lib/blocks/enter.ts` (junto a `canDeleteOnBackspace`). En `src/lib/blocks/enter.test.ts` agregar:

```js
import { canDeleteFromMenu } from './enter';

describe('canDeleteFromMenu', () => {
  it('no permite borrar el único bloque', () => {
    expect(canDeleteFromMenu([block('a')], 'a')).toBe(false);
  });
  it('permite borrar un bloque hoja habiendo otros', () => {
    expect(canDeleteFromMenu([block('a'), block('b')], 'a')).toBe(true);
  });
  it('permite borrar un bloque con hijos (se borra el subárbol)', () => {
    const blocks = [block('a'), block('b', 'a')];
    expect(canDeleteFromMenu(blocks, 'a')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test -- src/lib/blocks/enter.test.ts`
Expected: FAIL — `canDeleteFromMenu` no existe.

- [ ] **Step 3: Implementar la guarda**

En `src/lib/blocks/enter.ts`:

```js
// Borrar desde el menú (a diferencia de Backspace) puede eliminar un bloque
// con contenido y su subárbol; solo se prohíbe dejar el editor sin bloques.
export function canDeleteFromMenu(blocks, id) {
  return blocks.length > 1;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test -- src/lib/blocks/enter.test.ts`
Expected: PASS.

- [ ] **Step 5: `handleDeleteBlock` en Editor**

En `src/lib/editor/Editor.svelte`, junto a `handleBackspaceEmpty`, agregar (usa el mismo patrón de borrado + subárbol; reutiliza `descendantIds` si existe, si no borra por filtro de subárbol):

```js
async function handleDeleteBlock(block) {
  if (!canDeleteFromMenu(blocks, block.id)) return;
  recordSnapshot();
  const prevId = previousVisibleId(blocks, block.id);
  const ids = subtreeIds(blocks, block.id); // incluye el bloque y sus descendientes
  for (const id of ids) await softDeleteBlock(id);
  blocks = blocks.filter((row) => !ids.includes(row.id));
  if (prevId) focusBlockId = prevId;
  else focusBlockId = blocks[0]?.id ?? null;
}
```
Si no existe un helper `subtreeIds`, agregarlo en `src/lib/blocks/hierarchy.ts` con su test (recolectar recursivamente por `parentBlockId`). Importar `canDeleteFromMenu` arriba junto a los demás de `./…/enter`.

- [ ] **Step 6: Pasar `onDelete` a la fila**

En el `<BlockRow ... />` de `Editor.svelte`, agregar `onDelete={handleDeleteBlock}`.

- [ ] **Step 7: Nuevos props e ítems en BlockActionsMenu**

En `BlockActionsMenu.svelte`, sumar props `onAddNote, onMoveUp, onMoveDown, onDelete` y tres `menuitem` nuevos con íconos de `@lucide/svelte` (`StickyNote`, `ArrowUp`, `ArrowDown`, `Trash2`), replicando el patrón de los botones existentes. "Eliminar" en color `text-destructive`. Cada uno llama `run(onX)` (que cierra el menú y devuelve foco). En `BlockRow.svelte:695`, pasar:

```svelte
<BlockActionsMenu
  onAddNote={openNote}
  onMoveUp={() => onMoveUp(block)}
  onMoveDown={() => onMoveDown(block)}
  onDelete={() => onDelete(block)}
  onSaveSnippet={() => onSaveSnippet(block)}
  onTag={() => onTag(block)}
  onDismiss={focusContent}
/>
```
Sumar `onDelete` a la lista de `$props()` de `BlockRow.svelte`.

- [ ] **Step 8: e2e del menú**

```js
test('el menú de acciones permite eliminar un bloque al tacto', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('[data-block-surface]').first();
  await first.click();
  await first.pressSequentially('borrame');
  await first.press('Enter');
  await page.locator('[data-block-surface]').nth(1).pressSequentially('quedo yo');
  await page.getByRole('button', { name: 'Más acciones' }).first().click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  await expect(page.getByText('borrame')).toHaveCount(0);
  await expect(page.getByText('quedo yo')).toBeVisible();
});
```

- [ ] **Step 9: Correr unidad + e2e**

Run: `npm run test -- src/lib/blocks/` && `npm run test:e2e -- e2e/mobile-a11y.spec.ts -g "eliminar un bloque"`
Expected: PASS.

- [ ] **Step 10: Documentar en la guía y commitear**

Editar el topic correspondiente en `docs/guia/` (crear "usar-en-celular.md" si no hay uno) explicando el menú de 3 puntitos con Nota/Mover/Eliminar; actualizar fecha en `docs/guia-de-uso.md`.

```bash
git add src/lib/editor/BlockActionsMenu.svelte src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte src/lib/blocks/ e2e/mobile-a11y.spec.ts docs/guia/ docs/guia-de-uso.md
git commit -m "feat(editor): agregar nota, mover y eliminar desde el menú de la línea"
```

---

## FASE B — Robustez con teclado virtual (requiere verificación en dispositivo)

> **Checkpoint de dispositivo:** las Tasks B1 y B2 dependen del teclado virtual real, que Playwright **no** emula fiel. Cada una termina con un paso de verificación manual en el teléfono y la tablet de Hernán antes de dar por cerrada la tarea. La app se levanta y prueba según la skill `verify` del proyecto.

### Task B1: Enter y doble-Enter fiables con teclado virtual (`beforeinput`)

**Files:**
- Create: `src/lib/editor/mobileInput.ts`
- Create: `src/lib/editor/mobileInput.test.ts`
- Modify: `src/lib/editor/BlockRow.svelte` (agregar `onbeforeinput` al editable `:557-588` y a la nota `:611-624`)

**Interfaces:**
- Consumes: evento `beforeinput` del contenteditable.
- Produces: `intentFromBeforeInput(inputType, shiftless)` → `'enter' | 'softbreak' | null`.

- [ ] **Step 1: Test de unidad de la traducción**

En `src/lib/editor/mobileInput.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { intentFromBeforeInput } from './mobileInput';

describe('intentFromBeforeInput', () => {
  it('insertParagraph es un Enter de bloque', () => {
    expect(intentFromBeforeInput('insertParagraph')).toBe('enter');
  });
  it('insertLineBreak es un salto suave', () => {
    expect(intentFromBeforeInput('insertLineBreak')).toBe('softbreak');
  });
  it('insertText no es ninguno', () => {
    expect(intentFromBeforeInput('insertText')).toBe(null);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test -- src/lib/editor/mobileInput.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

`src/lib/editor/mobileInput.ts`:

```js
// Los teclados virtuales suelen no disparar keydown 'Enter'; mandan un
// beforeinput. Traducimos su inputType a la intención del editor para
// entrar por la misma puerta que el Enter de escritorio.
export function intentFromBeforeInput(inputType) {
  if (inputType === 'insertParagraph') return 'enter';
  if (inputType === 'insertLineBreak') return 'softbreak';
  return null;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test -- src/lib/editor/mobileInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Cablear en BlockRow (una sola puerta)**

En `BlockRow.svelte`, agregar `onbeforeinput={handleBeforeInput}` al editable principal y a la nota. `handleBeforeInput` traduce y **reusa los handlers existentes** (`onEnter`/`insertLineBreak`), evitando duplicar lógica:

```js
function handleBeforeInput(event) {
  const intent = intentFromBeforeInput(event.inputType);
  if (intent === 'enter') {
    event.preventDefault();
    onEnter(block);           // misma puerta que la tecla Enter de escritorio
  } else if (intent === 'softbreak') {
    event.preventDefault();
    document.execCommand('insertLineBreak');
    handleInput();
  }
}
```
Importar `intentFromBeforeInput` arriba. Para la nota, un `handleNoteBeforeInput` análogo que llame la misma lógica de salida de nota que `handleNoteKeydown` (extraer esa rama a una función reutilizable para no duplicar `planNoteExit`).

- [ ] **Step 6: Regresión de escritorio (no romper el Enter físico)**

Run: `npm run test:e2e -- e2e/critical-flows.spec.ts` && `npm run test:e2e:webkit -- e2e/critical-flows.spec.ts`
Expected: PASS — con teclado físico, keydown 'Enter' sigue funcionando; `beforeinput` no debe duplicar el salto (verificar que un solo bloque nuevo se crea, no dos).

- [ ] **Step 7: VERIFICACIÓN EN DISPOSITIVO (Hernán)**

En teléfono y tablet: (a) escribir en una línea anidada, doble Enter → sale un nivel; (b) Enter simple → nueva línea, no salto dentro del bloque. Confirmar antes de commitear.

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/mobileInput.ts src/lib/editor/mobileInput.test.ts src/lib/editor/BlockRow.svelte
git commit -m "fix(editor): Enter y doble-Enter fiables con teclado virtual vía beforeinput"
```

---

### Task B2: Menús flotantes por encima del teclado (`visualViewport`)

**Files:**
- Create: `src/lib/actions/keyboardInset.js`
- Modify: `SlashMenu.svelte:84`, `DatePanel.svelte:53`, `TagPicker.svelte:78`, `FloatingFormattingToolbar.svelte`
- Test: verificación manual (visualViewport no se emula en Playwright)

**Interfaces:**
- Consumes: `window.visualViewport` (si no existe, la acción es no-op — degradación limpia).
- Produces: acción `use:keyboardInset` que, cuando el teclado tapa parte de la ventana, sube el elemento flotante para que quede visible sobre el teclado.

- [ ] **Step 1: Implementar la acción**

`src/lib/actions/keyboardInset.js`:

```js
// Mantiene un elemento flotante visible por encima del teclado virtual.
// Usa visualViewport (el hecho real del teclado), no el tipo de dispositivo.
// Si un menú abierto quedaría tapado por el teclado, lo sube lo justo.
export function keyboardInset(node) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return {}; // sin soporte: no-op

  function reposition() {
    const rect = node.getBoundingClientRect();
    const keyboardTop = vv.offsetTop + vv.height; // borde superior del teclado
    const overlap = rect.bottom - keyboardTop;
    node.style.transform = overlap > 0 ? `translateY(${-overlap - 8}px)` : '';
  }

  reposition();
  vv.addEventListener('resize', reposition);
  vv.addEventListener('scroll', reposition);
  return {
    destroy() {
      vv.removeEventListener('resize', reposition);
      vv.removeEventListener('scroll', reposition);
    }
  };
}
```

- [ ] **Step 2: Aplicar en cada menú**

Sumar `use:keyboardInset` al div raíz de `SlashMenu.svelte`, `DatePanel.svelte`, `TagPicker.svelte`, y `FloatingFormattingToolbar.svelte`. Importar la acción en cada uno.

- [ ] **Step 3: Regresión de escritorio**

Run: `npm run test:e2e -- e2e/slash.spec.ts e2e/dates.spec.ts`
Expected: PASS — sin teclado virtual, `visualViewport.height` == ventana, `overlap` ≤ 0, `transform` vacío: nada cambia en desktop.

- [ ] **Step 4: VERIFICACIÓN EN DISPOSITIVO (Hernán)**

En teléfono y tablet: abrir con `/` cerca del final de la pantalla, con el teclado arriba; el menú debe quedar visible sobre el teclado. Repetir con fecha, etiquetas y barra de formato.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/keyboardInset.js src/lib/editor/SlashMenu.svelte src/lib/editor/DatePanel.svelte src/lib/components/TagPicker.svelte src/lib/editor/FloatingFormattingToolbar.svelte
git commit -m "feat(editor): menús flotantes se ubican sobre el teclado virtual"
```

- [ ] **Step 6: Documentar y cerrar**

Actualizar el topic de celular/tablet en `docs/guia/` con el comportamiento de menús y teclado; actualizar fecha del índice. Commit de docs.

---

## Self-Review (cobertura del diagnóstico)

| Reporte / Hallazgo | Task |
|---|---|
| 1. Controles invisibles al tacto | A1 (+A2 tamaño) |
| 2. Doble-Enter no sale de anidación | B1 |
| 3. Ctrl+Enter para notas imposible | A3 (ítem "Agregar nota") |
| 4. Fecha centrada | C1 |
| 5. Menú "/" tapado por teclado | B2 |
| 6. Toques < 44px | A2 |
| 7. Barra de formato se sale | C2 |
| 8. Menús flotantes ignoran teclado | B2 |
| 9. Faltan botones eliminar/mover | A3 |

**Notas de verificación:** B1 y B2 no tienen test automático fiable del teclado virtual; su cierre depende de la verificación en dispositivo (pasos marcados). Todo lo demás queda cubierto por Vitest/Playwright.
