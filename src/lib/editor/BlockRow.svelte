<script>
	let { block, focused = false, placeholder = '', onInput, onEnter, onBackspaceEmpty, onFocusHandled } = $props();

	let el;

	// Sync DOM only when state and DOM diverge (e.g. bullet conversion strips
	// the "- " prefix). While the user types they always match, so the caret
	// is never clobbered.
	$effect(() => {
		if (el && el.textContent !== block.content) {
			el.textContent = block.content;
		}
	});

	$effect(() => {
		if (focused && el) {
			el.focus();
			onFocusHandled();
		}
	});

	function handleKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			onEnter(block);
			return;
		}
		if (event.key === 'Backspace' && el.textContent === '') {
			event.preventDefault();
			onBackspaceEmpty(block);
		}
	}

	function handleInput() {
		onInput(block, el.textContent);
	}
</script>

<div class="flex items-start gap-2 rounded-md px-2 py-1">
	{#if block.type === 'bullet'}
		<span aria-hidden="true" class="text-faint mt-[0.4rem] select-none text-[0.6rem] leading-none">●</span>
	{/if}
	<div
		bind:this={el}
		contenteditable="plaintext-only"
		role="textbox"
		tabindex="0"
		aria-multiline="true"
		aria-label={block.type === 'bullet' ? 'Viñeta' : 'Bloque de texto'}
		data-placeholder={placeholder}
		onkeydown={handleKeydown}
		oninput={handleInput}
		class="block-editable min-h-[1.6rem] w-full min-w-0 text-base leading-relaxed break-words outline-none"
	></div>
</div>

<style>
	.block-editable:empty::before {
		content: attr(data-placeholder);
		color: var(--text-faint);
		pointer-events: none;
	}
</style>
