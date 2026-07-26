# Eficiencia de tokens del canal agente ↔ CopyNotes — documento de diseño

**Fecha:** 2026-07-25
**Estado:** diseño en discusión con Hernán. NADA implementado todavía. Este doc cierra la sesión de brainstorming para retomar con contexto fresco.
**Por qué importa (Hernán):** este canal es la **base competitiva** de CopyNotes para salir al mercado contra Notion, Workflowy, etc. Esos productos son **caros en tokens** para tareas simples. La ventaja de CopyNotes = exponerle al agente lo justo, en la menor cantidad de tokens posible. Merece pulirse bien ANTES de construir.

---

## Contexto: cómo funciona hoy el canal

El agente (Claude Code / OpenCode / Cursor) se conecta por MCP y ve las notas que el usuario marcó **"Visible para agentes"** (🤖). Arquitectura en 3 capas:

1. **Export** (`src/lib/bridge/export.ts`): arma `export.json` en el buzón. Filtra `agentVisible === true` y, dentro de cada nota, **solo los bloques `type === 'todo'`** (tareas). Descarta el texto suelto (prosa). Cada tarea lleva su **bitácora** (historial de acciones).
2. **Resources** (`mcp/lib/resources.js`): mapea `export.json` → recursos MCP. `notesToResources` = una entrada por nota (uri + título). `noteToResourceContent` = al leer una nota, proyecta sus tareas (dropea `html`, corta bitácora a las últimas 5).
3. **Tools** (`mcp/lib/tools.js` + `mcp/server.js`): `create_task`, `complete_task`, `add_note`. Solo acciones sobre tareas.

**Privacidad = doble candado:** (1) el flag `agentVisible`, y (2) el export que **físicamente descarta la prosa**. Ni un bug podría filtrar el texto suelto, porque nunca sale de la app. Ver [[copynotes-ingest-gate]] y [[copynotes-block-html-sink]].

---

## Realidad medida (números reales de la app de Hernán, nota de bienvenida, 11 tareas)

Medición hecha 2026-07-25 sobre `export.json` real (aprox. tokens = chars / 4).

### Costo BASE (una vez por sesión, NO por pedido)
- **Las 3 tools** (nombre + descripción + esquema): **~108 tokens**. Se cargan una sola vez en el contexto de la sesión. Agregar 2-3 tools de edición sumaría ~100-200 tokens, también una sola vez. **Conclusión: la base es despreciable. No es el problema.**
- La "puerta" MCP (listar recursos = títulos + uris) es metadata chica, mayormente del lado del cliente. Casi 0 tokens del modelo. `resources/list_changed` (si se agrega) = plomería cliente-server, **0 tokens del agente**.

### Costo POR LECTURA de una nota (lo que SÍ escala)
Leer la nota de bienvenida hoy = **~1.769 tokens**. Desglose:

| Componente | Tokens | Valor para el agente |
|---|---|---|
| **Texto real de las tareas** (`content`) | **~180** | ✅ Lo útil |
| Bitácora (`activity.text`, hasta 5 por tarea) | ~683 | Historial; útil a veces, caro |
| UUIDs (id de tarea + id de actor) | ~360 | ❌ Ruido |
| Timestamps ISO (`at`) | ~114 | ❌ Ruido |
| Estructura JSON + resto | ~432 | Overhead |

**Hallazgo central:** de ~1.769 tokens, lo verdaderamente útil (texto de tareas) es **~180**. El resto (~1.590) es metadata + historial. **Hay muchísimo margen para gastar MENOS, no más.**

### Cuánto sumarían campos nuevos (por lectura)
- Título: ~6 tokens. Fecha por tarea: ~2-3 c/u. → **calderilla.**
- Formato (html/negrita) de las 11 tareas: ~185 tokens. → modesto.
- Texto suelto / código: **escala con lo que haya escrito** (código es denso en tokens). → el único que puede doler.
- **Instrucción por nota** (idea de Hernán): ~30 tokens fijos, controlados por el usuario.

---

## Las dos direcciones a desarrollar

### Dirección A — RECORTAR la lectura (gastar menos)
El agente casi nunca necesita UUIDs completos ni timestamps. Ideas:
- **IDs cortos**: exponer 8 chars en vez del UUID de 36 (o un índice local). Los tools necesitan el id para actuar, pero puede ser un id corto que el server re-expande. Ahorro ~360 tokens.
- **Sin timestamps** en la lectura por defecto (o fecha relativa corta "hace 2h"). Ahorro ~114.
- **Bitácora bajo demanda**: no incluir el historial completo en cada lectura de la lista. Exponer la bitácora como un recurso/tool aparte que el agente lee SOLO si lo necesita. Ahorro ~683 en la lectura base.
- **Claves cortas** en el JSON (`c` en vez de `content`, etc.) — micro-ahorro, evaluar si vale la pena vs legibilidad.

**Medido:** un recorte simple (ids 8 chars + sin timestamps + bitácora a 2 sin uuids) ya baja de **1.769 → ~1.012 tokens (−43%)**. Con bitácora bajo demanda, el "listar tareas" base podría quedar en **~300-500 tokens**. Ese es el diferencial competitivo: mostrar la lista de tareas en ~300 donde un volcado ingenuo son ~1.800.

### Dirección B — "Instrucciones para el agente" por nota
Un campo por nota (opt-in) donde el usuario escribe: cómo encarar las tareas, un **prompt negativo** (qué NO hacer), y/o un **limitador** (ej. "máximo 3 acciones"). 
- Costo: ~30 tokens fijos, controlados por el usuario.
- Beneficio: **ahorra** tokens netos → el agente acierta a la primera en vez de leer de más, equivocarse y reintentar.
- Se guarda como campo de la nota; viaja en el export igual que el título. NO es prosa libre expuesta — es un campo dedicado, así que no rompe el modelo de privacidad de doble candado (se puede diseñar como campo aparte, no como "abrir toda la nota").
- Decisión abierta: ¿dónde se edita en la UI? ¿Un campo en el encabezado de la nota junto al toggle 🤖? ¿Un ícono que abre un cuadro?

---

## Preguntas de diseño abiertas (para la próxima sesión)

1. **¿Qué campos ve el agente?** Título (casi gratis, probablemente sí), fecha (casi gratis), texto suelto (escala), código (escala/denso). Decidir uno por uno según valor vs costo. Hernán aún no está seguro.
2. **¿Solo lectura o lectura+edición de todo?** (Ver el design previo `2026-07-24-conectar-mcp-por-cliente-design.md` no cubre esto.) Editar prosa = tools nuevas + toca la puerta de ingreso (`ingest.ts`) + más superficie a asegurar. Read-only de más campos = solo toca export/resources.
3. **¿Bitácora en la lectura base o bajo demanda?** (Dirección A — el mayor ahorro individual.)
4. **¿El campo "Instrucciones" abre la puerta a exponer prosa?** No necesariamente: puede ser un campo dedicado y acotado, preservando el doble candado. Confirmar el enfoque.
5. **¿IDs cortos rompen algo?** Los tools (`complete_task`, `add_note`) reciben `blockId`. Si exponemos ids cortos, el server debe mapear corto→UUID real al recibir la acción. Diseñar ese mapeo (¿tabla en el server? ¿el export ya trae el mapa?).
6. **Modelo de privacidad:** si algún día se expone prosa, el doble candado pasa a candado único (el flag `agentVisible`). Endurecer el gate de visibilidad si se va por ahí.

## Economía de tokens — resumen para decidir

- **La base (tools + puerta MCP) es chica y fija (~108, una vez). No optimizar ahí.**
- **El costo real es POR LECTURA de nota. Hoy ~1.769 dominado por metadata/bitácora, no por el texto.**
- **Palanca #1 (ahorro): recortar la lectura (Dirección A) → −43% fácil, hasta ~−75% con bitácora bajo demanda.**
- **Palanca #2 (calidad + ahorro neto): instrucciones por nota (Dirección B), ~30 tokens.**
- Exponer título/fecha = trivial. Prosa/código = solo si aporta, porque escala.

## Recomendación (para arrancar la próxima sesión)

Orden propuesto, de mayor valor y menor riesgo a mayor:
1. **Dirección A primero** — recortar la proyección de lectura (ids cortos, sin timestamps, bitácora bajo demanda). Baja el costo base de cada interacción; es la ventaja competitiva y no toca privacidad.
2. **Dirección B** — campo "Instrucciones para el agente" por nota. Barato, alto valor, campo dedicado (no rompe privacidad).
3. Recién después decidir si exponer título/fecha/texto/código, uno por uno.
4. La edición total (read+write de prosa) queda para el final, si se confirma que se necesita, con su rediseño de privacidad y tools.

Todo con TDD, specs actualizadas (028 es la fuente del modelo de privacidad/canal), y `docs/guia/17-agentes.md` en el mismo commit de cada cambio visible.

---

## Estado del trabajo relacionado (para retomar sin perder el hilo)

- **Rama `feat/conectar-mcp`** (UNPUSHED): la feature "conectar MCP por cliente" está **construida, verde y probada en la Mac** (Claude Code conectó, las 3 tools andan). Commits `be44bd2..96fd2cb` + plan. Falta: `/code-review` de toda la feature y push. Ver [[copynotes-mcp-cloud-roadmap]].
- **Pendiente #2 (auto-refresco)**: el server MCP NO emite `resources/list_changed`, así que un cliente ya conectado no ve notas nuevas hasta reconectar. Decidido: probablemente SÍ agregarlo (es 0 tokens del agente, pura plomería). No hecho.
- **"Bug" de que el agente veía 1 de 3 notas**: NO era bug. Las otras 2 notas tenían 0 tareas (solo un bloque de texto vacío). El agente ve tareas, no prosa → por eso vacías. Esta discusión de tokens nació de ahí.
- **OJO — dejar el entorno de dev sano:** para el build empaqueté `mcp/` en modo producción (`cd mcp && pnpm install --config.node-linker=hoisted --prod`), lo que **quitó vitest de `mcp/`**. Para volver a correr los tests de `mcp/`: **`cd mcp && pnpm install`**. Hacerlo antes de retomar desarrollo en `mcp/`.

## Archivos clave (dónde vive cada cosa)
- `src/lib/bridge/export.ts` — arma el payload; acá se recorta la proyección (Dirección A) y se agregaría el campo instrucciones (Dirección B).
- `mcp/lib/resources.js` — proyección de lectura (`noteToResourceContent`, `ACTIVITY_TAIL_LENGTH`).
- `mcp/lib/tools.js` + `mcp/server.js` — tools; acá irían tools nuevas o el mapeo id-corto→UUID.
- `specs/028-agent-beta-local-mcp.md` — modelo de privacidad/canal (fuente de verdad a actualizar).
- `docs/guia/17-agentes.md` — guía de usuario (mismo commit que cada cambio visible).
