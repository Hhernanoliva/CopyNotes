// Pure clipboard-line parser for multi-line paste (spec 019, fix 5).
// Blank lines are dropped; bullets (- * •) and todos ([ ]/[x]) are recognised,
// everything else is text. Confirmed with Hernan 2026-07-11.

const BULLET = /^\s*[-*•]\s+(.*)$/;
// Optional leading bullet marker so both "[ ] x" and "- [ ] x" (CopyNotes' own
// plain-text rendering) are read as todos. Checked before BULLET.
const TODO = /^\s*(?:[-*•]\s+)?\[( |x|X)\]\s+(.*)$/;

export function parsePastedLines(text) {
	if (!text) return [];
	const out = [];
	for (const raw of text.split('\n')) {
		const line = raw.replace(/\r$/, '');
		if (line.trim() === '') continue;
		const todo = line.match(TODO);
		if (todo) {
			out.push({ type: 'todo', content: todo[2], checked: todo[1].toLowerCase() === 'x' });
			continue;
		}
		const bullet = line.match(BULLET);
		if (bullet) {
			out.push({ type: 'bullet', content: bullet[1] });
			continue;
		}
		out.push({ type: 'text', content: line });
	}
	return out;
}
