# 011 - MCP Readiness

## Objective

Prepare CopyNotes so future external agents can use it as a context and task hub through MCP, without adding a user-facing AI chat or MCP server in the MVP.

## What Enters

- Documentation-only or minimal `src/lib/mcp/` module.
- Clear boundaries between data resources and actions.
- Draft concepts for MCP resources, tools, and prompts.
- Future local/desktop-first MCP direction.
- Future cloud MCP path after accounts/sync.
- Agent tasks represented as normal todos/checks with metadata readiness.
- No MCP implementation in MVP.

## What Does NOT Enter

- No AI chat inside CopyNotes.
- No MCP server in MVP.
- No external agent connection in MVP.
- No cloud backend just for MCP.
- No agent autonomy without permissions.

## Model Of Data Affected

Future MCP may expose:

- notes as resources
- blocks as resources
- snippets as resources
- tags as resources
- tasks/todos as actionable blocks
- prompts/workflows as templates

Future MCP tools may act on:

- create note
- create block/task
- update block
- mark todo done
- tag content
- create snippet
- reorder blocks

## User Flows

Future flows:

- User connects an agent/client.
- User grants scoped permissions.
- Agent reads allowed CopyNotes context.
- Agent creates or updates allowed notes/tasks.
- User sees what changed.

## Acceptance Criteria

- MVP architecture keeps data access and app actions clean enough to expose later.
- MCP concepts do not pollute normal user UI.
- Agent tasks can be modeled with normal todos/checks.
- MCP timing remains post-MVP and probably post-sync/accounts.
- The codebase has a clear place for future MCP contracts.

## Minimum Tests

MVP does not need MCP tests. If minimal MCP contracts are created, add Vitest tests for:

- resource shape serialization
- permission gate helpers
- action input validation helpers

## Agent Notes

MCP is a strategic future capability. Do not let it distract from the main MVP: writing, organizing, copying, snippets, tags, backup, and offline use.

The MCP rollout **order** and the deliberately conservative first version are mapped in `023-mcp-fases.md`; this spec stays the detail of *what gets exposed*.

## Detail Absorbed From AGENT.md (2026-07-16)

- **Audience:** MCP is not only for developers. Target users are (1) general users connecting AI clients like ChatGPT or Claude, (2) developers using coding agents (Claude Code, Codex, Cursor, OpenCode), (3) teams organizing agent tasks. The first implementation need not serve all equally, but the architecture must not assume developers-only.
- **Connection priority order:** 1. local/desktop (Tauri) MCP where the user controls app and data directly — the preferred first serious path; 2. web/PWA integration only if browser limitations and security are acceptable (document the limitations, do not assume the browser can do everything); 3. backend/cloud MCP only after accounts, sync, and permissions are mature.
- **Agent task states:** agent tasks stay normal todo blocks, but the model should later support richer states: pending, in progress, blocked, done — extensible if agent workflows need more. UI can stay simple; the internal model must not make these states impossible. _Superseded for the shipping product surface by `023`'s binary-checkbox decision (Hernan, 2026-07-19): no `status` field ships; a todo's checked/unchecked state is the model. This bullet only records that the data model must not make richer states impossible later._
- **Prompt/workflow ideas** (reusable workflows, not an AI chat): review my pending tasks; create a work plan from this note; summarize project progress; convert a note into tasks; prepare tasks for a coding agent; review what changed since the last agent session; find blocked tasks and suggest next actions.
- **Product rule:** MCP extends CopyNotes without turning it into a complicated AI workspace. Agents interact through stable IDs, types, timestamps, tags, and parent-child relationships — structured data, never fragile raw UI text.
