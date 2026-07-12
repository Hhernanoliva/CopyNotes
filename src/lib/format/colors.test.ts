import { test, expect } from 'vitest';
import { TEXT_COLORS } from './colors';

test('has six colors, default first with null class', () => {
	expect(TEXT_COLORS).toHaveLength(6);
	expect(TEXT_COLORS[0]).toEqual({ id: 'default', label: 'Por defecto', className: null });
	expect(TEXT_COLORS.map((c) => c.id)).toEqual(['default', 'amber', 'red', 'green', 'blue', 'gray']);
});

test('non-default colors use fmt-color-* classes', () => {
	for (const color of TEXT_COLORS.slice(1)) {
		expect(color.className).toBe(`fmt-color-${color.id}`);
	}
});
