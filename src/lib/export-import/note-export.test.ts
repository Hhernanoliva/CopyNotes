import { describe, expect, it } from 'vitest';
import { noteToMarkdown, noteToHtml, noteExportFileName } from './note-export';

const iso = '2026-07-10T12:00:00.000Z';

function block(id, overrides = {}) {
	return {
		id,
		noteId: 'note_1',
		parentBlockId: null,
		type: 'bullet',
		content: '',
		order: 0,
		collapsed: false,
		checked: false,
		createdAt: iso,
		updatedAt: iso,
		deletedAt: null,
		...overrides
	};
}

const note = { id: 'note_1', title: 'Plan de viaje', createdAt: iso, updatedAt: iso, deletedAt: null };

describe('noteToMarkdown', () => {
	it('renders title, nested bullets, and todo state', () => {
		const blocks = [
			block('a', { content: 'Equipaje', order: 0 }),
			block('b', { parentBlockId: 'a', content: 'Pasaporte', type: 'todo', checked: true, order: 0 }),
			block('c', { parentBlockId: 'a', content: 'Cargador', type: 'todo', order: 1 })
		];
		expect(noteToMarkdown(note, blocks)).toBe(
			['# Plan de viaje', '', '- Equipaje', '  - [x] Pasaporte', '  - [ ] Cargador'].join('\n')
		);
	});

	it('renders text as paragraphs, code fenced, and separators as rules', () => {
		const blocks = [
			block('a', { type: 'text', content: 'Notas sueltas', order: 0 }),
			block('b', { type: 'separator', order: 1 }),
			block('c', { type: 'code', content: 'console.log(1)', order: 2 })
		];
		expect(noteToMarkdown(note, blocks)).toBe(
			[
				'# Plan de viaje',
				'',
				'Notas sueltas',
				'',
				'---',
				'',
				'```',
				'console.log(1)',
				'```'
			].join('\n')
		);
	});

	it('fences code blocks nested under a bullet', () => {
		const blocks = [
			block('a', { type: 'bullet', content: 'Padre', order: 0 }),
			block('b', {
				type: 'code',
				content: 'const x = 1;\nconsole.log(x);',
				parentBlockId: 'a',
				order: 0
			})
		];
		expect(noteToMarkdown(note, blocks)).toContain(
			'- Padre\n  ```\n  const x = 1;\n  console.log(x);\n  ```'
		);
	});

	it('uses a longer fence when code already contains Markdown fences', () => {
		const blocks = [
			block('a', { type: 'code', content: '```js\nconst ready = true;\n```', order: 0 })
		];
		expect(noteToMarkdown(note, blocks)).toContain(
			'````\n```js\nconst ready = true;\n```\n````'
		);
	});

	it('renders heading blocks with their # level', () => {
		const blocks = [
			block('a', { type: 'heading1', content: 'Resumen', order: 0 }),
			block('b', { type: 'text', content: 'Hola', order: 1 }),
			block('c', { type: 'heading2', content: 'Detalle', order: 2 }),
			block('d', { type: 'heading3', content: 'Fino', order: 3 })
		];
		expect(noteToMarkdown(note, blocks)).toBe(
			['# Plan de viaje', '', '# Resumen', '', 'Hola', '', '## Detalle', '', '### Fino'].join('\n')
		);
	});

	it('renders a heading nested under a bullet with its # marker', () => {
		const blocks = [
			block('a', { type: 'bullet', content: 'Padre', order: 0 }),
			block('b', { type: 'heading2', content: 'Sección', parentBlockId: 'a', order: 0 })
		];
		expect(noteToMarkdown(note, blocks)).toContain('- Padre\n  ## Sección');
	});

	it('keeps collapsed children in the export', () => {
		const blocks = [
			block('a', { content: 'Padre', collapsed: true, order: 0 }),
			block('b', { parentBlockId: 'a', content: 'Oculto', order: 0 })
		];
		expect(noteToMarkdown(note, blocks)).toContain('  - Oculto');
	});
});

describe('noteToHtml', () => {
	it('renders a heading and one list for consecutive bullets', () => {
		const blocks = [
			block('a', { content: 'Uno', order: 0 }),
			block('b', { content: 'Dos', order: 1 }),
			block('c', { parentBlockId: 'b', content: 'Dos punto uno', order: 0 })
		];
		expect(noteToHtml(note, blocks)).toBe(
			'<h1>Plan de viaje</h1>' +
				'<ul><li>Uno</li><li>Dos<ul><li>Dos punto uno</li></ul></li></ul>'
		);
	});

	it('renders text, code, and separators as document elements', () => {
		const blocks = [
			block('a', { type: 'text', content: 'Hola', order: 0 }),
			block('b', { type: 'separator', order: 1 }),
			block('c', { type: 'code', content: 'x < y', order: 2 })
		];
		expect(noteToHtml(note, blocks)).toBe(
			'<h1>Plan de viaje</h1><p>Hola</p><hr><pre><code>x &lt; y</code></pre>'
		);
	});

	it('renders heading blocks as h1/h2/h3 elements', () => {
		const blocks = [
			block('a', { type: 'heading1', content: 'Resumen', order: 0 }),
			block('b', { type: 'heading2', content: 'Detalle', order: 1 }),
			block('c', { type: 'heading3', content: 'Fino', order: 2 })
		];
		expect(noteToHtml(note, blocks)).toBe(
			'<h1>Plan de viaje</h1><h1>Resumen</h1><h2>Detalle</h2><h3>Fino</h3>'
		);
	});

	it('renders a heading inside a list item and escapes its content', () => {
		const blocks = [
			block('a', { content: 'Padre', order: 0 }),
			block('b', { type: 'heading2', content: 'a<b>', parentBlockId: 'a', order: 0 })
		];
		expect(noteToHtml(note, blocks)).toContain('<li><h2>a&lt;b&gt;</h2></li>');
	});

	it('escapes HTML in title and content', () => {
		const evil = { ...note, title: 'a<b>' };
		const blocks = [block('a', { content: '<script>' })];
		const html = noteToHtml(evil, blocks);
		expect(html).toContain('<h1>a&lt;b&gt;</h1>');
		expect(html).toContain('&lt;script&gt;');
	});
});

describe('noteExportFileName', () => {
	it('slugs the title and appends the extension', () => {
		expect(noteExportFileName('Plan de viaje ✈️', 'md')).toBe('plan-de-viaje.md');
		expect(noteExportFileName('Plan de viaje', 'html')).toBe('plan-de-viaje.html');
	});

	it('falls back to "nota" for empty titles', () => {
		expect(noteExportFileName('', 'md')).toBe('nota.md');
	});
});

describe('block notes in export', () => {
	const iso2 = '2026-07-10T00:00:00.000Z';
	function blk(id, type, content, parentBlockId, order, note) {
		return { id, noteId: 'note_1', parentBlockId: parentBlockId ?? null, type, content, order, collapsed: false, checked: false, note: note ?? '', createdAt: iso2, updatedAt: iso2, deletedAt: null };
	}

	it('Markdown puts the note on an indented line under the item', () => {
		const blocks = [blk('a', 'bullet', 'Comprar', null, 0, 'en el super')];
		expect(noteToMarkdown({ id: 'note_1', title: 'T' }, blocks)).toContain('- Comprar\n  en el super');
	});

	it('HTML appends the note after the content', () => {
		const blocks = [blk('a', 'bullet', 'Comprar', null, 0, 'en el super')];
		expect(noteToHtml({ id: 'note_1', title: 'T' }, blocks)).toContain('Comprar<br>en el super');
	});
})

describe('inline formatting in export', () => {
	it('HTML export uses the stored inline html so bold and links survive', () => {
		const html = '<strong>hola</strong> <a href="https://x.com">ver</a>';
		const blocks = [block('a', { type: 'text', content: 'hola ver', html })];
		expect(noteToHtml(note, blocks)).toContain('<p>' + html + '</p>');
	});

	it('HTML export keeps formatting inside headings', () => {
		const blocks = [block('a', { type: 'heading2', content: 'muy fino', html: '<em>muy</em> fino' })];
		expect(noteToHtml(note, blocks)).toContain('<h2><em>muy</em> fino</h2>');
	});

	it('HTML export escapes content when a block has no stored html', () => {
		const blocks = [block('a', { type: 'text', content: 'a <b> & "c"' })];
		expect(noteToHtml(note, blocks)).toContain('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>');
	});

	it('HTML export keeps code blocks literal, ignoring stored html', () => {
		const blocks = [block('a', { type: 'code', content: 'const x = 1;', html: '<strong>x</strong>' })];
		expect(noteToHtml(note, blocks)).toContain('<pre><code>const x = 1;</code></pre>');
	});

	it('Markdown export converts bold and links to Markdown syntax', () => {
		const html = '<strong>hola</strong> <a href="https://x.com">ver</a>';
		const blocks = [block('a', { type: 'bullet', content: 'hola ver', html })];
		expect(noteToMarkdown(note, blocks)).toContain('- **hola** [ver](https://x.com)');
	});

	it('Markdown export converts formatting inside headings', () => {
		const blocks = [block('a', { type: 'heading2', content: 'muy fino', html: '<em>muy</em> fino' })];
		expect(noteToMarkdown(note, blocks)).toContain('## *muy* fino');
	});

	it('Markdown export drops colors and underline, keeping the text', () => {
		const html = '<span class="fmt-color-red">rojo</span> <u>raya</u>';
		const blocks = [block('a', { type: 'text', content: 'rojo raya', html })];
		expect(noteToMarkdown(note, blocks)).toContain('rojo raya');
	});

	it('Markdown export keeps code blocks raw, ignoring stored html', () => {
		const blocks = [block('a', { type: 'code', content: 'const x = 1;', html: '<strong>x</strong>' })];
		expect(noteToMarkdown(note, blocks)).toContain('```\nconst x = 1;\n```');
	});

	it('Markdown export uses raw content when a block has no stored html', () => {
		const blocks = [block('a', { type: 'text', content: 'sin formato' })];
		expect(noteToMarkdown(note, blocks)).toContain('sin formato');
	});
})

describe('date suffix (spec 021)', () => {
	const note = { title: 'Agenda' };
	it('markdown appends the date to list items and paragraphs', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'todo', content: 'pagar', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToMarkdown(note, blocks)).toContain('- [ ] pagar — 📅 22/07/2026');
	});
	it('markdown puts the code date after the closing fence', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'code', content: 'let a = 1;', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToMarkdown(note, blocks)).toContain('```\n📅 22/07/2026');
	});
	it('html export appends the date after the content', () => {
		const blocks = [
			{ id: 'b1', noteId: 'n1', parentBlockId: null, type: 'text', content: 'pagar', order: 0, checked: false, dueDate: '2026-07-22' }
		];
		expect(noteToHtml(note, blocks)).toContain('pagar — 📅 22/07/2026');
	});
});
