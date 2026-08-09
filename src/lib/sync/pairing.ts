// Pasar la llave de un aparato a otro (spec 035).
//
// El aparato que ya tiene la bóveda muestra ocho caracteres; el nuevo los
// escribe. Entre medio, la llave viaja envuelta con ese código por una fila del
// servidor que vive diez minutos y se borra al usarse. El servidor nunca puede
// abrirla: lo único que la abre es lo que hay en la pantalla del otro aparato.
//
// La criptografía vive en `vault.ts`, que no sabe de red. Acá está el viaje, que
// no sabe de criptografía.

import { supabase } from './supabase';
import { makePairingBlob, normalizePairingCode, openPairingBlob } from './vault';

function client() {
	const supa = supabase();
	if (!supa) throw new Error('Esta copia de CopyNotes no tiene nube configurada.');
	return supa;
}

async function ownerId(supa) {
	const { data } = await supa.auth.getSession();
	const id = data.session?.user?.id;
	if (!id) throw new Error('Hace falta entrar a tu cuenta antes de sumar un aparato.');
	return id;
}

export async function startPairing() {
	const supa = client();
	await ownerId(supa);
	const { code, expiresAt, blob } = await makePairingBlob();
	// Por una función del servidor y no con un insert, porque pisar la fila
	// anterior no se puede hacer desde acá: si venció, la política de lectura la
	// esconde, y Postgres necesita leer una fila para borrarla. Pedir un código y
	// no usarlo dejaba trabado el pedido siguiente para siempre — encontrado con
	// `pnpm rls:check`, explicado en supabase/schema.sql.
	const { error } = await supa.rpc('start_pairing', {
		p_salt: blob.salt,
		p_iv: blob.iv,
		p_wrapped: blob.wrapped,
		p_expires_at: expiresAt
	});
	if (error) throw new Error(error.message);
	return { code, expiresAt };
}

export async function joinWithPairingCode(code) {
	// Antes que nada y sin red: un código de largo imposible no es un viaje.
	normalizePairingCode(code);
	const supa = client();
	const owner = await ownerId(supa);
	const { data, error } = await supa.from('pairings').select('salt, iv, wrapped').maybeSingle();
	if (error) throw new Error(error.message);
	// El servidor esconde la fila vencida, así que "no hay nada" y "venció" son lo
	// mismo visto desde acá — y es lo que hay que decir, porque manda a la persona
	// a pedir otro código en vez de a revisar cómo lo escribió.
	if (!data) {
		throw new Error('El código venció. Pedí uno nuevo en el aparato donde ya tenés las notas.');
	}
	let key;
	try {
		key = await openPairingBlob(code, data);
	} catch {
		// AES-GCM abre o no abre. Un fallo acá es el código, no la red, y la fila se
		// queda arriba para que se pueda reintentar sin volver a pedir nada.
		throw new Error('Ese código no es el que muestra el otro aparato.');
	}
	// Usada una vez. La ventana en la que la llave existe fuera de un aparato dura
	// lo que dura el viaje, no los diez minutos completos.
	await supa.from('pairings').delete().eq('owner_id', owner);
	return key;
}
