import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lo que devuelve `supabase()` en cada prueba. Un objeto mutable y no un
// `mockReturnValue` porque el módulo se importa UNA vez, abajo.
const nube = vi.hoisted(() => ({ cliente: null }));

vi.mock('./supabase', () => ({
	supabase: () => nube.cliente
}));

const { myMemberActor } = await import('./identity');

const conSesion = (userId) => ({
	auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) }
});

beforeEach(() => {
	nube.cliente = null;
});

describe('myMemberActor', () => {
	it('sin nube configurada no hay identidad', async () => {
		expect(await myMemberActor()).toBe(null);
	});

	it('sin sesión iniciada tampoco', async () => {
		nube.cliente = { auth: { getSession: async () => ({ data: { session: null } }) } };
		expect(await myMemberActor()).toBe(null);
	});

	// La misma firma que el servidor le va a poner igual (`push_shared_rows` pisa
	// `actor`): escribirla desde acá es para que la línea se vea bien en ESTA
	// pantalla desde el segundo cero, no para que se le crea.
	it('con sesión, la firma que el servidor le va a poner', async () => {
		nube.cliente = conSesion('8f3a-1234');
		expect(await myMemberActor()).toBe('member:8f3a-1234');
	});

	it('una sesión sin usuario no inventa una firma', async () => {
		nube.cliente = { auth: { getSession: async () => ({ data: { session: {} } }) } };
		expect(await myMemberActor()).toBe(null);
	});
});
