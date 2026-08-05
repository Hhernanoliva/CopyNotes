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

// Devuelve `true` sólo si TODO aterrizó. Un flusher que responde `false` guardó a
// medias: su escritura falló y ese texto sigue únicamente en memoria. No tiramos
// error porque quien llama decide qué hacer — el respaldo se baja igual (mejor uno
// al que le falta un renglón que ninguno) pero avisa, y el cierre del escritorio
// se cancela. Una escritura rastreada que falla sí rechaza, como antes.
export async function settlePendingWrites() {
	const flushed = await Promise.all([...flushers].map((flush) => flush()));
	while (pendingWrites.size > 0) {
		await Promise.all([...pendingWrites]);
	}
	return flushed.every((landed) => landed !== false);
}
