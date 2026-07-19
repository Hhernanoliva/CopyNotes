import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION, OFFSET, motionDuration, prefersReducedMotion } from './motion';

function mockReducedMotion(matches) {
	globalThis.matchMedia = vi.fn((query) => ({
		matches,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false
	})) as unknown as typeof matchMedia;
}

afterEach(() => {
	delete globalThis.matchMedia;
});

describe('motion tokens', () => {
	it('mirrors the app.css timing tokens (ms)', () => {
		expect(MOTION.fast).toBe(150);
		expect(MOTION.overlay).toBe(240);
	});

	it('limits travel to the discrete 2/4/16px offsets', () => {
		expect(OFFSET).toEqual({ xs: 2, sm: 4, lg: 16 });
	});
});

describe('prefersReducedMotion', () => {
	it('is false when matchMedia is unavailable (SSR/node)', () => {
		expect(prefersReducedMotion()).toBe(false);
	});

	it('is true when the OS asks to reduce motion', () => {
		mockReducedMotion(true);
		expect(prefersReducedMotion()).toBe(true);
	});

	it('is false when the OS does not ask to reduce motion', () => {
		mockReducedMotion(false);
		expect(prefersReducedMotion()).toBe(false);
	});
});

describe('motionDuration', () => {
	it('returns the requested duration by default', () => {
		mockReducedMotion(false);
		expect(motionDuration(240)).toBe(240);
	});

	it('collapses to 0 when reduce motion is preferred', () => {
		mockReducedMotion(true);
		expect(motionDuration(240)).toBe(0);
	});

	it('collapses to 0 in environments without matchMedia only if asked; otherwise passes through', () => {
		// No matchMedia at all: treat as "motion allowed" so SSR keeps configured timings.
		expect(motionDuration(150)).toBe(150);
	});
});
