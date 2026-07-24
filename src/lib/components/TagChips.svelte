<script>
	import { onMount } from 'svelte';
	import { X } from '@lucide/svelte';
	import { scale } from 'svelte/transition';
	import { MOTION, motionDuration } from '$lib/motion';

	let { tags, onRemove } = $props();

	// Gate the pop-in so it only fires on a tag ADDED after mount, not on the
	// whole set when a note loads (that would pop every chip at once).
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

{#each tags as tag (tag.id)}
	<span
		in:scale={{ start: 0.6, duration: ready ? motionDuration(MOTION.fast) : 0 }}
		class="bg-muted text-muted-foreground inline-flex max-w-40 items-center gap-0.5 rounded-full py-0.5 pr-1 pl-2 text-xs"
	>
		<span class="truncate">#{tag.name}</span>
		<button
			type="button"
			aria-label="Quitar etiqueta {tag.name}"
			title="Quitar etiqueta"
			onclick={() => onRemove(tag)}
			class="cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-4 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={11} aria-hidden="true" />
		</button>
	</span>
{/each}
