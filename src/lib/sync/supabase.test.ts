// Contract: a clone with no .env is not a broken install, it is the free tier.
// Everything cloud-related has to survive an unconfigured build.
//
// Both directions are asserted here with the environment stubbed, so the result
// does not change depending on whether the machine running the suite happens to
// have a real .env — which is exactly what broke the first version of this test.

import { afterEach, describe, expect, it, vi } from 'vitest';

async function load({ url = '', key = '', emailCode = '' } = {}) {
	vi.resetModules();
	vi.stubEnv('PUBLIC_SUPABASE_URL', url);
	vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', key);
	vi.stubEnv('PUBLIC_SUPABASE_EMAIL_CODE', emailCode);
	return import('./supabase');
}

// The Google door is the one place that talks to a fake client instead of the
// real one: `signInWithOAuth` navigates the tab away, so there is nothing to
// observe unless the call itself is what gets inspected.
async function loadWithFakeAuth(auth) {
	vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }));
	return load({ url: 'https://proyecto.supabase.co', key: 'sb_publishable_de_mentira' });
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.doUnmock('@supabase/supabase-js');
});

describe('cloud configuration', () => {
	it('reports no cloud, and hands out no client, when there is no project', async () => {
		const { cloudConfigured, supabase } = await load();

		expect(cloudConfigured()).toBe(false);
		// Not a half-built client that would throw on first use.
		expect(supabase()).toBe(null);
	});

	it('builds the client once the project variables reach the bundle', async () => {
		const { cloudConfigured, supabase } = await load({
			url: 'https://proyecto.supabase.co',
			key: 'sb_publishable_de_mentira'
		});

		expect(cloudConfigured()).toBe(true);
		expect(supabase()).not.toBe(null);
		// Same instance on every call: one session, one set of listeners.
		expect(supabase()).toBe(supabase());
	});
});

describe('which login the screen offers', () => {
	// The code-by-email path needs a mail provider with a verified sending
	// domain. Until there is one, passwords must be what a fresh install gets:
	// the failure mode of guessing wrong is "nobody can log in at all".
	it('defaults to passwords when the variable is missing or not exactly "true"', async () => {
		expect((await load()).emailCodeLogin()).toBe(false);
		expect((await load({ emailCode: 'false' })).emailCodeLogin()).toBe(false);
		expect((await load({ emailCode: 'TRUE' })).emailCodeLogin()).toBe(false);
	});

	it('switches to the emailed code with one variable, no code change', async () => {
		expect((await load({ emailCode: 'true' })).emailCodeLogin()).toBe(true);
	});
});

describe('entering with Google', () => {
	it('sends the trip back to the app itself, not to a hard-coded address', async () => {
		// Wrong here and the person lands on somebody else's site holding a login
		// code — and on localhost the round trip would bounce off production.
		const calls = [];
		const { signInWithGoogle } = await loadWithFakeAuth({
			signInWithOAuth: (options) => {
				calls.push(options);
				return { data: {}, error: null };
			}
		});
		vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });

		await signInWithGoogle();

		expect(calls).toEqual([
			{ provider: 'google', options: { redirectTo: 'http://localhost:5173' } }
		]);
	});

	it('canjea el código de la vuelta y devuelve la sesión', async () => {
		const canjeados = [];
		const { completeGoogleSignIn } = await loadWithFakeAuth({
			exchangeCodeForSession: (code) => {
				canjeados.push(code);
				return { data: { session: { user: { email: 'vos@ejemplo.com' } } }, error: null };
			}
		});

		const session = await completeGoogleSignIn('4/0Ab_secreto');

		expect(canjeados).toEqual(['4/0Ab_secreto']);
		expect(session.user.email).toBe('vos@ejemplo.com');
	});

	it('cuando el canje falla lo dice, en vez de dejar la pantalla muda', async () => {
		// El error que da un viaje que volvió a otra dirección. Sin esta rama cae
		// en la del código de 6 dígitos y manda a la persona a mirar su email.
		const { completeGoogleSignIn } = await loadWithFakeAuth({
			exchangeCodeForSession: () => ({
				data: {},
				error: { message: 'invalid request: both auth code and code verifier should be non-empty' }
			})
		});

		await expect(completeGoogleSignIn('4/0Ab_secreto')).rejects.toThrow(
			/no terminó en el mismo lugar/
		);
	});

	it('says in Spanish what the server answers while the provider is still off', async () => {
		// The expected failure until the manual step in the Supabase panel is done:
		// raw English here would send Hernán looking at the app instead of the panel.
		const { signInWithGoogle } = await loadWithFakeAuth({
			signInWithOAuth: () => ({
				data: {},
				error: { message: 'Unsupported provider: provider is not enabled' }
			})
		});
		vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });

		await expect(signInWithGoogle()).rejects.toThrow(
			'Entrar con Google no está habilitado en este servidor.'
		);
	});
});
