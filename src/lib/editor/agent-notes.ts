// La "voz" del agente en la nota: entradas de bitácora action:'note' cuyo
// actor no es el usuario. Se muestran bajo la tarea, nunca dentro del
// comentario del usuario (block.note) — ese campo es exclusivo del usuario.

export function agentNotesByBlock(activityRows) {
	const byBlock = {};
	const rows = (activityRows ?? [])
		.filter((row) => row.action === 'note' && row.actor !== 'user')
		.sort((a, b) => a.seq - b.seq);
	for (const row of rows) {
		(byBlock[row.blockId] ??= []).push({ text: row.text });
	}
	return byBlock;
}
