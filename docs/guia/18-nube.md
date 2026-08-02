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

Después de entrar, CopyNotes te pide **crear la bóveda**: la llave que cifra tus
notas. Al crearla te muestra **una sola vez** un código así:

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

Nada sale de tu dispositivo hasta que toques **Permitir y subir**. Antes de
tocarlo, la pantalla te dice exactamente:

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
**Sincronizar ahora** lo fuerza. **Cerrar sesión** desconecta la cuenta y deja
todas tus notas intactas en el dispositivo.

## Escribir sin conexión

Escribí tranquilo. Todo se guarda local como siempre y se sube cuando vuelve la
conexión; nada se duplica y nada se pierde. Cerrar CopyNotes nunca espera a
internet.

## Abrir tus notas en otro dispositivo

En el segundo dispositivo (otra computadora, la app de escritorio, el navegador):

1. **Configuración › Nube** → entrá con el mismo email y contraseña.
2. Como esa cuenta ya tiene notas guardadas, en vez de "Crear bóveda" te pide el
   **código de recuperación**. Pegalo y tocá **Traer mis notas**.
3. Vas a ver "Trayendo tus notas…" y aparecen.

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

**Nunca se pisa nada.** Lo que ves en pantalla sigue siendo lo tuyo, y **debajo
del renglón en cuestión** aparece un aviso en violeta:

> ⧉ Hay otra versión de este renglón

Tocalo y se abren las dos versiones, una debajo de la otra —**lo tuyo, en este
dispositivo** y **lo del otro dispositivo**— con dos botones: **Quedarme con el
mío** o **Traer el otro**. Elegís ahí mismo, sin salir de la nota. Si te quedás
con el tuyo, el otro dispositivo termina recibiéndolo; si traés el otro,
reemplaza lo que tenías acá.

En **Configuración › Nube** también ves cuántos conflictos hay abiertos, por si
alguno cayó en algo que no es un renglón (el nombre de una etiqueta, una
carpeta).

Si en un dispositivo **borraste** algo que en el otro seguiste editando, gana la
edición: la nota no se borra sola, y el borrado te aparece como conflicto para
que decidas vos.
