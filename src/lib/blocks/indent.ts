// Tab / Shift+Tab plans. Each plan is a list of { id, ...changes } updates
// the editor applies to state and storage in one pass. Children of the moved
// block follow it implicitly because they point at its id.

import { nextFreeOrder, planInsertAfter, sortByOrder } from './ordering';

function siblingsOf(blocks, parentBlockId) {
	const parent = parentBlockId ?? null;
	return sortByOrder(blocks.filter((block) => (block.parentBlockId ?? null) === parent));
}

export function planIndent(blocks, id) {
	const target = blocks.find((block) => block.id === id);
	if (!target) return null;
	const siblings = siblingsOf(blocks, target.parentBlockId);
	const index = siblings.findIndex((block) => block.id === id);
	if (index <= 0) return null;
	const newParent = siblings[index - 1];
	const newSiblings = siblingsOf(blocks, newParent.id);
	const updates = [];
	// Al final de los hijos del nuevo padre: el siguiente número libre, no la
	// cantidad de hijos — desde que hay huecos, contar no dice dónde termina.
	updates.push({ id, parentBlockId: newParent.id, order: nextFreeOrder(newSiblings) });
	// A los de abajo no se les toca el número. Antes se les restaba 1 para "cerrar
	// el hueco", y con posiciones intermedias (las que deja un Enter en el medio)
	// esa resta empataba al primero de abajo con el padre nuevo; el desempate por
	// id decidía quién iba antes, así que el renglón recién indentado se veía
	// caer debajo del siguiente. El hueco no molesta: nadie cuenta posiciones.
	return { updates };
}

// `rootId` es desde dónde se está mirando (spec 043): el primer nivel de la
// vista es el borde, igual que el primer nivel de la nota cuando no hay raíz.
export function planOutdent(blocks, id, rootId = null) {
	const target = blocks.find((block) => block.id === id);
	if (!target || (target.parentBlockId ?? null) === (rootId ?? null)) return null;
	const parent = blocks.find((block) => block.id === target.parentBlockId);
	if (!parent) return null;
	const parentSiblings = siblingsOf(blocks, parent.parentBlockId);
	// Entra justo después del padre por el punto medio, igual que un Enter: nadie
	// más cambia de número, ni los que quedan adentro del padre ni los de abajo.
	const { order } = planInsertAfter(parentSiblings, parent.id);
	return { updates: [{ id, parentBlockId: parent.parentBlockId ?? null, order }] };
}
