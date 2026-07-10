// Public storage API. UI code imports from here, never from Dexie tables directly.
export { db } from './db';
export { createId, now } from './ids';
export { createNote, getNote, listNotes, updateNote, softDeleteNote } from './notes';
export {
	createBlock,
	getBlock,
	listBlocksByNote,
	listChildBlocks,
	updateBlock,
	softDeleteBlock
} from './blocks';
export {
	createSnippet,
	getSnippet,
	listSnippets,
	listFavoriteSnippets,
	updateSnippet,
	softDeleteSnippet
} from './snippets';
export {
	createTag,
	getTag,
	listTags,
	updateTag,
	softDeleteTag,
	assignTag,
	unassignTag,
	listTagsFor,
	listAssignmentsForTag
} from './tags';
export {
	getSetting,
	setSetting,
	getTheme,
	setTheme,
	getHasCompletedOnboarding,
	setHasCompletedOnboarding,
	getLastOpenedNoteId,
	setLastOpenedNoteId
} from './settings';
