# Guía de uso de CopyNotes

Todo lo que podés hacer en CopyNotes hoy. Este documento se actualiza cada vez que se agrega una funcionalidad nueva.

Última actualización: 2026-07-10 (fin de Stage 5, respaldo, exportación e importación).

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
- Atajo: escribir **`- `** (guion y espacio) al inicio de un renglón de texto lo convierte en viñeta.

## Escribir y organizar

| Tecla | Qué hace |
|---|---|
| **Enter** | Renglón nuevo, del mismo tipo que el actual |
| **Shift+Enter** | Salto de línea adentro del mismo renglón |
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

Al pasar el mouse por un renglón (o llegar con el teclado) aparecen botones de copiar a la derecha:

- **Copiar bloque** (icono de dos hojas): copia solo ese renglón.
- **Copiar con subniveles** (icono con un +): aparece solo si el renglón tiene hijos; copia el renglón con todo lo anidado adentro, aunque esté colapsado.

Después pegás donde quieras:

- En apps simples (Notas, un mail sin formato): llega como texto con sangría legible; las tareas se ven como `[x]` (hecha) o `[ ]` (pendiente).
- En editores con formato (Google Docs, Notion, Gmail): llega como lista con viñetas y niveles de verdad.
- Los bloques de código mantienen sus líneas tal cual.

No hace falta seleccionar el texto a mano. Al copiar aparece un avisito abajo que dice **"Copiado"**; si el navegador no deja copiar, avisa con un mensaje para reintentar.

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
