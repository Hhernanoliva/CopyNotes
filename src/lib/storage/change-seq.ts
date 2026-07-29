// The monotonic change counter sync reads (spec 030 phase 1). Wall-clock
// timestamps cannot answer "what changed since X": `ids.ts` stamps ISO
// milliseconds, so two writes inside one millisecond tie, and a clock the OS
// moves backwards hides a change entirely. This counter only moves forward.
//
// Same idea `activity.ts` already proved for causal order, generalised: there
// the max lived in the table and cost a full read per append; here it is one
// number, so every synced write can afford it. `activity.seq` stays as it is —
// it orders the bitácora for display and must not shift under a restore.
//
// The next value is the later of "now" and "one past the last one", so it reads
// as a timestamp while never repeating. The high-water mark is mirrored to
// localStorage — synchronous, the same medium `journal.ts` trusts — so a
// restart cannot hand out a number it already used.

const STORE_KEY = 'copynotes:change-seq';

// Read lazily, not at import time: this module loads during SSR/prerender and
// inside tests that install their localStorage stub after the imports run.
let last = null;

function readHighWaterMark() {
	try {
		return Number(localStorage.getItem(STORE_KEY)) || 0;
	} catch {
		// localStorage unavailable (SSR, privacy mode) — start from the clock.
		return 0;
	}
}

export function nextChangeSeq() {
	if (last === null) last = readHighWaterMark();
	last = Math.max(Date.now(), last + 1);
	try {
		// ponytail: one write per stamp. A 5k-row restore does 5k tiny setItems;
		// batch (reserve a block of numbers) only if that ever shows up as slow.
		localStorage.setItem(STORE_KEY, String(last));
	} catch {
		// Unavailable storage still leaves the counter rising within this
		// session; only a backwards clock across a restart could repeat.
	}
	return last;
}
