<script module>
	// Shared across every row; an Intl formatter is expensive to build.
	const codeLineFormatter = new Intl.NumberFormat('es');
</script>

<script>
	import { onMount, tick } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import {
		ChevronRight,
		Check,
		Copy,
		CopyPlus,
		GitCompare,
		GripVertical,
		Plus,
		Trash2
	} from '@lucide/svelte';
	import { diffWords } from '$lib/sync/diff';
	import { MOTION, motionDuration } from '$lib/motion';
	import SlashMenu from './SlashMenu.svelte';
	import ImageLightbox from './ImageLightbox.svelte';
	import DatePanel from './DatePanel.svelte';
	import BlockActionsMenu from './BlockActionsMenu.svelte';
	import LinkContextPopover from './LinkContextPopover.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import TagChips from '$lib/components/TagChips.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { flipIntoView } from '$lib/actions/flipIntoView';
	import { badgeLabel, currentDay, isOverdue } from '$lib/dates';
	import {
		CLIPBOARD_FORMAT,
		deserializeForest,
		normalizeNewlines,
		recallCopy
	} from '$lib/copy/serialize';
	import {
		sanitizeHtml,
		htmlToPlainText,
		normalizeForest,
		normalizeUrl,
		anchorForRange
	} from '$lib/format';
	import { openExternal } from '$lib/platform';
	import { imageUrl } from '$lib/images/url.svelte';
	import { imageFilesFrom, IMAGE_INSERT_MESSAGES } from '$lib/images/doors';
	import { toast } from 'svelte-sonner';
	import { planNoteExit } from './note';
	import { caretPointFromViewport } from './caret';
	import { intentFromBeforeInput } from './mobileInput';
	import { planSplit } from './split';
	import { textOffset, plainTextOffset, rangeAtPlainOffset } from './selection-offsets';

	let {
		block,
		// Una nota que te comparte otra persona se lee, no se escribe (spec 038 §4).
		// El límite de verdad lo pone el servidor, que rechaza por rol cualquier
		// renglón que mande alguien que no es el dueño; esto es la cortesía de no
		// dejar intentarlo, para que nadie escriba algo que no va a llegar nunca.
		readOnly = false,
		// Sólo lectura PERO puede tildar y comentar: el invitado de una nota
		// compartida (spec 038 §5). Es un permiso aparte y no un `readOnly` más
		// flojo, porque las puertas se abren de a una y a propósito: el candado de
		// B1 tenía cuatro abiertas que nadie había listado.
		guest = false,
		depth = 0,
		hasChildren = false,
		agentNotes = [],
		// El mismo renglón cambió acá y en otro dispositivo: { remote } o null.
		conflict = null,
		// El comentario del invitado. No pasa por `onNoteInput` a propósito: ese
		// escribe `block.note`, que es del dueño y no viaja; esto manda una línea
		// de bitácora, de una vez y sin poder editarla después.
		onComment = () => {},
		onConflictResolve,
		focused = false,
		active = false,
		flash = false,
		pulseMenu = false,
		actionsMenuOpen = false,
		onActionsMenuChange,
		placeholder = '',
		slashOpen = false,
		slashCommands = [],
		slashIndex = 0,
		slashEmptyLabel = 'Sin resultados',
		slashTitle = '',
		onInput,
		onFormat,
		onNoteInput,
		// La descripción de una imagen: texto pelado, guardado en `content`. Va por
		// una puerta propia y no por `onInput` porque no pasa por `block.html` ni por
		// los gatillos de "/" y "#" — este renglón no tiene caja editable donde
		// abrirlos (spec 041 §3.5).
		onCaption,
		onEnter,
		onBackspaceEmpty,
		onJoinPrevious,
		onIndent,
		onOutdent,
		onMoveUp,
		onMoveDown,
		onDelete,
		onToggleCollapsed,
		onToggleCodeCollapsed,
		onToggleChecked,
		onCopy,
		onSaveSnippet,
		// Entrar en el renglón (spec 043). El separador y la imagen no lo llevan:
		// no tienen texto que pueda hacer de título.
		onZoomIn,
		// El renglón-título de la vista: se dibuja arriba y NO está en la lista.
		zoomTitle = false,
		// El renglón-título llama acá en vez de partirse: partirlo crearía un
		// hermano de la raíz, o sea un renglón fuera de la vista (spec 043).
		onZoomTitleEnter,
		onActive,
		selected = false,
		onShiftSelect,
		onPlainMousedown,
		onTextSelectionMousedown,
		onDragOver,
		onDragHold,
		onDragHandle,
		onHandleSelect,
		tags = [],
		allTags = [],
		tagPickerOpen = false,
		onTag,
		onUntag,
		onTagPick,
		onTagPickerClose,
		onSlashKey,
		onSlashSelect,
		focusCaret = null,
		onFocusHandled,
		onVerticalArrow,
		onPasteLines,
		onPasteBlocks,
		onPasteCode,
		// Una captura que entra por cualquiera de las tres puertas: pegar, soltarla
		// encima o `/imagen` (spec 041 §3.4). Recibe la lista porque pegar y
		// arrastrar pueden traer varias de una.
		onInsertImages,
		onRequestLink,
		onRequestToolbarFocus,
		datePanelOpen = false,
		onDateBadge,
		onDatePick,
		onDateRemove,
		onDatePanelClose
	} = $props();

	let el = $state();
	let noteEl = $state();
	let codeToggleEl = $state();
	// La caja de la descripción de una imagen. Un renglón de imagen NO tiene `el`
	// —no hay caja editable—, así que sin esto el foco que le manda el editor no
	// tiene dónde aterrizar: se queda pegado y la persona teclea al vacío.
	let captionEl = $state();
	let imageButtonEl = $state();
	let linkContext = $state(null); // { href, focusOnOpen }
	let linkAnchor = null;
	let linkRange = null;

	// Quiet Motion (spec 024, Stage 5). `ready` gates entry animations so they
	// never fire on first render — a fresh row (note load / note switch) must
	// appear at rest, not pop. It flips true after mount, so later state
	// changes on a live row do animate.
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	// Copy confirmation: the copy buttons briefly swap their icon to a check.
	// Only ever triggered by a click, so no first-render noise. Optimistic —
	// copy almost never fails, and a failure still raises its own toast.
	let copied = $state(false);
	let copiedWithChildren = $state(false);
	let copyTimer;
	function confirmCopy(withChildren) {
		clearTimeout(copyTimer);
		copied = !withChildren;
		copiedWithChildren = withChildren;
		copyTimer = setTimeout(() => {
			copied = false;
			copiedWithChildren = false;
		}, 1000);
		onCopy(block, withChildren);
	}
	$effect(() => () => clearTimeout(copyTimer));
	// The secondary note editor shows once it has content or the user is adding
	// one via Shift+Enter (editor UX pass, slice B).
	let showNote = $state(false);
	// Al invitado el renglón en itálica NO le muestra el comentario del dueño: ese
	// campo (`block.note`) ni siquiera viaja por el caño compartido, así que lo que
	// vería sería el suyo viejo de otra cosa. Le sirve de hoja en blanco para
	// escribir el suyo, que es otra cosa —una línea de bitácora— y se manda entera.
	const noteVisible = $derived(showNote || (!guest && (block.note ?? '') !== ''));

	// Headings/text/bullet/todo render sanitized rich HTML; code/separator stay
	// literal plain text (code needs exact whitespace, separator has no content).
	const isRich = $derived(
		block.type !== 'code' && block.type !== 'separator' && block.type !== 'image'
	);

	const codeLines = $derived(
		block.type === 'code' && (block.content ?? '') !== ''
			? normalizeNewlines(block.content).split('\n')
			: []
	);
	const codeLineCount = $derived(codeLines.length);
	const isLongCode = $derived(codeLineCount > 12);
	const codeCollapsed = $derived(isLongCode && (block.codeCollapsed ?? false));
	const codePreview = $derived(codeCollapsed ? codeLines.slice(0, 6).join('\n') : '');

	// La captura y su descripción (spec 041). `picture` pide los bytes al
	// aparato y revoca la URL temporal cuando el renglón se va; para un renglón
	// que no es imagen `block.imageId` es `null` y no pide nada.
	const picture = imageUrl(() => block.imageId);
	let zoomed = $state(false);
	// Dos pasos a propósito: el primer Backspace sobre una descripción vacía
	// marca la imagen, el segundo borra el bloque. Y NUNCA se une con el renglón
	// de arriba — unir un archivo con texto no significa nada.
	let imageFocused = $state(false);

	// El hueco tiene la forma exacta de la captura ANTES de que lleguen los bytes:
	// sin esto la nota crece de golpe cuando el <img> aparece, que es justo el
	// salto que `width`/`height` existen para evitar. El ancho explícito es lo que
	// le da tamaño a una caja vacía; `max-width` lo baja a la columna y
	// `aspect-ratio` saca el alto del ancho ya recortado. Sin medidas guardadas
	// (un respaldo viejo) queda una caja chica en vez de colapsar a nada.
	const placeholderStyle = $derived(
		block.imageWidth && block.imageHeight
			? `aspect-ratio: ${block.imageWidth} / ${block.imageHeight}; width: ${block.imageWidth}px; max-width: 100%`
			: 'width: 12rem; min-height: 4rem; max-width: 100%'
	);

	function handleImageCaptionKeys(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			// Sin corte ni tipo forzado: el renglón nuevo sale de la herencia de
			// siempre, que para una imagen es texto normal. Que un Enter sobre una
			// imagen sin descripción no la convierta en texto lo garantiza
			// `enterOnEmptyAction`, no este llamador.
			onEnter(block);
			return;
		}
		// `event.repeat` es la tecla sola repitiéndose, no una segunda pulsación:
		// borrar "pantallazo del error" manteniendo Backspace vacía el campo y
		// sigue disparando cada ~60 ms, así que sin esto el mismo gesto que limpia
		// la descripción se llevaba la captura dos repeticiones después.
		const arming =
			event.key === 'Backspace' &&
			!event.repeat &&
			event.currentTarget.selectionStart === 0 &&
			(block.content ?? '') === '';
		if (!arming) {
			// Cualquier otra tecla desarma. Si no, el anillo quedaba prendido
			// mientras se escribía la descripción nueva y el paso siguiente sobre un
			// campo vacío borraba el bloque de una: dos pasos que eran uno.
			imageFocused = false;
			return;
		}
		event.preventDefault();
		if (!imageFocused) {
			imageFocused = true;
			return;
		}
		onDelete(block);
	}

	// El botón + es una alternativa de mouse a tipear "/", pensada para quien
	// no conoce el atajo (spec: docs/superpowers/specs/2026-07-30-plus-boton-linea-activa-design.md).
	const showPlus = $derived(
		!readOnly &&
			active &&
			block.content === '' &&
			block.type !== 'code' &&
			block.type !== 'separator' &&
			// Una imagen sin descripción no es un renglón vacío: el + ahí invita a
			// escribir sobre una captura que ya está puesta (spec 041 §3.5).
			block.type !== 'image'
	);

	const canZoom = $derived(!zoomTitle && block.type !== 'separator' && block.type !== 'image');

	// El renglón-título se lee como el título de la nota SIEMPRE, sin importar el
	// tipo del bloque: es "dónde estoy parado" y tiene que leerse igual siempre.
	// El tipo se conserva en los datos y vuelve a verse al salir (spec 043).
	const editableTypeClass = $derived(
		zoomTitle
			? 'block-editable--zoom-title'
			: block.type === 'code'
				? `block-editable--code bg-muted px-3 py-2 font-mono text-sm leading-[1.7] ${isLongCode ? 'rounded-t-md' : 'rounded-md'}`
				: 'text-base'
	);
	const editableHeadingClass = $derived(
		zoomTitle
			? ''
			: `${block.type === 'heading1' ? 'block-editable--h1' : ''} ${block.type === 'heading2' ? 'block-editable--h2' : ''} ${block.type === 'heading3' ? 'block-editable--h3' : ''}`
	);

	const today = $derived(currentDay());
	const dueLabel = $derived(block.dueDate ? badgeLabel(block.dueDate, today) : '');
	const overdue = $derived(isOverdue(block, today));

	// Sync DOM only when state and DOM diverge (e.g. slash command strips the
	// "/query" text). While the user types they always match, so the caret is
	// never clobbered.
	$effect(() => {
		if (!el || block.type === 'separator') return;
		if (isRich) {
			const html = block.html ?? '';
			if (html !== '') {
				const safe = sanitizeHtml(html);
				if (el.innerHTML !== safe) el.innerHTML = safe;
			} else if (el.textContent !== (block.content ?? '')) {
				el.textContent = block.content ?? '';
			}
		} else if (el.innerText !== (block.content ?? '')) {
			el.textContent = block.content;
		}
	});

	$effect(() => {
		if (!guest && noteEl && noteEl.textContent !== (block.note ?? '')) {
			noteEl.textContent = block.note ?? '';
		}
	});

	// Park a collapsed caret at the end of a node's contents. Builds a detached
	// range and collapses it BEFORE handing it to the live selection, so the
	// selection is never momentarily expanded — on mobile that expansion painted
	// as a one-frame highlight flash when moving between lines.
	function placeCaretAtEnd(node) {
		const selection = window.getSelection();
		if (!selection) return;
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	async function openNote() {
		showNote = true;
		await tick();
		if (noteEl) {
			noteEl.focus();
			placeCaretAtEnd(noteEl);
		}
	}

	function handleNoteInput() {
		// El invitado no guarda al teclear: su comentario es una línea de bitácora
		// y una línea de bitácora no se edita después (spec 038 §4), así que
		// guardar letra por letra dejaría una entrada por letra.
		if (guest) return;
		onNoteInput(block, noteEl.textContent);
	}

	// El borrador se manda ENTERO: con Enter o al salir del renglón. Después de
	// mandarlo el campo queda vacío y se cierra, porque no es un campo que se
	// edite: es un mensaje que se envía.
	function commitComment() {
		const text = (noteEl?.textContent ?? '').trim();
		showNote = false;
		if (noteEl) noteEl.textContent = '';
		if (text) onComment(block, text);
	}

	// The one definition of this block's focus target: the editable when it is
	// rendered, else the collapsed-code toggle. caretToEnd also parks the caret
	// at the end of the content.
	function focusBlockSurface(caretToEnd = false) {
		if (!el) {
			// Una imagen editable manda a su descripción; en sólo lectura, al botón
			// que la abre. Un código plegado usa su propio botón.
			const surface =
				block.type === 'image'
					? readOnly
						? imageButtonEl
						: (captionEl ?? imageButtonEl)
					: codeToggleEl;
			surface?.focus();
			return;
		}
		el.focus();
		if (caretToEnd && block.type !== 'separator') {
			placeCaretAtEnd(el);
		}
	}

	// Double Enter leaves the note: the second Enter lands on an empty line, so
	// the empty line is dropped and a fresh text block opens below. Returns true
	// when it took the exit (caller should preventDefault). Shared by the keyboard
	// path and the virtual-keyboard beforeinput path so the logic lives once.
	function tryNoteExit() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return false;
		const range = selection.getRangeAt(0);
		const start = textOffset(noteEl, range.startContainer, range.startOffset);
		const end = textOffset(noteEl, range.endContainer, range.endOffset);
		const plan = planNoteExit(noteEl.textContent, start, end);
		if (!plan) return false;
		noteEl.textContent = plan.text;
		onNoteInput(block, plan.text);
		if (plan.text === '') showNote = false;
		onEnter(block, 'text');
		return true;
	}

	function handleNoteKeydown(event) {
		// El invitado no está editando `block.note`, así que ninguna de las tres
		// salidas de abajo aplica: junta un borrador y lo manda. Escape lo descarta
		// vaciando el campo ANTES de cerrar, para que el blur que viene atrás no
		// mande lo que se acaba de descartar.
		if (guest) {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				commitComment();
				focusBlockSurface();
			} else if (event.key === 'Escape') {
				event.preventDefault();
				if (noteEl) noteEl.textContent = '';
				showNote = false;
				focusBlockSurface();
			}
			return;
		}
		if (event.key === 'Enter' && !event.shiftKey) {
			if (tryNoteExit()) {
				event.preventDefault();
				return;
			}
		}
		if (event.key === 'Backspace' && noteEl.textContent === '') {
			event.preventDefault();
			onNoteInput(block, '');
			showNote = false;
			focusBlockSurface();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			focusBlockSurface();
		}
	}

	// Virtual keyboards often do NOT fire keydown 'Enter'; they send a beforeinput
	// instead. We translate its inputType and enter through the SAME doors as the
	// physical Enter. On desktop the physical Enter is preventDefault'd in
	// handleKeydown, which cancels this beforeinput, so there is no double action.
	function handleBeforeInput(event) {
		const intent = intentFromBeforeInput(event.inputType);
		if (!intent) return;
		if (readOnly) {
			event.preventDefault();
			return;
		}
		// Code blocks keep Enter as a literal newline handled by the browser.
		if (block.type === 'code') return;
		// On a virtual keyboard there is no reliable Shift+Enter, and the same
		// Return key can arrive as insertParagraph or insertLineBreak (some
		// keyboards send insertLineBreak on an empty line). Both mean "Enter"
		// here, so both go through the block Enter door — otherwise the empty
		// nested line would get a soft break instead of outdenting (double-Enter
		// exit). Desktop Shift+Enter still works: it is a keydown, handled there.
		event.preventDefault();
		if (slashOpen) {
			// With the slash menu open, Enter picks the highlighted command.
			onSlashKey('Enter');
			return;
		}
		onEnter(block, undefined, caretSplit());
	}

	// The gray note's own virtual-keyboard path: an Enter that lands the exit
	// leaves the note; otherwise the browser inserts the newline as usual.
	// The note is contenteditable="plaintext-only", so a virtual keyboard sends
	// the Return key as insertLineBreak, NOT insertParagraph (that only happens
	// in rich contenteditable). Both mean "Enter" here, so both are candidates
	// to take the double-Enter exit; when the caret is not on a trailing empty
	// line, planNoteExit returns null and the newline is inserted as usual.
	function handleNoteBeforeInput(event) {
		if (!intentFromBeforeInput(event.inputType)) return;
		// El teclado de celular no manda keydown 'Enter': manda un beforeinput, y
		// en un campo plaintext-only llega como insertLineBreak. Sin esta rama, en
		// el teléfono Enter escribiría un salto de línea en vez de mandar.
		if (guest) {
			event.preventDefault();
			commitComment();
			focusBlockSurface();
			return;
		}
		if (tryNoteExit()) event.preventDefault();
	}

	function handleNoteBlur() {
		// Tocar en otro lado también manda: el borrador no sobrevive a irse del
		// renglón, y dejarlo escrito sin mandar sería peor que mandarlo.
		if (guest) {
			commitComment();
			return;
		}
		// An empty note that loses focus disappears; a filled one stays.
		if (noteEl && noteEl.textContent === '') showNote = false;
	}

	$effect(() => {
		if (!focused) return;
		if (!el && !codeToggleEl && !captionEl && !imageButtonEl) return;
		// focusCaret is a plain-text offset to land on (slash menu returns the
		// caret to where the "/" was); without it, park the caret at the end.
		if (focusCaret != null && el && block.type !== 'separator') {
			el.focus();
			const range = rangeAtPlainOffset(el, focusCaret);
			const selection = window.getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		} else {
			focusBlockSurface(true);
		}
		onFocusHandled();
	});

	function handleKeydown(event) {
		if (linkContext && event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeLinkContext(true);
			return;
		}
		if (slashOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
			event.preventDefault();
			onSlashKey(event.key);
			return;
		}
		// Inline formatting shortcuts work even when the floating toolbar is not
		// visible; only b/i/u/shift+s/k are claimed, everything else (copy,
		// paste, select-all, undo, Ctrl/Cmd+Enter…) falls through untouched.
		// Tamaños y entrada a la barra (spec 033). Se leen por `code` y no por
		// `key`: con Alt apretado, macOS cambia el carácter que llega (Alt+1 es
		// "¡"), pero el código de la tecla física no se mueve.
		if (isRich && (event.metaKey || event.ctrlKey) && event.altKey) {
			const sizes = { Digit1: 'h1', Digit2: 'h2', Digit3: 'h3', Digit0: 'normal' };
			const cmd = sizes[event.code];
			if (cmd) {
				event.preventDefault();
				onFormat?.(block, cmd);
				return;
			}
			if (event.code === 'KeyF') {
				event.preventDefault();
				onRequestToolbarFocus?.(block);
				return;
			}
		}
		if (isRich && (event.metaKey || event.ctrlKey)) {
			const key = event.key.toLowerCase();
			let cmd = null;
			if (key === 'b') cmd = 'bold';
			else if (key === 'i') cmd = 'italic';
			else if (key === 'u') cmd = 'underline';
			else if (key === 's' && event.shiftKey) cmd = 'strike';
			if (cmd) {
				// No aplicar acá: la puerta del editor (runFormatCommand) es la dueña
				// del formato, del paso de Deshacer y del guardado. Nombre canónico
				// (strike, no strikethrough); la puerta lo traduce.
				event.preventDefault();
				onFormat?.(block, cmd);
				return;
			}
			if (key === 'k' && requestLinkFromKeyboard()) {
				event.preventDefault();
				return;
			}
		}
		// Ctrl/Cmd+Enter adds/edits the gray note (Workflowy-style).
		if (
			event.key === 'Enter' &&
			(event.metaKey || event.ctrlKey) &&
			block.type !== 'code' &&
			block.type !== 'separator'
		) {
			event.preventDefault();
			openNote();
			return;
		}
		// Shift+Enter inserts a soft line break inside this block, not a new one.
		// Code blocks already treat Enter/Shift+Enter as newlines via the browser.
		if (
			!readOnly &&
			event.key === 'Enter' &&
			event.shiftKey &&
			block.type !== 'separator' &&
			block.type !== 'code'
		) {
			event.preventDefault();
			document.execCommand('insertLineBreak');
			handleInput();
			return;
		}
		if (handleSurfaceKeys(event)) return;
		if (readOnly) return;
		if (event.key === 'Backspace' && (block.type === 'separator' || el.textContent === '')) {
			event.preventDefault();
			onBackspaceEmpty(block);
			return;
		}
		if (event.key === 'Backspace' && caretAtStart()) {
			// El html sale del DOM vivo (no de block.html) por la misma razón que el
			// corte: el guardado del tipeo tiene retraso y el estado va atrás.
			event.preventDefault();
			onJoinPrevious(block, el.innerHTML);
		}
	}

	// Block-level keys shared by every focusable surface of the row (the
	// editable, the separator, the collapsed-code toggle): Enter makes a new
	// block, Tab indents, bare arrows navigate, Alt+arrows move the block.
	// ¿Hay texto marcado y vive entero adentro de la caja editable de este
	// renglón? Una marca que cruza a otro renglón no cuenta: ahí la barra no
	// puede formatear nada y Tab tiene que seguir anidando.
	function textSelectionInside() {
		if (!isRich || !el) return false;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
		const range = sel.getRangeAt(0);
		return el.contains(range.startContainer) && el.contains(range.endContainer);
	}

	// Enter en medio del texto: lo que está después del cursor se va con el
	// renglón nuevo. Se lee del DOM vivo (no de block.html) porque el guardado
	// del tipeo tiene medio segundo de retraso y ahí el estado todavía va atrás
	// de lo que se ve — y porque las posiciones del cursor se cuentan sobre ese
	// mismo DOM. Devuelve null cuando el cursor está al final, en un bloque de
	// código o en un separador: ahí Enter sigue haciendo lo de siempre.
	function caretSplit() {
		if (!isRich || !el) return null;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
		const start = plainTextOffset(el, range.startContainer, range.startOffset);
		const end = plainTextOffset(el, range.endContainer, range.endOffset);
		return planSplit(el.innerHTML, start, end);
	}

	// Backspace con el cursor pegado al principio y algo escrito adelante: no hay
	// nada que borrar en este renglón, así que la tecla significa "unir con el de
	// arriba" — el inverso exacto del Enter que lo partió. Se mide sobre el DOM
	// vivo, igual que el corte.
	function caretAtStart() {
		if (!isRich || !el) return false;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false;
		const range = selection.getRangeAt(0);
		if (!el.contains(range.startContainer)) return false;
		return plainTextOffset(el, range.startContainer, range.startOffset) === 0;
	}

	function handleSurfaceKeys(event) {
		// El renglón-título no está en una lista: no se parte, no se anida y no se
		// saca de nivel. Las tres crearían un renglón fuera de la vista (spec 043).
		if (zoomTitle && (event.key === 'Enter' || event.key === 'Tab')) {
			event.preventDefault();
			if (event.key === 'Enter' && !event.shiftKey) onZoomTitleEnter?.(block);
			return true;
		}
		if (
			readOnly &&
			(event.key === 'Enter' ||
				event.key === 'Tab' ||
				(event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')))
		) {
			return false;
		}
		if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			onEnter(block, undefined, caretSplit());
			return true;
		}
		if (event.key === 'Tab') {
			// Con texto marcado adentro de ESTE renglón, Tab entra en la barra de
			// formato (spec 033): en ese momento se quiere formatear lo marcado, no
			// anidar el renglón. Sin nada marcado —o con una marca que cruza a otro
			// renglón— Tab sigue anidando, como siempre.
			if (!event.shiftKey && textSelectionInside()) {
				event.preventDefault();
				onRequestToolbarFocus?.(block);
				return true;
			}
			event.preventDefault();
			if (event.shiftKey) onOutdent(block);
			else onIndent(block);
			return true;
		}
		// Bare Up/Down cross to the neighbour block when the caret is at this
		// block's visual edge (Editor decides); otherwise the browser moves the
		// caret inside a wrapped block as usual.
		if (
			(event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
			!event.shiftKey &&
			!event.altKey &&
			!event.metaKey &&
			!event.ctrlKey
		) {
			const direction = event.key === 'ArrowDown' ? 1 : -1;
			if (onVerticalArrow?.(block, direction)) event.preventDefault();
			return true;
		}
		if (event.altKey && event.key === 'ArrowUp') {
			event.preventDefault();
			onMoveUp(block);
			return true;
		}
		if (event.altKey && event.key === 'ArrowDown') {
			event.preventDefault();
			onMoveDown(block);
			return true;
		}
		return false;
	}

	// Plain-text offset of the caret inside this block's editable, or null when
	// the selection lives elsewhere. The slash menu anchors "/" with it.
	function caretPlainOffset() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		if (!el || !el.contains(range.startContainer)) return null;
		return plainTextOffset(el, range.startContainer, range.startOffset);
	}

	// `inputType` viaja hasta los gatillos ("/" y "#"): es el navegador diciendo si
	// esto lo escribió una persona o entró de un pegado, y sin él hay que
	// adivinarlo comparando textos — cosa que en un celular sale mal (ver
	// `typedByHand` en triggers.ts).
	function handleInput(event) {
		closeLinkContext(false);
		const caret = caretPlainOffset();
		const inputType = event?.inputType ?? null;
		if (isRich) {
			const html = sanitizeHtml(el.innerHTML);
			onInput(block, { html, content: htmlToPlainText(html), caret, inputType });
		} else {
			const text = el.innerText;
			onInput(block, { html: text, content: text, caret, inputType });
		}
	}

	// Paste handling, in priority order:
	// 1. CopyNotes' own copied content (hidden marker in the HTML) → rebuild the
	//    exact blocks, types and nesting included.
	// 2. External text that clearly looks like code → one literal code block.
	// 3. Other multi-line text → split into blocks, recognising bullets/todos.
	// 4. A single line → let the browser paste it inline.
	// Code blocks always insert the raw clipboard text themselves so browser-made
	// line wrappers cannot eat line breaks when the block is read back.
	function insertCodeText(text) {
		const selection = window.getSelection();
		let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		if (!range || !el.contains(range.startContainer) || !el.contains(range.endContainer)) {
			range = document.createRange();
			range.selectNodeContents(el);
			range.collapse(false);
		}
		range.deleteContents();
		const inserted = document.createTextNode(text);
		range.insertNode(inserted);
		range.setStartAfter(inserted);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
		handleInput();
	}

	function handlePaste(event) {
		// `contenteditable="false"` frena el tecleo y NO frena el pegado: el
		// navegador sigue mandando el evento al elemento con foco, y de acá salen
		// tres caminos que crean renglones (`onPasteBlocks`, `onPasteCode`,
		// `onPasteLines`). Sin esta línea, pegar en una nota ajena le agregaba
		// líneas que el servidor después rechaza por rol.
		if (readOnly) {
			event.preventDefault();
			return;
		}
		// Spec 041: un archivo de verdad en el portapapeles gana. Una dirección
		// `<img src="https://...">` copiada de una página NO se descarga: sólo se
		// acepta un archivo que el portapapeles entregue.
		//
		// Medido en Safari 26.5: una captura llega como `image.png`, `image/png`.
		// Y un pegado puede venir SIN nada —ni archivos ni tipos—: eso cae al
		// camino de texto de siempre, como antes.
		const images = imageFilesFrom(event.clipboardData);
		if (images.length > 0) {
			event.preventDefault();
			onInsertImages?.(block, images);
			return;
		}
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (block.type === 'code') {
			if (text === '') return;
			event.preventDefault();
			insertCodeText(text);
			return;
		}
		// Prefer CopyNotes' own content: the custom clipboard format when the
		// browser delivers it, else the localStorage buffer matched by exact text.
		// Any page can write our clipboard format, so the payload goes through
		// the ingest gate: shape repaired, html sanitized (see format/ingest.ts).
		const payload = event.clipboardData?.getData(CLIPBOARD_FORMAT) || recallCopy(text);
		const forest = normalizeForest(deserializeForest(payload));
		if (forest) {
			event.preventDefault();
			onPasteBlocks?.(block, forest);
			return;
		}
		if (!text.includes('\n')) return;
		event.preventDefault();
		if ((block.content ?? '') === '' && onPasteCode?.(block, text)) return;
		onPasteLines?.(block, text);
	}

	// La segunda puerta: soltar una captura encima del renglón. El mismo filtro y
	// el mismo camino que pegar — una sola forma de entrar, dos maneras de pedirlo.
	//
	// `dragover` sólo se frena cuando el arrastre trae ARCHIVOS: frenarlo siempre
	// convertiría al renglón en destino de todo, y arrastrar texto de otra ventana
	// —que hoy el navegador deja caer solo— dejaría de andar.
	function handleDragOver(event) {
		if (!event.dataTransfer?.types?.includes('Files')) return;
		event.preventDefault();
	}

	// Frenar el `dragover` y NO frenar el `drop` es la receta para que el navegador
	// haga lo suyo con el archivo — y en la ventana de escritorio, que no tiene
	// barra de direcciones, "lo suyo" es irse de la app. Así que un arrastre con
	// archivos se frena SIEMPRE, y si no había ninguna imagen adentro se dice.
	function handleDrop(event) {
		if (!event.dataTransfer?.types?.includes('Files')) return;
		// Frenado ANTES del guardia de sólo lectura, a propósito: una nota ajena no
		// acepta la captura, pero tampoco tiene por qué llevarse a la persona fuera
		// de la app por no haber frenado el evento.
		event.preventDefault();
		if (readOnly) return;
		const images = imageFilesFrom(event.dataTransfer);
		if (images.length === 0) {
			toast.error(IMAGE_INSERT_MESSAGES['not-an-image']);
			return;
		}
		onInsertImages?.(block, images);
	}

	function selectionInThisRow() {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !el) return null;
		const range = selection.getRangeAt(0);
		if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
		return { selection, range };
	}

	function openLinkContext(anchor, href, focusOnOpen) {
		onActionsMenuChange?.(false);
		const current = selectionInThisRow();
		linkAnchor = anchor;
		linkRange = current?.range.cloneRange() ?? null;
		linkContext = { href, focusOnOpen };
	}

	function placeCaretFromPointer(event) {
		const point = caretPointFromViewport(event.clientX, event.clientY);
		if (!point || !el?.contains(point.node)) return;
		el.focus({ preventScroll: true });
		const range = document.createRange();
		range.setStart(point.node, point.offset);
		range.collapse(true);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	function placeCaretInAnchor(anchor) {
		el?.focus({ preventScroll: true });
		const range = document.createRange();
		range.selectNodeContents(anchor);
		range.collapse(false);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	function sameRange(left, right) {
		return (
			left &&
			right &&
			left.startContainer === right.startContainer &&
			left.startOffset === right.startOffset &&
			left.endContainer === right.endContainer &&
			left.endOffset === right.endOffset
		);
	}

	function closeLinkContext(restoreFocus) {
		const saved = linkRange;
		linkContext = null;
		linkAnchor = null;
		linkRange = null;
		if (!restoreFocus || !saved || !el?.isConnected) return;
		el.focus({ preventScroll: true });
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(saved);
	}

	function requestLinkFromKeyboard() {
		if (readOnly || !isRich) return false;
		const current = selectionInThisRow();
		if (!current) return false;
		if (!current.selection.isCollapsed) {
			closeLinkContext(false);
			onRequestLink?.(block);
			return true;
		}
		const anchor = anchorForRange(current.range);
		const href = anchor && el.contains(anchor) ? normalizeUrl(anchor.getAttribute('href')) : '';
		if (!href) return false;
		openLinkContext(anchor, href, true);
		return true;
	}

	function openCurrentLink() {
		const href = linkContext?.href;
		closeLinkContext(false);
		if (href) openExternal(href);
	}

	function editCurrentLink() {
		const anchor = linkAnchor;
		if (!anchor?.isConnected) {
			closeLinkContext(false);
			return;
		}
		const range = document.createRange();
		range.selectNodeContents(anchor);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		closeLinkContext(false);
		onRequestLink?.(block);
	}

	$effect(() => {
		if (!linkContext) return;
		function selectionChanged() {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) {
				closeLinkContext(false);
				return;
			}
			const range = selection.getRangeAt(0);
			const panel = document.querySelector('[data-link-context]');
			if (panel?.contains(range.commonAncestorContainer)) return;
			if (
				!el?.contains(range.startContainer) ||
				!el.contains(range.endContainer) ||
				!selection.isCollapsed ||
				!sameRange(range, linkRange)
			) {
				closeLinkContext(false);
			}
		}
		document.addEventListener('selectionchange', selectionChanged);
		return () => document.removeEventListener('selectionchange', selectionChanged);
	});

	$effect(() => {
		if (actionsMenuOpen && linkContext) closeLinkContext(false);
	});

	// Shift+click selects a block range instead of moving the caret; a plain
	// mousedown starts a potential drag-select and clears any active selection.
	// Inside a contenteditable a link NEVER navigates on its own: the browser
	// parks the caret instead. In editing, a plain click keeps that caret and shows
	// explicit actions; Ctrl/Cmd+click and read-only clicks open directly.
	//
	// Arrastrar de punta a punta del enlace también termina en un `click`, pero
	// ahí el usuario marcó el texto para editarlo, no pidió ir a la dirección.
	// Lo que separa un caso del otro es si el puntero se movió, NO si quedó
	// texto seleccionado: recién creado, un enlace YA viene seleccionado, y
	// mirar la selección dejaba sin abrir justo al que lo acababa de poner.
	//
	// El href se vuelve a validar acá aunque el sanitizador ya sólo deje pasar
	// http/https/mailto: esto es lo que abre una dirección, y un `javascript:`
	// que se filtrara por cualquier camino se ejecutaría en la nota.
	function handleEditableClick(event) {
		const anchor = event.target?.closest?.('a[href]');
		if (!anchor) return;
		if (
			event.detail > 0 &&
			pressPoint &&
			Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) > 4
		) {
			closeLinkContext(false);
			return;
		}
		if (event.detail > 1) {
			closeLinkContext(false);
			return;
		}
		const href = normalizeUrl(anchor.getAttribute('href'));
		if (!href) return;
		event.preventDefault();
		if (readOnly || event.metaKey || event.ctrlKey) {
			closeLinkContext(false);
			openExternal(href);
			return;
		}
		const assisted = event.detail === 0;
		if (assisted) placeCaretInAnchor(anchor);
		else placeCaretFromPointer(event);
		openLinkContext(anchor, href, assisted);
	}

	// Dónde empezó el apretón, para que handleEditableClick sepa si hubo arrastre.
	let pressPoint = null;

	function handleMousedown(event) {
		pressPoint = { x: event.clientX, y: event.clientY };
		if (event.shiftKey) {
			// Shift+click DENTRO del renglón donde ya está el cursor es la
			// selección de texto de toda la vida: se la dejamos al navegador.
			// Robársela para armar un rango de bloques dejaba al usuario sin nada
			// seleccionado, porque un rango de un solo renglón no se pinta.
			// Si el press cae en otro renglón, o si ya hay un rango de bloques
			// vivo, sigue mandando la selección por bloques.
			const caret = window.getSelection?.();
			if (!selected && caret?.anchorNode && el?.contains(caret.anchorNode)) return;
			event.preventDefault();
			onShiftSelect?.(block);
			return;
		}
		// A press on an already-selected row is a "grab the selection" gesture,
		// handled by the drag controller (row pointerdown). Don't start a fresh
		// drag-select here — that would wipe the selection before a move begins.
		// The controller collapses the selection itself if it turns out a click.
		if (selected) {
			// The image caption is an actual input, so the row-level pointer handler
			// intentionally ignores it. Clear structural selection here when the user
			// explicitly returns to editing that caption.
			if (readOnly || event.target?.closest?.('[data-image-caption]')) {
				onPlainMousedown?.(block);
			}
			return;
		}
		// Pressing on a live text selection (a word) grabs it for a text move
		// (spec 026) instead of starting a block drag-select. The editor decides
		// if the press is really inside the selection and arms the drag.
		const textSel = window.getSelection?.();
		if (textSel && !textSel.isCollapsed) {
			onTextSelectionMousedown?.(block, event);
			return;
		}
		onPlainMousedown?.(block);
	}

	// Return the caret to this block after a transient menu closes.
	function focusContent() {
		focusBlockSurface(true);
	}

	function handleRowPointerdown(event) {
		// Controls own their gesture. The row body may still arm its existing
		// long-press move, but a checkbox, menu, image or panel never does so too.
		if (event.target?.closest?.('button, input, textarea, select, [data-editor-transient]')) return;
		onDragHold?.(block.id, event);
	}

	// Dispara el mismo evento `input` nativo que ya maneja handleInput cuando
	// el usuario tipea "/" a mano — mismo pipeline que abre el menú, cero
	// estado nuevo. Precedente en este archivo: document.execCommand('insertLineBreak')
	// ya simula una tecla física dentro del mismo flujo de eventos.
	function insertSlashTrigger() {
		el?.focus();
		document.execCommand('insertText', false, '/');
	}

	const ariaLabels = {
		text: 'Bloque de texto',
		bullet: 'Viñeta',
		todo: 'Tarea',
		code: 'Bloque de código',
		separator: 'Separador'
	};
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-block-id={block.id}
	data-zoom-title={zoomTitle ? '' : undefined}
	data-read-only={readOnly}
	data-active={active}
	class="cn-row group relative flex flex-wrap items-start gap-1 rounded-md py-0.5 pr-10 md:flex-nowrap md:pr-2 {selected
		? 'bg-primary/10'
		: ''} {flash ? 'cn-flash' : ''}"
	style="padding-left: {depth * 1.5}rem"
	onpointerenter={(event) => onDragOver?.(block, event.buttons)}
	onpointerdown={handleRowPointerdown}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<!-- El renglón-título no está en una lista: sin manija y sin flechita de
	     colapsar. Los dos son gestos sobre un renglón que está en una lista, y
	     éste no lo está — y con ellos se va también el doble clic para entrar,
	     que vive en la manija (spec 043). -->
	{#if !zoomTitle}
	<!-- One handle, two outcomes: release without moving selects; movement drags.
	     It stays in the first slot even on an empty or image row. -->
	<div class="cn-row-marker relative w-4 shrink-0 justify-center">
		{#if !readOnly}
			<button
				type="button"
				tabindex="-1"
				aria-label="Seleccionar o arrastrar renglón"
				aria-pressed={selected}
				use:tooltip={canZoom
					? 'Seleccionar, arrastrar, o doble clic para entrar'
					: 'Seleccionar o arrastrar'}
				onpointerdown={(event) => {
					event.stopPropagation();
					onDragHandle?.(block.id, event);
				}}
				onclick={(event) => {
					if (event.detail === 0) onHandleSelect?.(block.id);
				}}
				ondblclick={() => canZoom && onZoomIn?.(block)}
				in:fade={{ duration: ready ? motionDuration(MOTION.fast) : 0 }}
				out:fade={{ duration: motionDuration(MOTION.fast) }}
				class="cn-row-handle cn-affordance cn-tap text-faint hover:text-foreground focus-visible:ring-ring absolute flex h-7 w-4 cursor-grab touch-none items-center justify-center rounded-sm transition-opacity duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing {selected
					? 'opacity-100'
					: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}"
			>
				<GripVertical size={14} aria-hidden="true" />
			</button>
		{/if}
	</div>
	<div
		class="cn-row-marker w-5 shrink-0 justify-center {hasChildren || showPlus
			? 'cn-row-secondary-control'
			: ''}"
	>
		{#if hasChildren}
			<button
				type="button"
				onclick={() => onToggleCollapsed(block)}
				onpointerdown={(event) => event.stopPropagation()}
				aria-label={block.collapsed ? 'Expandir bloque' : 'Colapsar bloque'}
				aria-expanded={!block.collapsed}
				class="cn-affordance cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-5 items-center justify-center rounded-sm transition-opacity duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none {block.collapsed
					? 'opacity-100'
					: 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}"
			>
				<ChevronRight
					size={14}
					aria-hidden="true"
					class="transition-transform duration-(--motion-fast) {block.collapsed ? '' : 'rotate-90'}"
				/>
			</button>
		{:else if showPlus}
			<button
				type="button"
				aria-label="Agregar bloque"
				use:tooltip={'Agregar (o escribí "/")'}
				onpointerdown={(event) => event.stopPropagation()}
				onclick={insertSlashTrigger}
				in:fade={{ duration: ready ? motionDuration(MOTION.fast) : 0 }}
				out:fade={{ duration: motionDuration(MOTION.fast) }}
				class="cn-affordance cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-5 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				<Plus size={14} aria-hidden="true" />
			</button>
		{/if}
	</div>
	{/if}

	{#if block.type === 'bullet'}
		<span
			aria-hidden="true"
			class="cn-row-marker text-faint shrink-0 select-none text-[0.6rem] leading-none">●</span
		>
	{:else if block.type === 'todo'}
		<!-- Padded wrapper widens the tap target beyond the visible 16px box. -->
		<button
			type="button"
			role="checkbox"
			aria-checked={block.checked}
			aria-label={block.checked ? 'Desmarcar tarea' : 'Marcar tarea'}
			disabled={readOnly && !guest}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={() => onToggleChecked(block)}
			class="cn-row-marker cn-tap focus-visible:ring-ring w-6 shrink-0 justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default"
		>
			<!-- El borde de la casilla vacía va en `text-faint` y no en `border`: ese
			     token es para líneas divisorias y da 1,25:1 contra el fondo claro, muy
			     por debajo del 3:1 que pide un control. `text-faint` da 4,5:1 y es el
			     mismo color de la viñeta y de la manija, así que no agrega tinta nueva
			     al diseño. El color va dentro del ternario para que el estado marcado
			     mande sin depender del orden en que Tailwind emita las dos reglas. -->
			<span
				aria-hidden="true"
				class="flex size-4 items-center justify-center rounded-sm border transition-colors duration-(--motion-fast) {block.checked
					? 'bg-primary border-primary text-primary-foreground'
					: 'border-faint bg-transparent'}"
			>
				{#if block.checked}
					<span in:scale={{ start: 0.5, duration: ready ? motionDuration(MOTION.fast) : 0 }}>
						<Check size={12} />
					</span>
				{/if}
			</span>
		</button>
	{/if}

	{#if block.type === 'separator'}
		<!-- Focusable on purpose: keyboard users select it to delete it or add a block after. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={el}
			role="separator"
			tabindex="0"
			data-block-surface
			aria-label="Separador"
			onkeydown={handleKeydown}
			onmousedown={handleMousedown}
			onfocus={() => onActive(block)}
			class="focus-visible:ring-ring flex h-7 min-w-0 flex-1 items-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			<hr class="border-border w-full" />
		</div>
	{:else if block.type === 'image'}
		<div class="flex min-w-0 flex-1 flex-col gap-1">
			{#if picture.url}
				<!-- Un `<button>` y no un `<img>` con onclick: abrir la captura es una
				     acción, así que se llega con Tab y con Enter como a cualquier otra.
				     `self-start` para que la columna no la estire — una captura chica se
				     ve chica, nunca agrandada. El anillo marca el primer paso del
				     borrado de dos tiempos (ver handleImageCaptionKeys). -->
				<button
					bind:this={imageButtonEl}
					type="button"
					data-block-surface
					data-image-button
					aria-label={block.content
						? `Ver a tamaño real: ${block.content}`
						: 'Ver la captura a tamaño real'}
					onpointerdown={(event) => event.stopPropagation()}
					onclick={() => (zoomed = true)}
					onfocus={() => onActive(block)}
					class="focus-visible:ring-ring max-w-full cursor-zoom-in self-start rounded-md focus-visible:ring-2 focus-visible:outline-none {imageFocused
						? 'ring-ring ring-2'
						: ''}"
				>
					<!-- `width`/`height` reservan el lugar exacto ANTES de que cargue, que es
					     lo que impide que la nota salte. -->
					<img
						src={picture.url}
						alt={block.content}
						width={block.imageWidth}
						height={block.imageHeight}
						loading="lazy"
						decoding="async"
						class="h-auto max-w-full rounded-md"
					/>
				</button>
			{:else}
				<!-- El mismo hueco sirve para los dos momentos: mientras los bytes
				     salen del aparato (un parpadeo) y cuando no están. "Imagen no
				     disponible" en la parte A sólo pasa importando un paquete
				     incompleto; en la B, mientras baja. -->
				<div
					class="bg-muted text-muted-foreground flex items-center justify-center self-start rounded-md px-3 text-center text-sm"
					style={placeholderStyle}
				>
					{#if picture.missing}Imagen no disponible{/if}
				</div>
			{/if}
			<input
				bind:this={captionEl}
				data-block-surface
				data-image-caption
				class="text-muted-foreground placeholder:text-faint w-full border-0 bg-transparent p-0 text-sm focus:outline-none"
				placeholder="Descripción (opcional)"
				aria-label="Descripción de la imagen"
				value={block.content}
				disabled={readOnly}
				onmousedown={handleMousedown}
				onfocus={() => onActive(block)}
				onblur={() => (imageFocused = false)}
				oninput={(event) => onCaption(block, event.currentTarget.value)}
				onkeydown={handleImageCaptionKeys}
			/>
		</div>
	{:else}
		<div class="flex min-w-0 flex-1 flex-col">
			{#if codeCollapsed}
				<pre
					id={`code-content-${block.id}`}
					aria-label="Vista previa de código"
					translate="no"
					class="block-editable--code bg-muted min-h-7 w-full min-w-0 overflow-hidden rounded-t-md px-3 py-2 font-mono text-sm leading-[1.7]"
				>{codePreview}</pre>
			{:else}
				<div
					bind:this={el}
					id={block.type === 'code' ? `code-content-${block.id}` : undefined}
					contenteditable={readOnly ? 'false' : isRich ? 'true' : 'plaintext-only'}
					role="textbox"
					tabindex="0"
					data-block-surface
					aria-multiline="true"
					aria-label={ariaLabels[block.type] ?? 'Bloque de texto'}
					aria-haspopup="listbox"
					aria-controls={slashOpen ? 'slash-menu' : undefined}
					aria-activedescendant={slashOpen && slashCommands[slashIndex]
						? `slash-option-${slashCommands[slashIndex].id}`
						: undefined}
					data-placeholder={placeholder}
					spellcheck={block.type === 'code' ? false : undefined}
					autocapitalize={block.type === 'code' ? 'off' : undefined}
					translate={block.type === 'code' ? 'no' : undefined}
					onkeydown={handleKeydown}
					onbeforeinput={handleBeforeInput}
					oninput={handleInput}
					onpaste={handlePaste}
					onmousedown={handleMousedown}
					onclick={handleEditableClick}
					onfocus={() => onActive(block)}
					class="block-editable min-h-7 w-full min-w-0 leading-relaxed break-words whitespace-pre-wrap outline-none {readOnly
					? 'cursor-default'
					: ''} {editableTypeClass} {block.type === 'todo' && block.checked
						? 'text-muted-foreground line-through'
						: ''} {editableHeadingClass}"
				></div>
			{/if}
			{#if isLongCode}
				<button
					bind:this={codeToggleEl}
					type="button"
					data-block-surface
					onpointerdown={(event) => event.stopPropagation()}
					onclick={() => onToggleCodeCollapsed(block)}
					onkeydown={handleSurfaceKeys}
					onfocus={() => onActive(block)}
					aria-controls={`code-content-${block.id}`}
					aria-expanded={!codeCollapsed}
					class="bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-b-md border-t px-3 text-xs transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
				>
					<ChevronRight
						size={13}
						aria-hidden="true"
						class="transition-transform duration-(--motion-fast) {codeCollapsed ? '' : 'rotate-90'}"
					/>
					<span>{codeCollapsed ? 'Ver código completo' : 'Contraer código'}</span>
					<span class="ml-auto tabular-nums">{codeLineFormatter.format(codeLineCount)} líneas</span>
				</button>
			{/if}
			{#if noteVisible}
				<div
					bind:this={noteEl}
					contenteditable={readOnly && !guest ? 'false' : 'plaintext-only'}
					role="textbox"
					tabindex="0"
					aria-multiline="true"
					aria-label={guest ? 'Comentar la tarea' : 'Comentario del bloque'}
					data-placeholder={guest ? 'Comentar (no se puede editar después)' : 'Comentario…'}
					onkeydown={handleNoteKeydown}
					onbeforeinput={handleNoteBeforeInput}
					oninput={handleNoteInput}
					onblur={handleNoteBlur}
					class="block-editable block-editable--note text-muted-foreground -mt-0.5 w-full min-w-0 pl-2 leading-snug break-words whitespace-pre-wrap italic outline-none {readOnly &&
					!guest
					? 'cursor-default'
					: ''}"
				></div>
			{/if}
			{#if conflict}
				<!-- El mismo renglón se editó acá y en otro dispositivo. No se pisó
				     nada, y la decisión se toma acá, en el renglón.

				     Las dos versiones SON la elección: se toca la que queda, no un
				     botón debajo de ellas. Por eso tampoco hay paso de "abrir" — un
				     choque es raro e importante, y esconderlo detrás de un enlace lo
				     vuelve fácil de ignorar. Sin caja: una barra al margen, como una
				     cita, para que esto no compita con el texto de la nota que tiene
				     encima. -->
				{@const remoteDeleted = Boolean(conflict.remote?.deletedAt)}
				{@const versions = diffWords(block.content, conflict.remote?.content)}
				<div class="border-cn-conflict mt-1.5 flex flex-col gap-0.5 border-l-2 pl-3">
					<p class="text-muted-foreground flex items-center gap-1.5 text-xs">
						<GitCompare size={12} aria-hidden="true" />
						Otra versión de este renglón · tocá la que quede
					</p>

					<!-- La etiqueta va al principio y no al final: alineadas en una
					     columnita, las dos versiones arrancan en la misma x y se pueden
					     comparar de un vistazo. Al final quedaban contra el borde
					     derecho, lejísimos del texto que nombran. -->
					<button
						type="button"
						aria-label="Quedarme con esta versión, la de este dispositivo"
						onmousedown={(event) => event.preventDefault()}
						onpointerdown={(event) => event.stopPropagation()}
						onclick={() => onConflictResolve?.(block, 'mine')}
						class="cn-conflict-option"
					>
						<span class="cn-conflict-side" aria-hidden="true">Tu versión</span>
						<span class="cn-conflict-text min-w-0 flex-1 break-words whitespace-pre-wrap"
							>{#each versions.mine as part, index (index)}{#if part.changed}<span class="cn-diff"
										>{part.text}</span
									>{:else}{part.text}{/if}{/each}{#if !block.content}<span
									class="text-muted-foreground italic">(vacío)</span
								>{/if}</span
						>
					</button>

					<button
						type="button"
						aria-label={remoteDeleted
							? 'Borrar este renglón, como se borró en el otro dispositivo'
							: 'Traer esta versión, la del otro dispositivo'}
						onmousedown={(event) => event.preventDefault()}
						onpointerdown={(event) => event.stopPropagation()}
						onclick={() => onConflictResolve?.(block, 'theirs')}
						class="cn-conflict-option {remoteDeleted ? 'cn-conflict-option--danger' : ''}"
					>
						<span class="cn-conflict-side" aria-hidden="true">La del otro</span>
						{#if remoteDeleted}
							<!-- No es "quedate con este texto" sino "borrá el renglón". Se
							     distingue a propósito, para no confundirla de fila. -->
							<span class="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
								<Trash2 size={13} aria-hidden="true" />
								Borrar este renglón
							</span>
						{:else}
							<span class="cn-conflict-text min-w-0 flex-1 break-words whitespace-pre-wrap"
								>{#each versions.theirs as part, index (index)}{#if part.changed}<span
											class="cn-diff">{part.text}</span
										>{:else}{part.text}{/if}{/each}{#if !conflict.remote?.content}<span
										class="text-muted-foreground italic">(vacío)</span
									>{/if}</span
							>
						{/if}
					</button>
				</div>
			{/if}
			<!-- El margen negativo existe para que lo PRIMERO que cuelga del renglón se
			     abrace a su texto. Con dos cosas apiladas, la segunda se abrazaba a la
			     primera: el comentario del dueño y la itálica del invitado se leían
			     como un solo bloque. Sólo el primero abraza; el resto lleva aire. -->
			{#each agentNotes as agentNote, index (agentNote.id)}
				<p
					class="agent-note w-full min-w-0 pl-2 leading-snug break-words whitespace-pre-wrap italic {index ===
						0 && !noteVisible
						? '-mt-0.5'
						: 'mt-1'}"
					class:agent-note--person={!agentNote.esAgente}
				>
					<span class="agent-note-badge" aria-label={`Escrito por ${agentNote.label}`}
						>{agentNote.label}</span
					>
					{agentNote.text}
				</p>
			{/each}
		</div>
	{/if}

	{#if block.dueDate && block.type !== 'separator'}
		<!-- Sin margen arriba: el chip mide lo mismo (--cn-row-line) que la manija y
		     el resto de los controles del renglón, así que sin margen queda centrado
		     sobre el primer renglón del texto. El mt-1 que tenía lo dejaba 5px más
		     abajo que la línea, y se notaba como un chip caído. -->
		<button
			type="button"
			data-date-panel-trigger
			in:scale={{ start: 0.6, duration: ready ? motionDuration(MOTION.fast) : 0 }}
			aria-label={readOnly ? `Vence ${dueLabel}` : 'Cambiar fecha'}
			disabled={readOnly}
			use:tooltip={'Cambiar o quitar fecha'}
			onmousedown={(event) => event.preventDefault()}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={() => {
				const closing = datePanelOpen;
				onDateBadge(block);
				if (closing) focusContent();
			}}
			class="cn-tap {overdue ? 'text-destructive' : 'text-muted-foreground'} hover:text-foreground focus-visible:ring-ring flex h-(--cn-row-line) shrink-0 items-center gap-1 self-start rounded-sm px-1.5 text-xs whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
		>📅 {dueLabel}</button>
	{/if}

	{#if tags.length > 0}
		<div
			class="mt-1 flex w-full basis-full flex-wrap items-center gap-1 {block.type === 'todo'
				? 'pl-[3.25rem]'
				: block.type === 'bullet'
					? 'pl-[2.125rem]'
					: 'pl-6'} md:mt-0 md:w-auto md:max-w-[40%] md:basis-auto md:shrink-0 md:self-center md:pl-0"
		>
			<TagChips {tags} onRemove={readOnly ? null : (tag) => onUntag(block, tag)} />
		</div>
	{/if}

	<!-- Line actions: the copy buttons stay visible (copy-with-children only on
	     parents), everything else lives in the 3-dots menu (editor UX pass).
	     Hidden until hover/keyboard focus so the page stays quiet.
	     mousedown+preventDefault keeps the caret in the block. -->
	<div
		class="cn-affordance cn-actions pointer-events-none absolute top-0.5 right-1 flex shrink-0 flex-col items-center opacity-0 md:h-(--cn-row-line) transition-opacity duration-(--motion-fast) group-focus-within:z-10 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:z-10 group-hover:pointer-events-auto group-hover:opacity-100 md:static md:flex-row md:gap-0.5 {selected
			? 'z-10 pointer-events-auto opacity-100'
			: ''}"
	>
		<button
			type="button"
			aria-label="Copiar bloque"
			use:tooltip={copied ? 'Copiado' : 'Copiar bloque'}
			onmousedown={(event) => event.preventDefault()}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={() => confirmCopy(false)}
			class="cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
		>
			{#if copied}
				<span class="text-primary" in:scale={{ start: 0.5, duration: motionDuration(MOTION.fast) }}>
					<Check size={14} aria-hidden="true" />
				</span>
			{:else}
				<Copy size={14} aria-hidden="true" />
			{/if}
		</button>
		{#if hasChildren}
			<button
				type="button"
				aria-label="Copiar con subniveles"
				use:tooltip={copiedWithChildren ? 'Copiado' : 'Copiar con subniveles'}
				onmousedown={(event) => event.preventDefault()}
				onpointerdown={(event) => event.stopPropagation()}
				onclick={() => confirmCopy(true)}
				class="cn-tap text-faint hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				{#if copiedWithChildren}
					<span class="text-primary" in:scale={{ start: 0.5, duration: motionDuration(MOTION.fast) }}>
						<Check size={14} aria-hidden="true" />
					</span>
				{:else}
					<CopyPlus size={14} aria-hidden="true" />
				{/if}
			</button>
		{/if}
		<!-- También en el separador: no es editable, así que en celular no hay
		     Backspace y este menú es la única forma de borrarlo. Ahí quedan sólo
		     mover y eliminar (contentActions).
		     En una nota que te comparten queda UNO —comentar— y los otros cinco no,
		     porque escriben el renglón (noteOnly). Copiar sigue estando en sus
		     botones propios, que no escriben nada. -->
		{#if !readOnly || guest}
			<BlockActionsMenu
				{pulseMenu}
				open={actionsMenuOpen}
				onOpenChange={onActionsMenuChange}
				noteOnly={guest}
				{canZoom}
				contentActions={block.type !== 'separator'}
				onAddNote={openNote}
				onZoomIn={() => onZoomIn?.(block)}
				onMoveUp={() => onMoveUp(block)}
				onMoveDown={() => onMoveDown(block)}
				onDelete={() => onDelete(block)}
				onSaveSnippet={() => onSaveSnippet(block)}
				onTag={() => onTag(block)}
				onDismiss={focusContent}
			/>
		{/if}
	</div>

	{#if slashOpen}
		<SlashMenu
			commands={slashCommands}
			selectedIndex={slashIndex}
			onSelect={onSlashSelect}
			emptyLabel={slashEmptyLabel}
			title={slashTitle}
		/>
	{/if}

	{#if linkContext}
		<div
			use:flipIntoView
			class="absolute top-full left-2 z-20 mt-1 w-[calc(100%-1rem)] max-w-[22rem]"
		>
			<LinkContextPopover
				href={linkContext.href}
				focusOnOpen={linkContext.focusOnOpen}
				onOpen={openCurrentLink}
				onEdit={editCurrentLink}
				onClose={closeLinkContext}
			/>
		</div>
	{/if}

	{#if datePanelOpen}
		<!-- El panel sale debajo del renglón salvo que no entre: ahí se da vuelta
		     y sale arriba. En celular el piso es el borde del teclado, no el de la
		     ventana (ver flipIntoView). -->
		<div use:flipIntoView class="absolute top-full left-2 z-10 mt-1 max-w-[100vw]">
			<DatePanel
				hasDate={!!block.dueDate}
				current={block.dueDate}
				onPick={(day) => onDatePick(block, day)}
				onRemove={() => onDateRemove(block)}
					onClose={(restoreFocus) => onDatePanelClose(block, restoreFocus)}
			/>
		</div>
	{/if}

	{#if tagPickerOpen}
		<TagPicker
			tags={allTags}
			assignedIds={tags.map((tag) => tag.id)}
			onPick={onTagPick}
			onClose={onTagPickerClose}
			align="right"
		/>
	{/if}

	{#if zoomed && picture.url}
		<ImageLightbox url={picture.url} alt={block.content} onClose={() => (zoomed = false)} />
	{/if}
</div>

<style>
	.block-editable:empty::before {
		content: attr(data-placeholder);
		color: var(--text-faint);
		pointer-events: none;
	}

	.block-editable--code {
		overflow-x: auto;
		overflow-y: hidden;
		white-space: pre;
		overflow-wrap: normal;
		word-break: normal;
		tab-size: 4;
	}

</style>
