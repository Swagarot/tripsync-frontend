import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayRouteRequest, loadRoute, routeKey } from "./routes.js";

const ROUTE = { geometry: [[1, 2], [3, 4]], legs: [{ distance_m: 900, duration_s: 600 }], distance_m: 900, duration_s: 600 };
let calls;

function answer(status, data) {
  calls = 0;
  vi.stubGlobal("fetch", vi.fn(async () => {
    calls += 1;
    return { status, ok: status < 400, json: async () => data };
  }));
}

// Each test uses its own points, because loaded routes are remembered
// (that's the point of the module).
let n = 0;
const fresh = () => [[38 + ++n / 100, -9], [38.5, -9.1]];

beforeEach(() => answer(200, ROUTE));
afterEach(() => vi.unstubAllGlobals());

describe("loadRoute (protects the ~200/day routing quota)", () => {
  it("asks the server once, then answers from the device", async () => {
    const points = fresh();
    expect(await loadRoute("walk", points)).toMatchObject({ legs: ROUTE.legs });
    expect(await loadRoute("walk", points)).toMatchObject({ legs: ROUTE.legs });
    expect(calls).toBe(1);
  });

  it("remembers 'no route between these stops' (422) too", async () => {
    answer(422, { error: "No route found" });
    const points = fresh();
    expect(await loadRoute("walk", points)).toMatchObject({ none: true });
    await loadRoute("walk", points);
    expect(calls).toBe(1);
  });

  it("doesn't remember temporary failures (quota, server down)", async () => {
    answer(503, { error: "Daily routing limit reached" });
    const points = fresh();
    expect(await loadRoute("walk", points)).toBe(null);
    await loadRoute("walk", points);
    expect(calls).toBe(2);
  });

  it("treats another travel mode as another route", async () => {
    const points = fresh();
    await loadRoute("walk", points);
    await loadRoute("drive", points);
    expect(calls).toBe(2);
  });
});

describe("route keys", () => {
  it("include the date only for transit (timetables depend on it)", () => {
    const pts = [[1, 2], [3, 4]];
    expect(routeKey("transit", pts, "2026-10-17")).not.toBe(routeKey("transit", pts, "2026-10-18"));
    expect(routeKey("drive", pts, "2026-10-17")).toBe(routeKey("drive", pts, "2026-10-18"));
  });
});

describe("dayRouteRequest", () => {
  it("uses only stops with coordinates, and needs at least two", () => {
    const day = {
      id: "d1",
      travel_mode: null,
      stops: [{ lat: 1, lng: 2 }, { lat: null, lng: null }, { lat: 3, lng: 4 }],
    };
    expect(dayRouteRequest(day)).toEqual({
      dayId: "d1", mode: "walk", points: [[1, 2], [3, 4]], date: null, key: routeKey("walk", [[1, 2], [3, 4]]),
    });
    expect(dayRouteRequest({ ...day, stops: day.stops.slice(0, 2) })).toBe(null);
  });
});
