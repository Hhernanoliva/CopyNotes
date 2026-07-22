import { describe, expect, it } from 'vitest';
import { intentFromBeforeInput } from './mobileInput';

describe('intentFromBeforeInput', () => {
	it('insertParagraph es un Enter de bloque', () => {
		expect(intentFromBeforeInput('insertParagraph')).toBe('enter');
	});
	it('insertLineBreak es un salto suave', () => {
		expect(intentFromBeforeInput('insertLineBreak')).toBe('softbreak');
	});
	it('insertText no es ninguno', () => {
		expect(intentFromBeforeInput('insertText')).toBe(null);
	});
});
