<script>
	import { toast } from 'svelte-sonner';
	import { X } from '@lucide/svelte';
	import { snippetFieldsFromText } from '$lib/snippets';
	import { createSnippet } from '$lib/storage';

	let { open = $bindable(false), onCreated } = $props();

	let dialogEl = $state(null);
	let name = $state('');
	let text = $state('');
	let saving = $state(false);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			name = '';
			text = '';
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	async function save() {
		saving = true;
		try {
			const fields = snippetFieldsFromText(text);
			if (name.trim()) fields.name = name.trim();
			await createSnippet(fields);
			toast.success('Snippet guardado');
			open = false;
			onCreated();
		} catch {
			toast.error('No se pudo guardar el snippet. Probá de nuevo.');
		} finally {
			saving = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="new-snippet-title"
	class="bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="flex items-center justify-between border-b px-4 py-3">
		<h2 id="new-snippet-title" class="text-sm font-bold">Nuevo snippet</h2>
		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	<div class="flex flex-col gap-4 px-4 py-4">
		<p class="text-muted-foreground text-sm">
			Un snippet es un texto que usás seguido, listo para insertar en cualquier nota.
		</p>
		<div class="flex flex-col gap-2">
			<label for="snippet-name" class="text-xs font-bold tracking-wide uppercase text-muted-foreground">
				Nombre <span class="normal-case font-normal">(opcional)</span>
			</label>
			<!-- svelte-ignore a11y_autofocus — the dialog just opened; landing in the
			     first field beats landing on the close button. -->
			<input
				id="snippet-name"
				bind:value={name}
				placeholder="Ej.: Respuesta de bienvenida"
				autocomplete="off"
				autofocus
				class="border-border placeholder:text-faint focus-visible:ring-ring min-h-(--touch-target) w-full rounded-md border bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
			/>
		</div>
		<div class="flex flex-col gap-2">
			<label for="snippet-text" class="text-xs font-bold tracking-wide uppercase text-muted-foreground">
				Texto
			</label>
			<textarea
				id="snippet-text"
				bind:value={text}
				rows="5"
				placeholder="Escribí o pegá el texto que querés reutilizar…"
				class="border-border placeholder:text-faint focus-visible:ring-ring w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:ring-2 focus-visible:outline-none"
			></textarea>
		</div>
		<button
			type="button"
			onclick={save}
			disabled={saving || text.trim() === ''}
			class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
		>
			{saving ? 'Guardando…' : 'Guardar snippet'}
		</button>
	</div>
</dialog>
