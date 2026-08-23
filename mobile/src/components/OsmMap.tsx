// Leaflet + OpenStreetMap inside the WebView we already depend on, replacing react-native-maps.
//
// Why: react-native-maps renders Google Maps on Android and hard-crashes the process with
// `IllegalStateException: API key not found` when no com.google.android.geo.API_KEY meta-data is
// present. A Maps key requires an OPEN Google Cloud billing account, which this project does not
// have. iOS never showed the bug because react-native-maps falls back to Apple Maps there.
//
// OSM needs no key and no billing, and it matches what the Electron/Next surface already does
// (see the root README: "the map still uses OpenStreetMap tiles and Nominatim").
//
// Leaflet itself is loaded from unpkg. That is a deliberate trade: the tiles already require the
// network, so a CDN adds no offline failure mode that the tiles do not already have. If either
// fails, `status` goes to "failed" and the caller gets a placeholder with a retry instead of a
// blank rectangle -- nothing here may ever fail silently.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

export type OsmMarker = {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  /** Popup heading. Omit for a bare pin with no popup (the static Street View fallback). */
  title?: string;
  status?: string;
  hint?: string;
};

type LatLng = { latitude: number; longitude: number };

type Props = {
  markers: OsmMarker[];
  center: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  /** false = a still picture: no drag, no zoom, no popups. */
  interactive?: boolean;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
  onSelect?: (id: string) => void;
  /** Popup tapped. */
  onOpen?: (id: string) => void;
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// If the map has not reported `ready` by now, assume the CDN or the tiles are unreachable.
const READY_TIMEOUT_MS = 15000;

function buildHtml(center: LatLng, zoom: number, interactive: boolean, dark: boolean): string {
  const bg = dark ? "#101a14" : "#e9efe9";
  const on = interactive ? "true" : "false";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CSS}" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${bg}; }
  .leaflet-container { background: ${bg}; font-family: -apple-system, Roboto, sans-serif; }
  .pin { width: 100%; height: 100%; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); }
  .me { width: 100%; height: 100%; border-radius: 50%; background: #2979ff; border: 2px solid #fff; box-shadow: 0 0 0 6px rgba(41,121,255,.22); }
  .cal { font-size: 13px; line-height: 1.35; min-width: 150px; }
  .cal b { display: block; font-size: 14px; margin-bottom: 2px; }
  .cal .st { font-weight: 600; }
  .cal .hint { color: #6b776e; font-size: 11px; margin-top: 4px; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
(function () {
  var post = function (o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
  };
  if (!window.L) { post({ type: 'error', error: 'Leaflet did not load' }); return; }

  var interactive = ${on};
  var map = L.map('map', {
    zoomControl: interactive,
    dragging: interactive,
    scrollWheelZoom: false,
    doubleClickZoom: interactive,
    touchZoom: interactive,
    boxZoom: false,
    keyboard: false,
    tap: interactive
  }).setView([${center.latitude}, ${center.longitude}], ${zoom});

  // OSM's tile policy requires the attribution stay visible.
  var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // A handful of dropped tiles is normal; only a total failure to paint is worth reporting.
  var loaded = 0, failed = 0;
  tiles.on('tileload', function () { loaded++; });
  tiles.on('tileerror', function () {
    failed++;
    if (loaded === 0 && failed > 8) post({ type: 'error', error: 'OpenStreetMap tiles unreachable' });
  });

  var layer = L.layerGroup().addTo(map);
  var meMarker = null;

  window.__setMarkers = function (list) {
    layer.clearLayers();
    list.forEach(function (m) {
      var mk = L.marker([m.latitude, m.longitude], {
        icon: L.divIcon({
          className: '',
          html: '<div class="pin" style="background:' + m.color + '"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(layer);
      mk.on('click', function () { post({ type: 'select', id: m.id }); });
      if (m.title && interactive) {
        // Built with textContent, never string concatenation: street names are data.
        var el = document.createElement('div');
        el.className = 'cal';
        var b = document.createElement('b');
        b.textContent = m.title;
        el.appendChild(b);
        if (m.status) {
          var s = document.createElement('span');
          s.className = 'st';
          s.style.color = m.color;
          s.textContent = m.status;
          el.appendChild(s);
        }
        if (m.hint) {
          var h = document.createElement('div');
          h.className = 'hint';
          h.textContent = m.hint;
          el.appendChild(h);
        }
        el.addEventListener('click', function () { post({ type: 'open', id: m.id }); });
        mk.bindPopup(el);
      }
    });
  };

  window.__setUser = function (u) {
    if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
    if (!u) return;
    meMarker = L.marker([u.latitude, u.longitude], {
      icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
    }).addTo(map);
  };

  map.whenReady(function () { post({ type: 'ready' }); });
})();
</script>
</body>
</html>`;
}

export default function OsmMap(props: Props) {
  const { markers, center, zoom = 12, userLocation = null, interactive = true, dark = false, style, onSelect, onOpen } = props;
  const webRef = useRef<WebView>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The HTML is built once per attempt. Marker data is pushed in afterwards so that a scan
  // result never remounts the WebView and throws away the user's pan/zoom.
  const html = useMemo(
    () => buildHtml(center, zoom, interactive, dark),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center.latitude, center.longitude, zoom, interactive, dark, attempt]
  );

  const push = useCallback(() => {
    const js = `window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)});
                window.__setUser && window.__setUser(${JSON.stringify(userLocation)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, [markers, userLocation]);

  useEffect(() => {
    if (status === "ready") push();
  }, [status, push]);

  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      setStatus("failed");
      setError("The map did not load in time.");
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, attempt]);

  const retry = () => {
    setError(null);
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const onMessage = (e: any) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "ready") setStatus("ready");
    else if (msg.type === "select") onSelect?.(msg.id);
    else if (msg.type === "open") onOpen?.(msg.id);
    else if (msg.type === "error") {
      setStatus("failed");
      setError(String(msg.error));
    }
  };

  // The guard. A map that cannot draw says so; it never leaves an empty rectangle behind that
  // could be mistaken for "no parking found here".
  if (status === "failed") {
    return (
      <View style={[s.fallback, dark && s.fallbackDark, style]}>
        <Text style={[s.icon, dark && s.textDark]}>◎</Text>
        <Text style={[s.title, dark && s.textDark]}>Map unavailable</Text>
        <Text style={[s.body, dark && s.bodyDark]}>{error ?? "The map could not be loaded."}</Text>
        <Text style={[s.body, dark && s.bodyDark]}>Scanning and detection are unaffected.</Text>
        <Pressable onPress={retry} style={s.retry} accessibilityRole="button">
          <Text style={s.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.wrap, style]}>
      <WebView
        key={attempt}
        ref={webRef}
        source={{ html }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        style={s.web}
        onMessage={onMessage}
        onError={() => {
          setStatus("failed");
          setError("The map failed to load.");
        }}
        onHttpError={() => {
          setStatus("failed");
          setError("The map failed to load.");
        }}
      />
      {status === "loading" && (
        <View style={[s.loading, dark && s.fallbackDark]} pointerEvents="none">
          <ActivityIndicator size="small" color="#247b52" />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { overflow: "hidden" },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#e9efe9" },
  fallback: { alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#e9efe9" },
  fallbackDark: { backgroundColor: "#101a14" },
  icon: { fontSize: 26, color: "#5d6b62", marginBottom: 6 },
  title: { fontSize: 15, fontWeight: "700", color: "#1f2a23", marginBottom: 4 },
  body: { fontSize: 12, color: "#6b776e", textAlign: "center" },
  bodyDark: { color: "#9aaa9e" },
  textDark: { color: "#eaf2ec" },
  retry: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "#247b52" },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
