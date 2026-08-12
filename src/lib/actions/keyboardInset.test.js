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

	// Al escribir en un renglón de abajo, el navegador corre la página para que
	// veas el cursor: offsetTop se va casi al máximo. Ese corrimiento es "cuánto
	// se movió", no "cuánto se comió el teclado", y restarlo daba "no hay
	// teclado" justo en los renglones de abajo. El teclado seguía ahí.
	it('sigue habiendo teclado con la página corrida hasta abajo', () => {
		setViewport({ offsetTop: 450, height: 350 });
		expect(virtualKeyboardOpen()).toBe(true);
	});

	it('sin visualViewport no hay teclado', () => {
		setViewport(null);
		expect(virtualKeyboardOpen()).toBe(false);
	});
});
