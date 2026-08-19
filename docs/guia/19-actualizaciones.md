# Actualizaciones

Hay dos casos y funcionan distinto: la **app de escritorio** (casi todo este tema) y la **web**, que tiene su propio aviso desde el 16/8/2026.

## En la web

Antes acá decía que en el navegador no había nada que actualizar, que entrabas y ya estabas en la última versión. **No era cierto**, y costó caro: se publicaron dos arreglos, se probaron en el teléfono, y el teléfono seguía mostrando el problema porque seguía usando la versión guardada de antes. Una pestaña que no vuelve a cargar de verdad —y en el celular puede quedar dormida días— se queda vieja sin decir nada.

Ahora, cuando hay una versión nueva, aparece abajo un cartelito: **"Hay una versión nueva de CopyNotes"**, con un botón **Actualizar** y la aclaración de que tus notas no se tocan.

- **Tocás Actualizar y listo**: la app se recarga y ya estás en la nueva. Tarda un segundo. No hay nada que descargar ni instalar — la versión nueva ya estaba bajada, sólo faltaba usarla.
- **Si no lo tocás, no pasa nada.** El cartelito se queda ahí y podés seguir escribiendo. No se recarga sola: cortarte una frase a la mitad por una mejora que no pediste es peor que la versión vieja.
- Tus notas viven en el dispositivo, no en el código de la app, así que actualizar **nunca** las toca.
- Mientras tengas la app abierta, CopyNotes pregunta **una vez por hora** si hay algo nuevo. Antes preguntaba sólo al arrancar, así que si nunca cerrabas la pestaña no te enterabas nunca.

Lo único que queda afuera: si el teléfono revive una pestaña dormida sin cargarla de verdad, no hay aviso hasta que cargue. Eso lo decide el sistema del teléfono, no CopyNotes.

## En el escritorio: CopyNotes nunca se actualiza sola

Es a propósito. La app **te avisa** que hay una versión nueva y vos decidís cuándo instalarla. No se reemplaza a sí misma, no te reinicia la ventana en el medio de algo, y no te interrumpe con carteles.

## Cómo te enterás

Cuando hay una versión nueva, aparece **un puntito sobre el engranaje ⚙️** de arriba a la derecha. Nada más: no salta ningún cartel ni se mueve nada de lugar. Si le pasás el mouse por arriba, dice *"Configuración — hay una versión nueva"*.

## Qué ves adentro

En **Configuración** (⚙️) hay una sección **Actualizaciones**:

- **Qué versión tenés.** Siempre. Si no hay nada nuevo, dice *"Tenés la versión X. Estás al día."*
- **Qué trae la versión nueva**, si la hay: el número y la lista de cambios, en castellano.
- **Un botón Descargar**, que abre la página de descarga en tu navegador.
- **Qué trajo tu versión**, plegado abajo del todo. Lo abrís y ves los cambios de la versión que ya tenés instalada. Está siempre, aunque estés al día, y **funciona sin internet** — viene adentro de la app.

Si en ese momento no hay internet, la sección simplemente dice qué versión tenés y se queda callada. No es un error tuyo ni hay nada que arreglar.

## Al instalar la versión nueva

Bajás el archivo, lo instalás encima de la app que ya tenés y listo. **No se pierde nada**: tus notas, tus snippets, el tamaño de texto, la sesión de la nube y la conexión con los agentes siguen igual.

Dos cosas que van a pasar y conviene saber de antes:

- **La primera vez que abrís una descarga nueva, macOS la va a bloquear.** Sale un cartel que dice *"No se abrió «CopyNotes» — Apple no pudo verificar que «CopyNotes» no contenga software malicioso que pudiera dañar tu Mac o poner tu privacidad en riesgo"*, con un solo botón: **Listo**. La app **no** tiene nada malo: pasa porque todavía no compramos el certificado de Apple, y le pasa a cualquier programa que no lo tenga.

  Para abrirla igual:

  1. Tocá **Listo**.
  2. Andá a **Ajustes del Sistema › Privacidad y seguridad**.
  3. Bajá hasta la sección **Seguridad**. Ahí va a aparecer un renglón sobre CopyNotes con un botón **Abrir igualmente**.
  4. Tocalo, confirmá con tu contraseña o Touch ID, y en el último cartel elegí **Abrir**.

  Ese renglón en Ajustes **solo aparece si recién intentaste abrir la app**. Si no lo ves, volvé a hacerle doble clic a CopyNotes para que salga el cartel y entrá a Ajustes enseguida.

  Es una sola vez por versión. (Si tenés un Mac con una versión vieja de macOS, ahí alcanza con **clic derecho sobre la app → Abrir**; en las versiones nuevas Apple sacó ese atajo.)
- **macOS te va a pedir la contraseña de tu Mac una vez**, por algo que se llama *"CopyNotes WebCrypto Master Key"*. Es normal y pasa en cada versión nueva, por el mismo motivo del certificado. Tocá **"Permitir siempre"**. ⚠️ Si la denegás, **la nube deja de sincronizar en esa computadora** y no te va a decir por qué. Tus notas de ese dispositivo no se tocan, pero deja de subir y bajar.

- **En Windows, la primera vez puede salir una pantalla azul** que dice *"Windows protegió su PC"*. Tampoco está roto: es por lo mismo, todavía no compramos el certificado. Tocá **"Más información"** y aparece el botón **"Ejecutar de todos modos"**. Una sola vez. Antes de eso, tu navegador puede avisarte que el archivo "no se descarga habitualmente" — es el mismo motivo y también se puede seguir. Esto se va solo con el tiempo, a medida que más gente lo descarga.

El día que exista el certificado de Apple, las dos cosas desaparecen.

## Si preferís no actualizar

No pasa nada. La app sigue funcionando igual. El puntito del engranaje se queda ahí hasta que instales, y se va solo cuando lo hagas.
