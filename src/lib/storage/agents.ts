import { db } from './db';
import { createId, now } from './ids';
import { trackPendingWrite } from './pending-writes';
import { KEY } from './settings-registry';

// v1 stores the single connected agent as one settings row. It is shaped as a
// full entity (stable id, timestamps, soft delete) so spec 029 can move it to
// its own synced table without a data reshape.
export const AGENT_SETTING_KEY = KEY.connectedAgent;

const settings = db.table('settings');

export async function getConnectedAgent() {
	const row = await settings.get(AGENT_SETTING_KEY);
	const agent = row?.value;
	if (!agent || agent.deletedAt) return undefined;
	return agent;
}

export function setConnectedAgent({ name }) {
	return trackPendingWrite(async () => {
		const existing = (await settings.get(AGENT_SETTING_KEY))?.value;
		const timestamp = now();
		const agent = {
			id: existing?.id ?? createId(),
			name,
			createdAt: existing?.createdAt ?? timestamp,
			updatedAt: timestamp,
			deletedAt: null
		};
		await settings.put({ key: AGENT_SETTING_KEY, value: agent, updatedAt: timestamp });
		return agent;
	});
}
