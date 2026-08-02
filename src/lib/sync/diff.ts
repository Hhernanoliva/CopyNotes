// Which words differ between two versions of the same line (spec 030 phase 3).
//
// Two devices that edited the same row usually disagree about very little — a
// typo, one inserted word, a missing space. Shown as two nearly identical lines,
// that is a spot-the-difference puzzle, and the person has to solve it before
// they can choose. Marking what moved is the difference between a decision and a
// guess.
//
// This is not a real diff algorithm and does not want to be. It finds how far
// the two agree from the left, how far from the right, and calls everything in
// between "changed" — then widens that span to whole words, because
// `cuando a` / `cuandoa` reads instantly while a single underlined space does
// not. One changed span per side is the honest shape of the common case, and the
// uncommon case (edits at both ends) degrades to "most of the line changed",
// which is also true.

const isBoundary = (character) => character === undefined || /\s/.test(character);

// [{ text, changed }] for each side, in order. Concatenating the texts gives the
// original string back, always — the rendering depends on it.
export function diffWords(mine, theirs) {
	const left = mine ?? '';
	const right = theirs ?? '';
	if (left === right) {
		const same = [{ text: left, changed: false }];
		return { mine: same, theirs: [...same] };
	}

	const shortest = Math.min(left.length, right.length);
	let start = 0;
	while (start < shortest && left[start] === right[start]) start++;
	// The two spans may not overlap: a line that only grew has nothing in the
	// middle, and letting the suffix run past the prefix would report a change
	// that never happened.
	let tail = 0;
	while (
		tail < shortest - start &&
		left[left.length - 1 - tail] === right[right.length - 1 - tail]
	) {
		tail++;
	}

	// Widen to word boundaries. Inside the common prefix the two strings are
	// identical, so testing one side is testing both; the same holds inside the
	// common suffix, where the characters match pairwise.
	while (start > 0 && !isBoundary(left[start - 1])) start--;
	while (tail > 0 && !isBoundary(left[left.length - tail])) tail--;

	return { mine: segments(left, start, tail), theirs: segments(right, start, tail) };
}

function segments(text, start, tail) {
	const end = text.length - tail;
	const parts = [];
	if (start > 0) parts.push({ text: text.slice(0, start), changed: false });
	// An empty changed span is kept on purpose. Widening to words usually leaves
	// both sides with something to underline even for a pure insertion — one side
	// shows `al`, the other `hoy al` — but when a side is empty outright there is
	// genuinely nothing to mark, and the caller still needs the span to exist.
	parts.push({ text: text.slice(start, end), changed: true });
	if (tail > 0) parts.push({ text: text.slice(end), changed: false });
	return parts;
}
