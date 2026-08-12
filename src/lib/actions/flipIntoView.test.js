import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flipIntoView } from './flipIntoView';

// jsdom no calcula layout: offsetParent es null y todos los rects miden 0. Se
// arma la escena a mano — un ancla en tal lugar de la pantalla, un panel de tal
// alto — que es justo lo que la acción lee para decidir.
function scene({ anchorTop, anchorBottom, panelHeight, viewport }) {
	const anchor = document.createElement('div');
	const node = document.createElement('div');
	anchor.appendChild(node);
	document.body.appendChild(anchor);

	Object.defineProperty(node, 'offsetParent', { value: anchor, configurable: true });
	node.getBoundingClientRect = rect(0, panelHeight);
	anchor.getBoundingClientRect = rect(anchorTop, anchorBottom);

	setViewport(viewport);
	return { node, anchor };
}

function rect(top, bottom) {
	return () => new DOMRect(0, top, 0, bottom - top);
}

// El teclado del celular no achica la ventana: achica (y a veces desplaza) el
// visualViewport. Se emula con sus listeners de verdad para poder disparar el
// "apareció el teclado" en medio del test.
let listeners = {};
let vv = null;
function setViewport(viewport) {
	listeners = {};
	vv = viewport
		? {
				offsetTop: viewport.offsetTop ?? 0,
				height: viewport.height,
				addEventListener: (type, fn) => ((listeners[type] ??= []).push(fn)),
				removeEventListener: () => {}
			}
		: null;
	Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
}

// El teclado apareciendo: el visualViewport se achica y avisa por `resize`.
function shrinkViewport(height) {
	vv.height = height;
	for (const fn of listeners.resize ?? []) fn();
}

function opensUp(node) {
	return node.style.bottom === '100%';
}

beforeEach(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	window.innerHeight = 768;
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('flipIntoView', () => {
	it('deja el panel abajo cuando entra abajo', () => {
		const { node } = scene({
			anchorTop: 60,
			anchorBottom: 100,
			panelHeight: 280,
			viewport: { height: 800 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(false);
	});

	it('lo da vuelta cuando no entra abajo pero sí arriba', () => {
		const { node } = scene({
			anchorTop: 600,
			anchorBottom: 640,
			panelHeight: 280,
			viewport: { height: 800 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(true);
	});

	// El bug del menú "...": renglón de arriba de todo con el teclado abierto. No
	// entra de ningún lado; darlo vuelta lo manda fuera de la pantalla, así que
	// se queda abajo.
	it('lo deja ABAJO cuando no entra ni abajo ni arriba', () => {
		const { node } = scene({
			anchorTop: 60,
			anchorBottom: 100,
			panelHeight: 280,
			viewport: { height: 350 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(false);
	});

	// Con el viewport desplazado, el piso es offsetTop + height: tomar sólo el
	// alto lo correría 100px para arriba y daría vuelta un panel que entraba.
	it('el piso es offsetTop + alto del visualViewport', () => {
		const { node } = scene({
			anchorTop: 300,
			anchorBottom: 340,
			panelHeight: 100,
			viewport: { offsetTop: 100, height: 400 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(false);
	});

	// Y el techo es offsetTop, no 0: arriba de esa línea está la parte de la
	// página que quedó fuera de la vista, tan invisible como debajo del teclado.
	it('el techo es offsetTop, no el borde de la ventana', () => {
		const { node } = scene({
			anchorTop: 130,
			anchorBottom: 170,
			panelHeight: 40,
			viewport: { offsetTop: 100, height: 80 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(false);
	});

	it('vuelve a decidir cuando aparece el teclado', () => {
		const { node } = scene({
			anchorTop: 600,
			anchorBottom: 640,
			panelHeight: 280,
			viewport: { height: 1200 }
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(false);

		shrinkViewport(800);
		expect(opensUp(node)).toBe(true);
	});

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

	it('sin visualViewport cae en la altura de la ventana', () => {
		const { node } = scene({
			anchorTop: 600,
			anchorBottom: 640,
			panelHeight: 280,
			viewport: null
		});
		flipIntoView(node);
		expect(opensUp(node)).toBe(true);
	});
});
