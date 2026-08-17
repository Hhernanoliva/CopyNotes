import { describe, expect, it } from 'vitest';
import { cleanInviteUrl, inviteToken, stashInviteToken, takeStashedInvite } from './invite-return';

const APP = 'https://copynotes-beta.vercel.app/';

function fakeStorage() {
	const datos = new Map();
	return {
		getItem: (k) => datos.get(k) ?? null,
		setItem: (k, v) => datos.set(k, v),
		removeItem: (k) => datos.delete(k)
	};
}

describe('la vuelta de una invitación', () => {
	it('lee el token de la dirección', () => {
		expect(inviteToken(`${APP}?invitacion=tok123`)).toBe('tok123');
	});

	it('devuelve null cuando no hay ninguno', () => {
		expect(inviteToken(APP)).toBe(null);
	});

	// Un token en la barra de direcciones sobrevive a un favorito, a una captura y
	// a compartir la pantalla. Se borra apenas se leyó, igual que el `code` de
	// Google.
	it('borra el token de la dirección', () => {
		expect(cleanInviteUrl(`${APP}?invitacion=tok123`)).toBe(APP);
	});

	// Sin tocar nada, `new URL(...).toString()` normaliza la dirección, y quien
	// compare las dos reescribiría la entrada del historial para nada.
	it('deja intacta una dirección que no tiene token', () => {
		expect(cleanInviteUrl(APP)).toBe(APP);
	});

	// LA MITAD QUE IMPORTA: entrar con Google se va a otro sitio y vuelve a la raíz
	// SIN nuestros parámetros. Si el token viviera sólo en la dirección, el
	// invitado entra a su cuenta y la invitación se evaporó en el camino.
	it('guarda el token para que sobreviva el viaje a Google', () => {
		const storage = fakeStorage();
		stashInviteToken(storage, 'tok123');
		expect(takeStashedInvite(storage)).toBe('tok123');
	});

	it('lo entrega una sola vez', () => {
		const storage = fakeStorage();
		stashInviteToken(storage, 'tok123');
		takeStashedInvite(storage);
		expect(takeStashedInvite(storage)).toBe(null);
	});

	// El modo privado puede bloquear el almacenamiento. Perder la invitación es
	// malo; tumbar la app entera al arrancar es peor.
	it('aguanta un almacenamiento que tira', () => {
		const roto = {
			getItem: () => {
				throw new Error('bloqueado');
			},
			setItem: () => {
				throw new Error('bloqueado');
			},
			removeItem: () => {}
		};
		expect(() => stashInviteToken(roto, 'tok123')).not.toThrow();
		expect(takeStashedInvite(roto)).toBe(null);
	});
});
