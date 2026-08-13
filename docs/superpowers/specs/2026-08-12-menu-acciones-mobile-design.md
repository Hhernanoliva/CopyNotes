# Menú de acciones ("...") en celular: hoja al pie

Fecha: 2026-08-12
Estado: **construido, con la hoja al pie descartada tras probarla** (ver
"Revisión" al final). Lo que quedó: bajar el teclado al abrir, menú anclado al
renglón en toda pantalla, ítems de 44px.

## Problema

Con el teclado en pantalla, el menú de los `...` no entra de ningún lado. Un
iPhone deja unos 350px visibles; el menú mide 222px con los ítems actuales de
34px, y con los 44px que pide la accesibilidad táctil pasaría a ~280px. Si el
renglón está al medio de esos 350px, no hay 280px ni arriba ni abajo.

El arreglo anterior (`0b80819`, reusar `flipIntoView`) resolvió *para qué lado*
abrir y dejó anotado este techo: cuando no entra de ningún lado, el menú se
queda abajo y el teclado lo tapa. Es exactamente lo que apareció al probarlo.

No es un problema de posición. Es que no hay pantalla.

## Decisiones tomadas

- **Al abrir el menú se baja el teclado.** Tocar `...` no es escribir. Sin
  teclado la pantalla pasa de ~350px a ~840px y el menú entra entero con lugar
  de sobra. Es lo que hacen las apps nativas de iPhone al abrir un menú
  contextual.
- **La bajada se decide por el teclado real, no por el aparato.** Se usa la
  misma prueba que ya usa `keyboardInset` (`AGENT.md:94`: el espacio de un panel
  es `visualViewport`, nunca `window.innerHeight`). Sin teclado presente no se
  hace nada, así que en escritorio no cambia el comportamiento.
- **Celular = menos de 768px de ancho**, el mismo corte que usan el panel
  lateral y el menú "/".
- **En celular el menú deja de colgar del renglón y sube desde el pie**, de
  borde a borde, con los mismos 6 ítems en el mismo orden. Es el patrón que la
  app ya eligió para el menú "/" (spec `2026-07-31-menu-slash-mobile-design.md`).
- **Ítems de 44px de alto mínimo** (`--touch-target`), cerrando de paso una
  deuda vieja: hoy miden ~34px, por debajo del mínimo táctil.
- **Velo tenue detrás de la hoja.** Es la diferencia con el menú "/": ese es una
  herramienta de escritura y convive con el texto; este es un menú modal que
  interrumpe. El velo además evita que el toque de "cerrar" le caiga al texto de
  atrás y mueva el cursor.
- **Escritorio no cambia en nada**: sigue colgando del renglón con
  `flipIntoView`.

## Comportamiento

### Celular (menos de 768px)

```
┌──────────────────────────────────────┐
│  Esta es una nota de ejemplo.   ⧉ ⋯  │  ← tocás los "..."
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← velo, el resto queda en pausa
├──────────────────────────────────────┤
│  📝  Agregar comentario              │  ← 44px cada uno
│  ↑   Mover arriba                    │
│  ↓   Mover abajo                     │
│  🔖  Guardar como snippet            │
│  🏷   Etiquetar                       │
│  🗑   Eliminar                        │
└──────────────────────────────────────┘  ← por encima de la barrita del iPhone
```

1. Tocás `...`. Si hay teclado, baja.
2. La hoja sube desde el borde de abajo, de lado a lado.
3. Elegís un ítem, o cerrás tocando fuera / con Escape.
4. Al cerrar sin elegir otra superficie, el cursor vuelve al renglón — igual que
   hoy (`onDismiss`).

Las teclas rápidas que muestran los ítems (`Ctrl+↵`, `#`) se siguen mostrando:
en celular no se usan, pero tampoco molestan y sacarlas obliga a mantener dos
listas de ítems distintas.

### Escritorio (768px o más)

Idéntico a hoy: popover anclado bajo el renglón, que se da vuelta si no entra
abajo y sí arriba (`flipIntoView`). No baja ningún teclado porque no hay.

## Cómo se construye

| Archivo | Cambio |
| --- | --- |
| `src/lib/actions/keyboardInset.js` | Exportar la prueba de "¿hay teclado de verdad?", que hoy vive suelta adentro. |
| `src/lib/editor/BlockActionsMenu.svelte` | Bajar el teclado al abrir; dos disposiciones por CSS; velo. |
| `src/lib/actions/flipIntoView.js` | Guardia: si el panel está fijo a la pantalla, no es un panel colgado de un renglón; no tocarlo. |
| `src/lib/actions/flipIntoView.test.js` | Prueba de esa guardia. |
| `e2e/mobile-a11y.spec.ts` | La prueba de anclado de ayer se reemplaza por la de la hoja; se suman los 44px. |
| `e2e/critical-flows.spec.ts` | La prueba de anclado se muda acá, que corre en tamaño escritorio. |
| `docs/guia/15-usar-en-celular.md` | Cómo se ve y se usa el menú de acciones en el teléfono. |

### Notas de implementación

- **Un solo componente, dos disposiciones por CSS.** Igual que `SlashMenu`: las
  clases `max-md:` eligen hoja al pie abajo de 768px y popover anclado arriba.
  No se duplica el componente — dos copias divergen y una se queda sin los
  atributos de accesibilidad. Este mismo componente ya pagó ese precio una vez:
  su cálculo de posición era una copia vieja de `flipIntoView` y quedó rota
  cuando la buena mejoró.
- **La prueba del teclado se extrae, no se copia.** Hoy `keyboardInset` decide
  "hay teclado si la ventana y el `visualViewport` difieren en más de 100px"
  adentro de su propia función. El menú necesita exactamente esa pregunta.
  Copiarla es cómo nació el bug que estamos arreglando; se exporta y se usa
  desde los dos lados.
- **`flipIntoView` se apaga sola en la hoja.** La acción escribe `top`/`bottom`
  en línea, que le ganan a las clases: si corriera sobre la hoja le pelearía la
  posición. La guardia es una pregunta al navegador ("¿este panel está fijo a la
  pantalla?"), no un `if (esCelular)`, así que sigue el criterio del proyecto de
  no adivinar el aparato.
- **La hoja no usa `keyboardInset`.** Ese ayudante sube un panel para esquivar
  el teclado, y acá el teclado se está yendo: subir y volver a bajar sería un
  salto visible. Si en la prueba a mano se ve la hoja detrás del teclado durante
  la animación de bajada, se agrega — no antes.
- **El velo va fuera del contenedor del menú.** El cierre por toque afuera mira
  si el toque cayó fuera de `rootEl`; un velo adentro no cerraría nada.
- **Espacio para la barrita del iPhone**: `env(safe-area-inset-bottom)` en la
  hoja, para que "Eliminar" no quede debajo del gesto de inicio. El menú "/" no
  lo tiene y no molestó porque es una barra de una fila; acá el último ítem es
  el destructivo.

## Qué queda afuera a propósito

- **No se toca `SlashMenu`.** Su barra al pie ya funciona y su caso es otro (ahí
  seguís escribiendo, así que el teclado tiene que quedarse).
- **No se cambian los ítems**: ni cuáles, ni el orden, ni los textos.
- **No se agrega gesto de arrastrar la hoja para cerrarla.** Toque afuera y
  Escape alcanzan; el gesto es trabajo de animación y estado que no resuelve
  ningún problema reportado.
- **No se detecta "aparato táctil"**: el corte visual es el ancho de pantalla y
  el del teclado es el `visualViewport`, que son los dos criterios que la app ya
  usa.

## Techo conocido (confirmado en uso, aceptado)

En el iPhone de Hernán el teclado **no siempre baja** al abrir el menú, y ahí el
menú queda cortado por abajo. Se comprobó que el mecanismo funciona —en una
página de prueba, enfocar un botón baja el teclado, y la detección da positivo—
así que la causa queda en algo del propio Safari dentro de la app, sin
identificar.

**Decisión de Hernán (2026-08-13): se deja así.** Cuando pasa, el menú se
alcanza deslizando la pantalla, que es una salida aceptable para un caso que no
siempre ocurre. La guía lo dice con esas palabras en vez de prometer que el
teclado siempre baja.

No hay forma de comprobar esto con pruebas automáticas: Playwright no tiene
teclado virtual. Lo que sí quedó probado es todo lo que sí se puede simular
achicando el `visualViewport`.

## Pruebas

- **Unitaria** (`flipIntoView.test.js`): un panel fijo a la pantalla no recibe
  posición; uno anclado sigue decidiendo como hoy.
- **e2e en tamaño celular** (`mobile-a11y.spec.ts`): la hoja aparece pegada al
  borde de abajo y ocupa todo el ancho; cada ítem mide al menos 44px; elegir
  "Eliminar" desde la hoja borra el renglón (la prueba que ya existe tiene que
  seguir en verde pasando por la hoja).
- **e2e en tamaño escritorio** (`critical-flows.spec.ts`): el menú sigue colgando
  del renglón y se da vuelta cuando el renglón está al pie. Es la prueba que
  ayer quedó en `mobile-a11y.spec.ts` y que este cambio deja sin sentido ahí.
- **A mano, en el iPhone de Hernán** (obligatoria): primer renglón, teclado
  abierto, tocar `...` ⇒ baja el teclado, la hoja sube desde el pie y se ven los
  6 ítems enteros. Después: elegir "Mover abajo" y comprobar que el cursor
  vuelve al renglón.

## Documentación

`docs/guia/15-usar-en-celular.md` se actualiza en el mismo commit que el cambio:
que en el teléfono el menú de los `...` sube desde abajo, que el teclado se baja
solo al abrirlo y vuelve al cerrarlo, y que se cierra tocando fuera. La fecha de
"Última actualización" del índice `docs/guia-de-uso.md` también.

---

## Revisión 2026-08-12 (después de probarlo en el iPhone)

La hoja al pie se construyó, se probó en el teléfono y **se descartó**. Lo que
la reemplaza es más chico y funciona mejor.

**Por qué se cayó.** Con el teclado bajándose ya no hay problema de espacio: el
menú entra al lado de su renglón sin acrobacias. Y anclado se lee mejor —se ve
de qué línea es—, mientras que la hoja al pie perdía esa conexión. Dicho de
otra forma: la hoja resolvía un problema que el bajar el teclado ya había
resuelto. Decisión de Hernán al usarla, no en el papel.

**El bug que destapó la prueba a mano.** El teclado bajaba en los renglones de
arriba pero no en los de abajo. La pregunta "¿hay teclado?" restaba dos cosas
que no van juntas: `window.innerHeight - (vv.offsetTop + vv.height)`. El
`offsetTop` es cuánto se CORRIÓ la página —el navegador la corre para mostrarte
el cursor cuando escribís abajo—, no cuánto se comió el teclado. En un renglón
de abajo daba ~4 en vez de ~494, o sea "no hay teclado". Ahora la cuenta es
`window.innerHeight - vv.height`. El error venía de `keyboardInset`, así que el
arreglo también mejora los otros paneles que dependen de esa pregunta.

**El otro efecto secundario, ya arreglado.** Bajar el teclado enfocando el botón
de los `...` hacía salir el globito de ayuda, que se muestra al recibir foco:
quedaba flotando sobre el menú abierto. `tooltip.js` ahora sólo lo muestra si el
foco es `:focus-visible`, o sea si vino del teclado y no de un dedo. Verificado
por los dos lados: con `tap` no sale, con foco de origen teclado sí.

**Qué quedó en pie de la spec original**: bajar el teclado al abrir, decidirlo
por el teclado real y no por el aparato, ítems de 44px, `flipIntoView`
ignorando paneles fijos, y escritorio sin cambios.

**Qué se descartó**: hoja al pie de ancho completo, velo, `safe-area-inset` y
las dos disposiciones por CSS. El componente vuelve a tener una sola.
