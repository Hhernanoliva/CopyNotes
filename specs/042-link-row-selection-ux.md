# 042 - Enlaces editables y selección de un renglón

Creada y aprobada por Hernán el 2026-08-20.

## Objective

Separar tres intenciones que hoy compiten dentro del editor: editar caracteres
enlazados, abrir su destino y seleccionar el renglón completo para copiarlo,
moverlo o borrarlo. El mismo contrato debe funcionar con mouse, teclado y tacto
sin cambiar el editor personalizado de CopyNotes.

## What Enters

- En una nota editable, clic/toque sobre un enlace conserva el cursor y abre un
  panel local con el destino completo, **Abrir** y **Editar**.
- **Abrir** y `Ctrl/Cmd+clic` navegan mediante `platform/openExternal`.
- En sólo lectura, clic/toque sigue abriendo directamente.
- `Ctrl/Cmd+K` tiene tres rutas en edición: texto marcado abre el editor de URL;
  cursor dentro de un enlace abre sus acciones; fuera de ambos abre búsqueda.
  En sólo lectura siempre abre búsqueda.
- Borrar parte del texto conserva el enlace restante; borrar todo elimina el
  `<a>` vacío.
- La manija selecciona un renglón al soltar sin movimiento y lo mueve al
  arrastrar. Sigue disponible en renglones vacíos e imágenes.
- La selección estructural representa uno o más renglones. El menú grupal `/`
  continúa existiendo sólo para dos o más.
- `Escape` cancela primero gestos, luego cierra superficies y recién después
  selecciona o suelta un renglón.
- Ayuda, guía y changelog se actualizan con el comportamiento visible.

## What Does Not Enter

- No TipTap, Lexical, ProseMirror ni reemplazo del editor.
- No tarjetas, miniaturas, títulos remotos ni consultas de red para enlaces.
- No modo global Ver/Editar ni preferencia para recuperar el clic directo.
- No selección discontinua de renglones.
- No rediseño de la barra de formato.
- No cambio en creación, normalización, exportación o esquemas permitidos de URL.
- No barra nueva para una selección de un renglón.

## Model Of Data Affected

No hay cambio de esquema ni migración.

- `blocks.html` mantiene el subconjunto HTML saneado. El saneador deja de
  devolver anclas sin caracteres; puede conservar un `<br>` fuera del enlace.
- `blocks.content` sigue siendo la proyección en texto. Una fila visualmente
  vacía puede proyectarse como `"\n"`; no se exige `''`.
- La selección estructural (`anchorId`, `focusId`, ids visibles) sigue sólo en
  memoria y ahora admite un rango de longitud uno.
- No cambian `parentBlockId`, `order`, `type`, `checked`, almacenamiento ni sync.

## Interaction Contract

| Intención | Mouse/trackpad | Tacto | Teclado |
|---|---|---|---|
| Poner cursor | Clic en texto | Toque | Flechas |
| Marcar caracteres | Arrastre/doble clic | Pulsación larga | `Shift` + flechas |
| Ver destino | Clic en enlace | Toque en enlace | Cursor en enlace + `Ctrl/Cmd+K` |
| Abrir destino editable | **Abrir** o `Ctrl/Cmd+clic` | Enlace, luego **Abrir** | `Ctrl/Cmd+K`, `Enter` |
| Editar URL | **Editar** | **Editar** | Texto marcado + `Ctrl/Cmd+K` |
| Seleccionar renglón | Clic en manija | Toque en manija activa | `Escape` sin capas abiertas |
| Extender selección | `Shift+clic` | Fuera de alcance | `Shift+↑/↓` |
| Mover | Arrastrar manija | Arrastrar manija | `Alt+↑/↓` |
| Volver a editar | Clic en texto/`Enter` | Toque en texto | `Enter` |

## Link Panel

- Muestra la URL normalizada completa como texto visible y seleccionable. Admite
  `http:`, `https:` y `mailto:`; no trunca ni depende de hover.
- La URL vive en un campo de sólo lectura, visible, seleccionable y desplazable;
  el panel no supera el renglón ni `visualViewport - 16px`, y las acciones bajan
  de línea antes de desbordar.
- El layout fija el ancho máximo y `flipIntoView` mantiene el panel dentro del
  área visible tanto vertical como horizontalmente.
- Abierto con puntero no roba foco ni selección. Abierto con teclado enfoca
  **Abrir**; `Tab` llega a **Editar**, `Enter` activa y `Escape` restaura foco.
- **Editar** selecciona el enlace entero y reutiliza `LinkEditorPopover`.
- Cierra al escribir, cambiar selección/bloque/nota, tocar afuera o usar Escape.
- `role="dialog"`, nombre accesible, foco visible y objetivos táctiles de 44px.
- Visual Quiet Ink: borde/fondo/radio/tipografía existentes, sombra discreta,
  sin acento nuevo ni movimiento decorativo.

## Linked Text Editing

- Borrar un carácter mantiene el mismo `href` en todo lo restante.
- Escribir dentro del enlace conserva la dirección.
- Borrar primero/último no absorbe texto vecino ni corta el resto del enlace.
- Borrar todos los caracteres elimina `<a></a>` o `<a><br></a>`; un `<br>` puede
  sobrevivir fuera del enlace para representar la fila vacía.
- Un `Ctrl/Cmd+Z` restaura texto y enlace en un paso.
- El resultado sobrevive al guardado diferido y a recargar.

## Single Row Selection

- La manija es un botón semántico fuera del orden de Tab:
  `<button type="button" tabindex="-1" aria-pressed={selected}>`.
- `pointerdown` arma el arrastre; soltar bajo el umbral selecciona. Un `click`
  asistido (`detail === 0`) también selecciona sin duplicar el puntero.
- En fila vacía, la manija conserva su hueco y `+` usa el hueco contiguo si está
  libre; colapsar tiene prioridad cuando hay hijos.
- Tocar una manija dentro de un grupo conserva grupo y menú. Tocar una fuera lo
  reemplaza por esa única fila.
- Mouse enfoca una superficie del mismo renglón. Tacto no abre teclado virtual.
  Imagen y descripción llevan `data-block-surface` según corresponda.
- `Ctrl/Cmd+C` sobre uno equivale a **Copiar bloque**, sin hijos. **Copiar con
  subniveles** sí incluye el subárbol. Borrar/mover transportan descendientes.
- `Shift+↑/↓` extiende desde uno; `Enter` vuelve a la superficie sin crear fila;
  `/` usa el menú ordinario sólo en filas textuales.
- `Tab`/`Shift+Tab` y `Alt+↑/↓` sobre uno usan las rutas individuales existentes.
  Dos o más usan planificadores grupales.

## Escape Priority

1. Si `reorder.engaged` o `textDrag.engaged`, Editor reclama Escape y llama el
   `cancel()` público del controlador.
2. Las superficies abiertas llevan `data-editor-transient`; su dueño actual
   cierra y restaura foco.
3. Después se resuelve el menú grupal.
4. Sólo sin gesto/superficie, y desde una superficie de bloque, Escape crea una
   selección de uno o suelta la selección existente.

Botones ordinarios no cuentan como superficie. Código plegado e imagen sí cuando
llevan `data-block-surface`.

## Read-Only Safety

Una nota compartida permite seleccionar y copiar, nunca reescribir al dueño:

- Permitidos: `Escape`, `Shift+↑/↓`, `Ctrl/Cmd+C`, clic directo en enlaces,
  tildar/comentar por sus puertas autorizadas.
- Sin escritura: `/`, borrar, Tab, Alt+flechas, Deshacer/Rehacer, arrastre de
  bloque y arrastre de texto.
- Los controladores no se arman en sólo lectura; sus callbacks de escritura
  también comprueban `readOnly` como defensa si cambia el rol a mitad de gesto.

## User Flows

### Editar un enlace que ocupa todo el renglón

1. Clic/toque pone el cursor y muestra la dirección completa.
2. La persona edita caracteres normalmente o elige **Editar** para cambiar URL.
3. **Abrir** navega; ningún gesto ambiguo abandona la nota.

### Abrir sin mouse

1. Cursor dentro del enlace, `Ctrl/Cmd+K`.
2. **Abrir** recibe foco.
3. `Enter` navega o `Tab` y `Enter` abren **Editar**.

### Seleccionar y mover una fila

1. Clic/toque breve en manija: fila resaltada y anunciada.
2. Copiar, menú, Delete o teclas actúan sobre esa fila según el contrato.
3. Arrastrar la misma manija mueve la fila en lugar de seleccionarla.

### Nota compartida

1. Escape selecciona una o varias filas para copiar.
2. Teclas o arrastres de escritura no cambian contenido, jerarquía ni orden.
3. Clic en enlace abre directamente y `Ctrl/Cmd+K` abre búsqueda.

## Acceptance Criteria

- Un enlace completo se puede editar con mouse, teclado y tacto.
- Clic/toque sin modificador en edición no navega; **Abrir** y modificador sí.
- El panel muestra el destino completo y permanece dentro del viewport móvil.
- `Ctrl/Cmd+K` respeta sus tres rutas editables y la ruta única de sólo lectura.
- Borrado parcial conserva enlace; borrado total no deja ancla; Undo restaura.
- Clic/toque de manija selecciona; arrastre mueve; vacío e imagen tienen manija.
- Una manija dentro de un grupo no destruye grupo ni menú.
- Copia individual/subárbol, Delete, Shift+flechas, Enter, Escape, `/`, Tab y
  Alt+flechas cumplen las reglas anteriores.
- Escape no atraviesa un gesto o una superficie abierta.
- Sólo lectura no tiene ningún camino estructural de escritura.
- Barra de formato, grupo `/`, texto arrastrable, guardado y sync no retroceden.
- Ayuda, guía y changelog describen exactamente el comportamiento entregado.

## Minimum Tests

- Vitest: anclas con texto, vacías y con `<br>`; borrado parcial; `engaged` y
  `cancel()` de ambos controladores; clic/arrastre de manija; orden individual.
- Chromium: panel, Abrir, Editar, `Ctrl/Cmd+clic`, tres ramas de `Ctrl/Cmd+K`,
  borrado/recarga/Undo, manija/selección/teclas, vacío, imagen, grupo y Escape.
- WebKit (`formatting-undo.spec.ts`): clic abre panel sin navegar y teclado enfoca
  **Abrir**.
- Táctil: dos toques para abrir, texto editable, manija visible, sin teclado
  inesperado, panel y botones enteros/alcanzables.
- Sólo lectura: apertura directa, búsqueda por `Ctrl/Cmd+K`, copia permitida;
  teclas, Undo/Redo y ambos arrastres no escriben.

## Agent Notes

- Esta spec reemplaza sólo la interacción de apertura/edición de enlace afectada
  en spec 020 y la regla anterior de clic directo de `AGENT.md`.
- `anchorForRange` sigue siendo la puerta única para encontrar el enlace de una
  selección; no duplicar esa búsqueda.
- Toda URL se normaliza en web y se revalida en Rust antes de `openExternal`.
- No inferir selección estructural desde `window.getSelection()`.
- Menú grupal y planificadores grupales siguen requiriendo dos o más filas.
- En sólo lectura, proteger tanto la entrada como el callback de cualquier gesto
  que escriba.
