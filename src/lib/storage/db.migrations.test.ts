import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { plainTextToHtml } from '$lib/format';
import { db } from './db';

// These tests guard the real Dexie upgrade chain (db.ts, versions 1→5) against
// silent data loss. A user's browser only runs these upgrades once, on an old
// database — the rest of the suite starts fresh at the latest version and never
// exercises them. Here we build a legacy v1 database, populate it with
// old-shaped rows, then open the real `db` so Dexie runs every upgrade in order
// and we can assert the migrated result.
//
// v3 recomputes plain text with `htmlToPlainText`, which needs a DOM, so this
// file runs under the jsdom project (see vite.config.ts).

const V1_STORES = {
	notes: 'id, updatedAt',
	blocks: 'id, noteId, parentBlockId',
	snippets: 'id, updatedAt',
	tags: 'id, name',
	tagAssignments: 'id, tagId, [targetType+targetId]',
	settings: 'key'
};

// Create the database at the original v1 schema, insert legacy rows, close it.
async function seedLegacyV1(rows) {
	const legacy = new Dexie('copynotes');
	legacy.version(1).stores(V1_STORES);
	await legacy.open();
	await legacy.transaction('rw', legacy.tables, async () => {
		for (const [table, records] of Object.entries(rows)) {
			if (records.length) await legacy.table(table).bulkAdd(records);
		}
	});
	legacy.close();
}

// Open the real singleton, which declares v1..v5, so Dexie runs the upgrades.
async function migrate() {
	await db.open();
}

beforeEach(async () => {
	if (db.isOpen()) db.close();
	await Dexie.delete('copynotes');
});

describe('db migrations v1 → v5', () => {
	it('v2: backfills missing html from plain content, keeps existing html', async () => {
		await seedLegacyV1({
			blocks: [
				{ id: 'b1', noteId: 'n1', parentBlockId: null, content: 'hola <mundo> & "amigos"' },
				{ id: 'b2', noteId: 'n1', parentBlockId: null, content: 'ignored', html: '<b>ya tengo html</b>' }
			]
		});
		await migrate();

		const b1 = await db.table('blocks').get('b1');
		const b2 = await db.table('blocks').get('b2');
		// b1 had no html → derived from content, HTML-escaped so markup is inert.
		expect(b1.html).toBe(plainTextToHtml('hola <mundo> & "amigos"'));
		expect(b1.html).toBe('hola &lt;mundo&gt; &amp; &quot;amigos&quot;');
		// b2 already had html → left untouched.
		expect(b2.html).toBe('<b>ya tengo html</b>');
	});

	it('v3: recomputes content for blocks whose html carries a <br>', async () => {
		await seedLegacyV1({
			blocks: [
				// html already set (v2 skips it); stale content must be recomputed by v3.
				{ id: 'br1', noteId: 'n1', parentBlockId: null, content: 'STALE', html: 'línea1<br>línea2' },
				// no <br> → content must stay exactly as authored.
				{ id: 'br2', noteId: 'n1', parentBlockId: null, content: 'sin salto', html: 'sin salto' }
			]
		});
		await migrate();

		const br1 = await db.table('blocks').get('br1');
		const br2 = await db.table('blocks').get('br2');
		expect(br1.content).toBe('línea1\nlínea2');
		expect(br2.content).toBe('sin salto');
	});

	it('v4: indexes dueDate so dated blocks are queryable', async () => {
		await seedLegacyV1({
			blocks: [
				{ id: 'd1', noteId: 'n1', parentBlockId: null, content: 'con fecha', dueDate: '2026-08-01' },
				{ id: 'd2', noteId: 'n1', parentBlockId: null, content: 'sin fecha' }
			]
		});
		await migrate();

		const dated = await db.table('blocks').where('dueDate').equals('2026-08-01').toArray();
		expect(dated.map((b) => b.id)).toEqual(['d1']);
	});

	it('v5: creates folders table and assigns sortOrder + root folderId', async () => {
		await seedLegacyV1({
			notes: [
				{ id: 'nA', title: 'A', updatedAt: '2026-01-01', deletedAt: null },
				{ id: 'nB', title: 'B', updatedAt: '2026-03-01', deletedAt: null },
				{ id: 'nC', title: 'C', updatedAt: '2026-02-01', deletedAt: null },
				// soft-deleted: must be ordered AFTER every live note.
				{ id: 'nD', title: 'D', updatedAt: '2026-09-01', deletedAt: '2026-09-02' }
			],
			tags: [
				{ id: 't1', name: 'zeta', deletedAt: null },
				{ id: 't2', name: 'alfa', deletedAt: null }
			]
		});
		await migrate();

		// New table exists after the upgrade.
		expect(db.tables.map((t) => t.name)).toContain('folders');

		const notes = await db.table('notes').toArray();
		const order = Object.fromEntries(notes.map((n) => [n.id, n.sortOrder]));
		// Live notes ordered by updatedAt desc: B(0), C(1), A(2).
		expect(order.nB).toBe(0);
		expect(order.nC).toBe(1);
		expect(order.nA).toBe(2);
		// Deleted note sits after the live ones, never colliding with them.
		expect(order.nD).toBeGreaterThan(order.nA);
		// Every note lands at the root of the sidebar.
		expect(notes.every((n) => n.folderId === null)).toBe(true);

		// Tags ordered alphabetically: alfa(0) before zeta(1).
		const tags = await db.table('tags').toArray();
		const tagOrder = Object.fromEntries(tags.map((t) => [t.name, t.sortOrder]));
		expect(tagOrder.alfa).toBe(0);
		expect(tagOrder.zeta).toBe(1);
	});

	it('runs the whole chain in one open and reaches the current version', async () => {
		await seedLegacyV1({
			notes: [{ id: 'n1', title: 'Uno', updatedAt: '2026-01-01', deletedAt: null }],
			blocks: [{ id: 'b1', noteId: 'n1', parentBlockId: null, content: 'texto' }]
		});
		await migrate();

		// verno is Dexie's on-disk version number; v5 is the latest declared.
		expect(db.verno).toBe(5);
		const b1 = await db.table('blocks').get('b1');
		expect(b1.html).toBe('texto');
	});
});
