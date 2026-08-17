<script>
	// Compartir una nota (spec 038, parte A).
	//
	// La frase sobre la privacidad vive ACÁ, en el momento de compartir, y no en
	// Configuración: es una baja de privacidad real —la nota sale de la bóveda y
	// el servidor puede leerla— y avisarla en otra pantalla es no avisarla.
	//
	// La parte B1 le suma la segunda persona: el link, a quién se lo diste, y las
	// dos formas de cortar.
	import { toast } from 'svelte-sonner';
	import { X, Share2 } from '@lucide/svelte';
	import { getShareRole } from '$lib/storage/shares';
	import { shareNameOr } from '$lib/storage/share-names';
	import { getSetting, setSetting } from '$lib/storage/settings';
	import { KEY } from '$lib/storage/settings-registry';
	import { sharedReady } from '$lib/sync/shared';
	import { shareNote, unshareNote } from '$lib/sync/share-move';
	import { createInvite, inviteLink, leaveShare, listMembers, removeMember } from '$lib/sync/invites';

	let { open = $bindable(false), noteId, noteTitle = '', onChanged } = $props();

	let dialogEl = $state(null);
	// `undefined` = todavía no se leyó. Es distinto de `null` (= no compartida) a
	// propósito: sin esa diferencia, una nota YA compartida mostraba por un
	// instante el botón de compartir, y ese instante alcanza para un clic.
	let role = $state(undefined);
	let working = $state(false);

	// Cómo firmás. Se escribe una vez y se recuerda: va en preferencias y no en la
	// nota porque es tuyo, no de la nota.
	let ownerLabel = $state('');
	let memberLabel = $state('');
	let link = $state('');
	let members = $state([]);
	// Con quién estás del otro lado. El dueño firma al invitar y ese nombre llega
	// en `list_shares`; el respaldo es genérico a propósito, porque una nota
	// compartida antes de que los nombres existieran no tiene ninguno.
	let ownerName = $state('otra persona');

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
		link = '';
		getShareRole(noteId).then((value) => (role = value));
		getSetting(KEY.shareOwnerLabel).then((valor) => (ownerLabel = valor ?? ''));
		shareNameOr(`owner:${noteId}`, 'otra persona').then((valor) => (ownerName = valor));
	});

	// La lista de invitados sale del servidor, y sólo la puede pedir el dueño.
	$effect(() => {
		if (!open || role !== 'owner' || !noteId) return;
		members = [];
		refrescarMiembros();
	});

	async function refrescarMiembros() {
		const client = await sharedReady();
		if (!client) return;
		try {
			members = await listMembers(client, noteId);
		} catch {
			// Que no se pueda listar no rompe la pantalla: lo importante —compartir y
			// dejar de compartir— sigue andando sin esta lista.
			members = [];
		}
	}

	async function run(action, mensajeOk) {
		working = true;
		try {
			const client = await sharedReady();
			if (!client) {
				toast.error('Para compartir una nota tenés que entrar a tu cuenta en Configuración.');
				return;
			}
			await action(client);
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

	async function invitar() {
		working = true;
		try {
			const client = await sharedReady();
			if (!client) {
				toast.error('Para invitar tenés que entrar a tu cuenta en Configuración.');
				return;
			}
			const token = await createInvite(client, noteId, memberLabel.trim(), ownerLabel.trim());
			await setSetting(KEY.shareOwnerLabel, ownerLabel.trim());
			link = inviteLink(token, window.location.origin);
			memberLabel = '';
			await refrescarMiembros();
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `No se pudo: ${error.message}`
					: 'No se pudo generar el link. Probá de nuevo.'
			);
		} finally {
			working = false;
		}
	}

	async function copiarLink() {
		try {
			await navigator.clipboard.writeText(link);
			toast.success('Link copiado.');
		} catch {
			// Sin permiso de portapapeles el link igual está a la vista y se puede
			// seleccionar a mano. Avisar es mejor que fallar en silencio.
			toast.error('No se pudo copiar. El link está acá arriba para copiarlo a mano.');
		}
	}

	// El texto dice, ANTES de que pase, que la copia del otro se queda. No se puede
	// confundir con borrar la nota, que sí le llega y le desaparece: son dos actos
	// distintos y la spec pide que se digan por separado.
	async function quitar(member) {
		const nombre = member.name || 'esta persona';
		if (
			!confirm(
				`¿Quitarle el acceso a ${nombre}?\n\nDeja de recibir los cambios. La copia que ya tiene en su aparato se queda ahí: esto no la puede borrar.`
			)
		) {
			return;
		}
		await run((client) => removeMember(client, noteId, member.id), 'Le quitaste el acceso.');
		await refrescarMiembros();
	}

	function salirme() {
		if (
			!confirm(
				'¿Salirte de esta nota?\n\nDejás de recibir los cambios. La copia que tenés en este aparato se queda acá.'
			)
		) {
			return;
		}
		run((client) => leaveShare(client, noteId), 'Te saliste de la nota.');
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
			<div class="flex flex-col gap-3">
				<label class="flex flex-col gap-1 text-sm" for="share-member-label">
					<span class="font-bold">¿Para quién es este link?</span>
					<span class="text-muted-foreground text-xs">
						Con ese nombre va a figurar todo lo que haga. No se comparte ningún mail, ni el
						tuyo ni el suyo.
					</span>
				</label>
				<input
					id="share-member-label"
					bind:value={memberLabel}
					placeholder="Juan"
					class="border-border bg-background focus-visible:ring-ring min-h-(--touch-target) rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>

				<label class="text-sm font-bold" for="share-owner-label">¿Cómo querés que te vean?</label>
				<input
					id="share-owner-label"
					bind:value={ownerLabel}
					placeholder="Quien comparte la nota"
					class="border-border bg-background focus-visible:ring-ring min-h-(--touch-target) rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
				/>

				<button
					type="button"
					onclick={invitar}
					disabled={working || !memberLabel.trim()}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					{working ? 'Generando…' : 'Generar link de invitación'}
				</button>

				{#if link}
					<div class="flex flex-col gap-2">
						<p class="text-muted-foreground text-xs">
							Mandale este link. Vence en 7 días, y sólo sirve entrando con una cuenta.
						</p>
						<code class="bg-muted text-foreground rounded-md px-2 py-2 text-xs break-all">
							{link}
						</code>
						<button
							type="button"
							onclick={copiarLink}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
						>
							Copiar link
						</button>
					</div>
				{/if}

				{#if members.length}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-bold">Quiénes la están viendo</p>
						<ul class="flex flex-col gap-1">
							{#each members as member (member.id)}
								<li class="flex items-center justify-between gap-2 text-sm">
									<span>{member.name || 'Sin nombre'}</span>
									<button
										type="button"
										onclick={() => quitar(member)}
										disabled={working}
										class="text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center rounded-md px-2 text-xs font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
									>
										Quitar acceso
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<!-- La salida va ABAJO y separada: es el final del camino, no lo primero
			     que se ofrece. Puesta arriba, la pantalla empezaba por deshacer lo que
			     la persona vino a hacer. -->
			<button
				type="button"
				onclick={() => run((client) => unshareNote(client, noteId), 'La nota volvió a la bóveda.')}
				disabled={working}
				class="border-border text-destructive hover:bg-accent focus-visible:ring-ring mt-1 flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				{working ? 'Cerrando…' : 'Dejar de compartir'}
			</button>
		{:else if role === 'member'}
			<p class="text-sm leading-relaxed">
				Esta nota te la comparte <span class="font-bold">{ownerName}</span>. Podés leerla y
				copiarla; el texto lo cambia solamente quien la comparte.
			</p>
			<button
				type="button"
				onclick={salirme}
				disabled={working}
				class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				Salirme de esta nota
			</button>
		{:else if role === null}
			<p class="text-sm leading-relaxed">
				Mientras esté compartida, esta nota sale de la bóveda y deja de estar cifrada. El servidor
				puede leerla. Vuelve a la bóveda cuando cierres la compartición.
			</p>
			<button
				type="button"
				onclick={() => run((client) => shareNote(client, noteId), 'La nota quedó compartida.')}
				disabled={working}
				class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				{working ? 'Compartiendo…' : 'Compartir esta nota'}
			</button>
		{/if}
	</div>
</dialog>
