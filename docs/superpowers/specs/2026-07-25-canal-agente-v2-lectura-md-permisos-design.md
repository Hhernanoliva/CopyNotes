# Canal agente v2 — lectura Markdown, permisos y privacidad — documento de diseño

**Fecha:** 2026-07-25
**Estado:** diseño aprobado por Hernán (3 partes, una por una). Sustituye las "preguntas abiertas" de `2026-07-25-eficiencia-tokens-canal-agente-design.md` — ese doc aporta la medición base; este cierra las decisiones.
**Por qué:** la economía de tokens del canal agente es la ventaja competitiva de CopyNotes frente a Notion/Workflowy. Este diseño baja la lectura de una nota de ~2.772 tokens (medición real, sin proyectar) a ~211, y define hasta dónde llega el poder del agente.

---

## Parte 1 — Qué VE el agente (lectura en Markdown, proyección recortada)

### Decisiones

Por cada nota marcada "Visible para agentes" (🤖), el agente lee **Markdown**, no JSON:

```
## 👋 Bienvenido a CopyNotes  ·  Trabajo
Texto de contexto de la nota (los bloques de texto que escribió el usuario)…

- [ ] d88f7bd2 Probar integración MCP con agentes Claude
- [ ] e58eff54 BLOQ: Agente recibe tareas desactualizadas…
```

**Se incluye:**
- Título de la nota (~6 tok).
- **Nombre de la carpeta** a la que pertenece (`folderId` → nombre; ~3 tok). Sin árbol navegable ni tools de carpetas.
- **Tareas pendientes** (`checked !== true`): id corto (8 chars) + texto.
- **Texto de la nota como contexto**: bloques `text`, `bullet`, `heading`, `code` (código en fence ```). Es la parte que escala con lo que el usuario escriba; decisión consciente — es exactamente lo que el usuario quiere que el agente vea.

**Se excluye (ahorro medido + privacidad):**
- Tareas **completadas** — no viajan.
- **Comentarios** (`block.note`) — nunca salen de la app (ver Parte 3).
- Notas de bitácora escritas por el agente — no se le devuelven al agente (no re-lee sus propias anotaciones). Las **tareas pendientes sí se muestran todas**, incluidas las que creó el agente (decisión 2026-07-25: ocultarlas causaría duplicados y tareas que el agente no puede completar).
- UUIDs de 36 chars → **id corto de 8** (prefijo). El server MCP mantiene el mapa corto→UUID y re-expande al recibir una tool call. El agente jamás ve el UUID largo.
- Timestamps ISO.
- **Bitácora inline** → bajo demanda: tool/recurso aparte (`get_task_history` o similar) que el agente pide solo si lo necesita.

### Medición que respalda (nota real de Hernán, 11 tareas, 9 pendientes)

| Formato | ~tokens |
|---|---|
| Hoy (nota entera sin proyectar) | ~2.772 |
| JSON verboso proyectado | ~295 |
| JSON claves cortas | ~221 |
| **Markdown + id corto (elegido)** | **~211** |
| Markdown índice numérico (descartado) | ~193 |

- Markdown gana además en tokens reales: el texto con comillas/saltos no se escapa (`\"`, `\n`) como en JSON. El contexto (prosa/código) es donde más se nota.
- Índice numérico descartado: ahorra ~18 tok pero el número se corre cuando cambian las tareas → riesgo de actuar sobre la tarea equivocada. El id corto es estable.
- Script de medición: se corrió sobre el `export.json` real del buzón (2026-07-25).

### Arquitectura

- **Solo la lectura es Markdown.** Las tools (escritura) siguen siendo tool calls MCP estructuradas (JSON), chicas y validadas. El Markdown leído nunca se re-parsea.
- La proyección vive en `mcp/lib/resources.js` (nueva función export→markdown) sobre un `export.json` que pasa a incluir prosa + carpeta (cambio en `src/lib/bridge/export.ts`).
- Mapa id-corto→UUID: en el server MCP (`mcp/lib/`), construido al leer el export; colisión de prefijo → extender largo del id para esa tarea.

## Parte 2 — Qué ESCRIBE el agente (anotación IA visible)

### Decisiones

- Poder de escritura **sigue siendo solo sobre tareas**: `create_task`, `complete_task`, `add_note`. Sin tools de edición de prosa. Modelo abierto a revisión tras las pruebas.
- La "expresión" del agente **reutiliza el canal que ya existe**: `add_note` → bitácora (`action: 'note'`, con `actor`). Sin tool nueva, sin campo nuevo.
- **Cambio de UI:** la nota de bitácora escrita por un agente pasa a verse **inline debajo de la tarea**, en **amarillo + cursiva + badge "IA"** — junto al comentario del usuario, sin tocarlo.
- El **Comentario** (`block.note`, mod+Enter) queda **exclusivo del usuario**. Descartado que el agente escriba ahí: es un único campo sin autor — el agente pisaría el texto del usuario y no habría forma de saber qué pintar de amarillo.
- Bloques con `createdBy: 'agent'` (creados por `create_task`) ya se distinguen por ese campo existente; la marca visual "IA" sale de ahí.
- El estilo visual (amarillo/cursiva/badge, tokens Quiet Ink) se define en Stage 2/3 del flujo de diseño al construir; aquí solo el comportamiento.

## Parte 3 — Privacidad (modelo endurecido)

El modelo pasa de doble candado a **candado por tipo de contenido**:

| Contenido | Protección |
|---|---|
| Prosa (bloques de texto) de nota 🤖 | **Candado simple**: la bandera. Sale solo si el usuario marcó la nota — opt-in consciente. |
| Prosa de nota NO 🤖 | No sale nada: ni título, ni prosa, ni tareas. |
| Comentarios (`block.note`) | **Doble candado**: se descartan físicamente en el export, de cualquier nota. Nunca salen. |
| Tareas completadas, bitácora inline, timestamps, UUIDs | No viajan (economía + menos superficie). |

**Endurecimiento (tests obligatorios):**
1. Test: nota sin 🤖 no aporta nada al export.
2. Test: `block.note` jamás aparece en el export, bajo ninguna condición.
3. Test: las notas de bitácora del agente no se devuelven en la proyección de lectura (las tareas pendientes creadas por el agente sí — ver Parte 1).
4. `specs/028-agent-beta-local-mcp.md` se actualiza como fuente de verdad del nuevo modelo; `docs/guia/17-agentes.md` en el mismo commit de cada cambio visible.

## Fuera de alcance (explícito)

- Edición de prosa por el agente (tools de escritura de texto libre).
- Árbol de carpetas navegable / tools de carpetas.
- Campo "Instrucciones para el agente" por nota (Dirección B del doc de eficiencia) — sigue en carpeta para después de probar esto.
- `resources/list_changed` (auto-refresco) — pendiente previo, no cambia con este diseño.

## Orden de construcción sugerido (para el plan)

1. Export ampliado (`export.ts`): prosa + carpeta + filtros (sin checked, sin comentarios, sin contenido de agente). Tests de privacidad primero (TDD).
2. Proyección Markdown + mapa id corto (`mcp/lib/`). Tests de forma y de re-expansión de ids.
3. Bitácora bajo demanda (tool nueva de historial).
4. UI: nota del agente inline amarilla (Stage 2/3 del flujo de diseño).
5. Specs 028 + guía 17 en cada paso.

## Archivos clave

- `src/lib/bridge/export.ts` — proyección de salida (qué sale de la app).
- `mcp/lib/resources.js` — export → Markdown; id corto.
- `mcp/lib/tools.js` + `mcp/server.js` — tools (sin cambios de protocolo; re-expansión de id; tool de historial).
- `src/lib/tasks/actions.ts` (`addTaskNote`) — canal de anotación IA existente.
- `src/lib/editor/BlockRow.svelte` — render inline de la nota del agente (amarillo/IA).
- `specs/028-agent-beta-local-mcp.md` — modelo de privacidad (actualizar).
- `docs/guia/17-agentes.md` — guía de usuario (actualizar).

**Recordatorio de entorno:** `mcp/` quedó instalado `--prod` para el empaquetado — antes de desarrollar ahí: `cd mcp && pnpm install`.
