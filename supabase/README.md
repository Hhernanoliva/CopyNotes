# La nube de CopyNotes (Supabase)

Esta carpeta no es código de la app: es lo que hay que configurar **una vez** en
el panel de Supabase, guardado acá para que quede a la vista y se pueda repetir.

Spec: `specs/030-zero-knowledge-sync.md`, fase 2.

## Qué guarda el servidor

Dos tablas, definidas en `schema.sql`:

- `records` — una fila por registro sincronizado, con el contenido convertido en
  un **blob ilegible**. En claro solo viaja lo que hace falta para archivar la
  fila: de qué tabla es, su id (un UUID sin significado), el número de versión y
  si está borrada.
- `vaults` — la copia **envuelta** de la llave de la bóveda. Sin el código de
  recuperación (que se muestra una vez en el dispositivo y no se guarda en
  ningún lado) es ruido. Está ahí para que un segundo dispositivo pueda
  recuperar la llave.

Supabase no puede leer ninguna nota. Sí ve, inevitablemente: que la cuenta
existe, su email, la IP, cuántos registros hay, cuánto pesan y a qué hora se
sincronizaron.

## Preparar el proyecto (una vez)

1. **Crear el proyecto**: nombre `copynotes`, región *South America (São Paulo)*,
   plan Free. Guardar la contraseña de la base de datos en el gestor de
   contraseñas (no se vuelve a mostrar y no es la contraseña de tu cuenta).
2. **SQL Editor** → pegar todo `schema.sql` → Run. Se puede volver a correr sin
   romper nada, y **hay que volver a correrlo cada vez que ese archivo cambie**
   (la última vez sumó la política del canal en vivo).
3. **Authentication › Sign In / Providers › Email**: dejar Email habilitado y
   **apagar "Confirm email"**. Sin apagarlo, crear una cuenta dispara un mail de
   confirmación, y este proyecto no tiene con qué enviarlo: la cuenta queda
   creada pero sin poder entrar. La app lo detecta y lo dice con todas las
   letras, pero el arreglo está acá.

## Cómo se entra (y cómo se cambia)

`PUBLIC_SUPABASE_EMAIL_CODE` decide, y los dos caminos son código vivo:

| Valor | Cómo entra el usuario | Qué necesita |
|---|---|---|
| cualquiera menos `true` (por defecto) | email + contraseña | nada; "Confirm email" apagado |
| `true` | código de 6 dígitos por email | SMTP con **dominio propio verificado** |

**Por qué el default es contraseña (2026-07-30).** Se probó Resend por SMTP con
su remitente prestado `onboarding@resend.dev` y rechaza el envío con
`Domain is not verified`: ese atajo solo vale desde su API de prueba, no por
SMTP. Sin un dominio verificado no hay forma de que llegue el código, y sin
código nadie entra. Los pasos 4 y 5 de abajo son el camino ya preparado para el
día que exista ese dominio: verificarlo en el proveedor, poner el remitente
(`hola@tudominio`), pegar la plantilla, y cambiar la variable a `true`.

4. **Authentication › Emails › Magic Link** (solo para el modo código). La
   plantilla que viene de fábrica manda solo un enlace, y CopyNotes pide un
   **código**. Hay que dejar `{{ .Token }}` en el cuerpo del mail, por ejemplo:

   ```html
   <h2>Tu código para entrar a CopyNotes</h2>
   <p>Escribí este código en la app:</p>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.</p>
   ```

   Sin `{{ .Token }}` el email llega sin código y no hay forma de entrar. La
   misma plantilla hay que dejarla en **Confirm sign up**: la primera vez la
   cuenta no existe todavía y Supabase usa esa otra.
5. **Authentication › Sign In / Providers › Email › Email OTP Expiration**:
   600 segundos (10 minutos). También hay un **Minimum interval per user** (60 s
   por defecto) en la pantalla de SMTP: dos pedidos seguidos, el segundo se
   rechaza.
6. **Project Settings › API Keys**: copiar `Project URL` y la clave publicable
   (`sb_publishable_…`, antes llamada `anon public`) al `.env` local (ver
   `.env.example`) y a **Vercel › Settings › Environment Variables**. Con
   `adapter-static` los valores se hornean en el build, así que sin cargarlos en
   Vercel la web queda sin nube.

> La clave secreta (`sb_secret_…`, antes `service_role`) **no** va a Vercel ni al
> repo. Se saltea el candado por usuario. Vive solo en el `.env` de una máquina
> de desarrollo y solo la usa `pnpm rls:check`.

## Rotar la clave secreta

Cambiarla no puede romper la app: la app nunca la usa, solo `pnpm rls:check`.
El orden importa — crear la nueva antes de matar la vieja deja siempre un camino
de vuelta.

1. **Project Settings › API Keys › Secret keys** → crear una nueva. El nombre
   solo acepta minúsculas, dígitos y `_` (`local_dev_jul30`). Supabase la muestra
   una sola vez.
2. Reemplazar `SUPABASE_SERVICE_ROLE_KEY` en el `.env`. Leerla del portapapeles
   en vez de pegarla en una terminal o un chat: queda en el historial.
3. `pnpm rls:check` → las seis pruebas tienen que pasar.
4. Recién ahí, **borrar la vieja** en el panel.
5. Correr `rls-check.mjs` contra una copia del `.env` anterior. Tiene que fallar
   con `401`. Una rotación está probada cuando la clave vieja **muere**, no
   cuando la nueva anda: si solo se verifica la nueva, las dos pueden seguir
   vivas y no rotaste nada. Después, borrar esa copia.

Última rotación: 2026-07-30 (`local_dev_jul30`).

## Probar el candado

```bash
pnpm rls:check
```

Crea dos cuentas de prueba, guarda una fila con cada una **usando el mismo id**,
y verifica seis cosas: que cada cuenta ve su fila, que pedir las filas de la
otra devuelve cero, que no se puede insertar a nombre de otra, que no se puede
sobrescribir su fila, que la llave envuelta tampoco se puede leer, y que
reenviar un registro lo sobrescribe en vez de duplicarlo (la idempotencia en la
que se apoya el subidor). Después borra las dos cuentas.

No corre en `pnpm test` porque necesita el proyecto real y la clave
`service_role`. Hay que correrlo a mano cada vez que se toque `schema.sql`.

## Por qué no hay Supabase CLI ni migraciones

Son dos tablas y un archivo que se pega en el editor. Cuando haya un segundo
cambio de esquema —la fase 3 (bajar y unir cambios) es el candidato— ese es el
momento de agregar `supabase/migrations/` y el CLI, no antes.
