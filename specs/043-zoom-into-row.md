# 043 - Entrar en un renglón (zoom)

Diseñada con Hernán el 2026-08-21. Aprobada por él en la misma sesión.

## Objective

Que cualquier renglón de una nota se pueda **abrir como si fuera la nota entera**:
sus hijos ocupan la pantalla, el renglón pasa a ser el título editable de arriba,
y un camino de migas de pan devuelve a donde estaba. Es el gesto central de
Workflowy y lo único que le falta a CopyNotes para trabajar dentro de notas
largas — el anidado sin límite ya existe desde la spec `003`.

**Entrar es una lente, no un dato nuevo.** La nota en disco no cambia: el editor
ya carga todos los renglones de la nota abierta y lo único que se mueve es desde
qué renglón empieza a dibujar. Deshacer, guardar, la nube, el respaldo, el
agente, compartir, etiquetas y fechas no se enteran de que esto existe.

## What Enters

- Estado `zoomBlockId` en el editor: `null` es la nota entera, un id es "estoy
  parado adentro de ese renglón". Vive en memoria, no en la fila.
- Tres caminos para entrar, cada uno donde sirve:
  - **Escritorio**: **doble clic en la manija `⠿`** del renglón. Un clic solo
    sigue seleccionando el renglón y arrastrarla sigue moviéndolo: el doble clic
    era el único gesto de la manija que estaba libre. No entra en el separador ni
    en la imagen, que no tienen texto que pueda hacer de título.

    > Corrección del 2026-08-22, después de verlo construido. Esta spec pedía un
    > ícono propio al lado de la flechita, y se descartó la manija porque "ya
    > estaba ocupada" — pero eso era cierto del clic **simple**, no del doble. El
    > ícono costaba ~20px de hueco reservado en **todos** los renglones (el texto
    > salta si el hueco no está siempre), y ése era el único punto en que la nota
    > en reposo dejaba de verse como antes. Con el doble clic el hueco no existe,
    > y se van también el botón y su CSS.
  - **Tacto**: ítem *Entrar acá* en el menú `⋯` que cada renglón ya tiene.
  - **Teclado**: `Alt+→` entra en el renglón del cursor, `Alt+←` sale un nivel.
- Camino de migas arriba de la nota: `Título de la nota › antepasado › …`, cada
  miga clickeable. La miga de la nota devuelve la nota completa.
- El renglón en el que se entró se dibuja arriba, grande y **editable en el
  lugar**, con el mismo componente de renglón que el resto (conserva su tipo,
  casilla de tarea, chips de fecha y etiqueta, formato, comentarios del agente).
- Memoria por nota: se sale de la nota y se vuelve, se sigue adentro del mismo
  renglón. Se guarda en las preferencias locales del aparato.
- Reglas de borde para que nada salga de la vista sin aviso (sección **Boundary
  Rules**).
- Ayuda (`HelpDialog`), guía de uso (`docs/guia/`) y `CHANGELOG.md` describen el
  comportamiento entregado, en el mismo commit.

## What Does Not Enter

- **Ninguna tabla, ningún campo, ninguna migración.** Ni en `blocks`, ni en
  `notes`, ni tipo de bloque nuevo. Si el diseño empieza a pedir un campo en la
  fila, la respuesta es que el diseño está mal, no la base.
- Copiar, exportar y compartir **siguen agarrando la nota entera**, se esté donde
  se esté. Para llevarse una rama ya existe *Copiar con subniveles* en el `⋯`.
- No se busca "sólo dentro de lo que veo": la búsqueda sigue siendo de toda la app.
- No se entra desde la barra lateral, ni desde la Agenda, ni desde la búsqueda:
  esas tres siempre muestran la nota entera y llevan al renglón.
- No hay dirección web propia ni botón "atrás" del navegador. Choca con el manejo
  de la barra de direcciones que ya hacen el login de Google (spec `034`) y las
  invitaciones (spec `038`), y en el escritorio no hay botón atrás.
- No se carga sólo la rama desde la base. El editor sigue leyendo la nota
  completa: Deshacer trabaja con fotos de la nota entera y `reconcile.ts` compara
  contra la nota entera; cargar de a ramas rompe las dos cosas a cambio de una
  velocidad que a este tamaño de notas no se nota.
- No cambia el aspecto de los renglones en reposo: el gesto de entrar no agrega
  ni un pixel a la fila, va montado en la manija que ya existía.
- No hay gesto de entrar en punteros táctiles (no existe "pasar el mouse" ni el
  doble clic). Ahí manda el `⋯`.

## Model Of Data Affected

No hay cambio de esquema ni migración. Lo único que se persiste es una
preferencia **local del aparato**:

| clave | forma | notas |
|---|---|---|
| `zoomRootByNote` | `{ [noteId]: blockId }` | `backupSafe: false` |

- Se declara en `storage/settings-registry.ts` como cualquier otra preferencia.
  **`backupSafe: false`**: es dónde estaba parada *esta* persona en *este*
  aparato, no un dato de la nota. Restaurar un respaldo no debe mover a nadie de
  lugar, y un aparato nuevo arranca viendo las notas enteras.
- Al escribir se podan las entradas más viejas por encima de **50 notas**. Sin
  poda, la clave crece para siempre con cada nota que alguna vez se abrió.
- Al leer se valida: el bloque tiene que existir, no estar borrado y pertenecer a
  esa nota. Cualquier otra cosa se ignora y se muestra la nota entera.
- `imageBodies`, `SYNCED_TABLES`, `BACKUP_TABLES`, `LOCAL_ONLY_FIELDS`,
  `BIRTH_DEFAULTS` y `resetCloudState()` **no se tocan**: no hay campo nuevo en
  ninguna fila que viaje.

## Where The Root Enters The Pure Modules

Todas las funciones puras que hoy dan por hecho que la raíz es `null` reciben un
parámetro `rootId` con **valor por defecto `null`**. Esa firma es deliberada: con
el valor por defecto, todas las pruebas y todos los llamadores actuales siguen
significando exactamente lo mismo, y el diff se lee como "se agregó un caso", no
como "se reescribió la jerarquía".

| función | archivo | qué cambia |
|---|---|---|
| `buildVisibleList(blocks, rootId)` | `blocks/hierarchy.ts` | empieza a caminar en `rootId` en vez de en `null` |
| `visibleIds(blocks, rootId)` | `blocks/selection.ts` | la lista que ordena la selección múltiple |
| `previousVisibleId(blocks, id, rootId)` | `blocks/enter.ts` | no cruza hacia arriba de la raíz |
| `planJoinWithPrevious(blocks, id, rootId)` | `blocks/enter.ts` | `null` en el primer renglón de la vista |
| `canDeleteOnBackspace(blocks, id, rootId)` | `blocks/enter.ts` | cuenta los renglones **de la vista**, no de la nota |
| `planOutdent(blocks, id, rootId)` | `blocks/indent.ts` | `null` cuando el padre del renglón ES la raíz |

Dos que **no** cambian y conviene decirlo:

- `flattenTree` (el export al agente) sigue recorriendo desde `null`. El agente
  ve la nota entera siempre: entrar es una lente de esta pantalla, no un permiso.
- `planIndent` ya hace lo correcto sin tocarlo: el primer hijo de la raíz no tiene
  hermano anterior, así que `Tab` ahí ya devolvía `null`.

En el arrastre, `resolveDrop` sigue devolviendo `newParentId: null` para la
profundidad 0 — es geometría pura y no sabe de raíces. **La traducción se hace en
el llamador**: `dragReorder` pasa `target.newParentId ?? zoomRootId` a `planDrop`.
Un solo lugar, y `planDrop` no se toca.

## Boundary Rules

Ocho reglas que hoy dicen "la nota" y pasan a decir "lo que se está viendo". El
síntoma de olvidarse una es siempre el mismo y es el peor de esta app: **un
renglón que desaparece de la pantalla**. No se pierde nada — sale de la vista y
ahí está —, pero se lee como pérdida de datos.

| Situación | Resultado |
|---|---|
| `Shift+Tab` en un renglón del primer nivel de la vista | No hace nada (`planOutdent` devuelve `null`) |
| `Backspace` al principio del primer renglón de la vista | No hace nada: el texto no sube al título |
| Arrastrar un renglón hasta el margen izquierdo | Queda como hijo de la raíz de la vista, nunca de la nota |
| `Backspace` en el último renglón que queda en la vista | No lo borra, igual que hoy no se borra el último renglón de una nota (`canDeleteOnBackspace`) |
| *Borrar* desde el `⋯` el último renglón de la vista | Se borra y se crea uno vacío enfocado: la vista nunca queda sin dónde escribir |
| Entrar en un renglón **colapsado** | Se ven sus hijos igual. Colapsar es "acá no me lo muestres"; entrar es "quiero estar adentro". El campo `collapsed` de la raíz no se modifica |
| Entrar en un renglón **sin hijos** | Se le crea un primer hijo vacío y el cursor va ahí. **En sólo lectura no se crea nada**: la vista queda con el título y sin renglones, porque mirar no puede escribir |
| Borrar desde el `⋯` el renglón en el que se está parado | Primero se sale un nivel (a su padre, o a la nota), después se borra |
| El renglón raíz desaparece desde afuera (otro aparato, importar, restaurar) | Se sale a la nota entera con un aviso: *"El renglón donde estabas ya no existe."* |

## The Zoom Title Row

El renglón raíz se dibuja arriba con el mismo `BlockRow` que los demás, en una
variante:

- **Sin manija y sin flechita de colapsar** — son gestos sobre un renglón que
  está en una lista, y éste no lo está. Con la manija se va también el doble clic
  para entrar, que vive en ella.
- **Con `⋯`**: sus acciones siguen sirviendo. *Subir/Bajar* lo mueven entre sus
  hermanos sin cambiar lo que se ve (correcto). *Borrar* aplica la regla de borde.
- Tamaño y peso de título de nota, **sin importar el tipo del bloque**: es "dónde
  estoy parado", y tiene que leerse igual siempre. El tipo se conserva en los
  datos y vuelve a verse al salir.
- `Enter` en el título **nunca parte el renglón**: lleva el cursor al primer hijo,
  creándolo si no hay ninguno. Partirlo crearía un hermano de la raíz, que es un
  renglón fuera de la vista — exactamente el síntoma que estas reglas evitan.
- `Tab` y `Shift+Tab` en el título no hacen nada.
- Todo lo demás sigue igual: escribir, formato, `/`, `#`, fecha, comentario,
  imagen, y el candado de sólo lectura de la spec `038`.

## Breadcrumbs

- `<nav aria-label="Dónde estás">` arriba de la nota, con un botón por escalón:
  el título de la nota primero, después cada antepasado del renglón raíz, en
  orden. El renglón raíz **no** se repite ahí: ya es el título de abajo.
- Clic en un escalón cambia la raíz a ese renglón; clic en el título de la nota la
  muestra entera.
- Con más de cuatro escalones se abrevia el medio (`Nota › … › Casa ›`); el texto
  de cada escalón se trunca con puntos suspensivos.
- En pantallas chicas la fila de migas se desplaza horizontal. **No puede haber
  ningún panel flotante adentro de ese contenedor** (la lección de `AGENT.md`: un
  contenedor con scroll recorta todo lo que se abra afuera de su caja, incluso lo
  posicionado en absoluto).

## Changing The Root Is A Reset

Cambiar de raíz (entrar, salir, o saltar a un escalón) tiene que dejar la
pantalla en un estado limpio, o quedan gestos apuntando a renglones que ya no se
ven:

1. Se cancela cualquier arrastre en curso (bloque y texto).
2. Se cierra toda superficie flotante: menú `/`, menú grupal, panel de fecha,
   selector de etiquetas, barra de formato, popovers de enlace.
3. Se suelta la selección estructural y `focusCaret`.
4. `activeBlockId` se limpia si el renglón que nombra no está en la vista nueva.
5. **No se re-monta el editor** ni se bumpea `dataVersion`: `blocks` es el mismo
   arreglo, `history` sigue viva, no se relee la base. Re-montar robaría el cursor
   y partiría renglones a medio escribir (`AGENT.md`, regla de los cambios de
   afuera).

## Keyboard

- `Alt+→`: entrar en el renglón donde está el cursor. `Alt+←`: salir un nivel.
- **Con dos o más renglones seleccionados, ambas teclas se consumen y no hacen
  nada.** Esto es obligatorio, no una omisión: una tecla de bloque sin rama en
  `Editor.handleSelectionKeys` cae al renglón enfocado y actúa sobre **uno** en
  silencio (`AGENT.md`; así fue como `Tab` indentaba sólo el primero de varios).
- Costo aceptado: en macOS, `Option+flecha` mueve el cursor palabra por palabra
  dentro del texto, y se lo pisa. Es la convención de Workflowy y `⌘+flecha` sigue
  libre para moverse por la línea.
- `Escape` **no** sale del zoom: ya tiene cuatro escalones (gesto → superficie →
  menú grupal → selección) y un quinto lo vuelve impredecible.
- `HelpDialog` suma las dos filas al grupo *Escribir*.

## Motion (spec 024)

Quiet Motion manda acá también, y su respuesta es **casi nada de movimiento**:

- **La lista de renglones cambia instantáneamente** al entrar, salir o saltar a
  una miga. La `024` prohíbe por nombre los efectos de transición al cambiar de
  nota, y cambiar de raíz es el mismo evento: la pantalla cambia de contenido
  entera. Deslizarla de costado sería un efecto de página.
- **El renglón-título no se anima nunca.** Es un `contenteditable` y la `024` lo
  prohíbe sin excepciones: transformarlo mueve el cursor con él.
- **El gesto de entrar no agrega motion propio**: vive en la manija, que ya
  aparece y desaparece con su fundido de 150ms (`MOTION.fast`).
- **Las migas aparecen con un fundido de 150ms, sin viaje.** El espacio que
  ocupan aparece de una: animar alto o margen es animar el layout, que empuja el
  texto y es de las cosas que la `024` prohíbe.
- Todo pasa por `motionDuration()`, así que con "reducir movimiento" prendido
  queda instantáneo y no se pierde ninguna función.
- **No** hay destello en el renglón-título al entrar. Sería un fundido ambiental
  legal (color, sin viaje), pero entrar es un acto deliberado y la pantalla ya
  cambió entera: el destello sería ruido, no una respuesta.

Una cosa que no es motion pero se le parece y hace falta: **al salir, el renglón
donde se estaba parado queda a la vista** (`scrollIntoView` centrado, **sin
suavizado**). Sin eso, salir de una rama que estaba abajo en una nota larga
devuelve la nota desde arriba y hay que buscar a mano dónde se estaba.

## Read-Only And Guest Notes

Entrar es mirar: funciona igual en una nota compartida, con o sin permiso de
escritura. El renglón-título hereda `readOnly` como cualquier otro renglón, así
que el candado de la spec `038` no necesita una puerta nueva. El doble clic en la
manija y el ítem del menú **funcionan igual en sólo lectura**, porque no escriben nada
— y una barra que aparece con botones inertes es peor que no tenerla, pero un
botón que sí funciona no es un botón inerte.

## User Flows

### Entrar y trabajar

1. La persona pasa el mouse por un renglón con hijos y aparece su manija `⠿`.
2. Doble clic en la manija: las migas muestran `Proyectos › Casa ›`, el renglón
   sube como título, y abajo quedan sólo sus hijos.
3. Escribe, anida, arrastra y borra como en cualquier nota. Nada de lo que hace
   puede sacar un renglón de la vista sin que ella lo pida.
4. Clic en `Proyectos`: vuelve la nota entera, con todo intacto.

### Volver más tarde

1. Estando adentro de *Pintar el living*, abre otra nota y cierra la app.
2. Al día siguiente abre esa nota: sigue adentro de *Pintar el living*, con las
   migas arriba diciéndoselo.

### Desde el celular

1. Toca el `⋯` del renglón y elige *Entrar acá*.
2. Sale tocando una miga.

### El renglón se fue

1. Está adentro de un renglón y otro aparato lo borra.
2. La sincronización trae el borrado: la pantalla vuelve a la nota entera con el
   aviso *"El renglón donde estabas ya no existe."*

## Acceptance Criteria

- Entrar se puede con doble clic en la manija (escritorio), el menú `⋯` (siempre)
  y `Alt+→`.
- Estando adentro se ven **exactamente** los descendientes de ese renglón, con sus
  colapsados respetados y el colapsado de la raíz ignorado.
- El renglón raíz se edita arriba y lo escrito sobrevive a recargar.
- Ninguna de las ocho reglas de borde saca un renglón de la vista.
- Arrastrar al margen izquierdo cuelga de la raíz de la vista, no de la nota.
- Copiar nota, exportar y compartir entregan la nota entera estando adentro.
- Buscar o saltar desde la Agenda a un renglón de otra rama muestra la nota entera.
- Salir de la nota y volver deja a la persona donde estaba; un id inválido o de
  otra nota muestra la nota entera sin error.
- Un aparato que restaura un respaldo no hereda dónde estaba parado otro.
- El agente, el respaldo, el paquete `.copynotes` y la nube no cambian en nada.
- Al salir, el renglón donde se estaba parado queda a la vista sin buscarlo.
- Con "reducir movimiento" prendido no se pierde ninguna función; la lista de
  renglones no se anima nunca, ni con la preferencia apagada.
- En reposo la nota se ve igual que antes de esta spec, salvo el hueco reservado.
- Ayuda, guía y changelog describen lo entregado.

## Minimum Tests

Regla que vale para todas: **nombrar la línea que pone la prueba en rojo si se
borra el control que dice probar.** Una prueba que pasa con y sin la regla no
prueba nada (`docs`/memoria: los 4 tests huecos de la spec 041).

**Vitest (lógica pura, sin DOM):**

- `buildVisibleList` con raíz: sólo descendientes; respeta colapsados de adentro;
  ignora el `collapsed` de la propia raíz; con `rootId` ausente da el mismo
  resultado de siempre.
- `planOutdent` devuelve `null` cuando el padre del renglón es la raíz, y sigue
  sacando un nivel cuando no lo es.
- `previousVisibleId` no cruza la raíz; `planJoinWithPrevious` devuelve `null` en
  el primer renglón de la vista y sigue uniendo en el segundo.
- `canDeleteOnBackspace` cuenta los renglones de la vista: con un solo hijo bajo
  la raíz devuelve `false`.
- Arrastre: `resolveDrop` en profundidad 0 + la traducción del llamador produce un
  `planDrop` con `parentBlockId` = la raíz. Control: con raíz `null` sigue dando
  `null`.
- Selección: `visibleIds` con raíz; `selectionRun` sigue exigiendo hermanos
  contiguos bajo un mismo padre.
- Memoria: guardar, leer, podar a 50, descartar un id borrado, descartar un id de
  otra nota.

**Playwright (Chromium):**

- Entrar por el menú `⋯`, ver sólo la rama, editar el título, salir por la miga y
  encontrar el texto nuevo en la nota entera.
- `Shift+Tab` en el primer nivel de la vista: el renglón sigue donde estaba.
- Borrar el último renglón de la vista deja uno vacío enfocado.
- Recargar estando adentro: sigue adentro.
- Borrar el renglón raíz desde el `⋯`: sale un nivel y el renglón no está.
- Buscar y saltar a un renglón de otra rama: aparece la nota entera.
- `Alt+→` / `Alt+←` con el cursor; con dos renglones seleccionados no pasa nada.
- Entrar con el menú `/` abierto lo cierra y no deja nada flotando.
- Salir desde una rama que estaba abajo en una nota larga deja ese renglón dentro
  de la parte visible de la pantalla.

**Táctil (proyecto móvil existente):** el ítem *Entrar acá* alcanza y funciona; no
hay doble clic ni nada nuevo que tocar; las migas se pueden tocar y desplazar.

## Agent Notes

- El parámetro nuevo se llama `rootId` en todos lados y su valor por defecto es
  `null`. No inventar una segunda forma de decir lo mismo.
- `zoomBlockId` es estado del editor. **No** guardarlo en la fila del bloque ni de
  la nota: sería un campo nuevo que le debe cinco listas al respaldo (`AGENT.md`)
  a cambio de nada.
- Cambiar de raíz **no** pasa por `dataVersion` ni por `handleDataChanged`. Esos
  dos re-montan el editor y existen sólo para importar/restaurar.
- Toda escritura del renglón-título sigue pasando por `writeBlock`. Un
  `updateBlock` directo desde el editor es un bug aunque parezca lo honesto.
- El `⋯` del renglón-título es una puerta de escritura más: al agregar el ítem
  *Entrar acá* al menú, revisar que el candado de sólo lectura siga tapando las
  que ya tapaba.
- La viñeta del `CHANGELOG.md` va en la sección de la versión **en curso**. Si la
  última sección ya está publicada, abrir la siguiente en el mismo commit.
- Esta spec extiende `003` (jerarquía y teclado) y no contradice ninguna decisión
  de `022` (organización de la barra lateral) ni de `042` (selección de renglón).
  Las carpetas dentro de carpetas siguen siendo otro tema, y siguen diferidas.
