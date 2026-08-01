# El buzón del agente, a prueba de cortes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una orden del agente nunca se pierde en silencio, nunca se aplica dos veces, y una que quedó esperando con la app cerrada se aplica al abrir **avisándote**, con un tope de 7 días.

**Architecture:** Hoy Rust da por procesado un pedido apenas se lo pasa a la app, y la app aplica el cambio y *después* anota "esto ya lo hice", en dos escrituras sueltas. El plan invierte las dos cosas: (a) el archivo del pedido se mueve a `processed/` recién cuando la app **confirma** — la confirmación viaja por un comando nuevo, `bridge_ack`, y el pedido no confirmado sobrevive al corte y se vuelve a leer en el próximo arranque; (b) aplicar el cambio y anotar el identificador pasan a ser **una sola escritura** de la base, así una reentrega nunca duplica. El aviso al abrir usa el `toast` que la app ya tiene.

**Tech Stack:** Rust (Tauri 2, `notify`, `serde_json`), SvelteKit + Svelte 5 (runes), Dexie, Vitest (proyecto `jsdom`, con `fake-indexeddb`), `cargo test`.

**Spec / origen:** `docs/revision-hallazgos-agente-2026-07-31.md` puntos **#3, #4 y #5**.

## El orden importa (no reordenar las tareas)

Hoy no existe la reentrega: el archivo se mueve al toque, así que un pedido se aplica **como mucho** una vez. La Tarea 1 es la que **crea** la posibilidad de reentrega. Si la Tarea 1 entra antes que la Tarea 2, durante ese rato un corte a mitad de camino puede duplicar una tarea.

**Por eso: Tarea 2 primero (blindar contra duplicados), después Tarea 1 (habilitar la reentrega), después Tarea 3 (el aviso).**

## Global Constraints

- JavaScript plano dentro de archivos `.ts`/`.svelte`: **sin anotaciones de tipo** en código escrito a mano (CLAUDE.md).
- Comentarios **en el idioma que ya usa cada archivo**: `bridge.rs`, `bridge/tauri.ts`, `bridge/ingest.ts`, `storage/dedupe.ts` y `BridgeLifecycle.svelte` están **en inglés**; `docs/guia/` en español. Seguir el archivo, no inventar criterio nuevo.
- **Cada cambio visible para la persona se documenta en `docs/guia/` en el mismo commit que lo implementa**, y se actualiza la fecha "Última actualización" del índice `docs/guia-de-uso.md` (CLAUDE.md). Acá el único cambio visible es el cartel de la Tarea 3.
- Los commits **no llevan `Co-Authored-By` ni ninguna marca de agente** (este repo despliega a Vercel).
- Commit por tarea, no al final (memoria `copynotes-commit-granularity`).
- El buzón lleva el texto de las notas en claro: todo archivo o carpeta nueva mantiene `0600` / `0700` con el helper `restrict` que ya existe (`bridge.rs:13-20`).
- Comandos: `pnpm test` (unitarias), `cargo test --manifest-path src-tauri/Cargo.toml`, `pnpm check` (svelte-check). Ojo: `pnpm test` **no** corre Cargo ni Playwright — hay que correrlos a mano.

## Decisiones tomadas al escribir el plan

1. **Orden vieja = se aplica y te avisamos** (elección de Hernán). Nada de pantalla de confirmación. Tope de 7 días reusando la constante `PROCESSED_TTL` que ya existe en `bridge.rs:26`, no una constante nueva.
2. **Pruebas: solo el nivel barato** (elección de Hernán). Vitest para "no duplica ni pierde", `cargo test` para "el archivo se mueve recién con la confirmación". La prueba de punta a punta (cliente MCP → buzón → Rust → app → interfaz) queda **anotada como deuda**, no entra acá.
3. **La confirmación es un comando nuevo (`bridge_ack`), no `bridge_write_outbox`.** Tentaba reusar `bridge_write_outbox` como confirmación —ya se llama justo después de aplicar— pero solo se llama cuando el pedido **tiene identificador**. Un archivo roto (JSON inválido, o sin `id`) nunca llamaría, se quedaría en la bandeja para siempre y se re-leería en cada arranque, eternamente. `bridge_ack` va por nombre de archivo, así que confirma **siempre**, incluso para basura.
4. **El evento cambia de forma: de texto suelto a `{ file, text, boot }`.** La app necesita saber el nombre del archivo para confirmarlo, y si vino del barrido de arranque (para el cartel). Es un cambio interno entre Rust y la app, no toca el protocolo del buzón que ve el servidor MCP (`mcp/lib/mailbox.js` **no se toca en todo el plan**).
5. **El pedido rechazado por el portero no necesita ser atómico.** Si la nota no es visible o el renglón no es una tarea, no se escribió nada — anotar el identificador después es inofensivo. La escritura única de la Tarea 2 aplica solo al camino que **sí** cambia datos.
6. **`createTask` recibe el `order` ya resuelto desde `ingest.ts`.** `actions.ts:47-58` ya avisa por qué: resolver el orden adentro hace una lectura encadenada que, envuelta en `trackPendingWrite`, se sale de la zona de la transacción de Dexie y la cierra antes de tiempo (`PrematureCommitError`). El editor ya pasa el orden por esta misma razón. `tasks/actions.ts` **no se modifica**.

---

## Task 2: Aplicar el cambio y anotarlo, en una sola escritura

*(Va primera — ver "El orden importa".)*

**Files:**
- Modify: `src/lib/storage/dedupe.ts`
- Modify: `src/lib/storage/index.ts` (exportar la variante nueva)
- Modify: `src/lib/bridge/ingest.ts:29-106`
- Modify: `src/lib/bridge/ingest.test.ts` (agregar pruebas al final)

**Interfaces:**
- Produces: `putProcessedChangeInTx(id, outcome)` — misma anotación que `recordProcessedChange`, pero **sin** `trackPendingWrite` y **sin** abrir transacción propia: pensada para llamarse *dentro* de una transacción ya abierta. Devuelve el `outcome`.
- Consumes: `db.transaction('rw', ...)` de Dexie; `listChildBlocks` de `$lib/storage`.

- [ ] **Step 1: Sacar la variante de anotación que sirve dentro de una transacción**

En `src/lib/storage/dedupe.ts`, extraer el cuerpo de `recordProcessedChange` a una función exportada sin envoltorio, y dejar la original llamándola:

```js
// The same ledger write, WITHOUT trackPendingWrite and without opening its own
// transaction: for callers that are already inside one (bridge/ingest.ts, where
// applying the change and recording its id must commit together or not at all).
// trackPendingWrite wraps the work in a NATIVE promise, which leaves Dexie's
// transaction zone and commits it early — see tasks/actions.ts for the same trap.
export async function putProcessedChangeInTx(id, outcome) {
	const stamp = now();
	const cutoff = Date.parse(stamp) - TTL_MS;
	const existing = (await settings.get(DEDUPE_SETTING_KEY))?.value ?? {};
	const value = {};
	for (const key of Object.keys(existing)) {
		const entry = existing[key];
		const dated = isDated(entry) ? entry : { at: stamp, outcome: entry };
		if (Date.parse(dated.at) >= cutoff) value[key] = dated;
	}
	value[id] = { at: stamp, outcome };
	await settings.put({ key: DEDUPE_SETTING_KEY, value, updatedAt: stamp });
	return outcome;
}

export function recordProcessedChange(id, outcome) {
	return trackPendingWrite(() => putProcessedChangeInTx(id, outcome));
}
```

Exportarla en `src/lib/storage/index.ts` junto a `recordProcessedChange`.

- [ ] **Step 2: Separar "revisar" de "aplicar" en `ingest.ts`**

`applyChange` hoy hace las dos cosas en una. Partirla: `checkChange(change)` corre **todos los porteros y las lecturas** (tipo permitido, bloque existe, nota visible, es tarea, identidad del agente, y —para `createTask`— el orden del renglón nuevo) y devuelve o un rechazo o una función `run()` lista para ejecutar. Nada de esto abre transacción.

Puntos a respetar, que ya están y no se cambian:
- `Object.hasOwn(HANDLERS, type)` (no un `HANDLERS[type]` pelado).
- La nota se resuelve **desde el bloque destino**, nunca desde `change.noteId`, salvo en `createTask`.
- El orden de los porteros: visibilidad **antes** de "es una tarea".
- `resolveAgentActor()` corre acá, **fuera** de la transacción: hace un `get` y puede crear el agente, y `setConnectedAgent` usa `trackPendingWrite`.

Para `createTask`, resolver el orden acá y pasarlo explícito:

```js
// Resolve the new row's order OUTSIDE the transaction: listChildBlocks is a
// chained Collection read, exactly what actions.ts warns commits a wrapping
// transaction early. The editor passes `order` for this same reason.
const siblings = await listChildBlocks(noteId, null);
run = () => createTask({ noteId, content, actor, order: siblings.length });
```

- [ ] **Step 3: Una sola escritura para el cambio y su anotación**

`ingestAgentChangeUnsafe` queda así: revisar primero; si hay rechazo, anotarlo por el camino de siempre (`recordProcessedChange`); si pasa, **una** transacción que abarque las tres tablas:

```js
async function ingestAgentChangeUnsafe(change) {
	if (change?.id) {
		const seen = await getProcessedChange(change.id);
		if (seen) return seen;
	}

	const checked = await checkChange(change);
	if (!checked.run) {
		const result = changeResult(change?.id, { ok: false, reason: checked.reason });
		if (change?.id) await recordProcessedChange(change.id, result);
		return result;
	}

	// The change and its dedupe entry commit TOGETHER. Before this, a crash
	// between the two left a task applied but unrecorded — and once the inbox
	// file survives an unconfirmed delivery (bridge.rs ack), that file is
	// redelivered on the next boot and the task would be created twice.
	// `settings` joins the scope because the ledger lives there (storage/dedupe.ts).
	return trackPendingWrite(() =>
		db.transaction('rw', db.table('blocks'), db.table('activity'), db.table('settings'), async () => {
			const result = changeResult(change?.id, { ok: true, result: await checked.run() });
			if (change?.id) await putProcessedChangeInTx(change.id, result);
			return result;
		})
	);
}
```

`ingestChain` (la fila de a uno) queda **igual**: sigue haciendo falta para la reentrega simultánea.

- [ ] **Step 4: Probar que sigue verde y que la escritura es de verdad única**

Correr `pnpm test` primero: las 17 pruebas de `ingest.test.ts` ya cubren porteros, idempotencia y la nube. **Si aparece `PrematureCommitError`, es que quedó una lectura encadenada adentro de la transacción** — el sospechoso es el orden de `createTask` (Step 2).

Agregar dos pruebas al final de `ingest.test.ts`:

```
it('records the change id in the SAME transaction as the task it created', ...)
```
Aplicar un `createTask` y verificar que, después, `getProcessedChange(id)` devuelve el resultado **y** la tarea existe. Después forzar el fallo: espiar `db.table('settings').put` para que tire una vez, reintentar el ingreso, y verificar que **no quedó tarea suelta** (la transacción se deshizo entera) y que un reintento posterior crea **una** sola.

```
it('a rejection still records its id without opening a write transaction', ...)
```
Un `createTask` sobre nota no visible: `getProcessedChange` devuelve el rechazo y `listTasks` sigue vacío.

- [ ] **Step 5: Commit**

`fix(agente): la orden y su registro se guardan juntos o no se guardan`

---

## Task 1: El pedido se da por procesado recién cuando la app confirma

**Files:**
- Modify: `src-tauri/src/bridge.rs:83-163` y el bloque `mod tests` del final
- Modify: `src-tauri/src/lib.rs` (registrar `bridge_ack`)
- Modify: `src/lib/bridge/tauri.ts:28-70`

**Interfaces:**
- Produces (Rust): `bridge_ack(file: String)` — mueve `inbox/<file>` a `inbox/processed/<file>`. Valida el nombre igual que `bridge_write_outbox` (solo alfanuméricos, `-`, `_`, `.`, ≤128, sin separadores de ruta). Devuelve `Ok(())` también si el archivo ya no está (confirmar dos veces es inofensivo).
- Produces (evento): `bridge://change` pasa a llevar un objeto JSON `{ file, text, boot }` en vez del texto suelto. `file` es el nombre del archivo, `text` su contenido crudo, `boot` es `true` solo si lo levantó el barrido de arranque.
- **No cambia** el protocolo del buzón hacia afuera: `mcp/lib/mailbox.js` no se toca.

- [ ] **Step 1: Que el nombre del archivo viaje con el pedido, y que la basura salga sola**

En `bridge.rs`, `process_inbox_file` deja de mover el archivo y pasa a mandar el sobre. El nombre se valida **antes** de emitir: si no sirve como identificador, nadie va a poder confirmarlo nunca, así que se archiva en el acto y no se emite.

```rust
// A file is given up for processed ONLY when the webview confirms it applied
// (bridge_ack). Until then it stays in inbox/: a crash between the emit and the
// answer used to lose the request for good — now the next startup sweep finds it
// again, and the JS side dedupes by change id so a replay applies at most once.
fn process_inbox_file(app: &tauri::AppHandle, path: &Path, processed: &Path, boot: bool) {
    let Some(name) = path.file_name().and_then(|n| n.to_str()).map(|s| s.to_string()) else {
        return;
    };
    // A name we could never ack is a dead letter: archive it now instead of
    // re-emitting it on every boot forever.
    if !is_ackable_name(&name) {
        let _ = fs::rename(path, processed.join(&name));
        return;
    }
    if let Ok(text) = fs::read_to_string(path) {
        let payload = serde_json::json!({ "file": name, "text": text, "boot": boot });
        if let Err(e) = app.emit("bridge://change", payload) {
            log::warn!("bridge emit failed: {e}");
        }
    }
}
```

`is_ackable_name` es la misma regla que ya usa `bridge_write_outbox:167-172`, extraída a función y reusada por los dos (un solo lugar donde vive la regla, no dos que se desincronizan). Acepta el punto porque el nombre trae `.json`.

Actualizar las dos llamadas: el barrido de arranque pasa `true`, el bucle del watcher pasa `false`.

- [ ] **Step 2: El comando de confirmación**

```rust
// The webview's "I applied it (or definitively answered it)" signal. Only now
// does the request leave the inbox. Idempotent: acking a file that is already
// gone is not an error — a double ack must never fail a tool call.
#[tauri::command]
pub fn bridge_ack(app: tauri::AppHandle, file: String) -> Result<(), String> {
    if !is_ackable_name(&file) {
        return Err("invalid file".to_string());
    }
    let dir = mailbox_dir(&app)?;
    let inbox = dir.join("inbox");
    let processed = inbox.join("processed");
    fs::create_dir_all(&processed).map_err(|e| e.to_string())?;
    restrict(&processed, 0o700);
    let source = inbox.join(&file);
    if !source.exists() {
        return Ok(());
    }
    fs::rename(&source, processed.join(&file)).map_err(|e| e.to_string())
}
```

Registrarlo en `src-tauri/src/lib.rs` junto a los demás `bridge_*`.

- [ ] **Step 3: Que la app confirme siempre, pase lo que pase**

En `src/lib/bridge/tauri.ts`, `startBridgeWatch` recibe ahora el sobre. La confirmación va en un `finally`: un JSON roto, un `id` faltante o una excepción **igual** confirman, si no el archivo se re-lee en cada arranque para siempre.

```js
const unlisten = await listen('bridge://change', async (event) => {
    const envelope = event.payload;
    const file = envelope?.file;
    let change;
    try {
        change = JSON.parse(envelope?.text ?? '');
    } catch {
        change = null; // malformed/partial inbox file: nothing to apply, but still ack
    }
    try {
        if (!change) return;
        const result = await ingestAgentChange(change);
        // ... (el bloque de outbox de hoy, sin cambios)
    } catch (error) {
        // ... (el bloque de error de hoy, sin cambios)
    } finally {
        // ALWAYS: an unacked file is replayed on every boot. Garbage included.
        if (file) await invoke('bridge_ack', { file }).catch((e) => console.error('bridge_ack failed', e));
    }
});
```

Ojo con el `return` temprano: hoy está fuera de un `try`, así que hay que meterlo adentro para que el `finally` corra igual.

- [ ] **Step 4: Prueba Rust**

Agregar al `mod tests` de `bridge.rs`, al lado de la que ya está:

```
fn ack_moves_the_file_and_an_unacked_one_stays()
```
Armar un directorio temporal con `inbox/` + `inbox/processed/`, dejar dos archivos, mover uno con la lógica de `bridge_ack` (extraer el movimiento a una función libre de `AppHandle` para poder probarla — `ack_in(inbox: &Path, file: &str)`), y verificar: el confirmado está en `processed/` y ya no en `inbox/`; el otro sigue en `inbox/`. Sumar un caso de nombre inválido (`"../x.json"`) que devuelve error y no mueve nada.

Correr `cargo test --manifest-path src-tauri/Cargo.toml`.

- [ ] **Step 5: Commit**

`fix(agente): una orden se da por hecha recién cuando la app la confirma`

---

## Task 3: El aviso al abrir, y el tope de 7 días

**Files:**
- Modify: `src-tauri/src/bridge.rs` (una línea en `bridge_start_watch`)
- Modify: `src/lib/bridge/tauri.ts` (pasar `boot` hacia arriba)
- Modify: `src/lib/bridge/BridgeLifecycle.svelte`
- Modify: `src/routes/+page.svelte:588`
- Modify: `docs/guia/17-agentes.md` y `docs/guia-de-uso.md` (fecha)

**Interfaces:**
- `startBridgeWatch(onIngested)` → el callback pasa a recibir `{ boot }`.
- `BridgeLifecycle` gana una prop `onAgentBacklog(count)`, que `+page.svelte` engancha a un `toast`.

- [ ] **Step 1: El tope de 7 días, gratis**

En `bridge_start_watch`, junto a los dos `prune_stale_files` que ya están, agregar la bandeja de entrada — **antes** del barrido, para que un pedido de hace meses ni se emita:

```rust
// A request nobody could deliver in a week is not a pending order any more,
// it's the user's own task text sitting on disk. Same TTL as processed/ and
// outbox/. Runs BEFORE the sweep so an ancient request is never applied.
prune_stale_files(&inbox);
```

`prune_stale_files` ya salta subdirectorios (`path.is_file()`), así que `processed/` no corre riesgo. Cero constantes nuevas.

- [ ] **Step 2: Contar lo que entró del barrido y avisar una sola vez**

En `tauri.ts`, cuando el ingreso sale bien, pasar el origen: `onIngested?.({ boot: envelope?.boot === true })`.

En `BridgeLifecycle.svelte`, juntar los del arranque en un contador con un respiro corto (llegan de a uno, seguidos) y avisar **una** vez:

```js
// Orders that waited in the mailbox while the app was closed arrive one by one
// during the startup sweep. Count them behind a short quiet window so the person
// gets ONE line ("an agent did 3 things"), not three toasts in a row.
let backlog = 0;
let backlogTimer;
function noteBacklog() {
    backlog += 1;
    clearTimeout(backlogTimer);
    backlogTimer = setTimeout(() => {
        onAgentBacklog?.(backlog);
        backlog = 0;
    }, 800);
}
```

Limpiar el `timeout` en el `return` del `$effect` que ya envuelve el watcher (regla del proyecto: todo `$effect` que arma algo externo devuelve su limpieza).

- [ ] **Step 3: El cartel**

En `+page.svelte:588`:

```svelte
<BridgeLifecycle
	onAgentIngested={handleExternalChange}
	onAgentBacklog={(count) =>
		toast.info(
			count === 1
				? 'Mientras CopyNotes estaba cerrada, un agente hizo 1 cambio.'
				: `Mientras CopyNotes estaba cerrada, un agente hizo ${count} cambios.`
		)}
/>
```

Sin botón de deshacer: la bitácora de cada tarea ya cuenta quién la tocó, y Ajustes muestra el historial reciente.

- [ ] **Step 4: Documentar en la guía**

En `docs/guia/17-agentes.md`, en la sección que ya explica qué pasa con la app cerrada (cerca de la línea 120), sumar en castellano llano: que un pedido hecho con la app cerrada **queda esperando y se aplica cuando abrís**, que te avisa un cartel, y que si pasó más de una semana se descarta solo. Actualizar la fecha "Última actualización" en `docs/guia-de-uso.md`.

- [ ] **Step 5: Verificación a mano (única forma de ver esto funcionando)**

Ninguna prueba automática cubre este camino. Con la app **cerrada**, desde Claude Code: `create_task`. Va a contestar "sin confirmación todavía". Abrir CopyNotes: la tarea aparece **y** sale el cartel. Repetir el mismo pedido con la app abierta y confirmar que **no** aparece duplicada.

- [ ] **Step 6: Commit**

`feat(agente): avisar lo que el agente hizo mientras la app estaba cerrada`

---

## Desvíos al implementar (2026-07-31, rama `fix/buzon-a-prueba-de-cortes`)

1. **`bridge_write_outbox` conserva su propia validación, no reusa `is_safe_name`.** El plan decía "una sola regla para los dos". Al escribirla se vio que son dos reglas distintas: el nombre de archivo **necesita** el punto de `.json`, y un identificador de pedido **no debe** tener puntos. Unificarlas hubiera aflojado la validación del identificador sin ninguna necesidad. La función nueva se llama `is_safe_name` y la usan el `ack` y el descarte de cartas muertas; la del outbox queda como estaba.
2. **La confirmación también se manda cuando el ingreso falló con error.** El plan decía "confirmar siempre" sin distinguir. Se mantiene: en ese caso la app **sí** contestó (escribe `{ ok:false, reason:'error' }` en la respuesta), así que no hay nada que reintentar. El único caso que no confirma es que la app se muera antes de contestar — y ahí el `finally` no llega a correr, que es justo el pedido que queremos que vuelva.

## Deuda que este plan deja anotada a propósito

1. **La prueba de punta a punta** (cliente MCP → buzón → Rust → app → interfaz) sigue sin existir. Es la que daría confianza para tocar esta zona sin miedo; queda para su propio plan.
2. **La app no le avisa al agente** cuando algo cambió de este lado — el agente se entera solo si vuelve a mirar. Sigue igual (es el punto #11 de la revisión).
3. **Un pedido reentregado no le llega al cliente MCP que lo pidió**: ese proceso ya se fue hace rato. La respuesta se escribe igual en `outbox/`, y la limpieza de 7 días se la lleva. Es correcto, pero conviene saberlo.
