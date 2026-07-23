import { describe, expect, it } from 'vitest';
import { toAgentPayload } from './export';

describe('toAgentPayload (agent-visibility gate)', () => {
	it('includes only agentVisible notes, excluding hidden ones', () => {
		const notes = [
			{ id: 'n1', title: 'Visible', agentVisible: true },
			{ id: 'n2', title: 'Privada', agentVisible: false }
		];
		const blocksByNote = {
			n1: [{ id: 'b1', type: 'todo', content: 'hacer', html: 'hacer', checked: false, createdBy: 'user' }],
			n2: [{ id: 'b2', type: 'todo', content: 'secreto', html: 'secreto', checked: false, createdBy: 'user' }]
		};
		const activityByBlock = { b1: [], b2: [] };

		const payload = toAgentPayload(notes, blocksByNote, activityByBlock);

		expect(payload.notes.map((n) => n.id)).toEqual(['n1']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('exposes only todo blocks as tasks', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true }];
		const blocksByNote = {
			n1: [
				{ id: 'b1', type: 'todo', content: 't', html: 't', checked: true, createdBy: 'agent' },
				{ id: 'b2', type: 'text', content: 'prosa', html: 'prosa', checked: false, createdBy: 'user' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { b1: [], b2: [] });
		expect(payload.notes[0].tasks.map((t) => t.id)).toEqual(['b1']);
	});
});
