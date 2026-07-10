<script>
	import {
		createBlock,
		getNote,
		listChildBlocks,
		softDeleteBlock,
		updateBlock,
		updateNote
	} from '$lib/storage';
	import { planInsertAfter, sortByOrder } from '$lib/blocks/ordering';
	import BlockRow from './BlockRow.svelte';

	let { noteId, onNoteUpdated, onSaveStateChange } = $props();

	let note = $state(null);
	let blocks = $state([]);
	let focusBlockId = $state(null);
	let titleEl = $state();

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
			const [loadedNote, loadedBlocks] = await Promise.all([getNote(id), listChildBlocks(id, null)]);
			if (cancelled) return;
			note = loadedNote;
			blocks = sortByOrder(loadedBlocks);
			if (note && note.title === '' && titleEl) {
				titleEl.focus();
			}
		})();
		return () => {
			cancelled = true;
		};
	});

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
			if (blocks.length > 0) focusBlockId = blocks[0].id;
		}
	}

	function handleBlockInput(block, text) {
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

	async function handleEnter(block) {
		const plan = planInsertAfter(blocks, block.id);
		for (const update of plan.updates) {
			const sibling = blocks.find((row) => row.id === update.id);
			if (sibling) sibling.order = update.order;
			await updateBlock(update.id, { order: update.order });
		}
		const created = await createBlock({ noteId: note.id, type: block.type, order: plan.order });
		blocks = sortByOrder([...blocks, created]);
		focusBlockId = created.id;
	}

	async function handleBackspaceEmpty(block) {
		if (blocks.length <= 1) return;
		const index = blocks.findIndex((row) => row.id === block.id);
		await softDeleteBlock(block.id);
		blocks = blocks.filter((row) => row.id !== block.id);
		const previous = blocks[Math.max(0, index - 1)];
		if (previous) focusBlockId = previous.id;
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
			{#each blocks as block, index (block.id)}
				<BlockRow
					{block}
					focused={focusBlockId === block.id}
					placeholder={index === 0 && blocks.length === 1 ? 'Escribí algo…' : ''}
					onInput={handleBlockInput}
					onEnter={handleEnter}
					onBackspaceEmpty={handleBackspaceEmpty}
					onFocusHandled={() => (focusBlockId = null)}
				/>
			{/each}
		</div>
	</div>
{/if}
