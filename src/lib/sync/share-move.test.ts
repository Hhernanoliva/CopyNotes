import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../storage/db';
import { createNote } from '../storage/notes';
import { createBlock } from '../storage/blocks';
import { getShareRole } from '../storage/shares';
import { grantUploadConsent, listPendingUploads, markUploadedThrough } from './pending';
import { shareNote, unshareNote } from './share-move';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

function fakeClient() {
	return { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
}

describe('la mudanza', () => {
	// El plan pedía `cloudSeq === undefined` DESPUÉS de compartir, y eso no puede
	// ser: la subida al caño nuevo pasa adentro de `shareNote` y anota lo que el
	// servidor aceptó. Lo que sí tiene que valer —y es lo que la base limpia
	// significa— es que esa subida se declare parada sobre nada.
	it('deja la nota marcada y sube al caño nuevo declarando base limpia', async () => {
		const note = await createNote({ title: 'una' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await db.table('notes').update(note.id, { cloudSeq: 5, fromCloud: true });
		const client = fakeClient();

		await shareNote(client, note.id);

		expect(await getShareRole(note.id)).toBe('owner');
		const [, args] = client.rpc.mock.calls.find(([name]) => name === 'push_shared_rows');
		expect(args.payload.length).toBe(2);
		expect(args.payload.every((row) => row.base_seq === null)).toBe(true);
	});

	it('borra del caño viejo COMO ÚLTIMO PASO', async () => {
		const note = await createNote({ title: 'una' });
		const client = fakeClient();

		await shareNote(client, note.id);

		const calls = client.rpc.mock.calls.map(([name]) => name);
		expect(calls[0]).toBe('open_share');
		expect(calls.at(-1)).toBe('delete_records');
	});

	it('al volver, las filas se vuelven a encontrar aunque la marca global ya las haya pasado', async () => {
		await grantUploadConsent();
		const note = await createNote({ title: 'una' });
		await createBlock({ noteId: note.id, content: 'texto' });
		await shareNote(fakeClient(), note.id);
		// El aparato siguió trabajando y subiendo: la marca "subido hasta acá"
		// quedó por encima de los sellos que la nota tenía al compartirse. Es el
		// caso que falla si la vuelta sólo reinicia `cloudSeq`. La marca sale de un
		// sello REAL y no de un número inventado a futuro: `markUploadedThrough`
		// nunca recibe otra cosa, y con uno inventado ni siquiera el resello la
		// alcanzaría.
		const otra = await createNote({ title: 'otra' });
		await markUploadedThrough((await db.table('notes').get(otra.id)).changeSeq);

		await unshareNote(fakeClient(), note.id);

		const pending = await listPendingUploads();
		expect(pending.some((entry) => entry.row.id === note.id)).toBe(true);
	});
});

// Spec 041 §8, criterio 16: verificado acá, en el almacenamiento, no sólo en
// el diálogo — el diálogo es la cortesía y esto es la guardia.
describe('spec 041: una nota con imágenes no se comparte', () => {
	it('rechaza ANTES de llamar al servidor, con el mismo mensaje que el diálogo', async () => {
		const note = await createNote({ title: 'con captura' });
		await createBlock({ noteId: note.id, type: 'image', content: 'error 500', imageId: 'a'.repeat(64) });
		const client = fakeClient();

		await expect(shareNote(client, note.id)).rejects.toThrow(
			'No se pueden compartir notas con imágenes todavía.'
		);
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it('una imagen ya borrada no frena: sólo cuentan las vivas', async () => {
		const note = await createNote({ title: 'con captura borrada' });
		const block = await createBlock({
			noteId: note.id,
			type: 'image',
			content: 'error 500',
			imageId: 'a'.repeat(64)
		});
		await db.table('blocks').update(block.id, { deletedAt: new Date().toISOString() });
		const client = fakeClient();

		await expect(shareNote(client, note.id)).resolves.toBeUndefined();
	});
});
