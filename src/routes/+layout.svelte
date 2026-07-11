<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, mode, setMode } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { getTheme } from '$lib/storage';
	import { browserThemeColors } from '$lib/theme/browser-colors';

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

{@render children()}
