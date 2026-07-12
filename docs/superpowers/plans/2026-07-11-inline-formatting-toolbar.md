# Inline Formatting & Floating Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating formatting toolbar to CopyNotes' block editor with headings (H1/H2/H3), bold, italic, underline, strikethrough, inline code, links, and a fixed text-color palette — persisted as a sanitized HTML subset per block.

**Architecture:** Keep the existing custom block editor. Unlock `contenteditable` (drop `plaintext-only`) for formatting-capable blocks; store each block's rendered content in a new `html` field, and keep the existing `content` field as a plain-text projection (derived via `textContent`) so copy-out, search, and export keep working. Formatting logic lives in a dedicated `src/lib/format/` engine (pure, testable); the toolbar and popovers are presentation only. Code blocks stay literal plain text.

**Tech Stack:** SvelteKit + Svelte 5 (runes), plain JavaScript inside `.ts`/`.svelte`, Dexie (IndexedDB), Vitest (jsdom unit), Playwright (e2e), Tailwind + shadcn-svelte tokens.

## Global Constraints

- No heavy editor engine (TipTap/Lexical/ProseMirror); no editor replacement. Extend the existing block editor only. (spec 020)
- Plain JavaScript style: no type annotations in hand-written code. (`CLAUDE.md`)
- Svelte 5 runes: `$derived` for derived values, `$effect` only for outside-world actions (DOM/subscriptions) with cleanup; never assign `$state` inside `$effect` to compute; never destructure `$state`. (`CLAUDE.md`)
- `$state.snapshot` before Dexie writes; structural changes persist immediately, content saves are debounced. (memory: svelte-state-proxy-indexeddb)
- Do not rename shadcn component tokens; add custom CSS vars following the `background/card/primary/...` convention. Colors via `--fmt-color-*` vars, no raw hex in components. (`CLAUDE.md`)
- Sanitizer allow-list only: `strong`, `em`, `u`, `s`, `code`, `a` (href normalized, `target="_blank"`, `rel="noopener noreferrer"`), `span` (only `class` from the color set), `br`. Normalize `b`→`strong`, `i`→`em`, `strike`→`s`. Everything else stripped to text. (spec 020)
- Code blocks stay `contenteditable="plaintext-only"` / literal; never unlock. (spec 020)
- Cross-block selection stays block-level; inline formatting is within a single block only. (specs 019, 020)
- Every user-visible change updates `docs/guia-de-uso.md` (plain Spanish, no jargon) in the same commit, with its "Última actualización" date bumped. (`CLAUDE.md`)
- Text color palette (6): `Por defecto`, `Ámbar` (accent), `Rojo`, `Verde`, `Azul`, `Gris tenue`. Theme-aware, readable contrast, active state never color-only.
- Unit tests: `src/**/*.test.ts` (jsdom). `execCommand`/Selection DOM commands are covered by Playwright e2e, not jsdom.
- Run unit tests with `npm test` (== `vitest --run`). Commit after each task.

---

## File Structure

**New (pure engine, unit-tested):**
- `src/lib/format/sanitize.ts` — `sanitizeHtml(dirty)`, `normalizeInline(html)`, `htmlToPlainText(html)`.
- `src/lib/format/url.ts` — `normalizeUrl(raw)`.
- `src/lib/format/active.ts` — `activeFormatsFor(node, root)` reading formats from a DOM ancestor chain.
- `src/lib/format/safety.ts` — `commandsForSelection({ blockType, spansBlocks })`.
- `src/lib/format/blocktype.ts` — `HEADING_TYPES`, `planBlockType(block, nextType)`.
- `src/lib/format/commands.ts` — DOM command wrappers (`applyInline`, `removeInline`, `applyColor`, `applyLink`, `removeLink`); e2e-covered.
- `src/lib/format/colors.ts` — `TEXT_COLORS` catalog (id, label, class).
- `src/lib/format/index.ts` — barrel re-exports.

**New (presentation):**
- `src/lib/editor/FloatingFormattingToolbar.svelte`
- `src/lib/editor/FormattingButton.svelte`
- `src/lib/editor/LinkEditorPopover.svelte`
- `src/lib/editor/TextColorPopover.svelte`

**Modified:**
- `src/lib/storage/db.ts` — Dexie version bump + upgrade.
- `src/lib/storage/blocks.ts` — `createBlock` default `html`.
- `src/lib/editor/BlockRow.svelte` — unlock non-code editable, render/save `html`.
- `src/lib/editor/Editor.svelte` — selection tracking, toolbar mount, save `html`+`content`, headings.
- `src/lib/editor/slash.ts` — `/h1 /h2 /h3` commands.
- `src/app.css` — `--fmt-color-*` tokens + heading/inline-code/link styles.
- `docs/guia-de-uso.md` — user-facing docs.
- `e2e/` — new Playwright spec.

---

## Task 1: Storage — `html` field + migration

**Files:**
- Modify: `src/lib/storage/db.ts`
- Modify: `src/lib/storage/blocks.ts`
- Test: `src/lib/storage/blocks.test.ts` (add cases)

**Interfaces:**
- Produces: blocks now carry `html` (string). `createBlock` accepts optional `html`; defaults to `content` when omitted. Existing rows upgrade so `html` mirrors `content`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/storage/blocks.test.ts`)

```js
import { createBlock, getBlock } from './blocks';

test('createBlock defaults html to its plain content', async () => {
	const block = await createBlock({ noteId: 'n1', content: 'hola' });
	const saved = await getBlock(block.id);
	expect(saved.html).toBe('hola');
});

test('createBlock keeps an explicit html value', async () => {
	const block = await createBlock({ noteId: 'n1', content: 'hola', html: '<strong>hola</strong>' });
	const saved = await getBlock(block.id);
	expect(saved.html).toBe('<strong>hola</strong>');
	expect(saved.content).toBe('hola');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/storage/blocks.test.ts`
Expected: FAIL (`saved.html` is `undefined`).

- [ ] **Step 3: Add the `html` default in `createBlock`**

In `src/lib/storage/blocks.ts`, add `html` to the destructured fields and the row:

```js
	const {
		noteId,
		parentBlockId = null,
		type = 'text',
		content = '',
		html,
		collapsed = false,
		checked = false,
		note = ''
	} = fields;
```

and in the `block` object literal add:

```js
		content,
		html: html ?? content,
```

- [ ] **Step 4: Bump the Dexie schema with an upgrade** (`src/lib/storage/db.ts`)

After the existing `db.version(1).stores({...})` block, add:

```js
db.version(2)
	.stores({
		notes: 'id, updatedAt',
		blocks: 'id, noteId, parentBlockId'
	})
	.upgrade(async (tx) => {
		await tx
			.table('blocks')
			.toCollection()
			.modify((block) => {
				if (block.html === undefined) block.html = block.content ?? '';
			});
	});
```

(The `stores` schema is unchanged — `html` is not indexed — but Dexie requires the version bump to run the `upgrade`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/storage/blocks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/blocks.ts src/lib/storage/blocks.test.ts
git commit -m "feat(storage): add html field to blocks with dexie v2 migration"
```

---

## Task 2: Sanitizer + plain-text projection

**Files:**
- Create: `src/lib/format/sanitize.ts`
- Test: `src/lib/format/sanitize.test.ts`

**Interfaces:**
- Produces:
  - `sanitizeHtml(dirty)` → string. Keeps only the allow-list; strips everything else to its text; normalizes `b→strong`, `i→em`, `strike→s`; forces `a` to `target="_blank" rel="noopener noreferrer"` and normalizes its `href` via `normalizeUrl` (Task 3); allows `span` only with a `class` that starts with `fmt-color-`.
  - `htmlToPlainText(html)` → string (the `textContent`).

- [ ] **Step 1: Write the failing test** (`src/lib/format/sanitize.test.ts`)

```js
import { describe, test, expect } from 'vitest';
import { sanitizeHtml, htmlToPlainText } from './sanitize';

describe('sanitizeHtml', () => {
	test('keeps allowed inline tags', () => {
		expect(sanitizeHtml('<strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code>'))
			.toBe('<strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code>');
	});

	test('normalizes legacy tags', () => {
		expect(sanitizeHtml('<b>a</b><i>b</i><strike>c</strike>'))
			.toBe('<strong>a</strong><em>b</em><s>c</s>');
	});

	test('strips disallowed tags to their text', () => {
		expect(sanitizeHtml('<div onclick="x">a<script>evil()<\/script></div>')).toBe('aevil()');
	});

	test('removes disallowed attributes but keeps the tag', () => {
		expect(sanitizeHtml('<strong style="color:red" onclick="x">a</strong>'))
			.toBe('<strong>a</strong>');
	});

	test('keeps a color span only with an fmt-color class', () => {
		expect(sanitizeHtml('<span class="fmt-color-red">a</span>'))
			.toBe('<span class="fmt-color-red">a</span>');
		expect(sanitizeHtml('<span class="evil">a</span>')).toBe('a');
	});

	test('normalizes links and forces safe target/rel', () => {
		expect(sanitizeHtml('<a href="example.com">x</a>'))
			.toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>');
	});

	test('drops javascript: urls', () => {
		expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('x');
	});
});

describe('htmlToPlainText', () => {
	test('returns textContent', () => {
		expect(htmlToPlainText('<strong>a</strong> b')).toBe('a b');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/sanitize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/sanitize.ts`**

```js
import { normalizeUrl } from './url';

// Tag rename map for legacy → canonical.
const RENAME = { b: 'strong', i: 'em', strike: 's' };
// Tags kept as-is (canonical names).
const ALLOWED = new Set(['strong', 'em', 'u', 's', 'code', 'a', 'span', 'br']);
const COLOR_PREFIX = 'fmt-color-';

// Sanitize a dirty HTML string down to CopyNotes' inline subset. Anything not
// on the allow-list is unwrapped to its text content. Runs in the browser and
// in jsdom (both provide DOMParser).
export function sanitizeHtml(dirty) {
	const doc = new DOMParser().parseFromString(`<body>${dirty ?? ''}</body>`, 'text/html');
	const clean = document.createDocumentFragment();
	for (const node of Array.from(doc.body.childNodes)) {
		appendClean(node, clean);
	}
	const holder = document.createElement('div');
	holder.appendChild(clean);
	return holder.innerHTML;
}

function appendClean(node, target) {
	if (node.nodeType === Node.TEXT_NODE) {
		target.appendChild(document.createTextNode(node.textContent));
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	const raw = node.tagName.toLowerCase();
	const tag = RENAME[raw] ?? raw;

	if (!ALLOWED.has(tag)) {
		// Unwrap: keep the children, drop the element.
		for (const child of Array.from(node.childNodes)) appendClean(child, target);
		return;
	}

	if (tag === 'br') {
		target.appendChild(document.createElement('br'));
		return;
	}

	const el = document.createElement(tag);

	if (tag === 'a') {
		const href = normalizeUrl(node.getAttribute('href'));
		if (!href) {
			// Invalid/unsafe link: keep the text, drop the anchor.
			for (const child of Array.from(node.childNodes)) appendClean(child, target);
			return;
		}
		el.setAttribute('href', href);
		el.setAttribute('target', '_blank');
		el.setAttribute('rel', 'noopener noreferrer');
	} else if (tag === 'span') {
		const cls = node.getAttribute('class') ?? '';
		const color = cls.split(/\s+/).find((c) => c.startsWith(COLOR_PREFIX));
		if (!color) {
			for (const child of Array.from(node.childNodes)) appendClean(child, target);
			return;
		}
		el.setAttribute('class', color);
	}

	for (const child of Array.from(node.childNodes)) appendClean(child, el);
	target.appendChild(el);
}

export function htmlToPlainText(html) {
	const holder = document.createElement('div');
	holder.innerHTML = html ?? '';
	return holder.textContent ?? '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/format/sanitize.test.ts`
Expected: PASS. (Depends on Task 3's `url.ts` — implement Task 3 first if the import fails; the two tasks may be committed together.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/sanitize.ts src/lib/format/sanitize.test.ts
git commit -m "feat(format): sanitize html subset + plain-text projection"
```

---

## Task 3: URL normalization

**Files:**
- Create: `src/lib/format/url.ts`
- Test: `src/lib/format/url.test.ts`

**Interfaces:**
- Produces: `normalizeUrl(raw)` → a valid `http(s)`/`mailto` URL string, or `''` when the input is empty/unsafe. Adds `https://` when no scheme is present.

- [ ] **Step 1: Write the failing test** (`src/lib/format/url.test.ts`)

```js
import { test, expect } from 'vitest';
import { normalizeUrl } from './url';

test('adds https:// when scheme missing', () => {
	expect(normalizeUrl('example.com')).toBe('https://example.com/');
	expect(normalizeUrl('example.com/path')).toBe('https://example.com/path');
});

test('keeps an existing http/https scheme', () => {
	expect(normalizeUrl('http://a.com/')).toBe('http://a.com/');
	expect(normalizeUrl('https://a.com/')).toBe('https://a.com/');
});

test('allows mailto', () => {
	expect(normalizeUrl('mailto:x@y.com')).toBe('mailto:x@y.com');
});

test('rejects unsafe or empty', () => {
	expect(normalizeUrl('javascript:alert(1)')).toBe('');
	expect(normalizeUrl('  ')).toBe('');
	expect(normalizeUrl(null)).toBe('');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/url.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/url.ts`**

```js
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

// Normalize a user-entered URL. Adds https:// when no scheme is given; returns
// '' for empty or unsafe (e.g. javascript:) input.
export function normalizeUrl(raw) {
	const value = (raw ?? '').trim();
	if (!value) return '';
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
	try {
		const url = new URL(withScheme);
		if (!SAFE_SCHEMES.has(url.protocol)) return '';
		return url.href;
	} catch {
		return '';
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/format/url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/url.ts src/lib/format/url.test.ts
git commit -m "feat(format): url normalization"
```

---

## Task 4: Active-format detection

**Files:**
- Create: `src/lib/format/active.ts`
- Test: `src/lib/format/active.test.ts`

**Interfaces:**
- Produces: `activeFormatsFor(node, root)` → an object `{ bold, italic, underline, strike, code, link, color }` where booleans mean "an ancestor between `node` and `root` provides this format", and `color` is the `fmt-color-*` class string or `null`. Walks ancestors up to (excluding) `root`.

- [ ] **Step 1: Write the failing test** (`src/lib/format/active.test.ts`)

```js
import { test, expect } from 'vitest';
import { activeFormatsFor } from './active';

function build(html) {
	const root = document.createElement('div');
	root.innerHTML = html;
	return root;
}

test('detects nested bold + italic at a text node', () => {
	const root = build('<strong><em>hi</em></strong>');
	const textNode = root.querySelector('em').firstChild;
	const active = activeFormatsFor(textNode, root);
	expect(active.bold).toBe(true);
	expect(active.italic).toBe(true);
	expect(active.underline).toBe(false);
});

test('detects code, link and color', () => {
	const root = build('<code>a</code><a href="https://x.com">b</a><span class="fmt-color-red">c</span>');
	expect(activeFormatsFor(root.querySelector('code').firstChild, root).code).toBe(true);
	expect(activeFormatsFor(root.querySelector('a').firstChild, root).link).toBe(true);
	expect(activeFormatsFor(root.querySelector('span').firstChild, root).color).toBe('fmt-color-red');
});

test('plain text has no active formats', () => {
	const root = build('plain');
	const active = activeFormatsFor(root.firstChild, root);
	expect(active).toEqual({ bold: false, italic: false, underline: false, strike: false, code: false, link: false, color: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/active.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/active.ts`**

```js
const TAG_FLAG = { strong: 'bold', em: 'italic', u: 'underline', s: 'strike', code: 'code', a: 'link' };

// Read which inline formats wrap `node`, walking ancestors up to (not
// including) `root`. Pure DOM reading — no execCommand — so it works the same
// in every browser and in jsdom tests.
export function activeFormatsFor(node, root) {
	const active = {
		bold: false, italic: false, underline: false, strike: false,
		code: false, link: false, color: null
	};
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el !== root) {
		const tag = el.tagName?.toLowerCase();
		const flag = TAG_FLAG[tag];
		if (flag) active[flag] = true;
		if (tag === 'span' && el.className) {
			const color = el.className.split(/\s+/).find((c) => c.startsWith('fmt-color-'));
			if (color && !active.color) active.color = color;
		}
		el = el.parentNode;
	}
	return active;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/format/active.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/active.ts src/lib/format/active.test.ts
git commit -m "feat(format): active-format detection from DOM ancestors"
```

---

## Task 5: Multi-block selection safety

**Files:**
- Create: `src/lib/format/safety.ts`
- Test: `src/lib/format/safety.test.ts`

**Interfaces:**
- Produces: `commandsForSelection({ blockType, spansBlocks })` → `{ inline, blockType, link, color }` of booleans meaning "enabled". Rules: everything disabled inside `code` and `separator`; when `spansBlocks` is true, only `inline` (bold/italic/underline/strike) is unaffected? No — spec says disable block-type and inline code across blocks. So across blocks: `blockType=false`, and inline-code specifically is unsafe. Represent inline-code separately.

- [ ] **Step 1: Write the failing test** (`src/lib/format/safety.test.ts`)

```js
import { test, expect } from 'vitest';
import { commandsForSelection } from './safety';

test('single text block: everything enabled', () => {
	expect(commandsForSelection({ blockType: 'text', spansBlocks: false }))
		.toEqual({ inline: true, inlineCode: true, blockType: true, link: true, color: true });
});

test('code block: everything disabled', () => {
	expect(commandsForSelection({ blockType: 'code', spansBlocks: false }))
		.toEqual({ inline: false, inlineCode: false, blockType: false, link: false, color: false });
});

test('multi-block: block-type and inline code disabled, others on', () => {
	expect(commandsForSelection({ blockType: 'text', spansBlocks: true }))
		.toEqual({ inline: true, inlineCode: false, blockType: false, link: true, color: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/safety.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/safety.ts`**

```js
// Which toolbar commands are safe for the current selection. Code/separator
// blocks accept no formatting; a selection spanning multiple blocks disables
// block-type changes and inline code (they can produce inconsistent structure),
// while character-level marks stay available.
export function commandsForSelection({ blockType, spansBlocks }) {
	if (blockType === 'code' || blockType === 'separator') {
		return { inline: false, inlineCode: false, blockType: false, link: false, color: false };
	}
	return {
		inline: true,
		inlineCode: !spansBlocks,
		blockType: !spansBlocks,
		link: true,
		color: true
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/format/safety.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/safety.ts src/lib/format/safety.test.ts
git commit -m "feat(format): multi-block selection safety rules"
```

---

## Task 6: Heading block types + slash commands

**Files:**
- Create: `src/lib/format/blocktype.ts`
- Test: `src/lib/format/blocktype.test.ts`
- Modify: `src/lib/editor/slash.ts`
- Test: `src/lib/editor/slash.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `HEADING_TYPES = ['heading1', 'heading2', 'heading3']`.
  - `planBlockType(block, nextType)` → `{ type, checked }` changes for `updateBlock`. Converting to a heading forces `checked: false`; converting to `text` from a heading keeps content. Never creates a block.

- [ ] **Step 1: Write the failing test** (`src/lib/format/blocktype.test.ts`)

```js
import { test, expect } from 'vitest';
import { planBlockType, HEADING_TYPES } from './blocktype';

test('to heading strips checked', () => {
	expect(planBlockType({ type: 'todo', checked: true }, 'heading2'))
		.toEqual({ type: 'heading2', checked: false });
});

test('heading back to normal text', () => {
	expect(planBlockType({ type: 'heading1', checked: false }, 'text'))
		.toEqual({ type: 'text', checked: false });
});

test('HEADING_TYPES has three levels', () => {
	expect(HEADING_TYPES).toEqual(['heading1', 'heading2', 'heading3']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/blocktype.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/blocktype.ts`**

```js
export const HEADING_TYPES = ['heading1', 'heading2', 'heading3'];

// Compute the field changes to convert `block` to `nextType` in place. Headings
// carry no check state. This never creates or removes a block.
export function planBlockType(block, nextType) {
	const changes = { type: nextType };
	if (HEADING_TYPES.includes(nextType)) changes.checked = false;
	else changes.checked = block.checked ?? false;
	return changes;
}
```

- [ ] **Step 4: Add slash commands** (`src/lib/editor/slash.ts`, extend `SLASH_COMMANDS`)

Add these three entries after the `text` entry:

```js
	{ id: 'heading1', label: 'Título 1', keywords: ['h1', 'titulo', 'título', 'heading', 'encabezado'] },
	{ id: 'heading2', label: 'Título 2', keywords: ['h2', 'titulo', 'título', 'heading', 'subtitulo'] },
	{ id: 'heading3', label: 'Título 3', keywords: ['h3', 'titulo', 'título', 'heading'] },
```

- [ ] **Step 5: Add slash test** (append to `src/lib/editor/slash.test.ts`)

```js
test('filters headings by h2', () => {
	const ids = filterCommands('h2').map((c) => c.id);
	expect(ids).toContain('heading2');
});
```

(Import `filterCommands` if not already imported in that file.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/format/blocktype.test.ts src/lib/editor/slash.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format/blocktype.ts src/lib/format/blocktype.test.ts src/lib/editor/slash.ts src/lib/editor/slash.test.ts
git commit -m "feat(format): heading block types + slash commands"
```

---

## Task 7: Color catalog + engine barrel + CSS tokens

**Files:**
- Create: `src/lib/format/colors.ts`
- Create: `src/lib/format/index.ts`
- Test: `src/lib/format/colors.test.ts`
- Modify: `src/app.css`

**Interfaces:**
- Produces: `TEXT_COLORS` = array of `{ id, label, className }`, first entry `{ id: 'default', label: 'Por defecto', className: null }`. `index.ts` re-exports every engine symbol.

- [ ] **Step 1: Write the failing test** (`src/lib/format/colors.test.ts`)

```js
import { test, expect } from 'vitest';
import { TEXT_COLORS } from './colors';

test('has six colors, default first with null class', () => {
	expect(TEXT_COLORS).toHaveLength(6);
	expect(TEXT_COLORS[0]).toEqual({ id: 'default', label: 'Por defecto', className: null });
	expect(TEXT_COLORS.map((c) => c.id)).toEqual(['default', 'amber', 'red', 'green', 'blue', 'gray']);
});

test('non-default colors use fmt-color-* classes', () => {
	for (const color of TEXT_COLORS.slice(1)) {
		expect(color.className).toBe(`fmt-color-${color.id}`);
	}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/format/colors.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/format/colors.ts`**

```js
// Fixed text-color palette (Quiet Ink). No free color picker. Each maps to a
// theme-aware CSS variable defined in app.css. `default` removes any color.
export const TEXT_COLORS = [
	{ id: 'default', label: 'Por defecto', className: null },
	{ id: 'amber', label: 'Ámbar', className: 'fmt-color-amber' },
	{ id: 'red', label: 'Rojo', className: 'fmt-color-red' },
	{ id: 'green', label: 'Verde', className: 'fmt-color-green' },
	{ id: 'blue', label: 'Azul', className: 'fmt-color-blue' },
	{ id: 'gray', label: 'Gris tenue', className: 'fmt-color-gray' }
];
```

- [ ] **Step 4: Create the barrel `src/lib/format/index.ts`**

```js
export { sanitizeHtml, htmlToPlainText } from './sanitize';
export { normalizeUrl } from './url';
export { activeFormatsFor } from './active';
export { commandsForSelection } from './safety';
export { HEADING_TYPES, planBlockType } from './blocktype';
export { TEXT_COLORS } from './colors';
export { applyInline, removeInline, applyColor, applyLink, removeLink } from './commands';
```

- [ ] **Step 5: Add CSS tokens** (`src/app.css`)

In the `:root` (light) block, alongside the other custom vars (near `--text-faint`), add:

```css
	--fmt-color-amber: oklch(0.56 0.12 70);
	--fmt-color-red: oklch(0.55 0.19 27);
	--fmt-color-green: oklch(0.5 0.13 150);
	--fmt-color-blue: oklch(0.52 0.13 250);
	--fmt-color-gray: oklch(0.6 0.01 80);
```

In the dark block (`.dark` / `[data-theme='dark']`, matching the existing pattern), add lighter variants:

```css
	--fmt-color-amber: oklch(0.76 0.11 75);
	--fmt-color-red: oklch(0.7 0.17 27);
	--fmt-color-green: oklch(0.72 0.13 150);
	--fmt-color-blue: oklch(0.72 0.12 250);
	--fmt-color-gray: oklch(0.72 0.01 80);
```

Then, in the global layer, add the utility + inline-code + link + heading styles:

```css
	.fmt-color-amber { color: var(--fmt-color-amber); }
	.fmt-color-red { color: var(--fmt-color-red); }
	.fmt-color-green { color: var(--fmt-color-green); }
	.fmt-color-blue { color: var(--fmt-color-blue); }
	.fmt-color-gray { color: var(--fmt-color-gray); }

	.block-editable code {
		background: var(--muted);
		border-radius: 0.25rem;
		padding: 0.05em 0.3em;
		font-size: 0.9em;
		font-family: ui-monospace, monospace;
	}
	.block-editable a {
		color: var(--fmt-color-blue);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.block-editable--h1 { font-size: 1.5rem; font-weight: 700; line-height: 1.25; }
	.block-editable--h2 { font-size: 1.25rem; font-weight: 700; line-height: 1.3; }
	.block-editable--h3 { font-size: 1.1rem; font-weight: 600; line-height: 1.35; }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/format/colors.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/format/colors.ts src/lib/format/colors.test.ts src/lib/format/index.ts src/app.css
git commit -m "feat(format): color catalog, engine barrel, css tokens"
```

---

## Task 8: DOM formatting commands

**Files:**
- Create: `src/lib/format/commands.ts`

**Interfaces:**
- Consumes: `normalizeUrl` (Task 3).
- Produces (all operate on the current window selection, which must be inside the editable element):
  - `applyInline(kind)` — `kind` in `bold|italic|underline|strikethrough`; toggles via `document.execCommand`.
  - `removeInline(kind)` — same command toggles off when active (execCommand is a toggle).
  - `applyColor(className)` — wrap the selection in `<span class>`; `null`/`default` unwraps color spans in range.
  - `applyLink(rawUrl)` — wrap selection in `<a>` (normalized href); returns `true` on success, `false` when the URL is invalid.
  - `removeLink()` — unwrap the anchor at the selection.

*(No unit test — execCommand/Selection are not implemented in jsdom. Behavior is covered by Playwright in Task 16.)*

- [ ] **Step 1: Implement `src/lib/format/commands.ts`**

```js
import { normalizeUrl } from './url';

const EXEC = { bold: 'bold', italic: 'italic', underline: 'underline', strikethrough: 'strikeThrough' };

// Toggle a basic inline mark on the current selection. execCommand is a toggle,
// so apply/remove share one path; the toolbar reads active state separately.
export function applyInline(kind) {
	const command = EXEC[kind];
	if (command) document.execCommand(command, false);
}

export function removeInline(kind) {
	applyInline(kind);
}

// Toggle inline code by wrapping/unwrapping the selection in a <code> element.
export function toggleCode() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
	const range = sel.getRangeAt(0);
	const existing = ancestorTag(range.commonAncestorContainer, 'code');
	if (existing) {
		unwrap(existing);
		return;
	}
	const code = document.createElement('code');
	code.appendChild(range.extractContents());
	range.insertNode(code);
	selectNode(code);
}

// Apply or clear a color span. Passing null removes any color span in range.
export function applyColor(className) {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
	const range = sel.getRangeAt(0);
	const existing = ancestorSpanColor(range.commonAncestorContainer);
	if (existing) unwrap(existing);
	if (!className) return;
	const span = document.createElement('span');
	span.className = className;
	span.appendChild(range.extractContents());
	range.insertNode(span);
	selectNode(span);
}

// Wrap the selection in an anchor. Returns false when the URL is invalid.
export function applyLink(rawUrl) {
	const href = normalizeUrl(rawUrl);
	if (!href) return false;
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
	const range = sel.getRangeAt(0);
	const existing = ancestorTag(range.commonAncestorContainer, 'a');
	if (existing) {
		existing.setAttribute('href', href);
		existing.setAttribute('target', '_blank');
		existing.setAttribute('rel', 'noopener noreferrer');
		return true;
	}
	const a = document.createElement('a');
	a.setAttribute('href', href);
	a.setAttribute('target', '_blank');
	a.setAttribute('rel', 'noopener noreferrer');
	a.appendChild(range.extractContents());
	range.insertNode(a);
	selectNode(a);
	return true;
}

export function removeLink() {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return;
	const anchor = ancestorTag(sel.getRangeAt(0).commonAncestorContainer, 'a');
	if (anchor) unwrap(anchor);
}

// --- helpers ---
function ancestorTag(node, tag) {
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el.classList !== undefined && !el.classList.contains('block-editable')) {
		if (el.tagName?.toLowerCase() === tag) return el;
		el = el.parentNode;
	}
	return null;
}

function ancestorSpanColor(node) {
	let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentNode;
	while (el && el.classList !== undefined && !el.classList.contains('block-editable')) {
		if (el.tagName?.toLowerCase() === 'span' &&
			[...el.classList].some((c) => c.startsWith('fmt-color-'))) return el;
		el = el.parentNode;
	}
	return null;
}

function unwrap(el) {
	const parent = el.parentNode;
	while (el.firstChild) parent.insertBefore(el.firstChild, el);
	parent.removeChild(el);
}

function selectNode(node) {
	const sel = window.getSelection();
	const range = document.createRange();
	range.selectNodeContents(node);
	sel.removeAllRanges();
	sel.addRange(range);
}
```

- [ ] **Step 2: Add `toggleCode` to the barrel** (`src/lib/format/index.ts`)

Update the commands export line:

```js
export { applyInline, removeInline, toggleCode, applyColor, applyLink, removeLink } from './commands';
```

- [ ] **Step 3: Verify it type-checks / builds**

Run: `npm run check`
Expected: no new errors from `src/lib/format/`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format/commands.ts src/lib/format/index.ts
git commit -m "feat(format): DOM inline/color/link/code commands"
```

---

## Task 9: BlockRow — unlock editable, render & save html

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte`

**Interfaces:**
- Consumes: `sanitizeHtml`, `htmlToPlainText` (Task 2); `HEADING_TYPES` (Task 6).
- Produces: `onInput(block, { html, content })` — the callback signature changes from `(block, text)` to `(block, payload)`. Editor's handler updates accordingly in Task 10.

- [ ] **Step 1: Import the engine + define formatting-capable check**

At the top `<script>` of `BlockRow.svelte`, add:

```js
	import { sanitizeHtml, htmlToPlainText } from '$lib/format';
	import { HEADING_TYPES } from '$lib/format';
```

Add a derived flag (headings/text/bullet/todo are rich; code/separator are not):

```js
	const isRich = $derived(block.type !== 'code' && block.type !== 'separator');
```

- [ ] **Step 2: Render html instead of plain text**

Replace the content-sync effect (currently `el.textContent = block.content`) with an html-aware version:

```js
	$effect(() => {
		if (!el || block.type === 'separator') return;
		if (isRich) {
			if (el.innerHTML !== (block.html ?? '')) el.innerHTML = block.html ?? '';
		} else if (el.textContent !== block.content) {
			el.textContent = block.content;
		}
	});
```

- [ ] **Step 3: Switch the editable mode by block type**

In the editable `<div bind:this={el} ...>`, make `contenteditable` conditional and add the heading style class:

```svelte
			contenteditable={isRich ? 'true' : 'plaintext-only'}
```

and in its `class={...}`, append the heading modifier:

```svelte
			{block.type === 'heading1' ? 'block-editable--h1' : ''} {block.type === 'heading2' ? 'block-editable--h2' : ''} {block.type === 'heading3' ? 'block-editable--h3' : ''}
```

- [ ] **Step 4: Save html + derived plain text on input**

Replace `handleInput`:

```js
	function handleInput() {
		if (isRich) {
			const html = sanitizeHtml(el.innerHTML);
			onInput(block, { html, content: htmlToPlainText(html) });
		} else {
			onInput(block, { html: el.textContent, content: el.textContent });
		}
	}
```

- [ ] **Step 5: Verify it builds**

Run: `npm run check`
Expected: no new errors. (Editor still passes the old `onInput`; Task 10 updates it — expect the app to misbehave until then, which is fine for this checkpoint.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/BlockRow.svelte
git commit -m "feat(editor): render and save block html in BlockRow"
```

---

## Task 10: Editor — save html+content, headings via engine

**Files:**
- Modify: `src/lib/editor/Editor.svelte`

**Interfaces:**
- Consumes: `BlockRow`'s new `onInput(block, { html, content })`; `sanitizeHtml`, `htmlToPlainText`, `planBlockType`, `HEADING_TYPES` (Tasks 2, 6).
- Produces: `setBlockType(block, nextType)` used by the toolbar (Task 14) and slash menu.

- [ ] **Step 1: Import engine helpers**

Top of `Editor.svelte` `<script>`:

```js
	import { sanitizeHtml, htmlToPlainText, planBlockType, HEADING_TYPES } from '$lib/format';
```

- [ ] **Step 2: Update `handleBlockInput` to accept the payload and persist both fields**

Change the signature and the final save branch. Replace the tail of `handleBlockInput`:

```js
	function handleBlockInput(block, payload) {
		const text = payload.content;
		const html = payload.html;
		recordTextSnapshot(block.id);
		// slash + trigger detection stays keyed off plain text (unchanged block above)
		// ... existing slash/trigger code, using `text` ...
		block.content = text;
		block.html = html;
		scheduleSave(`block:${block.id}`, () => updateBlock(block.id, { content: text, html }));
	}
```

(Keep the existing slash-menu and trigger detection code between `recordTextSnapshot` and the final save; only the parameter name, the two `block.html` lines, and the save payload change. Bullet/tag trigger branches also set `block.html = trigger.content` and include `html` in their `updateBlock` calls.)

- [ ] **Step 3: Add `setBlockType`**

Add near the other block mutators:

```js
	async function setBlockType(block, nextType) {
		const changes = planBlockType(block, nextType);
		Object.assign(block, changes);
		await updateBlock(block.id, changes);
	}
```

- [ ] **Step 4: Route heading slash commands through `setBlockType`**

Where slash-command selection maps an id to an action, add heading handling (headings are a type change, not an insert):

```js
		if (HEADING_TYPES.includes(command.id)) {
			// Strip the "/query" text, then convert the type.
			block.content = '';
			block.html = '';
			await updateBlock(block.id, { content: '', html: '' });
			await setBlockType(block, command.id);
			slash = null;
			return;
		}
```

(Place this at the start of the slash-select handler, before the existing `text/bullet/todo/code/separator` handling.)

- [ ] **Step 5: Pass `setBlockType` to children as needed / verify app runs**

Run: `npm run dev` and manually confirm: typing saves; `/h2` converts a line to a heading without creating a new block; reload keeps the heading and any text.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/Editor.svelte
git commit -m "feat(editor): persist html+content, headings via engine"
```

---

## Task 11: FormattingButton component

**Files:**
- Create: `src/lib/editor/FormattingButton.svelte`

**Interfaces:**
- Produces: props `{ label, shortcut, active = false, disabled = false, onActivate, children }`. Renders a button with `aria-pressed={active}`, `aria-label={label}`, tooltip (`label` + `shortcut`), `mousedown` preventDefault (preserve selection), non-color-only active style.

- [ ] **Step 1: Implement the component**

```svelte
<script>
	import { tooltip } from '$lib/actions/tooltip';
	let { label, shortcut = '', active = false, disabled = false, onActivate, children } = $props();
	const tip = $derived(shortcut ? `${label} · ${shortcut}` : label);
</script>

<button
	type="button"
	aria-label={label}
	aria-pressed={active}
	{disabled}
	use:tooltip={tip}
	onmousedown={(e) => e.preventDefault()}
	onclick={onActivate}
	class="flex size-8 items-center justify-center rounded-md text-sm transition-colors
		disabled:pointer-events-none disabled:opacity-40
		{active
			? 'bg-primary/20 text-primary font-semibold underline underline-offset-2'
			: 'text-popover-foreground hover:bg-accent'}
		focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
>
	{@render children()}
</button>
```

- [ ] **Step 2: Verify it builds**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor/FormattingButton.svelte
git commit -m "feat(editor): FormattingButton with active/disabled states"
```

---

## Task 12: LinkEditorPopover + TextColorPopover

**Files:**
- Create: `src/lib/editor/LinkEditorPopover.svelte`
- Create: `src/lib/editor/TextColorPopover.svelte`

**Interfaces:**
- `LinkEditorPopover` props: `{ initialUrl = '', onSave, onRemove, onClose }`. Enter or "Guardar" calls `onSave(url)`; "Quitar" calls `onRemove`; Escape calls `onClose`.
- `TextColorPopover` props: `{ current = null, onPick, onClose }`. Renders `TEXT_COLORS`; picking calls `onPick(className)` (null for default); Escape closes.

- [ ] **Step 1: Implement `LinkEditorPopover.svelte`**

```svelte
<script>
	let { initialUrl = '', onSave, onRemove, onClose } = $props();
	let url = $state(initialUrl);
	let input = $state();
	$effect(() => { input?.focus(); });
	function submit() { onSave(url); }
	function keydown(e) {
		if (e.key === 'Enter') { e.preventDefault(); submit(); }
		if (e.key === 'Escape') { e.preventDefault(); onClose(); }
	}
</script>

<div class="bg-popover border-border flex items-center gap-1 rounded-md border p-1 shadow-lg" role="dialog" aria-label="Editar enlace">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		bind:this={input}
		bind:value={url}
		onkeydown={keydown}
		onmousedown={(e) => e.stopPropagation()}
		placeholder="Pegá o escribí una URL"
		aria-label="URL del enlace"
		class="bg-background text-foreground h-8 w-56 rounded-sm px-2 text-sm outline-none"
	/>
	<button type="button" onmousedown={(e) => e.preventDefault()} onclick={submit} class="text-primary h-8 rounded-sm px-2 text-sm">Guardar</button>
	{#if initialUrl}
		<button type="button" onmousedown={(e) => e.preventDefault()} onclick={onRemove} class="text-destructive h-8 rounded-sm px-2 text-sm">Quitar</button>
	{/if}
</div>
```

- [ ] **Step 2: Implement `TextColorPopover.svelte`**

```svelte
<script>
	import { TEXT_COLORS } from '$lib/format';
	let { current = null, onPick, onClose } = $props();
	function keydown(e) { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="bg-popover border-border flex gap-1 rounded-md border p-1 shadow-lg" role="menu" aria-label="Color de texto" onkeydown={keydown}>
	{#each TEXT_COLORS as color}
		<button
			type="button"
			role="menuitemradio"
			aria-checked={current === color.className}
			aria-label={color.label}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => onPick(color.className)}
			class="flex size-7 items-center justify-center rounded-sm border {current === color.className ? 'border-foreground' : 'border-border'}"
		>
			<span class="text-base leading-none {color.className ?? ''}">{color.id === 'default' ? '⦸' : 'A'}</span>
		</button>
	{/each}
</div>
```

- [ ] **Step 3: Verify it builds**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editor/LinkEditorPopover.svelte src/lib/editor/TextColorPopover.svelte
git commit -m "feat(editor): link + color popovers"
```

---

## Task 13: FloatingFormattingToolbar component

**Files:**
- Create: `src/lib/editor/FloatingFormattingToolbar.svelte`

**Interfaces:**
- Consumes: `FormattingButton`, `LinkEditorPopover`, `TextColorPopover`, engine commands.
- Props: `{ rect, active, enabled, currentColor, currentLinkUrl, onCommand, onClose }` where `rect` is the selection's bounding rect (or null → hidden), `active` is the format object from `activeFormatsFor`, `enabled` is the object from `commandsForSelection`, `onCommand(name, arg)` dispatches to the Editor.
- Produces: fires `onCommand('h1'|'h2'|'h3'|'normal'|'bold'|'italic'|'underline'|'strike'|'code'|'link'|'removeLink'|'color'|'clear'|'copyText', arg?)`.

- [ ] **Step 1: Implement the toolbar** (positioning + button rows)

```svelte
<script>
	import { Bold, Italic, Underline, Strikethrough, Code, Link, Palette, MoreHorizontal } from '@lucide/svelte';
	import FormattingButton from './FormattingButton.svelte';
	import LinkEditorPopover from './LinkEditorPopover.svelte';
	import TextColorPopover from './TextColorPopover.svelte';

	let { rect, active, enabled, currentColor = null, currentLinkUrl = '', onCommand, onClose } = $props();

	let el = $state();
	let openPanel = $state(null); // 'link' | 'color' | 'more' | null

	// Position above the selection; flip below when there is no room. Runs after
	// layout so the toolbar's own size is known.
	let pos = $state({ top: 0, left: 0 });
	$effect(() => {
		if (!rect || !el) return;
		const box = el.getBoundingClientRect();
		const margin = 8;
		let top = rect.top - box.height - margin;
		if (top < margin) top = rect.bottom + margin;
		let left = rect.left + rect.width / 2 - box.width / 2;
		left = Math.min(Math.max(left, margin), window.innerWidth - box.width - margin);
		pos = { top: top + window.scrollY, left: left + window.scrollX };
	});

	$effect(() => {
		function onKey(e) { if (e.key === 'Escape') { openPanel ? (openPanel = null) : onClose(); } }
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const headings = [
		['h1', 'Título 1', active.h1],
		['h2', 'Título 2', active.h2],
		['h3', 'Título 3', active.h3],
		['normal', 'Texto normal', active.normal]
	];
</script>

{#if rect}
	<div
		bind:this={el}
		role="toolbar"
		aria-label="Formato de texto"
		style="position:absolute; top:{pos.top}px; left:{pos.left}px; z-index:50;"
		onmousedown={(e) => e.preventDefault()}
		class="bg-popover border-border flex items-center gap-0.5 rounded-lg border p-1 shadow-xl"
	>
		{#each headings as [id, label, on]}
			<FormattingButton {label} active={on} disabled={!enabled.blockType} onActivate={() => onCommand(id)}>
				<span class="text-xs font-semibold">{id === 'normal' ? '¶' : id.toUpperCase()}</span>
			</FormattingButton>
		{/each}

		<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

		<FormattingButton label="Negrita" shortcut="Ctrl/Cmd+B" active={active.bold} disabled={!enabled.inline} onActivate={() => onCommand('bold')}><Bold size={15} /></FormattingButton>
		<FormattingButton label="Subrayado" shortcut="Ctrl/Cmd+U" active={active.underline} disabled={!enabled.inline} onActivate={() => onCommand('underline')}><Underline size={15} /></FormattingButton>
		<FormattingButton label="Cursiva" shortcut="Ctrl/Cmd+I" active={active.italic} disabled={!enabled.inline} onActivate={() => onCommand('italic')}><Italic size={15} /></FormattingButton>
		<FormattingButton label="Tachado" shortcut="Ctrl/Cmd+Shift+S" active={active.strike} disabled={!enabled.inline} onActivate={() => onCommand('strike')}><Strikethrough size={15} /></FormattingButton>
		<FormattingButton label="Código en línea" active={active.code} disabled={!enabled.inlineCode} onActivate={() => onCommand('code')}><Code size={15} /></FormattingButton>

		<span class="bg-border mx-0.5 h-5 w-px" aria-hidden="true"></span>

		<div class="relative">
			<FormattingButton label="Enlace" shortcut="Ctrl/Cmd+K" active={active.link} disabled={!enabled.link} onActivate={() => (openPanel = openPanel === 'link' ? null : 'link')}><Link size={15} /></FormattingButton>
			{#if openPanel === 'link'}
				<div class="absolute left-0 top-full mt-1">
					<LinkEditorPopover initialUrl={currentLinkUrl}
						onSave={(u) => { onCommand('link', u); openPanel = null; }}
						onRemove={() => { onCommand('removeLink'); openPanel = null; }}
						onClose={() => (openPanel = null)} />
				</div>
			{/if}
		</div>

		<div class="relative">
			<FormattingButton label="Color de texto" active={!!currentColor} disabled={!enabled.color} onActivate={() => (openPanel = openPanel === 'color' ? null : 'color')}><Palette size={15} /></FormattingButton>
			{#if openPanel === 'color'}
				<div class="absolute left-0 top-full mt-1">
					<TextColorPopover current={currentColor}
						onPick={(c) => { onCommand('color', c); openPanel = null; }}
						onClose={() => (openPanel = null)} />
				</div>
			{/if}
		</div>

		<div class="relative">
			<FormattingButton label="Más opciones" onActivate={() => (openPanel = openPanel === 'more' ? null : 'more')}><MoreHorizontal size={15} /></FormattingButton>
			{#if openPanel === 'more'}
				<div class="bg-popover border-border absolute left-0 top-full mt-1 flex flex-col rounded-md border p-1 shadow-lg" role="menu">
					<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('clear'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Quitar formato</button>
					<button type="button" role="menuitem" onmousedown={(e) => e.preventDefault()} onclick={() => { onCommand('copyText'); openPanel = null; }} class="hover:bg-accent rounded-sm px-2 py-1 text-left text-sm">Copiar texto seleccionado</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor/FloatingFormattingToolbar.svelte
git commit -m "feat(editor): FloatingFormattingToolbar layout + positioning"
```

---

## Task 14: Wire the toolbar into the Editor (selection tracking + dispatch)

**Files:**
- Modify: `src/lib/editor/Editor.svelte`

**Interfaces:**
- Consumes: `FloatingFormattingToolbar`, engine (`activeFormatsFor`, `commandsForSelection`, `applyInline`, `toggleCode`, `applyColor`, `applyLink`, `removeLink`, `sanitizeHtml`, `htmlToPlainText`, `HEADING_TYPES`).

- [ ] **Step 1: Track the selection and build toolbar state**

Add to `Editor.svelte` `<script>`:

```js
	import FloatingFormattingToolbar from './FloatingFormattingToolbar.svelte';
	import { activeFormatsFor, commandsForSelection, applyInline, toggleCode, applyColor, applyLink, removeLink } from '$lib/format';

	let toolbar = $state(null); // { rect, active, enabled, blockId, color, linkUrl }

	function editableFor(node) {
		let el = node?.nodeType === 1 ? node : node?.parentNode;
		while (el && !(el.classList && el.classList.contains('block-editable'))) el = el.parentNode;
		return el;
	}

	function refreshToolbar() {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) { toolbar = null; return; }
		const range = sel.getRangeAt(0);
		const startEditable = editableFor(range.startContainer);
		const endEditable = editableFor(range.endContainer);
		if (!startEditable) { toolbar = null; return; }
		// Show on a real selection, or when the caret sits inside formatted text.
		const marks = activeFormatsFor(range.startContainer, startEditable);
		const hasMark = marks.bold || marks.italic || marks.underline || marks.strike || marks.code || marks.link || marks.color;
		if (sel.isCollapsed && !hasMark) { toolbar = null; return; }

		const row = startEditable.closest('[data-block-id]');
		const block = blocks.find((b) => b.id === row?.dataset.blockId);
		if (!block) { toolbar = null; return; }
		const spansBlocks = startEditable !== endEditable;

		toolbar = {
			rect: range.getBoundingClientRect(),
			blockId: block.id,
			color: marks.color,
			linkUrl: currentLinkHref(range),
			active: {
				...marks,
				h1: block.type === 'heading1', h2: block.type === 'heading2',
				h3: block.type === 'heading3', normal: block.type === 'text'
			},
			enabled: commandsForSelection({ blockType: block.type, spansBlocks })
		};
	}

	function currentLinkHref(range) {
		let el = range.startContainer;
		el = el.nodeType === 1 ? el : el.parentNode;
		while (el && !(el.classList && el.classList.contains('block-editable'))) {
			if (el.tagName?.toLowerCase() === 'a') return el.getAttribute('href') ?? '';
			el = el.parentNode;
		}
		return '';
	}

	$effect(() => {
		document.addEventListener('selectionchange', refreshToolbar);
		return () => document.removeEventListener('selectionchange', refreshToolbar);
	});
```

- [ ] **Step 2: Persist the active block after a DOM command**

Add a helper that re-reads the editable's html and saves it (commands mutate the DOM directly):

```js
	function persistActiveBlock() {
		const row = document.querySelector(`[data-block-id="${toolbar?.blockId}"] .block-editable`);
		if (!row) return;
		const block = blocks.find((b) => b.id === toolbar.blockId);
		if (!block) return;
		const html = sanitizeHtml(row.innerHTML);
		block.html = html;
		block.content = htmlToPlainText(html);
		updateBlock(block.id, { html: block.html, content: block.content });
	}
```

- [ ] **Step 3: Handle toolbar commands**

```js
	async function handleToolbarCommand(name, arg) {
		const block = blocks.find((b) => b.id === toolbar?.blockId);
		if (!block) return;
		switch (name) {
			case 'h1': return void setBlockType(block, 'heading1');
			case 'h2': return void setBlockType(block, 'heading2');
			case 'h3': return void setBlockType(block, 'heading3');
			case 'normal': return void setBlockType(block, 'text');
			case 'bold': applyInline('bold'); break;
			case 'italic': applyInline('italic'); break;
			case 'underline': applyInline('underline'); break;
			case 'strike': applyInline('strikethrough'); break;
			case 'code': toggleCode(); break;
			case 'color': applyColor(arg); break;
			case 'link': if (!applyLink(arg)) return; break;
			case 'removeLink': removeLink(); break;
			case 'clear': document.execCommand('removeFormat'); break;
			case 'copyText': {
				const text = window.getSelection()?.toString() ?? '';
				if (text) await navigator.clipboard.writeText(text);
				return;
			}
		}
		persistActiveBlock();
		refreshToolbar();
	}
```

- [ ] **Step 4: Mount the toolbar in the template**

Near the end of `Editor.svelte` markup, add:

```svelte
{#if toolbar}
	<FloatingFormattingToolbar
		rect={toolbar.rect}
		active={toolbar.active}
		enabled={toolbar.enabled}
		currentColor={toolbar.color}
		currentLinkUrl={toolbar.linkUrl}
		onCommand={handleToolbarCommand}
		onClose={() => (toolbar = null)}
	/>
{/if}
```

- [ ] **Step 5: Verify end-to-end manually**

Run: `npm run dev`. Confirm: selecting text shows the toolbar above it; Bold/Italic/etc. toggle and stay after reload; buttons reflect active state; link popover saves `example.com` as `https://…` opening in a new tab; color applies; clicking a button does not lose the selection.

- [ ] **Step 6: Commit**

```bash
git add src/lib/editor/Editor.svelte
git commit -m "feat(editor): mount floating toolbar, dispatch format commands"
```

---

## Task 15: Keyboard shortcuts (work when toolbar hidden)

**Files:**
- Modify: `src/lib/editor/BlockRow.svelte`

**Interfaces:**
- Consumes: engine commands + `handleInput` save path.

- [ ] **Step 1: Intercept shortcuts in `handleKeydown`**

In `BlockRow.svelte` `handleKeydown`, before the Enter handling, add (only for rich blocks):

```js
		if (isRich && (event.metaKey || event.ctrlKey)) {
			const key = event.key.toLowerCase();
			let cmd = null;
			if (key === 'b') cmd = 'bold';
			else if (key === 'i') cmd = 'italic';
			else if (key === 'u') cmd = 'underline';
			else if (key === 's' && event.shiftKey) cmd = 'strikethrough';
			if (cmd) {
				event.preventDefault();
				applyInlineFromKeyboard(cmd);
				return;
			}
			if (key === 'k') {
				event.preventDefault();
				onRequestLink?.(block);
				return;
			}
		}
```

- [ ] **Step 2: Add the helper + import**

Add import `import { applyInline } from '$lib/format';` and:

```js
	function applyInlineFromKeyboard(kind) {
		applyInline(kind);
		onInput(block, { html: sanitizeHtml(el.innerHTML), content: htmlToPlainText(el.innerHTML) });
	}
```

Add `onRequestLink` to the `$props()` list. In `Editor.svelte`, pass `onRequestLink={(block) => openLinkForBlock(block)}` where `openLinkForBlock` selects the block, calls `refreshToolbar()`, and sets the toolbar's link panel open (or simply focuses the toolbar link button by setting a `toolbar.openLink = true` flag consumed by the toolbar). Minimal version: `onRequestLink={() => refreshToolbar()}` plus opening the link popover via a bound flag.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`. With no toolbar visible, select text and press Ctrl/Cmd+B → bold applies; Ctrl/Cmd+K → link popover opens.

- [ ] **Step 4: Commit**

```bash
git add src/lib/editor/BlockRow.svelte src/lib/editor/Editor.svelte
git commit -m "feat(editor): formatting keyboard shortcuts independent of toolbar"
```

---

## Task 16: Protect copy/search/export + guide + e2e

**Files:**
- Verify/adjust: `src/lib/copy/serialize.ts`, `src/lib/copy/format.ts`, `src/lib/search/dataset.ts`, `src/lib/export-import/note-export.ts`
- Modify: `docs/guia-de-uso.md`
- Create: `e2e/formatting.spec.ts`

- [ ] **Step 1: Confirm plain-text projection is used downstream**

Run: `grep -rn "\.content" src/lib/copy src/lib/search src/lib/export-import`
Expected: these read `block.content` (plain text). Since `content` is still maintained (Tasks 9–10), copy-out, search, and export keep working unchanged. Add nothing unless a spot reads raw html.

- [ ] **Step 2: Add a persistence e2e** (`e2e/formatting.spec.ts`)

```js
import { test, expect } from '@playwright/test';

test('bold survives reload', async ({ page }) => {
	await page.goto('/');
	const editable = page.locator('.block-editable').first();
	await editable.click();
	await page.keyboard.type('hola mundo');
	await editable.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	});
	await page.keyboard.press('Control+b');
	await expect(editable.locator('strong')).toHaveText('hola mundo');
	await page.reload();
	await expect(page.locator('.block-editable strong').first()).toHaveText('hola mundo');
});

test('toolbar appears on selection', async ({ page }) => {
	await page.goto('/');
	const editable = page.locator('.block-editable').first();
	await editable.click();
	await page.keyboard.type('seleccioname');
	await editable.evaluate((el) => {
		const range = document.createRange();
		range.selectNodeContents(el);
		window.getSelection().removeAllRanges();
		window.getSelection().addRange(range);
	});
	await expect(page.getByRole('toolbar', { name: 'Formato de texto' })).toBeVisible();
});
```

- [ ] **Step 3: Run the full suites**

Run: `npm test` then `npm run test:e2e -- e2e/formatting.spec.ts`
Expected: all PASS. Fix regressions before proceeding.

- [ ] **Step 4: Update the user guide** (`docs/guia-de-uso.md`)

Add a plain-Spanish section "Dar formato al texto" describing: seleccionar texto muestra la barra; H1/H2/H3 y texto normal; negrita/cursiva/subrayado/tachado/código; enlaces (con o sin https, abren en pestaña nueva); colores; atajos (Ctrl/Cmd+B/I/U, +Shift+S, +K); "Más opciones" (quitar formato, copiar texto). Bump "Última actualización" to `2026-07-11`.

- [ ] **Step 5: Commit**

```bash
git add docs/guia-de-uso.md e2e/formatting.spec.ts
git commit -m "test(editor): formatting e2e + user guide; verify copy/search/export intact"
```

---

## Self-Review

**Spec coverage:**
- Storage html + migration → Task 1. Sanitizer/allow-list → Task 2. URL rules → Task 3. Active state → Tasks 4, 14. Multi-block safety → Tasks 5, 13, 14. Headings/slash → Task 6. Colors/tokens → Task 7. Inline/link/color/code commands → Task 8. Editable unlock + render/save → Tasks 9, 10. Toolbar + buttons + popovers → Tasks 11–13. Selection tracking + dispatch → Task 14. Shortcuts (hidden toolbar) → Task 15. Copy/search/export protection + a11y + reload + e2e + guide → Task 16. Every spec acceptance criterion maps to a task.
- Accessibility (aria-labels, keyboard, Escape, non-color-only active, focus return) → Tasks 11–14 (buttons, popovers, toolbar Escape handling).

**Placeholder scan:** No "TBD"/"handle edge cases" left. Task 15 Step 2 offers a minimal concrete fallback for the link-open wiring rather than a vague instruction.

**Type consistency:** `onInput(block, { html, content })` defined in Task 9, consumed in Task 10. `setBlockType` defined in Task 10, used in Task 14. Engine names (`applyInline`, `removeInline`, `toggleCode`, `applyColor`, `applyLink`, `removeLink`, `activeFormatsFor`, `commandsForSelection`, `planBlockType`, `HEADING_TYPES`, `TEXT_COLORS`, `sanitizeHtml`, `htmlToPlainText`, `normalizeUrl`) are consistent across the barrel (Tasks 7, 8) and consumers.
