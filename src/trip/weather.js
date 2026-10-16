// Weather for the trip's days: fetch the forecast (backend /weather ->
// Open-Meteo), and turn it into warnings ("Thunderstorms - 2 outdoor stops").
// Forecasts only reach ~16 days ahead; later days simply have none yet.
import { createStore, get, set } from "idb-keyval";
import { api } from "../api.js";
import { centerOf } from "../geo.js";

// --- Reading a forecast day ------------------------------------------------------

// WMO weather codes, as Open-Meteo reports them.
export function describe(code) {
  if (code == null) return { icon: "·", text: "No forecast" };
  if (code === 0) return { icon: "☀️", text: "Clear" };
  if (code <= 2) return { icon: "🌤️", text: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", text: "Overcast" };
  if (code <= 48) return { icon: "🌫️", text: "Fog" };
  if (code <= 67 || (code >= 80 && code <= 82)) return { icon: "🌧️", text: "Rain" };
  if (code <= 77 || code === 85 || code === 86) return { icon: "❄️", text: "Snow" };
  return { icon: "⛈️", text: "Thunderstorms" };
}

// Places where bad weather actually spoils the visit.
const OUTDOOR = /park|garden|beach|viewpoint|peak|zoo|theme|attraction|hik|nature|camp|picnic|island|waterfall|monument|castle|ruins|square|market|trail|lake|mountain|forest|bridge/i;

export function isOutdoor(stop) {
  return OUTDOOR.test(stop.category ?? "");
}

// Rules for "is this day worth a warning?". `level` "warn" is shown in red-ish
// on the day; "info" just as a note.
export function warningsFor(forecast) {
  if (!forecast) return [];
  const w = [];
  const code = forecast.weather_code;
  const rainChance = forecast.precipitation_probability_max ?? 0;
  const rainMm = forecast.precipitation_sum ?? 0;
  if (code >= 95) w.push({ level: "warn", text: "Thunderstorms forecast" });
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) w.push({ level: "warn", text: "Snow forecast" });
  else if (rainChance >= 70 && rainMm >= 5) w.push({ level: "warn", text: `Heavy rain likely (${Math.round(rainMm)} mm)` });
  else if (rainChance >= 60) w.push({ level: "info", text: `Rain likely (${rainChance}%)` });
  if ((forecast.temperature_2m_max ?? 0) >= 35) w.push({ level: "warn", text: `Very hot (${Math.round(forecast.temperature_2m_max)}°)` });
  if ((forecast.temperature_2m_min ?? 0) <= -5) w.push({ level: "warn", text: `Very cold (${Math.round(forecast.temperature_2m_min)}°)` });
  if ((forecast.wind_speed_10m_max ?? 0) >= 50) w.push({ level: "warn", text: `Strong wind (${Math.round(forecast.wind_speed_10m_max)} km/h)` });
  return w;
}

// Everything the day header and the Weather tab show for one day.
export function dayWeather(day, forecast) {
  const warnings = warningsFor(forecast);
  const bad = warnings.some((w) => w.level === "warn");
  const outdoor = bad ? day.stops.filter(isOutdoor) : [];
  return { forecast, warnings, outdoor };
}

// --- Fetching ----------------------------------------------------------------------

// Last forecasts are kept on the device, so they still show offline.
const idb = createStore("tripsync-weather", "forecasts");
const MAX_AGE = 3 * 3600 * 1000;

// Where a day happens: the middle of its stops, else the trip's destination.
export function dayLocation(day, trip) {
  const pinned = day.stops.filter((s) => s.lat != null);
  const c = centerOf(pinned);
  if (c) return c;
  return trip.dest_lat != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null;
}

// One request per ~10 km cell, like the backend's cache.
export const cellKey = ({ lat, lng }) => `${lat.toFixed(1)},${lng.toFixed(1)}`;

export async function loadForecast(location) {
  const key = cellKey(location);
  let stored = null;
  try {
    stored = await get(key, idb);
  } catch {
    // no IndexedDB
  }
  if (stored && Date.now() - stored.at < MAX_AGE) return stored.days;
  try {
    const res = await api(`/weather?lat=${location.lat.toFixed(2)}&lng=${location.lng.toFixed(2)}`);
    set(key, { at: Date.now(), days: res.days }, idb).catch(() => {});
    return res.days;
  } catch {
    return stored?.days ?? null; // offline: an older forecast beats none
  }
}
