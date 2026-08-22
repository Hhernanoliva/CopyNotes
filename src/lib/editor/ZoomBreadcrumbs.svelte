<script>
	import { ChevronRight } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import { MOTION, motionDuration } from '$lib/motion';

	// El camino hasta donde estás parado (spec 043). `crumbs` viene armado del
	// editor: el título de la nota primero (id null) y después cada antepasado del
	// renglón raíz. El renglón raíz NO se repite acá: ya es el título de abajo.
	let { crumbs, onGo } = $props();

	// Con más de cuatro escalones se abrevia el medio. El "…" no es un botón: los
	// escalones que tapa siguen a un clic de distancia desde el de al lado.
	const shown = $derived(
		crumbs.length > 4 ? [crumbs[0], { ellipsis: true }, ...crumbs.slice(-2)] : crumbs
	);
</script>

<!-- Se desplaza de costado en pantallas chicas. NINGÚN panel flotante puede vivir
     acá adentro: un contenedor con scroll recorta todo lo que se abra fuera de su
     caja, aunque esté posicionado en absoluto (AGENT.md).
     Fundido de 150ms y sin viaje: el espacio que ocupa aparece de una, porque
     animar alto o margen empuja el texto y eso la spec 024 lo prohíbe. -->
<nav
	aria-label="Dónde estás"
	class="text-muted-foreground mt-6 flex items-center gap-1 overflow-x-auto text-sm"
	in:fade={{ duration: motionDuration(MOTION.fast) }}
>
	{#each shown as crumb, index (crumb.ellipsis ? 'ellipsis' : (crumb.id ?? 'nota'))}
		{#if index > 0}
			<ChevronRight size={14} aria-hidden="true" class="text-faint shrink-0" />
		{/if}
		{#if crumb.ellipsis}
			<span class="text-faint shrink-0">…</span>
		{:else}
			<button
				type="button"
				onclick={() => onGo(crumb.id)}
				class="hover:text-foreground focus-visible:ring-ring max-w-[12rem] shrink-0 truncate rounded-sm px-1 py-0.5 text-left transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
				>{crumb.label}</button
			>
		{/if}
	{/each}
</nav>
