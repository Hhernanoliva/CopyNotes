# Backup del código (la carpeta del proyecto)

No confundir con el **respaldo** que exporta la app (tus notas, `docs/guia/11-respaldo.md`).
Esto es una copia de seguridad del proyecto en sí: el código, el historial y la configuración.

**Cuándo hacerlo:** antes de un cambio grande o arriesgado, y cada vez que haya
trabajo hecho que todavía no esté en GitHub (commits sin pushear).

## El comando

Cambiá la fecha del final por la de hoy:

```bash
rsync -a --exclude node_modules --exclude 'src-tauri/target' --exclude build \
  --exclude test-results --exclude .DS_Store \
  ~/Projects/CopyNotes/ ~/Projects/CopyNotes-backups/2026-08-05/
```

Tarda unos segundos y ocupa ~40 MB. Una carpeta por fecha, las viejas se dejan quietas.

## Qué entra y qué no

**Entra:** todo el código, `docs/`, `specs/`, el historial completo de git (`.git`),
la configuración de Claude Code (`.claude/`) y el archivo `.env`.

**No entra:** `node_modules/`, `src-tauri/target/`, `build/` y `test-results/`. Son
4.4 GB de cosas que la computadora regenera sola con `pnpm install` y compilando.
Por eso la copia pesa 40 MB en vez de 4.5 GB.

> **Cuidado:** la copia incluye `.env`, que tiene las claves de Supabase. Es para
> guardar en tu disco o en un disco externo. No la subas a Google Drive, Dropbox
> ni a ningún repositorio público.

## Cómo volver atrás con una copia

La copia es un proyecto completo y funcional. Para usarla:

1. Copiala a un lugar nuevo (no encima del proyecto actual).
2. Adentro, corré `pnpm install` para reponer `node_modules/`.
3. Listo: `git log` muestra el historial tal como estaba ese día.

## Historial de copias

- `~/Projects/CopyNotes-backups/` — copias por fecha (2026-08-01 en adelante).
- `~/Projects/Backups-CopyNotes-viejos/` — las de julio, con nombres a mano.
