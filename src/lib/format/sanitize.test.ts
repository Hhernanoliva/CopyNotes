// @vitest environment=jsdom
import { describe, test, expect } from 'vitest';
import { sanitizeHtml, htmlToPlainText, plainTextToHtml, removePlainTextRange } from './sanitize';

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

	test('unwraps fmt-color classes outside the approved palette', () => {
		expect(sanitizeHtml('<span class="fmt-color-evil">a</span>')).toBe('a');
		expect(sanitizeHtml('<span class="fmt-color-amber">a</span>'))
			.toBe('<span class="fmt-color-amber">a</span>');
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

	test('keeps <br> as a newline', () => {
		expect(htmlToPlainText('a<br>b')).toBe('a\nb');
	});

	test('keeps a <br> inside inline formatting as a newline', () => {
		expect(htmlToPlainText('<strong>a<br>b</strong>')).toBe('a\nb');
	});

	test('is the inverse of plainTextToHtml', () => {
		for (const text of ['a\nb', 'uno\n\ndos', '<x> & "y"', 'plano']) {
			expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
		}
	});
});

describe('plainTextToHtml', () => {
	test('escapes literal markup instead of letting it parse as HTML', () => {
		expect(plainTextToHtml('<img src=x onerror=alert(1)>')).toBe(
			'&lt;img src=x onerror=alert(1)&gt;'
		);
	});

	test('escapes ampersands', () => {
		expect(plainTextToHtml('a & b')).toContain('&amp;');
	});

	test('turns newlines into <br>', () => {
		expect(plainTextToHtml('l1\nl2')).toBe('l1<br>l2');
	});
});

describe('removePlainTextRange', () => {
	test('removes a plain trailing "/query" from unformatted html', () => {
		// plain: "Hola mundo/tarea" — remove [10, 16)
		expect(removePlainTextRange('Hola mundo/tarea', 10, 16)).toBe('Hola mundo');
	});

	test('removes a range that lives inside an inline tag', () => {
		// plain: "ab/cde" — remove [2, 4) ("/c")
		expect(removePlainTextRange('a<strong>b/cd</strong>e', 2, 4)).toBe('a<strong>bd</strong>e');
	});

	test('removes a range that spans a tag boundary', () => {
		// plain: "abc/qd" — remove [3, 5) ("/q"): ends "c", starts the tail text
		expect(removePlainTextRange('ab<strong>c/q</strong>d', 3, 5)).toBe('ab<strong>c</strong>d');
	});

	test('drops inline wrappers left empty by the removal', () => {
		// plain: "a/xb" — remove [1, 3)
		expect(removePlainTextRange('a<strong>/x</strong>b', 1, 3)).toBe('ab');
		expect(removePlainTextRange('a<strong><em>/x</em></strong>b', 1, 3)).toBe('ab');
	});

	test('counts <br> as one character and can remove it', () => {
		// plain: "a\nb" — remove [1, 2) (the line break)
		expect(removePlainTextRange('a<br>b', 1, 2)).toBe('ab');
		// keep it when the range is elsewhere: plain "a\n/xb" remove [2, 4)
		expect(removePlainTextRange('a<br>/xb', 2, 4)).toBe('a<br>b');
	});

	test('returns the html unchanged for an empty or inverted range', () => {
		expect(removePlainTextRange('a<strong>b</strong>', 1, 1)).toBe('a<strong>b</strong>');
		expect(removePlainTextRange('', 0, 3)).toBe('');
	});
});
