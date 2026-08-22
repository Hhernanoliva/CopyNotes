// Enter/Backspace plans for the editor. Where the new block lands mirrors
// what the user sees: Enter on an expanded parent inserts a first child,
// otherwise a sibling right below.

import { buildVisibleList, listDescendantIds } from './hierarchy';
import { planInsertAfter } from './ordering';
import { sortByOrder } from './ordering';

function siblingsOf(blocks, parentBlockId) {
	const parent = parentBlockId ?? null;
	return sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
}

export function planEnter(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const children = siblingsOf(blocks, id);
	if (children.length > 0 && !target.collapsed) {
		// Un lugar antes del que era primero, sin renumerar a los hermanos: la
		// misma razón que en `planInsertAfter`. Los números negativos son normales.
		return { parentBlockId: id, order: children[0].order - 1, updates: [] };
	}
	const siblings = siblingsOf(blocks, target.parentBlockId);
	const plan = planInsertAfter(siblings, id);
	return {
		parentBlockId: target.parentBlockId ?? null,
		order: plan.order,
		updates: plan.updates
	};
}

// Enter on an empty block escapes the structure instead of stacking empty
// rows: nested rows outdent one level per press (the "double Enter" exit),
// typed rows at root cancel their type, and everything else inserts as
// usual. Separators keep inserting because Enter there means "give me a
// row after the line".
//
// Una imagen sin descripción NO es un renglón vacío (spec 041 §3.5): su
// contenido es la captura. Sin esta línea, Enter la "cancelaba" convirtiéndola
// en texto —dejando los bytes colgados— o la desanidaba en vez de dar un
// renglón nuevo. Va junto al separador y antes del desanidado, por lo mismo:
// el renglón tiene algo puesto, no está esperando que escribas.
export function enterOnEmptyAction(block) {
	if (block.type === 'separator' || block.type === 'image') return 'insert';
	if ((block.parentBlockId ?? null) !== null) return 'outdent';
	if (block.type !== 'text') return 'convert';
	return 'insert';
}

// Backspace on an empty block first cancels the type (bullet/todo/code
// become plain text on the same row, Workflowy-style); only a plain text
// row or a separator is actually deleted.
export function backspaceAction(block) {
	// La imagen va con el separador y no con los tipos que se cancelan: no hay un
	// "texto normal" atrás al que volver, y convertirla dejaría los bytes
	// colgados. Es el gemelo de la línea de `enterOnEmptyAction`.
	return block.type === 'text' || block.type === 'separator' || block.type === 'image'
		? 'delete'
		: 'convert';
}

// Backspace on an EMPTY row that still has sub-items: instead of refusing (which
// left a stuck empty "ghost" row), the row is removed and its direct children are
// lifted one level to take its place — nothing is lost, they just slide up. The
// caller deletes the now-empty row; this only plans the children's re-parenting.
// Grandchildren follow their parent implicitly, so only the direct children move.
export function planPromoteChildren(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const children = siblingsOf(blocks, id);
	if (children.length === 0) return null;
	const parent = target.parentBlockId ?? null;
	const shift = children.length - 1;
	const updates = [];
	children.forEach((child, index) => {
		updates.push({ id: child.id, parentBlockId: parent, order: target.order + index });
	});
	if (shift !== 0) {
		const laterSiblings = siblingsOf(blocks, parent).filter((block) => block.order > target.order);
		for (const later of laterSiblings) {
			updates.push({ id: later.id, order: later.order + shift });
		}
	}
	return { updates };
}

// El renglón donde aterrizó lo que se pegó o se soltó: ¿se puede tirar? Sólo si
// quedó vacío y no hay nada más puesto ahí. Las tres exclusiones costaron algo
// cada una:
//  - con sub-ítems, borrarlo dejaría la rama huérfana;
//  - un separador tiene el contenido vacío SIEMPRE, y ese contenido es la línea
//    que se ve;
//  - una imagen sin descripción TAMBIÉN tiene el contenido vacío, y tirarla
//    sería tirar la captura (spec 041). Soltar una captura encima de otra
//    borraba la de abajo hasta que esto se escribió una sola vez.
//
// Vive acá y no en el editor porque había dos copias, y lo que las diferenciaba
// era justo el renglón que faltaba.
export function originIsDisposable(blocks, id) {
	const origin = blocks.find((block) => block.id === id);
	if (!origin) return false;
	if ((origin.content ?? '') !== '') return false;
	if (origin.type === 'separator' || origin.type === 'image') return false;
	return !blocks.some((block) => (block.parentBlockId ?? null) === id);
}

// `rootId` es desde dónde se está mirando (spec 043). Con el valor por defecto
// —la nota entera— esto significa exactamente lo de siempre.
export function canDeleteOnBackspace(blocks, id, rootId = null) {
	// Cuenta los renglones DE LA VISTA, no los de la nota: adentro de un renglón
	// con un solo hijo, Backspace no puede dejar la vista sin dónde escribir.
	// `listDescendantIds(blocks, null)` son todos los bloques, así que sin raíz
	// esto es el viejo `blocks.length` (y además no cuenta huérfanos, que no se
	// dibujan en ningún lado).
	if (listDescendantIds(blocks, rootId).length <= 1) return false;
	return !blocks.some((block) => (block.parentBlockId ?? null) === id);
}

// Borrar desde el menú (a diferencia de Backspace) puede eliminar un bloque
// con contenido y su subárbol; solo se prohíbe dejar el editor sin bloques.
export function canDeleteFromMenu(blocks, id) {
	return blocks.length > 1;
}

export function previousVisibleId(blocks, id, rootId = null) {
	const visible = buildVisibleList(blocks, rootId);
	const index = visible.findIndex((row) => row.block.id === id);
	if (index <= 0) return null;
	return visible[index - 1].block.id;
}

// Backspace al principio de un renglón CON texto: deshace el corte de Enter.
// El texto sube al renglón de arriba —el de arriba manda, su tipo se queda— y
// este renglón desaparece. Devuelve null cuando unir perdería algo, y ahí
// Backspace no hace nada: sub-ítems que se quedarían sin padre, la nota gris
// del renglón que se va, un separador o un bloque de código de cualquiera de
// los dos lados (su texto no se mezcla con el de al lado), y el renglón de
// arriba colapsado, donde el texto aterrizaría sobre hijos que no se ven.
export function planJoinWithPrevious(blocks, id, rootId = null) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	if (!joinable(target) || target.note) return null;
	if (siblingsOf(blocks, id).length > 0) return null;
	// Con raíz, `index <= 0` cae en el PRIMER renglón de la vista: unir ahí
	// subiría el texto al renglón-título, que es un renglón fuera de la lista.
	const prevId = previousVisibleId(blocks, id, rootId);
	const previous = prevId ? blocks.find((block) => block.id === prevId) : null;
	if (!previous || !joinable(previous)) return null;
	if (previous.collapsed && siblingsOf(blocks, prevId).length > 0) return null;
	return { intoId: prevId };
}

function joinable(block) {
	return block.type !== 'separator' && block.type !== 'code';
}
