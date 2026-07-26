import { describe, expect, it } from 'vitest';
import { agentNotesByBlock } from './agent-notes';

describe('agentNotesByBlock', () => {
	it('agrupa por bloque solo las notas de agentes, en orden, con id estable', () => {
		const rows = [
			{ id: 'a5', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'segunda', seq: 5 },
			{ id: 'a2', blockId: 'b1', actor: 'user', action: 'note', text: 'del usuario', seq: 2 },
			{ id: 'a1', blockId: 'b1', actor: 'agente-uuid', action: 'created', text: 'creó', seq: 1 },
			{ id: 'a3', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'primera', seq: 3 },
			{ id: 'a4', blockId: 'b2', actor: 'agente-uuid', action: 'note', text: 'otra', seq: 4 }
		];
		expect(agentNotesByBlock(rows)).toEqual({
			b1: [{ id: 'a3', text: 'primera' }, { id: 'a5', text: 'segunda' }],
			b2: [{ id: 'a4', text: 'otra' }]
		});
	});

	it('conserva notas distintas con el mismo texto (clave por id, no por texto)', () => {
		const rows = [
			{ id: 'x1', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'repetida', seq: 1 },
			{ id: 'x2', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'repetida', seq: 2 }
		];
		expect(agentNotesByBlock(rows)).toEqual({
			b1: [{ id: 'x1', text: 'repetida' }, { id: 'x2', text: 'repetida' }]
		});
	});
});
