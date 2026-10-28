// Getting a trip out of the app: a Google Maps link per day, and the pieces
// shared by the printable page (PDF) and the keepsake file.
import { dayPoints } from "./stays.js";

// Google Maps' documented "Maps URLs" (no API key, opens the app on phones):
// https://developers.google.com/maps/documentation/urls/get-started
// One day = origin, destination, and the places in between as waypoints.
// Google takes at most 9 waypoints, so a longer day is cut there (the link
// says so via `truncated`).
const GOOGLE_MODES = { walk: "walking", bike: "bicycling", drive: "driving", transit: "transit" };
const MAX_WAYPOINTS = 9;

export function googleMapsDayUrl(day, lodgings = []) {
  const points = dayPoints(day, lodgings);
  if (points.length === 0) return null;
  const at = (p) => `${p.lat},${p.lng}`;
  if (points.length === 1) {
    return { url: `https://www.google.com/maps/search/?api=1&query=${at(points[0])}`, truncated: false };
  }
  const middle = points.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: at(points[0]),
    destination: at(points.at(-1)),
    travelmode: GOOGLE_MODES[day.travel_mode ?? "walk"],
  });
  if (middle.length) params.set("waypoints", middle.slice(0, MAX_WAYPOINTS).map(at).join("|"));
  return { url: `https://www.google.com/maps/dir/?${params}`, truncated: middle.length > MAX_WAYPOINTS };
}

// A small map of the trip drawn as SVG, without map tiles: the keepsake file
// must work offline forever and can't depend on a tile server. Points are
// projected with Web Mercator (the projection web maps use), then scaled to
// fit the box. Returns lines (one per day), numbered pins and the stays, in
// box pixels.
export function sketchMap(days, lodgings, lineFor, { width = 640, height = 360, pad = 24 } = {}) {
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const lines = days.map((day) => {
    const geometry = lineFor?.(day);
    const pts = geometry?.length ? geometry : dayPoints(day, lodgings).map((p) => [p.lat, p.lng]);
    return pts.map(([lat, lng]) => [lng, mercY(lat)]);
  });
  const pins = days.map((day) => day.stops.filter((s) => s.lat != null).map((s) => [s.lng, mercY(s.lat)]));
  const stays = (lodgings ?? []).filter((s) => s.lat != null).map((s) => [s.lng, mercY(s.lat)]);
  const all = [...lines.flat(), ...pins.flat(), ...stays];
  if (all.length === 0) return null;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Same scale on both axes (no squashing); a single point gets a tiny box.
  const spanX = Math.max(maxX - minX, 0.002);
  const spanY = Math.max(maxY - minY, 0.002 * (Math.PI / 180));
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / (spanY * (180 / Math.PI)));
  const toBox = ([x, y]) => [
    round(width / 2 + (x - (minX + maxX) / 2) * scale),
    round(height / 2 - (y - (minY + maxY) / 2) * (180 / Math.PI) * scale),
  ];
  return {
    width,
    height,
    lines: lines.map((l) => l.map(toBox)),
    pins: pins.map((p) => p.map(toBox)),
    stays: stays.map(toBox),
  };
}

const round = (n) => Math.round(n * 10) / 10;

// A safe file name from the trip's name: "Trip to Tokyo.html".
export function keepsakeFileName(name) {
  const clean = (name || "Trip").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${clean || "Trip"}.html`;
}
