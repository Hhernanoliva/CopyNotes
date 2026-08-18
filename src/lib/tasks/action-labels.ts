// Las palabras de la bitácora. Dos mapas y no uno porque en castellano la
// primera persona conjuga distinto: "Vos marcó hecha" no se puede leer.
//
// Son mapas CERRADOS: una acción que no está renderiza su propio nombre crudo en
// pantalla, así que agregar una acción es agregarla acá dos veces.
//
// Viven en un módulo propio y no adentro del `<script>` de `SettingsDialog`
// porque ahí no se pueden probar, y lo que las ata —que los dos mapas cubran las
// mismas acciones— sólo se comprueba con una prueba.

import { isMine } from '$lib/storage/share-names';

export const ACTION_LABEL = {
	created: 'creó una tarea',
	done: 'marcó hecha',
	reopened: 'reabrió',
	note: 'dejó una nota',
	listo: 'marcó Listo'
};

export const ACTION_LABEL_USER = {
	created: 'creaste una tarea',
	done: 'marcaste hecha',
	reopened: 'reabriste',
	note: 'dejaste una nota',
	listo: 'marcaste Listo'
};

// `ctx` es el mismo que el de `actorName`: el rol de este aparato en esa nota y
// mi firma de miembro. Elige el mapa con `isMine` y no con `actor === 'user'`
// porque en la nota de otro "marcó hecha" del dueño no es "marcaste hecha".
export function actionLabel(entry, ctx) {
	const labels = isMine(entry.actor, ctx) ? ACTION_LABEL_USER : ACTION_LABEL;
	return labels[entry.action] ?? entry.action;
}
