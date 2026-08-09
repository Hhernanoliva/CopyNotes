// The only door to the cloud (spec 030 phase 2). Everything that talks to
// Supabase goes through here, so there is one place where "is the cloud even
// configured?" is answered and one place that knows how logging in works.
//
// Two ways in, one switch (`PUBLIC_SUPABASE_EMAIL_CODE`):
//
// - **Password** (the default). Nothing is emailed, so it works with no mail
//   provider at all. Requires "Confirm email" to be OFF in Supabase, otherwise
//   sign-up tries to send a mail that cannot be sent.
// - **6-digit code by email**, for when a verified sending domain exists.
//   Resend — and every provider we looked at — refuses SMTP sends from a domain
//   it has not verified, so this path stays dark until that day. Flipping the
//   variable is the whole migration; both paths are live code.
//
// The code path is a typed code and not a clickable magic link because the
// desktop app is a webview with no URL bar to come back to: a link would need
// OS-level deep-link plumbing to hand the click back to the app.
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

// Opt-in, because it needs a mail provider that can actually deliver. Anything
// other than the literal string 'true' means passwords.
export function emailCodeLogin() {
	return import.meta.env.PUBLIC_SUPABASE_EMAIL_CODE === 'true';
}

export function supabase() {
	if (!cloudConfigured()) return null;
	client ??= createClient(url, anonKey, {
		auth: {
			// PKCE, not the implicit flow: what comes back in the address bar is a
			// one-use code that is worthless without a secret only this browser has.
			// It is also the flow the desktop half needs (spec 034 phase 2), so that
			// one becomes an extra caller instead of a second design.
			flowType: 'pkce',
			// Something DOES arrive in the URL now (spec 034) — but the app picks it
			// up itself, in `SettingsDialog`, with `completeGoogleSignIn`. Letting
			// supabase-js detect it was the first shape and it cost a whole
			// afternoon: its own pickup runs inside the constructor, where a failed
			// exchange is caught, logged to nowhere and swallowed. The screen showed
			// the login form again with no message and no way to tell a cancelled
			// trip from a broken redirect. Doing it by hand is the same call phase 2
			// needs on the desktop, and its error reaches the user.
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
	// A 5xx from the auth server with an empty body arrives as literally "{}" or
	// as nothing at all. In practice that is the mail provider refusing the send,
	// and the useless original message was hiding it.
	if (!message || message === '{}' || Number(error?.status) >= 500) {
		return 'El servidor no pudo enviar el mail. Revisá la configuración de SMTP en Supabase y el registro de tu proveedor de email.';
	}
	if (/invalid login credentials/i.test(message)) {
		return 'Email o contraseña incorrectos.';
	}
	if (/already registered|already exists/i.test(message)) {
		return 'Ya existe una cuenta con ese email. Usá "Entrar".';
	}
	if (/password should be at least|weak password/i.test(message)) {
		return 'La contraseña es muy corta: usá 8 caracteres o más.';
	}
	if (/email not confirmed/i.test(message)) {
		return 'La cuenta existe pero falta confirmar el email. En Supabase, apagá "Confirm email".';
	}
	// What the server answers while the provider has not been switched on in the
	// Supabase panel — the expected failure until that manual step is done.
	if (/provider is not enabled|unsupported provider/i.test(message)) {
		return 'Entrar con Google no está habilitado en este servidor.';
	}
	// PKCE: the trip back landed somewhere that does not hold the secret this
	// browser stored when it left — another address, another browser, storage
	// cleared in between. Reads as "invalid" otherwise, which would hand back the
	// message about the 6-digit code and send the person looking at their email.
	if (/code.?verifier|code challenge/i.test(message)) {
		return 'El viaje de vuelta de Google no terminó en el mismo lugar donde empezó, así que este navegador no pudo completar la entrada. Probá de nuevo desde esta misma pestaña.';
	}
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

const MIN_PASSWORD = 8;

function checkPassword(password) {
	if (String(password).length < MIN_PASSWORD) {
		throw new Error(`La contraseña es muy corta: usá ${MIN_PASSWORD} caracteres o más.`);
	}
}

export async function signUpWithPassword(email, password) {
	checkPassword(password);
	const { data, error } = await supabase().auth.signUp({ email, password });
	if (error) throw new Error(spanishError(error));
	// With "Confirm email" on, Supabase returns no session and quietly waits for a
	// mail that this setup cannot send. Say so instead of looking like it worked.
	if (!data.session) {
		throw new Error(
			'La cuenta se creó pero no quedó abierta: en Supabase hay que apagar "Confirm email".'
		);
	}
	return data.session;
}

export async function signInWithPassword(email, password) {
	const { data, error } = await supabase().auth.signInWithPassword({ email, password });
	if (error) throw new Error(spanishError(error));
	return data.session;
}

// Google gives the door, never the key (spec 034): this identifies the account
// and nothing else — the vault key stays in this device and the server never
// sees it. The trip back lands on the app's own root, which is the address
// Supabase has in its allow-list, and the tab navigates away right here: there
// is nothing after this call on the happy path.
export async function signInWithGoogle() {
	const { error } = await supabase().auth.signInWithOAuth({
		provider: 'google',
		options: { redirectTo: window.location.origin }
	});
	if (error) throw new Error(spanishError(error));
}

// The other half of the trip: the code that came back in the address bar is
// worth a session only together with the secret this browser kept when it left
// (PKCE). Failing here is not exotic — a redirect that landed on a different
// address loses that secret — so the error is thrown, in Spanish, instead of
// leaving the login form on screen with nothing said.
export async function completeGoogleSignIn(code) {
	const { data, error } = await supabase().auth.exchangeCodeForSession(code);
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
