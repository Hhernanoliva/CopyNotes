# Novedades

Lo que cambia en cada versión de CopyNotes, contado para quien la usa.
La app lee este archivo: lo de acá aparece en Configuración › Actualizaciones.

Reglas: una sección `## X.Y.Z` por versión, la más nueva arriba, una viñeta por
cambio, en castellano y sin jerga técnica. Se escribe **en el mismo commit que
la funcionalidad**, no al publicar.

## 0.2.3

- **La casilla de una tarea sin marcar ahora se ve.** El cuadradito vacío tenía un borde tan tenue que casi se perdía contra el fondo, sobre todo en el tema claro; ahora tiene el mismo tono que la viñeta ● y la manija del renglón. La casilla marcada no cambia
- **Los controles de cada renglón dejaron de quedar desnivelados con el texto.** La casilla, la viñeta ●, la manija, la flechita de contraer, el chip de fecha y los botones **Copiar** y **⋯** se corrían hacia arriba con el texto en 125% o más, y en los títulos y los bloques de código no coincidían ni en 100%. Ahora quedan centrados sobre el primer renglón en cualquiera de los seis tamaños y en todos los tipos de renglón
- **El texto de los bloques de código respira al agrandarlo.** Su interlineado no crecía con el resto, así que en los tamaños grandes las líneas quedaban encimadas
- **Arrastrar hasta el borde ahora desplaza la nota sola.** Si el lugar donde querés dejar el renglón está fuera de la pantalla, llevalo al borde de arriba o de abajo y esperá: la nota corre sola, más rápido cuanto más pegado al borde. Vale también al marcar renglones arrastrando y al mover un texto seleccionado
- **Anidar un renglón con Tab ya no lo corre de lugar.** En listas que crecieron apretando Enter en el medio, algunos renglones se iban una posición hacia abajo al anidarlos. Ahora se quedan donde estaban. Vale igual para Shift+Tab y para mover filas con Alt+↑/↓
- **Ahora podés entrar en un renglón y trabajar ahí adentro**, como si fuera una nota aparte: sus sub-ítems ocupan la pantalla y arriba queda un camino (`Mi nota › Casa ›`) para volver. Se entra de tres maneras: **doble clic en la manija** del renglón (los seis puntitos de la izquierda; un clic solo lo sigue seleccionando y arrastrarla lo sigue moviendo), el menú **⋯** con *Entrar acá* (la única en celular), o `Alt+→` con el cursor puesto — `Alt+←` sale un nivel
- **CopyNotes te devuelve a donde estabas.** Si cerrás la app estando dentro de un renglón, al volver a esa nota seguís ahí; y si ese renglón se borró desde otro aparato, te avisa y te muestra la nota entera
- **Buscar un renglón ahora te deja el cursor en él**, y si estabas dentro de otro renglón te devuelve la nota entera, para que lo que buscaste se vea aunque esté en otra rama

## 0.2.2

- **Los enlaces se pueden editar sin abrirlos por accidente.** El primer clic o toque muestra la dirección completa con **Abrir** y **Editar**; también podés corregir o borrar letras dentro del enlace como texto normal
- **La manija ahora selecciona un renglón al tocarla y lo mueve al arrastrarla.** La selección sirve para copiar, borrar, anidar o mover una sola fila, y la manija sigue disponible en filas vacías e imágenes
- **CopyNotes ahora tiene app de escritorio para Windows**, además de la de Mac. Es la misma app, con todo adentro: notas, nube y agentes. La primera vez que la abrís, Windows muestra una pantalla azul que se pasa con *"Más información" → "Ejecutar de todos modos"*
- **La web vuelve a ofrecer la app de escritorio.** Ahora que hay una versión publicada para bajar, volvieron la tarjetita *"¿Usás agentes de IA?"* abajo a la derecha y el enlace de **Configuración › Agentes**. Estaban ocultos porque llevaban a una página vacía
- **Ahora podés pegar capturas de pantalla en las notas.** Pegándolas, arrastrando el archivo a un renglón, o escribiendo `/imagen`. Se ven al tamaño justo, sin saltos, y tocarlas las abre en pantalla completa (`Esc` para cerrar); debajo se les puede poner una descripción, opcional y buscable
- **Hay un límite de 5 MB por imagen**, y CopyNotes avisa por qué la rechaza cuando no entra: pesa de más, no es una imagen que pueda guardar, está dañada, o no se pudo guardar por falta de espacio. Los archivos `.svg` no se aceptan, porque son código y no una foto
- **El respaldo ahora puede incluir tus capturas.** Si una nota tiene una imagen, el archivo baja como `.copynotes` en vez de `.json`: es un ZIP común que se abre con doble clic, y los dos tipos de archivo se importan igual
- **Todavía no:** las imágenes no viajan a tus otros dispositivos en esta versión, una nota con imágenes no se puede compartir ni guardar en un snippet, y exportarla a Markdown o HTML deja el lugar de la imagen en texto

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
