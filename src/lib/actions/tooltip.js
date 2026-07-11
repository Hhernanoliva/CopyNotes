// Fast tooltip action (editor UX pass): the native `title` attribute waits
// ~1s and can't be tuned, so we render our own after a short delay on hover or
// keyboard focus. The element keeps its aria-label for assistive tech; this is
// visual only, so the tooltip node is aria-hidden.
//
// Usage: <button use:tooltip={'Copiar bloque'}> — pass a string, or
// { text, delay } to override the ~250ms default.

const DEFAULT_DELAY = 250;

export function tooltip(node, options) {
	let text = typeof options === 'string' ? options : options?.text;
	let delay = (typeof options === 'object' && options?.delay) || DEFAULT_DELAY;
	let timer;
	let tip;

	function show() {
		if (!text || tip) return;
		const rect = node.getBoundingClientRect();
		tip = document.createElement('div');
		tip.setAttribute('aria-hidden', 'true');
		tip.className = 'cn-tooltip';
		tip.textContent = text;
		document.body.appendChild(tip);
		// Center above the trigger; positioned after mount so we know its width.
		const tipRect = tip.getBoundingClientRect();
		let left = rect.left + rect.width / 2 - tipRect.width / 2;
		left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
		tip.style.left = `${left}px`;
		tip.style.top = `${rect.top - tipRect.height - 6}px`;
		requestAnimationFrame(() => tip && tip.classList.add('cn-tooltip-visible'));
	}

	function scheduleShow() {
		clearTimeout(timer);
		timer = setTimeout(show, delay);
	}

	function hide() {
		clearTimeout(timer);
		if (tip) {
			tip.remove();
			tip = undefined;
		}
	}

	node.addEventListener('pointerenter', scheduleShow);
	node.addEventListener('pointerleave', hide);
	node.addEventListener('focus', scheduleShow);
	node.addEventListener('blur', hide);
	node.addEventListener('pointerdown', hide);

	return {
		update(next) {
			text = typeof next === 'string' ? next : next?.text;
			delay = (typeof next === 'object' && next?.delay) || DEFAULT_DELAY;
		},
		destroy() {
			hide();
			node.removeEventListener('pointerenter', scheduleShow);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('focus', scheduleShow);
			node.removeEventListener('blur', hide);
			node.removeEventListener('pointerdown', hide);
		}
	};
}
