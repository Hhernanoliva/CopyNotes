import { describe, expect, it } from 'vitest';
import { writeAgentExport, startBridgeWatch } from './tauri';

// jsdom has no __TAURI_INTERNALS__, so isTauriRuntime() is false here and both
// functions must take the no-op branch before ever touching a Tauri import —
// the desktop path itself is not testable without a real Tauri env, and the
// ingest→outbox mapping is already covered at the ingest level (ingest.test.ts).
describe('bridge/tauri (off-desktop no-ops)', () => {
	it('writeAgentExport resolves without throwing and without Tauri', async () => {
		await expect(writeAgentExport()).resolves.toBeUndefined();
	});

	it('startBridgeWatch returns a callable no-op unlisten fn', async () => {
		const un = await startBridgeWatch(() => {});
		expect(typeof un).toBe('function');
		expect(() => un()).not.toThrow();
	});
});
