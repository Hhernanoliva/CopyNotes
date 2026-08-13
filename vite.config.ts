import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

// The Supabase project URL is needed twice: the client uses it to talk, and the
// CSP below has to allow talking to it. Read once, here, so the two can never
// disagree — a CSP that forbids the host the client calls fails silently, which
// is the worst failure mode this app has. The mode is fixed because these
// variables live in plain `.env` and in the host's environment (Vercel), never
// in a `.env.<mode>` file, so there is no per-mode value to pick up.
const { PUBLIC_SUPABASE_URL } = loadEnv('production', '.', 'PUBLIC_');

export default defineConfig({
	// Exposes PUBLIC_* to import.meta.env (sync/supabase.ts). Unlike
	// $env/static/public it yields `undefined` instead of breaking the build when
	// the variable is absent, which is what keeps a clone with no .env buildable.
	envPrefix: ['VITE_', 'PUBLIC_'],
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// CopyNotes is a fully client-side, local-first app: the shell is
			// prerendered (see +layout.ts) and there are no server routes, so we
			// ship it as static files. This is what makes the PWA service worker
			// serve correctly and keeps a future Tauri/desktop path simple.
			adapter: adapter(),

			// Strict CSP (spec 030, phase 0). SvelteKit emits it as a <meta> tag in
			// the prerendered HTML, so the same policy covers the web build and the
			// Tauri window (which loads that same HTML). `tauri.conf.json` keeps
			// `csp: null` on purpose: a second policy there would intersect with
			// this one and silently block whatever the two disagree on.
			//
			// `hash` mode because the shell is prerendered — a nonce cannot be
			// generated at request time when there are no requests.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					// The two hashes are mode-watcher's anti-flash snippet, which it
					// inlines in <head> so the saved theme is applied before first paint
					// (minified in the build, verbatim in dev — hence one hash each).
					// SvelteKit only hashes the scripts it emits itself, so this one is
					// ours to keep. Both change if mode-watcher is upgraded or the
					// <ModeWatcher> props in +layout.svelte change;
					// e2e/security-csp.spec.ts fails loudly when that happens, and the
					// browser console prints the new hash to paste here.
					'script-src': [
						'self',
						'sha256-eQzd7ECZTdExOJtFu68TzJ+cdLj0fuHaxMDIJBtXfhU=',
						'sha256-F7rYmbyEd7GImsIVVBGqp/pxi6c/HrA2mOw1Ek7e1FM='
					],
					// Inline `style="..."` attributes come from Svelte components and
					// third-party UI (sonner, shadcn). Inline styles cannot exfiltrate
					// data on their own; inline scripts are the ones that matter.
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					// `ipc:`/`ipc.localhost` is how the desktop app talks to its own Rust
					// side (mailbox, agent status). The Supabase project — and only that
					// one project, only when configured — is the single outside host
					// allowed: login and encrypted upload (spec 030 phase 2). A build
					// without the variable keeps the old "nothing leaves" policy.
					'connect-src': [
						'self',
						'ipc:',
						'http://ipc.localhost',
						// The cast is only for SvelteKit's CSP types, which describe a host
						// as a literal template; a value read from the environment is a
						// plain string.
						//
						// The `wss:` twin is the realtime channel (spec 030 phase 3): same
						// host, different scheme, and a CSP that allows one but not the
						// other fails silently — no error on screen, just a channel that
						// never connects.
						...(PUBLIC_SUPABASE_URL
							? [
									PUBLIC_SUPABASE_URL as `https://${string}.${string}`,
									PUBLIC_SUPABASE_URL.replace(
										/^https:/,
										'wss:'
									) as `wss://${string}.${string}`
								]
							: [])
					],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['none']
				}
			}
		}),
		// PWA: installable + offline. We register the service worker ourselves
		// (virtual:pwa-register/svelte in PwaLifecycle.svelte), so injectRegister
		// is off. autoUpdate silently swaps in new versions on the next visit.
		SvelteKitPWA({
			registerType: 'autoUpdate',
			injectRegister: false,
			manifest: {
				name: 'CopyNotes',
				short_name: 'CopyNotes',
				description: 'Notas locales, simples y listas para copiar.',
				lang: 'es',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#211f1c',
				theme_color: '#211f1c',
				icons: [
					{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
					{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,html,webmanifest}'],
				navigateFallback: '/',
				cleanupOutdatedCaches: true,
				maximumFileSizeToCacheInBytes: 3_000_000
			},
			devOptions: { enabled: false }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'jsdom',
					environment: 'jsdom',
					include: [
						'src/lib/format/**/*.{test,spec}.{js,ts}',
						'src/lib/editor/**/*.{test,spec}.{js,ts}',
						'src/lib/bridge/**/*.{test,spec}.{js,ts}',
						// Las acciones tocan el DOM (eventos de puntero, visualViewport).
						'src/lib/actions/**/*.{test,spec}.{js,ts}',
						// Migration test: v3 upgrade uses htmlToPlainText, which needs a DOM.
						'src/lib/storage/db.migrations.test.ts',
						// Spec 038: la limpieza de lo que llega por el caño compartido pasa
						// por `sanitizeHtml`, que necesita un `DOMParser`.
						'src/lib/sync/shared-payload.test.ts',
						'src/lib/sync/shared-merge.test.ts'
					]
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/lib/format/**/*.{test,spec}.{js,ts}',
						'src/lib/editor/**/*.{test,spec}.{js,ts}',
						'src/lib/bridge/**/*.{test,spec}.{js,ts}',
						'src/lib/actions/**/*.{test,spec}.{js,ts}',
						// Runs under jsdom instead (see the jsdom project's include).
						'src/lib/storage/db.migrations.test.ts',
						'src/lib/sync/shared-payload.test.ts',
						'src/lib/sync/shared-merge.test.ts'
					]
				}
			}
		]
	}
});
