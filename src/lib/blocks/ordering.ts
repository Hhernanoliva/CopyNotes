// Pure ordering logic, kept separate from editor UI so export, copy,
// and future drag-and-drop can reuse it (specs/003 agent notes).

// El desempate es parte del orden, no un adorno: dos renglones con la misma
// posición tienen que verse igual en TODOS los aparatos. Sin él, cada uno los
// dibujaba en el orden en que los tenía cargados en memoria, así que dos
// dispositivos con exactamente los mismos datos mostraban listas distintas. Y
// empatan seguido: dos aparatos que insertan después del mismo renglón eligen
// el mismo número, sin hablarse. El id es arbitrario pero igual en los dos.
export function sortByOrder(blocks) {
	return [...blocks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Plan inserting a new sibling right after `afterId`.
//
// El número nuevo cae ENTRE el de arriba y el de abajo, y no se toca a nadie
// más: un Enter escribe UN renglón. Antes se renumeraba a todos los de abajo
// (+1 cada uno), lo que con dos aparatos editando la misma nota convertía cada
// Enter en una pelea por renglones que la persona ni tocó — los dos declaraban
// el mismo número para el mismo vecino, la nube frenaba al segundo y la nota
// terminaba con una pila de conflictos que había que resolver a mano.
//
// ponytail: los puntos medios gastan precisión — unas 50 inserciones seguidas
// en el MISMO hueco antes de que dos números dejen de distinguirse. Si alguna
// vez aparece, la salida es renumerar ese nivel de una sola vez, no volver al
// +1 por vecino.
export function planInsertAfter(siblings, afterId) {
	const sorted = sortByOrder(siblings);
	const index = sorted.findIndex((block) => block.id === afterId);
	if (index === -1) return { order: nextFreeOrder(sorted), updates: [] };
	const above = sorted[index].order;
	const below = sorted[index + 1]?.order;
	return { order: below === undefined ? above + 1 : (above + below) / 2, updates: [] };
}

// Un lugar libre al final de la lista. No es `siblings.length`: con huecos y
// puntos medios, la cantidad de hermanos no dice nada sobre el último número.
export function nextFreeOrder(siblings) {
	return siblings.length === 0 ? 0 : Math.max(...siblings.map((block) => block.order)) + 1;
}
