import { afterEach, describe, expect, it } from 'vitest';
import { getBackupSource, getRuntimeKind, isTauriRuntime, isWindows } from './runtime';

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

describe('isWindows', () => {
	const original = navigator.userAgent;

	afterEach(() => {
		Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
	});

	it('reconoce un userAgent de Windows', () => {
		Object.defineProperty(navigator, 'userAgent', {
			value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
			configurable: true
		});
		expect(isWindows()).toBe(true);
	});

	it('dice que no en macOS', () => {
		Object.defineProperty(navigator, 'userAgent', {
			value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
			configurable: true
		});
		expect(isWindows()).toBe(false);
	});
});
