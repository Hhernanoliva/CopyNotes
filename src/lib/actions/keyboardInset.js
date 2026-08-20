// Mantiene un elemento flotante visible por encima del teclado virtual.
// Usa visualViewport (el hecho real del teclado), no el tipo de dispositivo.
// Si un menú abierto quedaría tapado por el teclado, lo sube lo justo.
//
// Solo actúa cuando hay teclado DE VERDAD. Sin esa puerta, en escritorio
// visualViewport es la ventana entera y cualquier menú que asomara abajo del
// borde se subía un número fijo de píxeles calculado al abrirlo: quedaba
// clavado en la pantalla y, al scrollear, se despegaba del renglón que lo
// abrió. Que no entre abajo del renglón lo resuelve el menú dándose vuelta
// (ver SlashMenu), que es lo que lo mantiene pegado al renglón.
//
// El corrimiento va en `translate`, no en `transform`: la animación de entrada
// de .cn-pop / .cn-toolbar usa `transform` y está transicionada. Mezclarlos
// hacía llegar el corrimiento con retardo y pisaba el `scale()` de entrada de
// la barra de formato.
// ¿Hay un teclado en pantalla, de verdad? Se mide por cuánto se ACHICÓ la parte
// visible, y nada más. Margen de 100px porque en celular las barras del
// navegador también la achican y eso no es un teclado; uno abierto se come
// 250px o más.
//
// `offsetTop` NO entra en esta cuenta, aunque sí en dónde queda el borde del
// teclado: es cuánto se CORRIÓ la página, no cuánto se comió. Restarlo daba
// "no hay teclado" justo en los renglones de abajo —donde el navegador corre la
// página para mostrarte el cursor— y ahí el teclado no se bajaba al abrir el
// menú de acciones.
export function virtualKeyboardOpen() {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (!vv) return false;
	return window.innerHeight - vv.height >= 100;
}

export function keyboardInset(node) {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (!vv) return {}; // sin soporte: no-op

	function reposition() {
		// Components can cap their own scrollable height to the genuinely visible
		// area. CSS viewport units still describe the layout viewport on iOS while
		// the software keyboard is open.
		node.style.setProperty('--visual-viewport-height', `${vv.height}px`);
		// Medir sin el corrimiento anterior: getBoundingClientRect ya lo incluye,
		// y encadenarlos haría que el menú se escapara hacia arriba solo.
		node.style.translate = '';
		const keyboardTop = vv.offsetTop + vv.height; // borde superior del teclado
		if (!virtualKeyboardOpen()) return;
		const box = node.getBoundingClientRect();
		const overlap = box.bottom - keyboardTop;
		// Subirlo, pero nunca tanto que se le vaya el techo por arriba de lo
		// visible: con un menú más alto que el hueco que deja el teclado, "que
		// entre entero" es imposible y quedaba cortado ARRIBA, que es peor —
		// desaparecen las primeras opciones y no hay forma de scrollear hasta
		// ellas. Tapado abajo se sigue viendo de dónde salió.
		const room = Math.max(box.top - vv.offsetTop, 0);
		if (overlap > 0) node.style.translate = `0 ${-Math.min(overlap + 8, room)}px`;
	}

	reposition();
	vv.addEventListener('resize', reposition);
	vv.addEventListener('scroll', reposition);
	// El menú puede cambiar de alto sin que se mueva nada más: el panel de fecha
	// crece al abrir el almanaque, el menú "/" se acorta al filtrar. Medido una
	// sola vez al abrirse, el corrimiento quedaba calculado para el alto viejo.
	const observer = new ResizeObserver(reposition);
	observer.observe(node);
	return {
		destroy() {
			vv.removeEventListener('resize', reposition);
			vv.removeEventListener('scroll', reposition);
			observer.disconnect();
			node.style.removeProperty('--visual-viewport-height');
		}
	};
}
