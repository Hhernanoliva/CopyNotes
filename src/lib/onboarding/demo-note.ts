// First-run onboarding. CopyNotes teaches by example: instead of a blocking
// tutorial, the very first launch seeds an editable demo note whose content
// walks the user through bullets, nesting, todos, copy, tags, and code. The
// note is a normal note — the user can edit or delete it freely.
//
// The tree is kept pure and separate from storage so its shape can be tested
// without touching the database, and so a future "reset demo note" action can
// reuse the same content.

import { createNote, createBlock, findOrCreateTag, assignTag } from '$lib/storage';

// The demo tag. Kept as a constant so tests and future code can reference it.
export const DEMO_TAG_NAME = 'ejemplo';

// Pure description of the demo note. Each node maps to one block; `children`
// nests under it (Workflowy-style). `note` is the block's Shift+Enter sub-note.
export function demoNoteTree() {
	return {
		title: '👋 Bienvenido a CopyNotes',
		blocks: [
			{
				type: 'text',
				content: 'Esta es una nota de ejemplo. Editala, borrá lo que quieras: es tuya.'
			},
			{
				type: 'bullet',
				content: 'Escribí como en una lista',
				children: [
					{ type: 'bullet', content: 'Usá Tab para anidar y Shift+Tab para sacar' },
					{ type: 'bullet', content: 'Enter crea el siguiente renglón' }
				]
			},
			{ type: 'todo', content: 'Tocá el círculo para marcar un pendiente', checked: false },
			{ type: 'todo', content: 'Este ya quedó listo', checked: true },
			{
				type: 'bullet',
				content: 'Pasá el mouse por un renglón y aparece el botón Copiar',
				note: 'En el menú ⋯ podés copiar un bullet junto con todos sus hijos.'
			},
			{
				type: 'text',
				content: 'Las etiquetas ayudan a encontrar cosas. Esta lleva una:',
				tag: DEMO_TAG_NAME
			},
			{ type: 'code', content: '// Un bloque de código\ncopiar(texto)' },
			{ type: 'separator' },
			{
				type: 'text',
				content: '¿Listo? Creá tu primera nota con el botón + de la barra lateral.'
			}
		]
	};
}

// First run only: seed the demo note when it has never been created and the
// user has no notes yet. Deleting the demo note later must not bring it back,
// so the `demoNoteCreated` flag — not the note count — is the real guard.
export function shouldSeedDemoNote({ demoNoteCreated, noteCount }) {
	return !demoNoteCreated && noteCount === 0;
}

async function seedNodes(noteId, nodes, parentBlockId) {
	let order = 0;
	for (const node of nodes) {
		const block = await createBlock({
			noteId,
			parentBlockId,
			type: node.type,
			content: node.content ?? '',
			note: node.note ?? '',
			checked: node.checked ?? false,
			collapsed: node.collapsed ?? false,
			order: order++
		});
		if (node.tag) {
			const tag = await findOrCreateTag(node.tag);
			if (tag) await assignTag(tag.id, 'block', block.id);
		}
		if (node.children?.length) await seedNodes(noteId, node.children, block.id);
	}
}

// Creates the demo note and all its blocks. Returns the new note so the caller
// can open it. Callers must gate this with shouldSeedDemoNote.
export async function seedDemoNote() {
	const tree = demoNoteTree();
	const note = await createNote({ title: tree.title });
	await seedNodes(note.id, tree.blocks, null);
	return note;
}
