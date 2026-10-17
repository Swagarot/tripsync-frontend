// Shared Leaflet setup for both maps.
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Phones: after a pinch, Leaflet animates the zoom to a whole level (~250 ms,
// longer while the vector map redraws) and ignores any drag that starts
// meanwhile (Draggable._onDown returns while the pane has "leaflet-zoom-anim"),
// so the first swipe after zooming did nothing. When a new touch starts during
// that animation, finish it at once so the drag goes through. Capture phase:
// runs before Leaflet's own listener. _onZoomTransitionEnd is internal to
// Leaflet 1.9 (pinned in package.json); it is what the animation's own end
// calls, so finishing early just skips the rest of the transition.
L.Map.addInitHook(function () {
  const finishZoom = (e) => {
    if (e.isPrimary !== false && this._animatingZoom) this._onZoomTransitionEnd();
  };
  this.getContainer().addEventListener("pointerdown", finishZoom, true);
  this.getContainer().addEventListener("touchstart", finishZoom, { capture: true, passive: true });
});

// OpenStreetMap's free tiles. Their usage policy asks for visible attribution
// and fair use (no bulk downloading), which is why tiles are only cached as
// they're viewed (see the service worker config), never prefetched. That's
// also the project scope: no full offline tile prefetch.
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Pins drawn with HTML/CSS instead of Leaflet's default marker images, whose
// image paths break when a bundler like Vite renames the files.
// Icons are cached: react-leaflet replaces a marker's icon whenever it gets a
// different icon object, so creating new ones on every render made Leaflet
// redraw every pin each time you hovered a stop. Same look = same object.
const icons = new Map();

export function pin(label, color, { highlighted = false, small = false, hollow = false } = {}) {
  const key = `${label}|${color}|${highlighted}|${small}|${hollow}`;
  if (!icons.has(key)) icons.set(key, makePin(label, color, { highlighted, small, hollow }));
  return icons.get(key);
}

function makePin(label, color, { highlighted, small, hollow }) {
  const size = small ? 14 : highlighted ? 36 : 28;
  return L.divIcon({
    className: `pin${highlighted ? " pin-highlighted" : ""}${small ? " pin-small" : ""}${hollow ? " pin-hollow" : ""}`,
    html: `<span style="--pin-color:${color}">${small ? "" : label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
