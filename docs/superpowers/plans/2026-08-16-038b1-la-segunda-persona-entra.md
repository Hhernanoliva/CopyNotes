# Compartir una nota, parte B1: la segunda persona entra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una segunda cuenta pueda recibir por un link una nota compartida, verla entera, y no poder romper nada — invitación, membresía, nombres y candado de sólo lectura.

**Architecture:** La parte A dejó el caño construido y probado; lo que falta acá es la puerta. Cuatro funciones nuevas en Postgres (`create_share_invite`, `accept_share_invite`, `remove_member`, `leave_share`), tres columnas de nombre en tablas que ya existen, un cachecito local de nombres en la tabla `shareMembers` que la v11 de Dexie ya creó, un parámetro `?invitacion=<token>` en la raíz de la app, y una rama de sólo-lectura en el editor. No hay tablas nuevas ni rutas nuevas.

**Tech Stack:** SvelteKit + Svelte 5 (runes), Dexie, Supabase (Postgres + RLS), Vitest, Playwright.

---

## ESTADO al 2026-08-17 — TODO construido; falta sólo el gate manual

Rama `feat/compartir-invitacion`, **sin pushear**. **SQL aplicado y
`pnpm rls:check` 20/20** contra el proyecto real. Unit **1188** verdes, e2e
**179** verdes (+ el flake conocido del separador: medido **1/10 en esta rama
contra 3/10 en la base**, o sea preexistente y no empeorado), `pnpm check` en sus
4 errores de siempre.

| Tarea | Estado |
|---|---|
| 1. Las cuatro funciones SQL | **HECHA** (`c65b9a3`). Hernán aplicó el SQL el 2026-08-17; medido con `fetch` pelado (las 5 funciones contestan "necesita una sesión iniciada", ninguna 404) y **`pnpm rls:check` da 20/20** contra el proyecto real |
| 2. El cachecito de nombres | **HECHA** (`1e8fb2f`) |
| 3. Las llamadas al servidor | **HECHA** (`e0fce0d`) |
| 4. La pantalla de compartir | **HECHA** (`e7a1d61`) |
| 5. Aceptar la invitación | **HECHA** (`9ed7439`) |
| 6. El candado de sólo lectura | **HECHA** (`7a7966d`) |
| 7. Guía y CHANGELOG | **HECHA** (`2bc36a6`) |
| 8. El gate manual con dos cuentas | **PENDIENTE** — es de Hernán |

**Las casillas `- [ ]` de abajo quedaron sin tildar.** No son el estado: el
estado es esta tabla. (Ver [[copynotes-stale-followup-ledger]] — en 038/039/040
pasó lo mismo y confundió después.)

**Tres cosas que cambiaron respecto de lo planeado, y por qué:**

1. **`reconcileShares` NO cambia la forma del `Map`.** El plan metía el nombre
   adentro del valor y avisaba del riesgo de que el segundo lector se quedara
   viejo. Al escribirlo, `svelte-check` marcó tres errores por eso, y mirándolo
   el diseño estaba de más: un bucle aparte sobre la respuesta guarda los nombres
   sin tocar esa forma. Menos código y el riesgo desaparece en vez de quedar
   vigilado. **La prueba que lo vigila quedó igual** — el riesgo se evitó, no dejó
   de existir.
2. **El rol sale de `note.share`, no de una lectura nueva.** El editor ya tiene la
   nota cargada. El plan pedía un `$state` + un `$effect` que no hacían falta.
3. **La prueba del menú del renglón pasó la primera vez SIN el candado** (buscaba
   el nombre del menú abierto, no el del botón que lo abre). Ahora comprueba
   primero que en una nota propia el botón está. Las tres pruebas del candado se
   verificaron en rojo apagándolo.

---

## Por qué la parte B viene partida en tres, para Hernán

La parte A fue "el caño": la nota sale de la bóveda, vive en claro en el servidor y vuelve, probado con dos aparatos tuyos y sin nadie del otro lado. La parte B es todo lo que pasa cuando aparece una segunda persona, y son ~10 días. Partirla en tres no es una preferencia: cada pedazo tiene que poder probarse solo, y estos tres cortan donde el anterior queda **usable y seguro**.

- **B1 (este plan): la segunda persona entra.** Le mandás un link, lo acepta con su cuenta, y ve tu nota. **No puede escribir nada** — ni el texto, ni un tilde, ni un comentario. Al terminar esto ya hay algo que le podés mostrar a alguien.
- **B2: la segunda persona responde.** El tilde que no toca el renglón, los comentarios, la firma con nombre en las tres pantallas y en lo que ve tu agente, y los dos candados que impiden que su aparato se atore.
- **B3: el cierre.** El botón "Listo", el contador de novedades, que deshacer no destilde, y la consulta de moderación.

**El candado de sólo lectura va en B1 y no en B2, y es la razón por la que el corte cae acá.** Sin él, B1 sola sería peligrosa: tu invitado escribiría en su copia, el servidor le rechazaría cada renglón por no ser el dueño, y él vería su trabajo en pantalla sin que llegue nunca. B1 termina con el invitado leyendo, que es poco pero es verdad.

**Dos cosas te van a tocar a vos y no las puedo hacer yo:**

1. **Pegar `supabase/schema.sql` en el editor SQL de Supabase** (Tarea 1). Antes de darlo por hecho, se mide: la parte A ya se comió media hora por dar por aplicado un SQL que no lo estaba, y la receta para medirlo en 20 segundos está en la Tarea 1, Paso 8.
2. **El gate manual con dos cuentas** (Tarea 8). Necesitás una segunda cuenta de Google o de mail que no sea la tuya. Es la misma que hace falta para la spec 036.

**Lo que este plan NO hace, a propósito:** mandarle el link a una persona de verdad. Eso espera al dominio propio, junto con 036/037, y el motivo está en la sección "Rollout" de la spec: si la app se muda de dirección, la llave de la bóveda se queda del lado viejo, y un invitado varado no tiene un segundo aparato al que pedirle nada. Construir y probar B1 se hace con dos cuentas tuyas, y no cambia una línea el día que se mande el primer link real.

---

## Global Constraints

Copiadas de la spec 038 y de `AGENT.md`. Valen para **todas** las tareas de abajo.

- **Una nota viaja por un caño solo.** Nada de lo que se agregue acá puede hacer que una nota compartida vuelva a ofrecerse por el caño cifrado (spec 038 §2).
- **Toda escritura al servidor entra por una función `security definer`.** Las tablas de compartir dan `select` bajo RLS y nada más; no se agrega ninguna política de `insert`/`update`/`delete` (patrón ya establecido en `supabase/schema.sql`).
- **`supabase/schema.sql` es idempotente.** Toda política nueva lleva su `drop policy if exists` antes; todo `alter table` lleva `if not exists`. Es la promesa del archivo desde su primera línea y la parte A ya la rompió una vez.
- **El invitado sólo puede agregar bitácora, y eso se decide en el SQL, no en la pantalla** (spec 038 §4). El candado de la UI es cortesía.
- **La firma la pone el servidor, nunca el payload** (spec 038 §4).
- **JavaScript pelado dentro de `.ts`/`.svelte`**: sin anotaciones de tipo en código escrito a mano (`CLAUDE.md`).
- **Tokens de diseño de shadcn-svelte** (`background`, `muted-foreground`, `destructive`, …), nunca colores crudos ni los nombres conceptuales de la spec 016.
- **`docs/guia/` y `CHANGELOG.md` se editan en el MISMO commit que la funcionalidad visible** (`CLAUDE.md`). Acá eso cae en la Tarea 7.
- **`pnpm check` arrastra 4 errores preexistentes** (2 en `db.migrations.test.ts`, 1 en `format/commands.ts`, 1 en `DatePanel.svelte`) y 1 warning. Son la base: no son regresión y no se arreglan acá.
- **Los commits no llevan trazas de agente** — nada de `Co-Authored-By`.

---

## Mapa de archivos

**Servidor**
- Modificar: `supabase/schema.sql` — 3 columnas nuevas, 4 funciones nuevas, `list_shares()` devuelve el nombre de la contraparte.
- Modificar: `scripts/rls-check.mjs` — 4 ataques nuevos (17 a 20).

**Base local**
- Crear: `src/lib/storage/share-names.ts` — la única puerta al cachecito `shareMembers`.
- Crear: `src/lib/storage/share-names.test.ts`
- Modificar: `src/lib/storage/settings-registry.ts` — `KEY.shareOwnerLabel`.

**Cliente de la nube**
- Crear: `src/lib/sync/invites.ts` — las 4 llamadas + armar el link.
- Crear: `src/lib/sync/invites.test.ts`
- Modificar: `src/lib/sync/shared.ts` — `reconcileShares` guarda los nombres que llegan.
- Modificar: `src/lib/sync/shared.test.ts`

**Pantallas**
- Modificar: `src/lib/components/ShareDialog.svelte` — nombre del invitado, link, lista de miembros, quitar acceso, salirse.
- Crear: `src/lib/sync/invite-return.ts` — leer/limpiar `?invitacion=`, y guardarlo antes del viaje a Google.
- Crear: `src/lib/sync/invite-return.test.ts`
- Crear: `src/lib/components/InviteAccept.svelte` — la pantalla de aceptar.
- Modificar: `src/routes/+page.svelte` — montar `InviteAccept` cuando hay token.
- Modificar: `src/lib/editor/Editor.svelte` y `src/lib/editor/BlockRow.svelte` — el candado de sólo lectura.

**Documentación**
- Modificar: `docs/guia/20-compartir-una-nota.md`, `docs/guia-de-uso.md`, `CHANGELOG.md`.

**Pruebas de punta a punta**
- Modificar: `e2e/app.ts` — `openApp` acepta una dirección.
- Modificar: `e2e/compartir.spec.ts` — **ya existe**, lo dejó la parte A. Se le agregan sólo las que no necesitan servidor (la pantalla de aceptar sin sesión, el token que se va de la barra, y el candado).

**Lo que NO hay que construir, porque la parte A ya lo dejó hecho**

Verificado leyendo el código al escribir este plan; si algo de esto aparece como "a hacer", es que se está duplicando:

- **La tabla del cachecito de nombres.** `db.version(11)` ya declara `shareMembers: 'id'` (`storage/db.ts:169-174`), con el comentario de por qué no está en `SYNCED_TABLES` ni en `BACKUP_TABLES`.
- **La limpieza al cerrar sesión** (criterio 12 de la spec). `resetCloudState` (`sync/leave.ts:106-115`) ya borra las marcas `share`, vacía `shareMembers` y llama a `forgetSharePrefixes()`.
- **Las claves por nota** ya están declaradas: `shareKey('cursor'|'visto'|'desde', noteId)` en `settings-registry.ts:57-64`, con `visto` y `desde` reservadas para B3.
- **La tabla `share_invites`** ya existe en `supabase/schema.sql:356` con su `on delete cascade`. Lo que falta es la columna del nombre y las funciones que la usan.

---

## Task 1: Las cuatro funciones que faltan, y el nombre

**Files:**
- Modify: `supabase/schema.sql` (tablas de compartir ~336-380; funciones ~405-655; RLS ~750-775)
- Modify: `scripts/rls-check.mjs` (agregar al final, antes del `finally`)

**Interfaces:**
- Consumes: `public.shares`, `public.share_members`, `public.share_invites`, `public.is_share_participant(text)` — todo de la parte A.
- Produces, para las tareas 3 y 8:
  - `create_share_invite(p_note_id text, p_member_label text, p_owner_label text) returns text` — devuelve el token.
  - `accept_share_invite(p_token text) returns text` — devuelve el `note_id`.
  - `remove_member(p_note_id text, p_member_id uuid) returns void`
  - `leave_share(p_note_id text) returns void`
  - `list_shares() returns table (note_id text, role text, counterpart_label text)` — **cambia de forma**: gana una tercera columna.

- [ ] **Step 1: Leer el archivo entero antes de tocarlo**

`supabase/schema.sql` es idempotente de punta a punta y ese es su contrato. Leer al menos: el bloque de tablas de compartir (~336), `open_share`/`close_share` (~416), `push_shared_rows` (~506), `list_shares` (~640), los `grant`/`revoke` (~657) y las políticas (~750). El estilo de las funciones nuevas se copia de ahí: `security definer`, `set search_path = ''`, y el `if auth.uid() is null then raise exception` como primera línea del cuerpo.

- [ ] **Step 2: Agregar las tres columnas de nombre**

Van pegadas a sus tablas, con `if not exists` porque el archivo se re-corre entero.

```sql
-- Los nombres (spec 038 §6, decidido el 2026-08-16). El dueño escribe los dos:
-- cómo se llama el invitado, y cómo firma él. NINGÚN mail viaja en ninguna
-- dirección — es la misma promesa que hace el resto del producto, y cuesta un
-- campo de texto en una pantalla que igual tenía que existir.
--
-- Los dos son `text` y no `not null`: una compartición abierta por la parte A no
-- tiene ninguno de los dos, y el día que se corra este archivo esas filas siguen
-- ahí. El cliente resuelve el nulo con una frase por defecto.
alter table public.shares add column if not exists owner_label text;
alter table public.share_members add column if not exists display_name text;
alter table public.share_invites add column if not exists member_label text;
```

- [ ] **Step 3: Escribir `create_share_invite`**

Va después de `close_share`.

```sql
-- El link de invitación (spec 038 §7). El link NO da acceso: es un token que se
-- canjea estando dentro de una cuenta, y eso es lo que hace que "¿quién tildó
-- esto?" tenga respuesta.
--
-- Vence a los 7 días. No es una constante configurable porque nadie pidió que lo
-- fuera; el día que alguien lo pida, es un parámetro más.
create or replace function public.create_share_invite(
	p_note_id text,
	p_member_label text,
	p_owner_label text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	nuevo_token text;
begin
	if auth.uid() is null then
		raise exception 'create_share_invite necesita una sesión iniciada';
	end if;
	-- Sólo el dueño invita. Un miembro que llame acá no puede repartir la nota
	-- de otro, y la comprobación es por `shares`, no por `is_share_participant`,
	-- justamente para excluirlo.
	if not exists (
		select 1 from public.shares where note_id = p_note_id and owner_id = auth.uid()
	) then
		raise exception 'sólo quien comparte la nota puede invitar';
	end if;
	-- `gen_random_uuid()` dos veces: 256 bits de token, que es lo que separa un
	-- link secreto de uno adivinable. `pgcrypto` no hace falta, viene en el core
	-- desde Postgres 13.
	nuevo_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
	insert into public.share_invites (token, note_id, owner_id, expires_at, member_label)
	values (nuevo_token, p_note_id, auth.uid(), now() + interval '7 days', p_member_label);
	-- El nombre del dueño vive en `shares` y no en la invitación: es uno solo por
	-- nota, y cambiarlo tiene que alcanzar a los invitados que ya entraron.
	update public.shares
	   set owner_label = coalesce(nullif(p_owner_label, ''), owner_label)
	 where note_id = p_note_id and owner_id = auth.uid();
	return nuevo_token;
end;
$$;
```

- [ ] **Step 4: Escribir `accept_share_invite`**

```sql
-- Canjear el token. Devuelve el `note_id` para que la app sepa qué nota esperar;
-- la nota en sí baja después, por el caño compartido de siempre.
--
-- Re-aceptar es un no-op (spec 038 §7: una membresía por nota por cuenta), y por
-- eso el `on conflict do nothing` en vez de un error: alguien que abre el link
-- dos veces no cometió ningún error.
create or replace function public.accept_share_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
	invitacion public.share_invites;
begin
	if auth.uid() is null then
		raise exception 'accept_share_invite necesita una sesión iniciada';
	end if;
	select * into invitacion from public.share_invites where token = p_token;
	if invitacion.token is null then
		raise exception 'esa invitación no existe';
	end if;
	if invitacion.expires_at < now() then
		raise exception 'esa invitación venció';
	end if;
	-- El dueño canjeando su propio link se quedaría como miembro de su propia
	-- nota: dos roles a la vez, y `list_shares` devolvería las dos filas.
	if invitacion.owner_id = auth.uid() then
		raise exception 'esa nota ya es tuya';
	end if;
	insert into public.share_members (note_id, member_id, display_name)
	values (invitacion.note_id, auth.uid(), invitacion.member_label)
	on conflict (note_id, member_id) do nothing;
	return invitacion.note_id;
end;
$$;
```

- [ ] **Step 5: Escribir `remove_member` y `leave_share`**

Dos puertas para el mismo `delete`, y separadas a propósito: quién puede llamar a cuál es lo único que las distingue.

```sql
-- Quitarle el acceso a alguien. Sólo el dueño. NO le borra la copia que ya tiene
-- en su aparato —eso es imposible desde acá— y la pantalla lo dice con esas
-- palabras antes de confirmar (spec 038 §7).
create or replace function public.remove_member(p_note_id text, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'remove_member necesita una sesión iniciada';
	end if;
	if not exists (
		select 1 from public.shares where note_id = p_note_id and owner_id = auth.uid()
	) then
		raise exception 'sólo quien comparte la nota puede quitar a alguien';
	end if;
	delete from public.share_members
	 where note_id = p_note_id and member_id = p_member_id;
end;
$$;

-- Lo mismo desde el otro lado: el invitado se va solo. Se borra a sí mismo y a
-- nadie más, y por eso no toma un `p_member_id`: un parámetro que sólo puede
-- valer `auth.uid()` es un agujero esperando a que alguien lo llame con otra cosa.
create or replace function public.leave_share(p_note_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'leave_share necesita una sesión iniciada';
	end if;
	delete from public.share_members
	 where note_id = p_note_id and member_id = auth.uid();
end;
$$;
```

- [ ] **Step 6: Que `list_shares()` devuelva el nombre de la contraparte**

Reemplaza la función que ya está (~640). El cambio de forma es el motivo por el que la Tarea 3 tiene que tocar `reconcileShares` en el mismo empujón.

```sql
-- "¿En qué estoy?" Sin esto, dos flujos de la spec no tienen por dónde empezar:
-- un aparato que nunca vio la nota no la tiene en ningún lado (su caño cifrado
-- la saltea por la regla del caño único), y después de restaurar un respaldo la
-- marca `share` no está a propósito.
--
-- Devuelve además CÓMO SE LLAMA EL OTRO, y es una sola columna porque de cada
-- lado el otro es uno solo: el invitado ve al dueño, el dueño ve... a varios, y
-- por eso del lado del dueño esta columna viene nula y la lista de miembros se
-- lee de `share_members`, que su RLS ya le deja leer. Lo que resuelve acá es el
-- caso del invitado, que NO puede tener el nombre del dueño de ninguna otra
-- forma: `shares` le da select, pero el nombre del dueño es lo único que
-- necesita de ahí y así se lo lleva en el mismo viaje.
create or replace function public.list_shares()
returns table (note_id text, role text, counterpart_label text)
language plpgsql
security definer
set search_path = ''
as $$
begin
	if auth.uid() is null then
		raise exception 'list_shares necesita una sesión iniciada';
	end if;
	return query
	select s.note_id, 'owner'::text, null::text
	  from public.shares as s
	 where s.owner_id = auth.uid()
	union all
	select m.note_id, 'member'::text, o.owner_label
	  from public.share_members as m
	  join public.shares as o on o.note_id = m.note_id
	 where m.member_id = auth.uid();
end;
$$;
```

- [ ] **Step 7: Los permisos de las cuatro funciones nuevas**

Van con las demás (~657). **Sin esto las funciones existen y nadie las puede llamar**, que es el modo de fallar más confuso de todos.

```sql
revoke all on function public.create_share_invite(text, text, text) from public;
revoke all on function public.accept_share_invite(text) from public;
revoke all on function public.remove_member(text, uuid) from public;
revoke all on function public.leave_share(text) from public;
grant execute on function public.create_share_invite(text, text, text) to authenticated;
grant execute on function public.accept_share_invite(text) to authenticated;
grant execute on function public.remove_member(text, uuid) to authenticated;
grant execute on function public.leave_share(text) to authenticated;
```

Y **hay que borrar la firma vieja de `list_shares`**, porque cambiarle el tipo de retorno a una función no se puede con `create or replace`. Va inmediatamente antes de su `create or replace`:

```sql
-- El tipo de retorno cambió en la parte B1 (ganó `counterpart_label`), y a eso
-- `create or replace` contesta "cannot change return type of existing function".
drop function if exists public.list_shares();
```

- [ ] **Step 8: Hernán aplica el SQL, y después se MIDE que entró**

No se le cree a "ya lo pegué" — la parte A perdió media hora así, y sin culpa suya: lo que pegó era el archivo de antes. Pedirle que copie `supabase/schema.sql` entero en el editor SQL de Supabase y lo corra. Después, medirlo desde acá:

```bash
node -e '
const url = process.env.PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const call = async (fn, body) => {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  console.log(fn, r.status, (await r.text()).slice(0, 120));
};
await call("create_share_invite", { p_note_id: "x", p_member_label: "x", p_owner_label: "x" });
await call("accept_share_invite", { p_token: "x" });
await call("remove_member", { p_note_id: "x", p_member_id: "00000000-0000-0000-0000-000000000000" });
await call("leave_share", { p_note_id: "x" });
await call("list_shares", {});
' 
```

Expected: **ninguna** de las cinco contesta `404` con `Could not find the function ... in the schema cache`. Un `400` con "necesita una sesión iniciada" es el resultado bueno — significa que la función existe y su primera línea corrió.

- [ ] **Step 9: Los cuatro ataques nuevos en `rls-check.mjs`**

Van al final del bloque `try`, después del caso 16. La numeración sigue de ahí; el mensaje final pasa a decir veinte.

```js
	// 17. Un invitado no puede repartir la nota de otro. `create_share_invite`
	//     comprueba contra `shares`, no contra `is_share_participant`, y esto es
	//     lo que prueba que la diferencia está puesta.
	await assert.rejects(
		async () => unwrap(await b.client.rpc('create_share_invite', {
			p_note_id: NOTA_DE_A,
			p_member_label: 'colado',
			p_owner_label: 'colado'
		})),
		'un invitado pudo generar un link de invitación de una nota ajena'
	);
	console.log('✓ sólo el dueño invita');

	// 18. Un token inventado no abre nada. Es el caso que decide si el link es un
	//     secreto o una sugerencia.
	await assert.rejects(
		async () => unwrap(await b.client.rpc('accept_share_invite', { p_token: 'no-existe' })),
		'un token inventado fue aceptado'
	);
	console.log('✓ un token inventado no da acceso');

	// 19. El invitado no puede echar a nadie, ni siquiera a sí mismo por la puerta
	//     del dueño. La suya es `leave_share`, que no toma a quién.
	const tokenParaB = unwrap(await a.client.rpc('create_share_invite', {
		p_note_id: NOTA_DE_A,
		p_member_label: 'B',
		p_owner_label: 'A'
	}));
	unwrap(await b.client.rpc('accept_share_invite', { p_token: tokenParaB }));
	await assert.rejects(
		async () => unwrap(await b.client.rpc('remove_member', {
			p_note_id: NOTA_DE_A,
			p_member_id: a.id
		})),
		'un invitado pudo quitarle el acceso al dueño'
	);
	console.log('✓ sólo el dueño quita a alguien');

	// 20. Y el invitado sí se puede ir solo, que es la otra mitad. Después de
	//     irse, `list_shares` no le devuelve nada y la nota deja de ser legible:
	//     si esto fallara, quitar el acceso sería decorativo.
	unwrap(await b.client.rpc('leave_share', { p_note_id: NOTA_DE_A }));
	const enQueEstaB = unwrap(await b.client.rpc('list_shares'));
	assert.deepEqual(enQueEstaB, [], 'el invitado que se fue sigue figurando en list_shares');
	await assert.rejects(
		async () => unwrap(await b.client.rpc('pull_shared_rows', {
			p_note_id: NOTA_DE_A,
			p_cursor: 0
		})),
		'el invitado que se fue todavía puede leer la nota'
	);
	console.log('✓ el invitado se va solo y deja de leer');
```

**Nota para quien lo escriba:** `NOTA_DE_A` y `NOTA_DE_B` ya existen en el archivo, igual que `a`, `b`, `unwrap` y `push`. Si el caso 16 (`reset_cloud`) ya cerró las comparticiones de A, estos cuatro casos van **antes** de él, no después — leer el orden del archivo antes de pegar y ubicarlos donde A todavía tiene su nota compartida abierta.

- [ ] **Step 10: Correr el candado entero**

Run: `pnpm rls:check`
Expected: **20 de 20**, con las cuatro líneas nuevas impresas.

- [ ] **Step 11: Commit**

```bash
git add supabase/schema.sql scripts/rls-check.mjs
git commit -m "feat(compartir): invitar por link, aceptar con una cuenta, y los nombres

Las cuatro funciones que la parte A dejó nombradas y sin escribir, más las
tres columnas donde viven los nombres. El link no da acceso por sí solo: es
un token que se canjea estando adentro de una cuenta, y eso es lo que hace
que «quién tildó esto» tenga respuesta.

Ningún mail viaja: el dueño escribe cómo se llama el invitado al generar el
link, y cómo firma él. \`list_shares\` gana esa tercera columna, que es la
única forma que tiene el invitado de saber el nombre del dueño.

Cuatro ataques nuevos en el candado: un invitado no reparte la nota ajena,
un token inventado no abre nada, un invitado no echa a nadie, y el invitado
que se va deja de poder leer."
```

---

## Task 2: El cachecito de nombres, en la base local

**Files:**
- Create: `src/lib/storage/share-names.ts`
- Create: `src/lib/storage/share-names.test.ts`
- Modify: `src/lib/storage/settings-registry.ts:29` (agregar `shareOwnerLabel` a `KEY` y a `SETTINGS`)

**Interfaces:**
- Consumes: `db.table('shareMembers')` — la tabla ya existe (`storage/db.ts:173`, v11), con índice sólo por `id`.
- Produces:
  - `rememberShareName(id, name)` → `Promise<void>`
  - `getShareName(id)` → `Promise<string | null>`
  - `shareNameOr(id, fallback)` → `Promise<string>`
  - `KEY.shareOwnerLabel` — cómo firma el dueño, recordado localmente para que lo escriba una sola vez.

- [ ] **Step 1: Escribir las pruebas que fallan**

Create `src/lib/storage/share-names.test.ts`:

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getShareName, rememberShareName, shareNameOr } from './share-names';

describe('el cachecito de nombres de los miembros', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
	});

	it('guarda un nombre y lo devuelve', async () => {
		await rememberShareName('uuid-de-juan', 'Juan');
		expect(await getShareName('uuid-de-juan')).toBe('Juan');
	});

	it('devuelve null para alguien que nunca vio', async () => {
		expect(await getShareName('uuid-desconocido')).toBe(null);
	});

	// El nombre lo escribe el dueño y lo puede corregir: la segunda escritura
	// pisa a la primera en vez de dejar dos filas del mismo uuid.
	it('pisa el nombre anterior del mismo uuid', async () => {
		await rememberShareName('uuid-de-juan', 'Juan');
		await rememberShareName('uuid-de-juan', 'Juan Pérez');
		expect(await getShareName('uuid-de-juan')).toBe('Juan Pérez');
		expect(await db.table('shareMembers').count()).toBe(1);
	});

	// Una compartición abierta por la parte A no tiene ningún nombre, y el
	// servidor devuelve nulo. Que la pantalla muestre "null" sería peor que
	// cualquier frase.
	it('cae en la frase de respaldo cuando no hay nombre', async () => {
		expect(await shareNameOr('uuid-desconocido', 'Quien comparte la nota')).toBe(
			'Quien comparte la nota'
		);
	});

	// Un nombre vacío o de puro espacio es lo mismo que no tener nombre: el
	// campo de texto de la pantalla de invitar deja escribir " " sin quejarse.
	it('trata un nombre en blanco como si no estuviera', async () => {
		await rememberShareName('uuid-de-juan', '   ');
		expect(await shareNameOr('uuid-de-juan', 'Alguien')).toBe('Alguien');
	});
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `pnpm vitest run src/lib/storage/share-names.test.ts`
Expected: FAIL — `Failed to resolve import "./share-names"`.

- [ ] **Step 3: Escribir el módulo**

Create `src/lib/storage/share-names.ts`:

```js
// Cómo se llama la otra persona (spec 038 §6).
//
// Es un CACHE, no contenido: se llena con lo que contesta el servidor y se puede
// tirar sin perder nada. Por eso su tabla (`shareMembers`, v11 de Dexie) no está
// en `SYNCED_TABLES` —subirlo sería subir un cachecito de nombres ajenos— ni en
// `BACKUP_TABLES` —dejarlos en un archivo en claro—, y quedarse afuera de esa
// segunda lista es además lo que lo salva de `replaceAllTables`, que vacía
// exactamente esa lista.

import { db } from './db';

const limpio = (name) => (typeof name === 'string' && name.trim() ? name.trim() : null);

export async function rememberShareName(id, name) {
	await db.table('shareMembers').put({ id, name: limpio(name) });
}

export async function getShareName(id) {
	return limpio((await db.table('shareMembers').get(id))?.name);
}

// Lo que la pantalla llama de verdad. Una compartición abierta antes de que los
// nombres existieran no tiene ninguno, y ese nulo llega hasta acá.
export async function shareNameOr(id, fallback) {
	return (await getShareName(id)) ?? fallback;
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `pnpm vitest run src/lib/storage/share-names.test.ts`
Expected: PASS, 5 de 5.

- [ ] **Step 5: Declarar la preferencia del nombre del dueño**

Modify `src/lib/storage/settings-registry.ts`. En `KEY`, después de `syncAccountId`:

```js
	syncAccountId: 'syncAccountId',
	shareOwnerLabel: 'shareOwnerLabel'
```

Y en `SETTINGS`, después de la línea de `syncAccountId`:

```js
	[KEY.shareOwnerLabel]: { backupSafe: true } // Cómo firmás en las notas que compartís (spec 038 §6). Es una preferencia tuya, como el tema: viaja en el respaldo y se restaura sin problema. No es un dato de nadie más.
```

- [ ] **Step 6: Correr la guardia del registro**

Run: `pnpm vitest run src/lib/storage src/lib/export-import`
Expected: PASS. Hay una prueba que recorre el registro entero y falla si una clave nueva no declara su `backupSafe`; si aparece roja, es esa y le falta la línea de arriba.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/share-names.ts src/lib/storage/share-names.test.ts src/lib/storage/settings-registry.ts
git commit -m "feat(compartir): guardar cómo se llama la otra persona

La tabla la creó la parte A (v11 de Dexie) y hasta ahora estaba vacía. Es un
cache y no contenido: se llena con lo que contesta el servidor y se puede
tirar sin perder nada, y por eso no se sincroniza ni entra al respaldo.

Un nombre en blanco cuenta como ausente, porque el campo de texto de la
pantalla de invitar deja escribir espacios sin quejarse."
```

---

## Task 3: Las llamadas al servidor, desde el cliente

**Files:**
- Create: `src/lib/sync/invites.ts`
- Create: `src/lib/sync/invites.test.ts`
- Modify: `src/lib/sync/shared.ts:138-161` (`reconcileShares`)
- Modify: `src/lib/sync/shared.test.ts`

**Interfaces:**
- Consumes: `create_share_invite`, `accept_share_invite`, `remove_member`, `leave_share`, `list_shares` (Tarea 1); `rememberShareName` (Tarea 2); `setShareRole`, `sharedNoteIdsByRole` (`storage/shares.ts`, parte A).
- Produces:
  - `createInvite(client, noteId, memberLabel, ownerLabel)` → `Promise<string>` (el token)
  - `inviteLink(token, origin)` → `string`
  - `acceptInvite(client, token)` → `Promise<string>` (el `noteId`)
  - `listMembers(client, noteId)` → `Promise<Array<{ id, name }>>`
  - `removeMember(client, noteId, memberId)` → `Promise<void>`
  - `leaveShare(client, noteId)` → `Promise<void>`

- [ ] **Step 1: Escribir las pruebas que fallan**

Create `src/lib/sync/invites.test.ts`. El servidor de mentira ramifica por nombre de `rpc` — **no lo trates como una sola función**: fue exactamente el error que en la parte A puso rojas diez pruebas de golpe cuando `syncNow` empezó a llamar a `list_shares`.

```js
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../storage/db';
import { getShareName } from '../storage/share-names';
import { acceptInvite, createInvite, inviteLink, listMembers, removeMember } from './invites';

function fakeClient(handlers = {}) {
	const llamadas = [];
	return {
		llamadas,
		rpc: async (name, args) => {
			llamadas.push({ name, args });
			if (!handlers[name]) return { data: null, error: null };
			return handlers[name](args);
		},
		// `listMembers` encadena `.select(...).eq(...)`, así que el doble tiene que
		// tener las dos. El `.eq()` NO es adorno: sin él la pantalla del dueño
		// lista juntos los miembros de todas sus notas.
		from: (table) => ({
			select: () => ({
				eq: async () => handlers[`from:${table}`]?.() ?? { data: [], error: null }
			})
		})
	};
}

describe('las invitaciones', () => {
	beforeEach(async () => {
		await db.table('shareMembers').clear();
	});

	it('pide el token con los dos nombres', async () => {
		const client = fakeClient({
			create_share_invite: () => ({ data: 'tok123', error: null })
		});
		const token = await createInvite(client, 'note_1', 'Juan', 'Hernán');
		expect(token).toBe('tok123');
		expect(client.llamadas[0]).toEqual({
			name: 'create_share_invite',
			args: { p_note_id: 'note_1', p_member_label: 'Juan', p_owner_label: 'Hernán' }
		});
	});

	// El error del servidor llega en `error`, no como excepción: sin esta rama la
	// pantalla mostraría "listo" sobre una invitación que no se creó.
	it('convierte el error del servidor en una excepción', async () => {
		const client = fakeClient({
			create_share_invite: () => ({ data: null, error: { message: 'sólo quien comparte la nota puede invitar' } })
		});
		await expect(createInvite(client, 'note_1', 'Juan', 'Hernán')).rejects.toThrow(
			'sólo quien comparte la nota puede invitar'
		);
	});

	// El link tiene que apuntar a la web SIEMPRE. Adentro de la app de escritorio
	// `window.location.origin` es un esquema interno de Tauri, y un link así no lo
	// puede abrir nadie más que la máquina que lo generó.
	it('arma el link contra la web aunque lo genere la app de escritorio', () => {
		expect(inviteLink('tok123', 'https://copynotes-beta.vercel.app')).toBe(
			'https://copynotes-beta.vercel.app/?invitacion=tok123'
		);
		expect(inviteLink('tok123', 'tauri://localhost')).toBe(
			'https://copynotes-beta.vercel.app/?invitacion=tok123'
		);
		expect(inviteLink('tok123', 'http://localhost:5173')).toBe(
			'http://localhost:5173/?invitacion=tok123'
		);
	});

	it('canjea el token y devuelve qué nota esperar', async () => {
		const client = fakeClient({ accept_share_invite: () => ({ data: 'note_1', error: null }) });
		expect(await acceptInvite(client, 'tok123')).toBe('note_1');
	});

	// La lista de miembros sale de la tabla, que su RLS ya le deja leer al dueño.
	// Y de paso se guardan los nombres, porque es el único viaje que los trae.
	it('lista los miembros y de paso guarda sus nombres', async () => {
		const client = fakeClient({
			'from:share_members': () => ({
				data: [{ member_id: 'uuid-de-juan', display_name: 'Juan' }],
				error: null
			})
		});
		const miembros = await listMembers(client, 'note_1');
		expect(miembros).toEqual([{ id: 'uuid-de-juan', name: 'Juan' }]);
		expect(await getShareName('uuid-de-juan')).toBe('Juan');
	});

	it('quita a un miembro por su uuid', async () => {
		const client = fakeClient();
		await removeMember(client, 'note_1', 'uuid-de-juan');
		expect(client.llamadas[0]).toEqual({
			name: 'remove_member',
			args: { p_note_id: 'note_1', p_member_id: 'uuid-de-juan' }
		});
	});
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `pnpm vitest run src/lib/sync/invites.test.ts`
Expected: FAIL — `Failed to resolve import "./invites"`.

- [ ] **Step 3: Escribir el módulo**

Create `src/lib/sync/invites.ts`:

```js
// Invitar, aceptar, y las dos formas de cortar (spec 038 §7).
//
// Todo lo de acá es una llamada sola a una función del servidor. Vive en su
// propio archivo y no adentro de `shared.ts` porque `shared.ts` es el LAZO —
// corre cada 30 segundos, solo— y esto es lo contrario: pasa cuando una persona
// aprieta un botón, y cada llamada tiene que poder mostrar su error en pantalla.

import { rememberShareName } from '../storage/share-names';

// Dónde vive la web. Un link de invitación tiene que abrirse en la máquina de
// otra persona, así que no puede salir del `origin` de la app de escritorio (un
// esquema interno de Tauri) ni del de un `file://`. Un origen http(s) sí sirve
// tal cual, y eso es lo que mantiene vivos el `localhost` del desarrollo y las
// previews de Vercel.
const WEB_APP_URL = 'https://copynotes-beta.vercel.app';

const unwrap = ({ data, error }) => {
	if (error) throw new Error(error.message);
	return data;
};

export function inviteLink(token, origin) {
	const base = typeof origin === 'string' && origin.startsWith('http') ? origin : WEB_APP_URL;
	return `${base.replace(/\/$/, '')}/?invitacion=${encodeURIComponent(token)}`;
}

export async function createInvite(client, noteId, memberLabel, ownerLabel) {
	return unwrap(
		await client.rpc('create_share_invite', {
			p_note_id: noteId,
			p_member_label: memberLabel,
			p_owner_label: ownerLabel
		})
	);
}

export async function acceptInvite(client, token) {
	return unwrap(await client.rpc('accept_share_invite', { p_token: token }));
}

// Por tabla y no por función: `share_members` ya le da `select` a quien es parte
// de la nota, así que una función más sería una puerta de más para lo mismo.
export async function listMembers(client, noteId) {
	const filas =
		unwrap(await client.from('share_members').select('member_id, display_name').eq('note_id', noteId)) ??
		[];
	const miembros = filas.map((fila) => ({ id: fila.member_id, name: fila.display_name }));
	// Este es el único viaje que trae los nombres de los invitados, así que es
	// acá donde se guardan: la bitácora los va a pedir por uuid, mucho después y
	// sin red de por medio.
	for (const miembro of miembros) await rememberShareName(miembro.id, miembro.name);
	return miembros;
}

export async function removeMember(client, noteId, memberId) {
	unwrap(await client.rpc('remove_member', { p_note_id: noteId, p_member_id: memberId }));
}

export async function leaveShare(client, noteId) {
	unwrap(await client.rpc('leave_share', { p_note_id: noteId }));
}
```

**Comprobar que el `.eq()` importa:** sacándolo de `listMembers`, la prueba "lista los miembros" sigue verde (el doble devuelve lo mismo igual). Eso significa que **esa prueba no lo cubre**, y está bien que no lo cubra — lo que lo cubre es el paso 6 del gate manual, donde hay dos notas compartidas de verdad. Anotarlo y no inventar un doble más elaborado para simularlo.

- [ ] **Step 4: Correr y ver pasar**

Run: `pnpm vitest run src/lib/sync/invites.test.ts`
Expected: PASS, 6 de 6.

- [ ] **Step 5: Escribir la prueba que falla de `reconcileShares`**

`list_shares` ahora devuelve tres columnas. Agregar a `src/lib/sync/shared.test.ts`, dentro del bloque que ya prueba `reconcileShares`:

```js
	// La tercera columna de `list_shares` (parte B1): el invitado no tiene otra
	// forma de saber cómo se llama el dueño, así que este viaje es el único que
	// lo trae y hay que guardarlo al pasar.
	it('guarda el nombre del dueño que viene con la lista', async () => {
		const client = fakeClient({
			list_shares: () => ({
				data: [{ note_id: 'note_1', role: 'member', counterpart_label: 'Hernán' }],
				error: null
			})
		});
		await reconcileShares(client);
		expect(await getShareName('owner:note_1')).toBe('Hernán');
	});

	// Y una compartición abierta por la parte A no tiene nombre. Que no reviente
	// es la mitad; la otra es que no escriba un nombre vacío encima de uno bueno.
	it('no pisa un nombre bueno con el nulo de una compartición vieja', async () => {
		await rememberShareName('owner:note_1', 'Hernán');
		const client = fakeClient({
			list_shares: () => ({
				data: [{ note_id: 'note_1', role: 'member', counterpart_label: null }],
				error: null
			})
		});
		await reconcileShares(client);
		expect(await getShareName('owner:note_1')).toBe('Hernán');
	});
```

- [ ] **Step 6: Correrlas y verlas fallar**

Run: `pnpm vitest run src/lib/sync/shared.test.ts`
Expected: FAIL — las dos, con `expected null to be 'Hernán'`.

- [ ] **Step 7: Que `reconcileShares` guarde el nombre**

Modify `src/lib/sync/shared.ts`. Agregar el import:

```js
import { rememberShareName } from '../storage/share-names';
```

Y adentro del primer `for` de `reconcileShares`, **antes** del `continue` que saltea las marcas que no cambiaron — el nombre puede cambiar sin que cambie el rol:

```js
	for (const [noteId, role, label] of fromServer) {
		// El nombre se guarda aunque el rol no haya cambiado: el dueño puede
		// corregir cómo firma, y eso llega por acá sin mover ninguna marca.
		// Un nulo NO se guarda: una compartición abierta antes de que los nombres
		// existieran devuelve nulo para siempre, y escribirlo borraría el bueno.
		if (label) await rememberShareName(`owner:${noteId}`, label);
		if (local.get(noteId) === role) continue;
		await setShareRole(noteId, role);
		changed++;
	}
```

Y el `Map` de arriba tiene que llevar las tres columnas:

```js
	const fromServer = new Map((data ?? []).map((row) => [row.note_id, row.role]));
```

pasa a ser

```js
	// El valor pasa a ser un objeto y no el rol pelado. **Un objeto y no un
	// arreglo a propósito**: recorrer un Map entrega `[clave, valor]`, así que un
	// valor-arreglo obliga a desestructurar dos niveles (`[noteId, [role, label]]`)
	// y ese paréntesis de más es exactamente el que se olvida en el segundo
	// llamador y no falla hasta producción.
	const fromServer = new Map(
		(data ?? []).map((row) => [row.note_id, { role: row.role, label: row.counterpart_label }])
	);
```

Con eso, el bucle de arriba queda:

```js
	for (const [noteId, { role, label }] of fromServer) {
		if (label) await rememberShareName(`owner:${noteId}`, label);
		if (local.get(noteId) === role) continue;
		await setShareRole(noteId, role);
		changed++;
	}
```

**Y hay un segundo llamador que se rompe en silencio si se olvida**: el `for` de `syncShared` (`shared.ts:170`), que hoy hace `for (const [noteId, role] of shares)`. Sin tocarlo, `role` pasaría a ser el objeto entero, y `listSharedPending` compara `role === 'member'` — un objeto nunca es igual a esa cadena, así que **le ofrecería al invitado las tres tablas en vez de sólo bitácora**, que es exactamente el candado que la parte A puso ahí. Queda:

```js
	for (const [noteId, { role }] of shares) {
```

**Antes de escribir el arreglo, escribí la prueba que lo caza**: una que llame a `syncShared` con un `list_shares` que devuelva `role: 'member'` y compruebe que `push_shared_rows` recibió **sólo filas de `activity`**. Comprobala en rojo dejando el `for` viejo. Sin esa prueba, este cambio es un bug de permisos escondido en un refactor de forma.

- [ ] **Step 8: Correr las dos suites**

Run: `pnpm vitest run src/lib/sync/`
Expected: PASS, todo verde. Si `upload.test.ts` se pone rojo, es el `for` de `syncShared` del paso anterior.

- [ ] **Step 9: Commit**

```bash
git add src/lib/sync/invites.ts src/lib/sync/invites.test.ts src/lib/sync/shared.ts src/lib/sync/shared.test.ts
git commit -m "feat(compartir): pedir el link, canjearlo, y listar a quién se lo diste

Cada una de estas es una llamada sola al servidor, y viven aparte del lazo de
sincronización a propósito: el lazo corre solo cada 30 segundos, esto pasa
cuando alguien aprieta un botón y cada error tiene que poder mostrarse.

El link apunta siempre a la web, aunque lo genere la app de escritorio: ahí
adentro la dirección de la app es un esquema interno de Tauri y un link así
no lo abre nadie más que la máquina que lo generó.

\`list_shares\` ahora trae tres columnas, así que quien la lee tuvo que
aprender la tercera — incluido el recorrido de \`syncShared\`, que si se
quedaba viejo le ofrecía al invitado las tres tablas en vez de sólo bitácora."
```

---

## Task 4: La pantalla de compartir aprende a invitar

**Files:**
- Modify: `src/lib/components/ShareDialog.svelte` (el archivo entero: hoy son dos estados y pasa a tres con lista)

**Interfaces:**
- Consumes: `createInvite`, `inviteLink`, `listMembers`, `removeMember`, `leaveShare` (Tarea 3); `getSetting`/`setSetting` + `KEY.shareOwnerLabel` (Tarea 2); `shareNote`/`unshareNote`, `getShareRole`, `sharedReady` (parte A).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Leer el archivo entero**

`src/lib/components/ShareDialog.svelte`, 123 líneas. Fijarse en tres cosas que ya están decididas y **no se re-discuten**: la frase de privacidad vive acá y no en Configuración; `role` arranca en `undefined` y no en `null` (sin esa diferencia, una nota ya compartida muestra un instante el botón de compartir, y ese instante alcanza para un clic); y `run()` ya centraliza el `sharedReady()` + el `toast` de error.

- [ ] **Step 2: Agregar el estado y los cargadores**

En el `<script>`, después de `let working = $state(false);`:

```js
	// Lo que se escribe una vez y se recuerda: cómo firmás. Va en preferencias y
	// no en la nota porque es tuyo, no de la nota.
	let ownerLabel = $state('');
	let memberLabel = $state('');
	let link = $state('');
	let members = $state([]);

	// `$effect` y no `onMount`: el diálogo se monta una vez y se abre muchas, y
	// lo que hay que releer se relee en cada apertura.
	$effect(() => {
		if (!open) return;
		getSetting(KEY.shareOwnerLabel).then((valor) => (ownerLabel = valor ?? ''));
	});

	$effect(() => {
		if (!open || role !== 'owner') return;
		members = [];
		sharedReady().then((client) => client && listMembers(client, noteId).then((lista) => (members = lista)));
	});
```

**Ojo con la regla de Svelte 5 del proyecto:** estos dos `$effect` alcanzan afuera (base de datos y red), que es para lo que `$effect` existe. Nada de lo que muestra la pantalla se calcula adentro de un efecto: `role`, `members` y `link` son estado, no derivados.

- [ ] **Step 3: Las tres acciones nuevas**

Debajo de `run()`:

```js
	async function invitar() {
		working = true;
		try {
			const client = await sharedReady();
			if (!client) {
				toast.error('Para invitar tenés que entrar a tu cuenta en Configuración.');
				return;
			}
			const token = await createInvite(client, noteId, memberLabel.trim(), ownerLabel.trim());
			await setSetting(KEY.shareOwnerLabel, ownerLabel.trim());
			link = inviteLink(token, window.location.origin);
			members = await listMembers(client, noteId);
			memberLabel = '';
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `No se pudo: ${error.message}`
					: 'No se pudo. Probá de nuevo.'
			);
		} finally {
			working = false;
		}
	}

	async function copiarLink() {
		try {
			await navigator.clipboard.writeText(link);
			toast.success('Link copiado.');
		} catch {
			// Sin permiso de portapapeles el link igual está a la vista y se puede
			// seleccionar a mano: avisar es mejor que fallar en silencio.
			toast.error('No se pudo copiar. El link está acá arriba para copiarlo a mano.');
		}
	}

	async function quitar(member) {
		if (
			!confirm(
				`¿Quitarle el acceso a ${member.name || 'esta persona'}?\n\nDeja de recibir los cambios. La copia que ya tiene en su aparato se queda ahí: esto no la puede borrar.`
			)
		) {
			return;
		}
		await run((client) => removeMember(client, noteId, member.id), 'Le quitaste el acceso.');
		const client = await sharedReady();
		if (client) members = await listMembers(client, noteId);
	}
```

**El texto de esa confirmación es del criterio 11 de la spec y no es decorativo:** tiene que decir, antes de que pase, que la copia del otro se queda. Y no se puede confundir con el otro aviso —borrar la nota **sí** le llega y le desaparece— que es un acto distinto.

`run()` hoy recibe `(client, noteId)`; el `quitar` de arriba le pasa una función de un solo parámetro. Ajustar `run` para que llame `action(client)` y que los dos usos viejos pasen `(client) => shareNote(client, noteId)`.

- [ ] **Step 4: La rama del dueño en el marcado**

Reemplazar el bloque `{#if role === 'owner'}` por uno que además invite. Debajo del botón "Dejar de compartir" que ya está:

```svelte
			<div class="border-border flex flex-col gap-3 border-t pt-4">
				<label class="flex flex-col gap-1 text-sm">
					<span class="font-bold">¿Para quién es este link?</span>
					<span class="text-muted-foreground text-xs">
						El nombre que escribas es con el que va a figurar todo lo que haga. No se
						comparte ningún mail, ni el tuyo ni el suyo.
					</span>
					<input
						bind:value={memberLabel}
						placeholder="Juan"
						class="border-border bg-background min-h-(--touch-target) rounded-md border px-3 text-sm"
					/>
				</label>

				<label class="flex flex-col gap-1 text-sm">
					<span class="font-bold">¿Cómo querés que te vean?</span>
					<input
						bind:value={ownerLabel}
						placeholder="Quien comparte la nota"
						class="border-border bg-background min-h-(--touch-target) rounded-md border px-3 text-sm"
					/>
				</label>

				<button
					type="button"
					onclick={invitar}
					disabled={working || !memberLabel.trim()}
					class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
				>
					{working ? 'Generando…' : 'Generar link de invitación'}
				</button>

				{#if link}
					<div class="flex flex-col gap-2">
						<p class="text-muted-foreground text-xs">
							Mandale este link. Vence en 7 días, y sólo sirve entrando con una cuenta.
						</p>
						<code class="bg-muted text-foreground rounded-md px-2 py-2 text-xs break-all">{link}</code>
						<button
							type="button"
							onclick={copiarLink}
							class="border-border hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
						>
							Copiar link
						</button>
					</div>
				{/if}

				{#if members.length}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-bold">Quiénes la están viendo</p>
						<ul class="flex flex-col gap-1">
							{#each members as member (member.id)}
								<li class="flex items-center justify-between gap-2 text-sm">
									<span>{member.name || 'Sin nombre'}</span>
									<button
										type="button"
										onclick={() => quitar(member)}
										class="text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center rounded-md px-2 text-xs font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none"
									>
										Quitar acceso
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
```

- [ ] **Step 5: La rama del invitado gana su salida**

Reemplazar el bloque `{:else if role === 'member'}`:

```svelte
		{:else if role === 'member'}
			<p class="text-sm leading-relaxed">
				Esta nota te la comparte otra persona. Podés leerla y copiarla; el texto lo cambia
				solamente quien la comparte.
			</p>
			<button
				type="button"
				onclick={() =>
					confirm(
						'¿Salirte de esta nota?\n\nDejás de recibir los cambios. La copia que tenés en este aparato se queda acá.'
					) && run((client) => leaveShare(client, noteId), 'Te saliste de la nota.')}
				disabled={working}
				class="border-border text-destructive hover:bg-accent focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors duration-(--motion-fast) focus-visible:ring-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
			>
				Salirme de esta nota
			</button>
```

- [ ] **Step 6: Ver la pantalla, no darla por buena**

Los tests verdes no ven composición. Sacar una captura con Playwright al scratchpad y **mirarla**, en los tres estados (sin compartir, dueño con un miembro, invitado). Es una regla del proyecto y ya se pagó una vez.

Run: `pnpm dev` y abrir el diálogo, o levantar la captura desde un `e2e` de una sola corrida.

- [ ] **Step 7: Correr lo que toca**

Run: `pnpm vitest run && pnpm check`
Expected: unit verde; `check` en sus 4 errores preexistentes y ni uno más.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/ShareDialog.svelte
git commit -m "feat(compartir): generar el link, ver quién la mira, y quitarle el acceso

Dos campos de texto: cómo se llama a quien invitás y cómo querés que te vean.
El segundo se recuerda, así se escribe una sola vez. Ningún mail aparece en
ninguna de las dos pantallas.

La confirmación de quitar el acceso dice, antes de que pase, que la copia que
la otra persona ya tiene se queda en su aparato — esto no la puede borrar. Es
un acto distinto de borrar la nota, que sí le llega, y los dos textos no se
pueden confundir.

El invitado gana su propia salida, que es la misma puerta del otro lado."
```

---

## Task 5: Aceptar la invitación

**Files:**
- Create: `src/lib/sync/invite-return.ts`
- Create: `src/lib/sync/invite-return.test.ts`
- Create: `src/lib/components/InviteAccept.svelte`
- Modify: `src/routes/+page.svelte` (montar el componente)

**Interfaces:**
- Consumes: `acceptInvite` (Tarea 3); `sharedReady`, `syncShared` (parte A); `cleanOAuthUrl` como patrón (`sync/oauth-return.ts`).
- Produces:
  - `inviteToken(href)` → `string | null`
  - `cleanInviteUrl(href)` → `string`
  - `stashInviteToken(storage, token)` / `takeStashedInvite(storage)` → el token que sobrevive el viaje a Google.

- [ ] **Step 1: Escribir las pruebas que fallan**

Create `src/lib/sync/invite-return.test.ts`:

```js
import { describe, expect, it } from 'vitest';
import { cleanInviteUrl, inviteToken, stashInviteToken, takeStashedInvite } from './invite-return';

const APP = 'https://copynotes-beta.vercel.app/';

function fakeStorage() {
	const datos = new Map();
	return {
		getItem: (k) => datos.get(k) ?? null,
		setItem: (k, v) => datos.set(k, v),
		removeItem: (k) => datos.delete(k)
	};
}

describe('la vuelta de una invitación', () => {
	it('lee el token de la dirección', () => {
		expect(inviteToken(`${APP}?invitacion=tok123`)).toBe('tok123');
	});

	it('devuelve null cuando no hay ninguno', () => {
		expect(inviteToken(APP)).toBe(null);
	});

	// Un token en la barra de direcciones sobrevive a un favorito, a una captura
	// y a compartir la pantalla. Se borra apenas se leyó, igual que el `code` de
	// Google.
	it('borra el token de la dirección', () => {
		expect(cleanInviteUrl(`${APP}?invitacion=tok123`)).toBe(APP);
	});

	// Sin tocar nada, `new URL(...).toString()` normaliza la dirección y quien
	// compare las dos reescribiría la entrada del historial para nada.
	it('deja intacta una dirección que no tiene token', () => {
		expect(cleanInviteUrl(APP)).toBe(APP);
	});

	// LA MITAD QUE IMPORTA: entrar con Google se va a otro sitio y vuelve a la
	// raíz SIN nuestros parámetros. Si el token vive sólo en la dirección, el
	// invitado entra a su cuenta y la invitación se evaporó.
	it('guarda el token para que sobreviva el viaje a Google', () => {
		const storage = fakeStorage();
		stashInviteToken(storage, 'tok123');
		expect(takeStashedInvite(storage)).toBe('tok123');
	});

	it('lo entrega una sola vez', () => {
		const storage = fakeStorage();
		stashInviteToken(storage, 'tok123');
		takeStashedInvite(storage);
		expect(takeStashedInvite(storage)).toBe(null);
	});

	// El modo privado puede bloquear el almacenamiento. Perder la invitación es
	// malo; tumbar la app entera al arrancar es peor.
	it('aguanta un almacenamiento que tira', () => {
		const roto = {
			getItem: () => {
				throw new Error('bloqueado');
			},
			setItem: () => {
				throw new Error('bloqueado');
			},
			removeItem: () => {}
		};
		expect(() => stashInviteToken(roto, 'tok123')).not.toThrow();
		expect(takeStashedInvite(roto)).toBe(null);
	});
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `pnpm vitest run src/lib/sync/invite-return.test.ts`
Expected: FAIL — `Failed to resolve import "./invite-return"`.

- [ ] **Step 3: Escribir el módulo**

Create `src/lib/sync/invite-return.ts`:

```js
// El link de invitación llega como `?invitacion=<token>` en la raíz de la app —
// el mismo lugar y la misma forma que la vuelta de Google (`oauth-return.ts`), y
// por el mismo motivo: la app se sirve como un solo index.html y una ruta nueva
// sería un archivo más para que el service worker aprenda a servir offline.
//
// Todo acá son funciones puras: leer, limpiar, guardar. Ninguna toca el DOM.

const STASH = 'copynotes-invitacion';

export function inviteToken(href) {
	return new URL(href).searchParams.get('invitacion');
}

export function cleanInviteUrl(href) {
	const url = new URL(href);
	if (!url.searchParams.has('invitacion')) return href;
	url.searchParams.delete('invitacion');
	return url.toString();
}

// Entrar con Google se va a otro sitio y vuelve a la raíz SIN nuestros
// parámetros. Sin este guardado, quien abre el link estando deslogueado entra a
// su cuenta y la invitación se evaporó en el camino — y no tiene forma de
// recuperarla salvo pedir el link de nuevo.
export function stashInviteToken(storage, token) {
	try {
		storage?.setItem(STASH, token);
	} catch {
		// El modo privado puede bloquear el almacenamiento. Se pierde la
		// invitación, no la app.
	}
}

// Se entrega una sola vez: si quedara guardado, la próxima vez que la persona
// abra la app le volvería a aparecer una invitación que ya aceptó.
export function takeStashedInvite(storage) {
	try {
		const token = storage?.getItem(STASH) ?? null;
		if (token) storage.removeItem(STASH);
		return token;
	} catch {
		return null;
	}
}
```

- [ ] **Step 4: Correr y ver pasar**

Run: `pnpm vitest run src/lib/sync/invite-return.test.ts`
Expected: PASS, 7 de 7.

- [ ] **Step 5: La pantalla de aceptar**

Create `src/lib/components/InviteAccept.svelte`:

```svelte
<script>
	// Aceptar una invitación (spec 038 §7, flujo 2).
	//
	// Tres estados y nada más: sin sesión (hay que entrar), con sesión (aceptar),
	// y aceptada. El link NO da acceso por sí solo, y esta pantalla es donde eso
	// se nota: sin cuenta no hay nada que aceptar.
	import { toast } from 'svelte-sonner';
	import { acceptInvite } from '$lib/sync/invites';
	import { sharedReady, syncShared } from '$lib/sync/shared';

	let { token, onDone } = $props();

	let client = $state(undefined);
	let working = $state(false);

	$effect(() => {
		sharedReady().then((valor) => (client = valor));
	});

	async function aceptar() {
		working = true;
		try {
			await acceptInvite(client, token);
			// La membresía ya está; lo que trae la nota es la pasada siguiente del
			// caño compartido, y se dispara acá para que no haya que esperar 30
			// segundos mirando una pantalla vacía.
			await syncShared(client);
			toast.success('Listo: la nota ya está en tu lista.');
			onDone?.();
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `No se pudo: ${error.message}`
					: 'No se pudo aceptar la invitación.'
			);
		} finally {
			working = false;
		}
	}
</script>

<div
	class="bg-background text-foreground border-border mx-auto my-8 flex max-w-md flex-col gap-4 rounded-lg border p-4 shadow-lg"
>
	<h2 class="text-sm font-bold">Te compartieron una nota</h2>

	{#if client === undefined}
		<p class="text-muted-foreground text-sm">Un segundo…</p>
	{:else if client === null}
		<p class="text-sm leading-relaxed">
			Para abrirla necesitás entrar a tu cuenta de CopyNotes. El link solo no da acceso: así,
			lo que hagas queda firmado con tu nombre.
		</p>
		<p class="text-muted-foreground text-sm">
			Entrá desde Configuración y volvé acá — la invitación te espera.
		</p>
	{:else}
		<p class="text-sm leading-relaxed">
			Si la aceptás, la nota aparece en tu lista. Vas a poder leerla y copiarla; el texto lo
			cambia solamente quien la comparte.
		</p>
		<button
			type="button"
			onclick={aceptar}
			disabled={working}
			class="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-(--touch-target) items-center justify-center rounded-md px-4 text-sm font-bold transition-opacity duration-(--motion-fast) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px disabled:opacity-50"
		>
			{working ? 'Aceptando…' : 'Aceptar y ver la nota'}
		</button>
	{/if}

	<button
		type="button"
		onclick={() => onDone?.()}
		class="text-muted-foreground hover:text-foreground text-xs underline"
	>
		Ahora no
	</button>
</div>
```

- [ ] **Step 6: Montarlo en la raíz**

Modify `src/routes/+page.svelte`. En el `<script>`:

```js
	import InviteAccept from '$lib/components/InviteAccept.svelte';
	import { cleanInviteUrl, inviteToken, stashInviteToken, takeStashedInvite } from '$lib/sync/invite-return';

	let invitacion = $state(null);

	// Se lee UNA vez al arrancar y se borra de la barra en el acto. El guardado
	// es lo que la hace sobrevivir al viaje a Google: se lee de la dirección o,
	// si no hay nada ahí, de lo guardado antes de salir.
	$effect(() => {
		const desdeLaDireccion = inviteToken(window.location.href);
		if (desdeLaDireccion) {
			stashInviteToken(window.localStorage, desdeLaDireccion);
			history.replaceState(null, '', cleanInviteUrl(window.location.href));
		}
		invitacion = takeStashedInvite(window.localStorage);
	});
```

Y en el marcado, arriba de todo:

```svelte
{#if invitacion}
	<InviteAccept token={invitacion} onDone={() => (invitacion = null)} />
{/if}
```

**Ojo con el orden de esos dos pasos.** El token se guarda ANTES de limpiar la dirección, porque limpiarla es lo que lo vuelve ilegible — es el mismo orden que `oauth-return.ts` documenta para el `code` de Google, y por el mismo motivo.

- [ ] **Step 7: Enseñarle a `openApp` a abrir una dirección**

`e2e/app.ts:16` es hoy `openApp(page)` y hace `page.goto('/')` fijo. Necesita el parámetro, y **se agrega ahí y no se esquiva con un `page.goto` suelto**: ese helper existe porque el clic anterior a la hidratación no hace nada y no avisa, y ese patrón ya volvió a morder una vez.

```js
export async function openApp(page, url = '/') {
	await page.goto(url);
	await expect(page.locator('main [data-block-id]').first()).toBeVisible();
}
```

El valor por defecto es lo que deja intactos los ~80 llamadores que ya existen.

- [ ] **Step 8: Las pruebas de punta a punta de lo que no necesita servidor**

Van en `e2e/compartir.spec.ts`, que **ya existe** (lo dejó la parte A con dos pruebas del aviso de privacidad). Un archivo nuevo sería un segundo lugar donde buscar lo mismo.

```js
test('un link de invitación sin sesión pide entrar a la cuenta', async ({ page }) => {
	await openApp(page, '/?invitacion=tok123');
	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toBeVisible();
	await expect(page.getByText(/necesitás entrar a tu cuenta/i)).toBeVisible();
});

// El token no puede quedarse en la barra: sobrevive a un favorito, a una captura
// y a compartir pantalla.
test('el token desaparece de la dirección', async ({ page }) => {
	await openApp(page, '/?invitacion=tok123');
	await expect(page.getByRole('heading', { name: 'Te compartieron una nota' })).toBeVisible();
	expect(page.url()).not.toContain('invitacion');
});
```

**Ojo con `openApp` acá:** espera a que haya un renglón dibujado en `main`, y la pantalla de la invitación se monta **arriba** de la nota, no en lugar de ella. Si esa espera se cuelga, el problema es que `+page.svelte` está devolviendo la invitación en vez de la app entera — y ahí la que está mal es la Tarea 5, paso 6, no la prueba.

- [ ] **Step 9: Correr todo**

Run: `pnpm vitest run && pnpm test:e2e e2e/compartir.spec.ts`
Expected: unit verde; las cuatro de ese archivo en verde (las dos de la parte A y las dos nuevas).

- [ ] **Step 10: Commit**

```bash
git add src/lib/sync/invite-return.ts src/lib/sync/invite-return.test.ts src/lib/components/InviteAccept.svelte src/routes/+page.svelte e2e/app.ts e2e/compartir.spec.ts
git commit -m "feat(compartir): abrir un link de invitación y aceptarla

El link llega como un parámetro en la raíz, igual que la vuelta de Google y
por el mismo motivo: la app es un solo index.html y una ruta nueva sería un
archivo más que el service worker tiene que aprender a servir sin internet.

El token se guarda antes de borrarlo de la barra de direcciones, y ese orden
es la feature: entrar con Google se va a otro sitio y vuelve sin nuestros
parámetros, así que sin ese guardado el invitado entra a su cuenta y la
invitación se evaporó en el camino."
```

---

## Task 6: El invitado no puede escribir

**Files:**
- Modify: `src/lib/editor/Editor.svelte`
- Modify: `src/lib/editor/BlockRow.svelte:764,820` (los dos `contenteditable`)
- Modify: `e2e/compartir.spec.ts` (una prueba más)

**Interfaces:**
- Consumes: `getShareRole` (`storage/shares.ts`, parte A).
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Entender por qué esto va acá y no en B2**

Sin candado, el invitado escribe en su copia, el servidor le rechaza cada renglón por no ser el dueño, y él ve su trabajo en pantalla sin que llegue nunca. La spec lo dice al revés de como suena: **el candado de la pantalla es cortesía, el límite de verdad es el SQL** (§4). Cortesía o no, sin él B1 no se le puede mostrar a nadie.

Lo que este candado **no** hace: impedir tildar y comentar. Eso no es "escribir el texto", es la parte B2 entera, y hasta que exista se bloquea junto con lo demás.

- [ ] **Step 2: Escribir la prueba que falla**

Va en `e2e/compartir.spec.ts`. Marcar la nota abierta como recibida hay que hacerlo **contra IndexedDB desde la página**, porque no hay pantalla que lo haga sin un servidor: `setShareRole` escribe `notes.share`. Antes de escribir el `page.evaluate`, mirar cómo siembran los otros e2e que tocan la base (`e2e/cloud-conflict.spec.ts` y `e2e/agent-visibility.spec.ts` son los dos que ya lo hacen) y **copiar esa forma** en vez de inventar una.

```js
test('una nota que te comparten se lee, no se escribe', async ({ page }) => {
	await openApp(page);

	// La marca es lo único que distingue una nota recibida de una propia.
	// `fromCloud` va porque poner la marca es contabilidad, no una edición.
	await page.evaluate(async () => {
		const { db } = await import('/src/lib/storage/db.ts');
		const primera = await db.table('notes').toCollection().first();
		await db.table('notes').update(primera.id, { share: 'member', fromCloud: true });
	});
	await page.reload();

	await expect(page.locator('main [data-block-id]').first()).toHaveAttribute(
		'contenteditable',
		'false'
	);
});
```

**El `import` de arriba es el que hay que confirmar contra los dos archivos citados**: según cómo esté configurado el server de Playwright, la ruta del módulo puede no ser esa. Si no hay una forma ya establecida de alcanzar `db` desde la página, **esta prueba se cae del plan y su cobertura pasa entera al paso 5 del gate manual** — inventar un mecanismo nuevo de siembra para una sola prueba cuesta más que lo que cubre.

- [ ] **Step 3: Correrla y verla fallar**

Run: `pnpm test:e2e e2e/compartir.spec.ts`
Expected: FAIL — el atributo dice `plaintext-only`, no `false`.

- [ ] **Step 4: Pasar el rol hasta el renglón**

En `Editor.svelte`, junto a donde ya se carga la nota:

```js
	// `undefined` mientras no se leyó, igual que en ShareDialog y por el mismo
	// motivo: si arrancara en null, una nota compartida sería editable durante un
	// instante, y un instante alcanza para escribir una letra que no va a viajar.
	let shareRole = $state(undefined);

	$effect(() => {
		if (!noteId) return;
		shareRole = undefined;
		getShareRole(noteId).then((valor) => (shareRole = valor));
	});

	// Sólo lectura mientras no se sepa, no al revés: la duda se resuelve del lado
	// seguro.
	const readOnly = $derived(shareRole === undefined || shareRole === 'member');
```

**`$derived` y no `$effect`**: es un valor calculado a partir de estado reactivo, y el proyecto tiene esa regla escrita. Un `$effect` que asigne a `$state` para esto es el error que `CLAUDE.md` nombra primero.

Pasar `readOnly` a `BlockRow` como prop.

- [ ] **Step 5: Cerrar los dos `contenteditable`**

En `BlockRow.svelte`, líneas ~764 y ~820:

```svelte
					contenteditable={readOnly ? 'false' : isRich ? 'true' : 'plaintext-only'}
```

y

```svelte
					contenteditable={readOnly ? 'false' : 'plaintext-only'}
```

- [ ] **Step 6: Buscar las otras puertas, no sólo la del ticket**

`contenteditable="false"` frena el tecleo y nada más. Hay que revisar, y cerrar donde haga falta, lo que escribe **sin pasar por el teclado**: el menú `/`, el menú `⋯` del renglón, arrastrar para reordenar, el panel de fecha, las etiquetas, pegar, y la casilla de tarea. La forma barata de encontrarlas es buscar quién llama a las puertas de escritura:

Run: `grep -rn "updateBlock\|createBlock\|deleteBlock\|applySidebarUpdates\|setTaskChecked" src/lib/editor src/lib/components --include=*.svelte`

Cada llamador que se pueda disparar desde la nota abierta necesita la misma guardia. **Esto es el grueso de la tarea, no el atributo de arriba** — un candado con seis puertas y cinco cerraduras no es un candado.

- [ ] **Step 7: Correr todo**

Run: `pnpm vitest run && pnpm test:e2e && pnpm check`
Expected: unit verde; e2e verde salvo el flake conocido del separador (preexistente, medido 4 de 10 en la base — comprobarlo con `--repeat-each` antes de darlo por propio); `check` en sus 4 errores.

- [ ] **Step 8: Commit**

```bash
git add src/lib/editor/Editor.svelte src/lib/editor/BlockRow.svelte e2e/compartir.spec.ts
git commit -m "feat(compartir): una nota que te comparten se lee, no se escribe

El límite de verdad lo pone el servidor, que rechaza por rol cualquier
renglón que mande alguien que no es el dueño. Esto es la cortesía de que no
te deje intentarlo: sin ella, el invitado escribiría, vería su trabajo en
pantalla y no llegaría nunca a destino.

Arranca cerrado y se abre recién cuando se sabe que la nota es propia. Al
revés, una nota compartida quedaría editable el instante que tarda la lectura,
y un instante alcanza para escribir una letra que no va a viajar."
```

---

## Task 7: La guía y el CHANGELOG

**Files:**
- Modify: `docs/guia/20-compartir-una-nota.md`
- Modify: `docs/guia-de-uso.md` (la fecha de "Última actualización")
- Modify: `CHANGELOG.md` (sección `## 0.2.0`)

- [ ] **Step 1: Leer lo que la parte A ya escribió**

`docs/guia/20-compartir-una-nota.md` existe y describe compartir **con vos mismo**, porque era lo único que había. No se reescribe entero: se le agrega la segunda persona.

- [ ] **Step 2: Escribir la parte nueva de la guía**

Sin jerga. Lo que la persona ve y hace. Tiene que cubrir, como mínimo:

- Que se manda un **link**, que **vence a los 7 días**, y que **el link solo no alcanza**: quien lo recibe tiene que entrar con una cuenta.
- Que **vos escribís el nombre** con el que va a figurar la otra persona, y **cómo querés que te vean**. Que **no se comparte ningún mail**.
- Que la otra persona **puede leer y copiar, y no puede cambiar el texto**.
- Que **quitarle el acceso no le borra la copia** que ya tiene, y que **borrar la nota sí le desaparece**. Son dos cosas distintas y hay que decirlas separadas.
- Que **mientras está compartida, esa nota no está cifrada** — ya está en la guía de la parte A; comprobar que sigue y que no quedó contradiciendo lo nuevo.

- [ ] **Step 3: La fecha del índice**

Modify `docs/guia-de-uso.md`: actualizar "Última actualización". Es parte de la regla, no un detalle.

- [ ] **Step 4: La viñeta del CHANGELOG**

En la sección `## 0.2.0` de `CHANGELOG.md`, arriba de todo. Una viñeta, en castellano, contada para quien la usa:

```markdown
- Ahora podés compartir una nota **con otra persona**: le mandás un link, ella entra con su cuenta y la nota le aparece en su lista. Vos escribís con qué nombre va a figurar —no se comparte ningún mail, ni el tuyo ni el suyo— y podés ver quiénes la están mirando y quitarle el acceso a cualquiera cuando quieras. Por ahora la otra persona puede leerla y copiarla, pero no cambiar el texto
```

- [ ] **Step 5: Commit**

```bash
git add docs/guia/20-compartir-una-nota.md docs/guia-de-uso.md CHANGELOG.md
git commit -m "docs(compartir): cómo se le manda una nota a otra persona"
```

---

## Task 8: El gate manual con dos cuentas

No se puede automatizar y no se puede delegar. Son dos cuentas de verdad contra el servidor de verdad, y **se corre también desde el lado del invitado**: hasta que llegue el dominio, el único invitado es la segunda cuenta de Hernán, y nadie más va a reportar lo que se rompa de ese lado.

**Preparación**
- [ ] Compilar la `.app` empaquetada con los cuatro comandos en orden (`copynotes-packaging-the-app`) — **el paso `build:flat` no se saltea**, y `--bundles app` porque el DMG revienta en esta Mac.
- [ ] Cerrar la app vieja con **Cmd+Q** antes de abrir la nueva: `open` sobre una `.app` que ya corre trae adelante el proceso viejo y no relanza nada. Comprobar cuál corre con `ps -eo pid,lstart,command | grep "CopyNotes.app/Contents/MacOS"`.
- [ ] **A = la `.app` empaquetada, con la cuenta de siempre. B = el navegador en `localhost:5173`, con la SEGUNDA cuenta.** Son dos aparatos distintos para la nube y evitan meter el iPhone, que sin candadito no tiene `crypto.subtle`.

**Los pasos**
- [ ] **1.** En A, compartir una nota que tenga al menos tres renglones y una tarea. Generar el link para "Juan", firmando como "Hernán".
- [ ] **2.** Abrir el link en B **estando deslogueado**. Esperado: la pantalla dice que hay que entrar a la cuenta, y **el token desaparece de la barra de direcciones**.
- [ ] **3.** Entrar en B con la segunda cuenta, **con Google**. Esperado: al volver, la invitación **sigue ahí**. Este es el paso que prueba el guardado del token, y es el que se rompe si alguien "simplifica" el orden de la Tarea 5.
- [ ] **4.** Aceptar. Esperado: la nota aparece en la lista de B, **con su texto, sus renglones y sus tareas**, y **nada más** de las notas de A.
- [ ] **5.** En B, intentar escribir en la nota: **no deja**. Probar también el menú `/`, el menú `⋯`, arrastrar un renglón, la casilla de una tarea y pegar. Esperado: ninguno la modifica. **Este paso es el que decide si la Tarea 6, paso 6, se hizo de verdad o se quedó en el atributo.**
- [ ] **6.** En A, mirar la lista de miembros: dice **"Juan"**. En B, la nota figura como compartida por **"Hernán"**.
- [ ] **7.** En A, editar un renglón. Esperado: en B aparece en ~30 segundos.
- [ ] **8.** En A, quitarle el acceso a Juan. Esperado: la confirmación dice **antes** que la copia de B se queda; después de aceptar, B deja de recibir cambios y **su copia sigue ahí**.
- [ ] **9.** Volver a invitar a B, aceptar, y esta vez **salirse desde B**. Esperado: mismo resultado del otro lado.
- [ ] **10.** Con B adentro otra vez, en A **borrar la nota**. Esperado: **desaparece de la lista de B**. No hay papelera: esto es definitivo y la guía lo tiene que decir con esas palabras.
- [ ] **11.** En B, entrar a Configuración y mirar el número de "sin subir". Esperado: **no crece** por tener la nota compartida. Un invitado que ve una cola que nunca baja no tiene forma de saber que está bien.
- [ ] **12.** `pnpm rls:check`. Esperado: **20 de 20**.

- [ ] **Escribir el resultado al final de este archivo**, paso por paso, incluido lo que falle. El del plan de la parte A es el modelo: lo que sirve de un gate escrito es el detalle de lo que salió mal, no la palabra "pasó".

---

## Lo que queda para B2 y B3

No es alcance de este plan; está acá para que no se pierda.

- **B2:** el tilde derivado de la bitácora (§5), los comentarios, `actor` como identidad en las tres pantallas **y en `mcp/lib/tools.js` + `bridge/export.ts`** (§6), y los dos candados anti-atasco (§5 y §3c).
- **B3:** "Listo" (§8 — su mitad del respaldo ya está hecha en `3e42b5e`), el contador de novedades (§8), que deshacer no destilde (§9), y la consulta de moderación.
- **Una medición para B2, hecha al escribir este plan y que ahorra trabajo:** el atasco que §3c describe —"una fila que no se puede mandar arrastra el cursor para atrás en cada pasada"— **no existe con la forma que quedó construida**. `pushSharedNote` marca fila por fila con `markSentToCloud` y no lleva un cursor del tipo de `uploadedThrough`, y `listSharedPending` ya filtra por rol. Antes de construir el arreglo de §3c hay que **medir si el problema pasa**, porque el arreglo se escribió contra una forma del código que no es la que hay. La marca `fromCloud` en las escrituras del invitado sigue teniendo sentido por otro motivo (no son cambios locales), pero eso es una línea, no la tarea que la spec presupuesta.

---

## El resultado del gate (2026-08-17): LOS 12 PASOS PASADOS

Corrido por Hernán con dos cuentas reales contra el servidor real. **A = ventana
normal del navegador en `localhost:5173`** (su app de siempre, con sus notas),
**B = ventana de incógnito** con una cuenta nueva. Dos cosas que la preparación
del plan daba por necesarias y NO lo eran, y que ahorran una hora la próxima:

- **No hace falta empaquetar la `.app`.** Nada de B1 depende del runtime
  empaquetado. Dos ventanas del navegador son dos aparatos distintos de verdad
  (otro IndexedDB) y alcanzan.
- **No hace falta una segunda cuenta de Google.** `disable_signup:false` +
  `mailer_autoconfirm:true` ⇒ crear una cuenta con mail y contraseña es
  instantáneo. Sirve un alias propio (`pulimumi+prueba@gmail.com`).
- El link sale con el origen donde se genera, así que generado en
  `localhost:5173` se abre en B sin tocar nada.

**Nueve bugs reales, todos arreglados y con prueba.** El gate encontró más que
las siete tareas de construcción juntas, y ninguno era visible leyendo el
código de a un archivo por vez:

1. **`fabe1b8` — la invitación no se enteraba de que entraste.** `InviteAccept`
   leía la sesión UNA vez, al montarse, y entrar pasa en esa misma página sin
   recargarla: la tarjeta quedaba clavada en "entrá a tu cuenta" para siempre y
   el botón de aceptar no aparecía nunca. `CloudLifecycle` tenía la lección
   escrita en un comentario, para el websocket, y esta pantalla no la aplicó.
   Ahora sigue la sesión con `onAuthStateChange`.
2. **`c14c3d3` — el candado de sólo lectura tenía cuatro puertas abiertas.**
   `contenteditable="false"` frena el tecleo y nada más. Quedaban: **pegar**
   (el evento llega igual a un elemento no editable, y de ahí salen tres
   caminos que crean renglones), **la barra de formato** (aparecía al marcar
   texto, con todos los botones inertes — peor que no tenerla), **el chip de
   fecha y la cruz de las etiquetas**, y —el que nadie había pensado— **el
   título de la nota, que es un `<input>` aparte al que `readOnly` nunca
   llegaba: el invitado podía renombrar la nota ajena**. Paso 6 de la tarea 6
   decía "buscar las otras puertas" y se había hecho a medias.
3. **`e7bfb03` — `shareNameOr` existía sin un solo llamador.** El nombre del
   dueño se venía guardando desde `list_shares` y no lo mostraba ninguna
   pantalla, así que la mitad B del paso 6 del gate no podía pasar.
4. **`a3dad78` — aceptar no mostraba la nota hasta recargar.** La campanita
   (`appliedVersion`) la tocaba `syncNow`, el único llamador de `syncShared`
   cuando se escribió. El segundo llamador —`InviteAccept`— se la olvidó, y no
   se arreglaba solo: la pasada siguiente ya no cambiaba nada, así que no había
   nada que avisar. La campanita se mudó ADENTRO de `syncShared`.
5. **`9e21cf9` — "No se pudo: TypeError: Failed to fetch"** en pantalla, en
   inglés. Los mensajes del servidor ya vienen en castellano (los escribe cada
   `raise exception`); el único que había que traducir es el del navegador, y
   va en `unwrap`, la puerta única de las seis llamadas.
6. **`9658f25` — el número de "sin subir" son dos colas y Configuración veía
   una.** `countPendingUploads` da 0 sin permiso de subir, así que la cola de un
   invitado es ENTERA la mitad que faltaba: la pantalla le decía siempre cero.
   **Sin este arreglo el paso 11 daba verde sin probar nada.**
7. **`43f2c3a` — salirse de una nota tardaba 30 segundos en notarse.**
   `leaveShare` sólo avisaba al servidor; el panel se dibuja leyendo la marca
   LOCAL, que limpiaba `reconcileShares` en la pasada siguiente. Mientras tanto
   seguía ofreciendo "Salirme de esta nota" a alguien que ya se había ido, y
   cada clic repetía la llamada. Ahora la marca se borra apenas el servidor
   acepta —y sólo si acepta—, y el botón dice "Saliendo…".
8. **`c2c8cb1` — el ícono de compartida no se distinguía del de compartir.**
   Los dos terminaban en `text-foreground` al pasar el mouse, o sea el mismo
   dibujo del mismo color justo en el único momento en que se los compara.
9. **`b1bb8d3` (antes del paso 1) — un aparato sin la llave no podía cerrar
   sesión.** Ver `copynotes-locked-out-no-signout`.

**El falso positivo que casi entra:** la prueba e2e de "no aparece la barra de
formato" **pasaba con el candado puesto Y sin poner**. `toHaveCount(0)` no
espera, y la barra tarda 300ms a propósito. Lleva su espera y el porqué escrito
al lado. Es la segunda vez en esta rama que una prueba de ausencia miente.

**La media hora que se perdió, y cómo no perderla de nuevo:** B empezó a decir
"Sin conexión con la nube" y a fallar con `Failed to fetch`. No era la red ni
Supabase (A andaba, y un `fetch` pelado desde node contestaba en 481ms): **el
servidor de `vite dev` estaba emitiendo una CSP sin el host de Supabase**
(`connect-src 'self' ipc: http://ipc.localhost`). Se arregla reiniciándolo.
Descartados con medición: el build no la cambia, y el sandbox tampoco (un vite
arrancado adentro del sandbox lee `.env` bien). Por qué arrancó con la variable
vacía quedó sin explicar — el log no tiene ningún reinicio.
**Regla: antes de un gate de nube, verificar la CSP con un comando**, no
descubrirla veinte minutos después disfrazada de "no hay internet":

```bash
curl -sI http://localhost:5173/ | grep -io "connect-src[^;]*"
```

**Lo que el producto hizo BIEN bajo esa falla, y conviene no romper:** con el
servidor prohibiéndole hablar, B no perdió nada, no mintió y no se rompió —
dijo "Sin conexión con la nube. Se reintenta solo.", en gris y no en rojo, y
guardó el detalle técnico en el `title`. Eso es exactamente lo que ese diseño
prometía, y fue lo que permitió diagnosticarlo.

**Números al cerrar:** unit **1195**, e2e **183** (el flake del separador es
preexistente: el mismo código da 8/10 en una corrida y otra cosa en la
siguiente — una rotura falla 10/10), `pnpm check` con sus **4 errores
preexistentes**, `pnpm rls:check` **20/20**.

**Decidido por Hernán mirando el resultado, y todavía SIN construir:** cuando
se va el último invitado, la nota **se cierra sola** y vuelve a la bóveda. Hoy
queda compartida —fuera de la bóveda, sin cifrar— sin nadie del otro lado, y la
sección "Quiénes la están viendo" desaparece entera, así que el estado es
invisible. **No se puede hacer en el servidor solo:** cerrar incluye RESELLAR
las filas para que entren al caño cifrado, y eso lo hace el aparato del dueño
(`share-move.ts`); un `close_share` a secas dejaría la nota sin caño,
sincronizando en silencio con nadie. Y "cerrar cuando no hay nadie" a secas
rompe compartir: recién abierta, antes de generar el link, tampoco hay nadie.
La forma sin adivinanzas es que el servidor ANOTE que la compartición se quedó
sin nadie —una columna, puesta sólo por una salida real— y que el dueño la
cierre bien en su pasada siguiente. **Necesita SQL nuevo.**
