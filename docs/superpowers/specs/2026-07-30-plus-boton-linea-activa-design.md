# Botón + en la línea activa (alternativa visual a "/")

## Contexto

Usuarios que no conocen el atajo "/" no tienen forma visual de descubrir que
un bloque vacío se puede convertir en tarea, título, código, etc. Se agrega
un botón `+` que hace lo mismo que tipear "/", pero con el mouse.

## Condición de aparición

El `+` aparece cuando se cumplen las dos cosas a la vez:

- El bloque está vacío (`block.content === ''`).
- Es la línea activa (`activeBlockId === block.id`, ya trackeado en vivo en
  `Editor.svelte` vía el evento `focus` de cada bloque).

Bloques `code` y `separator` quedan afuera — ahí "/" tampoco dispara el menú
hoy.

## Ubicación visual

Ocupa el mismo casillero del "grip" de arrastre (columna izquierda,
`h-7 w-4`). Cuando la condición de arriba es verdadera, se muestra `+` en vez
del grip (arrastrar una línea vacía no tiene sentido). Fuera de esa
condición, el casillero sigue funcionando exactamente como hoy (grip visible
al pasar el mouse o con foco en la fila).

## Interacción

Click en `+` hace: foco en el contenido del bloque (ya lo tiene, al ser la
línea activa) + `document.execCommand('insertText', false, '/')`. Esto
dispara el mismo evento `input` nativo que ya maneja `handleBlockInput` en
`Editor.svelte` cuando el usuario tipea "/" a mano — mismo menú, mismo
filtro, mismas teclas (flechas, Enter, Tab, Escape). No se agrega estado
nuevo ni lógica nueva de posicionamiento de menú.

Precedente en el mismo archivo: `BlockRow.svelte` ya usa
`document.execCommand('insertLineBreak')` para simular una tecla física
dentro del mismo pipeline de eventos — mismo patrón, ya probado.

## Motion

Grip y `+` se cruzan con un `fade` (Svelte, no CSS) a
`motionDuration(MOTION.fast)` (150ms, "Quiet Motion", spec 024) — el mismo
mecanismo que ya usa el sol/luna del navbar (`+page.svelte`) para cruzar dos
íconos en el mismo casillero. `motionDuration()` ya respeta
`prefers-reduced-motion` (devuelve 0). Guardado por `ready` (igual que el
check del checkbox en este mismo archivo) para no animar en el primer
render de la nota.

## Accesibilidad

Ícono `Plus` (lucide-svelte), `aria-label="Agregar bloque"`, tooltip
`Agregar (o escribí "/")` vía la action `tooltip` ya usada en el grip. Fuera
del tab-order — mismo criterio que el grip: ya existe un camino 100%
teclado ("/"), este botón es la alternativa para quien no lo usa.

## Testing

E2E en `e2e/slash.spec.ts`, mismo patrón que el test de Tab agregado antes:
crear nota, dejar un bloque vacío, click en `+`, verificar que `#slash-menu`
aparece, elegir "Tarea", verificar que el bloque se convierte en checkbox.
No hay lógica de rama nueva fuera del disparo del evento — el resto ya está
cubierto por los tests existentes de "/".

## Fuera de alcance

- No se anima el resto del layout (spec anterior ya fija el ancho del
  contenedor "Guardado"; acá no hay ningún ancho que cambie).
- No hay versión mobile distinta: en touch, "hover" no existe pero la
  condición ya es foco+vacío, no hover, así que el botón aparece igual al
  tocar el bloque.
