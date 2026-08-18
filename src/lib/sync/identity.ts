// Con qué firma escribe este aparato en una nota que le comparten (spec 038 §6).
//
// Es la MISMA firma que el servidor le va a poner igual: `push_shared_rows` pisa
// `actor` con `'member:' || auth.uid()` en cada fila que escribe alguien que no
// es el dueño (`supabase/schema.sql`). Escribirla desde acá no es confiar en el
// cliente —el servidor la pisa aunque coincida—, es que la línea se lea bien en
// ESTA pantalla desde el segundo cero.
//
// La alternativa era escribir `'user'` y dejar que el servidor la corrigiera, y
// tiene dos costos: la propia línea del invitado le cambiaría de nombre sola
// treinta segundos después, y esa corrección bajaría como una fila distinta, o
// sea contaría como una novedad y despertaría la pantalla para nada.

import { supabase } from './supabase';

export async function myMemberActor() {
	const client = supabase();
	if (!client) return null;
	const { data } = await client.auth.getSession();
	const id = data?.session?.user?.id;
	return id ? `member:${id}` : null;
}
