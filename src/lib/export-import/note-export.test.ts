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
