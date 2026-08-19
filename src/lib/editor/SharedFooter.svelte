<script>
	import { Check } from '@lucide/svelte';

	// El pie de una nota compartida (spec 038 §8). Dos cosas, y sólo una es de
	// cada lado:
	//
	// - El invitado tiene el botón "Listo": la forma de contestar la nota ENTERA,
	//   no un renglón. Es una declaración, no una máquina de estados — no hay
	//   aprobación, no hay reapertura, no hay estado que consultar.
	// - Los dos ven el registro de esas declaraciones, porque de eso se trata:
	//   uno avisa y el otro se entera.
	//
	// En una nota que no está compartida no se renderiza nada. El `{#if}` de
	// afuera ya lo decide, pero se comprueba igual acá: es el único lugar donde la
	// condición se lee junto al botón que habilita.
	let { role = null, entries = [], onDone } = $props();

	let text = $state('');

	function submit() {
		const aclaracion = text.trim();
		text = '';
		onDone?.(aclaracion);
	}

	const fecha = (at) => new Date(at).toLocaleString('es');
</script>

{#if role === 'owner' || role === 'member'}
	<div class="border-border mt-6 flex flex-col gap-3 border-t pt-4">
		{#if role === 'member'}
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={submit}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex h-(--touch-target) shrink-0 items-center gap-2 rounded-md px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
				>
					<Check size={16} aria-hidden="true" />
					Listo
				</button>
				<!-- La aclaración es opcional a propósito: "Listo" solo ya dice lo que
				     tiene que decir, y obligar a escribir algo convierte un aviso de un
				     toque en una tarea. -->
				<label class="sr-only" for="shared-footer-aclaracion">Algo que aclarar (opcional)</label>
				<input
					id="shared-footer-aclaracion"
					bind:value={text}
					onkeydown={(event) => event.key === 'Enter' && submit()}
					placeholder="Algo que aclarar (opcional)"
					class="border-border h-(--touch-target) min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none"
				/>
			</div>
		{/if}

		{#if entries.length}
			<ul class="flex flex-col gap-2">
				{#each entries as entry (entry.id)}
					<li class="flex flex-col gap-0.5 text-sm">
						<!-- El nombre y "marcó Listo" van en UN solo hijo del flex: separados,
						     cada uno recibía el `gap` ADEMÁS del espacio del texto y se leía
						     "Juan  marcó Listo", con dos espacios. -->
						<span class="flex flex-wrap items-center gap-x-1.5">
							<Check size={14} aria-hidden="true" class="shrink-0" />
							<span><span class="font-medium">{entry.label}</span> {entry.actionText}</span>
							<span class="text-faint text-xs">· {fecha(entry.at)}</span>
						</span>
						{#if entry.text}
							<span class="text-muted-foreground pl-5">{entry.text}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
