import { describe, it, expect } from 'vitest';
import {
	claudeCodeCommand,
	openCodeConfig,
	cursorConfig,
	cursorServerObject,
	cursorDeeplink,
	toBase64Utf8,
	isAgentActive,
	AGENT_ACTIVE_MS
} from './mcp-config';

// A mailbox path WITH a space (the real one lives under "Application Support")
// so the shell-quoting of the Claude Code command is actually exercised.
const paths = {
	serverPath: '/Applications/CopyNotes.app/Contents/Resources/mcp/server.js',
	mailboxPath: '/Users/h/Library/Application Support/com.copynotes.app/mailbox'
};

describe('claudeCodeCommand', () => {
	it('is a single global claude mcp add command with both paths single-quoted', () => {
		expect(claudeCodeCommand(paths)).toBe(
			"claude mcp add copynotes -s user -e CN_MAILBOX='/Users/h/Library/Application Support/com.copynotes.app/mailbox' -- node '/Applications/CopyNotes.app/Contents/Resources/mcp/server.js'"
		);
	});

	it('strips the power from a path that looks like a shell command', () => {
		// A home folder really can be named this. Under double quotes the shell
		// would RUN `whoami` when the person pasted the command; under single
		// quotes the text stays text.
		const command = claudeCodeCommand({
			serverPath: '/Users/$(whoami)/mcp/server.js',
			mailboxPath: '/Users/`id`/mailbox'
		});

		expect(command).toContain("'/Users/$(whoami)/mcp/server.js'");
		expect(command).toContain("'/Users/`id`/mailbox'");
	});

	it("escapes a single quote in the path instead of ending the quoting", () => {
		// The one character single quotes can't cover themselves: close, emit an
		// escaped quote, reopen. Without this the rest of the path would land
		// OUTSIDE any quoting, where $(...) works again.
		expect(claudeCodeCommand({ serverPath: "/Users/o'brien/s.js", mailboxPath: '/m' })).toContain(
			"node '/Users/o'\\''brien/s.js'"
		);
	});
});

describe('openCodeConfig', () => {
	it('builds the opencode.json shape with type local and CN_MAILBOX env', () => {
		expect(JSON.parse(openCodeConfig(paths))).toEqual({
			mcp: {
				copynotes: {
					type: 'local',
					command: ['node', paths.serverPath],
					enabled: true,
					environment: { CN_MAILBOX: paths.mailboxPath }
				}
			}
		});
	});

	it('is pretty-printed with 2-space indent', () => {
		expect(openCodeConfig(paths)).toContain('\n  "mcp"');
	});
});

describe('cursorConfig / cursorServerObject', () => {
	it('builds the ~/.cursor/mcp.json mcpServers shape', () => {
		expect(JSON.parse(cursorConfig(paths))).toEqual({
			mcpServers: {
				copynotes: {
					command: 'node',
					args: [paths.serverPath],
					env: { CN_MAILBOX: paths.mailboxPath }
				}
			}
		});
	});

	it('cursorServerObject is exactly {command,args,env}', () => {
		expect(cursorServerObject(paths)).toEqual({
			command: 'node',
			args: [paths.serverPath],
			env: { CN_MAILBOX: paths.mailboxPath }
		});
	});
});

describe('cursorDeeplink', () => {
	it('encodes the server object as UTF-8-safe base64 that round-trips', () => {
		const link = cursorDeeplink(paths);
		expect(
			link.startsWith(
				'cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config='
			)
		).toBe(true);
		const b64 = link.split('config=')[1];
		const decoded = JSON.parse(decodeURIComponent(escape(atob(b64))));
		expect(decoded).toEqual(cursorServerObject(paths));
	});
});

describe('toBase64Utf8', () => {
	it('survives non-ASCII (accents/ñ) round-trip', () => {
		const s = 'ñandú café';
		expect(decodeURIComponent(escape(atob(toBase64Utf8(s))))).toBe(s);
	});
});

describe('isAgentActive', () => {
	const now = Date.parse('2026-07-30T12:00:00.000Z');
	const ago = (ms) => new Date(now - ms).toISOString();

	it('counts a touch from a minute ago', () => {
		expect(isAgentActive(ago(60_000), now)).toBe(true);
	});

	it('goes cold past the window — the stale "se conectó" card is the whole bug', () => {
		expect(isAgentActive(ago(AGENT_ACTIVE_MS + 1), now)).toBe(false);
		expect(isAgentActive(ago(7 * 24 * 60 * 60 * 1000), now)).toBe(false);
	});

	it('treats the boundary as still active', () => {
		expect(isAgentActive(ago(AGENT_ACTIVE_MS), now)).toBe(true);
	});

	it('says no for a missing or unreadable stamp instead of throwing', () => {
		expect(isAgentActive(null, now)).toBe(false);
		expect(isAgentActive(undefined, now)).toBe(false);
		expect(isAgentActive('no es una fecha', now)).toBe(false);
	});

	it('does not call a clock-skewed future stamp stale', () => {
		expect(isAgentActive(new Date(now + 60_000).toISOString(), now)).toBe(true);
	});
});
