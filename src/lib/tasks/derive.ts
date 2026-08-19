// ¿Esta tarea está hecha? La respuesta sale de la BITÁCORA, no del campo
// `block.checked` — que a partir de spec 038 §5 es un cache de esta cuenta.
//
// El invitado de una nota compartida tiene prohibido tocar un renglón (es lo que
// hace imposibles los choques, no raros), así que su tilde es una línea más
// —'done' o 'reopened'— y los dos aparatos deducen lo mismo de la misma lista
// ordenada. Cuando el cache y la bitácora no coinciden, manda la bitácora.
//
// EL ORDEN LO DECIDE EL SERVIDOR, nunca `seq`. `seq` es `nextChangeSeq()`, o sea
// el reloj de un aparato, y entre dos cuentas son dos relojes: un invitado
// atrasado dos minutos destildaría a las 10:00 y le ganaría a un tilde del dueño
// de las 09:59:30, en los DOS aparatos y en silencio. Con `server_seq` no hay
// ningún reloj en juego y no hay nada que reconciliar. Lo que eso cuesta, para
// que no se redescubra como un bug: después de un rato largo sin internet el
// orden se invierte —el que destildó el lunes sin conexión le gana al que tildó
// el martes, porque su línea llega el miércoles—. Se arregla solo apenas alguno
// vuelve a tocar la tarea, y lo único en juego es una casilla: por acá no se
// puede perder texto.
//
// `null` NO es "no está hecha": es "no tengo opinión". Una tarea puede estar
// tildada por un camino que no deja línea —un respaldo restaurado, un "[x]"
// pegado, una tarea anterior a que existiera la bitácora— y ahí el cache es el
// único dato que hay. Devolver `false` en ese caso destildaría tareas viejas
// solo, sin que nadie las toque.

const TILDE = new Set(['done', 'reopened']);

// Sin `serverSeq` la línea todavía no llegó al servidor, así que nada pudo
// llegar después de ella: va última. `Infinity` lo dice sin una rama aparte.
const orden = (row) => (typeof row.serverSeq === 'number' ? row.serverSeq : Infinity);

export function deriveChecked(entries) {
	const tildes = (entries ?? []).filter((row) => TILDE.has(row.action) && !row.deletedAt);
	if (!tildes.length) return null;
	// Copia antes de ordenar: `sort` muta, y lo que llega es la lista que el
	// llamador acaba de leer y puede seguir usando.
	//
	// Entre dos que todavía no subieron desempata `seq`, el reloj local, y ahí sí
	// alcanza: las dos salieron de este mismo aparato.
	const ordenadas = [...tildes].sort((a, b) => orden(a) - orden(b) || (a.seq ?? 0) - (b.seq ?? 0));
	return ordenadas.at(-1).action === 'done';
}
