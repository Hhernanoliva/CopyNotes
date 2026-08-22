// Pure block hierarchy logic, separate from the editor UI so export, copy,
// search, and future drag-and-drop can reuse it (specs/003 agent notes).
// The hierarchy lives in data (parentBlockId + order), never in DOM order.

import { sortByOrder } from './ordering';

function childrenByParent(blocks) {
	const map = new Map();
	for (const block of blocks) {
		const parent = block.parentBlockId ?? null;
		if (!map.has(parent)) map.set(parent, []);
		map.get(parent).push(block);
	}
	for (const [parent, children] of map) {
		map.set(parent, sortByOrder(children));
	}
	return map;
}

// Flatten the tree into the list the editor renders: parents before children,
// siblings by order, skipping descendants of collapsed blocks.
//
// `rootId` es desde dónde se dibuja (spec 043, "entrar en un renglón"): `null`
// es la nota entera y un id es "estoy parado adentro de ese renglón". El valor
// por defecto deja intactos a todos los llamadores y pruebas de antes, así que
// el cambio se lee como "se agregó un caso" y no como "se reescribió la jerarquía".
//
// La caminata arranca en los HIJOS de la raíz, así que el `collapsed` de la
// propia raíz no se mira: colapsar es "acá no me lo muestres", entrar es "quiero
// estar adentro", y son dos cosas distintas.
export function buildVisibleList(blocks, rootId = null) {
	const byParent = childrenByParent(blocks);
	const visible = [];
	function walk(parentId, depth) {
		for (const block of byParent.get(parentId) ?? []) {
			visible.push({ block, depth, hasChildren: byParent.has(block.id) });
			if (!block.collapsed) walk(block.id, depth + 1);
		}
	}
	walk(rootId ?? null, 0);
	return visible;
}

// La cadena de antepasados de un renglón, del más lejano al más cercano y sin
// incluirlo. Las migas la dibujan (spec 043) y salir un nivel lee su último
// eslabón. El `seen` corta un dato roto donde los padres se muerden la cola: sin
// él la pantalla se cuelga, que es peor que una miga de menos.
export function ancestorIds(blocks, id) {
	const chain = [];
	const seen = new Set();
	let current = blocks.find((block) => block.id === id);
	while (current) {
		const parentId = current.parentBlockId ?? null;
		if (parentId === null || seen.has(parentId)) break;
		seen.add(parentId);
		const parent = blocks.find((block) => block.id === parentId);
		if (!parent) break;
		chain.unshift(parentId);
		current = parent;
	}
	return chain;
}

// Orden de documento COMPLETO (para el export al agente): igual que
// buildVisibleList pero sin saltar descendientes de bloques colapsados —
// colapsar es presentación, no privacidad.
export function flattenTree(blocks) {
	const byParent = childrenByParent(blocks);
	const flat = [];
	function walk(parentId, depth) {
		for (const block of byParent.get(parentId) ?? []) {
			flat.push({ block, depth });
			walk(block.id, depth + 1);
		}
	}
	walk(null, 0);
	return flat;
}

export function listDescendantIds(blocks, id) {
	const byParent = childrenByParent(blocks);
	const ids = [];
	function walk(parentId) {
		for (const block of byParent.get(parentId) ?? []) {
			ids.push(block.id);
			walk(block.id);
		}
	}
	walk(id);
	return ids;
}
