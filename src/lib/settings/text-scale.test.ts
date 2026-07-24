import { describe, expect, it } from 'vitest';
import { SCALE_STEPS, DEFAULT_SCALE, nextScale, coerceScale } from './text-scale';

describe('text-scale', () => {
	it('default is a step and equals 100%', () => {
		expect(DEFAULT_SCALE).toBe(1);
		expect(SCALE_STEPS).toContain(1);
	});

	it('steps are sorted ascending', () => {
		const sorted = [...SCALE_STEPS].sort((a, b) => a - b);
		expect(SCALE_STEPS).toEqual(sorted);
	});

	it('moves up to the next step', () => {
		expect(nextScale(1, 1)).toBe(1.1);
	});

	it('moves down to the previous step', () => {
		expect(nextScale(1, -1)).toBe(0.9);
	});

	it('clamps at the maximum (A+ is a no-op)', () => {
		const max = SCALE_STEPS[SCALE_STEPS.length - 1];
		expect(nextScale(max, 1)).toBe(max);
	});

	it('clamps at the minimum (A- is a no-op)', () => {
		const min = SCALE_STEPS[0];
		expect(nextScale(min, -1)).toBe(min);
	});

	it('snaps an unknown value to the default before moving', () => {
		expect(nextScale(3.7, 1)).toBe(1.1);
		expect(nextScale(undefined, -1)).toBe(0.9);
		expect(nextScale('big', 1)).toBe(1.1);
	});

	it('coerces a stored value: keeps a valid step, falls back to default', () => {
		expect(coerceScale(1.25)).toBe(1.25);
		expect(coerceScale(1)).toBe(1);
		expect(coerceScale(undefined)).toBe(DEFAULT_SCALE);
		expect(coerceScale(2.5)).toBe(DEFAULT_SCALE);
		expect(coerceScale('1.1')).toBe(DEFAULT_SCALE);
	});
});
