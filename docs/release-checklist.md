# Checklist de QA manual y lanzamiento

Cumple los entregables "Manual QA checklist" y "Release readiness checklist" de
`specs/013-testing-release-quality.md`, más el chequeo manual de instalación PWA
de `specs/008-pwa-offline-theme.md`.

**Cuándo correrlo:** antes de compartir una build o de publicar a producción
(`main` → Vercel, `copynotes-beta`). No hace falta para trabajo en una rama.

---

## 1. Puertas automáticas (corré esto primero)

- [ ] `pnpm check` → 0 errores, 0 warnings
- [ ] `pnpm test` → toda la lógica en verde (incluye la guardia de migraciones `db.migrations.test.ts`)
- [ ] `pnpm test:e2e` → Chromium en verde (flujos críticos, incluye el flujo sin conexión)
- [ ] `pnpm test:e2e:webkit` → en verde (arranque + exportar respaldo en el motor de Safari)
- [ ] `pnpm build` → compila sin errores

## 2. Flujos críticos (spec 013) y dónde están cubiertos

La mayoría ya los protege Playwright; solo hacé a mano los marcados **manual**.

| Flujo | Cobertura |
|---|---|
| Crear nota, escribir bloque | e2e `critical-flows` |
| Viñetas anidadas (Tab/Shift+Tab) | e2e `critical-flows` |
| Tarea y marcarla | e2e `critical-flows` |
| Contraer/expandir anidado | e2e `slash` / editor |
| Arrastrar para reordenar | e2e `move-blocks` |
| Copiar bloque y con subniveles | e2e `critical-flows` |
| Recargar y verificar autosave | e2e `critical-flows` |
| Guardar snippet e insertarlo | e2e `critical-flows` + offline |
| Etiquetar y buscar por etiqueta | e2e `critical-flows` |
| Exportar respaldo | e2e `critical-flows` + offline |
| Importar respaldo | e2e `desktop-import` (roundtrip PWA→escritorio) |
| Cambiar tema | e2e `critical-flows` |
| Instalar como PWA | **manual** (ver §3) |
| Uso táctil en dispositivo real | **manual** (ver §3) |

## 3. QA manual (lo que los tests no cubren)

### Instalación PWA (spec 008)

- [ ] En Chrome/Edge de escritorio, abrí la app: aparece la tarjeta "Instalá CopyNotes" (abajo a la izquierda) o el ícono de instalar en la barra de direcciones.
- [ ] Instalá: la app abre en su propia ventana, con su ícono, sin barra del navegador.
- [ ] Activá modo avión y abrí la app instalada: debe abrir y dejar **leer, escribir, usar snippets y descargar un respaldo** sin conexión.
- [ ] En iPhone/iPad (Safari): Compartir → "Agregar a inicio"; confirmá que el ícono queda y la app abre a pantalla completa.
- [ ] Con una versión nueva publicada, reabrí la app instalada: debe actualizarse sola (aviso breve, sin pasos manuales).

### Uso táctil real

- [ ] En un celular real, tocá un renglón: aparecen manija, copiar y ⋯ sin necesidad de mouse.
- [ ] Botones chicos (casilla de tarea, copiar, contraer) tienen buen área de toque.
- [ ] La barra de formato no se sale de la pantalla angosta.

### Datos

- [ ] Exportá un respaldo real e importalo en una app vacía: la nota y sus datos vuelven completos.
- [ ] Cambiá el tema y recargá: se mantiene.

## 4. Antes de publicar a producción (`main` → Vercel)

- [ ] Guía de usuario actualizada (`docs/guia/` + fecha de "Última actualización" del índice) en el mismo commit que la funcionalidad.
- [ ] Specs actualizadas donde corresponda.
- [ ] Los commits que van a `main` **no** llevan trazas de agente (nada de `Co-Authored-By`) — producción sale de `main`.
- [ ] Nada no relacionado se rompió.
- [ ] Riesgo de pérdida de datos considerado: persistencia, import/export/restaurar, jerarquía anidada, reordenar, formato al copiar, **migraciones de base**.
