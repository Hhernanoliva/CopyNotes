// Pure builders for the per-client MCP config strings shown in Settings >
// Agentes. No DOM, no Tauri — given { serverPath, mailboxPath } they return the
// exact command / JSON / deeplink each client expects. See the design spec
// 2026-07-24-conectar-mcp-por-cliente-design.md for the confirmed 2026 formats.

// UTF-8-safe base64 (btoa alone throws on non-Latin1). Mirror decode:
// decodeURIComponent(escape(atob(b64))).
export function toBase64Utf8(str) {
	return btoa(unescape(encodeURIComponent(str)));
}

// Claude Code: one global command. Paths are double-quoted so a space in the
// mailbox path ("Application Support") doesn't split the shell argument.
export function claudeCodeCommand({ serverPath, mailboxPath }) {
	return `claude mcp add copynotes -s user -e CN_MAILBOX="${mailboxPath}" -- node "${serverPath}"`;
}

export function openCodeConfig({ serverPath, mailboxPath }) {
	return JSON.stringify(
		{
			mcp: {
				copynotes: {
					type: 'local',
					command: ['node', serverPath],
					enabled: true,
					environment: { CN_MAILBOX: mailboxPath }
				}
			}
		},
		null,
		2
	);
}

// The bare server object both the Cursor JSON and the deeplink are built from.
export function cursorServerObject({ serverPath, mailboxPath }) {
	return {
		command: 'node',
		args: [serverPath],
		env: { CN_MAILBOX: mailboxPath }
	};
}

export function cursorConfig(paths) {
	return JSON.stringify({ mcpServers: { copynotes: cursorServerObject(paths) } }, null, 2);
}

export function cursorDeeplink(paths) {
	const config = toBase64Utf8(JSON.stringify(cursorServerObject(paths)));
	return `cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config=${config}`;
}
