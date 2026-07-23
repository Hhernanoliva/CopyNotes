import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import * as ids from './ids';
import {
	appendActivity,
	listActivityByBlock,
	listActivityByNote,
	listRecentActivity
} from './activity';

beforeEach(async () => {
	// Deterministic clock: each now() call returns a strictly later ISO
	// timestamp, so ordering by `at` is stable no matter how fast the appends
	// run. Without this, fake-indexeddb resolves within a single real
	// millisecond, `at` ties, and the repo falls back to the random-uuid
	// tiebreak — which made these ordering assertions flaky.
	let tick = 0;
	vi.spyOn(ids, 'now').mockImplementation(() =>
		new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + tick++).toISOString()
	);
	await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
	vi.restoreAllMocks();
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
