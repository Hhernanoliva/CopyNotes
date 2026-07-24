import { defineConfig } from 'vitest/config';

// mcp/ is a standalone Node package (see README.md) — this config keeps
// Vitest from walking up to the CopyNotes repo root and picking up its
// SvelteKit vite.config.ts, which isn't resolvable from mcp/node_modules.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['lib/**/*.test.js']
	}
});
