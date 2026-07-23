import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getConnectedAgent, setConnectedAgent } from './agents';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('connected agent', () => {
	it('is undefined until one is set', async () => {
		expect(await getConnectedAgent()).toBeUndefined();
	});

	it('mints a stable id on first set and keeps it', async () => {
		const first = await setConnectedAgent({ name: 'Claude local' });
		expect(first.id).toBeTruthy();
		expect(first.name).toBe('Claude local');

		const renamed = await setConnectedAgent({ name: 'Otro' });
		expect(renamed.id).toBe(first.id); // same identity, new display name
		expect((await getConnectedAgent()).name).toBe('Otro');
	});
});
