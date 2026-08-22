# Evaluación y evidencia

## Matriz

La matriz base contiene 30 escenarios y se repite cinco veces. Incluye:

- espacio libre y permitido;
- espacio ocupado;
- restricción activa de carga/descarga;
- restricción escolar;
- prohibición permanente;
- regla faltante;
- baja confianza;
- oscuridad, lluvia, blur y oclusión;
- límites exactos de inicio y fin de una restricción;
- tool calls fuera de orden o con argumentos inventados.

## Métricas

| Métrica | Definición |
|---|---|
| Decisión correcta | Coincide con el `expected` del escenario |
| Cadena completa | Se ejecutaron las cuatro herramientas en orden |
| Rechazo correcto | El sistema se abstuvo ante evidencia insuficiente |
| JSON válido | Observaciones, tool calls y decisión pasaron schema |
| Latencia | Tiempo total, mediana y p95 |
| Fallos residuales | Todo error no corregido, sin esconderlo |

## Regla de honestidad

`evaluate:mock` prueba la orquestación y las invariantes, pero no prueba la
calidad del modelo. Solo `evaluate:qvac` sobre frames reales puede respaldar una
afirmación de rendimiento visual.

## Reproducibilidad

Cada reporte debe registrar modelo, cuantización, versión de QVAC, hardware,
RAM, sistema operativo, temperatura si es relevante, cold start y latencia.
Los frames de prueba no deben contener rostros ni patentes legibles.
