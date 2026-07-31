import { describe, it, expect, vi } from 'vitest';
import { tapSelect } from './tapSelect';

function mount() {
	const node = document.createElement('button');
	document.body.appendChild(node);
	const onSelect = vi.fn();
	const action = tapSelect(node, onSelect);
	return { node, onSelect, action };
}

// jsdom no implementa PointerEvent; MouseEvent lleva clientX/clientY y el
// listener sólo mira el tipo del evento.
function pointer(node, type, x, y) {
	const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
	node.dispatchEvent(event);
	return event;
}

describe('tapSelect', () => {
	it('elige al soltar sin mover el dedo', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 102, 201);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('no elige si el dedo se deslizó', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 260);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('no elige con sólo apoyar', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('no elige si el gesto se cancela', () => {
		const { node, onSelect } = mount();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointercancel', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('cancela el comportamiento por omisión al apoyar, para no perder el cursor', () => {
		const { node } = mount();
		const event = pointer(node, 'pointerdown', 100, 200);
		expect(event.defaultPrevented).toBe(true);
	});

	it('usa el callback más nuevo después de update', () => {
		const { node, onSelect, action } = mount();
		const nuevo = vi.fn();
		action.update(nuevo);
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(nuevo).toHaveBeenCalledTimes(1);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('deja de escuchar al destruirse', () => {
		const { node, onSelect, action } = mount();
		action.destroy();
		pointer(node, 'pointerdown', 100, 200);
		pointer(node, 'pointerup', 100, 200);
		expect(onSelect).not.toHaveBeenCalled();
	});
});
