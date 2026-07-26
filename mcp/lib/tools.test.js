// Pure unit tests: builders (args → change object) and the result mapper
// (submitChange result → MCP tool content). No fs, no MCP SDK — server.js
// wires these into registerTool(). submitChange itself is mocked out at the
// server.js integration layer, not here.

import { describe, it, expect } from 'vitest';
import {
	createTaskChange,
	completeTaskChange,
	addNoteChange,
	toolResult,
	createTaskResult,
	rejectionText,
	resolveNote,
	makeToolHandler,
	expandArgs,
	historyResult,
	listNotesResult,
	readNoteResult
} from './tools.js';

describe('createTaskChange', () => {
	it('builds a createTask change with exactly noteId + content, matching the ingest allow-list', () => {
		const change = createTaskChange({ noteId: 'note-1', content: 'Llamar al cliente' });

		expect(change).toEqual({ type: 'createTask', noteId: 'note-1', content: 'Llamar al cliente' });
	});

	it('never sets id or agentId — submitChange generates the id, actor is derived app-side', () => {
		const change = createTaskChange({ noteId: 'note-1', content: 'x' });

		expect('id' in change).toBe(false);
		expect('agentId' in change).toBe(false);
	});
});

describe('completeTaskChange', () => {
	it('builds a completeTask change with blockId + text, matching the ingest allow-list', () => {
		const change = completeTaskChange({ blockId: 'block-1', summary: 'Confirmado por teléfono' });

		expect(change).toEqual({ type: 'completeTask', blockId: 'block-1', text: 'Confirmado por teléfono' });
	});

	it('defaults text to \'\' when summary is omitted', () => {
		const change = completeTaskChange({ blockId: 'block-1' });

		expect(change).toEqual({ type: 'completeTask', blockId: 'block-1', text: '' });
	});

	it('never sets id or agentId', () => {
		const change = completeTaskChange({ blockId: 'block-1' });

		expect('id' in change).toBe(false);
		expect('agentId' in change).toBe(false);
	});
});

describe('addNoteChange', () => {
	it('builds an addNote change with blockId + text — type is exactly \'addNote\', not \'addTaskNote\'', () => {
		const change = addNoteChange({ blockId: 'block-1', text: 'Esperando respuesta del cliente' });

		expect(change).toEqual({ type: 'addNote', blockId: 'block-1', text: 'Esperando respuesta del cliente' });
	});

	it('never sets id or agentId', () => {
		const change = addNoteChange({ blockId: 'block-1', text: 'x' });

		expect('id' in change).toBe(false);
		expect('agentId' in change).toBe(false);
	});
});

describe('toolResult', () => {
	it('maps an ok result to isError: false and surfaces the caller-supplied okText verbatim', () => {
		// The result shape is deliberately the REAL success shape { block, activity }
		// — the same shape completeTask returns — to prove toolResult no longer
		// infers the wording from it. The okText is the sole source of the message.
		const result = toolResult(
			{ ok: true, id: 'abc', result: { block: { id: 't1' }, activity: {} } },
			'Tarea marcada como hecha.'
		);

		expect(result.isError).toBe(false);
		expect(result.content).toEqual([{ type: 'text', text: 'Tarea marcada como hecha.' }]);
	});

	it('defaults okText to \'Listo.\' when none is passed', () => {
		const result = toolResult({ ok: true, id: 'abc' });

		expect(result.isError).toBe(false);
		expect(result.content[0].text).toBe('Listo.');
	});

	it('is robust to an ok result with no result payload (e.g. addNote outcomes)', () => {
		const result = toolResult({ ok: true, id: 'abc' }, 'Nota agregada a la bitácora.');

		expect(result.isError).toBe(false);
		expect(result.content[0].text).toBe('Nota agregada a la bitácora.');
	});

	it('maps a not-agent-visible rejection to isError: true, with the reason surfaced in the text', () => {
		const result = toolResult({ ok: false, reason: 'not-agent-visible', id: 'abc' }, 'Tarea creada.');

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('not-agent-visible');
	});

	it('maps a not-allowed rejection to isError: true, with the reason surfaced in the text', () => {
		const result = toolResult({ ok: false, reason: 'not-allowed', id: 'abc' });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('not-allowed');
	});

	it('maps the timeout shape to isError:true and tells the model NOT to resend (id echoed)', () => {
		// The request is already in the buzón and the app applies it at most once,
		// so a blind resend is the real duplicate risk — the wording must say stop,
		// not retry — and echo the id so a human can trace it.
		const result = toolResult({ ok: false, reason: 'timeout', id: 'abc' });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('abc');
		expect(result.content[0].text).toMatch(/no la reenv[ií]es/i);
	});

	it('is robust to a missing/undefined result (no unhandled throw)', () => {
		const result = toolResult(undefined);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toEqual(expect.any(String));
	});
});

const expandPayload = {
	notes: [
		{
			id: 'aaaaaaaa-1111-4111-8111-111111111111',
			blocks: [
				{
					id: 'bbbbbbbb-2222-4222-8222-222222222222',
					type: 'todo',
					content: 't',
					depth: 0,
					createdBy: 'user',
					activity: [
						{ actor: 'user', action: 'created', text: 'Armar demo', at: '2026-07-24T00:00:00Z' },
						{ actor: 'agente-uuid', action: 'note', text: 'Empiezo por el build', at: '2026-07-25T00:00:00Z' }
					]
				}
			]
		}
	]
};

describe('expandArgs', () => {
	it('expande noteId y blockId cortos', () => {
		const res = expandArgs(expandPayload, { noteId: 'aaaaaaaa', blockId: 'bbbbbbbb', content: 'x' });
		expect(res).toEqual({
			ok: true,
			args: {
				noteId: 'aaaaaaaa-1111-4111-8111-111111111111',
				blockId: 'bbbbbbbb-2222-4222-8222-222222222222',
				content: 'x'
			}
		});
	});
	it('id inexistente → error con reason', () => {
		expect(expandArgs(expandPayload, { blockId: 'zzzz' })).toEqual({ ok: false, reason: 'no-encontrado' });
	});
	it('noteId se resuelve como nota y blockId como tarea (no cruza tipos)', () => {
		// 'aaaaaaaa' es una NOTA: sirve como noteId, pero NO como blockId (tarea).
		expect(expandArgs(expandPayload, { noteId: 'aaaaaaaa' }).ok).toBe(true);
		expect(expandArgs(expandPayload, { blockId: 'aaaaaaaa' })).toEqual({ ok: false, reason: 'no-encontrado' });
	});
	it('args sin ids pasan intactos', () => {
		expect(expandArgs(expandPayload, { content: 'x' })).toEqual({ ok: true, args: { content: 'x' } });
	});
});

describe('historyResult', () => {
	it('devuelve la bitácora compacta, viejas primero, sin UUIDs ni timestamps', () => {
		const res = historyResult(expandPayload, 'bbbbbbbb');
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toBe('- usuario creó: Armar demo\n- agente anotó: Empiezo por el build');
	});
	it('tarea inexistente → isError', () => {
		expect(historyResult(expandPayload, 'zzzz').isError).toBe(true);
	});
	// Bug #2 regression: a task the agent just COMPLETED must stay resolvable —
	// the export carries completed todos so its short id still expands, and both
	// get_task_history and add_note (via expandArgs) work on it. If completed
	// tasks were ever dropped from the export again, these two would break.
	it('resuelve una tarea COMPLETADA para historial y para add_note (via expandArgs)', () => {
		const payload = {
			notes: [
				{
					id: 'aaaaaaaa-1111-4111-8111-111111111111',
					title: 'N',
					blocks: [
						{
							id: 'ffffffff-6666-4666-8666-666666666666',
							type: 'todo',
							content: 'hecha',
							checked: true,
							depth: 0,
							activity: [{ actor: 'user', action: 'done', text: 'listo', at: '2026-07-26T00:00:00Z' }]
						}
					]
				}
			]
		};
		const hist = historyResult(payload, 'ffffffff');
		expect(hist.isError).toBe(false);
		expect(hist.content[0].text).toBe('- usuario completó: listo');
		expect(expandArgs(payload, { blockId: 'ffffffff', text: 'x' })).toEqual({
			ok: true,
			args: { blockId: 'ffffffff-6666-4666-8666-666666666666', text: 'x' }
		});
	});
});

const notesPayload = {
	notes: [
		{
			id: 'aaaaaaaa-1111-4111-8111-111111111111',
			title: 'Probando MCP',
			folder: 'Trabajo',
			blocks: [
				{ id: 'p1', type: 'text', content: 'Contexto de la nota', depth: 0 },
				{ id: 'cccccccc-3333-4333-8333-333333333333', type: 'todo', content: 'Pendiente', checked: false, depth: 0, activity: [] },
				{ id: 'dddddddd-4444-4444-8444-444444444444', type: 'todo', content: 'Hecha', checked: true, depth: 0, activity: [] }
			]
		},
		{ id: 'eeeeeeee-5555-4555-8555-555555555555', title: 'Otra nota', folder: null, blocks: [] }
	]
};

describe('listNotesResult', () => {
	it('lista cada nota visible con id corto, título y carpeta', () => {
		const res = listNotesResult(notesPayload);
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toBe('- aaaaaaaa  Probando MCP  ·  Trabajo\n- eeeeeeee  Otra nota');
	});
	it('sin notas visibles avisa en texto, sin error', () => {
		const res = listNotesResult({ notes: [] });
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toContain('No hay notas');
	});
});

describe('readNoteResult', () => {
	it('resuelve por nombre y devuelve Markdown con el id de la nota en el encabezado, ocultando la tarea completada', () => {
		const res = readNoteResult(notesPayload, 'Probando MCP');
		expect(res.isError).toBe(false);
		// id-first en el encabezado (como list_notes), para que create_task no
		// necesite un list_notes extra para conocer el id de la nota.
		expect(res.content[0].text).toContain('## aaaaaaaa  Probando MCP  ·  Trabajo');
		expect(res.content[0].text).toContain('Pendiente');
		expect(res.content[0].text).not.toContain('Hecha');
	});
	it('resuelve por id corto', () => {
		const res = readNoteResult(notesPayload, 'aaaaaaaa');
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toContain('Probando MCP');
	});
	it('resuelve por substring único del título (case-insensitive)', () => {
		const res = readNoteResult(notesPayload, 'probando');
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toContain('Probando MCP');
	});
	it('nombre inexistente → isError', () => {
		expect(readNoteResult(notesPayload, 'no existe').isError).toBe(true);
	});
	it('substring ambiguo (en más de un título) → isError con reason ambiguo Y los candidatos (id + título)', () => {
		// 'o' aparece en 'Probando MCP' y en 'Otra nota'. La respuesta lista ambas
		// con su id corto, para que el modelo elija sin llamar a list_notes.
		const res = readNoteResult(notesPayload, 'o');
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toContain('ambiguo');
		expect(res.content[0].text).toContain('aaaaaaaa  Probando MCP');
		expect(res.content[0].text).toContain('eeeeeeee  Otra nota');
	});
});

describe('resolveNote', () => {
	it('resuelve por id corto y por nombre (parcial único), devolviendo la nota', () => {
		expect(resolveNote(notesPayload, 'aaaaaaaa').note.title).toBe('Probando MCP');
		expect(resolveNote(notesPayload, 'probando').note.title).toBe('Probando MCP');
	});
	it('nombre ambiguo → { ok:false, reason:\'ambiguo\', candidates:[{short,title}] }', () => {
		const res = resolveNote(notesPayload, 'o');
		expect(res.ok).toBe(false);
		expect(res.reason).toBe('ambiguo');
		expect(res.candidates).toEqual([
			{ short: 'aaaaaaaa', title: 'Probando MCP' },
			{ short: 'eeeeeeee', title: 'Otra nota' }
		]);
	});
	it('inexistente → no-encontrado, sin candidatos', () => {
		expect(resolveNote(notesPayload, 'zzz')).toEqual({ ok: false, reason: 'no-encontrado' });
	});
});

describe('createTaskResult', () => {
	it('devuelve el id corto (8 chars) de la tarea creada en el mensaje de éxito', () => {
		const res = createTaskResult({
			ok: true,
			result: { block: { id: '6ca816b6-7777-4777-8777-777777777777' }, activity: {} }
		});
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toBe('Tarea creada: 6ca816b6');
	});
	it('cae a \'Tarea creada.\' si el resultado no trae block.id', () => {
		const res = createTaskResult({ ok: true, result: {} });
		expect(res.isError).toBe(false);
		expect(res.content[0].text).toBe('Tarea creada.');
	});
	it('un rechazo se enruta por toolResult (isError, con la razón)', () => {
		const res = createTaskResult({ ok: false, reason: 'not-agent-visible' });
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toContain('not-agent-visible');
	});
	it('un timeout se enruta por toolResult (mensaje \'no reenviar\')', () => {
		const res = createTaskResult({ ok: false, reason: 'timeout', id: 'zzz' });
		expect(res.isError).toBe(true);
		expect(res.content[0].text).toMatch(/no la reenv[ií]es/i);
	});
});

describe('rejectionText', () => {
	it('timeout: menciona el id y pide no reenviar', () => {
		expect(rejectionText('timeout', undefined, 'abc')).toMatch(/abc/);
		expect(rejectionText('timeout', undefined, 'abc')).toMatch(/no la reenv[ií]es/i);
	});
	it('ambiguo con candidatos: los lista con id + título', () => {
		const text = rejectionText('ambiguo', [{ short: 'a1', title: 'Uno' }, { short: 'b2', title: 'Dos' }]);
		expect(text).toContain('- a1  Uno');
		expect(text).toContain('- b2  Dos');
	});
	it('razón simple: \'Rechazado: <razón>\'', () => {
		expect(rejectionText('not-a-task')).toBe('Rechazado: not-a-task');
	});
});

describe('makeToolHandler', () => {
	// A tiny mock submitChange: records every change it was called with and
	// returns a fixed result, so a handler test can assert the EXACT change
	// shape submitted (catching a builder↔tool mis-wire) without any real buzón.
	function fakeSubmit(returnValue) {
		const calls = [];
		const fn = async (change) => {
			calls.push(change);
			return returnValue;
		};
		return { fn, calls };
	}

	it('create_task wiring: submits a createTask change and returns \'Tarea creada.\' on ok', async () => {
		const { fn, calls } = fakeSubmit({ ok: true, result: { block: { id: 't1' }, activity: {} } });
		const handler = makeToolHandler(createTaskChange, 'Tarea creada.', fn);

		const result = await handler({ noteId: 'note-1', content: 'Llamar' });

		expect(calls).toEqual([{ type: 'createTask', noteId: 'note-1', content: 'Llamar' }]);
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toBe('Tarea creada.');
	});

	it('complete_task wiring: submits a completeTask change (text:\'\' when no summary) and returns \'Tarea marcada como hecha.\'', async () => {
		const { fn, calls } = fakeSubmit({ ok: true, result: { block: { id: 'b' }, activity: {} } });
		const handler = makeToolHandler(completeTaskChange, 'Tarea marcada como hecha.', fn);

		const result = await handler({ blockId: 'b' });

		expect(calls).toEqual([{ type: 'completeTask', blockId: 'b', text: '' }]);
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toBe('Tarea marcada como hecha.');
	});

	it('REGRESSION: a successful complete_task result never says a task was "creada"', async () => {
		// Guards the original bug: completeTask's result is { block, activity } —
		// the same shape as createTask — so any wording inferred from block.id
		// would wrongly read "Tarea creada". The okText path must not.
		const { fn } = fakeSubmit({ ok: true, result: { block: { id: 'b' }, activity: {} } });
		const handler = makeToolHandler(completeTaskChange, 'Tarea marcada como hecha.', fn);

		const result = await handler({ blockId: 'b', summary: 'confirmado' });

		expect(result.content[0].text).not.toContain('creada');
	});

	it('add_note wiring: submits an addNote change and returns \'Nota agregada a la bitácora.\'', async () => {
		const { fn, calls } = fakeSubmit({ ok: true, result: { activity: {} } });
		const handler = makeToolHandler(addNoteChange, 'Nota agregada a la bitácora.', fn);

		const result = await handler({ blockId: 'b', text: 'esperando respuesta' });

		expect(calls).toEqual([{ type: 'addNote', blockId: 'b', text: 'esperando respuesta' }]);
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toBe('Nota agregada a la bitácora.');
	});

	it('surfaces an app rejection as isError:true with the reason, ignoring okText', async () => {
		const { fn } = fakeSubmit({ ok: false, reason: 'not-agent-visible' });
		const handler = makeToolHandler(completeTaskChange, 'Tarea marcada como hecha.', fn);

		const result = await handler({ blockId: 'b' });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('not-agent-visible');
	});
});
