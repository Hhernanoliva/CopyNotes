<script>
	import { X } from '@lucide/svelte';

	let { open = $bindable(false) } = $props();

	let dialogEl = $state(null);

	// ⌘ on Apple keyboards, Ctrl everywhere else. Guarded for SSR.
	const mod =
		typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

	// Shortcut reference. Each item: keys (rendered as <kbd> chips joined by +)
	// and a plain-language description. Kept in sync with the editor handlers.
	const groups = $derived([
		{
			title: 'Escribir',
			items: [
				{ keys: ['Enter'], desc: 'Nuevo renglón' },
				{ keys: ['Shift', 'Enter'], desc: 'Salto de línea en el mismo renglón' },
				{ keys: [mod, 'Enter'], desc: 'Comentario debajo del renglón' },
				{ keys: ['↑ / ↓'], desc: 'Mover el cursor entre renglones' },
				{ keys: ['Tab'], desc: 'Anidar el renglón' },
				{ keys: ['Shift', 'Tab'], desc: 'Sacar un nivel' },
				{ keys: ['Alt', '↑ / ↓'], desc: 'Mover el renglón arriba o abajo' },
				{ keys: ['Backspace'], desc: 'En un renglón vacío: vuelve a texto o lo borra' }
			]
		},
		{
			title: 'Deshacer',
			items: [
				{ keys: [mod, 'Z'], desc: 'Deshacer (escribir, borrar, mover, pegar…)' },
				{ keys: [mod, 'Shift', 'Z'], desc: 'Rehacer' }
			]
		},
		{
			title: 'Seleccionar y copiar',
			items: [
				{ keys: ['Shift', '↑ / ↓'], desc: 'Seleccionar varios renglones' },
				{ keys: ['Shift', 'clic'], desc: 'Seleccionar un rango (o arrastrando)' },
				{ keys: [mod, 'C'], desc: 'Copiar la selección' },
				{ keys: ['Backspace'], desc: 'Borrar la selección' },
				{ keys: ['Esc'], desc: 'Soltar la selección' }
			]
		},
		{
			title: 'Comandos y búsqueda',
			items: [
				{ keys: ['/'], desc: 'Menú de comandos' },
				{ keys: ['- '], desc: 'Al empezar un renglón, lo convierte en viñeta' },
				{ keys: ['#'], desc: 'Etiquetar' },
				{ keys: [mod, 'K'], desc: 'Buscar' },
				{ keys: [mod, 'F'], desc: 'Buscar (con el texto seleccionado)' },
				{ keys: ['?'], desc: 'Abrir esta ayuda' }
			]
		}
	]);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) dialogEl.showModal();
		else if (!open && dialogEl.open) dialogEl.close();
	});
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="help-title"
	class="cn-dialog bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="bg-background sticky top-0 flex items-center justify-between border-b px-4 py-3">
		<h2 id="help-title" class="text-sm font-bold">Ayuda y atajos</h2>
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
		<p class="text-muted-foreground text-sm">
			CopyNotes se aprende usándolo. Estos son los atajos que hacen todo más rápido.
		</p>

		{#each groups as group (group.title)}
			<section class="flex flex-col gap-2">
				<h3 class="text-muted-foreground text-xs font-bold tracking-wide uppercase">
					{group.title}
				</h3>
				<ul class="flex flex-col gap-1.5">
					{#each group.items as item (item.desc)}
						<li class="flex items-center justify-between gap-3 text-sm">
							<span class="text-muted-foreground min-w-0">{item.desc}</span>
							<span class="flex shrink-0 items-center gap-1">
								{#each item.keys as key, i (i)}
									{#if i > 0}<span class="text-faint text-xs">+</span>{/if}
									<kbd
										class="bg-muted text-foreground border-border inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
									>
										{key}
									</kbd>
								{/each}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		<p class="text-muted-foreground border-t pt-4 text-sm">
			En cada renglón, pasá el mouse para ver el botón <span class="text-foreground font-medium"
				>Copiar</span
			> (y <span class="text-foreground font-medium">Copiar con subniveles</span> si tiene hijos). El
			menú <span class="text-foreground font-medium">⋯</span> lo guarda como snippet o le pone una
			etiqueta.
		</p>
	</div>
</dialog>
