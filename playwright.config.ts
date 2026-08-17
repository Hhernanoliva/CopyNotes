import { defineConfig, devices } from '@playwright/test';

// Critical-flow end-to-end tests (spec 013). They run against the real
// production build (adapter-static + service worker) served by `pnpm preview`,
// so PWA/offline behaviour is exercised too.
//
// Chromium protects the complete PWA suite. A focused WebKit project protects
// the macOS/Tauri engine seam without duplicating browser-specific clipboard
// and service-worker checks. Install it with `pnpm exec playwright install webkit`.
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
		},
		{
			name: 'webkit',
			testMatch: /(desktop-(readiness|import)|formatting-undo)\.spec\.ts/,
			use: { ...devices['Desktop Safari'], permissions: [] }
		}
	],
	webServer: {
		// El `sync` del medio no es un adorno, y no se saca.
		//
		// El build de acá abajo corre con las variables de la nube VACÍAS a
		// propósito, y de paso reescribe `.svelte-kit/generated/server/internal.js`
		// —de donde el `vite dev` que esté corriendo lee la CSP—. El servidor lo
		// recarga en caliente, sin reiniciarse y sin decir nada: a partir de ahí el
		// navegador BLOQUEA cada llamada a Supabase y la app lo cuenta como
		// "TypeError: Failed to fetch", que es idéntico a quedarse sin internet.
		// Correr la suite entre dos pruebas a mano dejaba la app rota sin que nada
		// lo dijera (medido dos veces el 2026-08-17, la segunda a punto de anotarse
		// como un bug del producto en un gate manual).
		//
		// El `unset` es lo que hace que el `sync` lea el `.env` de verdad y devuelva
		// la CSP buena. No alcanza con darle un directorio propio al build de e2e:
		// se probó, y el plugin de PWA busca el precache en `.svelte-kit` — la
		// prueba de "sin conexión" pasó a fallar 3 de 3.
		command:
			'pnpm build && (unset PUBLIC_SUPABASE_URL PUBLIC_SUPABASE_ANON_KEY; pnpm exec svelte-kit sync) && pnpm preview --port 4173',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		// Built WITHOUT a cloud project, on purpose. A developer machine has a real
		// `.env`, and with it every test page would open a websocket and call
		// Supabase a second after loading: tests that touch the network are slower,
		// impossible to run offline, and — measured here — enough to make
		// timing-sensitive layout assertions flake. Empty values win over the .env
		// file, so this is also what makes the "local-only install" state
		// deterministic for the tests that assert it.
		env: { PUBLIC_SUPABASE_URL: '', PUBLIC_SUPABASE_ANON_KEY: '' }
	}
});
