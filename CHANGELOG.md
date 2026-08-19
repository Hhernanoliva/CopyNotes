# Novedades

Lo que cambia en cada versión de CopyNotes, contado para quien la usa.
La app lee este archivo: lo de acá aparece en Configuración › Actualizaciones.

Reglas: una sección `## X.Y.Z` por versión, la más nueva arriba, una viñeta por
cambio, en castellano y sin jerga técnica. Se escribe **en el mismo commit que
la funcionalidad**, no al publicar.

## 0.2.2

- **La web vuelve a ofrecer la app de escritorio.** Ahora que hay una versión publicada para bajar, volvieron la tarjetita *"¿Usás agentes de IA?"* abajo a la derecha y el enlace de **Configuración › Agentes**. Estaban ocultos porque llevaban a una página vacía

## 0.2.1

- **La nube vuelve a funcionar en la app descargada.** La 0.2.0 salía sin la nube adentro: entrabas a Configuración › Nube y decía *"esta copia de CopyNotes no tiene una nube configurada"*, sin forma de arreglarlo desde la app. Todo lo demás andaba, pero no había sincronización
- **Las novedades se leen bien.** En "Qué trajo tu versión" se veían los asteriscos del formato (`**así**`) en vez de la negrita
- **El aviso te prepara para lo que hace macOS.** La primera vez que abrís una descarga nueva, macOS bloquea la app y hay que destrabarla desde Ajustes del Sistema. Antes no lo decíamos en ningún lado y el cartel de macOS no da ninguna pista de cómo seguir

## 0.2.0

Primera versión de CopyNotes para escritorio. Esto es lo que trae:

- **Agentes de IA.** Podés conectar Claude Code, OpenCode o Cursor y dejar que lean y gestionen las tareas de las notas que vos habilites. Es lo único que la versión web no puede hacer
- **Tus notas en varios dispositivos, cifradas.** Opcional: se cifran en tu aparato antes de salir y la llave que las abre no sale de ahí. Sin cuenta, CopyNotes funciona igual
- **Compartir una nota con otra persona.** Le mandás un link, entra con su cuenta y la nota le aparece. No se comparte ningún mail. Ella puede marcar tareas, comentarlas y avisarte "Listo", pero no cambiar tu texto. Te avisa antes de que mientras esté compartida esa nota sale de la bóveda, y vuelve sola cuando cerrás la compartición
- **Te avisa cuando hay una versión nueva**, con un punto en el engranaje. Nunca se actualiza sola: entrás a Configuración, ves qué trae y decidís vos
- **Los respaldos dejaron de duplicarte notas.** Importar un archivo viejo repetía renglones que no habían cambiado; en un respaldo real eran 1154. Además ahora se revisa el archivo al bajarlo, y restaurarlo con la nube encendida por fin funciona
- **Enter parte un renglón en dos y Backspace los vuelve a unir**, llevándose el formato
- **La lista de notas se ensancha** arrastrando su borde derecho, para los nombres largos
- **CopyNotes tiene su logo definitivo**

Y muchos arreglos más chicos: el separador se puede borrar desde el celular, el menú ⋯ ya no se sale de la pantalla con el teclado abierto, y la Agenda se actualiza sola mientras escribís.
