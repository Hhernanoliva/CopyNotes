// Note-text size steps (spec 027). Pure and DOM/storage-free so it stays
// unit-testable under Node, mirroring settings-registry.ts.
//
// Each value is a font-size multiplier applied to the editor text only, via the
// --cn-editor-scale CSS variable. 1 = 100% (default).

export const SCALE_STEPS = [0.9, 1, 1.1, 1.25, 1.4, 1.6];

export const DEFAULT_SCALE = 1;

// A stored value coerced to a valid step; anything unrecognized → default.
// Used at load time, where we apply (not move) the saved size.
export function coerceScale(value) {
	return SCALE_STEPS.includes(value) ? value : DEFAULT_SCALE;
}

// Next allowed step from `current` in `direction` (+1 up / -1 down), clamped at
// both ends. An unknown/invalid `current` snaps to DEFAULT_SCALE first.
export function nextScale(current, direction) {
	let index = SCALE_STEPS.indexOf(current);
	if (index === -1) index = SCALE_STEPS.indexOf(DEFAULT_SCALE);
	const target = index + Math.sign(direction);
	const clamped = Math.max(0, Math.min(SCALE_STEPS.length - 1, target));
	return SCALE_STEPS[clamped];
}
