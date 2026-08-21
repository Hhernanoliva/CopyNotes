import { test, expect } from 'vitest';
import { canChangeType, planBlockType, HEADING_TYPES } from './blocktype';

test('to heading strips checked', () => {
	expect(planBlockType({ type: 'todo', checked: true }, 'heading2'))
		.toEqual({ type: 'heading2', checked: false });
});

test('heading back to normal text', () => {
	expect(planBlockType({ type: 'heading1', checked: false }, 'text'))
		.toEqual({ type: 'text', checked: false });
});

test('HEADING_TYPES has three levels', () => {
	expect(HEADING_TYPES).toEqual(['heading1', 'heading2', 'heading3']);
});

// Spec 041: el tipo `image` sólo lo crea `insertImageBlock`, que además guarda
// los bytes. Convertir una imagen en título dejaría un `imageId` colgado, y
// convertir un texto en imagen, un bloque de imagen sin imagen.
test('una imagen no se convierte en otra cosa', () => {
	expect(canChangeType({ type: 'image' }, 'heading1')).toBe(false);
	expect(planBlockType({ type: 'image', checked: false }, 'heading1')).toBe(null);
});

test('nada se convierte en imagen', () => {
	expect(canChangeType({ type: 'text' }, 'image')).toBe(false);
	expect(planBlockType({ type: 'text', checked: false }, 'image')).toBe(null);
});

test('los tipos de siempre siguen convirtiéndose', () => {
	expect(canChangeType({ type: 'text' }, 'todo')).toBe(true);
});
