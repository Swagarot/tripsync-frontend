import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { ATTRIBUTION, pin, TILE_URL } from "./map.js";

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      // 5 decimals is about 1 m, more precise than anyone can tap.
      onPick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)));
    },
  });
  return null;
}

// Tap the map to set a stop's coordinates (replaces the Places API, which is
// out of scope). Starts at the current pin, else near the trip's other stops,
// else a world view.
export default function MapPicker({ value, near, onPick }) {
  const center = value ?? (near ? [near.lat, near.lng] : [30, 10]);
  const zoom = value || near ? 14 : 2;

  return (
    <MapContainer center={center} zoom={zoom} className="map map-picker">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <ClickHandler onPick={onPick} />
      {value && <Marker position={value} icon={pin("•", "var(--accent)")} />}
    </MapContainer>
  );
}
