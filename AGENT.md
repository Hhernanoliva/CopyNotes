# CopyNotes

## Product Vision

CopyNotes is a simple local-first notes organizer inspired by Workflowy, Bear, and Notion, but intentionally smaller and faster to understand.

The app focuses on writing, organizing, and copying text through a clean block-based experience. It should feel minimal and elegant like Bear, simple like an improved plain text editor, and modular enough to grow through future agent-assisted features.

## Primary Audience

CopyNotes is designed first for a general audience that wants a simpler alternative to large note-taking tools. It should be approachable for people who use apps like Bear, Notion, or Workflowy but do not want a heavy workspace.

## Collaboration Style

When explaining product or technical decisions to Hernan, use clear Spanish and assume he is not an engineer. Avoid unnecessary jargon, define technical terms with simple analogies, and explain why a choice matters for the product in practical terms.

The goal is that Hernan can understand the decision well enough to approve, reject, or adjust it confidently.

## MVP Goal

The MVP must make two core workflows feel excellent:

1. Write notes using bullets.
2. Copy individual bullets or text blocks quickly.

## Key Features

- Bullet-based writing.
- Todos and checklists.
- Copy button for bullets or blocks.
- Snippets.
- Simple organization.
- Tags.

## Core Information Architecture

The main user-created container is a note/document. The app may use either word in the UI later, but the product model should treat it as one primary writing space that contains blocks.

Each note/document contains bullet-based blocks. Bullets must support nesting, similar to Workflowy, so users can create parent bullets and child bullets to organize ideas in levels.

## Copy Behavior

Copying is a first-class workflow. A user should be able to copy:

1. Only the selected bullet or block.
2. The selected bullet or block together with its child bullets.

The copied output should be clean and useful when pasted into other tools. The implementation should leave room for future copy formats, such as plain text, Markdown, or formatted output.

## Snippets

Snippets are reusable pieces of content. A snippet can represent:

- A saved block.
- A saved note/document template.
- A short reusable text response.

The MVP should support snippets in a simple way, while keeping the data model flexible enough to expand them into templates and reusable content libraries later.

## Tags

Tags can be applied across the product:

- Notes/documents.
- Individual bullets or blocks.
- Snippets.

Tags should help users find and group content without forcing a complex folder system.

## Local-First Storage

The MVP must work without requiring a user account. Users should be able to open the app and start writing immediately.

The product must be local-first:

- Save automatically in the browser.
- Use Dexie.js over IndexedDB for the browser-based local database.
- Support export and import for backups.
- Support downloadable backup formats such as JSON and/or Markdown.

Backup/export is mandatory for the MVP. Because local browser data can be lost if the user clears site data or changes devices, the app must give users a reliable way to preserve their content.

## Data Model Direction

The writing experience should feel simple, but the internal model should be structured.

The preferred approach is hybrid:

- Users write in a simple, natural note-taking interface.
- The app stores content as structured blocks.
- Blocks can represent bullets, todos, text blocks, snippets, and future block types.
- The structure should preserve nesting, tags, copy options, and future sync metadata.

## Core Data Model

CopyNotes should use a structured data model from the beginning. The user experience can feel simple, but internally the app needs stable entities so local storage, backups, search, snippets, and future sync can work reliably.

In simple terms: the app should not save one giant text file. It should save notes, blocks, tags, and snippets as connected pieces.

### Notes/Documents

A note/document should include:

- Stable unique ID.
- Title.
- Creation date.
- Last edited date.
- Tags.
- Child blocks.
- Soft delete metadata.
- Future sync metadata when needed.

Notes/documents are the main containers users create and return to.

### Blocks

A block should include:

- Stable unique ID.
- Parent note/document ID.
- Parent block ID when nested.
- Block type: text, bullet, todo/check, code/snippet code, separator, or future block types.
- Text/content when applicable.
- Order/position among sibling blocks.
- State fields when applicable, such as `collapsed` and `checked`.
- Tags.
- Creation date.
- Last edited date.
- Soft delete metadata.
- Future sync metadata when needed.

Blocks are the core writing unit. Most product behavior should operate on blocks: nesting, copying, dragging, collapsing, tagging, turning into snippets, and exporting.

### Snippets

Snippets can be created from existing blocks, but once saved they should become independent reusable content.

This means a snippet may remember where it came from, but it must not disappear or break if the original note or block is later edited or deleted.

A snippet should include:

- Stable unique ID.
- Name or short label.
- Content or block snapshot.
- Optional source note/block IDs.
- Tags.
- Favorite/pinned state.
- Creation date.
- Last edited date.
- Soft delete metadata.
- Future sync metadata when needed.

### Tags

Tags should be their own entities, not only plain text strings.

A tag should include:

- Stable unique ID.
- Name.
- Optional color.
- Creation date.
- Last edited date.
- Soft delete metadata.
- Future sync metadata when needed.

Tags can be attached to notes/documents, blocks, and snippets.

### Soft Delete

The MVP should support soft delete.

When a user deletes a note, block, snippet, or tag, the app should mark it as deleted instead of immediately removing it from storage.

Soft delete helps with:

- Undo or recovery.
- Safer backup/restore flows.
- Safer future sync.
- Avoiding accidental permanent data loss.

Permanent deletion can exist later as an explicit action, but the default delete behavior should be recoverable.

Permanent deletion should be prepared for future implementation, but it is not required in the MVP.

If permanent deletion is added later, it must require strong confirmation because it can permanently remove user data from local storage and future synced storage.

### Encryption Readiness

Local encryption is not required in the MVP, but the architecture should not make future encryption difficult.

Agents should keep data access behind the storage layer instead of scattering raw local database access throughout UI components. This will make it easier to add encryption later if the product needs it.

## Future Sync Readiness

Synchronization is not part of the MVP, but the codebase and data model must be prepared for it from the beginning.

After MVP validation, syncing across devices is expected to become one of the first major features. The MVP should therefore avoid decisions that would make future sync difficult, such as unstructured-only storage, browser-only assumptions scattered across the app, or data models without stable IDs and timestamps.

Every persisted entity should be designed with future sync in mind:

- Stable IDs.
- Created and updated timestamps.
- Clear parent-child relationships for nested blocks.
- Room for future user/workspace ownership.
- Room for future conflict resolution metadata if needed.

## Future Sync Model

Future sync should include all user-owned product data:

- Notes/documents.
- Blocks.
- Snippets.
- Tags.
- Preferences, including theme and relevant app settings.

Sync must preserve the local-first nature of the product. Even after accounts and cloud sync are added, CopyNotes should continue working offline and should sync changes when the connection is available again.

Future accounts should prioritize social login, especially Google and/or Apple. Email and password can be reconsidered later, but the first preferred account direction is login through an existing identity provider.

Conflict handling should avoid silent data loss. If the same note or block is edited on multiple devices before syncing, the first sync version should preserve both versions and warn the user instead of simply overwriting one version.

The product can improve conflict resolution later, but the first rule is simple: do not lose user text.

The backend choice for sync should remain open until the sync phase begins. Supabase is a possible option, but the project should evaluate the best backend when it is actually time to implement accounts and cloud sync.

## Technical Direction

The recommended MVP stack is:

- Svelte.
- SvelteKit.
- TypeScript.
- Tailwind CSS.
- shadcn-svelte plus Bits UI for editable, accessible UI components.
- Lucide Svelte for icons.
- mode-watcher for dark/light theme handling.
- svelte-sonner for short status messages.
- Dexie.js over IndexedDB.
- Valibot for JSON backup/import validation.
- @vite-pwa/sveltekit for PWA setup.
- Vitest, Testing Library, and Playwright for quality checks.
- Local-first browser storage.
- PWA support from the MVP.

The UI library decision is documented in `specs/014-ui-library-decision.md`. Future agents should use that spec before installing UI packages or replacing the recommended foundation.

The non-UI library decision is documented in `specs/015-non-ui-library-decision.md`. Future agents should use that spec before installing storage, editor, search, export/import, PWA, drag-and-drop, or testing packages.

The app should be built web-first. A desktop version is expected later, and Tauri is the preferred future desktop wrapper. The MVP should avoid architecture choices that make a future Tauri app difficult.

SvelteKit should be used as the application framework, but CopyNotes should still behave like a lightweight local-first app. The MVP should avoid depending on server routes, hosted databases, or login-only flows.

The first version should be able to run mostly as a client-side app, while leaving room for future backend and sync work.

React, Vite-only React, and Next.js are no longer the selected direction for this project.

## Editor Strategy

The MVP should start with a simple custom bullet/block editor, but the codebase must leave room to adopt a richer editor library later, such as TipTap or Lexical.

The editor should therefore be isolated behind clear internal boundaries:

- Editor UI.
- Block data model.
- Persistence layer.
- Copy/export formatting.
- Keyboard shortcuts and interactions.

Avoid spreading editor-specific assumptions throughout the app. If a richer editor library is introduced later, it should be possible to replace the editor surface without rewriting storage, tags, snippets, export/import, or sync-related logic.

## Design Direction

The product should support light and dark themes from the MVP.

The primary visual identity should be dark, minimal, and elegant. The product should feel like a mix of Bear and Workflowy:

- Bear for calm, elegant writing.
- Workflowy for simple outline structure and nested thinking.

The UI should feel calm, focused, and simple, with the writing experience always treated as the center of the product.

The interface should avoid unnecessary panels, visual clutter, and heavy workspace metaphors unless they directly help users write, organize, or copy text faster.

Dark mode is the primary theme. Light mode should exist from the MVP, but the product identity should be dark-first.

Typography should be modern and clean. The type system must be easy to change later, so font choices should be handled through theme tokens or a central style layer rather than scattered throughout components.

The approved design system is documented in `specs/016-design-system.md`. The visual system must remain easy to replace later: components should use semantic tokens and shared styles rather than raw hard-coded colors, spacing, radius, shadows, or motion values.

The app should be responsive and usable on mobile from the MVP.

Navigation should support both:

- A hideable sidebar for broader navigation such as notes, tags, and snippets.
- Hideable drawer/panel patterns for focused secondary actions.

These navigation surfaces should have distinct responsibilities. Avoid making one panel do everything.

## PWA Requirement

CopyNotes must be installable as a PWA from the MVP. Users should be able to use it like an app from their device while keeping the first version web-based.

The app should include a discreet install prompt or install suggestion. It should not interrupt the writing flow or feel like aggressive onboarding.

## Offline Requirement

CopyNotes must remain useful without internet from the MVP.

Offline users should be able to:

- Read existing notes.
- Create and edit notes.
- Use snippets.
- Export backups.

The offline behavior is part of the product promise. CopyNotes should feel like a real local app, even though it starts as a web/PWA product.

## Device Support

The MVP should work well on both desktop and mobile.

Desktop and mobile are both priority environments:

- Desktop should provide the best writing, keyboard, drag-and-drop, and outline management experience.
- Mobile should remain fully usable for reading, editing, creating, searching, tagging, snippets, and backup actions.

The app should not be desktop-only.

## Responsive Navigation

On mobile, sidebar and drawer navigation should be opened through clear buttons and displayed as full-screen or near full-screen panels.

The desktop layout can use a hideable sidebar and hideable drawer/panel. The mobile layout should avoid squeezing desktop panels into narrow columns.

## Onboarding And First Use

The first time a user opens CopyNotes, the app should show a mini tutorial. The tutorial should be brief, calm, and focused on helping the user understand the core actions without feeling like a long setup process.

The first-use experience should explain only the essentials:

- Create and edit a note.
- Use bullets and nested bullets.
- Use slash commands.
- Copy a block or outline.
- Add tags.
- Save or create snippets.

After the first-time tutorial has been completed or dismissed, future openings should go directly into a blank or last active writing surface, depending on app state. The user should not see the tutorial every time.

CopyNotes should include an editable demo note in the MVP. This note can show examples of bullets, todos, snippets, tags, and copy behavior. Because it is editable, the user can learn by touching the product instead of only reading instructions.

The app should teach features through:

- Discreet tooltips.
- Discoverable slash command options.
- A help or shortcuts panel.

If the app has no notes, the empty state should prioritize creating a note quickly. Importing a backup can be available nearby, but the main action should be simple: start writing.

UI copy should feel warm like Bear: friendly, calm, and human. Text should still be short and useful; avoid long onboarding explanations or heavy productivity language.

## Tauri Readiness

The MVP should avoid browser-only decisions that would make a future Tauri desktop app difficult.

When using browser APIs, agents should keep the access wrapped behind small internal utilities where practical. This makes it easier to replace or adapt behavior later for desktop.

Important areas to keep portable:

- Local persistence.
- File import/export.
- Clipboard behavior.
- PWA/offline logic.
- Keyboard shortcuts.

## Navigation And Layout

The first screen should prioritize the editor. The MVP layout should be ultra minimal, with the main writing surface visible immediately and navigation kept secondary through a hidden or lightweight menu.

The app should avoid a heavy multi-column workspace in the first version. A sidebar, note list, tag panel, or snippets panel can exist, but they should not dominate the default experience.

When the user opens the app, it should restore the last opened note/document. This reinforces the feeling of a fast personal writing tool instead of a dashboard.

## Organization Model

The MVP should organize content through search and tags, without requiring folders.

Folders, spaces, or projects can be considered later if users need stronger organization, but they should not be part of the initial product model unless there is a clear reason.

Tags should remain the main lightweight organization layer across notes, bullets, and snippets.

## Search

Search is part of the MVP.

The MVP must support:

- Searching by text.
- Searching or filtering by tags.

The implementation should be simple at first, but structured so search can improve later without rewriting the product. Future improvements may include fuzzy search, ranked results, filters by content type, keyboard-first search, full-text indexing, and synced search across devices.

## Snippets Navigation

Snippets should work in two connected ways:

1. Users can mark or convert blocks inside notes into snippets.
2. Users can open a dedicated snippets section to browse, search, copy, and reuse saved snippets.

This keeps snippets close to the writing flow while also allowing them to become a reusable content library over time.

## MVP Block Types

The MVP editor must support these block types:

- Text.
- Bullet.
- Todo/check.
- Separator.
- Code/snippet code.

Headings are not mandatory for the first MVP unless needed by the editor implementation, but the block model should be able to add them later without migration pain.

## Slash Commands

The MVP should include slash commands inspired by tools like Notion, but simpler.

Initial commands should include:

- `/text`
- `/bullet`
- `/todo`
- `/separator`
- `/code`
- `/snippet`

Slash commands should be treated as a fast creation mechanism, not as the main identity of the app. The writing experience must still feel natural without users needing to memorize commands.

## Keyboard Interactions

Keyboard behavior is important for the MVP. The editor must feel fast for users who write and organize text heavily.

Required MVP interactions:

- `Enter` creates a new block or bullet.
- `Tab` indents a bullet/block when valid.
- `Shift+Tab` outdents a bullet/block when valid.
- Common copy behavior must remain predictable.
- Copy actions for block-only and block-with-children should be clearly available.

Keyboard shortcuts should be implemented carefully and documented in code where behavior is non-obvious.

## Reordering

Users must be able to reorder bullets or blocks in the MVP with drag and drop.

Drag and drop should preserve:

- Nested child blocks.
- Tags attached to blocks.
- Todo state.
- Snippet identity if the moved block is also saved as a snippet.

The implementation should keep reordering logic separate from rendering so future editor changes do not force a rewrite of hierarchy operations.

## Collapse And Expand

Nested bullets must support collapse and expand behavior, similar to Workflowy.

When a parent block is collapsed, child blocks should be hidden visually but preserved in the data model and included when the user chooses a copy option that includes children.

## Copy UI

The copy action should appear on block hover and keyboard focus. The default writing surface should remain clean, so copy controls should not be permanently visible beside every block.

Each block should expose copy actions in a way that is discoverable but quiet. The product should avoid visual noise while still making copy feel like a first-class workflow.

## Copy Formats

The MVP should support rich clipboard output when possible, especially HTML, because it leaves the product prepared for pasting into many destinations with useful formatting.

The copy layer should be designed around output formatters, not hard-coded clipboard strings. This allows the app to support multiple formats over time:

- `text/plain`
- `text/html`
- Markdown
- Future custom formats

When using the Clipboard API, prefer writing both plain text and HTML representations when supported, so pasting works gracefully in simple and rich destinations.

## Outline Copy Behavior

Copying a bullet or block with children should behave like copying an outline in Workflowy.

The copied result should preserve the parent-child hierarchy in a clean way:

- Parent blocks remain above their children.
- Child blocks keep visual nesting through indentation or equivalent rich formatting.
- Todo/check state should be represented clearly.
- Code/snippet blocks should remain readable.
- Collapsed children should still be included when the user selects a copy-with-children action.

The exact clipboard representation can vary by output format, but the user expectation is simple: copying a structured outline should paste as a structured outline.

## Snippet Favorites

The MVP should support favorite or pinned snippets.

Favorite snippets should be easy to find from the snippets section and fast to insert into the current note/document.

## Snippet Insertion

The primary snippet action is insertion into the current note/document.

Copying snippets to the clipboard can be added later, but the MVP should prioritize using snippets as reusable blocks inside the writing flow.

## Export

Export is mandatory in the MVP because CopyNotes is local-first and users need a reliable way to protect their data.

The MVP must support exporting:

- A single note/document.
- All user data.
- Snippets.

Users should be able to choose the export format when more than one format is available.

Required MVP export formats:

- JSON backup.
- Markdown.
- HTML.

The JSON backup format is the canonical portable format for CopyNotes data. Markdown and HTML exports are user-facing formats intended for reading, sharing, pasting, archiving, or moving selected content into other tools.

## Import

The MVP should only import CopyNotes JSON backups.

Markdown and HTML import can be considered later, but they are not required for the MVP because they introduce parsing complexity and may lose structure. The first version should prioritize reliable restoration of CopyNotes data over broad import compatibility.

The JSON importer must validate imported data before writing it into local storage. It should avoid overwriting existing data without a clear user action.

Before importing a JSON backup, the app should recommend exporting the current data first. This recommendation should be visible and clear, but it does not need to block the import flow.

## Backup Strategy

The MVP must include manual backup/export actions.

Automatic backup is not required in the first version, but the product and data layer should be prepared for future automatic or scheduled backups.

Future backup improvements may include:

- Backup reminders.
- Automatic export prompts.
- Local file system integration where supported.
- Cloud sync backup once accounts and sync exist.

The MVP does not need recurring backup reminders. The product should not interrupt users with repeated backup prompts in the first version.

However, the backup/export screen should clearly explain that CopyNotes stores data locally in the browser, and that clearing browser site data or changing devices without a backup can cause data loss.

## Privacy

In the MVP, user data should stay on the user's device.

The product should communicate this clearly: without sync enabled, notes, snippets, tags, and backups are local. Future sync will require an account or explicit user consent, and the app should not silently move private notes to a remote service.

## Monetization Direction

CopyNotes should start with a free core experience and leave room for a future Pro version.

The MVP should not block basic local note-taking, bullets, snippets, tags, copy, backup, or PWA usage behind payment. The first product goal is to validate whether users want the tool and whether the writing/copying workflow feels valuable.

Future Pro features may include:

- Sync across devices.
- Advanced themes.
- Advanced export/import options.
- Advanced snippets and templates.

The monetization model should stay lightweight and compatible with a low-cost product similar in spirit to simple paid note apps.

## User-Facing AI

The MVP must not include a user-facing AI agent, AI chat, or agentic assistant.

The product should remain focused on local-first notes, bullets, snippets, copy, organization, and backup. AI features can be reconsidered later, but they are not part of the first version.

## Agent-Controlled Development

The project must be easy for AI coding agents to understand, modify, and extend safely.

This is a core requirement. CopyNotes should be built so future agents can add features without touching unrelated areas of the codebase or rewriting the app.

To support agent-controlled development:

- Keep architecture simple and explicit.
- Keep feature boundaries clear.
- Prefer small, focused modules over large tangled files.
- Document important product decisions in this `AGENT.md`.
- Use phase specs for meaningful feature work.
- Make storage, editor, export/import, snippets, tags, and search independent enough to evolve separately.
- Avoid clever abstractions that make the app harder for agents to reason about.
- Add tests around risky behavior, especially persistence, import/export, nesting, copy formatting, and drag-and-drop hierarchy changes.

Agents should have strong control over the development process, but the app itself should not expose an AI agent to end users in the MVP.

## MCP Readiness

CopyNotes should be prepared to integrate with MCP in a future phase.

In simple terms: MCP would let external AI agents safely connect to CopyNotes so they can read useful context and perform approved actions, such as creating tasks, updating agent work notes, organizing project plans, or marking progress.

MCP is not the same as adding an AI chat inside CopyNotes. The MVP still has no user-facing AI assistant. MCP readiness means the product architecture should keep data and actions clean enough that an MCP server can later expose them safely.

### MCP Product Goal

The future MCP integration should allow CopyNotes to become a lightweight task and context hub for agents.

The intended MCP use cases are:

- Agents can read notes, tasks, snippets, tags, and outlines as context when the user allows it.
- Agents can create or update notes, blocks, todos, tags, snippets, and task lists when the user allows it.
- Users can organize work for agents inside CopyNotes using the same simple notes, bullets, and todos they already use.
- CopyNotes can become a central place where users see what agents are working on, what changed, and what still needs review.

The important product rule is: MCP should extend CopyNotes without turning CopyNotes into a complicated AI workspace.

### MCP Audience

MCP should eventually support more than one type of user:

- General users who connect tools like ChatGPT, Claude, or other AI clients to CopyNotes.
- Developers who use coding agents such as Claude Code, Codex, OpenCode, Cursor, or similar tools.
- Teams that want to organize agent tasks, project notes, and follow-up work in a shared structure.

The first implementation does not need to satisfy all audiences equally, but the architecture should not assume MCP is only for developers.

### MCP Connection Model

The exact MCP transport should remain open until implementation time, but the preferred direction is local-first and desktop-friendly.

The first serious MCP implementation should prioritize local or desktop/Tauri usage for safety and control. A web/PWA-based MCP connection can be explored if it becomes technically practical and safe, but it should not be assumed as the first path.

A future cloud/backend-based MCP connection can be reconsidered after sync and accounts exist. MCP should not force cloud infrastructure into the MVP.

The practical priority order is:

1. Local/desktop MCP connection where the user controls the app and data directly.
2. Possible web/PWA integration only if browser limitations and security are acceptable.
3. Backend/cloud MCP only after accounts, sync, and permissions are mature.

### MCP Connected Agents

When MCP is added, each connected agent or MCP client should be treated like its own connected app.

Each connected agent/client should have its own permissions, name, identity, access scope, and activity history. CopyNotes should avoid a single global permission that gives every agent the same access.

A connected agent/client record should eventually store:

- Stable agent/client ID.
- Display name.
- Client type, such as ChatGPT, Claude, Codex, Cursor, OpenCode, or another MCP client.
- Connection date.
- Last activity date.
- Current permission preset and customized permission scopes.
- Current status: active, paused, or revoked.

This identity layer matters because users may connect multiple tools over time. CopyNotes should make it clear which agent did what and under which permission mode.

The user should be able to understand:

- Which agents or clients are connected.
- What each one can read.
- What each one can write.
- When each one last acted.
- Whether the connection is active, paused, or revoked.

This can be simple in the first version, but the data model should not assume all agents are the same.

### MCP Settings UI

When MCP is implemented, CopyNotes should include a clear user-facing control area inside Settings.

The preferred section name is `MCP / Agentes`.

This section should let the user understand and control connected agents without needing technical knowledge. It should eventually show:

- Connected MCP clients or agents.
- Agent/client name.
- Current permission mode.
- Read scope.
- Write scope.
- Last activity.
- Whether the agent is active, paused, or revoked.

The user should be able to pause and resume an agent without deleting the connection. Pausing should temporarily stop access while preserving the agent identity, permission settings, and history.

The user should also be able to revoke/remove an agent connection when needed.

This UI belongs in Settings first, not as a primary main-navigation section. CopyNotes should remain a notes app first, not an agent dashboard.


### MCP Access Model

Agents may eventually be allowed to read all notes, but only with explicit user permission.

The default mental model should be:

- No silent unlimited access.
- The user chooses what level of access an agent has.
- The app clearly communicates when an agent can read broad content.
- Sensitive or destructive actions must be permissioned.

A future MCP permission system should support configurable access modes:

1. Read-only.
2. Limited write access.
3. Full write access.

To avoid overwhelming users, MCP should also offer simple permission presets:

- Read-only.
- Read + create tasks.
- Read + edit authorized notes.
- Full control.

Presets should be shortcuts, not hard limits. Advanced users should still be able to customize read scopes, write scopes, confirmation rules, and private-note access per agent.

It should also support configurable read scopes:

- Read all notes, blocks, snippets, tags, and preferences allowed by the user.
- Read only the current note/document.
- Read only notes or blocks with selected tags.
- Read only snippets.
- Read a specific approved set of notes, blocks, or snippets.

And configurable write scopes:

- Write anywhere when full permission is explicitly granted.
- Write only in selected notes/documents.
- Write only in notes or blocks with selected tags, such as a future `#agent` tag.
- Write only in an approved agent-work area if the product later adds one.
- Write only selected entity types, such as todos but not snippets.

Limited write access should probably be the safest default for most real use. For example, an agent may be allowed to write only inside selected notes, selected tags, or a specific agent-approved area.

### MCP Actions

The future MCP layer may expose tools for all important CopyNotes actions, but every action must respect permissions.

Possible MCP tool actions include:

- Create notes/documents.
- Create blocks or tasks inside a note.
- Update block content.
- Mark todos as done or undone.
- Add or remove tags.
- Create snippets.
- Insert snippets.
- Reorder blocks.
- Collapse or expand blocks if useful.
- Search notes, blocks, snippets, and tags.
- Export selected content if explicitly allowed.

Destructive actions such as delete, permanent delete, bulk update, or overwrite-style import should be treated as high-risk and should not be exposed casually.

The following MCP actions should require explicit confirmation unless the user later creates a very clear trusted automation rule:

- Deleting content.
- Editing a large amount of content at once.
- Exporting user information or backups.
- Reordering many blocks at once.
- Any action that could make a note difficult to recover or understand.

The first MCP implementation should prefer safety over speed. Agents can be useful without being allowed to silently reshape a user’s entire note system.

### MCP Review Mode

The product should be prepared for a future review mode where an agent can propose changes before they are applied.

Review mode is not required for MVP and is not required for the first MCP architecture-only phase, but the action model should not make it impossible.

A future proposed change should be representable as pending until the user accepts, rejects, or edits it. This would be useful for high-risk or high-volume actions such as large rewrites, bulk task creation, broad reordering, or structured project planning.

The first MCP implementation may rely on permissions and confirmations, but the architecture should leave room for proposal-based workflows.


### Agent Tasks

Agent tasks should not require a special visible block type in the first MCP design.

Agent tasks should work as normal todo/check blocks inside ordinary notes. This keeps the product simple for users: a task is still just a task.

However, the data model can add metadata later to indicate that a todo was created by an agent, assigned to an agent, updated by an agent, or linked to an agent workflow. This metadata should not force the UI to become more complex unless it helps the user understand what happened.

Agent-related tasks should eventually support richer states than only checked/unchecked. The preferred future task states are:

- Pending.
- In progress.
- Blocked.
- Done.

The data model should remain flexible enough to add more states later if agent workflows need them. The UI can stay simple at first, but the internal model should not make richer agent task states impossible.

### MCP Resources, Tools, And Prompts

The future MCP layer should be designed around three categories:

- Resources: safe, structured things agents can read as context, such as selected notes, blocks, snippets, tags, task lists, or project outlines.
- Tools: explicit actions agents can perform, such as creating a note, appending a block, checking a todo, tagging a block, or creating a snippet.
- Prompts: reusable workflows that help users run common agent routines, such as planning a feature, reviewing open tasks, or summarizing a project note.

CopyNotes should expose structured data rather than fragile raw UI text whenever possible. Agents should interact with notes and blocks through stable IDs, types, timestamps, tags, and parent-child relationships.

Useful future MCP prompt/workflow ideas include:

- Review my pending tasks.
- Create a work plan from this note.
- Summarize project progress.
- Convert a note into tasks.
- Prepare tasks for a coding agent.
- Review what changed since the last agent session.
- Find blocked tasks and suggest next actions.

These prompts should be treated as reusable workflows, not as proof that CopyNotes needs an AI chat interface in the MVP.

### MCP Audit History

Every agent action should be traceable.

The future MCP implementation should keep a complete action history for agent-created or agent-edited content. The history should include enough information for the user to understand what happened.

A future audit entry should include, when possible:

- Agent/client name.
- Action type.
- Target entity, such as note, block, snippet, or tag.
- Timestamp.
- Before/after information for edits when practical.
- Permission mode used.
- Whether the action was user-approved, automatic under permission rules, or rejected.

Agent history should be kept until the user clears it. The first design should not silently delete agent history after a fixed number of days. Later, CopyNotes can add configurable retention settings if history grows too large or if privacy requirements demand it.

This history is important because agents can make many changes quickly. Users need confidence that they can inspect, understand, and recover from agent actions.

The product should be prepared to show agent changes in three possible places:

- A general Activity view.
- A history view inside each note/document.
- Visual marks on blocks that were created or edited by an agent.

These three surfaces should remain optional and modular. If later testing shows that one of them creates too much noise, the product should be able to remove or hide it without changing the underlying audit model.

### MCP Rollback And Agent Sessions

CopyNotes should treat agent work as traceable sessions when MCP is implemented.

A session means a bounded period of agent activity, for example: `Codex worked on Plan App v1 from 15:00 to 15:20`.

The default rule should be simple: create a new agent session every time an agent connects. Later, CopyNotes can improve session grouping if needed, but the first model should make connection boundaries easy to understand.

Agent sessions should help the user understand what happened as a grouped event instead of only seeing many isolated edits.

The future audit/history model should support rollback in two ways:

- Undo/revert an individual agent action.
- Undo/revert a full agent session.

Rollback does not need to be part of the MVP, but the audit model should capture enough information to make rollback possible later. For edit actions, this usually means keeping before/after values or enough patch information to reconstruct the previous state.

Full version history and rollback can become part of a future paid/Pro feature set. The MVP should not carry a heavy versioning system unless it is needed for basic safety, but the data model should not block adding agent-session rollback later.

### MCP Private Notes

When MCP is added, CopyNotes should support private notes or protected content that agents cannot read unless the user gives special permission.

This is specifically important because CopyNotes may contain personal notes, passwords copied accidentally, private drafts, health notes, financial notes, or client information.

Private notes should override broad agent permissions by default. For example, even if an agent has `read all notes`, private notes should remain excluded unless the user explicitly allows that agent to access private content.

A note should be markable as private in two user-friendly ways:

- A clear button or setting inside the note.
- A tag-style option such as `#private`.

Internally, the privacy flag or access policy should be the source of truth. A `#private` tag can be a convenient UI shortcut, but MCP permissions should not depend only on plain text tags.

The data model should leave room for a privacy flag or access policy on notes and possibly blocks.


### MCP Server Modes

When MCP is actually implemented, CopyNotes may need to expose a real MCP server or server-like bridge for external agents.

Both paths should remain possible:

- A local MCP server through the future Tauri desktop app. This is the preferred first serious path because it keeps the user's data close to their device and gives clearer control.
- A cloud/backend MCP server after accounts and sync exist. This can be useful for cross-device use, teams, or cloud-based agents, but it requires stronger authentication, permissions, privacy rules, and audit history.

The web/PWA version may have technical limitations for MCP. The project should document those limitations instead of assuming the browser can safely do everything a desktop app or backend can do.

### MCP Timing

MCP is not part of the MVP.

The MVP should only prepare the architecture by keeping the data model, storage layer, action boundaries, and specs clean enough for MCP later.

The actual MCP implementation should happen after MVP validation and likely after sync/account architecture is clearer. This avoids building agent infrastructure before the core notes product is proven.

A possible order is:

1. MVP local-first notes product.
2. Sync/accounts phase.
3. MCP integration phase.

A limited local-only MCP prototype can be considered earlier only if it helps development or internal validation, but it should not distract from the MVP.

Recommended future specs:

- `specs/011-mcp-readiness.md`
- `specs/012-mcp-permissions-audit.md`

Together, those specs should define:

- Which CopyNotes data can be exposed as MCP resources.
- Which actions can be exposed as MCP tools.
- What permission levels exist.
- Whether MCP runs local-only, through desktop/Tauri, through a future cloud backend, or through multiple modes.
- Why local/desktop should be prioritized first unless a safer option appears.
- How connected agents/clients are registered, named, paused, revoked, and permissioned.
- Which permission presets exist and how advanced users can customize them.
- How notes and blocks can be marked private.
- How agent sessions are created, displayed, and ended.
- How long agent history is retained and how users can clear it.
- Which actions require confirmation.
- How agent task states work.
- Which reusable MCP prompts/workflows are supported.
- How agent-created or agent-edited content is labeled.
- How audit/history works for agent actions.
- How future rollback/version history could work, especially for paid/Pro features.
- What remains forbidden or out of scope.

## Product Boundaries

CopyNotes should not try to become a full Notion competitor.

The MVP should avoid:

- Full workspace databases.
- Complex tables.
- Heavy dashboards.
- User-facing AI chat or agents.
- Enterprise collaboration features.

The product should stay narrow: write, organize, copy, reuse, backup.

## Development Phases

CopyNotes should be built in clear phases. The phases should combine technical foundation work with feature-specific delivery.

Recommended phase structure:

1. Phase 0: SvelteKit project setup, architecture, tooling, PWA foundation, theme foundation, and Dexie/IndexedDB local storage foundation.
2. Phase 1: Core editor, block model, basic note/document flow, keyboard interactions, nesting, collapse/expand.
3. Phase 2: Local persistence, autosave, import/export foundation, and backup JSON format.
4. Phase 3: Copy workflows, rich clipboard output, outline copy, code/snippet block behavior.
5. Phase 4: Tags, search, snippets section, favorite snippets, and snippet insertion.
6. Phase 5: PWA polish, responsive behavior, backup UX, accessibility, tests, and release readiness.
7. Phase 6, post-MVP: Sync/accounts research and implementation if MVP validation justifies it.
8. Phase 7, post-sync or later: MCP integration for agent-readable resources, permissioned tools, prompts, and audit history.

The order can be adjusted if implementation reality requires it, but agents must keep each phase focused and avoid mixing unrelated feature work.

If this phase list and `specs/017-mvp-implementation-plan.md` disagree on order, the stage order in `017` is the one to follow. This phase list describes scope; `017` describes the concrete build sequence.

MCP should be prepared architecturally during earlier phases, but it should not become MVP scope.

The concrete MVP implementation plan is documented in `specs/017-mvp-implementation-plan.md`. Agents should use it to choose small, safe slices instead of attempting the full MVP at once.

## Specs

Every important feature should have its own spec file.

Specs should live in a `specs/` directory and use numbered filenames. The current planned spec set is:

- `specs/001-project-setup.md`
- `specs/002-data-model-storage.md`
- `specs/003-editor-blocks.md`
- `specs/004-copy-formatters.md`
- `specs/005-snippets.md`
- `specs/006-tags-search.md`
- `specs/007-export-import-backup.md`
- `specs/008-pwa-offline-theme.md`
- `specs/009-ui-navigation-onboarding.md`
- `specs/010-sync-readiness.md`
- `specs/011-mcp-readiness.md`
- `specs/012-mcp-permissions-audit.md`
- `specs/013-testing-release-quality.md`
- `specs/014-ui-library-decision.md`
- `specs/015-non-ui-library-decision.md`
- `specs/016-design-system.md`
- `specs/017-mvp-implementation-plan.md`
- `specs/018-backup-json-format.md`

The original compact list was missing a few areas that are important for agent-controlled development:

- UI/navigation/onboarding as its own spec.
- MCP permissions, audit history, sessions, private notes, and rollback as a separate safety spec.
- Testing, release, and quality bar as its own spec.

Before implementing a meaningful feature, an agent should read `AGENT.md` and the relevant spec. For very small safe changes, reading the exact spec can be optional, but the agent must still avoid contradicting `AGENT.md`.

Each spec should include:

- Objective.
- What enters.
- What does not enter.
- Model of data affected.
- User flows.
- Acceptance criteria.
- Minimum tests.
- Agent notes when useful.

Specs should be detailed enough to reduce agent mistakes. Implementation details can stay flexible only when there is a clear reason to improve the app without breaking the product direction.

## Application Architecture

The project should use a concrete folder structure, but agents may adjust it when there is a clear reason to improve the app.

The architecture should be explicit enough for AI coding agents to understand where each feature belongs. At the same time, it should stay flexible enough to evolve as CopyNotes grows.

Recommended structure:

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

Recommended module responsibilities:

- `blocks`: block types, hierarchy operations, nesting, ordering, collapse state, and shared block utilities.
- `editor`: editor UI, keyboard behavior, slash commands, selection/focus behavior, and editor-specific components.
- `storage`: Dexie database setup, repositories, migrations, autosave, and local data access.
- `snippets`: snippet creation, favorites, insertion, and snippet library behavior.
- `tags`: tag creation, assignment, filtering, and tag utilities.
- `search`: text search, tag search, indexing helpers, and future search upgrades.
- `export-import`: JSON backup, Markdown export, HTML export, import validation, and restore flows.
- `theme`: dark/light themes, tokens, user theme preference, and future visual customization.
- `sync`: future sync contracts and adapters. This module can be minimal in the MVP, but its existence should prevent sync assumptions from leaking everywhere later.
- `mcp`: future MCP contracts, permission models, resource/tool definitions, and audit-history boundaries. This module can remain documentation-only or minimal until the MCP phase.
- `pwa`: installability, service worker behavior, app manifest, and offline-readiness concerns.

Feature code should stay close to its module. Shared logic should only be extracted when it is truly reused or needed to keep the app understandable.

## State Management

Because the project uses Svelte and SvelteKit, the first choice for app state should be Svelte's native state tools.

Use Svelte state/stores for UI and session state such as:

- Current note/document.
- Current selection or focused block.
- Theme preference.
- Open panels or menus.
- Search query and filters.

Persisted data should not live only in UI state. Notes, blocks, tags, snippets, and settings that must survive refreshes should flow through the storage layer.

Avoid Redux-style state management for the MVP. Do not add a large external state library unless the app grows enough to clearly need it.

## Local Database

Use Dexie.js over IndexedDB for the MVP.

In simple terms: IndexedDB is the browser's local database, and Dexie is a cleaner tool that makes IndexedDB easier and safer to use. CopyNotes should use Dexie so the app can store structured notes, blocks, tags, snippets, and backup metadata without writing low-level IndexedDB code everywhere.

The storage layer must be designed so a future cloud/sync backend can be added later. Supabase is a possible candidate, but the backend choice should remain open until sync is actually planned.

Important rule: local storage logic and future cloud sync logic should not be mixed directly into UI components.

The preferred direction is:

- Dexie + IndexedDB for the local-first MVP.
- Stable IDs and timestamps from the beginning.
- Repository-style functions for reading and writing data.
- A future sync adapter that can connect local data to a backend.
- Supabase, or another backend, can be evaluated later for accounts, cloud backup, and cross-device sync after MVP validation.

## Testing Strategy

Testing should use:

- Vitest as the main testing base for logic.
- Testing Library only for key Svelte components and important UI behavior.
- Playwright only for critical end-to-end flows.

Priority order:

1. Use Vitest for risky product logic such as block hierarchy, drag and drop calculations, copy formatting, search helpers, import/export validation, and storage adapters.
2. Use Testing Library for components where behavior matters, such as editor blocks, slash commands, snippet insertion, tag controls, and backup dialogs.
3. Use Playwright for the few flows that must work as a real user would experience them: create note, write nested bullets, copy outline, save locally, reload, export backup, import backup, and install/use PWA where practical.

Do not over-test visual details in the MVP. Focus tests on behavior that would cause real data loss, broken writing, broken copy, or broken backup if it failed.

## MVP Completion Definition

The MVP is considered ready when it includes:

- Notes/documents.
- Text blocks.
- Bullet blocks.
- Todo/check blocks.
- Code/snippet code blocks.
- Nested bullets.
- Collapse and expand.
- Drag and drop reordering.
- Local autosave.
- Backup/export.
- JSON import for CopyNotes backups.
- Copy actions.
- Outline-style copy behavior.
- Snippets.
- Favorite snippets.
- Snippet insertion.
- Tags.
- Search by text and tags.
- PWA installability.
- Dark and light themes.

The MVP does not require sync, accounts, user-facing AI, MCP integration, collaboration, databases, or complex importers.

## Visual Priority

The first implementation should prioritize correct behavior over visual polish.

However, the UI must not be careless. It should be simple, usable, responsive, and prepared for later visual refinement. Agents should avoid hard-coding visual decisions in a way that makes later design improvements painful.

The preferred visual foundation is:

- Minimal.
- Dark-first.
- Bear-inspired.
- Calm and focused.
- Themeable.

## Quality Bar

Before any phase or feature is considered complete, the agent must verify:

- The app runs without errors.
- Basic tests exist for risky logic.
- Manual flows were checked.
- Relevant docs or specs were updated.
- Existing behavior was not broken.

High-risk areas should receive extra care:

- Local persistence.
- Import/export.
- Backup restoration.
- Nested block hierarchy.
- Drag and drop reordering.
- Copy formatting.
- Tag/search behavior.
