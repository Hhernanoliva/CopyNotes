import { describe, expect, it } from 'vitest';
import { diffWords } from './diff';

// The one invariant every case depends on: the pieces put the line back
// together. The panel renders these segments instead of the string, so a diff
// that drops or duplicates a character silently rewrites what the person is
// choosing between.
function rebuilt(parts) {
	return parts.map((part) => part.text).join('');
}

const changed = (parts) =>
	parts
		.filter((part) => part.changed)
		.map((part) => part.text)
		.join('');

describe('marking what changed between two versions', () => {
	it('widens a one-character difference to the whole word', () => {
		// The real case from the field: the only difference is a space, and two
		// almost identical lines are unreadable side by side.
		const { mine, theirs } = diffWords('como: cuando a namacion?', 'como: cuandoa namacion?');

		expect(changed(mine)).toBe('cuando a');
		expect(changed(theirs)).toBe('cuandoa');
		expect(rebuilt(mine)).toBe('como: cuando a namacion?');
		expect(rebuilt(theirs)).toBe('como: cuandoa namacion?');
	});

	it('marks one replaced word and leaves the rest alone', () => {
		const { mine, theirs } = diffWords('comprar pan y leche', 'comprar pan y queso');

		expect(changed(mine)).toBe('leche');
		expect(changed(theirs)).toBe('queso');
		expect(mine[0].text).toBe('comprar pan y ');
		expect(mine[0].changed).toBe(false);
	});

	it('gives both sides something to show when one of them added a word', () => {
		// A pure insertion marks nothing on the side that stayed put — an invisible
		// mark on one of the two options is exactly the confusion this exists to
		// remove. Widening to whole words is what fixes it: the shared word next to
		// the insertion joins both spans, so each line has a visible span and the
		// pair reads as "acá dice esto, allá dice esto otro".
		const { mine, theirs } = diffWords('llamar al dentista', 'llamar hoy al dentista');

		expect(changed(mine)).toBe('al');
		expect(changed(theirs)).toBe('hoy al');
		expect(rebuilt(mine)).toBe('llamar al dentista');
		expect(rebuilt(theirs)).toBe('llamar hoy al dentista');
	});

	it('marks nothing when the two lines are the same', () => {
		const { mine, theirs } = diffWords('sin cambios', 'sin cambios');

		expect(changed(mine)).toBe('');
		expect(changed(theirs)).toBe('');
		expect(rebuilt(mine)).toBe('sin cambios');
	});

	it('marks the whole line when nothing at all lines up', () => {
		const { mine, theirs } = diffWords('renovar el pasaporte', 'turno con Mecha');

		expect(changed(mine)).toBe('renovar el pasaporte');
		expect(changed(theirs)).toBe('turno con Mecha');
	});

	it('handles an empty side without inventing text', () => {
		const { mine, theirs } = diffWords('', 'algo escrito allá');

		expect(rebuilt(mine)).toBe('');
		expect(changed(theirs)).toBe('algo escrito allá');
	});

	it('survives a missing value instead of throwing', () => {
		// `block.content` of an untouched empty row is undefined in practice, and a
		// crash here would take the whole note down with it.
		expect(rebuilt(diffWords(undefined, 'hola').theirs)).toBe('hola');
		expect(rebuilt(diffWords('hola', null).mine)).toBe('hola');
	});

	it('never lets the two ends overlap and double-count a change', () => {
		// "aa" vs "aaa": read from the left the prefix is "aa", read from the right
		// the suffix is also "aa". Counting both would describe more of the line
		// than exists and the pieces would no longer rebuild it.
		const { mine, theirs } = diffWords('aa', 'aaa');

		expect(rebuilt(mine)).toBe('aa');
		expect(rebuilt(theirs)).toBe('aaa');
	});

	it('treats a line break as a word boundary, not a letter', () => {
		const { mine } = diffWords('primera\nsegunda', 'primera\ntercera');

		expect(changed(mine)).toBe('segunda');
	});
});
