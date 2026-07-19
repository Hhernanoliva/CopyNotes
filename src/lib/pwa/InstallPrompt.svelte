<script>
	import { Download, X } from '@lucide/svelte';
	import { fly } from 'svelte/transition';
	import { MOTION, OFFSET, motionDuration } from '$lib/motion';

	// A discreet, dismissible install suggestion. The browser fires
	// `beforeinstallprompt` only when the app actually qualifies for install;
	// we hold onto it and surface a quiet card instead of a native banner. Once
	// dismissed, it stays gone (remembered per device) so it never nags.
	const DISMISS_KEY = 'copynotes-install-dismissed';

	let deferred = $state(null);
	let visible = $state(false);

	$effect(() => {
		const onPrompt = (event) => {
			event.preventDefault();
			try {
				if (localStorage.getItem(DISMISS_KEY)) return;
			} catch {
				// Private mode may block storage; still offer the prompt.
			}
			deferred = event;
			visible = true;
		};
		const onInstalled = () => {
			visible = false;
			deferred = null;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	async function install() {
		if (!deferred) return;
		deferred.prompt();
		await deferred.userChoice;
		deferred = null;
		visible = false;
	}

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// Ignore: worst case it may suggest again next session.
		}
	}
</script>

{#if visible}
	<div
		transition:fly={{ y: OFFSET.lg, duration: motionDuration(MOTION.overlay) }}
		class="border-border bg-popover text-popover-foreground fixed bottom-4 left-4 z-40 flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-3 rounded-lg border p-3 shadow-lg"
		role="dialog"
		aria-label="Instalar CopyNotes"
	>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-bold">Instalá CopyNotes</p>
			<p class="text-muted-foreground text-xs">Úsala como una app, también sin conexión.</p>
		</div>
		<button
			type="button"
			onclick={install}
			class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
		>
			<Download size={15} aria-hidden="true" />
			Instalar
		</button>
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
