import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getProcessedChange, recordProcessedChange } from './dedupe';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('processed-change dedupe ledger', () => {
	it('returns undefined for an id that was never recorded', async () => {
		expect(await getProcessedChange('unknown')).toBeUndefined();
	});

	it('returns the recorded outcome for a known id', async () => {
		const outcome = { id: 'chg-1', ok: true, result: { taskId: 'abc' } };
		await recordProcessedChange('chg-1', outcome);
		expect(await getProcessedChange('chg-1')).toEqual(outcome);
	});

	// The ledger used to grow forever: every agent change ever delivered stayed
	// on disk with the text of its answer. Same cleanup rule as the buzón's
	// processed/ pile (spec 030 phase 0): a week, then it is history nobody reads.
	it('forgets entries older than a week and keeps the recent ones', async () => {
		const day = 24 * 60 * 60 * 1000;
		const ancient = new Date(Date.now() - 8 * day).toISOString();
		const yesterday = new Date(Date.now() - 1 * day).toISOString();
		await db.table('settings').put({
			key: 'processedChanges',
			value: {
				'chg-vieja': { at: ancient, outcome: { ok: true } },
				'chg-reciente': { at: yesterday, outcome: { ok: false } }
			},
			updatedAt: ancient
		});

		// Any write is the moment to sweep; nothing schedules a separate job.
		await recordProcessedChange('chg-nueva', { ok: true });

		expect(await getProcessedChange('chg-vieja')).toBeUndefined();
		expect(await getProcessedChange('chg-reciente')).toEqual({ ok: false });
		expect(await getProcessedChange('chg-nueva')).toEqual({ ok: true });
	});

	it('still answers ledgers written before entries carried a date', async () => {
		await db.table('settings').put({
			key: 'processedChanges',
			value: { 'chg-legacy': { ok: true, result: { taskId: 'abc' } } },
			updatedAt: new Date().toISOString()
		});

		expect(await getProcessedChange('chg-legacy')).toEqual({ ok: true, result: { taskId: 'abc' } });
	});
});
