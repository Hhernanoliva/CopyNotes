import { test, expect } from 'vitest';
import { commandsForSelection, selectionCoversBlock } from './safety';

test('single text block: everything enabled', () => {
	expect(commandsForSelection({ blockType: 'text', spansBlocks: false }))
		.toEqual({ inline: true, inlineCode: true, blockType: true, link: true, color: true });
});

test('code block: everything disabled', () => {
	expect(commandsForSelection({ blockType: 'code', spansBlocks: false }))
		.toEqual({ inline: false, inlineCode: false, blockType: false, link: false, color: false });
});

test('multi-block: everything disabled', () => {
	expect(commandsForSelection({ blockType: 'text', spansBlocks: true }))
		.toEqual({ inline: false, inlineCode: false, blockType: false, link: false, color: false });
});

test('the whole row selected covers the block', () => {
	expect(selectionCoversBlock('Precios de temporada', 'Precios de temporada')).toBe(true);
});

test('whitespace at either end still counts as the whole row', () => {
	expect(selectionCoversBlock('  Precios \n', 'Precios')).toBe(true);
	expect(selectionCoversBlock('Precios', '  Precios  ')).toBe(true);
});

test('a fragment does not cover the block', () => {
	expect(selectionCoversBlock('Precios', 'Precios de temporada')).toBe(false);
});

test('an empty selection or an empty row never counts as covered', () => {
	// An empty row stores the browser's phantom "\n", which must not read as
	// "the whole row is selected" and silently convert the block.
	expect(selectionCoversBlock('', '')).toBe(false);
	expect(selectionCoversBlock('\n', '\n')).toBe(false);
	expect(selectionCoversBlock('   ', '   ')).toBe(false);
	expect(selectionCoversBlock('Hola', '')).toBe(false);
});
