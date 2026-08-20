# Enlaces editables y selección de un renglón sin choque — Plan de implementación

Fecha: 2026-08-20

Estado: **CERRADO; VALIDACIONES MANUALES EN TAURI Y TELÉFONO REAL DIFERIDAS**

Aprobación final: **Hernán, 2026-08-20 — “La dirección de gusto funciona. Aprobado para implementar.”**

> La implementación y sus puertas automáticas terminaron el 2026-08-20. Quedan
> abiertas sólo las comprobaciones manuales en Tauri y en un teléfono real.

> **For agentic workers:** después de la aprobación, ejecutar este plan tarea por
> tarea. Las casillas (`- [ ]`) son el registro. Antes de tocar código, leer
> `AGENT.md`, las specs `003`, `019`, `020`, `026`, `031`, `033` y `041`, y la
> spec `042` que nace en la Tarea 0.

**Objetivo:** Que un enlace que ocupa todo el renglón no bloquee ninguna de las
dos selecciones que una persona puede necesitar: marcar caracteres para editar
el texto y seleccionar el renglón como pieza para copiarlo, moverlo o borrarlo.

**Arquitectura:** Separar tres intenciones que hoy compiten en el mismo clic.
Dentro de una nota editable, tocar el texto enlazado conserva el cursor y abre
un panel mínimo con el destino completo, **Abrir** y **Editar**; la navegación
sólo ocurre desde **Abrir** o con `Ctrl/Cmd+clic`. Con el cursor dentro de un
enlace, `Ctrl/Cmd+K` abre ese mismo panel y enfoca **Abrir**; con texto marcado,
conserva el editor de URL actual; con el cursor fuera de un enlace deja pasar el
atajo para abrir la búsqueda general. La manija de la izquierda también separa
clic de arrastre: clic/toque selecciona el renglón entero, arrastre lo mueve. El
estado de selección que ya existe aprende a representar un solo renglón sin
cambiar las reglas de los grupos de dos o más.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Tailwind CSS v4,
shadcn-svelte/Bits UI donde corresponda, Vitest, Playwright y Tauri.

## Por qué existe este plan

Hoy `BlockRow.handleEditableClick` abre cualquier `<a>` cuyo gesto termine a
menos de 4px del punto de inicio (`src/lib/editor/BlockRow.svelte:776-801`). Ese
umbral protege un arrastre claro, pero un clic para poner el cursor, un doble
clic o un toque preciso siguen compitiendo con la navegación. Cuando todos los
caracteres del renglón están enlazados no queda una zona de texto neutral.

La otra mitad vive en `Editor.svelte`: `hasSelection` sólo es verdadero con dos
o más renglones (`:279-289`) y `selectedSet` sólo pinta ese caso (`:410-414`). La
manija ya distingue movimiento de clic en `dragReorder.svelte.js`, pero al
soltarla sin mover hoy no hace nada. Por eso existe la capacidad técnica para
seleccionar un renglón, pero no el gesto ni el estado visible.

Las pruebas actuales fijan deliberadamente la regla que se va a reemplazar:
`e2e/formatting.spec.ts:321-351` exige que un clic pelado abra el enlace, y
`:461-490` exige que un arrastre lo seleccione sin abrir. La segunda garantía se
conserva; la primera se cambia por un panel de acciones explícitas.

`AGENT.md:122` también registra “cualquier clic abre” como fuente de verdad. La
regla fue correcta para devolver una salida a teléfonos, pero queda superada si
se aprueba este panel táctil. La Tarea 0 debe actualizar ese párrafo antes del
código, preservando sus otras garantías: separar arrastre por movimiento,
validar la URL y abrir siempre por `platform/openExternal`.

## Evidencia externa revisada

| Producto | Patrón relevante | Qué toma CopyNotes |
|---|---|---|
| Microsoft Word | Por defecto exige `Ctrl+clic` para seguir un enlace y explica que ese paso evita abandonar el documento por accidente mientras se edita. | En edición, escribir y seleccionar ganan sobre navegar. |
| Google Docs | El clic o toque sobre texto enlazado es la entrada a sus acciones de cambiar, editar o quitar el enlace. | El primer gesto puede mostrar acciones sin navegar. |
| Notion | `Escape`, `Cmd/Ctrl+A`, clic con modificador y `Shift+clic` separan la selección del bloque de la selección del texto. | Un renglón necesita una puerta estructural independiente del contenido. |
| Craft | Separa edición y selección de bloques; en iOS tiene gesto/controles propios y en teclado una acción explícita para abrir enlaces. | El mismo píxel no debe adivinar entre editar, seleccionar y abrir. |

Fuentes revisadas:

- Microsoft: <https://support.microsoft.com/en-us/office/remove-or-turn-off-hyperlinks-027b4e8c-38f8-432c-b57f-6c8b67ebe3b0>
- Google Docs, computadora: <https://support.google.com/docs/answer/45893?hl=en&co=GENIE.Platform%3DDesktop>
- Google Docs, iPhone/iPad: <https://support.google.com/docs/answer/45893?hl=en&co=GENIE.Platform%3DiOS>
- Notion: <https://www.notion.com/help/keyboard-shortcuts>
- Craft: <https://support.craft.do/en/introduction/mobile-features/gestures>

## Contrato de interacción propuesto

| Intención | Mouse o trackpad | Celular o tablet | Teclado |
|---|---|---|---|
| Poner el cursor | Clic sobre el texto, enlazado o no | Toque sobre el texto | Flechas |
| Marcar caracteres | Arrastre o doble clic | Pulsación larga y selectores nativos | `Shift` + flechas |
| Revisar el destino sin abrir | Clic sobre el enlace | Toque sobre el enlace | Cursor dentro del enlace y `Ctrl/Cmd+K` |
| Abrir un enlace editable | **Abrir** o `Ctrl/Cmd+clic` | Tocar enlace y luego **Abrir** | `Ctrl/Cmd+K`, foco en **Abrir**, `Enter` |
| Editar la dirección | Panel y **Editar** | Panel y **Editar** | Marcar texto y `Ctrl/Cmd+K`; o panel, `Tab`, **Editar** |
| Abrir la búsqueda | Lupa | Lupa | `Ctrl/Cmd+K` sin texto marcado y con cursor fuera de un enlace; `Ctrl/Cmd+F` siempre |
| Seleccionar un renglón entero | Clic en la manija | Tocar la manija visible del renglón activo | `Escape` cuando no hay un panel o menú abierto |
| Extender la selección estructural | `Shift+clic` en otro renglón | Fuera de alcance para varios renglones | `Shift+↑/↓` desde uno o más |
| Mover el renglón | Arrastrar la manija | Arrastrar la manija | `Alt+↑/↓` |
| Volver a editar un renglón seleccionado | Clic en su texto o `Enter` | Toque en su texto | `Enter` |

### Panel del enlace

El panel es deliberadamente pequeño y no consulta internet:

```text
https://ejemplo.com/carpeta/documento
                                      Abrir   Editar
```

- Muestra la URL normalizada completa como texto visible y seleccionable, con
  corte de línea en cualquier punto si hace falta. No la oculta detrás de
  puntos suspensivos ni de una ayuda que en táctil no existe.
- `http:`, `https:` y `mailto:` tienen salida explícita. Un correo se muestra
  como `mailto:nombre@dominio.com`, no como un dominio vacío.
- **Abrir** usa la puerta existente `platform/openExternal`; nunca `window.open`
  directamente en el código nuevo.
- **Editar** selecciona el enlace entero y abre el editor de URL que ya existe.
- Abierto por clic/toque, no roba el foco ni la selección del texto. Abierto con
  `Ctrl/Cmd+K` desde un cursor colapsado dentro del enlace, enfoca **Abrir**;
  `Tab` llega a **Editar**, `Enter` activa y `Escape` devuelve el foco al enlace.
- `Ctrl/Cmd+K` con caracteres marcados conserva el comportamiento actual: abre
  directamente el editor de URL para crear o cambiar el enlace de esa marca.
- `Ctrl/Cmd+K` con el cursor colapsado fuera de un enlace **no** se cancela en
  `BlockRow`: burbujea a `+page.svelte` y abre la búsqueda vacía. Ése es el tercer
  brazo del atajo, no un no-op.
- En sólo lectura nunca abre herramientas de edición: `Ctrl/Cmd+K` también cae en
  búsqueda aunque haya texto marcado o el cursor esté sobre un enlace.
- No hay miniatura, título remoto ni vista previa: agregan ruido, tráfico y una
  filtración de privacidad sin resolver este problema.
- En una nota de sólo lectura, donde editar no compite con navegar, un clic o
  toque sigue abriendo directamente.
- El panel se ancla al renglón, se da vuelta si no entra y se cierra con
  `Escape`, toque afuera, escritura, selección nueva o cambio de nota.
- Su ancho nunca supera el renglón ni `visualViewport - 16px`; la URL envuelve y
  las acciones bajan a una segunda línea antes de desbordarse. El layout fija el
  ancho máximo y `flipIntoView` mantiene el panel dentro del área visible tanto
  vertical como horizontalmente.
- Sus botones miden al menos 44px en pantallas táctiles y no dependen sólo del
  color para comunicar su acción.

### Dirección de gusto y pulido (Stage 2, propuesta)

- El panel se siente como una herramienta editorial de Quiet Ink, no como una
  tarjeta: fondo y borde de tokens existentes, radio pequeño, sombra discreta y
  sin color nuevo.
- La URL tiene el peso visual secundario; **Abrir** y **Editar** son acciones de
  texto claras, no dos botones grandes que compitan con la nota.
- Una sola pieza adaptable para escritorio y móvil. En ancho estrecho envuelve
  contenido; no cambia a una hoja, modal ni interfaz distinta.
- Sólo usa la entrada breve ya presente en `.cn-pop` y estados de foco/pressed.
  No agrega movimiento perpetuo, magnetismo ni decoración; respeta movimiento
  reducido.
- La selección de un renglón reutiliza el resaltado tenue actual y suma el
  anuncio textual. No agrega una barra flotante ni un segundo color de acento.

Esta dirección fue **aprobada explícitamente por Hernán el 2026-08-20**. Stage 3
puede comenzar bajo `web-design-guidelines`.

### Borrar texto enlazado

Este comportamiento forma parte del arreglo, no es un caso opcional:

- Borrar un carácter dentro del enlace deja enlazado todo el texto restante.
- Escribir dentro del enlace mantiene la misma dirección.
- Borrar todos sus caracteres elimina también el `<a>` vacío; no queda un enlace
  invisible atrapando el cursor.
- Borrar en el primer o último carácter no absorbe texto vecino dentro del
  enlace ni corta el enlace restante.
- Un único `Ctrl/Cmd+Z` restaura el carácter y el enlace tal como estaban.
- Todo sobrevive a recargar; no alcanza con que se vea correcto antes del
  guardado de 500ms.
- “Vacío” significa visualmente vacío y sin `<a>`. La proyección `content` puede
  ser `"\n"` porque un `<br>` representa una línea vacía; ninguna prueba exige
  `content === ''` ni infiere la intención por longitud.

### Selección de un solo renglón

- Clic/toque en la manija selecciona el renglón completo y lo pinta con el mismo
  lenguaje visual tenue que los grupos actuales. La manija existe también en un
  renglón activo vacío y en una imagen; el botón `+` deja de reemplazarla y usa
  el hueco contiguo cuando esté libre.
- Arrastrar esa misma manija sigue moviendo inmediatamente; un clic sin
  movimiento nunca mueve nada.
- Un clic en la manija de un renglón que ya pertenece a una selección de varios
  conserva el grupo y su menú; no lo reduce a uno. Una manija fuera del grupo sí
  reemplaza el grupo por ese único renglón.
- La selección mantiene visibles los controles existentes para copiar, copiar
  con subniveles y abrir las acciones de mover/borrar. No aparece una barra
  nueva.
- `Ctrl/Cmd+C` sobre uno equivale a **Copiar bloque** y no incluye hijos. El botón
  **Copiar con subniveles** sí los incluye. Borrar el renglón se lleva sus hijos,
  igual que hoy; una selección de varios conserva la copia de sus subárboles.
- Clic/toque dentro del texto abandona la selección estructural y devuelve el
  cursor a ese lugar.
- En mouse/teclado, seleccionar deja el foco en una superficie del mismo
  renglón. En imágenes es la descripción si se puede editar y, si no, el botón
  de la imagen. Un toque de manija en móvil no levanta el teclado virtual.
- `Shift+↑/↓` extiende desde uno; `Enter` vuelve a editar sin crear una fila;
  `Escape` sale de la selección; `/` sobre un renglón textual vuelve a su flujo
  ordinario, nunca al menú “Convertir N renglones”; imagen y separador conservan
  su no-op actual.
- `Tab`/`Shift+Tab` y `Alt+↑/↓` sobre uno usan las rutas individuales actuales
  (`planIndent`/`planOutdent` y movimiento individual). Sólo dos o más usan los
  planificadores grupales. Esto preserva posiciones fraccionarias y huecos.
- En una nota de sólo lectura, la selección estructural sirve únicamente para
  copiar: `Escape`, `Shift+↑/↓` y `Ctrl/Cmd+C` funcionan, pero `/`,
  `Backspace/Delete`, `Tab`, `Alt+↑/↓`, `Ctrl/Cmd+Z` y Rehacer no convierten,
  borran, anidan, mueven ni restauran contenido. `Enter` sólo suelta la selección
  y vuelve a la superficie de lectura. La manija de edición sigue ausente y ni
  el renglón ni el texto marcado arman controladores de arrastre. Tildar/comentar
  como invitado conserva sus puertas propias y no habilita ninguna escritura
  estructural.
- `Escape` respeta capas: primero cierra enlace, barra, `/`, fecha, etiqueta o
  acciones; sólo cuando no hay ninguna abierta selecciona el renglón activo. Un
  segundo `Escape` sale de esa selección.
- Los grupos de dos o más conservan exactamente sus reglas actuales. En
  particular, `/` sólo abre “Convertir N renglones…” con dos o más; seleccionar
  uno no debe cambiar el flujo normal de `/`.

### Prioridad única de `Escape`

`Escape` no puede decidirse sólo mirando la selección, porque el editor ya tiene
paneles y gestos que escuchan esa tecla después de la captura. El contrato es:

1. Si `reorder.engaged` o `textDrag.engaged`, `Editor` reclama la tecla y llama
   al método público `cancel()` del controlador. El gesto se apaga sin tocar
   menús ni selección; no se espera al listener posterior de `window`.
2. Toda superficie transitoria del editor renderizada —enlace, barra y sus
   paneles, `/`, fecha, etiquetas, acciones e imagen ampliada— lleva el marcador
   común `data-editor-transient`. Su dueño actual conserva el cierre y el foco.
3. Después de descartar gestos, el dueño del menú grupal conserva su rama actual.
   Las ramas de `Editor.handleSelectionKeys` que **crean o sueltan** selección
   sólo reclaman `Escape` cuando el objetivo es una superficie de bloque, no
   existe `[data-editor-transient]` y ningún gesto está armado. Sin selección
   crean la de ese renglón; con una selección de uno o más la sueltan. Nunca
   interceptan una tecla nacida dentro de un menú/panel o botón ordinario; un
   botón con `[data-block-surface]` (código plegado o imagen) sí es la superficie
   del renglón y participa.

Las pruebas cubren la secuencia primer `Escape` selecciona/segundo suelta, y que
un panel o arrastre activo consume su propio primer `Escape` sin crear ni borrar
una selección.

## Fuera de alcance

- No cambiar el motor de texto ni adoptar TipTap, Lexical o ProseMirror.
- No convertir URLs solas en tarjetas o vistas previas.
- No crear un modo global “Ver/Editar”.
- No sumar selección discontinua de renglones. Las operaciones estructurales
  siguen trabajando con un rango continuo para no desgarrar la jerarquía.
- No rediseñar la barra de formato.
- No cambiar cómo se crean, normalizan o exportan los enlaces.
- No agregar una preferencia para volver al clic directo. Primero debe existir
  una regla simple y consistente; una opción sólo se justifica con uso real.

## Restricciones globales

- **La Tarea 0 bloquea todas las demás.** “El plan se ve bien” no basta: debe
  quedar escrita la frase “Aprobado para implementar”, con fecha.
- Stage 1 está aprobado en `specs/016-design-system.md` y la dirección de gusto
  de este documento cerró Stage 2 con aprobación el 2026-08-20.
- Stage 3 comienza sólo tras aprobar Stage 2 y el plan. Antes de la primera
  edición de interfaz se carga `web-design-guidelines` y sus reglas son puerta
  de accesibilidad, rendimiento y UX durante toda la construcción.
- Preservar Quiet Ink: editor dominante, controles tranquilos, sin tarjetas,
  sombras pesadas ni paneles permanentes.
- Código escrito a mano en estilo JavaScript liso dentro de `.ts`/`.svelte`, sin
  anotaciones TypeScript.
- Svelte 5 solamente. `$derived` para cálculo y `$effect` sólo para efectos
  externos; todo listener de documento/ventana devuelve su limpieza.
- `openExternal` conserva su validación web/Rust. El panel nunca abre esquemas
  nuevos ni confía en el `href` sin normalizarlo otra vez.
- El movimiento del puntero decide “clic versus arrastre”, pero ya no decide una
  navegación peligrosa. Ante duda, gana seleccionar o no hacer nada.
- Todo control dentro del renglón debe cortar `pointerdown` para no armar a la
  vez el movimiento del bloque. La implementación audita manija/`+`, colapsar,
  casilla, imagen, fecha, conflictos, etiquetas, copiar, `...`, código y paneles;
  no alcanza con corregir sólo los dos controles nuevos.
- La selección de un renglón y la selección de texto son estados distintos. No
  inferir una desde `window.getSelection().toString()`.
- Después de la aprobación, `AGENT.md`, la parte afectada de spec 020 y la spec
  042 se actualizan juntos antes del código para que ninguna fuente de verdad
  conserve reglas viejas de clic, barra o `Ctrl/Cmd+K`.
- Los cambios visibles se documentan en `docs/guia/` y `CHANGELOG.md` en el
  mismo commit que el código. También se actualiza la fecha de
  `docs/guia-de-uso.md`.
- No modificar ni revertir trabajo ajeno que ya esté en el árbol.

## Archivos previstos

| Archivo | Responsabilidad después del cambio |
|---|---|
| `AGENT.md` | Sustituye sólo la regla de apertura por clic en edición; preserva movimiento, saneado y `openExternal`. |
| `specs/020-inline-formatting-toolbar.md` | Deja explícitos los tres destinos de `Ctrl/Cmd+K`, que la barra exige texto marcado y qué reemplaza la spec 042. |
| `specs/042-link-row-selection-ux.md` | Contrato aprobado de producto y criterios de aceptación. Se crea sólo después de la revisión final. |
| `specs/README.md` | Índice de la spec 042. |
| `src/lib/editor/LinkContextPopover.svelte` | Panel mínimo con destino completo, Abrir y Editar. |
| `src/lib/editor/BlockRow.svelte` | Distingue editar/inspeccionar/abrir enlace; abre el panel; selecciona el enlace para editarlo. |
| `src/lib/editor/Editor.svelte` | Representa y anuncia una selección estructural de uno o más renglones sin confundirla con el menú grupal. |
| `src/lib/editor/dragReorder.svelte.js` | Un clic de manija llama a seleccionar; un arrastre sigue reordenando. |
| `src/lib/editor/dragReorder.test.js` | Prueba la separación clic/arrastre de la manija. |
| `src/lib/editor/textDrag.svelte.js`, `src/lib/editor/textDrag.test.js` | Exponen/prueban `engaged` para que `Escape` cancele antes de seleccionar. |
| `src/lib/editor/BlockActionsMenu.svelte`, `FloatingFormattingToolbar.svelte`, `SlashMenu.svelte`, `DatePanel.svelte`, `ImageLightbox.svelte` | Marcan superficies transitorias; acciones del renglón también cortan `pointerdown`. |
| `src/lib/components/TagPicker.svelte`, `src/lib/components/TagChips.svelte` | El picker participa de la prioridad de `Escape`; la cruz no arma el arrastre. |
| `src/lib/components/HelpDialog.svelte` | Explica `Escape`, selección de uno y los tres contextos de `Ctrl/Cmd+K`. |
| `src/lib/format/sanitize.ts` | Elimina anclas vacías conservando cualquier contenido válido que pudiera quedar. |
| `src/lib/format/sanitize.test.ts` | Cubre enlace parcial, enlace vacío y salto de línea. |
| `src/app.css` | Cursor de edición sobre enlaces editables y estados del panel/selección mediante tokens. |
| `e2e/formatting.spec.ts` | Nuevo contrato de clic, abrir, editar y borrar caracteres enlazados. |
| `e2e/formatting-undo.spec.ts` | Guardias esenciales de enlace en WebKit, sin arrastrar la suite Chromium. |
| `e2e/move-blocks.spec.ts` | Seleccionar con manija, mover con manija y acciones sobre un solo renglón. |
| `e2e/slash.spec.ts` | Un solo renglón conserva `/`; el menú de varios no queda fantasma. |
| `e2e/imagenes.spec.ts` | Una imagen se selecciona, recibe foco correcto y conserva sus teclas estructurales. |
| `e2e/compartir.spec.ts` | En sólo lectura, el enlace conserva apertura directa automatizada. |
| `e2e/mobile-a11y.spec.ts` | Manija táctil y panel contenidos y alcanzables dentro del teléfono. |
| `docs/guia/04-formato-del-texto.md` | Cómo abrir, editar y borrar texto de un enlace. |
| `docs/guia/03-escribir-y-organizar.md` | Clic versus arrastre de la manija y selección de una fila. |
| `docs/guia/06-seleccionar-deshacer-colapsar.md` | Cómo seleccionar un renglón entero. |
| `docs/guia/10-buscar.md` | Los tres resultados contextuales de `Ctrl/Cmd+K`. |
| `docs/guia/15-usar-en-celular.md` | El toque en enlaces y la manija en pantallas táctiles. |
| `docs/guia-de-uso.md`, `CHANGELOG.md` | Fecha e impacto visible de la versión. |

---

### Tarea 0: Revisión final obligatoria antes de implementar

**No modifica código de producto. No puede delegarse ni darse por hecha.**

- [x] **Paso 1: Releer el estado real del editor.** Abrir `AGENT.md`, specs
  `003`, `019`, `020`, `026`, `031`, `033`, `041`, `BlockRow.svelte`,
  `Editor.svelte`, `dragReorder.svelte.js`, `sanitize.ts` y las pruebas citadas.
  Confirmar que las líneas y contratos de este plan siguen vigentes; el
  repositorio puede haber cambiado desde 2026-08-20.
- [x] **Paso 2: Revisar el árbol de trabajo.** Anotar cambios ajenos y definir
  cómo evitar tocarlos. Nunca limpiar, restaurar ni incluir archivos que no
  pertenezcan a este trabajo.
- [x] **Paso 3: Levantar la línea base.** Correr las pruebas actuales relevantes
  y registrar qué pasa antes de cambiar nada:

```bash
pnpm vitest run src/lib/format/sanitize.test.ts src/lib/format/url.test.ts src/lib/editor/dragReorder.test.js src/lib/editor/textDrag.test.js src/lib/blocks/selection.test.ts src/lib/blocks/indent.test.ts
pnpm exec playwright test e2e/formatting.spec.ts e2e/move-blocks.spec.ts e2e/slash.spec.ts e2e/imagenes.spec.ts e2e/compartir.spec.ts e2e/mobile-a11y.spec.ts --project=chromium --reporter=line
pnpm exec playwright test e2e/formatting-undo.spec.ts --project=webkit --reporter=line
pnpm check
```

**Línea base registrada el 2026-08-20, antes de implementar:**

- Vitest focalizado: 6 archivos, 92 pruebas aprobadas.
- Chromium focalizado: 110 aprobadas y 1 omitida por su condición habitual.
- WebKit focalizado: 2 aprobadas en `formatting-undo.spec.ts`.
- Los builds de Playwright completaron. Mantienen una advertencia preexistente de
  Svelte en `DatePanel.svelte:34`.
- `pnpm check` ya falla en el estado base con 4 errores: uno en
  `src/lib/format/commands.ts:143`, dos en
  `src/lib/storage/db.migrations.test.ts:33` y uno en
  `src/lib/editor/DatePanel.svelte:64`, además de la advertencia anterior. No los
  causó este plan, que sigue siendo el único archivo sin seguimiento. La
  implementación debe comparar contra esta base y no atribuirse un verde hasta
  que esos errores se resuelvan por su trabajo correspondiente.

- [x] **Paso 4: Hacer la revisión de producto con Hernán.** Mostrar nuevamente
  la matriz de interacción, el panel textual, la dirección de gusto de Stage 2 y
  el estado de un renglón seleccionado. Confirmar explícitamente estos diez
  puntos:

1. En una nota editable, abrir requiere **Abrir** o `Ctrl/Cmd+clic`.
2. En celular también son dos toques: enlace y luego **Abrir**.
3. Una nota de sólo lectura conserva apertura directa.
4. En una nota editable, `Ctrl/Cmd+K` tiene tres rutas: dentro de un enlace abre
   el panel con foco en **Abrir**; con texto marcado abre el editor de URL; fuera
   de ambos abre la búsqueda general. En sólo lectura siempre abre la búsqueda.
5. La URL completa queda visible, incluidos `mailto:` y rutas largas; no hay
   vista previa remota.
6. La manija tocada selecciona y arrastrada mueve; nunca desaparece en una fila
   vacía o imagen, y tocarla dentro de un grupo conserva ese grupo.
7. Sin superficies abiertas, `Escape` selecciona el renglón actual y el segundo
   sale. Con una superficie abierta, el primer `Escape` sólo la cierra.
8. Sobre uno editable, `Ctrl/Cmd+C` excluye hijos, `Shift+flechas` extiende, `/`
   es el menú ordinario y `Tab`/`Alt+flechas` conservan rutas individuales. En
   sólo lectura, la selección es sólo para copiar y ninguna tecla muta la nota.
9. Borrar una letra mantiene el enlace; borrar todas deja la fila visualmente
   vacía y sin `<a>`, aunque `content` pueda valer `"\n"`.
10. La dirección de gusto de Stage 2 funciona: panel editorial discreto, sin
    tarjeta nueva, sin segundo acento y sin movimiento decorativo.

- [x] **Paso 5: Incorporar correcciones al plan.** Si cambia cualquier punto,
  editar este archivo y repetir el Paso 4. No empezar “lo seguro” mientras una
  decisión siga abierta.
- [x] **Paso 6: Obtener las dos autorizaciones inequívocas.** Primero confirmar
  **“La dirección de gusto funciona”** (o incorporar sus ajustes y repetir la
  revisión de Stage 2). Después Hernán debe responder con una aprobación
  explícita equivalente a **“Aprobado para implementar”**.
- [x] **Paso 7: Registrar la aprobación arriba.** Cambiar el estado a
  `APROBADO PARA IMPLEMENTAR`, completar persona y fecha, y resumir cualquier
  ajuste acordado.
- [x] **Paso 8: Convertir lo aprobado en spec oficial.** Crear
  `specs/042-link-row-selection-ux.md` con objetivo, entra/no entra, matriz,
  **modelo de datos afectado**, flujos, criterios, pruebas y notas para agentes;
  agregarla a `specs/README.md`. Debe decir explícitamente que no hay migración
  ni cambio de esquema: cambia HTML saneado y estado de selección en memoria. El
  plan y la spec no pueden contradecirse.
- [x] **Paso 9: Reconciliar las fuentes de verdad.** Actualizar `AGENT.md:122`
  para que una nota editable use panel/**Abrir**/`Ctrl/Cmd+clic` y una nota de
  sólo lectura conserve apertura directa. Actualizar la parte afectada de
  `specs/020-inline-formatting-toolbar.md` con las tres rutas de `Ctrl/Cmd+K` y
  señalar que la spec 042 reemplaza sólo ese flujo; spec 033 conserva la
  navegación de la barra. Corregir además sus secciones “Floating toolbar”,
  “User flows” y “Behavior”: la barra sólo aparece con texto marcado, nunca por
  un cursor colapsado sobre texto formateado, en línea con `AGENT.md:123`.
  Mantener intactas las garantías sobre movimiento, URL segura, Tauri y quitar
  enlaces al limpiar formato.

**Puerta:** si falta una sola casilla de esta tarea, **DETENERSE Y PREGUNTAR**.
Las Tareas 1–5 no están autorizadas.

---

### Tarea 1: El enlace no deja basura al borrar su texto

**Archivos:**

- Modificar: `src/lib/format/sanitize.ts`
- Modificar: `src/lib/format/sanitize.test.ts`

**Resultado:** `sanitizeHtml` conserva un `<a>` mientras tenga contenido útil y
lo desarma cuando queda vacío. Si sólo quedara un `<br>`, conserva el salto pero
no un enlace sin caracteres.

- [x] Escribir primero pruebas que fallen para un enlace con texto, uno vacío y
  uno que sólo envuelve un `<br>`.
- [x] Agregar una prueba donde se borra parte del contenido y el `href` permanece.
- [x] Separar las aserciones: el HTML queda sin `<a>` y la fila queda visualmente
  vacía; `htmlToPlainText` puede devolver `"\n"` por el `<br>` y eso es válido.
- [x] Hacer el cambio mínimo en `appendClean`; no aplicar una limpieza general a
  todos los formatos sin un caso concreto.
- [x] Correr `pnpm vitest run src/lib/format/sanitize.test.ts`.
- [x] Confirmar que `htmlToPlainText` y los tests de Markdown siguen pasando.

**Criterio de salida:** el saneador nunca devuelve `<a ...></a>` ni
`<a ...><br></a>`; puede devolver `<br>` solo. Un enlace con al menos un carácter
conserva URL, `target` y `rel` normalizados.

---

### Tarea 2: Primer gesto para editar; acción explícita para abrir

**Archivos:**

- Crear: `src/lib/editor/LinkContextPopover.svelte`
- Modificar: `src/lib/editor/BlockRow.svelte`
- Modificar: `src/lib/editor/Editor.svelte`
- Modificar: `src/app.css`
- Modificar: `e2e/formatting.spec.ts`
- Modificar: `e2e/formatting-undo.spec.ts`
- Modificar: `e2e/compartir.spec.ts`
- Modificar: `e2e/mobile-a11y.spec.ts`

**Resultado:** En una nota editable, el clic/toque seco sobre un enlace coloca el
cursor y muestra el panel. No navega. El arrastre selecciona; `Ctrl/Cmd+clic` y
**Abrir** navegan; **Editar** abre el editor existente con la URL actual. Con el
cursor dentro del enlace, `Ctrl/Cmd+K` abre el panel y deja **Abrir** enfocado.

- [x] Reemplazar primero la prueba “un clic abre” por una prueba roja del nuevo
  contrato: clic, cero pestañas nuevas, panel visible y renglón enfocado.
- [x] Mantener en verde la prueba existente de arrastrar sobre el enlace sin
  abrirlo; agregar doble clic que selecciona la palabra y cierra/no abre panel.
- [x] Agregar pruebas rojas para **Abrir**, `Ctrl/Cmd+clic`, **Editar** con la URL
  precargada y `Escape` devolviendo el foco al mismo enlace.
- [x] Agregar la ruta de teclado concreta: cursor colapsado dentro de `<a>`,
  `Ctrl/Cmd+K`, panel visible, **Abrir** enfocado, `Tab` llega a **Editar** y
  `Enter` activa. Con texto marcado, `Ctrl/Cmd+K` sigue abriendo el editor de URL
  directamente. Con cursor colapsado fuera de un enlace, `BlockRow` no llama
  `preventDefault`: el evento llega a `+page.svelte` y abre la búsqueda. Probar
  las tres ramas. La puerta devuelve/decide “reclamado” antes de cancelar el
  evento; no se cancela primero para averiguar después.
- [x] Crear un solo panel accesible, sin duplicar marcado para móvil. Usar
  `role="dialog"`, nombre “Acciones del enlace”, botones con nombre y objetivos
  táctiles de 44px.
- [x] Reutilizar directamente `normalizeUrl` como representación visible. Sus
  pruebas existentes ya cubren `http:`, `https:` y `mailto:` completos: correrlas
  como regresión, sin modificar el archivo salvo que aparezca un caso nuevo.
  Mostrar ese destino seleccionable con `overflow-wrap: anywhere`; no crear otro
  formateador ni hacer ningún `fetch`.
- [x] Hacer que sus `pointerdown` no armen selección/movimiento del renglón.
- [x] Mantener el panel unido al renglón para que se desplace con él; usar
  `flipIntoView` para arriba/abajo, no un desplazamiento congelado contra la
  pantalla.
- [x] Contenerlo horizontalmente por layout: ancho máximo
  `min(22rem, calc(100% - 1rem))`, URL envolvente y acciones que bajan de línea.
  En viewport móvil, comprobar las cuatro esquinas con `elementFromPoint` y que
  **Abrir**/**Editar** reciben toque; no afirmar que `flipIntoView` hace esto.
- [x] En edición usar cursor de texto sobre `<a>`; en sólo lectura mantener la
  mano de enlace.
- [x] Automatizar en `compartir.spec.ts` que un enlace de sólo lectura abre con
  un clic/toque y no muestra **Editar**; `Ctrl/Cmd+K` abre búsqueda, no herramientas
  de enlace. No dejar estas garantías sólo manuales.
- [x] Llevar a `formatting-undo.spec.ts` los guardias esenciales que sí deben
  correr en Safari/Tauri: clic sin modificador abre el panel sin navegar y
  `Ctrl/Cmd+K` dentro del enlace enfoca **Abrir**. No ampliar el proyecto WebKit
  a `formatting.spec.ts`, que está separado por compatibilidad.
- [x] Cerrar el panel ante escritura, selección de texto, cambio de bloque,
  cambio de nota, toque afuera y `Escape`. Al cerrar por teclado, restaurar la
  selección/cursor guardado; al abrir con puntero, no robarlo.
- [x] Correr:

```bash
pnpm vitest run src/lib/format/url.test.ts
pnpm exec playwright test e2e/formatting.spec.ts --project=chromium --reporter=line
pnpm exec playwright test e2e/formatting-undo.spec.ts --project=webkit --reporter=line
pnpm exec playwright test e2e/compartir.spec.ts e2e/mobile-a11y.spec.ts --project=chromium --reporter=line
```

**Criterio de salida:** ningún gesto ambiguo abandona la nota, pero abrir sigue
siendo evidente y alcanzable sin modificadores en cualquier pantalla.

---

### Tarea 3: Editar y borrar caracteres dentro del enlace

**Archivos:**

- Modificar: `e2e/formatting.spec.ts`
- Modificar `BlockRow.svelte` o `sanitize.ts` sólo si una prueba demuestra una
  falla real que la Tarea 1 no cubrió.

**Resultado:** El panel nuevo no sólo evita abrir: permite poner el cursor en un
carácter concreto y editar como texto normal.

- [x] Prueba: enlazar todo el renglón, hacer clic cerca del final, `Backspace`,
  comprobar que desaparece una letra y el resto conserva el mismo `href`.
- [x] Esperar más de 650ms, recargar y comprobar lo mismo. Esto protege la cola
  de guardado, no sólo el DOM.
- [x] Prueba: escribir un carácter en el medio y confirmar que queda dentro del
  mismo enlace.
- [x] Prueba: borrar el primer y el último carácter sin enlazar texto vecino.
- [x] Prueba: borrar todo, confirmar fila visualmente vacía y cero `<a>` antes y
  después de recargar. No exigir que `content` sea `''`; puede ser `"\n"`.
- [x] Prueba: `Ctrl/Cmd+Z` restaura texto y enlace en un solo paso.
- [ ] Repetir el camino principal con viewport táctil: toque, panel, cursor,
  borrado. La pulsación larga nativa se verifica a mano si Playwright no la
  reproduce fielmente.

**Criterio de salida:** el enlace se comporta como formato del texto, no como una
capa que impide editarlo.

---

### Tarea 4: Clic en la manija selecciona; arrastre mueve

**Archivos:**

- Modificar: `src/lib/editor/dragReorder.svelte.js`
- Modificar: `src/lib/editor/dragReorder.test.js`
- Modificar: `src/lib/editor/textDrag.svelte.js`
- Modificar: `src/lib/editor/textDrag.test.js`
- Modificar: `src/lib/editor/Editor.svelte`
- Modificar: `src/lib/editor/BlockRow.svelte`
- Modificar: `src/lib/editor/BlockActionsMenu.svelte`
- Modificar: `src/lib/editor/FloatingFormattingToolbar.svelte`
- Modificar: `src/lib/editor/SlashMenu.svelte`
- Modificar: `src/lib/editor/DatePanel.svelte`
- Modificar: `src/lib/editor/ImageLightbox.svelte`
- Modificar: `src/lib/components/TagPicker.svelte`
- Modificar: `src/lib/components/TagChips.svelte`
- Modificar: `src/lib/blocks/indent.test.ts`
- Modificar: `e2e/move-blocks.spec.ts`
- Modificar: `e2e/slash.spec.ts`
- Modificar: `e2e/imagenes.spec.ts`
- Modificar: `e2e/compartir.spec.ts`
- Modificar: `e2e/mobile-a11y.spec.ts`

**Resultado:** El estado estructural representa un rango de uno o más renglones.
Un clic/toque de manija crea el rango de uno; el primer movimiento real conserva
el reordenamiento actual. Una manija dentro de un grupo existente conserva el
grupo; una manija fuera de él selecciona sólo su renglón.

- [x] En `dragReorder.test.js`, escribir primero dos pruebas: soltar la manija sin
  mover llama una vez al callback con el id y tipo de puntero; moverla cruza el
  umbral, aplica el plan y no llama al clic.
- [x] Exponer `engaged` en ambos controladores: `dragReorder` vale verdadero con
  timer/manija/selección armada o arrastre activo; `textDrag`, desde que existe
  `source`. Probar que armar lo enciende y `pointerup`/`Escape`/`destroy` lo
  apagan, aun antes de cruzar el umbral. Exponer también `cancel()` como la misma
  limpieza pública e idempotente que usa `Escape`, para que la captura del editor
  pueda cancelarlos antes de detener el evento.
- [x] Guardar qué bloque armó la manija y resolver el clic en `onUp`, antes de
  limpiar ese dato. No inferirlo desde el bloque activo.
- [x] Si el id ya está dentro de una selección de dos o más, el callback no
  reemplaza ni borra `selectionMenu`; probar un grupo con el menú cerrado y otro
  con “Convertir N renglones…” abierto. Si está fuera, crea
  `{ anchorId: id, focusId: id }` y cierra el menú anterior.
- [x] Separar en `Editor.svelte` los nombres/ideas:
  `blockSelectionActive` para uno o más y `multiBlockSelection` para dos o más.
  Pintado, anuncios, copia/borrado y arrastre leen el primero; el menú grupal `/`
  y los planificadores grupales leen sólo el segundo.
- [x] Pintar y anunciar también “1 renglón seleccionado”. El color no es la única
  señal; los controles del renglón permanecen visibles.
- [x] La manija pasa a ser exactamente `<button type="button" tabindex="-1">`,
  con nombre “Seleccionar o arrastrar renglón”, `aria-pressed={selected}` y área
  táctil de 44px. Conserva `pointerdown` para armar el arrastre; su `click` sólo
  activa selección cuando `event.detail === 0` (teclado/tecnología asistida),
  evitando duplicar el callback que ya llega tras un puntero. Así es semántica y
  activable sin sumar una parada de Tab por cada fila.
- [x] Probar la activación asistida con `element.click()`/evento `detail === 0`:
  selecciona una vez. Un clic real de puntero usa el callback de `pointerup` y no
  duplica la selección.
- [x] La manija permanece en el primer hueco también sobre una fila activa vacía.
  Mover `+` al hueco de colapsar cuando esté libre; si hay hijos, priorizar
  colapsar y dejar `/` como entrada existente. En móvil, la manija del renglón
  activo queda visible sin depender de hover.
- [x] Al seleccionar con mouse, enfocar una superficie del mismo renglón para que
  las teclas no actúen sobre el anterior. Para imagen, agregar destino explícito:
  marcar tanto la descripción editable como el botón de imagen con
  `data-block-surface` y elegir el que corresponda. Con toque, actualizar
  `activeBlockId` y la selección sin enfocar una casilla de texto ni levantar el
  teclado virtual.
- [x] Definir las teclas sobre **uno** antes del `return` de selección múltiple:
  `Ctrl/Cmd+C` llama la copia individual sin hijos; `Backspace/Delete` borra el
  renglón con sus descendientes; `Enter` limpia la selección y vuelve a editar
  sin crear; `Escape` limpia y conserva foco; `Shift+↑/↓` extiende desde el
  anchor/focus existente; `/` en una fila textual limpia y sigue por el menú
  ordinario, mientras imagen/separador conservan su no-op.
- [x] `Tab`/`Shift+Tab` sobre uno llaman las rutas existentes
  `handleIndent`/`handleOutdent`, que usan `planIndent`/`planOutdent`.
  `Alt+↑/↓` llama el movimiento individual. Nunca enviar uno a
  `planIndentSelection`, cuyo cálculo por cantidad no sustituye a
  `nextFreeOrder`.
- [x] Poner el guard de sólo lectura antes de cualquier rama estructural que
  escriba. Con selección de uno o varios, permitir extensión y copia; hacer no-op
  para convertir, borrar, anidar/desanidar, mover, Deshacer y Rehacer. No pasar
  `onDragHold`/`onTextSelectionMousedown` a un controlador en sólo lectura; sumar
  además guardias defensivos en `reorder.onApply` y `applyTextMove` por si un
  gesto ya estaba armado al cambiar el rol. No interferir con las puertas propias
  del invitado para tildar y comentar.
- [x] Agregar regresión con hijos de órdenes fraccionarios/con huecos: Tab sobre
  uno aterriza en `nextFreeOrder`, no pisa una posición y Deshacer lo revierte.
- [x] Marcar con `data-editor-transient` las superficies enumeradas en “Prioridad
  única de Escape”. En `Editor`, ordenar `Escape` así: si un controlador está
  `engaged`, reclamar y llamar su `cancel()`; después resolver menú grupal; antes
  de crear/soltar selección, exigir objetivo `[data-block-surface]` o editable y
  cero marcadores transitorios. Un botón ordinario no cuenta, pero código plegado
  e imagen con `data-block-surface` sí.
- [x] `Enter` sobre un renglón seleccionado sólo vuelve a editarlo; no crea un
  renglón nuevo.
- [x] Clic/toque en el texto seleccionado conserva la conducta actual: suelta la
  selección y coloca el cursor.
- [x] Auditar y cortar `pointerdown` en **todos** los controles que no son la
  superficie editable: `+`, colapsar, casilla, imagen, código colapsado, fecha,
  opciones de conflicto, quitar etiqueta, copiar, copiar con hijos, `...` y sus
  paneles. Probar al menos casilla, colapsar, quitar etiqueta y menú mientras la
  selección sigue viva.
- [x] Agregar e2e de fila normal: manija pinta uno; `Ctrl/Cmd+C` excluye hijos;
  copiar con subniveles los incluye; eliminar + Deshacer; `Shift+flecha` crece a
  dos; `Tab`/`Shift+Tab`, `Alt+flecha`, `Enter` y `Escape`; arrastrar la misma
  manija sigue moviendo; clic en texto vuelve a editar.
- [x] Agregar e2e de bordes: manija en fila vacía sin perder `+`; imagen
  seleccionada y tecla aplicada a esa imagen, no a la fila anterior; manija
  dentro de grupo conserva grupo/menú; `/` sobre uno abre el menú ordinario;
  activación asistida de la manija selecciona exactamente una vez.
- [x] Agregar e2e de prioridad: desde un renglón sin capas, primer `Escape`
  selecciona y segundo suelta; con panel de enlace, barra, menú de acciones o
  imagen ampliada, el primero sólo cierra; con arrastre activo/armado, sólo lo
  cancela, incluso si el menú grupal estaba abierto. Incluir código plegado e
  imagen como botones `[data-block-surface]`. Ningún caso crea o pierde selección
  por accidente.
- [x] En `compartir.spec.ts`, crear una selección de sólo lectura y probar que
  `Ctrl/Cmd+C` funciona pero `/`, `Delete`, `Tab` y `Alt+flecha` no cambian texto,
  tipo, jerarquía ni orden. Probar también `Ctrl/Cmd+Z`/Rehacer, arrastre largo de
  bloque y arrastre de texto marcado: ninguno arma/aplica una escritura.
- [x] Correr:

```bash
pnpm vitest run src/lib/editor/dragReorder.test.js src/lib/editor/textDrag.test.js src/lib/blocks/selection.test.ts src/lib/blocks/indent.test.ts
pnpm exec playwright test e2e/move-blocks.spec.ts e2e/slash.spec.ts e2e/imagenes.spec.ts e2e/compartir.spec.ts e2e/mobile-a11y.spec.ts --project=chromium --reporter=line
```

**Criterio de salida:** seleccionar y mover comparten manija sin compartir
resultado; el umbral de movimiento decide de manera determinista.

---

### Tarea 5: Integración, documentación y verificación humana

**Archivos:**

- Modificar: `docs/guia/03-escribir-y-organizar.md`
- Modificar: `docs/guia/04-formato-del-texto.md`
- Modificar: `docs/guia/06-seleccionar-deshacer-colapsar.md`
- Modificar: `docs/guia/10-buscar.md`
- Modificar: `docs/guia/15-usar-en-celular.md`
- Modificar: `docs/guia-de-uso.md`
- Modificar: `src/lib/components/HelpDialog.svelte`
- Modificar: `CHANGELOG.md`

**Documentación visible:**

- La guía de formato explica primer toque, **Abrir**, **Editar**,
  `Ctrl/Cmd+clic` y cómo borrar letras dentro de un enlace.
- La guía de selección explica clic/toque versus arrastre de la manija y las
  acciones disponibles sobre un solo renglón.
- La guía de organización deja de describir la manija sólo como arrastre y
  explica que un clic selecciona sin mover.
- La guía de búsqueda explica las tres ramas de `Ctrl/Cmd+K` dentro de una nota
  editable y que, en una nota compartida de sólo lectura, siempre abre búsqueda.
- La guía móvil explica que abrir requiere el botón visible, no una tecla que el
  teléfono no tiene, y que la manija permanece disponible en el renglón activo,
  incluso vacío o con imagen.
- El changelog lleva dos viñetas en castellano y sin jerga: una para enlaces
  editables y otra para selección de un renglón.
- La ayuda integrada refleja la misma prioridad de `Escape`, las tres ramas
  editables de `Ctrl/Cmd+K` y su única ruta de búsqueda en sólo lectura; el tema
  6 del índice pasa de “selección múltiple” a “seleccionar uno o varios
  renglones”.

- [x] Actualizar las cinco guías, la ayuda integrada, la descripción del tema 6 y
  la fecha del índice en el mismo commit que el comportamiento.
- [x] Agregar las dos viñetas a la versión en curso de `CHANGELOG.md`.
- [x] Correr la batería focalizada:

```bash
pnpm vitest run src/lib/format/sanitize.test.ts src/lib/format/url.test.ts src/lib/editor/dragReorder.test.js src/lib/editor/textDrag.test.js src/lib/blocks/selection.test.ts src/lib/blocks/indent.test.ts
pnpm exec playwright test e2e/formatting.spec.ts e2e/move-blocks.spec.ts e2e/slash.spec.ts e2e/imagenes.spec.ts e2e/compartir.spec.ts e2e/mobile-a11y.spec.ts --project=chromium --reporter=line
pnpm exec playwright test e2e/formatting-undo.spec.ts --project=webkit --reporter=line
```

- [x] Correr las puertas generales:

```bash
pnpm vitest run
pnpm check
pnpm build
```

  Cualquier diagnóstico nuevo bloquea el cierre. Si `pnpm check` conserva sólo
  diagnósticos de la línea base, informarlos como deuda previa y detenerse antes
  de declarar todas las puertas verdes; no ampliar este cambio para arreglarlos
  sin autorización.

**Resultado final automático, 2026-08-20:** Vitest completo, 128 archivos y
1373 pruebas aprobadas; Chromium completo, 232 aprobadas y 1 omitida conocida;
WebKit focalizado, 3 aprobadas; build de producción aprobado; `git diff --check`
aprobado. `pnpm check` quedó en 3 errores de la línea base y 0 advertencias: uno
en `src/lib/format/commands.ts:143` y dos en
`src/lib/storage/db.migrations.test.ts:33`. Los dos diagnósticos de
`DatePanel.svelte` que estaban en la base sí quedaron resueltos durante este
trabajo, sin aparecer diagnósticos nuevos.

- [x] Verificar manualmente en la app web, en escritorio y a 390px: barra,
  editor de enlace, foco, reflujo y consola. Sin cortes ni errores de consola.
- [ ] Verificar manualmente en Tauri de escritorio: seleccionar, borrar una
  letra, borrar todo, Deshacer, **Abrir**, **Editar**, `Ctrl/Cmd+clic`, clic de
  manija, arrastre y borrar renglón.
- [ ] Verificar manualmente en un teléfono real: toque al enlace no navega,
  **Abrir** sí, pulsación larga selecciona texto, se puede borrar una letra, la
  manija selecciona y arrastrarla mueve.
- [ ] Probar una nota de sólo lectura: el enlace abre directamente y el texto
  todavía se puede marcar arrastrando/pulsando largo; `Ctrl/Cmd+K` busca y las
  teclas, Deshacer/Rehacer y arrastres no modifican nada. Esta revisión humana
  complementa, no sustituye, las pruebas automatizadas de Tareas 2 y 4.
- [x] Ejecutar la auditoría y pulido de Stage 4. `/impeccable` no estaba
  disponible en este entorno; se usaron `web-design-guidelines`, `taste-skill`,
  inspección visual con Playwright y dos revisiones independientes, y se
  corrigieron todos sus hallazgos altos y medios.
- [x] Después de cualquier corrección de Stage 4, repetir la batería focalizada,
  `pnpm vitest run`, `pnpm check` y `pnpm build`; no reutilizar resultados previos
  al pulido.
- [x] Mostrar a Hernán el informe de Stage 4 y preguntar: “¿Querés que ajuste
	algo antes de cerrar?”. No cerrar mientras haya un ajuste pedido pendiente.
- [x] Revisar el diff final para confirmar que no entró trabajo ajeno ni una
  vista previa remota.
- [x] Dejar un solo conjunto listo para commit, con código, pruebas, guía y
  changelog inseparables. Crear el commit sólo si Hernán lo pide explícitamente.

## Criterios finales de aceptación

- Un enlace que ocupa todos los caracteres del renglón se puede editar con
  mouse, trackpad, teclado y pantalla táctil.
- El primer clic/toque **sin modificador** en una nota editable nunca abre la
  dirección por sorpresa.
- **Abrir** y `Ctrl/Cmd+clic` llegan a la dirección usando `openExternal`.
- En una nota editable, `Ctrl/Cmd+K` dentro de un enlace abre acciones con foco
  utilizable; con texto marcado conserva el editor de URL; fuera de ambos abre
  la búsqueda. En sólo lectura siempre abre búsqueda y nunca edición de enlace.
- El destino completo de `http:`, `https:` o `mailto:` es visible, y el panel y
  sus dos acciones quedan dentro del `visualViewport` estrecho.
- Una nota de sólo lectura conserva apertura directa.
- Su selección estructural permite copiar uno o varios renglones, pero ninguna
  tecla, Deshacer/Rehacer ni arrastre de bloque/texto modifica contenido ajeno.
- Borrar una letra conserva el enlace en el resto; borrar todo no deja un enlace
  invisible aunque el vacío se proyecte como `"\n"`; Deshacer restaura ambos.
- Clic/toque en la manija selecciona un renglón; arrastrarla lo mueve. La manija
  sigue disponible en filas vacías e imágenes y no rompe un grupo existente.
- Copiar, mover y borrar actúan sobre ese renglón y sus hijos según las reglas
  explícitas: el atajo de copia excluye hijos, el botón de subniveles los incluye
  y borrar/mover transportan el subárbol.
- `Shift+flechas`, `Enter`, `Escape`, `/`, `Tab`/`Shift+Tab` y `Alt+flechas`
  tienen una ruta probada para una selección de uno; Tab individual conserva
  `nextFreeOrder`.
- `Escape` nunca salta una capa: cancela un gesto armado, después cierra
  menús/paneles y sólo entonces crea o suelta la selección estructural.
- Casilla, colapsar, imagen, etiqueta, copias, menú y paneles no arman el
  arrastre ni borran la selección al usarse.
- Los grupos de varios renglones, el arrastre de texto, la barra de formato, `/`,
  las etiquetas, el guardado y la sincronización no retroceden.
- El panel funciona dentro del `visualViewport`, tiene objetivos táctiles de
  44px, se usa con teclado y no comunica nada sólo mediante color.
- Los guardias esenciales de enlace pasan en WebKit mediante
  `formatting-undo.spec.ts`, el archivo permitido por su proyecto enfocado.
- Guía, changelog y spec 042 describen exactamente lo que quedó construido.
- `AGENT.md` y la parte afectada de spec 020 ya no contradicen la spec 042; el
  modelo de datos declara cero migraciones/cambios de esquema.

## Registro de la revisión final

Completar durante la Tarea 0, nunca por anticipado:

```text
Revisado con Hernán: Sí
Fecha: 2026-08-20
Decisión: APROBADO PARA IMPLEMENTAR
Ajustes pedidos: Ninguno después de la auditoría final del plan.
Autorización textual para implementar: La dirección de gusto funciona. Aprobado para implementar.
```
