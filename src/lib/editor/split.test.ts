import { describe, expect, it } from 'vitest';
import { planJoin, planSplit } from './split';

describe('planSplit', () => {
	it('moves what is after the caret to the new row, formatting included', () => {
		const plan = planSplit('hola <strong>mundo</strong>', 5, 5);
		expect(plan).toEqual({
			head: { html: 'hola ', content: 'hola ' },
			tail: { html: '<strong>mundo</strong>', content: 'mundo' }
		});
	});

	it('splits inside a formatted run, keeping the format on both sides', () => {
		const plan = planSplit('<em>hola mundo</em>', 5, 5);
		expect(plan).toEqual({
			head: { html: '<em>hola </em>', content: 'hola ' },
			tail: { html: '<em>mundo</em>', content: 'mundo' }
		});
	});

	it('returns null with the caret at the end: Enter keeps making a new empty row', () => {
		expect(planSplit('hola', 4, 4)).toBe(null);
	});

	it('returns null on an empty row, so the double-Enter escape is untouched', () => {
		expect(planSplit('', 0, 0)).toBe(null);
	});

	it('with the caret at the start the whole text travels down', () => {
		const plan = planSplit('hola', 0, 0);
		expect(plan).toEqual({
			head: { html: '', content: '' },
			tail: { html: 'hola', content: 'hola' }
		});
	});

	it('drops the selected text and splits at its start', () => {
		const plan = planSplit('hola mundo', 4, 5);
		expect(plan).toEqual({
			head: { html: 'hola', content: 'hola' },
			tail: { html: 'mundo', content: 'mundo' }
		});
	});

	it('counts a soft line break as one character', () => {
		const plan = planSplit('uno<br>dos', 4, 4);
		expect(plan).toEqual({
			head: { html: 'uno<br>', content: 'uno\n' },
			tail: { html: 'dos', content: 'dos' }
		});
	});

	it('normalizes the offsets when the selection was made backwards', () => {
		const plan = planSplit('hola mundo', 5, 4);
		expect(plan).toEqual({
			head: { html: 'hola', content: 'hola' },
			tail: { html: 'mundo', content: 'mundo' }
		});
	});
});

describe('planJoin', () => {
	// El inverso de planSplit: dos renglones vuelven a ser uno. El cursor va a
	// la costura — donde termina el texto de arriba — que es exactamente donde
	// estaba el corte que se está deshaciendo.
	it('glues the two rows keeping both formats, caret at the seam', () => {
		expect(planJoin('hola ', '<strong>mundo</strong>')).toEqual({
			html: 'hola <strong>mundo</strong>',
			content: 'hola mundo',
			caret: 5
		});
	});

	it('counts a soft line break as one character for the caret', () => {
		expect(planJoin('uno<br>dos', 'tres')).toEqual({
			html: 'uno<br>dostres',
			content: 'uno\ndostres',
			caret: 7
		});
	});

	it('leaves the caret at the start when the row above is empty', () => {
		expect(planJoin('', 'mundo')).toEqual({ html: 'mundo', content: 'mundo', caret: 0 });
	});

	it('keeps the row above untouched when the one coming up is empty', () => {
		expect(planJoin('hola', '')).toEqual({ html: 'hola', content: 'hola', caret: 4 });
	});
});
