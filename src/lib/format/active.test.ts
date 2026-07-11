import { test, expect } from 'vitest';
import { activeFormatsFor } from './active';

function build(html) {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
}

test('detects nested bold + italic at a text node', () => {
	const root = build('<strong><em>hi</em></strong>');
	const textNode = root.querySelector('em').firstChild;
	const active = activeFormatsFor(textNode, root);
	expect(active.bold).toBe(true);
	expect(active.italic).toBe(true);
	expect(active.underline).toBe(false);
});

test('detects code, link and color', () => {
	const root = build('<code>a</code><a href="https://x.com">b</a><span class="fmt-color-red">c</span>');
	expect(activeFormatsFor(root.querySelector('code').firstChild, root).code).toBe(true);
	expect(activeFormatsFor(root.querySelector('a').firstChild, root).link).toBe(true);
	expect(activeFormatsFor(root.querySelector('span').firstChild, root).color).toBe('fmt-color-red');
});

test('plain text has no active formats', () => {
	const root = build('plain');
	const active = activeFormatsFor(root.firstChild, root);
	expect(active).toEqual({ bold: false, italic: false, underline: false, strike: false, code: false, link: false, color: null });
});
