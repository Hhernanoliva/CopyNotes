// Partir un renglón con Enter en medio del texto (spec 003). Capa pura: recibe
// el html del renglón y dónde está el cursor, devuelve qué queda arriba y qué
// baja al renglón nuevo. Quién lo escribe, y de qué tipo nace el renglón nuevo,
// lo decide el editor; acá sólo se corta el texto sin perder el formato.
//
// Las dos mitades salen de la MISMA operación, `removePlainTextRange`: la
// cabeza es el renglón sin lo que viene después del cursor, y la cola es el
// renglón sin lo que viene antes. Esa función borra respetando los envoltorios
// (negrita, color, enlace), así que un corte adentro de un tramo con formato
// deja las dos mitades formateadas. Cortar con un Range del navegador NO sirve
// acá: cuando las dos puntas caen en el mismo texto, `cloneContents` devuelve
// el texto pelado y la negrita se pierde.
//
// Cuenta un <br> como un carácter, igual que htmlToPlainText, así que las
// posiciones que manda el renglón valen para las dos mitades.

import { sanitizeHtml, htmlToPlainText, removePlainTextRange } from '$lib/format';

export function planSplit(html, start, end) {
	const source = sanitizeHtml(html ?? '');
	const length = htmlToPlainText(source).length;
	const from = Math.max(0, Math.min(start, end));
	const to = Math.min(length, Math.max(start, end));
	// Cursor al final y nada marcado: no hay nada que bajar, y Enter sigue
	// haciendo lo de siempre (renglón nuevo vacío, salida del anidado, etc.).
	if (from >= length) return null;
	const headHtml = removePlainTextRange(source, from, length);
	const tailHtml = removePlainTextRange(source, 0, to);
	return {
		head: { html: headHtml, content: htmlToPlainText(headHtml) },
		tail: { html: tailHtml, content: htmlToPlainText(tailHtml) }
	};
}
