# Deshacer cubre el formato — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que aplicar cualquier formato (negrita, cursiva, subrayado, tachado, código en línea, color, enlace, H1/H2/H3) cree exactamente un paso de Deshacer, sin importar si se aplicó desde la barra flotante o con atajo de teclado.

**Architecture:** Se introduce una única "puerta" en `Editor.svelte` (`runFormatCommand`) que es la única responsable de: registrar la foto de historial (una sola, y solo si hubo cambio real), aplicar el comando, y persistir el resultado leyendo el DOM explícitamente. Barra flotante y atajos de teclado dejan de aplicar el formato por su cuenta y le mandan la intención a esa puerta. Un guard doble (bandera síncrona por `blockId` + comparación de contenido) neutraliza el evento `input` incidental que `execCommand` dispara de forma inconsistente entre navegadores, para que no se registre una segunda acción.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Vitest (unidad), Playwright (e2e, proyectos `chromium` y `webkit`).

## Global Constraints

- Svelte 5 runes; no mezclar sintaxis Svelte 4. JavaScript plano dentro de `.svelte`/`.ts` (sin anotaciones de tipo).
- TDD estricto: test que falla → mirar fallar → mínimo código → verde. `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`. **Cada mecanismo con camino propio (DOM manual, cambio de tipo, color, enlace, atajo) estrena su prueba en rojo antes de tocar el código que lo resuelve.**
- No tocar `execCommand` como motor, ni el motor de formato (`src/lib/format/commands.ts`), ni preparar MCP/sync. Refactor acotado al editor.
- Toda función común debe **siempre** leer y guardar el resultado explícitamente; **nunca** depender del evento `input` automático del navegador.
- El guardado del formato **reemplaza** el guardado de tipeo pendiente del mismo renglón (misma clave `block:<id>` en la cola de guardado, y por lo tanto queda cubierto por el diario de emergencia). Nunca se hace una escritura directa que un guardado viejo pueda pisar al recargar.
- La bandera de guard debe apagarse siempre (aun con error) y estar activa **solo** durante la mutación visual síncrona, nunca durante el `await` de guardado.
- **Nombres canónicos de comando:** la interfaz (barra y atajos) emite `strike`; solo la puerta lo traduce a `applyInline('strikethrough')`. Ningún origen manda `strikethrough`.
- Regla de docs del proyecto (`CLAUDE.md`): todo cambio visible para el usuario se documenta **en el mismo commit que lo implementa**. La guía y las specs viajan dentro del commit de cada slice, no en un commit de docs aparte. Actualizar fecha del índice de la guía.
- Explicar a Hernán en español simple; él no es ingeniero.

---

## File Structure

- `src/lib/editor/Editor.svelte` — nueva `runFormatCommand` (puerta única); `handleToolbarCommand` pasa a delegar; `persistActiveBlock` recibe `blockId` explícito y **guarda por la cola** (`scheduleSave`, misma clave `block:<id>`); enfoca el renglón cuando restaura la selección (arregla el foco tras el popover de enlace); `handleBlockInput` gana el guard de arriba; nueva `handleKeyboardFormat` para atajos; bandera `formattingBlockId`.
- `src/lib/editor/BlockRow.svelte` — el atajo de teclado deja de llamar `applyInline`/`handleInput` y emite `onFormat(block, cmd)` con nombres canónicos (`strike`, no `strikethrough`); nueva prop `onFormat`.
- `e2e/formatting.spec.ts` — pruebas de Deshacer/Rehacer por familia de comando (chromium).
- `e2e/formatting-undo.spec.ts` — **archivo nuevo, enfocado**: la prueba del guard doble que también corre en WebKit (sin arrastrar las pruebas de portapapeles incompatibles).
- `playwright.config.ts` — el proyecto `webkit` incluye `formatting-undo.spec.ts` en su `testMatch`.
- `specs/020-inline-formatting-toolbar.md` y `specs/019-editor-ux-fixes.md` — nota de que el formato entra al historial por la puerta única (dentro del commit de la Task 1).
- `docs/guia/06-seleccionar-deshacer-colapsar.md` + `docs/guia-de-uso.md` — la guía menciona que Deshacer ahora revierte también el último formato (dentro del commit de la Task 1).

---

### Task 1: Puerta única + guard, barra flotante delegando, y documentación del cambio

Introduce `runFormatCommand`, el guard doble, hace que la barra flotante pase por la puerta, y —en el **mismo commit**— documenta el comportamiento visible. Deja de romperse el caso que **hoy nunca se deshace**: código en línea, color y encabezados (mutación por DOM manual / cambio de tipo, sin evento `input`).

**Files:**
- Modify: `src/lib/editor/Editor.svelte` (`handleToolbarCommand` ~658-684, `persistActiveBlock` ~617-644, `handleBlockInput` ~433-486)
- Modify: `specs/020-inline-formatting-toolbar.md`, `specs/019-editor-ux-fixes.md`, `docs/guia/06-seleccionar-deshacer-colapsar.md`, `docs/guia-de-uso.md`
- Test: `e2e/formatting.spec.ts`

**Interfaces:**
- Produces: `runFormatCommand(blockId, name, arg, { restoreSelection })` — `name` ∈ `{h1,h2,h3,normal,bold,italic,underline,strike,code,color,link,removeLink,clear}`; empuja una foto de historial solo si `block.html` o `block.type` cambian; persiste vía `persistActiveBlock(blockId)` para los comandos que mutan el contenteditable; cancela el guardado de tipeo pendiente del renglón antes de aplicar.
- Produces: `persistActiveBlock(blockId)` — recibe el id explícito (antes leía `toolbar.blockId`) y **guarda por `scheduleSave` con la misma clave `block:<id>`** (reemplaza el guardado viejo y entra al diario), no por una escritura directa.
- Produces: módulo-`let formattingBlockId` — id del renglón en formateo durante la ventana síncrona; `null` el resto del tiempo.

- [ ] **Step 1: Escribir la prueba roja — código en línea no se deshace**

En `e2e/formatting.spec.ts`, agregar al final (antes del cierre del archivo):

```javascript
test('deshacer revierte solo el código en línea, sin borrar el texto', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer código');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('codigo', { delay: 25 });
	// Cortar la ráfaga de tipeo: el snapshot del texto y el del formato deben ser
	// pasos distintos, así el primer Deshacer solo puede quitar el formato.
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();

	await page.getByRole('button', { name: 'Código en línea' }).click();
	await expect(first.locator('code')).toHaveText('codigo');

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('code')).toHaveCount(0);
	await expect(first).toHaveText('codigo');
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm exec playwright test --project=chromium -g "deshacer revierte solo el código"`
Expected: FAIL — hoy el código en línea no registra foto; el `Ctrl+Z` revierte la ráfaga de texto, así que `first` queda vacío y `toHaveText('codigo')` falla.

- [ ] **Step 3: `persistActiveBlock` recibe `blockId` y guarda por la cola**

En `src/lib/editor/Editor.svelte`, cambiar la firma y el guardado final. La reescritura de DOM y la restauración de selección quedan igual; solo cambian el parámetro y la **última** línea (la escritura):

```javascript
	function persistActiveBlock(blockId) {
		const row = document.querySelector(`[data-block-id="${blockId}"] .block-editable`);
		if (!row) return;
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;
		const sel = window.getSelection();
		let start = null;
		let end = null;
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0);
			if (row.contains(range.startContainer) && row.contains(range.endContainer)) {
				start = textOffset(row, range.startContainer, range.startOffset);
				end = textOffset(row, range.endContainer, range.endOffset);
			}
		}
		const html = sanitizeHtml(row.innerHTML);
		if (row.innerHTML !== html) {
			row.innerHTML = html;
			if (start !== null && end !== null) {
				const restored = rangeFromTextOffsets(row, start, end);
				sel.removeAllRanges();
				sel.addRange(restored);
			}
		}
		block.html = html;
		block.content = htmlToPlainText(html);
		// Guardar por la cola con la MISMA clave que usa el tipeo: así el guardado
		// pendiente de la última tecla (que lleva el html SIN formato) se reemplaza,
		// y este estado con formato queda cubierto por el diario ante un cierre.
		scheduleSave(`block:${blockId}`, () => updateBlock(blockId, { html: block.html, content: block.content }), {
			table: 'blocks',
			id: blockId,
			changes: { html: block.html, content: block.content }
		});
	}
```

- [ ] **Step 4: Agregar la bandera y la puerta única**

En `src/lib/editor/Editor.svelte`, junto a las otras variables de historial (después de `let lastTextBlockId = null;` ~364), agregar:

```javascript
	// Id del renglón en formateo durante la ventana síncrona del comando. Deja
	// que handleBlockInput ignore el evento `input` incidental de execCommand.
	let formattingBlockId = null;
```

Agregar la puerta (por ejemplo justo antes de `handleToolbarCommand`):

```javascript
	// Única puerta de formato, venga de la barra o del teclado. Dueña del paso
	// de Deshacer, de aplicar el comando y de guardar el resultado leyéndolo del
	// DOM explícitamente — nunca depende del evento `input` del navegador, que
	// execCommand dispara distinto en cada motor (Chrome síncrono, WebKit tarde
	// o nunca).
	function runFormatCommand(blockId, name, arg, { restoreSelection = false } = {}) {
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;
		// Matar el guardado de tipeo pendiente del renglón: lleva el html viejo y,
		// si llegara después, pisaría el formato al recargar. La persistencia de
		// abajo (o setBlockType para encabezados) escribe el estado fresco.
		cancelPending(`block:${blockId}`);
		if (restoreSelection) restoreSavedSelection();
		const before = currentSnapshot();
		const beforeHtml = block.html;
		const beforeType = block.type;
		const isHeading = name === 'h1' || name === 'h2' || name === 'h3' || name === 'normal';
		formattingBlockId = blockId;
		try {
			switch (name) {
				case 'h1': setBlockType(block, 'heading1'); break;
				case 'h2': setBlockType(block, 'heading2'); break;
				case 'h3': setBlockType(block, 'heading3'); break;
				case 'normal': setBlockType(block, 'text'); break;
				case 'bold': applyInline('bold'); break;
				case 'italic': applyInline('italic'); break;
				case 'underline': applyInline('underline'); break;
				case 'strike': applyInline('strikethrough'); break;
				case 'code': toggleCode(); break;
				case 'color': applyColor(arg); break;
				case 'link': if (!applyLink(arg)) return; break;
				case 'removeLink': removeLink(); break;
				case 'clear': document.execCommand('removeFormat'); break;
				default: return;
			}
		} finally {
			formattingBlockId = null;
		}
		// Los encabezados persisten por el propio setBlockType; los comandos que
		// mutan el contenteditable se leen y guardan acá. Al restaurar la selección
		// (origen barra/popover) enfocamos el renglón para que Ctrl/Cmd+Z llegue al
		// editor aunque el foco estuviera en el popover de enlace.
		if (!isHeading) {
			persistActiveBlock(blockId);
			if (restoreSelection) {
				document.querySelector(`[data-block-id="${blockId}"] .block-editable`)?.focus({ preventScroll: true });
			}
		}
		// Un solo paso de Deshacer, y solo si algo cambió de verdad.
		if (block.html !== beforeHtml || block.type !== beforeType) {
			history.push(before);
			lastTextBlockId = null;
		}
	}
```

Nota: `setBlockType` es `async`, pero su `Object.assign(block, changes)` corre síncrono antes del primer `await`, así que `block.type` ya refleja el cambio cuando se evalúa la comparación (no se hace `await` a propósito: la persistencia sigue en segundo plano). El `cancelPending` de arriba cubre también los encabezados: si había un guardado de tipeo pendiente, no pisa el html del encabezado.

- [ ] **Step 5: `handleToolbarCommand` delega en la puerta (y `copyText` conserva su protección)**

Reemplazar el cuerpo de `handleToolbarCommand` (~658-684) por:

```javascript
	async function handleToolbarCommand(name, arg) {
		const blockId = toolbar?.blockId;
		if (!blockId) return;
		if (name === 'copyText') {
			// El popover/So puede haber movido el foco; restaurar la selección
			// guardada antes de leerla (protección que ya existía).
			restoreSavedSelection();
			const text = window.getSelection()?.toString() ?? '';
			if (text) await writePlainTextToClipboard(text);
			return;
		}
		runFormatCommand(blockId, name, arg, { restoreSelection: true });
		refreshToolbar();
	}
```

- [ ] **Step 6: Guard de arriba en `handleBlockInput`**

En `handleBlockInput` (~433), agregar como primera instrucción, antes de `recordTextSnapshot(block.id)`:

```javascript
	function handleBlockInput(block, payload) {
		const text = payload.content;
		const html = payload.html;
		// Ignorar el evento `input` incidental que un comando de formato puede
		// disparar: runFormatCommand ya registró historial y guardó. En la
		// ventana síncrona lo marca formattingBlockId; un evento tardío llega con
		// el html ya guardado (sanitizeHtml es idempotente) y coincide.
		if (block.id === formattingBlockId || (html === block.html && text === block.content)) return;
		recordTextSnapshot(block.id);
```

(El resto de `handleBlockInput` queda igual.)

- [ ] **Step 7: Correr la prueba de código y verificar que pasa**

Run: `pnpm exec playwright test --project=chromium -g "deshacer revierte solo el código"`
Expected: PASS.

- [ ] **Step 8: Pruebas rojas de los otros caminos propios (color, encabezado, enlace válido, quitar enlace, limpiar formato)**

Estos comandos tienen caminos de código distintos (`applyColor`, `setBlockType`, `applyLink`, `removeLink`, `execCommand('removeFormat')`), así que cada uno estrena su prueba. Agregar en `e2e/formatting.spec.ts`. Correr cada una y **verla fallar** contra el estado previo a la puerta (color/enlace/limpiar hoy no registran foto; encabezado tampoco), luego confirmar verde con la puerta ya puesta.

```javascript
test('deshacer revierte solo el color, sin borrar el texto', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer color');
	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('coloreado', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	// (usar el mismo gesto de la barra que ya usan otras pruebas de color)
	await applyColorFromToolbar(page); // helper existente/al mismo estilo de la suite
	await expect(first.locator('[style*="color"]')).toHaveCount(1);
	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('[style*="color"]')).toHaveCount(0);
	await expect(first).toHaveText('coloreado');
});

test('deshacer un H2 lo devuelve a texto normal', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer H2');
	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('Seccion', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Título 2' }).click();
	await expect(first).toHaveClass(/block-editable--h2/);
	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first).not.toHaveClass(/block-editable--h2/);
	await expect(first).toHaveText('Seccion');
});

test('deshacer quita el enlace recién puesto — sin volver a hacer clic en el texto', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: deshacer enlace');
	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('sitio', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await page.getByRole('button', { name: 'Enlace' }).click();
	await page.getByRole('dialog', { name: 'Editar enlace' }).getByRole('textbox').fill('https://ejemplo.com');
	await page.keyboard.press('Enter'); // Guardar
	await expect(first.locator('a')).toHaveText('sitio');
	// CLAVE: no volver a hacer clic en el texto; el foco debe haber vuelto al
	// renglón para que Ctrl/Cmd+Z llegue al editor (arreglo del foco del popover).
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('a')).toHaveCount(0);
	await expect(first).toHaveText('sitio');
});
```

> Nota: usar los selectores/labels reales de la barra (`Color`, `Enlace`, `Quitar enlace`, `Limpiar formato`) tal como los expone `FloatingFormattingToolbar`; el implementador confirma los nombres con `grep -n "aria-label" src/lib/editor/FloatingFormattingToolbar.svelte`. Agregar también, con el mismo patrón (pausa >650 ms → aplicar → un Deshacer), pruebas para **quitar enlace** y **limpiar formato**.

- [ ] **Step 9: Correr las pruebas de Step 8 y verificar que pasan**

Run: `pnpm exec playwright test --project=chromium -g "deshacer (revierte solo el color|un H2|quita el enlace)"`
Expected: PASS. (El enlace inválido/cancelado no crea paso vacío: `case 'link': if (!applyLink(arg)) return;` sale antes del `history.push`.)

- [ ] **Step 10: Prueba de Rehacer tras deshacer un formato**

Agregar en `e2e/formatting.spec.ts`:

```javascript
test('rehacer recupera el código en línea deshecho', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: rehacer código');
	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('codigo', { delay: 25 });
	await page.waitForTimeout(650);
	await selectAllInBlock(page, first);
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
	await page.getByRole('button', { name: 'Código en línea' }).click();
	await expect(first.locator('code')).toHaveText('codigo');
	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('code')).toHaveCount(0);
	await page.keyboard.press('ControlOrMeta+Shift+z');
	await expect(first.locator('code')).toHaveText('codigo');
});
```

- [ ] **Step 11: Correr la prueba de Rehacer**

Run: `pnpm exec playwright test --project=chromium -g "rehacer recupera el código"`
Expected: PASS.

- [ ] **Step 12: Verificar que no se rompió la suite unitaria ni el resto de formatting**

Run: `pnpm check && npm test && pnpm exec playwright test --project=chromium e2e/formatting.spec.ts`
Expected: todo verde (incluida `applying bold wraps the text in <strong> and survives a reload`, que sigue pasando por la puerta vía la barra).

- [ ] **Step 13: Documentar el cambio visible (mismo commit)**

En `specs/020-inline-formatting-toolbar.md`, agregar una línea en la sección de comportamiento del editor:

```markdown
Todo comando de formato (barra o atajo) pasa por una única puerta en el editor que registra un paso de Deshacer y persiste el resultado por la cola de guardado (reemplaza el guardado de tipeo pendiente del renglón). El evento `input` incidental de execCommand se ignora con un guard (bandera síncrona por bloque + igualdad de contenido). Ver `specs/019-editor-ux-fixes.md` (fix 6, historial).
```

En `specs/019-editor-ux-fixes.md`, en la sección de Undo/redo (fix 6), agregar:

```markdown
El formato inline y los encabezados también entran al historial: se registran a través de `runFormatCommand`, que empuja una foto solo si `html` o `type` cambian de verdad (un enlace cancelado no crea un paso vacío).
```

En `docs/guia/06-seleccionar-deshacer-colapsar.md`, en la parte de Deshacer, agregar en lenguaje simple:

```markdown
Deshacer (Ctrl/Cmd+Z) también revierte el último formato que aplicaste —negrita, cursiva, subrayado, tachado, código, color, enlace o convertir a título— como un paso más. Rehacer (Ctrl/Cmd+Shift+Z) lo vuelve a poner.
```

En `docs/guia-de-uso.md`, actualizar la línea "Última actualización" a la fecha de hoy: "Deshacer ahora revierte también el último formato aplicado (negrita, color, enlace, títulos, etc.)".

- [ ] **Step 14: Commit (código + tests + specs + guía juntos)**

```bash
git add src/lib/editor/Editor.svelte e2e/formatting.spec.ts \
  specs/020-inline-formatting-toolbar.md specs/019-editor-ux-fixes.md \
  docs/guia/06-seleccionar-deshacer-colapsar.md docs/guia-de-uso.md
git commit -m "feat(editor): formato desde la barra entra al historial por una puerta única

Deshacer ahora revierte también código en línea, color, enlace y H1/H2/H3.
runFormatCommand es la única dueña del paso de Deshacer y del guardado; el
guardado pasa por la cola (reemplaza el guardado de tipeo pendiente, y entra
al diario), y un guard (bandera síncrona + igualdad de contenido) ignora el
evento input incidental de execCommand. Incluye specs y guía del cambio.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Los atajos de teclado pasan por la misma puerta

Hoy Ctrl/Cmd+B/I/U y Ctrl/Cmd+Shift+S aplican el formato en `BlockRow` y dependen del guardado agrupado de escritura, así que a mitad de una ráfaga de tipeo no crean paso de Deshacer. Se enruta al Editor con **nombres canónicos** (`strike`, no `strikethrough`).

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte` (props ~38; handler de atajos ~253-265)
- Modify: `src/lib/editor/Editor.svelte` (nueva `handleKeyboardFormat`; wiring de `<BlockRow>` ~1499)
- Test: `e2e/formatting.spec.ts`

**Interfaces:**
- Consumes: `runFormatCommand` (Task 1).
- Produces: prop `onFormat(block, name)` en `BlockRow`, con `name` canónico (`bold`/`italic`/`underline`/`strike`).
- Produces: `handleKeyboardFormat(block, name)` en `Editor`, que llama `runFormatCommand(block.id, name, undefined, { restoreSelection: false })`.

- [ ] **Step 1: Prueba roja — negrita por atajo a mitad de ráfaga (doble Deshacer)**

Agregar en `e2e/formatting.spec.ts`. La ráfaga de tipeo se corta con una pausa >600 ms **antes** del atajo, para que el paso del texto y el del formato sean distintos y la prueba no pueda ocultar un registro duplicado:

```javascript
test('escribir, pausar y aplicar negrita por atajo: 1er deshacer quita negrita, 2do quita texto', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Nueva nota' }).click();
	await title(page).fill('Formato E2E: negrita atajo deshacer');

	const first = page.locator('main [role="textbox"]').first();
	await first.click();
	await page.keyboard.type('hola mundo', { delay: 25 });
	await page.waitForTimeout(650); // cerrar la ráfaga de tipeo (>600ms)
	await selectAllInBlock(page, first);
	await page.keyboard.press('ControlOrMeta+b');
	await expect(first.locator('strong')).toHaveText('hola mundo');

	await first.click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect(first.locator('strong')).toHaveCount(0);
	await expect(first).toHaveText('hola mundo');

	await page.keyboard.press('ControlOrMeta+z');
	await expect(first).toHaveText('');
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm exec playwright test --project=chromium -g "negrita atajo deshacer"`
Expected: FAIL — hoy el atajo aplica en `BlockRow` y su guardado depende de la ráfaga; el primer `Ctrl+Z` borra el texto en vez de quitar solo la negrita.

- [ ] **Step 3: `BlockRow` emite la intención con nombre canónico**

En `src/lib/editor/BlockRow.svelte`, agregar `onFormat` a la lista de props (junto a `onInput` ~38):

```javascript
		onInput,
		onFormat,
```

En el handler de atajos (~256-265), usar el nombre canónico `strike` y emitir en vez de aplicar. Reemplazar:

```javascript
			if (key === 'b') cmd = 'bold';
			else if (key === 'i') cmd = 'italic';
			else if (key === 'u') cmd = 'underline';
			else if (key === 's' && event.shiftKey) cmd = 'strike';
			if (cmd) {
				event.preventDefault();
				onFormat?.(block, cmd);
				return;
			}
```

Si tras esto `applyInline`/`handleInput` quedan sin uso en `BlockRow.svelte`, quitarlos del import correspondiente (verificar con `grep -n "applyInline\|handleInput" src/lib/editor/BlockRow.svelte`).

- [ ] **Step 4: `Editor` agrega el handler y lo cablea a `<BlockRow>`**

En `src/lib/editor/Editor.svelte`, agregar (cerca de `handleToolbarCommand`):

```javascript
	// Atajos de teclado (Ctrl/Cmd+B/I/U, Ctrl/Cmd+Shift+S) desde un renglón:
	// misma puerta que la barra, pero con la selección viva (no la guardada) y
	// sin reconstruir la barra flotante.
	function handleKeyboardFormat(block, name) {
		runFormatCommand(block.id, name, undefined, { restoreSelection: false });
	}
```

En el `<BlockRow ...>` (~1499), agregar la prop junto a `onInput={handleBlockInput}`:

```svelte
					onInput={handleBlockInput}
					onFormat={handleKeyboardFormat}
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `pnpm exec playwright test --project=chromium -g "negrita atajo deshacer"`
Expected: PASS.

- [ ] **Step 6: Cubrir los cuatro atajos (incluido tachado, que hoy se rompería)**

Agregar una prueba parametrizada o cuatro casos (`bold→strong`, `italic→em`, `underline→u`, `strike→s`/`strike`) que apliquen el atajo tras una pausa >650 ms y comprueben que **un** Deshacer quita solo el formato. El caso de tachado (`ControlOrMeta+Shift+S`) es el que valida que el nombre canónico llega a la puerta (antes moría en `default`).

Run: `pnpm exec playwright test --project=chromium -g "atajo"`
Expected: PASS para los cuatro.

- [ ] **Step 7: Regresión — negrita por atajo sigue persistiendo tras recarga**

Run: `pnpm exec playwright test --project=chromium -g "applying bold wraps the text"`
Expected: PASS (ese test usa `ControlOrMeta+b`, que ahora pasa por la puerta; el resultado se guarda vía `persistActiveBlock` por la cola).

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte e2e/formatting.spec.ts
git commit -m "feat(editor): atajos de formato entran al historial por la misma puerta

Ctrl/Cmd+B/I/U y Ctrl/Cmd+Shift+S dejan de aplicar el formato en BlockRow y
delegan en runFormatCommand con nombres canónicos (strike), así cada uno crea
su propio paso de Deshacer aun en medio de una ráfaga de tipeo.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verificación cross-browser (WebKit real) y suite completa

Confirma que el guard doble funciona donde el evento `input` llega distinto (WebKit). El proyecto `webkit` de Playwright hoy filtra todo salvo `desktop-(readiness|import)`, así que la prueba de formato **no correría** si se apunta a `formatting.spec.ts`. Se crea un archivo enfocado y se lo agrega al `testMatch` de WebKit.

**Files:**
- Add: `e2e/formatting-undo.spec.ts`
- Modify: `playwright.config.ts` (`testMatch` del proyecto `webkit`)
- Test: la prueba nueva + corridas de verificación

- [ ] **Step 1: Crear la prueba enfocada cross-engine**

En `e2e/formatting-undo.spec.ts`, una sola prueba que ejerza el guard doble (aplicar código en línea tras pausa, un Deshacer quita solo el formato). Es la que atrapa el evento `input` **tardío** de WebKit, no solo el síncrono de Chromium. Reusar los helpers de la suite (`title`, `selectAllInBlock`) importándolos igual que las otras specs.

- [ ] **Step 2: Incluir `formatting-undo.spec.ts` en el `testMatch` de WebKit**

En `playwright.config.ts`, ampliar el `testMatch` del proyecto `webkit`:

```javascript
			testMatch: /(desktop-(readiness|import)|formatting-undo)\.spec\.ts/,
```

- [ ] **Step 3: Correr la prueba enfocada en ambos motores**

Run: `pnpm exec playwright test --project=chromium e2e/formatting-undo.spec.ts && pnpm exec playwright test --project=webkit e2e/formatting-undo.spec.ts`
Expected: PASS en los dos. (Si WebKit no está instalado: `pnpm exec playwright install webkit`.) Confirmar en la salida que WebKit realmente ejecutó **1 test**, no 0.

- [ ] **Step 4: Correr toda la suite**

Run: `pnpm check && npm test && pnpm exec playwright test --project=chromium`
Expected: `check` limpio, unidad verde y e2e chromium verde.

- [ ] **Step 5: Commit**

```bash
git add e2e/formatting-undo.spec.ts playwright.config.ts
git commit -m "test(editor): guard de formato verificado en WebKit (spec enfocada)

formatting-undo.spec.ts corre en chromium y webkit; el proyecto webkit lo
incluye en testMatch sin arrastrar las pruebas de portapapeles incompatibles.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Cobertura del pedido (cada camino con su prueba, en rojo primero):**
- Código en línea → Task 1 Step 1-2 (rojo) → Step 7 (verde).
- Color → Task 1 Step 8 (camino propio `applyColor`, rojo) → Step 9.
- H2/encabezado → Task 1 Step 8 (camino propio `setBlockType`, rojo) → Step 9.
- Enlace válido (sin re-clic, valida foco tras popover) → Task 1 Step 8-9. Enlace inválido/cancelado no crea paso vacío → por construcción (`applyLink` devuelve falso → `return` antes del push).
- Quitar enlace y limpiar formato → Task 1 Step 8 (caminos propios `removeLink` / `removeFormat`).
- Rehacer recupera el formato → Task 1 Step 10-11.
- Escribir + pausa + Ctrl+B (atajo) → doble Deshacer → Task 2 Step 1.
- Los cuatro atajos, **incluido tachado** (nombre canónico llega a la puerta) → Task 2 Step 6.
- Recargar confirma guardado (el guardado viejo ya no pisa el formato) → Task 2 Step 7.
- Chromium + **WebKit real** (verificando que corre 1 test, no 0) → Task 3.

**Bloqueadores del análisis previo, y dónde se resuelven:**
1. Guardado viejo pisa el formato nuevo → `persistActiveBlock` guarda por `scheduleSave` con la misma clave `block:<id>` (reemplaza el pendiente) y `runFormatCommand` hace `cancelPending` antes de aplicar; queda cubierto por el diario. Task 1 Step 3-4; regresión Task 2 Step 7.
2. El atajo de tachado moría en `default` → nombre canónico `strike` desde `BlockRow`; la puerta lo traduce a `applyInline('strikethrough')`. Task 2 Step 3; prueba Task 2 Step 6.
3. WebKit no corría ninguna prueba de formato → archivo enfocado agregado al `testMatch` de WebKit; se verifica que ejecuta 1 test. Task 3.
4. Commits violaban la regla de docs → specs y guía viajan dentro del commit de la Task 1 (mismo commit que implementa el cambio visible). Task 1 Step 13-14.

**Otros problemas del análisis, y cómo se cierran:**
- Pruebas que no distinguían las dos partes del guard → todas cortan la ráfaga con pausa >650 ms antes de formatear, y la de negrita hace dos Deshacer consecutivos. Task 1 Step 1, Task 2 Step 1.
- Cobertura sobre-declarada → se agregan pruebas reales de color, enlace, quitar enlace, limpiar formato y los cuatro atajos; el self-review ya no afirma una prueba de "clic Negrita" que no existe.
- Foco tras el popover de enlace → `runFormatCommand` enfoca el renglón cuando `restoreSelection` es true; la prueba de enlace **no** vuelve a hacer clic antes de Ctrl+Z. Task 1 Step 4 y Step 8.
- `copyText` perdía protección → conserva `restoreSavedSelection()` antes de leer la selección. Task 1 Step 5.
- TDD estricto → cada mecanismo estrena su prueba en rojo antes del código que lo resuelve (Steps 1-2 y 8-9 de Task 1, Steps 1-2 de Task 2).

**Consistencia de tipos/nombres:** `runFormatCommand(blockId, name, arg, { restoreSelection })`, `persistActiveBlock(blockId)`, `formattingBlockId`, `handleKeyboardFormat(block, name)`, prop `onFormat(block, name)` con `name` canónico (`strike`) — usados igual en Task 1 y Task 2.
