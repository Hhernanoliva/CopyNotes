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
