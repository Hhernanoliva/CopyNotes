# Fechas y agenda

## Ponerle una fecha a un renglón

Escribí `/fecha` en cualquier renglón (o buscalo con `/agenda`, `/hoy`, `/vencimiento` o `/recordatorio`) y elegí la opción **Fecha** del menú. Se abre un panel chiquito con atajos:

- **Hoy**
- **Mañana**
- **Próxima semana**
- **Elegir día** — un selector de calendario para cualquier fecha.

El panel se maneja también con el teclado: las flechas ↑ y ↓ recorren las opciones, Enter elige la marcada y Escape cierra sin cambiar nada.

Al elegir una, el renglón queda con una etiqueta con un calendario (📅) y el día, por ejemplo «📅 hoy», «📅 mañana» o «📅 12 ago». El texto que hayas escrito después de `/fecha` se borra, porque la fecha es un dato del renglón, no parte del texto.

## Cambiar o quitar la fecha

Tocá la etiqueta 📅 del renglón para volver a abrir el mismo panel: ahí podés elegir otro atajo, otro día, o tocar **Quitar fecha** para sacarla. Escape cierra el panel sin cambiar nada.

## Fechas vencidas

Si la fecha ya pasó y el renglón no es una tarea marcada como hecha, la etiqueta se ve en rojo para llamar la atención.

## Al copiar o exportar

Cuando copiás un renglón con fecha (o lo exportás en un respaldo), la fecha viaja como texto al final de la línea, con el formato día/mes/año — por ejemplo «Comprar regalo — 📅 12/08/2026» — así nunca se pierde aunque el destino no entienda el formato interno de CopyNotes.

## La pestaña Agenda

En la barra lateral, junto a "Notas" y "Snippets", está la pestaña **Agenda** (el ícono de calendario — cada pestaña muestra su ícono, y la que está activa muestra además su nombre). Ahí aparecen todos los renglones con fecha de todas tus notas, agrupados por cuándo vencen:

- **Vencidas** (en rojo, arriba de todo) — ya pasó la fecha y la tarea sigue sin marcar como hecha.
- **Hoy**
- **Mañana**
- **Esta semana** — el resto de los días hasta el domingo.
- **Más adelante** — todo lo que queda para más allá de esta semana.

Cada ítem muestra el texto del renglón, el nombre de la nota a la que pertenece y su fecha. Tocá un ítem para ir directo a ese renglón, en su nota — el editor se abre con el renglón ya enfocado.

Si el renglón es una tarea, podés marcarla o desmarcarla directamente desde la Agenda, tocando su casilla, sin tener que entrar a la nota. Las tareas marcadas se ven tachadas.

Arriba de la lista hay un interruptor, **Ocultar completadas**: si lo activás, las tareas ya marcadas como hechas desaparecen de la Agenda (siguen existiendo en la nota, solo se ocultan acá). Queda recordado la próxima vez que abrís la Agenda.

Si todavía no le pusiste fecha a nada, la Agenda te recuerda cómo hacerlo: escribiendo `/fecha` en cualquier renglón.
