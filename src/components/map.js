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
export function pin(label, color, { highlighted = false, small = false, hollow = false } = {}) {
  const size = small ? 14 : highlighted ? 36 : 28;
  return L.divIcon({
    className: `pin${highlighted ? " pin-highlighted" : ""}${small ? " pin-small" : ""}${hollow ? " pin-hollow" : ""}`,
    html: `<span style="--pin-color:${color}">${small ? "" : label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
