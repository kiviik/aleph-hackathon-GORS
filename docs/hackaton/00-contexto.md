# BA Estaciona — contexto de producto

## Idea

BA Estaciona responde una pregunta concreta:

> **¿Puedo estacionar acá, ahora?**

No responde solamente si una imagen parece tener un hueco. Combina evidencia
visual, ubicación, horario y reglas locales. Si una parte de la evidencia falta,
es ambigua o tiene baja confianza, devuelve `REFUSE`/`NO_DETERMINABLE`.

## Primer target: Calgary

El primer caso de integración será Calgary, Canadá, usando datos públicos de la
Ciudad de Calgary. La fuente de cámaras enlazada en el research es un catálogo
de ubicaciones y URLs de imágenes de tránsito, no un feed de ocupación de
estacionamiento:

- dataset [Traffic Cameras](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data), UID `k7p9-kppz`;
- 205 filas y cuatro columnas: `camera_url`, `quadrant`, `camera_location` y
  `point`;
- actualización declarada: diaria; geografía WGS84/Web Mercator;
- las cámaras son para monitoreo de tránsito, no enforcement, y la ciudad dice
  que el footage no se graba;
- una cámara puede estar caída por mantenimiento o temporalmente fuera de línea
  después de un incidente para proteger la identidad de las personas.

La API sirve para descubrir una fuente visual y asociarla geográficamente, pero
no alcanza por sí sola para afirmar que existe una plaza libre. La ocupación
debe salir de una observación visual validada y el espacio debe corresponder al
segmento consultado.

## Fallback de estacionamiento pago

Calgary no basa el estacionamiento pago únicamente en parquímetros: usa zonas
on-street administradas por Calgary Parking Authority y el sistema ParkPlus.
Como fuente de reglas y alternativas se investigaron:

- [On-Street Parking Zones](https://data.calgary.ca/Transportation-Transit/On-Street-Parking-Zones/rhkg-vwwp), UID `rhkg-vwwp`, con geometría, zona, capacidad estimada, tipo de zona, estado, `price_zone`, horarios de enforcement, límite máximo y restricciones;
- [On-Street Parking Zones with Rates](https://data.calgary.ca/Help-and-Information/On-Street-Parking-Zones-with-Rates/45az-7kh9), UID `45az-7kh9`, que relaciona `PRICE_ZONE` con tarifas horarias;
- [Calgary Parking](https://www.calgaryparking.com/purchase-parking/parkplus.html), para explicar ParkPlus y derivar al usuario a la fuente oficial de pago.

Estos datos tampoco informan ocupación actual. `zone_cap` y `seg_cap` son
estimaciones de capacidad, no plazas libres. Por eso el fallback debe devolver
`ALTERNATIVE_PAID_PARKING` sólo como una opción de estacionamiento pago
identificada por zona, precio y horario, nunca como una garantía de disponibilidad
ni como una autorización para estacionar en la calle.

## Por qué QVAC Track 2

El valor de la demo no es prometer una solución pública lista para producción.
Es demostrar que un modelo local pequeño puede encadenar herramientas y que el
sistema detecta sus fallos:

```text
read_frame → lookup_sector → lookup_rules → decide
                                      ↘ lookup_paid_alternatives
```

La inferencia de visión, la selección de herramientas y la explicación deben
ejecutarse localmente mediante QVAC. La decisión de seguridad queda además
limitada por código determinístico. El fallback se consulta sólo después de
una negativa o abstención, y no puede transformar `REFUSE` en `PARK`.

## Política de datos

Durante el MVP actual, Calgary queda documentado como target de integración y
fuente de contratos. El agente sigue funcionando con snapshots locales y
fixtures versionados; no consulta cámaras públicas en tiempo de ejecución ni
descarga imágenes automáticamente. Una futura importación controlada deberá:

1. guardar fecha de captura, fecha de publicación y fuente;
2. verificar que el esquema y la licencia no cambiaron;
3. excluir rostros, patentes legibles, video y metadatos innecesarios;
4. marcar la antigüedad de cada dato y fallar cerrado si no es suficiente;
5. conservar atribución a City of Calgary y la advertencia de que los datos se
   ofrecen sin garantía.

## Qué queda fuera

- No usamos cámaras del GCBA ni de Calgary durante la demo actual.
- No hacemos reconocimiento facial ni lectura de patentes.
- No emitimos multas, reservas ni asesoramiento legal.
- No tratamos las reglas sintéticas del fixture como normativa real.
- No incorporamos un fallback cloud que oculte el rendimiento de QVAC.
- No presentamos capacidad estimada de una zona como disponibilidad actual.

## Demo mínima

La demo procesa frames grabados y sanitizados de una misma zona: libre,
ocupada, oscura, obstruida y borrosa. Luego prueba horarios y reglas
contradictorias con una matriz repetible. La salida muestra la decisión, la
cadena de herramientas, la evidencia, la frescura de los datos y los rechazos.

## Tesis

Un agente confiable no es el que siempre contesta. Es el que puede explicar de
dónde salió cada dato, distingue disponibilidad de capacidad y se abstiene
cuando no puede sostener la conclusión.
