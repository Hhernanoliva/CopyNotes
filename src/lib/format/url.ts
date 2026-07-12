const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

// Normalize a user-entered URL. Adds https:// when no scheme is given; returns
// '' for empty or unsafe (e.g. javascript:) input.
export function normalizeUrl(raw) {
	const value = (raw ?? '').trim();
	if (!value) return '';
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
	try {
		const url = new URL(withScheme);
		if (!SAFE_SCHEMES.has(url.protocol)) return '';
		return url.href;
	} catch {
		return '';
	}
}
