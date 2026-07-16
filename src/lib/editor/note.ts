// Double-Enter exit for the gray block note. Enter normally inserts a newline
// inside the note; when the caret already sits on an empty line (the previous
// keypress was Enter), the second Enter should leave the note instead. This
// pure helper makes that call: given the note text and the collapsed caret
// offset, it returns the note text with the empty line removed, or null when
// the Enter should stay a plain newline.
export function planNoteExit(text, start, end) {
	if (start !== end) return null;
	const lineStart = text.lastIndexOf('\n', start - 1) + 1;
	const nextBreak = text.indexOf('\n', start);
	const lineEnd = nextBreak === -1 ? text.length : nextBreak;
	if (text.slice(lineStart, lineEnd) !== '') return null;
	// Drop the empty line: remove the newline that precedes it (when there is
	// one) so "hola\n" becomes "hola" and "hola\n\nchau" becomes "hola\nchau".
	const before = lineStart > 0 ? text.slice(0, lineStart - 1) : '';
	const after = nextBreak === -1 ? '' : text.slice(lineEnd);
	// Trailing newlines carry no content — Chrome represents an Enter at the
	// end of a pre-wrap editable as "\n\n", which would otherwise survive.
	return { text: (before + after).replace(/\n+$/, '') };
}
