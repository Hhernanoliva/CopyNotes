# Fase 0 de privacidad (spec 030) — estado al cerrar sesión 2026-07-29

Punto de retomada. La dirección completa está en `specs/030-zero-knowledge-sync.md`;
acá va solo lo que ese spec no dice: qué se construyó, dónde vive, qué falta y
qué necesita la Mac de Hernan.

## Decisiones cerradas (no reabrir sin motivo nuevo)

1. **Solo nube.** La bóveda local cifrada está **descartada**, no diferida.
   Motivos en `030` D1: rompería el rescate sincrónico de `pagehide`
   (`storage/journal.ts` + `editor/Editor.svelte:344-358` — WebCrypto es async y
   el navegador no espera en el cierre), mataría los índices `noteId`/`dueDate`
   de los que dependen abrir una nota y la Agenda, y FileVault ya cubre el disco
   robado.
2. **El buzón MCP se endurece, no se elimina.** `export.json` se queda; leer con
   la app cerrada es una decisión de producto (`030` D2).

**Regla dura:** nunca volver `await`-able el camino de `pagehide` en
`journal.ts`. Si alguna fase futura necesita cifrar el diario, hay que cifrar
por adelantado al programar el guardado y dejar el resultado listo en memoria,
para que el cierre solo haga la escritura sincrónica ya preparada.

## Hecho

### En `main` (5 commits locales, **SIN subir a origin**)

| Commit | Qué |
|---|---|
| `1be5f80` | (previo) MCP recorridos más cortos — venía sin subir de antes |
| `840eb8a` | (de Hernan, "udpate") spec 030 + índice + tabla AGENT.md + 2 notas "superseded" en 029 |
| `2f52b72` | Globito del botón 🤖: el agente lee **el texto y las tareas**, no solo las tareas |
| `1fa48b7` | Buffer de copia caduca a las 24 h (`copy/serialize.ts`) |
| `bfcdbf4` | Bitácora en el respaldo — **formatVersion 5** |

### En `feat/buzon-endurecido` (2 commits, sin mergear)

| Commit | Qué |
|---|---|
| `77ff212` | Permisos 0700/0600 en el buzón, poda de `inbox/processed/` a 7 días, aviso de export viejo |
| `efe6cb3` | CSP estricta (item 5, cierra la fase 0) |

Detalles que no se deducen del diff:

- El buffer de copia trata una entrada **sin marca de tiempo como vencida**
  (son las más viejas). Efecto: el primer pegado tras actualizar pierde el
  formato una vez. Aceptado a propósito.
- `purgeStaleCopy()` corre en el arranque (`routes/+page.svelte`, después de
  `replayJournal`) porque caducar solo al leer dejaría el texto en disco para
  siempre si el usuario nunca vuelve a pegar.
- En el respaldo, `action` de la bitácora se valida como **string libre, no
  picklist**: un verbo desconocido se conserva. Una línea colgada se descarta
  **con aviso**, no rechaza el respaldo. Contrato en `specs/018`.
- Los permisos se aplican al archivo **temporal antes del `rename`**, para que
  el definitivo nunca exista abierto ni un instante.
- Un `mtime` en el futuro (reloj corrido) cuenta como reciente y **no** se borra.

## Item 5, CSP estricta — hecho (`efe6cb3`)

**Dónde quedó: en la configuración de SvelteKit (`vite.config.ts`), no en
`tauri.conf.json`.** SvelteKit la publica como `<meta>` dentro del HTML y como
cabecera en desarrollo, así que una sola política cubre la web, `pnpm dev` y la
ventana de Tauri — que carga ese mismo HTML. Una segunda política en
`tauri.conf.json` no habría sumado: el navegador aplica **todas** las que
recibe, o sea que se cruzan y bloquean en silencio cualquier cosa en la que no
coincidan. `csp: null` en Tauri se queda a propósito.

La política: `default-src 'self'`, y `connect-src` solo hacia sí misma y hacia
los orígenes IPC del escritorio. Traducido: una dependencia comprometida no
tiene a dónde mandar una nota.

Lo que apareció al probarla: la CSP **bloqueaba el script anti-parpadeo de
mode-watcher** (el que aplica el tema guardado antes del primer pintado).
SvelteKit solo firma los scripts que emite él. Arreglado con dos hashes en
`script-src` — dos porque en desarrollo el script viaja sin minificar y en el
build minificado.

Guarda contra el riesgo real (romper sin avisar): `e2e/security-csp.spec.ts`
escucha `securitypolicyviolation` y falla si algún script, fuente o imagen
queda bloqueado. También avisa cuando los hashes se desactualicen al subir de
versión mode-watcher: la consola imprime el hash nuevo para pegar.

### Lo que falta verificar en la Mac

La comunicación interna de Tauri (`ipc:`) no se puede probar desde acá. En la
Mac: `pnpm tauri dev`, abrir la consola y confirmar que **no** hay violaciones
de CSP y que el buzón/agentes siguen funcionando.

Si apareciera bloqueado el script propio de Tauri (`__TAURI_INTERNALS__`), el
plan B es mover la política a `tauri.conf.json` — ahí Tauri le agrega su propio
nonce solo — y dejar la web cubierta con una cabecera en Vercel. Volver atrás es
revertir un commit.

## Gates al cerrar

| Chequeo | Estado |
|---|---|
| Unit app | 701/701 ✅ |
| MCP | 72/72 ✅ |
| Rust (`cargo test`) | 1/1 ✅ — nuevo, cubre la poda |
| svelte-check | 2 errores **pre-existentes** en `db.migrations.test.ts` |
| e2e | 94/94 ✅ (con la CSP puesta) |

**Sobre el flake del toast "Snippet guardado"** (`sidebar-organization`, dos
toasts superpuestos → strict mode violation): la nota anterior decía "verde
aislado". No lo es — falla ~2 de cada 3 corridas aisladas, **también sin la
CSP**. Se verificó con `git stash` para no colgarle a la CSP una falla ajena.
Sigue sin arreglar: el test exige un solo toast, pero que se apilen dos en menos
de 1,8 s es comportamiento correcto de la app. Arreglo natural = `.first()` en
la aserción, dos líneas. Sin hacer, fuera del alcance de este item.

## Gate manual (Mac de Hernan)

Nada de esto se puede verificar desde acá:

- Permisos reales sobre `~/Library/Application Support/com.copynotes.app/mailbox/`
  (`ls -la` debería mostrar `drwx------` y `-rw-------`).
- Poda de `processed/` al arrancar la app.
- Aviso de export viejo visto desde un cliente MCP real.
- **CSP en la ventana de Tauri**: `pnpm tauri dev`, consola abierta, sin
  violaciones, y el buzón/agentes andando (ver el plan B más arriba).
- Recordatorio de build: `pnpm tauri build --bundles app` (el DMG revienta en su
  Mac) y `cd mcp && pnpm install --config.node-linker=hoisted --prod` para dejar
  `node_modules` plano; `pnpm install` restaura dev.

## Estado de git

- `main` = `bfcdbf4`, **5 commits por delante de `origin/main`, sin push**.
  Subirlo dispara deploy de producción en Vercel. Hernan todavía no lo autorizó.
- `feat/buzon-endurecido` = `efe6cb3`, sale de `main`, sin mergear.
- `feat/conectar-mcp` quedó en `840eb8a` — ya está contenida en `main`, se puede
  borrar.
- Todos los commits verificados **sin trazas de agente** (regla del repo hacia
  Vercel/main).

## Suelto, para más adelante

- `docs/analisis-futuro-multiplataforma.md` — sin trackear, escrito por Hernan
  el 28. Decisión suya: **dejarlo para el futuro**, no se tocó.
- Fases 1-4 de `030` (contador `seq`, cifrado al subir + cuentas, conflictos,
  rollout) sin empezar.
