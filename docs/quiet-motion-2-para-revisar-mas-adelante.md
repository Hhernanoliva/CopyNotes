# Quiet Motion 2 - Análisis para revisar más adelante

> **Estado:** análisis de revisión futura. No es una especificación ni autoriza implementación.
> **Fecha de la conversación:** 2026-08-11.
> **Decisión actual:** la dirección de gusto llamada **Quiet Motion 2** está aprobada, pero su implementación global queda en pausa hasta que las pantallas y funciones visuales de CopyNotes estén más estables.
> **Objetivo:** conservar el diagnóstico, las decisiones y el punto exacto desde el cual retomar este tema en otra sesión.

Este documento no reemplaza `AGENT.md` ni `specs/024-motion-quiet-motion.md`.
La especificación 024 sigue describiendo el sistema de movimiento que ya existe.
Este archivo registra una revisión posterior al MVP y una conversación sobre lo
que convendría evaluar más adelante.

La existencia de este documento no significa "empezar a animar". Antes de
implementar hay que volver a mirar la aplicación de ese momento, confirmar que
la estructura visual ya está suficientemente cerrada y pedir una nueva decisión
de Hernan sobre el alcance.

## 1. Decisión tomada

No conviene hacer ahora una pasada completa de animaciones por toda la
aplicación.

El motivo es que todavía pueden agregarse pantallas y funciones visuales. Una
pasada global en este momento obligaría a volver sobre los mismos patrones cada
vez que cambie la navegación o aparezca una superficie nueva.

La estrategia acordada es:

- Mantener la base actual de Quiet Motion.
- Pedir que las funciones nuevas respeten sus reglas básicas y la opción
  "Reducir movimiento".
- Evitar animaciones aisladas inventadas para una sola pantalla.
- Esperar para hacer el pulido global de Quiet Motion 2.
- Retomar cuando el mapa principal de pantallas y funciones visuales esté casi
  cerrado.

## 2. Qué ya existe

CopyNotes no está desprovista de animaciones. Quiet Motion fue implementado por
etapas y hoy ya tiene una base útil:

- Tiempos compartidos y una curva común en `src/app.css`.
- Un helper para respetar "Reducir movimiento" también en las transiciones de
  Svelte, en `src/lib/motion.ts`.
- Entrada de la barra lateral en celular y fundido del fondo.
- Entrada y salida de las ventanas principales.
- Aparición de menús, paneles y barra de formato.
- Reacomodo suave de notas, snippets y etiquetas después de arrastrar.
- Confirmaciones para copiar, completar tareas, agregar fechas o etiquetas y
  cambiar de tema.
- Estado visual de guardado.
- Movimiento del aviso para descargar la aplicación de escritorio.

La base técnica no necesita una librería nueva. Svelte y CSS siguen siendo
suficientes para esta aplicación.

## 3. Hallazgo principal

La sensación de falta de movimiento no viene de que Quiet Motion nunca se haya
implementado. Viene de que CopyNotes creció mucho después de aquella pasada.

La aplicación sigue siendo una sola superficie principal, compuesta desde
`src/routes/+page.svelte`: barra lateral, encabezado, editor, ventanas y paneles.
Sin embargo, desde la entrega original de Quiet Motion se agregaron o ampliaron
fuertemente Configuración, nube, emparejamiento de dispositivos, conflictos,
agentes, Agenda y estados de datos.

Las capas externas de esas funciones suelen entrar con el movimiento existente,
pero muchos cambios que ocurren dentro de ellas aparecen o desaparecen de golpe.
Por eso la cobertura se siente desigual.

## 4. Áreas para volver a revisar

| Área | Estado observado | Qué convendría evaluar más adelante |
| --- | --- | --- |
| Base y movimiento reducido | Sólida | Mantenerla como única fuente de tiempos y preferencias. |
| Ventanas principales | Buena en la capa exterior | Revisar los cambios de pasos que ocurren dentro de cada ventana. |
| Configuración y nube | Brecha principal | Acceso, bóveda, emparejamiento, errores y confirmaciones cambian grandes bloques de contenido sin continuidad. |
| Agenda | Brecha importante | Al completar u ocultar una tarea, una fila puede desaparecer sin explicar visualmente qué ocurrió. |
| Estado y conflictos | Brecha importante | El panel entra bien, pero contadores, versiones y decisiones cambian o desaparecen de golpe. |
| Barra lateral | Cobertura parcial | Revisar cambio entre Notas, Snippets, Agenda y Etiquetas, apertura de carpetas y creación o borrado de filas. |
| Menús y paneles | Entrada cubierta | La mayoría entra suavemente, pero se desmonta de inmediato al cerrar. Evaluar una salida corta sin perjudicar el foco. |
| Arrastrar y ordenar | Cobertura parcial | La lista se acomoda al soltar, pero el levantamiento y algunos indicadores aparecen sin transición. |
| Editor | Cobertura parcial y deliberadamente limitada | Completar sólo confirmaciones seguras; no mover texto editable ni filas reales. |
| Pruebas de motion | Básicas | Hoy comprueban principalmente que las funciones sigan operando, no toda la continuidad visual prometida. |

## 5. Inconsistencias que no deben copiarse

La futura revisión no debería limitarse a "agregar más". También debe corregir
algunas diferencias de gusto y ritmo:

- El pulso del botón de tres puntos dura 500 ms y crece hasta una escala de
  `1.35` en `src/app.css`. Es más largo y llamativo que el límite de 240 ms
  definido por Quiet Motion.
- Algunas tildes y chips aparecen desde escalas `0.5` o `0.6`. Se perciben como
  un rebote o un "pop", no como una respuesta tranquila.
- La entrada de paneles está unificada, pero su salida no.
- Algunas distancias y duraciones quedaron escritas directamente en componentes
  en lugar de usar el vocabulario común.
- La guía actual habla de "rebote" y "latido", mientras que la dirección
  original pedía evitar movimiento decorativo. Esa redacción debe reconciliarse
  cuando cambie el comportamiento real, no antes.

## 6. Qué debe permanecer instantáneo

Estas zonas no son faltantes. Son límites de seguridad y concentración:

- Cambiar de una nota a otra.
- El renglón en el que se está escribiendo.
- El cursor y las letras.
- Los resultados que cambian mientras se escribe en Buscar o en el menú `/`.
- Los renglones reales del editor durante un arrastre.
- Guardar, sincronizar o ejecutar una acción: ninguna animación puede retrasar
  el trabajo real.

Si una idea futura pone en riesgo el foco, el cursor o la escritura, debe
descartarse aunque se vea atractiva.

## 7. Dirección de gusto aprobada

El nombre de trabajo es **Quiet Motion 2**.

La dirección aprobada para volver a evaluar es:

- Movimiento calmado, funcional y breve.
- Intensidad baja-media, aproximadamente 4 sobre 10.
- 120 a 150 ms para botones, iconos y confirmaciones.
- 150 a 180 ms para paneles, filas y cambios de estado.
- 220 a 240 ms sólo para ventanas y superficies grandes.
- Salidas más rápidas que entradas.
- Movimiento únicamente para orientar, confirmar o explicar causa y efecto.
- Sin rebotes, resortes, animaciones permanentes ni efectos decorativos.
- Sin Anime.js, Lenis, GSAP ni otra dependencia nueva.
- Misma interfaz en reposo: no cambiar colores, tamaños, espacios ni estructura.
- Versión instantánea cuando el sistema pide "Reducir movimiento".

Está aprobada la dirección estética, no el momento de implementación ni cada
detalle concreto. Esos puntos deben confirmarse cuando se retome.

## 8. Cuándo conviene retomarlo

Reabrir esta revisión cuando se cumpla la mayor parte de lo siguiente:

- La lista de pantallas principales está definida.
- No se esperan cambios grandes en la navegación.
- Configuración, nube, Agenda y las nuevas funciones visuales tienen una forma
  bastante estable.
- Los estados vacíos, de carga, éxito y error de esas funciones ya están
  decididos.
- Sólo quedan mejoras pequeñas o ajustes de contenido.
- Hernan confirma que quiere iniciar la pasada global.

Si todavía hay una pantalla grande sin definir, conviene incorporarla primero y
volver después a esta revisión.

## 9. Cómo retomar en otra sesión

La futura sesión debería seguir este orden:

1. Leer `AGENT.md`, `specs/016-design-system.md`,
   `specs/024-motion-quiet-motion.md` y este documento.
2. Usar Codebase Memory para volver a mapear rutas, componentes visibles y
   superficies agregadas desde 2026-08-11.
3. Comparar la aplicación actual con la tabla de áreas de este documento.
4. Revisar la experiencia real en escritorio y celular antes de proponer código.
5. Confirmar con Hernan si Quiet Motion 2 sigue siendo la dirección deseada y
   cerrar el alcance.
6. Recién después preparar el plan de implementación y decidir si la
   especificación 024 necesita una actualización.

No hay que asumir que los números de línea o la lista de componentes de este
análisis seguirán vigentes. La arquitectura debe volver a comprobarse.

## 10. Orden tentativo si se aprueba construir

Este orden es una propuesta para revisar, no una lista autorizada de tareas:

1. Unificar tiempos, entradas y salidas; corregir escalas y pulsos exagerados.
2. Resolver los flujos de confianza: Configuración, nube, emparejamiento,
   conflictos, estado y Agenda.
3. Mejorar navegación y organización: barra lateral, carpetas y arrastre.
4. Completar microconfirmaciones seguras del editor sin tocar texto editable,
   cursor ni cambio de nota.
5. Verificar accesibilidad, movimiento reducido, teclado, tacto, tema claro y
   oscuro, Chromium y WebKit.

## 11. Verificación futura

Cuando haya cambios reales de comportamiento, la pasada debería incluir:

- `pnpm check`.
- Pruebas unitarias.
- Pruebas de interacción con movimiento normal y reducido.
- Apertura y cierre rápido de ventanas y paneles.
- Comprobación del retorno de foco.
- Escritura continua mientras aparecen confirmaciones.
- Arrastre en Chromium y WebKit.
- Revisión manual en escritorio, celular, teclado y tacto.
- Actualización de `docs/guia/14-movimiento-y-animaciones.md` y de la fecha del
  índice de la guía en el mismo cambio que altere lo que ve la persona.

Este documento, por sí solo, no cambia nada visible y por eso no requiere
actualizar ahora la guía de uso.
