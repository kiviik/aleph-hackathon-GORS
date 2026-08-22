# BA Estaciona Mobile

Demo iOS en Expo. La app tiene tres pestañas nativas: mapa, Street View
embebido y memoria local de favoritos/búsquedas.

## Probar hoy en un iPhone

1. Instalar [Expo Go](https://expo.dev/go) en el iPhone.
2. Ejecutar desde esta carpeta:

   ```bash
   npm install
   npx expo start
   ```

3. Escanear el QR desde Expo Go. El teléfono y la computadora deben estar en
   la misma red Wi-Fi. Si la red bloquea conexiones locales, usar `npx expo
   start --tunnel`.

Para el simulador de iOS: `npm run ios` (requiere Xcode en macOS).

Street View se muestra dentro de la app mediante WebView; no es un botón que
abra Safari. El mapa y los lugares son datos sintéticos de Calgary para la
demo. Los favoritos y búsquedas se guardan solamente en el teléfono.
