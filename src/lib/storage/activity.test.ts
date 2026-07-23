import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
	appendActivity,
	listActivityByBlock,
	listActivityByNote,
	listRecentActivity
} from './activity';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('activity repository', () => {
	it('appends an entry with actor, action, at and defaults', async () => {
		const row = await appendActivity({
			blockId: 'b1',
			noteId: 'n1',
			actor: 'agent',
			action: 'done'
		});
		expect(row.blockId).toBe('b1');
		expect(row.actor).toBe('agent');
		expect(row.action).toBe('done');
		expect(row.text).toBe('');
		expect(typeof row.at).toBe('string');
		expect(row.deletedAt).toBe(null);
	});

	it('lists a block entries ascending by at', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'user', action: 'created', text: 'c' });

		const rows = await listActivityByBlock('b1');
		expect(rows.map((r) => r.text)).toEqual(['a', 'b']);
	});

	it('lists a note entries and recent activity newest first', async () => {
		await appendActivity({ blockId: 'b1', noteId: 'n1', actor: 'user', action: 'created', text: 'a' });
		await appendActivity({ blockId: 'b2', noteId: 'n1', actor: 'agent', action: 'done', text: 'b' });

		expect((await listActivityByNote('n1')).length).toBe(2);
		const recent = await listRecentActivity(10);
		expect(recent[0].text).toBe('b');
	});
});
