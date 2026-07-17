import { describe, expect, it } from 'vitest';
import {
	addDays,
	badgeLabel,
	dateSuffix,
	exportLabel,
	isOverdue,
	isValidDueDate,
	msUntilNextMidnight,
	resolveQuickOption,
	todayString
} from './core';

describe('isValidDueDate', () => {
	it('accepts a real calendar day', () => {
		expect(isValidDueDate('2026-07-22')).toBe(true);
	});
	it('rejects wrong shapes and impossible days', () => {
		expect(isValidDueDate('22/07/2026')).toBe(false);
		expect(isValidDueDate('2026-02-30')).toBe(false);
		expect(isValidDueDate('2026-7-2')).toBe(false);
		expect(isValidDueDate(20260722)).toBe(false);
		expect(isValidDueDate(null)).toBe(false);
	});
});

describe('todayString', () => {
	it('formats the local day, zero-padded', () => {
		expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('msUntilNextMidnight', () => {
	it('returns the ms left until the next local midnight', () => {
		// 23:00:00.000 → 1 hour to midnight.
		expect(msUntilNextMidnight(new Date(2026, 0, 5, 23, 0, 0, 0))).toBe(60 * 60 * 1000);
		// 12:00:00.000 → 12 hours to midnight.
		expect(msUntilNextMidnight(new Date(2026, 0, 5, 12, 0, 0, 0))).toBe(12 * 60 * 60 * 1000);
	});
	it('counts a full day from exactly midnight (never zero)', () => {
		expect(msUntilNextMidnight(new Date(2026, 0, 5, 0, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
	});
	it('accounts for sub-second time so the timer lands on the day boundary', () => {
		// 23:59:59.500 → half a second left.
		expect(msUntilNextMidnight(new Date(2026, 0, 5, 23, 59, 59, 500))).toBe(500);
	});
});

describe('addDays', () => {
	it('crosses month and year boundaries', () => {
		expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});
});

describe('resolveQuickOption', () => {
	it('maps the three quick options', () => {
		expect(resolveQuickOption('today', '2026-07-16')).toBe('2026-07-16');
		expect(resolveQuickOption('tomorrow', '2026-07-16')).toBe('2026-07-17');
		expect(resolveQuickOption('next-week', '2026-07-16')).toBe('2026-07-23');
	});
});

describe('badgeLabel', () => {
	it('uses relative words for today and tomorrow', () => {
		expect(badgeLabel('2026-07-16', '2026-07-16')).toBe('hoy');
		expect(badgeLabel('2026-07-17', '2026-07-16')).toBe('mañana');
	});
	it('shows day and short month within the current year', () => {
		expect(badgeLabel('2026-07-22', '2026-07-16')).toMatch(/22.*jul/i);
		expect(badgeLabel('2026-07-22', '2026-07-16')).not.toMatch(/2026/);
	});
	it('adds the year when it differs', () => {
		expect(badgeLabel('2027-07-22', '2026-07-16')).toMatch(/2027/);
	});
});

describe('exportLabel / dateSuffix', () => {
	it('formats DD/MM/YYYY', () => {
		expect(exportLabel('2026-07-22')).toBe('22/07/2026');
	});
	it('builds the export suffix only for dated blocks', () => {
		expect(dateSuffix({ dueDate: '2026-07-22' })).toBe(' — 📅 22/07/2026');
		expect(dateSuffix({})).toBe('');
		expect(dateSuffix({ dueDate: 'nope' })).toBe('');
	});
});

describe('isOverdue', () => {
	it('flags past dates', () => {
		expect(isOverdue({ type: 'text', dueDate: '2026-07-10' }, '2026-07-16')).toBe(true);
		expect(isOverdue({ type: 'text', dueDate: '2026-07-16' }, '2026-07-16')).toBe(false);
	});
	it('a checked todo is never overdue', () => {
		expect(isOverdue({ type: 'todo', checked: true, dueDate: '2026-07-10' }, '2026-07-16')).toBe(false);
		expect(isOverdue({ type: 'todo', checked: false, dueDate: '2026-07-10' }, '2026-07-16')).toBe(true);
	});
});
