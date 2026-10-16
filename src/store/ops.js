// Offline-first editing, part 1: "ops".
//
// Every change the user makes is described as a small plain object, an op,
// e.g. { type: "createStop", tripId, dayId, stop: {...} }. An op can be:
//   1. applied to the local copy of the data right away (applyToTrip /
//      applyToList below), so the screen updates instantly, online or not;
//   2. turned into the matching API request (toRequest) and sent later by the
//      sync loop (sync.js), when there is a connection.
//
// These functions are pure: no network, no storage, they return new objects
// and never modify their inputs. That makes them easy to test (ops.test.js).
//
// Every apply is idempotent: applying the same op twice gives the same result
// as applying it once. That matters because the screen shows
// "last server copy + ops not yet confirmed", and an op can already be on the
// server while it's still in our queue (e.g. the response got lost).

// --- Building ops (called from the UI) ---------------------------------------

// IDs are made on the device (see the backend's models.py). The server accepts
// them, so a trip created offline already has its final ID and its days can
// point at it before the server has ever seen it.
export function newId() {
  // crypto.randomUUID only exists on HTTPS (and localhost). Over plain http,
  // e.g. the cluster's Tailscale address, build the same random (version 4)
  // UUID from crypto.getRandomValues, which works everywhere.
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const op = {
  createTrip: (fields) => ({ type: "createTrip", tripId: newId(), fields }),
  updateTrip: (tripId, fields) => ({ type: "updateTrip", tripId, fields }),
  deleteTrip: (tripId) => ({ type: "deleteTrip", tripId }),
  createDay: (tripId, fields) => ({ type: "createDay", tripId, dayId: newId(), fields }),
  updateDay: (tripId, dayId, fields) => ({ type: "updateDay", tripId, dayId, fields }),
  deleteDay: (tripId, dayId) => ({ type: "deleteDay", tripId, dayId }),
  reorderDays: (tripId, ids) => ({ type: "reorderDays", tripId, ids }),
  createStop: (tripId, dayId, fields) => ({ type: "createStop", tripId, dayId, stopId: newId(), fields }),
  updateStop: (tripId, stopId, fields) => ({ type: "updateStop", tripId, stopId, fields }),
  moveStop: (tripId, stopId, toDayId) => ({ type: "moveStop", tripId, stopId, toDayId }),
  deleteStop: (tripId, stopId) => ({ type: "deleteStop", tripId, stopId }),
  reorderStops: (tripId, dayId, ids) => ({ type: "reorderStops", tripId, dayId, ids }),
  // Ideas, expenses, checklist: the side panel's lists. `kind` is the list
  // name, the same word the API uses (/trips/<id>/ideas, /expenses/<id>...).
  createItem: (kind, tripId, fields) => ({ type: "createItem", kind, tripId, itemId: newId(), fields }),
  updateItem: (kind, tripId, itemId, fields) => ({ type: "updateItem", kind, tripId, itemId, fields }),
  deleteItem: (kind, tripId, itemId) => ({ type: "deleteItem", kind, tripId, itemId }),
};

export const ITEM_KINDS = ["ideas", "expenses", "checklist", "lodgings"];

// --- The API request for an op ------------------------------------------------

export function toRequest(o) {
  switch (o.type) {
    case "createTrip":
      return { method: "POST", path: "/trips", body: { id: o.tripId, ...o.fields } };
    case "updateTrip":
      return { method: "PATCH", path: `/trips/${o.tripId}`, body: o.fields };
    case "deleteTrip":
      return { method: "DELETE", path: `/trips/${o.tripId}` };
    case "createDay":
      return { method: "POST", path: `/trips/${o.tripId}/days`, body: { id: o.dayId, ...o.fields } };
    case "updateDay":
      return { method: "PATCH", path: `/days/${o.dayId}`, body: o.fields };
    case "deleteDay":
      return { method: "DELETE", path: `/days/${o.dayId}` };
    case "reorderDays":
      return { method: "PUT", path: `/trips/${o.tripId}/days/order`, body: { ids: o.ids } };
    case "createStop":
      return { method: "POST", path: `/days/${o.dayId}/stops`, body: { id: o.stopId, ...o.fields } };
    case "updateStop":
      return { method: "PATCH", path: `/stops/${o.stopId}`, body: o.fields };
    case "moveStop":
      return { method: "PATCH", path: `/stops/${o.stopId}`, body: { day_id: o.toDayId } };
    case "deleteStop":
      return { method: "DELETE", path: `/stops/${o.stopId}` };
    case "reorderStops":
      return { method: "PUT", path: `/days/${o.dayId}/stops/order`, body: { ids: o.ids } };
    case "createItem":
      return { method: "POST", path: `/trips/${o.tripId}/${o.kind}`, body: { id: o.itemId, ...o.fields } };
    case "updateItem":
      return { method: "PATCH", path: `/${o.kind}/${o.itemId}`, body: o.fields };
    case "deleteItem":
      return { method: "DELETE", path: `/${o.kind}/${o.itemId}` };
    default:
      throw new Error(`unknown op ${o.type}`);
  }
}

// --- Applying an op to the trip list (GET /trips shape) ------------------------

export function applyToList(trips, o) {
  switch (o.type) {
    case "createTrip":
      if (trips.some((t) => t.id === o.tripId)) return trips;
      // Newest first, like the server's order.
      return [{ id: o.tripId, start_date: null, end_date: null, notes: null, ...o.fields }, ...trips];
    case "updateTrip":
      return trips.map((t) => (t.id === o.tripId ? { ...t, ...o.fields } : t));
    case "deleteTrip":
      return trips.filter((t) => t.id !== o.tripId);
    default:
      return trips; // day/stop ops don't change the list
  }
}

// --- Applying an op to one full trip (GET /trips/<id> shape) -------------------

// Positions are always 0..n-1 in array order, the same numbers the server
// would assign (it appends at max+1 and reorder rewrites them).
const renumber = (items) => items.map((item, position) => (item.position === position ? item : { ...item, position }));

const mapDays = (trip, fn) => ({ ...trip, days: trip.days.map(fn) });

function reorderBy(items, ids) {
  // Ignore a reorder that no longer matches the items (e.g. one was deleted
  // since); the server rejects it too, and the next refresh shows its order.
  if (ids.length !== items.length || !items.every((item) => ids.includes(item.id))) return items;
  return renumber(ids.map((id) => items.find((item) => item.id === id)));
}

function newStop(o) {
  return {
    id: o.stopId,
    day_id: o.dayId,
    lat: null,
    lng: null,
    address: null,
    time: null,
    notes: null,
    osm_ref: null,
    category: null,
    photo_url: null,
    website: null,
    opening_hours: null,
    rating: null,
    visited: false,
    cover_photo_id: null,
    photos: [],
    ...o.fields,
  };
}

export function applyToTrip(trip, o) {
  if (o.type === "createTrip") {
    if (trip) return trip;
    return {
      id: o.tripId,
      start_date: null,
      end_date: null,
      notes: null,
      ...o.fields,
      days: [],
      ideas: [],
      expenses: [],
      checklist: [],
      lodgings: [],
    };
  }
  if (!trip || trip.id !== o.tripId) return trip;

  switch (o.type) {
    case "updateTrip":
      return { ...trip, ...o.fields };
    case "deleteTrip":
      return null;

    case "createDay":
      if (trip.days.some((d) => d.id === o.dayId)) return trip;
      return {
        ...trip,
        days: renumber([...trip.days, { id: o.dayId, trip_id: trip.id, date: null, title: null, notes: null, travel_mode: null, ...o.fields, stops: [] }]),
      };
    case "updateDay":
      return mapDays(trip, (d) => (d.id === o.dayId ? { ...d, ...o.fields } : d));
    case "deleteDay":
      return { ...trip, days: renumber(trip.days.filter((d) => d.id !== o.dayId)) };
    case "reorderDays":
      return { ...trip, days: reorderBy(trip.days, o.ids) };

    case "createStop":
      if (trip.days.some((d) => d.stops.some((s) => s.id === o.stopId))) return trip;
      return mapDays(trip, (d) => (d.id === o.dayId ? { ...d, stops: renumber([...d.stops, newStop(o)]) } : d));
    case "updateStop":
      return mapDays(trip, (d) => ({ ...d, stops: d.stops.map((s) => (s.id === o.stopId ? { ...s, ...o.fields } : s)) }));
    case "deleteStop":
      return mapDays(trip, (d) => ({ ...d, stops: renumber(d.stops.filter((s) => s.id !== o.stopId)) }));
    case "reorderStops":
      return mapDays(trip, (d) => (d.id === o.dayId ? { ...d, stops: reorderBy(d.stops, o.ids) } : d));
    case "createItem": {
      const list = trip[o.kind] ?? [];
      if (list.some((x) => x.id === o.itemId)) return trip;
      const item = { id: o.itemId, trip_id: trip.id, ...o.fields };
      if (o.kind === "checklist") Object.assign(item, { done: false, position: list.length }, o.fields);
      return { ...trip, [o.kind]: [...list, item] };
    }
    case "updateItem":
      return { ...trip, [o.kind]: (trip[o.kind] ?? []).map((x) => (x.id === o.itemId ? { ...x, ...o.fields } : x)) };
    case "deleteItem":
      return { ...trip, [o.kind]: (trip[o.kind] ?? []).filter((x) => x.id !== o.itemId) };
    case "moveStop": {
      const stop = trip.days.flatMap((d) => d.stops).find((s) => s.id === o.stopId);
      if (!stop || stop.day_id === o.toDayId || !trip.days.some((d) => d.id === o.toDayId)) return trip;
      return mapDays(trip, (d) => {
        if (d.id === stop.day_id) return { ...d, stops: renumber(d.stops.filter((s) => s.id !== o.stopId)) };
        if (d.id === o.toDayId) return { ...d, stops: renumber([...d.stops, { ...stop, day_id: o.toDayId }]) };
        return d;
      });
    }
    default:
      return trip;
  }
}
