<script>
	// Aceptar una invitación (spec 038 §7, flujo 2).
	//
	// Tres estados y nada más: sin sesión (hay que entrar), con sesión (aceptar), y
	// listo. El link NO da acceso por sí solo, y esta pantalla es donde eso se
	// nota: sin cuenta no hay nada que aceptar.
	import { toast } from 'svelte-sonner';
	import { acceptInvite } from '$lib/sync/invites';
	import { syncShared } from '$lib/sync/shared';
	import { supabase } from '$lib/sync/supabase';

	let { token, onDone } = $props();

	// `undefined` = todavía no se sabe. Distinto de `null` (= no hay sesión) a
	// propósito: sin esa diferencia se ve un instante "entrá a tu cuenta" a alguien
	// que ya entró.
	let client = $state(undefined);
	let working = $state(false);

	// Hay que SEGUIR la sesión, no leerla una vez. Quien abre el link sin cuenta
	// entra desde esta misma página, sin recargarla: una lectura de montaje deja
	// la tarjeta clavada en "entrá a tu cuenta" para siempre, y el botón de
	// aceptar no aparece nunca. Es la misma razón por la que `CloudLifecycle`
	// sigue la sesión en vez de leerla, y acá pesa más — la invitación es
	// justamente lo que la persona vino a hacer.
	//
	// `onAuthStateChange` emite también la sesión inicial, así que cubre los dos
	// casos con una sola suscripción (encontrado en el gate de B1, 2026-08-17).
	$effect(() => {
		const cliente = supabase();
		if (!cliente) {
			client = null;
			return;
		}
		const { data } = cliente.auth.onAuthStateChange((_evento, session) => {
			client = session ? cliente : null;
		});
		return () => data.subscription.unsubscribe();
	});

	async function aceptar() {
		working = true;
		try {
			await acceptInvite(client, token);
			// La membresía ya está; lo que trae la nota es la pasada siguiente del
			// caño compartido, y se dispara acá para que no haya que esperar 30
			// segundos mirando una lista vacía.
			await syncShared(client);
			toast.success('Listo: la nota ya está en tu lista.');
			onDone?.();
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `No se pudo: ${error.message}`
					: 'No se pudo aceptar la invitación.'
			);
		} finally {
			working = false;
		}
	}
</script>

<div
	class="bg-card text-card-foreground border-border mx-auto mt-4 mb-2 flex max-w-md flex-col gap-3 rounded-lg border p-4 shadow-lg"
>
	<h2 class="text-sm font-bold">Te compartieron una nota</h2>

	{#if client === undefined}
		<p class="text-muted-foreground text-sm">Un segundo…</p>
	{:else if client === null}
		<p class="text-sm leading-relaxed">
			Para abrirla necesitás entrar a tu cuenta de CopyNotes. El link solo no da acceso: así, lo
			que hagas queda firmado con tu nombre.
		</p>
		<p class="text-muted-foreground text-sm">
			Entrá desde Configuración y volvé acá — la invitación te espera.
		</p>
	{:else}
		<p class="text-sm leading-relaxed">
			Si la aceptás, la nota aparece en tu lista. Vas a poder leerla y copiarla; el texto lo
			cambia solamente quien la comparte.
		</p>
		<button
			type="button"
			onclick={aceptar}
			disabled={working}
			class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
		>
			{working ? 'Aceptando…' : 'Aceptar y ver la nota'}
		</button>
	{/if}

	<button
		type="button"
		onclick={() => onDone?.()}
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring min-h-(--touch-target) rounded-md text-xs underline focus-visible:ring-2 focus-visible:outline-none"
	>
		Ahora no
	</button>
</div>
