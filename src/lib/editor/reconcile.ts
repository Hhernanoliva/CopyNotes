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

import { sameToTheUser } from '../storage/row-compare';

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
	//
	// También queda `deferred`, igual que uno que sólo cambió de texto. Las dos
	// razones por las que pudo faltar terminan bien con un reintento: si era una
	// creación en vuelo, la próxima pasada ya lo encuentra y no lo posterga; si
	// lo borraron en el otro aparato, el reintento lo saca. Sin el reintento, un
	// borrado remoto sobre el renglón donde está el cursor no se aplicaba nunca
	// — y la próxima edición volvía a subir un renglón que allá ya no existe.
	const present = new Set(incoming.map((row) => row.id));
	current.forEach((block, index) => {
		if (!protectedIds.has(block.id) || present.has(block.id)) return;
		next.splice(Math.min(index, next.length), 0, block);
		deferred.push(block.id);
	});

	// ¿Quedaron viejas las fotos del historial de Deshacer? Guardan la lista
	// entera, y `restore` reescribe TODO lo que difiera entre la foto y la
	// pantalla — sin distinguir "esto lo borraste vos" de "esto todavía no había
	// llegado". Cualquiera de las dos formas de quedar vieja termina igual:
	// deshacer restaura la versión de antes encima de lo que trajo el otro
	// aparato, y la sube. Perder pasos para atrás es barato; eso no.
	//
	//   - la lista ganó o perdió renglones (`diffBlocks` lee "no está en la foto"
	//     como "el usuario lo borró");
	//   - un renglón que ya existía llegó con otro contenido (las fotos guardan
	//     el texto de antes, y deshacer otra cosa lo restaura de paso).
	const beforeById = new Map(current.map((row) => [row.id, row]));
	const historyStale =
		next.length !== beforeById.size ||
		next.some((row) => {
			const before = beforeById.get(row.id);
			return !before || (row !== before && !sameToTheUser('blocks', before, row));
		});

	return { blocks: next, deferred, historyStale };
}

