// Routes (real paths + travel times) for a day's stops, from the backend's
// /routes (OpenRouteService). The free plan allows ~200 routes a day for the
// whole app, so every route is kept on the device (IndexedDB) by its exact
// mode + points: reopening a trip, or opening it offline, costs nothing.
// When there's no route (offline and never loaded, quota used up, no road
// between the stops), callers fall back to straight lines.
import { createStore, get, set } from "idb-keyval";
import { api } from "../api.js";

const idb = createStore("tripsync-routes", "routes");
const memory = new Map();

// The version prefix makes routes stored by older app versions be ignored:
// v1 remembered "no route" for stops far from a road (the backend now searches
// wider); v2 routes lack `snapped` (where each stop meets the road); v3 transit
// routes could contain loops (the backend now picks sensible journeys).
// Transit depends on the date (timetables), so it's part of the key.
// Transit names (lines, stations) come in the user's language, so for transit
// the language is part of the key too.
export function routeKey(mode, points, date = null, lang = "en") {
  const coords = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";");
  return `v4|${mode}|${mode === "transit" ? `${date ?? ""}|${lang}|` : ""}${coords}`;
}

export async function loadRoute(mode, points, date = null, lang = "en") {
  const key = routeKey(mode, points, date, lang);
  if (memory.has(key)) return memory.get(key);
  try {
    const stored = await get(key, idb);
    if (stored) {
      memory.set(key, stored);
      return stored;
    }
  } catch {
    // No IndexedDB: just ask the server.
  }
  let route = null;
  try {
    const extra = mode === "transit" ? { lang, ...(date ? { date } : {}) } : {};
    route = await api("/routes", { method: "POST", body: { mode, points, ...extra } });
  } catch (err) {
    // 422 = no route exists between these stops: remember that too, so we
    // don't spend quota asking again. Anything else: try again next time.
    if (err.status !== 422) return null;
  }
  const value = route ? { ...route, key } : { key, none: true };
  memory.set(key, value);
  set(key, value, idb).catch(() => {});
  return value;
}

// The request for one day: its stops that have coordinates, in order.
export function dayRouteRequest(day, lang = "en") {
  const points = day.stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]);
  if (points.length < 2) return null;
  const mode = day.travel_mode ?? "walk";
  const date = mode === "transit" ? (day.date ?? null) : null;
  return { dayId: day.id, mode, points, date, lang, key: routeKey(mode, points, date, lang) };
}
