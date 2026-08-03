# Respaldo (exportar e importar)

## Respaldo (exportar e importar)

Abajo de la lista de notas hay un botón **Respaldo**. Abre una ventana con todo lo necesario para proteger tus datos.

### Por qué importa

Tus notas viven en el navegador de este dispositivo. Si borrás los datos del navegador o cambiás de equipo sin un respaldo, se pierden. Descargá un respaldo cada tanto.

### Exportar

Antes de crear cualquier archivo, CopyNotes termina de guardar lo que acabás de escribir. Podés escribir y tocar **Descargar** enseguida: el respaldo o la nota exportada incluyen hasta las últimas palabras.

- **Descargar respaldo completo (JSON)**: baja un archivo con todas tus notas, bloques y preferencias. Es el archivo que después podés importar para restaurar todo. El nombre incluye fecha y hora (ej. `copynotes-backup-2026-07-10-1630.json`).
- **Nota actual en Markdown**: baja la nota abierta como texto con formato simple, ideal para pegar en otras apps o archivar. Los bloques de código salen con su marca de código, estén sueltos o anidados dentro de una lista. Los títulos salen con su nivel (`#`, `##`, `###`). La negrita, cursiva, tachado y enlaces salen en formato Markdown (`**negrita**`, `[enlace](dirección)`); el subrayado y los colores no existen en Markdown, así que ese texto sale normal.
- **Nota actual en HTML**: baja la nota abierta como página con formato, con las listas, niveles y títulos de verdad, y con el formato del texto completo: negrita, cursiva, subrayado, tachado, colores y enlaces.

Lo mismo vale al **copiar** un bloque de título: pega como título real en apps con formato, y con su marca `#` como texto plano.

Todo funciona sin internet.

### Importar

1. Tocá **Elegir archivo de respaldo…** y seleccioná un archivo JSON de CopyNotes.
2. CopyNotes termina de guardar cualquier cambio reciente y después revisa el archivo. Si está roto o no es de CopyNotes, lo rechaza y **no toca nada** de lo tuyo. Si el archivo se contradice —por ejemplo, trae dos notas con el mismo identificador— te lo dice con nombre y apellido antes de empezar, en vez de fallar a mitad de camino con un error incomprensible. Además, todo el formato de texto que venga en el archivo pasa por un filtro de seguridad: lo que no es de CopyNotes (por ejemplo, código escondido en un archivo manipulado) se descarta y el texto queda intacto. Lo mismo pasa al pegar contenido copiado: si viene dañado o con algo raro, se limpia sin romper el pegado.
3. Antes de aplicar, te muestra un resumen: cuántas notas y bloques se van a agregar, qué ya tenés idéntico (se omite) y si algo cambió en los dos lados (se conservan ambas versiones).
4. **Importar y conservar lo mío** suma lo del archivo a lo que ya tenés. Nunca pisa ni borra tus datos. Es la opción recomendada.

Importar tu propio respaldo sobre las mismas notas no las duplica: lo que ya tenés igual se omite y el resumen lo dice. Antes, las notas que habías creado arriba de todo en la lista volvían como copias; ya no pasa.

Mientras CopyNotes está importando o reemplazando datos, la ventana de respaldo permanece abierta y bloqueada. Se cierra recién cuando las notas restauradas ya están listas para usar.

Los respaldos guardan también los títulos (Título 1, 2 y 3) de tus notas. Los respaldos descargados con versiones anteriores de CopyNotes se importan igual, sin hacer nada especial. Al revés no: un respaldo nuevo no se puede importar en una versión vieja de la app (te avisa con un mensaje claro).

El respaldo también incluye tus preferencias seguras y las restaura: el tema (claro/oscuro), si ya viste la bienvenida y **Ocultar completadas** de la Agenda, entre otras. Solo viajan las preferencias inofensivas; nada delicado se escribe nunca en el archivo. Cuando importás y conservás lo tuyo, una preferencia que ya tengas puesta en este equipo manda: no se pisa con la del archivo.

Además viaja la **bitácora** de tus tareas: quién marcó cada cosa y cuándo, vos o un agente. Antes se perdía al restaurar; ahora vuelve con el resto. Si alguna línea de la bitácora quedó apuntando a una tarea que ya no está en el archivo, se descarta esa línea sola y el respaldo se importa igual.

### Reemplazar todo (con cuidado)

En la misma ventana existe **Reemplazar todo…**: borra lo actual y deja solo lo del respaldo. Pide una confirmación explícita y te recuerda descargar un respaldo de lo actual antes. No se puede deshacer.

Lo que **no** se toca son los interruptores de ese dispositivo: si tenías **los agentes en pausa**, siguen en pausa después de restaurar; lo mismo con el permiso de subir a la nube. Esas decisiones no viajan dentro del archivo (por eso restaurarlo no puede prenderlas ni apagarlas) y antes se perdían al reemplazar todo, así que los agentes volvían a andar sin que vos los hubieras despausado. Las decisiones de nube que estuvieran esperando —"me quedo con esta versión"— sí se descartan: hablan de renglones que después de reemplazar todo pueden no existir.

---
