import { describe, expect, it } from 'vitest';
import { agentData, bumpAgentData } from './signal.svelte';

describe('agent data signal', () => {
	it('increments on bump', () => {
		const before = agentData.version;
		bumpAgentData();
		expect(agentData.version).toBe(before + 1);
	});
});
