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
pnpm test      # corre las pruebas (Vitest)
pnpm check     # revisa tipos y errores de Svelte
pnpm build     # genera la versión de producción
pnpm preview   # sirve la versión de producción localmente
```

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
