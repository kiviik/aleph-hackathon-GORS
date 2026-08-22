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
- Si toca mobile, leer `docs/hackaton/07-mobile.md` y mantenerlo aislado en
  `mobile/`; no editar Atelier salvo pedido explícito.

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
- No tratar la ausencia de una detección YOLO como espacio libre. Validar ROI,
  calidad, confianza y estabilidad temporal; ante duda, `REFUSE`.
- No afirmar que `YOLO26s` está soportado por QVAC hasta fijar el ONNX, labels,
  postprocesado, licencia y benchmark en un dispositivo físico.
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
