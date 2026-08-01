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
export function keyboardInset(node) {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (!vv) return {}; // sin soporte: no-op

	function reposition() {
		// Medir sin el corrimiento anterior: getBoundingClientRect ya lo incluye,
		// y encadenarlos haría que el menú se escapara hacia arriba solo.
		node.style.translate = '';
		const keyboardTop = vv.offsetTop + vv.height; // borde superior del teclado
		// Margen de 100px: en celular las barras del navegador también achican el
		// visualViewport, y eso no es un teclado. Uno abierto se come 250px o más.
		if (window.innerHeight - keyboardTop < 100) return;
		const overlap = node.getBoundingClientRect().bottom - keyboardTop;
		if (overlap > 0) node.style.translate = `0 ${-overlap - 8}px`;
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
