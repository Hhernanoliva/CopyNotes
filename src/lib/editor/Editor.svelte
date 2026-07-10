<script>
	import {
		applyInsertionPlan,
		createBlock,
		createId,
		createSnippet,
		getNote,
		listBlocksByNote,
		listSnippets,
		softDeleteBlock,
		updateBlock,
		updateNote
	} from '$lib/storage';
	import { filterSnippets, planSnippetInsertion, snippetFieldsFromBlocks } from '$lib/snippets';
	import { buildVisibleList } from '$lib/blocks/hierarchy';
	import { planIndent, planOutdent } from '$lib/blocks/indent';
	import { planMoveDown, planMoveUp } from '$lib/blocks/reorder';
	import {
		backspaceAction,
		canDeleteOnBackspace,
		enterOnEmptyAction,
		planEnter,
		previousVisibleId
	} from '$lib/blocks/enter';
	import { planToggleChecked } from '$lib/blocks/cascade';
	import { buildCopyTree, formatPlainText, formatHtml } from '$lib/copy/format';
	import { writeToClipboard } from '$lib/copy/clipboard';
	import { toast } from 'svelte-sonner';
	import { filterCommands, moveSelection } from './slash';
	import BlockRow from './BlockRow.svelte';

	let { noteId, onNoteUpdated, onSaveStateChange, onSnippetsChanged } = $props();

	let note = $state(null);
	let blocks = $state([]);
	let focusBlockId = $state(null);
	// Last block the user touched; snippet insertion from the sidebar lands here.
	let activeBlockId = $state(null);
	let titleEl = $state();
	// Slash menu state: which block it is anchored to, the text typed after
	// "/", and the highlighted option. mode 'snippets' means /snippet was
	// chosen and the menu now lists saved snippets instead of block types.
	let slash = $state(null);

	const visible = $derived(buildVisibleList(blocks));
	const slashCommands = $derived.by(() => {
		if (!slash) return [];
		if (slash.mode === 'snippets') {
			return filterSnippets(slash.snippets, slash.query).map((snippet) => ({
				id: snippet.id,
				label: snippet.name,
				kind: 'snippet',
				isFavorite: snippet.isFavorite,
				snippet
			}));
		}
		return filterCommands(slash.query);
	});

	// Debounced writes per entity; flushed on unmount so nothing is lost
	// when the user switches notes quickly.
	const pending = new Map();

	function scheduleSave(key, save) {
		onSaveStateChange('saving');
		const existing = pending.get(key);
		if (existing) clearTimeout(existing.timer);
		const entry = {
			save,
			timer: setTimeout(async () => {
				pending.delete(key);
				await save();
				if (pending.size === 0) onSaveStateChange('saved');
			}, 500)
		};
		pending.set(key, entry);
	}

	function flushPending() {
		for (const [key, entry] of pending) {
			clearTimeout(entry.timer);
			entry.save();
			pending.delete(key);
		}
	}

	$effect(() => () => flushPending());

	$effect(() => {
		const id = noteId;
		let cancelled = false;
		(async () => {
			const [loadedNote, loadedBlocks] = await Promise.all([getNote(id), listBlocksByNote(id)]);
			if (cancelled) return;
			note = loadedNote;
			blocks = loadedBlocks;
			activeBlockId = null;
			if (note && note.title === '' && titleEl) {
				titleEl.focus();
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// Structure changes (indent, reorder, collapse…) persist immediately:
	// losing hierarchy is worse than an extra write.
	async function applyUpdates(updates) {
		for (const update of updates) {
			const { id, ...changes } = update;
			const row = blocks.find((block) => block.id === id);
			if (row) Object.assign(row, changes);
			await updateBlock(id, changes);
		}
	}

	function handleTitleInput(event) {
		const title = event.currentTarget.value;
		note.title = title;
		scheduleSave(`title:${note.id}`, async () => {
			await updateNote(note.id, { title });
			onNoteUpdated(note.id, { title });
		});
	}

	function handleTitleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length > 0) focusBlockId = visible[0].block.id;
		}
	}

	function handleBlockInput(block, text) {
		// Typing "/" in an empty block opens the slash menu; the query is
		// whatever follows. Code blocks are exempt, slashes are normal there.
		if (block.type !== 'code' && text.startsWith('/')) {
			// Keep the snippet-picker mode alive while the user narrows the query.
			if (slash && slash.blockId === block.id && slash.mode === 'snippets') {
				slash.query = text.slice(1);
				slash.index = 0;
			} else {
				slash = { blockId: block.id, query: text.slice(1), index: 0, mode: 'commands' };
			}
		} else if (slash && slash.blockId === block.id) {
			slash = null;
		}
		// Typing "- " at the start of a text block turns it into a bullet.
		// Structural change: persist immediately — a debounced save under the
		// same key would be replaced by the next keystroke's content-only save.
		if (block.type === 'text' && text.startsWith('- ')) {
			const stripped = text.slice(2);
			block.type = 'bullet';
			block.content = stripped;
			updateBlock(block.id, { type: 'bullet', content: stripped });
			return;
		}
		block.content = text;
		scheduleSave(`block:${block.id}`, () => updateBlock(block.id, { content: text }));
	}

	// A new block keeps list-like types going; code and separators hand
	// over to plain text.
	function inheritType(type) {
		return type === 'bullet' || type === 'todo' ? type : 'text';
	}

	async function handleEnter(block, forcedType) {
		if (!forcedType && block.content === '') {
			const action = enterOnEmptyAction(block);
			if (action === 'outdent') {
				await handleOutdent(block);
				return;
			}
			if (action === 'convert') {
				block.type = 'text';
				block.checked = false;
				await updateBlock(block.id, { type: 'text', checked: false });
				focusBlockId = block.id;
				return;
			}
		}
		const plan = planEnter(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
		const created = await createBlock({
			noteId: note.id,
			parentBlockId: plan.parentBlockId,
			type: forcedType ?? inheritType(block.type),
			order: plan.order
		});
		blocks = [...blocks, created];
		focusBlockId = created.id;
	}

	async function handleBackspaceEmpty(block) {
		if (backspaceAction(block) === 'convert') {
			block.type = 'text';
			block.checked = false;
			await updateBlock(block.id, { type: 'text', checked: false });
			focusBlockId = block.id;
			return;
		}
		if (!canDeleteOnBackspace(blocks, block.id)) return;
		const prevId = previousVisibleId(blocks, block.id);
		await softDeleteBlock(block.id);
		blocks = blocks.filter((row) => row.id !== block.id);
		if (prevId) focusBlockId = prevId;
	}

	async function handleIndent(block) {
		const plan = planIndent(blocks, block.id);
		if (!plan) return;
		// Expand the new parent so the indented block does not vanish.
		const parentId = plan.updates[0].parentBlockId;
		const parent = blocks.find((row) => row.id === parentId);
		if (parent && parent.collapsed) {
			parent.collapsed = false;
			await updateBlock(parent.id, { collapsed: false });
		}
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleOutdent(block) {
		const plan = planOutdent(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveUp(block) {
		const plan = planMoveUp(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveDown(block) {
		const plan = planMoveDown(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleToggleCollapsed(block) {
		block.collapsed = !block.collapsed;
		await updateBlock(block.id, { collapsed: block.collapsed });
	}

	async function handleCopy(block, withChildren) {
		const tree = buildCopyTree(blocks, block.id, withChildren);
		try {
			await writeToClipboard({ text: formatPlainText(tree), html: formatHtml(tree) });
			toast.success('Copiado');
		} catch {
			toast.error('No se pudo copiar. Probá de nuevo.');
		}
	}

	async function handleToggleChecked(block) {
		const plan = planToggleChecked(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
	}

	function cancelPending(key) {
		const entry = pending.get(key);
		if (entry) {
			clearTimeout(entry.timer);
			pending.delete(key);
		}
	}

	async function insertSnippetBlocks(snippet, afterId) {
		// $state proxies can't be structured-cloned into IndexedDB.
		const plan = planSnippetInsertion($state.snapshot(blocks), $state.snapshot(snippet), {
			noteId: note.id,
			afterId,
			createId
		});
		await applyInsertionPlan(plan);
		for (const update of plan.updates) {
			const row = blocks.find((block) => block.id === update.id);
			if (row) row.order = update.order;
		}
		blocks = [...blocks, ...plan.newBlocks];
		focusBlockId = plan.focusId;
	}

	async function applySnippetPick(snippet) {
		const row = blocks.find((block) => block.id === slash.blockId);
		slash = null;
		if (!row) return;
		await insertSnippetBlocks(snippet, row.id);
		// The "/…" row only existed to open the picker. Drop it — unless it has
		// children, in which case deleting it would orphan them.
		const hasChildren = blocks.some((block) => (block.parentBlockId ?? null) === row.id);
		cancelPending(`block:${row.id}`);
		if (hasChildren) {
			row.content = '';
			await updateBlock(row.id, { content: '' });
		} else {
			await softDeleteBlock(row.id);
			blocks = blocks.filter((block) => block.id !== row.id);
		}
	}

	// Called from the page when the user inserts from the snippets library.
	export async function insertSnippet(snippet) {
		const active = activeBlockId && blocks.some((block) => block.id === activeBlockId);
		const afterId = active
			? activeBlockId
			: (visible.length ? visible[visible.length - 1].block.id : null);
		await insertSnippetBlocks(snippet, afterId);
		toast.success('Snippet insertado');
	}

	async function handleSaveSnippet(block) {
		const fields = snippetFieldsFromBlocks($state.snapshot(blocks), block.id, note.id);
		await createSnippet(fields);
		toast.success('Snippet guardado');
		if (onSnippetsChanged) onSnippetsChanged();
	}

	async function applySlashCommand(command) {
		if (command.kind === 'snippet') {
			await applySnippetPick(command.snippet);
			return;
		}
		const row = blocks.find((block) => block.id === slash.blockId);
		if (command.id === 'snippet') {
			// Switch the menu into snippet-picker mode; the block keeps its "/"
			// so typing keeps filtering the snippet list.
			const snippets = await listSnippets();
			slash = { blockId: slash.blockId, query: '', index: 0, mode: 'snippets', snippets };
			if (row) {
				row.content = '/';
				focusBlockId = row.id;
			}
			return;
		}
		slash = null;
		if (!row) return;
		if (command.id === 'separator') {
			row.type = 'separator';
			row.content = '';
			await updateBlock(row.id, { type: 'separator', content: '' });
			await handleEnter(row, 'text');
			return;
		}
		row.type = command.id;
		row.content = '';
		const changes = { type: command.id, content: '' };
		if (command.id === 'todo') {
			row.checked = false;
			changes.checked = false;
		}
		await updateBlock(row.id, changes);
		focusBlockId = row.id;
	}

	function handleSlashKey(key) {
		if (!slash) return;
		if (key === 'Escape') {
			slash = null;
			return;
		}
		if (key === 'ArrowDown') {
			slash.index = moveSelection(slash.index, 1, slashCommands.length);
			return;
		}
		if (key === 'ArrowUp') {
			slash.index = moveSelection(slash.index, -1, slashCommands.length);
			return;
		}
		if (key === 'Enter') {
			const command = slashCommands[slash.index];
			if (command) applySlashCommand(command);
			else slash = null;
		}
	}
</script>

{#if note}
	<div class="mx-auto w-full max-w-(--editor-max-width) px-6 py-10 md:py-14">
		<input
			bind:this={titleEl}
			value={note.title}
			oninput={handleTitleInput}
			onkeydown={handleTitleKeydown}
			placeholder="Sin título"
			aria-label="Título de la nota"
			autocomplete="off"
			name="note-title"
			class="placeholder:text-faint w-full bg-transparent text-3xl font-bold tracking-tight outline-none md:text-4xl"
		/>
		<div class="mt-6 flex flex-col">
			{#each visible as row, index (row.block.id)}
				<BlockRow
					block={row.block}
					depth={row.depth}
					hasChildren={row.hasChildren}
					focused={focusBlockId === row.block.id}
					placeholder={index === 0 && visible.length === 1 ? 'Escribí algo, o "/" para elegir tipo…' : ''}
					slashOpen={slash !== null && slash.blockId === row.block.id}
					{slashCommands}
					slashIndex={slash ? slash.index : 0}
					onInput={handleBlockInput}
					onEnter={handleEnter}
					onBackspaceEmpty={handleBackspaceEmpty}
					onIndent={handleIndent}
					onOutdent={handleOutdent}
					onMoveUp={handleMoveUp}
					onMoveDown={handleMoveDown}
					onToggleCollapsed={handleToggleCollapsed}
					onToggleChecked={handleToggleChecked}
					onCopy={handleCopy}
					onSaveSnippet={handleSaveSnippet}
					onActive={(row) => (activeBlockId = row.id)}
					onSlashKey={handleSlashKey}
					onSlashSelect={applySlashCommand}
					onFocusHandled={() => (focusBlockId = null)}
					slashEmptyLabel={slash?.mode === 'snippets'
						? 'Todavía no guardaste snippets.'
						: 'Sin resultados'}
				/>
			{/each}
		</div>
	</div>
{/if}
