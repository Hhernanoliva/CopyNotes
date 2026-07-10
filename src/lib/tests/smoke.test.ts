import { describe, expect, it } from 'vitest';
import { cn } from '$lib/utils';

describe('smoke: project foundation', () => {
	it('merges class names through cn()', () => {
		expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
	});

	it('lets the last conflicting Tailwind class win', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
	});

	it('ignores falsy conditional classes', () => {
		expect(cn('block', false, undefined, null)).toBe('block');
	});
});
