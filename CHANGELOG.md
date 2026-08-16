# Novedades

Lo que cambia en cada versión de CopyNotes, contado para quien la usa.
La app lee este archivo: lo de acá aparece en Configuración › Actualizaciones.

Reglas: una sección `## X.Y.Z` por versión, la más nueva arriba, una viñeta por
cambio, en castellano y sin jerga técnica. Se escribe **en el mismo commit que
la funcionalidad**, no al publicar.

## 0.2.0

- La web ahora te avisa cuando hay una versión nueva, con un botón **Actualizar** que la pone en uso en un segundo (tus notas no se tocan). Antes se actualizaba "sola en la próxima visita" y sin avisar: si dejabas la pestaña abierta o el celular la mantenía dormida, seguías usando la versión vieja sin saberlo — y los arreglos que publicábamos no te llegaban
- Arreglado: en la web, elegir un archivo de respaldo para importar no hacía nada — ni en la computadora ni en el iPhone. La app daba por cancelada la elección si el archivo tardaba en llegar, y se quedaba callada; en el iPhone tardaba más porque el sistema tiene que copiar el archivo primero. Ahora sólo se cancela si vos cancelás, sin importar cuánto tarde
- Configuración muestra al final, en chico, qué versión de CopyNotes estás usando. Antes sólo se veía en la app de escritorio, dentro de Actualizaciones
- Importar un respaldo ya no te duplica los renglones que tienen una comilla adentro: la app los reescribía de una forma equivalente al revisarlos y después los veía como distintos. Medido con un respaldo real: 326 renglones de 1450
- Importar un respaldo viejo ya no te duplica las notas: antes, un renglón guardado por una versión anterior de la app se contaba como distinto del actual aunque no hubiera cambiado nada, y se quedaba con las dos copias. Medido con un respaldo real: pasó de 1154 renglones duplicados a 11, y esos 11 sí habían cambiado
- Los respaldos bajados con versiones anteriores de CopyNotes se importan siempre: si al archivo le falta algún dato interno, se completa al entrar en vez de rechazar el respaldo entero por un renglón
- Al bajar un respaldo, CopyNotes lo revisa antes de decir que está listo: si le encuentra un problema te lo dice ahí, en vez de que te enteres el día que lo necesitás
- Si un archivo está dañado, ahora te dice en castellano cuántos renglones están mal en lugar de mostrar un error técnico
- La ventana de Respaldo aclara, antes de que bajes el archivo, que se lee con cualquier editor de texto y que incluye las notas que borraste
- Restaurar un respaldo con la nube encendida ahora funciona de verdad: antes cada renglón quedaba como una pregunta sin contestar y el respaldo no servía para nada. Ahora el archivo pasa a ser la versión buena de tu cuenta, y el cartel te avisa que esto también llega a tus otros dispositivos
- Ahora podés compartir una nota: te avisa antes que mientras esté compartida sale de la bóveda y deja de estar cifrada, y vuelve sola cuando cerrás la compartición
- El separador (la raya) ahora tiene su menú ⋯ con Mover y Eliminar: en el celular no había forma de borrarlo una vez puesto
- En un título, el botón de negrita se ve apagado: los títulos ya vienen en negrita y antes el botón no hacía nada
- Enter en medio de una línea la parte en dos: lo que está por delante del cursor se baja al renglón nuevo, con su tipo y su formato
- Arrastrar un pedazo de una palabra en negrita (o con color, o con enlace) ya no lo deja pelado al soltarlo
- Primera versión de escritorio publicada
- Los agentes se pueden conectar desde Claude Code, OpenCode y Cursor
- Tus notas se pueden guardar cifradas en la nube, si querés
- La app avisa con un punto en el engranaje cuando hay una versión nueva
- CopyNotes tiene su logo definitivo
- El menú de los "⋯" ya no se sale de la pantalla en el celular con el teclado abierto
