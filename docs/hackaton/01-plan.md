# Plan de hackathon

## Resultado que queremos entregar

Un repositorio público, reproducible y offline-first con:

1. Un agente local QVAC que encadena cuatro herramientas.
2. Una política determinística que bloquea decisiones inseguras.
3. Una evaluación de entradas reales sanitizadas y fixtures adversariales.
4. Un video de demo offline y un README que permite clonar y ejecutar.

## Orden de trabajo

### P0 — Arranque y contrato

- Confirmar que el trabajo ocurre en la rama `hackaton`.
- Ejecutar tests del scaffold sin modelo (`npm test`, `npm run evaluate:mock`).
- Verificar hardware con `npx --package "@qvac/cli" qvac doctor`.
- Registrar modelo, versión, sistema operativo, RAM y límites de latencia.

### P1 — Integración QVAC

- Cargar un modelo de texto con tool calling.
- Cargar un modelo multimodal con su `mmproj` correspondiente.
- Adjuntar un frame local a `completion()`.
- Validar observación y decisión como JSON estructurado.
- Mantener visible cada `toolCall`, resultado, retry y error.

### P2 — Datos y robustez

- Grabar cinco condiciones con cámara fija.
- Sanitizar caras, patentes y metadatos innecesarios.
- Separar frames usados para prompt-tuning de los holdouts.
- Ejecutar 30 escenarios × 5 repeticiones o el máximo que permita la máquina.
- Medir precisión de decisión, cadena completa, rechazos correctos y latencia.

### P3 — Demo y entrega

- Ejecutar con la red desconectada luego de descargar los modelos.
- Mostrar un caso libre y permitido.
- Mostrar un caso visualmente libre pero prohibido por horario.
- Mostrar un caso oscuro u obstruido que termina en `REFUSE`.
- Mostrar un tool call rechazado y su retry.
- Completar `SUBMISSION.md` con resultados reales, no mock.

## Criterio de corte

Si la visión de 500M no alcanza para una decisión útil, se puede conservarla
como experimento documentado y probar un modelo multimodal de mayor tamaño. No
se debe maquillar la métrica ni reemplazar inferencia real con fixtures en el
reporte final.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El modelo salta una herramienta | Máquina de estados, schemas y retry limitado |
| Hueco visual pero restricción activa | Reglas consultadas antes de `decide` |
| Frame oscuro/obstruido | Umbral de calidad y abstención |
| RAM insuficiente | `qvac doctor`, modelos cuantizados y carga secuencial |
| Demo no reproducible | Fixtures versionados, frames fuera del repo y comandos limpios |
| Datos personales en video | Cropping/blur antes de commit y no retención |
