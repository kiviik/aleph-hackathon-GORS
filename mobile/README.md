# BA Estaciona Mobile / Android + iOS

Superficie mobile local-first para el hackathon. Android e iOS usan el mismo
árbol de UI y el mismo lenguaje visual: `Mapa`, `Street View` y `Guardados`.
Este primer slice valida el contrato de ejecución en el teléfono: permiso de
cámara, modo offline, evidencia local, `REFUSE` fail-closed y trace persistida.

No hay backend propio ni acceso runtime a Calgary, Google Street View, ParkPlus
o cualquier otra API pública. El mapa y la vista de calle conservan la
composición visual de la app anterior, pero ahora son canvas/evidencia local:
Calgary queda como research y snapshots locales fuera de esta pantalla.

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

Para validar la misma app en iOS:

```bash
npm run build:ios:preview
```

La build iOS requiere macOS/Xcode o EAS y un `bundleIdentifier` válido. No
existe una segunda implementación de UI para iOS.

## Build local con Docker

Docker instala Node, JDK 17, Android SDK y Gradle dependencies dentro de un
builder aislado. El resultado es un APK `debug` firmado con la debug keystore
de Android, apto para instalarlo en un teléfono de demo:

```bash
docker build -f Dockerfile -t ba-estaciona-android-builder .
mkdir -p artifacts
docker run --rm \
  -e BUILD_VARIANT=debug \
  -v "$(pwd)/artifacts:/output" \
  ba-estaciona-android-builder
```

El archivo queda en `mobile/artifacts/ba-estaciona-android-debug.apk`.
También se puede ejecutar `npm run build:android:docker`. El builder acepta
`BUILD_VARIANT=release`, pero ese APK no queda firmado para distribución: no se
guardan keystores ni passwords en el repo.

## CI y GitHub Releases

El workflow [android-apk-release.yml](../.github/workflows/android-apk-release.yml)
se ejecuta manualmente o con cada push a `main` o `hackaton`. Compila dos APK
con el Dockerfile, los deja como artifact de Actions y actualiza la Release
permanente `mobile-latest`:

- `ba-estaciona-android-debug.apk`: build de desarrollo, requiere Metro.
- `ba-estaciona-android-release.apk`: build autónoma, incluye el bundle JS.

Para una Release versionada, pushear un tag `mobile-v*`:

```bash
git tag mobile-v0.1.0
git push origin mobile-v0.1.0
```

El workflow usa `contents: write` para publicar la Release. En GitHub hay que
revisar `Settings > Actions > General > Workflow permissions` y seleccionar
`Read and write permissions`. Si la organización impone tokens read-only, crear
un token fine-grained con permiso `Contents: Read and write`, guardarlo como
secret del repo llamado `RELEASE_TOKEN` y volver a ejecutar el workflow. El
workflow usa ese secret si existe y, si no, el `GITHUB_TOKEN` integrado.

No se requiere Expo token, API key ni servidor propio. El APK `release` de CI
es instalable para la demo, pero no está firmado con una keystore de
distribución. Para publicar en Play Store habrá que agregar una keystore
mediante GitHub Secrets y una variante de firma explícita.

Para abrir el bundler durante el desarrollo:

```bash
npm run start
```

La validación de QVAC no se hace en Expo Go ni en un emulador. El siguiente
gate necesita un Development Build y un Android físico.

## Estado actual

- Android + iOS: configurados en `app.json` con permisos nativos de cámara y
  ubicación mediante Expo.
- APK: perfil EAS `preview` listo.
- UI: paridad visual con la app anterior; mapa/vista de calle son locales y no
  prometen disponibilidad real.
- Cámara: permisos cross-platform y flujo de evidencia listos;
  preview/captura nativa pendiente.
- YOLO26s: candidato, todavía no aceptado hasta fijar ONNX, labels, NMS, licencia
  y benchmark.
- QVAC: integración local pendiente de validar en Development Build.
- Decisión: nunca muestra `PARK` desde esta pantalla; el estado incompleto es
  `REFUSE` y queda registrado en una trace local.

## Orden de integración

1. Validar el APK en un Android físico y la build iOS en un dispositivo físico,
   registrando API, memoria y cold start.
2. Conectar `expo-camera` a la captura sin persistir ni subir frames.
3. Integrar el ONNX exacto de YOLO y normalizar boxes, ROI, calidad y confianza.
4. Conectar `evidence -> lookup_sector -> lookup_rules -> decide` con fixtures
   locales y policy determinística.
5. Recién después sumar QVAC tool-calling y medir memoria/latencia/batería.
