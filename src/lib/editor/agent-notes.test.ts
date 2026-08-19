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
			b1: [
				{ id: 'a3', text: 'primera', actor: 'agente-uuid' },
				{ id: 'a5', text: 'segunda', actor: 'agente-uuid' }
			],
			b2: [{ id: 'a4', text: 'otra', actor: 'agente-uuid' }]
		});
	});

	it('conserva notas distintas con el mismo texto (clave por id, no por texto)', () => {
		const rows = [
			{ id: 'x1', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'repetida', seq: 1 },
			{ id: 'x2', blockId: 'b1', actor: 'agente-uuid', action: 'note', text: 'repetida', seq: 2 }
		];
		expect(agentNotesByBlock(rows)).toEqual({
			b1: [
				{ id: 'x1', text: 'repetida', actor: 'agente-uuid' },
				{ id: 'x2', text: 'repetida', actor: 'agente-uuid' }
			]
		});
	});

	it('en la nota de otro, los comentarios del DUEÑO se ven', () => {
		const rows = [
			{ id: 'a1', blockId: 'b1', action: 'note', actor: 'user', text: 'ojo con esto', seq: 1 }
		];
		expect(agentNotesByBlock(rows, { role: 'member', myActor: 'member:u-2' })).toEqual({
			b1: [{ id: 'a1', text: 'ojo con esto', actor: 'user' }]
		});
	});

	// Esta prueba decía lo contrario, y afirmaba el bug: el invitado no tiene
	// `block.note` (BlockRow lo esconde con `!guest`), así que esconderle además
	// su propia línea de bitácora lo deja escribiendo contra una pared — aprieta
	// Enter y no queda nada en pantalla. Se dio vuelta a propósito tras verlo en
	// el gate manual del 2026-08-19.
	it('y los propios TAMBIÉN: el invitado no tiene otro lugar donde verlos', () => {
		const rows = [
			{ id: 'a1', blockId: 'b1', action: 'note', actor: 'member:u-2', text: 'mío', seq: 1 }
		];
		expect(agentNotesByBlock(rows, { role: 'member', myActor: 'member:u-2' })).toEqual({
			b1: [{ id: 'a1', text: 'mío', actor: 'member:u-2' }]
		});
	});

	// El control del otro lado, que es lo que impide arreglar de más: el dueño SÍ
	// tiene dónde ver lo suyo (`block.note`), así que sus propias líneas siguen
	// fuera de la itálica o se verían dos veces.
	it('pero en la nota propia los del dueño siguen afuera: ya los ve en block.note', () => {
		const rows = [{ id: 'a1', blockId: 'b1', action: 'note', actor: 'user', text: 'mío', seq: 1 }];
		expect(agentNotesByBlock(rows, { role: 'owner', myActor: null })).toEqual({});
	});

	it('una entrada de nota entera no se agrupa bajo ningún renglón', () => {
		const rows = [{ id: 'a1', blockId: null, action: 'note', actor: 'agent', text: 'suelta', seq: 1 }];
		expect(agentNotesByBlock(rows)).toEqual({});
	});
});
