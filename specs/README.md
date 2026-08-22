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
23. `023-mcp-fases.md`
24. `024-motion-quiet-motion.md`
25. `025-macos-desktop-readiness.md`
26. `026-text-drag-move.md`
27. `027-settings-text-size.md`
28. `028-agent-beta-local-mcp.md`
29. `029-cloud-sync-path.md`
30. `030-zero-knowledge-sync.md`
31. `031-selection-type-change.md`
32. `032-inline-text-size.md`
33. `033-keyboard-formatting-toolbar.md`
34. `034-google-sign-in.md`
35. `035-device-pairing-vault.md`
36. `036-public-google-signup.md`
37. `037-newsletter-consent-privacy.md`
38. `038-shared-note-ticket.md`
39. `039-restore-vs-cloud.md`
40. `040-backup-compatibility-contract.md`
41. `041-images-in-notes.md`
42. `042-link-row-selection-ux.md`
43. `043-zoom-into-row.md`

## Pedido, sin spec todavía

Ideas que Hernán pidió y que **no** se empiezan hasta tener spec, porque cada una
tiene una decisión de producto abierta que no puede resolver quien implemente.

### Que CopyNotes entienda Markdown en las notas

Pedido el **2026-08-19**, mirando los `**asteriscos**` crudos en Configuración ›
Actualizaciones.

Eso último **ya está resuelto** y no es esto: `inlineMarks()` en
`src/lib/desktop/update-check.js` entiende `**negrita**`, `*cursiva*` y
`` `código` `` para pintar el changelog. Es texto nuestro, formato conocido, tres
lugares. Lo que falta es Markdown **en las notas de la persona**.

**La decisión que bloquea, y es de Hernán:** hoy un `#` suelto abre el buscador
de etiquetas (`src/lib/editor/Editor.svelte`, *"a standalone # opens the tag"*).
Si `# ` hiciera un título como en Markdown, **hay que decidir cuál gana**. No es
una pregunta técnica.

**La segunda decisión: ¿al escribir o al pegar?** Recomendación registrada:
**al pegar** es el 90% del valor con el 20% del riesgo — pegás algo que te dio un
chatbot y entra con sus negritas y sus títulos en vez de con asteriscos.
Convertir **en vivo** toca el editor y el historial de Deshacer, que ya costaron
caro (specs `019`, `020`, `033`).

**Lo que ya existe y no hay que rehacer:**
- Atajos tipo Markdown al escribir: `- ` y `* ` hacen viñeta
  (`src/lib/editor/triggers.ts`, `BULLET_PREFIXES`).
- **La salida ya está entera**: `src/lib/format/inline-markdown.ts` convierte el
  html guardado del bloque a Markdown. Falta **el camino de vuelta**.
- ⚠️ Un importador de Markdown **tiene que desembocar en `format/ingest.ts`**
  (allow-list en `sanitize.ts`), nunca escribir en `block.html` por su cuenta.

### Carpetas dentro de carpetas

Diferido a propósito: es pesado de diseño (la profundidad al arrastrar y la
guardia contra ciclos), y está reservado para diseñarlo con calma. No empezar sin
spec.

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
