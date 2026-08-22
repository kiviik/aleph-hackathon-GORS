# Planning mobile — Expo + QVAC + YOLO/ONNX

## Estado mobile actual — 22/08/2026

El primer slice implementado vive en `mobile/` y comparte UI entre Android e
iOS. Incluye solicitud de permisos nativos de cámara/ubicación, pipeline
visible, trace persistida en el teléfono, salida `REFUSE` ante integración
incompleta y un perfil EAS que produce un `.apk` (`preview`).

La UI principal mantiene la paridad visual/UX con la app mobile anterior:
`Mapa`, `Street View`, `Guardados`, búsqueda, favoritos y cards de ubicación.
Para respetar el runtime local, el mapa es un canvas sintético y `Street View`
es un frame local pendiente de captura; no son tiles ni una vista remota.

El push anterior de UI con mapa/Street View no forma parte del runtime objetivo:
no se usan requests de Google, Calgary ni un servidor propio. La app no va a
consultar la API de cámaras cada minuto en esta etapa; el boundary del repo exige
que Calgary se congele como research/snapshot antes de habilitar una ingestión.

El próximo gate es integrar la captura real con Development Builds Android/iOS y
validar el artefacto ONNX exacto. Hasta completar ese gate, no se muestra una
decisión positiva ni se interpreta la ausencia de boxes como espacio libre.

## Registro del ajuste multiplataforma

Se tomó la UI entrante como referencia común para Android e iOS. No se creó una
pantalla Android paralela: ambos targets comparten `App.tsx`, navegación y
componentes para `Map`, `Street View` y `Saved`, incluyendo búsqueda,
filtros, favoritos y modo oscuro.

La adaptación nativa quedó encapsulada en las capacidades del teléfono:

- `expo-camera` solicita permisos de cámara en Android e iOS;
- `expo-location` conserva el botón de ubicación en ambas plataformas;
- `KeyboardAvoidingView` ajusta el teclado según el sistema operativo;
- la trace acepta `android | ios` y mantiene `REFUSE` mientras el pipeline
  local no esté completo.

La composición visual se conserva, pero el contenido de mapa y Street View es
local/sintético en ambos targets. Se excluyeron `react-native-maps`,
`react-native-webview` y URLs de Google porque introducirían una dependencia
remota incompatible con el boundary offline-first del hackathon.

## Build y distribución

`mobile/Dockerfile` contiene el builder Android local con Node, JDK 17, Android
SDK y Gradle. Su entrada ejecuta `expo prebuild` y `:app:assembleDebug`,
dejando el APK en `/output`. El mismo Dockerfile se usa en
`.github/workflows/android-apk-release.yml`.

La build iOS usa el mismo `App.tsx`, configuración Expo y contratos, pero
requiere macOS/Xcode o EAS para compilar el binario nativo.

Cada push a `hackaton` actualiza la Release `mobile-latest` y adjunta el APK.
También se puede ejecutar manualmente para obtener un artifact de Actions. Un
tag `mobile-v*` crea/actualiza una Release versionada. El archivo de CI es un
APK debug instalable para demo; la firma de producción requiere una keystore
administrada como secret y queda fuera de esta primera iteración.

## Decisión resumida

La app mobile será una demo local-first para el flujo:

```text
capturar → detectar localmente → normalizar evidencia → encadenar tools
         → validar con policy → explicar resultado
```

La primera combinación a probar es:

- Expo Development Build;
- `@qvac/onnx` para el detector de objetos;
- `YOLO26s` como candidato del equipo, no como dependencia aceptada todavía;
- `@qvac/sdk` para el LLM local de tool-calling;
- fixtures/snapshots locales para sectores, reglas y alternativas pagas.

Electron queda fuera de esta superficie: para esta demo se prioriza Expo sobre
un runtime desktop embebido.

El ejemplo oficial `qvac-smart-camera` demuestra una arquitectura parecida:
detección con `@qvac/onnx` y YOLOv10, más una capa Qwen3-VL local para
descripción. Nosotros adaptamos esa idea al estacionamiento, pero no copiamos
su veredicto de seguridad ni usamos su detección de personas. ([ejemplos
oficiales de QVAC](https://github.com/tetherto/qvac-examples))

## Restricción de localidad

La app puede descargar modelos durante la instalación o el primer arranque,
pero una vez preparados debe ejecutar la demo sin red. No debe existir:

- endpoint de inferencia remoto;
- API key o login para analizar una imagen;
- upload de frames;
- fallback cloud;
- consulta online de cámaras de Calgary, ParkPlus o reglas.

QVAC documenta soporte para Expo `>=54`, configuración mediante
`qvac.config.json`, prebuild y ejecución en un dispositivo físico. También
documenta que QVAC no corre actualmente en emuladores por limitaciones de
`llamacpp`. ([JS/TS SDK y Expo](https://docs.qvac.tether.io/js-ts-sdk/))

## Arquitectura de la app

```text
mobile/
├── app/                  Expo routes/screens
├── src/camera/           permission, capture, crop, local frame lifecycle
├── src/detector/         ONNX session, preprocessing, NMS, labels
├── src/evidence/         ROI, temporal smoothing, confidence gates
├── src/qvac/             local text model and tool-calling adapter
├── src/data/             Calgary/rules snapshots bundled locally
├── src/policy/           deterministic decision gate
└── src/trace/            auditable events and redacted diagnostics
```

La app mobile no importa el runtime Node directamente. Primero implementamos
una integración explícita y pequeña; sólo compartimos contratos JSON o un
paquete común cuando el schema esté estable.

## Flujo de una consulta

1. La persona concede permiso de cámara y apunta a un sector.
2. La app captura un frame local y permite revisar el ROI.
3. YOLO/ONNX procesa el frame y devuelve detecciones normalizadas.
4. El normalizador calcula si el ROI está cubierto, ocupado o es ambiguo.
5. `lookup_sector` resuelve sólo contra datos locales.
6. `lookup_rules` resuelve reglas sintéticas/snapshots para la hora solicitada.
7. El modelo QVAC de texto llama las tools en orden y produce una explicación.
8. La policy determinística valida evidencia, reglas y confianza.
9. La UI muestra `PARK`, `DO_NOT_PARK` o `REFUSE`, junto con trace y frescura.
10. Si no se puede estacionar con seguridad, puede mostrar una alternativa
    paga con `availability: UNKNOWN`.

El LLM no recibe autoridad para reinterpretar boxes, inventar un sector o
convertir ausencia de detección en disponibilidad. La entrada al LLM es un
objeto estructurado, por ejemplo:

```json
{
  "state": "FREE",
  "quality": "USABLE",
  "confidence": 0.91,
  "roi": { "x": 0.12, "y": 0.32, "width": 0.7, "height": 0.4 },
  "detections": [
    { "label": "car", "confidence": 0.94, "overlap_with_roi": 0.02 }
  ],
  "source": "mobile-camera-frame"
}
```

## Decisiones de modelos

### Detector

`YOLO26s` es el candidato que propuso el equipo porque debería ser liviano,
pero todavía hay que fijar el artefacto exacto. Antes de usarlo, registrar:

- URL o release exacto y hash del `.onnx`;
- licencia del modelo y de los labels;
- input size, layout RGB/BGR y normalización;
- labels y class IDs usados;
- postprocesado, NMS y threshold;
- tamaño en disco y memoria de sesión;
- FPS/latencia en los dispositivos objetivo;
- casos adversariales: noche, lluvia, oclusión, auto parcial y driveway.

La salida de YOLO detecta objetos. No demuestra por sí sola que un lugar sea
legal ni que el espacio sin una caja sea estacionable. La capa ROI/evidence debe
rechazar falsos libres.

### LLM local

El baseline desktop actual usa `QWEN3_1_7B_INST_Q4`. Es el primer modelo a
probar para tool-calling mobile, pero no se debe prometer que entra en todos los
teléfonos. El benchmark debe compararlo con cualquier variante QVAC más pequeña
permitida por las reglas del track.

No usar VisionPsy para tapar la detección: además de la decisión del equipo de
no usar modelos Psy para esta entrega, el detector debe ser auditable como
YOLO/ONNX. Si se prueba un modelo alternativo, debe quedar como experimento
separado y no reemplazar silenciosamente las métricas.

## Pantallas mínimas

### 1. Inicio / estado local

Mostrar permisos, modelos disponibles, espacio, versión de app, modo offline y
botón `Iniciar análisis`.

### 2. Cámara / ROI

Mostrar preview, marco del sector, captura, retake y advertencia de que no se
guardará ni subirá la imagen sin una acción explícita de demo.

### 3. Procesamiento

Mostrar etapas: `captura`, `YOLO`, `evidence`, `sector`, `rules`, `decision`.
No mostrar una animación de éxito mientras una etapa está fallando.

### 4. Resultado

Mostrar decisión, explicación breve, confidence, evidencia, regla activa,
timestamp y botones `Ver trace` / `Reintentar`.

### 5. Alternativa paga

Mostrar zona, tarifa, horario, límite, snapshot y `Disponibilidad: desconocida`.
El CTA debe abrir la información oficial, no iniciar pagos ni sesiones.

## Fases de implementación

### M0 — Spike de plataforma

- Crear `mobile/` con Expo compatible.
- Instalar el plugin QVAC y generar Development Build.
- Validar una carga mínima de modelo en un teléfono físico.
- Medir memoria/cold start antes de integrar cámara.

### M1 — Detector aislado

- Convertir/cargar el artefacto ONNX aceptado.
- Implementar preprocessing, inferencia y NMS.
- Dibujar boxes y labels sobre una imagen local.
- Comparar 20 frames sanitizados y guardar sólo métricas, no imágenes sensibles.

### M2 — Evidencia de estacionamiento

- Definir ROI manual y luego evaluar detección de zona.
- Implementar smoothing de 3 capturas o una ventana temporal equivalente.
- Definir thresholds por calibración, no por intuición.
- Producir `USABLE`, `DARK`, `OCCLUDED`, `BLURRY`, `FREE`, `OCCUPIED` y
  `UNCERTAIN`.

### M3 — QVAC y contratos

- Cargar el LLM local sólo después de validar el detector.
- Conectar el objeto estructurado al orchestrator/tool-calling.
- Reusar policy y trace semantics del prototipo.
- Probar tool calls fuera de orden, argumentos inventados y outputs inválidos.

### M4 — UX y Calgary local

- Bundlear fixtures/snapshots locales.
- Mostrar origen y frescura sin prometer tiempo real.
- Implementar alternativa paga como salida secundaria.
- Probar la app en modo avión.

### M5 — Demo y evidencia

- Grabar un caso `PARK`, uno `DO_NOT_PARK` por regla y uno `REFUSE`.
- Mostrar un fallo o retry real.
- Registrar dispositivo, OS, Expo, QVAC SDK, modelo, cuantización, memoria,
  cold start, p50/p95 y batería aproximada.
- Repetir después de limpiar la red y los caches de desarrollo.

## Matriz de aceptación

| Caso | Resultado obligatorio |
|---|---|
| ROI libre, regla permite | `PARK` sólo con evidencia suficiente |
| ROI ocupado | `DO_NOT_PARK` |
| ROI oscuro/obstruido/borroso | `REFUSE` |
| YOLO sin boxes pero ROI dudosa | `REFUSE`, no `PARK` |
| Regla activa | `DO_NOT_PARK` aunque YOLO vea hueco |
| Tool call incorrecto | rechazo, retry limitado y trace |
| Sin red después del setup | demo continúa con snapshots/modelos locales |
| Alternativa paga encontrada | `availability: UNKNOWN` |

## Riesgos de mobile

- **Memoria:** cargar YOLO y LLM juntos puede forzar cierre. Mitigación: carga
  secuencial, unload y benchmark por dispositivo.
- **Batería/temperatura:** inferencia por frame continuo no es necesaria para la
  demo. Mitigación: captura bajo demanda y frecuencia limitada.
- **Metro/native mismatch:** QVAC requiere Development Build y config plugin.
  Mitigación: spike M0 antes de UI.
- **Detector equivocado:** una detección de auto no identifica un espacio.
  Mitigación: ROI, smoothing, umbrales y `REFUSE`.
- **Modelo no reproducible:** `YOLO26s` puede cambiar de export o labels.
  Mitigación: hash, metadata y fixture de smoke test.
- **Scope creep:** mapas, pagos y cámaras live consumen la demo. Mitigación:
  mantenerlos fuera del primer mobile vertical slice.

## Definition of done mobile

La primera versión se considera terminada cuando un teléfono físico puede:

1. abrir la app sin red;
2. capturar un frame sin subirlo;
3. ejecutar YOLO local y producir evidencia estructurada;
4. ejecutar QVAC local con tools locales;
5. mostrar un veredicto validado por policy;
6. mostrar trace y métricas básicas;
7. abstenerse ante incertidumbre;
8. repetir el flujo con fixtures sin depender de Calgary online.
