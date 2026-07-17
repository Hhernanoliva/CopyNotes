import { describe, expect, it } from 'vitest';
import { SLASH_COMMANDS, filterCommands, moveSelection, nextSlashState } from './slash';

describe('SLASH_COMMANDS', () => {
	it('offers the block types from spec 003 plus /snippet from spec 005', () => {
		const ids = SLASH_COMMANDS.map((command) => command.id);
		expect(ids).toEqual(['text', 'heading1', 'heading2', 'heading3', 'bullet', 'todo', 'date', 'code', 'separator', 'snippet']);
	});
});

describe('filterCommands', () => {
	it('returns everything for an empty query', () => {
		expect(filterCommands('')).toHaveLength(SLASH_COMMANDS.length);
	});

	it('matches by command id', () => {
		const results = filterCommands('todo');
		expect(results.map((command) => command.id)).toEqual(['todo']);
	});

	it('matches Spanish keywords case-insensitively', () => {
		const results = filterCommands('VIÑETA');
		expect(results.map((command) => command.id)).toEqual(['bullet']);
	});

	it('matches only the snippet command for "snippet"', () => {
		const results = filterCommands('snippet');
		expect(results.map((command) => command.id)).toEqual(['snippet']);
	});

	it('returns empty for garbage input', () => {
		expect(filterCommands('zzzz')).toEqual([]);
	});

	it('ranks prefix matches before substring matches', () => {
		// "ta" starts "tarea" but only appears inside "viñeta"/"lista".
		const results = filterCommands('ta');
		expect(results[0].id).toBe('todo');
	});

	it('filters headings by h2', () => {
		const ids = filterCommands('h2').map((c) => c.id);
		expect(ids).toContain('heading2');
	});

	it('offers Fecha and finds it by keyword (spec 021)', () => {
		expect(SLASH_COMMANDS.some((command) => command.id === 'date')).toBe(true);
		expect(filterCommands('fech').map((command) => command.id)).toContain('date');
		expect(filterCommands('agenda').map((command) => command.id)).toContain('date');
	});
});

describe('nextSlashState', () => {
	it('opens when "/" is typed in an empty block', () => {
		expect(nextSlashState(null, { prevText: '', text: '/', caret: 1 })).toEqual({
			anchor: 0,
			query: ''
		});
	});

	it('opens when "/" is typed after existing text', () => {
		expect(nextSlashState(null, { prevText: 'Hola ', text: 'Hola /', caret: 6 })).toEqual({
			anchor: 5,
			query: ''
		});
	});

	it('opens when "/" is typed in the middle of the text', () => {
		expect(
			nextSlashState(null, { prevText: 'Hola mundo', text: 'Hola /mundo', caret: 6 })
		).toEqual({ anchor: 5, query: '' });
	});

	it('does not open when several characters arrive at once (paste)', () => {
		expect(nextSlashState(null, { prevText: '', text: '/todo', caret: 5 })).toBeNull();
	});

	it('does not open when the typed character is not "/"', () => {
		expect(nextSlashState(null, { prevText: 'a', text: 'ab', caret: 2 })).toBeNull();
	});

	it('extends the query as the user types after the "/"', () => {
		expect(
			nextSlashState({ anchor: 5, query: '' }, { prevText: 'Hola /', text: 'Hola /t', caret: 7 })
		).toEqual({ anchor: 5, query: 't' });
	});

	it('keeps the query bounded by the caret, not the end of the text', () => {
		expect(
			nextSlashState(
				{ anchor: 5, query: '' },
				{ prevText: 'Hola /mundo', text: 'Hola /tmundo', caret: 7 }
			)
		).toEqual({ anchor: 5, query: 't' });
	});

	it('shrinks the query on backspace while the "/" remains', () => {
		expect(
			nextSlashState({ anchor: 5, query: 'ta' }, { prevText: 'Hola /ta', text: 'Hola /t', caret: 7 })
		).toEqual({ anchor: 5, query: 't' });
	});

	it('closes when the "/" itself is deleted', () => {
		expect(
			nextSlashState({ anchor: 5, query: '' }, { prevText: 'Hola /', text: 'Hola ', caret: 5 })
		).toBeNull();
	});

	it('closes when the anchor no longer holds a "/"', () => {
		expect(
			nextSlashState({ anchor: 5, query: 't' }, { prevText: 'Hola /t', text: 'Hol', caret: 3 })
		).toBeNull();
	});

	it('closes when a line break lands inside the query', () => {
		expect(
			nextSlashState({ anchor: 0, query: '' }, { prevText: '/', text: '/a\nb', caret: 4 })
		).toBeNull();
	});

	it('without caret info, falls back to the old rule: "/" at the start opens', () => {
		expect(nextSlashState(null, { prevText: '', text: '/todo', caret: null })).toEqual({
			anchor: 0,
			query: 'todo'
		});
		expect(nextSlashState(null, { prevText: 'x', text: 'x/', caret: null })).toBeNull();
	});

	it('without caret info, an open menu keeps everything after the "/" as query', () => {
		expect(
			nextSlashState({ anchor: 5, query: '' }, { prevText: 'Hola /', text: 'Hola /ta', caret: null })
		).toEqual({ anchor: 5, query: 'ta' });
	});
});

describe('moveSelection', () => {
	it('moves down and wraps to the top', () => {
		expect(moveSelection(0, 1, 3)).toBe(1);
		expect(moveSelection(2, 1, 3)).toBe(0);
	});

	it('moves up and wraps to the bottom', () => {
		expect(moveSelection(1, -1, 3)).toBe(0);
		expect(moveSelection(0, -1, 3)).toBe(2);
	});

	it('stays at zero for an empty list', () => {
		expect(moveSelection(0, 1, 0)).toBe(0);
	});
});
