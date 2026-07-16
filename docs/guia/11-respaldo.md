# Respaldo (exportar e importar)

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
2. La app lo revisa primero. Si el archivo está roto o no es de CopyNotes, lo rechaza y **no toca nada** de lo tuyo. Además, todo el formato de texto que venga en el archivo pasa por un filtro de seguridad: lo que no es de CopyNotes (por ejemplo, código escondido en un archivo manipulado) se descarta y el texto queda intacto. Lo mismo pasa al pegar contenido copiado: si viene dañado o con algo raro, se limpia sin romper el pegado.
3. Antes de aplicar, te muestra un resumen: cuántas notas y bloques se van a agregar, qué ya tenés idéntico (se omite) y si algo cambió en los dos lados (se conservan ambas versiones).
4. **Importar y conservar lo mío** suma lo del archivo a lo que ya tenés. Nunca pisa ni borra tus datos. Es la opción recomendada.

Los respaldos guardan también los títulos (Título 1, 2 y 3) de tus notas. Los respaldos descargados con versiones anteriores de CopyNotes se importan igual, sin hacer nada especial. Al revés no: un respaldo nuevo no se puede importar en una versión vieja de la app (te avisa con un mensaje claro).

### Reemplazar todo (con cuidado)

En la misma ventana existe **Reemplazar todo…**: borra lo actual y deja solo lo del respaldo. Pide una confirmación explícita y te recuerda descargar un respaldo de lo actual antes. No se puede deshacer.

---
