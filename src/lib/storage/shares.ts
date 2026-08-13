// La única puerta a "¿esta nota está compartida, y de qué lado?" y a los valores
// por nota que la acompañan.
//
// Existe para que las dos subidoras lean el MISMO campo: la regla de la spec 038
// —una nota viaja por un caño solo— se rompe por omisión, no por error, y una
// sola lectura compartida es lo que impide que un llamador nuevo se la olvide.

import { db } from './db';
import { getSetting, setSetting } from './settings';
import { shareKey } from './settings-registry';

export async function getShareRole(noteId) {
	return (await db.table('notes').get(noteId))?.share ?? null;
}

// `fromCloud` a propósito: poner o sacar la marca es contabilidad sobre en qué
// caño va la nota, no una edición de la nota. Sin esto, compartir subiría la
// nota entera por el caño que justo estamos abandonando.
export function setShareRole(noteId, role) {
	return db.table('notes').update(noteId, { share: role ?? undefined, fromCloud: true });
}

export async function sharedNoteIdsByRole() {
	const owner = new Set();
	const member = new Set();
	await db.table('notes').each((note) => {
		if (note.share === 'owner') owner.add(note.id);
		else if (note.share === 'member') member.add(note.id);
	});
	return { owner, member };
}

export async function sharedNoteIds() {
	const { owner, member } = await sharedNoteIdsByRole();
	return new Set([...owner, ...member]);
}

export async function getShareCursor(noteId) {
	return Number(await getSetting(shareKey('cursor', noteId))) || 0;
}

// Sólo hacia adelante, igual que los dos cursores de la nube: una tanda que
// llega tarde no puede hacer retroceder la marca y releer media nota.
export async function setShareCursor(noteId, serverSeq) {
	if (serverSeq > (await getShareCursor(noteId))) {
		await setSetting(shareKey('cursor', noteId), serverSeq);
	}
}
