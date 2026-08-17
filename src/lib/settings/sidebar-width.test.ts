import { describe, expect, it } from 'vitest';
import {
	MIN_WIDTH,
	MAX_WIDTH,
	DEFAULT_WIDTH,
	CLOSE_MARGIN,
	coerceWidth,
	resizeIntent
} from './sidebar-width';

describe('sidebar-width', () => {
	// La barra arranca en su mínimo a propósito: 270 es lo que mide su propio
	// encabezado, así que sólo puede ensancharse.
	it('starts at the minimum and can only grow', () => {
		expect(DEFAULT_WIDTH).toBe(MIN_WIDTH);
		expect(DEFAULT_WIDTH).toBeLessThan(MAX_WIDTH);
	});

	it('keeps a width that is already allowed', () => {
		expect(coerceWidth(320)).toBe(320);
	});

	it('clamps below the minimum and above the maximum', () => {
		expect(coerceWidth(50)).toBe(MIN_WIDTH);
		expect(coerceWidth(900)).toBe(MAX_WIDTH);
	});

	it('falls back to the default for anything that is not a number', () => {
		expect(coerceWidth(undefined)).toBe(DEFAULT_WIDTH);
		expect(coerceWidth('300')).toBe(DEFAULT_WIDTH);
		expect(coerceWidth(NaN)).toBe(DEFAULT_WIDTH);
	});

	it('rounds to whole pixels', () => {
		expect(coerceWidth(300.6)).toBe(301);
	});

	// Dragging: the edge stops at the minimum, and only crossing it arms the
	// close. Both halves come from one call so the dim and the release agree.
	it('follows the pointer while it stays inside the allowed range', () => {
		expect(resizeIntent(320)).toEqual({ width: 320, willClose: false });
	});

	it('stops at the minimum but arms the close well past it', () => {
		expect(resizeIntent(MIN_WIDTH - CLOSE_MARGIN - 1)).toEqual({
			width: MIN_WIDTH,
			willClose: true
		});
	});

	it('does not arm the close exactly at the minimum', () => {
		expect(resizeIntent(MIN_WIDTH)).toEqual({ width: MIN_WIDTH, willClose: false });
	});

	// Pasarse unos pixeles del mínimo no cierra nada: el margen es lo que separa
	// "me pasé sin querer" de "quiero cerrarla".
	it('forgives a small overshoot past the minimum', () => {
		expect(resizeIntent(MIN_WIDTH - 5)).toEqual({ width: MIN_WIDTH, willClose: false });
	});

	it('stops at the maximum', () => {
		expect(resizeIntent(2000)).toEqual({ width: MAX_WIDTH, willClose: false });
	});
});
