# Propuesta en revisión: colaboración multiusuario por bloques

> **Estado: propuesta en revisión.**
>
> Este documento no forma parte del roadmap, no es una especificación aprobada
> y no autoriza su implementación. Solo registra la investigación, las
> decisiones consideradas y un posible plan de desarrollo para poder revisarlo.
>
> Fecha de la propuesta: 2026-07-31.

## Resumen

La propuesta es permitir que hasta tres personas trabajen en una misma nota,
conservando el enfoque local, privado y sencillo de CopyNotes.

La primera versión sería colaboración **por bloques**:

- Dos personas pueden escribir al mismo tiempo en bloques diferentes.
- Si coinciden en el mismo bloque, CopyNotes avisa y conserva todas las
  versiones para que ninguna desaparezca.
- No se intenta mezclar automáticamente dos escrituras dentro de la misma frase
  como hace Google Docs.
- La nota continúa disponible sin conexión y se sincroniza cuando vuelve
  internet.
- El contenido se cifra en el dispositivo antes de salir.
- Supabase sigue siendo el único proveedor de cuenta, almacenamiento y
  conexión en tiempo real.

La función es factible sin convertir toda la aplicación en paga. Una beta
pequeña podría funcionar dentro del plan gratuito de Supabase. Una versión
pública y confiable debería presupuestar, como referencia, el plan Pro desde
US$25 mensuales.

## Decisiones consideradas en esta propuesta

Estas decisiones fueron elegidas para preparar el plan, pero solo quedarían
aprobadas si la propuesta se convierte más adelante en una especificación.

- La colaboración inicial es por bloques, no carácter por carácter.
- Cada nota admite hasta tres personas, contando al dueño.
- Todas las personas necesitan una cuenta de CopyNotes.
- La invitación se realiza mediante un enlace privado.
- El enlace funciona una sola vez y vence después de siete días.
- Quien acepta puede editar el título y todo el contenido visible de la nota.
- Un colaborador puede crear, mover, anidar, completar y borrar bloques.
- Solo el dueño puede invitar, retirar personas o eliminar la nota completa.
- Los comentarios privados de los bloques no se comparten.
- Las carpetas, etiquetas, posición en la barra lateral y visibilidad para
  agentes siguen siendo personales.
- La nota continúa funcionando sin conexión.
- Retirar a alguien bloquea el acceso futuro, pero no puede borrar copias que
  esa persona ya haya descargado, copiado o exportado.

## Qué se compartiría

- Título de la nota.
- Texto y formato visible de los bloques.
- Tipo de bloque.
- Estado de las tareas.
- Fechas.
- Jerarquía y orden de los bloques.
- Creación, movimiento y borrado de bloques.
- Versiones en conflicto que todavía necesitan una decisión.

## Qué seguiría siendo personal

- Comentario privado de cada bloque.
- Estado abierto o colapsado de los bloques.
- Carpeta y posición de la nota en la barra lateral.
- Etiquetas personales.
- Visibilidad para agentes.
- Preferencias de la aplicación.

Estos datos personales deberían continuar sincronizándose entre los
dispositivos de su propio dueño, pero nunca llegar a los demás colaboradores.

## Qué no entraría en la primera versión

- Escritura simultánea dentro de la misma frase.
- Cursores remotos moviéndose carácter por carácter.
- Invitaciones enviadas por email.
- Acceso anónimo o sin cuenta.
- Rol de solo lectura.
- Comentarios de conversación o menciones.
- Equipos, organizaciones o espacios de trabajo.
- Carpetas, etiquetas o snippets compartidos.
- Transferencia de propiedad.
- Enlaces públicos.
- Más de tres personas por nota.
- Un proveedor adicional como Liveblocks o Tiptap Cloud.

## Por qué usar Supabase

CopyNotes ya utiliza Supabase para las cuentas, los registros cifrados y la
sincronización entre dispositivos. Supabase Realtime ya provee la conexión
WebSocket que mantiene informados a los dispositivos.

El comportamiento actual está en `src/lib/sync/live.ts`:

- Abre un canal privado por cuenta.
- Detecta si hay otro dispositivo conectado.
- Envía un aviso vacío de "hay cambios".
- Descarga el contenido por el camino cifrado normal.

Para colaboración, el mismo patrón cambiaría de un canal por cuenta a un canal
privado por nota compartida. El WebSocket continuaría sin transportar palabras
de la nota.

No se recomienda incorporar otro proveedor en esta primera versión:

- Liveblocks facilita la colaboración estilo Google Docs, pero agrega otro
  servicio, otro costo y almacena el documento colaborativo en su
  infraestructura. Su configuración normal no conserva la promesa de que el
  proveedor no pueda leer el contenido.
- Tiptap Cloud comienza desde US$59 mensuales y obligaría a cambiar el editor.
- Cloudflare Durable Objects podría ser barato, pero exigiría construir y
  mantener un segundo servidor propio.
- Una conexión directa entre personas puede parecer gratuita, pero falla cuando
  nadie más está conectado, complica la recuperación y sigue necesitando
  servicios auxiliares.

## Costos de referencia

Precios consultados el 31 de julio de 2026. No incluyen impuestos y pueden
cambiar.

### Supabase Free

- US$0 mensuales.
- 2 millones de mensajes Realtime por mes.
- 200 conexiones simultáneas.
- 500 MB de base de datos.
- 5 GB de transferencia.
- 50.000 usuarios activos mensuales.
- Sin respaldos automáticos.
- Límites duros y proyecto pausado después de una semana sin actividad.

### Supabase Pro

- Desde US$25 mensuales.
- 5 millones de mensajes Realtime incluidos.
- 500 conexiones simultáneas incluidas.
- 8 GB de base de datos.
- 250 GB de transferencia.
- 100.000 usuarios activos mensuales.
- US$2,50 por cada millón adicional de mensajes.
- US$10 por cada 1.000 conexiones máximas adicionales.

Si CopyNotes ya necesitara Supabase Pro por la sincronización personal, la
colaboración probablemente no agregaría costo al principio.

### Ejemplo orientativo

Dos personas colaborando durante 30 minutos, con un grupo de cambios cada cinco
segundos, producirían aproximadamente:

- 360 avisos.
- Cerca de 720 mensajes facturables entre envío y recepción.
- 1.000 sesiones similares consumirían alrededor de 720.000 mensajes.

La presencia y la sincronización personal también consumen mensajes, por lo que
esto es solo una referencia. Es probable que el primer límite de una beta sea
la cantidad de personas conectadas simultáneamente, no el precio por mensaje.

## Viabilidad de mantener la aplicación gratis

Hay que separar dos ideas:

- **Gratis para las personas:** es factible.
- **Costo cero para CopyNotes para siempre:** no se puede garantizar con una
  función de colaboración confiable.

Una estrategia posible sería:

- Mantener la experiencia local gratis para siempre.
- Ofrecer colaboración gratis durante la beta.
- Limitar la beta a tres personas por nota.
- Medir el consumo real antes de decidir cualquier límite comercial.
- Si fuera necesario cobrar más adelante, cobrar al dueño de la nota y no a las
  personas invitadas.

Esta decisión comercial no forma parte de la propuesta técnica y debería
revisarse después de tener datos reales de la beta.

## Hallazgo previo que debe investigarse

La investigación encontró una posible carrera en la sincronización actual que
también puede afectar a dos dispositivos de una misma cuenta.

Actualmente:

- Supabase conserva una sola fila por registro.
- La subida reemplaza esa fila mediante `upsert` en
  `src/lib/sync/upload.ts`.
- CopyNotes sube primero y descarga después.
- Dos dispositivos podrían subir el mismo bloque antes de que cualquiera
  descargue lo del otro.
- La segunda subida podría reemplazar la primera antes de que aparezca el aviso
  de conflicto.
- El cursor `server_seq` también puede saltarse una escritura que obtuvo un
  número anterior pero terminó de guardarse después.

No hay evidencia de que esto haya causado una pérdida real. Antes de tratarlo
como un incidente, debe confirmarse con una prueba que reproduzca el recorrido
completo. Sin embargo, no sería seguro abrir la sincronización a varias personas
sin resolver primero este riesgo.

## Principio central de seguridad

Una versión nueva nunca debe destruir la única copia de la versión anterior
antes de comprobar que no existe una edición simultánea.

El servidor debería funcionar como una bandeja de sobres sellados:

- Cada cambio entra como una nueva versión cifrada.
- El servidor compara qué versión conocía quien la envió.
- Si nadie más cambió el bloque, la nueva versión pasa a ser la vigente.
- Si alguien más lo cambió, ambas versiones permanecen disponibles.
- Elegir una versión crea una nueva decisión compartida, en lugar de borrar en
  silencio la otra.

## Plan de desarrollo propuesto

Cada etapa debe terminar con un resultado comprobable. La función permanecería
oculta detrás de un interruptor interno hasta completar las etapas de seguridad,
edición y tiempo real.

### Etapa 0: definir el contrato

**Resultado esperado:** queda escrito exactamente qué debe hacer la función
antes de tocar datos reales.

- Convertir esta propuesta, solo si se aprueba, en una especificación formal.
- Documentar qué se comparte y qué continúa siendo privado.
- Definir los textos sobre privacidad, invitaciones y retiro de acceso.
- Registrar las situaciones que deben conservar versiones en lugar de elegir
  automáticamente.
- Preparar un interruptor interno para mantener la función oculta durante el
  desarrollo.

**Se termina cuando:** todas las decisiones de producto y seguridad tienen una
respuesta explícita.

### Etapa 1: proteger la sincronización existente

**Resultado esperado:** la nube actual se vuelve segura ante dos dispositivos
escribiendo casi al mismo tiempo.

Esta etapa debería publicarse antes de cualquier función multiusuario.

- Crear pruebas que intenten reproducir las dos carreras detectadas.
- Dejar de reemplazar directamente la única versión guardada.
- Guardar cada cambio como una nueva versión cifrada.
- Hacer que el servidor compare qué versión conocía el dispositivo.
- Corregir el orden de descarga para que una escritura tardía no quede saltada.
- Separar llaves y progreso de sincronización por cuenta.
- Impedir que iniciar sesión con otra cuenta suba notas de la cuenta anterior.
- Incluir los cambios que todavía están terminando de guardarse localmente en la
  decisión de conflicto.
- Probar el recorrido contra un Supabase real, no solo contra imitaciones en
  memoria.

**Se termina cuando:** dos dispositivos pueden subir el mismo bloque al mismo
tiempo y ambas versiones siguen disponibles.

### Etapa 2: preparar notas personales y compartidas

**Resultado esperado:** CopyNotes distingue con seguridad qué datos son
personales y cuáles pertenecen a una nota compartida.

- Crear el concepto interno de espacio personal y espacio compartido.
- Dar a cada nota compartida una clave de cifrado propia.
- Separar el contenido compartido de los comentarios y preferencias personales.
- Dar a cada espacio su propio progreso de subida y descarga.
- Cambiar el orden de bloques para que insertar uno no renumere a todos los
  demás.
- Dar a cada posición un desempate único para dos inserciones simultáneas.
- Preparar una migración que no cambie contenido ni identificadores existentes.
- Mantener búsqueda y Agenda funcionando con notas compartidas.
- Definir el comportamiento de respaldos y restauraciones.

Un respaldo debería incluir una copia legible de la nota compartida, pero nunca
permisos, enlaces o claves. Al restaurarla, debería convertirse en una copia
privada, no reconectarse automáticamente con otras personas.

**Se termina cuando:** las notas existentes continúan funcionando igual y una
nota puede convertirse internamente en compartida sin duplicarse ni perderse.

### Etapa 3: compartir y aceptar una nota

**Resultado esperado:** el dueño genera un enlace y otra cuenta puede abrir la
nota cifrada.

Antes de construir esta interfaz, se debería presentar para aprobación la
dirección visual de:

- Botón y ventana de compartir.
- Pantalla para aceptar una invitación.
- Avatares de colaboradores.
- Avisos de seguridad y vencimiento.

El desarrollo incluiría:

- Añadir en Supabase espacios compartidos, miembros, invitaciones, llaves
  cifradas y versiones de registros.
- Crear reglas del servidor que comprueben quién puede entrar y escribir.
- Generar un enlace de un solo uso y siete días de duración.
- Separar la parte que autoriza la invitación de la parte que abre la nota.
- Evitar que el secreto de cifrado llegue a Supabase.
- Retirar el secreto de la barra de direcciones después de aceptarlo.
- Avisar que cualquiera que tenga el enlace puede aceptarlo mientras siga
  vigente.
- Exigir una cuenta y una bóveda activa.
- Mostrar al dueño quién aceptó y cuántos lugares quedan.
- Bloquear invitaciones nuevas cuando haya tres miembros.

Primero se probaría la descarga de la nota en modo interno, antes de permitir
editarla.

**Se termina cuando:** una segunda cuenta puede leer la nota y una cuenta no
autorizada obtiene cero datos.

### Etapa 4: editar entre varias personas

**Resultado esperado:** dos o tres cuentas pueden modificar la nota sin perder
texto.

Al principio se usaría la sincronización lenta, sin WebSocket. Esto permite
comprobar que la información es correcta antes de hacerla rápida.

- Permitir editar título, formato, tareas, fechas y bloques.
- Permitir crear, mover, anidar, completar y borrar bloques.
- Mantener los comentarios privados separados por persona.
- Combinar automáticamente cambios hechos en bloques diferentes.
- Guardar todas las versiones cuando coinciden en el mismo bloque.
- Mostrar el nombre y la hora de cada versión.
- Permitir elegir cuál conservar.
- Hacer que una resolución llegue a todos los colaboradores.
- Mantener las ediciones realizadas sin conexión.
- Permitir que un colaborador abandone una nota.
- Reservar al dueño la eliminación completa y la administración de miembros.

**Se termina cuando:** dos cuentas pueden editar durante una sesión completa,
desconectarse, volver y terminar viendo el mismo contenido.

### Etapa 5: activar el WebSocket

**Resultado esperado:** los cambios aparecen en aproximadamente dos o tres
segundos.

- Reutilizar Supabase Realtime.
- Abrir un canal privado únicamente para la nota que está en pantalla.
- Mostrar quién está conectado.
- Mostrar en qué bloque está trabajando cada persona.
- Advertir antes de entrar en un bloque ocupado, sin bloquearlo de forma
  permanente.
- Enviar un solo aviso vacío después de un grupo de cambios.
- No transmitir texto por el WebSocket.
- No enviar cada tecla ni la posición exacta del cursor.
- Cerrar el canal al cambiar de nota, cerrar sesión o dejar la aplicación
  inactiva.
- Mantener intacto el cursor cuando llega un cambio remoto.

**Se termina cuando:** los cambios aparecen rápidamente, escribir no se corta y
el consumo de mensajes permanece dentro del presupuesto esperado.

### Etapa 6: retirar acceso y recuperarse de problemas

**Resultado esperado:** el dueño conserva el control y ningún fallo de conexión
hace desaparecer contenido.

- Permitir cancelar enlaces todavía no utilizados.
- Vencer automáticamente los enlaces después de siete días.
- Impedir que un enlace sea aceptado dos veces.
- Retirar inmediatamente el acceso al canal y al servidor.
- Cambiar la clave de la nota cuando se retira a alguien.
- Entregar la nueva clave únicamente a las personas que continúan.
- Rechazar cambios futuros enviados por alguien retirado.
- Conservar una copia recuperable cuando una edición offline choque con una
  eliminación.
- Explicar que CopyNotes no puede borrar archivos o exportaciones que el antiguo
  colaborador ya posea.

**Se termina cuando:** una persona retirada no puede leer ni enviar cambios
futuros, aunque conserve la clave anterior.

### Etapa 7: beta controlada

**Resultado esperado:** la función llega gradualmente a personas reales sin
comprometer notas ni generar una factura inesperada.

- Probar primero con dos cuentas controladas.
- Abrir después una beta pequeña por invitación.
- Mantener el límite de tres personas.
- Medir solamente conexiones, errores y cantidad de mensajes, nunca contenido.
- Configurar alertas de uso al 50%, 75% y 90% de los límites.
- Revisar navegador, PWA y escritorio.
- Probar Chromium y WebKit.
- Completar una revisión de accesibilidad y pulido visual.
- Crear un tema nuevo de la guía para explicar cómo compartir notas.
- Actualizar la guía de nube y privacidad en el mismo cambio que habilite la
  función.
- Mantener la palabra "beta".
- No prometer públicamente "conocimiento cero" antes de una auditoría
  independiente.

**Se termina cuando:** la beta funciona sin pérdida silenciosa de texto y se
conoce su consumo real.

## Recorrido propuesto para una invitación

1. El dueño toca **Compartir**.
2. CopyNotes crea una clave exclusiva para esa nota si todavía no existe.
3. CopyNotes genera un enlace privado de un solo uso.
4. El dueño copia y envía el enlace por el medio que prefiera.
5. La otra persona abre el enlace e inicia sesión si hace falta.
6. La pantalla explica quién comparte la nota y qué podrá hacer.
7. Al aceptar, el dispositivo obtiene la clave sin revelarla al servidor.
8. El enlace queda consumido y deja de funcionar.
9. La nota aparece en **Compartidas conmigo**.
10. Desde entonces funciona sin conexión y sincroniza al volver.

## Recorrido propuesto al coincidir en un bloque

1. Una persona entra en un bloque.
2. Los demás ven una indicación discreta con su nombre.
3. Otra persona todavía puede decidir editar ese bloque.
4. Si ambas lo cambian, ninguna versión reemplaza silenciosamente a la otra.
5. El bloque muestra un aviso con todas las versiones disponibles.
6. Cualquier editor puede elegir cuál conservar.
7. La elección se convierte en una nueva versión y llega a todos.

No se intentaría combinar automáticamente palabras dentro del bloque en esta
primera versión.

## Pruebas obligatorias

Antes de habilitar la beta se debería comprobar:

- Dos personas editan bloques diferentes simultáneamente.
- Dos y tres personas editan el mismo bloque.
- Ambas suben antes de descargar lo de la otra.
- Llega un cambio durante el medio segundo en que termina un guardado local.
- Una persona trabaja sin conexión y vuelve después.
- Dos personas insertan o mueven bloques en el mismo lugar.
- Una persona borra mientras otra edita.
- Se crea, mueve o borra una jerarquía de bloques completa.
- Una invitación vencida, cancelada o usada no vuelve a funcionar.
- Una cuenta no autorizada no puede leer, escribir ni ver presencia.
- Una frase conocida no aparece en la información almacenada por Supabase.
- Cambiar de cuenta en un dispositivo no mezcla datos.
- Retirar a alguien bloquea sus cambios futuros.
- Restaurar un respaldo no recupera permisos ni secretos.
- Deshacer una acción propia no borra silenciosamente una edición remota.
- Los flujos existentes de escritura, nube, agentes, búsqueda, Agenda y respaldo
  continúan funcionando.

Las pruebas más importantes deben usar dos o tres sesiones de navegador
realmente separadas, como si fueran personas distintas. No alcanza con insertar
directamente datos preparados en la base local.

## Criterios para considerar una beta

La beta no debería abrirse hasta cumplir todo esto:

- No queda ningún camino conocido que descarte texto silenciosamente.
- Todas las versiones simultáneas quedan recuperables.
- El servidor no contiene texto reconocible.
- Una persona ajena obtiene cero registros.
- Los cambios normales aparecen en dos o tres segundos.
- El editor no pierde el cursor.
- La aplicación sigue funcionando sin conexión.
- Los comentarios privados no llegan a otros colaboradores.
- Las carpetas, etiquetas y agentes continúan siendo personales.
- El consumo proyectado cabe dentro del presupuesto acordado.
- La guía explica claramente qué se comparte y qué no.

## Riesgos principales

### Pérdida de versiones

Es el riesgo más grave. Se reduce guardando versiones antes de elegir cuál queda
y probando escrituras verdaderamente simultáneas.

### Mezcla de cuentas

El estado actual de sincronización usa una sola bóveda y cursores por
dispositivo. Antes de colaborar, todo debe quedar ligado explícitamente a la
cuenta y al espacio correctos.

### Orden y jerarquía

Hoy mover o insertar bloques puede renumerar varios hermanos. Con dos personas,
eso generaría conflictos innecesarios. Se necesitan posiciones estables que no
obliguen a reescribir toda la lista.

### Retiro de acceso

Retirar a alguien impide cambios futuros, pero nunca puede borrar una copia que
ya salió del servidor hacia su dispositivo. La interfaz debe explicarlo sin
prometer algo imposible.

### Costo inesperado

Se reduce abriendo el canal solo para la nota visible, agrupando cambios, evitando
mensajes por tecla, limitando la beta y configurando alertas tempranas.

### Complejidad del editor

La colaboración por bloques conserva el editor actual. Si más adelante se pide
escribir dentro de la misma frase al mismo tiempo, habría que revisar el editor
y evaluar una tecnología especializada como Yjs. Eso sería otro proyecto.

## Tamaño estimado

Es una función mediana-grande, pero no requiere rehacer todo el editor.

La propuesta se podría dividir en aproximadamente 12 a 16 entregas pequeñas.
Las primeras serían poco visibles porque protegen la información. El botón
**Compartir** no debería mostrarse a usuarios reales hasta completar las etapas
de seguridad, edición y tiempo real.

El orden importante es:

1. Evitar pérdida de texto.
2. Separar correctamente los datos.
3. Probar cifrado y permisos.
4. Permitir editar.
5. Hacerlo instantáneo con WebSocket.
6. Abrir la beta gradualmente.

No conviene fijar una fecha antes de completar la prueba de seguridad de la
sincronización actual, porque su resultado puede cambiar el tamaño de la primera
etapa.

## Posible estructura técnica

Esta sección usa nombres provisionales para que una futura especificación tenga
un punto de partida. No son decisiones aprobadas.

Supabase podría incorporar:

- Espacios personales y compartidos.
- Miembros y permisos por espacio.
- Invitaciones de un solo uso.
- Copias cifradas de la clave de cada nota para cada miembro.
- Un historial de versiones cifradas por registro.
- Una referencia a la versión vigente de cada registro.
- Un orden de descarga que no pueda saltar confirmaciones tardías.

La base local podría incorporar:

- Identificador del espacio al que pertenece cada nota o bloque.
- Progreso de sincronización por espacio.
- Preferencias personales separadas del contenido compartido.
- Posiciones estables para los bloques.
- Conflictos capaces de conservar más de una versión remota.

El servidor seguiría viendo algunos datos inevitables:

- Identidad de las cuentas.
- Quién comparte con quién.
- Cantidad aproximada de registros.
- Tamaños y horarios de sincronización.
- Presencia mientras una nota está abierta.

No debería ver:

- Título de la nota.
- Texto o formato.
- Comentarios privados.
- Fechas, tareas o jerarquía.
- Claves capaces de descifrar el contenido.

## Documentación que correspondería si se aprueba

Solo después de aprobar esta propuesta y comenzar la implementación se debería:

- Crear una especificación numerada para la colaboración multiusuario.
- Actualizar `AGENT.md` con la nueva dirección aprobada.
- Actualizar las especificaciones de nube que hoy excluyen colaboración.
- Crear `docs/guia/19-compartir-notas.md` cuando exista comportamiento visible.
- Actualizar `docs/guia-de-uso.md` y su fecha.
- Actualizar `docs/guia/18-nube.md` con el comportamiento real.
- Documentar las migraciones y nuevas reglas de Supabase.

Nada de esa lista corresponde mientras este documento continúe en estado de
propuesta en revisión.

## Fuentes de precios y alternativas

- Supabase Pricing: <https://supabase.com/pricing>
- Supabase Realtime Messages:
  <https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages>
- Supabase Realtime Limits:
  <https://supabase.com/docs/guides/realtime/quotas>
- Liveblocks Pricing: <https://liveblocks.io/pricing>
- Liveblocks Yjs:
  <https://liveblocks.io/docs/api-reference/liveblocks-yjs>
- Cloudflare Durable Objects Pricing:
  <https://developers.cloudflare.com/durable-objects/platform/pricing/>
- Yjs WebSocket Provider:
  <https://docs.yjs.dev/ecosystem/connection-provider/y-websocket>

## Próximo paso posible

Revisar esta propuesta como documento de producto y decidir una de estas
opciones:

1. Aprobarla y convertirla en una especificación formal.
2. Ajustar alcance, privacidad, permisos o límites y volver a revisarla.
3. Mantenerla como investigación futura sin incorporarla al roadmap.

Mientras conserve el estado actual, no hay trabajo de implementación pendiente
derivado de este documento.
