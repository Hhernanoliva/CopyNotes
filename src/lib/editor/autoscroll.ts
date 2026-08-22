// Auto-scroll while dragging. Los tres arrastres del editor (mover renglones,
// mover un texto marcado, marcar renglones) necesitan lo mismo: cuando el
// puntero llega al borde, la nota tiene que seguir corriendo sola, o el lugar
// donde querés soltar queda fuera de la pantalla y hay que soltar, scrollear y
// volver a agarrar.
//
// Quién scrollea se BUSCA, no se declara: la versión anterior preguntaba por un
// `[data-scroll-container]` que no existía en ninguna parte de la app y caía en
// `document.scrollingElement`, o sea la página entera, que con este layout
// (`h-svh overflow-hidden`) no se mueve nunca. Pedirle scroll al elemento
// equivocado no da error: no pasa nada, en silencio, y así estuvo desde el día
// que se escribió.

const EDGE_PX = 48;
const MAX_SPEED_PX = 14;

// El primer ancestro que de verdad puede scrollear. `null` si no hay ninguno,
// para que quien llama pueda no hacer nada en vez de escribirle a la nada.
export function findScroller(el) {
	for (let node = el; node instanceof Element; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if (overflowY === 'auto' || overflowY === 'scroll') return node;
	}
	return null;
}

// Cuántos píxeles correr en este cuadro: 0 en el medio, y dentro de las bandas
// de borde crece cuanto más cerca del borde estás. Un paso fijo se siente lento
// apenas entrás a la banda y descontrolado pegado al borde.
export function scrollStep(rect, clientY, edge = EDGE_PX, maxSpeed = MAX_SPEED_PX) {
	const fromTop = clientY - rect.top;
	const fromBottom = rect.bottom - clientY;
	if (fromTop < edge) return -speed(fromTop, edge, maxSpeed);
	if (fromBottom < edge) return speed(fromBottom, edge, maxSpeed);
	return 0;
}

function speed(distance, edge, maxSpeed) {
	const depth = Math.min(Math.max(edge - distance, 0), edge) / edge;
	return Math.max(1, Math.round(depth * maxSpeed));
}

// `onFrame` corre en cada cuadro del desplazamiento: el puntero está QUIETO en
// el borde, así que no llega ningún movimiento nuevo y el indicador de dónde
// vas a soltar se congelaría mientras el contenido corre por debajo.
export function createAutoScroll(onFrame = () => {}) {
	let scroller = null;
	let raf = null;
	let step = 0;

	function frame() {
		scroller.scrollBy(0, step);
		onFrame();
		raf = requestAnimationFrame(frame);
	}

	function stop() {
		if (raf) cancelAnimationFrame(raf);
		raf = null;
		step = 0;
	}

	// `el` es desde dónde buscar quién scrollea (un renglón, la lista). Se vuelve
	// a buscar si el que teníamos ya no está en la pantalla: un elemento
	// desconectado acepta `scrollBy` sin quejarse y no mueve nada.
	function track(el, clientY) {
		if (!scroller?.isConnected) scroller = findScroller(el);
		if (!scroller) return;
		step = scrollStep(scroller.getBoundingClientRect(), clientY);
		if (step === 0) {
			stop();
			return;
		}
		if (!raf) raf = requestAnimationFrame(frame);
	}

	return { track, stop };
}
