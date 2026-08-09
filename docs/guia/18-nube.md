# 18. La nube (beta)

La nube sirve para una sola cosa: tener tus notas en más de un dispositivo. Es
opcional. **Sin cuenta, CopyNotes funciona exactamente igual que siempre**, gratis
y sin conexión.

Está en **Configuración (⚙️) › Nube**.

## Lo importante en una línea

Tus notas se **cifran en tu dispositivo antes de salir**. Al servidor llega texto
cifrado, y **la llave que lo abre no se sube**: vive solo en tus aparatos, y a un
aparato nuevo se la pasás vos. Quien mire la base de datos ve letras y números.

> **Esto es beta y todavía no lo auditó nadie de afuera.** Es lo que hace el
> programa y lo probamos nosotros, pero hasta que una auditoría de seguridad
> independiente lo confirme no te lo damos como garantía. Si tenés algo cuya
> filtración sería grave, por ahora dejalo sin nube.

Eso vale para lo que **sale** hacia el servidor. Dentro de tu propia computadora
las notas se guardan como siempre, sin cifrar — y si usás **agentes**, hay además
una copia local en claro de las notas que marcaste visibles, explicada en
**[Agentes](17-agentes.md)**.

## Entrar

Lo más corto es **Continuar con Google**: tocás el botón, elegís tu cuenta en la
pantalla de Google y volvés a CopyNotes ya adentro. Sin contraseña que recordar
ni que tipear en el celular. Si cambiás de idea a mitad de camino, volvés como
estabas y CopyNotes te lo dice.

> **Google te da la puerta, no la llave.** Entrar con Google no le muestra tus
> notas a nadie: lo que las abre sigue siendo la llave que vive solo en tus
> aparatos. Google ve que entraste, nunca lo que escribiste.

En la **app de escritorio** el botón está también, y hace lo mismo por otro
camino: al tocarlo se abre **tu navegador** con la pantalla de Google. Elegís la
cuenta ahí, el navegador te muestra una página que dice "Listo, ya podés volver a
CopyNotes", y cuando volvés a la app ya estás adentro. Mientras tanto el botón
dice *Esperando a tu navegador…*.

> Se abre afuera a propósito: la ventana de la app no tiene barra de direcciones,
> así que Google no tendría por dónde devolverte.

Si cerrás el navegador sin elegir la cuenta, después de unos minutos la app te
dice que no llegó la respuesta y quedás como estabas. Podés tocar el botón de
nuevo cuando quieras.

Con email y contraseña, que sigue estando:

1. Escribí tu email y una contraseña.
2. La primera vez tocá **Crear cuenta**. Después, siempre **Entrar**.

Guardá esa contraseña donde guardás las demás: por ahora **no hay "olvidé mi
contraseña"**, porque CopyNotes todavía no manda mails.

Aunque la perdieras, tus notas siguen enteras en tu dispositivo — la contraseña
abre la cuenta, no las notas. Lo que abre las notas es la llave de la bóveda, que
nunca sale de tus aparatos, y son dos cosas distintas a propósito.

> Más adelante el ingreso va a ser con un **código de 6 dígitos** que llega por
> email, sin contraseña. Ya está construido; espera a que CopyNotes tenga su
> propio dominio de correo.

## La llave que abre tus notas

Después de entrar, CopyNotes te pide **crear la bóveda y permitir subir**: la
llave que cifra tus notas, y el permiso, en un solo botón. Son una sola decisión
a propósito —abajo, en "Dar el permiso", está lo que dice esa pantalla antes de
que la toques—.

**No hay ningún código que guardar.** La llave se crea sola en este aparato y no
sale de acá: al servidor llegan letras y números que él no puede abrir. Cuando
quieras ver estas notas en otro aparato, se la vas a pasar vos, con los dos
aparatos en la mano — está explicado en **"Abrir tus notas en otro aparato"**,
más abajo.

- **Nadie más tiene esa llave.** No está en el servidor, no la tenemos nosotros,
  no se puede "resetear" como una contraseña.
- Si perdés **todos** tus aparatos a la vez, lo que está en la nube **no se puede
  recuperar**. Ese es el precio de que la llave no esté en el servidor. Si pasa,
  hay una salida —vaciar la nube y volver a empezar— explicada más abajo.

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

El estado vive en el **puntito de arriba a la derecha**, el mismo del guardado:
tocalo y se abre el estado de tus datos.

- **"Todo subido."** — no queda nada pendiente.
- **"3 cambios sin subir."** — se suben solos en menos de un minuto.
- **"Sincronizando…"** — está trabajando.
- **Última subida hace X** — cuándo terminó la última.
- **"En vivo: 1 dispositivo más"** — hay otro abierto ahora mismo y los cambios
  viajan en segundos, sin esperar el reloj.
- **"Sin conexión con la nube"** — no se pudo llegar al servidor (te quedaste sin
  internet, el wifi se cortó, el servidor no contestó). **No se perdió nada**: lo
  que escribiste está guardado en el dispositivo y sube solo cuando vuelva la
  conexión. Por eso no aparece en rojo: no hay nada que arreglar ni que hacer.

En **Configuración › Nube** queda lo que es una decisión: tu cuenta, el permiso
de subir, sumar un aparato y cerrar sesión. **Sincronizar ahora** está
ahí y fuerza una pasada; igual se sincroniza solo cada 30 segundos y cuando
volvés a tener conexión.

Lo que llega del otro dispositivo **aparece en el lugar**, sin sacarte el cursor
ni cortar el renglón que estás escribiendo. El renglón donde tenés el cursor es
el único que espera: se actualiza recién cuando movés el cursor a otro lado. Eso
vale también si en el otro dispositivo **borraron** ese renglón — no desaparece
debajo de tu mano, desaparece cuando salís de él.

Cada vez que sincroniza, CopyNotes vuelve a mirar un tramo de lo último que ya
había traído. Es por un detalle del servidor: cuando los dos dispositivos suben
al mismo tiempo, un cambio puede quedar guardado con un número **anterior** al
que ya se leyó, y mirando solo hacia adelante ese cambio no se pedía nunca más
—se quedaba en el otro aparato hasta que alguien volviera a tocar ese renglón—.
Volver a mirar hacia atrás no cuesta nada ni repite nada: lo que ya está acá se
reconoce y no se vuelve a escribir.

## Cerrar sesión

**Tus notas se quedan en el dispositivo.** Cerrar sesión desconecta la cuenta y
CopyNotes sigue andando igual que antes de conectar la nube: sin conexión, con
todo lo tuyo intacto.

Lo que sí se borra de ese dispositivo es **la llave que abre lo que está
guardado en la nube** —junto con el permiso de subir y la cuenta de por dónde
iba la sincronización—. Por eso, antes de cerrar, CopyNotes te lo pregunta y te
avisa: **para volver a conectar ese aparato vas a necesitar el código que muestre
otro aparato tuyo**. Si es tu único aparato, lo que ya subiste deja de poder
abrirse — salvo que empieces la nube de nuevo. Si te quedaban cambios sin subir, el aviso
también te dice cuántos: se quedan ahí, pero no van a llegar a los otros
dispositivos.

Está pensado así para que entrar con **otra** cuenta arranque limpio. Antes no
lo hacía: quedaban puestos el permiso de subir de la cuenta anterior —o sea que
empezaba a subir sin volver a preguntarte— y la cuenta de por dónde iba, que en
un servidor distinto le hacía saltear notas en silencio.

Y si la sesión **se cae sola** (pasan los días, la cerrás desde otro lado,
limpiás los datos del navegador) nunca pasás por ese botón. Ahora CopyNotes se
da cuenta igual: al entrar con una cuenta distinta de la que dejó la llave en
ese dispositivo, hace la misma limpieza antes de sincronizar nada —tus notas se
quedan, y el aparato te vuelve a pedir el permiso y el código del otro aparato,
como uno nuevo—.

## Escribir sin conexión

Escribí tranquilo. Todo se guarda local como siempre y se sube cuando vuelve la
conexión; nada se duplica y nada se pierde. Cerrar CopyNotes nunca espera a
internet.

## Abrir tus notas en otro aparato

No hay ningún código que guardar. Los dos aparatos se pasan la llave en el
momento, y para eso alcanza con tenerlos a los dos a mano:

1. En el aparato **nuevo**: **Configuración › Nube** → entrá con tu cuenta.
   Como esa cuenta ya tiene notas guardadas, te va a pedir un código.
2. En el aparato **donde ya las tenés**: **Configuración › Nube › Sumar un
   aparato** → **Mostrar el código**. Aparecen ocho caracteres, así:

   ```
   K7QP-3M9X
   ```

3. Escribilos en el aparato nuevo y tocá **Traer mis notas**. Vas a ver
   "Trayendo tus notas…" y aparecen.
4. Después te pregunta si este aparato también puede **subir** lo que escribas
   acá. Bajar no necesita permiso —es justo lo que pediste con el código—; subir
   sí, y es una decisión por aparato.

Ese código **vale diez minutos y se usa una sola vez**. No sirve de nada
guardarlo: la próxima vez pedís otro. Si tardaste, el aparato nuevo te dice que
venció y pedís uno nuevo en el otro; si lo escribiste mal, te lo dice y podés
reintentar sin pedir nada.

El aparato que se acaba de sumar también puede sumar a un tercero: una vez que
tiene la llave, es un aparato como cualquier otro.

> **Por qué así.** La llave que abre tus notas vive sólo en tus aparatos, nunca
> en nuestro servidor. Para que aparezca en uno nuevo, alguien se la tiene que
> pasar — y ese alguien sos vos, con el aparato en la mano.

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

### Si no tenés el otro aparato

Se rompió, lo perdiste, lo formateaste, te lo robaron. Entonces lo que está en la
nube no lo puede abrir nadie: nosotros tampoco. La salida está ahí mismo, en
letra chica: **No tengo el otro aparato** → **Empezar de nuevo la nube**.

Borra todo lo que hay en el servidor y vuelve a subir desde este aparato.
**Tus notas de este aparato no se tocan.** Lo que se pierde es lo que estuviera
sólo en la nube y en ningún aparato tuyo. Como es el único botón de CopyNotes que
borra algo que no está acá, para habilitarlo hay que escribir **BORRAR** a mano.

**Una cuenta tiene una sola bóveda, y es la primera.** Si por lo que sea dos
aparatos intentan crear la suya casi al mismo tiempo, gana la que llegó primero y
el otro te dice:

> Esta cuenta ya tiene una bóveda creada en otro aparato. Sumá este aparato con
> el código que muestra el otro.

Ese aparato deja de sincronizar hasta que lo sumes, y **no sube nada mientras
tanto**. Es a propósito: si subiera, mandaría notas cerradas con una llave que la
cuenta no tiene, y después no las abriría nadie. Tus notas de ese aparato siguen
enteras acá, como siempre. Debajo del cartel tenés las dos salidas: pedirle el
código al otro aparato, o empezar de nuevo la nube.

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
de allá, reemplaza lo que tenías acá. Da igual **cuál de los dos escribió
primero**: la versión que elegís es la que gana en los dos, aunque la hayas
escrito antes que la otra.

**Si te equivocás, no pasa nada.** Después de elegir aparece abajo un avisito
con **Deshacer** durante unos segundos: lo tocás y vuelve todo como estaba,
incluido el aviso de las dos versiones para que puedas volver a decidir.

Cuando en el otro dispositivo **borraste** el renglón, esa opción se ve distinta
—en rojo y con un tacho: **Borrar este renglón**— para que no la elijas de
casualidad pensando que es texto.

**Y solo cuando las dos versiones son distintas.** Si los dos dispositivos
terminaron escribiendo exactamente lo mismo —pasa más de lo que parece: el mismo
tilde en la misma tarea, el mismo renglón movido al mismo lugar—, CopyNotes no
te pregunta nada: se queda con esa versión en los dos y sigue. Elegir entre dos
cosas idénticas no es una decisión.

**Aparecen solo cuando de verdad tocaste lo mismo.** Antes, escribir en las dos
puntas de la misma nota alcanzaba para llenarla de conflictos aunque no
compartieras ni un renglón: cada vez que apretabas Enter en el medio, CopyNotes
le corría el lugar a todos los renglones de abajo, y los dos dispositivos se
peleaban por renglones que vos ni habías mirado. Ahora un Enter escribe **un solo
renglón**, el que nace.

**Y si el renglón está en otra nota, te enterás igual.** El puntito de arriba a
la derecha —el del guardado— se rodea de un anillo violeta con el número al
lado cuando hay versiones esperando. Tocalo y ahí están las dos versiones de
cada una, con el nombre de la nota y un **Ir al renglón**; también las que no
son renglones (el nombre de una etiqueta, una carpeta). La primera vez que
llega una, además, aparece un avisito abajo.

**Ahí también se elige tocando la versión que quede**, igual que en el renglón:
no hay botones. Y en cuanto no queda nada más por decidir, el panel se cierra
solo para no taparte la nota. Si te arrepentís tenés **Deshacer** unos
segundos.

En la **lista de notas**, la nota afectada lleva el mismo puntito violeta al
lado del nombre, y se apaga en cuanto decidís.

Si en un dispositivo **borraste** algo que en el otro seguiste editando, gana la
edición: la nota no se borra sola, y el borrado te aparece como conflicto para
que decidas vos.

**Incluso si los dos suben al mismo tiempo.** Ninguna computadora puede tapar una
versión que nunca vio: cuando manda algo, dice también de qué versión venía, y si
mientras tanto la otra había guardado algo, la nube no la deja pisarlo. Esa
computadora se baja lo que le faltaba y ahí aparece el aviso de las dos
versiones. Si no había nada que discutir, se acomoda sola y no te enterás.

**Y aunque los dos escriban en el mismo instante.** Para saber qué versión es más
nueva, cada dispositivo le pone la hora al cambio. Dos que escriben el mismo
renglón en la misma milésima de segundo le ponen la misma hora, y antes eso
alcanzaba para que uno confundiera el cambio del otro con el suyo propio: se
quedaba con lo suyo en pantalla, dejaba de mandarlo, y los dos seguían mostrando
cosas distintas sin avisar nada. Ahora, cuando las horas coinciden, CopyNotes
compara el texto: si es el mismo, sigue de largo; si no, te muestra el aviso de
las dos versiones y elegís vos.
