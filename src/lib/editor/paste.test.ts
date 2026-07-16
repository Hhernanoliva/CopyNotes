import { describe, expect, it } from 'vitest';
import { looksLikeCodePaste, parsePastedLines } from './paste';

describe('parsePastedLines', () => {
	it('drops blank lines and keeps order', () => {
		expect(parsePastedLines('uno\n\n\ndos')).toEqual([
			{ type: 'text', content: 'uno' },
			{ type: 'text', content: 'dos' }
		]);
	});

	it('recognises -, *, • as bullets', () => {
		expect(parsePastedLines('- a\n* b\n• c')).toEqual([
			{ type: 'bullet', content: 'a' },
			{ type: 'bullet', content: 'b' },
			{ type: 'bullet', content: 'c' }
		]);
	});

	it('recognises [ ] and [x] as todos with checked state', () => {
		expect(parsePastedLines('[ ] pan\n[x] llamar\n[X] pagar')).toEqual([
			{ type: 'todo', content: 'pan', checked: false },
			{ type: 'todo', content: 'llamar', checked: true },
			{ type: 'todo', content: 'pagar', checked: true }
		]);
	});

	it('treats everything else as text and trims a trailing \\r', () => {
		expect(parsePastedLines('hola\r\nchau')).toEqual([
			{ type: 'text', content: 'hola' },
			{ type: 'text', content: 'chau' }
		]);
	});

	it('recognises a todo with a leading bullet marker (CopyNotes plain text)', () => {
		expect(parsePastedLines('- [ ] pan\n- [x] llamar')).toEqual([
			{ type: 'todo', content: 'pan', checked: false },
			{ type: 'todo', content: 'llamar', checked: true }
		]);
	});

	it('returns an empty array for empty input', () => {
		expect(parsePastedLines('')).toEqual([]);
		expect(parsePastedLines('\n\n')).toEqual([]);
	});
});

describe('looksLikeCodePaste', () => {
	it('recognises common code and preserves conservative coverage across languages', () => {
		expect(looksLikeCodePaste('const total = items.length;\nconsole.log(total);')).toBe(true);
		expect(looksLikeCodePaste('def greet(name):\n    print(f"Hello {name}")')).toBe(true);
		expect(looksLikeCodePaste('<section>\n  <p>Hola</p>\n</section>')).toBe(true);
		expect(looksLikeCodePaste('pnpm install\npnpm run dev')).toBe(true);
	});

	it('recognises fenced code, JSON and indented configuration', () => {
		expect(looksLikeCodePaste('```js\nconst ready = true;\n```')).toBe(true);
		expect(looksLikeCodePaste('{\n  "name": "CopyNotes",\n  "private": true\n}')).toBe(true);
		expect(looksLikeCodePaste('scripts:\n  dev: vite\n  test: vitest')).toBe(true);
		expect(looksLikeCodePaste('SELECT id, name\nFROM notes\nWHERE deleted_at = null;')).toBe(true);
	});

	it('does not turn prose, lists or a single line into code', () => {
		expect(looksLikeCodePaste('Hola Hernán:\n  Te dejo el resumen de la reunión.\n  Espero que te sirva.')).toBe(false);
		expect(looksLikeCodePaste('- comprar pan\n- llamar a Clara\n- preparar la cena')).toBe(false);
		expect(looksLikeCodePaste('[ ] revisar texto\n[x] enviar versión')).toBe(false);
		expect(looksLikeCodePaste('const ready = true;')).toBe(false);
		expect(looksLikeCodePaste('Create a new note\nUpdate the title\nDelete the draft')).toBe(false);
		expect(looksLikeCodePaste('From the meeting notes\nWhere should we go next?')).toBe(false);
		expect(looksLikeCodePaste('Meeting:\n  Review the roadmap\nOwner: Hernan')).toBe(false);
		expect(looksLikeCodePaste('Smith (2024)\nJones (2023)')).toBe(false);
		expect(looksLikeCodePaste('Monday (office)\nTuesday (home)')).toBe(false);
		expect(looksLikeCodePaste('Meeting (Monday)\n  Bring the notes')).toBe(false);
		expect(looksLikeCodePaste('use the first option\nuse the second option')).toBe(false);
		expect(looksLikeCodePaste('import costs increased\nexport sales declined')).toBe(false);
		expect(looksLikeCodePaste('public transport is delayed\nprivate lessons start Monday')).toBe(false);
	});

	it('does not turn everyday "Etiqueta: valor" notes into code', () => {
		expect(looksLikeCodePaste('Precio: 100\n  Descuento: 10')).toBe(false);
		expect(looksLikeCodePaste('Nombre: Juan\n  Apellido: Perez')).toBe(false);
		expect(looksLikeCodePaste('tarea: comprar pan\n  nota: para el desayuno')).toBe(false);
	});
});
