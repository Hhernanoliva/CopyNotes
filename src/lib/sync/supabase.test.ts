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

afterEach(() => {
	vi.unstubAllEnvs();
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
