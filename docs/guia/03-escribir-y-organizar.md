# Escribir y organizar

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
