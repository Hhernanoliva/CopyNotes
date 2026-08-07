# Revisión de los hallazgos del agente — 5 de agosto de 2026

Otro agente dejó un análisis del código: 12 hallazgos "altos", una lista de otros
riesgos, un informe de dependencias, código sin uso y duplicación. Este documento
vuelve a mirar cada punto contra el código de hoy.

- **Verificado contra:** rama `main`, commit `a0b202a`.
- **Baseline:** 948 tests unitarios en verde.
- **Parte de la lista es vieja.** Cinco de los doce altos se cerraron en la tanda
  del gate de dos aparatos (2 y 3 de agosto), después de que ese análisis se
  escribiera. Los números de línea del informe original ya no sirven; los que
  cito acá son los de hoy.
- **Qué hace este documento:** separa lo real de lo viejo, y para cada cosa que
  quede viva deja escrito el arreglo propuesto.
- **Qué NO hace:** arreglar nada. Se va tachando a medida que cerramos temas.

## Los cuatro estados

Uso cuatro y no dos, porque hay cosas que **leí** y cosas que **deduje**:

| Estado | Significa |
| --- | --- |
| ✅ **Arreglado** | Leí el código y vi el arreglo. Cerrado. |
| ❌ **Vivo — confirmado** | Leí el código y el agujero está ahí. |
| 🔍 **Vivo — falta cavar** | La lógica dice que está roto, pero no lo reproduje. Necesita una prueba que falle **antes** de tocar nada. |
| 🚫 **Falso** | El reclamo no aplica al código de hoy. |

---

## Tabla rápida

| # | Tema | Veredicto |
| --- | --- | --- |
| 1 | La sincronización se saltea cambios para siempre | ✅ **Arreglado**, con un techo anotado |
| 2 | Dos ediciones distintas parecen la misma versión | ✅ **Arreglado** (5/8) |
| 3 | Llave y permisos de la cuenta anterior | ✅ **Arreglado** |
| 4 | Se puede escribir sin pasar por `push_records` | ✅ **Arreglado y verificado** (6/8) |
| 5 | Dos aparatos crean dos bóvedas | ✅ **Arreglado y verificado** (6/8) |
| 6 | Cambiar el tipo de un grupo borra el texto recién escrito | ✅ **Arreglado** |
| 7 | Deshacer pisa un cambio del otro aparato | ✅ **Arreglado** |
| 8 | Dos pestañas se pisan en silencio | ✅ **Arreglado** (6/8), medido antes |
| 9 | La barrera de guardado oculta sus propios fallos | ✅ **Arreglado** (5/8) |
| 10 | Restaurar produce notas incompletas | ✅ **Arreglado** (6/8) |
| 11 | "Reemplazar todo" reactiva agentes | ✅ **Arreglado** |
| 12 | Pausar agentes puede fallar y dejar las notas legibles | ✅ **Arreglado** (6/8) |
| — | Un pedido MCP sin id se aplica dos veces | ✅ **Arreglado** (6/8) |
| — | `.env` con permisos 0644 | 🚫 **Falso** |
| — | Rust sigue enlaces simbólicos | 🚫 **Falso en la práctica** |
| — | Comillas del comando de Claude Code | ❌ **Vivo**, teórico |
| — | Sin límites de tamaño en importaciones | ❌ **Vivo**, menor |
| — | Capacidad de Tauri sin permiso para `destroy()` | ✅ **Arreglado** (6/8), falta el gate manual |
| — | Código muerto y dependencias sin uso | ❌ **Confirmado**, salvo un punto falso |

---

## Revisión de la revisión — 6 de agosto

Segunda pasada sobre **todo lo que quedaba abierto**, leyendo el código de hoy,
para ver si algo se analizó mal o se escapó. Nueve puntos se confirmaron tal cual.
Estos siete cambian:

### 1. La capacidad de Tauri no es "falta cavar": está rota — ✅ arreglado el 6/8

No hace falta probarlo en tu Mac, se lee en el archivo que genera Tauri.
`src-tauri/gen/schemas/acl-manifests.json` lista qué trae `core:window:default`:
28 permisos, todos de **preguntar** (tamaño, posición, si está minimizada). El
permiso `allow-destroy` **existe** en el manifiesto pero **no está** en ese
paquete. Nuestra capacidad (`capabilities/default.json`) declara sólo
`core:default`.

O sea: `appWindow.destroy()` (`TauriLifecycle.svelte:36`) lo rechaza el permiso.
Y el `catch` que lo rodea muestra *"No se pudo guardar. La ventana sigue abierta
para reintentar"* — un mensaje sobre guardar, cuando lo que falló fue cerrar. El
guardado salió bien.

**Por qué quizás nunca lo viste:** en Mac, ⌘Q no pasa por ese camino. Lo que
tendría que fallar es cerrar con el botón rojo de la ventana.

**Arreglo:** agregar `core:window:allow-destroy` a la capacidad (una línea) y que
el fallo de cerrar no se disfrace de fallo de guardar. **Requiere build de
escritorio y probarlo a mano.**

**Hecho (6/8).** El permiso está en `capabilities/default.json`, y `cargo check`
lo valida al vuelo: Tauri resuelve la capacidad durante la compilación, así que un
nombre inventado no compilaría. El archivo que genera
(`gen/schemas/capabilities.json`) ya lista los dos permisos. Y `destroy()` tiene
ahora su propio `catch`: si falla, el aviso dice *"No se pudo cerrar la ventana.
Tus cambios ya están guardados"* en vez de hablar de un guardado que salió bien.

**Falta el gate manual:** build de escritorio y cerrar con el botón rojo.

### 2. #5 la bóveda: el que pierde la carrera NO queda en silencio

Era la pregunta que faltaba responder. Lo que le pasa:

1. `getVaultKey()` devuelve la llave vieja, así que el aparato sigue trabajando
   normal **en local**.
2. Al bajar, `decryptRecord` no puede abrir lo que subió el otro aparato y
   **tira error**. `downloadOnce` lo propaga, `syncNow` lo atrapa y muestra *"No
   se pudo sincronizar. Lo tuyo está guardado en este dispositivo"*.
3. Eso pasa en **los dos** aparatos y en **cada** tic, para siempre. Ninguno dice
   la verdad, que es "estas dos máquinas ya no comparten llave".
4. Y el código de recuperación del que perdió queda **muerto**: `vaults` guarda
   el envoltorio del que llegó último.

**Consecuencia para el arreglo:** prevenir no alcanza. Va `insert` en vez de
`upsert` (la primera bóveda gana), **y** un mensaje propio cuando un registro no
se puede abrir, en vez del error genérico. **Los dos están hechos (6/8)**, ver
el punto 5 más abajo.

### 3. #4 la puerta del SQL: cavado, y la bóveda está en la misma puerta

- **La app nunca escribe `records` directo.** Confirmado: en todo `src/` hay una
  sola escritura, `upload.ts:107` vía `push_records`, más un `select` en
  `download.ts:128`. Cerrar la puerta no rompe nada de la app.
- **`rls-check.mjs` se arregla con dos líneas.** Sólo los `insert` de armado
  (`:67-68`) dependen de escribir directo; se reescriben con `push_records`. Las
  pruebas 3 y 4 (plantar una fila a nombre de otro, pisar la fila de otro) siguen
  pasando, y por un motivo **más fuerte**: ya no es "el candado lo filtra" sino
  "escribir directo no existe".
- **Lo que el informe no dijo:** la política `own_vault` también es `for all`
  (`schema.sql:207-212`). O sea que la bóveda se puede **borrar o pisar** a mano
  igual que los registros — que es exactamente el daño del punto 5. Los dos
  arreglos son **un solo cambio de SQL**, y conviene hacerlos juntos.

### 4. #8 dos pestañas: con la nube prendida no es silencioso — ✅ arreglado el 6/8

El mecanismo es el que describe el informe, pero el daño depende de si la nube
está prendida:

- **Sin nube:** gana la última pestaña, en silencio. Como decía.
- **Con nube:** la segunda pestaña sube parada sobre una versión que el servidor
  ya no tiene, el servidor la **rechaza**, y al bajar aparece como **conflicto**
  — la pantalla de las dos versiones que ya existe. Molesto, pero no silencioso.

Confirmado además que no hay **nada** de coordinación entre pestañas: ni
`BroadcastChannel`, ni `visibilitychange` que recargue (el único que hay,
`Editor.svelte:476`, sólo vacía guardados pendientes al ocultarse).

Sigue último de la lista, y ahora con más razón.

### 5. "SettingsDialog toca Dexie directo" es FALSO

`src/lib/components/SettingsDialog.svelte` no importa `db` ni usa `.table(`. Todo
pasa por repositorios (`$lib/storage`, `$lib/sync/...`). Las líneas que cita el
informe (`:39`, `:95-109`) son otra cosa: una variable de estado y los botones del
código por email. Sale de la lista de limpieza.

### 6. `makeToolHandler` está muerto **y** deja un comentario que miente

Confirmado que sólo lo usan las pruebas: `mcp/server.js` no lo importa (`:21-33`).
Pero `mcp/server.js:67` tiene un comentario que dice *"(server.js, via
makeToolHandler)"*, describiendo un cableado que ya no existe. Al borrar la
función hay que borrar el comentario, o queda peor que antes.

### 7. Las dependencias cambiaron desde el 5/8

`pnpm audit` hoy: **8 altas, 5 moderadas, 1 baja** (eran 4 altas y 1 baja).
Módulos: `brace-expansion`, `cookie`, `fast-uri`, `postcss` y **`undici`**, que es
nuevo. **Todas siguen siendo de herramientas de construcción** (`dev`), o sea que
el riesgo es sobre el build, no sobre la app publicada.

`@hono/node-server@1.19.14` no aparece más en esa cuenta porque vive en
`mcp/node_modules`, que es un paquete aparte. Sigue ahí, sigue sin usarse (el
canal es stdio) — pero vale anotar que `tauri.conf.json:29-32` **empaqueta
`mcp/node_modules` entero dentro de la .app**, así que ese código viaja en el
producto aunque nunca se ejecute.

### 8. Dos cosas confirmadas con más precisión que antes

- **Borrar el renglón padre deja la nota sin renglones: es real, y es una
  asimetría dentro del mismo archivo.** Borrar una **selección**
  (`Editor.svelte:1519`) crea un renglón nuevo si la nota quedó vacía. Borrar
  desde el **menú del renglón** (`handleDeleteBlock`, `:1287`) no: `canDeleteFromMenu`
  sólo mira `blocks.length > 1`, y esa cuenta incluye a los hijos que se van con
  el padre. Nota con padre + hijo = 2 renglones → borrás el padre → quedan **cero**.
- **Los dos generadores de HTML divergen donde casi nunca se llega.** La
  diferencia está en el `inlineHtml` de respaldo, el que se usa **sólo si el
  renglón no tiene `html` guardado**: `copy/format.ts` convierte los saltos
  blandos en `<br>`, `note-export.ts` no. Como `createBlock` y `createTask`
  rellenan `html` desde `plainTextToHtml`, sólo llegan ahí renglones viejos, de
  antes de que existiera ese campo. **La versión correcta es la de `copy`**, y con
  eso el punto 14 de la cola queda respondido sin más investigación.

---

## 1. La sincronización se saltea cambios para siempre — ✅ arreglado

**Decía:** PostgreSQL puede darle el número 100 a una escritura que confirma
*después* que la 101. Un aparato que baja la 101 avanza su marca y nunca vuelve a
pedir la 100. Ese cambio se queda del otro lado para siempre.

**Hoy:** el problema era real y está resuelto. `src/lib/sync/download.ts:25-40`
define `OVERLAP = 50` y `:120` lo usa: cada pasada **relee las últimas 50
escrituras**, no sólo lo posterior a la última que vio. Volver a leer sale gratis
— una versión que ya está acá se reconoce por su número y no se escribe ni se
descifra.

El comentario de `supabase/schema.sql:20-24` que el informe cita ("phase 3
revisits this") quedó viejo. El código no.

**Techo que queda, anotado a propósito en el código:** un hueco de **más de 50
escrituras** seguiría perdiéndose. Cerrarlo del todo necesita un cursor por
transacción abierta (`pg_snapshot`), que es otro orden de complejidad. Con dos
aparatos, 50 es holgado.

**Propuesta:** ninguna. Sólo actualizar el comentario de `schema.sql` para que no
mienta. Va con la limpieza.

---

## 2. Dos ediciones distintas parecen la misma versión — ✅ arreglado el 5/8

**Decía:** cada aparato saca su número de cambio del reloj. Dos aparatos pueden
producir el mismo número en el mismo milisegundo; `decide()` compara sólo ese
número y descarta el cambio de allá antes de fijarse si acá había texto sin subir.

**Hoy:** el mecanismo es tal cual lo describen.

`src/lib/storage/change-seq.ts:31-43` genera el número así:

```js
last = Math.max(Date.now(), last + 1);
```

Nada distingue un aparato de otro. Dos aparatos parados en el mismo milisegundo
sacan el mismo número.

`src/lib/sync/download.ts:62-90` decide qué hacer con cada fila que baja, y la
**primera** pregunta es:

```js
if (local.changeSeq === payload.change_seq) return 'skip';
```

El comentario dice "mi propia subida volviendo, o una tanda que ya apliqué". Con
una colisión eso deja de ser cierto: es el cambio **distinto** del otro aparato,
y se descarta sin mirarlo.

**Por qué es peor que perder un cambio:** el aparato que quedó afuera tampoco
puede subir. Su subida declara una base que el servidor no tiene, el servidor la
rechaza, y en la próxima bajada vuelve a caer en el mismo `skip`. Se atasca para
siempre, en silencio, en ese renglón.

**Qué tan probable es:** hace falta que los dos aparatos toquen **el mismo
renglón** en **el mismo milisegundo**. Poco probable. Pero cuando pasa, es
permanente y nadie se entera.

**Qué falta cavar antes de tocar nada:**

1. Escribir una prueba que arme la colisión a mano y confirme que el renglón
   queda atascado. Si no se atasca, mi diagnóstico está mal.
2. Confirmar que la rama que sí es necesaria —"mi subida cuya respuesta se
   perdió"— queda cubierta por el arreglo.

**Arreglo propuesto** (para después de la prueba): el número no puede distinguir
los dos casos, pero **el contenido sí**. Reordenar `decide()`:

1. Primero `local.cloudSeq === payload.change_seq` → `skip`. Esa es la versión ya
   confirmada; hoy se pregunta segunda.
2. Después `local.changeSeq === payload.change_seq` → devolver una acción nueva,
   `confirm`, en vez de `skip`. Significa: "los números coinciden pero nadie lo
   confirmó — descifrá y comparás".
3. En `downloadOnce`, `confirm` descifra y usa `sameToTheUser` (que ya existe):
   iguales → anotar que el servidor lo tiene (el rescate que hoy vive dentro de
   `skip`); distintos → **conflicto**, que es la respuesta correcta.

Cuesta unas 12 líneas y no cambia el formato de los datos, así que no hay
migración. **Descartada** la alternativa de meterle una marca por aparato al
número: al cambiar la escala, los renglones viejos sin subir quedarían por debajo
de la marca de subida y se perderían de verdad. El remedio era peor.

**Requiere gate manual** entre tus dos aparatos antes de darlo por cerrado.

**Cavado, y una corrección al diagnóstico.** La prueba
(`download.test.ts`, "pregunta también cuando los dos números de cambio salieron
iguales") reproduce la colisión y falla con el código viejo: `conflicts` da 0 y la
cola de subida queda **vacía**. Pero el renglón **no se atasca para siempre** como
escribí arriba. Lo que pasa es peor de ver y más fácil de no notar:

1. El `skip` anota `cloudSeq = change_seq` — o sea "el servidor ya tiene lo mío".
2. Con eso el renglón deja de estar pendiente (`pending.ts:46`), así que **mi
   texto nunca sube** y nadie lo decidió.
3. Los dos aparatos quedan mostrando cosas distintas, sin conflicto y sin aviso.
4. Se despega solo la próxima vez que alguien toque ese renglón (número nuevo,
   base que el servidor sí tiene). Hasta entonces, divergencia en silencio.

**Hecho.** `decide()` pregunta primero por `cloudSeq` y devuelve la acción nueva
`confirm` cuando los números coinciden sin confirmación. `downloadOnce` la
resuelve descifrando: `sameToTheUser` iguales → es mi eco, se anota (el rescate de
la respuesta perdida, intacto); distintas → conflicto, que es la respuesta
correcta. La rama `skip` quedó sin trabajo: ahora sólo la alcanza lo ya
confirmado.

**Precio:** un descifrado por eco propio, una sola vez por registro (la pasada
siguiente ya cae en `skip`). Nada en el formato de los datos, ninguna migración.

---

## 3. Llave, permiso y cursores de la cuenta anterior — ✅ arreglado

**Decía:** si una sesión desaparece sin pasar por `forgetCloudAccount()` y después
entrás con otra cuenta, la app reutiliza el permiso, la llave y las marcas de la
cuenta anterior. Podría subir datos cifrados a la cuenta equivocada.

**Hoy:** existe `ensureAccountMatches` en `src/lib/sync/leave.ts:42-52`, y es lo
**primero** que corre dentro de `syncNow` (`src/lib/sync/upload.ts:207-208`),
antes de la subida y antes de la bajada:

```js
const account = await currentAccount();
if (account && !(await ensureAccountMatches(account))) return;
```

Si el aparato tiene anotada otra cuenta, `resetCloudState()` cierra el permiso
primero (falla cerrada), pone los dos cursores en cero, borra la bóveda y los
conflictos, y le saca a cada fila la nota de "el servidor ya tiene esta versión".
Ese tic no sincroniza; el siguiente se encuentra sin permiso ni bóveda y espera a
que conectes el aparato de nuevo.

**Caso que queda abierto a propósito:** un aparato que ya venía sincronizando de
antes de que existiera esta anotación no tiene cuenta anotada. Se le anota y no se
le toca nada — si no, la primera actualización le borraría la bóveda sin motivo.

---

## 4. Se puede escribir sin pasar por `push_records` — 🔍 vivo, falta cavar

**Decía:** el diseño dice que `push_records` es la única puerta, pero las
políticas permiten insertar, actualizar y **borrar** filas propias directamente.
Una sesión robada, un cliente viejo o una llamada a mano puede saltarse el control
de versiones y destruir la copia de la nube.

**Hoy:** `supabase/schema.sql:200-204`:

```sql
create policy own_records on public.records
for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
```

`for all` = leer, insertar, actualizar y borrar. `push_records` corre como
`security invoker` (`:97`), o sea con los permisos del que llama, así que necesita
esa política para hacer su trabajo.

**Por qué es menos grave de lo que suena:** alguien con tu sesión también podría
usar la puerta buena — leer el `change_seq` actual y declararlo como base. La
puerta cerrada no frena a un atacante decidido.

**Por qué igual conviene cerrarla:** frena lo que sí puede pasar sin atacante —
un cliente viejo con un bug, o un `delete` a mano en el panel de Supabase,
vaciando la copia de la nube. Los borrados no deberían existir: un borrado viaja
como lápida, nunca como fila borrada.

**Qué falta cavar:**

1. Leer `scripts/rls-check.mjs:67-68`. Ese script **usa escrituras directas** para
   comprobar el aislamiento entre cuentas. Si cerramos la puerta, hay que
   reescribirlo o deja de correr.
2. Confirmar que `push_records` con `security definer` + chequeo explícito de
   dueño no rompe nada más (la política del canal en vivo es aparte y no se toca).
3. Ver si algún camino de la app escribe en `records` sin pasar por
   `push_records`. Por lo que leí, no — pero hay que confirmarlo.

**Arreglo propuesto:** dejar la política en `for select` solamente, pasar
`push_records` a `security definer` con el filtro de dueño explícito adentro, y
adaptar `rls-check.mjs`. **Te toca a vos** pegar el SQL nuevo en el editor de
Supabase; el resto lo hago yo.

**Hecho (6/8), junto con el 5 en un solo SQL.** `own_records` quedó en `for
select` y nada más, así que escribir directo —insertar, actualizar o borrar— ya
no existe para nadie. `push_records` pasó a `security definer` para poder seguir
escribiendo con la puerta cerrada, con dos consecuencias anotadas en el archivo:
el candado por fila ya no lo filtra, así que el filtro por dueño es ahora la
única defensa y está escrito a la vista en las dos ramas (`auth.uid()` en el
`insert`, `owner_id = auth.uid()` en el `update`), más un corte de entrada si no
hay sesión.

`rls-check.mjs` cambió más de lo previsto, y para mejor: el armado ya usa
`push_records`, y las pruebas 3 y 4 pasaron de "el candado filtra lo ajeno" a
**"escribir directo no existe"** — se comprueba también sobre la fila **propia**,
que es el caso que de verdad se estaba tapando (un cliente viejo, o un borrado a
mano, vaciando la copia de la nube).

**Verificado contra el proyecto real (6/8).** El SQL corrió en Supabase y
`pnpm rls:check` da las siete pruebas en verde, incluidas las dos que cambiaron
de significado: un `insert` directo lo rechaza el servidor con **42501**, y un
`update` o un `delete` directo no cambian nada — ni sobre la fila ajena ni sobre
la propia. `push_records` sigue aceptando al que viene al día y rechazando al que
no, ahora corriendo como `security definer`.

---

## 5. Dos aparatos crean dos bóvedas — 🔍 vivo, falta cavar

**Decía:** los dos pueden comprobar a la vez que no hay bóveda, crear llaves
distintas y después hacer `upsert`; gana el último. Además, la subida arranca
antes de que la persona confirme que guardó el código de recuperación.

**Hoy:** las dos mitades son ciertas.

`src/lib/components/SettingsDialog.svelte:129-151` pregunta y después crea:

```js
if (await cloudVaultExists()) { ... throw ... }
await grantUploadConsent();
const { recoveryCode: code } = await createVault();
```

Entre la pregunta y la creación no hay nada que reserve el lugar. Y
`src/lib/sync/upload.ts:136-143` sube la copia envuelta con `upsert`, que **pisa**
lo que hubiera:

```js
await client.from('vaults').upsert(blob, { onConflict: 'owner_id' });
```

Si eso pasa, cada aparato sube registros que el otro no puede abrir, y `vaults`
se queda con la llave que llegó última.

**Qué tan probable es:** hay que apretar "crear bóveda" en dos aparatos con pocos
segundos de diferencia. Sos una sola persona.

**La segunda mitad (subir antes de confirmar el código)** la clasifico como
**menor**: `syncNow()` sale sin esperar en `:149` porque el código de recuperación
tiene que estar en pantalla ya, no después de una subida entera. Los datos no
corren riesgo — están en el aparato. El riesgo es perder el aparato *y* no haber
anotado el código, y eso no lo arregla demorar la subida.

**Qué falta cavar:** seguir qué le pasa al aparato que **pierde** la carrera. Sus
registros ya subidos quedan cifrados con una llave que `vaults` ya no tiene. ¿Se
puede detectar y avisar, o queda ilegible en silencio? De la respuesta depende si
el arreglo es "prevenir" o "prevenir y avisar".

**Arreglo propuesto:** que `uploadVaultBlob` deje de ser `upsert` y sea un
`insert` a secas. Si choca, esta cuenta ya tiene bóveda de otro aparato → parar la
sincronización y decirlo con todas las letras, en vez de pisar. La primera bóveda
gana siempre.

**Hecho (6/8).** Tres piezas:

- **El candado.** `vaults` da `select` e `insert`, nunca `update` ni `delete`. La
  clave primaria es el dueño, así que la segunda bóveda choca contra el servidor
  y no contra una comprobación del cliente que se puede correr en el medio.
  Comprobado contra Supabase: la segunda creación devuelve `23505` y un `update`
  sobre la bóveda propia no cambia nada.
- **El aviso del que pierde.** `uploadVaultBlob` lee ese choque (`23505` de
  Postgres) y para la sincronización con un mensaje que dice qué pasó y qué
  hacer: sumar este aparato con el código de recuperación. Y **no sube nada** —
  cada registro que mandara sería un bulto cifrado con una llave que la cuenta no
  tiene.
- **El aviso del otro lado.** Lo que respondía la segunda pasada: el daño también
  se ve como un registro que no abre. `decryptPayload` ahora traduce eso a su
  propio mensaje en vez del genérico "No se pudo sincronizar", que mandaba a
  mirar la conexión para siempre.

Los dos mensajes van marcados `userFacing`, la única marca que `reportSyncFailure`
publica tal cual, y **antes** de la comprobación de "sin conexión": una respuesta
concreta del servidor no es un problema de red que el próximo tic arregle solo.

**Techo:** la mitad de "subir antes de confirmar el código" queda igual, a
propósito (arriba está el porqué).

---

## 6. Cambiar el tipo de un grupo borra el texto recién escrito — ✅ arreglado

**Decía:** la conversión cancela el autoguardado pendiente y persiste sólo el tipo.
El texto queda en pantalla, pero al recargar vuelve la versión anterior.

**Hoy:** arreglado, y el comentario del código describe exactamente ese bug.
`src/lib/editor/Editor.svelte:1564`, dentro de `applySelectionType`:

```js
await flushPending();
```

Ya no se cancela: se **espera** a que el guardado del tipeo aterrice primero, y
recién después se escribe la conversión encima.

---

## 7. Deshacer pisa un cambio del otro aparato — ✅ arreglado

**Decía:** el historial guarda fotos completas. Si un renglón remoto cambia de
contenido sin que se agreguen ni borren filas, el historial no se reinicia, y
deshacer otra cosa restaura de paso el texto remoto anterior.

**Hoy:** `src/lib/editor/reconcile.ts:64-70` calcula `historyStale` con las **dos**
formas de quedar viejo, incluida la que el informe dice que falta:

```js
const historyStale =
    next.length !== beforeById.size ||
    next.some((row) => {
        const before = beforeById.get(row.id);
        return !before || (row !== before && !sameToTheUser(before, row));
    });
```

La segunda condición es exactamente "un renglón que ya existía llegó con otro
contenido". `src/lib/editor/Editor.svelte:1875-1876` lo consume y llama a
`history.reset()`. Hay cobertura en `reconcile.test.ts:100-141`.

---

## 8. Dos pestañas se pisan en silencio — ✅ arreglado el 6/8

**Decía:** no hay coordinación entre pestañas ni comprobación de versión al
actualizar un renglón. Las dos escriben el contenido entero y gana la última.

**Hoy:** el mecanismo es real. `src/lib/storage/blocks.ts:120-129` hace un
`update` sin mirar qué versión había:

```js
const updated = await blocks.update(id, { ...changes, updatedAt: now() });
```

Y `src/lib/editor/Editor.svelte:690` guarda el texto entero del renglón con medio
segundo de retraso. Dos pestañas con la misma nota abierta tienen cada una su
propia lista de renglones en memoria; ninguna se entera de lo que hizo la otra.

**Qué falta cavar antes de decidir si vale la pena:**

1. Medir el daño de verdad, abriendo la app en dos pestañas. ¿La segunda pestaña
   se refresca sola al volver a ella, o se queda con la nota vieja hasta recargar?
2. Ver si el camino que ya existe para la nube (`reconcile.ts`, que actualiza los
   renglones en el lugar sin robar el cursor) sirve tal cual para este caso.

**Arreglo propuesto, si el daño lo justifica:** un `BroadcastChannel` — el canal
entre pestañas que traen todos los navegadores, sin instalar nada — que avise
"escribí algo" y dispare el mismo refresco en el lugar que ya usa la nube. Serían
~15 líneas reutilizando lo que hay.

**Sesgo:** esto es una función, no un parche. Lo pondría **último** de la lista.

### Medido el 6/8, antes de tocar nada

Dos pestañas sobre la misma nota, una sola sesión del navegador:

| Paso | Qué pasó |
| --- | --- |
| B abre la nota | Ve `original` |
| A la edita → `original EDITADO-EN-A` | — |
| B, sin tocar nada, 1,5 s después | Sigue en `original` |
| B vuelve a primer plano | Sigue en `original` |
| A agrega además un renglón nuevo | A ve 2 renglones, B sigue viendo 1 |
| B escribe sobre su copia vieja | `original EDITADO-EN-B` |
| Recargar las dos | `original EDITADO-EN-B` **+ el renglón nuevo de A** |

Las dos preguntas quedaron contestadas:

1. **La segunda pestaña no se refresca nunca**, ni con el tiempo ni al volver a
   ella. Hasta recargar a mano.
2. **El daño es más chico de lo que parecía:** se pisa **sólo el renglón que
   tocaste** en la pestaña vieja. El renglón nuevo del otro lado **sobrevivió**.
   No es un retroceso de la nota entera.

### Hecho el 6/8

- **El aviso va en los ganchos de Dexie** (`storage/db.ts`), que son la misma
  puerta única por la que ya pasa el sello de `changeSeq`: toda escritura a una
  tabla sincronizada pasa por ahí, así que el próximo repositorio que alguien
  agregue no se puede olvidar de avisar. Se avisa también de lo que baja de la
  nube — para la otra pestaña es un cambio de afuera igual.
- **El canal es `BroadcastChannel`** (`storage/tab-channel.js`), de fábrica en el
  navegador, sin dependencia nueva y sin salir a la red.
- **Recibir entra por `handleExternalChange`**, la misma puerta que la nube y los
  agentes: actualiza en el lugar, sin re-montar el editor.

**Por qué no puede entrar en bucle**, que era el riesgo real de una función así:
el canal no le entrega el mensaje a quien lo mandó, y recibir dispara una
**lectura**, nunca una escritura — una pestaña que se refresca no anuncia nada.

**Un aviso por tanda, no por renglón:** los ganchos corren fila por fila, así que
importar un respaldo dispararía miles de mensajes. Se juntan en uno con 150 ms de
espera, que hace además de colchón para que la transacción de Dexie haya cerrado
cuando la otra pestaña va a leer.

**El renglón protegido sigue mandando**, y salió en la prueba: si la otra pestaña
tiene el cursor parado en ese mismo renglón, el cambio **no** se aplica ahí — se
aplica en cuanto el cursor se va. Es la misma regla que con la nube, y es lo
correcto: pisar lo que alguien está tipeando es el daño que veníamos a evitar.

**Cobertura:** dos pruebas de punta a punta (`e2e/two-tabs.spec.ts`) con dos
pestañas de verdad, las dos rojas con el código de antes.

---

## 9. La barrera de guardado oculta sus propios fallos — ✅ arreglado el 5/8

**Decía:** `flushPending()` marca el error pero resuelve la promesa como exitosa.
Un respaldo puede bajarse con datos viejos, y el cierre del escritorio puede
seguir creyendo que todo quedó guardado.

**Hoy:** cierto, y lo leí entero. `src/lib/editor/Editor.svelte:428-440`:

```js
entry.save().then(
    () => { if (pending.get(key) === entry) pending.delete(key); },
    () => { entry.failed = true; }   // <- nunca rechaza
);
...
return Promise.all(saves).then(() => settleSaveState());
```

Un guardado que falló se marca y se queda, pero la promesa que devuelve
`flushPending` **resuelve igual**. `src/lib/storage/pending-writes.js:22-27`
(`settlePendingWrites`) hereda esa mentira, y `src/lib/storage/backup.ts:53-54`
la cree:

```js
export async function dumpAllTables() {
    await settlePendingWrites();
    return db.transaction('r', TABLES, ...);
}
```

**Qué se ve en pantalla hoy:** el indicador de guardado **sí** dice "error"
(`settleSaveState`, `:416-419`). Lo que no chequea nadie es el respaldo:
`src/lib/components/BackupDialog.svelte:57-76` baja el archivo y dice "Respaldo
descargado" aunque le falte el último cambio.

**Y el cierre del escritorio:** `src/lib/desktop/TauriLifecycle.svelte:26-42` ya
está preparado para lo correcto — si `settlePendingWrites` fallara, mantiene la
ventana abierta y avisa. Nunca se entera, porque nunca falla.

**Arreglo propuesto:**

1. `flushPending` devuelve si **todo** aterrizó (mirar la bandera `failed` de las
   entradas que quedaron).
2. `settlePendingWrites` propaga esa respuesta.
3. El respaldo la usa: si algo no aterrizó, el archivo **igual se baja** (un
   respaldo al que le falta un renglón es mejor que ninguno) pero el mensaje deja
   de mentir: "Respaldo descargado — un cambio reciente no se pudo guardar y puede
   faltar".
4. El cierre del escritorio deja de cerrar y avisa, que es lo que ya quiere hacer.

Todo esto es leer una bandera que ya existe. No hace falta cavar más.

**Hecho.** `flushPending` devuelve `false` si quedó alguna entrada marcada `failed`;
`settlePendingWrites` devuelve `true` sólo si **todos** los flushers aterrizaron (una
escritura rastreada que falla sigue rechazando, como antes). El respaldo y la
exportación de una nota bajan el archivo igual pero avisan en el mensaje, y el
cierre del escritorio deja la ventana abierta.

**Techo anotado:** la prueba nueva cubre el contrato de la barrera
(`pending-writes.test.js`), no el lado del editor — `Editor.svelte` no tiene
pruebas de componente. La rama del editor son 3 líneas leyendo una bandera que ya
existía.

**Queda igual a propósito:** `exportSnippets` (`+page.svelte:541`) no mira la
respuesta, porque los snippets no se escriben por el mapa `pending` del editor.

---

## 10. Restaurar produce notas incompletas — ✅ arreglado el 6/8

**Decía:** tres cosas distintas, en realidad.

**(a) Un renglón idéntico se salta antes de renumerar la nota duplicada.**
`src/lib/export-import/merge.ts:34-46`: si el renglón que viene ya existe igual, se
salta. Pero si su **nota** se duplicó por conflicto (`:64`, la nota recibe un id
nuevo), ese renglón nunca se copia a la nota nueva. Resultado: **una nota
duplicada y vacía**. Confirmado leyendo el código; el orden es notas primero
(`:64`), renglones después (`:65`), así que cuando se planean los renglones ya se
sabe qué notas cambiaron de id — el dato está, no se usa.

**(b) "Reemplazar todo" acepta referencias que después borra.**
`src/lib/export-import/schema.ts:245-269` valida que cada renglón apunte a una nota
que existe, y cuenta como existentes **las notas locales**
(`existing.existingNoteIds`, `:247`). Para importar mezclando está bien. Para
"Reemplazar todo" está mal: `src/lib/storage/backup.ts:100` borra todo lo local
justo antes de escribir el archivo. Las referencias que se apoyaban en datos
locales quedan colgando. `BackupDialog.svelte:123-128` usa la misma validación
para los dos botones.

**(c) No se rechazan ciclos ni padres de otra nota.** Cierto: `referenceErrors`
comprueba que el padre **exista**, no que esté en la misma nota ni que no forme un
círculo.

**Qué falta cavar:**

1. Armar el caso (a) de verdad con un test y confirmar que la nota nueva queda
   vacía. Es el único de los tres que produce algo que vas a *ver*.
2. Medir (c): ¿un ciclo cuelga la pantalla o sólo se dibuja raro? De eso depende
   si es un error que bloquea la importación o un aviso.

**Arreglo propuesto:**

- (a) Al planear los renglones, si la nota del renglón cambió de id, **duplicar
  igual** aunque el contenido sea idéntico. Son ~3 líneas: el mapa de renumeración
  de notas ya está armado en ese punto.
- (b) Validar "Reemplazar todo" **sin** los ids locales — el archivo tiene que
  sostenerse solo.
- (c) Agregar al validador: el padre tiene que ser de la misma nota, y no puede
  haber círculos.

**Cavado (a).** La prueba (`merge.test.ts`, "copies the rows of a duplicated note
even when they are identical") falla con el código viejo: `inserts.blocks` queda
en **cero**. La nota duplicada entra sólo con su título; sus renglones se quedan
colgando de la nota local. Confirmado.

**Medido (c).** Un ciclo **no cuelga la pantalla**: `buildVisibleList` sólo baja
desde la raíz, y ningún miembro de un ciclo es alcanzable desde ahí, así que esos
renglones simplemente **no se dibujan nunca**. Lo mismo con un padre de otra nota.
`listDescendantIds` sí revienta la pila si se la llama sobre un miembro del ciclo,
pero eso no pasa: como no se dibujan, no se pueden seleccionar. O sea: no es una
pantalla colgada, es data que entra y desaparece de la vista. Por eso va como
**error** que rechaza el archivo, no como aviso.

**Hecho, los tres.**

- (a) `planTable` acepta `mustCopy`; los renglones lo usan para forzar la copia
  cuando su nota fue duplicada. Una copia forzada **no** cuenta como conflicto en
  el resumen: nadie cambió nada en los dos lados, el renglón sólo viaja con su
  nota.
- (b) `BackupDialog` revalida el archivo **sin** los ids locales. Si no se
  sostiene solo, el botón "Reemplazar todo…" no aparece y el resumen dice por qué.
  Cuando sí se sostiene, el reemplazo escribe **esa** versión validada, que además
  ya descartó la bitácora que se apoyaba en bloques locales.
- (c) `referenceErrors` rechaza el padre de otra nota y los círculos (recorrido de
  la cadena de padres con marca de visitado; un padre fuera del archivo corta la
  cadena y no reporta nada).

**Techo anotado en (a):** un renglón cuyo **renglón padre** fue duplicado —sin que
cambiara su nota— sigue quedándose con el original. Cerrarlo pide una segunda
pasada, porque en el archivo el padre puede venir después del hijo.

---

## 11. "Reemplazar todo" reactiva agentes — ✅ arreglado

**Decía:** la operación borra las preferencias pero sólo restaura las
exportables. `agentsPaused` no lo es, así que desaparece y vuelve a su valor por
defecto, `false`. Además, la tabla de conflictos viejos no se limpia.

**Hoy:** las dos mitades están cerradas, en `src/lib/storage/backup.ts:92-111`:

```js
const deviceOnly = (await db.table('settings').toArray()).filter(
    (row) => !isBackupSafe(row.key)
);
...
if (deviceOnly.length > 0) await db.table('settings').bulkPut(deviceOnly);
await db.table('conflicts').clear();
```

Las preferencias que **no** viajan en un respaldo (la pausa de los agentes, el
permiso de subir, los cursores) se rescatan antes del borrado y se vuelven a
escribir después. Y los conflictos sí se limpian, a propósito: describen dos
versiones de un renglón que después de esto puede no existir.

---

## 12. Pausar agentes puede fallar y dejar las notas legibles — ❌ vivo, confirmado y menor

**Decía:** si no se puede reemplazar `export.json`, el archivo anterior sigue
disponible y el error sólo aparece en la consola. El MCP avisa que está viejo
recién a las 24 horas, pero lo entrega igual.

**Hoy:** cierto, con una corrección importante que el informe no dice.

**La pausa SÍ frena las escrituras.** `src/lib/bridge/ingest.ts:78` la lee de la
base de datos en **cada** pedido, no de una copia en memoria:

```js
if (await getAgentsPaused()) return { reason: REASON.agentsPaused };
```

Ningún agente puede crear ni completar nada con la pausa puesta, pase lo que pase
con el archivo.

**Lo que sí puede quedar viejo es la lectura.** `src/lib/storage/settings.ts:103`
dispara la re-exportación pase o no pase la escritura, pero
`src/lib/bridge/BridgeLifecycle.svelte:28` la traga:

```js
writeAgentExport().catch((error) => console.error('agent export failed', error));
```

Si esa escritura falla —disco lleno, permisos— el `export.json` viejo sigue ahí y
el agente puede seguir **leyendo** tus notas. `mcp/lib/resources.js:14-24` avisa a
las 24 horas, y entrega igual (a propósito: leer con la app cerrada es una función
buscada).

**Qué tan probable es:** hace falta que falle una escritura de archivo local.

**Arreglo propuesto:** que el fallo deje de ser sólo una línea de consola. La
pausa es un interruptor de privacidad: si no se pudo cumplir, hay que decirlo en
pantalla. Un aviso, no un bloqueo.

**Hecho (6/8).** La marca se pone en `writeAgentExport` (`bridge/tauri.ts`), que
es la **única puerta** por la que pasan las tres llamadas que tragaban el error —
poner el `catch` en cada una hubiera dejado la próxima que alguien agregue sin
red. Escribe `agentData.exportFailed`, y `Configuración › Agentes` lo dibuja en
rojo con dos textos distintos, porque el daño es distinto:

- **Con la pausa puesta:** *"La pausa todavía no se cumplió"* — pueden seguir
  **leyendo** las notas marcadas. Escribir sigue cortado igual, porque eso lo
  decide `ingest.ts` leyendo la base de datos en cada pedido, no el archivo.
- **Sin la pausa:** *"Los agentes están viendo una versión anterior"*.

El error se sigue propagando a quien llamó, y la marca se borra sola apenas una
escritura vuelve a salir bien — cosa que pasa con el próximo cambio en cualquier
nota, así que en la mayoría de los casos se arregla sin que nadie haga nada.

**Queda igual a propósito:** `mcp/lib/resources.js` sigue entregando el archivo
viejo con su aviso de 24 horas. Leer con la app cerrada es una función buscada, y
la app apagada no tiene forma de avisar nada.

---

## Otros riesgos

### Un pedido MCP sin id se aplica dos veces — ✅ arreglado el 6/8

`src/lib/bridge/ingest.ts:120` y `:150`: la protección contra repetidos es
condicional.

```js
if (change?.id) { const seen = await getProcessedChange(change.id); ... }
```

Un pedido sin id se salta el registro. Y Rust guarda el archivo del buzón hasta
que la app confirma, y lo vuelve a entregar en el próximo arranque — o sea que un
pedido sin id se puede aplicar **dos veces**.

**Cuánto importa hoy:** poco. `mcp/lib/mailbox.js:99-107` **siempre** pone un id.
Haría falta un archivo escrito a mano en el buzón.

**Arreglo propuesto:** rechazar el pedido sin id, en vez de aplicarlo sin red. Dos
líneas.

**Hecho.** `ingestAgentChangeUnsafe` rechaza de entrada con una razón propia,
`missing-id`, y las tres ramas condicionales de abajo (`if (change?.id)`) quedaron
sin sentido y se fueron: el id ahora es obligatorio y se comprueba una sola vez.
Rechazar no le saca nada a nadie: la respuesta también se escribe por id
(`outbox/<id>.json`), así que un pedido sin id nunca podría leer lo que le
contestemos. Costó además ponerle id a 17 llamadas de prueba que no lo tenían —
eran pruebas escritas contra un contrato más flojo que el real.

### `.env` con permisos 0644 — 🚫 falso

`ls -l .env` da `-rw-------` (0600). Ya está bien. El informe miró
`.env.example`, que no tiene secretos.

### Rust sigue enlaces simbólicos y usa nombres predecibles — 🚫 falso en la práctica

`src-tauri/src/bridge.rs:69-78` escribe a un `.tmp`, le pone 0600 **antes** de
renombrar (para que el archivo final nunca sea legible por otros ni un instante) y
después renombra. `:221-240` valida el id antes de usarlo como nombre de archivo,
y la función `is_safe_name` (`:84-91`) es la regla compartida. La carpeta del buzón
es 0700.

Para explotarlo hace falta ser **tu propio usuario** en tu propia Mac. Eso ya está
fuera del modelo de amenaza declarado, igual que el punto siguiente.

### No hay credencial por cliente MCP — ❌ vivo, y es una decisión

Cualquier proceso de tu usuario que sepa `CN_MAILBOX` puede leer el export y pedir
cambios. Es el diseño: el canal es local, por entrada/salida estándar, sin puerto
de red. Cambiarlo es una decisión de producto, no un bug.

### Comillas del comando de Claude Code — ✅ arreglado el 6/8

`src/lib/bridge/mcp-config.js:28-32` arma el comando con comillas dobles:

```js
return `claude mcp add copynotes -s user -e CN_MAILBOX="${mailboxPath}" -- node "${serverPath}"`;
```

Entre comillas dobles, `$(...)`, las comillas invertidas y una comilla doble
siguen teniendo poder. Haría falta que tu carpeta de usuario tuviera un `$(` en el
nombre. **Arreglo:** comillas simples con el escape estándar. Una línea.

**Hecho.** Un `shellQuote` de una línea, usado en las dos rutas: comillas simples,
y la única comilla que no se puede tapar a sí misma —la simple— sale con el escape
estándar (`'\''`). Tres pruebas: el comando entero, una ruta con `$(whoami)` y
comillas invertidas, y una ruta con apóstrofo. Comprobado además contra un shell
de verdad, que devuelve el texto tal cual en vez de ejecutarlo.

**Los otros tres clientes no lo tenían:** OpenCode y Cursor arman **JSON**, donde
la ruta viaja como valor y `JSON.stringify` la escapa; el deeplink de Cursor la
manda en base64. Ninguno pasa por un shell.

### Sin límites de tamaño en importaciones — ✅ arreglado el 6/8

`src/lib/platform/files.js:56-60` lee el archivo entero a memoria sin mirar el
tamaño. Un JSON gigante cuelga la pestaña. Es **tu propio archivo**, elegido por
vos. **Arreglo:** un tope y un mensaje. Bajo.

**Hecho.** Tope de **64 MB**, comprobado **antes** de leer: `file.size` es un dato
que el navegador ya tiene, así que nada grande llega a entrar en memoria para
descubrir que era grande. `openTextFile` devuelve un estado nuevo, `too-large`, y
el diálogo de respaldo lo dibuja con su propio mensaje — el `catch` que ya existía
habría dicho "no se puede leer como respaldo", que manda a buscar el problema
donde no está.

**Por qué 64 MB:** un respaldo es texto de notas. Está lejísimos de cualquier
archivo real, así que el aviso siempre significa "agarraste el archivo
equivocado". El tope no evita que un JSON de 60 MB tarde; evita que uno de 4 GB
congele la pestaña sin decir nada.

**Techo, igual que en #9:** la rama del diálogo son tres líneas leyendo un estado,
y `BackupDialog.svelte` no tiene pruebas de componente. Lo que sí se puede probar
—que el tamaño se mire antes de leer— es una comparación de una línea.

### Capacidad de Tauri sin permiso para `destroy()` — ✅ arreglado el 6/8

**Ya no hace falta probarlo:** el manifiesto que genera Tauri
(`src-tauri/gen/schemas/acl-manifests.json`) dice que `core:window:default` trae
28 permisos y **ninguno** es `allow-destroy`. El detalle está arriba, en "Revisión
de la revisión", punto 1.

Lo que sigue es el texto original del triage.


El informe dice que `src-tauri/capabilities/default.json:8-10` declara sólo
`core:default`, y que `destroy()` necesita un permiso que no aparece.
`TauriLifecycle.svelte:36` llama a `appWindow.destroy()` al cerrar la ventana.

**Qué falta:** comprobar si cerrar la ventana funciona hoy en tu app instalada. Si
funciona, `core:default` ya lo incluye y el reclamo es falso. Si no funciona,
tenés un bug al cerrar que quizás nunca notaste porque el error se traga.

### Escrituras sueltas que pueden quedar a medias — ❌ vivo, bajo

Crear una nota, mover texto entre renglones, reordenar y restaurar Deshacer usan
varias escrituras independientes (`src/routes/+page.svelte:248-259`,
`Editor.svelte:246-272`). Un fallo en el medio deja datos parciales. Es el mismo
patrón que ya se cerró con transacciones en otros lugares (tareas, importación).
**Bajo:** IndexedDB local casi no falla a mitad de camino.

### Alta pública sin verificar email — ❌ vivo, decisión de Supabase

`supabase/README.md:33-46`. Sin cuotas visibles. Es configuración del panel de
Supabase, no del código. Se resuelve prendiendo la verificación de email ahí.

### Borrar el renglón padre puede dejar la nota sin renglones — ✅ arreglado el 6/8

`src/lib/blocks/enter.ts:83-87`. Vale la pena confirmarlo a mano; el arreglo es una
línea (si la nota queda vacía, crear un renglón).

**Reproducido con una prueba de punta a punta** (`critical-flows.spec.ts`, "deleting
a parent row from its menu leaves a row to write in"): nota nueva, "padre" + un
hijo anidado, Eliminar desde el menú ⋯ → la nota queda en **cero** renglones, y
sigue en cero después de recargar. Con el arreglo queda uno, vacío.

**Detalle de la prueba que costó encontrar:** Enter y Tab mueven el foco a otro
nodo del DOM, y sin una espera en el medio Playwright tipea "hijo" **dentro del
renglón padre**. La primera versión de la prueba pasaba con el código roto porque
nunca llegaba a armar el par padre/hijo.

**Hecho.** `handleDeleteBlock` hace lo mismo que ya hacía el borrado de una
selección: si después de sacar el subárbol no quedó ningún renglón, crea uno vacío
y le pone el cursor. Dejé `canDeleteFromMenu` como está — sigue tapando el caso de
un solo renglón, que es la única vez que "Eliminar" no debería hacer nada.

### `content` y `html` pueden mostrar textos distintos — ❌ vivo, bajo

La búsqueda y el agente leen `content`; la pantalla dibuja `html`. Si se
desincronizan, buscás una cosa y ves otra. No encontré un camino que los separe,
pero tampoco hay nada que lo impida.

### Carreras en Búsqueda, Agenda y onboarding — ❌ vivo, bajo

`SearchDialog.svelte:25-47`, `AgendaPanel.svelte:23-55`, `demo-note.ts:62-89`. Una
respuesta lenta puede pisar a una rápida. Se ve como un resultado viejo que
aparece un segundo.

---

## Dependencias

`pnpm audit` confirmado:

- **4 altas y 1 baja**, todas en herramientas de construcción: `fast-uri`,
  `postcss`, dos versiones de `brace-expansion` y `cookie`. Todas marcadas `dev`.
  El riesgo es sobre el build y CI, no sobre la app publicada. **Sin urgencia.**
- **1 moderada** en `@hono/node-server@1.19.14`, que entra por
  `@modelcontextprotocol/sdk`. El servidor MCP usa entrada/salida local y no la
  función HTTP vulnerable. **Exposición práctica muy baja.**
- **Cargo/Rust sin revisar**: falta instalar `cargo-audit`.

---

## Limpieza

Todo confirmado leyendo el código. Cero riesgo, cero lógica nueva.

### Código sin uso productivo — ✅ borrado el 6/8

| Qué | Dónde | Nota |
| --- | --- | --- |
| `makeToolHandler` | `mcp/lib/tools.js:96` | Sólo lo usan las pruebas |
| `removeInline` | `src/lib/format/commands.ts:12` | Re-exportado en `format/index.ts:9`, sin consumidor |
| `assignInitialOrder` | `src/lib/organize/plans.ts:25` | Re-exportado en `organize/index.ts:3`, sólo pruebas |
| `ensureSidebarOrder` | `src/lib/storage/organize.ts:98` | Re-exportado en `storage/index.ts:56`, sólo pruebas |
| `Editor.insertSnippet` | `src/lib/editor/Editor.svelte:1937` | Sin ningún consumidor |
| `src/lib/bridge/index.ts` | — | Nadie importa desde `$lib/bridge` |
| `src/lib/index.ts` | — | Sólo el comentario que trae el andamio de SvelteKit |
| 11 `.gitkeep` | varios | Carpetas que ya tienen archivos |

**Dos cosas que aparecieron al borrar y no estaban en la lista:**

- **Las pruebas de `ensureSidebarOrder` no se tiraron: se apuntaron a
  `normalizeSidebarOrder`**, que es lo que el envoltorio llamaba y **sí** vive
  (`storage/backup.ts:75,108`). Borrar las pruebas junto con el envoltorio habría
  tirado cobertura de código vivo.
- **`src/lib/mcp/` no era "una carpeta que ya tiene archivos": estaba vacía.** Su
  `.gitkeep` era el único archivo, así que la carpeta se fue entera.

Los cinco de arriba llevaban comentarios que explicaban un cableado que ya no
existe; se fueron con la función. `mcp/server.js:67` y `mcp/lib/tools.js:40`
nombraban a `makeToolHandler`: ahora nombran a `expandingHandler`, que es quien
hace ese trabajo hoy.

### Dependencias sin uso — ✅ borradas el 6/8

- `@sveltejs/adapter-auto` — `vite.config.ts:4,33` usa `adapter-static`.
- `tailwind-variants` — ni una importación.
- `tw-animate-css` — importado en `src/app.css:2`, pero **cero clases** de
  animación (`animate-in`, `fade-in`, `zoom-in`, `slide-in-from`) en el código.
  Comprobado además que el CSS de shadcn-svelte tampoco las usa, así que sacar el
  import no despinta nada.
- `serde` como dependencia directa de Rust — sólo se usaba `serde_json`. `cargo
  check` compila igual sin ella.

### Duplicación

- **La lista de tablas estaba escrita tres veces**, idéntica:
  `src/lib/export-import/backup.ts:7-16`, `src/lib/export-import/schema.ts:271-280`
  y `src/lib/storage/backup.ts:15-24`. ✅ **Unificada el 6/8** en
  `BACKUP_TABLES` (`export-import/schema.ts`): los otros dos archivos ya
  importaban de ahí, así que no hizo falta ningún import nuevo. Es además donde
  ya vivía `LOCAL_ONLY_FIELDS`, con el mismo argumento escrito al lado — el
  archivo del respaldo tiene una sola definición de qué lleva y qué se le saca.
- **Dos generadores de HTML en paralelo**: `src/lib/copy/format.ts:56-104` y
  `src/lib/export-import/note-export.ts:108-183`. **Divergían** en cómo tratan
  los saltos de línea — copiar una nota y exportarla daban resultados distintos.
  ✅ **Cerrada la divergencia el 6/8**, y no escribiendo una tercera versión: la
  correcta ya existía. `plainTextToHtml` (`format/sanitize.ts`) hace exactamente
  lo que hacía la de `copy` — escapar y convertir los saltos en `<br>` — y es la
  que ya usa el editor al guardar. Los dos generadores la llaman ahora, y su
  `escapeHtml` copiado (idéntico en los dos archivos) también salió de ahí.

  **Prueba:** un renglón viejo sin `html` con dos líneas. Falla con el código de
  antes (sale en una sola línea) y pasa con el arreglo.

  **Queda sin unificar a propósito:** el resto de los dos archivos arma **formas
  distintas** —`copy` exporta un subárbol suelto, el export arma la nota entera
  con su título y sus bloques de raíz—, así que fundirlos es un refactor de
  verdad, no una deduplicación. Lo que estaba duplicado era el escapado, que es
  lo que podía divergir en silencio; eso ya tiene una sola fuente.
- **Versiones desalineadas:** `package.json` y el respaldo decían `0.0.1`
  (`BackupDialog.svelte:61` la tenía escrita a mano); Tauri, Cargo y MCP decían
  `0.1.0`. ✅ **Alineadas el 6/8** en `0.1.0`, y el respaldo dejó de tenerla
  escrita a mano: la lee de `package.json`. O sea que el archivo que bajás ya no
  puede nombrar una versión que nunca existió.

  **Techo:** siguen siendo cuatro archivos que hay que tocar juntos al subir de
  versión (`package.json`, `mcp/package.json`, `tauri.conf.json`, `Cargo.toml`).
  Lo que se cerró es la **quinta** copia, la escrita a mano, que era la que ya
  se había desincronizado.
- **El empaquetado de Tauri copia todo `mcp/lib` y `mcp/node_modules`**, pruebas
  incluidas, y depende de que corras `build:flat` a mano
  (`src-tauri/tauri.conf.json:29-32`).
- **`SettingsDialog.svelte` toca Dexie directo** (`:39`, `:95-109`), salteándose la
  capa de repositorios.

### Archivos más grandes

`Editor.svelte` 2.284 líneas, `SettingsDialog.svelte` 1.149, `BlockRow.svelte`
1.006. **No reescribirlos.** Extraer responsabilidades de a poco, después de
cerrar los fallos de datos.

---

## Hallazgo ABIERTO — el techo del almanaque, 7 de agosto

No salió del informe del agente: apareció persiguiendo una prueba floja después
de cerrar la cola. Queda escrito acá porque es lo único de esta ronda que no está
resuelto.

**Qué se ve.** Con el teclado en pantalla y el almanaque abierto en el último
renglón de una nota larga, el panel se asienta con el **techo 59 px por encima
de lo visible** — cortado arriba, con las primeras opciones inalcanzables. Es
exactamente el modo de falla que `actions/keyboardInset.js` documenta como el
peor y del que se defiende con un tope; el tope existe y funciona, así que el
corrimiento no viene de ahí.

**Que NO es un instante.** Fue lo que más me costó aceptar, después de explicarlo
mal dos veces (primero como "se agotó la espera", después como "mide a mitad de
camino"). El `poll` insistió los **5 segundos enteros** devolviendo el mismo
valor. El estado malo se queda.

**Que NO es siempre.** ~1 de cada 6 corridas. Depende de cómo quede armada la
nota: la prueba tipea 12 renglones sin pausas, así que a veces se fusionan y el
renglón que abre el panel termina a distinta altura. Medido cuadro por cuadro,
hay al menos tres disposiciones distintas, con el panel asentándose en
`279 → 282 → 199 → 174` en una y en `113 → 115 → 11` en otra. En la buena, el
techo queda a **11 px** del borde: el margen es mínimo, y por eso una nota
apenas distinta lo empuja afuera.

**Por qué NO se puede llamar defecto confirmado todavía.** El teclado de la
prueba es un objeto simulado cuyo `addEventListener` no hace nada. Los avisos de
`visualViewport` —de donde `flipIntoView` y `keyboardInset` toman la señal para
reacomodarse cuando el teclado aparece o se mueve— **nunca llegan**. Puede ser un
agujero de la simulación o un defecto real; lo medido no distingue.

**Siguiente paso, en este orden:**

1. Que el teclado simulado dispare `resize`/`scroll` y volver a medir. Si
   desaparece, era la prueba.
2. Si sigue, mirar por qué `flipIntoView` deja el panel dado vuelta cuando, con
   el alto ya crecido, no entra ni arriba ni abajo — su rama `else` debería
   devolverlo abajo y no parece estar corriendo.
3. Confirmarlo en un teléfono de verdad antes de tocar nada: esta zona ya mordió
   varias veces y las tres causas anteriores se veían iguales entre sí.

**La prueba quedó `test.fixme`** (`e2e/mobile-a11y.spec.ts`): no se borró, no
corre, y arriba tiene todo esto en corto. Dejarla en rojo una de cada seis
corridas enseña a ignorar los rojos, que es peor que el bug.

**Lección, otra vez la misma:** una prueba que falla **a veces** puede ser un bug
que pasa **a veces**. Pasé un buen rato buscando cómo explicarla como ruido del
medidor. Tenía razón ella.

---

## Lo que el informe reconoce como bien hecho

Vale dejarlo escrito, porque es lo que no hay que romper al arreglar el resto:

- AES-GCM con llave aleatoria no extraíble y un IV nuevo por registro.
- El texto se cifra **antes** de la llamada de red.
- El saneador de HTML usa lista permitida y bloquea `javascript:`.
- No hay `{@html}`, `eval` ni `new Function` en ningún lado.
- La CSP restringe scripts, conexiones, objetos y formularios.
- El canal MCP es local por stdio: no abre ningún puerto de red.
- La visibilidad de las notas y la pausa se comprueban **al leer y al escribir**.

---

## Cola de trabajo

De a uno, en este orden. Cada tema se cierra con su commit y se tacha acá.

**Primero — lo que toca tus datos**

1. [x] **#9** la barrera que miente. Confirmado, sin cavar. Arreglo chico. **Hecho 5/8.**
2. [x] **#2** colisión de números. Cavado: la prueba falla con el código viejo, y
       el daño real es divergencia en silencio, no atasco. **Hecho 5/8.**
       **Falta el gate manual** entre tus dos aparatos.
3. [x] **#10** restaurar. Cavado: (a) reproducido con prueba, (c) medido — no
       cuelga, desaparece. Los tres arreglos hechos. **Hecho 6/8.**
4. [x] **Pedido MCP sin id.** Rechazado con razón propia (`missing-id`).
       **Hecho 6/8.**

**Segundo — cosas rotas que quedaron a la vista en la segunda pasada**

5. [x] **Capacidad de Tauri.** Permiso agregado y validado por `cargo check`; el
       fallo de cerrar ya no se disfraza de fallo de guardar. **Hecho 6/8.**
       **Falta el gate manual:** build de escritorio y cerrar con el botón rojo.
6. [x] **Borrar el renglón padre desde el menú deja la nota sin renglones.**
       Reproducido con una prueba e2e (la nota quedaba en cero, incluso tras
       recargar) e igualado al camino de la selección. **Hecho 6/8.**

**Tercero — cerrar puertas**

7. [x] **#4 + #5 juntos, un solo SQL.** `records` quedó en `for select`; `vaults`
       en `select` + `insert` (la primera bóveda gana); `push_records` pasó a
       `security definer` con el filtro de dueño explícito; `uploadVaultBlob` es
       `insert` y lee el choque `23505`. Más los dos mensajes propios, marcados
       `userFacing`. `rls-check.mjs` ahora arma con `push_records` y prueba que
       escribir directo no existe **ni sobre la fila propia**. **Hecho 6/8, con
       el SQL ya corrido en Supabase y `pnpm rls:check` en verde (7/7).**
8. [x] **#12** avisar en pantalla cuando la pausa no se pudo cumplir. La marca la
       pone `writeAgentExport`, la única puerta de las tres llamadas que tragaban
       el error, y `Configuración › Agentes` la dibuja con dos textos según haya
       pausa o no. **Hecho 6/8.**

**Cuarto — limpieza**

9. [x] Código muerto (6 cosas — `SettingsDialog` sale de la lista) y 4
       dependencias sin uso. Los comentarios que nombraban a `makeToolHandler`
       ahora nombran a `expandingHandler`; las pruebas de `ensureSidebarOrder`
       se apuntaron a `normalizeSidebarOrder`, que sí vive. **Hecho 6/8.**
10. [x] La lista de tablas, de tres copias a una: `BACKUP_TABLES` en
        `export-import/schema.ts`, que es donde ya vivía `LOCAL_ONLY_FIELDS`.
        **Hecho 6/8.**
11. [x] Comentario viejo de `schema.sql:20-24` (hablaba de un problema ya
        resuelto). Fue con el SQL de arriba: el archivo se pega entero igual, y
        dos pasadas por el editor de Supabase para cambiar un comentario no
        tienen sentido. **Hecho 6/8.**
12. [x] Comillas del comando de Claude Code: simples, con el escape estándar
        para el apóstrofo. Los otros tres clientes van por JSON o base64 y no
        pasan por un shell. **Hecho 6/8.**
13. [x] Alinear las versiones en `0.1.0`, y que el respaldo lea la de
        `package.json` en vez de tenerla escrita a mano. **Hecho 6/8.**
14. [x] **Los dos generadores de HTML**: la versión de `copy` era la correcta, y
        resultó ser `plainTextToHtml`, que ya vivía en `format/sanitize.ts`. Los
        dos la llaman, y el `escapeHtml` duplicado también salió de ahí. La
        forma de cada generador queda como está, a propósito. **Hecho 6/8.**
15. [x] Tope de tamaño al importar un archivo: 64 MB, mirado antes de leer, con
        mensaje propio en el diálogo de respaldo. **Hecho 6/8.**

**Quinto — lo que sigue siendo una función, no un parche**

16. [x] **#8** dos pestañas. Medido primero: la segunda pestaña no se refresca
        nunca, pero el daño es sólo el renglón tocado. Arreglado con
        `BroadcastChannel` avisando desde los ganchos de Dexie y entrando por la
        misma puerta que la nube. **Hecho 6/8.**

**No entra por ahora**

- Partir `Editor.svelte`. Después de todo lo de arriba.
- Cuotas y verificación de email en Supabase: es configuración del panel, no
  código.
- Las vulnerabilidades de `pnpm audit`: todas de herramientas de build.
