// Dos pestañas de CopyNotes sobre los mismos datos (#8 de la revisión del 5/8).
//
// Cada pestaña tiene su propia copia de la nota en memoria y comparten un solo
// IndexedDB. Sin esto, la segunda no se enteraba NUNCA de lo que escribía la
// primera —ni con el tiempo ni al volver a ella— y escribir sobre esa copia
// vieja pisaba el renglón del otro lado sin un solo aviso.
//
// `BroadcastChannel` es el intercomunicador que traen los navegadores: mismo
// sitio, otras pestañas. No hace falta instalar nada y no sale al exterior.
//
// Dos propiedades que hacen que esto no pueda entrar en bucle:
//
//  1. El canal NO le entrega el mensaje a quien lo mandó, así que la pestaña que
//     escribió no se refresca a sí misma.
//  2. Recibir dispara una LECTURA, nunca una escritura. Una pestaña que se
//     refresca no anuncia nada, así que no hay pelota que rebote.

const CHANNEL_NAME = 'copynotes-writes';

// Los ganchos de Dexie avisan renglón por renglón, así que importar un respaldo
// dispararía miles de mensajes. Se junta todo en uno solo al final.
//
// El retraso hace además de colchón: los ganchos corren DURANTE la transacción,
// o sea antes de que lo escrito esté realmente disponible para el que lee. Con
// el aviso demorado, la transacción ya cerró cuando la otra pestaña va a leer.
// Si alguna vez llegara a leer demasiado pronto, el daño es una lectura vieja
// que el próximo aviso corrige — nunca un dato mal escrito.
const COALESCE_MS = 150;

let channel;
let timer = null;

// Se crea al primer uso y no al importar: el módulo también se carga al
// prerenderizar la página, donde no hay navegador ni `BroadcastChannel`.
function bus() {
	if (channel === undefined) {
		channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
	}
	return channel;
}

// "Escribí algo." La llaman los ganchos de Dexie, que son la única puerta por la
// que pasan TODAS las escrituras de las tablas que se sincronizan — poner el
// aviso en cada repositorio dejaría sin avisar al próximo que alguien agregue.
export function announceLocalWrite() {
	if (!bus()) return;
	if (timer !== null) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		bus()?.postMessage('write');
	}, COALESCE_MS);
}

// Escuchar a las otras pestañas. Devuelve la función para dejar de escuchar.
export function onOtherTabWrite(handler) {
	const target = bus();
	if (!target) return () => {};
	const listener = () => handler();
	target.addEventListener('message', listener);
	return () => target.removeEventListener('message', listener);
}
