import { CircleMarker, MapContainer, Polyline, TileLayer } from "react-leaflet";
import { TILE_URL } from "./map.js";

// A small, non-interactive map for a trip card: the trip's places as dots,
// joined in visiting order. Falls back to the destination, else nothing.
export default function MiniMap({ points, destination }) {
  const interaction = {
    zoomControl: false,
    attributionControl: false, // the card is tiny; the full map shows it
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
  };
  const view =
    points.length > 1
      ? { bounds: points, boundsOptions: { padding: [16, 16], maxZoom: 13 } }
      : points.length === 1
        ? { center: points[0], zoom: 12 }
        : { center: [destination.lat, destination.lng], zoom: Math.max(2, (destination.zoom ?? 10) - 1) };

  return (
    <MapContainer className="mini-map" {...view} {...interaction}>
      <TileLayer url={TILE_URL} />
      {points.length > 1 && <Polyline positions={points} pathOptions={{ color: "#0f6e6a", weight: 2, opacity: 0.7 }} />}
      {points.map((p, i) => (
        <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#0f6e6a", fillOpacity: 1 }} />
      ))}
    </MapContainer>
  );
}
