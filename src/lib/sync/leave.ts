// Cerrar sesión: the one door out of an account (spec 030).
//
// It used to be `signOut()` alone, which only forgets *who* you are. Everything
// that describes the relationship with that account stayed behind — the vault
// key, the upload consent, both cursors, and each row's note about which version
// the server holds. Signing into a different account then inherited all of it:
// it uploaded without ever asking again, and it read the new server starting at
// the old one's cursor, skipping everything before it in silence.
//
// The notes themselves stay. That is the whole point of leaving the cloud rather
// than leaving CopyNotes, and it is why this file never touches a synced table's
// contents — only the bookkeeping stapled to it.

import { db, SYNCED_TABLES } from '../storage/db';
import { setSetting } from '../storage/settings';
import { KEY } from '../storage/settings-registry';
import { signOut } from './supabase';
import { forgetSentVaultBlob } from './upload';

export async function forgetCloudAccount() {
	// Consent first, deliberately. It is the gate `pending.ts` checks before it
	// will hand any record to an uploader, so shutting it is the one step that
	// must survive anything below going wrong — a half-finished sign-out has to
	// fail closed.
	await setSetting(KEY.syncConsent, false);
	await setSetting(KEY.syncUploadedThrough, 0);
	await setSetting(KEY.syncDownloadedThrough, 0);

	// The key. Dropping it is what makes this device need the recovery code to
	// come back, and it is also what stops the next account from being handed the
	// previous account's key to encrypt with.
	await db.table('vault').clear();
	// A decision about two versions of a record, on an account nobody is in.
	await db.table('conflicts').clear();
	forgetSentVaultBlob();

	// Each row remembers the version the old server held. Left behind, a row
	// whose remembered version still matches its counter looks like it is already
	// uploaded, and would never travel to the new account.
	//
	// `fromCloud` rides along so the change counter does not move: this is
	// bookkeeping about the cloud, not an edit, and a sign-out must not make every
	// note on the device look freshly written.
	for (const name of SYNCED_TABLES) {
		await db
			.table(name)
			.toCollection()
			.modify({ cloudSeq: undefined, fromCloud: true });
	}

	await signOut();
}
