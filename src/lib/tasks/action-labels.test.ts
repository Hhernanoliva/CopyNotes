import { describe, it, expect } from 'vitest';
import { ACTION_LABEL, ACTION_LABEL_USER, actionLabel } from './action-labels';

describe('actionLabel', () => {
	// Los dos mapas son cerrados y se separan solos: el que se olvide muestra el
	// nombre crudo de la acción en pantalla.
	it('los dos mapas cubren exactamente las mismas acciones', () => {
		expect(Object.keys(ACTION_LABEL).sort()).toEqual(Object.keys(ACTION_LABEL_USER).sort());
	});

	it('en tu nota, lo tuyo va en primera persona', () => {
		expect(actionLabel({ actor: 'user', action: 'done' }, { role: 'owner', myActor: null })).toBe(
			'marcaste hecha'
		);
	});

	// La razón entera por la que el mapa se elige con `isMine`: la misma línea
	// `actor: 'user'`, mirada desde el aparato del invitado, la escribió el dueño.
	it('en la nota de otro, lo del dueño va en tercera', () => {
		expect(
			actionLabel({ actor: 'user', action: 'done' }, { role: 'member', myActor: 'member:u-2' })
		).toBe('marcó hecha');
	});

	it('y tu propia firma de miembro vuelve a la primera', () => {
		expect(
			actionLabel(
				{ actor: 'member:u-2', action: 'done' },
				{ role: 'member', myActor: 'member:u-2' }
			)
		).toBe('marcaste hecha');
	});

	// Lo que pasa hoy con una acción que no está en el mapa, escrito para que se
	// vea por qué la primera prueba existe.
	it('una acción desconocida se muestra cruda', () => {
		expect(actionLabel({ actor: 'user', action: 'inventada' }, { role: null, myActor: null })).toBe(
			'inventada'
		);
	});
});

// La quinta acción (spec 038 §8). Entra en los DOS mapas o el que falte muestra
// la palabra `listo` cruda en pantalla — que es justo lo que la primera prueba
// de arriba vigila.
describe('la quinta acción', () => {
	it('tiene palabra en los dos mapas', () => {
		expect(
			actionLabel({ actor: 'member:u-1', action: 'listo' }, { role: 'owner', myActor: null })
		).toBe('marcó Listo');
		expect(actionLabel({ actor: 'user', action: 'listo' }, { role: 'owner', myActor: null })).toBe(
			'marcaste Listo'
		);
	});
});
