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
import { WebView } from "react-native-webview";

import {
  ActivityIndicator,
  Button,
  ButtonText,
  StyleSheet,
  Text,
  View,
  useTheme,
  useThemedStyles,
  type StyleProp,
  type Theme,
  type ViewStyle,
} from "../design-system";

export type OsmMarker = {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  /** Popup heading. Omit for a bare pin with no popup. */
  title?: string;
  status?: string;
  hint?: string;
  /** Third popup line: extent and accuracy, e.g. "5 Av → 6 Av · ~15 m of curb, ±10 m". */
  meta?: string;
  /** The stretch of curb this pin stands for, as [lat, lng] pairs. Drawn instead of implying a point. */
  curb?: [number, number][] | null;
  /** Markers sharing this key are two curbs of one street and must never hide each other. */
  pairKey?: string;
};

type LatLng = { latitude: number; longitude: number };

/**
 * A request to bring one point into view. `nonce` is what makes it a *request* rather than a
 * position: asking twice for the same coordinate has to pan twice, and a plain lat/lng prop would
 * compare equal the second time and do nothing.
 */
export type MapFocus = {
  latitude: number;
  longitude: number;
  /** Push the point this many px above centre, to clear chrome overlaying the bottom of the map. */
  offsetY?: number;
  nonce: number;
};

type Props = {
  markers: OsmMarker[];
  center: LatLng;
  zoom?: number;
  userLocation?: LatLng | null;
  /** false = a still picture: no drag, no zoom, no popups. */
  interactive?: boolean;
  /** Leaflet's +/- buttons. Off for a full-bleed map, where they collide with the app's own chrome. */
  zoomControl?: boolean;
  /**
   * Px to lift Leaflet's bottom controls by. The OSM tile policy requires the attribution stay
   * visible, so anything the app floats over the bottom of the map must be declared here rather
   * than left to cover it.
   */
  bottomInset?: number;
  focus?: MapFocus | null;
  style?: StyleProp<ViewStyle>;
  onSelect?: (id: string) => void;
  /** Popup tapped. */
  onOpen?: (id: string) => void;
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// If the map has not reported `ready` by now, assume the CDN or the tiles are unreachable.
const READY_TIMEOUT_MS = 15000;

function buildHtml(
  center: LatLng,
  zoom: number,
  interactive: boolean,
  background: string,
  zoomControl: boolean,
  bottomInset: number
): string {
  const on = interactive ? "true" : "false";
  const withZoomControl = interactive && zoomControl ? "true" : "false";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${LEAFLET_CSS}" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: ${background}; }
  .leaflet-container { background: ${background}; font-family: -apple-system, Roboto, sans-serif; }
  .pin { width: 100%; height: 100%; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); }
  .cal .meta { color: #6b776e; font-size: 11px; margin-top: 2px; }
  .me { width: 100%; height: 100%; border-radius: 50%; background: #2979ff; border: 2px solid #fff; box-shadow: 0 0 0 6px rgba(41,121,255,.22); }
  .cal { font-size: 13px; line-height: 1.35; min-width: 150px; }
  .cal b { display: block; font-size: 14px; margin-bottom: 2px; }
  .cal .st { font-weight: 600; }
  .cal .hint { color: #6b776e; font-size: 11px; margin-top: 4px; }
  .leaflet-control-attribution { font-size: 9px; }
  /* Lifted clear of whatever the app floats over the bottom of the map -- see bottomInset. */
  .leaflet-bottom { bottom: ${Math.round(bottomInset)}px; }
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
    zoomControl: ${withZoomControl},
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

  var placed = [];

  function icon (m, dx, dy) {
    return L.divIcon({
      className: '',
      html: '<div class="pin" style="background:' + m.color + '"></div>',
      iconSize: [18, 18],
      // Displacement goes through iconAnchor: Leaflet rewrites the element transform on every pan,
      // and moving the latlng instead would put the pin somewhere it is not.
      iconAnchor: [9 - dx, 9 - dy]
    });
  }

  /**
   * Two curbs of one street are ~12 m apart; the map opens at zoom 12, where that is half a pixel.
   * Keep every marker at its true coordinate and separate them on screen instead, with a leader
   * line back to the real point so the displacement is visible rather than silent.
   */
  function declutter () {
    var buckets = {};
    placed.forEach(function (p) {
      var pt = map.latLngToLayerPoint(p.latlng);
      var key = Math.round(pt.x / 20) + ':' + Math.round(pt.y / 20);
      (buckets[key] = buckets[key] || []).push(p);
    });
    Object.keys(buckets).forEach(function (key) {
      var group = buckets[key];
      group.forEach(function (p, i) {
        if (p.leader) { layer.removeLayer(p.leader); p.leader = null; }
        if (group.length < 2) { p.marker.setIcon(icon(p.m, 0, 0)); return; }
        var angle = (2 * Math.PI * i) / group.length;
        var dx = Math.round(Math.cos(angle) * 14), dy = Math.round(Math.sin(angle) * 14);
        p.marker.setIcon(icon(p.m, dx, dy));
        var from = map.latLngToLayerPoint(p.latlng);
        var to = map.layerPointToLatLng(L.point(from.x + dx, from.y + dy));
        p.leader = L.polyline([p.latlng, to], { color: p.m.color, weight: 1, opacity: 0.8, dashArray: '2,3' }).addTo(layer);
      });
    });
  }

  map.on('zoomend', declutter);

  window.__setMarkers = function (list) {
    layer.clearLayers();
    placed = [];
    list.forEach(function (m) {
      // The curb this pin describes, drawn as a segment: a band reads a stretch, not a point.
      if (m.curb && m.curb.length === 2) {
        L.polyline(m.curb, { color: m.color, weight: 6, opacity: 0.55, lineCap: 'round' })
          .addTo(layer)
          .on('click', function () { post({ type: 'select', id: m.id }); });
      }
      var mk = L.marker([m.latitude, m.longitude], { icon: icon(m, 0, 0) }).addTo(layer);
      placed.push({ m: m, marker: mk, latlng: L.latLng(m.latitude, m.longitude), leader: null });
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
        if (m.meta) {
          var mt = document.createElement('div');
          mt.className = 'meta';
          mt.textContent = m.meta;
          el.appendChild(mt);
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
    declutter();
  };

  window.__setUser = function (u) {
    if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
    if (!u) return;
    meMarker = L.marker([u.latitude, u.longitude], {
      icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
    }).addTo(map);
  };

  /**
   * Bring one point into view without throwing away the user's zoom. The offset is applied in
   * projected pixels, so the pin lands above the sheet rather than behind it.
   */
  window.__focus = function (f) {
    if (!f) return;
    var z = Math.max(map.getZoom(), 16);
    var pt = map.project([f.latitude, f.longitude], z).add([0, f.offsetY || 0]);
    map.setView(map.unproject(pt, z), z, { animate: true });
  };

  map.whenReady(function () { post({ type: 'ready' }); });
})();
</script>
</body>
</html>`;
}

export default function OsmMap({
  markers,
  center,
  zoom = 12,
  userLocation = null,
  interactive = true,
  zoomControl = true,
  bottomInset = 0,
  focus = null,
  style,
  onSelect,
  onOpen,
}: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(mapStyles);
  const webRef = useRef<WebView>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const background = theme.color.surfaceMuted;

  // The HTML is built once per attempt. Marker data is pushed in afterwards so that a scan
  // result never remounts the WebView and throws away the user's pan/zoom.
  const html = useMemo(
    () => buildHtml(center, zoom, interactive, background, zoomControl, bottomInset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      center.latitude,
      center.longitude,
      zoom,
      interactive,
      background,
      zoomControl,
      bottomInset,
      attempt,
    ]
  );

  const push = useCallback(() => {
    const js = `window.__setMarkers && window.__setMarkers(${JSON.stringify(markers)});
                window.__setUser && window.__setUser(${JSON.stringify(userLocation)}); true;`;
    webRef.current?.injectJavaScript(js);
  }, [markers, userLocation]);

  useEffect(() => {
    if (status === "ready") push();
  }, [status, push]);

  // Panning is pushed in the same way marker data is: injected into a live map, never a remount.
  useEffect(() => {
    if (status !== "ready" || !focus) return;
    webRef.current?.injectJavaScript(
      `window.__focus && window.__focus(${JSON.stringify(focus)}); true;`
    );
  }, [focus, status]);

  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      setStatus("failed");
      setError("The map did not load in time.");
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, attempt]);

  const retry = useCallback(() => {
    setError(null);
    setStatus("loading");
    setAttempt((prev) => prev + 1);
  }, []);

  const onMessage = useCallback(
    (e: any) => {
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
    },
    [onOpen, onSelect]
  );

  const onFailed = useCallback(() => {
    setStatus("failed");
    setError("The map failed to load.");
  }, []);

  // The guard. A map that cannot draw says so; it never leaves an empty rectangle behind that
  // could be mistaken for "no parking found here".
  if (status === "failed") {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.icon}>◎</Text>
        <Text style={styles.title}>Map unavailable</Text>
        <Text style={styles.body}>{error ?? "The map could not be loaded."}</Text>
        <Text style={styles.body}>Scanning and detection are unaffected.</Text>
        <Button onPress={retry}>
          <ButtonText>Try again</ButtonText>
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        key={attempt}
        ref={webRef}
        source={{ html }}
        originWhitelist={ORIGIN_WHITELIST}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        style={styles.web}
        onMessage={onMessage}
        onError={onFailed}
        onHttpError={onFailed}
      />
      {status === "loading" ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="small" color={theme.color.accent} />
        </View>
      ) : null}
    </View>
  );
}

const ORIGIN_WHITELIST = ["*"];

const mapStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { overflow: "hidden" },
    web: { flex: 1, backgroundColor: "transparent" },
    loading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.color.surfaceMuted,
    },
    fallback: {
      alignItems: "center",
      justifyContent: "center",
      gap: theme.space.sm,
      padding: theme.space.xl,
      backgroundColor: theme.color.surfaceMuted,
    },
    icon: { fontSize: theme.fontSize.title, color: theme.color.textMuted },
    title: { fontSize: theme.fontSize.body, fontWeight: "700", color: theme.color.text },
    body: { fontSize: theme.fontSize.caption, color: theme.color.textMuted, textAlign: "center" },
  });
