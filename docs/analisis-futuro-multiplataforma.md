# CopyNotes multiplataforma - Análisis para revisar en el futuro

> **Estado:** borrador exploratorio, no es una especificación ni autoriza implementación.
> **Fecha de la conversación:** 2026-07-28.
> **Objetivo:** conservar el contexto y las posibilidades conversadas para volver a investigarlas y decidirlas más adelante.

Este documento resume una conversación sobre cómo extender CopyNotes desde la
aplicación de macOS hacia Windows, Linux, iPhone, iPad y Android. No reemplaza
`AGENT.md` ni las especificaciones oficiales. Si en el futuro se aprueba una
dirección, deberá convertirse en una especificación nueva o actualizar la
especificación temática correspondiente antes de construirla.

## 1. Dirección conversada hasta ahora

La dirección que parece más conveniente, pero que deberá revisarse, es:

- Mantener una sola aplicación y reutilizar su núcleo, no crear cinco productos separados.
- Mantener macOS, Windows y eventualmente Linux como aplicaciones Tauri.
- Priorizar Windows como el próximo sistema de escritorio.
- Distribuir inicialmente Windows mediante un instalador descargado desde la web, sin Microsoft Store.
- Usar la PWA instalada desde Safari o Chrome como primera experiencia en iPhone, iPad y Android.
- No entrar inicialmente en App Store ni Google Play.
- Mantener CopyNotes gratis, local, sin cuenta y completamente utilizable sin nube.
- Ofrecer la sincronización entre dispositivos como una función Pro opcional y paga.
- Mantener Dexie/IndexedDB como base local en cada dispositivo.
- Agregar Supabase como capa de sincronización cifrada, no como reemplazo de Dexie.
- Mantener MCP inicialmente como una capacidad local de las aplicaciones de escritorio.
- Evaluar MCP desde la PWA únicamente en una fase futura y con un análisis de privacidad específico.

Estas son conclusiones de trabajo, no compromisos definitivos de producto.

## 2. Base técnica que ya existe

CopyNotes parte de una posición favorable para ser multiplataforma:

- SvelteKit genera una aplicación estática que puede ejecutarse como web, PWA o dentro de Tauri.
- La PWA ya tiene manifiesto, instalación y funcionamiento offline.
- La interfaz ya responde a pantallas angostas y posee algunas pruebas de uso táctil.
- Tauri 2 ya está integrado para macOS.
- La aplicación Tauri conserva Dexie/IndexedDB dentro del navegador interno del sistema.
- La lógica de notas, bloques, tareas, snippets, etiquetas, búsqueda, agenda, formato y respaldos es compartible.
- El modelo usa identificadores estables, fechas y borrado recuperable, una base útil para sincronización futura.
- El guardado pendiente, el respaldo y el journal de recuperación ya priorizan no perder texto.

La mayor parte del trabajo futuro estaría en los bordes de cada sistema:
archivos, portapapeles, enlaces externos, suspensión, cierre, firma,
instaladores, actualizaciones y pruebas reales.

## 3. Diferencia entre disponibilidad y sincronización

Publicar CopyNotes en varios sistemas no hace que las notas se compartan
automáticamente.

Sin CopyNotes Pro:

- Cada instalación conserva su propia base local.
- Mac, Windows y la PWA pueden contener notas diferentes.
- El traslado entre instalaciones se hace mediante exportar e importar un respaldo.
- Ninguna cuenta ni conexión a internet es necesaria.

Con CopyNotes Pro:

- Cada dispositivo sigue guardando primero en su base local.
- Los cambios se cifran antes de salir del dispositivo.
- Supabase recibe una copia cifrada y no puede leer el contenido.
- Otro dispositivo descarga, descifra y guarda el cambio en su propia base local.
- La aplicación continúa funcionando offline.
- Desactivar o cancelar Pro no elimina las notas locales.
- Los conflictos deben conservar ambas versiones; nunca se pierde texto silenciosamente.

## 4. Dexie y Supabase

No se propone una migración que quite Dexie. Se propone sumar sincronización por
encima de Dexie.

Flujo de subida:

```text
El usuario escribe
      ↓
Dexie guarda localmente
      ↓
Se registra un cambio pendiente
      ↓
El dispositivo cifra el cambio
      ↓
Supabase recibe la copia cifrada
```

Flujo de bajada:

```text
Supabase entrega un cambio cifrado
      ↓
El dispositivo lo descifra
      ↓
La capa de almacenamiento lo aplica
      ↓
Dexie conserva la copia local
      ↓
La interfaz lee desde Dexie
```

Consecuencias de esta dirección:

- Mac, Windows, Linux y la PWA continúan usando Dexie/IndexedDB.
- Una futura aplicación móvil Tauri también podría mantener Dexie.
- No hace falta migrar a SQLite para publicar aplicaciones de escritorio.
- La nube nunca se vuelve necesaria para abrir o editar una nota.
- La primera activación de Pro subiría los datos existentes con consentimiento, sin borrar la base local.
- El cifrado ocurre al subir y descargar; la base local permanece como hoy.

Las especificaciones oficiales relacionadas son `specs/029-cloud-sync-path.md`
y `specs/030-zero-knowledge-sync.md`. Ellas siguen siendo la fuente de verdad
sobre sincronización y cifrado.

## 5. PWA y MCP

La PWA no puede ofrecer directamente el MCP local actual. El navegador no puede:

- iniciar el proceso Node del servidor MCP;
- recibir la conexión local por `stdio` que usan Cursor o Claude Desktop;
- vigilar libremente carpetas del sistema;
- entregar acceso directo a su IndexedDB a otra aplicación.

La PWA sí podría participar de estas formas:

### Opción A - Sincronización hacia el escritorio

Es la opción recomendada para una primera versión.

```text
PWA del teléfono
      ↓ sincronización Pro cifrada
Dexie de Windows o Mac
      ↓ MCP local
Cursor o Claude Desktop
```

Una nota creada en la PWA podría llegar al MCP después de que la aplicación de
escritorio sincronice. Si el escritorio está cerrado, el MCP solo conoce la
última copia local disponible hasta que CopyNotes vuelva a abrirse y sincronizar.

### Opción B - Puente temporal desde el navegador

La PWA, mientras está abierta, podría descifrar y compartir temporalmente solo
las notas autorizadas con una sesión remota. Preservaría mejor la privacidad,
pero necesitaría un protocolo nuevo, autenticación y una pantalla clara de
consentimiento. No sería el mismo servidor MCP local que existe hoy.

### Opción C - MCP remoto permanente

Un servicio remoto podría permitir que un agente acceda aunque ningún dispositivo
esté abierto. Para conservar el modelo de conocimiento cero necesitaría una clave
propia, limitada a las notas autorizadas para agentes. Entregar la clave general
a Supabase o al servidor rompería la promesa de privacidad.

Esta opción es la más compleja y riesgosa. Requeriría un modelo de amenazas,
revocación de acceso, vencimiento de claves, auditoría y consentimiento explícito.

### Dirección provisional para MCP

- Mantener MCP local y exclusivo de escritorio en la primera etapa.
- Permitir que la sincronización Pro lleve al escritorio notas creadas en la PWA.
- Reconsiderar el puente temporal solo si existe una necesidad real de agentes sin escritorio.
- No construir MCP remoto permanente sin una especificación de seguridad independiente.

La especificación oficial actual de MCP es
`specs/028-agent-beta-local-mcp.md` y continúa definiendo su alcance como local y
de escritorio.

## 6. Posibilidades de distribución

| Alternativa | Ventajas | Límites | Evaluación provisional |
|---|---|---|---|
| PWA en todos los sistemas | Una sola aplicación, rápida de publicar, sin tiendas | Menor integración con archivos, sistema y MCP | Buena solución inmediata |
| Tauri en escritorio + PWA móvil | Reutiliza casi todo, bajo mantenimiento | La experiencia móvil depende del navegador | Dirección recomendada actualmente |
| Tauri en todas las plataformas | Un envoltorio compartido para escritorio y móvil | Requiere mucha validación móvil real | Posible fase futura |
| Tauri escritorio + Capacitor móvil | Ecosistema móvil maduro, conserva la interfaz web | Dos envoltorios distintos para mantener | Plan alternativo si Tauri móvil presenta bloqueos |
| Swift y Kotlin nativos | Máxima integración con Apple y Android | Dos reescrituras completas | No recomendado sin una necesidad probada |
| Flutter, React Native o Electron | Ecosistemas conocidos | Poco beneficio frente a la base actual; Electron no cubre móvil | No recomendado actualmente |

## 7. Trabajo compartido antes de ampliar plataformas

Estos puntos deberían resolverse una sola vez y beneficiar a todos los destinos:

1. Distinguir web, Tauri de escritorio, iOS y Android por capacidades, no solo como `web` o `tauri`.
2. Implementar apertura y guardado de archivos confiable según la plataforma.
3. Centralizar todo uso del portapapeles y definir degradaciones cuando solo exista texto plano.
4. Abrir enlaces externos mediante una integración segura con el sistema.
5. Activar una política de seguridad estricta para impedir contenido inesperado en Tauri.
6. Unificar la versión visible de la web, Tauri y los respaldos.
7. Crear construcciones automáticas separadas para macOS, Windows y Linux.
8. Verificar que los datos sobrevivan al cierre, reinicio, actualización y migración de esquema en cada sistema.
9. Solicitar almacenamiento persistente donde el navegador lo permita y mantener respaldos claros.
10. Separar completamente las capacidades MCP de escritorio de cualquier futuro destino móvil.
11. Preparar política de privacidad, condiciones de Pro y explicación clara del cifrado antes de ofrecer nube.

## 8. Trabajo por plataforma

### Windows

Dirección provisional:

- Tauri con WebView2.
- Primer instalador para Windows x64.
- Descarga directa desde el sitio de CopyNotes.
- Formato inicial sugerido: instalador NSIS `.exe`.
- Firma digital para evitar advertencias de seguridad alarmantes.
- Una sola instancia de la aplicación para evitar estados enfrentados.
- Pruebas en una computadora limpia y entre dos versiones consecutivas.
- Empaquetado autónomo de MCP, sin exigir que el usuario instale Node.
- Actualizador firmado o un procedimiento de actualización explícito.

ARM64, MSI y Microsoft Store quedarían para después de comprobar demanda.

### Linux

Dirección provisional:

- Tauri construido en Linux.
- Primeros formatos sugeridos: AppImage x64 y `.deb`.
- Verificación con WebKitGTK, Wayland y X11.
- Pruebas específicas del editor, selección, portapapeles y archivos.
- Revisión de las rutas del servidor MCP dentro de cada formato de paquete.

RPM, Flatpak, Snap y ARM64 quedarían para fases posteriores.

### iPhone e iPad

Primera dirección:

- PWA instalada desde Safari mediante "Agregar a inicio".
- Ajustar áreas seguras alrededor del notch y del indicador inferior.
- Probar teclado virtual, selección, autocorrección, dictado y exportación.
- En iPad, probar pantalla dividida, orientación horizontal y teclado físico.
- Solicitar almacenamiento persistente cuando esté disponible.

Una aplicación nativa se reconsideraría si aparecen necesidades de App Store,
compartir archivos, notificaciones o integración que la PWA no pueda resolver.

### Android

Primera dirección:

- PWA instalada desde Chrome.
- Probar teclado Gboard, selección, compartir archivos y distintos tamaños.
- Verificar funcionamiento offline y recuperación tras cierre forzado.

Una aplicación nativa se reconsideraría junto con iOS. La primera prueba debería
usar Tauri móvil; Capacitor sería el plan alternativo si la integración necesaria
no resulta suficientemente estable.

## 9. Orden tentativo para una futura ejecución

Este orden refleja las prioridades conversadas, pero deberá aprobarse nuevamente:

1. Fortalecer la capa compartida y validar la PWA en dispositivos reales.
2. Construir una beta local de Windows sin esperar la sincronización Pro.
3. Completar Windows para distribución pública: firma, actualización, persistencia y MCP.
4. Construir la sincronización Pro cifrada y opcional.
5. Publicar Linux reutilizando los cimientos de escritorio.
6. Evaluar aplicaciones móviles nativas solamente después de aprender del uso de la PWA.
7. Evaluar MCP desde navegador solamente si aparece demanda concreta.

Si existen recursos suficientes, Windows y los cimientos internos de
sincronización podrían avanzar como trabajos separados. No conviene intentar
publicar todas las plataformas nativas simultáneamente.

## 10. Estimaciones exploratorias

Estas cifras son rangos de orientación, no compromisos ni fechas prometidas.

| Hito | Esfuerzo aproximado |
|---|---:|
| Ajustes compartidos y PWA móvil sólida | 1 a 2 semanas |
| Beta local de Windows | 2 a 4 semanas |
| Windows público con firma, actualización y MCP | 4 a 7 semanas acumuladas |
| Primera beta Pro entre dos dispositivos | 8 a 12 semanas |
| Sincronización completa, recuperación y conflictos | 12 a 20 semanas acumuladas |
| Linux después de los cimientos de Windows | 2 a 4 semanas |
| Aplicación móvil nativa futura | 4 a 8 semanas por plataforma |

Las revisiones externas, certificados, pruebas con usuarios y eventuales tiendas
pueden extender esos tiempos.

## 11. Costos externos a revisar

- Alojamiento de la PWA: posiblemente gratuito o de bajo costo al inicio.
- Supabase Pro: desde aproximadamente USD 25 mensuales, sujeto al uso y a precios futuros.
- Firma de Windows: costo variable según proveedor o servicio elegido.
- Linux por descarga directa: sin cuota obligatoria.
- Apple Developer Program, si se usa App Store en el futuro: USD 99 por año al momento de esta conversación.
- Google Play, si se usa en el futuro: USD 25 de registro único al momento de esta conversación.

Los precios y requisitos deben verificarse nuevamente antes de tomar decisiones.

## 12. Riesgos conocidos para volver a analizar

- Una PWA y una aplicación Tauri tienen contenedores locales separados.
- El guardado web actual no confirma de forma nativa que un archivo realmente se escribió.
- La clasificación actual de plataforma confunde cualquier Tauri móvil con escritorio.
- El editor usa APIs de edición web cuyo comportamiento cambia entre motores y teclados.
- Linux depende de la versión de WebKitGTK disponible en cada distribución.
- La PWA puede sufrir limpieza de almacenamiento en determinadas condiciones.
- El MCP actual necesita un empaquetado reproducible y adaptado a Windows/Linux.
- La sincronización cifrada necesita recuperación de clave y conflictos sin pérdida de texto.
- Un MCP remoto puede debilitar el modelo de conocimiento cero si se diseña incorrectamente.
- La falta de pruebas reales por sistema puede ocultar pérdidas de datos durante cierres o actualizaciones.

## 13. Decisiones que no deberían tomarse todavía

- No elegir definitivamente Tauri o Capacitor para móvil sin una prueba en dispositivos reales.
- No comprometer una fecha de App Store o Google Play.
- No reemplazar Dexie por SQLite sin una necesidad demostrada.
- No sincronizar directamente archivos internos mediante Dropbox, iCloud, OneDrive o Google Drive.
- No construir MCP remoto antes de definir claves, permisos, revocación y auditoría.
- No prometer públicamente "conocimiento cero" sin una auditoría independiente.
- No construir todas las plataformas a la vez.

## 14. Preguntas para la próxima revisión

1. ¿La PWA móvil está resolviendo el uso cotidiano o los usuarios piden una app de tienda?
2. ¿Qué proporción de usuarios necesita Windows, Linux, iPhone, iPad y Android?
3. ¿MCP debe estar incluido en la primera beta de Windows o puede llegar después?
4. ¿El agente debe acceder a notas móviles cuando el escritorio está cerrado?
5. ¿Alcanza un puente MCP temporal con la PWA abierta?
6. ¿Qué notas y campos podría descifrar un agente remoto, y durante cuánto tiempo?
7. ¿Supabase sigue siendo la mejor opción de infraestructura al momento de construir Pro?
8. ¿Qué método de pago web se usará para Pro antes de entrar en tiendas?
9. ¿Qué versiones mínimas de Windows, Linux, iOS y Android se desean soportar?
10. ¿Qué formatos de instalador tienen demanda real?
11. ¿Cómo se probará una actualización sin perder notas en cada plataforma?
12. ¿Qué nivel de soporte puede mantenerse de forma sostenible?

## 15. Cuándo volver a abrir este análisis

Revisar este documento antes de cualquiera de estos hitos:

- iniciar la aplicación de Windows;
- comenzar cuentas o sincronización Pro;
- publicar una descarga para Linux;
- decidir una aplicación móvil nativa;
- permitir MCP desde navegador o nube;
- anunciar públicamente privacidad o conocimiento cero.

En esa revisión se deberán comprobar de nuevo las capacidades de Tauri,
Capacitor, navegadores, tiendas, precios y requisitos de firma vigentes.

## 16. Referencias actuales

Fuentes internas que conservan autoridad sobre el producto:

- `AGENT.md`
- `specs/008-pwa-offline-theme.md`
- `specs/010-sync-readiness.md`
- `specs/025-macos-desktop-readiness.md`
- `specs/028-agent-beta-local-mcp.md`
- `specs/029-cloud-sync-path.md`
- `specs/030-zero-knowledge-sync.md`

Documentación externa consultada durante el análisis:

- Tauri, requisitos y destinos: <https://v2.tauri.app/start/prerequisites/>
- Tauri, distribución: <https://v2.tauri.app/distribute/>
- Tauri, diálogo nativo: <https://v2.tauri.app/plugin/dialog/>
- Tauri, sistema de archivos: <https://v2.tauri.app/plugin/file-system/>
- Tauri, portapapeles: <https://v2.tauri.app/plugin/clipboard/>
- Capacitor: <https://capacitorjs.com/docs>
- Apple Developer Program: <https://developer.apple.com/support/compare-memberships/>
- Google Play Console: <https://support.google.com/googleplay/android-developer/answer/6112435>

Todas las fuentes externas deben revisarse nuevamente porque pueden cambiar.
