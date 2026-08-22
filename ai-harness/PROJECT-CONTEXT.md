# Project context — BA Estaciona / QVAC Track 2

## Misión

Construir una demo local-first que responda “¿Puedo estacionar acá, ahora?”
encadenando evidencia visual, sector, reglas y decisión. El proyecto compite
por confiabilidad de tool use con modelos pequeños, no por ser un producto de
tránsito terminado.

## Boundary

- Repositorio de trabajo: este workspace, especialmente `ba-estaciona-qvac/`.
- Rama de hackathon: `hackaton`.
- Datos: fixtures sintéticos y frames propios, sanitizados y locales.
- Red: no necesaria después del primer download de modelos.
- Externo: no se accede a cámaras del GCBA, servicios de terceros, cuentas,
  infraestructura pública o datos personales.
- Salida: decisión demostrativa, traza y métricas; no multas, reservas ni
  asesoramiento legal.

## Arquitectura

```text
request → QVAC tool-calling model
       → read_frame → QVAC multimodal observation
       → lookup_sector → local fixture
       → lookup_rules → local fixture
       → decide → deterministic safety policy + QVAC explanation
```

## Invariantes

1. QVAC hace el trabajo de inferencia real; no es un adorno paralelo a un modelo
   cloud.
2. Las herramientas deben ejecutarse en orden y con argumentos provenientes de
   estado verificado.
3. Evidencia ausente, oscura, obstruida, borrosa, de baja confianza o sin regla
   disponible produce `REFUSE`.
4. Una regla activa puede convertir un hueco visual en `DO_NOT_PARK`.
5. La política determinística puede rechazar una sugerencia del modelo, nunca
   al revés.
6. Todo retry, error y decisión debe quedar en la traza.

## Source of truth

Leer primero:

1. `AGENTS.md`
2. `ba-estaciona-qvac/README.md`
3. `docs/hackaton/01-plan.md`
4. `docs/hackaton/02-arquitectura.md`
5. `ba-estaciona-qvac/src/contracts.js`, `orchestrator.js` y `policy.js`

## Vocabulary

- `PARK`: hay evidencia suficiente de espacio y la regla permite estacionar.
- `DO_NOT_PARK`: no hay espacio o una regla activa lo prohíbe.
- `REFUSE`: el sistema no tiene evidencia suficiente para asegurar una
  respuesta.
- `mock`: prueba de orquestación y policy; no es evidencia de modelo.
- `qvac`: inferencia local real mediante `@qvac/sdk`.
