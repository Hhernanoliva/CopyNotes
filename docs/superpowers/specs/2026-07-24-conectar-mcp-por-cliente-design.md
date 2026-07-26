# Conectar el MCP a un agente — configuración por cliente (Claude Code / OpenCode / Cursor)

**Fecha:** 2026-07-24
**Estado:** diseño conversado con Hernán; pendiente su revisión del spec escrito.
**Contexto previo:** specs/028-agent-beta-local-mcp.md (buzón + server MCP), Ajustes › Agentes actual
(bloque "Conectar un agente (MCP)" con un JSON genérico y placeholder `<ruta-a-CopyNotes>`).

## Problema

Conectar el server MCP de CopyNotes a un agente es engorroso. Hernán marcó las 4 fricciones:
reemplazar la ruta a mano, editar el archivo de config del cliente, no saber si funcionó, y
acordarse de dejar la app abierta. El JSON de hoy trae `args: ['<ruta-a-CopyNotes>/mcp/server.js']`
— el usuario tiene que averiguar y pegar la ruta absoluta, y encima ese JSON solo sirve para
clientes con formato tipo Claude Desktop.

## Decisiones tomadas (con Hernán)

1. **Clientes objetivo: Claude Code (CLI), OpenCode, Cursor.** NO Claude Desktop → el formato
   `.mcpb` (extensión de un clic, exclusiva de Desktop) queda descartado.
2. **Enfoque: opción 1 "copiar-pegar a prueba de balas"**, no la opción 2 (que CopyNotes escriba
   el archivo de otra app — riesgosa). Excepción elegante: el **botón deeplink de Cursor** SÍ es un
   clic real, porque es un mecanismo oficial del propio Cursor y lo dispara el usuario.
3. **Distribución del server: (a) empaquetarlo dentro de la app** (Tauri resource), no publicarlo en
   npm. Autocontenido, siempre en sincronía con la versión de la app, offline. `npx`/npm descartado
   (mismo resultado, doble mantenimiento; además el server necesita la app abierta, así que no hay
   caso "correr sin la app" donde npx brillaría).
4. **La ruta del server la rellena CopyNotes** — el usuario nunca la ve ni la edita.

## Formatos confirmados (investigación 2026)

- **Claude Code:** `claude mcp add copynotes -e CN_MAILBOX=<ruta> -- node <server.js>`
  (guarda en `~/.claude.json`; `-s user` = global). Un solo comando.
- **OpenCode** (`~/.config/opencode/opencode.json`):
  ```json
  { "mcp": { "copynotes": {
      "type": "local",
      "command": ["node", "<server.js>"],
      "enabled": true,
      "environment": { "CN_MAILBOX": "<ruta>" }
  } } }
  ```
- **Cursor** (`~/.cursor/mcp.json`, forma `mcpServers`):
  ```json
  { "mcpServers": { "copynotes": {
      "command": "node",
      "args": ["<server.js>"],
      "env": { "CN_MAILBOX": "<ruta>" }
  } } }
  ```
  Deeplink de un clic: `cursor://anysphere.cursor-deeplink/mcp/install?name=copynotes&config=<BASE64>`,
  donde `<BASE64>` es el objeto de config del server (`{command, args, env}`) en base64.

Fuentes: MCPB repo/docs (por qué NO aplica), OpenCode docs (mcp-servers), Cursor MCP setup +
deeplink format, Claude Code `claude mcp add` docs.

## Diseño

### 1. Empaquetar el server como recurso de la app

`src-tauri/tauri.conf.json` gana una clave `bundle.resources` que incluye el server MCP y sus
dependencias de runtime:

```json
"resources": { "../mcp/server.js": "mcp/server.js", "../mcp/lib": "mcp/lib", "../mcp/node_modules": "mcp/node_modules" }
```

(Forma exacta a validar en el plan — puede ser un glob `"../mcp/**"` excluyendo tests/lock.)

- **Riesgo #1 (bloqueante para el plan):** `mcp/node_modules` lo instaló pnpm con symlinks al store
  `.pnpm`. Tauri copia archivos, no symlinks → hay que producir un `node_modules` **plano** (archivos
  reales) para bundlear: `pnpm install --config.node-linker=hoisted` en `mcp/`, o `pnpm deploy`, o un
  `npm install` dedicado para el artefacto. El plan define el paso de build.
- **Riesgo #2:** el `.DS_Store` y los `*.test.js`/lock no deben ir al bundle (peso/limpieza).

### 2. Comando Rust que devuelve la ruta del server

Nuevo `#[tauri::command] bridge_server_path(app) -> Result<String, String>` en `src-tauri/src/bridge.rs`
(registrado en `lib.rs`, junto a `bridge_mailbox_path`). Resuelve así:

1. **Empaquetado:** `app.path().resource_dir()?.join("mcp/server.js")` — si existe, esa.
2. **Dev (fallback):** `concat!(env!("CARGO_MANIFEST_DIR"), "/../mcp/server.js")` — `CARGO_MANIFEST_DIR`
   apunta a `src-tauri/` en compilación de dev, así que `../mcp/server.js` es el server del repo.
   Elegir dev-vs-empaquetado por existencia del archivo de recurso (probar resource_dir primero).

Espeja a `getMailboxPath()`: `tauri.ts` gana `getServerPath()` (desktop-gated, `null` off-desktop).

### 3. UI por cliente en Ajustes › Agentes

El bloque "Conectar un agente (MCP)" actual (hoy: un JSON genérico) se reescribe en **tres
sub-bloques**, cada uno con su copy exacto y su ruta ya rellenada (`serverPath` + `mailboxPath`),
todos `{#if mailboxPath && serverPath}` (desktop-only; off-desktop la línea muted de hoy). Derivados
(`$derived`) que arman cada string:

- **Claude Code:** una línea de comando + botón "Copiar" (patrón de copia existente: icono → tilde).
  Texto de ayuda: "Pegalo en tu terminal una vez."
- **OpenCode:** el bloque JSON + botón "Copiar" + botón "Abrir carpeta de config" que abre
  `~/.config/opencode/` en Finder (Tauri opener/shell). Texto: "Pegá esto en `opencode.json`."
- **Cursor:** un **botón/enlace "Añadir a Cursor"** cuyo `href` es el deeplink
  `cursor://…/mcp/install?name=copynotes&config=<base64>` (base64 del objeto `{command,args,env}`
  con las rutas reales) — un clic abre Cursor y lo instala. Debajo, el JSON de `~/.cursor/mcp.json`
  como respaldo, con su botón "Copiar".

El buzón sigue mostrándose arriba (ya existe). El generador de base64 vive en el `$derived` de Cursor
(`btoa` sobre `JSON.stringify(config)`; ojo con UTF-8 en rutas — usar el patrón `btoa(unescape(encodeURIComponent(...)))`).

### 4. Aviso "mantené la app abierta"

Un cartelito fijo y claro en la sección (arriba de los sub-bloques): **"El agente solo funciona con
CopyNotes abierta."** Trivial; cierra la fricción #4.

### 5. Señal "un agente se conectó" (v1 — fricción #3)

CopyNotes muestra en Ajustes › Agentes: **"Un agente se conectó — hace X"** (o "Ningún agente
conectado todavía"). Mecanismo mínimo a validar en el plan:

- `mcp/server.js`, al arrancar (después de `transport.connect`), escribe un **heartbeat** al buzón:
  un archivo de estado dedicado (p. ej. `mailbox/agent-status.json` con `{ connectedAt }`), fuera de
  `inbox/` para NO pasar por el gate de ingesta (no es un cambio, es una señal de vida). Refrescarlo
  también en cada tool call para el "hace X".
- Lado app: un `#[tauri::command] bridge_read_status(app)` que lee ese archivo (o `null` si no existe),
  y la UI lo muestra. Alternativa a evaluar en el plan: leer el `mtime` del archivo en vez de su JSON.
- Nota: Cursor y OpenCode ya muestran del lado del cliente si el MCP conectó; esta señal es la
  confirmación del lado de CopyNotes, que era lo que faltaba.

## Fuera de alcance (follow-ups)

- `.mcpb` para Claude Desktop (no es cliente de Hernán).
- Publicar en npm / `npx` (decisión (b), descartada).
- MCP remoto/HTTP.
- Requisito **node instalado**: los tres clientes de Hernán ejecutan `node`, que él ya tiene. Para
  distribución a terceros sin node, es un tema aparte (no lo resuelve el empaquetado).

## Pruebas

- **Unit (`mcp/` o Rust):** el generador de config por cliente produce las strings correctas dado
  `serverPath`+`mailboxPath` (Claude Code command, OpenCode JSON, Cursor JSON, y el deeplink base64
  decodifica al objeto esperado). Idealmente en JS puro (pure builders), testeable sin DOM.
- **e2e (navegador):** off-desktop la sección muestra la línea muted (sin sub-bloques), como hoy.
  Los botones "Copiar" fijan el portapapeles (patrón existente de e2e de copia).
- **Manual (desktop, Hernán):** en cada cliente real, copiar/clic → el agente lista tareas y crea una,
  con CopyNotes abierta. El deeplink de Cursor abre Cursor y agrega el server.
- **Build:** `pnpm tauri build` produce un `.app` que trae `mcp/` en recursos y `bridge_server_path`
  devuelve una ruta existente.

## Guía de uso

Reescribir `docs/guia/17-agentes.md` (sección "Conectar un agente por MCP"): pasos por cliente
(Claude Code / OpenCode / Cursor), el botón de un clic de Cursor, y el recordatorio de la app abierta.
Actualizar fecha del índice. En el mismo commit que la UI.
