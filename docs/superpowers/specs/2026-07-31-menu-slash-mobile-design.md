# Menú "/" en celular: barra horizontal arriba del teclado

Fecha: 2026-07-31
Estado: aprobado, listo para plan de implementación

## Problema

En celular el menú "/" es una lista vertical alta (hasta 384px). Con el teclado en
pantalla pasan dos cosas:

1. **Queda cortado.** `keyboardInset` sube el menú lo justo para esquivar el
   teclado, pero no tiene tope: si el menú es más alto que el espacio libre, el
   borde de arriba se va fuera de la pantalla y esas opciones no se pueden ver ni
   tocar.
2. **Se cierra al intentar deslizarlo.** Cada opción se elige en el evento
   `pointerdown` (`SlashMenu.svelte:51`), o sea en cuanto el dedo toca la
   pantalla. Un gesto de scroll empieza tocando una opción, así que el menú
   elige esa opción y se cierra. Con mouse el comportamiento es correcto; con
   dedo es un bug.

El mismo bug de toque existe en el menú de etiquetas ("#", `TagPicker.svelte:113`).

## Decisiones tomadas

- **Celular = menos de 768px de ancho**, el mismo corte que ya usa la app para el
  panel lateral (`NoteSidebar.svelte:123`, `+page.svelte:84`). Tablet y escritorio
  quedan como están.
- **En celular el menú "/" es horizontal**: barra de borde a borde, pegada arriba
  del teclado, fichas amplias con ícono + palabra, deslizable al costado.
- **La lista de snippets sigue vertical**, en la misma caja de abajo, con tope de
  alto y deslizamiento vertical real. Los nombres de snippet son largos y pueden
  ser muchos: en horizontal no se pueden escanear.
- **El arreglo del toque es compartido** y cubre los menús que eligen al apoyar
  el dedo: "/" y "#". Sólo "/" cambia de forma.
- **Escritorio no cambia** en nada.

## Comportamiento

### Menú "/" en modo comandos (celular)

Caja fija al borde inferior, de borde a borde, por encima del teclado. Una sola
fila con desplazamiento horizontal:

```
┌──────────────────────────────────────┐
│ ▸ Texto  │ H1 H2 H3 │ ▸ Viñeta  ▸ Ta…│  ← se desliza al costado
├──────────────────────────────────────┤
│  q w e r t y u i o p                 │
└──────────────────────────────────────┘
```

- Fichas amplias: alto mínimo 44px (`--touch-target`), ícono + etiqueta completa,
  sin truncar.
- Los tres títulos se mantienen agrupados (H1 H2 H3) como hoy, con separador
  visual, para no ocupar tres fichas anchas.
- El orden y el filtrado por texto son los mismos de hoy (`filterCommands`).
- Al filtrar, la selección resaltada sigue visible: el desplazamiento la trae al
  centro horizontalmente en vez de verticalmente.

### Menú "/" en modo snippets (celular)

Misma caja fija abajo, pero lista vertical de ancho completo:

- Tope de alto ~40% de la pantalla visible, con desplazamiento vertical.
- Fichas de alto 44px mínimo, nombre completo sin truncar cuando entra.
- El estrella/marcador de favorito se mantiene.

### El toque no elige mientras deslizás

Regla única para los tres menús:

- Al apoyar el dedo se cancela el comportamiento por omisión del navegador (esto
  ya pasa hoy y es lo que evita perder el cursor en el renglón).
- La opción se elige **al soltar**, y sólo si el dedo se movió menos de 10px
  desde donde tocó.
- Si se movió más, fue un gesto de desplazamiento: no se elige nada y el menú
  sigue abierto.
- Vale igual para mouse: apretar y soltar sin arrastrar es una selección normal.

El panel de fecha queda afuera de este arreglo: sus botones ya eligen con
`onclick` (`DatePanel.svelte:60`), así que el bug no existe ahí.

### Teclado físico y accesibilidad

El cableado ARIA queda **como está** (`role="listbox"`, `role="option"`,
`aria-selected`, `aria-activedescendant` en el renglón) y las teclas también:
↑/↓ mueven, Enter/Tab eligen, Escape cierra.

No se agregan ←/→ para moverse por la barra horizontal: con el menú abierto, el
"/" y lo que escribís siguen dentro del texto, así que esas flechas mueven el
cursor dentro de la consulta; interceptarlas rompería escribir y corregir la
búsqueda. Por lo mismo no se declara `aria-orientation="horizontal"`: sería
anunciar una navegación por teclado que no existe.

### Escritorio (768px o más)

Idéntico a hoy: popover vertical anclado bajo el renglón, selección al apoyar el
mouse, mismas medidas y mismos estilos.

## Cómo se construye

### Archivos que se tocan

| Archivo | Cambio |
| --- | --- |
| `src/lib/actions/tapSelect.js` (nuevo) | Ayudante que devuelve los manejadores de puntero con el guardián de movimiento. |
| `src/lib/actions/tapSelect.test.js` (nuevo) | Prueba del guardián: deslizar no elige, tocar elige. |
| `src/lib/editor/SlashMenu.svelte` | Dos disposiciones por CSS + uso del ayudante. |
| `src/lib/components/TagPicker.svelte` | Uso del ayudante (sin cambio visual). |
| `vite.config.ts` | Que las pruebas de `src/lib/actions/` corran con DOM (jsdom). |
| `e2e/mobile-a11y.spec.ts` | Prueba en tamaño celular: barra abajo, deslizar sin elegir, elegir. |
| `docs/guia/15-usar-en-celular.md` | Sección del menú "/" en celular. |
| `specs/003-editor-blocks.md` | Nota de la disposición doble del menú. |

### Notas de implementación

- **Un solo componente, dos disposiciones.** `SlashMenu.svelte` mantiene el
  `snippet` `optionButton` que ya comparte el cableado de rol/id/ARIA entre las
  dos pintas actuales; las clases responsivas (`md:`) eligen popover vertical
  arriba de 768px y caja fija abajo por debajo. No se duplica el componente: dos
  copias divergen y una se queda sin los atributos de accesibilidad.
- **Pararse arriba del teclado reusa `keyboardInset` sin tocarlo.** La acción mide
  el teclado real con `visualViewport` y sube el elemento por la superposición.
  Con la caja pegada al borde inferior, esa superposición es exactamente el alto
  del teclado, así que el resultado es "apoyada sobre el teclado" sin código
  nuevo. Cuando no hay teclado, la superposición es cero y la caja queda al pie
  de la pantalla.
- **El guardián de movimiento vive en un solo lugar.** Tres componentes usan la
  misma regla; si estuviera copiada, el próximo menú flotante nacería con el bug.
- **El desplazamiento horizontal usa el patrón que ya existe** en la barra de
  formato (`FloatingFormattingToolbar.svelte:80`): `overflow-x-auto` con ancho
  tope de pantalla.

## Qué queda afuera a propósito

- El menú de "#" y el panel de fecha **no cambian de forma**; sólo dejan de elegir
  mal al deslizar.
- No se agrega búsqueda, categorías ni orden nuevo al menú "/".
- No se agrega detección de "dispositivo táctil": el corte es el ancho de
  pantalla, que es el que la app ya usa en todos lados.

## Techo conocido

La barra ocupa unos 56px sobre el teclado. Escribiendo en el último renglón
visible, la barra puede tapar ese renglón. No se resuelve en esta tanda; si
molesta en uso real, se agrega un empujón de desplazamiento al abrir el menú.
Queda marcado con un comentario `ponytail:` en el código.

## Pruebas

- **Unitaria** (`tapSelect.test.js`): soltar sin mover elige; soltar después de
  moverse 60px no elige; apoyar solo no elige; un gesto cancelado no elige.
- **e2e en tamaño celular**: abrir "/" en un viewport de teléfono, la barra
  aparece al pie, un gesto de deslizamiento no elige nada y el menú sigue
  abierto, tocar "Tarea" convierte el renglón en tarea.
- **e2e existentes**: `e2e/slash.spec.ts`, `e2e/dates.spec.ts` y
  `e2e/critical-flows.spec.ts` corren en tamaño escritorio y deben seguir en
  verde sin editarlos. Si alguno dispara `pointerdown` a mano en vez de un clic
  real, se ajusta ese disparo (no la regla).

## Documentación

`docs/guia/15-usar-en-celular.md` se actualiza en el mismo commit que el cambio:
cómo se ve el menú "/" en el teléfono, que se desliza al costado, que los
snippets salen en lista, y que deslizar ya no elige sin querer. La fecha de
"Última actualización" del índice `docs/guia-de-uso.md` también.
