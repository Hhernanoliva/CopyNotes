// Traer cambios de afuera sin arrancarle el cursor a nadie (spec 030 fase 3).
//
// Hasta ahora, cualquier cambio externo —la nube, un agente— re-montaba el
// editor entero. Con el reloj de 30 segundos casi nunca coincidía con alguien
// escribiendo; a 2 segundos coincide siempre, y re-montar tira el foco y puede
// partir en dos el renglón que se estaba tipeando.
//
// La alternativa es actualizar el arreglo de bloques en el lugar: `BlockRow`
// ya sincroniza el DOM con el estado sólo cuando difieren, así que un renglón
// que nadie está tocando se actualiza solo y el cursor no se entera.
//
// Esta función decide la única parte delicada: qué se reemplaza y qué no.

// `protegidos` son los renglones que el usuario está escribiendo (donde está el
// cursor) o cuyo guardado todavía no aterrizó. Pisarlos es perder texto tipeado
// hace medio segundo; conservarlos sólo posterga el cambio hasta la próxima
// pasada, cuando el cursor se movió y el guardado terminó.
export function reconcileBlocks(current, incoming, protectedIds) {
	const byId = new Map(current.map((block) => [block.id, block]));
	// Los que se dejaron pasar. El que llama tiene que volver a intentarlo cuando
	// el cursor se vaya: si no, ese renglon se queda con la version vieja para
	// siempre, y peor, la proxima edicion la vuelve a subir pisando la del otro
	// dispositivo.
	const deferred = [];
	// El orden y la existencia los manda el almacenamiento: es donde ya se
	// aplicaron la unión y los borrados.
	const next = incoming.map((row) => {
		const mine = byId.get(row.id);
		if (!protectedIds.has(row.id) || !mine) return row;
		deferred.push(row.id);
		return mine;
	});

	// Un renglón protegido que el almacenamiento todavía no conoce: recién
	// creado, con su escritura en vuelo. Desaparecerlo bajo el cursor sería el
	// mismo daño que veníamos a evitar, así que vuelve a su lugar de antes.
	const present = new Set(incoming.map((row) => row.id));
	current.forEach((block, index) => {
		if (!protectedIds.has(block.id) || present.has(block.id)) return;
		next.splice(Math.min(index, next.length), 0, block);
	});

	return { blocks: next, deferred };
}
