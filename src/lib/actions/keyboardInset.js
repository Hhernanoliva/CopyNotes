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
