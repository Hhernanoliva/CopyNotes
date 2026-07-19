import { describe, expect, it } from 'vitest';
import {
	registerPendingWriteFlusher,
	settlePendingWrites,
	trackPendingWrite
} from './pending-writes';

describe('pending write barrier', () => {
	it('runs flushers and waits for writes they start', async () => {
		let release = () => {};
		let finished = false;
		const unregister = registerPendingWriteFlusher(() => {
			trackPendingWrite(
				new Promise((resolve) => {
					release = () => {
						finished = true;
						resolve();
					};
				})
			);
		});

		const settling = settlePendingWrites();
		await Promise.resolve();
		expect(finished).toBe(false);
		release();
		await settling;

		expect(finished).toBe(true);
		unregister();
	});

	it('keeps waiting when a tracked write starts another write', async () => {
		let releaseFirst = () => {};
		let releaseSecond = () => {};
		let secondFinished = false;
		trackPendingWrite(
			new Promise((resolve) => {
				releaseFirst = () => {
					trackPendingWrite(
						new Promise((finish) => {
							releaseSecond = () => {
								secondFinished = true;
								finish();
							};
						})
					);
					resolve();
				};
			})
		);

		const settling = settlePendingWrites();
		releaseFirst();
		await Promise.resolve();
		expect(secondFinished).toBe(false);
		releaseSecond();
		await settling;

		expect(secondFinished).toBe(true);
	});

	it('rejects when a tracked write cannot save', async () => {
		let fail = () => {};
		trackPendingWrite(
			new Promise((resolve, reject) => {
				fail = () => reject(new Error('save failed'));
			})
		);

		const settling = settlePendingWrites();
		fail();
		await expect(settling).rejects.toThrow('save failed');
	});
});
