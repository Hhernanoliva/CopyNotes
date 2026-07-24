// CopyNotes MCP server — stdio entry point.
//
// This is a standalone Node process (not part of the SvelteKit app). It
// speaks MCP over stdio to a client (Claude Desktop, OpenCode, ...) and
// relays to the CopyNotes desktop app through the buzón folder — see
// lib/mailbox.js.
//
// Resources (M2: exposing notes/tasks as MCP resources) are registered
// below. Tools (M3: change-request tools backed by submitChange) are added
// in a later milestone.

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readExport } from './lib/mailbox.js';
import { notesToResources, noteToResourceContent } from './lib/resources.js';

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
		description: 'Tareas (todos) y su bitácora de las notas que el usuario marcó visibles para agentes.'
	},
	async (uri, variables) => {
		const id = variables.id;
		const exp = await readExport();
		const note = (exp.notes ?? []).find((n) => n.id === id);
		if (!note) return { contents: [] };
		return {
			contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(noteToResourceContent(note)) }]
		};
	}
);

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout is the JSON-RPC stream — never log there. stderr is safe.
console.error('copynotes MCP server running on stdio');
