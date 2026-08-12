<script>
	import { openExternal } from '$lib/platform';
	import { DESKTOP_DOWNLOAD_URL } from './download';
	import { updateStatus } from './update-status.svelte';
	import { changelogSection, parseNotes } from './update-check';
	// El changelog viaja ADENTRO de la app, embebido en el build. Por eso el
	// bloque "qué trajo tu versión" funciona sin internet y sigue estando cuando
	// ya estás al día — que es justo cuando el aviso de arriba desaparece.
	import changelogRaw from '../../../CHANGELOG.md?raw';

	// Solo escritorio: SettingsDialog la monta dentro de `isTauriRuntime()`.
	//
	// No consulta nada: lee el resultado del chequeo que corrió al arrancar
	// (update-status.svelte.ts). Si consultara por su cuenta, el punto del
	// engranaje y esta sección podrían contradecirse.
	//
	// Esto muestra y nada más. Nunca `downloadAndInstall()`, nunca `relaunch()`:
	// la app no se reemplaza a sí misma, el botón manda a la página de descarga.
	const mine = $derived(parseNotes(changelogSection(changelogRaw, updateStatus.current)));
</script>

<section class="flex flex-col gap-3">
	<div class="flex flex-col gap-0.5">
		<h3 class="text-sm font-bold">Actualizaciones</h3>
		<p class="text-muted-foreground text-sm">
			{#if !updateStatus.current}
				Buscando…
			{:else if updateStatus.state === 'al-dia'}
				Tenés la versión {updateStatus.current}. Estás al día.
			{:else}
				Tenés la versión {updateStatus.current}.
			{/if}
		</p>
	</div>

	{#if updateStatus.state === 'nueva'}
		<div class="border-border flex flex-col gap-2 rounded-md border px-3 py-2">
			<p class="text-sm">
				<span class="font-medium">{updateStatus.latest} ya está disponible.</span>
			</p>

			{#if updateStatus.notes.length}
				<ul class="text-muted-foreground flex list-disc flex-col gap-0.5 pl-4 text-sm">
					{#each updateStatus.notes as nota (nota)}
						<li>{nota}</li>
					{/each}
				</ul>
			{/if}

			<button
				type="button"
				onclick={() => openExternal(DESKTOP_DOWNLOAD_URL)}
				class="cn-tap bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
			>
				Descargar
			</button>

			<!-- La mitad del valor de esta sección. La firma de la app cambia en cada
			     build, así que macOS pide la contraseña del Mac la primera vez que se
			     abre una versión nueva. Avisado acá deja de ser un susto; denegado,
			     la nube deja de sincronizar en esta computadora sin decir por qué.
			     Este párrafo se borra el día que exista el certificado de Apple. -->
			<p class="text-muted-foreground text-xs">
				Al abrir la versión nueva, macOS te va a pedir la contraseña del Mac una vez. Es
				normal — tocá <span class="text-foreground font-medium">"Permitir siempre"</span>. Si
				la denegás, la nube deja de sincronizar en esta computadora.
			</p>
		</div>
	{/if}

	<!-- Plegado y con `<details>`, que ya sabe abrirse con teclado y lectores de
	     pantalla sin que nosotros pongamos una línea de JavaScript. -->
	{#if mine.length}
		<details class="text-sm">
			<summary class="text-muted-foreground hover:text-foreground cursor-pointer">
				Qué trajo tu versión ({updateStatus.current})
			</summary>
			<ul class="text-muted-foreground mt-1.5 flex list-disc flex-col gap-0.5 pl-4">
				{#each mine as nota (nota)}
					<li>{nota}</li>
				{/each}
			</ul>
		</details>
	{/if}
</section>
