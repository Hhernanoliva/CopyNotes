<script>
	import {
		applyInsertionPlan,
		assignTag,
		createBlock,
		createId,
		createSnippet,
		findOrCreateTag,
		getNote,
		listBlocksByNote,
		listActivityByNote,
		listSnippets,
		listTags,
		listTagsForMany,
		putBlock,
		registerPendingWriteFlusher,
		softDeleteBlock,
		softDeleteBlocks,
		unassignTag,
		updateBlock,
		updateNote,
		writeJournal
	} from '$lib/storage';
	import {
		selectionRange,
		neighborVisibleId,
		orderedSelectionRoots,
		planDeleteSelection,
		planMoveSelection,
		planIndentSelection,
		planOutdentSelection,
		planTypeChangeSelection
	} from '$lib/blocks/selection';
	import { filterSnippets, planSnippetInsertion, snippetFieldsFromBlocks } from '$lib/snippets';
	import { setTaskChecked, convertToTask, createTask, addTaskNote, markNoteDone } from '$lib/tasks';
	import SharedFooter from './SharedFooter.svelte';
	import { agentNotesByBlock } from './agent-notes';
	import { actionLabel } from '$lib/tasks/action-labels';
	import { actorName, isAgentActor } from '$lib/storage/share-names';
	import { myMemberActor } from '$lib/sync/identity';
	import { reconcileBlocks } from './reconcile';
	import { conflictsByBlock, keepLocal, takeRemote, undoDecision } from '$lib/sync/conflicts';
	import { bumpAgentData, bumpAgentDataUrgent } from '$lib/bridge/signal.svelte';
	import { insertImageBlock } from '$lib/images/insert';
	import { measureImage } from '$lib/images/ingest';
	import { IMAGE_INSERT_MESSAGES, roomIsTight } from '$lib/images/doors';
	import { detectTrigger } from './triggers';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { Tag, Bot } from '@lucide/svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { isTauriRuntime, openImageFiles } from '$lib/platform';
	import { buildVisibleList, listDescendantIds } from '$lib/blocks/hierarchy';
	import { planIndent, planOutdent } from '$lib/blocks/indent';
	import { planMoveDown, planMoveUp } from '$lib/blocks/reorder';
	import {
		backspaceAction,
		canDeleteFromMenu,
		canDeleteOnBackspace,
		enterOnEmptyAction,
		originIsDisposable,
		planEnter,
		planJoinWithPrevious,
		planPromoteChildren,
		previousVisibleId
	} from '$lib/blocks/enter';
	import { buildCopyTree, formatPlainText, formatHtml } from '$lib/copy/format';
	import { treeToNode, flattenNode, serializeForest } from '$lib/copy/serialize';
	import { writePlainTextToClipboard, writeToClipboard } from '$lib/copy/clipboard';
	import { toast } from 'svelte-sonner';
	import { fade } from 'svelte/transition';
	import { MOTION, motionDuration, prefersReducedMotion } from '$lib/motion';
	import { SLASH_COMMANDS, filterCommands, moveSelection, nextSlashState } from './slash';
	import { caretColumnX, placeCaretAtColumn, edgeForDirection, caretPointFromViewport } from './caret';
	import { looksLikeCodePaste, parsePastedLines } from './paste';
	import { createHistory, diffBlocks } from './history';
	import { planJoin } from './split';
	import BlockRow from './BlockRow.svelte';
	import { createDragReorder } from './dragReorder.svelte.js';
	import { createTextDrag } from './textDrag.svelte.js';
	import { planTextMove } from './text-move';
	import FloatingFormattingToolbar from './FloatingFormattingToolbar.svelte';
	import { textOffset, rangeFromTextOffsets, plainTextOffset, rangeAtPlainOffset } from './selection-offsets';
	import {
		sanitizeHtml,
		htmlToPlainText,
		plainTextToHtml,
		removePlainTextRange,
		planBlockType,
		HEADING_TYPES,
		activeFormatsFor,
		commandsForSelection,
		selectionCoversBlock,
		sizeClassFor,
		applyInline,
		toggleCode,
		applyColor,
		applySize,
		applyLink,
		removeLink,
		removeLinksInSelection,
		anchorForRange
	} from '$lib/format';

	let {
		noteId,
		initialFocusBlockId = null,
		onNoteUpdated,
		onSaveStateChange,
		onSnippetsChanged,
		onTagsChanged,
		onDatesChanged
	} = $props();

	let note = $state(null);
	let blocks = $state([]);
	// Una nota que te comparte otra persona se lee, no se escribe (spec 038 §4).
	//
	// Sale de `note.share`, que es el mismo campo que lee `getShareRole`: la nota
	// ya está cargada acá, así que no hace falta ni una lectura más ni un estado
	// propio.
	//
	// `note` lo escribe la carga y NO `refreshFromStorage`, así que una marca que
	// cambia con la nota abierta no se ve hasta que el editor se re-monte. Es la
	// dirección segura y por eso alcanza: lo que puede cambiar bajo los pies es que
	// te QUITEN el acceso, y ahí esto se queda cerrado de más, nunca abierto de
	// más. Que una nota pase a ser ajena mientras la tenés abierta no puede pasar:
	// eso ocurre al aceptar una invitación, y ahí la nota todavía no existe acá.
	//
	// Con la nota sin cargar queda CERRADO, no abierto: la duda se resuelve del
	// lado seguro, o una nota compartida sería editable el instante que tarda la
	// lectura, y un instante alcanza para escribir una letra que no va a viajar.
	//
	// El límite de VERDAD lo pone el servidor, que rechaza por rol cualquier fila
	// que no sea bitácora si quien la manda no es el dueño. Esto es la cortesía de
	// no dejar intentarlo.
	const readOnly = $derived(note === null || note.share === 'member');
	// Lo mismo mirado al revés, y no es redundante: el invitado es el único que
	// está en sólo lectura Y PUEDE tildar y comentar (spec 038 §5). `readOnly`
	// cierra todo; esto reabre las dos puertas que se abren a propósito.
	const isMember = $derived(note?.share === 'member');
	// Con qué firma escribe este aparato en una nota ajena. Se resuelve UNA vez,
	// fuera de cualquier transacción, porque adentro no se puede preguntar.
	let myActor = $state(null);
	$effect(() => {
		let vivo = true;
		myMemberActor().then((valor) => {
			if (vivo) myActor = valor;
		});
		return () => {
			vivo = false;
		};
	});
	// La voz de los OTROS por bloque (bitácora action:'note' que no escribí yo). Se
	// recarga con la nota; el editor se re-monta tras cada cambio de agente
	// (dataVersion), así que una nota nueva del agente aparece al re-montar.
	let agentNotes = $state({});
	// Las declaraciones de "Listo" sobre la nota entera (spec 038 §8). Salen de la
	// MISMA lectura que la itálica de cada renglón: son filas de la misma bitácora,
	// las que no cuelgan de ningún renglón.
	let doneEntries = $state([]);

	// Las etiquetas se resuelven ACÁ y no en `agent-notes.ts` porque salen de una
	// tabla de Dexie y ese archivo es puro a propósito (se prueba sin base).
	//
	// Un nombre por actor distinto, no uno por línea: una tarea puede juntar quince
	// comentarios de la misma persona y serían quince lecturas.
	function resolvedorDeNombres(ctx) {
		const cache = new Map();
		return async (actor) => {
			if (!cache.has(actor)) cache.set(actor, await actorName(actor, ctx));
			return cache.get(actor);
		};
	}

	// La puerta ÚNICA de todo lo que la pantalla saca de la bitácora. Las dos
	// listas se llenan juntas o no se llenan: dejar que cada llamador arme la suya
	// es exactamente cómo este proyecto perdió cosas tres veces (`appliedVersion`,
	// dos; el segundo camino de `agentNotes`, una).
	//
	// `abortado` existe porque resolver los nombres lee Dexie, y en esa espera la
	// persona puede haber abierto otra nota: sin la pregunta, las listas de la
	// nota vieja pisarían las de la nueva. Se pregunta ACÁ, junto a la asignación,
	// y no en el llamador, que es lo que la volvería olvidable otra vez.
	async function applyActivity(rows, abortado = () => false) {
		const ctx = { noteId: note?.id, role: note?.share ?? null, myActor };
		const nombre = resolvedorDeNombres(ctx);

		const grouped = agentNotesByBlock(rows, ctx);
		for (const list of Object.values(grouped)) {
			for (const item of list) {
				// La itálica del renglón dice "IA" desde antes de que existiera
				// compartir, y esa palabra no cambia: acá sólo se agrega el caso nuevo.
				// El booleano viaja además del nombre porque la pantalla lo pinta de
				// otro color, y el color no se puede deducir del texto de la etiqueta.
				item.esAgente = isAgentActor(item.actor);
				item.label = item.esAgente ? 'IA' : await nombre(item.actor);
			}
		}

		// El pie no dice "IA" nunca: un "Listo" sobre la nota entera lo declara una
		// persona, y si algún día lo escribiera un agente su nombre es "Agente",
		// que es lo que `actorName` ya devuelve.
		const listos = rows.filter((row) => row.action === 'listo');
		const conNombre = [];
		// La conjugación sale de `actionLabel`, la misma puerta que usa Configuración,
		// y no de una cadena escrita en el pie: ahí decía "marcó Listo" fijo y con la
		// etiqueta "Vos" se leía "Vos marcó Listo". El mapa de primera persona ya
		// existía y ya tenía "marcaste Listo" — el pie simplemente no lo usaba.
		for (const row of listos)
			conNombre.push({ ...row, label: await nombre(row.actor), actionText: actionLabel(row, ctx) });

		if (abortado()) return;
		agentNotes = grouped;
		doneEntries = conNombre;
	}
	// { [blockId]: { id, remote } } — el mismo renglón cambió acá y en otro
	// dispositivo. Se muestra en el renglón, no escondido en Configuración.
	let conflicts = $state({});
	// Un renglón protegido se salteó en la última reconciliación y hay que
	// reintentarlo cuando el cursor se vaya. Plano, no $state: lo leen efectos
	// que no deben depender de él.
	let deferredRefresh = false;
	let focusBlockId = $state(null);
	// Plain-text caret offset to restore when focusBlockId lands (or null for
	// caret-at-end). Set by slash-menu flows so the caret returns to where the
	// "/" was typed; cleared together with focusBlockId in onFocusHandled.
	let focusCaret = $state(null);
	// Last block the user touched; snippet insertion from the sidebar lands here.
	let activeBlockId = $state(null);
	// ...y por eso `activeBlockId` NO se limpia al salir del foco: la barra de
	// snippets necesita saber dónde estabas. Pero el escudo contra los cambios de
	// afuera sí tiene que apagarse cuando el cursor se va, o ese renglón queda
	// protegido para siempre: no toma nunca lo que llegó de la nube, y la próxima
	// edición sube la versión vieja encima de la del otro aparato.
	let caretInside = $state(false);
	// Blocks that just arrived from a snippet insertion, briefly highlighted so
	// the user sees where the snippet landed. Cleared after the flash.
	let flashBlockIds = $state(new Set());
	let flashTimer;
	function flashBlocks(ids) {
		if (prefersReducedMotion()) return;
		clearTimeout(flashTimer);
		flashBlockIds = new Set(ids);
		flashTimer = setTimeout(() => (flashBlockIds = new Set()), 650);
	}
	// Row whose 3-dots (⋯) menu icon should pulse: fired when a date or tag is
	// added to that line, so the menu it came from gives a quick confirmation.
	// The row is focused/active right after, so the (otherwise hidden) icon shows.
	let pulseMenuBlockId = $state(null);
	let pulseMenuTimer;
	function pulseMenu(id) {
		if (prefersReducedMotion() || !id) return;
		clearTimeout(pulseMenuTimer);
		// Drop then set so re-adding to the same row replays the animation.
		pulseMenuBlockId = null;
		requestAnimationFrame(() => {
			pulseMenuBlockId = id;
			pulseMenuTimer = setTimeout(() => (pulseMenuBlockId = null), 500);
		});
	}
	let titleEl = $state();
	// Slash menu state: which block it is anchored to, the plain-text offset of
	// the "/" (anchor), the text typed after it, and the highlighted option.
	// mode 'snippets' means /snippet was chosen and the menu now lists saved
	// snippets instead of block types.
	let slash = $state(null);
	// Which block's date panel is open (spec 021 Slice A), or null.
	let datePanelFor = $state(null);
	// Caret offset to restore after the date panel closes, when it was opened
	// via /fecha (null = caret at the end, e.g. opened from the badge).
	let datePanelCaret = null;
	// Tag state: all live tags (for the picker), the note's tags, tags per
	// block id, and which target has the picker open ('note' or a block id).
	let allTags = $state([]);
	let noteTags = $state([]);
	let blockTagsMap = $state({});
	let tagPickerFor = $state(null);
	// Multi-block selection: anchor+focus block ids. selectedIds is the visible
	// range between them; a real selection is 2+ blocks.
	let selection = $state(null);
	// Drag-select: the block where the mouse went down, and whether a drag has
	// actually crossed into another block (so a plain click stays a click).
	let dragAnchorId = $state(null);
	let dragging = $state(false);
	const selectedIds = $derived(
		selection ? selectionRange(blocks, selection.anchorId, selection.focusId) : []
	);
	const hasSelection = $derived(selectedIds.length > 1);
	// El menú de grupo (spec 031): "/" con varios renglones marcados. Estado
	// aparte del "/" tipeado en un renglón — ahí el carácter vive dentro del
	// texto hasta confirmar, y acá nunca entra en ningún renglón.
	let selectionMenu = $state(null); // { index }
	// El menú de grupo solo existe mientras la selección existe: si se encoge a un
	// renglón (Shift+↑ de más) o se cambia de nota, el menú se va con ella — si no,
	// queda un menú fantasma que además tapa al "/" de un solo renglón.
	const groupMenu = $derived(hasSelection ? selectionMenu : null);
	// Solo cambios de tipo: Fecha abriría un panel por renglón, Separador
	// borraría el texto de todos y Snippet no es un tipo.
	const SELECTION_TYPE_IDS = ['text', 'heading1', 'heading2', 'heading3', 'bullet', 'todo', 'code'];
	const SELECTION_TYPE_COMMANDS = SLASH_COMMANDS.filter((command) =>
		SELECTION_TYPE_IDS.includes(command.id)
	);
	// Drag-to-reorder-and-nest controller (long-press, mouse + touch). Pure
	// hierarchy math lives in resolveDrop/planDrop; this just applies the plan.
	let listEl = $state();
	const reorder = createDragReorder({
		getBlocks: () => blocks,
		getSelectedIds: () => (hasSelection ? selectedIds : []),
		getListEl: () => listEl,
		onApply: async (plan) => {
			recordSnapshot();
			await applyUpdates(plan.updates);
		},
		// A plain click on an already-selected row (no drag) collapses the
		// selection; the caret lands there via the browser's own mousedown.
		onSelectionClick: () => clearSelection()
	});
	$effect(() => () => reorder.destroy());

	// Drag-to-move a text selection (spec 026). The controller owns the pointer
	// gesture; resolveTextDropPoint maps a screen point to a rich block + caret
	// offset, and applyTextMove runs the pure planTextMove and persists it.
	const textDrag = createTextDrag({
		resolveDropPoint: resolveTextDropPoint,
		onApply: applyTextMove
	});
	$effect(() => () => textDrag.destroy());

	const RICH_TYPES = new Set(['text', 'heading1', 'heading2', 'heading3', 'bullet', 'todo']);
	const isRichBlock = (block) => block && RICH_TYPES.has(block.type);

	function blockHtml(block) {
		return block.html ?? plainTextToHtml(block.content ?? '');
	}

	// Map a viewport point to a drop target: the rich block editable under it and
	// the plain-text caret offset there. Null over code/separators or empty space.
	function resolveTextDropPoint(x, y) {
		const point = caretPointFromViewport(x, y);
		if (!point) return null;
		const node = point.node;
		const el = node.nodeType === 1 ? /** @type {Element} */ (node) : node.parentElement;
		const editable = el?.closest('.block-editable');
		if (!editable) return null;
		const row = editable.closest('[data-block-id]');
		const block = blocks.find((b) => b.id === row?.getAttribute('data-block-id'));
		if (!isRichBlock(block)) return null;
		const offset = plainTextOffset(editable, node, point.offset);
		const caretRect = rangeAtPlainOffset(editable, offset).getBoundingClientRect();
		return { blockId: block.id, offset, caretRect };
	}

	async function applyTextMove({ sourceId, start, end, targetId, offset }) {
		const source = blocks.find((b) => b.id === sourceId);
		const target = blocks.find((b) => b.id === targetId);
		if (!source || !target) return;
		const sameBlock = sourceId === targetId;
		const plan = planTextMove({
			sourceHtml: blockHtml(source),
			start,
			end,
			targetHtml: sameBlock ? blockHtml(source) : blockHtml(target),
			dropOffset: offset,
			sameBlock
		});
		if (!plan) return;
		recordSnapshot();
		if (sameBlock) {
			source.html = plan.targetHtml;
			source.content = htmlToPlainText(plan.targetHtml);
			await writeBlock(source.id, { html: source.html, content: source.content });
		} else {
			source.html = plan.sourceHtml;
			source.content = htmlToPlainText(plan.sourceHtml);
			target.html = plan.targetHtml;
			target.content = htmlToPlainText(plan.targetHtml);
			await writeBlock(source.id, { html: source.html, content: source.content });
			await writeBlock(target.id, { html: target.html, content: target.content });
		}
		focusBlockId = targetId;
		focusCaret = plan.caretOffset;
	}

	// Called from a block's mousedown when the press lands on a live in-line text
	// selection. Arm the text drag if the press is inside that selection.
	function textSelectionMousedown(block, event) {
		if (!isRichBlock(block)) return;
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		const editable = event.currentTarget;
		if (!editable?.contains?.(range.startContainer) || !editable.contains(range.endContainer)) return;
		if (!pointInRects(range.getClientRects(), event.clientX, event.clientY)) return;
		const a = plainTextOffset(editable, range.startContainer, range.startOffset);
		const b = plainTextOffset(editable, range.endContainer, range.endOffset);
		const startOffset = Math.min(a, b);
		const endOffset = Math.max(a, b);
		if (endOffset <= startOffset) return;
		textDrag.armFromSelection(block.id, startOffset, endOffset, event);
	}

	function pointInRects(rects, x, y) {
		for (const r of rects) {
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
		}
		return false;
	}

	const selectedSet = $derived(new Set(hasSelection ? selectedIds : []));
	// The block highlight is visual only; announce the count for screen readers.
	const selectionAnnouncement = $derived(
		hasSelection ? `${selectedIds.length} renglones seleccionados` : ''
	);
	// Un choque no lo pide nadie: aparece solo, mientras escribís, cuando llega un
	// cambio del otro dispositivo. Se ve en el renglón, y sin esto quien usa lector
	// de pantalla no se entera de que quedó una decisión esperando.
	const conflictAnnouncement = $derived.by(() => {
		const count = Object.keys(conflicts).length;
		if (!count) return '';
		return count === 1
			? 'Un renglón tiene otra versión esperando que elijas cuál queda'
			: `${count} renglones tienen otra versión esperando que elijas cuál queda`;
	});

	const visible = $derived(buildVisibleList(blocks));

	// El puente con los agentes es solo de escritorio. El botón se queda igual en
	// el navegador porque la marca SÍ sirve ahí: se guarda y viaja por la nube, o
	// sea que servía para preparar qué verá el agente cuando abras la app. Lo que
	// faltaba era decirlo — antes el botón fingía que ahí hacía algo.
	const agentBridgeAvailable = isTauriRuntime();
	const AGENT_WEB_CAVEAT = 'solo tiene efecto en la app de escritorio';
	const agentTooltip = $derived.by(() => {
		const state = note?.agentVisible
			? 'Los agentes pueden leer el texto y las tareas de esta nota'
			: 'Los agentes no ven esta nota';
		return agentBridgeAvailable ? state : `${state} — ${AGENT_WEB_CAVEAT}`;
	});
	const slashCommands = $derived.by(() => {
		if (!slash) return [];
		if (slash.mode === 'snippets') {
			return filterSnippets(slash.snippets, slash.query).map((snippet) => ({
				id: snippet.id,
				label: snippet.name,
				kind: 'snippet',
				isFavorite: snippet.isFavorite,
				snippet
			}));
		}
		return filterCommands(slash.query);
	});

	// Debounced writes per entity; flushed on unmount so nothing is lost
	// when the user switches notes quickly. Each entry also carries a plain
	// journal payload ({ table, id, changes }) because the last-chance path
	// below cannot run the async save closures.
	const pending = new Map();

	// A write that fails keeps its entry: the unmount flush and the journal are
	// its only retries. It is flagged so the indicator can say "no pudimos
	// guardar" instead of hanging on "guardando…" forever waiting for a write
	// that will never land.
	async function runSave(key, entry) {
		try {
			await entry.save();
		} catch {
			entry.failed = true;
			onSaveStateChange('error');
			return;
		}
		if (pending.get(key) === entry) pending.delete(key);
		settleSaveState();
	}

	// `delayMs: 0` starts the write in this same tick instead of waiting out the
	// debounce. The debounce exists to fold keystroke bursts; a one-click change
	// has no burst to fold, and for agent visibility the delay is a privacy hole
	// (during it the agent gate still reads "visible" from the database).
	function scheduleSave(key, save, journal, delayMs = 500) {
		onSaveStateChange('saving');
		const existing = pending.get(key);
		if (existing) clearTimeout(existing.timer);
		// The entry leaves the map only after its write really finished, so the
		// journal still covers a save that is in flight when the page dies (the
		// browser discards unfinished IndexedDB writes on unload). The identity
		// check protects a newer entry that replaced this one meanwhile.
		const entry = { save, journal, timer: null };
		pending.set(key, entry);
		// Immediate saves hand back the write itself, so a caller that has to read
		// the row afterwards can await it.
		if (delayMs === 0) return runSave(key, entry);
		entry.timer = setTimeout(() => runSave(key, entry), delayMs);
		return Promise.resolve();
	}

	// LA ÚNICA PUERTA para escribir un renglón desde el editor.
	//
	// No es prolijidad. `scheduleSave` guarda UN pendiente por clave y limpia el
	// timer del anterior; escribir por afuera deja armado el guardado con retraso
	// de hace un instante, que lleva adentro una copia del texto de ANTES y medio
	// segundo después lo pisa. Así "- " seguido de una pausa volvía a "-" (el
	// espacio convierte a viñeta escribiendo directo, y el usuario deja de teclear,
	// así que nada vuelve a tapar el timer), y mover un texto arrastrándolo se
	// revertía solo.
	//
	// Los cambios se FUNDEN con lo que haya pendiente, no lo reemplazan: bajo una
	// sola clave, reemplazar tiraría los campos que el guardado anterior todavía no
	// escribió — contraer un renglón se llevaría puesto lo recién tecleado.
	function writeBlock(id, changes, delayMs = 0) {
		const key = `block:${id}`;
		const waiting = pending.get(key)?.journal?.changes;
		const merged = waiting ? { ...waiting, ...changes } : changes;
		return scheduleSave(
			key,
			() => updateBlock(id, merged),
			{ table: 'blocks', id, changes: merged },
			delayMs
		);
	}

	// Nothing left in flight -> "guardado", unless a failed write is still parked
	// in the map, in which case the honest answer is "error".
	function settleSaveState() {
		for (const entry of pending.values()) if (!entry.failed) return;
		onSaveStateChange(pending.size === 0 ? 'saved' : 'error');
	}

	function flushPending() {
		const saves = [];
		for (const [key, entry] of pending) {
			clearTimeout(entry.timer);
			// Saves are plain field updates, so re-running one that the timer
			// already started is harmless.
			saves.push(
				entry.save().then(
					() => {
						if (pending.get(key) === entry) pending.delete(key);
					},
					// Same deal as the debounced path: keep the entry for the journal,
					// flag it, and never reject — this promise is awaited on unmount.
					() => {
						entry.failed = true;
					}
				)
			);
		}
		return Promise.all(saves).then(() => {
			settleSaveState();
			// La barrera necesita la verdad: una entrada marcada `failed` sigue en el
			// mapa porque su texto NO está en la base. Devolver `true` siempre era la
			// mentira que dejaba bajar un respaldo incompleto sin decir nada.
			return ![...pending.values()].some((entry) => entry.failed);
		});
	}

	function persistJournal() {
		writeJournal([...pending.values()].map((entry) => entry.journal).filter(Boolean));
	}

	$effect(() => () => flushPending());
	$effect(() => registerPendingWriteFlusher(flushPending));

	// A reload/close/navigation never unmounts the component, so the unmount
	// flush above cannot run — and IndexedDB writes started while the page
	// unloads are discarded by the browser anyway. The journal in localStorage
	// is synchronous, survives unload, and is replayed on the next boot. A
	// hidden tab may later be killed without pagehide (mobile), so it journals
	// too, then clears once its flushed saves have really landed.
	$effect(() => {
		const journalOnPageHide = () => persistJournal();
		const flushWhenHidden = async () => {
			if (document.visibilityState !== 'hidden') return;
			persistJournal();
			await flushPending();
			// Volver a anotar, NO borrar. `flushPending` no rechaza nunca: un
			// guardado que falló se queda en `pending` con su bandera, así que
			// borrar el diario acá tiraba la única copia de un cambio que jamás
			// llegó al disco. Anotar de nuevo deja exactamente lo que sigue sin
			// aterrizar — y si no quedó nada, `writeJournal` borra el diario solo.
			persistJournal();
		};
		window.addEventListener('pagehide', journalOnPageHide);
		document.addEventListener('visibilitychange', flushWhenHidden);
		return () => {
			window.removeEventListener('pagehide', journalOnPageHide);
			document.removeEventListener('visibilitychange', flushWhenHidden);
		};
	});

	$effect(() => {
		const id = noteId;
		let cancelled = false;
		// Hide the previous note while the next one loads. Leaving its rows and
		// title visible lets fast typing land edits on the wrong note (the load
		// window widens under I/O contention — caught by the e2e suite).
		note = null;
		blocks = [];
		agentNotes = {};
		doneEntries = [];
		conflicts = {};
		deferredRefresh = false;
		// La selección y su menú de grupo son de ESTA nota; la próxima no hereda
		// renglones marcados que ya ni existen en su lista.
		selection = null;
		selectionMenu = null;
		(async () => {
			const [loadedNote, loadedBlocks, loadedActivity] = await Promise.all([
				getNote(id),
				listBlocksByNote(id),
				listActivityByNote(id)
			]);
			if (cancelled) return;
			note = loadedNote;
			blocks = loadedBlocks;
			await applyActivity(loadedActivity, () => cancelled);
			if (cancelled) return;
			conflictsByBlock(loadedBlocks.map((row) => row.id)).then((found) => {
				if (!cancelled) conflicts = found;
			});
			activeBlockId = null;
			history.reset();
			lastTextBlockId = null;
			const jumpingToBlock =
				initialFocusBlockId && loadedBlocks.some((block) => block.id === initialFocusBlockId);
			if (jumpingToBlock) {
				focusBlockId = initialFocusBlockId;
			}
			await refreshTags();
			// An empty title only grabs focus when we did not land here to jump to a
			// specific block (spec 021 Slice B) — the Agenda's request wins.
			if (note && note.title === '' && titleEl && !jumpingToBlock) {
				titleEl.focus();
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	// --- Undo/redo (spec 019, fix 6) ---
	// Per-note snapshot history. A snapshot is the full ordered block list plus
	// the focused block. Text edits are grouped into one step per burst.
	const history = createHistory({ limit: 100 });
	let lastTextAt = 0;
	let lastTextBlockId = null;
	// Id del renglón en formateo durante la ventana síncrona del comando. Deja
	// que handleBlockInput ignore el evento `input` incidental de execCommand.
	let formattingBlockId = null;

	function currentSnapshot() {
		return { blocks: $state.snapshot(blocks), focusId: activeBlockId };
	}

	// Record before a structural mutation. Resets the text-burst tracker so a
	// following keystroke starts its own undo step.
	function recordSnapshot() {
		history.push(currentSnapshot());
		lastTextBlockId = null;
	}

	// Record before a text edit, but only once per burst: a new block or a pause
	// over ~600ms starts a fresh undo step.
	function recordTextSnapshot(blockId) {
		const stamp = Date.now();
		if (blockId !== lastTextBlockId || stamp - lastTextAt > 600) history.push(currentSnapshot());
		lastTextAt = stamp;
		lastTextBlockId = blockId;
	}

	// Apply a snapshot to the editor and persist the difference through storage.
	async function restore(snapshot) {
		if (!snapshot) return;
		await flushPending();
		const diff = diffBlocks($state.snapshot(blocks), snapshot.blocks);
		for (const id of diff.deletedIds) await softDeleteBlock(id);
		for (const row of diff.created) await putBlock(row);
		for (const row of diff.updated) await putBlock(row);
		blocks = snapshot.blocks.map((row) => ({ ...row }));
		lastTextBlockId = null;
		focusBlockId =
			snapshot.focusId && blocks.some((row) => row.id === snapshot.focusId)
				? snapshot.focusId
				: (blocks[0]?.id ?? null);
	}

	// Structure changes (indent, reorder, collapse…) persist immediately:
	// losing hierarchy is worse than an extra write.
	async function applyUpdates(updates) {
		for (const update of updates) {
			const { id, ...changes } = update;
			const row = blocks.find((block) => block.id === id);
			if (row) Object.assign(row, changes);
			await writeBlock(id, changes);
		}
	}

	function handleTitleInput(event) {
		const title = event.currentTarget.value;
		note.title = title;
		scheduleSave(
			`title:${note.id}`,
			async () => {
				await updateNote(note.id, { title });
				onNoteUpdated(note.id, { title });
			},
			{ table: 'notes', id: note.id, changes: { title } }
		);
	}

	function toggleAgentVisible() {
		const next = !note.agentVisible;
		note.agentVisible = next;
		// Route through scheduleSave (like the title) so the change gets a
		// localStorage journal entry — surviving a reload/unload that races the
		// IndexedDB write — plus the shared "Guardando…/Guardado" indicator.
		// `0` = no debounce: the agent gate reads visibility from the database, so
		// any delay between the click and the write is a window in which a hidden
		// note still accepts agent changes.
		scheduleSave(
			`agentVisible:${note.id}`,
			async () => {
				await updateNote(note.id, { agentVisible: next });
				onNoteUpdated(note.id, { agentVisible: next });
				// Bump AFTER the write lands, so the re-export reads the new
				// visibility from the DB — never before the persisted value changed,
				// or an export could race the write and still see the old state.
				// Hiding is privacy-sensitive → urgent bump (immediate export, no
				// debounce); showing can ride the normal debounced path.
				if (next) bumpAgentData();
				else bumpAgentDataUrgent();
			},
			{ table: 'notes', id: note.id, changes: { agentVisible: next } },
			0
		);
	}

	function handleTitleKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (visible.length > 0) focusBlockId = visible[0].block.id;
		}
	}

	function handleBlockInput(block, payload) {
		const text = payload.content;
		const html = payload.html;
		// Ignorar el evento `input` incidental que un comando de formato puede
		// disparar: runFormatCommand ya registró historial y guardó. En la ventana
		// síncrona lo marca formattingBlockId; un evento tardío llega con el html
		// ya guardado (sanitizeHtml es idempotente) y coincide.
		if (block.id === formattingBlockId || (html === block.html && text === block.content)) return;
		recordTextSnapshot(block.id);
		// Typing "/" anywhere in the block opens the slash menu; what follows up
		// to the caret is the query. Code blocks are exempt, slashes are normal
		// there. The snippet-picker mode survives while the user narrows the
		// query, because only the query changes — the anchor stays put.
		if (block.type !== 'code') {
			const prev = slash && slash.blockId === block.id ? { anchor: slash.anchor, query: slash.query } : null;
			const next = nextSlashState(prev, {
				prevText: block.content ?? '',
				text,
				caret: payload.caret ?? null,
				inputType: payload.inputType ?? null
			});
			if (next && prev) {
				slash.query = next.query;
				slash.index = 0;
			} else if (next) {
				slash = { blockId: block.id, anchor: next.anchor, query: next.query, index: 0, mode: 'commands' };
			} else if (slash && slash.blockId === block.id) {
				slash = null;
			}
		} else if (slash && slash.blockId === block.id) {
			slash = null;
		}
		// Typed triggers: "- "/"* " make a bullet, a standalone "#" opens the tag
		// picker. The caret tells "#" apart from a "#" glued to a word.
		const trigger = detectTrigger(block, text, {
			prevText: block.content ?? '',
			caret: payload.caret ?? null,
			inputType: payload.inputType ?? null
		});
		if (trigger?.kind === 'bullet') {
			// Cambio de estructura: se escribe ya. Y por la misma puerta que el
			// tipeo, que es lo que cancela el guardado con retraso del guion — el que
			// medio segundo después devolvía el "-" si el usuario paraba de escribir.
			block.type = 'bullet';
			block.content = trigger.content;
			block.html = plainTextToHtml(trigger.content);
			writeBlock(block.id, {
				type: 'bullet',
				content: trigger.content,
				html: plainTextToHtml(trigger.content)
			});
			return;
		}
		if (trigger?.kind === 'tag') {
			// The "#" stays in the text while the picker is open, like the slash
			// menu: nothing to restore on cancel, and the rest of the line the user
			// was writing is never touched. handleTagPick removes it on a pick.
			tagPickerFor = { type: 'block', id: block.id, hashAnchor: trigger.anchor };
			// No early return: fall through to the normal save so the "#" persists.
		}
		block.content = text;
		block.html = html;
		// El único con retraso: acá sí hay ráfaga de teclas que vale la pena juntar.
		writeBlock(block.id, { content: text, html }, 500);
	}

	// Convert a block to a different type (e.g. heading) via the format engine's
	// planner, which decides which fields change.
	async function setBlockType(block, nextType) {
		// `null` = la conversión no existe (spec 041: ni desde ni hacia una imagen).
		const changes = planBlockType(block, nextType);
		if (!changes) return;
		Object.assign(block, changes);
		if (nextType === 'todo') {
			// Convertir a tarea nace por la capa (bitácora 'created').
			await convertToTask({ blockId: block.id, checked: changes.checked });
		} else {
			await writeBlock(block.id, changes);
		}
	}

	// H1 sobre un renglón que YA es Título 1 lo devuelve a texto normal (spec
	// 033): el botón se muestra apretado, así que volver a apretarlo tiene que
	// apagarlo. Es la misma ida y vuelta que ya hace el tamaño sobre una parte
	// del renglón.
	function toggleHeading(block, headingType) {
		return setBlockType(block, block.type === headingType ? 'text' : headingType);
	}

	// --- Floating formatting toolbar (spec: toolbar wiring) ---
	// Tracks the live DOM selection and derives what the toolbar should show:
	// its position, which marks/heading are active, and which commands make
	// sense for the current selection. Rebuilt from scratch on every selection
	// change so the toolbar's own $derived state reacts to it.
	let toolbar = $state(null); // { rect, active, enabled, blockId, color, linkUrl }
	// Sequence counter to make repeated Ctrl/Cmd+K requests unique (Svelte 5 $effect
	// reactive dependency must change for the effect to re-run on the second press).
	let linkRequestSeq = 0;

	function editableFor(node) {
		let el = node?.nodeType === 1 ? node : node?.parentNode;
		while (el && !(el.classList && el.classList.contains('block-editable'))) el = el.parentNode;
		return el;
	}

	function refreshToolbar() {
		// En una nota ajena no hay nada que ofrecer: `runFormatCommand` ya rechaza
		// todo lo que la barra dispara, así que sin esta línea aparecía una barra
		// entera de botones que no hacen nada al marcar texto — peor que no
		// tenerla, porque promete algo que no va a pasar. Marcar y copiar siguen
		// funcionando igual; lo único que se va es la barra.
		if (readOnly) {
			toolbar = null;
			return;
		}
		// The link popover autofocuses its URL input (and any future popover
		// content lives inside the toolbar's own DOM too). That focus change
		// fires selectionchange with a collapsed, unrelated selection — without
		// this guard we'd immediately null the toolbar out from under the user,
		// closing the popover they just opened. Leave existing state alone while
		// focus sits inside the toolbar itself.
		if (toolbar && document.activeElement?.closest('[data-copynotes-toolbar]')) {
			return;
		}
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) { toolbar = null; return; }
		const range = sel.getRangeAt(0);
		const startEditable = editableFor(range.startContainer);
		const endEditable = editableFor(range.endContainer);
		if (!startEditable) { toolbar = null; return; }
		// La barra se abre SOLO con algo seleccionado.
		//
		// Antes también se abría con el cursor solo si caía sobre texto formateado
		// —negrita, cursiva, código, color, enlace—, y eso la hacía aparecer sola
		// mientras el usuario caminaba el renglón con las flechas o clickeaba para
		// pararse: un cartel que tapa el texto sin que nadie lo haya pedido. El
		// tamaño en línea ya estaba afuera de esa lista por exactamente el mismo
		// motivo; ahora la regla vale para todos los formatos, que es lo que hace
		// cualquier editor.
		//
		// No se pierde nada: los atajos (Ctrl/Cmd+B/I/U/K…) nunca pasaron por la
		// barra, y el enlace no se podía ni crear con el cursor solo — applyLink
		// devuelve false sin un rango.
		const marks = activeFormatsFor(range.startContainer, startEditable);
		if (sel.isCollapsed) { toolbar = null; return; }

		const row = startEditable.closest('[data-block-id]');
		const block = blocks.find((b) => b.id === row?.dataset.blockId);
		if (!block) { toolbar = null; return; }
		const spansBlocks = startEditable !== endEditable;

		toolbar = {
			rect: range.getBoundingClientRect(),
			// Commands dispatched from a popover (the link editor) fire after DOM
			// focus has moved into that popover's own input, which collapses
			// window.getSelection() away from this range. Keep a clone so the
			// command handler can restore it before mutating the DOM.
			savedRange: range.cloneRange(),
			blockId: block.id,
			color: marks.color,
			linkUrl: currentLinkHref(range),
			// Un botón de tamaño se enciende por el tipo del renglón O por el
			// tamaño en línea bajo el cursor: los dos gestos comparten botón.
			active: {
				...marks,
				h1: block.type === 'heading1' || marks.size === 'fmt-size-h1',
				h2: block.type === 'heading2' || marks.size === 'fmt-size-h2',
				h3: block.type === 'heading3' || marks.size === 'fmt-size-h3',
				normal: block.type === 'text' && !marks.size
			},
			enabled: commandsForSelection({ blockType: block.type, spansBlocks })
		};
	}

	// Ctrl/Cmd+K from a block with no toolbar visible: rebuild the toolbar from
	// the current selection, then request its link panel open. If there is no
	// usable selection/caret in a rich block (toolbar stays null), do nothing —
	// a link needs something to attach it to.
	function handleRequestLink() {
		refreshToolbar();
		if (toolbar) {
			linkRequestSeq += 1;
			toolbar = { ...toolbar, requestPanel: { panel: 'link', seq: linkRequestSeq } };
		}
	}

	// Ctrl/Cmd+Alt+F: meter el foco en la barra para caminarla con las flechas
	// (spec 033). Solo actúa con la barra en pantalla —o sea, con algo marcado—,
	// que es el momento para el que la barra existe. El contador hace única cada
	// petición, como en el pedido de enlace.
	let toolbarFocusSeq = 0;
	function handleRequestToolbarFocus() {
		refreshToolbar();
		if (toolbar) {
			toolbarFocusSeq += 1;
			toolbar = { ...toolbar, requestFocus: toolbarFocusSeq };
		}
	}

	// Misma puerta que usan aplicar y quitar enlace (anchorForRange), y no una
	// búsqueda propia: tenía su propia forma de subir por los padres, que no
	// encontraba el enlace cuando lo marcado era la palabra enlazada entera. Con
	// eso el cuadrito se abría sin la dirección actual y sin el botón Quitar.
	function currentLinkHref(range) {
		return anchorForRange(range)?.getAttribute('href') ?? '';
	}

	// Show the toolbar a short beat after the selection settles, so it does not
	// flash while the user is still dragging out a selection. Hiding stays
	// instant: while the toolbar is up we refresh right away (a collapse nulls it
	// at once); only the first appearance from a hidden state is delayed.
	const TOOLBAR_SHOW_DELAY = 300;
	let toolbarTimer = null;
	function scheduleToolbar() {
		clearTimeout(toolbarTimer);
		if (toolbar) {
			refreshToolbar();
			return;
		}
		toolbarTimer = setTimeout(() => {
			toolbarTimer = null;
			refreshToolbar();
		}, TOOLBAR_SHOW_DELAY);
	}

	$effect(() => {
		document.addEventListener('selectionchange', scheduleToolbar);
		return () => {
			clearTimeout(toolbarTimer);
			document.removeEventListener('selectionchange', scheduleToolbar);
		};
	});

	// La barra se planta donde estaba el texto marcado EN LA PANTALLA, y solo se
	// vuelve a medir cuando cambia la selección. Scrollear no cambia la
	// selección, así que la barra se quedaba clavada en la pantalla mientras el
	// texto marcado se le iba por debajo (la nota scrollea en <main>, no en la
	// ventana, y la barra vive fuera de <main>). El rango sigue siendo el mismo:
	// volver a medirlo en cada scroll la deja pegada al texto.
	// Se escribe la propiedad, no el objeto: `toolbar.rect = …` no vuelve a
	// disparar este efecto, que solo escucha si hay barra o no.
	const toolbarOpen = $derived(!!toolbar);
	$effect(() => {
		if (!toolbarOpen) return;
		function follow() {
			if (toolbar?.savedRange) toolbar.rect = toolbar.savedRange.getBoundingClientRect();
		}
		// `scroll` no burbujea: en captura llegan también los del contenedor de la
		// nota, que es el que se mueve de verdad.
		window.addEventListener('scroll', follow, true);
		window.addEventListener('resize', follow);
		return () => {
			window.removeEventListener('scroll', follow, true);
			window.removeEventListener('resize', follow);
		};
	});

	// Commands mutate the contenteditable DOM directly (execCommand / manual DOM
	// wraps), so the affected block's state is stale afterwards — re-read its
	// innerHTML and persist it.
	//
	// sanitizeHtml can normalize the markup (e.g. execCommand's <b> becomes
	// <strong>), so the sanitized string usually differs from the raw DOM.
	// BlockRow's own sync effect compares block.html against the live
	// el.innerHTML and overwrites the DOM the moment they diverge — which would
	// otherwise replace the very nodes the current selection points at,
	// silently collapsing it a tick later. Apply the sanitized HTML to the DOM
	// ourselves (so that later comparison is a no-op) and restore the selection
	// by character offset, which survives the node replacement.
	function persistActiveBlock(blockId) {
		const row = document.querySelector(`[data-block-id="${blockId}"] .block-editable`);
		if (!row) return;
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;
		const sel = window.getSelection();
		let start = null;
		let end = null;
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0);
			if (row.contains(range.startContainer) && row.contains(range.endContainer)) {
				start = textOffset(row, range.startContainer, range.startOffset);
				end = textOffset(row, range.endContainer, range.endOffset);
			}
		}
		const html = sanitizeHtml(row.innerHTML);
		if (row.innerHTML !== html) {
			row.innerHTML = html;
			if (start !== null && end !== null) {
				const restored = rangeFromTextOffsets(row, start, end);
				sel.removeAllRanges();
				sel.addRange(restored);
			}
		}
		block.html = html;
		block.content = htmlToPlainText(html);
		// Por la misma puerta que el tipeo: el guardado pendiente de la última tecla
		// lleva el html SIN formato, y salir por otro lado lo dejaría armado para
		// pisar esto medio segundo después. Con retraso, no inmediato: aplicar
		// formato es tan de a ráfagas como escribir (negrita, cursiva, color).
		writeBlock(blockId, { html: block.html, content: block.content }, 500);
	}

	// Popover-dispatched commands (currently just the link editor's Save/Remove
	// buttons) fire after focus already moved into the popover's own input, so
	// window.getSelection() no longer points at the text the toolbar was opened
	// for. Re-apply the range captured when the toolbar last refreshed before
	// any command that reads the live selection.
	function restoreSavedSelection() {
		if (!toolbar?.savedRange) return;
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(toolbar.savedRange);
	}

	function focusBlockEditable(blockId) {
		const el = document.querySelector(`[data-block-id="${blockId}"] .block-editable`);
		if (el instanceof HTMLElement) el.focus({ preventScroll: true });
	}

	// Escape en un popover de la barra (enlace, color, más) lo cierra pero deja la
	// barra abierta: spec 020 pide devolver el foco a la caja editable, con la
	// selección intacta, para que la barra siga mostrándose sobre ella.
	function restoreToolbarFocus() {
		const blockId = toolbar?.blockId;
		if (!blockId) return;
		restoreSavedSelection();
		focusBlockEditable(blockId);
	}

	// Escape con la barra sin popover la cierra del todo (spec 020). Devolvemos el
	// foco al renglón con el cursor colapsado al final de la selección previa, para
	// que la barra no reaparezca de inmediato por el cambio de selección.
	function closeToolbar() {
		const blockId = toolbar?.blockId;
		const range = toolbar?.savedRange;
		toolbar = null;
		if (range) {
			const caret = range.cloneRange();
			caret.collapse(false);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(caret);
		}
		if (blockId) focusBlockEditable(blockId);
	}

	// Única puerta de formato, venga de la barra o del teclado. Dueña del paso
	// de Deshacer, de aplicar el comando y de guardar el resultado leyéndolo del
	// DOM explícitamente — nunca depende del evento `input` del navegador, que
	// execCommand dispara distinto en cada motor (Chrome síncrono, WebKit tarde
	// o nunca).
	function runFormatCommand(blockId, name, arg, { restoreSelection = false } = {}) {
		// La puerta única de formato, y por eso el candado de sólo lectura va acá:
		// los atajos de teclado (Cmd+B y compañía) llegan por su propio camino y no
		// pasan por el `contenteditable`, así que sin esta línea seguirían
		// escribiendo en una nota ajena.
		if (readOnly) return;
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;
		if (restoreSelection) restoreSavedSelection();
		const before = currentSnapshot();
		const beforeHtml = block.html;
		const beforeType = block.type;
		// H1/H2/H3/¶ hacen dos gestos distintos según cuánto esté marcado (spec
		// 032): el renglón entero se convierte en título, como siempre; una parte
		// se agranda en el lugar, sin partir el renglón ni tocar block.type. La
		// selección ya está restaurada acá arriba, así que se puede leer.
		//
		// El cursor solo, sin nada marcado, convierte el renglón entero (spec 033):
		// es lo que hacía antes de la 032 y lo que esperan los atajos de teclado
		// —sin selección no hay nada que agrandar, así que la otra rama moriría en
		// silencio.
		const sizeCommand = name === 'h1' || name === 'h2' || name === 'h3' || name === 'normal';
		const selection = window.getSelection();
		const caretOnly = !selection || selection.isCollapsed;
		const asBlockType =
			sizeCommand && (caretOnly || selectionCoversBlock(selection.toString(), block.content));
		formattingBlockId = blockId;
		try {
			switch (name) {
				case 'h1': asBlockType ? toggleHeading(block, 'heading1') : applySize(sizeClassFor('h1')); break;
				case 'h2': asBlockType ? toggleHeading(block, 'heading2') : applySize(sizeClassFor('h2')); break;
				case 'h3': asBlockType ? toggleHeading(block, 'heading3') : applySize(sizeClassFor('h3')); break;
				case 'normal': asBlockType ? setBlockType(block, 'text') : applySize(null); break;
				case 'bold': applyInline('bold'); break;
				case 'italic': applyInline('italic'); break;
				case 'underline': applyInline('underline'); break;
				case 'strike': applyInline('strikethrough'); break;
				case 'code': toggleCode(); break;
				case 'color': applyColor(arg); break;
				case 'link': if (!applyLink(arg)) return; break;
				case 'removeLink': removeLink(); break;
				// removeFormat no toca los span con clase ni los enlaces, así que el
				// tamaño y el <a> se quitan a mano. El enlace va al final: desarmarlo
				// mueve los nodos de texto, y hacerlo antes le cambia el piso a
				// removeFormat.
				case 'clear':
					applySize(null);
					document.execCommand('removeFormat');
					removeLinksInSelection();
					break;
				default: return;
			}
		} finally {
			formattingBlockId = null;
		}
		// Los encabezados persisten por el propio setBlockType; los comandos que
		// mutan el contenteditable se leen y guardan acá. Al restaurar la selección
		// (origen barra/popover) enfocamos el renglón para que Ctrl/Cmd+Z llegue al
		// editor aunque el foco estuviera en el popover de enlace.
		if (!asBlockType) {
			persistActiveBlock(blockId);
			if (restoreSelection) {
				const el = document.querySelector(`[data-block-id="${blockId}"] .block-editable`);
				if (el instanceof HTMLElement) el.focus({ preventScroll: true });
			}
		}
		// Un solo paso de Deshacer, y solo si algo cambió de verdad.
		if (block.html !== beforeHtml || block.type !== beforeType) {
			history.push(before);
			lastTextBlockId = null;
		}
	}

	async function handleToolbarCommand(name, arg) {
		const blockId = toolbar?.blockId;
		if (!blockId) return;
		// ¿Vino del teclado? Solo entonces hay un botón de la barra ENFOCADO: con
		// el mouse los botones cancelan el foco en mousedown, justo para no
		// perder la selección del texto. Se lee ANTES de aplicar, porque aplicar
		// devuelve el foco al renglón.
		const active = document.activeElement;
		const fromKeyboard =
			active instanceof HTMLButtonElement && !!active.closest('[data-copynotes-toolbar]');
		if (name === 'copyText') {
			// El popover puede haber movido el foco; restaurar la selección guardada
			// antes de leerla (protección que ya existía).
			restoreSavedSelection();
			const text = window.getSelection()?.toString() ?? '';
			if (text) await writePlainTextToClipboard(text);
			return;
		}
		runFormatCommand(blockId, name, arg, { restoreSelection: true });
		// Elegir con el teclado cierra la barra y devuelve el cursor al texto: es
		// lo que hace cualquier menú al elegir una opción, y dejarla abierta con el
		// foco ya de vuelta en el renglón no le sirve a nadie. Con el mouse queda
		// abierta, como siempre, para poder aplicar dos formatos seguidos.
		if (fromKeyboard) closeToolbar();
		else refreshToolbar();
	}

	// Atajos de teclado (Ctrl/Cmd+B/I/U, Ctrl/Cmd+Shift+S) desde un renglón:
	// misma puerta que la barra, pero con la selección viva (no la guardada) y
	// sin reconstruir la barra flotante.
	function handleKeyboardFormat(block, name) {
		runFormatCommand(block.id, name, undefined, { restoreSelection: false });
	}

	// Con qué firma escribe este aparato AHORA, resuelto en el momento de escribir
	// y no leído de `myActor`.
	//
	// `myActor` lo llena un efecto asíncrono, así que hay un instante —el primero
	// de la nota— en que todavía vale null. Firmar 'user' ahí no es un detalle: en
	// una nota ajena `'user'` significa EL DUEÑO, o sea que el comentario recién
	// escrito aparecería atribuido a la otra persona hasta que el servidor lo
	// corrigiera treinta segundos después. La sesión ya está en memoria, así que
	// preguntarla de nuevo no cuesta un viaje.
	//
	// Se resuelve ANTES de llamar a la acción, nunca adentro: una lectura
	// encadenada dentro de una transacción de Dexie la cierra temprano.
	async function actorParaEscribir() {
		if (!isMember) return 'user';
		return (await myMemberActor()) ?? 'user';
	}

	// El comentario del invitado NO es `block.note` —ese campo es del dueño y no
	// viaja— sino una línea de bitácora, que es lo único que el servidor le acepta.
	// Cae en la misma lista donde ya se leen las notas del agente, así que aparece
	// bajo la tarea sin ninguna pantalla nueva.
	//
	// Recarga con `refreshFromStorage` y no con una lectura propia: esa función ya
	// vuelve a leer la bitácora Y a resolver los nombres, y una segunda copia del
	// mismo camino es exactamente cómo se quedan viejos los llamadores.
	async function handleComment(block, text) {
		await addTaskNote({ blockId: block.id, actor: await actorParaEscribir(), text });
		await refreshFromStorage();
	}

	// "Listo": lo mismo un piso más arriba. Habla de la nota entera, así que su
	// línea no cuelga de ningún renglón y no aparece en ninguna itálica.
	async function handleNoteDone(text) {
		await markNoteDone({ noteId: note.id, actor: await actorParaEscribir(), text });
		await refreshFromStorage();
	}

	function handleNoteInput(block, text) {
		recordTextSnapshot(`note:${block.id}`);
		block.note = text;
		scheduleSave(`note:${block.id}`, () => writeBlock(block.id, { note: text }), {
			table: 'blocks',
			id: block.id,
			changes: { note: text }
		});
	}

	// La descripción de una imagen (spec 041 §3.5): texto pelado que vive en
	// `content`, hace de `alt` y entra en la búsqueda. No pasa por
	// `handleBlockInput` a propósito — ese escribe también `block.html` y corre los
	// gatillos de "/" y "#", que en un renglón sin caja editable no tienen dónde
	// abrirse.
	function handleCaption(block, text) {
		recordTextSnapshot(block.id);
		block.content = text;
		writeBlock(block.id, { content: text }, 500);
	}

	// A new block keeps list-like types going; code and separators hand
	// over to plain text.
	function inheritType(type) {
		return type === 'bullet' || type === 'todo' ? type : 'text';
	}

	// `split` (de planSplit, lo arma el renglón porque es quien sabe dónde está
	// el cursor) parte el texto: la cabeza se queda acá y la cola baja al renglón
	// nuevo. Sin él, Enter hace lo de siempre: un renglón nuevo vacío.
	async function handleEnter(block, forcedType, split = null) {
		// El renglón vacío manda: si el estado dice que no hay texto, Enter es la
		// salida del anidado o la cancelación del tipo, aunque el navegador haya
		// dejado un <br> suelto en la caja y el corte crea ver algo que bajar.
		if (!forcedType && block.content === '') {
			const action = enterOnEmptyAction(block);
			if (action === 'outdent') {
				await handleOutdent(block);
				return;
			}
			if (action === 'convert') {
				recordSnapshot();
				block.type = 'text';
				block.checked = false;
				await writeBlock(block.id, { type: 'text', checked: false });
				focusBlockId = block.id;
				return;
			}
		}
		const plan = planEnter(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		if (split) {
			// La cabeza se guarda ya (sin los 500ms del tipeo): el renglón nuevo se
			// crea en el mismo suspiro y dos escrituras de la misma tecla no pueden
			// quedar uno a favor y otro en contra.
			block.content = split.head.content;
			block.html = split.head.html;
			await writeBlock(block.id, { content: split.head.content, html: split.head.html });
		}
		await applyUpdates(plan.updates);
		// Partir un renglón conserva su tipo (un título partido da dos títulos, una
		// tarea da dos tareas). Sin corte vale la herencia de siempre, donde un
		// título entrega un texto normal.
		const type = forcedType ?? (split ? block.type : inheritType(block.type));
		let created;
		if (type === 'todo') {
			// Una tarea nueva nace por la capa: bitácora 'created', actor user.
			({ block: created } = await createTask({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				order: plan.order,
				content: split?.tail.content ?? '',
				html: split?.tail.html
			}));
		} else {
			created = await createBlock({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				type,
				order: plan.order,
				content: split?.tail.content ?? '',
				html: split?.tail.html
			});
		}
		blocks = [...blocks, created];
		focusBlockId = created.id;
		// El cursor va donde estaba el corte: al principio del renglón nuevo, no
		// al final del texto que acaba de bajar.
		if (split) focusCaret = 0;
	}

	// Paste of multiple lines: split into blocks. Reuse the current block for
	// the first line when it is empty (typical: Enter then paste); otherwise
	// insert every line as a sibling after it. Bullets/todos come pre-typed from
	// the parser; blank lines were already dropped.
	async function handlePasteLines(block, text) {
		const parsed = parsePastedLines(text);
		if (parsed.length === 0) return;
		recordSnapshot();
		let startIndex = 0;
		let afterId = block.id;
		const isEmpty = (block.content ?? '') === '' && block.type !== 'separator';
		if (isEmpty) {
			const first = parsed[0];
			block.type = first.type;
			block.content = first.content;
			block.html = first.html ?? plainTextToHtml(first.content);
			const content = first.content;
			const html = first.html ?? plainTextToHtml(first.content);
			if (first.type === 'todo') {
				block.checked = first.checked;
				// Conversión por la capa (bitácora 'created'), con el contenido en la
				// misma escritura.
				await convertToTask({ blockId: block.id, checked: first.checked, content, html });
			} else {
				await writeBlock(block.id, { type: first.type, content, html });
			}
			startIndex = 1;
		}
		for (let i = startIndex; i < parsed.length; i++) {
			const line = parsed[i];
			const plan = planEnter(blocks, afterId);
			if (!plan) break;
			await applyUpdates(plan.updates);
			const created =
				line.type === 'todo'
					? (
							await createTask({
								noteId: note.id,
								parentBlockId: plan.parentBlockId,
								order: plan.order,
								content: line.content,
								checked: line.checked
							})
						).block
					: await createBlock({
							noteId: note.id,
							parentBlockId: plan.parentBlockId,
							type: line.type,
							order: plan.order,
							content: line.content
						});
			blocks = [...blocks, created];
			afterId = created.id;
		}
		focusBlockId = afterId;
	}

	// An external multi-line paste with clear syntax signals becomes one literal
	// code block. The detector is intentionally conservative: returning false
	// hands the same text back to the normal multi-line parser.
	function handlePasteCode(block, text) {
		if (!looksLikeCodePaste(text)) return false;
		recordSnapshot();
		cancelPending(`block:${block.id}`);
		if (slash?.blockId === block.id) slash = null;
		block.type = 'code';
		block.content = text;
		block.html = text;
		block.checked = false;
		block.codeCollapsed = false;
		writeBlock(block.id, {
			type: 'code',
			content: text,
			html: text,
			checked: false,
			codeCollapsed: false
		});
		focusBlockId = block.id;
		return true;
	}

	// Paste of CopyNotes' own copied content: rebuild the exact blocks (types,
	// checked, code, nesting) from the hidden clipboard marker. Each forest root
	// lands as a sibling after the current block, reusing the snippet-insertion
	// machinery; an empty origin block is dropped so the paste reads clean.
	async function handlePasteBlocks(block, forest) {
		if (!forest || forest.length === 0) return;
		recordSnapshot();
		let afterId = block.id;
		let tagsTouched = false;
		for (const root of forest) {
			const plan = planSnippetInsertion(
				$state.snapshot(blocks),
				{ blockSnapshot: root },
				{ noteId: note.id, afterId, createId }
			);
			await applyInsertionPlan(plan);
			for (const update of plan.updates) {
				const row = blocks.find((item) => item.id === update.id);
				if (row) row.order = update.order;
			}
			blocks = [...blocks, ...plan.newBlocks];
			// New blocks come out in pre-order, same as the flattened source nodes,
			// so tags line up 1:1. Re-create the tag by name and assign it.
			const sourceNodes = flattenNode(root);
			for (let i = 0; i < plan.newBlocks.length; i++) {
				for (const name of sourceNodes[i]?.tags ?? []) {
					const tag = await findOrCreateTag(name);
					if (tag) {
						await assignTag(tag.id, 'block', plan.newBlocks[i].id);
						tagsTouched = true;
					}
				}
			}
			afterId = plan.newBlocks[0].id;
		}
		if (tagsTouched) {
			await refreshTags();
			if (onTagsChanged) onTagsChanged();
		}
		if (originIsDisposable(blocks, block.id)) {
			cancelPending(`block:${block.id}`);
			await softDeleteBlock(block.id);
			blocks = blocks.filter((item) => item.id !== block.id);
		}
		focusBlockId = afterId;
	}

	// Donde terminan las tres puertas (spec 041 §3.4): pegar, soltar encima y
	// `/imagen`. Las capturas entran DE A UNA y esperando a la anterior — dos
	// inserciones a la vez le preguntarían a `planEnter` por el mismo lugar y una
	// se pondría encima de la otra, así que el orden en que las soltaste dejaría
	// de ser el orden en pantalla.
	async function handleInsertImages(block, files) {
		if (!files || files.length === 0) return;
		recordSnapshot();
		let afterId = block.id;
		let warned = false;
		for (const file of files) {
			// Aviso, no permiso: la estimación orienta y nada más. Se intenta igual, y
			// la última palabra la tiene el aparato con su `QuotaExceededError`, que
			// vuelve como 'failed'. Una sola vez por tanda: cinco capturas grandes no
			// son cinco avisos.
			if (!warned && (await roomIsTight(file))) {
				warned = true;
				toast.warning('Queda poco espacio en este aparato. Puede que la imagen no entre.');
			}
			const plan = planEnter(blocks, afterId);
			if (!plan) {
				// El renglón destino ya no está: lo borraron mientras el diálogo estaba
				// abierto (una baja que llegó de la nube). No es ninguno de los finales de
				// `insertImageBlock`, así que lleva su propia línea — callarse acá es el
				// error que este proyecto ya pagó una vez con el selector de archivos.
				toast.error('No se pudo poner la imagen: ese renglón ya no está.');
				break;
			}
			await applyUpdates(plan.updates);
			const result = await insertImageBlock({
				noteId: note.id,
				parentBlockId: plan.parentBlockId,
				order: plan.order,
				file,
				// La única parte que necesita un navegador de verdad entra inyectada
				// desde acá: `createImageBitmap` no existe en node ni en jsdom.
				measure: measureImage
			});
			if (result.status !== 'ready') {
				toast.error(IMAGE_INSERT_MESSAGES[result.status] ?? IMAGE_INSERT_MESSAGES.failed);
				continue;
			}
			blocks = [...blocks, result.block];
			afterId = result.block.id;
		}
		if (afterId === block.id) return; // no entró ninguna: el renglón queda como estaba
		// El renglón vacío donde cayó la captura no queda de adorno — es lo mismo que
		// hace pegar renglones, y con el mismo criterio, que ahora vive en un solo lado.
		if (originIsDisposable(blocks, block.id)) {
			cancelPending(`block:${block.id}`);
			await softDeleteBlock(block.id);
			blocks = blocks.filter((item) => item.id !== block.id);
		}
		// El cursor va a la descripción de la captura recién puesta: es el renglón
		// nuevo y es lo próximo que uno quiere escribir. Sin esto no lo tiene NADIE,
		// porque el renglón donde estaba el cursor acaba de borrarse.
		focusBlockId = afterId;
	}

	async function handleBackspaceEmpty(block) {
		if (backspaceAction(block) === 'convert') {
			recordSnapshot();
			block.type = 'text';
			block.checked = false;
			await writeBlock(block.id, { type: 'text', checked: false });
			focusBlockId = block.id;
			return;
		}
		// Un renglón vacío con sub-ítems no se puede borrar de plano (perderíamos la
		// rama), pero tampoco debe quedar como "fantasma": lo quitamos y subimos sus
		// sub-ítems un nivel para que ocupen su lugar. El cursor pasa al de arriba.
		const promote = planPromoteChildren(blocks, block.id);
		if (promote) {
			recordSnapshot();
			const prevId = previousVisibleId(blocks, block.id);
			await applyUpdates(promote.updates);
			await softDeleteBlock(block.id);
			blocks = blocks.filter((row) => row.id !== block.id);
			if (prevId) focusBlockId = prevId;
			return;
		}
		if (!canDeleteOnBackspace(blocks, block.id)) return;
		recordSnapshot();
		const prevId = previousVisibleId(blocks, block.id);
		await softDeleteBlock(block.id);
		blocks = blocks.filter((row) => row.id !== block.id);
		if (prevId) focusBlockId = prevId;
	}

	// Backspace al principio de un renglón con texto: deshace el corte de Enter.
	// El texto sube al de arriba —que manda: su tipo, su nivel y su nota se
	// quedan— y este renglón se va. `html` llega del DOM vivo del renglón; el de
	// arriba se lee del estado, que el tipeo actualiza al instante (sólo el
	// guardado tiene retraso).
	async function handleJoinPrevious(block, html) {
		const plan = planJoinWithPrevious(blocks, block.id);
		if (!plan) return;
		const previous = blocks.find((row) => row.id === plan.intoId);
		if (!previous) return;
		const join = planJoin(
			previous.html ?? plainTextToHtml(previous.content ?? ''),
			html ?? block.html ?? plainTextToHtml(block.content ?? '')
		);
		recordSnapshot();
		previous.content = join.content;
		previous.html = join.html;
		// Sin retraso, y por la puerta única: así se cancela el guardado pendiente
		// del tipeo del renglón de arriba, que medio segundo después escribiría el
		// texto de ANTES de unir.
		await writeBlock(previous.id, { content: join.content, html: join.html });
		await softDeleteBlock(block.id);
		blocks = blocks.filter((row) => row.id !== block.id);
		focusBlockId = previous.id;
		// El cursor va a la costura: donde terminaba el texto de arriba.
		focusCaret = join.caret;
	}

	// Borrar desde el menú de la línea: elimina el bloque y su subárbol. A
	// diferencia de Backspace, borra aunque tenga contenido o hijos; lo único
	// que se protege es dejar el editor sin bloques.
	async function handleDeleteBlock(block) {
		if (!canDeleteFromMenu(blocks, block.id)) return;
		recordSnapshot();
		const prevId = previousVisibleId(blocks, block.id);
		const ids = [block.id, ...listDescendantIds(blocks, block.id)];
		await softDeleteBlocks(ids);
		const removed = new Set(ids);
		blocks = blocks.filter((row) => !removed.has(row.id));
		// canDeleteFromMenu sólo cuenta renglones, y acá se va el subárbol entero:
		// una nota con padre + hijo pasa el guardia y queda en cero. Igual que al
		// borrar una selección, la nota nunca se queda sin dónde escribir.
		if (blocks.length === 0) {
			const created = await createBlock({ noteId: note.id, type: 'text' });
			blocks = [created];
			focusBlockId = created.id;
			return;
		}
		focusBlockId = prevId ?? blocks[0]?.id ?? null;
	}

	async function handleIndent(block) {
		const plan = planIndent(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		// Expand the new parent so the indented block does not vanish.
		const parentId = plan.updates[0].parentBlockId;
		const parent = blocks.find((row) => row.id === parentId);
		if (parent && parent.collapsed) {
			parent.collapsed = false;
			await writeBlock(parent.id, { collapsed: false });
		}
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleOutdent(block) {
		const plan = planOutdent(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveUp(block) {
		const plan = planMoveUp(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleMoveDown(block) {
		const plan = planMoveDown(blocks, block.id);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		focusBlockId = block.id;
	}

	async function handleToggleCollapsed(block) {
		recordSnapshot();
		block.collapsed = !block.collapsed;
		await writeBlock(block.id, { collapsed: block.collapsed });
	}

	async function handleToggleCodeCollapsed(block) {
		recordSnapshot();
		block.codeCollapsed = !(block.codeCollapsed ?? false);
		await writeBlock(block.id, { codeCollapsed: block.codeCollapsed });
	}

	async function handleCopy(block, withChildren) {
		const tree = buildCopyTree(blocks, block.id, withChildren);
		try {
			await writeToClipboard({
				text: formatPlainText(tree),
				html: formatHtml(tree),
				custom: serializeForest([treeToNode(tree, blockTagsMap)])
			});
			// The copy button confirms locally by swapping its icon to a check
			// (BlockRow), so no toast here — avoids a redundant double signal
			// (spec 024, Stages 5 & 7). Selection copy keeps its toast: many
			// blocks, no single icon to flip.
		} catch {
			toast.error('No se pudo copiar. Probá de nuevo.');
		}
	}

	async function handleToggleChecked(block) {
		// La capa de tareas aplica la cascada Y deja la bitácora (done/reopened
		// por tarea, actor user). El snapshot de Deshacer sale del estado en
		// memoria — que todavía no mutó — así que tomarlo después del write
		// preserva el mismo undo de antes.
		//
		// El rol se resuelve ACÁ, antes de entrar a la transacción (spec 038 §5).
		// En una nota ajena la firma es la de miembro y el renglón se escribe como
		// cache. Por la misma puerta que el comentario, y por el mismo motivo:
		// leerla del estado deja una ventana en la que la firma todavía no llegó.
		const plan = await setTaskChecked({
			noteId: note.id,
			blockId: block.id,
			actor: await actorParaEscribir(),
			fromCloud: isMember
		});
		if (!plan) return;
		recordSnapshot();
		for (const update of plan.updates) {
			const { id, ...changes } = update;
			const row = blocks.find((b) => b.id === id);
			if (row) Object.assign(row, changes);
		}
	}

	// --- Multi-block selection ---

	function shiftSelect(block) {
		const anchor = selection?.anchorId ?? activeBlockId ?? block.id;
		selection = { anchorId: anchor, focusId: block.id };
		// Un rango nuevo es una selección nueva: el menú de grupo muere con el
		// rango que lo abrió. Si no, queda guardado y se abre solo más tarde,
		// sobre renglones que nadie eligió (y su Enter convertiría esos).
		selectionMenu = null;
	}

	function clearSelection() {
		selection = null;
		selectionMenu = null;
	}

	// A plain mousedown clears any selection and arms a drag from this block.
	function startDrag(block) {
		clearSelection();
		dragAnchorId = block.id;
		dragging = false;
	}

	// Mouse dragged into another block with the button held: grow the block
	// selection to cover the range, and drop the native text selection.
	function dragOver(block, buttons) {
		if (reorder.active) return; // a block-move drag owns the pointer
		if (!dragAnchorId || !(buttons & 1) || block.id === dragAnchorId) return;
		dragging = true;
		selection = { anchorId: dragAnchorId, focusId: block.id };
		selectionMenu = null; // rango nuevo, menú viejo afuera (ver shiftSelect)
		window.getSelection()?.removeAllRanges();
	}

	function endDrag() {
		dragAnchorId = null;
		dragging = false;
	}

	// Reset the drag on any mouse release, even outside the editor.
	$effect(() => {
		window.addEventListener('pointerup', endDrag);
		return () => window.removeEventListener('pointerup', endDrag);
	});

	// True when the caret sits on the block's first (up) or last (down) visual
	// line, so a further Shift+Arrow should jump to the neighbour block instead
	// of selecting more text inside the current one. Handles wrapped lines via
	// the caret's client rect, not the raw content.
	function caretAtBlockEdge(direction) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return true;
		const range = sel.getRangeAt(0);
		if (!range.collapsed) return false; // mid text-selection: let the browser extend it
		const el = document.activeElement;
		if (!el || el.getAttribute('contenteditable') === null) return true;
		const rects = range.getClientRects();
		const caret = rects.length ? rects[0] : range.getBoundingClientRect();
		// Un renglón vacío no le da rectángulo al cursor: el navegador devuelve
		// ceros. Sin esto la cuenta se hacía contra el borde de la pantalla, así
		// que "abajo" nunca daba borde y la flecha ↓ se clavaba en el primer
		// renglón vacío (↑ salía bien de pura casualidad, por el mismo cero).
		// Un renglón vacío es su primera y su última línea a la vez.
		if (!caret.height) return true;
		const box = el.getBoundingClientRect();
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
		return direction < 0
			? caret.top - box.top < lineHeight * 0.75
			: box.bottom - caret.bottom < lineHeight * 0.75;
	}

	// Bare Up/Down: cross to the neighbour block when the caret sits at this
	// block's visual edge, landing at the same horizontal column. Returns true
	// when it consumed the key (moved); false lets the browser move inside the
	// wrapped block. Places the caret directly (no focusBlockId) so BlockRow's
	// focus effect does not yank the caret to the block's end.
	function handleVerticalArrow(block, direction) {
		if (hasSelection) return false;
		if (!caretAtBlockEdge(direction)) return false;
		const neighborId = neighborVisibleId(blocks, block.id, direction);
		if (!neighborId) return false;
		const x = caretColumnX();
		const el = document.querySelector(`[data-block-id="${neighborId}"] [data-block-surface]`);
		if (!(el instanceof HTMLElement)) return false;
		el.focus();
		if (el.getAttribute('contenteditable') !== null) {
			if (x == null || !placeCaretAtColumn(el, x, edgeForDirection(direction))) {
				const sel = window.getSelection();
				sel.selectAllChildren(el);
				sel.collapseToEnd();
			}
		}
		return true;
	}

	// Shift+Arrow extends an active block selection, or starts one from the
	// focused block when the caret is at that block's edge. Returns false to let
	// the browser do normal in-line text selection.
	function extendSelection(direction) {
		if (hasSelection) {
			const focus = neighborVisibleId(blocks, selection.focusId, direction);
			if (focus) selection = { anchorId: selection.anchorId, focusId: focus };
			selectionMenu = null; // rango nuevo, menú viejo afuera (ver shiftSelect)
			return true;
		}
		if (!activeBlockId || !caretAtBlockEdge(direction)) return false;
		const neighbor = neighborVisibleId(blocks, activeBlockId, direction);
		if (!neighbor) return false;
		selection = { anchorId: activeBlockId, focusId: neighbor };
		selectionMenu = null; // rango nuevo, menú viejo afuera (ver shiftSelect)
		return true;
	}

	async function copySelection() {
		const rootIds = orderedSelectionRoots(blocks, selectedIds);
		const trees = rootIds.map((id) => buildCopyTree(blocks, id, true));
		try {
			await writeToClipboard({
				text: trees.map(formatPlainText).join('\n'),
				html: trees.map(formatHtml).join(''),
				custom: serializeForest(trees.map((tree) => treeToNode(tree, blockTagsMap)))
			});
			toast.success(`Copiado (${rootIds.length})`);
		} catch {
			toast.error('No se pudo copiar. Probá de nuevo.');
		}
	}

	async function deleteSelection() {
		recordSnapshot();
		const ids = planDeleteSelection(blocks, selectedIds);
		const last = selectedIds[selectedIds.length - 1];
		const first = selectedIds[0];
		const focusTarget =
			neighborVisibleId(blocks, last, 1) ?? neighborVisibleId(blocks, first, -1);
		selection = null;
		await softDeleteBlocks(ids);
		const removed = new Set(ids);
		blocks = blocks.filter((block) => !removed.has(block.id));
		if (blocks.length === 0) {
			const created = await createBlock({ noteId: note.id, type: 'text' });
			blocks = [created];
			focusBlockId = created.id;
		} else if (focusTarget && blocks.some((block) => block.id === focusTarget)) {
			focusBlockId = focusTarget;
		} else {
			focusBlockId = blocks[0].id;
		}
	}

	// Tab / Shift+Tab over a multi-block selection: the whole group moves a level,
	// not just the focused row. direction 1 = indent, -1 = outdent.
	async function indentSelectedBlocks(direction) {
		const plan =
			direction > 0
				? planIndentSelection(blocks, selectedIds)
				: planOutdentSelection(blocks, selectedIds);
		if (!plan) return;
		recordSnapshot();
		// Expand the new parent so the indented group does not vanish under it.
		const parentId = plan.updates[0].parentBlockId;
		const parent = parentId && blocks.find((row) => row.id === parentId);
		if (parent && parent.collapsed) {
			parent.collapsed = false;
			await writeBlock(parent.id, { collapsed: false });
		}
		await applyUpdates(plan.updates);
		// Reparenting moves the focused block's DOM node, which blurs it. Refocus
		// so the next Tab still reaches this handler.
		if (selection) focusBlockId = selection.focusId;
	}

	// Aplica un tipo a todo el grupo marcado. Solo el renglón que NACE tarea pasa
	// por convertToTask (deja la línea 'created' que lee el agente); uno que ya
	// era tarea y sigue siéndolo va por updateBlock como cualquier otro tipo, o
	// se duplicaría el 'created' en su bitácora. El tipo previo se guarda antes
	// de mutar `row`, porque Object.assign ya lo pisa. Un solo recordSnapshot:
	// un Ctrl/Cmd+Z deshace la conversión entera.
	async function applySelectionType(type) {
		const plan = planTypeChangeSelection(blocks, selectedIds, type);
		selectionMenu = null;
		if (!plan) return;
		recordSnapshot();
		// Un guardado con retraso del tipeo (mismo renglón, misma clave) aterriza
		// PRIMERO, no después: si no, llegaría encima de la conversión y la pisaría
		// — el caso filoso es Código, que devolvería el html con formato sobre el
		// html plano que esta conversión acaba de escribir. Cancelarlo, que era lo
		// que se hacía antes, tiraba el texto recién tecleado: la conversión guarda
		// sólo el tipo, así que ese texto no llegaba nunca al disco y volvía la
		// versión vieja al recargar.
		await flushPending();
		for (const update of plan.updates) {
			const { id, ...changes } = update;
			const row = blocks.find((block) => block.id === id);
			const becomesTask = changes.type === 'todo' && row?.type !== 'todo';
			if (row) Object.assign(row, changes);
			if (becomesTask) await convertToTask({ blockId: id, checked: changes.checked });
			else await writeBlock(id, changes);
		}
		// La selección sigue marcada: el siguiente Tab / Alt+↓ / Cmd+C actúa
		// sobre el mismo grupo, así que hay que devolverle el foco.
		if (selection) focusBlockId = selection.focusId;
	}

	async function moveSelectedBlocks(direction) {
		const plan = planMoveSelection(blocks, selectedIds, direction);
		if (!plan) return;
		recordSnapshot();
		await applyUpdates(plan.updates);
		// Reordering moves the focused block's DOM node, which blurs it. Refocus
		// so the next Alt+Arrow still reaches the editor's key handler.
		if (selection) focusBlockId = selection.focusId;
	}

	// Runs in capture phase so it can preempt the focused block's own keys while
	// a multi-block selection is active. stopPropagation is essential: without
	// it the event still reaches the focused block's keydown, double-handling
	// the key (e.g. Alt+Arrow would also do a single-block move — corrupting
	// order at an edge where the group move is a no-op).
	function claim(event) {
		event.preventDefault();
		event.stopPropagation();
	}
	// Every focusable block surface (editable, separator, collapsed-code toggle)
	// carries data-block-surface, so new block controls only need the attribute.
	// isContentEditable stays so the note editable keeps undo/copy handling.
	function isBlockKeyboardTarget(target) {
		return (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.hasAttribute('data-block-surface'))
		);
	}
	function handleSelectionKeys(event) {
		// Undo/redo win over everything inside a block or its collapsed-code
		// control. The note title is a plain <input> and keeps native undo.
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && isBlockKeyboardTarget(event.target)) {
			claim(event);
			if (event.shiftKey) restore(history.redo(currentSnapshot()));
			else restore(history.undo(currentSnapshot()));
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y' && isBlockKeyboardTarget(event.target)) {
			claim(event);
			restore(history.redo(currentSnapshot()));
			return;
		}
		if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			if (extendSelection(event.key === 'ArrowDown' ? 1 : -1)) claim(event);
			return;
		}
		// Cmd/Ctrl+C with no multi-selection and a collapsed caret inside a block:
		// copy that whole block richly (custom format) so code, separators and
		// tags survive a paste. A real in-block text selection falls through to
		// the browser's native copy of just that text.
		if (
			(event.metaKey || event.ctrlKey) &&
			event.key.toLowerCase() === 'c' &&
			!hasSelection &&
			isBlockKeyboardTarget(event.target)
		) {
			const sel = window.getSelection();
			const activeBlock = activeBlockId && blocks.find((block) => block.id === activeBlockId);
			const wholeBlockControl =
				!event.target.isContentEditable && event.target.hasAttribute('data-block-surface');
			if ((wholeBlockControl || !sel || sel.isCollapsed) && activeBlock) {
				claim(event);
				handleCopy(activeBlock, false);
			}
			return;
		}
		if (!hasSelection) return;
		// Menú de grupo abierto: se queda con sus teclas antes que cualquier otra
		// rama, o Tab anidaría y Escape soltaría la selección con el menú abierto.
		if (selectionMenu) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				claim(event);
				const next = moveSelection(
					selectionMenu.index,
					event.key === 'ArrowDown' ? 1 : -1,
					SELECTION_TYPE_COMMANDS.length
				);
				selectionMenu = { index: next };
				return;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				claim(event);
				applySelectionType(SELECTION_TYPE_COMMANDS[selectionMenu.index].id);
				return;
			}
			if (event.key === 'Escape') {
				claim(event);
				selectionMenu = null;
				focusBlockId = selection.focusId;
				return;
			}
			// Cualquier otra tecla cierra el menú y sigue su curso normal.
			selectionMenu = null;
		}
		// "/" con varios renglones marcados abre el menú para todo el grupo. El
		// carácter no entra en ningún renglón: la tecla se consume acá.
		if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
			claim(event);
			selectionMenu = { index: 0 };
			return;
		}
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
			claim(event);
			copySelection();
			return;
		}
		if (event.key === 'Backspace' || event.key === 'Delete') {
			claim(event);
			deleteSelection();
			return;
		}
		if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			claim(event);
			moveSelectedBlocks(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Tab') {
			claim(event);
			indentSelectedBlocks(event.shiftKey ? -1 : 1);
			return;
		}
		if (event.key === 'Escape') {
			claim(event);
			const anchor = selection.focusId;
			clearSelection();
			focusBlockId = anchor;
			return;
		}
		// A bare arrow drops the selection and lets the caret move normally.
		if (!event.altKey && !event.metaKey && !event.ctrlKey && event.key.startsWith('Arrow')) {
			clearSelection();
			return;
		}
		// A plain keystroke drops the selection and resumes normal editing.
		if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
			clearSelection();
		}
	}

	async function refreshTags() {
		const blockIds = blocks.map((block) => block.id);
		const [tags, noteMap, blockMap] = await Promise.all([
			listTags(),
			listTagsForMany('note', [noteId]),
			listTagsForMany('block', blockIds)
		]);
		allTags = tags;
		noteTags = noteMap[noteId] ?? [];
		blockTagsMap = blockMap;
	}

	// Closing a picker must hand focus back to where the user was, otherwise
	// Escape drops the caret to <body> and they have to click back in.
	// A close without a pick (Escape, click outside) leaves the typed "#" alone:
	// it was never removed, so it just goes back to being an ordinary character.
	function closeTagPicker() {
		const target = tagPickerFor;
		tagPickerFor = null;
		if (target?.type === 'block') focusBlockId = target.id;
		else if (target?.type === 'note') titleEl?.focus();
	}

	// One handler for both note and block picks: create the tag if it is new,
	// then toggle the assignment and close — one pick, one tag, back to writing.
	async function handleTagPick(option) {
		const target = tagPickerFor;
		if (!target) return;
		// The "#" was a command after all: cut it out now, before any await, so a
		// keystroke landing mid-write can't shift the offset under us. Clearing
		// the anchor keeps a second pass from cutting a second character.
		if (target.type === 'block' && target.hashAnchor != null) {
			tagPickerFor = { ...target, hashAnchor: null };
			const row = blocks.find((block) => block.id === target.id);
			if (row) {
				const { content, html } = strippedSlashFields(row, target.hashAnchor, '');
				row.content = content;
				row.html = html;
				// The debounced save queued by handleBlockInput still holds the "#".
				cancelPending(`block:${row.id}`);
				writeBlock(row.id, { content, html });
			}
		}
		const tag = option.kind === 'create' ? await findOrCreateTag(option.name) : option.tag;
		if (!tag) return;
		if (option.kind === 'tag' && option.assigned) {
			await unassignTag(tag.id, target.type, target.id);
		} else {
			await assignTag(tag.id, target.type, target.id);
			if (target.type === 'block') pulseMenu(target.id);
		}
		closeTagPicker();
		await refreshTags();
		if (onTagsChanged) onTagsChanged();
	}

	async function removeTag(type, id, tag) {
		await unassignTag(tag.id, type, id);
		await refreshTags();
		if (onTagsChanged) onTagsChanged();
	}

	function cancelPending(key) {
		const entry = pending.get(key);
		if (entry) {
			clearTimeout(entry.timer);
			pending.delete(key);
		}
	}

	async function insertSnippetBlocks(snippet, afterId) {
		recordSnapshot();
		// $state proxies can't be structured-cloned into IndexedDB.
		const plan = planSnippetInsertion($state.snapshot(blocks), $state.snapshot(snippet), {
			noteId: note.id,
			afterId,
			createId
		});
		await applyInsertionPlan(plan);
		for (const update of plan.updates) {
			const row = blocks.find((block) => block.id === update.id);
			if (row) row.order = update.order;
		}
		blocks = [...blocks, ...plan.newBlocks];
		focusBlockId = plan.focusId;
		flashBlocks(plan.newBlocks.map((newBlock) => newBlock.id));
	}

	// Remove the "/query" span from a row's plain content and html, preserving
	// the surrounding inline formatting. keepSlash leaves the "/" itself in
	// place (snippet-picker mode keeps filtering off it). handleTagPick reuses
	// it with an empty query to cut out the single "#" that opened the picker.
	function strippedSlashFields(row, anchor, query, keepSlash = false) {
		const start = anchor + (keepSlash ? 1 : 0);
		const end = anchor + 1 + query.length;
		const plain = row.content ?? '';
		const content = plain.slice(0, start) + plain.slice(end);
		const html =
			(row.html ?? '') !== '' ? removePlainTextRange(row.html, start, end) : plainTextToHtml(content);
		return { content, html };
	}

	async function applySnippetPick(snippet) {
		const row = blocks.find((block) => block.id === slash.blockId);
		const stripped = row ? strippedSlashFields(row, slash.anchor, slash.query) : null;
		slash = null;
		if (!row) return;
		await insertSnippetBlocks(snippet, row.id);
		// The "/…" span only existed to drive the picker. Strip it; when nothing
		// remains and the row has no children, drop the row entirely (deleting a
		// parent would orphan its children).
		const hasChildren = blocks.some((block) => (block.parentBlockId ?? null) === row.id);
		cancelPending(`block:${row.id}`);
		if (stripped.content === '' && !hasChildren) {
			await softDeleteBlock(row.id);
			blocks = blocks.filter((block) => block.id !== row.id);
		} else {
			row.content = stripped.content;
			row.html = stripped.html;
			await writeBlock(row.id, { content: stripped.content, html: stripped.html });
		}
	}

	// Un cambio llegó de afuera (la nube, un agente) y hay que mostrarlo SIN
	// re-montar el editor: re-montarlo tira el foco y puede partir en dos el
	// renglón que se está escribiendo. Ver `editor/reconcile.ts`.
	// `force` son renglones que se actualizan aunque estén protegidos: los usa una
	// decisión explícita de la persona (elegir qué versión queda), que casi
	// siempre se toma parada sobre ese mismo renglón. Sin esto, su elección
	// quedaría esperando a que mueva el cursor.
	export async function refreshFromStorage(force) {
		const id = noteId;
		const [loadedNote, loadedBlocks, loadedActivity] = await Promise.all([
			getNote(id),
			listBlocksByNote(id),
			listActivityByNote(id)
		]);
		// La nota cambió mientras leíamos: el efecto de carga ya se encarga.
		if (noteId !== id || !loadedNote) return;

		// Intocables: donde está el cursor y todo lo que tiene un guardado en
		// vuelo (el mapa `pending` los tiene bajo `block:<id>` y `note:<id>`).
		// `activeBlockId` sobrevive al foco a propósito (ver arriba), así que el
		// escudo se pregunta además si el cursor sigue adentro de la lista.
		const guarded = new Set(caretInside && activeBlockId ? [activeBlockId] : []);
		for (const key of pending.keys()) {
			const [kind, entityId] = key.split(':');
			if (kind === 'block' || kind === 'note') guarded.add(entityId);
		}
		for (const blockId of force ?? []) guarded.delete(blockId);

		const reconciled = reconcileBlocks(blocks, loadedBlocks, guarded);
		blocks = reconciled.blocks;
		// Llegó algo de afuera que las fotos del historial no conocen —un renglón
		// nuevo, uno que se fue, o el texto de uno que ya estaba—: deshacer sobre
		// esas fotos restaura la versión de antes ENCIMA de lo que trajo el otro
		// aparato, y después la sube. Perder profundidad de Deshacer es barato;
		// pisar lo del otro no lo es.
		if (reconciled.historyStale) {
			history.reset();
			lastTextBlockId = null;
		}
		// Los que quedaron esperando se reintentan cuando el cursor se va (efecto
		// más abajo). Sin eso, ese renglón se queda con la versión vieja hasta el
		// próximo cambio de la nube, y editarlo sube esa versión vieja.
		deferredRefresh = reconciled.deferred.length > 0;
		conflicts = await conflictsByBlock(loadedBlocks.map((row) => row.id));
		await applyActivity(loadedActivity);
		// El título se edita en su propio campo: sólo se pisa si nadie lo está
		// escribiendo en este momento.
		if (!pending.has(`title:${id}`)) note.title = loadedNote.title;
		note.agentVisible = loadedNote.agentVisible;
	}

	// El cursor se fue de un renglón que había quedado esperando: ahora sí se
	// puede traer lo que llegó. Sin esto, ese renglón se queda con la versión
	// vieja hasta el próximo cambio de la nube — y editarlo la vuelve a subir,
	// pisando la del otro dispositivo.
	$effect(() => {
		void activeBlockId;
		void caretInside;
		if (!deferredRefresh) return;
		refreshFromStorage().catch(() => {
			// Un fallo de lectura acá no rompe nada: se reintenta en la próxima.
		});
	});

	// Elegir qué versión queda, desde el propio renglón: se toca la versión, no un
	// botón. Un solo toque decide, así que el camino de vuelta también tiene que
	// ser uno — el aviso con "Deshacer" es lo que reemplaza al segundo clic que
	// antes hacía de red.
	async function resolveConflict(blockId, choice) {
		const conflict = conflicts[blockId];
		if (!conflict) return;
		const remoteDeleted = Boolean(conflict.remote?.deletedAt);
		const undo = await (choice === 'mine' ? keepLocal(conflict.id) : takeRemote(conflict.id));
		await refreshFromStorage([blockId]);
		bumpAgentData();
		if (!undo) return;
		toast.success(
			choice === 'mine'
				? 'Te quedaste con tu versión'
				: remoteDeleted
					? 'Borraste el renglón, como en el otro aparato'
					: 'Trajiste la versión del otro aparato',
			{
				duration: 6000,
				action: {
					label: 'Deshacer',
					onClick: async () => {
						await undoDecision(undo);
						await refreshFromStorage([blockId]);
						bumpAgentData();
					}
				}
			}
		);
	}

	async function handleSaveSnippet(block) {
		const fields = snippetFieldsFromBlocks($state.snapshot(blocks), block.id, note.id);
		await createSnippet(fields);
		toast.success('Snippet guardado');
		if (onSnippetsChanged) onSnippetsChanged();
	}

	async function applySlashCommand(command) {
		if (command.kind === 'snippet') {
			await applySnippetPick(command.snippet);
			return;
		}
		const row = blocks.find((block) => block.id === slash.blockId);
		if (!row) {
			slash = null;
			return;
		}
		const anchor = slash.anchor;
		// The last keystroke of "/query" left a debounced content save behind;
		// fired later it would re-write the text this command strips.
		cancelPending(`block:${row.id}`);
		if (command.id === 'snippet') {
			// Switch the menu into snippet-picker mode; the block keeps its "/"
			// so typing keeps filtering the snippet list.
			const snippets = await listSnippets();
			const kept = strippedSlashFields(row, anchor, slash.query, true);
			row.content = kept.content;
			row.html = kept.html;
			slash = { blockId: slash.blockId, anchor, query: '', index: 0, mode: 'snippets', snippets };
			// Caret before the write, for the same reason as below: typing to filter
			// the snippet list must not race a database round-trip.
			focusBlockId = row.id;
			focusCaret = anchor + 1;
			await writeBlock(row.id, { content: kept.content, html: kept.html });
			return;
		}
		if (command.id === 'image') {
			// `/imagen` es una ACCIÓN, no un cambio de tipo: abre el selector y recién
			// cuando VUELVE un archivo se come el "/imagen" que la persona escribió.
			// Cancelar no consume NADA — ni el "/", ni el tipo del renglón, ni el
			// lugar del cursor.
			//
			// Ese "nada" hay que escribirlo: `cancelPending` de arriba ya tiró el
			// guardado con retraso de ese texto, así que sin esta escritura el
			// "/imagen" se vería en pantalla y desaparecería al recargar. Y el cursor
			// se vuelve a poner donde estaba porque el diálogo del sistema se lo lleva
			// al abrirse.
			const query = slash.query;
			slash = null;
			const chosen = await openImageFiles();
			if (chosen.status !== 'opened') {
				focusBlockId = row.id;
				focusCaret = anchor + 1 + query.length;
				await writeBlock(row.id, { content: row.content ?? '', html: row.html ?? '' });
				return;
			}
			const kept = strippedSlashFields(row, anchor, query);
			row.content = kept.content;
			row.html = kept.html;
			await writeBlock(row.id, { content: kept.content, html: kept.html });
			await handleInsertImages(row, chosen.files);
			return;
		}
		// Strip the "/query" span; whatever the user had typed around it stays,
		// and the caret goes back to where the "/" was.
		const stripped = strippedSlashFields(row, anchor, slash.query);
		slash = null;
		row.content = stripped.content;
		row.html = stripped.html;
		const textWrite = { content: stripped.content, html: stripped.html };

		if (command.id === 'date') {
			// The block keeps its type — a date is a field, not a block type.
			await writeBlock(row.id, textWrite);
			datePanelFor = row.id;
			datePanelCaret = anchor;
			return;
		}
		if (command.id === 'separator') {
			await writeBlock(row.id, textWrite);
			if (stripped.content === '') {
				row.type = 'separator';
				await writeBlock(row.id, { type: 'separator' });
				await handleEnter(row, 'text');
				return;
			}
			// The block has real text: keep it and insert the separator below,
			// followed by the empty text block the empty-block flow also leaves.
			await handleEnter(row, 'separator');
			const separator = blocks.find((block) => block.id === focusBlockId);
			if (separator) await handleEnter(separator, 'text');
			return;
		}

		// Everything below lands the caret back where the "/" was, and the caret
		// is placed by an effect that runs after the row re-renders. So every
		// change the row *shows* is applied first, then the caret is claimed, and
		// only then does anything touch the database: awaiting a write before
		// claiming it left the caret unplaced for two round-trips — long enough
		// for a character typed right after Enter to land at the start of the line
		// instead of at the "/".
		if (HEADING_TYPES.includes(command.id)) {
			// Headings are a type change, not an insert, so no new block is created.
			const changes = planBlockType(row, command.id);
			if (!changes) return;
			Object.assign(row, changes);
			focusBlockId = row.id;
			focusCaret = anchor;
			await writeBlock(row.id, { ...textWrite, ...changes });
			return;
		}
		row.type = command.id;
		if (command.id === 'code') row.html = row.content;
		if (command.id === 'todo') row.checked = false;
		focusBlockId = row.id;
		focusCaret = anchor;
		if (command.id === 'todo') {
			// La tarea nace acá: la capa escribe el tipo y la línea 'created'.
			await writeBlock(row.id, textWrite);
			await convertToTask({ blockId: row.id, checked: false });
		} else {
			await writeBlock(row.id, { ...textWrite, type: command.id, html: row.html });
		}
	}

	async function handleDatePick(block, day) {
		datePanelFor = null;
		recordSnapshot();
		block.dueDate = day;
		// Structural change: persist immediately, never debounced.
		await writeBlock(block.id, { dueDate: day });
		onDatesChanged?.(); // let an open Agenda refresh live
		pulseMenu(block.id);
		focusBlockId = block.id;
		focusCaret = datePanelCaret;
		datePanelCaret = null;
	}

	async function handleDateRemove(block) {
		datePanelFor = null;
		recordSnapshot();
		block.dueDate = null;
		await writeBlock(block.id, { dueDate: null });
		onDatesChanged?.(); // let an open Agenda refresh live
		focusBlockId = block.id;
		focusCaret = datePanelCaret;
		datePanelCaret = null;
	}

	function handleSlashKey(key) {
		if (!slash) return;
		if (key === 'Escape') {
			slash = null;
			return;
		}
		if (key === 'ArrowDown') {
			slash.index = moveSelection(slash.index, 1, slashCommands.length);
			return;
		}
		if (key === 'ArrowUp') {
			slash.index = moveSelection(slash.index, -1, slashCommands.length);
			return;
		}
		if (key === 'Enter' || key === 'Tab') {
			const command = slashCommands[slash.index];
			if (command) applySlashCommand(command);
			else slash = null;
		}
	}
</script>

{#if note}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="cn-editor mx-auto w-full max-w-(--editor-max-width) px-[0.9rem] py-6 md:px-6 md:py-14 {dragging
			? 'select-none'
			: ''}"
		onkeydowncapture={handleSelectionKeys}
	>
		<div class="sr-only" role="status" aria-live="polite">{selectionAnnouncement}</div>
		<div class="sr-only" role="status" aria-live="polite">{conflictAnnouncement}</div>
		<div class="group/title flex items-center gap-2">
			<input
				bind:this={titleEl}
				value={note.title}
				oninput={handleTitleInput}
				onkeydown={handleTitleKeydown}
				readonly={readOnly}
				placeholder="Sin título"
				aria-label="Título de la nota"
				autocomplete="off"
				name="note-title"
				class="cn-note-title placeholder:text-faint min-w-0 flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none md:text-4xl"
			/>
			<button
				type="button"
				onclick={toggleAgentVisible}
				aria-label={agentBridgeAvailable
					? 'Visible para agentes'
					: `Visible para agentes — ${AGENT_WEB_CAVEAT}`}
				aria-pressed={note.agentVisible === true}
				use:tooltip={agentTooltip}
				class="focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-md transition-[color,opacity] duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {note.agentVisible
					? 'text-primary opacity-100'
					: 'text-faint hover:text-foreground opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100'}"
			>
				<Bot size={18} aria-hidden="true" />
			</button>
			<div class="relative shrink-0">
				<button
					type="button"
					aria-label="Etiquetar nota"
					use:tooltip={'Etiquetar nota'}
					onclick={() =>
						(tagPickerFor = tagPickerFor?.type === 'note' ? null : { type: 'note', id: note.id })}
					aria-expanded={tagPickerFor?.type === 'note'}
					class="text-faint hover:text-foreground focus-visible:ring-ring flex size-8 items-center justify-center rounded-md transition-[color,opacity] duration-(--motion-fast) focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none {tagPickerFor?.type ===
						'note' || noteTags.length > 0
						? 'opacity-100'
						: 'opacity-0 group-hover/title:opacity-100 group-focus-within/title:opacity-100'}"
				>
					<Tag size={18} aria-hidden="true" />
				</button>
				{#if tagPickerFor?.type === 'note'}
					<TagPicker
						tags={allTags}
						assignedIds={noteTags.map((tag) => tag.id)}
						onPick={handleTagPick}
						onClose={closeTagPicker}
						align="right"
					/>
				{/if}
			</div>
		</div>
		{#if noteTags.length > 0}
			<div class="mt-3 flex flex-wrap items-center gap-1.5">
				<TagChips tags={noteTags} onRemove={(tag) => removeTag('note', note.id, tag)} />
			</div>
		{/if}
		<!-- focusin/focusout en la lista entera: moverse de un renglón a otro
		     dispara los dos en el mismo tick, así que el escudo no parpadea. -->
		<div
			class="relative mt-6 flex flex-col"
			bind:this={listEl}
			onfocusin={() => (caretInside = true)}
			onfocusout={() => (caretInside = false)}
		>
			{#if reorder.indicator}
				<div
					class="pointer-events-none absolute z-10 h-0.5 bg-primary"
					style="left: {reorder.indicator.depth * 1.5}rem; right: 0; top: {reorder.indicator.top}px;"
				></div>
			{/if}
			{#each visible as row, index (row.block.id)}
				<BlockRow
					block={row.block}
					{readOnly}
					guest={isMember}
					depth={row.depth}
					hasChildren={row.hasChildren}
					agentNotes={agentNotes[row.block.id] ?? []}
					conflict={conflicts[row.block.id] ?? null}
					onConflictResolve={(block, choice) => resolveConflict(block.id, choice)}
					focused={focusBlockId === row.block.id}
					active={activeBlockId === row.block.id}
					flash={flashBlockIds.has(row.block.id)}
					pulseMenu={pulseMenuBlockId === row.block.id}
					placeholder={index === 0 && visible.length === 1 ? 'Escribí algo, o "/" para elegir tipo…' : ''}
					slashOpen={groupMenu
						? selection?.focusId === row.block.id
						: slash !== null && slash.blockId === row.block.id}
					slashCommands={groupMenu ? SELECTION_TYPE_COMMANDS : slashCommands}
					slashIndex={groupMenu ? groupMenu.index : slash ? slash.index : 0}
					slashTitle={groupMenu ? `Convertir ${selectedIds.length} renglones en…` : ''}
					onInput={handleBlockInput}
					onFormat={handleKeyboardFormat}
					onNoteInput={handleNoteInput}
					onCaption={handleCaption}
					onComment={handleComment}
					onEnter={handleEnter}
					onBackspaceEmpty={handleBackspaceEmpty}
					onJoinPrevious={handleJoinPrevious}
					onIndent={handleIndent}
					onOutdent={handleOutdent}
					onMoveUp={handleMoveUp}
					onMoveDown={handleMoveDown}
					onDelete={handleDeleteBlock}
					onToggleCollapsed={handleToggleCollapsed}
					onToggleCodeCollapsed={handleToggleCodeCollapsed}
					onToggleChecked={handleToggleChecked}
					onCopy={handleCopy}
					onSaveSnippet={handleSaveSnippet}
					onActive={(row) => (activeBlockId = row.id)}
					selected={selectedSet.has(row.block.id)}
					onShiftSelect={shiftSelect}
					onPlainMousedown={startDrag}
					onTextSelectionMousedown={textSelectionMousedown}
					onDragOver={dragOver}
					onDragHold={(id, event) => reorder.armFromPointer(id, event)}
					onDragHandle={(id, event) => reorder.armFromHandle(id, event)}
					tags={blockTagsMap[row.block.id] ?? []}
					{allTags}
					tagPickerOpen={tagPickerFor?.type === 'block' && tagPickerFor.id === row.block.id}
					onTag={(block) =>
						(tagPickerFor =
							tagPickerFor?.type === 'block' && tagPickerFor.id === block.id
								? null
								: { type: 'block', id: block.id })}
					onUntag={(block, tag) => removeTag('block', block.id, tag)}
					onTagPick={handleTagPick}
					onTagPickerClose={closeTagPicker}
					onSlashKey={handleSlashKey}
					onSlashSelect={(command) =>
						groupMenu ? applySelectionType(command.id) : applySlashCommand(command)}
					onVerticalArrow={handleVerticalArrow}
					onPasteLines={handlePasteLines}
					onPasteBlocks={handlePasteBlocks}
					onInsertImages={handleInsertImages}
					onPasteCode={handlePasteCode}
					onRequestLink={handleRequestLink}
					onRequestToolbarFocus={handleRequestToolbarFocus}
					focusCaret={focusBlockId === row.block.id ? focusCaret : null}
					onFocusHandled={() => {
						focusBlockId = null;
						focusCaret = null;
					}}
					datePanelOpen={datePanelFor === row.block.id}
					onDateBadge={(block) => {
						datePanelCaret = null;
						datePanelFor = datePanelFor === block.id ? null : block.id;
					}}
					onDatePick={handleDatePick}
					onDateRemove={handleDateRemove}
					onDatePanelClose={() => {
						datePanelFor = null;
						datePanelCaret = null;
					}}
					slashEmptyLabel={slash?.mode === 'snippets'
						? 'Todavía no guardaste snippets.'
						: 'Sin resultados'}
				/>
			{/each}
		</div>
		<!-- El pie de una nota compartida: el botón "Listo" del invitado y el
		     registro que leen los dos (spec 038 §8). Va DENTRO de la columna de
		     renglones para que arranque en la misma x que ellos, y sólo aparece
		     cuando la nota está compartida. -->
		{#if note?.share}
			<SharedFooter role={note.share} entries={doneEntries} onDone={handleNoteDone} />
		{/if}
	</div>
	{#if toolbar}
		<FloatingFormattingToolbar
			rect={toolbar.rect}
			active={toolbar.active}
			enabled={toolbar.enabled}
			currentColor={toolbar.color}
			currentLinkUrl={toolbar.linkUrl}
			requestPanel={toolbar.requestPanel ?? null}
			requestFocus={toolbar.requestFocus ?? 0}
			onCommand={handleToolbarCommand}
			onRestorePanelFocus={restoreToolbarFocus}
			onClose={closeToolbar}
		/>
	{/if}
	{#if reorder.ghost}
		<div
			class="pointer-events-none fixed z-50 rounded-md bg-card px-2 py-1 text-sm opacity-80 shadow-lg"
			style="left: {reorder.ghost.x + 12}px; top: {reorder.ghost.y + 12}px;"
			transition:fade={{ duration: motionDuration(MOTION.fast) }}
		>
			Moviendo {reorder.ghost.ids.length}
			{reorder.ghost.ids.length === 1 ? 'renglón' : 'renglones'}
		</div>
	{/if}

	{#if textDrag.indicator}
		<!-- Drop caret for a text move: a thin line at the pointer's caret position. -->
		<div
			class="bg-primary pointer-events-none fixed z-50 w-0.5"
			style="left: {textDrag.indicator.x}px; top: {textDrag.indicator.top}px; height: {textDrag.indicator.height}px;"
		></div>
	{/if}
{/if}
