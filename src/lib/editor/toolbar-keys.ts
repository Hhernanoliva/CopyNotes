// Where the arrow keys move focus inside the formatting toolbar (spec 033).
// Pure index math: the caller passes only the buttons that are actually
// reachable (disabled ones are filtered out before counting), so skipping them
// needs no logic here.
//
// Returns the index to focus, or null when the key is not ours or there is
// nowhere to go — the ends hold instead of wrapping around, and Inicio/Fin
// cover the jump.
//
// Up/down are synonyms of left/right so the same handler serves the row of
// buttons and the menus that stack vertically ("Más opciones").
export function nextToolbarIndex(current, count, key, shiftKey = false) {
	if (count <= 0 || current < 0 || current >= count) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	const forward = key === 'ArrowRight' || key === 'ArrowDown';
	const back = key === 'ArrowLeft' || key === 'ArrowUp' || (key === 'Tab' && shiftKey);
	if (forward) return current + 1 < count ? current + 1 : null;
	if (back) return current > 0 ? current - 1 : null;
	return null;
}
