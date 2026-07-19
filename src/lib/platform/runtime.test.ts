import { describe, expect, it } from 'vitest';
import { getBackupSource, getRuntimeKind, isTauriRuntime } from './runtime';

describe('platform runtime', () => {
	it('uses web/PWA outside a Tauri webview', () => {
		expect(getRuntimeKind()).toBe('web');
		expect(isTauriRuntime()).toBe(false);
		expect(getBackupSource()).toBe('pwa');
	});

	it('recognizes the Tauri 2 runtime in one place', () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
		Object.defineProperty(globalThis, 'window', {
			configurable: true,
			value: { __TAURI_INTERNALS__: {} }
		});

		try {
			expect(getRuntimeKind()).toBe('tauri');
			expect(isTauriRuntime()).toBe(true);
			expect(getBackupSource()).toBe('desktop');
		} finally {
			if (original) Object.defineProperty(globalThis, 'window', original);
			else Reflect.deleteProperty(globalThis, 'window');
		}
	});
});
