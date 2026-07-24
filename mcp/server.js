// CopyNotes MCP server — stdio entry point.
//
// This is a standalone Node process (not part of the SvelteKit app). It
// speaks MCP over stdio to a client (Claude Desktop, OpenCode, ...) and
// relays to the CopyNotes desktop app through the buzón folder — see
// lib/mailbox.js.
//
// Resources (M2: exposing notes/tasks as MCP resources) and tools (M3:
// change-request tools backed by submitChange) are added in later
// milestones. This scaffold only establishes the connection.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'copynotes', version: '0.1.0' });

// resources (M2) + tools (M3) added later

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout is the JSON-RPC stream — never log there. stderr is safe.
console.error('copynotes MCP server running on stdio');
