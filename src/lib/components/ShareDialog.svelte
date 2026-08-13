<script>
	// Compartir una nota (spec 038, parte A).
	//
	// La frase sobre la privacidad vive ACÁ, en el momento de compartir, y no en
	// Configuración: es una baja de privacidad real —la nota sale de la bóveda y
	// el servidor puede leerla— y avisarla en otra pantalla es no avisarla.
	//
	// En la parte A todavía no hay a quién invitar, así que hay dos estados y
	// nada más: compartida y sin compartir.
	import { toast } from 'svelte-sonner';
	import { X, Share2 } from '@lucide/svelte';
	import { getShareRole } from '$lib/storage/shares';
	import { sharedReady } from '$lib/sync/shared';
	import { shareNote, unshareNote } from '$lib/sync/share-move';

	let { open = $bindable(false), noteId, noteTitle = '', onChanged } = $props();

	let dialogEl = $state(null);
	// `undefined` = todavía no se leyó. Es distinto de `null` (= no compartida) a
	// propósito: sin esa diferencia, una nota YA compartida mostraba por un
	// instante el botón de compartir, y ese instante alcanza para un clic.
	let role = $state(undefined);
	let working = $state(false);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) {
			dialogEl.showModal();
		} else if (!open && dialogEl.open) {
			dialogEl.close();
		}
	});

	// Se relee cada vez que se abre, no una vez al montar: la marca puede haber
	// cambiado desde otro aparato entre una apertura y la siguiente.
	$effect(() => {
		if (!open || !noteId) return;
		role = undefined;
		getShareRole(noteId).then((value) => (role = value));
	});

	async function run(action, mensajeOk) {
		working = true;
		try {
			const client = await sharedReady();
			if (!client) {
				toast.error('Para compartir una nota tenés que entrar a tu cuenta en Configuración.');
				return;
			}
			await action(client, noteId);
			role = await getShareRole(noteId);
			toast.success(mensajeOk);
			onChanged?.();
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `No se pudo: ${error.message}`
					: 'No se pudo. Probá de nuevo.'
			);
		} finally {
			working = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="share-dialog-title"
	class="cn-dialog bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="flex items-center justify-between border-b px-4 py-3">
		<h2 id="share-dialog-title" class="flex items-center gap-2 text-sm font-bold">
			<Share2 size={16} aria-hidden="true" />
			Compartir nota
		</h2>
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
			{noteTitle || 'Sin título'}
		</p>

		{#if role === 'owner'}
			<p class="text-sm leading-relaxed">
				Esta nota está compartida. Mientras lo esté, está fuera de la bóveda y sin cifrar.
			</p>
			<button
				type="button"
				onclick={() => run(unshareNote, 'La nota volvió a la bóveda.')}
				disabled={working}
				class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				{working ? 'Cerrando…' : 'Dejar de compartir'}
			</button>
		{:else if role === 'member'}
			<p class="text-sm leading-relaxed">
				Esta nota te la comparte otra persona. Quien la comparte es quien puede cerrarla.
			</p>
		{:else if role === null}
			<p class="text-sm leading-relaxed">
				Mientras esté compartida, esta nota sale de la bóveda y deja de estar cifrada. El servidor
				puede leerla. Vuelve a la bóveda cuando cierres la compartición.
			</p>
			<button
				type="button"
				onclick={() => run(shareNote, 'La nota quedó compartida.')}
				disabled={working}
				class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				{working ? 'Compartiendo…' : 'Compartir esta nota'}
			</button>
		{/if}
	</div>
</dialog>
