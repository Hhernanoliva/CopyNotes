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
	import {
		cloudConfigured,
		currentSession,
		emailCodeLogin,
		requestCode,
		signInWithCode,
		signInWithPassword,
		signUpWithPassword,
		signOut
	} from '$lib/sync/supabase';
	import { createVault, hasVault } from '$lib/sync/vault';
	import { countPendingUploads, grantUploadConsent, hasUploadConsent } from '$lib/sync/pending';
	import { cloudVaultExists, syncNow } from '$lib/sync/upload';
	import { syncStatus } from '$lib/sync/status.svelte';

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

	// --- Nube (spec 030 fase 2) -------------------------------------------------
	// Four things decide what the user sees, in this order: is there a project, a
	// session, a vault, and consent. Each one is a separate screen so nothing ever
	// asks for two decisions at once.
	let cloudSession = $state(null);
	let vaultReady = $state(false);
	let consentGiven = $state(false);
	let cloudEmail = $state('');
	let cloudCode = $state('');
	let cloudPassword = $state('');
	let codeSent = $state(false);
	let cloudBusy = $state(false);
	let cloudError = $state(null);
	// Shown once, right after the vault is created, and never again.
	let recoveryCode = $state(null);
	let recoverySaved = $state(false);

	async function refreshCloud() {
		if (!cloudConfigured()) return;
		cloudSession = await currentSession();
		vaultReady = await hasVault();
		consentGiven = await hasUploadConsent();
		syncStatus.pending = await countPendingUploads();
	}

	// Every cloud button funnels through here: one place that shows the spinner
	// state, catches the failure and puts the message on screen instead of in the
	// console.
	async function cloudAction(run) {
		cloudBusy = true;
		cloudError = null;
		try {
			await run();
			await refreshCloud();
		} catch (error) {
			cloudError = error instanceof Error ? error.message : 'No se pudo completar la operación.';
		} finally {
			cloudBusy = false;
		}
	}

	function sendCode() {
		return cloudAction(async () => {
			await requestCode(cloudEmail.trim());
			codeSent = true;
		});
	}

	function enterCode() {
		return cloudAction(async () => {
			await signInWithCode(cloudEmail.trim(), cloudCode);
			cloudCode = '';
			codeSent = false;
		});
	}

	// Password mode: two explicit buttons instead of guessing whether the account
	// exists. Guessing turns a typo in the password into "creating an account",
	// and the error message stops being true.
	function enterWithPassword() {
		return cloudAction(async () => {
			await signInWithPassword(cloudEmail.trim(), cloudPassword);
			cloudPassword = '';
		});
	}

	function createWithPassword() {
		return cloudAction(async () => {
			await signUpWithPassword(cloudEmail.trim(), cloudPassword);
			cloudPassword = '';
		});
	}

	function makeVault() {
		return cloudAction(async () => {
			// Two vaults on one account = records nobody can read on both devices.
			if (await cloudVaultExists()) {
				throw new Error(
					'Esta cuenta ya tiene una bóveda creada en otro dispositivo. Abrir tus notas en un segundo dispositivo llega en el próximo paso; por ahora seguí usando el dispositivo original.'
				);
			}
			const { recoveryCode: code } = await createVault();
			recoveryCode = code;
			recoverySaved = false;
		});
	}

	function allowUpload() {
		return cloudAction(async () => {
			await grantUploadConsent();
			await syncNow();
		});
	}

	function leaveCloud() {
		return cloudAction(async () => {
			await signOut();
			cloudSession = null;
			codeSent = false;
			cloudCode = '';
		});
	}

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
		refreshCloud().catch((error) => console.error('No se pudo leer el estado de la nube', error));
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
				<h3 class="text-sm font-bold">Nube</h3>
				<p class="text-muted-foreground text-sm">
					Tus notas en más de un dispositivo. Se cifran acá, antes de salir: el servidor
					guarda algo que no puede leer. Sin cuenta, CopyNotes funciona igual.
				</p>
			</div>

			{#if !cloudConfigured()}
				<p class="text-muted-foreground text-sm">
					Esta copia de CopyNotes no tiene una nube configurada.
				</p>
			{:else if recoveryCode}
				<!-- Shown once and never again. It has priority over every other cloud
				     screen: nothing else may distract from writing this down. -->
				<div class="border-border flex flex-col gap-3 rounded-md border p-3">
					<h4 class="text-sm font-bold">Tu código de recuperación</h4>
					<div class="flex items-center gap-2">
						<code
							class="bg-muted text-foreground border-border min-w-0 flex-1 rounded border px-2 py-2 text-center font-mono text-sm tracking-widest break-all"
							>{recoveryCode}</code
						>
						<button
							type="button"
							aria-label="Copiar código de recuperación"
							onclick={() => copyText(recoveryCode, 'recovery')}
							class="cn-tap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
						>
							{#if copiedField === 'recovery'}
								<Check size={14} aria-hidden="true" class="text-primary" />
							{:else}
								<Copy size={14} aria-hidden="true" />
							{/if}
						</button>
					</div>
					<p class="text-destructive text-sm">
						Guardalo ahora en un lugar seguro. Es lo único que recupera tus notas en otro
						dispositivo. Nadie más lo tiene: si lo perdés junto con tus dispositivos, tus notas
						no se pueden recuperar, ni por nosotros ni por el servidor.
					</p>
					<label class="text-muted-foreground flex items-center gap-2 text-sm">
						<button
							type="button"
							role="checkbox"
							aria-checked={recoverySaved}
							aria-label="Ya guardé el código"
							onclick={() => (recoverySaved = !recoverySaved)}
							class="focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
						>
							<span
								aria-hidden="true"
								class="border-border flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--motion-fast) {recoverySaved
									? 'bg-primary border-primary text-primary-foreground'
									: 'bg-transparent'}"
							>
								{#if recoverySaved}
									<Check size={12} />
								{/if}
							</span>
						</button>
						Ya lo guardé
					</label>
					<button
						type="button"
						disabled={!recoverySaved}
						onclick={() => (recoveryCode = null)}
						class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						Continuar
					</button>
				</div>
			{:else if !cloudSession}
				<div class="flex flex-col gap-2">
					<label class="text-muted-foreground text-sm" for="cloud-email">Tu email</label>
					<input
						id="cloud-email"
						type="email"
						autocomplete="email"
						bind:value={cloudEmail}
						placeholder="vos@ejemplo.com"
						class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none"
					/>

					{#if !emailCodeLogin()}
						<!-- Password mode: the default, because it needs no mail provider.
						     The code-by-email block below is the same feature with a mail
						     provider behind it; PUBLIC_SUPABASE_EMAIL_CODE picks one. -->
						<label class="text-muted-foreground mt-1 text-sm" for="cloud-password">Contraseña</label
						>
						<input
							id="cloud-password"
							type="password"
							autocomplete="current-password"
							bind:value={cloudPassword}
							placeholder="········"
							class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-sm outline-none"
						/>
						<div class="mt-1 flex items-center gap-2">
							<button
								type="button"
								onclick={enterWithPassword}
								disabled={cloudBusy || !cloudEmail.trim() || !cloudPassword}
								class="bg-primary text-primary-foreground focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Entrar
							</button>
							<button
								type="button"
								onclick={createWithPassword}
								disabled={cloudBusy || !cloudEmail.trim() || !cloudPassword}
								class="border-border text-foreground hover:bg-accent focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Crear cuenta
							</button>
						</div>
						<p class="text-faint text-xs">
							La primera vez, "Crear cuenta". Guardá la contraseña donde guardás las demás: por
							ahora no hay "olvidé mi contraseña".
						</p>
					{:else}
						<button
							type="button"
							onclick={sendCode}
							disabled={cloudBusy || !cloudEmail.trim()}
							class="bg-primary text-primary-foreground focus-visible:ring-ring mt-1 self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
						>
							{codeSent ? 'Reenviar' : 'Enviar código'}
						</button>
					{/if}

					{#if codeSent}
						<p class="text-muted-foreground text-sm">
							Te mandamos un código de 6 dígitos. Escribilo acá abajo (vence en 10 minutos).
						</p>
						<div class="flex items-center gap-2">
							<input
								id="cloud-code"
								inputmode="numeric"
								autocomplete="one-time-code"
								bind:value={cloudCode}
								aria-label="Código de 6 dígitos"
								placeholder="000000"
								class="border-border min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 font-mono text-sm tracking-widest outline-none"
							/>
							<button
								type="button"
								onclick={enterCode}
								disabled={cloudBusy || cloudCode.trim().length < 6}
								class="bg-primary text-primary-foreground focus-visible:ring-ring shrink-0 rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Entrar
							</button>
						</div>
					{/if}
				</div>
			{:else if !vaultReady}
				<div class="flex flex-col gap-2">
					<p class="text-muted-foreground text-sm">
						Entraste como <span class="text-foreground font-medium">{cloudSession.user.email}</span
						>. Falta crear la bóveda: la llave que cifra tus notas y que solo existe en este
						dispositivo.
					</p>
					<button
						type="button"
						onclick={makeVault}
						disabled={cloudBusy}
						class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						Crear bóveda
					</button>
				</div>
			{:else if !consentGiven}
				<div class="flex flex-col gap-2">
					<p class="text-foreground text-sm">
						Hasta que lo permitas, nada salió de este dispositivo.
					</p>
					<p class="text-muted-foreground text-sm">
						Si lo permitís, se sube <span class="text-foreground">todo</span> lo que escribís
						—notas, renglones, comentarios, fechas, etiquetas, snippets y la bitácora— siempre
						cifrado: el servidor guarda letras y números que no puede leer, y nosotros tampoco.
					</p>
					<p class="text-muted-foreground text-sm">
						Lo que el servidor igual ve: que tenés una cuenta, tu email, tu conexión, cuántos
						registros hay, cuánto pesan y a qué hora sincronizás.
					</p>
					<button
						type="button"
						onclick={allowUpload}
						disabled={cloudBusy}
						class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						Permitir y subir
					</button>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					<p class="text-muted-foreground text-sm">
						Cuenta: <span class="text-foreground font-medium">{cloudSession.user.email}</span>
					</p>
					<p class="text-sm" aria-live="polite">
						{#if syncStatus.uploading}
							Subiendo…
						{:else if syncStatus.pending === 0}
							Todo subido.
						{:else}
							{syncStatus.pending} {syncStatus.pending === 1 ? 'cambio' : 'cambios'} sin subir.
						{/if}
						{#if syncStatus.lastUploadAt}
							<span class="text-faint">Última subida {haceCuanto(syncStatus.lastUploadAt)}.</span>
						{/if}
					</p>
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => cloudAction(syncNow)}
							disabled={cloudBusy || syncStatus.uploading}
							class="border-border text-foreground hover:bg-accent focus-visible:ring-ring rounded-md border px-3 py-1.5 text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
						>
							Sincronizar ahora
						</button>
						<button
							type="button"
							onclick={leaveCloud}
							disabled={cloudBusy}
							class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm underline underline-offset-2 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
						>
							Cerrar sesión
						</button>
					</div>
				</div>
			{/if}

			{#if cloudError}
				<p role="alert" class="text-destructive text-sm">{cloudError}</p>
			{/if}
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
