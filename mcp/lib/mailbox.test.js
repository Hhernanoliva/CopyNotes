import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

let mailboxDir;

beforeEach(async () => {
	mailboxDir = await mkdtemp(path.join(tmpdir(), 'cn-mailbox-'));
	process.env.CN_MAILBOX = mailboxDir;
	// vitest caches ES modules per test file run, not per test — re-import isn't
	// needed since mailbox.js reads process.env.CN_MAILBOX lazily on each call.
});

afterEach(async () => {
	delete process.env.CN_MAILBOX;
	await rm(mailboxDir, { recursive: true, force: true });
});

describe('readExport', () => {
	it('parses and returns export.json when present', async () => {
		const { readExport } = await import('./mailbox.js');
		const fakeExport = { notes: [{ id: 'n1', title: 'Test note' }] };
		await writeFile(path.join(mailboxDir, 'export.json'), JSON.stringify(fakeExport), 'utf8');

		const result = await readExport();

		expect(result).toEqual(fakeExport);
	});

	it('returns { notes: [] } when export.json is absent', async () => {
		const { readExport } = await import('./mailbox.js');

		const result = await readExport();

		expect(result).toEqual({ notes: [] });
	});

	it('tolerates a mid-write / truncated export.json (does not throw, falls back to { notes: [] })', async () => {
		const { readExport } = await import('./mailbox.js');
		// Deliberately malformed / truncated JSON, as if caught mid-write by the app.
		await writeFile(path.join(mailboxDir, 'export.json'), '{ "notes": [', 'utf8');

		const result = await readExport();

		expect(result).toEqual({ notes: [] });
	});
});

describe('submitChange', () => {
	it('writes inbox/<id>.json atomically (no leftover .tmp file)', async () => {
		const { submitChange } = await import('./mailbox.js');
		const change = { id: 'change-1', type: 'toggleDone', taskId: 't1' };

		// Drop the matching outbox result shortly after the inbox write so the
		// poll loop resolves quickly and deterministically.
		setTimeout(async () => {
			await mkdir(path.join(mailboxDir, 'outbox'), { recursive: true });
			await writeFile(
				path.join(mailboxDir, 'outbox', 'change-1.json'),
				JSON.stringify({ ok: true }),
				'utf8'
			);
		}, 30);

		const result = await submitChange(change, { timeoutMs: 2000, pollIntervalMs: 20 });

		expect(result).toEqual({ ok: true, id: 'change-1' });

		const inboxFiles = await readdir(path.join(mailboxDir, 'inbox'));
		expect(inboxFiles).toEqual(['change-1.json']);

		const written = JSON.parse(
			await readFile(path.join(mailboxDir, 'inbox', 'change-1.json'), 'utf8')
		);
		expect(written).toMatchObject(change);
	});

	it('assigns a random id when the change has none', async () => {
		const { submitChange } = await import('./mailbox.js');

		const submitPromise = submitChange({ type: 'noop' }, { timeoutMs: 500, pollIntervalMs: 20 });

		// Discover the generated id from the inbox file that shows up, then
		// answer it via the outbox so submitChange can resolve.
		let id;
		for (let attempt = 0; attempt < 20 && !id; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 20));
			const files = await readdir(path.join(mailboxDir, 'inbox')).catch(() => []);
			if (files.length > 0) id = files[0].replace(/\.json$/, '');
		}
		expect(id).toBeTruthy();

		await mkdir(path.join(mailboxDir, 'outbox'), { recursive: true });
		await writeFile(path.join(mailboxDir, 'outbox', `${id}.json`), JSON.stringify({ ok: true }), 'utf8');

		const result = await submitPromise;
		expect(result).toEqual({ ok: true, id });
	});

	it('returns a timeout error when no outbox result ever appears', async () => {
		const { submitChange } = await import('./mailbox.js');
		const change = { id: 'change-timeout', type: 'noop' };

		const result = await submitChange(change, { timeoutMs: 100, pollIntervalMs: 20 });

		expect(result).toEqual({ ok: false, reason: 'timeout', id: 'change-timeout' });
	});
});
