<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { browser } from '$app/environment';
	import { ModeWatcher, mode, setMode } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { getTheme } from '$lib/storage';
	import { startTodayClock } from '$lib/dates';
	import { browserThemeColors } from '$lib/theme/browser-colors';
	import { isTauriRuntime } from '$lib/platform';
	import PwaLifecycle from '$lib/pwa/PwaLifecycle.svelte';
	import InstallPrompt from '$lib/pwa/InstallPrompt.svelte';
	import TauriLifecycle from '$lib/desktop/TauriLifecycle.svelte';

	let { children } = $props();

	// ModeWatcher applies the stored browser preference before first paint. The
	// local database remains the product source of truth for this preference.
	$effect(() => {
		let cancelled = false;
		getTheme()
			.then((savedTheme) => {
				if (!cancelled && (savedTheme === 'dark' || savedTheme === 'light')) setMode(savedTheme);
			})
			.catch(() => {
				// Keep the dark default if browser storage is temporarily unavailable.
			});
		return () => {
			cancelled = true;
		};
	});

	// App-wide day clock: rolls date labels and the Agenda over at midnight
	// without a reload. Cleanup clears the timer and listeners.
	$effect(() => startTodayClock());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher
	defaultMode="dark"
	disableTransitions={false}
	modeStorageKey="copynotes-theme"
	themeColors={browserThemeColors}
/>
<!-- Sonner reads these vars for toast surface colors; pointing them at the
     Quiet Ink tokens keeps toasts on-theme in both modes. -->
<Toaster
	theme={mode.current}
	position="bottom-center"
	duration={1800}
	style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
/>
<a
	href="#contenido-principal"
	class="bg-popover text-popover-foreground focus-visible:ring-ring sr-only fixed top-3 left-3 z-50 rounded-md px-3 py-2 text-sm font-bold focus:not-sr-only focus-visible:ring-2 focus-visible:outline-none"
>
	Saltar al editor
</a>

<!-- Service worker + install prompt are browser-only: never instantiate them
     during prerender/SSR, where useRegisterSW would touch navigator. -->
{#if browser && !isTauriRuntime()}
	<PwaLifecycle />
	<InstallPrompt />
{/if}

<!-- Desktop-only: route the native window close through the pending-write
     barrier so quitting can never race a delayed save. -->
{#if browser && isTauriRuntime()}
	<TauriLifecycle />
{/if}

{@render children()}
