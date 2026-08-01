import { test, expect } from 'vitest';
import { nextToolbarIndex } from './toolbar-keys';

test('arrows move one step at a time', () => {
	expect(nextToolbarIndex(0, 5, 'ArrowRight')).toBe(1);
	expect(nextToolbarIndex(3, 5, 'ArrowLeft')).toBe(2);
});

test('the ends hold: no wrapping around the toolbar', () => {
	expect(nextToolbarIndex(4, 5, 'ArrowRight')).toBe(null);
	expect(nextToolbarIndex(0, 5, 'ArrowLeft')).toBe(null);
});

test('up and down work like left and right, for the menus stacked vertically', () => {
	expect(nextToolbarIndex(0, 5, 'ArrowDown')).toBe(1);
	expect(nextToolbarIndex(3, 5, 'ArrowUp')).toBe(2);
});

test('Inicio and Fin jump to the ends', () => {
	expect(nextToolbarIndex(3, 5, 'Home')).toBe(0);
	expect(nextToolbarIndex(1, 5, 'End')).toBe(4);
});

test('Shift+Tab steps back, so focus cannot fall out of the toolbar', () => {
	expect(nextToolbarIndex(2, 5, 'Tab', true)).toBe(1);
	expect(nextToolbarIndex(0, 5, 'Tab', true)).toBe(null);
	// Plain Tab is not navigation: it activates the focused button, which the
	// component handles on its own.
	expect(nextToolbarIndex(2, 5, 'Tab', false)).toBe(null);
});

test('keys that are not ours are left alone', () => {
	expect(nextToolbarIndex(2, 5, 'Enter')).toBe(null);
	expect(nextToolbarIndex(2, 5, 'a')).toBe(null);
});

test('an empty or unknown group never moves focus', () => {
	expect(nextToolbarIndex(0, 0, 'ArrowRight')).toBe(null);
	expect(nextToolbarIndex(-1, 5, 'ArrowRight')).toBe(null);
});
