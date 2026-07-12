import { test, expect } from 'vitest';
import { commandsForSelection } from './safety';

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
