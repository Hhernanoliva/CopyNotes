// Buzón client: pure Node fs/path, no MCP SDK involved. This talks to the
// same folder the CopyNotes desktop app (Tauri) reads/writes — see
// specs/028 (agent beta / local MCP) for the buzón protocol.
//
// Layout of the mailbox folder (process.env.CN_MAILBOX):
//   export.json      — agent-visible tasks + bitácora, written by the app
//   inbox/<id>.json   — change requests written by us, consumed by the app
//   outbox/<id>.json  — results written by the app, one per inbox request

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const READ_EXPORT_RETRIES = 3;
const READ_EXPORT_RETRY_DELAY_MS = 20;
const DEFAULT_SUBMIT_TIMEOUT_MS = 10000;
const DEFAULT_POLL_INTERVAL_MS = 100;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function mailboxDir() {
	const dir = process.env.CN_MAILBOX;
	if (!dir) {
		throw new Error('CN_MAILBOX is not set — point it at the CopyNotes mailbox folder');
	}
	return dir;
}

/**
 * Reads and parses <mailbox>/export.json.
 * Returns { notes: [] } if the file doesn't exist yet, or if it can't be
 * parsed after a couple of retries (the app may be mid-write).
 */
export async function readExport() {
	const exportPath = path.join(mailboxDir(), 'export.json');

	for (let attempt = 1; attempt <= READ_EXPORT_RETRIES; attempt++) {
		let raw;
		try {
			raw = await readFile(exportPath, 'utf8');
		} catch (err) {
			if (err.code === 'ENOENT') return { notes: [] };
			throw err;
		}

		try {
			return JSON.parse(raw);
		} catch {
			// A writer may be mid-write (partial JSON) — retry briefly, then
			// give up and treat it as "nothing readable yet" rather than crash.
			if (attempt < READ_EXPORT_RETRIES) {
				await sleep(READ_EXPORT_RETRY_DELAY_MS);
				continue;
			}
			return { notes: [] };
		}
	}

	return { notes: [] };
}

/**
 * Submits a change request to the mailbox and waits for the app to answer it.
 *
 * Writes <mailbox>/inbox/<id>.json ATOMICALLY: first to a `.tmp` file in the
 * same directory, then renamed into place. This matters because the Rust
 * watcher on the app side reacts to the first filesystem Create event for
 * the inbox file — a non-atomic (direct) write would let it read a
 * truncated/partial file and discard it.
 *
 * Then polls <mailbox>/outbox/<id>.json until it appears (or times out).
 */
export async function submitChange(change, options = {}) {
	const { timeoutMs = DEFAULT_SUBMIT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } =
		options;

	// A missing OR empty/blank caller id gets a fresh UUID — otherwise an
	// empty-string id would produce `inbox/.json`. A real non-empty id passes
	// through unchanged so idempotency keys stay intact.
	const id = typeof change?.id === 'string' && change.id.trim() ? change.id : randomUUID();
	const dir = mailboxDir();
	const inboxDir = path.join(dir, 'inbox');
	const outboxDir = path.join(dir, 'outbox');

	await mkdir(inboxDir, { recursive: true });

	const payload = { ...change, id };
	const finalPath = path.join(inboxDir, `${id}.json`);
	const tmpPath = path.join(inboxDir, `${id}.json.tmp`);

	await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
	await rename(tmpPath, finalPath);

	const outboxPath = path.join(outboxDir, `${id}.json`);
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const raw = await readFile(outboxPath, 'utf8');
			const result = JSON.parse(raw);
			return { ...result, id };
		} catch {
			// Not there yet (ENOENT), or a partial write mid-flight (JSON parse
			// error) — either way, wait and try again until the deadline.
		}
		await sleep(pollIntervalMs);
	}

	return { ok: false, reason: 'timeout', id };
}
