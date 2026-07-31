<script>
	import { Download, X } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { MOTION, OFFSET, motionDuration } from '$lib/motion';
	import { DESKTOP_DOWNLOAD_URL, canShowDownloadPrompt, dismissDownloadPrompt } from './download';

	// A discreet, dismissible pointer to the desktop app, which is the only
	// build an MCP agent can talk to. It replaces the old PWA install card:
	// that one produced a look-alike app with its own icon that agents cannot
	// reach, so people installed it and then wondered why MCP never connected.
	//
	// The layout mounts this browser-side only and never inside Tauri, so it is
	// safe to read `window` straight away instead of waiting for an effect.
	//
	// Bottom-right, not bottom-left: unlike the old install card this one shows
	// on every first visit, and the sidebar's bottom-left corner holds the
	// snippet list and the Respaldo button, which it would sit on top of.
	let visible = $state(canShowDownloadPrompt(window));

	function dismiss() {
		visible = false;
		dismissDownloadPrompt(window);
	}
</script>

{#if visible}
	<div
		transition:fly={{ y: OFFSET.lg, duration: motionDuration(MOTION.overlay) }}
		class="border-border bg-popover text-popover-foreground fixed right-4 bottom-4 z-40 flex max-w-[min(25rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border p-3 shadow-lg"
		role="dialog"
		aria-label="Descargar la app de escritorio"
	>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-bold text-balance">¿Usás agentes de IA?</p>
			<p class="text-muted-foreground text-xs text-balance">Necesitás la app de escritorio.</p>
		</div>
		<a
			href={DESKTOP_DOWNLOAD_URL}
			target="_blank"
			rel="noopener noreferrer"
			onclick={dismiss}
			class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
		>
			<Download size={15} aria-hidden="true" />
			Descargar
		</a>
		<button
			type="button"
			onclick={dismiss}
			aria-label="Ahora no"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={16} aria-hidden="true" />
		</button>
	</div>
{/if}
