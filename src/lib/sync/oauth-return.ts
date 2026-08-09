// The Google round trip comes back to the app's own root as query parameters:
// `?code=...` when it worked, `?error=access_denied` when the person said no
// (spec 034). Two things have to happen with that and neither one needs a
// browser, so both live here as pure functions: read what came back, and erase
// the trace of it.
//
// supabase-js deletes `code` by itself, but only on the happy path — an error,
// or an exchange that fails, leaves everything in the address bar, where it
// survives into a bookmark, a share or a screenshot.

// `access_token` cannot appear while we ask for PKCE (the token never travels in
// a URL). It is stripped anyway because it is the one parameter that would
// actually matter if a future change ever put it there.
const RETURN_PARAMS = ['code', 'error', 'error_code', 'error_description', 'access_token'];

export function cleanOAuthUrl(href) {
	const url = new URL(href);
	let stripped = false;
	for (const name of RETURN_PARAMS) {
		if (!url.searchParams.has(name)) continue;
		url.searchParams.delete(name);
		stripped = true;
	}
	// The implicit flow returns tokens in the hash instead of the query. We do not
	// use it; this is one line of insurance against ever leaking one.
	if (url.hash.includes('access_token')) {
		url.hash = '';
		stripped = true;
	}
	// Untouched means untouched: `new URL(...).toString()` normalises the address,
	// and a caller comparing the two would rewrite the history entry for nothing.
	return stripped ? url.toString() : href;
}

// The one-use code Google's trip back leaves behind, or null. Read before the
// address is cleaned, because cleaning it is what makes the code unreadable.
export function oauthCode(href) {
	return new URL(href).searchParams.get('code');
}

export function oauthErrorMessage(href) {
	const params = new URL(href).searchParams;
	const error = params.get('error');
	if (!error) return null;
	// The only one that is not a failure: the person changed their mind.
	if (error === 'access_denied') return 'No se completó la entrada con Google.';
	return `No se pudo entrar con Google: ${params.get('error_description') || error}`;
}
