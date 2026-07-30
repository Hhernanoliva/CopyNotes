// The live channel (spec 030 phase 3). Two things are worth a test here, and
// both are about money and privacy rather than about features:
//
// - nothing is ever sent while nobody is listening (Supabase bills realtime by
//   the message, so "send always" is the difference between a US$25 project and
//   a US$1.250 one at scale), and
// - what is sent carries no note content.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const channelSpy = vi.hoisted(() => ({
	name: null,
	options: null,
	sent: [],
	handlers: {},
	tracked: false,
	unsubscribed: false,
	presence: {}
}));

vi.mock('./supabase', () => ({
	cloudConfigured: () => true,
	supabase: () => ({
		realtime: { setAuth: async () => {} },
		channel: (name, config) => {
			channelSpy.name = name;
			channelSpy.options = config;
			const channel = {
				on: (type, filter, handler) => {
					channelSpy.handlers[`${type}:${filter.event}`] = handler;
					return channel;
				},
				subscribe: (callback) => {
					callback('SUBSCRIBED');
					return channel;
				},
				track: () => {
					channelSpy.tracked = true;
				},
				presenceState: () => channelSpy.presence,
				send: (message) => channelSpy.sent.push(message),
				unsubscribe: () => {
					channelSpy.unsubscribed = true;
				}
			};
			return channel;
		}
	})
}));

const { startLiveChannel, nudgePeers } = await import('./live');
const { syncStatus } = await import('./status.svelte');

beforeEach(() => {
	channelSpy.name = null;
	channelSpy.options = null;
	channelSpy.sent = [];
	channelSpy.handlers = {};
	channelSpy.presence = {};
	channelSpy.tracked = false;
	channelSpy.unsubscribed = false;
	syncStatus.peers = 0;
});

describe('the channel', () => {
	it('is private and scoped to the account, not shared by everyone', async () => {
		const stop = startLiveChannel({ userId: 'cuenta-1', onNudge: () => {} });

		expect(channelSpy.name).toBe('cuenta:cuenta-1');
		expect(channelSpy.options.config.private).toBe(true);
		// Joining waits for the session token to reach the socket, so this lands a
		// microtask later.
		await vi.waitFor(() => expect(channelSpy.tracked).toBe(true));
		stop();
		expect(channelSpy.unsubscribed).toBe(true);
	});

	it('does not open at all without a session', () => {
		startLiveChannel({ userId: null, onNudge: () => {} });

		expect(channelSpy.name).toBe(null);
	});
});

describe('the cost rule', () => {
	it('sends nothing while this is the only device connected', () => {
		startLiveChannel({ userId: 'cuenta-1', onNudge: () => {} });
		// Presence reports only this device.
		channelSpy.handlers['presence:sync']();

		expect(syncStatus.peers).toBe(0);
		expect(nudgePeers()).toBe(false);
		expect(channelSpy.sent).toEqual([]);
	});

	it('sends one empty message, and only once another device is there', () => {
		startLiveChannel({ userId: 'cuenta-1', onNudge: () => {} });
		channelSpy.presence = { 'otro-dispositivo': [{ at: 1 }] };
		channelSpy.handlers['presence:sync']();

		expect(syncStatus.peers).toBe(1);
		expect(nudgePeers()).toBe(true);
		expect(channelSpy.sent).toHaveLength(1);
		// "Come and look" — the looking is the encrypted download path.
		expect(channelSpy.sent[0].payload).toEqual({});
	});

	it('stops counting peers once the channel closes', () => {
		const stop = startLiveChannel({ userId: 'cuenta-1', onNudge: () => {} });
		channelSpy.presence = { 'otro-dispositivo': [{ at: 1 }] };
		channelSpy.handlers['presence:sync']();

		stop();

		expect(syncStatus.peers).toBe(0);
		expect(nudgePeers()).toBe(false);
	});
});

describe('being nudged', () => {
	it('asks the app to sync, without the message saying anything about notes', () => {
		const nudges = [];
		startLiveChannel({ userId: 'cuenta-1', onNudge: () => nudges.push(Date.now()) });

		channelSpy.handlers['broadcast:cambios']({ payload: {} });

		expect(nudges).toHaveLength(1);
	});
});
