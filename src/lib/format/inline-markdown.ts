// Convert a block's stored inline HTML (the sanitized subset from sanitize.ts:
// strong/em/u/s/code/a/span/br plus escaped text) into Markdown inline syntax.
// Pure string parsing — no DOM — so the Markdown export stays testable in Node.
// Underline and color spans have no Markdown equivalent and unwrap to text.

const TAG = /<(\/?)(strong|em|u|s|code|a|span|br)((?:\s[^>]*)?)>/g;

function unescapeEntities(text) {
	// &amp; goes last so escaped entities like &amp;lt; come out as &lt; literal.
	return text
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&');
}

function parse(html) {
	const root = { tag: null, children: [] };
	const stack = [root];
	let last = 0;
	for (const match of html.matchAll(TAG)) {
		const [full, close, rawTag, attrs] = match;
		const tag = rawTag.toLowerCase();
		if (match.index > last) stack[stack.length - 1].children.push(html.slice(last, match.index));
		last = match.index + full.length;
		if (tag === 'br') {
			stack[stack.length - 1].children.push({ tag: 'br', children: [] });
		} else if (close) {
			for (let i = stack.length - 1; i > 0; i--) {
				if (stack[i].tag === tag) {
					stack.length = i;
					break;
				}
			}
		} else {
			const node = { tag, attrs, children: [] };
			stack[stack.length - 1].children.push(node);
			stack.push(node);
		}
	}
	if (last < html.length) stack[stack.length - 1].children.push(html.slice(last));
	return root;
}

const EMPHASIS = { strong: '**', em: '*', s: '~~' };

// Markdown emphasis breaks when the marker touches a space, so boundary
// whitespace moves outside the markers; whitespace-only content drops them.
function emphasis(marks, inner) {
	const core = inner.trim();
	if (!core) return inner;
	const lead = inner.match(/^\s*/)[0];
	const trail = inner.match(/\s*$/)[0];
	return lead + marks + core + marks + trail;
}

function codeSpan(inner) {
	const longest = Math.max(0, ...(inner.match(/`+/g) ?? []).map((run) => run.length));
	const fence = '`'.repeat(longest + 1);
	return longest ? `${fence} ${inner} ${fence}` : fence + inner + fence;
}

function link(attrs, inner) {
	const href = /href="([^"]*)"/.exec(attrs ?? '');
	const url = unescapeEntities(href?.[1] ?? '');
	if (!url) return inner;
	// Spaces or parens would end the Markdown URL early; angle brackets keep it whole.
	const safe = /[\s)]/.test(url) ? `<${url}>` : url;
	return `[${inner}](${safe})`;
}

function render(node) {
	return node.children
		.map((child) => {
			if (typeof child === 'string') return unescapeEntities(child);
			if (child.tag === 'br') return '\n';
			const inner = render(child);
			if (child.tag === 'u' || child.tag === 'span') return inner;
			if (child.tag === 'code') return codeSpan(inner);
			if (child.tag === 'a') return link(child.attrs, inner);
			return emphasis(EMPHASIS[child.tag], inner);
		})
		.join('');
}

export function htmlInlineToMarkdown(html) {
	if (!html) return '';
	return render(parse(html));
}
