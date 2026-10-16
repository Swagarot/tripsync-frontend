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

export function routeKey(mode, points) {
  return `${mode}|${points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(";")}`;
}

export async function loadRoute(mode, points) {
  const key = routeKey(mode, points);
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
    route = await api("/routes", { method: "POST", body: { mode, points } });
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
export function dayRouteRequest(day) {
  const points = day.stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]);
  if (points.length < 2) return null;
  const mode = day.travel_mode ?? "walk";
  return { dayId: day.id, mode, points, key: routeKey(mode, points) };
}
