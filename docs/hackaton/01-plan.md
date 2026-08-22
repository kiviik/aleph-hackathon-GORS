# Plan de hackathon

## Resultado que queremos entregar

Un repositorio público, reproducible y offline-first con:

1. Un agente local QVAC que encadena evidencia visual, ubicación, reglas y
   decisión.
2. Una política determinística que bloquea decisiones inseguras.
3. Un contrato de integración para Calgary que pueda congelarse en snapshots
   locales sin convertir la demo en un sistema online.
4. Un fallback explícito para alternativas pagas que no confunda capacidad o
   presencia de una zona con disponibilidad.
5. Una evaluación de entradas sanitizadas, fixtures adversariales y fallos de
   frescura/esquema.
6. Un video de demo offline y un README que permite clonar y ejecutar.

## Orden de trabajo

### P0 — Arranque, harness y boundary

- Confirmar que el trabajo ocurre en la rama `hackaton`.
- Leer `AGENTS.md`, `docs/hackaton/05-harness.md` y el contexto generado.
- Ejecutar tests del scaffold sin modelo (`npm test`, `npm run evaluate:mock`).
- Verificar hardware con `npx --package "@qvac/cli" qvac doctor`.
- Registrar modelo, versión, sistema operativo, RAM y límites de latencia.
- Mantener separado el catálogo de Calgary de los fixtures sintéticos actuales.

### P1 — Research y contrato Calgary

- Fijar como fuente inicial el dataset [Traffic Cameras](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data), UID `k7p9-kppz`.
- Usar el endpoint Socrata documentado por su UID:
  `https://data.calgary.ca/resource/k7p9-kppz.json`.
- Modelar sólo `camera_url`, `quadrant`, `camera_location` y `point`, además
  de `source_id`, `retrieved_at`, `dataset_updated_at` y `source_url`.
- No asumir que `camera_url` es una imagen de un cordón ni que una cámara
  permite medir ocupación de estacionamiento.
- Definir el match cámara → ubicación/segmento con coordenadas y revisión
  manual; si es ambiguo, `REFUSE`.
- Registrar que el dataset declara actualización diaria, no latencia de
  tiempo real.

### P2 — Ingestión controlada y snapshots

- Diseñar un importador separado del runtime QVAC, con modo de sólo lectura y
  salida local versionada.
- Validar schema, cantidad de filas, campos obligatorios, geometría y URLs sin
  descargar imágenes en la primera iteración.
- Guardar un manifiesto con fuente, timestamp, hash del payload y versión de
  schema; no guardar secretos, video ni frames sin sanitizar.
- Rechazar snapshots viejos o incompatibles en lugar de usarlos como si fueran
  actuales.
- Confirmar atribución y términos de [Open Calgary](https://data.calgary.ca/stories/s/u45n-7awa/).
- Este paso queda fuera de la demo hasta revisar el boundary de acceso a fuentes
  públicas; el MVP seguirá usando datos locales.

### P3 — Reglas de estacionamiento pago

- Integrar como fuente de reglas [On-Street Parking Zones](https://data.calgary.ca/Transportation-Transit/On-Street-Parking-Zones/rhkg-vwwp), UID `rhkg-vwwp`.
- Integrar su relación de tarifas [On-Street Parking Zones with Rates](https://data.calgary.ca/Help-and-Information/On-Street-Parking-Zones-with-Rates/45az-7kh9), UID `45az-7kh9`.
- Normalizar `status`, `zone_type`, `price_zone`, `enforceable_time`,
  `max_time`, `parking_restrict_time`, `no_parking`, capacidad estimada y
  geometría.
- Unir zonas y tarifas por `price_zone`, fecha de snapshot y ubicación; no
  pedirle al LLM que interprete HTML de tarifas o horarios ambiguos.
- Implementar el futuro tool `lookup_paid_alternatives(location, datetime)`.
  Su salida debe incluir fuente, antigüedad, zona, horario, precio si está
  disponible, límite máximo y `availability: UNKNOWN`.
- Si no hay match, el dato está vencido o la zona tiene una restricción
  incompatible, devolver `REFUSE` o `NO_ALTERNATIVE`, nunca una recomendación
  positiva inventada.

### P4 — Integración QVAC

- Mantener el flujo principal:

  `read_frame → lookup_sector → lookup_rules → decide`

- Sólo después de `REFUSE` o ausencia de una plaza segura, permitir:

  `lookup_paid_alternatives → explain_alternative`

- Cargar un modelo de texto con tool calling.
- Cargar un modelo multimodal con su `mmproj` correspondiente.
- Adjuntar un frame local a `completion()`.
- Validar observación, alternativa y decisión como JSON estructurado.
- Mantener visible cada `toolCall`, resultado, retry, error y timestamp de
  fuente.
- La alternativa paga no puede cambiar una decisión vial ni convertir
  `REFUSE` en `PARK`; se presenta como una opción a verificar por el usuario.

### P5 — Datos y robustez

- Grabar cinco condiciones con cámara fija y sanitizar caras, patentes y
  metadatos innecesarios.
- Separar frames usados para prompt-tuning de los holdouts.
- Agregar escenarios con cámara sin match, cámara caída, snapshot vencido,
  zona paga sin tarifa, horario ambiguo y zona con `NO_PARKING`.
- Ejecutar 30 escenarios × 5 repeticiones o el máximo que permita la máquina.
- Medir precisión de decisión, cadena completa, rechazos correctos, frescura,
  validez de JSON y latencia.

### P6 — Demo y entrega

- Ejecutar con la red desconectada luego de descargar los modelos y preparar
  snapshots locales.
- Mostrar un caso libre y permitido.
- Mostrar un caso visualmente libre pero prohibido por horario.
- Mostrar un caso oscuro u obstruido que termina en `REFUSE`.
- Mostrar una alternativa paga marcada como disponibilidad desconocida.
- Mostrar un tool call rechazado y su retry.
- Completar `SUBMISSION.md` con resultados reales, no mock.

## Contrato mínimo de alternativa

```json
{
  "kind": "PAID_PARKING_ALTERNATIVE",
  "location": "calgary:price-zone:8325",
  "zone": "8325",
  "status": "ACTIVE",
  "enforceable_time": "source value",
  "rate": "source value or UNKNOWN",
  "max_time_minutes": 120,
  "availability": "UNKNOWN",
  "source": "City of Calgary Open Data",
  "snapshot_at": "2026-08-22T00:00:00Z"
}
```

`availability: UNKNOWN` es intencional: la fuente describe zonas y tarifas,
no una lectura actual de espacios libres.

## Criterio de corte

Si la visión de 500M no alcanza para una decisión útil, se puede conservarla
como experimento documentado y probar un modelo multimodal de mayor tamaño. No
se debe maquillar la métrica ni reemplazar inferencia real con fixtures en el
reporte final. Si la integración Calgary no puede demostrar frescura, licencia,
match geográfico y fail-closed, se entrega sólo como research y contrato, sin
activar el fallback en la demo.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La cámara mira tránsito y no estacionamiento | Validación manual de cobertura; si no alcanza, `REFUSE` |
| URL o cámara fuera de línea | Snapshot con estado de fuente; no inferir desde ausencia |
| La fuente diaria parece tiempo real | Mostrar `retrieved_at` y antigüedad en la traza |
| Capacidad confundida con disponibilidad | Fijar `availability: UNKNOWN` |
| Precio u horario ambiguo | Normalizador determinístico y derivación a señal/ParkPlus oficial |
| El modelo salta una herramienta | Máquina de estados, schemas y retry limitado |
| Hueco visual pero restricción activa | Reglas consultadas antes de `decide` |
| Frame oscuro/obstruido | Umbral de calidad y abstención |
| RAM insuficiente | `qvac doctor`, modelos cuantizados y carga secuencial |
| Demo no reproducible | Fixtures, snapshots versionados y comandos limpios |
| Datos personales en video | Cropping/blur antes de commit y no retención |
