import { describe, expect, it } from 'vitest';
import { agentNotesByBlock } from './agent-notes';

describe('agentNotesByBlock', () => {
	it('agrupa por bloque solo las notas de agentes, en orden', () => {
		const rows = [
			{ blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'segunda', seq: 5 },
			{ blockId: 'b1', actor: 'user', action: 'note', text: 'del usuario', seq: 2 },
			{ blockId: 'b1', actor: 'agente-uuid', action: 'created', text: 'creó', seq: 1 },
			{ blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'primera', seq: 3 },
			{ blockId: 'b2', actor: 'agente-uuid', action: 'note', text: 'otra', seq: 4 }
		];
		expect(agentNotesByBlock(rows)).toEqual({
			b1: [{ text: 'primera' }, { text: 'segunda' }],
			b2: [{ text: 'otra' }]
		});
	});
});
