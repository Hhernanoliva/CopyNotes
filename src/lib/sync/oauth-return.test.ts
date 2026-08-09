// What comes back from Google must not stay in the address bar (spec 034,
// acceptance 3): a `?code=` in a bookmark or a screenshot is a login attempt
// somebody else can read.

import { describe, expect, it } from 'vitest';
import { cleanOAuthUrl, oauthCode, oauthErrorMessage, oauthFlowId } from './oauth-return';

const APP = 'https://copynotes-beta.vercel.app/';

describe('cleaning the address after Google', () => {
	it('takes the code out and leaves anything else the app was carrying', () => {
		expect(cleanOAuthUrl(`${APP}?nota=abc&code=4/0Ab_secreto`)).toBe(`${APP}?nota=abc`);
	});

	it('takes a refusal out too, description included', () => {
		expect(cleanOAuthUrl(`${APP}?error=access_denied&error_description=El+usuario+canceló`)).toBe(
			APP
		);
	});

	it('returns the same address, character for character, when there is nothing to strip', () => {
		// Not just "equivalent": rewriting the history entry for nothing is a
		// visible glitch, and the caller decides by comparing these two strings.
		expect(cleanOAuthUrl(`${APP}?nota=abc`)).toBe(`${APP}?nota=abc`);
	});

	it('empties a hash that carries a token', () => {
		expect(cleanOAuthUrl(`${APP}#access_token=xyz&expires_in=3600`)).toBe(APP);
	});
});

describe('el código que hay que canjear', () => {
	it('sale entero de la dirección', () => {
		expect(oauthCode(`${APP}?code=4%2F0Ab_secreto&nota=abc`)).toBe('4/0Ab_secreto');
	});

	it('no existe cuando la vuelta fue una negativa', () => {
		expect(oauthCode(`${APP}?error=access_denied`)).toBe(null);
	});

	it('viene con el nombre del viaje al que pertenece', () => {
		const href = `${APP}?code=4%2F0Ab_secreto&sb_flow_id=e31b9a44`;
		expect(oauthFlowId(href)).toBe('e31b9a44');
		// Y ese nombre tampoco se queda en la barra: se entrega a mano al canje.
		expect(cleanOAuthUrl(href)).toBe(APP);
	});
});

describe('what the screen says about the trip back', () => {
	it('says nothing when nothing failed', () => {
		expect(oauthErrorMessage(`${APP}?code=4/0Ab_secreto`)).toBe(null);
	});

	it('treats a cancellation as a cancellation, not as a breakage', () => {
		expect(oauthErrorMessage(`${APP}?error=access_denied`)).toBe(
			'No se completó la entrada con Google.'
		);
	});

	it('carries the reason for anything else, because that one is worth reading', () => {
		expect(oauthErrorMessage(`${APP}?error=server_error&error_description=redirect+no+válido`)).toBe(
			'No se pudo entrar con Google: redirect no válido'
		);
	});
});
