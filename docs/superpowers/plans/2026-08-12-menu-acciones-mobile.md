# Menú de acciones ("...") en celular: hoja al pie — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el menú de los `...` deje de quedar tapado por el teclado en celular: al abrirlo se baja el teclado y el menú sube desde el borde de abajo como hoja de ancho completo.

**Architecture:** Un solo componente con dos disposiciones por CSS (`max-md:` = celular, igual que `SlashMenu`). La decisión "¿hay teclado de verdad?" se extrae de `keyboardInset` y se comparte en vez de copiarse. `flipIntoView` deja de intervenir cuando el panel está fijo a la pantalla.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind CSS v4, Vitest (jsdom), Playwright.

## Global Constraints

- Especificación de referencia: `docs/superpowers/specs/2026-08-12-menu-acciones-mobile-design.md`.
- Celular = **menos de 768px de ancho** (`max-md:`), el mismo corte que ya usan el panel lateral y `SlashMenu`.
- Área táctil mínima **44px** (`--touch-target` en `src/app.css:191`; en clases, `min-h-11`).
- **JavaScript liso** dentro de `.ts`/`.svelte`: sin anotaciones de tipo (`CLAUDE.md`).
- **Nada de detectar el aparato.** El corte visual es el ancho de pantalla; el del teclado es `visualViewport` (`AGENT.md:94`).
- Comentarios y textos de interfaz en español; mensajes de commit en español, **sin `Co-Authored-By` ni ninguna traza de agente**.
- `pnpm check` tiene **4 errores preexistentes** (`src/lib/format/commands.ts`, 2 en `src/lib/storage/db.migrations.test.ts`, `src/lib/editor/DatePanel.svelte`). Ese es el piso: no se arreglan acá, pero tampoco se suma ninguno.
- Toda prueba nueva de `src/lib/actions/**` corre bajo jsdom (ya configurado en `vite.config.ts:144`).
- El e2e usa `devices['Desktop Chrome']` (1280x720) salvo que el archivo declare otro `test.use`.

---

### Task 1: Compartir la pregunta "¿hay teclado de verdad?"

Hoy esa decisión vive suelta dentro de `keyboardInset`. El menú necesita
exactamente la misma pregunta, y copiarla es cómo nació el bug que estamos
arreglando (el menú tenía una copia vieja del cálculo de posición).

**Files:**
- Modify: `src/lib/actions/keyboardInset.js:20-37`
- Test: `src/lib/actions/keyboardInset.test.js` (crear)

**Interfaces:**
- Produces: `export function virtualKeyboardOpen()` → `true`/`false`. Sin `visualViewport` devuelve `false`. Lo consume la Tarea 4.

- [ ] **Step 1: Escribir la prueba en rojo**

Crear `src/lib/actions/keyboardInset.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { virtualKeyboardOpen } from './keyboardInset';

// El teclado no achica la ventana: achica (y a veces desplaza) el visualViewport.
function setViewport(viewport) {
	Object.defineProperty(window, 'visualViewport', {
		configurable: true,
		value: viewport ? { offsetTop: viewport.offsetTop ?? 0, height: viewport.height } : null
	});
}

beforeEach(() => {
	window.innerHeight = 800;
});

afterEach(() => {
	setViewport(null);
});

describe('virtualKeyboardOpen', () => {
	it('no hay teclado cuando se ve la ventana entera', () => {
		setViewport({ height: 800 });
		expect(virtualKeyboardOpen()).toBe(false);
	});

	it('hay teclado cuando la parte visible baja a 350px', () => {
		setViewport({ height: 350 });
		expect(virtualKeyboardOpen()).toBe(true);
	});

	// En celular las barras del navegador también achican el visualViewport, y
	// eso no es un teclado: uno abierto se come 250px o más.
	it('las barras del navegador no cuentan como teclado', () => {
		setViewport({ height: 740 });
		expect(virtualKeyboardOpen()).toBe(false);
	});

	it('cuenta también con el viewport desplazado', () => {
		setViewport({ offsetTop: 100, height: 400 });
		expect(virtualKeyboardOpen()).toBe(true);
	});

	it('sin visualViewport no hay teclado', () => {
		setViewport(null);
		expect(virtualKeyboardOpen()).toBe(false);
	});
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm vitest run src/lib/actions/keyboardInset.test.js`
Expected: FAIL — `virtualKeyboardOpen is not a function` (aún no se exporta).

- [ ] **Step 3: Extraer la función**

En `src/lib/actions/keyboardInset.js`, agregar antes de `export function keyboardInset(node)`:

```js
// ¿Hay un teclado en pantalla, de verdad? Se mide por la diferencia entre la
// ventana y la parte visible. Margen de 100px porque en celular las barras del
// navegador también achican el visualViewport y eso no es un teclado; uno
// abierto se come 250px o más.
export function virtualKeyboardOpen() {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (!vv) return false;
	return window.innerHeight - (vv.offsetTop + vv.height) >= 100;
}
```

Y dentro de `reposition()`, reemplazar estas dos líneas:

```js
		const keyboardTop = vv.offsetTop + vv.height; // borde superior del teclado
		// Margen de 100px: en celular las barras del navegador también achican el
		// visualViewport, y eso no es un teclado. Uno abierto se come 250px o más.
		if (window.innerHeight - keyboardTop < 100) return;
```

por:

```js
		const keyboardTop = vv.offsetTop + vv.height; // borde superior del teclado
		if (!virtualKeyboardOpen()) return;
```

- [ ] **Step 4: Correr las pruebas**

Run: `pnpm vitest run src/lib/actions/`
Expected: PASS — 5 nuevas de `keyboardInset` + las 7 de `flipIntoView` + las 7 de `tapSelect`.

- [ ] **Step 5: Verificar que no se rompió nada de lo que ya usa keyboardInset**

Run: `pnpm exec playwright test e2e/mobile-a11y.spec.ts e2e/dates.spec.ts --reporter=line`
Expected: PASS (con 1 skipped preexistente en `mobile-a11y`: "el panel de fecha no queda tapado por el teclado").

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/keyboardInset.js src/lib/actions/keyboardInset.test.js
git commit -m "refactor(celular): compartir la pregunta de si hay teclado en pantalla

La decisión vivía suelta adentro de keyboardInset y el menú de acciones
necesita la misma. Copiarla es como nació el bug de posición que arreglamos
ayer: el menú tenía una copia vieja del cálculo bueno."
```

---

### Task 2: `flipIntoView` no toca un panel fijo a la pantalla

La acción escribe `top`/`bottom` en línea, que le ganan a las clases de
Tailwind. Sobre la hoja al pie le pelearía la posición. Además, si el panel
estaba dado vuelta y la pantalla cambia de tamaño (girar el teléfono), esos
estilos quedan pegados.

**Files:**
- Modify: `src/lib/actions/flipIntoView.js:19-42`
- Test: `src/lib/actions/flipIntoView.test.js` (existe, se le suma un caso)

**Interfaces:**
- Consumes: nada.
- Produces: `flipIntoView` deja de escribir posición cuando `node.offsetParent` es `null` (que es exactamente lo que devuelve el navegador para un elemento `position: fixed`), y además **borra** lo que hubiera escrito antes.

- [ ] **Step 1: Escribir la prueba en rojo**

En `src/lib/actions/flipIntoView.test.js`, agregar dentro del `describe`:

```js
	// En celular el menú de acciones es una hoja fija al pie, no un panel colgado
	// de un renglón: no hay nada que dar vuelta. El navegador devuelve
	// offsetParent null justo para los elementos fijos a la pantalla.
	it('le borra la posición a un panel que pasa a estar fijo a la pantalla', () => {
		const { node } = scene({
			anchorTop: 600,
			anchorBottom: 640,
			panelHeight: 280,
			viewport: { height: 800 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(true);

		// Gira el teléfono: el mismo panel pasa a ser hoja fija.
		Object.defineProperty(node, 'offsetParent', { value: null, configurable: true });
		shrinkViewport(800);
		expect(node.style.bottom).toBe('');
		expect(node.style.top).toBe('');
	});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `pnpm vitest run src/lib/actions/flipIntoView.test.js`
Expected: FAIL — `expected '100%' to be ''`. Hoy la acción hace `if (!anchor) return` y se va sin limpiar.

- [ ] **Step 3: Implementar**

En `src/lib/actions/flipIntoView.js`, reemplazar el cuerpo de `check()` desde su primera línea:

```js
	function check() {
		const anchor = node.offsetParent;
		if (!anchor) return;
```

por:

```js
	function anclarAbajo() {
		node.style.top = '';
		node.style.bottom = '';
		node.style.marginTop = '';
		node.style.marginBottom = '';
	}

	function check() {
		const anchor = node.offsetParent;
		// Sin ancla no hay de qué colgarse. Es el caso de la hoja al pie en
		// celular: el navegador devuelve null para lo que está fijo a la pantalla.
		// Hay que BORRAR lo escrito antes, no sólo irse: si el panel se dio vuelta
		// y después la pantalla cambió de tamaño, ese `bottom:100%` en línea le
		// gana a las clases y manda la hoja fuera de la vista.
		if (!anchor) return anclarAbajo();
```

Y reemplazar el `else` del final de `check()`:

```js
		} else {
			node.style.top = '';
			node.style.bottom = '';
			node.style.marginTop = '';
			node.style.marginBottom = '';
		}
```

por:

```js
		} else {
			anclarAbajo();
		}
```

- [ ] **Step 4: Correr las pruebas**

Run: `pnpm vitest run src/lib/actions/flipIntoView.test.js`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Comprobar que las pruebas siguen sirviendo**

Romper a propósito la guardia nueva (cambiar `if (!anchor) return anclarAbajo();` por `if (!anchor) return;`), correr de nuevo, y confirmar que **falla la prueba nueva**. Después deshacer el cambio a mano — **no** con `git checkout`, que se lleva puesto el archivo entero.

Run: `pnpm vitest run src/lib/actions/flipIntoView.test.js`
Expected: 1 failed con la guardia rota; 8 passed una vez restaurada.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/flipIntoView.js src/lib/actions/flipIntoView.test.js
git commit -m "fix(paneles): no posicionar un panel fijo a la pantalla

Un panel fijo no cuelga de ningún renglón, así que no hay lado que elegir.
Y si quedó dado vuelta antes de cambiar de tamaño, el bottom en línea le
gana a las clases y lo manda fuera de la vista: hay que borrarlo."
```

---

### Task 3: Mudar la prueba de anclado a tamaño escritorio

La prueba escrita ayer (`e2e/mobile-a11y.spec.ts:200`, "el menú de acciones se
abre para el lado donde entra") corre en un viewport de 390px y da por sentado
que el menú cuelga del renglón. Después de la Tarea 4 eso deja de ser cierto a
ese tamaño. Se muda a `critical-flows.spec.ts`, que corre a 1280x720, **antes**
de cambiar el componente, para que quede verde en ambos lados del cambio.

**Files:**
- Modify: `e2e/mobile-a11y.spec.ts:196-227` (borrar la prueba y su comentario)
- Modify: `e2e/critical-flows.spec.ts` (agregarla adaptada)

**Interfaces:**
- Consumes: nada. Producto: la garantía de anclado vive donde el tamaño de pantalla la hace cierta.

- [ ] **Step 1: Borrar la prueba de `mobile-a11y.spec.ts`**

Borrar el bloque completo, incluido el comentario que lo precede: desde
`// El menú se abría hacia arriba con sólo no entrar abajo...` hasta el `});`
que cierra `test('el menú de acciones se abre para el lado donde entra', ...)`.

- [ ] **Step 2: Agregarla en `critical-flows.spec.ts`**

Pegar después de la prueba `'arranca sin crypto.randomUUID, como en una página sin candadito'`:

```js
// En escritorio el menú de acciones cuelga del renglón y se da vuelta si no
// entra abajo (flipIntoView). En celular es otra cosa —una hoja al pie—, así
// que esta garantía vive acá, que corre a 1280x720.
test('el menú de acciones cuelga del renglón y se da vuelta al pie', async ({ page }) => {
	await openApp(page);
	const rows = page.locator('main [data-block-id]');
	const menu = page.getByRole('menu', { name: 'Acciones del bloque' });

	async function abrirEn(index) {
		const row = rows.nth(index);
		await row.hover();
		await row.getByRole('button', { name: 'Más acciones' }).click();
		await expect(menu).toBeVisible();
		return { row: await row.boundingBox(), menu: await menu.boundingBox() };
	}

	const arriba = await abrirEn(0);
	expect(arriba.menu.y).toBeGreaterThan(arriba.row.y);
	await page.keyboard.press('Escape');

	const abajo = await abrirEn((await rows.count()) - 1);
	expect(abajo.menu.y + abajo.menu.height).toBeLessThanOrEqual(abajo.row.y + 2);
});
```

- [ ] **Step 3: Correrla**

Run: `pnpm exec playwright test e2e/critical-flows.spec.ts -g "cuelga del renglón" --reporter=line`
Expected: PASS.

**Si falla en la parte del último renglón** (a 1280x720 la nota de ejemplo puede
entrar entera y entonces el menú no necesita darse vuelta): agregar renglones
hasta empujar el último al pie, justo después de `await openApp(page);`:

```js
	const ultimo = rows.last().locator('.block-editable');
	await ultimo.click();
	for (let i = 0; i < 12; i++) {
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await expect(rows).toHaveCount((await rows.count()) + 1);
		await page.keyboard.type(`renglon ${i}`, { delay: 15 });
	}
```

- [ ] **Step 4: Correr las dos suites tocadas**

Run: `pnpm exec playwright test e2e/critical-flows.spec.ts e2e/mobile-a11y.spec.ts --reporter=line`
Expected: PASS (1 skipped preexistente).

- [ ] **Step 5: Commit**

```bash
git add e2e/critical-flows.spec.ts e2e/mobile-a11y.spec.ts
git commit -m "test(e2e): mudar la prueba de anclado del menú a tamaño escritorio

Estaba escrita en viewport de celular, donde el menú va a pasar a ser una
hoja al pie. La garantía de que cuelga del renglón sólo es cierta en pantalla
grande, así que vive donde eso vale."
```

---

### Task 4: La hoja al pie en celular

El cambio de verdad: bajar el teclado al abrir, y en pantallas de menos de
768px pintar el menú como hoja de ancho completo pegada al borde de abajo, con
velo detrás y área táctil de 44px.

**Files:**
- Modify: `src/lib/editor/BlockActionsMenu.svelte`
- Modify: `e2e/mobile-a11y.spec.ts`
- Modify: `docs/guia/15-usar-en-celular.md:13-21`
- Modify: `docs/guia-de-uso.md` (fecha de "Última actualización")

**Interfaces:**
- Consumes: `virtualKeyboardOpen` de la Tarea 1; la guardia de la Tarea 2.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir las pruebas en rojo**

En `e2e/mobile-a11y.spec.ts`, agregar después de la prueba
`'el menú de acciones permite eliminar un bloque al tacto'`:

```js
// Con el teclado en pantalla no entraban 280px de menú ni arriba ni abajo del
// renglón. En celular deja de colgar del renglón: sube desde el borde de abajo,
// de lado a lado, como ya hace el menú "/".
test('el menú de acciones es una hoja apoyada al pie', async ({ page }) => {
	await openApp(page);

	const row = page.locator('main [data-block-id]').first();
	await row.locator('.block-editable').first().click();
	await row.getByRole('button', { name: 'Más acciones' }).click();

	const menu = page.getByRole('menu', { name: 'Acciones del bloque' });
	await expect(menu).toBeVisible();

	const caja = await menu.boundingBox();
	const pantalla = page.viewportSize();
	expect(caja.x).toBe(0);
	expect(caja.width).toBe(pantalla.width);
	// Pegada al borde de abajo (1px de tolerancia por redondeos de layout).
	expect(caja.y + caja.height).toBeGreaterThanOrEqual(pantalla.height - 1);
});

test('cada acción de la hoja llega al área táctil de 44px', async ({ page }) => {
	await openApp(page);

	const row = page.locator('main [data-block-id]').first();
	await row.locator('.block-editable').first().click();
	await row.getByRole('button', { name: 'Más acciones' }).click();

	const items = page.getByRole('menu', { name: 'Acciones del bloque' }).getByRole('menuitem');
	await expect(items).toHaveCount(6);
	for (const item of await items.all()) {
		const caja = await item.boundingBox();
		expect(caja.height).toBeGreaterThanOrEqual(44);
	}
});
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `pnpm exec playwright test e2e/mobile-a11y.spec.ts -g "hoja apoyada al pie|área táctil de 44px" --reporter=line`
Expected: FAIL las dos — hoy el menú mide 224px de ancho y cuelga del renglón, y los ítems miden ~34px.

- [ ] **Step 3: Bajar el teclado al abrir**

En `src/lib/editor/BlockActionsMenu.svelte`, agregar el import junto a los otros:

```js
	import { virtualKeyboardOpen } from '$lib/actions/keyboardInset';
```

Reemplazar `onclick={() => (open = !open)}` en el botón por `onclick={toggleOpen}`, y agregar la función después de `let rootEl = $state();`:

```js
	// Tocar "..." no es escribir. Con el teclado en pantalla quedan ~350px
	// visibles y el menú no entra ni arriba ni abajo del renglón; bajándolo hay
	// pantalla de sobra. Sin teclado no hace nada, así que en la compu no cambia.
	function toggleOpen() {
		if (!open && virtualKeyboardOpen() && document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		open = !open;
	}
```

- [ ] **Step 4: Pintar la hoja y el velo**

En el mismo archivo, reemplazar el bloque `{#if open}` entero (el velo va **fuera** del `div.relative`, o el toque para cerrar no funcionaría: el cierre mira si el toque cayó fuera de `rootEl`):

```svelte
{#if open}
	<!-- Sólo en celular, donde el menú es una hoja modal. Va fuera del contenedor
	     del menú a propósito: cerrar mira si el toque cayó fuera de `rootEl`, y un
	     velo adentro no cerraría nada. Además evita que ese toque le caiga al
	     texto de atrás y mueva el cursor. -->
	<div aria-hidden="true" class="fixed inset-0 z-20 bg-black/40 md:hidden"></div>
{/if}

<div bind:this={rootEl} class="relative">
```

(el resto del componente queda igual hasta el `div` del menú)

Y al `div` del menú, agregar las clases de celular:

```svelte
			class="cn-pop bg-popover border-border absolute top-full right-0 z-20 mt-1 max-h-[70dvh] w-56 overflow-y-auto rounded-md border p-1 shadow-md max-md:fixed max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:z-30 max-md:mt-0 max-md:max-h-none max-md:w-full max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:p-2 max-md:pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
```

- [ ] **Step 5: Agrandar los ítems en celular**

A **cada uno de los 6 botones** con `role="menuitem"`, agregar `max-md:min-h-11`
al final de su `class` (44px = `min-h-11`, el mismo valor que usa `SlashMenu`).
Ejemplo con el primero:

```svelte
				class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none max-md:min-h-11"
```

El de "Eliminar" es el que empieza con `text-destructive`; también lo lleva.

- [ ] **Step 6: Correr las pruebas nuevas**

Run: `pnpm exec playwright test e2e/mobile-a11y.spec.ts --reporter=line`
Expected: PASS todas, incluida `'el menú de acciones permite eliminar un bloque al tacto'`, que ahora pasa por la hoja (1 skipped preexistente).

- [ ] **Step 7: Verlo con los ojos**

Sacar una captura y **abrirla con Read** (las pruebas verdes no ven composición).
Crear `e2e/zz-scratch-hoja.spec.ts`:

```js
import { test } from '@playwright/test';
import { openApp } from './app';

test.use({ viewport: { width: 390, height: 640 }, hasTouch: true, isMobile: true });

test('captura de la hoja', async ({ page }) => {
	await openApp(page);
	const row = page.locator('main [data-block-id]').first();
	await row.locator('.block-editable').first().click();
	await row.getByRole('button', { name: 'Más acciones' }).click();
	await page.waitForTimeout(500); // que termine la animación de entrada
	await page.screenshot({ path: '/tmp/hoja.png' });
});
```

Run: `pnpm exec playwright test e2e/zz-scratch-hoja.spec.ts --reporter=line`
Verificar en la imagen: hoja de lado a lado pegada abajo, 6 ítems legibles,
velo oscuro detrás, nada cortado. Después: `rm e2e/zz-scratch-hoja.spec.ts`.

- [ ] **Step 8: Actualizar la guía en el mismo commit**

En `docs/guia/15-usar-en-celular.md`, reemplazar el párrafo de apertura de la
sección `## El menú de tres puntitos (⋯): todo lo del renglón`:

```markdown
En la compu muchas acciones se hacen con el teclado. En el teléfono, tocá los **tres puntitos** a la derecha del renglón y vas a encontrar todo junto:
```

por:

```markdown
En la compu muchas acciones se hacen con el teclado. En el teléfono, tocá los **tres puntitos** a la derecha del renglón: si estabas escribiendo, **el teclado se baja solo** y el menú **sube desde abajo, de lado a lado de la pantalla**, con las opciones grandes para el dedo. Se cierra tocando fuera del menú, y ahí vuelve el cursor a tu renglón. Adentro está todo junto:
```

En `docs/guia-de-uso.md`, poner la fecha de "Última actualización" en **2026-08-12**.

- [ ] **Step 9: Chequeo completo antes de cerrar**

Run: `pnpm check 2>&1 | grep COMPLETED`
Expected: `4 ERRORS` (el piso preexistente, ni uno más).

Run: `pnpm test:unit --run`
Expected: PASS.

Run: `pnpm exec playwright test --project=chromium --reporter=line`
Expected: PASS (con los skipped preexistentes).

- [ ] **Step 10: Commit**

```bash
git add src/lib/editor/BlockActionsMenu.svelte e2e/mobile-a11y.spec.ts docs/guia/15-usar-en-celular.md docs/guia-de-uso.md
git commit -m "feat(celular): el menú de acciones sube desde el pie

Con el teclado en pantalla quedan ~350px visibles y el menú necesita 280:
no entraba ni arriba ni abajo del renglón, así que quedaba tapado. Al abrirlo
se baja el teclado, y abajo de 768px el menú deja de colgar del renglón y se
vuelve una hoja de ancho completo pegada al borde de abajo, con velo detrás y
opciones de 44px. Es el patrón que la app ya usa para el menú \"/\".

En escritorio no cambia nada: sigue colgando del renglón."
```

---

### Task 5: Prueba a mano en el iPhone (obligatoria)

Playwright no tiene teclado virtual, así que lo único que decide si esto
funciona es el teléfono. **No dar la tarea por cerrada sin este paso.**

**Files:** ninguno.

- [ ] **Step 1: Levantar la app para la red local**

```bash
pnpm dev --host --port 5173
```

Confirmar que responde por la IP de la Mac:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.123.43:5173/
```

Expected: `200`. (Si la IP cambió: `ipconfig getifaddr en0`.)

- [ ] **Step 2: Pedirle a Hernán que lo pruebe**

Que abra `http://192.168.123.43:5173` en el iPhone (misma Wi-Fi, **http**, sin
la "s") y verifique, en este orden:

1. Tocar el **primer renglón** para que suba el teclado.
2. Tocar los `...` de ese renglón ⇒ el teclado **baja** y la hoja **sube desde
   abajo** con los **6 ítems visibles enteros**.
3. "Eliminar" **no** queda debajo de la barrita de inicio del iPhone.
4. Tocar fuera de la hoja ⇒ se cierra y el cursor **vuelve al renglón**.
5. Elegir **"Mover abajo"** ⇒ el renglón se mueve y el cursor vuelve.
6. Repetir 1-2 en el **último renglón** de una nota larga.

Aclararle que por red local **el botón de Copiar no anda** (el navegador lo
reserva para páginas con candadito); no es parte de esta prueba.

- [ ] **Step 3: Anotar el resultado**

Si el teclado **no baja** en Safari, es el techo avisado en la especificación:
la hoja queda detrás del teclado y hay que agregarle `use:keyboardInset` (que
la sube por encima). No adelantarlo: sólo si pasa.

Si pasa todo, actualizar la memoria `copynotes-actions-menu-flip.md` con el
resultado del gate y los commits.

---

## Self-Review

**Cobertura de la especificación:**

| Requisito de la spec | Tarea |
| --- | --- |
| Bajar el teclado al abrir | 4 (paso 3) |
| Decidir por teclado real, no por aparato | 1 |
| Corte en 768px | 4 (pasos 4-5, clases `max-md:`) |
| Hoja al pie de ancho completo | 4 (paso 4) + prueba en paso 1 |
| Ítems de 44px | 4 (paso 5) + prueba en paso 1 |
| Velo detrás, fuera de `rootEl` | 4 (paso 4) |
| Espacio para la barrita del iPhone | 4 (paso 4, `env(safe-area-inset-bottom)`) |
| Escritorio sin cambios | 3 (la prueba de anclado vive ahí) |
| `flipIntoView` apagado en la hoja | 2 |
| La hoja **no** usa `keyboardInset` | 4 (no se agrega) + 5 (paso 3, cuándo sí) |
| Guía actualizada en el mismo commit | 4 (paso 8) |
| Gate a mano en el iPhone | 5 |

**Sin marcadores de posición:** cada paso trae el código exacto y el comando con
su resultado esperado.

**Nombres consistentes:** `virtualKeyboardOpen` (Tarea 1) es el mismo nombre que
importa la Tarea 4. `anclarAbajo` sólo existe dentro de `flipIntoView.js`.
