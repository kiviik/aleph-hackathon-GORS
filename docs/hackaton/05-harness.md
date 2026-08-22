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
