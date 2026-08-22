# Generated team context

> Generated locally from the project-scoped AI harness. Do not add secrets or frame contents here.
> Repository root: aleph-hackaton-GOR

<!-- source: ai-harness/PROJECT-CONTEXT.md -->

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
- Externo: el runtime no accede a cámaras públicas, servicios de terceros,
  cuentas, infraestructura pública o datos personales. Calgary es el primer
  target de research y contrato de ingestión, no una conexión online habilitada.
- Calgary: `k7p9-kppz` describe ubicaciones de cámaras de tránsito; `rhkg-vwwp`
  describe zonas on-street; `45az-7kh9` relaciona zonas de precio y tarifas.
  Ninguna fuente garantiza ocupación actual.
- Salida: decisión demostrativa, traza y métricas; no multas, reservas ni
  asesoramiento legal.

## Arquitectura

```text
request → QVAC tool-calling model
       → read_frame → QVAC multimodal observation
       → lookup_sector → local fixture
       → lookup_rules → local fixture
       → decide → deterministic safety policy + QVAC explanation
       ↘ paid alternative → local paid-zone snapshot, availability UNKNOWN
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
7. La antigüedad, fuente y estado de schema de datos públicos quedan en la
   traza; un snapshot vencido o incompatible no se presenta como actual.

## Source of truth

Leer primero:

1. `AGENTS.md`
2. `ba-estaciona-qvac/README.md`
3. `docs/hackaton/01-plan.md`
4. `docs/hackaton/02-arquitectura.md`
5. `ba-estaciona-qvac/src/contracts.js`, `orchestrator.js` y `policy.js`
6. `docs/hackaton/06-calgary.md` para el contrato de fuentes públicas

## Vocabulary

- `PARK`: hay evidencia suficiente de espacio y la regla permite estacionar.
- `DO_NOT_PARK`: no hay espacio o una regla activa lo prohíbe.
- `REFUSE`: el sistema no tiene evidencia suficiente para asegurar una
  respuesta.
- `mock`: prueba de orquestación y policy; no es evidencia de modelo.
- `qvac`: inferencia local real mediante `@qvac/sdk`.
- `ALTERNATIVE_PAID_PARKING`: opción de zona/tarifa, no disponibilidad ni
  autorización.
- `availability: UNKNOWN`: la fuente no informa ocupación actual.

---

<!-- source: ai-harness/SESSION-RULES.md -->

# Session rules — BA Estaciona

Estas reglas orientan una sesión de coding y una entrega de hackathon. No son
una sustitución de las políticas de la plataforma ni un mecanismo para
desactivar permisos o controles.

## Antes de editar

- Confirmar la rama con `git status --short --branch`.
- Leer `AGENTS.md`, el README del subproyecto y el plan vigente.
- Inspeccionar cambios existentes y preservarlos.
- Identificar si el cambio afecta Atelier Professional o solamente el prototipo
  `ba-estaciona-qvac/`.
- Si toca Calgary, leer `docs/hackaton/06-calgary.md` y etiquetar el cambio como
  research, snapshot/ingestión o runtime.

## Durante la implementación

- Mantener los cambios dentro del alcance pedido y usar nombres explícitos.
- Preferir schemas, funciones determinísticas y tests sobre prompts ambiguos.
- No inventar métodos de QVAC: verificar la API usada en la documentación o en
  el SDK instalado.
- No sumar cloud fallback, cámaras reales, reconocimiento facial, lectura de
  patentes, multas ni acceso a credenciales.
- No consultar `camera_url`, ParkPlus o APIs públicas desde el runtime de la
  demo. Una futura ingestión debe quedar separada, ser explícita y conservar
  fuente, timestamp, schema, licencia y estado de frescura.
- No inferir disponibilidad desde una cámara, `zone_cap`, `seg_cap` o una URL
  accesible. La alternativa paga debe usar `availability: UNKNOWN` salvo que
  exista una fuente de ocupación explícita y validada.
- No tratar reglas sintéticas como normativa oficial.
- No imprimir ni commitear secretos, tokens, cookies, claves, dumps de cámara,
  caras, patentes legibles ni caches de modelos.
- Si faltan datos o una herramienta falla, implementar el camino de rechazo y
  registrar la limitación. No fabricar una respuesta positiva.

## Validación mínima

```bash
cd ba-estaciona-qvac
npm test
npm run evaluate:mock
npx --package "@qvac/cli" qvac doctor
```

Para cambios en inferencia, agregar además una corrida QVAC real y registrar
modelo, hardware, latencia y fallos. No reportar el resultado mock como
precisión del modelo.

## Handoff

El mensaje final de cada agente debe incluir:

- qué archivos cambió;
- qué comandos ejecutó y su resultado;
- qué supuestos y límite de target usó;
- qué queda pendiente;
- si quedaron procesos, archivos temporales o datos que limpiar.

## Git

- La rama de esta entrega es `hackaton`.
- No trabajar directamente sobre `main`.
- Stagear archivos nombrados y revisar `git diff --cached` antes de commitear.
- Los commits deben describir el resultado verificable, por ejemplo `scaffold:
  add QVAC hackathon context and harness`.

---

<!-- source: ai-harness/PROMPT-PREFIX.md -->

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
