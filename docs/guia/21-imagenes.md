# 21. Imágenes

Podés pegar una captura de pantalla adentro de un renglón, como una imagen más
de la nota.

## Por ahora, sólo en este aparato

Antes que nada: una captura pegada hoy **se queda en el aparato donde la
pegaste**, aunque tengas la nube encendida. Si abrís la misma nota en el
celular o en otra computadora, todavía no la vas a ver ahí. Al final de este
tema, en "Lo que todavía no hace", está el resto de lo que falta.

## Tres formas de agregar una

- **Pegarla.** Sacás la captura (con lo de siempre: Cmd+Shift+4 en Mac, la
  tecla de captura en Windows, etc.) y la pegás con Ctrl/Cmd+V en un renglón,
  igual que pegarías texto.
- **Arrastrarla.** Arrastrás el archivo de imagen desde el Finder o el
  Explorador y lo soltás sobre un renglón.
- **El menú `/`.** Escribís `/imagen` y elegís el archivo desde el selector
  que abre tu sistema.

Las tres terminan igual: la imagen ocupa el renglón entero.

## Se ve al toque, sin saltos

Mientras la imagen carga, CopyNotes ya sabe qué tamaño va a ocupar y le deja el
hueco justo — la nota no da un salto cuando la imagen termina de aparecer.

Tocándola (o haciendo clic) se abre **grande, en toda la pantalla**. **Esc** la
cierra, o tocar afuera de ella.

## La descripción, opcional

Debajo de la imagen hay un renglón chico para escribirle una descripción. No es
obligatoria. Sirve para dos cosas: la encontrás si buscás por esa palabra (tema
10), y es lo que se lee en voz alta si alguien usa un lector de pantalla para
navegar la nota.

Si acabás de pegar una captura, el cursor ya te está esperando ahí: escribís la
descripción de una, sin tocar nada más.

## El límite: 5 MB por imagen

Si lo que pegás, arrastrás o elegís pesa más de 5 MB, CopyNotes no lo guarda y
te avisa por qué:

- **"Esa imagen pesa más de 5 MB. Probá con una captura más chica."**
- **"Ese archivo no es una imagen que CopyNotes pueda guardar."** — pasa con
  cualquier archivo que no sea una foto o captura de verdad. Los archivos
  `.svg` caen acá también: por dentro son código, no una foto, así que
  CopyNotes los trata como lo que son y los rechaza.
- **"No se pudo leer esa imagen."** — el archivo dice ser una imagen pero está
  dañado.
- **"No se pudo guardar la imagen. Puede que no haya espacio."**

En los cuatro casos no te queda un renglón a medio pegar: si falla, no aparece
nada roto.

## La misma captura, dos veces

Si pegás la misma captura en dos renglones (o en dos notas), CopyNotes se da
cuenta y no la guarda dos veces: ocupa el espacio de una sola imagen, aunque la
veas repetida en varios lugares.

## Con el teclado

- **Enter** sobre una imagen crea un renglón de texto nuevo debajo, igual que
  en cualquier otro tipo de renglón.
- Con la descripción vacía, **Backspace** la primera vez selecciona la imagen
  (se ve marcada); la segunda vez la borra.
- Una imagen **nunca se une** con el renglón de arriba al borrarla con
  Backspace — a diferencia del texto, no tiene sentido "pegarla" a otra línea.

## Viajan en el respaldo

Si alguna nota tiene una captura, el respaldo que bajás cambia de tipo: en vez
de `.json` es un `.copynotes`, que además del texto de siempre incluye las
imágenes. Sigue siendo un archivo que se abre con doble clic y se importa
igual que cualquier respaldo. Más detalles en el tema 11.

Si al bajar el respaldo a alguna imagen le faltaban los datos, CopyNotes te lo
avisó en ese momento (tema 11). Si igual lo importás más adelante, esa imagen
en particular se muestra como **"Imagen no disponible"** en su lugar; el resto
de la nota no se ve afectado.

## Lo que todavía no hace

- **No viajan a tus otros dispositivos.** Por ahora una imagen se queda en el
  aparato donde la pegaste: si abrís la misma nota en el celular o en otra
  computadora, ahí todavía no la vas a ver.
- **Una nota con imágenes no se puede compartir** con otra persona.
- **No se pueden guardar dentro de un snippet.**
- **Exportar la nota a Markdown o a HTML no lleva la imagen**: en su lugar
  queda el texto `[Imagen: ...]`, con la descripción que le pusiste en el
  lugar de los puntos suspensivos — o `[Imagen]` sin nada más, si no le
  pusiste ninguna.
- **Copiar el renglón tampoco la lleva**: si copiás una imagen (con el botón
  de copiar del renglón, o con Ctrl/Cmd+C) y la pegás en otro programa, ahí
  aparece ese mismo texto `[Imagen: ...]`. La captura en sí se queda en
  CopyNotes.
