// La "voz" de los OTROS en la nota: entradas de bitácora action:'note' que no
// escribió esta cuenta. Se muestran bajo la tarea, nunca dentro del comentario
// del usuario (block.note) — ese campo es exclusivo del dueño y no viaja.
//
// El filtro decía `actor !== 'user'` y se escribió cuando "no es el usuario"
// tenía un solo significado (spec 038 §6). En el aparato del invitado, `'user'`
// es el DUEÑO: con el filtro viejo, el invitado no veía un solo comentario del
// otro lado. Por eso pregunta "¿esto lo escribí yo?" y no "¿esto lo escribió el
// usuario?".
//
// El `actor` viaja hasta la pantalla porque la etiqueta se resuelve arriba, con
// un await que acá no se puede hacer.

import { isMine } from '$lib/storage/share-names';

export function agentNotesByBlock(activityRows, ctx = { role: null, myActor: null }) {
	// Esconder lo propio vale para el DUEÑO, que lo ve en `block.note`. El
	// invitado no tiene ese campo —`BlockRow` lo apaga con `!guest`, porque es del
	// dueño y no viaja— así que para él la itálica es el ÚNICO lugar donde su
	// comentario existe: filtrarlo lo deja apretando Enter contra una pared.
	// La regla no es "no muestres lo mío" sino "no lo muestres DOS veces".
	const invitado = ctx.role === 'member';
	const byBlock = {};
	const rows = (activityRows ?? [])
		.filter((row) => row.action === 'note' && row.blockId && (invitado || !isMine(row.actor, ctx)))
		.sort((a, b) => a.seq - b.seq);
	for (const row of rows) {
		(byBlock[row.blockId] ??= []).push({ id: row.id, text: row.text, actor: row.actor });
	}
	return byBlock;
}
