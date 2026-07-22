# Guía de uso de CopyNotes

Todo lo que podés hacer en CopyNotes hoy, organizado por tema en `docs/guia/`. Cada archivo se actualiza cuando cambia su tema.

Última actualización: 2026-07-20 (al importar un respaldo ahora se restauran también las preferencias que antes se perdían, como **Ocultar completadas** de la Agenda; solo viajan preferencias inofensivas y nada delicado se escribe en el archivo. Antes: al marcar una tarea con subtareas desde la Agenda ahora se aplica la misma cascada que en la nota: la madre marca a sus hijas y la última hija marca a la madre. Antes: podés seleccionar una palabra o trozo de texto y arrastrarlo para mover solo ese texto —misma línea u otra, conservando el formato, con una guía de dónde cae y Escape para cancelar; un clic simple solo pone el cursor. Además: manija ⠿ para arrastrar renglones, agarrar lo resaltado para mover varios, la Agenda se actualiza sola al poner fecha, y la barra de formato tarda un instante en aparecer).

## Temas

1. [Empezar](guia/01-empezar.md) — lo básico, instalar sin conexión, teléfono, primera vez
2. [Notas y tipos de renglón](guia/02-notas-y-tipos-de-renglon.md) — crear/borrar notas, bullets, tareas, código, separadores, títulos
3. [Escribir y organizar](guia/03-escribir-y-organizar.md) — anidar, mover, pegar varias líneas, pegar código, borrar renglones
4. [Dar formato al texto](guia/04-formato-del-texto.md) — barra flotante, negrita, enlaces, colores, títulos
5. [Nota gris del renglón](guia/05-nota-gris.md) — la sub-línea estilo Workflowy
6. [Seleccionar, deshacer, colapsar](guia/06-seleccionar-deshacer-colapsar.md) — selección múltiple, deshacer/rehacer, colapsar, tareas anidadas
7. [Copiar bloques](guia/07-copiar.md) — copiar un renglón o con subniveles, formatos
8. [Snippets](guia/08-snippets.md) — guardar, biblioteca, insertar con /snippet, exportar
9. [Etiquetas](guia/09-etiquetas.md) — etiquetar notas y renglones; administrar
10. [Buscar](guia/10-buscar.md) — búsqueda con Cmd/Ctrl+K, filtro por etiquetas
11. [Respaldo](guia/11-respaldo.md) — exportar, importar, reemplazar todo
12. [Fechas y agenda](guia/12-fechas-y-agenda.md) — /fecha, atajos Hoy/Mañana/Próxima semana, cambiar o quitar la fecha, pestaña Agenda
13. [Ordenar y carpetas](guia/13-ordenar-y-carpetas.md) — arrastrar para ordenar Notas/Snippets/Etiquetas; carpetas en Notas y Snippets
14. [Movimiento y animaciones](guia/14-movimiento-y-animaciones.md) — animaciones suaves de la app y cómo funciona "Reducir movimiento"

## Regla para el equipo

**Cada funcionalidad nueva visible para el usuario se anota en el archivo del tema que toca, en el mismo commit que la implementa.** En lenguaje simple, sin tecnicismos, explicando qué ve y qué hace el usuario. Si aparece un tema nuevo, se crea un archivo nuevo en `docs/guia/` y se agrega a esta lista. Actualizar también la fecha de "Última actualización" de este índice.
