import { describe, expect, it } from 'vitest';
import { htmlInlineToMarkdown } from './inline-markdown';

describe('htmlInlineToMarkdown', () => {
	it('passes plain text through, unescaping entities', () => {
		expect(htmlInlineToMarkdown('2 &lt; 3 &amp; 4 &gt; 1')).toBe('2 < 3 & 4 > 1');
	});

	it('returns empty string for empty or missing html', () => {
		expect(htmlInlineToMarkdown('')).toBe('');
		expect(htmlInlineToMarkdown(null)).toBe('');
	});

	it('converts bold to double asterisks', () => {
		expect(htmlInlineToMarkdown('<strong>hola</strong>')).toBe('**hola**');
	});

	it('converts italic to single asterisks, nested inside bold text', () => {
		expect(htmlInlineToMarkdown('un <em>texto <strong>fuerte</strong></em>')).toBe(
			'un *texto **fuerte***'
		);
	});

	it('converts strikethrough to double tildes', () => {
		expect(htmlInlineToMarkdown('<s>viejo</s>')).toBe('~~viejo~~');
	});

	it('unwraps underline, which has no Markdown equivalent', () => {
		expect(htmlInlineToMarkdown('<u>subrayado</u>')).toBe('subrayado');
	});

	it('unwraps color spans, keeping the text', () => {
		expect(htmlInlineToMarkdown('<span class="fmt-color-red">rojo</span>')).toBe('rojo');
	});

	it('converts links to [text](url), dropping target and rel', () => {
		expect(
			htmlInlineToMarkdown(
				'<a href="https://x.com/a" target="_blank" rel="noopener noreferrer">ver</a>'
			)
		).toBe('[ver](https://x.com/a)');
	});

	it('converts <br> to a newline', () => {
		expect(htmlInlineToMarkdown('uno<br>dos')).toBe('uno\ndos');
	});

	it('wraps inline code in backticks', () => {
		expect(htmlInlineToMarkdown('<code>npm run dev</code>')).toBe('`npm run dev`');
	});

	it('uses longer backtick runs when the code contains backticks', () => {
		expect(htmlInlineToMarkdown('<code>a `b`</code>')).toBe('`` a `b` ``');
	});

	it('moves boundary spaces outside emphasis markers so Markdown renders them', () => {
		expect(htmlInlineToMarkdown('<strong>hola </strong>mundo')).toBe('**hola** mundo');
	});

	it('drops emphasis markers around empty content', () => {
		expect(htmlInlineToMarkdown('a<strong> </strong>b')).toBe('a b');
	});

	it('unescapes entities inside link hrefs', () => {
		expect(htmlInlineToMarkdown('<a href="https://x.com/?a=1&amp;b=2">q</a>')).toBe(
			'[q](https://x.com/?a=1&b=2)'
		);
	});
});
