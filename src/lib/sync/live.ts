// "Que aparezca en el otro dispositivo en segundos" (spec 030 phase 3).
//
// Two jobs, one websocket per account:
//
// - **Presence** — who else is connected right now. It is the switch for
//   everything below.
// - **Broadcast** — one empty "hay novedades" message after an upload, so the
//   other device downloads immediately instead of waiting out the 30-second
//   clock.
//
// **The cost rule lives here.** Supabase bills realtime by the message
// (US$2,50 per million, 5 M included in Pro). Sending one per changed record, or
// sending at all while nobody is listening, is what would turn a US$25 project
// into a US$1.250 one at scale. So: nothing is ever sent unless presence says a
// second device is actually connected, and what gets sent is ONE message per
// upload batch, not one per record.
//
// The message carries no payload. It says "come and look", and the looking goes
// through the same encrypted download path as everything else — the channel
// never sees a word of a note.

import { supabase } from './supabase';
import { syncStatus } from './status.svelte';

const EVENT = 'cambios';

let channel = null;
let deviceId = null;

// Per browser session, not per device: two tabs of the same browser count as two
// peers. Harmless — the second one downloads and finds nothing new — and it is
// what makes a second window a real test of the whole path.
function thisDevice() {
	deviceId ??= crypto.randomUUID();
	return deviceId;
}

function countPeers() {
	const state = channel?.presenceState() ?? {};
	// Everyone on the channel except this device.
	return Object.keys(state).filter((key) => key !== thisDevice()).length;
}

// Opens the channel for one account. Returns a cleanup that closes it, so a
// sign-out or an unmount never leaves a socket (or a peer count) behind.
export function startLiveChannel({ userId, onNudge }) {
	const client = supabase();
	if (!client || !userId) return () => {};

	channel = client.channel(`cuenta:${userId}`, {
		config: {
			// Private: the server checks an RLS policy on realtime.messages before
			// letting anyone into this topic (see supabase/schema.sql). Without it,
			// any signed-up user who guessed an account id could watch when that
			// person is online and editing.
			private: true,
			presence: { key: thisDevice() }
		}
	});

	channel
		.on('presence', { event: 'sync' }, () => {
			syncStatus.peers = countPeers();
		})
		.on('broadcast', { event: EVENT }, () => onNudge?.());

	// A private topic is checked against the policy above using the session
	// token, and the realtime socket only learns that token when it is handed
	// over. Subscribing before this resolves gets the join rejected.
	syncStatus.live = 'conectando';
	Promise.resolve(client.realtime.setAuth())
		.then(() => {
			channel?.subscribe((status, error) => {
				if (status === 'SUBSCRIBED') {
					syncStatus.live = 'listo';
					channel.track({ at: Date.now() });
					return;
				}
				// CHANNEL_ERROR / TIMED_OUT / CLOSED. Worth surfacing rather than
				// swallowing: when the channel is down everything still works, just
				// at the slow pace, and a silent slowdown is impossible to diagnose.
				syncStatus.live = error?.message ?? String(status).toLowerCase();
			});
		})
		.catch((error) => {
			syncStatus.live = error?.message ?? 'sin autorización';
			console.error('No se pudo autorizar el canal de la nube', error);
		});

	return () => {
		syncStatus.peers = 0;
		syncStatus.live = 'apagado';
		channel?.unsubscribe();
		channel = null;
	};
}

// Tell the other device to come and look. Silent when nobody is there, which is
// the whole cost story.
export function nudgePeers() {
	if (!channel || syncStatus.peers === 0) return false;
	channel.send({ type: 'broadcast', event: EVENT, payload: {} });
	return true;
}
