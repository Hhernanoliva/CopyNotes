import { describe, expect, it } from 'vitest';
import { agentData, bumpAgentData, bumpAgentDataUrgent } from './signal.svelte';

describe('agent data signal', () => {
	it('increments on bump', () => {
		const before = agentData.version;
		bumpAgentData();
		expect(agentData.version).toBe(before + 1);
	});

	it('urgent bump advances both version and urgent (immediate-export path)', () => {
		const beforeV = agentData.version;
		const beforeU = agentData.urgent;
		bumpAgentDataUrgent();
		expect(agentData.version).toBe(beforeV + 1);
		expect(agentData.urgent).toBe(beforeU + 1);
	});

	it('a normal bump never advances urgent (stays on the debounced path)', () => {
		const beforeU = agentData.urgent;
		bumpAgentData();
		expect(agentData.urgent).toBe(beforeU);
	});
});
