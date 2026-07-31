# Menú "/" horizontal en celular — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En pantallas de menos de 768px el menú "/" pasa a ser una barra horizontal apoyada al pie (arriba del teclado) y deslizar una lista deja de elegir opciones sin querer.

**Architecture:** Una acción de Svelte compartida (`tapSelect`) mueve la selección de `pointerdown` a `pointerup` con un guardián de movimiento, y la usan `SlashMenu` y `TagPicker`. `SlashMenu` gana una segunda disposición sólo con variantes CSS `max-md:` sobre el mismo marcado, así el escritorio no cambia y no se duplica el cableado de accesibilidad. Para pararse arriba del teclado se reusa `keyboardInset` sin tocarla.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind 4, Vitest (proyectos `jsdom` y `server`), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-31-menu-slash-mobile-design.md`

## Global Constraints

- JavaScript plano dentro de archivos `.ts`/`.svelte`: **sin anotaciones de tipo** en código escrito a mano (CLAUDE.md).
- Los comentarios de código se escriben **en el idioma que ya usa cada archivo** (`SlashMenu.svelte` y `slash.ts` están en inglés; `keyboardInset.js` en español). Seguir el archivo, no inventar un criterio nuevo.
- Nunca escribir colores crudos ni renombrar tokens: se usan las clases/tokens existentes (`bg-popover`, `border-border`, `text-muted-foreground`, `--touch-target`).
- **Cada cambio visible para el usuario se documenta en `docs/guia/` en el mismo commit que lo implementa**, y se actualiza la fecha "Última actualización" del índice `docs/guia-de-uso.md` (CLAUDE.md).
- Los commits **no llevan `Co-Authored-By` ni ninguna marca de agente** (este repo despliega a Vercel).
- El corte "celular" es el ancho `md` de Tailwind (768px), el mismo que ya usa la app; no se agrega detección de dispositivo táctil.
- Escritorio (≥768px) debe quedar **idéntico**: mismas clases, misma posición, misma selección con mouse.
- Comandos: `pnpm test` (unitarias), `pnpm test:e2e` (Playwright chromium), `pnpm check` (svelte-check).

## Desvíos respecto de la especificación (decididos al escribir el plan)

1. **`DatePanel.svelte` queda afuera.** La especificación lo incluía en el arreglo del toque, pero al leerlo se ve que sus botones ya eligen con `onclick` (`DatePanel.svelte:60,66,82`), no con `pointerdown`: el bug de "deslizar elige" no existe ahí. Tocarlo sería cambio sin causa.
2. **Se descarta que ←/→ muevan la selección en la barra horizontal.** Con el menú abierto, el "/" y lo que escribís siguen en el texto, así que ←/→ mueven el cursor dentro de la consulta; interceptarlas rompería escribir y corregir la búsqueda. Queda ↑/↓ + Enter/Tab + Escape, como hoy. Por lo mismo no se agrega `aria-orientation`: sería anunciar una navegación horizontal que no existe.

---

## Task 1: La acción `tapSelect` (elegir al soltar, no al apoyar)

**Files:**
- Create: `src/lib/actions/tapSelect.js`
- Create: `src/lib/actions/tapSelect.test.js`
- Modify: `vite.config.ts:139-145` (include del proyecto `jsdom`) y `vite.config.ts:154-161` (exclude del proyecto `server`)

**Interfaces:**
- Consumes: nada.
- Produces: `tapSelect(node, onSelect)` — acción de Svelte (`use:tapSelect={callback}`). `onSelect` es una función que recibe el evento `pointerup` y no devuelve nada. La acción cancela el comportamiento por omisión del `pointerdown` (así el renglón no pierde el cursor) y llama a `onSelect` sólo si el puntero se movió 10px o menos entre apoyar y soltar. Soporta `update` para que el callback pueda cambiar entre renderizados.

- [ ] **Step 1: Hacer que Vitest corra las pruebas de `src/lib/actions/` con DOM**

En `vite.config.ts`, dentro del proyecto `jsdom`, agregar la ruta al `include` (después de la línea de `bridge`):

```ts
					include: [
						'src/lib/format/**/*.{test,spec}.{js,ts}',
						'src/lib/editor/**/*.{test,spec}.{js,ts}',
						'src/lib/bridge/**/*.{test,spec}.{js,ts}',
						// Las acciones tocan el DOM (eventos de puntero, visualViewport).
						'src/lib/actions/**/*.{test,spec}.{js,ts}',
						// Migration test: v3 upgrade uses htmlToPlainText, which needs a DOM.
						'src/lib/storage/db.migrations.test.ts'
					]
```

Y en el proyecto `server`, agregar la misma ruta al `exclude` (si no, la prueba corre dos veces y en Node falla por no existir `document`):

```ts
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/lib/format/**/*.{test,spec}.{js,ts}',
						'src/lib/editor/**/*.{test,spec}.{js,ts}',
						'src/lib/bridge/**/*.{test,spec}.{js,ts}',
						'src/lib/actions/**/*.{test,spec}.{js,ts}',
						// Runs under jsdom instead (see the jsdom project's include).
						'src/lib/storage/db.migrations.test.ts'
					]
```

- [ ] **Step 2: Escribir la prueba que falla**

Crear `src/lib/actions/tapSelect.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { tapSelect } from './tapSelect';

function mount() {
	const node = document.createElement('button');
	document.body.appendChild(node);
	const onSelect = vi.fn();
	const action = tapSelect(node, onSelect);
	return { node, onSelect, action };
}

// jsdom no implementa PointerEvent; MouseEvent lleva clientX/clientY y el
// listener sólo mira el tipo del evento.
function pointer(node, type, x, y) {
	const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
	node.dispatchEvent(event);
	return event;
}

describe('tapSelect', () => {
	it('elige al soltar sin mover el dedo', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 102, 201);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('no elige si el dedo se deslizó', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 260);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('no elige con sólo apoyar', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('no elige si el gesto se cancela', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointercancel', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('cancela el comportamiento por omisión al apoyar, para no perder el cursor', () => {
		const { node } = mount();
		const event = pointer(node, 'pointerdown', 100, 200);
		expect(event.defaultPrevented).toBe(true);
	});

	it('usa el callback más nuevo después de update', () => {
		const { node, onSelect, action } = mount();
		const nuevo = vi.fn();
		action.update(nuevo);
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(nuevo).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('deja de escuchar al destruirse', () => {
		const { node, onSelect, action } = mount();
		action.destroy();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 3: Correr la prueba y verificar que falla**

Run: `pnpm test -- src/lib/actions/tapSelect.test.js`
Expected: FAIL — no existe `./tapSelect`.

- [ ] **Step 4: Escribir la acción**

Crear `src/lib/actions/tapSelect.js`:

```js
// Elegir una opción al soltar, no al apoyar. Un gesto para deslizar una lista
// empieza tocando una opción: elegir en pointerdown lo convertía en una
// selección sin querer (con mouse no se nota, con el dedo sí). El
// preventDefault se queda en pointerdown porque es lo que evita que el renglón
// editable pierda el cursor cuando el menú recibe el toque.
const MOVE_TOLERANCE = 10; // px

export function tapSelect(node, onSelect) {
	let select = onSelect;
	let start = null;

	function down(event) {
		event.preventDefault();
		start = { x: event.clientX, y: event.clientY };
	}

	function up(event) {
		const from = start;
		start = null;
		if (!from) return;
		if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > MOVE_TOLERANCE) return;
		select(event);
	}

	function cancel() {
		start = null;
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', cancel);

	return {
		update(next) {
			select = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		}
	};
}
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `pnpm test -- src/lib/actions/tapSelect.test.js`
Expected: PASS, 7 pruebas.

- [ ] **Step 6: Correr toda la suite unitaria**

Run: `pnpm test`
Expected: todo en verde. Si `tapSelect.test.js` aparece dos veces (proyectos `jsdom` y `server`), el `exclude` del Step 1 quedó mal.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/tapSelect.js src/lib/actions/tapSelect.test.js vite.config.ts
git commit -m "feat(menús): elegir al soltar el dedo, no al apoyarlo

Acción compartida con guardián de movimiento: si el puntero se desplazó más
de 10px entre apoyar y soltar, el gesto era un deslizamiento y no elige nada.
Todavía no la usa ningún componente."
```

---

## Task 2: El menú "/" y el de "#" dejan de elegir al deslizar

**Files:**
- Modify: `src/lib/editor/SlashMenu.svelte:44-62` (el `snippet` `optionButton`)
- Modify: `src/lib/components/TagPicker.svelte:107-120` (el botón de opción)
- Test: `e2e/mobile-a11y.spec.ts` (prueba nueva al final del archivo)
- Modify: `docs/guia/15-usar-en-celular.md`, `docs/guia-de-uso.md:5`

**Interfaces:**
- Consumes: `tapSelect(node, onSelect)` de la Task 1.
- Produces: nada nuevo; el comportamiento de selección con mouse queda igual (apretar y soltar sobre la opción).

- [ ] **Step 1: Escribir la prueba e2e que falla**

Agregar al final de `e2e/mobile-a11y.spec.ts`:

```ts
test('deslizar el menú "/" no elige una opción sin querer', async ({ page }) => {
	await page.goto('/');

	const row = page.locator('main [data-block-id]').first();
	const line = row.locator('.block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Backspace');
	await line.pressSequentially('/');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();

	// Arrastrar sobre una opción es un gesto para deslizar la lista: no elige.
	const option = page.getByRole('option', { name: 'Tarea' });
	const box = await option.boundingBox();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect(menu).toBeVisible();
	await expect(row.locator('[role="checkbox"]')).toHaveCount(0);

	// Tocar sin mover sí elige.
	await page.getByRole('option', { name: 'Tarea' }).click();
	await expect(row.locator('[role="checkbox"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm test:e2e -- e2e/mobile-a11y.spec.ts -g "deslizar el menú"`
Expected: FAIL — el arrastre convierte el renglón en tarea, así que el menú ya no está visible.

- [ ] **Step 3: Usar la acción en `SlashMenu.svelte`**

Agregar el import junto al de `keyboardInset`:

```js
	import { tapSelect } from '$lib/actions/tapSelect';
```

Y en el `snippet` `optionButton`, reemplazar el manejador por la acción:

```svelte
	<button
		type="button"
		role="option"
		id="slash-option-{command.id}"
		aria-label={command.label}
		aria-selected={optionIndex === selectedIndex}
		use:tapSelect={() => onSelect(command)}
		class="focus-visible:ring-ring rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {layout} {optionIndex ===
		selectedIndex
			? 'bg-accent text-foreground'
			: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
	>
		{@render body(command)}
	</button>
```

(Se borran las líneas `onpointerdown={(event) => { event.preventDefault(); onSelect(command); }}`.)

- [ ] **Step 4: Usar la acción en `TagPicker.svelte`**

Agregar el import junto al de `keyboardInset`:

```js
	import { tapSelect } from '$lib/actions/tapSelect';
```

Y reemplazar el `onpointerdown` del botón de opción:

```svelte
				<button
					type="button"
					role="option"
					id="tag-option-{option.id}"
					aria-selected={optionIndex === index}
					use:tapSelect={() => {
						onPick(option);
						query = '';
						index = 0;
						inputEl.focus();
					}}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `pnpm test:e2e -- e2e/mobile-a11y.spec.ts -g "deslizar el menú"`
Expected: PASS.

- [ ] **Step 6: Correr las e2e que ya existían de estos dos menús**

Run: `pnpm test:e2e -- e2e/slash.spec.ts e2e/dates.spec.ts e2e/critical-flows.spec.ts`
Expected: todo en verde sin editar esos archivos. Si alguna prueba dispara `pointerdown` a mano en vez de un clic real (`page.click` / `.click()`), se corrige ese disparo a un clic real: la regla nueva es la correcta, la prueba estaba simulando de más.

- [ ] **Step 7: Documentar en la guía**

En `docs/guia/15-usar-en-celular.md`, agregar esta sección justo después de "## Los menús no quedan tapados por el teclado":

```markdown
## Deslizar un menú ya no elige sin querer

Antes, en el teléfono, al querer deslizar la lista del menú "/" o la de etiquetas, el menú **elegía la opción que tocaste** apenas apoyabas el dedo y se cerraba. Ahora la opción se elige **al soltar**: si moviste el dedo, el menú entiende que estabas deslizando y no elige nada.
```

En `docs/guia-de-uso.md`, en la línea 5, insertar al principio del paréntesis (justo después de `(Nuevo: `) esta frase y dejar el texto anterior detrás precedido de `Antes: `:

```
**deslizar los menús en el celular ya no elige una opción sin querer**: el menú "/" y el de etiquetas ahora eligen al soltar el dedo, no al apoyarlo; ver el tema 15.
```

Actualizar también la fecha de "Última actualización" al día del commit.

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/SlashMenu.svelte src/lib/components/TagPicker.svelte e2e/mobile-a11y.spec.ts docs/guia/15-usar-en-celular.md docs/guia-de-uso.md
git commit -m "fix(menús): deslizar con el dedo ya no elige una opción

El menú \"/\" y el de etiquetas elegían en pointerdown, así que un gesto de
desplazamiento seleccionaba la opción que el dedo tocaba primero. Ahora usan
tapSelect: eligen al soltar y sólo si el puntero casi no se movió."
```

---

## Task 3: El menú "/" es una barra horizontal al pie en celular

**Files:**
- Modify: `src/lib/editor/SlashMenu.svelte` (bloque `<script>`, el `snippet` `optionButton`, el grupo de títulos y el `div` raíz)
- Test: `e2e/mobile-a11y.spec.ts` (prueba nueva)
- Modify: `docs/guia/15-usar-en-celular.md`, `docs/guia-de-uso.md:5`, `specs/003-editor-blocks.md`

**Interfaces:**
- Consumes: `tapSelect` (Task 1), ya cableado en Task 2.
- Produces: nada que otro código consuma. Sigue existiendo `#slash-menu` con `role="listbox"` y las opciones con `role="option"` e `id="slash-option-<id>"`.

- [ ] **Step 1: Escribir la prueba e2e que falla**

Agregar en `e2e/mobile-a11y.spec.ts`:

```ts
test('en celular el menú "/" es una barra apoyada al pie', async ({ page }) => {
	await page.goto('/');

	const line = page.locator('main [data-block-id] .block-editable').first();
	await line.click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.press('Backspace');
	await line.pressSequentially('/');

	const menu = page.locator('#slash-menu');
	await expect(menu).toBeVisible();

	const box = await menu.boundingBox();
	// Una sola fila de fichas, no una lista alta.
	expect(box.height).toBeLessThan(120);
	// Apoyada en el borde inferior y de borde a borde (viewport 390x780).
	expect(box.y + box.height).toBeGreaterThan(776);
	expect(box.width).toBe(390);

	// Las fichas se pueden deslizar al costado dentro de la barra.
	const overflows = await menu.evaluate((el) => el.scrollWidth > el.clientWidth);
	expect(overflows).toBe(true);

	// Y las opciones entran cómodas para el dedo (44px).
	const optionBox = await page.getByRole('option', { name: 'Viñeta' }).boundingBox();
	expect(optionBox.height).toBeGreaterThanOrEqual(44);
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm test:e2e -- e2e/mobile-a11y.spec.ts -g "barra apoyada al pie"`
Expected: FAIL — el menú es un popover angosto anclado bajo el renglón, alto y sin desbordar al costado.

- [ ] **Step 3: Preparar el modo en el `<script>` de `SlashMenu.svelte`**

El componente ya distingue el modo snippets para el `aria-label`, pero calculándolo inline. Extraerlo a un `$derived` y agregar los dos strings de disposición. Después de la línea de `firstHeadingIndex`:

```js
	// El modo snippets se reconoce por el tipo de las opciones; en celular es la
	// única disposición que sigue siendo vertical (los nombres son largos y
	// pueden ser muchos: en una fila no se pueden leer de un vistazo).
	const isSnippets = $derived(commands.some((command) => command.kind === 'snippet'));

	// Escritorio: lista vertical, igual que siempre. Abajo de 768px (max-md):
	// comandos = fichas anchas en una fila que se desliza; snippets = lista de
	// ancho completo con tope de alto.
	const rowLayout = $derived(
		isSnippets
			? 'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm max-md:min-h-11'
			: 'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm max-md:min-h-11 max-md:w-auto max-md:shrink-0 max-md:px-3'
	);
```

Y en el `$effect` que mantiene visible la opción elegida, agregar el eje horizontal:

```js
			if (option) option.scrollIntoView({ block: 'nearest', inline: 'nearest' });
```

- [ ] **Step 4: Aplicar las clases al `div` raíz**

Reemplazar el `aria-label` inline por `isSnippets` y agregar las variantes `max-md:`:

```svelte
<div
	bind:this={listEl}
	use:keyboardInset
	role="listbox"
	id="slash-menu"
	aria-label={isSnippets ? 'Snippets guardados' : 'Tipos de bloque'}
	class="cn-pop bg-popover border-border absolute top-full left-8 z-10 mt-1 max-h-[min(24rem,70dvh)] w-52 overflow-y-auto overscroll-contain rounded-md border p-1 shadow-md max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:z-30 max-md:mt-0 max-md:w-full max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:p-2 {isSnippets
		? 'max-md:max-h-[40dvh]'
		: 'max-md:flex max-md:max-h-none max-md:items-stretch max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden'}"
>
```

`keyboardInset` no se toca: con la caja apoyada en el borde inferior, la superposición que mide contra `visualViewport` es exactamente el alto del teclado, así que la sube justo encima. Sin teclado, la superposición es cero y queda al pie.

- [ ] **Step 5: Aplicar la disposición a las opciones**

En los dos `@render optionButton(...)`, cambiar el string de layout de las filas normales por `rowLayout`:

```svelte
				{@render optionButton(command, index, rowLayout, commandBody)}
```

En el grupo de títulos, que el bloque no se encoja ni se apriete en la fila:

```svelte
					<div role="group" aria-label="Títulos" class="flex min-h-8 items-center gap-2 px-2 py-1 max-md:min-h-11 max-md:shrink-0">
```

Y las fichas H1/H2/H3, con área de toque de 44px:

```svelte
								{@render optionButton(
									heading,
									commands.indexOf(heading),
									'flex h-8 min-w-8 items-center justify-center px-1 text-xs font-bold max-md:h-11 max-md:min-w-11',
									headingBody
								)}
```

- [ ] **Step 6: Marcar el techo conocido**

En `SlashMenu.svelte`, justo arriba del `div` raíz, dejar anotado el límite aceptado:

```svelte
<!-- ponytail: en celular la barra tapa unos 56px al pie, así que escribiendo en
     el último renglón visible puede quedar sobre el texto. Si molesta en uso
     real, empujar el renglón con scrollIntoView al abrir el menú. -->
```

- [ ] **Step 7: Correr las pruebas**

Run: `pnpm test:e2e -- e2e/mobile-a11y.spec.ts`
Expected: PASS, incluidas las pruebas móviles que ya existían.

Run: `pnpm test:e2e`
Expected: toda la suite en verde. Las pruebas de escritorio corren en viewport ancho, donde no aplica ninguna clase `max-md:`.

Run: `pnpm check`
Expected: sin errores nuevos (puede haber 2 avisos preexistentes).

- [ ] **Step 8: Mirarlo funcionando**

Run: `pnpm dev` y abrir el navegador en 390x780 (modo dispositivo). Verificar a ojo: escribir `/` muestra la barra al pie, se desliza al costado, elegir "Tarea" convierte el renglón, y `/snip` + elegir "Snippet" muestra la lista vertical con tope de alto. Después achicar/agrandar la ventana a más de 768px: el menú vuelve a ser el popover vertical de siempre.

- [ ] **Step 9: Documentar en la guía y en la spec**

En `docs/guia/15-usar-en-celular.md`, agregar antes de "## Deslizar un menú ya no elige sin querer":

```markdown
## El menú "/" en el teléfono es una barra abajo

En la computadora, escribir `/` abre una lista de arriba a abajo. En el teléfono esa lista quedaba tapada por el teclado y, si era larga, no se podía llegar a las opciones de más abajo. Ahora `/` abre una **barra apoyada arriba del teclado, de lado a lado de la pantalla**, con fichas grandes (Texto, Títulos, Viñeta, Tarea, Fecha, Código, Separador, Snippet). Si no entran todas, **deslizás la barra para el costado** con el dedo.

Los **snippets** son la excepción: como sus nombres son largos, al elegir "Snippet" se abre una **lista de arriba a abajo** en el mismo lugar, que se desliza hacia abajo y nunca pasa de media pantalla.
```

En `docs/guia-de-uso.md` línea 5, sumar al principio del paréntesis (y correr el resto con `Antes: `):

```
**el menú "/" en el celular ahora es una barra al pie que se desliza para el costado**, en vez de una lista alta que el teclado tapaba; los snippets siguen en lista; ver el tema 15.
```

Actualizar la fecha de "Última actualización".

En `specs/003-editor-blocks.md`, agregar al final de la sección "Typed Triggers":

```markdown
## Slash menu: dos disposiciones, un componente (2026-07-31)

`SlashMenu.svelte` se pinta vertical arriba de 768px y como barra horizontal
apoyada al pie por debajo (variantes `max-md:` sobre el mismo marcado, nunca un
segundo componente: dos copias divergen y una se queda sin los atributos ARIA).
El modo snippets sigue vertical en las dos, porque los nombres son largos. La
posición sobre el teclado la resuelve `actions/keyboardInset.js` sin cambios.
Las opciones eligen con `actions/tapSelect.js` (al soltar, con tolerancia de
10px) porque elegir en `pointerdown` convertía cualquier deslizamiento en una
selección sin querer.
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/editor/SlashMenu.svelte e2e/mobile-a11y.spec.ts docs/guia/15-usar-en-celular.md docs/guia-de-uso.md specs/003-editor-blocks.md
git commit -m "feat(menú /): barra horizontal al pie en celular

En pantallas de menos de 768px la lista vertical quedaba cortada por el
teclado. Ahora es una barra de borde a borde apoyada arriba del teclado, con
fichas de 44px que se deslizan al costado; el modo snippets sigue vertical con
tope de alto. Escritorio sin cambios: todo va en variantes max-md."
```

---

## Verificación final

- [ ] `pnpm test` — unitarias en verde.
- [ ] `pnpm test:e2e` — Playwright chromium en verde.
- [ ] `pnpm check` — sin errores nuevos.
- [ ] Revisado a ojo en 390x780 y en escritorio (Step 8 de la Task 3).
- [ ] `git log --oneline -3` muestra tres commits sin marcas de agente.
