// Cuándo ofrecerle a alguien que use la versión nueva de la app web.
//
// Existe por lo que costó el 2026-08-16: se publicaron dos arreglos del selector de
// archivos, Hernán los probó en el iPhone y seguía roto — porque su teléfono seguía
// corriendo el código de antes. La app web se actualizaba "sola en la próxima visita"
// y **nunca avisaba**, así que una pestaña que no vuelve a cargar de verdad se queda
// vieja para siempre. Tres rondas de diagnóstico para descubrir que el bug ya estaba
// arreglado.
//
// Vive acá y no en `PwaLifecycle.svelte` para que se pueda probar: el proyecto no
// tiene pruebas de componentes a propósito (spec 013), así que la lógica sale del
// componente y él queda como un cable.

// Con `registerType: 'autoUpdate'` (vite.config.ts) el service worker nuevo NO espera:
// se activa y toma el control de la pestaña abierta en cuanto termina de bajar. Pero
// el JavaScript que la pestaña ya cargó sigue siendo el viejo hasta que la página
// arranque de nuevo. Ese momento —"cambió el que manda, pero yo sigo siendo el de
// antes"— es exactamente cuando hay que ofrecer el botón.
export function watchForNewVersion(container, offer) {
	if (!container) return () => {};
	// El PRIMER control no es una versión nueva: es la primera visita, cuando no había
	// ningún service worker y el que se acaba de registrar toma la página. Ofrecer ahí
	// sería pedirle a alguien que actualice a lo que acaba de abrir.
	const hadController = Boolean(container.controller);
	let offered = false;
	const handler = () => {
		if (!hadController || offered) return;
		offered = true;
		offer();
	};
	container.addEventListener('controllerchange', handler);
	return () => container.removeEventListener('controllerchange', handler);
}

// Una hora. La app se usa con la pestaña abierta todo el día, y la pregunta "¿hay
// versión nueva?" sólo se hacía al arrancar: sin esto, quien no cierra nunca la app no
// se entera de nada.
export const CHECK_EVERY_MS = 60 * 60 * 1000;

export function checkPeriodically(registration, everyMs = CHECK_EVERY_MS) {
	if (!registration?.update) return () => {};
	const id = setInterval(() => {
		// Un fallo de red acá no es nada: la próxima vuelta pregunta de nuevo.
		Promise.resolve(registration.update()).catch(() => {});
	}, everyMs);
	return () => clearInterval(id);
}
