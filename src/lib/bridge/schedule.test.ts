import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExportScheduler } from './schedule';

afterEach(() => {
	vi.useRealTimers();
});

describe('createExportScheduler', () => {
	it('collapses a burst of schedules into one trailing write', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		vi.advanceTimersByTime(200);
		scheduler.schedule();
		vi.advanceTimersByTime(200);
		scheduler.schedule();
		expect(write).not.toHaveBeenCalled();
		vi.advanceTimersByTime(500);
		expect(write).toHaveBeenCalledTimes(1);
	});

	it('cancel drops the pending write', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		scheduler.cancel();
		vi.advanceTimersByTime(1000);
		expect(write).not.toHaveBeenCalled();
	});

	it('schedules again after a fired write (the last bump always exports)', () => {
		vi.useFakeTimers();
		const write = vi.fn();
		const scheduler = createExportScheduler(write, 500);
		scheduler.schedule();
		vi.advanceTimersByTime(500);
		scheduler.schedule();
		vi.advanceTimersByTime(500);
		expect(write).toHaveBeenCalledTimes(2);
	});
});
