# BA Estaciona — contexto de producto

## Idea

BA Estaciona responde una pregunta concreta:

> **¿Puedo estacionar acá, ahora?**

No responde solamente si una imagen parece tener un hueco. Combina evidencia
visual, ubicación, horario y reglas locales. Si una parte de la evidencia falta,
es ambigua o tiene baja confianza, devuelve `REFUSE`/`NO_DETERMINABLE`.

## Primer target: Calgary

El primer caso de integración será Calgary, Canadá, usando datos públicos de la
Ciudad de Calgary. La fuente de cámaras enlazada en el research es un catálogo
de ubicaciones y URLs de imágenes de tránsito, no un feed de ocupación de
estacionamiento:

- dataset [Traffic Cameras](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data), UID `k7p9-kppz`;
- 205 filas y cuatro columnas: `camera_url`, `quadrant`, `camera_location` y
  `point`;
- actualización declarada: diaria; geografía WGS84/Web Mercator;
- las cámaras son para monitoreo de tránsito, no enforcement, y la ciudad dice
  que el footage no se graba;
- una cámara puede estar caída por mantenimiento o temporalmente fuera de línea
  después de un incidente para proteger la identidad de las personas.

La API sirve para descubrir una fuente visual y asociarla geográficamente, pero
no alcanza por sí sola para afirmar que existe una plaza libre. La ocupación
debe salir de una observación visual validada y el espacio debe corresponder al
segmento consultado.

## Fallback de estacionamiento pago

Calgary no basa el estacionamiento pago únicamente en parquímetros: usa zonas
on-street administradas por Calgary Parking Authority y el sistema ParkPlus.
Como fuente de reglas y alternativas se investigaron:

- [On-Street Parking Zones](https://data.calgary.ca/Transportation-Transit/On-Street-Parking-Zones/rhkg-vwwp), UID `rhkg-vwwp`, con geometría, zona, capacidad estimada, tipo de zona, estado, `price_zone`, horarios de enforcement, límite máximo y restricciones;
- [On-Street Parking Zones with Rates](https://data.calgary.ca/Help-and-Information/On-Street-Parking-Zones-with-Rates/45az-7kh9), UID `45az-7kh9`, que relaciona `PRICE_ZONE` con tarifas horarias;
- [Calgary Parking](https://www.calgaryparking.com/purchase-parking/parkplus.html), para explicar ParkPlus y derivar al usuario a la fuente oficial de pago.

Estos datos tampoco informan ocupación actual. `zone_cap` y `seg_cap` son
estimaciones de capacidad, no plazas libres. Por eso el fallback debe devolver
`ALTERNATIVE_PAID_PARKING` sólo como una opción de estacionamiento pago
identificada por zona, precio y horario, nunca como una garantía de disponibilidad
ni como una autorización para estacionar en la calle.

## Por qué QVAC Track 2

El valor de la demo no es prometer una solución pública lista para producción.
Es demostrar que un modelo local pequeño puede encadenar herramientas y que el
sistema detecta sus fallos:

```text
read_frame → lookup_sector → lookup_rules → decide
                                      ↘ lookup_paid_alternatives
```

La inferencia de visión, la selección de herramientas y la explicación deben
ejecutarse localmente mediante QVAC. La decisión de seguridad queda además
limitada por código determinístico. El fallback se consulta sólo después de
una negativa o abstención, y no puede transformar `REFUSE` en `PARK`.

## Decisión mobile

La aplicación mobile será una superficie separada para demostrar el caso de
uso: una persona apunta el teléfono a un sector y recibe una decisión local.
No será un cliente de una API cloud ni una pantalla que delega el análisis en
el servidor.

La arquitectura propuesta es:

```text
Expo camera
    ↓ frame local
YOLO/ONNX detector → boxes + confidence
    ↓ ROI del sector de estacionamiento
evidence normalizer → FREE/OCCUPIED/UNCERTAIN
    ↓
QVAC local text model → tool calls + explanation
    ↓
deterministic policy → PARK/DO_NOT_PARK/REFUSE
```

YOLO es el detector visual principal. El LLM no debe reemplazar la detección
geométrica ni recibir una imagen para adivinar si hay un hueco. `YOLO26s` queda
como candidato inicial del equipo, sujeto a verificar artefacto ONNX, labels,
postprocesado, licencia, tamaño y rendimiento. El ejemplo oficial de QVAC usa
`@qvac/onnx` con YOLOv10; no se debe presentar YOLO26s como compatible hasta
probarlo.

Para la primera versión, el modelo QVAC de texto parte del baseline ya usado en
el prototipo (`QWEN3_1_7B_INST_Q4`) y se valida en un dispositivo físico. Si no
entra en memoria o latencia, se evalúa una variante QVAC más pequeña del
catálogo permitido. No se usa una API remota, un modelo cloud ni VisionPsy para
ocultar un fallo del detector.

Expo requiere un Development Build/prebuild y un teléfono físico: el SDK de
QVAC documenta Expo como runtime soportado, pero aclara que actualmente no
corre en emuladores por limitaciones de `llamacpp`. La versión exacta de Expo,
el modelo, el dispositivo y las métricas deben quedar registrados antes de
afirmar que la demo es reproducible.

## Política de datos

Durante el MVP actual, Calgary queda documentado como target de integración y
fuente de contratos. El agente sigue funcionando con snapshots locales y
fixtures versionados; no consulta cámaras públicas en tiempo de ejecución ni
descarga imágenes automáticamente. Una futura importación controlada deberá:

1. guardar fecha de captura, fecha de publicación y fuente;
2. verificar que el esquema y la licencia no cambiaron;
3. excluir rostros, patentes legibles, video y metadatos innecesarios;
4. marcar la antigüedad de cada dato y fallar cerrado si no es suficiente;
5. conservar atribución a City of Calgary y la advertencia de que los datos se
   ofrecen sin garantía.

## Qué queda fuera

- No usamos cámaras del GCBA ni de Calgary durante la demo actual.
- No hacemos reconocimiento facial ni lectura de patentes.
- No emitimos multas, reservas ni asesoramiento legal.
- No tratamos las reglas sintéticas del fixture como normativa real.
- No incorporamos un fallback cloud que oculte el rendimiento de QVAC.
- No presentamos capacidad estimada de una zona como disponibilidad actual.
- No hacemos una app de producción, reservas, pagos ni navegación turn-by-turn.
- No usamos Expo Go como evidencia de inferencia QVAC si requiere el plugin
  nativo; la demo mobile debe correr como Development Build.

## Demo mínima

La demo procesa frames grabados y sanitizados de una misma zona: libre,
ocupada, oscura, obstruida y borrosa. Luego prueba horarios y reglas
contradictorias con una matriz repetible. La salida muestra la decisión, la
cadena de herramientas, la evidencia, la frescura de los datos y los rechazos.

## Tesis

Un agente confiable no es el que siempre contesta. Es el que puede explicar de
dónde salió cada dato, distingue disponibilidad de capacidad y se abstiene
cuando no puede sostener la conclusión.
