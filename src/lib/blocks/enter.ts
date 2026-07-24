// Enter/Backspace plans for the editor. Where the new block lands mirrors
// what the user sees: Enter on an expanded parent inserts a first child,
// otherwise a sibling right below.

import { buildVisibleList } from './hierarchy';
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
		return {
			parentBlockId: id,
			order: 0,
			updates: children.map((child) => ({ id: child.id, order: child.order + 1 }))
		};
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
export function enterOnEmptyAction(block) {
	if (block.type === 'separator') return 'insert';
	if ((block.parentBlockId ?? null) !== null) return 'outdent';
	if (block.type !== 'text') return 'convert';
	return 'insert';
}

// Backspace on an empty block first cancels the type (bullet/todo/code
// become plain text on the same row, Workflowy-style); only a plain text
// row or a separator is actually deleted.
export function backspaceAction(block) {
	return block.type === 'text' || block.type === 'separator' ? 'delete' : 'convert';
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

export function canDeleteOnBackspace(blocks, id) {
	if (blocks.length <= 1) return false;
	return !blocks.some((block) => (block.parentBlockId ?? null) === id);
}

// Borrar desde el menú (a diferencia de Backspace) puede eliminar un bloque
// con contenido y su subárbol; solo se prohíbe dejar el editor sin bloques.
export function canDeleteFromMenu(blocks, id) {
	return blocks.length > 1;
}

export function previousVisibleId(blocks, id) {
	const visible = buildVisibleList(blocks);
	const index = visible.findIndex((row) => row.block.id === id);
	if (index <= 0) return null;
	return visible[index - 1].block.id;
}
