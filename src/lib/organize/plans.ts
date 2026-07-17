// Pure sidebar organization math (spec 022). Containers are arrays of rows
// ({id, sortOrder, ...}); a container is either a kind's root list (folders
// and loose items share one sequence) or one folder's contents. Plans return
// minimal update lists; the storage layer applies them, this module never
// touches storage or the DOM.

function hasOrder(row) {
	return typeof row.sortOrder === 'number' && Number.isFinite(row.sortOrder);
}

export function sortBySidebarOrder(rows) {
	const ordered = rows.filter(hasOrder).sort((a, b) => a.sortOrder - b.sortOrder);
	return [...ordered, ...rows.filter((row) => !hasOrder(row))];
}

// Renumbers rows to match their given order, emitting only changed rows.
function renumber(rows) {
	const updates = [];
	rows.forEach((row, index) => {
		if (row.sortOrder !== index) updates.push({ id: row.id, sortOrder: index });
	});
	return updates;
}

export function assignInitialOrder(rows) {
	return renumber(rows);
}

export function planReorder(container, movedId, targetIndex) {
	const sorted = sortBySidebarOrder(container);
	const from = sorted.findIndex((row) => row.id === movedId);
	if (from === -1) return { updates: [] };
	const rest = sorted.filter((row) => row.id !== movedId);
	const clamped = Math.max(0, Math.min(targetIndex, rest.length));
	rest.splice(clamped, 0, sorted[from]);
	return { updates: renumber(rest) };
}

export function planInsertAtTop(container) {
	return sortBySidebarOrder(container).map((row, index) => ({ id: row.id, sortOrder: index + 1 }));
}

export function planMoveToContainer(source, target, movedId, targetIndex, folderId) {
	const sortedSource = sortBySidebarOrder(source);
	const moved = sortedSource.find((row) => row.id === movedId);
	if (!moved) return { updates: [] };
	const remaining = sortedSource.filter((row) => row.id !== movedId);
	const sortedTarget = sortBySidebarOrder(target);
	const clamped = Math.max(0, Math.min(targetIndex, sortedTarget.length));
	const landed = [...sortedTarget];
	landed.splice(clamped, 0, moved);
	const updates = renumber(remaining);
	landed.forEach((row, index) => {
		if (row.id === movedId) updates.push({ id: movedId, folderId, sortOrder: index });
		else if (row.sortOrder !== index) updates.push({ id: row.id, sortOrder: index });
	});
	return { updates };
}

export function planFolderDelete(rootContainer, contents, folderId) {
	const root = sortBySidebarOrder(rootContainer);
	const position = root.findIndex((row) => row.id === folderId);
	const rest = root.filter((row) => row.id !== folderId);
	const insertAt = position === -1 ? rest.length : position;
	const relocated = sortBySidebarOrder(contents).map((row) => ({ row, moved: true }));
	const merged = rest.map((row) => ({ row, moved: false }));
	merged.splice(insertAt, 0, ...relocated);
	const updates = [];
	merged.forEach(({ row, moved }, index) => {
		if (moved) updates.push({ id: row.id, folderId: null, sortOrder: index });
		else if (row.sortOrder !== index) updates.push({ id: row.id, sortOrder: index });
	});
	return { updates };
}

export function buildSidebarTree(items, folders) {
	const folderIds = new Set(folders.map((folder) => folder.id));
	const rootItems = items.filter((item) => !item.folderId || !folderIds.has(item.folderId));
	const root = sortBySidebarOrder([
		...folders.map((folder) => ({ kind: 'folder', ref: folder, sortOrder: folder.sortOrder, id: folder.id })),
		...rootItems.map((item) => ({ kind: 'item', ref: item, sortOrder: item.sortOrder, id: item.id }))
	]);
	return root.map((node) =>
		node.kind === 'folder'
			? {
					kind: 'folder',
					folder: node.ref,
					children: sortBySidebarOrder(items.filter((item) => item.folderId === node.ref.id))
				}
			: { kind: 'item', item: node.ref }
	);
}
