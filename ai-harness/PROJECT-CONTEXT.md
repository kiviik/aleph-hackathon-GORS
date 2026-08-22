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
- Mobile: la futura superficie será `mobile/`, aislada de `app/` y del runtime
  Node. Expo Development Build ejecutará YOLO/ONNX para detección y QVAC local
  para tool-calling; no habrá backend de inferencia.
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

mobile camera → YOLO/ONNX → structured evidence → local QVAC tools → policy
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
8. Un detector sin boxes no prueba `FREE`; ROI, calidad y policy pueden producir
   `UNCERTAIN`/`REFUSE`.

## Source of truth

Leer primero:

1. `AGENTS.md`
2. `ba-estaciona-qvac/README.md`
3. `docs/hackaton/01-plan.md`
4. `docs/hackaton/02-arquitectura.md`
5. `ba-estaciona-qvac/src/contracts.js`, `orchestrator.js` y `policy.js`
6. `docs/hackaton/06-calgary.md` para el contrato de fuentes públicas
7. `docs/hackaton/07-mobile.md` para la superficie Expo y el pipeline local

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
- `mobile`: app Expo separada, validada en dispositivo físico, no en emulador.
- `YOLO/ONNX`: detector visual; sus boxes son evidencia, no autoridad legal.
