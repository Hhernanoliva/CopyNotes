# Revisión de los hallazgos del agente — 31 de julio de 2026

Otro agente dejó una lista de 14 problemas + una sección de pruebas. Esa lista es
**vieja**: se escribió antes de varias tandas de trabajo (Milestone S, spec 030
fases 0–3, empaquetado del servidor MCP). Este documento vuelve a mirar cada
punto contra el código de hoy y dice cuál sigue vivo y cuál ya está cerrado.

- **Verificado contra:** rama `main`, commit `e1b467e`.
- **Qué NO hace este documento:** arreglar nada. Solo separa lo real de lo viejo,
  para después armar un plan por cada cosa que quede.
- **Los números de línea de la lista original ya no sirven.** Las líneas que cito
  acá son las de hoy.

## Tabla rápida

| # | Tema | Veredicto |
| --- | --- | --- |
| 1 | El agente ve tareas viejas | ✅ **Ya arreglado** (queda una astilla, ver #7) |
| 2 | Apagar "Visible para agentes" tarda 500 ms | ⚠️ **Sigue vivo** |
| 3 | Una orden que dio "sin respuesta" se ejecuta después | 🟡 **Sigue vivo, pero ya avisado** |
| 4 | Rust da por procesada una orden antes de aplicarla | ⚠️ **Sigue vivo** |
| 5 | Tarea y registro antirrepetición no se guardan juntos | ⚠️ **Sigue vivo** |
| 6 | Un cambio de afuera pisa texto sin guardar | ✅ **Ya arreglado** |
| 7 | La capa de tareas no es la puerta única | 🟡 **Casi cerrado** (falta editar y borrar) |
| 8 | La app instalada no trae el servidor MCP | ✅ **Ya arreglado** (queda depender de Node) |
| 9 | "Un agente a la vez" no está aplicado de verdad | ⚠️ **Sigue vivo, y es a propósito** |
| 10 | El respaldo borra la bitácora | ✅ **Ya arreglado** |
| 11 | "Rehacer" son dos operaciones sueltas | ⚠️ **Sigue vivo** |
| 12 | La web muestra botones que ahí no funcionan | ⚠️ **Sigue vivo** |
| 13 | La promesa de privacidad es imprecisa | 🟡 **La guía ya está bien; la spec no** |
| 14 | Preparación para sincronizar | ✅ **Superado por la spec 030, ya en producción** |

---

## 1. El agente recibía tareas viejas — ✅ ya arreglado

**Decía:** crear, marcar o convertir tareas desde el editor no actualizaba
`export.json` (el archivo que lee el agente), así que el agente trabajaba con
una foto vieja.

**Hoy:** hay una red de seguridad en el almacenamiento. *Cualquier* escritura
sobre notas o renglones levanta la mano sola:

- `src/lib/storage/blocks.ts:53,64,114,137,145,160`
- `src/lib/storage/notes.ts:29,49,74`

Y el puente re-exporta cuando esa mano se levanta, juntando ráfagas en una sola
escritura 500 ms después de que dejás de teclear
(`src/lib/bridge/BridgeLifecycle.svelte:15-33`). El título de la nota entra por
`updateNote`, así que también se refresca.

**Conclusión:** el agente ya no ve tareas viejas. Nada que planificar acá.

## 2. Apagar "Visible para agentes" no revoca al instante — ⚠️ sigue vivo

**Qué encontré:** el botón apaga la visibilidad en pantalla al toque, pero el
cambio se guarda con el mismo retardo de 500 ms que el resto
(`src/lib/editor/Editor.svelte:528-548`, retardo en `:317-345`). Durante esa
ventanita, si llega una orden del agente, el portero lee la base de datos y
todavía ve la nota como visible → la deja pasar.

Segundo agujero: al cerrar la ventana, la app espera a que terminen las
escrituras a la base, pero **no** espera a que se reescriba `export.json`
(`src/lib/desktop/TauriLifecycle.svelte:13-47`). Podés cerrar con un archivo que
todavía nombra una nota que acabás de ocultar.

**Tamaño real:** ventana de 500 ms, y hace falta que el agente mande justo ahí.
Chico, pero es una promesa de privacidad, así que no lo bajaría de prioridad.

## 3. Una orden que dio "sin respuesta" puede ejecutarse mucho después — 🟡 sigue vivo, ya avisado

**Qué encontré:** con CopyNotes cerrada, la herramienta escribe el pedido, espera
10 segundos y contesta "sin confirmación" — pero **no borra el archivo**
(`mcp/lib/mailbox.js:127-149`). Cuando abrís CopyNotes, el barrido de arranque lo
levanta y lo aplica (`src-tauri/src/bridge.rs:136-147`).

**Lo que ya está puesto para tapar el daño:**

- El mensaje al modelo dice explícitamente *"La solicitud quedó en el buzón y se
  aplica una sola vez; NO la reenvíes"* (`mcp/lib/tools.js:58-63`).
- Si igual reenvía **dentro de 30 segundos**, reusa el mismo identificador y la
  app lo aplica una sola vez (`mcp/lib/mailbox.js:26-27,99-108`).

**Lo que queda destapado:** si el modelo reenvía **después** de esos 30 segundos,
saca identificador nuevo y aparecen dos tareas. Y la persona nunca se entera de
que una orden vieja quedó agendada: se le va a aparecer sola la próxima vez que
abra la app.

## 4. Rust marca una orden como hecha antes de saber si se aplicó — ⚠️ sigue vivo

**Qué encontré:** `src-tauri/src/bridge.rs:83-94`. El archivo del pedido se mueve
a `processed/` inmediatamente después de avisarle a la app, sin esperar respuesta.
Si la ventana se recarga o se cierra en ese instante, la orden se perdió y ya no
hay forma de recuperarla — el archivo ya no está en la bandeja de entrada.

**Tamaño real:** ventana muy chica (milisegundos), pero el resultado es silencioso:
el agente cree que pidió algo y nadie se entera de que se evaporó.

## 5. La tarea y el registro antirrepetición no se guardan juntos — ⚠️ sigue vivo

**Qué encontré:** `src/lib/bridge/ingest.ts:101-105`. Primero se aplica el cambio,
después se anota "esta orden ya la hice". Son dos pasos separados. Un cierre justo
en el medio deja la tarea creada sin la anotación → si el mismo pedido vuelve a
llegar, se aplica de nuevo.

Sí está resuelto el caso simultáneo: todos los ingresos pasan de a uno por una
misma fila (`ingest.ts:122-135`). Lo que no cubre es el corte de luz.

**Se cruza con el #4 y el #3:** los tres son la misma familia — "qué pasa si la
app muere en el medio de una orden del agente". Convendría planificarlos juntos.

## 6. Un cambio de afuera compite con texto sin guardar — ✅ ya arreglado

**Decía:** después de una acción del agente se reconstruía el editor entero, y el
editor viejo todavía estaba guardando → reaparecía texto viejo y se perdía el
deshacer.

**Hoy:** el cambio del agente ya no re-monta nada. Entra por `handleExternalChange`
(`src/routes/+page.svelte:331-341`), que recarga las listas laterales y le pide al
editor que se actualice **en el lugar**, respetando el renglón que estás
escribiendo. El re-montaje quedó reservado para importar un respaldo, donde no hay
nada que respetar (`+page.svelte:346-355`). El cableado está en
`+page.svelte:588`.

## 7. La capa de tareas como puerta única — 🟡 casi cerrado

**Ya no es cierto que la interfaz esquive la capa de tareas.** El editor la usa
para lo importante:

- marcar/desmarcar → `setTaskChecked` (`Editor.svelte:1214`)
- convertir un renglón en tarea → `convertToTask` (`:627, :989, :1411, :1844`)
- crear tarea → `createTask` (`:950, :1003`)
- la Agenda también → `AgendaPanel.svelte:47`

**Tampoco es cierto que el agente marque distinto que la persona.** `completeTask`
aplica la misma cascada padres/hijos que la interfaz, en una sola escritura
atómica (`src/lib/tasks/actions.ts:87-131`).

**Lo que sí queda abierto (y es chico):**

- **Editar el texto de una tarea** no pasa por la capa: el editor escribe el
  renglón directo. Existe `editTask` (`actions.ts:219-224`) y **no lo llama nadie**
  — es código muerto. Consecuencia: la bitácora nunca registra una edición.
- **Borrar una tarea** tampoco: va por `softDeleteBlock` derecho
  (`Editor.svelte:1091,1114,1122,1135,1354,1672`). La bitácora nunca registra un
  borrado. Para el agente, la tarea simplemente desaparece sin explicación.

Decisión a tomar en el plan: ¿queremos que editar y borrar dejen huella en la
bitácora, o aceptamos que la bitácora solo cuente nacimientos y cierres?

## 8. La app instalada no traía el servidor MCP — ✅ ya arreglado

**Hoy:** `src-tauri/tauri.conf.json:26-32` empaqueta `mcp/server.js`, `mcp/lib` y
`mcp/node_modules` dentro de la app. Rust resuelve la ruta empaquetada y solo cae
a la del repositorio si no la encuentra (`bridge.rs:191-201`), y Ajustes pre-llena
esa ruta en la configuración de cada cliente (`SettingsDialog.svelte:8`).

**Lo único que queda:** la configuración sigue siendo `node <ruta>`
(`src/lib/bridge/mcp-config.js:30-32,38,54`), así que **la persona necesita tener
Node instalado**. Ya no necesita el repositorio ni `pnpm install`, que era lo
grave. Si querés cerrar también eso, el camino es empaquetar el runtime — eso es
un proyecto aparte, no un arreglo.

## 9. "Un agente a la vez" no está aplicado de verdad — ⚠️ sigue vivo, y es a propósito

**Confirmado:** no hay emparejamiento, ni credencial, ni cerrojo exclusivo, ni
botón para desconectar. Cualquier proceso que conozca la carpeta del buzón puede
escribir ahí, y todos entran como el mismo `Agente local`
(`src/lib/bridge/ingest.ts:29-33`, `src/lib/storage/agents.ts`).

**Pero la spec lo declara fuera de alcance a propósito:**
`specs/028-agent-beta-local-mcp.md` dice explícitamente *"No full agent registry /
sessions / per-agent pause-resume-revoke yet — those arrive when a second agent
does"*.

**Mitigación que sí existe:** la carpeta es 0700 y los archivos 0600
(`src-tauri/src/bridge.rs:13-20`), o sea que otro usuario de la misma máquina no
la puede leer. La superficie real es "otro programa corriendo como vos".

**Recomendación:** no es un bug, es una deuda declarada. Se planifica cuando
aparezca el segundo agente. Lo único que yo adelantaría es el **botón de
desconectar** — es barato y da tranquilidad.

## 10. El respaldo borraba la bitácora — ✅ ya arreglado

`src/lib/storage/backup.ts:13-22`: `activity` está en la lista de tablas que
entran al respaldo, con el comentario de por qué se agregó (spec 030 fase 0).
Exportar e importar ya no borra el historial.

## 11. "Rehacer" no es una sola operación — ⚠️ sigue vivo

**Qué encontré:** `src/lib/components/SettingsDialog.svelte:219-228`. Primero
`reopenTask` (destildar), después `addTaskNote` (guardar la instrucción). Dos
escrituras separadas. Si la segunda falla, queda una tarea reabierta sin ningún
pedido escrito — la persona ve la tarea abierta de nuevo y no sabe por qué.

**El segundo pedazo del hallazgo también es cierto:** MCP no le avisa al modelo.
El agente se entera solo si vuelve a mirar. Eso es del diseño actual del puente
(no hay canal de aviso app → agente), no un descuido puntual.

## 12. La web muestra controles que ahí no pueden funcionar — ⚠️ sigue vivo

**Confirmado:** el botón del robot ("Visible para agentes") se dibuja siempre,
sin preguntar si estamos en escritorio (`src/lib/editor/Editor.svelte:1918-1930`).
En el navegador se puede prender y apagar, se guarda… y no hace nada, porque no
hay puente. La prueba `e2e/agent-visibility.spec.ts:3-21` corre en Chromium y
**fija ese comportamiento como correcto**.

Contradice a la propia spec 028, que dice *"the browser build has no agent surface
at all"*.

Nota a favor de dejarlo: la marca **sí viaja** por la nube a la máquina de
escritorio (la spec lo dice unas líneas antes), así que prenderla desde el
navegador no es del todo inútil. Lo que falta es que el botón lo explique, no
necesariamente que desaparezca. **Decisión de producto, no arreglo obvio.**

## 13. La promesa de privacidad — 🟡 la guía ya está bien, la spec no

**La guía ya es honesta.** `docs/guia/17-agentes.md:120,161,171` avisa
explícitamente que con CopyNotes cerrada el agente sigue leyendo la última copia
que le dejó la app. Ese pedazo del hallazgo está viejo.

**Lo que sí quedó desactualizado es la spec.**
`specs/028-agent-beta-local-mcp.md:14` todavía dice *"no personal data leaving the
device"*. Eso es falso tal cual está escrito: el buzón es local, pero Claude
Desktop u OpenCode mandan el contenido a un modelo remoto. CopyNotes no puede
garantizar eso — solo puede garantizar que *ella* no lo manda.

Es texto interno, no lo ve la persona usuaria. Arreglo de una línea, sin código.

## 14. Preparación para sincronizar — ✅ superado

El hallazgo apuntaba a `specs/029-cloud-sync-path.md:80-108`. Ese criterio ya está
tachado en la propia spec: *"Superseded by 030 (2026-07-27): false as written"*,
y la spec 030 fase 1 lo reemplazó por un contador monótono que **ya está en
producción**. Las fases 2 y 3 (nube, cifrado, conflictos) también.

Lo único que sobrevive es que `agentVisible` es un sí/no por nota, no un permiso
por agente o por dispositivo — que es exactamente el punto #9, y también está
declarado fuera de alcance.

---

## Pruebas

| Afirmación | Veredicto |
| --- | --- |
| "No hay pruebas Rust" | ❌ **Falso hoy.** Hay una: `src-tauri/src/bridge.rs:217-251` (el barrido de archivos viejos). Sigue siendo *casi* nada. |
| "`tauri.test.ts` reconoce que no prueba el camino real" | ✅ **Cierto.** El archivo lo dice en su propio comentario: solo verifica que fuera de escritorio no haga nada. |
| "El E2E de Rehacer mete datos directo en la base" | ✅ **Cierto** (`e2e/agent-redo.spec.ts`). Salta MCP y salta Rust. |
| "No existe prueba cliente MCP → buzón → Tauri → base → interfaz" | ✅ **Cierto.** No hay ninguna prueba que recorra el camino completo. |
| "El recorrido manual con la .app sigue pendiente" | ✅ **Cierto** según las memorias del proyecto. |
| "`pnpm test` no corre MCP, Cargo, Tauri ni Playwright" | ✅ **Cierto.** `package.json:16` — `test` es solo `vitest`. Hay que acordarse de correr `test:e2e`, `cargo test` y las de `mcp/` a mano. |

**Traducción:** el pedazo del puente que corre en tu Mac de verdad —Rust moviendo
archivos, la app recibiendo el aviso— es justo el que ninguna prueba mira. Los
puntos 3, 4 y 5 viven todos ahí. No es casualidad.

---

## Lo que yo pondría en la lista de planes

Ordenado por lo que más duele, no por el orden de la lista original.

1. **La familia "la app muere en el medio" (#4 + #5 + #3).** Los tres son el mismo
   problema visto desde tres archivos: una orden puede perderse, repetirse o
   aparecer tarde. Un solo plan, un solo diseño: que la orden se dé por procesada
   recién cuando la app confirma, y que la tarea y su anotación se guarden juntas.
2. **Revocar al instante (#2).** Promesa de privacidad. El arreglo suena chico:
   guardar la visibilidad sin retardo y esperar el archivo antes de cerrar.
3. **"Rehacer" en una sola operación (#11).** Chico y acotado.
4. **La prueba que falta (recorrido completo del puente).** Es lo que va a dar
   confianza para tocar los puntos 3/4/5 sin miedo.
5. **Botón de desconectar al agente (#9 parcial).** Barato, tranquiliza, y no
   requiere inventar el sistema de credenciales completo.
6. **Decidir qué hace el robot en el navegador (#12).** Producto, no código:
   ¿lo escondemos o lo explicamos?
7. **Editar y borrar tareas por la capa de tareas (#7).** Depende de una decisión:
   ¿la bitácora tiene que contar ediciones y borrados?
8. **Arreglar el texto de la spec 028 (#13).** Una línea, sin código.

Fuera de la lista por ahora: #1, #6, #8, #10, #14 (ya cerrados) y el sistema de
credenciales por agente de #9 (fuera de alcance declarado hasta que exista un
segundo agente).
