# Calgary Estaciona Mobile

Superficie Android local-first para el hackathon. Este primer vertical slice
valida el contrato de ejecución en el teléfono: permiso de cámara, modo offline,
pipeline visible, `REFUSE` fail-closed y trace local persistida.

No hay backend propio ni acceso runtime a Calgary, Street View, ParkPlus o
cualquier otra API pública. Calgary queda como research y snapshots locales
fuera de esta pantalla.

## Preparar el APK

Desde esta carpeta, con Node.js instalado:

```bash
npm install
npm run prebuild:android
npm run build:android:preview
```

El perfil `preview` genera un `.apk` instalable para la demo. El perfil
`production` genera un `.aab` para Play Store. EAS puede pedir login o una
cuenta/proyecto configurado; eso no cambia el runtime local de la app.

Para abrir el bundler durante el desarrollo:

```bash
npm run start
```

La validación de QVAC no se hace en Expo Go ni en un emulador. El siguiente
gate necesita un Development Build y un Android físico.

## Estado actual

- Android-only: configurado en `app.json` con package y permiso de cámara.
- APK: perfil EAS `preview` listo.
- Cámara: permiso Android y diagnóstico listos; preview/captura nativa pendiente.
- YOLO26s: candidato, todavía no aceptado hasta fijar ONNX, labels, NMS, licencia
  y benchmark.
- QVAC: integración local pendiente de validar en Development Build.
- Decisión: nunca muestra `PARK` desde esta pantalla; el estado incompleto es
  `REFUSE` y queda registrado en una trace local.

## Orden de integración

1. Validar el APK en un Android físico y registrar API, memoria y cold start.
2. Agregar `expo-camera` y capturar un frame sin persistirlo ni subirlo.
3. Integrar el ONNX exacto de YOLO y normalizar boxes, ROI, calidad y confianza.
4. Conectar `evidence -> lookup_sector -> lookup_rules -> decide` con fixtures
   locales y policy determinística.
5. Recién después sumar QVAC tool-calling y medir memoria/latencia/batería.
