export function createId() {
	return crypto.randomUUID();
}

export function now() {
	return new Date().toISOString();
}
