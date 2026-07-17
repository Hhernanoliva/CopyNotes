// App-wide reactive "current day" (spec 021 follow-up). A single source of
// truth so every date label and the Agenda roll over at midnight WITHOUT a
// reload. `todayString()` is a snapshot; components must read `currentDay()`
// so they re-render when the calendar day changes.
//
// Browser-only glue on top of the pure `msUntilNextMidnight`/`todayString`
// (which carry the unit tests). Start it once from the root layout.
import { browser } from '$app/environment';
import { msUntilNextMidnight, todayString } from './core';

const state = $state({ value: todayString() });

// Reactive read — call inside $derived/$effect to track day changes.
export function currentDay() {
	return state.value;
}

// Recompute the day now; return true only if it actually advanced.
function sync() {
	const now = todayString();
	if (now === state.value) return false;
	state.value = now;
	return true;
}

// Start the clock. Call once from the root layout inside an $effect and return
// its cleanup. Two triggers, because neither alone is enough:
//   1. A timer set to the next local midnight (then reschedules) — handles the
//      app sitting open across midnight.
//   2. A re-check when the tab becomes visible/focused — laptops that sleep
//      through midnight never fire the timer, so waking the tab catches up.
export function startTodayClock() {
	if (!browser) return () => {};

	let timer;
	function scheduleMidnight() {
		// +1s cushion so we recompute safely past the boundary, never on it.
		timer = setTimeout(() => {
			sync();
			scheduleMidnight();
		}, msUntilNextMidnight() + 1000);
	}
	scheduleMidnight();

	function catchUp() {
		if (document.visibilityState !== 'visible') return;
		if (sync()) {
			// The day advanced while we were hidden: the pending timer is stale.
			clearTimeout(timer);
			scheduleMidnight();
		}
	}
	document.addEventListener('visibilitychange', catchUp);
	window.addEventListener('focus', catchUp);

	return () => {
		clearTimeout(timer);
		document.removeEventListener('visibilitychange', catchUp);
		window.removeEventListener('focus', catchUp);
	};
}
