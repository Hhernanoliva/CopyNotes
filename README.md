# CopyNotes

Organizador de notas local-first, simple y rápido, inspirado en Bear y Workflowy. Escribís en bullets, organizás con tags y copiás cualquier bloque con un clic. Los datos viven en tu dispositivo.

Estado: en construcción. Plan de etapas en `specs/017-mvp-implementation-plan.md`.

## Requisitos

- Node.js 20 o superior
- pnpm

## Cómo correr el proyecto

```bash
pnpm install   # instala dependencias
pnpm dev       # abre la app en http://localhost:5173
```

## Otros comandos

```bash
pnpm test      # corre las pruebas de lógica (Vitest)
pnpm test:e2e  # corre los flujos críticos end-to-end (Playwright)
pnpm test:e2e:webkit # prueba la base compatible con Safari y la futura app de Mac
pnpm check     # revisa tipos y errores de Svelte
pnpm build     # genera la versión de producción
pnpm preview   # sirve la versión de producción localmente
```

`pnpm test:e2e` levanta la versión de producción (`build` + `preview`) y prueba
los flujos críticos, incluido el uso sin conexión. En CI se instala Chromium con
`pnpm exec playwright install chromium`. La preparación de escritorio suma una
prueba enfocada con el motor de Safari: instalalo una vez con
`pnpm exec playwright install webkit` y corré `pnpm test:e2e:webkit`. Para reusar
un Chromium ya cacheado sin descargar, exportá `PLAYWRIGHT_CHROMIUM_PATH`
apuntando al ejecutable.

## Stack

- SvelteKit + Svelte 5 (runes)
- Tailwind CSS 4 + shadcn-svelte (tema Quiet Ink, oscuro por defecto)
- Vitest para pruebas
- Dexie (IndexedDB) para almacenamiento local — se incorpora en la Etapa 1

## Estructura

- `src/routes/` — pantallas de la app
- `src/lib/` — módulos por feature (`blocks`, `editor`, `storage`, `snippets`, `tags`, `search`, `export-import`, `theme`, `sync`, `mcp`, `pwa`, `tests`)
- `specs/` — especificaciones del producto (índice en `specs/README.md`)
- `AGENT.md` — dirección de producto y arquitectura (fuente de verdad)
