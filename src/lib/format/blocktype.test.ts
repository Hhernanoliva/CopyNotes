import { test, expect } from 'vitest';
import { planBlockType, HEADING_TYPES } from './blocktype';

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
