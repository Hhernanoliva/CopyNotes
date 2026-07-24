// The rule the connecting agent follows to decide whether a task needs redoing:
// unchecked + the last bitácora entry is a user instruction ("note") means the
// user rejected the result and wants it redone; a checked task is done and must
// be left alone (unless the user unchecks it again).
export function isRedoRequested(block, activity) {
	if (block.checked) return false;
	const last = activity.at(-1);
	return Boolean(last) && last.actor === 'user' && last.action === 'note';
}
