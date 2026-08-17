// El link de invitación llega como `?invitacion=<token>` en la raíz de la app —
// el mismo lugar y la misma forma que la vuelta de Google (`oauth-return.ts`), y
// por el mismo motivo: la app se sirve como un solo index.html, y una ruta nueva
// sería un archivo más para que el service worker aprenda a servir sin internet.
//
// Todo acá son funciones puras: leer, limpiar, guardar. Ninguna toca el DOM.

const STASH = 'copynotes-invitacion';

export function inviteToken(href) {
	return new URL(href).searchParams.get('invitacion');
}

export function cleanInviteUrl(href) {
	const url = new URL(href);
	if (!url.searchParams.has('invitacion')) return href;
	url.searchParams.delete('invitacion');
	return url.toString();
}

// Entrar con Google se va a otro sitio y vuelve a la raíz SIN nuestros
// parámetros. Sin este guardado, quien abre el link estando deslogueado entra a
// su cuenta y la invitación se evaporó en el camino — y no tiene forma de
// recuperarla salvo pedir el link de nuevo.
export function stashInviteToken(storage, token) {
	try {
		storage?.setItem(STASH, token);
	} catch {
		// El modo privado puede bloquear el almacenamiento. Se pierde la invitación,
		// no la app.
	}
}

// Se entrega UNA sola vez: si quedara guardado, la próxima vez que la persona
// abra la app le volvería a aparecer una invitación que ya aceptó.
export function takeStashedInvite(storage) {
	try {
		const token = storage?.getItem(STASH) ?? null;
		if (token) storage.removeItem(STASH);
		return token;
	} catch {
		return null;
	}
}
