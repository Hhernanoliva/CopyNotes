# Puerta única de tareas — frescura garantizada + bitácora de eventos (Milestone S)

**Fecha:** 2026-07-24
**Estado:** aprobado por Hernán (diseño conversado en sesión)
**Contexto previo:** specs/028-agent-beta-local-mcp.md, docs/superpowers/plans/2026-07-23-mcp-real-y-cimientos.md (Milestone S quedó gateado ahí; este documento lo destraba con una forma distinta a la original).

## Problema

`export.json` (la lista de tareas que lee el agente MCP) solo se reescribe cuando algo llama
`bumpAgentData()`. Hoy llaman: la capa de tareas (`src/lib/tasks/actions.ts`), el toggle de
visibilidad, y el borrado/import de notas. El editor NO llama: completar una tarea
(`handleToggleChecked`), crear una (`handleEnter`, `/todo`, pegar líneas), editar su texto,
convertirla o borrarla escriben los bloques directo contra el almacén. Deshacer/Rehacer
(`putBlock`/`softDeleteBlock`) y la edición del título de la nota tampoco refrescan.

Resultado: el agente puede ver una lista vieja — una tarea nueva que no aparece, una completada
que sigue "pendiente", una borrada que sigue ahí, un título desactualizado.

## Decisiones tomadas (con Hernán)

1. **Opción elegida: red de seguridad + eventos** (no el ruteo total del editor por la capa).
   La frescura se garantiza en el piso más bajo (el almacén); la bitácora se escribe solo para
   eventos importantes. Mata la causa raíz: ningún camino futuro puede volver a dejar la lista vieja.
2. **Bitácora de acciones manuales: eventos importantes.** Completar / reabrir / crear /
   convertir-a-tarea dejan línea de bitácora con actor `user`. Escribir texto, borrar,
   convertir a texto y Deshacer/Rehacer NO dejan línea.
3. **Borrar no se registra:** la tarea desaparece del export (no hay dónde "verla borrada");
   lo garantizado es que desaparezca.
4. **Deshacer un "completar" deja la línea vieja en la bitácora.** Inconsistencia menor aceptada
   y conversada: el tilde vuelve atrás, la línea "completada" queda.

## Diseño

### 1. Red de seguridad (frescura) — en el almacén

Cada función de **escritura** de `src/lib/storage/blocks.ts` y `src/lib/storage/notes.ts` llama
`bumpAgentData()` al completar su escritura:

- `blocks.ts`: `createBlock`, `putBlock`, `updateBlock`, `applyInsertionPlan`,
  `softDeleteBlock`, `softDeleteBlocks`. (`toggleTodoCascade` queda cubierta vía `updateBlock`.)
- `notes.ts`: `createNote`, `updateNote`, `softDeleteNote`.

`bumpAgentData` vive en `src/lib/bridge/signal.svelte.ts`, módulo hoja sin dependencias — el
almacén puede importarlo sin ciclo, y compila en el entorno node de los tests (precedente G7).

Cubre por construcción: tipeo, Enter, borrar, pegar, insertar snippet, Agenda, Deshacer/Rehacer,
título de nota, y cualquier código futuro que escriba por el almacén. Los bumps redundantes
(la capa de tareas también bumpea) son inocuos: el contador solo dispara un re-export agrupado.

Fuera del almacén quedan escrituras masivas que ya bumpean por su lado: import de backup y
merge pasan por `handleDataChanged` / `deleteNote` en `+page.svelte` (bumpean desde el fix C1).
**A verificar en el plan:** si la reposición del diario al arrancar (journal replay,
`storage/journal.ts`) escribe contra las tablas sin pasar por los repos, agregar un
`bumpAgentData()` único al terminar la reposición.

### 2. Re-export agrupado (debounce) — en el puente

`BridgeLifecycle.svelte` hoy re-exporta inmediatamente en cada bump. Cambia a **trailing
debounce ~500 ms**: muchos bumps seguidos (tipeo, cascada, pegado) → una sola escritura de
`export.json` al calmarse. El `$effect` conserva el patrón actual (leer `agentData.version`,
programar el export); el cleanup cancela el timer pendiente.

- El export de **montaje** (version 0 al arrancar) se mantiene: acota el atraso si la app se
  cerró con un timer pendiente.
- El re-export tras **ingesta del agente** (callback de `startBridgeWatch`) sigue inmediato,
  sin debounce — ese camino no cambia.
- Privacidad: **ocultar** una nota es inmediato, no debounced. `bumpAgentDataUrgent()`
  (señal `agentData.urgent`) fuerza un `writeAgentExport()` al instante y cancela el debounce
  pendiente, así una nota recién ocultada no queda en `export.json` ni ~500 ms. Mostrar una
  nota (no sensible) usa el camino normal agrupado.

### 3. Bitácora de eventos del usuario — por la capa de tareas

La capa (`src/lib/tasks/actions.ts`) gana dos funciones y una extensión:

- **`setTaskChecked({ noteId, blockId, actor = 'user' })`** — nueva. Carga los bloques de la
  nota, computa `planToggleChecked` (la cascada existente de `src/lib/blocks/cascade.ts`:
  baja a los hijos todo, sube recalculando padres) y aplica **cada** cambio vía `traceWrite`
  con acción `done` / `reopened` según el valor final de cada bloque. Devuelve el plan
  aplicado (o `null` si el target no es todo), para que el editor actualice su estado en
  memoria como hoy.
  - La rutean: `Editor.handleToggleChecked` (reemplaza `planToggleChecked` + `applyUpdates`)
    y `AgendaPanel` (reemplaza `toggleTodoCascade`).
  - `storage/blocks.ts#toggleTodoCascade` queda sin callers de producción → se elimina
    (sus tests migran a la función nueva de la capa).
- **`convertToTask({ blockId, actor = 'user' })`** — nueva. `traceWrite` con
  `changes: { type: 'todo', checked: false }`, acción `created`, `text` = contenido actual.
  La rutean: el comando `/todo` del slash menu y el cambio de tipo a todo
  (`setBlockType` cuando el destino es `todo`).
- **`createTask` acepta `order` opcional** — pass-through a `createBlock` (hoy siempre
  apéndice al final; el editor necesita insertar en posición). La rutean:
  `Editor.handleEnter` cuando el tipo resultante es `todo`, y `handlePasteLines` para las
  líneas pre-tipadas como todo (conservando su `checked` — extensión: `createTask` acepta
  `checked` opcional, default `false`). Borde del pegado: cuando la primera línea reutiliza
  el bloque vacío actual y es todo, eso es una conversión → va por `convertToTask` (más la
  edición de contenido), no por `createTask`.

Sin línea de bitácora (solo red de seguridad): edición de texto de una tarea, todo→otro tipo,
borrado (menú, Backspace, selección múltiple), Deshacer/Rehacer, drag/indent/outdent/mover,
fecha (`dueDate`), colapsar.

`recordSnapshot()` (Deshacer del editor) se mantiene en cada handler exactamente como hoy: la
capa escribe bloques con los mismos campos que antes, así que Deshacer restaura igual.

### 4. Qué NO cambia

- El filtro de privacidad del export (`toAgentPayload`: solo notas `agentVisible === true`,
  solo bloques `todo`, nunca prosa) queda intacto.
- Buzón (inbox/outbox), watcher Rust, servidor MCP, ingesta y dedupe: sin cambios.
- El gate de ingesta (`bridge/ingest.ts`) sigue siendo la única entrada para texto del agente.

## Errores y bordes

- `bumpAgentData()` en los repos se llama **después** de la escritura Dexie resuelta; si la
  escritura lanza, no hay bump (no se anuncia lo que no se escribió).
- `setTaskChecked` sobre un bloque que dejó de existir → `planToggleChecked` devuelve `null`
  → no escribe ni bumpea (mismo contrato que `toggleTodoCascade` hoy).
- `traceWrite` ya protege bloque+bitácora en una transacción; la cascada aplica N transacciones
  (una por bloque afectado) — si una falla a mitad, los bloques ya escritos quedan consistentes
  cada uno con su línea (mismo perfil de riesgo que el `applyUpdates` actual, que tampoco es
  atómico entre bloques).
- El debounce usa `setTimeout` del entorno; en unmount se cancela. No hay flush en quit:
  aceptado, acotado por el export de montaje del próximo arranque.

## Pruebas (TDD)

1. **Repos bumpean** (unit, mutation-checked como G7): cada función de escritura de
   `blocks.ts`/`notes.ts` incrementa `agentData.version`; los reads no.
2. **Capa** (unit, storage real fake-indexeddb): `setTaskChecked` marca padre → hijos quedan
   checked y cada uno tiene su línea `done` con actor `user`; desmarcar hijo → padre se
   reabre con línea `reopened`; target no-todo → `null`, sin escrituras, sin bump.
   `convertToTask` → tipo cambia + línea `created`. `createTask` respeta `order` y `checked`.
3. **Debounce** (unit, fake timers): N bumps en ráfaga → un solo `writeAgentExport`;
   el último bump siempre termina exportando (trailing garantizado).
4. **Editor** (e2e existentes + nuevas): las 2 e2e de agente siguen verdes; nueva e2e:
   completar una tarea en el editor deja línea `done` visible en la bitácora del bloque
   (el archivo `export.json` no es observable en e2e de navegador — se asume por unit 1+3).
5. **Suite completa** verde (653 unit, e2e, `pnpm check` sin errores nuevos, mcp 34).

## Fuera de alcance

- Registrar ediciones de texto en bitácora (descartado por ruido).
- Compactar/pruning de bitácora y processedChanges (follow-ups ya listados en progress.md).
- Milestone 029 (cloud).
