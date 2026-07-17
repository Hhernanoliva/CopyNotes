# CopyNotes Specs Index

This folder contains the product and technical specs for CopyNotes.

Agents should read `AGENT.md` first, then the relevant spec before meaningful implementation work. For tiny safe changes, reading the exact relevant spec may be optional, but the agent must still avoid contradicting `AGENT.md`.

## Spec Order

1. `001-project-setup.md`
2. `002-data-model-storage.md`
3. `003-editor-blocks.md`
4. `004-copy-formatters.md`
5. `005-snippets.md`
6. `006-tags-search.md`
7. `007-export-import-backup.md`
8. `008-pwa-offline-theme.md`
9. `009-ui-navigation-onboarding.md`
10. `010-sync-readiness.md`
11. `011-mcp-readiness.md`
12. `012-mcp-permissions-audit.md`
13. `013-testing-release-quality.md`
14. `014-ui-library-decision.md`
15. `015-non-ui-library-decision.md`
16. `016-design-system.md`
17. `017-mvp-implementation-plan.md`
18. `018-backup-json-format.md`
19. `019-editor-ux-fixes.md`
20. `020-inline-formatting-toolbar.md`
21. `021-dates-agenda.md`
22. `022-sidebar-organization.md`

## Required Sections For Specs

Each spec should include:

- Objective.
- What enters.
- What does not enter.
- Model of data affected.
- User flows.
- Acceptance criteria.
- Minimum tests.
- Agent notes when useful.

Specs should be detailed enough to reduce agent mistakes, while implementation details may remain flexible when there is a clear reason to improve the app.
