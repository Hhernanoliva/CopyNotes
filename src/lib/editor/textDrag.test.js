import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTextDrag } from './textDrag.svelte.js';

function pointer(type, clientX, clientY, button = 0) {
	return new MouseEvent(type, { clientX, clientY, button, bubbles: true });
}

const DROP = { blockId: 't', offset: 3, caretRect: { left: 5, top: 6, height: 10 } };

describe('createTextDrag', () => {
	let applied;
	let drag;

	beforeEach(() => {
		applied = [];
		drag = createTextDrag({
			resolveDropPoint: () => DROP,
			onApply: (payload) => applied.push(payload)
		});
	});

	afterEach(() => drag.destroy());

	it('does not activate on a sub-threshold move', () => {
		drag.armFromSelection('s', 1, 4, pointer('pointerdown', 100, 100));
		window.dispatchEvent(pointer('pointermove', 103, 100)); // 3px
		expect(drag.active).toBe(false);
	});

	it('activates past the threshold and applies the move on release', () => {
		drag.armFromSelection('s', 1, 4, pointer('pointerdown', 100, 100));
		window.dispatchEvent(pointer('pointermove', 100, 120)); // 20px
		expect(drag.active).toBe(true);
		expect(drag.indicator).toEqual({ x: 5, top: 6, height: 10 });

		window.dispatchEvent(pointer('pointerup', 140, 200));
		expect(applied).toEqual([{ sourceId: 's', start: 1, end: 4, targetId: 't', offset: 3 }]);
	});

	it('a press with no drag applies nothing', () => {
		drag.armFromSelection('s', 1, 4, pointer('pointerdown', 100, 100));
		window.dispatchEvent(pointer('pointerup', 100, 100));
		expect(drag.active).toBe(false);
		expect(applied).toHaveLength(0);
	});

	it('Escape cancels the drag', () => {
		drag.armFromSelection('s', 1, 4, pointer('pointerdown', 100, 100));
		window.dispatchEvent(pointer('pointermove', 100, 120));
		expect(drag.active).toBe(true);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(drag.active).toBe(false);
		window.dispatchEvent(pointer('pointerup', 140, 200));
		expect(applied).toHaveLength(0);
	});
});
