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

- Leer lo de arriba, de las notas que marcaste como visibles.
- Crear tareas y marcarlas como hechas, dejando siempre una línea en la
  **bitácora** (quién hizo qué y cuándo).

No puede borrar, exportar ni reordenar, y no reescribe el texto de tus notas.

## Cómo se ve lo que el agente te escribe

Cuando el agente deja una nota sobre una tarea (por ejemplo "empecé por el
build" o algo que quiere aclararte), aparece **debajo de esa tarea en color
ámbar y en cursiva, con una marca "IA"**. Así siempre distinguís de un vistazo
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

## La lista del agente siempre está al día

Lo que ve el agente se actualiza solo ante **cualquier** cambio: crear, completar,
reabrir, editar o borrar una tarea, borrar una nota o cambiarle el título. No
tenés que hacer nada especial. Hay una pequeña espera de **medio segundo** para
no rehacer la lista con cada tecla mientras escribís: cuando frenás, se pone al
día sola. La única excepción es **ocultar una nota** (apagar "Visible para
agentes"): eso saca sus tareas de la vista del agente **al instante**, sin
esperar, para que nada quede expuesto ni un momento.

## Tus propias acciones también quedan anotadas

Cuando **vos** marcás una tarea como hecha, la reabrís o creás una tarea, eso
también aparece en **Configuración › Agentes** como **"Vos…"** (por ejemplo "Vos
marcaste hecha"). Así el agente distingue lo que hiciste vos de lo que hizo él, y
la actividad cuenta la historia completa de cada tarea. Escribir el texto de una
tarea no genera una línea (sería demasiado ruido); sí actualiza lo que el agente
lee.

## Solo en la app de escritorio

Esta conexión funciona en la app de escritorio (Mac). En el navegador todavía no.

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

**Importante:** el agente solo funciona con **CopyNotes abierta**. Si cerrás la
app, deja de leer y escribir hasta que la vuelvas a abrir (es la app la que
vigila la carpeta del buzón y contesta).

### ¿Se conectó?

Arriba de las opciones, CopyNotes te dice si un agente ya está conectado:
**"Un agente se conectó"** con hace cuánto lo hizo. Si todavía no conectaste
ninguno, dice **"Ningún agente conectado todavía"**.

### Qué puede hacer el agente conectado así

Una vez conectado, el agente puede leer las notas que marcaste como visibles
(título, carpeta, el texto como contexto y las tareas pendientes), crear tareas
nuevas y marcarlas como hechas — siempre dejando una línea en la bitácora, igual
que se explica más arriba. No ve tus comentarios ni las tareas ya hechas, no
borra, no exporta ni reordena.
