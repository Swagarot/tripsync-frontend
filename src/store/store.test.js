import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyToList, applyToTrip, op } from "./ops.js";
import { dispatch, flush, getState, init, refreshList, wipe } from "./store.js";

// A fake backend standing in for fetch(). `down` simulates no connection,
// `refuse` makes the server answer one path with an error.
function fakeServer() {
  const server = { down: false, refuse: {}, requests: [] };
  server.fetch = vi.fn(async (url, { method = "GET", body } = {}) => {
    if (server.down) throw new TypeError("Failed to fetch");
    const path = url.replace(/^\/api/, "");
    server.requests.push(`${method} ${path}`);
    const json = (status, data) => ({ status, ok: status < 400, json: async () => data });
    if (server.refuse[path]) return json(server.refuse[path], { error: "refused by server" });
    if (method === "GET" && path === "/trips") return json(200, []);
    if (method === "GET") return json(404, { error: "not found" });
    if (method === "DELETE") return { status: 204, ok: true };
    return json(201, JSON.parse(body ?? "{}"));
  });
  return server;
}

const writes = (server) => server.requests.filter((r) => !r.startsWith("GET"));
const view = () => getState().outbox.reduce(applyToList, getState().baseList ?? []);

let server;
beforeEach(async () => {
  server = fakeServer();
  vi.stubGlobal("fetch", server.fetch);
  await wipe();
  await init("user-1");
});
afterEach(() => vi.unstubAllGlobals());

describe("sync queue", () => {
  it("keeps changes made offline and sends them in order when back online", async () => {
    server.down = true;
    const trip = op.createTrip({ name: "Offline trip" });
    const day = op.createDay(trip.tripId, { title: "Day 1" });
    await dispatch(trip);
    await dispatch(day);
    await flush();

    expect(getState().online).toBe(false);
    expect(getState().outbox).toHaveLength(2);
    expect(view().map((t) => t.name)).toEqual(["Offline trip"]); // visible right away

    server.down = false;
    await flush();
    expect(getState().outbox).toHaveLength(0);
    expect(writes(server)).toEqual([`POST /trips`, `POST /trips/${trip.tripId}/days`]);
  });

  it("drops a change the server refuses, reports it, and carries on", async () => {
    const bad = op.updateTrip("t1", { name: "" });
    server.refuse["/trips/t1"] = 400;
    await dispatch(bad);
    await dispatch(op.createTrip({ name: "Fine" }));
    await flush();

    expect(getState().outbox).toHaveLength(0);
    expect(getState().rejected).toEqual({ message: "refused by server" });
    expect(writes(server)).toHaveLength(2);
  });

  it("keeps the change queued on server errors (5xx) to retry later", async () => {
    server.refuse["/trips"] = 503;
    await dispatch(op.createTrip({ name: "Later" }));
    await flush();
    expect(getState().outbox).toHaveLength(1);
    expect(getState().rejected).toBe(null);
  });

  it("treats deleting something already gone as done", async () => {
    server.refuse["/stops/s1"] = 404;
    await dispatch(op.deleteStop("t1", "s1"));
    await flush();
    expect(getState().outbox).toHaveLength(0);
    expect(getState().rejected).toBe(null);
  });

  it("folds confirmed changes into the stored server copy", async () => {
    const trip = op.createTrip({ name: "Kept" });
    server.refuse[`/trips/${trip.tripId}`] = 500; // the refresh after sync fails
    await dispatch(trip);
    await flush();
    expect(getState().baseTrips[trip.tripId]).toEqual(applyToTrip(null, trip));
  });
});

describe("changes made during a sync", () => {
  it("are sent in the same run, not left for the 30 s retry", async () => {
    let sneakIn = true;
    const realFetch = server.fetch.getMockImplementation();
    server.fetch.mockImplementation(async (url, opts) => {
      // While the first sync refreshes the list, the user makes another change.
      if (sneakIn && url === "/api/trips" && opts?.method === "GET") {
        sneakIn = false;
        dispatch(op.createTrip({ name: "Second" }));
      }
      return realFetch(url, opts);
    });
    await dispatch(op.createTrip({ name: "First" }));
    await flush();
    expect(getState().outbox).toHaveLength(0);
    expect(writes(server)).toEqual(["POST /trips", "POST /trips"]);
  });
});

describe("storage on the device", () => {
  it("survives a restart for the same user", async () => {
    server.down = true;
    await dispatch(op.createTrip({ name: "Unsynced" }));
    await flush();
    await init("user-1"); // like reopening the app
    expect(getState().outbox).toHaveLength(1);
  });

  it("is wiped when a different user logs in on the same device", async () => {
    server.down = true;
    await dispatch(op.createTrip({ name: "Private" }));
    await flush();
    await init("user-2");
    expect(getState().outbox).toHaveLength(0);
    expect(getState().baseList).toBe(null);
  });
});

describe("start-up order", () => {
  it("keeps a server answer that arrives before the stored copy has loaded", async () => {
    await wipe();
    server.fetch.mockImplementationOnce(async () => ({ status: 200, ok: true, json: async () => [{ id: "t1", name: "Fresh" }] }));
    const refreshing = refreshList(); // starts before init(), like a page mounting early
    await init("user-1");
    await refreshing;
    expect(getState().baseList).toEqual([{ id: "t1", name: "Fresh" }]);
  });
});
