// Pure clipboard-line parser for multi-line paste (spec 019, fix 5).
// Blank lines are dropped; bullets (- * •) and todos ([ ]/[x]) are recognised,
// everything else is text. Confirmed with Hernan 2026-07-11.

import { normalizeNewlines } from '$lib/copy/serialize';

const BULLET = /^\s*[-*•]\s+(.*)$/;
// Optional leading bullet marker so both "[ ] x" and "- [ ] x" (CopyNotes' own
// plain-text rendering) are read as todos. Checked before BULLET.
const TODO = /^\s*(?:[-*•]\s+)?\[( |x|X)\]\s+(.*)$/;

const STRONG_CODE_LINES = [
	/^\s*(?:const|let|var)\s+[$A-Z_a-z][$\w]*\s*(?::[^=]+)?=/,
	/^\s*(?:async\s+)?function\s+[$A-Z_a-z][$\w]*\s*\(/,
	/^\s*class\s+[$A-Z_a-z][$\w]*(?:\s+extends\s+[$A-Z_a-z][$\w]*)?\s*\{/,
	/^\s*(?:interface|enum)\s+[$A-Z_a-z][$\w]*\s*\{/,
	/^\s*type\s+[$A-Z_a-z][$\w]*\s*=/,
	/^\s*import\s+(?:["']|.+\s+from\s+["'])/,
	/^\s*export\s+(?:default\b|const\b|let\b|var\b|function\b|class\b|\{)/,
	/^\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/,
	/^\s*from\s+\S+\s+import\b/,
	/^\s*package\s+[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*;\s*$/,
	/^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\],?]+\s+\w+\s*[=(;{]/,
	/^\s*(?:func|fn)\s+\w+\s*\(/,
	/^\s*use\s+[\w:]+(?:::?[\w:*]+)+\s*;?\s*$/,
	/^\s*using\s+(?:[\w.]+\s*;|\w+\s*=)/,
	/^\s*namespace\s+[\w.]+\s*[;{]/,
	/^\s*(?:npm|pnpm|yarn|bun|npx|git|docker|curl|sudo|python|node)\b/,
	/^\s*<\/?[A-Za-z][^>]*>/,
	/^\s*(?:[.#][\w-]+|[A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)*)\s*\{\s*$/,
	/^\s*(?:[\w$.[\]'"-]+\.)*[\w$]+\([^)]*\)\s*;?\s*$/,
	/^\s*[A-Z_][A-Z0-9_]*=\S+\s*$/
];

const CODE_SYNTAX_LINES = [
	/(?:=>|===|!==|==|!=|\+=|-=|\*=|\/=|:=|::)/,
	/[;{}]\s*$/,
	/^\s*(?:if|else|for|while|switch|case|try|catch|finally|return|throw|await|yield)\b/,
	/^\s*[\w$.-]+\s*:\s*\S.*[,;]?\s*$/,
	/^\s*(?:(?:\/\/|\/\*|\*\/|<!--|-->)|#!)/
];

const SQL_CODE_LINES = [
	/^\s*select\s+(?:\*|.+(?:,|\bfrom\b))/i,
	/^\s*from\s+[\w."`\[\]-]+(?:\s+(?:as\s+)?\w+)?\s*;?\s*$/i,
	/^\s*where\s+.+(?:=|<>|>=|<=|\bin\s*\(|\blike\b)/i,
	/^\s*(?:insert\s+into|update\s+\S+\s+set|delete\s+from|create\s+(?:table|view|index)|alter\s+table|drop\s+(?:table|view|index)|with\s+\w+\s+as\s*\()/i
];

// Conservative automatic detection for external multi-line paste. It favours
// leaving uncertain content as normal text over turning prose or a list into a
// code block by surprise.
export function looksLikeCodePaste(text) {
	if (!text || !text.includes('\n')) return false;
	const normalized = normalizeNewlines(text);
	const lines = normalized.split('\n').filter((line) => line.trim() !== '');
	if (lines.length < 2) return false;

	const first = lines[0].trim();
	const last = lines[lines.length - 1].trim();
	if (/^```[\w+-]*$/.test(first) && last === '```') return true;

	const trimmed = normalized.trim();
	if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 2) {
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === 'object') return true;
		} catch {
			// Invalid JSON may still be another language; continue with the signals.
		}
	}

	const listLines = lines.filter((line) => TODO.test(line) || BULLET.test(line)).length;
	if (listLines >= Math.ceil(lines.length * 0.6)) return false;

	let strong = 0;
	let syntax = 0;
	let indented = 0;
	let yamlKeys = 0;
	let indentedYamlKeys = 0;
	let sql = 0;
	for (const line of lines) {
		if (/^(?:\t| {2,})/.test(line)) indented += 1;
		// Config-style keys only: lowercase and a single-token (or empty) value.
		// Everyday "Etiqueta: valor" notes use capitalised labels or spaced
		// values and must stay normal text.
		if (/^\s*[a-z0-9_.-]+\s*:\s*\S*$/.test(line)) {
			yamlKeys += 1;
			if (/^(?:\t| {2,})/.test(line)) indentedYamlKeys += 1;
		}
		if (SQL_CODE_LINES.some((pattern) => pattern.test(line))) sql += 1;
		if (STRONG_CODE_LINES.some((pattern) => pattern.test(line))) strong += 1;
		else if (CODE_SYNTAX_LINES.some((pattern) => pattern.test(line))) syntax += 1;
	}

	// Structured YAML/config needs repeated keys plus indentation; one label and
	// a couple of indented prose lines should remain normal text.
	if (yamlKeys >= 2 && indentedYamlKeys > 0) return true;
	if (sql >= 2 || (sql >= 1 && syntax >= 1 && indented > 0)) return true;

	let score = strong * 3 + syntax;
	if (indented > 0) score += 1;
	if (/[{[]/.test(normalized) && /[}\]]/.test(normalized)) score += 2;
	if ((normalized.match(/;/g) ?? []).length >= 2) score += 1;

	return strong >= 2 || (strong >= 1 && score >= 4);
}

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
