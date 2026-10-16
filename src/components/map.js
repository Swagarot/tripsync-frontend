// Shared Leaflet setup for both maps.
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// OpenStreetMap's free tiles. Their usage policy asks for visible attribution
// and fair use (no bulk downloading), which is why tiles are only cached as
// they're viewed (see the service worker config), never prefetched. That's
// also the project scope: no full offline tile prefetch.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Pins drawn with HTML/CSS instead of Leaflet's default marker images, whose
// image paths break when a bundler like Vite renames the files.
export function pin(label, color) {
  return L.divIcon({
    className: "pin",
    html: `<span style="--pin-color:${color}">${label}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
