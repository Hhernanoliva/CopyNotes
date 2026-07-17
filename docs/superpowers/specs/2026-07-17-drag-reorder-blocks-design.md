# Arrastrar renglones para mover y anidar — Diseño

**Fecha:** 2026-07-17
**Estado:** aprobado (brainstorming)
**Relacionado:** `specs/003-editor-blocks.md`, `specs/015-non-ui-library-decision.md`, `specs/017-mvp-implementation-plan.md`, `src/lib/blocks/reorder.ts`, `src/lib/blocks/indent.ts`, `src/lib/blocks/selection.ts`

## Objetivo

Mover renglones con arrastre del mouse o del dedo, además del actual Alt+Flechas. El arrastre reordena **y** cambia el anidamiento (estilo Notion/Workflowy): la posición horizontal donde se suelta decide si el renglón queda como hijo, hermano, o sale del padre.

## Decisiones tomadas (brainstorming)

- **Alcance:** reordenar **+ anidar**. La X del cursor define la profundidad de destino.
- **Agarre:** **mantener presionado** (long-press). Sin manija visible. Sirve para escritorio y táctil con un solo camino de código.
- **Multi-selección:** si hay varios renglones seleccionados (Shift+Flechas) y se arrastra uno del grupo, se mueve **todo el grupo**. Coherente con Alt+Flechas.
- **Táctil:** en alcance. Se usa **Pointer Events**, no el drag-and-drop nativo del navegador (malo en táctil).
- **Enfoque técnico:** módulo propio a mano (enfoque A), no librería. El anidar-por-posición-horizontal es código manual en cualquier librería; hacerlo propio evita dependencia, reusa las funciones puras existentes y queda cubierto por tests. Esto satisface el "elegir por prototipo enfocado" que pide spec 015.

## Arquitectura

Dos piezas nuevas + reuso de lo existente. No se toca el `startDrag`/`dragOver` actual de Editor.svelte (ese arrastra para **seleccionar** varios renglones — colisión de nombres, se deja intacto).

### 1. `src/lib/blocks/drop.ts` (función pura, nueva) — el cerebro

Firma conceptual:

```
planDrop(blocks, draggedIds, targetId, edge, depth) -> { updates } | null
```

- `blocks`: lista completa de bloques de la nota.
- `draggedIds`: ids que se mueven. Se reducen a sus **raíces** (los hijos siguen por referencia de id, no se listan).
- `targetId`: renglón visible junto al cual se suelta.
- `edge`: `'above' | 'below'` — de qué lado del destino cae.
- `depth`: profundidad deseada (derivada de la X del cursor), ya limitada (clamp) a lo válido en esa posición.

Devuelve `updates` (`{ id, parentBlockId, order }[]`) con el renumerado de hermanos para que el orden quede sin huecos — igual criterio que `reorder.ts`. Devuelve `null` si el destino es inválido (soltar en sí mismo o en un descendiente).

No toca el DOM. Testeable en Node.

### 2. `src/lib/editor/dragReorder.svelte.js` (nuevo) — el músculo

Maneja Pointer Events y expone estado reactivo (`$state`) para que el Editor pinte el indicador:

- Temporizador de long-press (~350ms).
- Cancelación por movimiento (>~6px antes de disparar) → era seleccionar-texto/scroll.
- Seguimiento del cursor: calcula `targetId` + `edge` desde la Y, y `depth` desde la X.
- Auto-scroll al llegar a los bordes de la lista.
- Al soltar: llama a `planDrop`, entrega las `updates` al Editor. Al cancelar (`Escape` o soltar fuera): no hace nada.

### 3. Reuso existente

- `applyUpdates` — ya persiste updates de bloques.
- `recordSnapshot` — un solo snapshot por arrastre (deshacer atómico).
- `sortByOrder`, reglas de jerarquía, `orderedSelectionRoots` (mismo criterio que copiar).

## Interacción

### Iniciar (long-press)
- Al apoyar sobre un renglón arranca temporizador ~350ms.
- Movimiento >~6px antes de disparar → cancela (seleccionar-texto o scroll; no molesta al editar).
- Aguantar quieto ~350ms → vibración corta (táctil, si disponible) + entra modo arrastre; el renglón se "despega".

### Durante
- **Fantasma** semitransparente del renglón (o del grupo) sigue al cursor.
- **Línea indicadora** marca el hueco de destino entre dos renglones.
- **X del cursor → sangría:** a la derecha, "va como hijo de este"; a la izquierda, "sale del padre". Solo profundidades válidas (no más profundo que hermano-del-de-arriba + 1); se limita con clamp.
- Auto-scroll en bordes.

### Soltar
- Suelta → aplica plan → fantasma desaparece, renglón aparece en su lugar nuevo.
- Suelta fuera de la lista o `Escape` → cancela, nada se mueve.

### Estética (Quiet Ink)
- Indicador: línea fina, color `accent`.
- Fantasma: sombra suave. Nada estridente.

## Casos borde

1. **Soltar en sí mismo o en un descendiente** → `planDrop` devuelve `null`, cancela. Evita ciclos.
2. **Grupo con jerarquía mixta** → solo se mueven las raíces de la selección; los hijos siguen a su raíz (referencian por id). Criterio de `orderedSelectionRoots`.
3. **Renglón colapsado (subárbol oculto)** → se mueve entero con sus hijos ocultos. Si el nuevo padre está colapsado, se expande (igual que hoy al indentar).
4. **Profundidad inválida** → clamp a la máxima válida en esa posición; nunca se genera un plan roto.
5. **Soltar en el mismo lugar** → plan vacío; no se registra paso de deshacer.

## Deshacer / persistencia

- Un `recordSnapshot` antes de aplicar → un Ctrl+Z revierte el arrastre completo.
- Cambios estructurales se guardan al instante (regla vigente del editor).

## Pruebas

### Puras (Node) — `src/lib/blocks/drop.test.ts`
- Reordenar simple entre hermanos.
- Anidar: soltar como hijo cambia `parentBlockId` + orden.
- Salir del padre (outdent por arrastre).
- Bloqueo de ciclo: soltar en sí mismo / en un descendiente → `null`.
- Grupo: solo se mueven raíces; hijos siguen.
- Renumerado sin huecos tras mover.
- Soltar en mismo lugar → plan vacío.

### e2e (Playwright)
- Long-press + arrastrar + soltar reordena.
- Umbral: mover rápido selecciona texto, NO arrastra.
- Arrastrar a la derecha anida; a la izquierda saca del padre.
- Deshacer revierte el arrastre completo.
- Táctil vía eventos Pointer sintéticos.

## Documentación (misma commit)

- Actualizar `docs/guia/03-escribir-y-organizar.md`: "Mover renglones" ahora también con arrastrar (mantener presionado).
- Actualizar fecha de "Última actualización" en `docs/guia-de-uso.md`.
