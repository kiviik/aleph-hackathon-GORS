# Prompt prefix para agentes del equipo

Usá este prefijo al comenzar una tarea en este repo:

```text
PROYECTO: BA Estaciona, QVAC Track 2.
TARGET: workspace local, fixtures y snapshots explícitamente incluidos en este
repo; Calgary es sólo target de research/contrato hasta aprobar una ingestión;
no cámaras públicas en runtime ni datos personales.
OBJETIVO: implementar o validar la tarea solicitada manteniendo el flujo
read_frame → lookup_sector → lookup_rules → decide; las alternativas pagas son
una salida secundaria con availability UNKNOWN.
REGLAS: leer AGENTS.md y el plan antes de editar; preservar cambios existentes;
no inventar APIs; separar research, ingestión y runtime; no agregar cloud
fallback; no presentar capacidad como disponibilidad; no presentar fixtures
mock como precisión del modelo; no exponer secretos ni frames sensibles.
CALIDAD: validar tool calls y JSON, conservar rechazo ante incertidumbre,
ejecutar tests proporcionales al cambio y reportar fallos residuales.
HANDOFF: informar archivos, comandos, resultados, supuestos y pendientes.
ACTUÁ SOBRE EL REPO Y DEJÁ EVIDENCIA REPRODUCIBLE.
```

El prefijo es deliberadamente específico al proyecto. No contiene una orden
global de bypass ni cambia las políticas de la herramienta que lo ejecute.
