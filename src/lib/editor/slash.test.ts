import { describe, expect, it } from 'vitest';
import { SLASH_COMMANDS, filterCommands, moveSelection } from './slash';

describe('SLASH_COMMANDS', () => {
	it('offers the block types from spec 003 plus /snippet from spec 005', () => {
		const ids = SLASH_COMMANDS.map((command) => command.id);
		expect(ids).toEqual(['text', 'bullet', 'todo', 'code', 'separator', 'snippet']);
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
