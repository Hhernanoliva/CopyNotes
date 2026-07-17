// Agenda grouping (spec 021): every live block with a dueDate, in five fixed
// day groups. Pure — the UI feeds it blocks and today's local day string.

import { addDays, isValidDueDate } from './core';

export const AGENDA_GROUPS = [
	{ id: 'overdue', label: 'Vencidas' },
	{ id: 'today', label: 'Hoy' },
	{ id: 'tomorrow', label: 'Mañana' },
	{ id: 'week', label: 'Esta semana' },
	{ id: 'later', label: 'Más adelante' }
];

// "Esta semana" ends on the CURRENT week's Sunday (inclusive). getDay():
// 0 = Sunday. On Saturday (7-dow)%7 is 1 and on Sunday it is 0, so the 'week'
// bucket is empty on weekends BY DESIGN (product decision 2026-07-16):
// "Esta semana" never shows next week's days — those belong to "Más adelante".
function weekEnd(today) {
	const [y, m, d] = today.split('-').map(Number);
	const dow = new Date(y, m - 1, d).getDay();
	return addDays(today, (7 - dow) % 7);
}

export function groupForAgenda(blocks, today) {
	const tomorrow = addDays(today, 1);
	const sunday = weekEnd(today);
	const items = { overdue: [], today: [], tomorrow: [], week: [], later: [] };
	const dated = blocks
		.filter((block) => isValidDueDate(block.dueDate))
		.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
	for (const block of dated) {
		if (block.dueDate < today) {
			// A finished past todo is history, not a pending item.
			if (!(block.type === 'todo' && block.checked)) items.overdue.push(block);
		} else if (block.dueDate === today) items.today.push(block);
		else if (block.dueDate === tomorrow) items.tomorrow.push(block);
		else if (block.dueDate <= sunday) items.week.push(block);
		else items.later.push(block);
	}
	return AGENDA_GROUPS.map((group) => ({ ...group, items: items[group.id] })).filter(
		(group) => group.items.length > 0
	);
}
