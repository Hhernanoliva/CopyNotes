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

// A change that timed out (no outbox answer yet) keeps its generated id for this
// long, keyed by its content. If the model reacts to the timeout by RESENDING
// the same request, it reuses that id instead of minting a new one — so the app,
// which dedupes by id (src/lib/bridge/ingest.ts), applies it AT MOST once. The
// window is short so an intentional identical request later (e.g. "add that same
// task again") still gets a fresh id and goes through. A confirmed request drops
// its key immediately (see submitChange), so only unconfirmed ids linger.
const RETRY_IDEMPOTENCY_TTL_MS = 30000;
const pendingRequestIds = new Map(); // contentKey -> { id, expires }

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stable key from the change's semantic fields (keys sorted) so the same logical
// request maps to the same entry regardless of property order.
function contentKey(change) {
	return JSON.stringify(change, Object.keys(change ?? {}).sort());
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

	// A caller-supplied id passes through unchanged (its own idempotency key). A
	// missing/blank one gets a UUID — but first we check the retry memo: if an
	// identical, still-unconfirmed request is within its TTL, reuse its id so a
	// resend can't duplicate. Otherwise mint a fresh id and remember it.
	const providedId = typeof change?.id === 'string' && change.id.trim() ? change.id : null;
	let memoKey = null;
	let id = providedId;
	if (!id) {
		memoKey = contentKey(change);
		const now = Date.now();
		const memo = pendingRequestIds.get(memoKey);
		id = memo && memo.expires > now ? memo.id : randomUUID();
		pendingRequestIds.set(memoKey, { id, expires: now + RETRY_IDEMPOTENCY_TTL_MS });
	}
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
			// A definitive answer arrived — drop the memo so a LATER identical
			// request gets a fresh id (only unconfirmed ids are reused).
			if (memoKey) pendingRequestIds.delete(memoKey);
			return { ...result, id };
		} catch {
			// Not there yet (ENOENT), or a partial write mid-flight (JSON parse
			// error) — either way, wait and try again until the deadline.
		}
		await sleep(pollIntervalMs);
	}

	// Timeout: keep the memo so a resend within the TTL reuses this id and the
	// app's dedupe guarantees the change is applied at most once.
	return { ok: false, reason: 'timeout', id };
}

/**
 * Heartbeat: writes <mailbox>/agent-status.json = { lastSeen } atomically
 * (tmp+rename). Lives at the mailbox ROOT, not inbox/, so the app's file
 * watcher never treats it as a change — it's a liveness signal, not a request.
 * Called on connect and on every tool call so the app can show "connected —
 * X ago". Failures are swallowed: a heartbeat write must never break a tool.
 */
export async function touchAgentStatus() {
	try {
		const dir = mailboxDir();
		const target = path.join(dir, 'agent-status.json');
		const tmp = path.join(dir, `agent-status.${randomUUID()}.tmp`);
		await writeFile(tmp, JSON.stringify({ lastSeen: new Date().toISOString() }), 'utf8');
		await rename(tmp, target);
	} catch {
		// best-effort liveness signal
	}
}
