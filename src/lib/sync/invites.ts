// Invitar, aceptar, y las dos formas de cortar (spec 038 §7).
//
// Todo lo de acá es una llamada sola a una función del servidor. Vive en su
// propio archivo y no adentro de `shared.ts` porque `shared.ts` es el LAZO —
// corre solo cada 30 segundos y no tiene a quién avisarle— y esto es lo
// contrario: pasa cuando una persona aprieta un botón, y cada error tiene que
// poder mostrarse en pantalla.

import { rememberShareName } from '../storage/share-names';
import { setShareRole } from '../storage/shares';

// Dónde vive la web. Un link de invitación tiene que abrirse en la máquina de
// otra persona, así que no puede salir del `origin` de la app de escritorio (un
// esquema interno de Tauri). Un origen http(s) sí sirve tal cual, y eso es lo que
// mantiene vivos el `localhost` del desarrollo y las previews de Vercel.
const WEB_APP_URL = 'https://copynotes-beta.vercel.app';

// Los mensajes del servidor ya vienen en castellano: los escribe a mano cada
// `raise exception` del schema, y pasan tal cual. El único que no es nuestro es
// el del navegador cuando no hay red, que llega como "TypeError: Failed to
// fetch" —inglés, el nombre de un tipo, y ni una palabra sobre qué hacer— y
// aterriza en un `toast` delante de la persona. Se traduce acá, en la puerta
// única de las seis llamadas, y no en cada botón (visto en el gate manual,
// 2026-08-17, aceptando una invitación).
//
// No se reusa el `spanishError` de `supabase.ts`: ese traduce fallas de LOGIN, y
// su rama de 5xx contesta sobre la configuración del correo, que acá no viene a
// cuento.
const SIN_RED = /failed to fetch|networkerror|network error|load failed/i;

const unwrap = ({ data, error }) => {
	if (!error) return data;
	if (SIN_RED.test(error.message ?? '')) {
		throw new Error('No se pudo conectar. Revisá tu conexión y probá de nuevo.');
	}
	throw new Error(error.message);
};

export function inviteLink(token, origin) {
	const base = typeof origin === 'string' && origin.startsWith('http') ? origin : WEB_APP_URL;
	return `${base.replace(/\/$/, '')}/?invitacion=${encodeURIComponent(token)}`;
}

export async function createInvite(client, noteId, memberLabel, ownerLabel) {
	return unwrap(
		await client.rpc('create_share_invite', {
			p_note_id: noteId,
			p_member_label: memberLabel,
			p_owner_label: ownerLabel
		})
	);
}

export async function acceptInvite(client, token) {
	return unwrap(await client.rpc('accept_share_invite', { p_token: token }));
}

// Por tabla y no por función: `share_members` ya le da `select` a quien es parte
// de la nota, así que una función más sería otra puerta para lo mismo.
export async function listMembers(client, noteId) {
	const filas =
		unwrap(
			await client.from('share_members').select('member_id, display_name').eq('note_id', noteId)
		) ?? [];
	const miembros = filas.map((fila) => ({ id: fila.member_id, name: fila.display_name }));
	// Este es el único viaje que trae los nombres de los invitados, así que es acá
	// donde se guardan: la bitácora los va a pedir por uuid mucho después, sin red
	// de por medio.
	for (const miembro of miembros) await rememberShareName(miembro.id, miembro.name);
	return miembros;
}

export async function removeMember(client, noteId, memberId) {
	unwrap(await client.rpc('remove_member', { p_note_id: noteId, p_member_id: memberId }));
}

export async function leaveShare(client, noteId) {
	unwrap(await client.rpc('leave_share', { p_note_id: noteId }));
	// Y la marca local se borra ACÁ, no en la pasada siguiente.
	//
	// `reconcileShares` termina limpiándola sola —la nota deja de venir en
	// `list_shares`— pero eso puede tardar treinta segundos, y mientras tanto la
	// pantalla se dibuja leyendo esta marca: seguía ofreciendo "Salirme de esta
	// nota", ya sin ser parte, y cada clic mandaba otra vez la misma llamada.
	// Encontrado en el paso 9 del gate manual (2026-08-17).
	//
	// Después del `unwrap` a propósito: si el servidor rechaza, seguís adentro de
	// la nota y la pantalla tiene que decir eso. La marca sigue el estado real,
	// nunca la intención.
	//
	// No lleva el resello de `unshareNote`: esta nota no es tuya, y volver a
	// sellar sus filas las mandaría a tu bóveda. Se hace lo mismo que hace
	// `reconcileShares` al encontrarla de menos, que es una sola cosa.
	await setShareRole(noteId, null);
}
