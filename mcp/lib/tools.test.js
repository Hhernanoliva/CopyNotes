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
	makeToolHandler
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

	it('maps the M1 timeout shape ({ ok:false, reason:\'timeout\' }) to isError: true', () => {
		const result = toolResult({ ok: false, reason: 'timeout', id: 'abc' });

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('timeout');
	});

	it('is robust to a missing/undefined result (no unhandled throw)', () => {
		const result = toolResult(undefined);

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toEqual(expect.any(String));
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
