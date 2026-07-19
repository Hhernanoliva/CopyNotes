// One barrier for every durable write. A future Tauri close handler and the
// current backup/import flows can wait here without knowing editor internals.

const pendingWrites = new Set();
const flushers = new Set();

export function trackPendingWrite(work) {
	const promise = typeof work === 'function' ? Promise.resolve().then(work) : Promise.resolve(work);
	pendingWrites.add(promise);
	promise.then(
		() => pendingWrites.delete(promise),
		() => pendingWrites.delete(promise)
	);
	return promise;
}

export function registerPendingWriteFlusher(flusher) {
	flushers.add(flusher);
	return () => flushers.delete(flusher);
}

export async function settlePendingWrites() {
	await Promise.all([...flushers].map((flush) => flush()));
	while (pendingWrites.size > 0) {
		await Promise.all([...pendingWrites]);
	}
}
