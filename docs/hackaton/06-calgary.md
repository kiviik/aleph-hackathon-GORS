# Research Calgary — cámaras y estacionamiento pago

Fecha de research: 2026-08-22.

## Conclusión

Calgary es un buen primer target de integración de datos públicos, pero la API
enlazada no resuelve por sí sola el problema de estacionamiento. El dataset de
cámaras aporta descubrimiento geográfico y una URL de imagen de tránsito. Los
datasets de Calgary Parking aportan zonas, restricciones y tarifas. Ninguno de
los dos publica ocupación actual garantizada.

La arquitectura recomendada es:

```text
fuentes Calgary → importación controlada → snapshot local acompañado por metadata
                                       ↓
request → read_frame → lookup_sector → lookup_rules → decide
                                                   ↘ paid alternative
```

La importación queda separada del runtime local-first. En la demo actual sólo
se documenta el contrato; no se consulta una cámara pública ni se descarga una
imagen automáticamente.

## Fuente de cámaras

Fuente primaria: [Traffic Cameras — Open Calgary](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data).

- UID Socrata: `k7p9-kppz`.
- Endpoint de recurso: `https://data.calgary.ca/resource/k7p9-kppz.json`.
- 205 filas, cuatro columnas.
- Campos: `camera_url` (URL), `quadrant` (texto), `camera_location` (texto) y
  `point` (punto geográfico).
- La página declara actualización diaria y geografía WGS84/Web Mercator.
- La descripción dice que son imágenes actualizadas de condiciones de tránsito
  en rutas principales e intersecciones.
- La ciudad aclara que las cámaras son para monitoreo, no enforcement, que el
  footage no se graba y que pueden quedar fuera de línea por mantenimiento o
  incidentes.

### Qué sí permite

- construir un catálogo de cámaras y sus coordenadas;
- seleccionar candidatos cercanos a una ubicación;
- usar una imagen como evidencia visual si la futura importación está aprobada,
  sanitizada y la cámara realmente cubre el cordón;
- registrar la fuente y la frescura del catálogo.

### Qué no permite

- saber cuántos espacios libres hay;
- garantizar que la URL siga viva o que la cámara esté operativa;
- inferir que el campo de visión cubre una plaza de estacionamiento;
- usar la antigüedad declarada como latencia de tiempo real;
- recuperar video histórico, porque la ciudad declara que el footage no se graba.

La API de recurso se deriva del UID siguiendo la documentación de [Socrata
SODA](https://support.socrata.com/hc/en-us/articles/202949298-Where-do-I-find-the-SODA-API-Endpoint).

## Fuente de zonas y tarifas

### Zonas on-street

[On-Street Parking Zones — Open Calgary](https://data.calgary.ca/Transportation-Transit/On-Street-Parking-Zones/rhkg-vwwp)
usa el UID `rhkg-vwwp` y declara actualización semanal, geometría EPSG:4326
WGS84 y aproximadamente 1.650 filas. Sus campos relevantes incluyen:

- `parking_zone`, `zone_cap`, `seg_cap`;
- `zone_type`, `stall_type`, `address_desc`, `block_side`;
- `status`, `price_zone`, `permit_zone`;
- `enforceable_time`, `max_time`;
- `parking_restrict_type`, `parking_restrict_time`, `no_parking`.

La propia descripción advierte que `zone_cap` y `seg_cap` son estimaciones de
capacidad. No son un sensor de ocupación.

### Tarifas

[On-Street Parking Zones with Rates — Open Calgary](https://data.calgary.ca/Help-and-Information/On-Street-Parking-Zones-with-Rates/45az-7kh9)
usa el UID `45az-7kh9`, declara actualización mensual y explica que las áreas
horarias corresponden a `PRICE_ZONE` del dataset de zonas. Es la fuente para
relacionar una zona con una tarifa, no para confirmar que haya una plaza libre.

Para el flujo de usuario, [Calgary Parking / ParkPlus](https://www.calgaryparking.com/purchase-parking/parkplus.html)
es la referencia operativa para encontrar ubicaciones, ver tarifas y pagar.
El agente debe derivar a esa fuente para la acción de pago, sin automatizar
cuentas, sesiones, matrículas o cobros.

## Licencia y atribución

Los datasets enlazan los [Open Calgary Terms of Use](https://data.calgary.ca/stories/s/u45n-7awa/).
La licencia permite copiar, modificar, publicar, traducir, adaptar, distribuir
y usar la información para fines lícitos, con atribución. La atribución genérica
indicada es:

> Contains information licensed under the Open Government Licence — City of Calgary.

La licencia también excluye información personal y derechos de terceros, no
concede uso de nombres/logos/símbolos oficiales que sugiera endorsement y
entrega los datos sin garantía. Antes de incluir snapshots o imágenes en un
commit hay que comprobar que el recurso específico esté cubierto y que no se
retengan datos personales.

## Contrato operativo propuesto

La futura ingestión debe producir un snapshot local con:

```json
{
  "source_id": "calgary-traffic-cameras",
  "dataset_uid": "k7p9-kppz",
  "source_url": "https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data",
  "retrieved_at": "2026-08-22T00:00:00Z",
  "dataset_updated_at": "2026-08-17T00:00:00Z",
  "schema_version": "1",
  "record_count": 205,
  "availability": "CATALOG_ONLY"
}
```

Para una alternativa paga, el contrato debe conservar `price_zone`, tarifa,
horario, límite y `availability: UNKNOWN`. Nunca se debe producir
`availability: FREE` a partir de `zone_cap`, de la presencia de una cámara o de
una URL que responde.

## Próximos experimentos

1. Exportar una muestra de metadata, sin imágenes, y validar el schema contra
   los cuatro campos publicados.
2. Seleccionar una zona de Calgary cuyo campo de visión pueda revisarse
   manualmente y documentar si cubre o no el cordón.
3. Crear fixtures sintéticos con cámara válida, cámara sin match, URL caída,
   snapshot vencido y zona paga sin disponibilidad conocida.
4. Implementar primero `lookup_paid_alternatives` sobre snapshots locales.
5. Recién después evaluar una importación controlada de imágenes, con revisión
   de privacy, términos, almacenamiento y boundary del hackathon.

## Fuentes consultadas

- [Traffic Cameras — Open Calgary](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz/about_data)
- [Calgary traffic cameras — City of Calgary](https://www.calgary.ca/roads/conditions/traffic-cameras.html)
- [On-Street Parking Zones — Open Calgary](https://data.calgary.ca/Transportation-Transit/On-Street-Parking-Zones/rhkg-vwwp)
- [On-Street Parking Zones with Rates — Open Calgary](https://data.calgary.ca/Help-and-Information/On-Street-Parking-Zones-with-Rates/45az-7kh9)
- [Calgary Parking / ParkPlus](https://www.calgaryparking.com/purchase-parking/parkplus.html)
- [Open Calgary Terms of Use](https://data.calgary.ca/stories/s/u45n-7awa/)
- [Socrata: SODA API endpoint](https://support.socrata.com/hc/en-us/articles/202949298-Where-do-I-find-the-SODA-API-Endpoint)
