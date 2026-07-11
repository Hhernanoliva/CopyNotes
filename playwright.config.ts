import { defineConfig, devices } from '@playwright/test';

// Critical-flow end-to-end tests (spec 013). They run against the real
// production build (adapter-static + service worker) served by `pnpm preview`,
// so PWA/offline behaviour is exercised too.
//
// Browsers: CI runs `pnpm exec playwright install chromium`. Locally you can
// point at an already-cached Chromium via PLAYWRIGHT_CHROMIUM_PATH to skip the
// download (e.g. the chrome-headless-shell under ~/Library/Caches/ms-playwright).
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'line' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		permissions: ['clipboard-read', 'clipboard-write']
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } }
		}
	],
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
