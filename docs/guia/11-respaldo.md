# Respaldo (exportar e importar)

## Respaldo (exportar e importar)

Abajo de la lista de notas hay un botón **Respaldo**. Abre una ventana con todo lo necesario para proteger tus datos.

### Por qué importa

Tus notas viven en el navegador de este dispositivo. Si borrás los datos del navegador o cambiás de equipo sin un respaldo, se pierden. Descargá un respaldo cada tanto.

### Exportar

Antes de crear cualquier archivo, CopyNotes termina de guardar lo que acabás de escribir. Podés escribir y tocar **Descargar** enseguida: el respaldo o la nota exportada incluyen hasta las últimas palabras.

Si alguno de esos últimos guardados no se pudo hacer, el archivo **se baja igual** —un respaldo al que le falta un renglón sirve más que ninguno— pero el mensaje te lo dice: *"Respaldo descargado — un cambio reciente no se pudo guardar y puede faltar"*. Antes decía "Respaldo descargado" a secas y no te enterabas. Lo mismo al exportar la nota actual.

**El archivo se lee con cualquier editor de texto y no tiene contraseña.** Debajo del botón de descarga la app te lo dice antes de que lo bajes, porque conviene saberlo antes y no después: si le mandás un respaldo a alguien, esa persona puede leer todo lo que hay adentro. Y adentro también están **las notas que borraste** — es a propósito, es lo que hace que restaurar un respaldo te pueda devolver una nota borrada, pero significa que viajan con el archivo aunque en la app no se vean.

- **Descargar respaldo completo (JSON)**: baja un archivo con todas tus notas, bloques y preferencias. Es el archivo que después podés importar para restaurar todo. El nombre incluye fecha y hora (ej. `copynotes-backup-2026-07-10-1630.json`).
- **Nota actual en Markdown**: baja la nota abierta como texto con formato simple, ideal para pegar en otras apps o archivar. Los bloques de código salen con su marca de código, estén sueltos o anidados dentro de una lista. Los títulos salen con su nivel (`#`, `##`, `###`). La negrita, cursiva, tachado y enlaces salen en formato Markdown (`**negrita**`, `[enlace](dirección)`); el subrayado y los colores no existen en Markdown, así que ese texto sale normal.
- **Nota actual en HTML**: baja la nota abierta como página con formato, con las listas, niveles y títulos de verdad, y con el formato del texto completo: negrita, cursiva, subrayado, tachado, colores y enlaces. Los saltos de línea dentro de un renglón (los que hacés con Shift+Enter) salen tal cual, también en las notas más viejas de la app: antes esos renglones viejos se aplastaban en una sola línea al exportar, aunque al copiarlos salían bien.

Lo mismo vale al **copiar** un bloque de título: pega como título real en apps con formato, y con su marca `#` como texto plano.

Todo funciona sin internet.

### Importar

1. Tocá **Elegir archivo de respaldo…** y seleccioná un archivo JSON de CopyNotes. Si te equivocás de archivo y elegís uno enorme —un video, por ejemplo—, CopyNotes ni lo abre: te avisa que pesa más de 64 MB y no hace nada. Un respaldo de CopyNotes pesa muchísimo menos, así que ese aviso siempre significa que agarraste el archivo equivocado.
2. CopyNotes termina de guardar cualquier cambio reciente y después revisa el archivo. Si está roto o no es de CopyNotes, lo rechaza y **no toca nada** de lo tuyo. Si el archivo se contradice —por ejemplo, trae dos notas con el mismo identificador— te lo dice con nombre y apellido antes de empezar, en vez de fallar a mitad de camino con un error incomprensible. Además, todo el formato de texto que venga en el archivo pasa por un filtro de seguridad: lo que no es de CopyNotes (por ejemplo, código escondido en un archivo manipulado) se descarta y el texto queda intacto. Lo mismo pasa al pegar contenido copiado: si viene dañado o con algo raro, se limpia sin romper el pegado.
3. Antes de aplicar, te muestra un resumen: cuántas notas y bloques se van a agregar, qué ya tenés idéntico (se omite) y si algo cambió en los dos lados (se conservan ambas versiones).
4. **Importar y conservar lo mío** suma lo del archivo a lo que ya tenés. Nunca pisa ni borra tus datos. Es la opción recomendada.

Importar tu propio respaldo sobre las mismas notas no las duplica: lo que ya tenés igual se omite y el resumen lo dice. Antes, las notas que habías creado arriba de todo en la lista volvían como copias; ya no pasa.

Cuando una nota **sí** cambió en los dos lados, se conservan las dos versiones: la tuya queda como está y la del archivo entra como nota aparte. Esa copia viene **con todos sus renglones**, incluso los que son idénticos a los tuyos. Antes la copia llegaba vacía —solo el título— porque sus renglones se contaban como "ya lo tengo" y se quedaban en la nota original.

Un archivo cuyos renglones cuelguen de un renglón de otra nota, o que formen un círculo (uno hijo del otro y viceversa), se rechaza antes de tocar nada. No es un capricho: esos renglones existirían en tus datos pero no se dibujarían en ninguna pantalla, así que entrarían y desaparecerían sin decir nada.

Mientras CopyNotes está importando o reemplazando datos, la ventana de respaldo permanece abierta y bloqueada. Se cierra recién cuando las notas restauradas ya están listas para usar.

Los respaldos guardan también los títulos (Título 1, 2 y 3) de tus notas. Los respaldos descargados con versiones anteriores de CopyNotes se importan igual, sin hacer nada especial. Al revés no: un respaldo nuevo no se puede importar en una versión vieja de la app (te avisa con un mensaje claro).

**Y si al archivo le falta algún dato interno, se completa al entrar en vez de rechazarse.** Antes, un solo renglón al que le faltaba una marca interna —de esas que ni se ven en la pantalla— dejaba el respaldo entero sin poder importar, con un mensaje incomprensible. Ahora el archivo entra y el resumen te avisa: *"este archivo venía de una versión anterior de CopyNotes y se completó al importarlo"*. Y completado queda igual a lo que ya tenés, así que importarlo sobre tus mismas notas sigue sin duplicar nada.

**Y un respaldo viejo ya no te duplica las notas al importarlo.** La app fue ganando cosas con el tiempo (fechas en los renglones, notas al pie, la marca de quién escribió cada cosa). Un renglón guardado antes de que eso existiera no las tiene, y el mismo renglón de hoy sí — vacías, pero las tiene. CopyNotes los contaba como dos renglones distintos y se quedaba con las dos copias, aunque no hubieras cambiado una letra. Ahora entiende que son el mismo. Con un respaldo de verdad la diferencia fue de 1154 renglones duplicados a 11, y esos 11 sí habían cambiado de verdad. Lo que **sí** cambió en los dos lados se sigue conservando por duplicado, como antes.

Lo mismo pasaba con los renglones que tienen una **comilla** adentro: la app, al revisar el archivo, reescribía la comilla de una forma equivalente —se ve exactamente igual en pantalla— y después comparaba esa versión reescrita contra la tuya, así que le parecían distintas. En un respaldo real eran 326 renglones de 1450. Ahora primero compara y después limpia, que es el orden que corresponde: lo que entra a tus notas sigue pasando por el filtro de seguridad igual que antes.

Cuando un archivo está roto de verdad, el mensaje ahora es en castellano y te dice **cuántos renglones** están mal, en lugar de mostrarte el nombre técnico del primero. Nada de lo tuyo se toca.

Al **bajar** un respaldo, además, CopyNotes lo revisa antes de darlo por bueno. Si le encuentra un problema, el archivo se baja igual —siempre es mejor que nada— pero te lo dice en ese momento, en vez de que te enteres el día que lo necesitás.

El respaldo también incluye tus preferencias seguras y las restaura: el tema (claro/oscuro), si ya viste la bienvenida y **Ocultar completadas** de la Agenda, entre otras. Solo viajan las preferencias inofensivas; nada delicado se escribe nunca en el archivo. Cuando importás y conservás lo tuyo, una preferencia que ya tengas puesta en este equipo manda: no se pisa con la del archivo.

Además viaja la **bitácora** de tus tareas: quién marcó cada cosa y cuándo, vos o un agente. Antes se perdía al restaurar; ahora vuelve con el resto. Si alguna línea de la bitácora quedó apuntando a una tarea que ya no está en el archivo, se descarta esa línea sola y el respaldo se importa igual.

### Reemplazar todo (con cuidado)

En la misma ventana existe **Reemplazar todo…**: borra lo actual y deja solo lo del respaldo. Pide una confirmación explícita y te recuerda descargar un respaldo de lo actual antes. No se puede deshacer.

El botón solo aparece si el archivo **se sostiene solo**. Un respaldo completo bajado desde CopyNotes siempre se sostiene. Uno recortado a mano puede apoyarse en notas que hoy tenés en el equipo: sirve para sumarlo a lo tuyo, pero no para reemplazar todo, porque el borrado se lleva justo aquello en lo que se apoyaba. En ese caso el resumen te lo dice y queda solo **Importar y conservar lo mío**.

**Si tenés la nube encendida, reemplaza también la copia de la nube.** El cartel te lo dice antes de que aprietes: el archivo pasa a ser la versión buena de tu cuenta, y tus otros dispositivos van a quedar igual que este —sin que toques nada en ellos— en la próxima sincronización. Es lo que hace que restaurar sirva: antes la nube y el archivo se peleaban, cada renglón quedaba como una pregunta sin contestar (con un respaldo de verdad, más de mil), y el respaldo entraba pero no servía para nada.

Si CopyNotes no tiene nube, o no iniciaste sesión, ese párrafo no aparece y restaurar es asunto de este dispositivo solo, como siempre.

Lo que **sí** te sigue perteneciendo después de restaurar es **la llave de tu bóveda**: restaurar un respaldo no te la saca ni te obliga a volver a vincular tus dispositivos. Eso solo pasa con "Empezar de nuevo la nube", que es otro botón y avisa aparte.

Lo que **no** se toca son los interruptores de ese dispositivo: si tenías **los agentes en pausa**, siguen en pausa después de restaurar; lo mismo con el permiso de subir a la nube. Esas decisiones no viajan dentro del archivo (por eso restaurarlo no puede prenderlas ni apagarlas) y antes se perdían al reemplazar todo, así que los agentes volvían a andar sin que vos los hubieras despausado. Las decisiones de nube que estuvieran esperando —"me quedo con esta versión"— sí se descartan: hablan de renglones que después de reemplazar todo pueden no existir.

---
