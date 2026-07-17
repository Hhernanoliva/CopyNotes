// Block dates (spec 021). A dueDate is always a LOCAL 'YYYY-MM-DD' string.
// NEVER new Date('YYYY-MM-DD') — JS parses that as UTC and the day shifts
// west of Greenwich. Parse digits, build Date only via new Date(y, m-1, d),
// compare day strings lexicographically (the format sorts naturally).
// Pure module: no DOM, no storage — safe to import from copy/, export-import/
// and format/ alike.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(day) {
	const match = DAY_RE.exec(day);
	if (!match) return null;
	const [, y, m, d] = match;
	return { y: Number(y), m: Number(m), d: Number(d) };
}

export function isValidDueDate(value) {
	if (typeof value !== 'string') return false;
	const p = parts(value);
	if (!p) return false;
	const date = new Date(p.y, p.m - 1, p.d);
	return date.getFullYear() === p.y && date.getMonth() === p.m - 1 && date.getDate() === p.d;
}

function toDayString(date) {
	const pad = (value) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayString(now = new Date()) {
	return toDayString(now);
}

// Milliseconds from `now` until the next LOCAL midnight (00:00 of tomorrow).
// Used to schedule the "day changed" tick so date labels and the Agenda
// refresh exactly when the calendar day rolls over. At exactly midnight the
// next boundary is a full day away, so the result is always > 0.
export function msUntilNextMidnight(now = new Date()) {
	const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	return nextMidnight.getTime() - now.getTime();
}

function toLocalDate(day) {
	const p = parts(day);
	return new Date(p.y, p.m - 1, p.d);
}

export function addDays(day, count) {
	const date = toLocalDate(day);
	date.setDate(date.getDate() + count);
	return toDayString(date);
}

export function resolveQuickOption(option, today) {
	if (option === 'today') return today;
	if (option === 'tomorrow') return addDays(today, 1);
	if (option === 'next-week') return addDays(today, 7);
	return null;
}

const shortDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const shortDayYear = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

export function badgeLabel(day, today) {
	if (day === today) return 'hoy';
	if (day === addDays(today, 1)) return 'mañana';
	const format = day.slice(0, 4) === today.slice(0, 4) ? shortDay : shortDayYear;
	return format.format(toLocalDate(day)).replaceAll('.', '');
}

export function exportLabel(day) {
	const p = parts(day);
	const pad = (value) => String(value).padStart(2, '0');
	return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

// What copy/export appends to a dated line so dates never vanish silently.
export function dateSuffix(block) {
	return isValidDueDate(block?.dueDate) ? ` — 📅 ${exportLabel(block.dueDate)}` : '';
}

export function isOverdue(block, today) {
	if (!isValidDueDate(block?.dueDate)) return false;
	if (block.type === 'todo' && block.checked) return false;
	return block.dueDate < today;
}
