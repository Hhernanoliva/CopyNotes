import { expect, it } from 'vitest';
import { edgeForDirection } from './caret';

it('maps arrow direction to the line edge of the target block', () => {
	// Going up lands on the previous block's BOTTOM line.
	expect(edgeForDirection(-1)).toBe('bottom');
	// Going down lands on the next block's TOP line.
	expect(edgeForDirection(1)).toBe('top');
});
