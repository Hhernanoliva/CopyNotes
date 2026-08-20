# Imágenes en notas - Análisis para revisar más adelante

> **Estado:** borrador exploratorio. No es una especificación, no forma parte del
> roadmap y no autoriza implementación.
> **Fecha de la conversación:** 2026-08-19 (revisado el mismo día; ver §0).
> **Objetivo:** conservar la investigación, las decisiones provisionales y las
> preguntas abiertas sobre imágenes para retomarlas con el código y las
> necesidades reales del producto de ese momento.

Este documento registra lo investigado sobre cómo permitir que una persona
agregue imágenes a sus notas sin debilitar las promesas principales de
CopyNotes: funcionamiento local, respaldo completo, sincronización cifrada,
ausencia de pérdida silenciosa y una experiencia sencilla.

No reemplaza `AGENT.md` ni las especificaciones numeradas. Antes de construir
esta función habrá que revisar nuevamente el código, confirmar el alcance con
Hernán y decidir si corresponde actualizar una especificación temática o crear
otra. La existencia de este archivo no significa que ese trabajo esté aprobado.

## 0. Segunda vuelta (2026-08-19, tarde)

Esta sección se agregó después de verificar el borrador contra el código y de
volver a buscar afuera. **Manda sobre el resto del documento donde se
contradigan.** Lo de abajo quedó tal como estaba para no perder el rastro.

### 0.1 El caso de uso real son capturas de pantalla

Hernán aclaró que las imágenes se van a usar **casi exclusivamente para dejar
capturas de pantalla en las notas**. Sacar una foto con el celular y meterla en
CopyNotes es raro y no tiene relevancia para la primera versión.

El resto del documento está escrito alrededor de fotos de cámara. Con capturas
se cae buena parte:

| Paso del plan original | Con capturas |
|---|---|
| Convertir HEIC del iPhone (§6, §17 pregunta 3) | **Irrelevante.** Las capturas son PNG en Mac y en Windows. |
| Quitar EXIF y GPS (§1, §6) | **Irrelevante.** Una captura no tiene ubicación ni datos de cámara. |
| Corregir la orientación (§6 paso 4) | **Irrelevante.** Ninguna captura viene acostada. |
| Achicar a 2560 px (§6) | **Se da vuelta.** En una foto achicar es gratis; en una captura **borronea el texto que se fue a capturar**. |
| Arrastrar archivos y selector múltiple (§7) | **Baja de prioridad.** La entrada real es Ctrl/Cmd+V. |

De los ocho pasos de preparación de §6 quedan cuatro: comprobar que es una
imagen de verdad, mirar que no sea enorme, leer alto y ancho, calcular la huella.

Si alguna vez hay que achicar una captura, la única regla segura es bajarla a la
mitad exacta —una pantalla Retina a la mitad es lo que se ve en un monitor
común— y guardarla en PNG.

### 0.2 Tres correcciones: el borrador se equivoca sobre el código

1. **`writeBlock` no existe.** Son `createBlock`, `putBlock` y `updateBlock` en
   `src/lib/storage/blocks.ts` (líneas 14, 65 y 120), las tres envueltas en
   `trackPendingWrite`. El consejo de §2 vale; el nombre no.
2. **El respaldo no pierde en silencio.** §11 teme que una aplicación vieja
   importe un respaldo con imágenes y las descarte. No puede:
   `src/lib/export-import/schema.ts:16` sólo acepta las versiones 1 a 5, y la
   línea 34 valida el tipo de bloque contra una lista cerrada. Falla con
   mensaje.
3. **Una tabla sincronizada nueva ya está bloqueada del lado del servidor.**
   `supabase/schema.sql:35` tiene una restricción que sólo acepta las siete
   tablas actuales.

Lo demás de §2 se verificó y es cierto: el sanitizador borra `<img>` (lista
blanca en `src/lib/format/sanitize.ts:24`), la política de seguridad permite
`self` y `data:` pero no `blob:` (`vite.config.ts:64`, con un test que se rompe
al tocarla en `e2e/security-csp.spec.ts`), `src/lib/sync/records.ts` perdería un
archivo binario al convertirlo a JSON, y Deshacer guarda hasta cien copias
enteras de los bloques (`src/lib/editor/history.ts:6`).

### 0.3 Cuatro simplificaciones sobre el plan

**a) El identificador de la imagen debe ser su huella SHA-256.** §6 ya calcula
la huella y §3 la guarda al lado de un identificador al azar. Si la huella *es*
el identificador se caen media docena de reglas del plan: reemplazar nunca pisa
bytes (bytes distintos dan huella distinta); copiar, guardar como atajo y
deshacer no clonan nada; la misma captura pegada dos veces ocupa una sola vez;
el respaldo se verifica solo porque el nombre del archivo *es* el control; y
reintentar una subida cortada no duplica ni pisa.

Trampa: la ruta en la nube **no puede ser la huella cruda**. Habilita el
*confirmation of a file attack* — alguien con la base puede preguntar "¿esta
cuenta tiene esta imagen conocida?" sin descifrar nada. Se usa
`HMAC(llave de la bóveda, huella)` como nombre en el servidor: la ventaja se
conserva dentro de la cuenta y la comparación entre cuentas se vuelve imposible.

**b) El respaldo `.copynotes` no necesita ninguna librería.** §9 compara tres.
Las capturas ya vienen comprimidas, así que un ZIP **sin compresión** alcanza:
son unas cien líneas propias y **vuelve imposible la bomba zip por
construcción** —si nada se comprime, nada puede expandirse—, lo que borra cuatro
de las defensas que §9 pide escribir. Sigue siendo un ZIP real que abre el doble
clic en Mac y en Windows, con el `backup.json` legible adentro. Si algún día
hace falta descomprimir, el navegador ya lo trae de fábrica
(`DecompressionStream` con `deflate-raw`, disponible en todos desde mayo de
2023). El proyecto tiene siete dependencias de ejecución en total; ésta no hace
falta.

**c) El guardia de versión va sólo en la puerta de subida.** §11 quiere
versionar subida y bajada. `push_records` ya es literalmente la única puerta por
la que una fila puede entrar (`supabase/schema.sql:96`, corre como su dueño y la
escritura directa está prohibida): cinco líneas de SQL ahí alcanzan. Una
aplicación vieja queda así: sigue bajando y muestra la imagen como un renglón de
texto con la descripción —inofensivo—, no puede subir nada y por eso avisa
"Actualizá CopyNotes", y su respaldo lo rechaza la aplicación nueva por número
de versión.

**d) IndexedDB y no OPFS, ahora con números.** §5 lo dejó como "posponer" por
instinto. OPFS empieza a ganar recién en decenas de megas (unos 400 ms para 50
MB); a 300 KB por captura la diferencia son 2 ms, e IndexedDB comparte
transacción con Dexie, así que el bloque y sus bytes entran juntos o no entra
ninguno.

### 0.4 Una trampa medida: Safari devuelve PNG en silencio

Safari no sabe generar WebP desde `canvas.toBlob`. No falla: **devuelve un PNG y
sigue**, porque la especificación de HTML manda usar PNG cuando el formato
pedido no está soportado. Eso pega en dos de los cuatro destinos de CopyNotes:
la aplicación de escritorio de macOS usa el motor de Safari, y la web en iPhone
también. Windows, que usa Chromium, sí puede.

Conclusión: **no convertir nada; guardar los bytes tal como vinieron del
portapapeles.** Es más rápido, no pierde nitidez, no se comporta distinto según
la máquina y esquiva la trampa entera. Si alguna vez se pide WebP, hay que
comprobar el tipo del archivo *después* de codificar, nunca confiar en lo
pedido.

### 0.5 Pegar una imagen no lo puede probar ningún test automático

El Ctrl+V de Playwright no dispara un pegado real del sistema. Esta función se
verifica pegando a mano en las cuatro plataformas, o no se verifica. Es la misma
categoría que el selector de archivos nativo, que ya costó un bug en producción.

### 0.6 Datos externos que faltaban

- Supabase Free: además de 1 GB de almacenamiento y 5 GB de transferencia, hay
  un tope de **50 MB por archivo** y **el proyecto se pausa a los 7 días sin
  actividad**. Lo segundo importa para una beta que se usa poco.
- Guardar los bytes en la base en vez de en Storage no conviene: el lote de
  sincronización son 200 filas, lo que daría 80 MB de una sola vez; y el plan
  pago ofrece 8 GB de base contra 100 GB de almacenamiento.
- Standard Notes —notas cifradas punta a punta con adjuntos, el producto más
  parecido— usa exactamente la forma que propone §3: archivo cifrado en el
  aparato, subido aparte, referenciado desde la nota.

### 0.7 Cómo queda la primera versión

1. Pegar una captura crea un bloque de imagen; `/imagen` como segunda puerta.
2. Los bytes van a IndexedDB con su huella de nombre.
3. Viajan cifrados a Supabase Storage y bajan al otro aparato.
4. Entran y salen del respaldo `.copynotes`.
5. Cinco líneas de SQL para que una aplicación vieja no pueda pisar la cuenta.

Sin conversión de formatos, sin EXIF, sin librería de ZIP, sin arrastrar
archivos, sin HEIC.

### 0.8 Lo único que queda por medir

Leyendo código no se puede averiguar. Hay que probarlo:

1. Si pegar una captura entrega el archivo en los cuatro lados: aplicación de
   macOS, aplicación de Windows, navegador y iPhone.
2. Cuánto pesan las capturas reales de Hernán, para fijar el tope con un número
   y no a ojo.

## 1. Decisiones provisionales de esta conversación

Hernán eligió estas direcciones para orientar una futura investigación:

- La primera entrega debería cubrir **notas personales de punta a punta**:
  funcionamiento offline, respaldo completo y sincronización cifrada entre sus
  dispositivos.
- No conviene publicar un piloto que sólo muestre la imagen localmente y después
  la pierda al restaurar o al abrir otro aparato.
- Las fotos grandes deberían **optimizarse automáticamente**. CopyNotes no sería
  un archivo de originales: reduciría peso y dimensiones y quitaría metadatos
  privados, como la ubicación.
- El respaldo completo debería pasar a un único archivo `.copynotes`, con el JSON
  legible y las imágenes adentro.
- Las imágenes en notas compartidas quedarían fuera de la primera versión. Una
  nota con imágenes no se podría compartir y una nota ya compartida no admitiría
  nuevas imágenes.
- La nube de imágenes empezaría como una beta pequeña sobre Supabase Free. Antes
  de abrirla al público se evaluaría el uso real y se pasaría a Supabase Pro.

Son elecciones de trabajo, no un contrato cerrado. Los límites, formatos y
detalles de interacción necesitan pruebas reales antes de aprobarse.

## 2. Qué existe hoy en el código

La arquitectura actual puede recibir imágenes sin cambiar de editor, pero hoy
presupone que el contenido portable es texto y objetos JSON pequeños.

### Bloques y editor

- `src/lib/format/blocktype.ts` contiene la lista central de tipos. No existe un
  tipo de imagen.
- `src/lib/editor/BlockRow.svelte` considera texto enriquecido a todo lo que no
  sea código o separador. Agregar un tipo sin una rama propia lo convertiría por
  accidente en otro `contenteditable` de texto.
- El pegado actual acepta el formato interno de CopyNotes o `text/plain`. No
  inspecciona archivos de imagen del portapapeles.
- Enter, Backspace, unión de renglones, selección múltiple y cambio de tipo
  suponen que el contenido principal del bloque es texto.
- Deshacer guarda fotografías de la lista de bloques. Meter los píxeles dentro
  del bloque copiaría esos bytes hasta cien veces en memoria.
- Toda escritura de un bloque desde el editor debe seguir pasando por
  `writeBlock` o por una nueva operación que comparta su cola. Una escritura
  directa dejaría armado un guardado viejo que podría pisarla medio segundo
  después.

### Almacenamiento local

- `src/lib/storage/db.ts` usa Dexie sobre IndexedDB y actualmente llega a la
  versión 12.
- IndexedDB y Dexie pueden guardar un `Blob` sin convertirlo a texto.
- Las cadenas de `stores()` sólo declaran índices. El archivo binario no debería
  indexarse.
- Los hooks de las tablas sincronizadas agregan `changeSeq` y avisan a otras
  pestañas. Un cuerpo descargado no puede pasar por esos hooks como si fuera una
  edición local.
- La creación del bloque y el guardado de sus bytes deberían ocurrir juntos:
  ambos o ninguno. IndexedDB permite esa transacción si toda la preparación de la
  imagen se hace antes de abrirla.

### Sincronización

- `src/lib/sync/records.ts` hace `JSON.stringify` de cada fila antes de cifrarla.
  Un `Blob` colocado en una fila sincronizada se convertiría en `{}` y los bytes
  se perderían.
- `src/lib/sync/pending.ts` y `src/lib/sync/upload.ts` trabajan en lotes de hasta
  200 filas, sin presupuesto por cantidad de bytes.
- `src/lib/sync/upload.ts` ya conserva la fila rechazada más antigua por debajo
  del cursor. Ese mecanismo puede reutilizarse para impedir que un bloque con una
  imagen todavía no subida quede olvidado.
- `src/lib/sync/download.ts` aplica nombres de tabla recibidos desde el servidor
  directamente sobre Dexie. Una tabla sincronizada nueva rompería clientes
  antiguos que no la conocen.
- Los cambios externos actualizan la nota abierta en el lugar y no vuelven a
  montar el editor. La llegada de los píxeles debe mantener esa regla.

### Respaldo y archivos

- El respaldo actual es JSON, `formatVersion: 5`, y enumera sus tablas en
  `src/lib/export-import/schema.ts`.
- `src/lib/platform/files.js` abre archivos completos como texto y rechaza más de
  64 MiB antes de leerlos.
- La exportación se autovalida y el modo “Reemplazar todo” sólo acepta una copia
  completa. Esas garantías deben cubrir también las imágenes.
- La guía promete que el JSON puede abrirse con cualquier editor de texto y que
  incluye la papelera. Un paquete `.copynotes` cambia la forma de cumplir esa
  promesa: el JSON seguiría siendo legible, pero después de abrir el paquete.

### Seguridad de la pantalla

- El sanitizador elimina `<img>` deliberadamente. Eso debe continuar: una imagen
  es contenido estructurado de CopyNotes, no HTML arbitrario dentro del texto.
- La política de seguridad de `vite.config.ts` permite imágenes desde `'self'` y
  `data:`, pero no desde `blob:`. Mostrar un `Blob` local requiere habilitar ese
  origen sólo para imágenes.
- No hace falta permitir direcciones externas de imágenes. La aplicación puede
  descargar bytes autenticados, guardarlos localmente y pintarlos con una URL
  temporal `blob:`.

## 3. Conclusión técnica que parece más sólida

Hay una decisión que sí aparece firme en todas las alternativas revisadas:

> Los píxeles deben vivir fuera del HTML, fuera del texto del bloque y fuera de
> las filas JSON que hoy sincroniza CopyNotes.

La forma mínima que merece un prototipo futuro es:

- Un bloque o snapshot conserva sólo información pequeña: identificador de
  imagen, tipo, tamaño, dimensiones, huella digital y descripción.
- Una tabla local provisional, por ejemplo `imageBodies`, conserva
  `{ imageId, blob }` y el estado local necesario para saber si ese cuerpo ya se
  subió para la cuenta actual.
- El objeto de Supabase Storage usa el mismo `imageId`, pero contiene únicamente
  los bytes cifrados.
- Reemplazar una imagen crea un identificador nuevo. Los bytes de un identificador
  existente nunca se pisan.
- Copiar, guardar como snippet o importar una copia genera identificadores nuevos
  y clona los bytes. Deshacer reutiliza el mismo identificador.

Esta forma evita una dependencia entre una fila `asset`, una fila `block` y un
objeto de Storage. También evita introducir una tabla sincronizada que los
clientes anteriores no pueden abrir.

## 4. Pregunta todavía abierta: qué identifica visualmente al bloque

Se encontraron dos variantes razonables. No conviene elegir una sin construir
antes una prueba de compatibilidad.

### Variante A - Tipo `image`

El bloque lleva `type: 'image'` y una descripción opcional en `content`.

Ventajas:

- El editor sabe con claridad que es un elemento atómico y no texto normal.
- Enter, Backspace, cambio de tipo, accesibilidad y exportación pueden tener
  reglas explícitas.
- Un respaldo abierto por una versión antigua rechaza el tipo desconocido en vez
  de afirmar falsamente que guardó todo.

Riesgos:

- Una versión antigua que reciba el bloque por la nube no conoce ese tipo.
- Hace imprescindible un guardia de versión del protocolo antes de subir la
  primera imagen.

### Variante B - Imagen adjunta a un tipo ya conocido

El bloque sigue siendo `text` y la presencia de `imageId` cambia su representación
en las versiones nuevas.

Ventajas:

- Un cliente antiguo puede seguir mostrando y editando la descripción como
  texto.
- Reduce el corte visual si un aparato tarda en actualizarse.

Riesgos:

- Una versión antigua podría exportar un respaldo que parece válido, pero omite
  `imageId` y los bytes porque no conoce esos campos.
- También podría convertir el bloque a viñeta o tarea y dejar una combinación
  que la versión nueva nunca habría permitido.

Dirección provisional: **tipo `image` más guardia de protocolo**, porque fallar
con un pedido claro de actualización es preferible a producir un respaldo que
declara éxito mientras pierde imágenes. Esta elección debe revalidarse.

## 5. Por qué se descartan otras formas rápidas

| Alternativa | Problema principal | Evaluación provisional |
|---|---|---|
| `<img>` en `block.html` | El sanitizador lo elimina; mezcla archivos con formato de texto | Descartada |
| Base64 dentro del bloque | Aumenta el tamaño, infla Deshacer, conflictos, búsqueda y sincronización | Descartada |
| `Blob` en una fila sincronizada | `JSON.stringify` pierde los bytes | Descartada |
| URL externa | No funciona offline, puede desaparecer y revela cada apertura | Descartada |
| Ruta del disco | No viaja entre aparatos y la PWA no puede confiar en ella | Descartada |
| OPFS como primera versión | No comparte transacción con Dexie y obliga a reconciliar dos almacenes | Posponer |
| Tabla `assets` sincronizada + cuerpos | Buen modelo para adjuntos generales, pero agrega otra fila y rompe clientes antiguos | Revisar si el alcance crece |
| Metadata en bloque + `imageBodies` local | Menos piezas y mejor encaje con el sync actual | Prototipo recomendado |

Una tabla `assets` separada volvería a ser preferible si aparecen varias imágenes
por bloque, reutilización sin copias, PDF/audio, miniaturas, variantes, galerías o
limpieza remota avanzada.

## 6. Ingesta y optimización a investigar

> **§0.1 anula buena parte de esta sección.** Con capturas de pantalla se caen
> HEIC, EXIF, orientación y el achicado a 2560 px, y §0.4 dice por qué no hay
> que convertir el formato.

La imagen debería prepararse antes de tocar IndexedDB:

1. Comprobar el tamaño declarado por el archivo.
2. Revisar su firma real, no sólo la extensión o `file.type`.
3. Leer dimensiones antes de decodificar cuando el formato lo permita, para
   evitar imágenes diminutas en disco pero gigantes al abrirse.
4. Decodificar y corregir orientación.
5. Reducir dimensiones si exceden el límite.
6. Volver a codificar para quitar EXIF, GPS y otros metadatos.
7. Calcular una huella SHA-256 sobre los bytes finales.
8. Recién entonces abrir una transacción y guardar bloque más cuerpo.

Punto de partida para probar, no límites aprobados:

- Hasta 15 MiB en el archivo elegido.
- Hasta 2560 px en el lado más largo guardado.
- Hasta 5 MiB después de optimizar, por debajo del umbral de 6 MB que Supabase
  recomienda para la subida estándar.
- JPEG, PNG y WebP como formatos portables guardados.
- SVG fuera de la primera versión por su superficie de seguridad.
- GIF animado fuera mientras no se decida si conservar o perder la animación.
- HEIC como pregunta de compatibilidad: probar la Fototeca real de iPhone. Si el
  navegador lo decodifica, normalizarlo; si no, decidir si alcanza un mensaje o
  si una dependencia pesada se justifica.

`createImageBitmap` y `canvas.toBlob` son candidatos nativos. Hay que medirlos en
un iPhone y en los WebViews reales de macOS y Windows antes de decidir si hace
falta un worker o una librería.

## 7. Experiencia de uso conversada

Las entradas deseables son:

- `/imagen` desde el menú de comandos.
- El botón `+` del renglón activo.
- Pegar una captura desde el portapapeles.
- Arrastrar uno o varios archivos en escritorio.
- Selector de archivos con selección múltiple.

Reglas provisionales:

- Una imagen elegida crea un bloque; varias crean uno por archivo y conservan el
  orden.
- Cancelar el selector no consume `/imagen`, no cambia el tipo y no mueve el
  cursor.
- Un `<img src="https://...">` copiado desde una página no se descarga
  automáticamente. Sólo se acepta un archivo real entregado por el portapapeles.
- La imagen conserva su proporción y usa dimensiones guardadas para evitar que la
  nota salte mientras carga.
- La descripción es opcional, visible, buscable y sirve como texto alternativo.
- Una imagen sin descripción sigue siendo un bloque con contenido; no es un
  “renglón vacío”.
- Enter crea un renglón de texto según las reglas de jerarquía vigentes.
- Backspace al principio de la descripción enfoca primero la imagen; otra acción
  la elimina. Nunca se une el archivo con el texto anterior.
- Tab, Shift+Tab, selección múltiple, movimiento y colapsado deberían seguir
  siendo estructurales y funcionar igual que con otros bloques.
- Una imagen no debería convertirse en título, tarea o separador desde el menú de
  cambio de tipo.
- El archivo se muestra mediante `URL.createObjectURL` y la URL se revoca cuando
  deja de usarse.
- `loading="lazy"`, `decoding="async"`, ancho y alto deberían evitar cargar o
  decodificar toda una nota de imágenes de golpe.

Queda por decidir si tocar la imagen abre una vista ampliada, cómo se enfoca con
teclado y qué acciones aparecen en `⋯` (reemplazar, copiar, descargar la versión
optimizada o eliminar).

## 8. Deshacer, borrado y vida de los archivos

Separar los bytes mantiene livianas las fotografías de Deshacer, pero introduce
una pregunta nueva: cuándo puede borrarse físicamente un cuerpo.

Reglas de seguridad provisionales:

- Deshacer y rehacer conservan el mismo `imageId`.
- Un bloque borrado suavemente sigue referenciando su imagen, porque el respaldo
  actual incluye la papelera.
- Una imagen reemplazada debe seguir disponible mientras el historial de la
  sesión pueda restaurarla.
- Los conflictos deben contar como referencias: la versión remota puede apuntar
  a una imagen que todavía no ganó.
- La primera versión no debería borrar automáticamente un objeto de la nube que
  alguna vez estuvo referenciado. Otro aparato offline todavía puede necesitarlo.
- Los cuerpos locales huérfanos de una operación fallida podrían limpiarse al
  reiniciar, sólo después de comprobar bloques, snippets y conflictos.

Esto deja una deuda de espacio. Antes de una versión pública hay que decidir cómo
conviven las imágenes borradas con la promesa de que el respaldo lleva la
papelera. Un límite total sin una forma de liberar espacio terminaría bloqueando
al usuario, así que no debe inventarse sólo para proteger costos.

## 9. Respaldo `.copynotes`

La dirección aprobada en la conversación es un ZIP estándar con una extensión
propia:

```text
copynotes-backup-YYYY-MM-DD-HHMM.copynotes
├── backup.json
├── README.txt
└── images/
    ├── <imageId>.webp
    └── <imageId>.png
```

Consecuencias:

- `backup.json` sigue siendo un formato propio, versionado y legible después de
  abrir el paquete.
- El manifiesto probablemente necesite `formatVersion: 6`: una aplicación vieja
  no puede comprender el tipo, las referencias ni los bytes. Es uno de los casos
  en los que `specs/040-backup-compatibility-contract.md` permite pagar el costo
  de una versión nueva.
- La aplicación nueva debe continuar importando JSON de las versiones 1 a 5.
- Un respaldo sólo puede declarar `complete: true` cuando cada referencia tiene
  su archivo y coinciden tipo, tamaño y huella.
- “Reemplazar todo” debe comprobar paquete, referencias, espacio disponible y
  bytes antes de borrar una sola fila actual.
- Una importación grande puede necesitar una tabla temporal: validar y preparar
  imágenes de a una, y hacer visible el cambio sólo cuando el conjunto está
  completo.
- El importador debe rechazar rutas `../`, nombres absolutos, entradas repetidas,
  archivos individuales excesivos, demasiadas entradas y relaciones de
  compresión propias de un ZIP malicioso.
- El respaldo recién creado debe validarse antes de afirmar que salió bien. Si
  falta un cuerpo por un fallo previo, conviene guardar la mejor copia posible
  como incompleta y decirlo, nunca asegurar que está completa.

Candidatos de librería revisados —**§0.3.b los descarta a los tres**: un ZIP sin
compresión, escrito a mano, no necesita librería y vuelve imposible la bomba zip:

| Librería | Ventaja | Costo o riesgo | Lectura provisional |
|---|---|---|---|
| `@zip.js/zip.js` | Streams, Zip64, lectura/escritura incremental y pruebas de navegador/Safari | Paquete más grande | Mejor candidata para proteger el respaldo |
| `fflate` | Muy pequeña y rápida, también tiene streams ZIP | API más baja; CopyNotes tendría que escribir más control de seguridad | Alternativa si el prototipo de `zip.js` pesa demasiado |
| JSZip | API conocida | Sus caminos habituales conservan el resultado completo en memoria | No preferida |

La dependencia debe cargarse sólo al abrir Respaldo y pasar la reevaluación de
`specs/015-non-ui-library-decision.md`. No hay que instalarla hasta medir memoria,
tamaño del build y archivos dañados en WebKit.

## 10. Sincronización privada cifrada

Dirección provisional:

1. Guardar localmente el bloque y el cuerpo optimizado.
2. Encontrar que la fila está pendiente mediante el mecanismo actual.
3. Leer el cuerpo por `imageId`.
4. Cifrar los bytes con AES-GCM y la misma llave de la bóveda, usando un IV nuevo
   y ligando la identidad y versión como datos autenticados.
5. Subir el objeto inmutable a un bucket privado de Supabase Storage.
6. Sólo después subir la fila JSON que lo referencia.
7. Confirmar `cloudSeq` mediante el mecanismo actual.

El servidor vería cuenta, tamaño aproximado, cantidad y momento de transferencia,
pero no formato, dimensiones, nombre original ni píxeles. El objeto debería usar
`application/octet-stream` y una ruta compuesta sólo por identificadores
aleatorios dentro del espacio de la cuenta.

En otro dispositivo:

1. El bloque llega por el canal cifrado actual.
2. La pantalla puede mostrar “Descargando imagen” sin frenar el resto de las
   notas.
3. Una reconciliación detecta referencias sin cuerpo local.
4. Descarga, descifra, comprueba huella y guarda el `Blob` sin crear un nuevo
   `changeSeq`.
5. Avisa a la otra pestaña y actualiza sólo la imagen, sin remontar el editor.

Una caída después de recibir el bloque no pierde la descarga pendiente:
“referencia presente, cuerpo ausente” vuelve a encontrarse en el próximo arranque.
No hace falta guardar una cola duplicada para esa bajada.

La subida debe procesar imágenes de a una o con concurrencia muy baja. Cifrar 200
archivos simultáneamente porque el lote admite 200 filas agotaría la memoria de
un teléfono.

## 11. Compatibilidad entre versiones

> **§0.3.c lo achica a la mitad** (guardia sólo en la puerta de subida) y §0.2
> corrige el miedo al respaldo: una aplicación vieja no puede importarlo.

Este es uno de los puntos que más investigación necesita. CopyNotes de escritorio
no se actualiza sola y un mismo usuario puede tener versiones diferentes en dos
aparatos.

Una posible defensa es versionar el protocolo de nube:

- La aplicación nueva anuncia una versión de protocolo en cada lectura y
  escritura.
- La cuenta conserva el protocolo mínimo necesario después de subir su primera
  imagen.
- Un cliente anterior deja de subir y bajar para esa cuenta y muestra “Actualizá
  CopyNotes para ver las imágenes”, en lugar de interpretar o sobrescribir filas
  que no comprende.
- El servidor aplica la defensa, no sólo la interfaz. Una versión vieja no puede
  saltarla llamando al RPC anterior.

La lectura actual de `records` es directa, por lo que no alcanza con agregar un
argumento al nuevo `push_records`. Hay que investigar un RPC de descarga
versionado o una comprobación de protocolo en las políticas de lectura mediante
un encabezado. El encabezado no es una medida de seguridad contra un atacante;
es una capacidad declarada para evitar que una aplicación vieja corrompa datos.

No debería habilitarse el botón Imagen antes de probar:

- aplicación nueva en un aparato y antigua en otro;
- respaldo desde la aplicación antigua después de que la cuenta use imágenes;
- actualización del aparato antiguo y convergencia posterior;
- respuesta perdida durante la primera imagen que eleva el protocolo.

## 12. Notas compartidas: fuera de la primera versión

El bloqueo elegido debe existir en varias capas:

- El diálogo no permite compartir una nota que contenga imágenes.
- `/imagen`, pegar y arrastrar explican que todavía no funcionan en una nota
  compartida.
- La operación de almacenamiento vuelve a comprobar el estado; ocultar un botón
  no alcanza.
- El serializador del canal compartido rechaza una imagen de forma explícita. No
  debe enviar sólo la descripción y fingir que viajó todo.
- El invitado ya es de sólo lectura para bloques, así que tampoco puede agregarla.

El servidor no puede inspeccionar los registros privados para descubrir si una
nota tiene imágenes: el `noteId`, el tipo y todo el contenido están cifrados.
Cerrar este borde requiere un RPC de compartir versionado y controles del cliente,
no una consulta mágica en Supabase.

### Hallazgos colaterales en el canal compartido actual

La investigación encontró dos deudas que ya afectan notas sin imágenes:

- `listSharedPending` recorta a 200 filas, `shareNote` llama una sola vez a
  `pushSharedNote` y después borra del canal cifrado la lista completa. Una nota
  con más de 200 filas puede abandonar el canal viejo antes de terminar de entrar
  al nuevo.
- `unshareNote` vuelve a sellar las filas y cierra el canal compartido sin esperar
  que la copia cifrada se haya subido. Un corte puede dejar temporalmente al
  servidor sin ninguna copia de esa nota.

Estos hallazgos merecen una corrección independiente aunque las imágenes queden
en pausa. En cualquier caso, son bloqueantes para una futura fase de imágenes
compartidas.

## 13. Copia, exportación, búsqueda, snippets y agentes

### Copiar y pegar

Una imagen debería ofrecer varias representaciones:

- Texto plano: `[Imagen]` o `[Imagen: descripción]`.
- HTML: `<figure>` autocontenido para aplicaciones con formato.
- Formato interno: metadata estructural y una referencia local; nunca bytes en el
  respaldo de `localStorage` que hoy dura 24 horas.
- Imagen real en `ClipboardItem` cuando el navegador y el sistema lo permitan.

Una copia dentro de la misma instalación puede resolver el `imageId` y clonar el
cuerpo. Entre la PWA y la aplicación de escritorio, que tienen bases locales
separadas, hace falta que el portapapeles entregue bytes o degradar claramente a
HTML/texto. Este caso necesita una prueba real por plataforma.

### Markdown y HTML

- Una nota sin imágenes puede conservar los archivos actuales.
- Markdown con imágenes necesita un ZIP con `.md` y una carpeta relativa de
  archivos, o una exportación declarada como sólo texto.
- HTML puede ser autocontenido con `data:` para notas pequeñas, pero repite el
  costo de base64. Para notas grandes conviene HTML más archivos dentro de ZIP.
- Nunca exportar una URL `blob:`: deja de existir al cerrar CopyNotes.

### Búsqueda

- Buscar sólo la descripción guardada en `content`.
- No cargar cuerpos al abrir Buscar.
- No incluir OCR en la primera versión: añade procesamiento, privacidad y otra
  expectativa de resultados.

### Snippets

Los snippets son independientes de su nota de origen. Por eso un snapshot con
imagen tendría que clonar el cuerpo al guardarse y volver a clonarlo al insertarse.
El exportador de snippets también necesitaría un paquete binario o un rechazo
claro; una referencia sin su cuerpo no es una exportación válida.

Queda por decidir si los snippets con imágenes entran en la primera entrega de
notas personales completas o se deshabilitan explícitamente hasta una segunda
fase.

### Agentes y MCP

La autorización actual fue concedida para texto y tareas, no para fotos. La
primera versión debería exportar sólo `[Imagen: descripción]` en `export.json`.
Los bytes, EXIF y nombres originales no llegan al agente.

Una herramienta futura para pedir una imagen concreta necesitaría otro permiso,
validación al momento de la solicitud y una miniatura acotada. Es una función
separada, no una consecuencia automática de `agentVisible`.

## 14. Cuota local, respaldo y costos de nube

IndexedDB, Cache y OPFS comparten la cuota del origen. El número varía según el
navegador y el espacio del dispositivo. La aplicación debería:

- pedir almacenamiento persistente al guardar la primera imagen, no sólo al
  crear la bóveda;
- consultar `navigator.storage.estimate()` antes de operaciones grandes;
- tratar la estimación como orientación, no como reserva;
- capturar `QuotaExceededError` como la respuesta definitiva;
- no dejar bloque, referencia o cuerpo parcial cuando falta espacio.

No se fijó un límite total. Un objetivo exploratorio de 200 MiB necesita probar
que el mismo aparato puede exportarlo e importarlo sin congelarse. El techo final
debe alinearse con el respaldo: CopyNotes no debería aceptar más datos de los que
después puede proteger.

Precios y límites consultados el 19 de agosto de 2026:

- Supabase Free: 1 GB de Storage total y 5 GB de transferencia mensual.
- Supabase Pro: 100 GB de Storage y 250 GB de transferencia incluidos, desde
  US$25 mensuales.
- La subida estándar es la recomendada hasta 6 MB; por encima Supabase recomienda
  TUS reanudable.

Por eso la decisión provisional es optimizar por debajo de 6 MB y evitar TUS en
la primera versión. El plan Free sirve para pocas cuentas de beta, no para abrir
la función al público. Los valores deberán comprobarse otra vez porque pueden
cambiar.

## 15. Trabajo posible si algún día se aprueba

Este orden no es un plan autorizado. Sólo conserva las dependencias descubiertas:

1. Volver a medir el código y cerrar tipo de bloque, compatibilidad, formatos,
   límites, snippets, borrado y exportación.
2. Crear el documento de producto que corresponda y pasar por la dirección de
   gusto de Stage 2 antes de tocar la interfaz.
3. Construir primero el guardia de protocolo, el bucket privado y las pruebas de
   aislamiento del servidor.
4. Agregar almacenamiento local binario, optimización, huella, cuota y guardado
   atómico.
5. Construir y probar el respaldo `.copynotes`, incluyendo JSON antiguos, merge,
   reemplazo y archivos maliciosos.
6. Construir el bloque visual, selector, pegado, arrastre, teclado y Deshacer.
7. Integrar copia, búsqueda, snippets, Markdown/HTML y el marcador para agentes.
8. Integrar subida y descarga cifrada, conflictos, restauración de nube y segundo
   dispositivo.
9. Probar Chromium, WebKit, aplicación real de macOS y Windows, iPhone, dos
   dispositivos, poca cuota y conexión interrumpida.
10. Actualizar la guía y el changelog en el mismo cambio que haga visible la
    función, y ejecutar la etapa final de auditoría y pulido.

La interfaz no debería quedar habilitada en una versión que todavía no transporte
las imágenes en respaldo y nube.

## 16. Pruebas críticas identificadas

- Elegir JPEG, PNG y WebP; rechazar firma falsa, SVG, archivo truncado y
  dimensiones peligrosas.
- Verificar orientación, reducción, eliminación de EXIF/GPS y límite final.
- Fallar por cuota sin dejar medio bloque.
- Insertar una, varias, pegar captura, arrastrar y cancelar el selector.
- Enter, Backspace, Tab, selección, movimiento, colapsado y Deshacer.
- Recargar offline y ver exactamente la misma imagen.
- Exportar `.copynotes`, borrar la base e importar con bytes idénticos.
- Importar JSON de versiones 1 a 5 sin cambios.
- Rechazar cuerpo ausente, huella incorrecta, rutas peligrosas, duplicados y ZIP
  con expansión excesiva antes de tocar datos actuales.
- Merge con conflicto de bloque, copia de nota y snapshot anidado de snippet.
- Comprobar que nada de la imagen aparece legible en Storage o en `records`.
- Una cuenta no puede listar, leer, escribir ni borrar objetos de otra.
- Storage falla antes de subir el bloque y el cursor no olvida la fila.
- La respuesta de subida se pierde y el reintento no duplica ni pisa el objeto.
- Un segundo dispositivo recibe el bloque, se corta antes del cuerpo y repara la
  imagen en el próximo arranque.
- Dos dispositivos reemplazan la misma imagen offline y ambas versiones quedan
  disponibles para elegir.
- Una versión antigua no puede sobrescribir una cuenta que ya exige imágenes.
- Una nota con imágenes no se comparte y una compartida no acepta inserción.
- Copiar no deja base64 en `localStorage` y MCP no recibe píxeles.
- La llegada del cuerpo no remonta el editor ni mueve el cursor de una descripción
  que se está escribiendo.

## 17. Preguntas para la próxima revisión

> **Contestadas en §0:** la 1 (bloque `type: 'image'`), la 3 (HEIC, ya no
> aplica), la 5 y la 13 (no hay librería de ZIP). Las 4 y 11 quedaron acotadas.
> Lo único que falta medir está en §0.8.

1. ¿Bloque `type: 'image'` o imagen adjunta a un tipo existente?
2. ¿Los snippets con imágenes entran en la primera entrega?
3. ¿Qué entrega realmente el selector de la Fototeca en iPhone: HEIC o una copia
   decodificable?
4. ¿Qué límites pasan una prueba real de memoria en iPhone, WebKit de macOS y
   WebView2 de Windows?
5. ¿La descripción es texto plano o admite formato inline?
6. ¿Tocar la imagen abre una vista ampliada? ¿Qué hace Enter y qué hace Backspace
   exactamente cuando esa vista o la descripción tienen foco?
7. ¿Cómo se exportan Markdown y HTML con imágenes sin multiplicar decisiones en
   la ventana de Respaldo?
8. ¿Cómo se libera espacio de imágenes borradas sin contradecir que el respaldo
   incluye la papelera?
9. ¿Hace falta un medidor de espacio antes de imponer cualquier techo?
10. ¿Cómo debe avisar un dispositivo antiguo que la cuenta requiere actualizarse?
11. ¿El guardia de protocolo vive en un RPC de descarga, en RLS con encabezado o
    en ambos?
12. ¿Cómo se limpian objetos cifrados huérfanos después de restaurar o “Empezar de
    nuevo la nube”?
13. ¿`@zip.js/zip.js` mantiene memoria y tamaño de build aceptables en los cuatro
    destinos?
14. ¿Cuándo existe suficiente demanda para abrir imágenes en notas compartidas?

## 18. Cuándo volver a abrir este análisis

Revisar este archivo antes de cualquiera de estos hitos:

- empezar a diseñar o implementar imágenes;
- cambiar el formato de respaldo completo;
- habilitar Supabase Storage para contenido del usuario;
- pasar la nube de beta a una salida pública;
- admitir imágenes, archivos o adjuntos en notas compartidas;
- agregar PDF, audio, galerías o más de una imagen por bloque;
- dar acceso visual a imágenes mediante MCP.

La revisión debe usar Codebase Memory y fuente directa otra vez. Los números de
versión, rutas, precios, límites y deudas del canal compartido pueden haber
cambiado.

## 19. Referencias consultadas

Fuentes internas principales:

- `AGENT.md`
- `specs/002-data-model-storage.md`
- `specs/003-editor-blocks.md`
- `specs/004-copy-formatters.md`
- `specs/007-export-import-backup.md`
- `specs/015-non-ui-library-decision.md`
- `specs/018-backup-json-format.md`
- `specs/020-inline-formatting-toolbar.md`
- `specs/029-cloud-sync-path.md`
- `specs/030-zero-knowledge-sync.md`
- `specs/038-shared-note-ticket.md`
- `specs/040-backup-compatibility-contract.md`
- `src/lib/editor/Editor.svelte`
- `src/lib/editor/BlockRow.svelte`
- `src/lib/storage/db.ts`
- `src/lib/export-import/schema.ts`
- `src/lib/sync/records.ts`
- `src/lib/sync/pending.ts`
- `src/lib/sync/upload.ts`
- `src/lib/sync/download.ts`
- `src/lib/sync/shared.ts`
- `src/lib/sync/share-move.ts`
- `src/lib/platform/files.js`
- `vite.config.ts`

Fuentes externas consultadas el 19 de agosto de 2026:

- Dexie, almacenamiento de datos binarios:
  <https://dexie.org/docs/API-Reference>
- MDN, cuotas y desalojo del almacenamiento:
  <https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria>
- MDN, almacenamiento persistente:
  <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>
- MDN, URLs temporales para `Blob`:
  <https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static>
- MDN, escritura de imágenes al portapapeles:
  <https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write>
- MDN, `canvas.toBlob`:
  <https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob>
- MDN, `createImageBitmap`:
  <https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap>
- Supabase, subida estándar:
  <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
- Supabase, subidas reanudables:
  <https://supabase.com/docs/guides/storage/uploads/resumable-uploads>
- Supabase, control de acceso de Storage:
  <https://supabase.com/docs/guides/storage/security/access-control>
- Supabase, tamaño y precio de Storage:
  <https://supabase.com/docs/guides/platform/manage-your-usage/storage-size>
- Supabase, transferencia:
  <https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- `zip.js`:
  <https://github.com/gildas-lormeau/zip.js>
- `fflate`:
  <https://github.com/101arrowz/fflate>
- JSZip, límites de memoria:
  <https://stuk.github.io/jszip/documentation/limitations.html>

Todas las fuentes externas y los precios deben verificarse otra vez antes de
tomar decisiones.
