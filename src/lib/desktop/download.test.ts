import { describe, expect, it } from 'vitest';
import { canShowDownloadPrompt, dismissDownloadPrompt } from './download';

function fakeWindow({ pointerFine = true, dismissed = false, storageThrows = false } = {}) {
	const store = new Map();
	if (dismissed) store.set('copynotes-desktop-dismissed', '1');
	return {
		matchMedia: (query) => ({ matches: query === '(pointer: fine)' && pointerFine }),
		localStorage: {
			getItem(key) {
				if (storageThrows) throw new Error('blocked');
				return store.get(key) ?? null;
			},
			setItem(key, value) {
				if (storageThrows) throw new Error('blocked');
				store.set(key, value);
			}
		}
	};
}

describe('desktop download prompt', () => {
	it('offers the download on a device with a mouse', () => {
		expect(canShowDownloadPrompt(fakeWindow())).toBe(true);
	});

	it('stays hidden on touch-only devices, where the app cannot run', () => {
		expect(canShowDownloadPrompt(fakeWindow({ pointerFine: false }))).toBe(false);
	});

	it('never comes back once dismissed', () => {
		const win = fakeWindow();
		dismissDownloadPrompt(win);
		expect(canShowDownloadPrompt(win)).toBe(false);
	});

	it('still offers the download when storage is blocked', () => {
		expect(canShowDownloadPrompt(fakeWindow({ storageThrows: true }))).toBe(true);
	});
});
