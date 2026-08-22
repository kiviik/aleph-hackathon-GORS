# Cómo usar el harness de contexto

El harness está en [`ai-harness/`](../../ai-harness/). Está inspirado en la
separación de contexto, reglas de sesión, prefijo de prompt y handoff del
proyecto [G4sp4rCS/hard-allow](https://github.com/G4sp4rCS/hard-allow), fijado
para esta adaptación al commit `eea1fa32e543f66d15ceeee5ef5269ff5182a259`.

## Qué se adaptó

- Un contexto de proyecto único y regenerable.
- Reglas de sesión para que distintos LLMs conozcan el límite real del repo.
- Un prefijo de prompt orientado a ejecutar, validar y reportar.
- Un checklist de handoff reproducible.
- Verificación de que los archivos fuente del contexto existen y no contienen
  secretos comunes.
- Un boundary explícito para research e ingestión futura de datos públicos de
  Calgary, sin convertir el runtime local en un cliente online.

## Qué se excluyó deliberadamente

No se portaron los componentes de HARD ALLOW que modifican permisos globales,
desactivan controles, fuerzan bypasses de plataforma o habilitan operaciones de
red-team. Este repo necesita coordinación de agentes y rigor de ingeniería, no
un control plane de permisos.

## Flujo

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```

El contexto generado se guarda en `ai-harness/context/CONTEXT.md`. Cada LLM del
equipo puede pegar ese archivo como contexto inicial o leerlo desde el repo.

## Antes de trabajar en Calgary

El agente debe leer también [`06-calgary.md`](06-calgary.md) y distinguir tres
capas:

1. research/documentación de fuentes públicas;
2. importación controlada a snapshots locales;
3. inferencia QVAC offline sobre datos ya disponibles localmente;
4. superficie mobile Expo que sólo consume modelos y datos locales.

La capa 1 está habilitada para documentar. La capa 2 requiere revisar schema,
licencia, privacidad, frescura y el boundary del hackathon. La capa 3 no debe
consultar `camera_url`, ParkPlus, cuentas, pagos ni servicios cloud en tiempo de
ejecución.

Una cámara de tránsito no demuestra una plaza libre. Una zona de parking o su
capacidad tampoco demuestra disponibilidad. Si falta esa evidencia, el agente
debe conservar `REFUSE` y puede ofrecer una alternativa paga con
`availability: UNKNOWN`.

Para tareas mobile, leer [`07-mobile.md`](07-mobile.md). El harness debe
mantener separado el detector YOLO/ONNX del LLM QVAC, exigir un dispositivo
físico para validar la integración y registrar modelo, versión, memoria,
latencia y errores. No considerar una pantalla Expo conectada a un backend
como evidencia de inferencia local.
