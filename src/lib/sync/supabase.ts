// The only door to the cloud (spec 030 phase 2). Everything that talks to
// Supabase goes through here, so there is one place where "is the cloud even
// configured?" is answered and one place that knows how logging in works.
//
// Login is a 6-digit code sent by email, not a clickable link: the desktop app
// is a webview with no URL bar to come back to, so a link would need OS-level
// deep-link plumbing to hand the click back to the app. A typed code behaves
// identically on the Mac app and on the web.
//
// The session token supabase-js keeps in localStorage identifies the *account*.
// It is not the vault key (that one is a non-extractable CryptoKey in IndexedDB,
// see vault.ts): whoever steals the token finds unreadable blobs.

import { createClient } from '@supabase/supabase-js';

// Baked in at build time by Vite (see `envPrefix` in vite.config.ts). Absent in
// a fresh clone with no .env, which is why every caller must tolerate `null`:
// CopyNotes without an account is the free tier, not a broken install.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

let client = null;

export function cloudConfigured() {
	return Boolean(url && anonKey);
}

export function supabase() {
	if (!cloudConfigured()) return null;
	client ??= createClient(url, anonKey, {
		auth: {
			// No redirect flow at all: nothing ever arrives in the URL, and the
			// prerendered shell should not go looking for tokens there.
			detectSessionInUrl: false,
			persistSession: true,
			autoRefreshToken: true
		}
	});
	return client;
}

// Supabase's own messages are in English and sometimes cryptic. Only the cases a
// user can actually hit get a translation; anything else passes through, because
// a wrong Spanish guess is worse than an English truth.
function spanishError(error) {
	const message = String(error?.message ?? '');
	if (/expired|invalid/i.test(message)) {
		return 'El código no es correcto o ya venció. Pedí uno nuevo.';
	}
	if (/rate limit|too many/i.test(message)) {
		return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
	}
	if (/network|fetch/i.test(message)) {
		return 'No se pudo conectar. Revisá tu conexión.';
	}
	return message || 'No se pudo completar la operación.';
}

export async function requestCode(email) {
	const { error } = await supabase().auth.signInWithOtp({
		email,
		// First login creates the account. There is no separate sign-up screen.
		options: { shouldCreateUser: true }
	});
	if (error) throw new Error(spanishError(error));
}

export async function signInWithCode(email, code) {
	const { data, error } = await supabase().auth.verifyOtp({
		email,
		token: String(code).replace(/\s/g, ''),
		type: 'email'
	});
	if (error) throw new Error(spanishError(error));
	return data.session;
}

export function signOut() {
	return supabase()?.auth.signOut();
}

// Local read: no network, so it is safe to call while rendering.
export async function currentSession() {
	const { data } = (await supabase()?.auth.getSession()) ?? { data: {} };
	return data.session ?? null;
}
