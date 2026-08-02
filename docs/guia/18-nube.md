# 18. La nube (beta)

La nube sirve para una sola cosa: tener tus notas en más de un dispositivo. Es
opcional. **Sin cuenta, CopyNotes funciona exactamente igual que siempre**, gratis
y sin conexión.

Está en **Configuración (⚙️) › Nube**.

## Lo importante en una línea

Tus notas se **cifran en tu dispositivo antes de salir**. Al servidor llega texto
cifrado, y la llave que lo abre —tu código de recuperación— **no se sube**: vive
solo en tus dispositivos. Quien mire la base de datos ve letras y números.

> **Esto es beta y todavía no lo auditó nadie de afuera.** Es lo que hace el
> programa y lo probamos nosotros, pero hasta que una auditoría de seguridad
> independiente lo confirme no te lo damos como garantía. Si tenés algo cuya
> filtración sería grave, por ahora dejalo sin nube.

Eso vale para lo que **sale** hacia el servidor. Dentro de tu propia computadora
las notas se guardan como siempre, sin cifrar — y si usás **agentes**, hay además
una copia local en claro de las notas que marcaste visibles, explicada en
**[Agentes](17-agentes.md)**.

## Entrar

1. Escribí tu email y una contraseña.
2. La primera vez tocá **Crear cuenta**. Después, siempre **Entrar**.

Guardá esa contraseña donde guardás las demás: por ahora **no hay "olvidé mi
contraseña"**, porque CopyNotes todavía no manda mails.

Aunque la perdieras, tus notas siguen enteras en tu dispositivo — la contraseña
abre la cuenta, no las notas. Lo que abre las notas es el código de recuperación
de acá abajo, y son dos cosas distintas a propósito.

> Más adelante el ingreso va a ser con un **código de 6 dígitos** que llega por
> email, sin contraseña. Ya está construido; espera a que CopyNotes tenga su
> propio dominio de correo.

## El código de recuperación (esto es lo que no hay que perder)

Después de entrar, CopyNotes te pide **crear la bóveda y permitir subir**: la
llave que cifra tus notas, y el permiso, en un solo botón. Son una sola decisión
a propósito —abajo, en "Dar el permiso", está lo que dice esa pantalla antes de
que la toques—. Al crear la bóveda te muestra **una sola vez** un código así:

```
K7QP-3M9X-VT2H-8NRJ-5WBD-4YFC
```

Copialo y guardalo donde guardás tus contraseñas. Tenés dos formas: el botón de
**copiar** al lado del código, o **Descargar como archivo**, que te baja un
`.txt` con el código adentro —el portapapeles se pisa con lo próximo que copies,
un archivo queda—.

Mientras el código está en pantalla, **la ventana de Configuración no se cierra**:
ni con la X ni con Escape, hasta que tildes **"Ya lo guardé"**. Es la única
pantalla de CopyNotes que hace esto, y es a propósito: si la cerrabas sin
guardar el código, después de recargar la bóveda ya existía y el código **no
volvía a mostrarse nunca más**.

- Es lo único que abre tus notas en **otro** dispositivo.
- **Nadie más lo tiene.** No está en el servidor, no lo tenemos nosotros, no se
  puede "resetear" como una contraseña.
- Si lo perdés **y** perdés tus dispositivos, tus notas **no se pueden
  recuperar**. Ese es el precio de que la llave no esté en el servidor.

Cambiar la contraseña de tu cuenta no descifra ninguna nota.

## Dar el permiso

Nada sale de tu dispositivo hasta que lo permitas. En el primer dispositivo el
permiso va junto con crear la bóveda (**Crear bóveda y permitir subir**); en un
segundo dispositivo, que se suma a una bóveda que ya existe, es un botón aparte
(**Permitir y subir**). En los dos casos, antes de tocarlo la pantalla te dice
exactamente:

- **Qué se sube:** todo lo que escribís —notas, renglones, comentarios, fechas,
  etiquetas, snippets y la bitácora de tareas—, siempre cifrado.
- **Qué ve igual el servidor:** que tenés una cuenta, tu email, tu conexión,
  cuántos registros hay, cuánto pesan y a qué hora sincronizás. Eso no se puede
  esconder, y preferimos decirlo.

El permiso es **por dispositivo**: si entrás en otro, ahí lo tenés que dar de
nuevo. Tampoco viaja dentro de un respaldo.

## Después: qué vas a ver

En **Configuración › Nube** aparece tu cuenta y una línea de estado:

- **"Todo subido."** — no queda nada pendiente.
- **"3 cambios sin subir."** — se suben solos en menos de un minuto.
- **"Subiendo…"** — está trabajando.
- **Última subida hace X** — cuándo terminó la última.

Se sincroniza solo cada 30 segundos y también cuando volvés a tener conexión.
**Sincronizar ahora** lo fuerza.

Lo que llega del otro dispositivo **aparece en el lugar**, sin sacarte el cursor
ni cortar el renglón que estás escribiendo. El renglón donde tenés el cursor es
el único que espera: se actualiza recién cuando movés el cursor a otro lado. Eso
vale también si en el otro dispositivo **borraron** ese renglón — no desaparece
debajo de tu mano, desaparece cuando salís de él.

## Cerrar sesión

**Tus notas se quedan en el dispositivo.** Cerrar sesión desconecta la cuenta y
CopyNotes sigue andando igual que antes de conectar la nube: sin conexión, con
todo lo tuyo intacto.

Lo que sí se borra de ese dispositivo es **la llave que abre lo que está
guardado en la nube** —junto con el permiso de subir y la cuenta de por dónde
iba la sincronización—. Por eso, antes de cerrar, CopyNotes te lo pregunta y te
avisa: **para volver a conectar ese dispositivo vas a necesitar tu código de
recuperación**. Si nunca lo guardaste y es tu único dispositivo, lo que ya
subiste deja de poder abrirse. Si te quedaban cambios sin subir, el aviso
también te dice cuántos: se quedan ahí, pero no van a llegar a los otros
dispositivos.

Está pensado así para que entrar con **otra** cuenta arranque limpio. Antes no
lo hacía: quedaban puestos el permiso de subir de la cuenta anterior —o sea que
empezaba a subir sin volver a preguntarte— y la cuenta de por dónde iba, que en
un servidor distinto le hacía saltear notas en silencio.

## Escribir sin conexión

Escribí tranquilo. Todo se guarda local como siempre y se sube cuando vuelve la
conexión; nada se duplica y nada se pierde. Cerrar CopyNotes nunca espera a
internet.

## Abrir tus notas en otro dispositivo

En el segundo dispositivo (otra computadora, la app de escritorio, el navegador):

1. **Configuración › Nube** → entrá con el mismo email y contraseña.
2. Como esa cuenta ya tiene notas guardadas, en vez de "Crear bóveda y permitir
   subir" te pide el **código de recuperación**. Pegalo y tocá **Traer mis
   notas**.
3. Vas a ver "Trayendo tus notas…" y aparecen.
4. Después te pregunta si este dispositivo también puede **subir** lo que
   escribas acá. Bajar no necesita permiso —es justo lo que pediste con el
   código—; subir sí, y es una decisión por dispositivo.

Desde ahí, lo que escribas en cualquiera de los dos aparece en el otro. Y si en
alguno tenés un **agente** conectado, lo que él haga también viaja igual.

**¿Cuánto tarda?** Si los dos dispositivos están abiertos al mismo tiempo, unos
**2 o 3 segundos** después de que dejás de escribir. Si el otro está cerrado,
CopyNotes se toma con calma: revisa cada 30 segundos, porque no hay apuro cuando
no hay nadie del otro lado. **Sincronizar ahora** lo fuerza siempre.

**Podés seguir escribiendo mientras llegan cambios.** Lo que el otro dispositivo
cambió aparece en su renglón, y el renglón que vos estás escribiendo queda
intacto: no se te mueve el cursor ni se te corta la frase. El único que espera es
ese renglón tuyo — toma lo que llegó recién cuando movés el cursor a otro lado.

El código es lo único que abre la bóveda: si lo escribís mal, no pasa nada, no se
rompe nada, simplemente no abre. Podés reintentar.

## Si editás lo mismo en los dos lados

Puede pasar: cambiaste el mismo renglón en la computadora y en el teléfono, o
editaste algo sin conexión mientras el otro dispositivo también lo cambiaba.

**Nunca se pisa nada.** Lo que ves en pantalla sigue siendo lo tuyo, y **justo
debajo del renglón** aparecen las dos versiones, con una barrita violeta al
costado:

```
como: cuando a namacion?
┃ ⧉ Otra versión de este renglón · tocá la que quede
┃   acá   como: cuando a namacion?
┃                 ‾‾‾‾‾‾‾‾
┃   allá  como: cuandoa namacion?
┃                 ‾‾‾‾‾‾‾
```

**Tocás la que querés dejar y listo.** No hay botones: las versiones mismas son
la elección. `acá` es lo que escribiste en este dispositivo, `allá` lo del otro.
Con teclado también: Tab para pasar de una a la otra, Enter para elegir.

**Lo que cambió va subrayado** en las dos. Si la diferencia es una sola letra o
un espacio, no tenés que buscarla: te la marca. Se subraya la palabra entera,
porque subrayar una letra suelta no se ve.

Si te quedás con la tuya, el otro dispositivo termina recibiéndola; si traés la
de allá, reemplaza lo que tenías acá.

**Si te equivocás, no pasa nada.** Después de elegir aparece abajo un avisito
con **Deshacer** durante unos segundos: lo tocás y vuelve todo como estaba,
incluido el aviso de las dos versiones para que puedas volver a decidir.

Cuando en el otro dispositivo **borraste** el renglón, esa opción se ve distinta
—en rojo y con un tacho: **Borrar este renglón**— para que no la elijas de
casualidad pensando que es texto.

En **Configuración › Nube** también ves cuántos conflictos hay abiertos, por si
alguno cayó en algo que no es un renglón (el nombre de una etiqueta, una
carpeta).

Si en un dispositivo **borraste** algo que en el otro seguiste editando, gana la
edición: la nota no se borra sola, y el borrado te aparece como conflicto para
que decidas vos.

**Incluso si los dos suben al mismo tiempo.** Ninguna computadora puede tapar una
versión que nunca vio: cuando manda algo, dice también de qué versión venía, y si
mientras tanto la otra había guardado algo, la nube no la deja pisarlo. Esa
computadora se baja lo que le faltaba y ahí aparece el aviso de las dos
versiones. Si no había nada que discutir, se acomoda sola y no te enterás.
