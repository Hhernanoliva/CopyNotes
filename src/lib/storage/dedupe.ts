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

// A week, matching the buzón's processed/ pile (spec 030 phase 0): past that,
// an answer nobody asked for again is the user's own task text sitting on disk
// forever. The ledger used to keep every change ever delivered.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const settings = db.table('settings');

// Entries are `{ at, outcome }`. Before the expiry rule they were the bare
// outcome — `{ id, ok, result }` (see bridge/protocol.ts), which never carries
// an `at`, so its presence is what tells the two shapes apart.
const isDated = (entry) => Boolean(entry) && typeof entry === 'object' && 'at' in entry;

export async function getProcessedChange(id) {
	const row = await settings.get(DEDUPE_SETTING_KEY);
	const entry = row?.value?.[id];
	return isDated(entry) ? entry.outcome : entry;
}

export function recordProcessedChange(id, outcome) {
	return trackPendingWrite(async () => {
		const stamp = now();
		const cutoff = Date.parse(stamp) - TTL_MS;
		const existing = (await settings.get(DEDUPE_SETTING_KEY))?.value ?? {};
		const value = {};
		for (const key of Object.keys(existing)) {
			const entry = existing[key];
			// An undated entry gets today's stamp instead of being dropped: its id
			// could still be redelivered, and re-applying a change would duplicate a
			// task. It ages out from here like every other one.
			const dated = isDated(entry) ? entry : { at: stamp, outcome: entry };
			if (Date.parse(dated.at) >= cutoff) value[key] = dated;
		}
		value[id] = { at: stamp, outcome };
		await settings.put({ key: DEDUPE_SETTING_KEY, value, updatedAt: stamp });
		return outcome;
	});
}
