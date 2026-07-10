# 014 - UI Library Decision

## Objective

Document the recommended UI library direction for CopyNotes before project setup begins. The goal is to give future agents a clear default so they do not re-litigate the same decision or introduce a visual framework that conflicts with the product.

Last reviewed: 2026-07-09.

## Decision

CopyNotes should use this UI foundation:

- `shadcn-svelte` as the main editable component source.
- `bits-ui` as the headless accessible behavior layer underneath.
- Tailwind CSS as the styling system.
- `@lucide/svelte` for icons.
- `mode-watcher` for dark/light theme handling in SvelteKit.
- `svelte-sonner` for short status messages such as copied, saved, export ready, or copy failed.

For drag and drop in the block editor, evaluate separately when implementing editor reordering:

- `svelte-dnd-action`
- `@dnd-kit/svelte`

Drag and drop should not be treated as solved by the general UI component library.

## Rationale

CopyNotes needs a calm, minimal, editor-first interface. The UI layer should support menus, dialogs, tooltips, drawers, command menus, sidebars, tags, buttons, inputs, and subtle feedback without forcing a heavy visual identity.

`shadcn-svelte` is a good fit because it adds editable components to the codebase instead of hiding behavior and styling inside a closed package. This lets CopyNotes keep its own Bear/Workflowy-inspired product identity while still starting from accessible, well-structured UI primitives.

`bits-ui` is a good fit because it provides headless Svelte components for complex behavior such as menus, popovers, tooltips, dialogs, selects, and command-style UI without imposing a visual style.

## What Enters

- Editable UI components copied into the app when needed.
- Headless accessible behavior through `bits-ui`.
- Tailwind-based styling that can be shaped by the CopyNotes design system.
- A dark-first theme foundation.
- Icons from `@lucide/svelte`.
- Toast/status messages through `svelte-sonner`.
- Minimal dependency use: install components as needed, not a large visual kit all at once.

## What Does NOT Enter

- No full visual framework that forces a dashboard, SaaS, Material, IBM, or generic admin-app look.
- No reliance on `Skeleton` as the main UI foundation.
- No reliance on `Flowbite Svelte` as the main UI foundation.
- No reliance on `daisyUI` as the main UI foundation.
- No reliance on `Carbon Components Svelte` or `Svelte Material UI` as the main UI foundation.
- No UI library should determine the product's visual identity.
- No editor logic should be coupled directly to the UI component library.

## Model Of Data Affected

This decision does not affect persisted product data directly.

It does affect implementation boundaries for:

- layout components
- menus and drawers
- command menus
- tags UI
- snippets UI
- backup/import dialogs
- settings UI
- onboarding/help UI
- theme controls

The note, block, snippet, tag, storage, export/import, sync, and MCP models must remain independent from the UI library.

## User Flows

This decision should support:

- User writes immediately in an editor-first layout.
- User opens a quiet sidebar for notes, tags, and snippets.
- User opens drawers or panels for secondary actions.
- User uses slash commands or a command menu.
- User copies a block and sees a brief confirmation.
- User changes theme without page flicker where practical.
- User opens backup/import dialogs that are clear and safe.
- User uses the app on mobile with touch-friendly panels.

## Acceptance Criteria

- SvelteKit setup uses Tailwind CSS.
- `shadcn-svelte` is configured in a way compatible with the project's Svelte 5 direction.
- Components are added only when needed.
- Styling remains centralized through theme tokens and Tailwind conventions.
- UI components do not contain business logic for storage, export/import, snippets, tags, sync, or MCP.
- The final UI still follows CopyNotes' design direction: dark-first, minimal, calm, writing-centered, and not dashboard-heavy.
- Before installing an alternative UI library, agents must document why `shadcn-svelte` plus `bits-ui` is insufficient.

## Minimum Tests

When the UI foundation is added, include at least:

- A smoke test that the app renders.
- Component tests for risky UI behavior when implemented, such as dialogs, command menu selection, sidebar/drawer behavior, and theme switching.
- Playwright mobile viewport smoke test once navigation exists.

## Recheck Rule

Because Svelte UI libraries move quickly, agents should recheck package status before installation if:

- more than six months have passed since the last review,
- Svelte or Tailwind has a major version change,
- `shadcn-svelte` or `bits-ui` becomes unmaintained,
- or the app needs a component that the recommended stack cannot reasonably support.

## Useful Sources

- shadcn-svelte: https://www.shadcn-svelte.com/docs
- Bits UI: https://bits-ui.com/docs/getting-started
- Lucide Svelte: https://lucide.dev/guide/packages/lucide-svelte
- mode-watcher: https://www.npmjs.com/package/mode-watcher
- svelte-sonner: https://www.npmjs.com/package/svelte-sonner
- svelte-dnd-action: https://www.npmjs.com/package/svelte-dnd-action
- dnd-kit Svelte: https://dndkit.com/svelte/quickstart

## Agent Notes

Think of the UI library as scaffolding, not as the product's personality. CopyNotes should feel like CopyNotes, not like a default component demo.
