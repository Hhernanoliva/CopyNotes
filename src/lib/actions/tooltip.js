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

	// Un foco que llega de un dedo o de un clic no pide ayuda: el que la pide es
	// el que navega con teclado, y eso es exactamente lo que distingue
	// :focus-visible. Sin esta puerta, el menú de acciones —que enfoca su propio
	// botón para bajar el teclado del celular— dejaba el globito flotando encima
	// del menú recién abierto.
	function scheduleShowOnFocus() {
		if (node.matches(':focus-visible')) scheduleShow();
	}

	node.addEventListener('pointerenter', scheduleShow);
	node.addEventListener('pointerleave', hide);
	node.addEventListener('focus', scheduleShowOnFocus);
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
			node.removeEventListener('focus', scheduleShowOnFocus);
			node.removeEventListener('blur', hide);
			node.removeEventListener('pointerdown', hide);
		}
	};
}
