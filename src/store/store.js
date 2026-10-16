// Offline-first editing, part 2: the local store and the sync loop.
//
// What's kept, in memory and in IndexedDB (the browser's on-device database,
// so it survives closing the app and works with no network):
//   baseList   the last trip list the server sent (GET /trips)
//   baseTrips  the last copy of each opened trip (GET /trips/<id>)
//   outbox     ops (see ops.js) the server hasn't confirmed yet, oldest first
//
// What the screen shows is always: base + every op in the outbox, applied in
// order (see hooks.js). So a change appears instantly, survives a reload while
// offline, and when the server copy is refreshed the pending ops are simply
// re-applied on top of it.
//
// The sync loop (flush) sends the outbox one op at a time, in order, so a day
// is never sent before the trip it belongs to.
import { clear, createStore, entries, set } from "idb-keyval";
import { api } from "../api.js";
import { applyToList, applyToTrip, newId, toRequest } from "./ops.js";

const idb = createStore("tripsync", "store");

const initialState = {
  ready: false, // finished loading from IndexedDB
  owner: null, // user ID the stored data belongs to
  baseList: null, // null = never fetched
  baseTrips: {}, // tripId -> trip, or null = the server says it doesn't exist
  outbox: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  rejected: null, // the last change the server refused: { message }
};

let state = initialState;
const listeners = new Set();

// Resolves once init() has loaded the stored copy. Reads and writes wait for
// it: otherwise a fast server answer could land first and then be overwritten
// by init() with the (older, or empty) stored copy.
let markReady;
let loaded = new Promise((resolve) => (markReady = resolve));

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

// For React's useSyncExternalStore (hooks.js): subscribe + current snapshot.
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getState = () => state;

// IndexedDB can be unavailable (some private modes) or full. The app then
// still works from memory while it's open; it just won't survive a reload.
async function persist(key, value) {
  try {
    await set(key, value, idb);
  } catch (err) {
    console.warn("Could not save offline copy", err);
  }
}

// --- Start / stop -------------------------------------------------------------

export async function init(userId) {
  if (state.ready) {
    // Switching user without a reload: wait for this init again.
    loaded = new Promise((resolve) => (markReady = resolve));
    setState({ ready: false });
  }
  let stored = [];
  try {
    stored = await entries(idb);
  } catch (err) {
    console.warn("Offline storage unavailable", err);
  }
  const data = Object.fromEntries(stored);

  if (data.owner && data.owner !== userId) {
    // Someone else used this browser before: never show their trips.
    await clear(idb).catch(() => {});
    data.owner = undefined;
  }

  const baseTrips = {};
  for (const [key, value] of stored) {
    if (key.startsWith("trip:") && data.owner) baseTrips[key.slice(5)] = value;
  }
  setState({
    ...initialState,
    online: state.online,
    ready: true,
    owner: userId,
    baseList: data.owner ? (data.list ?? null) : null,
    baseTrips,
    outbox: data.owner ? (data.outbox ?? []) : [],
  });
  await persist("owner", userId);
  markReady();
  flush();
}

// Explicit logout: wipe this device's copy, so the next person using the
// browser can't read it. (An expired token does NOT wipe it: unsynced changes
// are kept and sent after the same user logs in again.)
export async function wipe() {
  setState({ ...initialState, online: state.online });
  loaded = new Promise((resolve) => (markReady = resolve));
  await clear(idb).catch(() => {});
}

// --- Reading from the server ---------------------------------------------------

// A failed refresh is never fatal: the stored copy stays on screen. No
// connection flips the app to offline mode; anything else is just logged.
function refreshFailed(err) {
  if (err.status === 0) setState({ online: false });
  else console.warn("Refresh failed, showing the stored copy", err);
}

export async function refreshList() {
  await loaded;
  try {
    const list = await api("/trips");
    setState({ baseList: list, online: true });
    await persist("list", list);
  } catch (err) {
    refreshFailed(err);
  }
}

export async function refreshTrip(tripId) {
  await loaded;
  let trip;
  try {
    trip = await api(`/trips/${tripId}`);
  } catch (err) {
    if (err.status !== 404) return refreshFailed(err);
    trip = null; // deleted (maybe on another device), or never synced yet
  }
  setState({ baseTrips: { ...state.baseTrips, [tripId]: trip }, online: true });
  await persist(`trip:${tripId}`, trip);
}

// --- Writing: queue an op, then try to send it ---------------------------------

export async function dispatch(o) {
  await loaded;
  // opId: identifies this queue entry, so exactly it gets removed once sent.
  const outbox = [...state.outbox, { ...o, opId: newId() }];
  setState({ outbox, rejected: null });
  await persist("outbox", outbox);
  flush();
}

// The server has answered for the oldest op: take it out of the outbox. If it
// was accepted, fold it into the base copies, so the screen doesn't flicker
// back to the old value until the next refresh.
async function settle(o, accepted) {
  const outbox = state.outbox.filter((x) => x.opId !== o.opId);
  const patch = { outbox };
  if (accepted) {
    if (state.baseList) patch.baseList = applyToList(state.baseList, o);
    const base = state.baseTrips[o.tripId];
    if (base !== undefined || o.type === "createTrip") {
      patch.baseTrips = { ...state.baseTrips, [o.tripId]: applyToTrip(base ?? null, o) };
    }
  }
  setState(patch);
  await persist("outbox", outbox);
  if (patch.baseList) await persist("list", patch.baseList);
  if (patch.baseTrips) await persist(`trip:${o.tripId}`, patch.baseTrips[o.tripId]);
}

let running = null;
let again = false;

// Only one flush runs at a time. A change made while one is running (for
// example during its final refresh) sets `again`, so the loop goes round once
// more instead of leaving that change for the 30-second retry.
export function flush() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await sendAll();
    } while (again && state.online && state.outbox.length > 0);
  })().finally(() => (running = null));
  return running;
}

async function sendAll() {
  if (!state.ready || state.outbox.length === 0) return;
  setState({ syncing: true });
  const touched = new Set();
  try {
    while (state.outbox.length > 0) {
      const o = state.outbox[0];
      const req = toRequest(o);
      try {
        await api(req.path, { method: req.method, body: req.body });
        setState({ online: true });
        await settle(o, true);
      } catch (err) {
        // Worth retrying later, keep it queued and stop here:
        // 0 = no connection, 5xx = server trouble, 429 = rate limited,
        // 401 = logged out (sent after the next login).
        if (err.status === 0 || err.status >= 500 || err.status === 429 || err.status === 401) {
          if (err.status === 0) setState({ online: false });
          return;
        }
        // Deleting something that's already gone is the result we wanted.
        if (err.status === 404 && req.method === "DELETE") {
          await settle(o, true);
        } else {
          // The server refused it for good (validation, conflict, or the parent
          // was deleted). Drop it so the queue can't get stuck, tell the user,
          // and let the refresh below show what the server really has.
          setState({ rejected: { message: err.message } });
          await settle(o, false);
        }
      }
      touched.add(o.tripId);
    }
  } finally {
    setState({ syncing: false });
  }
  // Everything is sent: pick up server-side details (timestamps, and anything
  // changed from another device).
  await refreshList();
  await Promise.all([...touched].filter((id) => state.baseTrips[id] !== undefined).map(refreshTrip));
}

export function dismissRejected() {
  setState({ rejected: null });
}

// --- Retry triggers --------------------------------------------------------------

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setState({ online: true });
    flush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  // Belt and braces: navigator.onLine can say "online" on a network that
  // doesn't actually reach the server, so also retry every 30 seconds.
  setInterval(() => {
    if (state.outbox.length > 0) flush();
  }, 30_000);
}
