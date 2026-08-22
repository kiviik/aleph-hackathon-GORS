"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import styles from "./estaciona.module.css";

type SpotStatus = "free" | "occupied" | "review";

type ParkingSpot = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  status: SpotStatus;
  x: number;
  y: number;
  lat: number;
  lng: number;
  heading: number;
  lastChecked: string;
  confidence: string;
};

const spots: ParkingSpot[] = [
  { id: "A-12", street: "Stephen Avenue SW", number: "100", neighborhood: "Downtown Calgary", status: "free", x: 238, y: 170, lat: 51.0447, lng: -114.0689, heading: 90, lastChecked: "hace 18 s", confidence: "94%" },
  { id: "A-13", street: "Stephen Avenue SW", number: "140", neighborhood: "Downtown Calgary", status: "occupied", x: 282, y: 200, lat: 51.0449, lng: -114.0685, heading: 90, lastChecked: "hace 18 s", confidence: "99%" },
  { id: "B-07", street: "17 Avenue SW", number: "1200", neighborhood: "Beltline", status: "free", x: 355, y: 286, lat: 51.0374, lng: -114.0906, heading: 0, lastChecked: "hace 42 s", confidence: "91%" },
  { id: "C-21", street: "Kensington Road NW", number: "1100", neighborhood: "Kensington", status: "review", x: 492, y: 157, lat: 51.0522, lng: -114.0871, heading: 180, lastChecked: "hace 1 min", confidence: "68%" },
  { id: "D-04", street: "10 Street NW", number: "210", neighborhood: "Kensington", status: "free", x: 582, y: 255, lat: 51.0520, lng: -114.0861, heading: 90, lastChecked: "hace 26 s", confidence: "96%" },
  { id: "D-05", street: "4 Street SW", number: "500", neighborhood: "Downtown Calgary", status: "occupied", x: 615, y: 291, lat: 51.0476, lng: -114.0712, heading: 90, lastChecked: "hace 26 s", confidence: "98%" },
  { id: "E-18", street: "1 Street SE", number: "700", neighborhood: "East Village", status: "free", x: 751, y: 390, lat: 51.0472, lng: -114.0615, heading: 180, lastChecked: "hace 36 s", confidence: "93%" },
  { id: "F-03", street: "17 Avenue SE", number: "900", neighborhood: "Inglewood", status: "free", x: 643, y: 489, lat: 51.0374, lng: -114.0583, heading: 0, lastChecked: "hace 51 s", confidence: "89%" },
];

const statusLabel: Record<SpotStatus, string> = {
  free: "Libre",
  occupied: "Ocupado",
  review: "Por verificar",
};

const statusColor: Record<SpotStatus, string> = {
  free: "#247b52",
  occupied: "#b6543b",
  review: "#ae7c27",
};

function formatToday() {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
}

type GeoPoint = { lat: number; lng: number };

type AskedPlace = { query: string; count: number };
type PlaceMemory = { favoriteIds: string[]; askedPlaces: AskedPlace[] };

const memoryCookie = "ba-estaciona-place-memory";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const item = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function readPlaceMemory(): PlaceMemory {
  try {
    const parsed = JSON.parse(readCookie(memoryCookie)) as Partial<PlaceMemory>;
    return {
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds.filter((id): id is string => typeof id === "string") : [],
      askedPlaces: Array.isArray(parsed.askedPlaces) ? parsed.askedPlaces.filter((place): place is AskedPlace => Boolean(place && typeof place.query === "string" && typeof place.count === "number")) : [],
    };
  } catch {
    return { favoriteIds: [], askedPlaces: [] };
  }
}

function distanceKm(a: GeoPoint, b: GeoPoint) {
  const earthRadius = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

type OpenStreetMapCanvasProps = {
  spots: ParkingSpot[];
  selectedId: string;
  focusPoint: GeoPoint | null;
  currentLocation: GeoPoint | null;
  onSelect: (id: string) => void;
};

function OpenStreetMapCanvas({ spots: visibleSpots, selectedId, focusPoint, currentLocation, onSelect }: OpenStreetMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((module) => {
      if (cancelled || !containerRef.current) return;
      const L = (module.default ?? module) as typeof import("leaflet");
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([51.0447, -114.0719], 12.8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current) return;
    import("leaflet").then((module) => {
      if (!mapRef.current || !layerRef.current) return;
      const L = (module.default ?? module) as typeof import("leaflet");
      const map = mapRef.current;
      const layer = layerRef.current;
      layer.clearLayers();
      visibleSpots.forEach((spot) => {
        const marker = L.circleMarker([spot.lat, spot.lng], {
          radius: selectedId === spot.id ? 11 : 8,
          color: "#fffdf8",
          weight: 3,
          fillColor: statusColor[spot.status],
          fillOpacity: 1,
        });
        marker.bindTooltip(`${spot.street} ${spot.number} · ${statusLabel[spot.status]}`, { direction: "top", offset: [0, -8] });
        marker.on("click", () => onSelectRef.current(spot.id));
        marker.addTo(layer);
      });
      if (currentLocation) {
        L.circleMarker([currentLocation.lat, currentLocation.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2979ff", fillOpacity: 1 }).bindTooltip("Tu ubicación", { direction: "top" }).addTo(layer);
      }
      const center = focusPoint ?? currentLocation;
      if (center) map.setView([center.lat, center.lng], 14, { animate: true });
    });
  }, [currentLocation, focusPoint, ready, selectedId, visibleSpots]);

  return <div ref={containerRef} className={styles.openStreetMap} aria-label="Mapa de OpenStreetMap con espacios de estacionamiento" />;
}

export default function EstacionaPage() {
  const [selectedId, setSelectedId] = useState("A-12");
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationPoint, setDestinationPoint] = useState<GeoPoint | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [placeMemory, setPlaceMemory] = useState<PlaceMemory>({ favoriteIds: [], askedPlaces: [] });

  useEffect(() => {
    if (!readCookie("ba-estaciona-user-id")) {
      const userId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      writeCookie("ba-estaciona-user-id", userId);
    }
    setPlaceMemory(readPlaceMemory());
  }, []);

  const savePlaceMemory = (next: PlaceMemory) => {
    setPlaceMemory(next);
    writeCookie(memoryCookie, JSON.stringify(next));
  };

  const toggleFavorite = () => {
    const favoriteIds = placeMemory.favoriteIds.includes(selectedSpot.id)
      ? placeMemory.favoriteIds.filter((id) => id !== selectedSpot.id)
      : [...placeMemory.favoriteIds, selectedSpot.id].slice(-12);
    savePlaceMemory({ ...placeMemory, favoriteIds });
  };

  const showPlace = (spot: ParkingSpot) => {
    setSelectedId(spot.id);
    setDestination(`${spot.street} ${spot.number}`);
    setQuery("");
    setDestinationPoint({ lat: spot.lat, lng: spot.lng });
    setCurrentLocation(null);
  };
  const openStreetView = () => {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedSpot.lat},${selectedSpot.lng}&heading=${selectedSpot.heading}&pitch=0&fov=90`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const focusPoint = destinationPoint ?? currentLocation;
  const zoneSpots = useMemo(() => {
    if (!focusPoint) return spots;
    return spots.filter((spot) => distanceKm(focusPoint, spot) <= 2.2);
  }, [focusPoint]);
  const visibleSpots = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-AR");
    if (!normalized) return zoneSpots;
    return zoneSpots.filter((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase("es-AR").includes(normalized));
  }, [query, zoneSpots]);
  const selectedSpot = visibleSpots.find((spot) => spot.id === selectedId) ?? visibleSpots[0] ?? spots[0];

  const resolveDestination = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setSearchingDestination(true);
    setLocationMessage("");
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=${encodeURIComponent(`${value}, Calgary, Alberta, Canada`)}`;
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      const results = response.ok ? await response.json() as Array<{ lat: string; lon: string }> : [];
      const result = results[0];
      if (result) {
        setDestinationPoint({ lat: Number(result.lat), lng: Number(result.lon) });
        setCurrentLocation(null);
      } else {
        const normalized = value.toLocaleLowerCase("en-CA");
        const localMatch = spots.find((spot) => `${spot.street} ${spot.number} ${spot.neighborhood}`.toLocaleLowerCase("en-CA").includes(normalized));
        if (!localMatch) throw new Error("not-found");
        setDestinationPoint({ lat: localMatch.lat, lng: localMatch.lng });
        setCurrentLocation(null);
      }
      const normalizedQuery = value.replace(/\s+/g, " ").toLocaleLowerCase("en-CA");
      const askedPlaces = placeMemory.askedPlaces.filter((place) => place.query !== normalizedQuery);
      askedPlaces.push({ query: normalizedQuery, count: (placeMemory.askedPlaces.find((place) => place.query === normalizedQuery)?.count ?? 0) + 1 });
      savePlaceMemory({ ...placeMemory, askedPlaces: askedPlaces.sort((a, b) => b.count - a.count).slice(0, 6) });
    } catch {
      setLocationMessage("No encontramos ese destino. Probá con una calle o barrio de Calgary.");
    } finally {
      setSearchingDestination(false);
    }
  };

  const searchDestination = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await resolveDestination(destination);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Tu navegador no permite acceder a la ubicación.");
      return;
    }
    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude });
        setDestinationPoint(null);
        setDestination("");
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationMessage("No pudimos acceder a tu ubicación. Revisá el permiso del navegador.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const counts = useMemo(() => ({
    free: zoneSpots.filter((spot) => spot.status === "free").length,
    occupied: zoneSpots.filter((spot) => spot.status === "occupied").length,
    review: zoneSpots.filter((spot) => spot.status === "review").length,
  }), [zoneSpots]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true"><span /></div>
          <div>
            <p className={styles.brandName}>BA Estaciona</p>
            <p className={styles.brandSub}>evidencia local para estacionar mejor</p>
          </div>
        </div>
        <div className={styles.topbarActions}>
          <span className={styles.localBadge}><span className={styles.liveDot} /> Inferencia local</span>
          <button className={styles.iconButton} aria-label="Ayuda">?</button>
          <div className={styles.avatar} aria-label="Perfil de Vicky">V</div>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.headingRow}>
          <div>
          <p className={styles.eyebrow}>Mapa en vivo · Calgary</p>
            <h1>Encontrá un lugar para estacionar</h1>
            <p className={styles.intro}>Espacios detectados en calles monitoreadas. Cada punto representa evidencia reciente, no una reserva.</p>
          </div>
          <button className={styles.refreshButton} type="button"><span aria-hidden="true">↻</span> Actualizar mapa</button>
        </div>

        <div className={styles.summaryGrid} aria-label="Resumen de espacios">
          <div className={`${styles.summaryCard} ${styles.summaryFree}`}><span className={styles.summaryIcon}>●</span><div><strong>{counts.free}</strong><span>espacios libres</span></div><small>en zonas monitoreadas</small></div>
          <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.occupiedIcon}`}>●</span><div><strong>{counts.occupied}</strong><span>ocupados</span></div><small>última lectura local</small></div>
          <div className={styles.summaryCard}><span className={`${styles.summaryIcon} ${styles.reviewIcon}`}>●</span><div><strong>{counts.review}</strong><span>por verificar</span></div><small>evidencia ambigua</small></div>
          <div className={styles.summaryDate}><span className={styles.calendarIcon}>▣</span><div><small>HOY</small><strong>{formatToday()}</strong></div></div>
        </div>

        <div className={styles.workspace}>
          <section className={styles.mapCard} aria-label="Mapa de espacios de estacionamiento">
            <div className={styles.mapToolbar}>
              <div className={styles.destinationBar}>
                <form className={styles.destinationSearch} onSubmit={searchDestination}>
                  <span aria-hidden="true">⌖</span>
                  <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="¿A dónde vas? (ej. Beltline)" aria-label="Buscar destino en Calgary" />
                  <button type="submit" disabled={searchingDestination}>{searchingDestination ? "Buscando…" : "Buscar"}</button>
                </form>
                <button className={styles.locationButton} type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Ubicando…" : "Usar mi ubicación"}</button>
              </div>
              <div className={styles.mapToolbarRow}>
                <label className={styles.searchBox}>
                  <span aria-hidden="true">⌕</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar calle o barrio" aria-label="Filtrar calle o barrio" />
                  {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">×</button>}
                </label>
                <div className={styles.mapMode}><span className={styles.modeDot} /> {focusPoint ? `${visibleSpots.length} puntos en la zona` : "Toda la zona monitoreada"}</div>
              </div>
              {locationMessage && <p className={styles.locationMessage} role="status">{locationMessage}</p>}
            </div>

            <div className={styles.mapViewport}>
              <OpenStreetMapCanvas spots={visibleSpots} selectedId={selectedSpot.id} focusPoint={focusPoint} currentLocation={currentLocation} onSelect={setSelectedId} />
              {/* The schematic remains a no-network visual fallback in the source for offline demos. */}
              {false && <svg className={styles.cityMap} viewBox="0 0 1000 650" role="img" aria-label="Mapa esquemático de Calgary con espacios de estacionamiento">
                <defs>
                  <pattern id="blocks" width="92" height="76" patternUnits="userSpaceOnUse">
                    <rect width="92" height="76" fill="#f7f5ef" />
                    <rect x="6" y="6" width="80" height="64" rx="4" fill="#eeebe3" />
                    <path d="M13 17h66M13 32h46M13 48h58" stroke="#e1ddd4" strokeWidth="2" strokeLinecap="round" />
                  </pattern>
                  <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#172018" floodOpacity=".18" /></filter>
                </defs>
                <rect width="1000" height="650" fill="url(#blocks)" />
                <path d="M865-30 C930 80 907 165 955 248 C1017 354 960 460 1010 700 L1000 700 L1000-30Z" fill="#dce9e8" />
                <path d="M873-20 C934 91 918 171 966 255 C1009 333 980 442 1008 618" fill="none" stroke="#b8d5d4" strokeWidth="3" />
                <g className={styles.roads} fill="none" strokeLinecap="round">
                  <path d="M102 0 L270 650" stroke="#fffdf8" strokeWidth="30" /><path d="M102 0 L270 650" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M290 0 L410 650" stroke="#fffdf8" strokeWidth="24" /><path d="M290 0 L410 650" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M520 0 L565 650" stroke="#fffdf8" strokeWidth="28" /><path d="M520 0 L565 650" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M748 0 L740 650" stroke="#fffdf8" strokeWidth="28" /><path d="M748 0 L740 650" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M0 122 L900 180" stroke="#fffdf8" strokeWidth="25" /><path d="M0 122 L900 180" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M0 274 L930 312" stroke="#fffdf8" strokeWidth="25" /><path d="M0 274 L930 312" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M0 424 L930 446" stroke="#fffdf8" strokeWidth="28" /><path d="M0 424 L930 446" stroke="#d9d4ca" strokeWidth="1.5" />
                  <path d="M130 650 L780 0" stroke="#fffdf8" strokeWidth="19" /><path d="M130 650 L780 0" stroke="#d9d4ca" strokeWidth="1.5" />
                </g>
                <g className={styles.mapLabels} aria-hidden="true">
                  <text x="140" y="95">KENSINGTON</text><text x="390" y="95">BELTLINE</text><text x="630" y="145">DOWNTOWN</text><text x="744" y="350">EAST VILLAGE</text><text x="550" y="560">INGLEWOOD</text>
                  <text x="56" y="610" className={styles.riverLabel}>BOW RIVER</text>
                </g>
                {visibleSpots.map((spot) => (
                  <g key={spot.id} className={`${styles.spotMarker} ${selectedId === spot.id ? styles.selectedMarker : ""}`} role="button" tabIndex={0} aria-label={`${spot.street} ${spot.number}: ${statusLabel[spot.status]}`} onClick={() => setSelectedId(spot.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(spot.id); }}>
                    {selectedId === spot.id && <circle cx={spot.x} cy={spot.y} r="25" fill={statusColor[spot.status]} opacity=".16" />}
                    <circle cx={spot.x} cy={spot.y} r="13" fill={statusColor[spot.status]} stroke="#fffdf8" strokeWidth="4" filter="url(#markerShadow)" />
                    <circle cx={spot.x} cy={spot.y} r="4" fill="#fffdf8" />
                  </g>
                ))}
              </svg>}
              <div className={styles.mapLegend}><span><i className={styles.legendFree} /> Libre</span><span><i className={styles.legendOccupied} /> Ocupado</span><span><i className={styles.legendReview} /> Revisar</span></div>
              <div className={styles.mapAttribution}>OpenStreetMap · datos demo locales</div>
            </div>
          </section>

          <aside className={styles.detailRail}>
            <div className={styles.detailHeader}><div><p className={styles.eyebrow}>Punto seleccionado</p><h2>{selectedSpot.street} {selectedSpot.number}</h2></div><span className={`${styles.statusPill} ${styles[`status${selectedSpot.status}`]}`}>{statusLabel[selectedSpot.status]}</span></div>
            <p className={styles.detailNeighborhood}>{selectedSpot.neighborhood} <span>·</span> espacio {selectedSpot.id}</p>
            <div className={`${styles.availabilityPanel} ${styles[`panel${selectedSpot.status}`]}`}><span className={styles.bigStatusDot} /><div><strong>{selectedSpot.status === "free" ? "Podés estacionar acá" : selectedSpot.status === "occupied" ? "Este espacio está ocupado" : "Necesita una nueva lectura"}</strong><span>{selectedSpot.status === "free" ? "La última evidencia lo muestra libre." : selectedSpot.status === "occupied" ? "Se detectó un vehículo en la zona." : "La imagen no alcanza para confirmar disponibilidad."}</span></div></div>
            <dl className={styles.evidenceList}><div><dt>Última lectura</dt><dd>{selectedSpot.lastChecked}</dd></div><div><dt>Acuerdo de detección</dt><dd>{selectedSpot.confidence}</dd></div><div><dt>Fuente</dt><dd><span className={styles.sourceDot} /> QVAC local</dd></div></dl>
            <button className={styles.primaryAction} type="button" onClick={openStreetView}>Ver Street View <span>↗</span></button>
            <p className={styles.apiHint}>El mapa usa OpenStreetMap sin clave. Street View se abre en una pestaña aparte.</p>
            <button className={styles.favoriteButton} type="button" onClick={toggleFavorite}>{placeMemory.favoriteIds.includes(selectedSpot.id) ? "★ Guardado en favoritos" : "☆ Guardar este lugar"}</button>
            <div className={styles.detailNote}><span>i</span><p>La disponibilidad puede cambiar. Esta pantalla muestra evidencia local y no reserva el lugar.</p></div>
            {(placeMemory.favoriteIds.length > 0 || placeMemory.askedPlaces.length > 0) && <div className={styles.memorySection}>
              {placeMemory.favoriteIds.length > 0 && <div><p className={styles.memoryTitle}>Tus favoritos</p><div className={styles.memoryList}>{spots.filter((spot) => placeMemory.favoriteIds.includes(spot.id)).map((spot) => <button key={spot.id} type="button" className={styles.memoryChip} onClick={() => showPlace(spot)}>★ {spot.street} {spot.number}</button>)}</div></div>}
              {placeMemory.askedPlaces.length > 0 && <div><p className={styles.memoryTitle}>Más buscados</p><div className={styles.memoryList}>{placeMemory.askedPlaces.slice(0, 3).map((place) => <button key={place.query} type="button" className={styles.memoryChip} onClick={() => { setDestination(place.query); void resolveDestination(place.query); }}>⌕ {place.query}</button>)}</div></div>}
            </div>}
            <div className={styles.nearbyHeader}><h3>Otros espacios cerca</h3><span>{visibleSpots.length} puntos</span></div>
            <div className={styles.nearbyList}>{visibleSpots.filter((spot) => spot.id !== selectedSpot.id).slice(0, 4).map((spot) => <button className={styles.nearbyItem} type="button" key={spot.id} onClick={() => setSelectedId(spot.id)}><span className={`${styles.nearbyDot} ${styles[`dot${spot.status}`]}`} /><span><strong>{spot.street} {spot.number}</strong><small>{spot.neighborhood} · {statusLabel[spot.status]}</small></span><span className={styles.itemArrow}>›</span></button>)}</div>
          </aside>
        </div>

        <footer className={styles.footer}><span><i className={styles.footerDot} /> Todo corre localmente en este prototipo</span><span>Frames sanitizados · reglas sintéticas · sin reservas</span></footer>
      </section>
    </main>
  );
}
