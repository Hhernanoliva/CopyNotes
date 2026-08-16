import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, checkPeriodically, watchForNewVersion } from './web-update';

// Un doble de `navigator.serviceWorker`: lo único que se le pide es avisar cuando
// cambia quién manda, y decir si ya había alguien mandando.
function fakeContainer({ controller = null } = {}) {
	const target = new EventTarget();
	// Con dos parámetros nombrados y no `...args`: `svelte-check` no acepta un spread
	// contra una firma sobrecargada, y ya son cuatro los errores preexistentes.
	return {
		controller,
		addEventListener: (type, listener) => target.addEventListener(type, listener),
		removeEventListener: (type, listener) => target.removeEventListener(type, listener),
		takeControl: () => target.dispatchEvent(new Event('controllerchange'))
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe('cuándo ofrecer la versión nueva', () => {
	it('ofrece cuando el service worker nuevo toma el control de una pestaña que ya tenía uno', () => {
		const container = fakeContainer({ controller: {} });
		const offer = vi.fn();
		watchForNewVersion(container, offer);

		container.takeControl();

		expect(offer).toHaveBeenCalledTimes(1);
	});

	// La primera visita: no había service worker, el que se registra toma la página, y
	// eso NO es una versión nueva. Ofrecer ahí sería pedirle a alguien que actualice a
	// lo que acaba de abrir.
	it('no ofrece nada en la primera visita, cuando no había ninguno antes', () => {
		const container = fakeContainer({ controller: null });
		const offer = vi.fn();
		watchForNewVersion(container, offer);

		container.takeControl();

		expect(offer).not.toHaveBeenCalled();
	});

	it('ofrece una sola vez, no un cartelito por aviso', () => {
		const container = fakeContainer({ controller: {} });
		const offer = vi.fn();
		watchForNewVersion(container, offer);

		container.takeControl();
		container.takeControl();

		expect(offer).toHaveBeenCalledTimes(1);
	});

	it('deja de escuchar cuando se lo desmonta', () => {
		const container = fakeContainer({ controller: {} });
		const offer = vi.fn();
		const stop = watchForNewVersion(container, offer);

		stop();
		container.takeControl();

		expect(offer).not.toHaveBeenCalled();
	});

	it('sin service worker en el navegador no explota', () => {
		expect(() => watchForNewVersion(undefined, () => {})()).not.toThrow();
	});
});

describe('preguntar cada tanto si hay versión nueva', () => {
	it('pregunta una vez por hora mientras la app está abierta', async () => {
		vi.useFakeTimers();
		const registration = { update: vi.fn(() => Promise.resolve()) };
		checkPeriodically(registration);

		await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);

		expect(registration.update).toHaveBeenCalledTimes(3);
	});

	it('un fallo de red no corta las preguntas siguientes', async () => {
		vi.useFakeTimers();
		const registration = { update: vi.fn(() => Promise.reject(new Error('sin internet'))) };
		checkPeriodically(registration);

		await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 2);

		expect(registration.update).toHaveBeenCalledTimes(2);
	});

	it('el cleanup corta las preguntas', async () => {
		vi.useFakeTimers();
		const registration = { update: vi.fn(() => Promise.resolve()) };
		const stop = checkPeriodically(registration);

		stop();
		await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 5);

		expect(registration.update).not.toHaveBeenCalled();
	});
});
