<script>
	import { X, Copy, Check } from '@lucide/svelte';
	import { SCALE_STEPS, DEFAULT_SCALE, nextScale } from '$lib/settings/text-scale';
	import { listRecentActivity, getAgentsPaused, setAgentsPaused } from '$lib/storage';
	import { redoTask } from '$lib/tasks';
	import { isTauriRuntime } from '$lib/platform';
	import { DESKTOP_DOWNLOAD_URL, DESKTOP_RELEASE_PUBLISHED } from '$lib/desktop/download';
	import { getMailboxPath, getServerPath, getAgentStatus } from '$lib/bridge/tauri';
	import { agentData } from '$lib/bridge/signal.svelte';
	import {
		claudeCodeCommand,
		openCodeConfig,
		cursorConfig,
		cursorDeeplink,
		isAgentActive
	} from '$lib/bridge/mcp-config';
	import {
		cloudConfigured,
		completeGoogleSignIn,
		currentSession,
		emailCodeLogin,
		requestCode,
		signInWithCode,
		signInWithGoogle,
		signInWithPassword,
		signUpWithPassword
	} from '$lib/sync/supabase';
	import { signInWithGoogleDesktop } from '$lib/sync/google-desktop';
	import {
		cleanOAuthUrl,
		oauthCode,
		oauthErrorMessage,
		oauthFlowId
	} from '$lib/sync/oauth-return';
	import { forgetCloudAccount, resetCloud } from '$lib/sync/leave';
	import { createVault, hasVault } from '$lib/sync/vault';
	import { joinWithPairingCode, startPairing } from '$lib/sync/pairing';
	import { countPendingUploads, grantUploadConsent, hasUploadConsent } from '$lib/sync/pending';
	import { cloudVaultExists, syncNow } from '$lib/sync/upload';
	import { downloadAll } from '$lib/sync/download';
	import { countConflicts } from '$lib/sync/conflicts';
	import { syncStatus } from '$lib/sync/status.svelte';
	import { haceCuanto } from '$lib/relative-time';

	let { open = $bindable(false), scale, onChange, onDataChanged, onShowStatus } = $props();

	let dialogEl = $state(null);
	let activity = $state([]);
	let redoFor = $state(null); // blockId currently being redone
	let redoText = $state('');
	let redoError = $state(null);
	let agentsPaused = $state(false);
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
	let accountHasVault = $state(false);
	let consentGiven = $state(false);
	let pairCode = $state('');
	// El código que este aparato le muestra a otro, mientras está en pantalla.
	let pairingCode = $state(null);
	let pairingExpiresAt = $state(null);
	let clockTick = $state(0);
	// La palabra escrita a mano que habilita el botón rojo de empezar de nuevo.
	let resetWord = $state('');
	// { applied } while the first full download runs, null otherwise.
	let downloading = $state(null);
	let cloudEmail = $state('');
	let cloudCode = $state('');
	let cloudPassword = $state('');
	let codeSent = $state(false);
	let cloudBusy = $state(false);
	let cloudError = $state(null);
	let googleWaiting = $state(false);

	// Este aparato tiene una llave que la cuenta no acepta —la bóveda de otro llegó
	// primero—, o le están llegando notas cerradas con otra llave, que es la misma
	// historia contada desde el otro lado. Sin esto, la pantalla avisa del problema
	// y no ofrece ninguna salida: el callejón diagnosticado el 2026-08-07.
	//
	// Se mira la línea de estado y no `cloudError` porque ahí es donde caen: la
	// sincronización no lanza sus fallos, los publica (`sync/upload.ts`). Y por eso
	// mismo se limpia sola, en la primera pasada que sale bien.
	const vaultRejected = $derived(
		/ya tiene una bóveda|se cifraron con otra llave/i.test(
			`${syncStatus.error ?? ''} ${cloudError ?? ''}`
		)
	);

	async function refreshCloud() {
		if (!cloudConfigured()) return;
		cloudSession = await currentSession();
		vaultReady = await hasVault();
		consentGiven = await hasUploadConsent();
		syncStatus.pending = await countPendingUploads();
		syncStatus.conflicts = await countConflicts();
		// Only worth asking the server when this device has no vault of its own:
		// the answer decides between "create one" and "join the one that exists".
		accountHasVault = vaultReady || (cloudSession ? await cloudVaultExists() : false);
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

	// La vuelta de Google cae en la raíz de la app con `?code=...` (spec 034).
	// El código se lee ANTES de limpiar la barra —limpiarla es justamente lo que
	// lo vuelve ilegible— y se canjea acá, a mano, para que un canje fallido diga
	// por qué en vez de dejar el formulario de siempre en pantalla sin una
	// palabra. Configuración se abre sola porque de acá se fue la persona, y acá
	// tiene que aterrizar: con la cuenta adentro, o con el motivo.
	$effect(() => {
		const href = window.location.href;
		const cleaned = cleanOAuthUrl(href);
		if (cleaned === href) return;
		const code = oauthCode(href);
		const flowId = oauthFlowId(href);
		const refusal = oauthErrorMessage(href);
		// El router de SvelteKit no interviene: la app es una sola página
		// prerenderizada y lo único que cambia es la barra de direcciones.
		window.history.replaceState(window.history.state, '', cleaned);
		open = true;
		if (!code || !cloudConfigured()) {
			cloudError = refusal;
			return;
		}
		cloudAction(() => completeGoogleSignIn(code, flowId));
	});

	function enterWithGoogle() {
		return cloudAction(async () => {
			if (!isTauriRuntime()) {
				// La pestaña se va a Google acá adentro; lo que sigue pasa a la vuelta,
				// en el efecto de arriba.
				await signInWithGoogle();
				return;
			}
			// En la .app el viaje pasa por afuera: se abre el navegador de la persona
			// y esta llamada se queda esperando la vuelta —hasta tres minutos—, así
			// que el botón dice qué está esperando en vez de quedarse apagado.
			googleWaiting = true;
			try {
				await signInWithGoogleDesktop();
			} finally {
				googleWaiting = false;
			}
		});
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
			// When one already exists, this device joins it instead (below).
			if (await cloudVaultExists()) {
				accountHasVault = true;
				throw new Error(
					'Esta cuenta ya tiene una bóveda: sumá este aparato con el código que muestra el otro.'
				);
			}
			// One button, both halves. Consent goes first because `createVault`
			// refuses without it — and because if the second half fails, having said
			// yes with no key is harmless, while a key that may not be uploaded is
			// the bug this closes (sync/vault.ts spells it out).
			await grantUploadConsent();
			consentGiven = true;
			await createVault();
			// Not awaited: nada de esto tiene que esperar a una primera subida
			// entera. `syncNow` nunca lanza —los fallos van a la línea de estado—
			// así que no se traga nada.
			syncNow();
		});
	}

	// El aparato nuevo: la llave está arriba envuelta con el código que muestra el
	// otro aparato, y vence a los diez minutos. Un código equivocado falla adentro
	// de `joinWithPairingCode` y no deja nada.
	function joinWithCode() {
		return cloudAction(async () => {
			await joinWithPairingCode(pairCode.trim());
			pairCode = '';
			// El problema que la línea de estado estaba reportando se acaba de
			// resolver: dejarlo escrito mandaría a esta pantalla de vuelta al mismo
			// cartel con la llave ya adentro.
			syncStatus.error = null;
			downloading = { applied: 0 };
			try {
				const result = await downloadAll({
					onProgress: (progress) => (downloading = progress)
				});
				downloading = null;
				onDataChanged?.();
				if (!result.applied) {
					throw new Error('La bóveda se abrió, pero todavía no había notas guardadas en la nube.');
				}
			} finally {
				downloading = null;
			}
		});
	}

	// El aparato que ya tiene la llave: muestra ocho caracteres que valen diez
	// minutos. Pedir otro pisa al anterior, así que el que está en pantalla es
	// siempre el único que sirve.
	function showPairingCode() {
		return cloudAction(async () => {
			const { code, expiresAt } = await startPairing();
			pairingCode = code;
			pairingExpiresAt = expiresAt;
		});
	}

	// Cuánto le queda al código, en minutos. Es cortesía de la pantalla: la regla
	// la aplica el servidor, que esconde la fila vencida hasta de su propio dueño.
	const pairingLeft = $derived(
		pairingExpiresAt
			? Math.max(0, Math.ceil((new Date(pairingExpiresAt).getTime() - clockTick) / 60_000))
			: 0
	);

	// Un reloj sólo mientras hay código en pantalla, y ninguno el resto del tiempo.
	$effect(() => {
		if (!pairingCode) return;
		clockTick = Date.now();
		const timer = setInterval(() => (clockTick = Date.now()), 30_000);
		return () => clearInterval(timer);
	});

	function startCloudOver() {
		return cloudAction(async () => {
			await resetCloud();
			resetWord = '';
			pairingCode = null;
			pairingExpiresAt = null;
			syncStatus.error = null;
			onDataChanged?.();
		});
	}

	function allowUpload() {
		return cloudAction(async () => {
			await grantUploadConsent();
			await syncNow();
		});
	}

	// Two steps, like "Reemplazar todo" in Respaldo: leaving drops the vault key,
	// and if the recovery code was never written down and this is the only
	// device, what is already in the cloud stops being readable by anyone. The
	// notes on this device are never at risk, and saying so is half the warning.
	let confirmingLeave = $state(false);

	function leaveCloud() {
		return cloudAction(async () => {
			await forgetCloudAccount();
			confirmingLeave = false;
			cloudSession = null;
			codeSent = false;
			cloudCode = '';
			await refreshCloud();
		});
	}

	// El corte de emergencia. La re-exportación la dispara `setAgentsPaused` sola
	// (storage/settings.ts), pase o no pase la escritura, así que acá no queda
	// nada que se pueda saltear. Al final volvemos a leer el estado real: la
	// pantalla dice lo que quedó, no lo que pedimos.
	async function toggleAgentsPaused() {
		const next = !agentsPaused;
		agentsPaused = next;
		try {
			await setAgentsPaused(next);
		} catch (error) {
			console.error('No se pudo guardar la pausa de agentes', error);
		}
		agentsPaused = await getAgentsPaused().catch(() => agentsPaused);
	}

	async function submitRedo(entry) {
		const text = redoText.trim();
		if (!text) return;
		redoError = null;
		// One write: the task reopens WITH its instruction or neither happens.
		// On failure the panel stays open with the text typed, so the retry costs
		// nothing.
		try {
			await redoTask({ blockId: entry.blockId, actor: 'user', text });
		} catch {
			redoError = 'No se pudo enviar el pedido. Probá de nuevo.';
			return;
		}
		redoFor = null;
		redoText = '';
		activity = await listRecentActivity(20);
		onDataChanged?.();
	}

	// Load the recent bitácora each time the dialog opens (read-only view), and
	// on desktop also the mailbox path for the MCP connection block below.
	$effect(() => {
		if (!open) return;
		// A danger step must never be waiting where somebody left it: reopening
		// Configuración should not land on "Sí, cerrar sesión".
		confirmingLeave = false;
		listRecentActivity(20).then((rows) => (activity = rows));
		refreshCloud().catch((error) => console.error('No se pudo leer el estado de la nube', error));
		if (isTauriRuntime()) {
			getAgentsPaused()
				.then((paused) => (agentsPaused = paused))
				.catch((error) => console.error('No se pudo leer si los agentes están pausados', error));
			getMailboxPath()
				.then((p) => (mailboxPath = p))
				.catch((error) => console.error('No se pudo obtener la carpeta del buzón', error));
			getServerPath()
				.then((p) => (serverPath = p))
				.catch((error) => console.error('No se pudo obtener la ruta del server MCP', error));
			// The card reads a file the agent stamps; nothing pushes when one
			// connects. Read on a timer while the dialog is open — that is exactly
			// when someone is wiring a client up and watching this line, and a
			// single read at open time left it saying "ningún agente" forever.
			const readAgentStatus = () =>
				getAgentStatus()
					.then((s) => (agentStatus = s))
					.catch((error) => console.error('No se pudo leer el estado del agente', error));
			readAgentStatus();
			const statusTimer = setInterval(readAgentStatus, 10_000);
			return () => clearInterval(statusTimer);
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

	// Activity, not presence: see `isAgentActive` for why the old wording lied.
	const agentSignal = $derived(
		!agentStatus?.lastSeen
			? 'Ningún agente se conectó todavía'
			: isAgentActive(agentStatus.lastSeen)
				? `Un agente está usando CopyNotes — ${haceCuanto(agentStatus.lastSeen)}`
				: `Sin actividad de agentes — la última, ${haceCuanto(agentStatus.lastSeen)}`
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

	function requestClose() {
		open = false;
	}

	const ACTION_LABEL = {
		created: 'creó una tarea',
		done: 'marcó hecha',
		reopened: 'reabrió',
		note: 'dejó una nota'
	};

	// Con la puerta única las acciones del usuario también entran al feed;
	// "Vos marcó hecha" no conjuga, así que el actor user tiene su propia tabla.
	const ACTION_LABEL_USER = {
		created: 'creaste una tarea',
		done: 'marcaste hecha',
		reopened: 'reabriste',
		note: 'dejaste una nota'
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
			onclick={requestClose}
			aria-label="Cerrar"
			class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex size-(--touch-target) items-center justify-center rounded-md transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
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
					Tus notas en más de un dispositivo. Se cifran acá, antes de salir: al servidor
					llega texto cifrado y la llave que lo abre se queda en tus dispositivos. Sin
					cuenta, CopyNotes funciona igual.
				</p>
			</div>

			{#if !cloudConfigured()}
				<p class="text-muted-foreground text-sm">
					Esta copia de CopyNotes no tiene una nube configurada.
				</p>
			{:else if !cloudSession}
				<div class="flex flex-col gap-2">
					<!-- Google da la puerta, no la llave (spec 034). Va primero, y primero
					     también en el orden del teclado: es el camino corto, y el email
					     con contraseña queda como red. En la .app el botón hace lo mismo
					     por otro camino: abre el navegador de la persona, porque adentro
					     de la ventana no habría barra de direcciones para volver. -->
					<button
						type="button"
						onclick={enterWithGoogle}
						disabled={cloudBusy}
						class="border-border text-foreground hover:bg-accent focus-visible:ring-ring flex min-h-10 items-center justify-center gap-3 rounded-md border px-3 py-2 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						<!-- La "G" es de Google y sus reglas de marca prohíben recolorearla,
						     así que va con sus colores fijos en los dos temas. Inline, no un
						     archivo remoto: la CSP no deja salir a buscar imágenes. -->
						<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
							<path
								fill="#4285F4"
								d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
							/>
							<path
								fill="#34A853"
								d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z"
							/>
							<path
								fill="#FBBC05"
								d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1022-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z"
							/>
							<path
								fill="#EA4335"
								d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
							/>
						</svg>
						{googleWaiting ? 'Esperando a tu navegador…' : 'Continuar con Google'}
					</button>
					<div class="text-faint flex items-center gap-2 text-xs" aria-hidden="true">
						<span class="bg-border h-px flex-1"></span>
						o
						<span class="bg-border h-px flex-1"></span>
					</div>

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
			{:else if (!vaultReady || vaultRejected) && accountHasVault}
				<!-- El aparato nuevo. La llave está arriba envuelta con el código que el
				     otro aparato muestra en pantalla, y sin ese código lo de arriba es
				     ruido. `vaultRejected` entra en la condición porque un aparato con
				     una bóveda que la cuenta no acepta necesita esta misma salida: sin
				     eso, la pantalla le avisaba del problema y no le ofrecía ninguna. -->
				<div class="flex flex-col gap-2">
					<p class="text-muted-foreground text-sm">
						Esta cuenta ya tiene notas guardadas. Para abrirlas acá, pedile el código al aparato
						donde ya las tenés:
						<span class="text-foreground font-medium">Configuración › Nube › Sumar un aparato</span
						>.
					</p>
					<input
						id="cloud-pair-code"
						bind:value={pairCode}
						aria-label="Código del otro aparato"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						placeholder="XXXX-XXXX"
						class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 font-mono text-sm tracking-widest outline-none"
					/>
					<button
						type="button"
						onclick={joinWithCode}
						disabled={cloudBusy || pairCode.replace(/[\s-]/g, '').length < 8}
						class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						Traer mis notas
					</button>
					{#if downloading}
						<p class="text-muted-foreground text-sm" aria-live="polite">
							Trayendo tus notas… {downloading.applied}
						</p>
					{/if}
					{@render startOver()}
				</div>
			{:else if !vaultReady}
				<!--
					Creating the key and allowing the upload are ONE step, not two. Split,
					a vault could exist without consent, its wrapped copy would never
					reach the server, and the second device — told this account has no
					vault — would build a rival one with a different key. `createVault`
					refuses to be created without consent for the same reason.
				-->
				<div class="flex flex-col gap-2">
					<p class="text-muted-foreground text-sm">
						Entraste como <span class="text-foreground font-medium">{cloudSession.user.email}</span
						>. Falta un paso: crear la bóveda —la llave que cifra tus notas y que solo existe en
						este dispositivo— y permitir que CopyNotes las suba.
					</p>
					{@render uploadTerms()}
					<button
						type="button"
						onclick={makeVault}
						disabled={cloudBusy}
						class="bg-primary text-primary-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
					>
						Crear bóveda y permitir subir
					</button>
				</div>
			{:else if !consentGiven}
				<!-- The second device: it joined the vault with the recovery code, which
				     needs no consent because downloading is what it asked for. Whether
				     its own writing may go up is still its own decision. -->
				<div class="flex flex-col gap-2">
					<p class="text-foreground text-sm">
						Hasta que lo permitas, nada salió de este dispositivo.
					</p>
					{@render uploadTerms()}
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
					<!-- Sumar un aparato (spec 035). No hay ningún código guardado en
					     ninguna parte: el que abre la bóveda en otro aparato se pide acá,
					     vale diez minutos y se usa una sola vez. -->
					<div class="border-border flex flex-col gap-2 rounded-md border p-3">
						<h4 class="text-sm font-bold">Sumar un aparato</h4>
						{#if pairingCode}
							<code
								class="bg-muted text-foreground border-border self-start rounded border px-3 py-2 font-mono text-lg tracking-widest"
								>{pairingCode}</code
							>
							<p class="text-muted-foreground text-sm" aria-live="polite">
								{#if pairingLeft > 0}
									Escribilo en el otro aparato. Vence en {pairingLeft}
									{pairingLeft === 1 ? 'minuto' : 'minutos'} y se usa una sola vez.
								{:else}
									Este código venció. Pedí otro.
								{/if}
							</p>
							<button
								type="button"
								onclick={showPairingCode}
								disabled={cloudBusy}
								class="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-md text-sm underline underline-offset-2 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Pedir otro código
							</button>
						{:else}
							<p class="text-muted-foreground text-sm">
								Para ver estas notas en otro aparato, entrá con tu cuenta allá y escribí el código
								que aparece acá.
							</p>
							<button
								type="button"
								onclick={showPairingCode}
								disabled={cloudBusy}
								class="border-border text-foreground hover:bg-accent focus-visible:ring-ring self-start rounded-md border px-3 py-1.5 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Mostrar el código
							</button>
						{/if}
					</div>
					<!-- El estado (subidas, en vivo, conflictos) vive en el punto del header:
					     acá van las decisiones de la cuenta, no los marcadores. -->
					<p class="text-muted-foreground text-sm">
						Cómo va la sincronización y las versiones en conflicto se ven en el
						<button
							type="button"
							onclick={() => onShowStatus?.()}
							class="text-foreground hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
						>
							estado de tus datos
						</button>, en el punto de arriba a la derecha.
					</p>
					{#if confirmingLeave}
						<div class="border-border flex flex-col gap-3 rounded-md border p-3">
							<p class="text-sm font-bold">¿Cerrar sesión en este dispositivo?</p>
							<p class="text-muted-foreground text-sm">
								<span class="text-foreground font-bold">Tus notas se quedan acá</span> y podés
								seguir usando CopyNotes sin conexión, como antes de conectar la nube.
							</p>
							<p class="text-muted-foreground text-sm">
								Lo que se borra de este dispositivo es la llave que abre lo que está guardado en
								la nube. Para volver a conectarlo vas a necesitar
								<span class="text-foreground font-bold">el código que muestre otro aparato tuyo</span
								>: si este es tu único dispositivo, lo que ya subiste deja de poder abrirse.
							</p>
							{#if syncStatus.pending}
								<p class="text-destructive text-sm">
									Ojo: {syncStatus.pending}
									{syncStatus.pending === 1 ? 'cambio todavía no subió' : 'cambios todavía no subieron'}.
									Quedan en este dispositivo, pero no van a llegar a los otros.
								</p>
							{/if}
							<div class="flex flex-col gap-2">
								<button
									type="button"
									onclick={leaveCloud}
									disabled={cloudBusy}
									class="bg-destructive text-destructive-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
								>
									Sí, cerrar sesión
								</button>
								<button
									type="button"
									onclick={() => (confirmingLeave = false)}
									disabled={cloudBusy}
									class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border text-sm transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
								>
									Volver
								</button>
							</div>
						</div>
					{:else}
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
								onclick={() => (confirmingLeave = true)}
								disabled={cloudBusy}
								class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm underline underline-offset-2 transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
							>
								Cerrar sesión
							</button>
						</div>
						{@render startOver()}
					{/if}
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

			<!-- El corte de emergencia. Solo en escritorio: en el navegador no hay
			     puente que cortar, y un botón que no hace nada es peor que ninguno. -->
			{#if isTauriRuntime()}
				<div
					class="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
				>
					<p class="text-sm">
						{#if agentsPaused}
							<span class="font-medium">Agentes pausados.</span>
							<span class="text-muted-foreground">
								No pueden leer ni cambiar nada, aunque una nota esté marcada.
							</span>
						{:else}
							<span class="font-medium">Agentes activos.</span>
							<span class="text-muted-foreground">
								Pueden trabajar en las notas que marcaste con el robot.
							</span>
						{/if}
					</p>
					<button
						type="button"
						onclick={toggleAgentsPaused}
						aria-pressed={agentsPaused}
						class="border-border shrink-0 rounded-md border px-3 py-1 text-sm font-bold"
					>
						{agentsPaused ? 'Reanudar' : 'Pausar agentes'}
					</button>
				</div>

				<!-- El archivo que el agente lee vive en el disco, así que la pausa se
				     cumple recién cuando se pudo reemplazar. Si esa escritura falla, el
				     archivo anterior se queda ahí y el agente lo sigue leyendo: un
				     interruptor de privacidad que no se cumplió no puede quedar en una
				     línea de consola. Aviso, no bloqueo — la app sigue andando. -->
				{#if agentData.exportFailed}
					<p role="alert" class="text-destructive text-sm">
						{#if agentsPaused}
							<span class="font-bold">La pausa todavía no se cumplió.</span> No se pudo
							actualizar el archivo que leen los agentes, así que pueden seguir leyendo
							las notas que marcaste (cambiarlas no: eso ya está cortado).
						{:else}
							<span class="font-bold">Los agentes están viendo una versión anterior.</span>
							No se pudo actualizar el archivo que leen.
						{/if}
						Suele ser falta de espacio o de permisos en el disco. Se reintenta solo con
						el próximo cambio en tus notas.
					</p>
				{/if}
			{/if}

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
									{#if redoError}
										<p role="alert" class="text-destructive mt-1 text-sm">{redoError}</p>
									{/if}
								{:else}
									<button
										type="button"
										onclick={() => {
											redoFor = entry.id;
											redoText = '';
											redoError = null;
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
					{#if DESKTOP_RELEASE_PUBLISHED}
						<a
							href={DESKTOP_DOWNLOAD_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="text-foreground underline underline-offset-2"
						>
							Descargar la app de escritorio
						</a>
					{/if}
				</p>
			{/if}
		</section>
	</div>
</dialog>

<!--
	What consenting to the upload actually means. Rendered in two places — the
	first device, where it is part of creating the vault, and a second device that
	joined one — because it is the same promise and it must not drift between
	them.
-->
{#snippet uploadTerms()}
	<p class="text-muted-foreground text-sm">
		Si lo permitís, se sube <span class="text-foreground">todo</span> lo que escribís —notas,
		renglones, comentarios, fechas, etiquetas, snippets y la bitácora— siempre cifrado en este
		dispositivo: al servidor llegan letras y números, y la llave que los abre no se sube.
	</p>
	<p class="text-muted-foreground text-sm">
		Lo que el servidor igual ve: que tenés una cuenta, tu email, tu conexión, cuántos registros
		hay, cuánto pesan y a qué hora sincronizás.
	</p>
	<p class="text-muted-foreground text-sm">
		Es beta: esto es lo que hace el programa y lo probamos nosotros, pero todavía no lo revisó una
		auditoría de seguridad independiente.
	</p>
{/snippet}

<!--
	La salida de quien se quedó sin ningún aparato con la llave (spec 035). Va
	plegada y en letra chica a propósito: es la última opción, no una alternativa
	de igual peso. Se dibuja en los dos lugares desde donde se puede llegar a
	necesitar — el aparato que está esperando un código, y el que ya está adentro.

	La confirmación se escribe a mano y no se hace con un segundo clic: es lo
	único de la app que borra algo que no está en este dispositivo.
-->
{#snippet startOver()}
	<details class="mt-1">
		<summary class="text-faint cursor-pointer text-xs">No tengo el otro aparato</summary>
		<div class="mt-2 flex flex-col gap-2">
			<p class="text-muted-foreground text-sm">
				Se borra <span class="text-foreground font-medium">todo lo que está en la nube</span> y se
				vuelve a subir desde este aparato.
				<span class="text-foreground font-medium">Tus notas de acá no se tocan.</span> Lo que esté en
				la nube y no esté en este aparato, se pierde.
			</p>
			<label class="text-muted-foreground text-sm" for="confirm-reset">
				Escribí BORRAR para confirmar
			</label>
			<input
				id="confirm-reset"
				bind:value={resetWord}
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				class="border-border w-full min-w-0 rounded-md border bg-transparent px-2 py-1.5 font-mono text-sm outline-none"
			/>
			<button
				type="button"
				onclick={startCloudOver}
				disabled={cloudBusy || resetWord.trim().toUpperCase() !== 'BORRAR'}
				class="bg-destructive text-destructive-foreground focus-visible:ring-ring self-start rounded-md px-3 py-1.5 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
			>
				Empezar de nuevo la nube
			</button>
		</div>
	</details>
{/snippet}
