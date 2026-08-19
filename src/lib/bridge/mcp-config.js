// Pure logic behind Settings > Agentes. No DOM, no Tauri — given
// { serverPath, mailboxPath } the builders return the exact command / JSON /
// deeplink each client expects. See the design spec
// 2026-07-24-conectar-mcp-por-cliente-design.md for the confirmed 2026 formats.

// How long an agent's last touch still counts as "using CopyNotes".
export const AGENT_ACTIVE_MS = 5 * 60 * 1000;

// `agent-status.json` is stamped when an agent boots the MCP server and on
// every tool call, so it records ACTIVITY, not an open connection: nothing
// clears it when the client quits. The card used to read it as "Un agente se
// conectó — hace 7 d", which sounds like someone is in the room. There is no
// way to know whether the process is still alive, so the wording talks about
// what the file actually proves and stops claiming a live link once it is cold.
export function isAgentActive(lastSeen, now = Date.now()) {
	if (!lastSeen) return false;
	const at = new Date(lastSeen).getTime();
	if (Number.isNaN(at)) return false;
	return now - at <= AGENT_ACTIVE_MS;
}

// UTF-8-safe base64 (btoa alone throws on non-Latin1). Mirror decode:
// decodeURIComponent(escape(atob(b64))).
export function toBase64Utf8(str) {
	return btoa(unescape(encodeURIComponent(str)));
}

// SINGLE quotes, not double: inside double quotes the shell still expands
// $(...), backticks and \, so a home folder named with a `$(` in it would make
// this command RUN whatever the name says when the person pastes it. Single
// quotes take that power away from everything except the single quote itself,
// which is escaped the standard POSIX way — close the quoting, emit \', reopen.
// Quoting at all is still about the space in "Application Support".
function shellQuote(value) {
	return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// PowerShell, que es la consola por defecto de Windows desde hace años. Sus
// comillas simples también son literales — adentro no expande nada — y la única
// que hay que escapar es la comilla simple misma, duplicándola. El truco POSIX
// de cerrar-escapar-reabrir NO funciona acá: dejaría el resto de la ruta fuera
// de toda cita. Citar hace falta igual, por el espacio en "Juan Perez".
function powershellQuote(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

// Claude Code: un solo comando global. `windows` elige el dialecto de comillas;
// los demás clientes van en JSON y ahí JSON.stringify ya escapa las barras
// invertidas de Windows correctamente.
export function claudeCodeCommand({ serverPath, mailboxPath }, windows = false) {
	const quote = windows ? powershellQuote : shellQuote;
	return `claude mcp add copynotes -s user -e CN_MAILBOX=${quote(mailboxPath)} -- node ${quote(serverPath)}`;
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
