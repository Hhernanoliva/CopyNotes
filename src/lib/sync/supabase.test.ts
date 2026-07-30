// Contract: a clone with no .env is not a broken install, it is the free tier.
// Everything cloud-related has to survive an unconfigured build, which is also
// how this test suite and CI run.

import { describe, it, expect } from 'vitest';
import { cloudConfigured, supabase } from './supabase';

describe('cloud configuration', () => {
	it('reports no cloud when the environment has no Supabase project', () => {
		// Proven the other way around by running the suite with the variables set:
		// `PUBLIC_SUPABASE_URL=… PUBLIC_SUPABASE_ANON_KEY=… pnpm test` makes this
		// assertion fail, which is what confirms the values really do reach the
		// bundle through import.meta.env.
		expect(cloudConfigured()).toBe(false);
	});

	it('hands out no client, instead of a half-built one that throws later', () => {
		expect(supabase()).toBe(null);
	});
});
