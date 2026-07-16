# Guía de uso de CopyNotes

Todo lo que podés hacer en CopyNotes hoy. Este documento se actualiza cada vez que se agrega una funcionalidad nueva.

Última actualización: 2026-07-16 (el formato del texto —negrita, cursiva, enlaces, colores— ahora viaja al copiar bloques a otras apps y al exportar la nota en HTML y Markdown; doble Enter para salir de la nota gris; botón visible de copiar con subniveles; etiquetas y editor móvil más compactos; columna de escritura más amplia; pegado fiel, detección automática y colapso de bloques de código; menú `/` y atajo `#`; los respaldos ahora incluyen los títulos; los saltos de línea dentro de un renglón ya no se pierden al buscar, copiar ni exportar).

## Lo básico

- **Tus notas viven en este dispositivo.** No hay cuenta ni nube: todo se guarda automáticamente en el navegador.
- **Guardado automático.** Mientras escribís, arriba a la derecha aparece "Guardando…" y después "Guardado". No hay botón de guardar. Aunque cierres la pestaña o recargues justo después de escribir, las últimas teclas no se pierden: quedan anotadas y se aplican al volver a abrir.
- **Última nota abierta.** Al volver a la app, se abre la nota donde quedaste.
- **Tema.** Arriba a la derecha está el botón de sol o luna. Tocándolo cambiás entre modo oscuro y claro; CopyNotes recuerda tu elección en este dispositivo.
- **Ayuda y atajos.** El botón con el signo de pregunta (arriba a la derecha) abre un panel con todos los atajos de teclado. También lo abrís tocando la tecla **?**.

## Instalar y usar sin conexión

- **Instalá CopyNotes como app.** En navegadores compatibles aparece una tarjetita discreta abajo a la izquierda que dice "Instalá CopyNotes". Al aceptarla, CopyNotes se instala como una app en tu dispositivo (con su propio ícono). Si la cerrás, no vuelve a molestar. En algunos navegadores también podés instalar desde el menú del navegador.
- **Funciona sin internet.** Una vez abierta, CopyNotes sigue funcionando aunque te quedes sin conexión: podés leer, escribir, usar snippets y descargar respaldos. Cuando está lista para el modo sin conexión, aparece un aviso breve "Listo para usar sin conexión".
- **Se actualiza sola.** Cuando hay una versión nueva, se aplica sola la próxima vez que abrís la app.

## En el teléfono

- **Lista de notas a pantalla casi completa.** En el celular, el botón de panel (arriba a la izquierda) abre la lista de notas como un panel grande que cubre casi toda la pantalla, con un fondo oscuro detrás. Tocás afuera o la tecla Escape para cerrarla.
- **Botones siempre visibles.** En pantallas táctiles, los botones de cada snippet y etiqueta (favorito, insertar, etiquetar, renombrar, borrar) se ven siempre, sin necesidad de pasar el mouse.
- **Más lugar para cada renglón.** El editor deja menos espacio vacío alrededor del texto. Al tocar un renglón, los botones para copiar y abrir más acciones aparecen uno debajo del otro a la derecha, para ocupar menos ancho.
- **Etiquetas sin achicar el texto.** Las etiquetas de un renglón se acomodan debajo del contenido y se ordenan horizontalmente. Si agregás muchas, pasan a otra fila sin quitarle ancho a lo que escribiste.
- **Navegación con teclado.** Mientras el panel está abierto en el teléfono, el foco del teclado se queda dentro y vuelve al botón que lo abrió al cerrarlo.

## La primera vez

- **Nota de bienvenida.** La primera vez que abrís CopyNotes aparece una nota de ejemplo, "👋 Bienvenido a CopyNotes", con viñetas, una viñeta anidada, tareas, una etiqueta y un bloque de código. Es una nota normal: tocala, editala o borrala para aprender probando.
- **Aparece una sola vez.** Aunque la borres, no vuelve a aparecer. Las siguientes veces entrás directo a tu última nota.
- **Si no tenés notas.** La pantalla de inicio te ofrece **Nueva nota** y, al lado, **importá un backup** por si querés restaurar tus datos.

## Notas

| Acción | Cómo |
|---|---|
| Crear nota | Botón **+** en la barra lateral, o el botón **Nueva nota** si no tenés ninguna |
| Cambiar de nota | Clic en la nota en la barra lateral |
| Mostrar/ocultar la lista de notas | Botón de panel (arriba a la izquierda) |
| Ponerle título | Escribí en el título; **Enter** te baja al primer renglón |
| Borrar nota | Pasá el mouse por la nota en la lista y tocá el tacho. Se puede recuperar desde un respaldo. |

## Tipos de renglón (bloques)

Cada renglón de una nota es un bloque y tiene un tipo:

- **Texto** — renglón común.
- **Viñeta** — punto de lista, estilo Workflowy.
- **Tarea** — casilla para tildar; al tildarla el texto queda tachado.
- **Código** — fondo gris y letra de máquina, para pegar código o comandos sin perder líneas ni sangría.
- **Separador** — línea horizontal para dividir secciones.

### Cómo cambiar el tipo

- Escribí **`/`** al inicio de un renglón vacío: se abre un menú amplio con los tipos. **H1, H2 y H3 comparten una sola fila** para dejar más opciones a la vista. Filtrá escribiendo (ej. `/ta` para Tarea), movete con **↑ ↓**, elegí con **Enter** y cancelá con **Escape**.
- Atajo escrito: **`- `** o **`* `** (guion o asterisco, y espacio) al inicio de un renglón de texto lo convierte en viñeta.
- Atajo escrito para etiquetar: escribí **`#`** en un renglón y se abre el selector de etiquetas de ese renglón (el `#` no queda escrito, es solo el gatillo).

## Escribir y organizar

- **Más espacio para escribir.** La columna del editor ocupa hasta el 95% del espacio disponible en pantallas grandes y el 100% en celulares.

| Tecla | Qué hace |
|---|---|
| **Enter** | Renglón nuevo, del mismo tipo que el actual |
| **Shift+Enter** | Salto de línea **dentro del mismo renglón** (sin crear otro). En bloques de código también hace salto de línea. El salto se conserva al buscar, copiar y exportar |
| **Ctrl/Cmd+Enter** | Agrega/edita la **nota gris** del renglón (ver abajo) |
| **Tab** | Anida el renglón adentro del de arriba (necesita un renglón hermano arriba; el primero de cada nivel no se puede anidar) |
| **Shift+Tab** | Lo saca un nivel de anidado |
| **↑ / ↓** | Mueve el cursor entre renglones; mantiene la columna (la posición horizontal) al saltar |
| **Alt+↑ / Alt+↓** | Mueve el renglón (con todos sus hijos) arriba o abajo entre sus hermanos |
| **Backspace** en renglón vacío | Ver "Borrar renglones" abajo |

> **Negrita, cursiva, títulos, enlaces y colores:** todo el detalle está en la sección "Dar formato al texto" más abajo. Como resumen rápido: los atajos **Ctrl/Cmd+B/I/U/Shift+S/K** funcionan aunque no se vea ninguna barra flotante en pantalla.

### Pegar varias líneas

Cuando pegás un texto de varias líneas (desde otra app, un mail, una lista…), CopyNotes lo **separa en renglones** en vez de meter todo en uno solo.

- Cada línea que pegás se vuelve un renglón.
- **Reconoce viñetas y tareas** por cómo empieza la línea: `- `, `* ` o `• ` → viñeta; `[ ]` o `[x]` → tarea (con su tilde). El resto queda como texto.
- En texto y listas, las **líneas en blanco se ignoran** (no dejan renglones vacíos). Dentro de un bloque de código sí se conservan.
- Pegar **una sola línea** funciona normal, se inserta donde está el cursor.

### Pegar y contraer código

- Si pegás varias líneas en un renglón vacío y CopyNotes encuentra señales claras de código, las convierte automáticamente en **un solo bloque de código**. Si no está seguro, las deja como texto para no cambiarte el contenido por error.
- También podés elegir **Código** con `/codigo` antes de pegar. En ese bloque se conservan los espacios, las tabulaciones, las líneas vacías y los saltos de línea tal como vienen del portapapeles.
- Las líneas largas no se parten: desplazate horizontalmente dentro del bloque para verlas completas. Una tabulación se muestra con el ancho de 4 espacios.
- Cuando el código supera las 12 líneas aparece un control debajo. Tocá **Contraer código** para dejar una vista de las primeras 6 líneas, o **Ver código completo** para abrirlo otra vez. CopyNotes recuerda esa elección al recargar la nota, y también al copiar el bloque y pegarlo en otra parte de CopyNotes.
- Con el teclado, ese control se comporta como cualquier renglón: **Enter** crea un renglón nuevo debajo, **Tab** lo anida, **Alt+↑/↓** lo mueve y las flechas te llevan al renglón vecino. Para abrir o contraer el código desde el teclado usá la **barra espaciadora**.

**Copiar y pegar dentro de CopyNotes conserva todo.** Si copiás renglones de CopyNotes y los pegás en otra parte de CopyNotes, se pegan **igualitos**: viñetas, tareas (con su tildado), **código**, **separadores**, **etiquetas** y el **anidado**. Cuando pegás en otra app, sale como texto normal.

- **Copiar un solo renglón:** parado en él, **Cmd/Ctrl+C** lo copia entero (con su tipo y etiquetas). Si en cambio seleccionaste un pedazo de texto adentro del renglón, Cmd/Ctrl+C copia solo ese texto, como siempre.
- **Copiar varios:** seleccionalos (arrastrando o con Shift+↑/↓) y **Cmd/Ctrl+C**.

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

## Dar formato al texto

Podés resaltar palabras, ponerle títulos, enlaces y colores a cualquier renglón de texto, viñeta o tarea. (Los bloques de código y el separador no llevan formato: el código se pega y se ve siempre tal cual).

### Seleccionar texto muestra la barra

Marcá un pedazo de texto —arrastrando con el mouse, o con Shift+flechas, o Ctrl/Cmd+A para todo el renglón— y aparece una **barra flotante** justo arriba con todos los botones de formato. Si dejás de tener texto seleccionado (por ejemplo tocando en otro lado) la barra se esconde sola; también se cierra con **Escape**.

### Títulos y texto normal

Los primeros cuatro botones de la barra cambian el **tipo del renglón entero** (con el cursor adentro alcanza, no hace falta seleccionar todo el texto):

- **Título 1, Título 2, Título 3** — tres tamaños de encabezado, de más grande a más chico.
- **Texto normal** (el botón con el símbolo **¶**) — vuelve a ser un renglón común.

Cambiar a título no agrega ni borra renglones ni cambia el texto: solo cambia cómo se ve.

### Negrita, cursiva, subrayado, tachado y código en línea

Con el texto seleccionado, tocá el botón en la barra o su atajo de teclado (el atajo funciona aunque la barra no esté a la vista):

| Botón | Atajo | Qué hace |
|---|---|---|
| Negrita | Ctrl/Cmd+B | Pone el texto en **negrita** |
| Cursiva | Ctrl/Cmd+I | Pone el texto en *cursiva* |
| Subrayado | Ctrl/Cmd+U | Subraya el texto |
| Tachado | Ctrl/Cmd+Shift+S | Tacha el texto |
| Código en línea | — | Le da fondo gris y letra de máquina a una palabra o frase dentro del renglón (distinto del bloque de código completo) |

Tocar el mismo botón (o atajo) de nuevo quita ese formato puntual. Se pueden combinar varios a la vez, por ejemplo negrita y cursiva juntas.

### Enlaces

Con texto seleccionado, tocá el botón de enlace (ícono de cadena) o el atajo **Ctrl/Cmd+K**: se abre un cuadrito para pegar o escribir la dirección.

- No hace falta escribir "https://" adelante: si ponés `ejemplo.com`, CopyNotes le agrega el `https://` solo.
- Los enlaces siempre **abren en una pestaña nueva**, para no perder tu nota.
- **Editar** un enlace ya puesto: parate con el cursor adentro de ese texto (no hace falta seleccionar nada) y tocá de nuevo el botón de enlace; el cuadrito aparece con la dirección actual lista para cambiar.
- **Quitar** un enlace: mismo cuadrito, botón **Quitar**.

> Si tenés texto seleccionado adentro de un renglón, **Ctrl/Cmd+K** agrega el enlace ahí en vez de abrir el buscador general (ver "Buscar" más abajo).

### Colores

El botón de color (ícono de paleta) abre una fila de colores para aplicar al texto seleccionado: **por defecto** (sin color), **ámbar, rojo, verde, azul** y **gris tenue**. Tocá uno para aplicarlo; el color activo queda marcado con un recuadro.

### Más opciones

El botón de los tres puntitos, al final de la barra, abre un menú chico con dos acciones sobre el texto seleccionado:

- **Quitar formato** — le saca toda la negrita, cursiva, subrayado, tachado, color, código y enlace al texto seleccionado, dejándolo en texto plano.
- **Copiar texto seleccionado** — copia solo esa selección al portapapeles, sin copiar el renglón entero.

### El formato se guarda

Todo lo que aplicás con la barra (negrita, títulos, enlaces, colores, etc.) se guarda solo, igual que el resto del texto, y **sigue ahí** después de cerrar la app o recargar la página.

## Nota gris del renglón (estilo Workflowy)

Cada renglón puede tener una **nota**: un texto secundario, gris y más chico, pegado debajo, para aclaraciones o detalles que no querés que ensucien la línea principal.

- **Agregar/editar:** parado en un renglón, apretá **Ctrl/Cmd+Enter**. Se abre la nota justo abajo y escribís ahí. Puede tener varias líneas (un Enter hace una línea nueva dentro de la nota).
- **Salir de la nota:** apretá **Enter dos veces seguidas** y seguís escribiendo en un renglón nuevo, abajo de todo, como si nada. También podés hacer clic en otro lado, o **Escape** para volver al renglón.
- **Borrar la nota:** con la nota vacía, apretá **Backspace**: desaparece y volvés al renglón. Una nota vacía que perdés el foco también se esconde sola.
- La nota **viaja con el renglón**: se guarda, se copia (como sub-línea debajo) y se exporta en Markdown y HTML.

> **Ojo, cambió:** antes la nota gris se abría con Shift+Enter. Ahora Shift+Enter hace un **salto de línea dentro del mismo renglón**, y la nota gris se abre con **Ctrl/Cmd+Enter**.

## Seleccionar varios renglones

Podés marcar varios renglones a la vez y actuar sobre todos juntos.

- **Con el mouse:** clic en un renglón y **arrastrá** hacia arriba o hacia abajo sin soltar; se van pintando todos los que tocás. O hacé clic en uno y **Shift+clic** en otro para marcar el rango de una.
- **Con el teclado:** parado en un renglón, **Shift+↑ / Shift+↓** empieza a marcar hacia arriba o hacia abajo, y cada golpe suma (o quita) un renglón. Una flecha sola (sin Shift) deja la selección y mueve el cursor normal.
- **Copiar** los seleccionados: **Cmd+C** (Ctrl+C en Windows). Copia todo el grupo como esquema, respetando niveles.
- **Borrar** los seleccionados: **Backspace** o **Delete**. Se borran todos (recuperable). Si un renglón seleccionado tiene hijos, se van con él. Si borrás todo, queda un renglón vacío para seguir.
- **Mover** el grupo: **Alt+↑ / Alt+↓**. Mueve todos los seleccionados juntos entre sus vecinos (funciona cuando son hermanos seguidos).
- **Salir de la selección:** **Escape**, o hacé clic o empezá a escribir en un renglón.

## Deshacer y rehacer

- **Deshacer:** **Ctrl/Cmd+Z**. Vuelve atrás lo último que hiciste, sea escribir, borrar, mover, indentar, tildar una tarea, pegar o insertar un snippet. Cada golpe deshace un paso más.
- **Rehacer:** **Ctrl/Cmd+Shift+Z** (o **Ctrl+Y**). Vuelve a aplicar lo que deshiciste.
- El deshacer del texto va **por tandas**: un Ctrl+Z borra el último tramo que escribiste de una, no letra por letra.
- El historial es **por nota**: al cambiar de nota, arranca limpio.

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

Al pasar el mouse por un renglón (o llegar con el teclado) aparecen botones a la derecha:

- **Copiar bloque** (icono de dos hojas, siempre a la vista): copia solo ese renglón.
- **Copiar con subniveles** (icono de dos hojas con un **+**): aparece al lado del anterior **solo cuando el renglón tiene hijos anidados**; copia el renglón con todo lo anidado adentro, aunque esté colapsado.
- **Más acciones** (los tres puntitos **⋯**): abre un menú chico con el resto de las acciones del renglón:
  - **Guardar como snippet**.
  - **Etiquetar** (atajo: escribir `#` en el renglón).

Después pegás donde quieras:

- En apps simples (Notas, un mail sin formato): llega como texto con sangría legible; las tareas se ven como `[x]` (hecha) o `[ ]` (pendiente).
- En editores con formato (Google Docs, Notion, Gmail): llega como lista con viñetas y niveles de verdad, **y con el formato del texto**: negrita, cursiva, subrayado, tachado, colores y enlaces viajan con el bloque.
- Los bloques de código mantienen sus líneas tal cual.
- **Pegado dentro de CopyNotes:** vuelve igualito, con tipo, tildado, código, separadores, etiquetas y anidado (ver "Pegar varias líneas").

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

Al pasar el mouse por un renglón, tocá los **tres puntitos ⋯** y elegí **Etiquetar** (o el atajo: escribir `#` en el renglón). El `#` se oculta mientras está abierto el buscador: si elegís o creás una etiqueta, se usa como atajo y no queda en el texto; si cerrás el buscador sin elegir ninguna (con **Escape** o un click afuera), vuelve al renglón como carácter común. Los chips del renglón aparecen al final de la línea, chiquitos y discretos.

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

Arriba, en la barra de la app, hay una **lupa** (atajos: **Cmd/Ctrl+K** o **Cmd/Ctrl+F**). Abre un panel de búsqueda que se superpone sobre todo, sin sacarte de donde estabas.

- **Cmd/Ctrl+F** abre la búsqueda y, si tenías **texto seleccionado**, lo carga ya en el campo (como en Visual Studio Code). Reemplaza al buscador del navegador.
- **Cmd/Ctrl+K** abre la búsqueda vacía — salvo que tengas texto seleccionado adentro de un renglón, en cuyo caso agrega un enlace ahí (ver "Negrita, cursiva, subrayado, tachado y enlaces" más arriba).

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
- **Nota actual en Markdown**: baja la nota abierta como texto con formato simple, ideal para pegar en otras apps o archivar. Los bloques de código salen con su marca de código, estén sueltos o anidados dentro de una lista. Los títulos salen con su nivel (`#`, `##`, `###`). La negrita, cursiva, tachado y enlaces salen en formato Markdown (`**negrita**`, `[enlace](dirección)`); el subrayado y los colores no existen en Markdown, así que ese texto sale normal.
- **Nota actual en HTML**: baja la nota abierta como página con formato, con las listas, niveles y títulos de verdad, y con el formato del texto completo: negrita, cursiva, subrayado, tachado, colores y enlaces.

Lo mismo vale al **copiar** un bloque de título: pega como título real en apps con formato, y con su marca `#` como texto plano.

Todo funciona sin internet.

### Importar

1. Tocá **Elegir archivo de respaldo…** y seleccioná un archivo JSON de CopyNotes.
2. La app lo revisa primero. Si el archivo está roto o no es de CopyNotes, lo rechaza y **no toca nada** de lo tuyo.
3. Antes de aplicar, te muestra un resumen: cuántas notas y bloques se van a agregar, qué ya tenés idéntico (se omite) y si algo cambió en los dos lados (se conservan ambas versiones).
4. **Importar y conservar lo mío** suma lo del archivo a lo que ya tenés. Nunca pisa ni borra tus datos. Es la opción recomendada.

Los respaldos guardan también los títulos (Título 1, 2 y 3) de tus notas. Los respaldos descargados con versiones anteriores de CopyNotes se importan igual, sin hacer nada especial. Al revés no: un respaldo nuevo no se puede importar en una versión vieja de la app (te avisa con un mensaje claro).

### Reemplazar todo (con cuidado)

En la misma ventana existe **Reemplazar todo…**: borra lo actual y deja solo lo del respaldo. Pide una confirmación explícita y te recuerda descargar un respaldo de lo actual antes. No se puede deshacer.

---

## Regla para el equipo

**Cada funcionalidad nueva visible para el usuario se anota acá, en el mismo commit que la implementa.** En lenguaje simple, sin tecnicismos, explicando qué ve y qué hace el usuario. Actualizar también la fecha de "Última actualización".
