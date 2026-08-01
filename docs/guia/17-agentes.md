# Agentes (beta)

CopyNotes puede dejar que un **agente** (un asistente de IA que corre en tu
computadora) te ayude con las **tareas** de una nota. Es opcional y arranca
apagado: el agente no ve nada hasta que vos abrís la puerta.

## Hacer una nota visible para agentes

En el encabezado de la nota, al lado del botón de etiquetar, hay un botón con un
robot 🤖 **"Visible para agentes"**. Si lo activás, el agente puede leer esa nota
para ayudarte con sus tareas. Ninguna nota sin este botón activado sale de la app.

## Qué lee el agente (y qué NO)

Cuando una nota es visible, el agente ve:

- El **título** de la nota y **en qué carpeta** está.
- El **texto** de la nota como **contexto**: lo que escribís ahí le sirve para
  entender de qué se tratan las tareas. Si querés darle instrucciones, escribilas
  en la nota como texto normal.
- Solo las **tareas pendientes**. Las que ya marcaste hechas **no** las ve (así
  no gasta espacio en cosas terminadas).

Lo que el agente **nunca** ve:

- Los **comentarios** de un renglón (el texto que agregás con el botón de
  comentario, debajo de la tarea): son tuyos, quedan siempre privados.
- Las tareas ya completadas ni el historial completo (eso lo mira solo si lo
  necesita, tarea por tarea).

## Qué puede hacer el agente

- **Encontrar y abrir una nota por su nombre, solo.** Le podés hablar natural
  ("entrá a la nota Compras y hacé lo anotado") y el agente la busca y la lee sin
  que tengas que darle ningún código ni pegarle nada.
- Leer lo de arriba, de las notas que marcaste como visibles.
- Crear tareas y marcarlas como hechas, dejando siempre una línea en la
  **bitácora** (quién hizo qué y cuándo). Si marca como hecha una tarea que
  tiene subtareas, se tachan también las de adentro — igual que cuando la tachás
  vos en la app.
- Dejarte una nota "IA" en una tarea o pedirle su historial **aunque la acabe de
  completar**: completar una tarea no la hace inalcanzable para el agente.

No puede borrar, exportar ni reordenar, y no reescribe el texto de tus notas.

## Cómo se ve lo que el agente te escribe

Cuando el agente deja una nota sobre una tarea (por ejemplo "empecé por el
build" o algo que quiere aclararte), aparece **debajo de esa tarea en color
ámbar y en cursiva, con una marca "IA"**, en letra más chica y pegada a la
tarea, igual que tus comentarios. Así siempre distinguís de un vistazo
lo que escribió la IA de tu propio texto y de tus comentarios, que quedan
intactos.

## Ver la actividad y pedir que lo rehaga

En **Configuración** (engranaje ⚙️) hay una sección **Agentes** con la lista de
lo último que hizo el agente. Si marcó una tarea como hecha pero el resultado
no te convenció, en esa misma línea aparece un botón **"Rehacer"**: tocalo,
escribí una instrucción (por ejemplo "Rehacer: agregá fuentes") y tocá
**"Enviar"**. Esto destilda la tarea al toque (si la nota está abierta, la vas
a ver destildarse ahí mismo, sin recargar) y deja tu instrucción anotada para
que el agente la lea como un pedido de rehacer.

Las dos cosas —destildar y anotar tu pedido— van **juntas o no van**: nunca te
vas a encontrar una tarea que se destildó sola sin ninguna instrucción que
explique por qué. Si algo sale mal al guardar, no pasa ninguna de las dos, te lo
avisa ahí mismo y el texto que escribiste queda donde estaba para reintentar.

## La lista del agente siempre está al día

Lo que ve el agente se actualiza solo ante **cualquier** cambio: crear, completar,
reabrir, editar o borrar una tarea, borrar una nota o cambiarle el título. No
tenés que hacer nada especial. Hay una pequeña espera de **medio segundo** para
no rehacer la lista con cada tecla mientras escribís: cuando frenás, se pone al
día sola. La única excepción es el interruptor **"Visible para agentes"**: prenderlo
o apagarlo se guarda **al instante**, sin esperar nada. Apagarlo saca las tareas
de esa nota de la vista del agente en el mismo momento en que hacés clic: no hay
ninguna ventanita en la que el agente todavía la pueda tocar.

Y si **cerrás la app** justo después, CopyNotes no se va sin dejar el archivo que
lee el agente al día. La ventana tarda un instante más en cerrarse, y a cambio
nunca queda en el disco una lista que todavía nombre una nota que acabás de
ocultar.

## Tus propias acciones también quedan anotadas

Cuando **vos** marcás una tarea como hecha, la reabrís o creás una tarea, eso
también aparece en **Configuración › Agentes** como **"Vos…"** (por ejemplo "Vos
marcaste hecha"). Así el agente distingue lo que hiciste vos de lo que hizo él, y
la actividad cuenta la historia completa de cada tarea. Escribir el texto de una
tarea no genera una línea (sería demasiado ruido); sí actualiza lo que el agente
lee.

## Solo en la app de escritorio

Esta conexión funciona en la app de escritorio (Mac). En el navegador todavía no.
Ojo con la diferencia: **la nube sí anda en el navegador, los agentes no**. Si
usás CopyNotes en el navegador vas a tener tus notas sincronizadas, pero ningún
agente va a poder leerlas desde ahí.

**¿Dónde consigo la app de escritorio?** Entrando desde una computadora, en
**Configuración** (engranaje ⚙️) › **Agentes** hay un enlace **"Descargar la app
de escritorio"**. También aparece al entrar, en una tarjetita abajo a la
derecha que podés cerrar. No confundas esto con "instalar la página como app"
que ofrecen algunos navegadores: eso te deja un ícono que abre la misma versión
web, y los agentes **no** pueden conectarse ahí.

## Conectar un agente por MCP (escritorio)

Además de "Visible para agentes", CopyNotes puede conectarse directamente con
un programa de agente que corre en tu computadora (por ejemplo Claude Code,
OpenCode o Cursor), usando un protocolo llamado **MCP**. Esto también funciona
**solo en la app de escritorio**.

Lo bueno: CopyNotes ya trae adentro todo lo necesario y **rellena las rutas por
vos**. No tenés que buscar ni pegar ninguna carpeta a mano.

En **Configuración** (engranaje ⚙️) › **Agentes**, en la app de escritorio, vas
a ver la sección **"Conectar un agente (MCP)"** con una opción lista para cada
programa. Elegí la del que uses:

- **Claude Code:** copiá el comando (icono de copiar, dos hojas → tilde ✓) y
  pegalo en tu terminal **una sola vez**.
- **OpenCode:** copiá el bloque y pegalo en tu archivo
  `~/.config/opencode/opencode.json`.
- **Cursor:** tocá el botón **"Añadir a Cursor"** — se abre Cursor y lo agrega
  solo. Si preferís, abajo tenés el JSON para copiar y pegar a mano en
  `~/.cursor/mcp.json`.

**Importante: con CopyNotes cerrada las cosas cambian.** El agente todavía puede
**leer** lo último que la app le dejó anotado, pero eso puede haber quedado
viejo. Si pasó más de un día sin abrir CopyNotes, el agente te avisa antes de
contestarte: *"CopyNotes no se abrió desde hace X días: lo que sigue puede estar
desactualizado"*. En cambio, lo que le pidas **cambiar** (crear una tarea,
marcarla hecha, dejar un comentario) **queda en espera** y se aplica solo cuando
volvés a abrir la app — es la app la que vigila la carpeta del buzón y contesta.
Nada se pierde: espera ahí hasta que abras.

Cuando abrís, esos pedidos se aplican solos y te aparece un cartel contándotelo:
*"Mientras CopyNotes estaba cerrada, un agente hizo 2 cambios"*. Si querés ver
qué fue exactamente, cada tarea guarda su historia debajo, y en **Ajustes** está
la lista de lo último que pasó. Un pedido que quedó esperando **más de una
semana** se descarta solo: a esa altura ya no es una orden pendiente, y aplicarla
de golpe sería más sorpresa que ayuda.

### ¿Hay un agente trabajando?

Arriba de las opciones, CopyNotes te dice qué está pasando:

- **"Un agente está usando CopyNotes"** con hace cuánto: hubo movimiento en los
  últimos minutos.
- **"Sin actividad de agentes — la última, hace X"**: hubo un agente antes, pero
  hace rato que no toca nada.
- **"Ningún agente se conectó todavía"**: nunca hubo uno.

CopyNotes te cuenta **actividad**, no si el programa del agente sigue abierto.
Eso no lo puede saber: solo se entera cuando el agente le pide o le cambia algo.
Por eso, si dejás Claude Code abierto sin pedirle nada, después de un rato el
cartel va a decir que no hay actividad — y está bien dicho.

### Qué puede hacer el agente conectado así

Una vez conectado, el agente puede leer las notas que marcaste como visibles
(título, carpeta, el texto como contexto y las tareas pendientes), crear tareas
nuevas y marcarlas como hechas — siempre dejando una línea en la bitácora, igual
que se explica más arriba. No ve tus comentarios ni las tareas ya hechas, no
borra, no exporta ni reordena.

## Agentes y nube

Si además activaste la nube (ver **[La nube](18-nube.md)**), las dos cosas
conviven así:

- **Lo que hace el agente se sincroniza.** Una tarea que te creó o completó
  viaja a tus otros dispositivos igual que si la hubieras escrito vos. No tenés
  que hacer nada.
- **Lo que hiciste en otra máquina le llega al agente** cuando abrís CopyNotes
  acá. Con la app cerrada, el agente sigue leyendo la última copia que le dejó
  esta computadora, aunque en la otra hayas escrito después.
- **La marca "Visible para agentes" viaja con la nota.** Si la prendiste en una
  computadora, la nota también está visible para el agente de la otra.
- **Permitir agentes no es lo mismo que permitir la nube.** Son dos permisos
  distintos: si nunca tocaste **"Permitir y subir"**, nada sale de tu
  dispositivo, ni siquiera lo que escribió el agente.

### La copia que lee el agente no está cifrada

Para que el agente pueda leer tus notas **con CopyNotes cerrada**, la app le
deja una copia en un archivo de tu disco. Esa copia **no está cifrada**: la
protegen los permisos del archivo (solo tu usuario de la computadora puede
abrirlo), no la bóveda.

Qué significa en la práctica:

- Solo contiene las notas que marcaste **visibles para agentes**. El resto no
  está ahí.
- Los **comentarios de tus renglones nunca** se copian a ese archivo, ni siquiera
  de las notas visibles.
- Lo que se sube a la nube sí va cifrado, siempre. Esto es una copia **local**,
  en tu máquina, no en el servidor.
- Si no querés que exista, no marques ninguna nota como visible para agentes.

Es el precio de que el agente funcione sin tener la app abierta. Preferimos
decirlo antes que dejarlo escondido.
