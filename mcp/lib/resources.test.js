import { describe, it, expect } from 'vitest';
import { notesToResources, noteToResourceContent, ACTIVITY_TAIL_LENGTH } from './resources.js';

function makeActivity(count) {
	const activity = [];
	for (let i = 1; i <= count; i++) {
		activity.push({ actor: 'agent', action: 'note', text: `entry ${i}`, at: `2026-07-2${i}T00:00:00Z`, seq: i });
	}
	return activity;
}

describe('notesToResources', () => {
	it('returns one resource entry per note, with copynotes:// uri and note title as name', () => {
		const exportPayload = {
			notes: [
				{
					id: 'note-1',
					title: 'Notas de la reunión',
					tasks: [
						{ id: 't1', content: 'Tarea 1', html: '<p>Tarea 1</p>', checked: false, createdBy: 'user', activity: [] },
						{ id: 't2', content: 'Tarea 2', html: '<p>Tarea 2</p>', checked: true, createdBy: 'agent', activity: [] }
					]
				},
				{
					id: 'note-2',
					title: 'Nota vacía',
					tasks: []
				}
			]
		};

		const resources = notesToResources(exportPayload);

		expect(resources).toEqual([
			{ uri: 'copynotes://note/note-1', name: 'Notas de la reunión', mimeType: 'application/json' },
			{ uri: 'copynotes://note/note-2', name: 'Nota vacía', mimeType: 'application/json' }
		]);
	});

	it('returns [] when notes is absent', () => {
		expect(notesToResources({})).toEqual([]);
	});

	it('returns [] when notes is an empty array', () => {
		expect(notesToResources({ notes: [] })).toEqual([]);
	});

	it('falls back gracefully when a note has no title', () => {
		const resources = notesToResources({ notes: [{ id: 'note-3', tasks: [] }] });

		expect(resources).toEqual([{ uri: 'copynotes://note/note-3', name: '', mimeType: 'application/json' }]);
	});
});

describe('noteToResourceContent', () => {
	it('projects tasks to {id, content, checked, createdBy, activity} — no html key', () => {
		const note = {
			id: 'note-1',
			title: 'Notas de la reunión',
			tasks: [
				{
					id: 't1',
					content: 'Tarea 1',
					html: '<p>Tarea 1</p>',
					checked: false,
					createdBy: 'user',
					activity: [{ actor: 'user', action: 'created', text: 'Tarea 1', at: '2026-07-20T00:00:00Z', seq: 1 }]
				}
			]
		};

		const content = noteToResourceContent(note);

		expect(content).toEqual({
			id: 'note-1',
			title: 'Notas de la reunión',
			tasks: [
				{
					id: 't1',
					content: 'Tarea 1',
					checked: false,
					createdBy: 'user',
					activity: [{ actor: 'user', action: 'created', text: 'Tarea 1', at: '2026-07-20T00:00:00Z' }]
				}
			]
		});
		expect(content.tasks[0]).not.toHaveProperty('html');
	});

	it('caps activity to the last ACTIVITY_TAIL_LENGTH entries (tail, not head)', () => {
		const activity = makeActivity(ACTIVITY_TAIL_LENGTH + 3);
		const note = {
			id: 'note-1',
			title: 'Nota larga',
			tasks: [{ id: 't1', content: 'Tarea', html: '<p>Tarea</p>', checked: false, createdBy: 'user', activity }]
		};

		const content = noteToResourceContent(note);

		expect(content.tasks[0].activity).toHaveLength(ACTIVITY_TAIL_LENGTH);
		const expectedTail = activity.slice(-ACTIVITY_TAIL_LENGTH).map(({ actor, action, text, at }) => ({ actor, action, text, at }));
		expect(content.tasks[0].activity).toEqual(expectedTail);
	});

	it('handles a note with no tasks', () => {
		const content = noteToResourceContent({ id: 'note-2', title: 'Nota vacía', tasks: [] });

		expect(content).toEqual({ id: 'note-2', title: 'Nota vacía', tasks: [] });
	});

	it('handles a note with tasks missing (defaults to [])', () => {
		const content = noteToResourceContent({ id: 'note-3', title: 'Nota sin tasks' });

		expect(content).toEqual({ id: 'note-3', title: 'Nota sin tasks', tasks: [] });
	});

	it('handles a task with no activity (defaults to [])', () => {
		const note = {
			id: 'note-1',
			title: 'Nota',
			tasks: [{ id: 't1', content: 'Tarea', html: '<p>Tarea</p>', checked: false, createdBy: 'user' }]
		};

		const content = noteToResourceContent(note);

		expect(content.tasks[0].activity).toEqual([]);
	});
});
