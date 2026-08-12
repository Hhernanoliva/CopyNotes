import { describeUpdate } from './update-check';

// Lo que sabemos sobre versiones, en un solo lugar. Lo llena `checkForUpdate()`
// al arrancar (TauriLifecycle) y lo leen dos cosas: el punto del engranaje en el
// header y la sección de Configuración.
//
// Arranca en 'sin-respuesta' a propósito: hasta que el chequeo conteste no
// sabemos nada, y no saber se parece más a "no pude preguntar" que a "estás al
// día". La diferencia importa porque 'al-dia' es lo único que afirma algo.
export const updateStatus = $state({
	state: 'sin-respuesta',
	current: '',
	latest: '',
	notes: []
});

// Corre UNA vez por arranque. Nunca instala nada: `check()` solo lee el
// latest.json publicado. Ver la restricción global sobre downloadAndInstall.
// Nada de acá adentro puede rechazar: el llamador la dispara sin `await` ni
// `catch`, así que una promesa rota se volvería un error suelto en la consola.
// Por eso `getVersion()` también va dentro del try — si eso fallara, `current`
// se queda vacío y la pantalla muestra "Buscando…", que es su estado neutro.
export async function checkForUpdate() {
	let current = '';
	try {
		const { getVersion } = await import('@tauri-apps/api/app');
		current = await getVersion();
		const { check } = await import('@tauri-apps/plugin-updater');
		Object.assign(updateStatus, describeUpdate({ current, update: await check() }));
	} catch (error) {
		// En `tauri dev` no hay paquete publicado y esto siempre falla; sin
		// internet, también. Ninguno de los dos es un problema del usuario, así
		// que se registra en info y la pantalla no muestra nada rojo.
		console.info('No se pudo consultar si hay una versión nueva', error);
		Object.assign(updateStatus, describeUpdate({ current, update: null, failed: true }));
	}
}
