// randomUUID sólo existe en páginas seguras (https, o localhost). Abriendo la
// app desde el celular contra la Mac por red local no hay candadito y la app se
// caía al crear la primera nota. getRandomValues sí funciona en cualquier
// página y es la misma fuente de azar que randomUUID usa por dentro, así que el
// respaldo no vale menos: sólo le pone la forma a mano.
export function createId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function now() {
	return new Date().toISOString();
}
