// El viaje a Google desde la .app (spec 034 fase 2). Acá se prueba el ORDEN y el
// pasamanos: quién arranca antes que quién, y que lo que vuelve por el puerto
// llegue entero al canje. La pantalla de Google no se puede automatizar, así que
// lo que queda de este lado es exactamente esto.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const openExternal = vi.hoisted(() => vi.fn());
vi.mock('$lib/platform', () => ({ openExternal }));

const signInWithGoogle = vi.hoisted(() => vi.fn());
const completeGoogleSignIn = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ signInWithGoogle, completeGoogleSignIn }));

import { signInWithGoogleDesktop } from './google-desktop';

const GOOGLE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x';

beforeEach(() => {
	invoke.mockReset();
	openExternal.mockReset();
	signInWithGoogle.mockReset();
	completeGoogleSignIn.mockReset();
	signInWithGoogle.mockResolvedValue(GOOGLE_URL);
	completeGoogleSignIn.mockResolvedValue({ user: { email: 'vos@ejemplo.com' } });
});

describe('entrar con Google desde la app de escritorio', () => {
	it('abre el navegador del sistema y canjea lo que vuelve por el puerto', async () => {
		const orden: string[] = [];
		invoke.mockImplementation(async (command) => {
			orden.push(command);
			if (command === 'oauth_start') return 49731;
			return 'http://127.0.0.1:49731/?code=4%2F0Ab_secreto&sb_flow_id=e31b9a44';
		});
		openExternal.mockImplementation(async () => orden.push('navegador'));

		const session = await signInWithGoogleDesktop();

		// El oyente tiene que estar levantado ANTES de que se abra el navegador: si
		// la persona aprueba rapidísimo, la vuelta encuentra el puerto ya abierto.
		expect(orden).toEqual(['oauth_start', 'navegador', 'oauth_wait']);
		// La dirección de vuelta lleva el puerto que eligió el sistema operativo, y
		// la pestaña no se va a Google acá: la abre el navegador de la persona.
		expect(signInWithGoogle).toHaveBeenCalledWith({
			redirectTo: 'http://127.0.0.1:49731',
			skipBrowserRedirect: true
		});
		expect(openExternal).toHaveBeenCalledWith(GOOGLE_URL);
		// El nombre del viaje (`sb_flow_id`) viaja a mano. Acá es el caso normal y
		// no una rareza: la ventana de la app nunca navega, así que su barra de
		// direcciones no lo tiene y la biblioteca caería en la ranura compartida.
		expect(completeGoogleSignIn).toHaveBeenCalledWith('4/0Ab_secreto', 'e31b9a44');
		expect(session.user.email).toBe('vos@ejemplo.com');
	});

	it('si la persona dice que no en Google, lo dice y no canjea nada', async () => {
		invoke.mockImplementation(async (command) =>
			command === 'oauth_start' ? 49731 : 'http://127.0.0.1:49731/?error=access_denied'
		);

		await expect(signInWithGoogleDesktop()).rejects.toThrow('No se completó la entrada con Google.');

		expect(completeGoogleSignIn).not.toHaveBeenCalled();
	});

	it('si se cierra el navegador sin aprobar, el motivo del oyente llega a la pantalla', async () => {
		invoke.mockImplementation(async (command) => {
			if (command === 'oauth_start') return 49731;
			throw new Error('No llegó la respuesta de Google. Probá de nuevo.');
		});

		await expect(signInWithGoogleDesktop()).rejects.toThrow(/No llegó la respuesta de Google/);
	});

	it('no abre un navegador vacío si Google no devolvió a dónde ir', async () => {
		invoke.mockResolvedValue(49731);
		signInWithGoogle.mockResolvedValue(null);

		await expect(signInWithGoogleDesktop()).rejects.toThrow(/no devolvió/);

		expect(openExternal).not.toHaveBeenCalled();
	});
});
