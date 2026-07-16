import { describe, expect, it } from 'vitest';
import { buildCopyTree, formatPlainText, formatHtml } from './format';

function block(id, type, content, parentBlockId = null, order = 0, extra = {}) {
	return { id, type, content, parentBlockId, order, collapsed: false, checked: false, ...extra };
}

describe('buildCopyTree', () => {
	it('returns only the block when withChildren is false', () => {
		const blocks = [block('a', 'bullet', 'parent'), block('b', 'bullet', 'child', 'a')];
		const tree = buildCopyTree(blocks, 'a', false);
		expect(tree.block.id).toBe('a');
		expect(tree.children).toEqual([]);
	});

	it('includes descendants sorted by order when withChildren is true', () => {
		const blocks = [
			block('a', 'bullet', 'parent'),
			block('c', 'bullet', 'second', 'a', 1),
			block('b', 'bullet', 'first', 'a', 0),
			block('d', 'bullet', 'grandchild', 'b', 0)
		];
		const tree = buildCopyTree(blocks, 'a', true);
		expect(tree.children.map((n) => n.block.id)).toEqual(['b', 'c']);
		expect(tree.children[0].children[0].block.id).toBe('d');
	});

	it('includes children of collapsed blocks', () => {
		const blocks = [
			block('a', 'bullet', 'parent', null, 0, { collapsed: true }),
			block('b', 'bullet', 'hidden child', 'a')
		];
		const tree = buildCopyTree(blocks, 'a', true);
		expect(tree.children).toHaveLength(1);
	});
});

describe('formatPlainText', () => {
	it('formats a single text block as its content', () => {
		expect(formatPlainText(buildCopyTree([block('a', 'text', 'hola mundo')], 'a', false))).toBe(
			'hola mundo'
		);
	});

	it('formats a bullet with a dash marker', () => {
		expect(formatPlainText(buildCopyTree([block('a', 'bullet', 'idea')], 'a', false))).toBe(
			'- idea'
		);
	});

	it('formats a nested outline with two-space indentation', () => {
		const blocks = [
			block('a', 'bullet', 'parent'),
			block('b', 'bullet', 'child', 'a', 0),
			block('c', 'bullet', 'grandchild', 'b', 0),
			block('d', 'bullet', 'sibling', 'a', 1)
		];
		expect(formatPlainText(buildCopyTree(blocks, 'a', true))).toBe(
			'- parent\n  - child\n    - grandchild\n  - sibling'
		);
	});

	it('formats todos as checkboxes with checked state', () => {
		const blocks = [
			block('a', 'todo', 'pendiente'),
			block('b', 'todo', 'hecha', 'a', 0, { checked: true })
		];
		expect(formatPlainText(buildCopyTree(blocks, 'a', true))).toBe(
			'- [ ] pendiente\n  - [x] hecha'
		);
	});

	it('keeps code block lines and indents each one', () => {
		const blocks = [
			block('a', 'bullet', 'snippet'),
			block('b', 'code', 'line1\nline2', 'a', 0)
		];
		expect(formatPlainText(buildCopyTree(blocks, 'a', true))).toBe(
			'- snippet\n  line1\n  line2'
		);
	});

	it('formats separators as a horizontal rule', () => {
		expect(formatPlainText(buildCopyTree([block('a', 'separator', '')], 'a', false))).toBe('---');
	});
});

describe('formatHtml', () => {
	it('formats a single text block as a paragraph', () => {
		expect(formatHtml(buildCopyTree([block('a', 'text', 'hola')], 'a', false))).toBe(
			'<p>hola</p>'
		);
	});

	it('formats a single bullet as a one-item list', () => {
		expect(formatHtml(buildCopyTree([block('a', 'bullet', 'idea')], 'a', false))).toBe(
			'<ul><li>idea</li></ul>'
		);
	});

	it('nests children inside their parent list item', () => {
		const blocks = [
			block('a', 'bullet', 'parent'),
			block('b', 'bullet', 'child', 'a', 0)
		];
		expect(formatHtml(buildCopyTree(blocks, 'a', true))).toBe(
			'<ul><li>parent<ul><li>child</li></ul></li></ul>'
		);
	});

	it('marks todo state inside list items', () => {
		const blocks = [
			block('a', 'todo', 'pendiente'),
			block('b', 'todo', 'hecha', 'a', 0, { checked: true })
		];
		expect(formatHtml(buildCopyTree(blocks, 'a', true))).toBe(
			'<ul><li>[ ] pendiente<ul><li>[x] hecha</li></ul></li></ul>'
		);
	});

	it('formats a single code block as pre/code', () => {
		expect(formatHtml(buildCopyTree([block('a', 'code', 'const x = 1;')], 'a', false))).toBe(
			'<pre><code>const x = 1;</code></pre>'
		);
	});

	it('formats a separator as hr', () => {
		expect(formatHtml(buildCopyTree([block('a', 'separator', '')], 'a', false))).toBe('<hr>');
	});

	it('escapes html characters in content', () => {
		expect(formatHtml(buildCopyTree([block('a', 'text', 'a <b> & "c"')], 'a', false))).toBe(
			'<p>a &lt;b&gt; &amp; &quot;c&quot;</p>'
		);
	});
});

describe('block notes in copy output', () => {
	it('plain text puts the note on indented lines under the block', () => {
		const tree = buildCopyTree(
			[block('a', 'bullet', 'Comprar', null, 0, { note: 'en el super\ncon lista' })],
			'a',
			false
		);
		expect(formatPlainText(tree)).toBe('- Comprar\n  en el super\n  con lista');
	});

	it('plain text note nests under a nested block at its own depth', () => {
		const blocks = [
			block('a', 'bullet', 'Padre'),
			block('b', 'bullet', 'Hijo', 'a', 0, { note: 'detalle' })
		];
		expect(formatPlainText(buildCopyTree(blocks, 'a', true))).toBe('- Padre\n  - Hijo\n    detalle');
	});

	it('html appends the note after the content', () => {
		const tree = buildCopyTree(
			[block('a', 'bullet', 'Comprar', null, 0, { note: 'en el super' })],
			'a',
			false
		);
		expect(formatHtml(tree)).toContain('Comprar<br>en el super');
	});

	it('ignores an empty note', () => {
		const tree = buildCopyTree([block('a', 'text', 'hola', null, 0, { note: '' })], 'a', false);
		expect(formatPlainText(tree)).toBe('hola');
	});
});

describe('soft line breaks inside a block', () => {
	it('keeps a soft break inside a bullet as a hanging line (plain text)', () => {
		const tree = buildCopyTree([block('a', 'bullet', 'uno\ndos')], 'a', false);
		expect(formatPlainText(tree)).toBe('- uno\n  dos');
	});

	it('hangs extra todo lines under the checkbox marker (plain text)', () => {
		const tree = buildCopyTree([block('a', 'todo', 'uno\ndos', null, 0, { checked: false })], 'a', false);
		expect(formatPlainText(tree)).toBe('- [ ] uno\n      dos');
	});

	it('renders a soft break inside a bullet as <br> in HTML', () => {
		const tree = buildCopyTree([block('a', 'bullet', 'uno\ndos')], 'a', false);
		expect(formatHtml(tree)).toContain('uno<br>dos');
	});

	it('renders a soft break inside a lone text block as <br> in HTML', () => {
		const tree = buildCopyTree([block('a', 'text', 'uno\ndos')], 'a', false);
		expect(formatHtml(tree)).toBe('<p>uno<br>dos</p>');
	});
});

describe('heading blocks', () => {
	it('copies a heading as plain text with its # marker', () => {
		expect(formatPlainText(buildCopyTree([block('a', 'heading1', 'Resumen')], 'a', false))).toBe(
			'# Resumen'
		);
		expect(formatPlainText(buildCopyTree([block('a', 'heading2', 'Detalle')], 'a', false))).toBe(
			'## Detalle'
		);
		expect(formatPlainText(buildCopyTree([block('a', 'heading3', 'Fino')], 'a', false))).toBe(
			'### Fino'
		);
	});

	it('copies a lone heading as its HTML element', () => {
		expect(formatHtml(buildCopyTree([block('a', 'heading2', 'Detalle')], 'a', false))).toBe(
			'<h2>Detalle</h2>'
		);
	});

	it('copies a heading with children as a list keeping the heading element', () => {
		const blocks = [block('a', 'heading2', 'Detalle'), block('b', 'bullet', 'idea', 'a')];
		expect(formatHtml(buildCopyTree(blocks, 'a', true))).toBe(
			'<ul><li><h2>Detalle</h2><ul><li>idea</li></ul></li></ul>'
		);
	});

	it('copies heading children indented under it in plain text', () => {
		const blocks = [block('a', 'heading2', 'Detalle'), block('b', 'bullet', 'idea', 'a')];
		expect(formatPlainText(buildCopyTree(blocks, 'a', true))).toBe('## Detalle\n  - idea');
	});
});

describe('inline formatting in HTML copy', () => {
	it('uses the stored inline html so bold survives an external paste', () => {
		const blocks = [
			block('a', 'text', 'hola mundo', null, 0, { html: '<strong>hola</strong> mundo' })
		];
		expect(formatHtml(buildCopyTree(blocks, 'a', false))).toBe(
			'<p><strong>hola</strong> mundo</p>'
		);
	});

	it('keeps links and colors inside bullets', () => {
		const html = '<a href="https://x.com">ver</a> <span class="fmt-color-red">rojo</span>';
		const blocks = [block('a', 'bullet', 'ver rojo', null, 0, { html })];
		expect(formatHtml(buildCopyTree(blocks, 'a', false))).toBe(`<ul><li>${html}</li></ul>`);
	});

	it('keeps inline formatting inside headings', () => {
		const blocks = [
			block('a', 'heading2', 'muy fino', null, 0, { html: '<em>muy</em> fino' })
		];
		expect(formatHtml(buildCopyTree(blocks, 'a', false))).toBe('<h2><em>muy</em> fino</h2>');
	});

	it('falls back to escaped content when a block has no stored html', () => {
		const blocks = [block('a', 'text', 'a <b> & "c"')];
		expect(formatHtml(buildCopyTree(blocks, 'a', false))).toBe(
			'<p>a &lt;b&gt; &amp; &quot;c&quot;</p>'
		);
	});

	it('keeps code blocks literal, ignoring stored html', () => {
		const blocks = [
			block('a', 'code', 'const x = 1;', null, 0, { html: '<strong>const x = 1;</strong>' })
		];
		expect(formatHtml(buildCopyTree(blocks, 'a', false))).toBe(
			'<pre><code>const x = 1;</code></pre>'
		);
	});
});

describe('date suffix (spec 021)', () => {
	const dated = (type, extra = {}) => ({
		block: { id: 'b1', type, content: 'pagar', checked: false, dueDate: '2026-07-22', ...extra },
		children: []
	});
	it('plain text appends the date to the last content line', () => {
		expect(formatPlainText(dated('todo'))).toBe('- [ ] pagar — 📅 22/07/2026');
	});
	it('plain text puts the date after soft-break lines, before the note', () => {
		const tree = dated('bullet', { content: 'uno\ndos', note: 'gris' });
		expect(formatPlainText(tree)).toBe('- uno\n  dos — 📅 22/07/2026\n  gris');
	});
	it('plain text gives code its own date line', () => {
		const tree = dated('code', { content: 'let a = 1;' });
		expect(formatPlainText(tree)).toBe('let a = 1;\n📅 22/07/2026');
	});
	it('html appends the date after the inline content', () => {
		expect(formatHtml(dated('text'))).toBe('<p>pagar — 📅 22/07/2026</p>');
	});
	it('html gives a code block a dash-free date after the closing tag', () => {
		const html = formatHtml(dated('code', { content: 'let a = 1;' }));
		expect(html).toContain('</code></pre> 📅 22/07/2026');
		expect(html).not.toContain(' — 📅');
	});
	it('html appends the date to a todo', () => {
		expect(formatHtml(dated('todo'))).toContain('pagar — 📅 22/07/2026');
	});
	it('undated blocks are untouched', () => {
		const tree = { block: { id: 'b1', type: 'text', content: 'pagar', checked: false }, children: [] };
		expect(formatPlainText(tree)).toBe('pagar');
	});
});
