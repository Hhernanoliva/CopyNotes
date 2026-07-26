<script>
	import { X, Copy, Check } from '@lucide/svelte';
	import { SCALE_STEPS, DEFAULT_SCALE, nextScale } from '$lib/settings/text-scale';
	import { listRecentActivity } from '$lib/storage';
	import { reopenTask, addTaskNote } from '$lib/tasks';
	import { isTauriRuntime } from '$lib/platform';
	import { getMailboxPath, getServerPath, getAgentStatus } from '$lib/bridge/tauri';
	import {
		claudeCodeCommand,
		openCodeConfig,
		cursorConfig,
		cursorDeeplink
	} from '$lib/bridge/mcp-config';

	let { open = $bindable(false), scale, onChange, onDataChanged } = $props();

	let dialogEl = $state(null);
	let activity = $state([]);
	let redoFor = $state(null); // blockId currently being redone
	let redoText = $state('');
	let mailboxPath = $state(null);
	let serverPath = $state(null);
	let agentStatus = $state(null); // { lastSeen } | null
	let copiedField = $state(null); // 'path' | 'claude' | 'opencode' | 'cursor' | null
	let copyTimer;

	async function submitRedo(entry) {
		const text = redoText.trim();
		if (!text) return;
		await reopenTask({ blockId: entry.blockId, actor: 'user' });
		await addTaskNote({ blockId: entry.blockId, actor: 'user', text });
		redoFor = null;
		redoText = '';
		activity = await listRecentActivity(20);
		onDataChanged?.();
	}

	// Load the recent bitácora each time the dialog opens (read-only view), and
	// on desktop also the mailbox path for the MCP connection block below.
	$effect(() => {
		if (!open) return;
		listRecentActivity(20).then((rows) => (activity = rows));
		if (isTauriRuntime()) {
			getMailboxPath()
				.then((p) => (mailboxPath = p))
				.catch((error) => console.error('No se pudo obtener la carpeta del buzón', error));
			getServerPath()
				.then((p) => (serverPath = p))
				.catch((error) => console.error('No se pudo obtener la ruta del server MCP', error));
			getAgentStatus()
				.then((s) => (agentStatus = s))
				.catch((error) => console.error('No se pudo leer el estado del agente', error));
		}
	});
	$effect(() => () => clearTimeout(copyTimer));

	// Every per-client string is pre-filled with the app's real serverPath +
	// mailboxPath, so the user never edits a path by hand. Guarded on both being
	// present — the whole block hides until then.
	const paths = $derived(mailboxPath && serverPath ? { serverPath, mailboxPath } : null);
	const claudeCmd = $derived(paths ? claudeCodeCommand(paths) : '');
	const openCodeJson = $derived(paths ? openCodeConfig(paths) : '');
	const cursorJson = $derived(paths ? cursorConfig(paths) : '');
	const cursorLink = $derived(paths ? cursorDeeplink(paths) : '');

	function haceCuanto(iso) {
		const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
		if (s < 60) return 'hace instantes';
		const m = Math.floor(s / 60);
		if (m < 60) return `hace ${m} min`;
		const h = Math.floor(m / 60);
		if (h < 24) return `hace ${h} h`;
		const d = Math.floor(h / 24);
		return `hace ${d} d`;
	}

	const agentSignal = $derived(
		agentStatus?.lastSeen
			? `Un agente se conectó — ${haceCuanto(agentStatus.lastSeen)}`
			: 'Ningún agente conectado todavía'
	);

	function flashCopied(field) {
		clearTimeout(copyTimer);
		copiedField = field;
		copyTimer = setTimeout(() => (copiedField = null), 1200);
	}

	async function copyText(text, field) {
		if (!text) return;
		await navigator.clipboard.writeText(text);
		flashCopied(field);
	}

	const ACTION_LABEL = {
		created: 'creó una tarea',
		done: 'marcó hecha',
		reopened: 'reabrió',
		note: 'dejó una nota',
		edited: 'editó'
	};

	// Con la puerta única las acciones del usuario también entran al feed;
	// "Vos marcó hecha" no conjuga, así que el actor user tiene su propia tabla.
	const ACTION_LABEL_USER = {
		created: 'creaste una tarea',
		done: 'marcaste hecha',
		reopened: 'reabriste',
		note: 'dejaste una nota',
		edited: 'editaste'
	};

	function actionLabel(entry) {
		const labels = entry.actor === 'user' ? ACTION_LABEL_USER : ACTION_LABEL;
		return labels[entry.action] ?? entry.action;
	}

	function actorLabel(actor) {
		return actor === 'user' ? 'Vos' : 'Agente';
	}

	function timeLabel(at) {
		return new Date(at).toLocaleString('es');
	}

	const minScale = SCALE_STEPS[0];
	const maxScale = SCALE_STEPS[SCALE_STEPS.length - 1];

	const percent = $derived(Math.round(scale * 100));

	function step(direction) {
		const next = nextScale(scale, direction);
		if (next !== scale) onChange?.(next);
	}

	function reset() {
		if (scale !== DEFAULT_SCALE) onChange?.(DEFAULT_SCALE);
	}

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) dialogEl.showModal();
		else if (!open && dialogEl.open) dialogEl.close();
	});
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => (open = false)}
	aria-labelledby="settings-title"
	class="cn-dialog bg-background text-foreground border-border m-auto max-h-[85svh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border p-0 shadow-lg backdrop:bg-(--overlay)"
>
	<div class="bg-background sticky top-0 flex items-center justify-between border-b px-4 py-3">
		<h2 id="settings-title" class="text-sm font-bold">Configuración</h2>
		<button
			type="button"
			onclick={() => (open = false)}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
		>
			<X size={18} aria-hidden="true" />
		</button>
	</div>

	<div class="flex flex-col gap-5 px-4 py-4">
		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<h3 class="text-sm font-bold">Tamaño de texto</h3>
				<p class="text-muted-foreground text-sm">
					Cambia solo el tamaño del texto de tus notas.
				</p>
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={() => step(-1)}
					disabled={scale <= minScale}
					aria-label="Achicar texto"
					class="border-border text-foreground hover:bg-accent focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md border text-base font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-40"
				>
					A<span class="text-xs">−</span>
				</button>

				<div
					class="border-border flex h-(--touch-target) min-w-24 flex-1 items-center justify-center rounded-md border tabular-nums"
					aria-live="polite"
				>
					{#key scale}
						<span class="cn-pulse text-sm font-medium">{percent}%</span>
					{/key}
				</div>

				<button
					type="button"
					onclick={() => step(1)}
					disabled={scale >= maxScale}
					aria-label="Agrandar texto"
					class="border-border text-foreground hover:bg-accent focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md border text-lg font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-40"
				>
					A<span class="text-xs">+</span>
				</button>
			</div>

			<button
				type="button"
				onclick={reset}
				disabled={scale === DEFAULT_SCALE}
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-md text-sm underline underline-offset-2 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:no-underline disabled:opacity-40"
			>
				Restablecer
			</button>
		</section>

		<section class="flex flex-col gap-3">
			<div class="flex flex-col gap-0.5">
				<h3 class="text-sm font-bold">Agentes</h3>
				<p class="text-muted-foreground text-sm">Lo último que hicieron los agentes en tus tareas.</p>
			</div>

			{#if activity.length === 0}
				<p class="text-muted-foreground text-sm">Todavía no hay actividad de agentes.</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each activity as entry (entry.id)}
						<li class="border-border flex flex-col gap-0.5 rounded-md border px-3 py-2 text-sm">
							<span>
								<span class="font-medium">{actorLabel(entry.actor)}</span>
								{actionLabel(entry)}
							</span>
							{#if entry.text}
								<span class="text-muted-foreground">{entry.text}</span>
							{/if}
							<span class="text-faint text-xs">{timeLabel(entry.at)}</span>
							{#if entry.action === 'done' && entry.actor !== 'user'}
								{#if redoFor === entry.id}
									<div class="mt-1 flex items-center gap-2">
										<input
											bind:value={redoText}
											aria-label="Instrucción para rehacer"
											placeholder="Rehacer: …"
											class="border-border min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
										/>
										<button
											type="button"
											onclick={() => submitRedo(entry)}
											class="bg-primary text-primary-foreground rounded-md px-3 py-1 text-sm font-bold"
										>
											Enviar
										</button>
									</div>
								{:else}
									<button
										type="button"
										onclick={() => {
											redoFor = entry.id;
											redoText = '';
										}}
										class="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
									>
										Rehacer
									</button>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if isTauriRuntime()}
				{#if mailboxPath && serverPath}
					<div class="border-border flex flex-col gap-4 border-t pt-3">
						<div class="flex flex-col gap-0.5">
							<h4 class="text-sm font-bold">Conectar un agente (MCP)</h4>
							<p class="text-muted-foreground text-xs">El agente solo funciona con CopyNotes abierta.</p>
							<p class="text-muted-foreground text-sm">{agentSignal}</p>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-muted-foreground text-sm">Carpeta del buzón:</span>
							<div class="flex items-center gap-2">
								<code
									class="bg-muted text-foreground border-border min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs break-all"
									>{mailboxPath}</code
								>
								<button
									type="button"
									aria-label="Copiar carpeta del buzón"
									onclick={() => copyText(mailboxPath, 'path')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'path'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">Claude Code</span>
							<span class="text-muted-foreground text-xs">Pegá este comando en tu terminal una vez.</span>
							<div class="relative">
								<pre
									class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code
										>{claudeCmd}</code
									></pre>
								<button
									type="button"
									aria-label="Copiar comando de Claude Code"
									onclick={() => copyText(claudeCmd, 'claude')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'claude'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">OpenCode</span>
							<span class="text-muted-foreground text-xs"
								>Pegá esto en <code class="font-mono">~/.config/opencode/opencode.json</code>.</span
							>
							<div class="relative">
								<pre
									class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code
										>{openCodeJson}</code
									></pre>
								<button
									type="button"
									aria-label="Copiar configuración de OpenCode"
									onclick={() => copyText(openCodeJson, 'opencode')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'opencode'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<div class="flex flex-col gap-1">
							<span class="text-foreground text-sm font-semibold">Cursor</span>
							<span class="text-muted-foreground text-xs"
								>Un clic para agregarlo, o pegá el JSON en
								<code class="font-mono">~/.cursor/mcp.json</code>.</span
							>
							<a
								href={cursorLink}
								class="cn-tap bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
							>
								Añadir a Cursor
							</a>
							<div class="relative mt-1">
								<pre
									class="bg-muted overflow-x-auto rounded-md px-3 py-2 pr-9 font-mono text-xs leading-5"><code
										>{cursorJson}</code
									></pre>
								<button
									type="button"
									aria-label="Copiar configuración de Cursor"
									onclick={() => copyText(cursorJson, 'cursor')}
									class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring bg-background/80 absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
								>
									{#if copiedField === 'cursor'}
										<Check size={14} aria-hidden="true" class="text-primary" />
									{:else}
										<Copy size={14} aria-hidden="true" />
									{/if}
								</button>
							</div>
						</div>

						<p class="text-muted-foreground text-xs">Más detalles en la guía (tema 17).</p>
					</div>
				{/if}
			{:else}
				<p class="text-muted-foreground border-border border-t pt-3 text-sm">
					La conexión con agentes está disponible solo en la app de escritorio.
				</p>
			{/if}
		</section>
	</div>
</dialog>
