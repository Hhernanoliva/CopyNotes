import { describe, it, expect } from 'vitest';
import {
	claudeCodeCommand,
	openCodeConfig,
	cursorConfig,
	cursorServerObject,
	cursorDeeplink,
	toBase64Utf8
} from './mcp-config';

// A mailbox path WITH a space (the real one lives under "Application Support")
// so the shell-quoting of the Claude Code command is actually exercised.
const paths = {
	serverPath: '/Applications/CopyNotes.app/Contents/Resources/mcp/server.js',
	mailboxPath: '/Users/h/Library/Application Support/com.copynotes.app/mailbox'
};

describe('claudeCodeCommand', () => {
	it('is a single global claude mcp add command with both paths double-quoted', () => {
		expect(claudeCodeCommand(paths)).toBe(
			'claude mcp add copynotes -s user -e CN_MAILBOX="/Users/h/Library/Application Support/com.copynotes.app/mailbox" -- node "/Applications/CopyNotes.app/Contents/Resources/mcp/server.js"'
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
