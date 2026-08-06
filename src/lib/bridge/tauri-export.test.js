// El archivo que el agente LEE. Si no se puede reemplazar, el anterior se queda
// en el disco y el agente lo sigue leyendo — y cuando lo que se acaba de apretar
// es "Pausar agentes", eso es un interruptor de privacidad que no se cumplió.
// Hasta ahora ese fallo moría en una línea de consola que nadie mira.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/platform', () => ({ isTauriRuntime: () => true }));

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
// El contenido no es lo que se prueba acá; lo cubre export.test.ts.
vi.mock('./export', () => ({ buildAgentExport: async () => ({ notes: [], tasks: [] }) }));

import { writeAgentExport } from './tauri';
import { agentData } from './signal.svelte';

beforeEach(() => {
	invoke.mockReset();
	agentData.exportFailed = false;
});

describe('cuando no se puede escribir el archivo que lee el agente', () => {
	it('lo deja anotado para que la pantalla pueda decirlo', async () => {
		invoke.mockRejectedValue(new Error('disco lleno'));

		await expect(writeAgentExport()).rejects.toThrow('disco lleno');

		expect(agentData.exportFailed).toBe(true);
	});

	it('lo borra apenas una escritura vuelve a salir bien', async () => {
		invoke.mockRejectedValueOnce(new Error('disco lleno'));
		await writeAgentExport().catch(() => {});
		expect(agentData.exportFailed).toBe(true);

		invoke.mockResolvedValue(undefined);
		await writeAgentExport();

		expect(agentData.exportFailed).toBe(false);
	});
});
