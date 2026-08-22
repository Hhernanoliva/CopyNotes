import { describe, expect, it, vi } from 'vitest';
import { createAutoScroll, findScroller, scrollStep } from './autoscroll';

const box = (top, bottom) => ({ top, bottom });

describe('scrollStep', () => {
	it('no scrollea en el medio del contenedor', () => {
		expect(scrollStep(box(0, 600), 300)).toBe(0);
	});

	it('scrollea hacia arriba dentro de la banda de arriba', () => {
		expect(scrollStep(box(0, 600), 20)).toBeLessThan(0);
	});

	it('scrollea hacia abajo dentro de la banda de abajo', () => {
		expect(scrollStep(box(0, 600), 580)).toBeGreaterThan(0);
	});

	// Un paso fijo se siente lento apenas entrás a la banda y descontrolado
	// pegado al borde. Cuanto más cerca del borde, más rápido.
	it('acelera cuanto más cerca del borde', () => {
		expect(scrollStep(box(0, 600), 596)).toBeGreaterThan(scrollStep(box(0, 600), 570));
	});

	// El puntero puede salirse del contenedor (la barra de arriba, el borde de la
	// ventana): eso es "lo más rápido que puedas", no "dejá de scrollear".
	it('va a máxima velocidad con el puntero fuera del contenedor', () => {
		expect(scrollStep(box(100, 600), 700)).toBe(scrollStep(box(100, 600), 600));
		expect(scrollStep(box(100, 600), 0)).toBe(scrollStep(box(100, 600), 100));
	});
});

describe('findScroller', () => {
	it('encuentra el ancestro que scrollea de verdad', () => {
		document.body.innerHTML =
			'<div id="page" style="overflow-y: hidden"><div id="main" style="overflow-y: auto"><div id="list"><p id="row"></p></div></div></div>';
		expect(findScroller(document.getElementById('row'))?.id).toBe('main');
	});

	it('devuelve null cuando nadie scrollea, en vez de un elemento que no se mueve', () => {
		document.body.innerHTML = '<div id="page"><div id="list"><p id="row"></p></div></div>';
		expect(findScroller(document.getElementById('row'))).toBe(null);
	});
});

describe('createAutoScroll', () => {
	// rAF de mentira: cada cuadro se corre a mano, y cancelar de verdad saca el
	// cuadro pendiente de la cola — si no, "frenó" y "quedó uno encolado" se ven igual.
	function harness() {
		const frames = new Map();
		let nextId = 0;
		vi.stubGlobal('requestAnimationFrame', (fn) => {
			frames.set(++nextId, fn);
			return nextId;
		});
		vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
		document.body.innerHTML =
			'<div id="main" style="overflow-y: auto"><div id="list"><p id="row"></p></div></div>';
		const main = document.getElementById('main');
		const rect = { top: 0, bottom: 600, left: 0, right: 900, width: 900, height: 600, x: 0, y: 0 };
		main.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
		const scrollBy = vi.fn();
		main.scrollBy = scrollBy;
		const runFrame = () => {
			const [id, fn] = [...frames.entries()][0];
			frames.delete(id);
			fn();
		};
		return { main, scrollBy, list: document.getElementById('list'), frames, runFrame };
	}

	it('scrollea el contenedor mientras el puntero está pegado al borde', () => {
		const { scrollBy, list, runFrame } = harness();
		const autoScroll = createAutoScroll();
		autoScroll.track(list, 590);
		runFrame();
		expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number));
		expect(scrollBy.mock.calls[0][1]).toBeGreaterThan(0);
		autoScroll.stop();
	});

	// Sin esto, la rayita que marca dónde vas a soltar se congela: el puntero
	// está quieto, así que no llega ningún movimiento nuevo mientras la nota corre.
	it('avisa en cada cuadro para que el indicador siga al contenido', () => {
		const { list, runFrame } = harness();
		const onFrame = vi.fn();
		const autoScroll = createAutoScroll(onFrame);
		autoScroll.track(list, 590);
		runFrame();
		expect(onFrame).toHaveBeenCalledTimes(1);
		autoScroll.stop();
	});

	it('frena solo cuando el puntero vuelve al medio', () => {
		const { scrollBy, list, runFrame, frames } = harness();
		const autoScroll = createAutoScroll();
		autoScroll.track(list, 590);
		runFrame();
		autoScroll.track(list, 300);
		expect(frames.size).toBe(0);
		expect(scrollBy).toHaveBeenCalledTimes(1);
	});
});
