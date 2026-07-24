# Agentes (beta)

CopyNotes puede dejar que un **agente** (un asistente de IA que corre en tu
computadora) te ayude con las **tareas** de una nota. Es opcional y arranca
apagado: el agente no ve nada hasta que vos abrís la puerta.

## Hacer una nota visible para agentes

En el encabezado de la nota, al lado del botón de etiquetar, hay un botón con un
robot 🤖 **"Visible para agentes"**. Si lo activás, el agente puede leer las
**tareas** de esa nota (los renglones tipo tarea) y su historial. **Nunca** ve
el resto del texto de la nota, y ninguna nota sin este botón activado sale de la
app.

## Qué puede hacer el agente

- Leer las tareas de las notas que marcaste como visibles.
- Crear tareas y marcarlas como hechas, dejando siempre una línea en la
  **bitácora** (quién hizo qué y cuándo).

No puede borrar, exportar ni reordenar, y no escribe en el texto de tus notas.

## Ver la actividad y pedir que lo rehaga

En **Configuración** (engranaje ⚙️) hay una sección **Agentes** con la lista de
lo último que hizo el agente. Si marcó una tarea como hecha pero el resultado
no te convenció, en esa misma línea aparece un botón **"Rehacer"**: tocalo,
escribí una instrucción (por ejemplo "Rehacer: agregá fuentes") y tocá
**"Enviar"**. Esto destilda la tarea al toque (si la nota está abierta, la vas
a ver destildarse ahí mismo, sin recargar) y deja tu instrucción anotada para
que el agente la lea como un pedido de rehacer.

## Solo en la app de escritorio

Esta conexión funciona en la app de escritorio (Mac). En el navegador todavía no.

## Conectar un agente por MCP (escritorio)

Además de "Visible para agentes", CopyNotes puede conectarse directamente con
un programa de agente que corre en tu computadora (por ejemplo Claude
Desktop u OpenCode), usando un protocolo llamado **MCP**. Esto también
funciona **solo en la app de escritorio**.

En **Configuración** (engranaje ⚙️) › **Agentes**, si estás usando la app de
escritorio, vas a ver una sección **"Conectar un agente (MCP)"** con dos
cosas:

- La **carpeta del buzón**: una ubicación en tu computadora que CopyNotes usa
  para intercambiar mensajes con el agente. Tiene un botón para copiarla.
- Un **texto de configuración** (un bloque de código) con todo lo necesario
  para que un cliente MCP se conecte a CopyNotes. También tiene su botón para
  copiarlo.

### Pasos para conectar

1. Instalá el programa cliente que vayas a usar (Claude Desktop, OpenCode, u
   otro que hable MCP).
2. En Configuración › Agentes, tocá el **icono de copiar** (dos hojas) que
   está junto al texto de configuración; muestra un instante una tilde ✓
   para confirmar.
3. Pegalo en el archivo de configuración de ese cliente, y reemplazá
   `<ruta-a-CopyNotes>` por la carpeta donde tenés el proyecto CopyNotes en
   tu computadora (la carpeta del buzón ya viene completa, no hace falta
   tocarla).
4. Dejá **CopyNotes abierto**: sin la app abierta, el agente no puede leer ni
   escribir nada, porque es la app la que vigila esa carpeta y contesta.

### Qué puede hacer el agente conectado así

Una vez conectado, el agente puede leer las **tareas** (y su bitácora) de las
notas que marcaste como visibles, crear tareas nuevas y marcarlas como
hechas — siempre dejando una línea en la bitácora, igual que se explica más
arriba. No ve el resto del texto de tus notas, no borra, no exporta ni
reordena.
