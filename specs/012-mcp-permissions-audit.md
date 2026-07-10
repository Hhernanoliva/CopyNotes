# 012 - MCP Permissions, Audit And Control

## Objective

Define how future agent access should be controlled, reviewed, audited, paused, and rolled back. This is separate from general MCP readiness because permissions and audit history are safety-critical.

## What Enters

- Connected agents as app-like connections.
- Agent identity model.
- Permission presets.
- Configurable read scope.
- Configurable write scope.
- Confirmation for dangerous actions.
- MCP/Agentes settings section.
- Pause/resume/revoke agent.
- Agent sessions.
- Complete agent action history.
- Future rollback design.
- Private/protected notes.

## What Does NOT Enter

- Not MVP.
- No silent full-access agents by default.
- No agent reading private notes without special permission.
- No rollback implementation required until future phase, possibly Pro.
- No complex team admin system initially.

## Model Of Data Affected

Future entities or metadata may include:

### Connected Agent

- `id`
- `name`
- `clientType`
- `connectedAt`
- `lastActivityAt`
- `status`: active, paused, revoked
- `permissions`

### Agent Session

- `id`
- `agentId`
- `startedAt`
- `endedAt`
- session summary/title

### Agent Action History

- `id`
- `agentId`
- `sessionId`
- action type
- target entity
- before/after summary or version reference
- timestamp
- status

### Private Note Metadata

- internal privacy flag or policy
- optional `#private` tag as UI shortcut

## User Flows

- User opens Settings > MCP / Agentes.
- User sees connected agents.
- User pauses an agent.
- User resumes an agent.
- User revokes an agent.
- User assigns permission preset.
- User limits reading to current note, all notes, snippets, tags, or selected scope.
- Agent attempts dangerous action and user confirms or rejects.
- User reviews activity history.
- Future user rolls back one action or a session.
- User marks note private and agent cannot read it without special permission.

## Acceptance Criteria

- Each agent has its own permissions.
- Permission presets exist conceptually: read-only, read + create tasks, read + edit authorized notes, full control.
- Dangerous actions require confirmation: delete, large edit, export, large reorder.
- Activity can be shown globally, per note, and visually on blocks, with modular UI so any view can be removed later.
- History is kept until user clears it.
- Versioning/rollback is prepared but not forced into MVP.
- Private notes are enforced by internal metadata, not only a tag.

## Minimum Tests

Future tests should include:

- permission preset mapping
- read scope allow/deny
- write scope allow/deny
- private note protection
- dangerous action confirmation requirement
- audit log creation
- pause/revoke prevents actions

## Agent Notes

Agent control is a trust feature. The user must always be able to understand and stop what agents are doing.
