# AI harness — BA Estaciona

Este directorio es un harness de contexto para trabajo colaborativo con LLMs.
Su objetivo es que una persona nueva o un agente nuevo pueda entender el repo,
la frontera del proyecto y la forma de validar cambios en pocos minutos.

La estructura toma ideas de handoff y contexto regenerable de
[`G4sp4rCS/hard-allow`](https://github.com/G4sp4rCS/hard-allow), pero es una
adaptación acotada al proyecto. No cambia permisos del sistema, no desactiva
controles de seguridad y no autoriza acciones fuera del workspace.

## Archivos

- `PROJECT-CONTEXT.md`: producto, alcance, repositorios y vocabulario.
- `SESSION-RULES.md`: reglas de trabajo para agentes y colaboradores.
- `PROMPT-PREFIX.md`: texto corto para iniciar una sesión de coding.
- `context-builder.mjs`: compone los tres archivos en un contexto compartible.
- `verify-context.mjs`: valida que el contexto esté completo y sin patrones
  accidentales de secretos.
- `context/CONTEXT.md`: salida generada para pegar en otros LLMs.
- `docs/hackaton/06-calgary.md`: research y contrato del primer target de datos.

## Uso

Desde la raíz del repo:

```bash
node ai-harness/context-builder.mjs
node ai-harness/verify-context.mjs
```

Regenerá el contexto cada vez que cambien el plan, los contratos o la frontera
del proyecto. Si cambia el research de Calgary, actualizá también el plan y el
contexto fuente antes de regenerar. El archivo generado es deliberadamente
legible: no incluye variables de entorno, tokens, rutas privadas de la máquina
ni contenido de frames.
