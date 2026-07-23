<script>
	import { X } from '@lucide/svelte';
	import { SCALE_STEPS, DEFAULT_SCALE, nextScale } from '$lib/settings/text-scale';

	let { open = $bindable(false), scale, onChange } = $props();

	let dialogEl = $state(null);

	const minScale = SCALE_STEPS[0];
	const maxScale = SCALE_STEPS[SCALE_STEPS.length - 1];

	const percent = $derived(Math.round(scale * 100));

	function step(direction) {
		const next = nextScale(scale, direction);
		if (next !== scale) onChange?.(next);
	}

	function reset() {
		if (scale !== DEFAULT_SCALE) onChange?.(DEFAULT_SCALE);
	}

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) dialogEl.showModal();
		else if (!open && dialogEl.open) dialogEl.close();
	});
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="settings-title"
	class="cn-dialog bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="bg-background sticky top-0 flex items-center justify-between border-b px-4 py-3">
		<h2 id="settings-title" class="text-sm font-bold">Configuración</h2>
		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	<div class="flex flex-col gap-5 px-4 py-4">
		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<h3 class="text-sm font-bold">Tamaño de texto</h3>
				<p class="text-muted-foreground text-sm">
					Cambia solo el tamaño del texto de tus notas.
				</p>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => step(-1)}
					disabled={scale <= minScale}
					aria-label="Achicar texto"
					class="border-border text-foreground hover:bg-accent focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md border text-base font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-40"
				>
					A<span class="text-xs">−</span>
				</button>

				<div
					class="border-border flex h-(--touch-target) min-w-24 flex-1 items-center justify-center rounded-md border tabular-nums"
					aria-live="polite"
				>
					{#key scale}
						<span class="cn-pulse text-sm font-medium">{percent}%</span>
					{/key}
				</div>

				<button
					type="button"
					onclick={() => step(1)}
					disabled={scale >= maxScale}
					aria-label="Agrandar texto"
					class="border-border text-foreground hover:bg-accent focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md border text-lg font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-40"
				>
					A<span class="text-xs">+</span>
				</button>
			</div>

			<button
				type="button"
				onclick={reset}
				disabled={scale === DEFAULT_SCALE}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-md text-sm underline underline-offset-2 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:no-underline disabled:opacity-40"
			>
				Restablecer
			</button>
		</section>
	</div>
</dialog>
