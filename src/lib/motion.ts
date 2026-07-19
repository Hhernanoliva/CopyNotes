// Quiet Motion — shared motion tokens and the reduce-motion guard for
// Svelte transitions (spec 024, Stage 1).
//
// The CSS timing tokens live in src/app.css (--motion-fast, --motion-overlay,
// --motion-ease). These constants mirror the numeric values so Svelte
// transitions (fly/fade/scale/slide) share the exact same rhythm.
//
// The @media (prefers-reduced-motion: reduce) rule in app.css only disables
// CSS transitions/animations. Svelte transitions are inline JS, so route
// every Svelte transition duration through motionDuration() to honor the
// same preference.

// Durations in milliseconds. Keep in sync with src/app.css.
export const MOTION = {
	fast: 150, // buttons, icons, menus, small state changes (--motion-fast)
	overlay: 240 // sidebar, dialogs (--motion-overlay)
};

// The only travel distances Quiet Motion allows, in pixels.
export const OFFSET = {
	xs: 2,
	sm: 4,
	lg: 16
};

// True when the OS/browser asks to reduce motion. Safe on the server and in
// environments without matchMedia (returns false: motion is allowed).
export function prefersReducedMotion() {
	return (
		typeof matchMedia === 'function' &&
		matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

// Duration to feed a Svelte transition. Returns 0 (instant) when the user
// prefers reduced motion, otherwise the requested duration. Read at trigger
// time, so it always reflects the current preference.
export function motionDuration(ms) {
	return prefersReducedMotion() ? 0 : ms;
}
