// Pure geometry: turn pointer coordinates over the (dragged-excluded) visible
// list into a concrete drop target for planDrop. Y picks the gap between two
// rows; X picks the nesting depth, clamped to what is structurally legal
// there (between the next row's depth and the previous row's depth + 1).

export function resolveDrop(rows, pointerX, pointerY, originX, indentPx) {
	if (rows.length === 0) return null;

	// Gap index = how many rows have their vertical midpoint above the pointer.
	let gap = 0;
	for (const row of rows) {
		if (pointerY >= row.top + row.height / 2) gap += 1;
		else break;
	}

	const prev = gap > 0 ? rows[gap - 1] : null;
	const next = gap < rows.length ? rows[gap] : null;

	// Legal depth range for this gap.
	const maxDepth = prev ? prev.depth + 1 : 0;
	const minDepth = next ? next.depth : 0;
	const rawDepth = Math.round((pointerX - originX) / indentPx);
	const depth = Math.max(minDepth, Math.min(rawDepth, maxDepth));

	// Parent = nearest row at or above the gap whose depth is depth-1.
	let newParentId = null;
	if (depth > 0) {
		for (let i = gap - 1; i >= 0; i -= 1) {
			if (rows[i].depth === depth - 1) {
				newParentId = rows[i].id;
				break;
			}
		}
	}

	// insertIndex = count of that parent's direct children strictly above the gap.
	let insertIndex = 0;
	for (let i = 0; i < gap; i += 1) {
		const row = rows[i];
		const rowParentIsTarget =
			depth === 0
				? row.depth === 0
				: row.depth === depth && parentAbove(rows, i, depth) === newParentId;
		if (rowParentIsTarget) insertIndex += 1;
	}

	const indicatorTop = prev ? prev.top + prev.height : rows[0].top;
	return { newParentId, insertIndex, indicatorTop, indicatorDepth: depth };
}

// Nearest row above index i whose depth is targetDepth-1 (that row's parent id).
function parentAbove(rows, i, targetDepth) {
	for (let k = i - 1; k >= 0; k -= 1) {
		if (rows[k].depth === targetDepth - 1) return rows[k].id;
	}
	return null;
}
