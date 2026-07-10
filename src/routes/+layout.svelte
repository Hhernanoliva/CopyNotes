<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher defaultMode="dark" />
<!-- Sonner reads these vars for toast surface colors; pointing them at the
     Quiet Ink tokens keeps toasts on-theme in both modes. -->
<Toaster
	theme={mode.current}
	position="bottom-center"
	duration={1800}
	style="--normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
/>

{@render children()}
