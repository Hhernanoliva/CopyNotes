import { describe, expect, it } from 'vitest';
import { groupForAgenda } from './agenda';

// 2026-07-16 is a Thursday; the week ends Sunday 2026-07-19.
const TODAY = '2026-07-16';
const block = (id, dueDate, extra = {}) => ({ id, type: 'text', content: id, checked: false, dueDate, ...extra });

describe('groupForAgenda', () => {
	it('splits into the five groups, ascending inside each', () => {
		const groups = groupForAgenda(
			[
				block('later', '2026-07-25'),
				block('today', '2026-07-16'),
				block('week2', '2026-07-19'),
				block('overdue', '2026-07-10'),
				block('week1', '2026-07-18'),
				block('tomorrow', '2026-07-17')
			],
			TODAY
		);
		expect(groups.map((group) => group.id)).toEqual(['overdue', 'today', 'tomorrow', 'week', 'later']);
		expect(groups.find((group) => group.id === 'week').items.map((item) => item.id)).toEqual(['week1', 'week2']);
	});
	it('monday after the weekend is "later"', () => {
		const groups = groupForAgenda([block('monday', '2026-07-20')], TODAY);
		expect(groups.map((group) => group.id)).toEqual(['later']);
	});
	it('drops empty groups and ignores undated blocks', () => {
		const groups = groupForAgenda([block('today', '2026-07-16'), block('none', null)], TODAY);
		expect(groups.map((group) => group.id)).toEqual(['today']);
	});
	it('checked past todos leave the agenda; unchecked stay overdue', () => {
		const groups = groupForAgenda(
			[
				block('done', '2026-07-10', { type: 'todo', checked: true }),
				block('pending', '2026-07-10', { type: 'todo', checked: false })
			],
			TODAY
		);
		expect(groups).toHaveLength(1);
		expect(groups[0].id).toBe('overdue');
		expect(groups[0].items.map((item) => item.id)).toEqual(['pending']);
	});
	it('a checked todo dated today still shows under Hoy', () => {
		const groups = groupForAgenda([block('done-today', '2026-07-16', { type: 'todo', checked: true })], TODAY);
		expect(groups[0].id).toBe('today');
	});
	it('labels are the Spanish group names', () => {
		const groups = groupForAgenda([block('overdue', '2026-07-10')], TODAY);
		expect(groups[0].label).toBe('Vencidas');
	});
});
