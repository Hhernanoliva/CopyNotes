import { describe, it, expect } from 'vitest';
import { notesToResources, noteToMarkdown } from './resources.js';
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
				'## Proyecto X  ·  Trabajo',
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

	it('sin carpeta la cabecera es solo el título', () => {
		const md = noteToMarkdown({ ...note, folder: null, blocks: [] }, new Map());
		expect(md).toBe('## Proyecto X');
	});

	it('NO filtra bitácora ni UUIDs largos ni timestamps', () => {
		const md = noteToMarkdown(note, buildShortIds(payload));
		expect(md).not.toContain('secreto de bitácora');
		expect(md).not.toContain('aaaaaaaa-1111');
		expect(md).not.toContain('2026-07-25T');
	});
});
