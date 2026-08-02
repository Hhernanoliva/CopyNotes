<script>
	import { tick } from 'svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { addDays, addMonths, monthGrid, monthLabel, resolveQuickOption, todayString } from '$lib/dates';
	import { keyboardInset } from '$lib/actions/keyboardInset';

	let { hasDate = false, current = null, onPick, onRemove, onClose } = $props();

	let firstEl = $state();
	let panelEl = $state();
	$effect(() => { firstEl?.focus(); });

	// Close when the user clicks anywhere outside the panel — otherwise a
	// click that moves focus away leaves the panel orphaned with a dead
	// Escape (its keydown only hears keys while focus is inside). Same
	// pattern as TagPicker. The badge stops pointerdown propagation so its
	// own click keeps toggling instead of close-then-reopen.
	$effect(() => {
		function handlePointerDown(event) {
			if (panelEl && !panelEl.contains(event.target)) onClose();
		}
		document.addEventListener('pointerdown', handlePointerDown);
		return () => document.removeEventListener('pointerdown', handlePointerDown);
	});

	// El almanaque es nuestro, no el `<input type="date">` del sistema. El campo
	// nativo no sirve para "elegir un día y listo": en iPhone escribe hoy apenas
	// se abre y avisa en cada giro de la ruedita, así que no hay forma de saber
	// cuándo el usuario terminó de elegir sin adivinar con tiempos. Acá un toque
	// en el día ES la elección. De paso, en Mac el campo nativo ni siquiera
	// muestra un almanaque: era un contador de números.
	const today = todayString();
	let showCalendar = $state(false);
	let month = $state(current ?? todayString());
	const weeks = $derived(monthGrid(month));
	// Un solo día del almanaque entra en el orden de Tab (el elegido, o hoy, o el
	// primero del mes que se esté mirando): adentro se camina con las flechas.
	const tabDay = $derived(
		weeks.flat().includes(current ?? today) ? (current ?? today) : month
	);

	function pickQuick(option) { onPick(resolveQuickOption(option, today)); }

	async function openCalendar() {
		showCalendar = true;
		await tick();
		panelEl.querySelector(`[data-day="${current ?? today}"]`)?.focus();
	}

	// Las flechas caminan el almanaque como se espera: ±1 día a los costados,
	// ±1 semana arriba y abajo. Si el día cae fuera de las 6 semanas dibujadas,
	// primero se cambia de mes y recién ahí se busca el botón.
	async function moveDay(from, delta) {
		const next = addDays(from, delta);
		if (!weeks.flat().includes(next)) {
			month = next;
			await tick();
		}
		panelEl.querySelector(`[data-day="${next}"]`)?.focus();
	}

	function keydown(e) {
		if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
		const day = document.activeElement?.dataset?.day;
		if (day) {
			const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
			if (delta === undefined) return;
			// Sin esto el editor mueve el cursor detrás del panel abierto.
			e.preventDefault();
			e.stopPropagation();
			moveDay(day, delta);
			return;
		}
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		// Roving focus through the panel's options; stop the editor's own
		// arrow navigation from moving the caret behind the open panel. Los días
		// quedan afuera: se entra al almanaque con Tab o abriéndolo, y adentro
		// mandan las flechas de arriba.
		e.preventDefault();
		e.stopPropagation();
		const items = [...panelEl.querySelectorAll('button:not([data-day]), input')];
		const index = items.indexOf(document.activeElement);
		const delta = e.key === 'ArrowDown' ? 1 : -1;
		items[(index + delta + items.length) % items.length]?.focus();
	}

	const restOptions = [
		['tomorrow', 'Mañana'],
		['next-week', 'Próxima semana']
	];
	const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
	const fullDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });
	function dayLabel(day) {
		const [y, m, d] = day.split('-').map(Number);
		return fullDay.format(new Date(y, m - 1, d));
	}
	const optionClass =
		'hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none';
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={panelEl}
	use:keyboardInset
	role="dialog"
	aria-label="Fecha del renglón"
	tabindex="-1"
	onkeydown={keydown}
	onmousedown={(e) => e.stopPropagation()}
	class="cn-pop bg-popover border-border flex w-56 flex-col gap-0.5 rounded-md border p-1 shadow-lg max-md:w-[20.5rem]"
>
	{#if showCalendar}
		<!-- El almanaque REEMPLAZA a los atajos en vez de sumarse: con los dos, el
		     panel medía más que la pantalla visible de un celular con el teclado
		     abierto y no había dónde ponerlo (ni abajo ni arriba). Escape vuelve
		     al renglón; reabriendo se ven de nuevo los atajos. -->
		<div class="flex items-center justify-between gap-1">
			<button
				type="button"
				aria-label="Mes anterior"
				onclick={() => (month = addMonths(month, -1))}
				class="hover:bg-accent focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<ChevronLeft size={16} aria-hidden="true" />
			</button>
			<span aria-live="polite" class="text-sm font-medium">{monthLabel(month)}</span>
			<button
				type="button"
				aria-label="Mes siguiente"
				onclick={() => (month = addMonths(month, 1))}
				class="hover:bg-accent focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<ChevronRight size={16} aria-hidden="true" />
			</button>
		</div>
		<div class="grid grid-cols-7 gap-0.5" role="group" aria-label="Elegir día">
			{#each weekdays as weekday, index (index)}
				<span class="text-faint flex size-7 items-center justify-center text-[0.625rem] max-md:h-6 max-md:w-11" aria-hidden="true">{weekday}</span>
			{/each}
			{#each weeks as week, weekIndex (weekIndex)}
				{#each week as day (day)}
					<button
						type="button"
						data-day={day}
						aria-label={dayLabel(day)}
						aria-current={day === current ? 'date' : undefined}
						tabindex={day === tabDay ? 0 : -1}
						onclick={() => onPick(day)}
						class="focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm text-xs focus-visible:ring-2 focus-visible:outline-none max-md:size-11 max-md:text-sm {day ===
						current
							? 'bg-primary text-primary-foreground'
							: day === today
								? 'text-primary font-medium'
								: day.slice(0, 7) === month.slice(0, 7)
									? 'hover:bg-accent'
									: 'text-faint hover:bg-accent'}"
					>{Number(day.slice(8))}</button>
				{/each}
			{/each}
		</div>
	{:else}
		<button bind:this={firstEl} type="button" onclick={() => pickQuick('today')} class={optionClass}>Hoy</button>
		{#each restOptions as [option, label] (option)}
			<button type="button" onclick={() => pickQuick(option)} class={optionClass}>{label}</button>
		{/each}
		<button type="button" onclick={openCalendar} class={optionClass}>Elegir día…</button>
	{/if}

	{#if hasDate}
		<button
			type="button"
			onclick={onRemove}
			class="text-destructive hover:bg-accent focus-visible:ring-ring rounded-sm px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
		>Quitar fecha</button>
	{/if}
</div>
