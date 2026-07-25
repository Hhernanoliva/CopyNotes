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
import { notesToResources, noteToMarkdown } from './lib/resources.js';
import { buildShortIds } from './lib/ids.js';
import { createTaskChange, completeTaskChange, addNoteChange, makeToolHandler } from './lib/tools.js';

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
			contents: [{ uri: uri.href, mimeType: 'text/markdown', text: noteToMarkdown(note, buildShortIds(exp)) }]
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
const submitWithHeartbeat = async (change) => {
	await touchAgentStatus();
	return submitChange(change);
};

server.registerTool(
	'create_task',
	{
		description: 'Crear una tarea (todo) en una nota visible para agentes.',
		inputSchema: { noteId: z.string(), content: z.string() }
	},
	makeToolHandler(createTaskChange, 'Tarea creada.', submitWithHeartbeat)
);

server.registerTool(
	'complete_task',
	{
		description: 'Marcar una tarea como hecha (deja una traza en la bitácora).',
		inputSchema: { blockId: z.string(), summary: z.string().optional() }
	},
	makeToolHandler(completeTaskChange, 'Tarea marcada como hecha.', submitWithHeartbeat)
);

server.registerTool(
	'add_note',
	{
		description: 'Agregar una nota/instrucción a la bitácora de una tarea.',
		inputSchema: { blockId: z.string(), text: z.string() }
	},
	makeToolHandler(addNoteChange, 'Nota agregada a la bitácora.', submitWithHeartbeat)
);

const transport = new StdioServerTransport();
await server.connect(transport);

// Announce liveness the moment the transport is up, before any tool call, so
// Settings shows the agent connected as soon as the client attaches.
await touchAgentStatus();

// stdout is the JSON-RPC stream — never log there. stderr is safe.
console.error('copynotes MCP server running on stdio');
