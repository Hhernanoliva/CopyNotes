import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, updateNote, createBlock, createFolder } from '$lib/storage';
import { buildAgentExport, toAgentPayload } from './export';

describe('toAgentPayload v2 (proyección + gate de privacidad)', () => {
	it('nota sin 🤖 no aporta NADA (ni título, ni prosa, ni tareas)', () => {
		const notes = [
			{ id: 'n1', title: 'Visible', agentVisible: true, folderId: null },
			{ id: 'n2', title: 'Privada', agentVisible: false, folderId: null }
		];
		const blocksByNote = {
			n1: [{ id: 'b1', parentBlockId: null, order: 0, type: 'todo', content: 'hacer', checked: false, createdBy: 'user', note: '' }],
			n2: [{ id: 'b2', parentBlockId: null, order: 0, type: 'text', content: 'secreto', checked: false, createdBy: 'user', note: '' }]
		};
		const payload = toAgentPayload(notes, blocksByNote, {}, {});
		expect(payload.version).toBe(2);
		expect(payload.notes.map((n) => n.id)).toEqual(['n1']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('incluye prosa como contexto y tareas pendientes, en orden de árbol, con depth', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: 'f1' }];
		const blocksByNote = {
			n1: [
				{ id: 'p1', parentBlockId: null, order: 0, type: 'text', content: 'contexto', checked: false, createdBy: 'user', note: '' },
				{ id: 't1', parentBlockId: null, order: 1, type: 'todo', content: 'pendiente', checked: false, createdBy: 'agent-uuid', note: '' },
				{ id: 't1a', parentBlockId: 't1', order: 0, type: 'todo', content: 'subtarea', checked: false, createdBy: 'user', note: '' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { t1: [{ action: 'created' }] }, { f1: 'Trabajo' });
		const note = payload.notes[0];
		expect(note.folder).toBe('Trabajo');
		expect(note.blocks.map((b) => b.id)).toEqual(['p1', 't1', 't1a']);
		expect(note.blocks.map((b) => b.depth)).toEqual([0, 0, 1]);
		expect(note.blocks[1].createdBy).toBe('agent-uuid');
		expect(note.blocks[1].activity).toEqual([{ action: 'created' }]);
		expect(note.blocks[0].activity).toBeUndefined();
	});

	it('excluye completadas, separadores, prosa vacía; comentario y html JAMÁS viajan', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: null }];
		const blocksByNote = {
			n1: [
				{ id: 'done', parentBlockId: null, order: 0, type: 'todo', content: 'hecha', checked: true, createdBy: 'user', note: '' },
				{ id: 'sep', parentBlockId: null, order: 1, type: 'separator', content: '', checked: false, createdBy: 'user', note: '' },
				{ id: 'empty', parentBlockId: null, order: 2, type: 'text', content: '   ', checked: false, createdBy: 'user', note: '' },
				{ id: 'ok', parentBlockId: null, order: 3, type: 'todo', content: 'pendiente', checked: false, createdBy: 'user', html: '<b>pendiente</b>', note: 'comentario privado' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { ok: [] }, {});
		expect(payload.notes[0].blocks.map((b) => b.id)).toEqual(['ok']);
		expect(payload.notes[0].folder).toBeNull();
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('comentario privado');
		expect(flat).not.toContain('hecha');
		expect(flat).not.toContain('<b>');
	});
});

// The deployed entry point (touches storage). Guards the defense-in-depth
// property that lives only here: a hidden note's blocks must never even be
// read, so nothing about it can reach the payload.
describe('buildAgentExport (privacy gate over real storage)', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});

	it('exports only agentVisible notes; a hidden note leaks nothing', async () => {
		const visible = await createNote({ title: 'Visible' });
		await updateNote(visible.id, { agentVisible: true });
		await createBlock({ noteId: visible.id, type: 'todo', content: 'hacer' });

		const hidden = await createNote({ title: 'Privada' });
		await createBlock({ noteId: hidden.id, type: 'todo', content: 'secreto' });

		const payload = await buildAgentExport();

		expect(payload.notes.map((note) => note.title)).toEqual(['Visible']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('trae el nombre de la carpeta de la nota y nunca el comentario de un bloque', async () => {
		const folder = await createFolder('note', 'Trabajo');
		const note = await createNote({ title: 'Con carpeta' });
		await updateNote(note.id, { agentVisible: true, folderId: folder.id });
		await createBlock({ noteId: note.id, type: 'todo', content: 'tarea', note: 'privadísimo' });

		const payload = await buildAgentExport();
		const exported = payload.notes.find((n) => n.id === note.id);
		expect(exported.folder).toBe('Trabajo');
		expect(JSON.stringify(payload)).not.toContain('privadísimo');
	});
});
