# CopyNotes

Source of truth for product direction, architecture, and quality bar. Detailed feature decisions live in `specs/` — this file is the map, the specs are the territory. (Restructured 2026-07-16: section detail was verified against and absorbed into the specs; see the index below.)

## Product Vision

CopyNotes is a simple local-first notes organizer inspired by Workflowy, Bear, and Notion, but intentionally smaller and faster to understand. It focuses on writing, organizing, and copying text through a clean block-based experience: minimal and elegant like Bear, simple like an improved plain text editor, modular enough to grow through future agent-assisted features.

Primary audience: general users who want a simpler alternative to large note-taking tools (Bear/Notion/Workflowy users who don't want a heavy workspace).

**Status:** the MVP (spec 017, stages 0–7) is complete; current work is post-MVP hardening. The MVP completion checklist and quality gates are in `specs/017-mvp-implementation-plan.md`.

## Collaboration Style

Explain product and technical decisions to Hernan in clear Spanish, assuming he is not an engineer. No unexplained jargon; use simple analogies; explain why a choice matters for the product. The goal: he can approve, reject, or adjust confidently.

## Product Principles

- **Local-first, no account.** Data lives on the device (Dexie/IndexedDB), autosaves, works offline, installs as PWA. Backup/export is part of trust, not an extra.
- **Privacy.** Without sync, everything is local. Future sync requires an account or explicit consent — never silently move private notes to a remote service.
- **Copying is a first-class workflow.** Block-only and block-with-children copy, clean output in other tools.
- **Narrow scope.** Write, organize, copy, reuse, backup. NOT a Notion competitor: no workspace databases, complex tables, heavy dashboards, or enterprise collaboration.
- **No user-facing AI.** No AI chat or assistant in the product. MCP readiness (agents connecting from outside) is a future phase — see specs 011/012.
- **Monetization:** free core experience; future Pro may add sync, advanced themes/exports/templates. Never paywall basic local note-taking.
- **Dark-first, calm, Bear-like.** Behavior over polish, but never careless UI; everything themeable through tokens (spec 016).

## Technical Direction

Stack: SvelteKit + Svelte 5, TypeScript tooling with plain-JS style code, Tailwind, shadcn-svelte + Bits UI, Lucide, mode-watcher, svelte-sonner, Dexie.js, Valibot, @vite-pwa/sveltekit (adapter-static), Vitest + Playwright. Library decisions are locked in `specs/014` (UI) and `specs/015` (non-UI) — read them before installing or replacing anything, including the editor (custom block editor; spec 015 has the revisit triggers).

Web-first, client-side only (no server routes, no hosted DB, no login). Tauri is the preferred future desktop wrapper: keep browser APIs (persistence, file import/export, clipboard, PWA, shortcuts) wrapped behind small internal utilities so a desktop port stays easy.

Future sync (spec 010) is expected as an early post-MVP feature: stable IDs + timestamps everywhere, soft delete, storage layer as the only data path, backend choice open, conflicts must never silently lose text.

## Application Architecture

```txt
src/
  lib/
    blocks/         block types, hierarchy, nesting, ordering, collapse, cascade
    editor/         editor UI, keyboard behavior, slash commands, selection, paste, history
    format/         inline formatting engine, sanitize/ingest gate, block types map
    storage/        Dexie setup, repositories, migrations — the ONLY data access path
    copy/           clipboard formatters and serialization
    snippets/       snippet creation, favorites, insertion
    tags/           tag creation, assignment, filtering
    search/         text + tag search engine (swappable behind one interface)
    export-import/  JSON backup, Markdown/HTML export, import validation
    theme/          dark/light, tokens, preference
    onboarding/     demo note, first-run
    pwa/            installability, service worker, offline
    sync/, mcp/     future contracts — minimal or docs-only until their phase
  routes/
specs/
e2e/
```

Rules that keep agents safe here:

- Feature code stays close to its module; extract shared logic only when truly reused.
- UI components never touch Dexie directly — repositories only. This is also the encryption- and sync-readiness seam.
- Pure logic (hierarchy, formatters, search, merge plans) lives in plain modules with Vitest coverage, separate from rendering.
- State: Svelte runes/stores for UI/session state (current note, selection, panels, query); anything that must survive a refresh flows through storage. No external state library.
- Editor is isolated behind boundaries (editor UI / block model / persistence / copy formatting / shortcuts) so a future editor swap can't force a rewrite.

## Quality Bar

A feature is not done until: the app runs without errors; risky logic has Vitest tests; critical flows have a Playwright check (convention: NO component-test layer — pure Vitest + Playwright only, spec 013); relevant docs/specs updated (user guide per `docs/guia/` rule in CLAUDE.md); nothing unrelated broke; data-loss risk was considered. Extra care in high-risk areas: persistence, import/export/backup restore, nested hierarchy, reordering, copy formatting, tags/search.

## Where Detail Lives (topic → spec)

| Topic | Spec |
|---|---|
| Project setup, tooling | `001` |
| Data model, Dexie, repositories, soft delete | `002` |
| Editor, block types, nesting, keyboard, slash, reorder, collapse | `003` |
| Copy actions, clipboard formats, outline copy | `004` |
| Snippets, favorites, insertion, template readiness | `005` |
| Tags, search, no-folders organization | `006` |
| Export/import/backup UX | `007` (format contract: `018`) |
| PWA, offline, themes, responsive, Tauri readiness | `008` |
| Layout, navigation, onboarding, demo note, help | `009` |
| Sync readiness, conflicts, future accounts | `010` |
| MCP readiness, audience, connection model, prompts | `011` |
| MCP permissions, audit, sessions, private notes, rollback | `012` |
| Testing strategy, definition of done | `013` |
| UI library decision | `014` |
| Non-UI libraries + editor decision & revisit triggers | `015` |
| Design system (Quiet Ink, approved — do not regenerate) | `016` |
| Build plan, stage order, MVP gates | `017` |
| Editor UX fixes (post-MVP) | `019` |
| Inline formatting + toolbar | `020` |
| Block dates & agenda | `021` |
| Sidebar organization: manual order, folders, snippet rename | `022` |
| MCP phasing & conservative first version | `023` |
| Quiet Motion: app-wide animation system | `024` |
| macOS desktop/Tauri preparation | `025` |
| Settings dialog + text size (Configuración) | `027` |
| Agent beta: local MCP, task-action layer, activity log | `028` |
| Cloud sync path (Pro): accounts, seams, conflicts | `029` |

Every meaningful feature gets a numbered spec (Objective / What enters / What does not / Data / Flows / Acceptance / Tests / Agent notes). Read `AGENT.md` plus the relevant spec before implementing; never contradict this file.

## Agent-Controlled Development

The project must stay easy for AI agents to understand, modify, and extend safely: simple explicit architecture, clear feature boundaries, small focused modules, no clever abstractions, decisions documented in specs, tests around risky behavior. Agents drive development; the app itself exposes no AI to end users.
