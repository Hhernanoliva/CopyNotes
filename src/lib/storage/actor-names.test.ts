import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import { rememberShareName, actorName, isMine } from './share-names';

const dueño = { noteId: 'n1', role: 'owner', myActor: null };
const invitado = { noteId: 'n1', role: 'member', myActor: 'member:u-2' };

describe('actorName', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
		await rememberShareName('owner:n1', 'Ana');
		await rememberShareName('u-2', 'Juan');
	});

	it('en tu nota, user sos vos', async () => {
		expect(await actorName('user', dueño)).toBe('Vos');
	});

	it('en la nota de otro, user es el dueño', async () => {
		expect(await actorName('user', invitado)).toBe('Ana');
	});

	it('sin nombre guardado del dueño, un texto que no miente', async () => {
		await db.table('shareMembers').clear();
		expect(await actorName('user', invitado)).toBe('La otra persona');
	});

	it('tu propia firma de miembro sos vos', async () => {
		expect(await actorName('member:u-2', invitado)).toBe('Vos');
	});

	it('la firma de otro miembro es su nombre', async () => {
		expect(await actorName('member:u-2', dueño)).toBe('Juan');
	});

	it('un miembro sin nombre guardado', async () => {
		expect(await actorName('member:u-9', dueño)).toBe('Invitado');
	});

	// El actor de una línea del agente es su ID, no la palabra 'agent'
	// (bridge/ingest.ts › resolveAgentActor). Una prueba con la palabra pasaría
	// sin probar nada.
	it('un id de agente es el agente', async () => {
		expect(await actorName('agt_7f21c9', dueño)).toBe('Agente');
		expect(await actorName('agt_7f21c9', invitado)).toBe('Agente');
	});
});

describe('isMine', () => {
	it('en tu nota, user sos vos', () => {
		expect(isMine('user', dueño)).toBe(true);
	});
	it('en la nota de otro, user NO sos vos', () => {
		expect(isMine('user', invitado)).toBe(false);
	});
	it('tu firma de miembro sos vos', () => {
		expect(isMine('member:u-2', invitado)).toBe(true);
	});
	it('la de otro no', () => {
		expect(isMine('member:u-9', invitado)).toBe(false);
	});
	it('un agente nunca sos vos', () => {
		expect(isMine('agt_7f21c9', dueño)).toBe(false);
		expect(isMine('agt_7f21c9', invitado)).toBe(false);
	});
});
