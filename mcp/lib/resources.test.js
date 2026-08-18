import { describe, it, expect } from 'vitest';
import { notesToResources, noteToMarkdown, staleExportNotice, withStaleNotice } from './resources.js';
import { buildShortIds } from './ids.js';

const note = {
	id: 'aaaaaaaa-1111-4111-8111-111111111111',
	title: 'Proyecto X',
	folder: 'Trabajo',
	blocks: [
		{ id: 'h1', type: 'heading2', content: 'Contexto', depth: 0 },
		{ id: 'p1', type: 'text', content: 'Cliente quiere demo el viernes.', depth: 0 },
		{ id: 'c1', type: 'code', content: 'npm run build', depth: 0 },
		{
			id: 'bbbbbbbb-2222-4222-8222-222222222222',
			type: 'todo',
			content: 'Armar demo',
			depth: 0,
			createdBy: 'user',
			activity: [{ actor: 'user', action: 'note', text: 'secreto de bitácora', at: '2026-07-25T00:00:00Z' }]
		},
		{ id: 'dddddddd-4444-4444-8444-444444444444', type: 'todo', content: 'Subtarea', depth: 1, createdBy: 'agente-uuid', activity: [] }
	]
};
const payload = { notes: [note] };

describe('notesToResources', () => {
	it('una entrada por nota, mimeType markdown', () => {
		const resources = notesToResources(payload);
		expect(resources).toEqual([
			{ uri: 'copynotes://note/aaaaaaaa-1111-4111-8111-111111111111', name: 'Proyecto X', mimeType: 'text/markdown' }
		]);
	});
});

describe('noteToMarkdown', () => {
	it('proyecta cabecera con carpeta, contexto y tareas con id corto e indentación', () => {
		const md = noteToMarkdown(note, buildShortIds(payload));
		expect(md).toBe(
			[
				'## aaaaaaaa  Proyecto X  ·  Trabajo',
				'',
				'## Contexto',
				'',
				'Cliente quiere demo el viernes.',
				'',
				'```',
				'npm run build',
				'```',
				'',
				'- [ ] bbbbbbbb Armar demo',
				'  - [ ] dddddddd Subtarea'
			].join('\n')
		);
	});

	it('sin carpeta la cabecera es id corto + título', () => {
		const n = { ...note, folder: null, blocks: [] };
		const md = noteToMarkdown(n, buildShortIds({ notes: [n] }));
		expect(md).toBe('## aaaaaaaa  Proyecto X');
	});

	it('NO filtra bitácora ni UUIDs largos ni timestamps', () => {
		const md = noteToMarkdown(note, buildShortIds(payload));
		expect(md).not.toContain('secreto de bitácora');
		expect(md).not.toContain('aaaaaaaa-1111');
		expect(md).not.toContain('2026-07-25T');
	});

	it('usa un fence más largo si el código contiene backticks triples', () => {
		const n = { title: 'T', folder: null, blocks: [{ id: 'c', type: 'code', content: 'tiene ``` adentro', depth: 0 }] };
		const md = noteToMarkdown(n, new Map());
		expect(md).toBe(['## T', '', '````', 'tiene ``` adentro', '````'].join('\n'));
	});

	it('oculta las tareas completadas aunque viajen en el export', () => {
		const n = {
			title: 'T',
			folder: null,
			blocks: [
				{ id: 'p', type: 'todo', content: 'pendiente', checked: false, depth: 0, activity: [] },
				{ id: 'd', type: 'todo', content: 'completada', checked: true, depth: 0, activity: [] }
			]
		};
		const md = noteToMarkdown(n, new Map());
		expect(md).toContain('pendiente');
		expect(md).not.toContain('completada');
	});

	it('indenta código y títulos anidados según depth', () => {
		const n = {
			title: 'T',
			folder: null,
			blocks: [
				{ id: 't', type: 'todo', content: 'padre', depth: 0, activity: [] },
				{ id: 'h', type: 'heading2', content: 'Sub', depth: 1 },
				{ id: 'c', type: 'code', content: 'x', depth: 1 }
			]
		};
		const md = noteToMarkdown(n, new Map());
		expect(md).toBe(['## T', '', '- [ ] t padre', '', '  ## Sub', '', '  ```', '  x', '  ```'].join('\n'));
	});
});

describe('staleExportNotice', () => {
	const at = '2026-07-20T10:00:00.000Z';
	const day = 24 * 60 * 60 * 1000;
	const parsed = Date.parse(at);

	it('says nothing while the buzón is fresh', () => {
		expect(staleExportNotice({ exportedAt: at }, parsed + day - 1)).toBeNull();
	});

	it('warns once the buzón has gone a day without an update', () => {
		const notice = staleExportNotice({ exportedAt: at }, parsed + 3 * day);
		expect(notice).toContain('3 días');
		expect(notice).toContain('en espera');
	});

	it('says nothing when there is no timestamp to judge', () => {
		expect(staleExportNotice({}, parsed)).toBeNull();
		expect(staleExportNotice({ exportedAt: 'no es fecha' }, parsed)).toBeNull();
		expect(staleExportNotice(undefined, parsed)).toBeNull();
	});

	it('puts the warning above the content, separated from it', () => {
		const fresh = withStaleNotice('CUERPO', { exportedAt: at }, parsed);
		expect(fresh).toBe('CUERPO');
		const stale = withStaleNotice('CUERPO', { exportedAt: at }, parsed + 3 * day);
		expect(stale.startsWith('⚠️')).toBe(true);
		expect(stale.endsWith('\n\nCUERPO')).toBe(true);
	});
});

// El "Listo" de la otra persona (spec 038 §8), bajo el título. Va en la
// proyección que el agente lee SIEMPRE, no en una herramienta a demanda, porque
// es un estado y no un historial.
describe('el Listo bajo el título', () => {
	it('sale con el nombre y la aclaración', () => {
		const md = noteToMarkdown(
			{ id: 'n1', title: 'Contador', blocks: [], done: { actorLabel: 'Juan', text: 'falta la factura' } },
			new Map()
		);
		expect(md).toContain('> ✓ Juan marcó Listo: falta la factura');
	});

	it('sin aclaración, la línea igual sale', () => {
		const md = noteToMarkdown(
			{ id: 'n1', title: 'Contador', blocks: [], done: { actorLabel: 'Juan', text: '' } },
			new Map()
		);
		expect(md).toContain('> ✓ Juan marcó Listo');
		expect(md).not.toContain('Listo:');
	});

	// El control: sin esta prueba, un `if` mal escrito mete un "✓ undefined" en
	// TODAS las notas que el agente lee.
	it('una nota sin Listo queda igual que siempre', () => {
		const md = noteToMarkdown({ id: 'n1', title: 'Contador', blocks: [] }, new Map());
		expect(md).not.toContain('✓');
	});
});
