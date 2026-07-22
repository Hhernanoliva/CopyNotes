<script>
	import { tooltip } from '$lib/actions/tooltip';
	let { label, shortcut = '', active = false, disabled = false, onActivate, children } = $props();
	const tip = $derived(shortcut ? `${label} · ${shortcut}` : label);
</script>

<button
	type="button"
	aria-label={label}
	aria-pressed={active}
	{disabled}
	use:tooltip={tip}
	onmousedown={(e) => e.preventDefault()}
	onclick={onActivate}
	class="cn-tap flex size-8 items-center justify-center rounded-md text-sm transition-colors
		disabled:pointer-events-none disabled:opacity-40
		{active
			? 'bg-primary/20 text-primary font-semibold underline underline-offset-2'
			: 'text-popover-foreground hover:bg-accent'}
		focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
>
	{@render children()}
</button>
