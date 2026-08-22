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

### Sin conexión y app de escritorio (spec 008)

- [ ] En un navegador de escritorio, abrí la web: aparece la tarjeta "¿Usás agentes de IA?" abajo a la derecha, y el botón **Descargar** lleva a la página de releases. Cerrala: no vuelve al recargar.
- [ ] En un celular o tablet, abrí la web: la tarjeta **no** aparece.
- [ ] Dentro de la app de escritorio (Tauri): la tarjeta **no** aparece.
- [ ] En el navegador, Configuración ⚙️ › Agentes: el enlace "Descargar la app de escritorio" abre la misma página.
- [ ] Activá modo avión y recargá la web: debe abrir y dejar **leer, escribir, usar snippets y descargar un respaldo** sin conexión.
- [ ] Con una versión nueva publicada, reabrí la web: debe actualizarse sola (aviso breve, sin pasos manuales).

### Uso táctil real

- [ ] En un celular real, tocá un renglón: aparecen manija, copiar y ⋯ sin necesidad de mouse.
- [ ] Botones chicos (casilla de tarea, copiar, contraer) tienen buen área de toque.
- [ ] La barra de formato no se sale de la pantalla angosta.
- [ ] **Entrar en un renglón (spec `043`)**: el menú ⋯ tiene *Entrar acá* y entra; las
      migas de arriba se pueden tocar y desplazar de costado; **no** aparece ningún
      control nuevo en la fila (el doble clic en la manija es sólo de escritorio).

### Entrar en un renglón, en la app empaquetada (spec `043`, PENDIENTE)

Se probó entero en el navegador el 2026-08-22 (12 de 12 pasos). **Falta en la `.app`**,
y estos cuatro son los que el navegador no puede contestar. Van antes de la próxima
release de escritorio.

- [ ] Entrar con doble clic en la manija, con el ⋯ y con `Alt+→`; salir con la miga y
      con `Alt+←`. (`Alt+→` pisa el "mover el cursor palabra por palabra" de macOS: es
      el costo aceptado, comprobá que se sienta bien en la app de verdad.)
- [ ] Estando adentro, escribir en el renglón-título, cerrar la app **con ⌘Q** y
      reabrir: el texto está y se sigue adentro (el diario de escrituras se cierra en
      el `pagehide` del webview — es el camino que sólo existe empaquetado).
- [ ] Salir desde una rama que estaba abajo en una nota larga: el renglón donde estabas
      queda a la vista sin buscarlo.
- [ ] Con dos aparatos (o la web + la app), borrar desde el otro lado el renglón donde
      estás parado: aparece *"El renglón donde estabas ya no existe."* y vuelve la nota
      entera.

### Datos

- [ ] Exportá un respaldo real e importalo en una app vacía: la nota y sus datos vuelven completos.
- [ ] Cambiá el tema y recargá: se mantiene.

## 4. Antes de publicar a producción (`main` → Vercel)

- [ ] Guía de usuario actualizada (`docs/guia/` + fecha de "Última actualización" del índice) en el mismo commit que la funcionalidad.
- [ ] Specs actualizadas donde corresponda.
- [ ] Los commits que van a `main` **no** llevan trazas de agente (nada de `Co-Authored-By`) — producción sale de `main`.
- [ ] Nada no relacionado se rompió.
- [ ] Riesgo de pérdida de datos considerado: persistencia, import/export/restaurar, jerarquía anidada, reordenar, formato al copiar, **migraciones de base**.

## 5. Publicar una versión de escritorio (`vX.Y.Z` → GitHub Release)

Probado de punta a punta con la v0.2.0, la v0.2.1 y la v0.2.2 (2026-08-19). Son
**tres trabajos en fila** (preparar → macOS → Windows) y salen **dos
instaladores**, `.dmg` y `.exe`. ~35 min, casi todo espera. El porqué de la
secuencia, en `docs/arquitectura-publicacion.md`.

- [ ] **Escribí las novedades en `CHANGELOG.md` ANTES de taguear.** Es
      obligatorio, no cortesía: `tauri-action` copia ese texto adentro del
      `latest.json` **en la misma corrida** que crea la release, y ese archivo no
      se puede editar después. Editar la descripción de la release en GitHub no
      regenera nada.
- [ ] Comprobalo: `node scripts/changelog-section.mjs X.Y.Z` imprime las viñetas
      (si no, corta el build más adelante).
- [ ] Subí `"version"` en `package.json`. **Es la única fuente**:
      `src-tauri/Cargo.toml` y `mcp/package.json` quedan donde están, a propósito.
- [ ] Puertas automáticas (§1) en verde. Ojo: `pnpm check` arrastra **4 errores
      preexistentes** (`db.migrations.test.ts`, `DatePanel.svelte:64`); lo que
      importa es que no haya ninguno nuevo.
- [ ] `git tag vX.Y.Z && git push origin main --tags`
- [ ] Mirá el workflow. **El paso 3 es una guardia**: corta en segundos si falta
      el `pubkey`, `createUpdaterArtifacts`, o cualquiera de los cuatro secretos
      (`TAURI_SIGNING_PRIVATE_KEY`, `..._PASSWORD`, `PUBLIC_SUPABASE_URL`,
      `PUBLIC_SUPABASE_ANON_KEY`). Si pasa el 3, el resto es cuestión de esperar.
- [ ] **⚠️ Verificá el `notes` del `latest.json` del borrador** antes de publicar:

      gh release download vX.Y.Z --repo Hhernanoliva/CopyNotes --pattern latest.json --dir /tmp
      node -e "const j=require('/tmp/latest.json'); console.log(j.version); console.log(j.notes)"

      Tiene que traer las viñetas del changelog, no vacío ni relleno. Si esto
      falla, el resto no sirve.
- [ ] **Y que el `latest.json` traiga las DOS plataformas**, `darwin-*` y
      `windows-x86_64`, cada una con su `signature`:

      node -e "const j=require('/tmp/latest.json'); console.log(Object.keys(j.platforms).join(', '))"

      Si falta una, los dos trabajos se pisaron pese al `needs:` y esa plataforma
      se queda sin aviso de versión nueva.
- [ ] Comprobá que estén adjuntos **los dos instaladores**: el `.dmg` y el
      `_x64-setup.exe`.
- [ ] Publicá: `gh release edit vX.Y.Z --repo Hhernanoliva/CopyNotes --draft=false`.
      Recién ahí `/releases/latest/download/latest.json` empieza a resolver
      (antes da 404, y eso es correcto).
- [ ] Instalá el `.dmg` **bajado desde el navegador** y comprobá en la app:
      Configuración › **Nube** con la cuenta a la vista (si dice *"esta copia no
      tiene una nube configurada"*, las `PUBLIC_SUPABASE_*` no llegaron al
      build), **Actualizaciones** al día con su bloque plegado, y **Agentes**
      activos.

### Lo que macOS le hace a quien instala (mientras no haya certificado de Apple)

Decirlo en el changelog y en la guía, porque el sistema no da ninguna pista:

1. **Bloquea la app**: *"Apple no pudo verificar que «CopyNotes» no contenga
   software malicioso"*, con un solo botón (**Listo**). Se destraba en **Ajustes
   del Sistema › Privacidad y seguridad › "Abrir igualmente"**. El viejo truco
   del clic derecho → Abrir **ya no funciona** en las versiones nuevas de macOS.
2. **Pide la contraseña del Mac** una vez, por `CopyNotes WebCrypto Master Key`:
   hay que tocar **"Permitir siempre"**. Denegarlo deja la nube muda en ese
   aparato sin decir por qué. Pasa en **cada** versión nueva, porque la firma
   ad-hoc cambia en cada build.
