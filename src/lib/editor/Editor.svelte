<script>
	import {
		createBlock,
		getNote,
		listBlocksByNote,
		softDeleteBlock,
		updateBlock,
		updateNote
	} from '$lib/storage';
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
	import { filterCommands, moveSelection } from './slash';
	import BlockRow from './BlockRow.svelte';

	let { noteId, onNoteUpdated, onSaveStateChange } = $props();

	let note = $state(null);
	let blocks = $state([]);
	let focusBlockId = $state(null);
	let titleEl = $state();
	// Slash menu state: which block it is anchored to, the text typed after
	// "/", and the highlighted option.
	let slash = $state(null);

	const visible = $derived(buildVisibleList(blocks));
	const slashCommands = $derived(slash ? filterCommands(slash.query) : []);

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
			slash = { blockId: block.id, query: text.slice(1), index: 0 };
		} else if (slash && slash.blockId === block.id) {
			slash = null;
		}
		// Typing "- " at the start of a text block turns it into a bullet.
		if (block.type === 'text' && text.startsWith('- ')) {
			const stripped = text.slice(2);
			block.type = 'bullet';
			block.content = stripped;
			scheduleSave(`block:${block.id}`, () => updateBlock(block.id, { type: 'bullet', content: stripped }));
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

	async function handleToggleChecked(block) {
		const plan = planToggleChecked(blocks, block.id);
		if (!plan) return;
		await applyUpdates(plan.updates);
	}

	async function applySlashCommand(command) {
		const row = blocks.find((block) => block.id === slash.blockId);
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
					onSlashKey={handleSlashKey}
					onSlashSelect={applySlashCommand}
					onFocusHandled={() => (focusBlockId = null)}
				/>
			{/each}
		</div>
	</div>
{/if}
