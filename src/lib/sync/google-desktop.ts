// Entrar con Google desde la .app (spec 034, fase 2).
//
// En la web la pestaña se va a Google y vuelve sola. Acá no hay barra de
// direcciones a la que volver: la ventana carga archivos empaquetados, en una
// dirección interna que nadie de afuera puede alcanzar. Así que el viaje se hace
// por afuera —en el navegador de la persona— y la vuelta aterriza en un puerto
// que esta misma computadora abre para la ocasión (`src-tauri/src/oauth.rs`).
//
// El orden importa y es el único motivo por el que esto es una función y no dos
// botones: el puerto tiene que existir antes de que se abra el navegador, porque
// va escrito adentro de la dirección de vuelta.

import { openExternal } from '$lib/platform';
import { completeGoogleSignIn, signInWithGoogle } from './supabase';
import { oauthCode, oauthErrorMessage, oauthFlowId } from './oauth-return';

export async function signInWithGoogleDesktop() {
	const { invoke } = await import('@tauri-apps/api/core');
	const port = await invoke('oauth_start');
	// 127.0.0.1 con el puerto pelado, sin barra final. La lista de direcciones
	// permitidas de Supabase se compara como patrón y no avisa cuando algo no
	// entra: cae en la Site URL en silencio y la persona termina en la web
	// mientras la app espera un golpe que nunca llega.
	const url = await signInWithGoogle({
		redirectTo: `http://127.0.0.1:${port}`,
		skipBrowserRedirect: true
	});
	if (!url) throw new Error('Google no devolvió una dirección para abrir.');
	await openExternal(url);

	// Lo que contesta el oyente es la dirección entera, tal como llegó, para que
	// la lean las mismas funciones puras que ya usa la web.
	const href = await invoke('oauth_wait');
	const refusal = oauthErrorMessage(href);
	if (refusal) throw new Error(refusal);
	const code = oauthCode(href);
	if (!code) throw new Error('No llegó la respuesta de Google. Probá de nuevo.');
	return completeGoogleSignIn(code, oauthFlowId(href));
}
