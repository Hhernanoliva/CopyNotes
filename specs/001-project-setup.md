# 001 - Project Setup

## Objective

Create the technical foundation for CopyNotes using Svelte + SvelteKit + TypeScript. The setup must be simple enough for AI coding agents to understand, but structured enough to support future PWA, local storage, sync, desktop/Tauri, and MCP work.

## What Enters

- SvelteKit project with TypeScript.
- Basic route structure.
- Initial module folders under `src/lib/`.
- Vitest as the main testing base.
- Formatting/linting tools if useful and not excessive.
- PWA foundation prepared, even if offline behavior is completed later.
- Theme token foundation prepared for dark/light mode.
- Basic documentation in `README.md` and updated specs.

## What Does NOT Enter

- No user accounts.
- No cloud backend.
- No MCP implementation.
- No heavy editor library unless a later spec approves it.
- No complex design system.
- No Redux-style state management.

## Model Of Data Affected

This spec does not define the full data model. It only prepares places for:

- `notes`
- `blocks`
- `snippets`
- `tags`
- `settings`
- future `sync`
- future `mcp`

## User Flows

- User opens the app.
- User sees a working shell, even if feature screens are still minimal.
- App loads without errors.
- Theme foundation can render dark mode as the default direction.

## Suggested Structure

```txt
src/
  lib/
    blocks/
    editor/
    storage/
    snippets/
    tags/
    search/
    export-import/
    theme/
    sync/
    mcp/
    pwa/
    tests/
  routes/
specs/
```

## Acceptance Criteria

- Project installs and runs locally.
- TypeScript is enabled.
- Basic SvelteKit route renders.
- Folder structure exists or has an equivalent documented reason.
- Vitest can run at least one basic test.
- No chosen dependency contradicts local-first, PWA, or future Tauri goals.
- `AGENT.md` remains the source of truth for product direction.

## Minimum Tests

- One smoke test for core utility or app initialization.
- One test command documented in `package.json`.

## Agent Notes

Before adding dependencies, agents should ask: does this make CopyNotes simpler, safer, or easier to extend? Avoid dependencies that only solve a temporary UI problem while creating long-term complexity.
