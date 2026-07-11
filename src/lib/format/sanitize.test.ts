// @vitest environment=jsdom
import { describe, test, expect } from 'vitest';
import { sanitizeHtml, htmlToPlainText } from './sanitize';

describe('sanitizeHtml', () => {
	test('keeps allowed inline tags', () => {
		expect(sanitizeHtml('<strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code>'))
			.toBe('<strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code>');
	});

	test('normalizes legacy tags', () => {
		expect(sanitizeHtml('<b>a</b><i>b</i><strike>c</strike>'))
			.toBe('<strong>a</strong><em>b</em><s>c</s>');
	});

	test('strips disallowed tags to their text', () => {
		expect(sanitizeHtml('<div onclick="x">a<script>evil()<\/script></div>')).toBe('aevil()');
	});

	test('removes disallowed attributes but keeps the tag', () => {
		expect(sanitizeHtml('<strong style="color:red" onclick="x">a</strong>'))
			.toBe('<strong>a</strong>');
	});

	test('keeps a color span only with an fmt-color class', () => {
		expect(sanitizeHtml('<span class="fmt-color-red">a</span>'))
			.toBe('<span class="fmt-color-red">a</span>');
		expect(sanitizeHtml('<span class="evil">a</span>')).toBe('a');
	});

	test('normalizes links and forces safe target/rel', () => {
		expect(sanitizeHtml('<a href="example.com">x</a>'))
			.toBe('<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>');
	});

	test('drops javascript: urls', () => {
		expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('x');
	});
});

describe('htmlToPlainText', () => {
	test('returns textContent', () => {
		expect(htmlToPlainText('<strong>a</strong> b')).toBe('a b');
	});
});
