# Buscar

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
