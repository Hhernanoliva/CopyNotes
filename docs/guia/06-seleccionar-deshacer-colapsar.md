# Seleccionar, deshacer, colapsar y tareas anidadas

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
