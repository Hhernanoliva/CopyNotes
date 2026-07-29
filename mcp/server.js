// CopyNotes MCP server — stdio entry point.
//
// This is a standalone Node process (not part of the SvelteKit app). It
// speaks MCP over stdio to a client (Claude Desktop, OpenCode, ...) and
// relays to the CopyNotes desktop app through the buzón folder — see
// lib/mailbox.js.
//
// Resources (M2: exposing notes/tasks as MCP resources) are registered
// below. Tools (M3: change-request tools backed by submitChange) follow.
// The tools do NOT enforce privacy themselves — they just forward the
// change to the app via submitChange(); the app's ingest gate
// (src/lib/bridge/ingest.ts) is the sole authority and a rejection comes
// back as { ok:false, reason }, surfaced here as isError.

import { z } from 'zod';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readExport, submitChange, touchAgentStatus } from './lib/mailbox.js';
import { notesToResources, noteToMarkdown, withStaleNotice } from './lib/resources.js';
import { buildShortIds } from './lib/ids.js';
import {
	createTaskChange,
	completeTaskChange,
	addNoteChange,
	toolResult,
	createTaskResult,
	rejectionText,
	resolveNote,
	expandArgs,
	historyResult,
	listNotesResult,
	readNoteResult
} from './lib/tools.js';

const server = new McpServer({ name: 'copynotes', version: '0.1.0' });

// One resource per agent-visible note (copynotes://note/<id>). Each list/
// read re-reads the buzón export so resources reflect the app's live
// state — the SDK re-invokes these callbacks per request, nothing is
// cached here.
server.registerResource(
	'note',
	new ResourceTemplate('copynotes://note/{id}', {
		list: async () => ({ resources: notesToResources(await readExport()) })
	}),
	{
		title: 'Notas visibles para agentes',
		description: 'Cada nota visible para agentes, proyectada como Markdown: contexto + tareas pendientes con id corto.'
	},
	async (uri, variables) => {
		const id = variables.id;
		const exp = await readExport();
		const note = (exp.notes ?? []).find((n) => n.id === id);
		if (!note) return { contents: [] };
		return {
			contents: [
				{
					uri: uri.href,
					mimeType: 'text/markdown',
					text: withStaleNotice(noteToMarkdown(note, buildShortIds(exp)), exp)
				}
			]
		};
	}
);

// Change-request tools (M3). makeToolHandler builds a change object (pure —
// see lib/tools.js), hands it to submitChange() (writes the buzón inbox,
// waits for the app's outbox answer), and maps the result to a tool result
// with this tool's OWN accurate success message. The message is per-tool on
// purpose: create and complete both come back as { block, activity }, so it
// can't be inferred from the result shape without mislabelling a completion
// as a creation. The change shape must match the app's ingest allow-list
// exactly — see lib/tools.js's header comment for the mapping.
// Refresh the liveness heartbeat on every tool call so Settings can show how
// long ago an agent was active. Wraps submitChange without changing its result.
// build → expand short ids against the live export → submit → result. Agents
// reference tasks/notes by the short ids the Markdown projection shows them;
// the change submitted to the app always carries full UUIDs. The heartbeat is
// refreshed FIRST — even a call that gets rejected proves an agent is alive, so
// Settings' "un agente se conectó" must update regardless of the outcome.
const expandingHandler = (buildChange, okText) => async (args) => {
	await touchAgentStatus();
	const exp = await readExport();
	const expanded = expandArgs(exp, args);
	if (!expanded.ok) {
		return { content: [{ type: 'text', text: `Rechazado: ${expanded.reason}` }], isError: true };
	}
	return toolResult(await submitChange(buildChange(expanded.args)), okText);
};

// Tool descriptions and per-arg .describe() strings are written to GUIDE the
// model, not just to document: they name WHEN to reach for each tool and, for
// add_note vs complete_task's summary, draw the line the model kept missing
// ("leave a comment" → add_note, not the completion summary). Cheap — they ride
// in the schema that's sent anyway — and materially improve tool selection.
// create_task has its own handler (not expandingHandler) because it accepts a
// note NAME or short id (resolveNote), not only a short id, and because its
// success answer returns the NEW task's short id (createTaskResult) so the model
// can act on it without a re-read. An ambiguous name comes back with candidates.
server.registerTool(
	'create_task',
	{
		description:
			'Crear una tarea nueva (checkbox) dentro de una nota visible. Usala cuando el usuario pide agregar un pendiente o tarea a una nota. Devuelve el id corto de la tarea creada.',
		inputSchema: {
			noteId: z
				.string()
				.describe('Id corto o nombre de la nota (list_notes / read_note los muestran). El nombre puede ser parcial si es inequívoco.'),
			content: z.string().describe('Texto de la tarea.')
		}
	},
	async ({ noteId, content }) => {
		await touchAgentStatus();
		const exp = await readExport();
		const resolved = resolveNote(exp, noteId);
		if (!resolved.ok) {
			return {
				content: [{ type: 'text', text: rejectionText(resolved.reason, resolved.candidates) }],
				isError: true
			};
		}
		return createTaskResult(await submitChange(createTaskChange({ noteId: resolved.note.id, content })));
	}
);

server.registerTool(
	'complete_task',
	{
		description:
			'Marcar una tarea como hecha. Si tiene subtareas, se completan también. Deja una traza en la bitácora. NO es un comentario visible: para dejar una nota bajo la tarea usá add_note.',
		inputSchema: {
			blockId: z.string().describe('Id corto de la tarea a completar.'),
			summary: z
				.string()
				.optional()
				.describe('Cierre breve opcional para la bitácora. No aparece como comentario "IA".')
		}
	},
	expandingHandler(completeTaskChange, 'Tarea marcada como hecha.')
);

server.registerTool(
	'add_note',
	{
		description:
			'Dejar un comentario/aviso/anotación del agente en una tarea (ej: "ya terminé", "empecé por X", "encontré un problema", "lo dejé a medias"). Aparece bajo la tarea como nota "IA", visible para el usuario. Usala SIEMPRE que te pidan escribir, comentar, avisar o anotar algo sobre una tarea.',
		inputSchema: {
			blockId: z.string().describe('Id corto de la tarea donde dejar el comentario.'),
			text: z.string().describe('El comentario a mostrar bajo la tarea.')
		}
	},
	expandingHandler(addNoteChange, 'Nota agregada a la bitácora.')
);

// Discovery + read as tools so a natural prompt reaches a note without the user
// attaching a resource by hand (most clients don't feed resources to the model).
server.registerTool(
	'list_notes',
	{
		description:
			'Listar las notas visibles para agentes (nombre + id corto de cada una). Usala SOLO para descubrir qué notas hay o para desambiguar un nombre. Si el usuario ya te dio un nombre de nota, NO la uses: llamá directo a read_note (o create_task), que ya resuelven por nombre.',
		inputSchema: {}
	},
	async () => {
		await touchAgentStatus();
		return listNotesResult(await readExport());
	}
);

server.registerTool(
	'read_note',
	{
		description:
			'Leer una nota (por su id corto o por su nombre) como Markdown: el contexto que escribió el usuario + las tareas pendientes, cada una con su id corto. Usala apenas te pidan trabajar sobre una nota, para ver qué hay que hacer y obtener los ids de las tareas.',
		inputSchema: {
			note: z
				.string()
				.describe('Id corto (8 chars) o nombre de la nota. El nombre puede ser parcial si es inequívoco.')
		}
	},
	async ({ note }) => {
		await touchAgentStatus();
		return readNoteResult(await readExport(), note);
	}
);

server.registerTool(
	'get_task_history',
	{
		description:
			'Ver la bitácora (historial) de una tarea: quién la creó, completó, reabrió o comentó. Bajo demanda — pedila solo si necesitás el contexto de una tarea puntual.',
		inputSchema: { blockId: z.string().describe('Id corto de la tarea.') }
	},
	async ({ blockId }) => {
		await touchAgentStatus();
		return historyResult(await readExport(), blockId);
	}
);

const transport = new StdioServerTransport();
await server.connect(transport);

// Announce liveness the moment the transport is up, before any tool call, so
// Settings shows the agent connected as soon as the client attaches.
await touchAgentStatus();

// stdout is the JSON-RPC stream — never log there. stderr is safe.
console.error('copynotes MCP server running on stdio');
