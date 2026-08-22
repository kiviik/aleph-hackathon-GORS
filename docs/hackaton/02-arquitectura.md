# Arquitectura inicial

```text
┌─────────────────────┐
│ CLI / demo local     │
└──────────┬──────────┘
           │ request: camera, location, datetime
           ▼
┌─────────────────────┐       ┌──────────────────────┐
│ Orchestrator        │──────▶│ QVAC text model      │
│ state machine       │◀──────│ tool calls + JSON    │
└───────┬─────────────┘       └──────────────────────┘
        │ local tool handlers
        ├── read_frame ──────▶ local frame source
        │                         │
        │                         ▼
        │                   QVAC multimodal + mmproj
        ├── lookup_sector ──▶ SQLite/JSON fixture
        ├── lookup_rules ───▶ SQLite/JSON fixture
        └── decide ─────────▶ deterministic policy + QVAC explanation
```

## Responsabilidades

- **QVAC multimodal:** describe solamente lo observable en el frame y devolver
  estado, calidad, confianza y evidencia.
- **QVAC text model:** elegir una herramienta por turno y producir la
  explicación final basada en resultados verificados.
- **Toolbox local:** leer frames y consultar datos locales. Nunca envía datos a
  un servicio remoto.
- **Orchestrator:** impone el orden, valida argumentos, limita retries y
  conserva una traza auditable.
- **Policy:** bloquea `PARK` si la imagen no es usable, la confianza es baja,
  faltan reglas o la regla activa prohíbe estacionar.

## Elección de integración

Para la visión usamos `@qvac/sdk` directamente porque el SDK documenta
`attachments` locales y el par LLM multimodal + `projectionModelSrc`. El HTTP
server compatible con OpenAI puede ser útil para herramientas de texto, pero no
es necesario para el MVP y agregaría otra superficie de diagnóstico.

## Contratos mínimos

```json
{
  "state": "FREE|OCCUPIED|UNCERTAIN",
  "quality": "USABLE|DARK|OCCLUDED|BLURRY",
  "confidence": 0.0,
  "explanation": "evidencia observable, breve"
}
```

La salida final siempre es uno de `PARK`, `DO_NOT_PARK` o `REFUSE`. El modelo no
puede pasar evidencia arbitraria al veredicto: la decisión recibe el estado
verificado por las herramientas.
