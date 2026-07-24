import { db } from './db';
import { now } from './ids';
import { trackPendingWrite } from './pending-writes';
import { KEY } from './settings-registry';

// Processed agent-change ids, for buzón idempotency (spec 028 Task P1). Stored
// as a single settings row shaped as an id → outcome map, the same
// device-local pattern as connectedAgent — not a dedicated table, so a
// duplicate delivery of the same change id can be answered without
// re-applying it.
const DEDUPE_SETTING_KEY = KEY.processedChanges;

const settings = db.table('settings');

export async function getProcessedChange(id) {
	const row = await settings.get(DEDUPE_SETTING_KEY);
	return row?.value?.[id];
}

export function recordProcessedChange(id, outcome) {
	return trackPendingWrite(async () => {
		const existing = (await settings.get(DEDUPE_SETTING_KEY))?.value ?? {};
		const value = { ...existing, [id]: outcome };
		await settings.put({ key: DEDUPE_SETTING_KEY, value, updatedAt: now() });
		return outcome;
	});
}
