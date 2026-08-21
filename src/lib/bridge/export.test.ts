import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, createNote, updateNote, createBlock, createFolder } from '$lib/storage';
import { buildAgentExport, toAgentPayload } from './export';

describe('toAgentPayload v2 (proyección + gate de privacidad)', () => {
	it('nota sin 🤖 no aporta NADA (ni título, ni prosa, ni tareas)', () => {
		const notes = [
			{ id: 'n1', title: 'Visible', agentVisible: true, folderId: null },
			{ id: 'n2', title: 'Privada', agentVisible: false, folderId: null }
		];
		const blocksByNote = {
			n1: [{ id: 'b1', parentBlockId: null, order: 0, type: 'todo', content: 'hacer', checked: false, createdBy: 'user', note: '' }],
			n2: [{ id: 'b2', parentBlockId: null, order: 0, type: 'text', content: 'secreto', checked: false, createdBy: 'user', note: '' }]
		};
		const payload = toAgentPayload(notes, blocksByNote, {}, {});
		expect(payload.version).toBe(2);
		expect(payload.notes.map((n) => n.id)).toEqual(['n1']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	it('incluye prosa como contexto y tareas pendientes, en orden de árbol, con depth', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: 'f1' }];
		const blocksByNote = {
			n1: [
				{ id: 'p1', parentBlockId: null, order: 0, type: 'text', content: 'contexto', checked: false, createdBy: 'user', note: '' },
				{ id: 't1', parentBlockId: null, order: 1, type: 'todo', content: 'pendiente', checked: false, createdBy: 'agent-uuid', note: '' },
				{ id: 't1a', parentBlockId: 't1', order: 0, type: 'todo', content: 'subtarea', checked: false, createdBy: 'user', note: '' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { t1: [{ action: 'created' }] }, { f1: 'Trabajo' });
		const note = payload.notes[0];
		expect(note.folder).toBe('Trabajo');
		expect(note.blocks.map((b) => b.id)).toEqual(['p1', 't1', 't1a']);
		expect(note.blocks.map((b) => b.depth)).toEqual([0, 0, 1]);
		expect(note.blocks[1].createdBy).toBe('agent-uuid');
		expect(note.blocks[1].activity).toEqual([{ action: 'created' }]);
		expect(note.blocks[0].activity).toBeUndefined();
	});

	it('conserva completadas con su flag checked (el Markdown las oculta, no el export); descarta separadores y prosa vacía; comentario y html JAMÁS viajan', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: null }];
		const blocksByNote = {
			n1: [
				{ id: 'done', parentBlockId: null, order: 0, type: 'todo', content: 'hecha', checked: true, createdBy: 'user', note: '' },
				{ id: 'sep', parentBlockId: null, order: 1, type: 'separator', content: '', checked: false, createdBy: 'user', note: '' },
				{ id: 'empty', parentBlockId: null, order: 2, type: 'text', content: '   ', checked: false, createdBy: 'user', note: '' },
				{ id: 'ok', parentBlockId: null, order: 3, type: 'todo', content: 'pendiente', checked: false, createdBy: 'user', html: '<b>pendiente</b>', note: 'comentario privado' }
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, { done: [{ action: 'done' }], ok: [] }, {});
		// Completed task is carried (so tools can still resolve/annotate it), separators
		// and empty prose are dropped. The completed task keeps checked:true + its bitácora.
		expect(payload.notes[0].blocks.map((b) => b.id)).toEqual(['done', 'ok']);
		expect(payload.notes[0].blocks.find((b) => b.id === 'done')).toMatchObject({ checked: true, activity: [{ action: 'done' }] });
		expect(payload.notes[0].blocks.find((b) => b.id === 'ok').checked).toBe(false);
		expect(payload.notes[0].folder).toBeNull();
		const flat = JSON.stringify(payload);
		// Comment and html are the double-locked secrets — never, regardless of checked.
		expect(flat).not.toContain('comentario privado');
		expect(flat).not.toContain('<b>');
	});

	// Spec 041 §8: el permiso que dio Hernán es para texto y tareas, no para una
	// foto. `export.json` dice que hubo una imagen, nunca la muestra.
	it('spec 041: una imagen sale como [Imagen: descripción], sin bytes, medidas ni id', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: null }];
		const blocksByNote = {
			n1: [
				{
					id: 'img1',
					parentBlockId: null,
					order: 0,
					type: 'image',
					content: 'el error',
					checked: false,
					createdBy: 'user',
					note: '',
					imageId: 'a'.repeat(64),
					imageType: 'image/png',
					imageBytes: 123456,
					imageWidth: 800,
					imageHeight: 600
				}
			]
		};
		const payload = toAgentPayload(notes, blocksByNote, {}, {});
		expect(payload.notes[0].blocks).toEqual([
			{ id: 'img1', type: 'image', content: '[Imagen: el error]', depth: 0 }
		]);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('a'.repeat(64));
		expect(flat).not.toContain('image/png');
		expect(flat).not.toContain('123456');
		expect(flat).not.toContain('800');
		expect(flat).not.toContain('600');
	});

	it('spec 041: una imagen sin descripción sigue avisando que hubo una imagen', () => {
		const notes = [{ id: 'n1', title: 'V', agentVisible: true, folderId: null }];
		const blocksByNote = {
			n1: [{ id: 'img1', parentBlockId: null, order: 0, type: 'image', content: '', checked: false, createdBy: 'user', note: '' }]
		};
		const payload = toAgentPayload(notes, blocksByNote, {}, {});
		expect(payload.notes[0].blocks[0].content).toBe('[Imagen]');
	});
});

// The deployed entry point (touches storage). Guards the defense-in-depth
// property that lives only here: a hidden note's blocks must never even be
// read, so nothing about it can reach the payload.
describe('buildAgentExport (privacy gate over real storage)', () => {
	beforeEach(async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});

	it('exports only agentVisible notes; a hidden note leaks nothing', async () => {
		const visible = await createNote({ title: 'Visible' });
		await updateNote(visible.id, { agentVisible: true });
		await createBlock({ noteId: visible.id, type: 'todo', content: 'hacer' });

		const hidden = await createNote({ title: 'Privada' });
		await createBlock({ noteId: hidden.id, type: 'todo', content: 'secreto' });

		const payload = await buildAgentExport();

		expect(payload.notes.map((note) => note.title)).toEqual(['Visible']);
		const flat = JSON.stringify(payload);
		expect(flat).not.toContain('secreto');
		expect(flat).not.toContain('Privada');
	});

	// La mitad de lectura del corte de emergencia. Sin esto, "pausado" solo taparía
	// las escrituras y el agente seguiría leyendo el archivo viejo entero.
	it('con los agentes pausados el archivo sale VACÍO, no viejo', async () => {
		const { setAgentsPaused } = await import('$lib/storage');
		const visible = await createNote({ title: 'Visible' });
		await updateNote(visible.id, { agentVisible: true });
		await createBlock({ noteId: visible.id, type: 'todo', content: 'hacer' });

		expect((await buildAgentExport()).notes).toHaveLength(1);

		await setAgentsPaused(true);
		const paused = await buildAgentExport();
		expect(paused.notes).toEqual([]);
		expect(JSON.stringify(paused)).not.toContain('hacer');

		// Reanudar devuelve todo sin tocar la marca 🤖 de ninguna nota.
		await setAgentsPaused(false);
		expect((await buildAgentExport()).notes.map((n) => n.title)).toEqual(['Visible']);
	});

	it('conserva una tarea completada con su bitácora (para add_note / get_task_history)', async () => {
		const { completeTask } = await import('$lib/tasks');
		const note = await createNote({ title: 'V' });
		await updateNote(note.id, { agentVisible: true });
		const block = await createBlock({ noteId: note.id, type: 'todo', content: 'hacer' });
		await completeTask({ blockId: block.id, actor: 'agent', text: 'listo' });

		const payload = await buildAgentExport();
		const exported = payload.notes[0].blocks.find((b) => b.id === block.id);
		expect(exported.checked).toBe(true);
		expect(exported.activity.map((e) => e.action)).toContain('done');
	});

	// El export se rehace en CADA orden del agente, y su bitácora sale de UNA
	// lectura por nota que se reparte por tarea en memoria (antes: una consulta
	// por tarea). Repartir mal es el riesgo del cambio, así que eso es lo que se
	// fija acá; el conteo de consultas no se puede espiar (`$lib/storage`
	// re-exporta y el espía no intercepta, y el objeto Table del test no es el
	// que capturó `activity.ts`).
	it('cada tarea se queda con su propia bitácora, no con la de la vecina', async () => {
		const { addTaskNote } = await import('$lib/tasks');
		const note = await createNote({ title: 'V' });
		await updateNote(note.id, { agentVisible: true });
		const uno = await createBlock({ noteId: note.id, type: 'todo', content: 'uno' });
		const dos = await createBlock({ noteId: note.id, type: 'todo', content: 'dos' });
		await addTaskNote({ blockId: uno.id, actor: 'agent', text: 'línea de la uno' });
		await addTaskNote({ blockId: dos.id, actor: 'agent', text: 'línea de la dos' });

		const payload = await buildAgentExport();

		const blocks = payload.notes[0].blocks;
		const textos = (id) => blocks.find((b) => b.id === id).activity.map((e) => e.text);
		expect(textos(uno.id)).toEqual(['línea de la uno']);
		expect(textos(dos.id)).toEqual(['línea de la dos']);
	});

	it('trae el nombre de la carpeta de la nota y nunca el comentario de un bloque', async () => {
		const folder = await createFolder('note', 'Trabajo');
		const note = await createNote({ title: 'Con carpeta' });
		await updateNote(note.id, { agentVisible: true, folderId: folder.id });
		await createBlock({ noteId: note.id, type: 'todo', content: 'tarea', note: 'privadísimo' });

		const payload = await buildAgentExport();
		const exported = payload.notes.find((n) => n.id === note.id);
		expect(exported.folder).toBe('Trabajo');
		expect(JSON.stringify(payload)).not.toContain('privadísimo');
	});
});

// El nombre se resuelve al SALIR (spec 038 §6). El cachecito de nombres es una
// tabla de Dexie y el servidor MCP corre en otro proceso, sin navegador: si baja
// `member:8f3a…` pelado, no hay nadie del otro lado que lo pueda traducir.
describe('quién es quién, visto por el agente', () => {
	async function notaCompartidaConBitacora(actor) {
		const { appendActivity } = await import('$lib/storage');
		const { setShareRole } = await import('$lib/storage/shares');
		const note = await createNote({ title: 'Contador' });
		await updateNote(note.id, { agentVisible: true });
		await setShareRole(note.id, 'owner');
		const block = await createBlock({ noteId: note.id, type: 'todo', content: 'llamar' });
		await appendActivity({
			blockId: block.id,
			noteId: note.id,
			actor,
			action: 'note',
			text: 'le dejé mensaje'
		});
		return { noteId: note.id, blockId: block.id };
	}

	it('el nombre del invitado baja resuelto, no como member:<uuid>', async () => {
		const { rememberShareName } = await import('$lib/storage/share-names');
		await rememberShareName('u-2', 'Juan');
		await notaCompartidaConBitacora('member:u-2');

		const linea = (await buildAgentExport()).notes[0].blocks[0].activity.at(-1);

		expect(linea.actorLabel).toBe('Juan');
		// Y el actor crudo sigue viajando: el rótulo es para leer, el actor es con
		// lo que el MCP decide el rol.
		expect(linea.actor).toBe('member:u-2');
	});

	it('un invitado sin nombre guardado no rompe nada', async () => {
		await notaCompartidaConBitacora('member:u-9');

		expect((await buildAgentExport()).notes[0].blocks[0].activity.at(-1).actorLabel).toBe(
			'Invitado'
		);
	});

	// El control: el actor de una línea del agente es su ID, no la palabra
	// 'agent'. Una prueba con la palabra pasaría sin probar nada.
	it('y una línea del agente sigue siendo del agente', async () => {
		await notaCompartidaConBitacora('agt_7f21c9');

		expect((await buildAgentExport()).notes[0].blocks[0].activity.at(-1).actorLabel).toBe('Agente');
	});
});

// "Listo" es un ESTADO de la nota, no un historial: el agente tiene que verlo
// sin preguntar, igual que ve el título. Por eso baja en la nota y no en una
// herramienta a demanda — y por eso su fila, que no cuelga de ningún renglón, se
// caería sola del agrupamiento por tarea si no se la separara acá.
describe('el "Listo" que el agente lee', () => {
	async function notaConListos(...textos) {
		const { markNoteDone } = await import('$lib/tasks');
		const { setShareRole } = await import('$lib/storage/shares');
		const note = await createNote({ title: 'Contador' });
		await updateNote(note.id, { agentVisible: true });
		await setShareRole(note.id, 'owner');
		await createBlock({ noteId: note.id, type: 'todo', content: 'llamar' });
		for (const texto of textos)
			await markNoteDone({ noteId: note.id, actor: 'member:u-2', text: texto });
		return note.id;
	}

	it('baja en la nota, con el nombre resuelto', async () => {
		const { rememberShareName } = await import('$lib/storage/share-names');
		await rememberShareName('u-2', 'Juan');
		await notaConListos('falta la factura');

		expect((await buildAgentExport()).notes[0].done).toMatchObject({
			actorLabel: 'Juan',
			text: 'falta la factura'
		});
	});

	// Sólo la ÚLTIMA: es una declaración de estado, y lo que el agente necesita es
	// si está dicho ahora, no cuántas veces se dijo. La proyección que lee es cara
	// en tokens por diseño, así que se le da un renglón y no una lista.
	it('sólo la última declaración', async () => {
		await notaConListos('primera', 'segunda');

		expect((await buildAgentExport()).notes[0].done.text).toBe('segunda');
	});

	// El control: sin él, un `if` mal escrito metería un "Listo" fantasma en TODAS
	// las notas del agente.
	it('una nota sin Listo trae null', async () => {
		const note = await createNote({ title: 'Sola' });
		await updateNote(note.id, { agentVisible: true });

		expect((await buildAgentExport()).notes[0].done).toBe(null);
	});

	// Y no se cuela en la lista de ninguna tarea: no cuelga de ningún renglón.
	it('no aparece en la bitácora de ningún renglón', async () => {
		await notaConListos('falta la factura');

		const bloques = (await buildAgentExport()).notes[0].blocks;
		expect(bloques.flatMap((b) => b.activity ?? [])).toEqual([]);
	});
});
