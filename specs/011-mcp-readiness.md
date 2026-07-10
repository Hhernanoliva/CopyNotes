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
