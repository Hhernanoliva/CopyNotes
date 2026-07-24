import { describe, it, expect, vi } from 'vitest';

// Off desktop every bridge export short-circuits to a null/no-op before
// touching @tauri-apps — proves the browser/PWA build exposes no agent surface.
vi.mock('$lib/platform', () => ({ isTauriRuntime: () => false }));

import { getServerPath, getAgentStatus } from './tauri';

describe('getServerPath (off desktop)', () => {
	it('returns null when not running under Tauri', async () => {
		expect(await getServerPath()).toBe(null);
	});
});

describe('getAgentStatus (off desktop)', () => {
	it('returns null when not running under Tauri', async () => {
		expect(await getAgentStatus()).toBe(null);
	});
});
