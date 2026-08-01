const TAG_FLAG = { strong: 'bold', em: 'italic', u: 'underline', s: 'strike', code: 'code', a: 'link' };

// Read which inline formats wrap `node`, walking ancestors up to (not
// including) `root`. Pure DOM reading — no execCommand — so it works the same
// in every browser and in jsdom tests.
export function activeFormatsFor(node, root) {
	const active = {
		bold: false, italic: false, underline: false, strike: false,
		code: false, link: false, color: null, size: null
	};
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el !== root) {
		const tag = el.tagName?.toLowerCase();
		const flag = TAG_FLAG[tag];
		if (flag) active[flag] = true;
		if (tag === 'span' && el.className) {
			const classes = el.className.split(/\s+/);
			const color = classes.find((c) => c.startsWith('fmt-color-'));
			if (color && !active.color) active.color = color;
			// Innermost wins for size too: nested spans mean the closest one is
			// the size actually rendered.
			const size = classes.find((c) => c.startsWith('fmt-size-'));
			if (size && !active.size) active.size = size;
		}
		el = el.parentNode;
	}
	return active;
}
