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
});
