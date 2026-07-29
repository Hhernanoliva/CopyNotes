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

### En `feat/buzon-endurecido` (1 commit, sin mergear)

| Commit | Qué |
|---|---|
| `77ff212` | Permisos 0700/0600 en el buzón, poda de `inbox/processed/` a 7 días, aviso de export viejo |

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

## Pendiente: item 5, CSP estricta

Único item de fase 0 sin hacer. `src-tauri/tauri.conf.json` tiene
`"security": { "csp": null }`.

**Reversibilidad: alta.** Una línea, ningún dato tocado, ninguna migración. El
riesgo no es no poder volver — es que **rompa en silencio** (un ícono que no
carga, un botón que no responde, sin cartel de error).

Plan acordado, sin empezar:

1. Escribir la política.
2. **Probarla contra la app web** (`pnpm dev` + los 93 e2e). Agarra roturas de
   estilos, scripts, fuentes e hidratación de Svelte — es el mismo bundle.
3. Aplicarla al escritorio, en **commit propio** para que revertir sea uno solo.
4. Hernan corre `pnpm tauri dev` y mira la consola: las violaciones de CSP se
   anuncian con nombre y apellido.
5. Ajustar según lo que aparezca.

Lo que el paso 2 **no** cubre: la comunicación interna Tauri (`ipc:`,
`http://ipc.localhost`). Eso solo se ve en la Mac. El skill `verify` maneja la
app web, no el envoltorio de escritorio.

## Gates al cerrar

| Chequeo | Estado |
|---|---|
| Unit app | 701/701 ✅ |
| MCP | 72/72 ✅ |
| Rust (`cargo test`) | 1/1 ✅ — nuevo, cubre la poda |
| svelte-check | 2 errores **pre-existentes** en `db.migrations.test.ts` |
| e2e | 92-93 de 93 |

**Flakes conocidos bajo carga, verdes aislados, NO son de esta tanda:**
`sidebar-organization` toast "Snippet guardado" (dos toasts superpuestos →
strict mode violation) y `dates:144` menú `/fecha`. La rama del buzón **no toca
`src/` ni `e2e/`**, así que no puede causar fallos de la app web.

## Gate manual (Mac de Hernan)

Nada de esto se puede verificar desde acá:

- Permisos reales sobre `~/Library/Application Support/com.copynotes.app/mailbox/`
  (`ls -la` debería mostrar `drwx------` y `-rw-------`).
- Poda de `processed/` al arrancar la app.
- Aviso de export viejo visto desde un cliente MCP real.
- Recordatorio de build: `pnpm tauri build --bundles app` (el DMG revienta en su
  Mac) y `cd mcp && pnpm install --config.node-linker=hoisted --prod` para dejar
  `node_modules` plano; `pnpm install` restaura dev.

## Estado de git

- `main` = `bfcdbf4`, **5 commits por delante de `origin/main`, sin push**.
  Subirlo dispara deploy de producción en Vercel. Hernan todavía no lo autorizó.
- `feat/buzon-endurecido` = `77ff212`, sale de `main`, sin mergear.
- `feat/conectar-mcp` quedó en `840eb8a` — ya está contenida en `main`, se puede
  borrar.
- Todos los commits verificados **sin trazas de agente** (regla del repo hacia
  Vercel/main).

## Suelto, para más adelante

- `docs/analisis-futuro-multiplataforma.md` — sin trackear, escrito por Hernan
  el 28. Decisión suya: **dejarlo para el futuro**, no se tocó.
- Fases 1-4 de `030` (contador `seq`, cifrado al subir + cuentas, conflictos,
  rollout) sin empezar.
