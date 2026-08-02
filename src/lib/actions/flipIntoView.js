// Un panel anclado debajo de su renglón que no entra abajo se da vuelta y sale
// ARRIBA. Mismo criterio que el menú "/" (ver SlashMenu), con dos diferencias
// que importan en celular y tablet:
//
// 1. El piso NO es window.innerHeight sino el borde de abajo del visualViewport:
//    con el teclado en pantalla, esos 300px de abajo existen para el layout pero
//    el usuario no los ve. Ahí quedaba el panel de fecha del último renglón,
//    tapado por el teclado.
// 2. Se vuelve a medir cuando el teclado aparece o desaparece (visualViewport
//    resize), no solo al scrollear.
//
// Se aplica al contenedor posicionado (el que tiene `absolute`), y escribe
// `top`/`bottom`/márgenes en el estilo del nodo para ganarle a las clases.
const GAP = 4; // px entre el renglón y el panel

export function flipIntoView(node) {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;

	function check() {
		const anchor = node.offsetParent;
		if (!anchor) return;
		// Medir siempre en la posición de abajo: la altura no cambia, pero el rect
		// del ancla sí, y encadenar estados dejaba el panel dado vuelta para
		// siempre una vez que se daba vuelta la primera vez.
		const height = node.getBoundingClientRect().height;
		const anchorBox = anchor.getBoundingClientRect();
		const ceiling = vv ? vv.offsetTop : 0;
		const floor = vv ? vv.offsetTop + vv.height : window.innerHeight;
		const fitsBelow = anchorBox.bottom + GAP + height <= floor;
		const fitsAbove = anchorBox.top - GAP - height >= ceiling;
		if (!fitsBelow && fitsAbove) {
			node.style.top = 'auto';
			node.style.bottom = '100%';
			node.style.marginTop = '0';
			node.style.marginBottom = `${GAP}px`;
		} else {
			node.style.top = '';
			node.style.bottom = '';
			node.style.marginTop = '';
			node.style.marginBottom = '';
		}
	}

	check();
	// `scroll` no burbujea: en captura llegan también los del contenedor de la
	// nota, que es el que se mueve de verdad.
	window.addEventListener('scroll', check, true);
	window.addEventListener('resize', check);
	vv?.addEventListener('resize', check);
	vv?.addEventListener('scroll', check);
	// El panel cambia de alto al abrirse el almanaque: hay que volver a decidir.
	const observer = new ResizeObserver(check);
	observer.observe(node);

	return {
		destroy() {
			window.removeEventListener('scroll', check, true);
			window.removeEventListener('resize', check);
			vv?.removeEventListener('resize', check);
			vv?.removeEventListener('scroll', check);
			observer.disconnect();
		}
	};
}
