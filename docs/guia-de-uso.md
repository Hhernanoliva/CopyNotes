# Guía de uso de CopyNotes

Todo lo que podés hacer en CopyNotes hoy. Este documento se actualiza cada vez que se agrega una funcionalidad nueva.

Última actualización: 2026-07-10 (mejoras de editor, tanda C: seleccionar varios renglones).

## Lo básico

- **Tus notas viven en este dispositivo.** No hay cuenta ni nube: todo se guarda automáticamente en el navegador.
- **Guardado automático.** Mientras escribís, arriba a la derecha aparece "Guardando…" y después "Guardado". No hay botón de guardar.
- **Última nota abierta.** Al volver a la app, se abre la nota donde quedaste.

## Notas

| Acción | Cómo |
|---|---|
| Crear nota | Botón **+** en la barra lateral, o el botón **Nueva nota** si no tenés ninguna |
| Cambiar de nota | Clic en la nota en la barra lateral |
| Mostrar/ocultar la lista de notas | Botón de panel (arriba a la izquierda) |
| Ponerle título | Escribí en el título; **Enter** te baja al primer renglón |

## Tipos de renglón (bloques)

Cada renglón de una nota es un bloque y tiene un tipo:

- **Texto** — renglón común.
- **Viñeta** — punto de lista, estilo Workflowy.
- **Tarea** — casilla para tildar; al tildarla el texto queda tachado.
- **Código** — fondo gris y letra de máquina, para pegar código o comandos.
- **Separador** — línea horizontal para dividir secciones.

### Cómo cambiar el tipo

- Escribí **`/`** al inicio de un renglón vacío: se abre un menú con los tipos. Filtrá escribiendo (ej. `/ta` para Tarea), movete con **↑ ↓**, elegí con **Enter**, cancelá con **Escape**.
- Atajo escrito: **`- `** o **`* `** (guion o asterisco, y espacio) al inicio de un renglón de texto lo convierte en viñeta.
- Atajo escrito para etiquetar: escribí **`#`** en un renglón y se abre el selector de etiquetas de ese renglón (el `#` no queda escrito, es solo el gatillo).

## Escribir y organizar

| Tecla | Qué hace |
|---|---|
| **Enter** | Renglón nuevo, del mismo tipo que el actual |
| **Shift+Enter** | Agrega/edita la **nota gris** del renglón (ver abajo). En bloques de código, hace salto de línea |
| **Tab** | Anida el renglón adentro del de arriba (necesita un renglón hermano arriba; el primero de cada nivel no se puede anidar) |
| **Shift+Tab** | Lo saca un nivel de anidado |
| **Alt+↑ / Alt+↓** | Mueve el renglón (con todos sus hijos) arriba o abajo entre sus hermanos |
| **Backspace** en renglón vacío | Ver "Borrar renglones" abajo |

### Doble Enter para salir del anidado

Si estás escribiendo hijos adentro de una viñeta y querés arrancar otra viñeta aparte: **Enter** te da un renglón nuevo, y **Enter de nuevo** (con el renglón vacío) lo saca un nivel de anidado. Si estás muy profundo, cada Enter extra sube un nivel más, hasta llegar afuera.

Bonus: Enter en una viñeta/tarea vacía que ya está afuera de todo cancela el tipo y la deja como texto.

### Borrar renglones (Backspace en renglón vacío)

En dos pasos, como Workflowy:

1. **Primer Backspace** en una viñeta, tarea o código vacío: cancela el tipo. Quedás como texto, en el mismo renglón.
2. **Segundo Backspace**: borra el renglón y subís al de arriba.

- Los renglones de texto vacíos y los separadores se borran con un solo Backspace.
- Un renglón que tiene hijos adentro **no se puede borrar** con Backspace: primero sacá o borrá los hijos. Es protección contra borrar de más.

### Enter en un renglón con hijos

Si el renglón tiene hijos a la vista, Enter crea el renglón nuevo como **primer hijo** (porque ahí está mirando el ojo). Si los hijos están colapsados, crea un hermano abajo.

## Nota gris del renglón (estilo Workflowy)

Cada renglón puede tener una **nota**: un texto secundario, gris y más chico, pegado debajo, para aclaraciones o detalles que no querés que ensucien la línea principal.

- **Agregar/editar:** parado en un renglón, apretá **Shift+Enter**. Se abre la nota justo abajo y escribís ahí. Puede tener varias líneas.
- **Salir de la nota:** clic en otro lado, o **Escape** para volver al renglón.
- **Borrar la nota:** con la nota vacía, apretá **Backspace**: desaparece y volvés al renglón. Una nota vacía que perdés el foco también se esconde sola.
- La nota **viaja con el renglón**: se guarda, se copia (como sub-línea debajo) y se exporta en Markdown y HTML.
- En **bloques de código**, Shift+Enter no hace nota: hace salto de línea, porque el código es multilínea.

## Seleccionar varios renglones

Podés marcar varios renglones a la vez y actuar sobre todos juntos.

- **Con el mouse:** clic en un renglón y **arrastrá** hacia arriba o hacia abajo sin soltar; se van pintando todos los que tocás. O hacé clic en uno y **Shift+clic** en otro para marcar el rango de una.
- **Con el teclado:** parado en un renglón, **Shift+↑ / Shift+↓** empieza a marcar hacia arriba o hacia abajo, y cada golpe suma (o quita) un renglón. Una flecha sola (sin Shift) deja la selección y mueve el cursor normal.
- **Copiar** los seleccionados: **Cmd+C** (Ctrl+C en Windows). Copia todo el grupo como esquema, respetando niveles.
- **Borrar** los seleccionados: **Backspace** o **Delete**. Se borran todos (recuperable). Si un renglón seleccionado tiene hijos, se van con él. Si borrás todo, queda un renglón vacío para seguir.
- **Mover** el grupo: **Alt+↑ / Alt+↓**. Mueve todos los seleccionados juntos entre sus vecinos (funciona cuando son hermanos seguidos).
- **Salir de la selección:** **Escape**, o hacé clic o empezá a escribir en un renglón.

## Colapsar y expandir

Los renglones con hijos muestran una **flechita** a la izquierda al pasar el mouse. Clic en la flechita esconde los hijos (la flechita queda visible apuntando al costado); otro clic los muestra. Los hijos escondidos no se borran: siguen ahí y vuelven al expandir. El estado colapsado se recuerda al recargar.

## Tareas anidadas (cascada)

Cuando anidás tareas adentro de tareas:

- Tildar la tarea **padre** tilda todas las tareas de adentro.
- Destildar el padre las destilda todas.
- Al tildar la **última** tarea hija pendiente, el padre se tilda solo.
- Destildar cualquier hija destilda al padre (y sigue hacia arriba).
- Solo participan las tareas: los textos o viñetas mezclados en el medio no afectan ni se afectan.

## Copiar bloques

Al pasar el mouse por un renglón (o llegar con el teclado) aparecen dos botones a la derecha:

- **Copiar bloque** (icono de dos hojas, siempre a la vista): copia solo ese renglón.
- **Más acciones** (los tres puntitos **⋯**): abre un menú chico con el resto de las acciones del renglón:
  - **Copiar con subniveles**: aparece si el renglón tiene hijos; copia el renglón con todo lo anidado adentro, aunque esté colapsado.
  - **Guardar como snippet**.
  - **Etiquetar** (atajo: escribir `#` en el renglón).

Después pegás donde quieras:

- En apps simples (Notas, un mail sin formato): llega como texto con sangría legible; las tareas se ven como `[x]` (hecha) o `[ ]` (pendiente).
- En editores con formato (Google Docs, Notion, Gmail): llega como lista con viñetas y niveles de verdad.
- Los bloques de código mantienen sus líneas tal cual.

No hace falta seleccionar el texto a mano. Al copiar aparece un avisito abajo que dice **"Copiado"**; si el navegador no deja copiar, avisa con un mensaje para reintentar.

## Snippets (textos reutilizables)

Un snippet es un texto que usás seguido —una respuesta tipo, una checklist, una firma— guardado aparte para insertarlo en cualquier nota cuando lo necesites.

### Guardar un snippet

- **Desde un renglón:** pasá el mouse por el renglón, tocá los **tres puntitos ⋯** a la derecha y elegí **Guardar como snippet**. Se guarda ese renglón **con todo lo anidado adentro**. Aparece el avisito "Snippet guardado".
- **Desde cero:** en la barra lateral, pasá a la pestaña **Snippets** y tocá el **+**. Se abre una ventanita para escribir o pegar el texto (el nombre es opcional: si no ponés uno, usa la primera línea).

El snippet guardado es una **copia independiente**: si después editás o borrás el renglón original, el snippet no cambia ni se pierde.

### La biblioteca de snippets

Arriba de la barra lateral hay un conmutador **Notas | Snippets**. En la pestaña Snippets ves todos tus snippets, con su nombre y un adelanto del contenido. Al pasar el mouse por uno aparecen sus acciones:

- **Estrella** — lo marca como favorito. Los favoritos van siempre primero en la lista y en el menú de insertar. La estrella queda visible y rellena.
- **Insertar en la nota** (flecha hacia abajo) — mete el snippet en la nota abierta, debajo del renglón donde estabas escribiendo.
- **Borrar** (tachito) — lo saca de la lista. Como todo en CopyNotes, es borrado recuperable, no destrucción.

### Insertar un snippet mientras escribís

Escribí **`/snippet`** en un renglón vacío (o `/` y elegí "Snippet" del menú). El menú pasa a mostrar tus snippets guardados, favoritos primero. Seguí escribiendo para filtrar por nombre o contenido, movete con **↑ ↓** y elegí con **Enter**.

Al insertarse, el snippet se convierte en renglones normales de la nota: si era una checklist con niveles, entra como checklist con niveles. Después lo editás como cualquier otro texto, sin afectar al snippet guardado.

### Exportar snippets

En la pestaña Snippets, abajo, hay un botón **Exportar snippets** que descarga un archivo JSON solo con tus snippets (ej. `copynotes-snippets-2026-07-10.json`). Además, el respaldo completo de siempre ya los incluye.

## Etiquetas

Las etiquetas te ayudan a agrupar y encontrar cosas sin carpetas. Podés etiquetar **notas**, **renglones sueltos** y **snippets**, y una misma etiqueta sirve en los tres lados.

### Etiquetar una nota

Al lado del título, al pasar el mouse, aparece un **icono de etiqueta**. Al tocarlo se abre un buscador chiquito: escribí y filtra tus etiquetas; si no existe, te ofrece **Crear «lo que escribiste»** con un Enter. El selector queda abierto por si querés agregar varias; se cierra con Escape o tocando afuera. Las etiquetas de la nota se ven como chips (`#trabajo`) debajo del título; la **x** del chip la quita.

### Etiquetar un renglón

Al pasar el mouse por un renglón, tocá los **tres puntitos ⋯** y elegí **Etiquetar** (o el atajo: escribir `#` en el renglón). Mismo buscador. Los chips del renglón aparecen al final de la línea, chiquitos y discretos.

### Etiquetar un snippet

En la pestaña Snippets, cada fila tiene también su botón de etiqueta. Los chips se ven debajo del nombre del snippet.

### Administrar etiquetas (pestaña Etiquetas)

El conmutador de la barra lateral ahora tiene tres pestañas: **Notas | Snippets | Etiquetas**. En Etiquetas ves la lista completa, alfabética. Al pasar el mouse por una:

- **Lápiz** — renombrar ahí mismo (Enter guarda, Escape cancela). Si el nombre nuevo ya existe, avisa y no cambia nada.
- **Tachito** — borrarla (recuperable, como todo). Desaparece de todas las notas, renglones y snippets donde estaba.

El **+** de arriba crea una etiqueta nueva sin salir de la pestaña.

### Sin duplicados

`#Trabajo`, `trabajo` y `TRABAJO` cuentan como la misma etiqueta (también ignora acentos: `café` = `cafe`). Nunca vas a terminar con tres versiones de la misma palabra.

## Buscar

Arriba, en la barra de la app, hay una **lupa** (atajo: **Cmd+K** en Mac, **Ctrl+K** en Windows/Linux). Abre un panel de búsqueda que se superpone sobre todo, sin sacarte de donde estabas.

### Cómo funciona

- **Escribí** en el campo de arriba: busca a la vez en los **títulos de notas**, el **texto de los bloques** y los **snippets** (nombre y contenido). No distingue mayúsculas ni acentos (`cafe` encuentra `café`).
- Los resultados aparecen agrupados en **Notas**, **Bloques** y **Snippets**, con la parte que coincide resaltada. Cada bloque muestra en qué nota está.
- **Clic en un resultado de nota o bloque** te abre esa nota y cierra el panel.
- **Filtrar por etiqueta:** debajo del campo hay una fila con tus etiquetas. Tocá una o varias para mostrar solo lo que las tenga. Si elegís varias, tiene que tener **todas**.
- **Combinado:** texto y etiquetas se suman. "Mostrame lo que diga _plan_ y esté etiquetado _#trabajo_".
- Lo borrado nunca aparece en los resultados. Todo funciona sin internet.

### Detalle sobre las etiquetas en la búsqueda

El filtro de etiqueta mira la etiqueta **de cada cosa por separado**. Si etiquetaste la **nota** con `#trabajo`, el filtro `#trabajo` te trae esa nota, pero **no** sus bloques sueltos (salvo que hayas etiquetado los bloques también). Cada nota, bloque y snippet lleva sus propias etiquetas.

## Respaldo (exportar e importar)

Abajo de la lista de notas hay un botón **Respaldo**. Abre una ventana con todo lo necesario para proteger tus datos.

### Por qué importa

Tus notas viven en el navegador de este dispositivo. Si borrás los datos del navegador o cambiás de equipo sin un respaldo, se pierden. Descargá un respaldo cada tanto.

### Exportar

- **Descargar respaldo completo (JSON)**: baja un archivo con todas tus notas, bloques y preferencias. Es el archivo que después podés importar para restaurar todo. El nombre incluye fecha y hora (ej. `copynotes-backup-2026-07-10-1630.json`).
- **Nota actual en Markdown**: baja la nota abierta como texto con formato simple, ideal para pegar en otras apps o archivar.
- **Nota actual en HTML**: baja la nota abierta como página con formato, con las listas y niveles de verdad.

Todo funciona sin internet.

### Importar

1. Tocá **Elegir archivo de respaldo…** y seleccioná un archivo JSON de CopyNotes.
2. La app lo revisa primero. Si el archivo está roto o no es de CopyNotes, lo rechaza y **no toca nada** de lo tuyo.
3. Antes de aplicar, te muestra un resumen: cuántas notas y bloques se van a agregar, qué ya tenés idéntico (se omite) y si algo cambió en los dos lados (se conservan ambas versiones).
4. **Importar y conservar lo mío** suma lo del archivo a lo que ya tenés. Nunca pisa ni borra tus datos. Es la opción recomendada.

### Reemplazar todo (con cuidado)

En la misma ventana existe **Reemplazar todo…**: borra lo actual y deja solo lo del respaldo. Pide una confirmación explícita y te recuerda descargar un respaldo de lo actual antes. No se puede deshacer.

---

## Regla para el equipo

**Cada funcionalidad nueva visible para el usuario se anota acá, en el mismo commit que la implementa.** En lenguaje simple, sin tecnicismos, explicando qué ve y qué hace el usuario. Actualizar también la fecha de "Última actualización".
