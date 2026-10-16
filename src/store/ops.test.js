import { describe, expect, it } from "vitest";
import { applyToList, applyToTrip, op, toRequest } from "./ops.js";

// Builds a trip by applying ops to nothing, the same way the screen shows a
// trip that was created offline.
function build(...ops) {
  return ops.reduce(applyToTrip, null);
}

describe("trips", () => {
  it("creates a trip locally with a client-chosen id", () => {
    const create = op.createTrip({ name: "Japan" });
    const trip = build(create);
    expect(trip).toMatchObject({ id: create.tripId, name: "Japan", days: [] });
    expect(toRequest(create)).toEqual({ method: "POST", path: "/trips", body: { id: create.tripId, name: "Japan" } });
  });

  it("updates and deletes in the list", () => {
    const create = op.createTrip({ name: "Japan" });
    let list = applyToList([], create);
    list = applyToList(list, op.updateTrip(create.tripId, { name: "Japan 2027" }));
    expect(list.map((t) => t.name)).toEqual(["Japan 2027"]);
    expect(applyToList(list, op.deleteTrip(create.tripId))).toEqual([]);
  });

  it("puts new trips first, like the server", () => {
    const a = op.createTrip({ name: "A" });
    const b = op.createTrip({ name: "B" });
    expect([a, b].reduce(applyToList, []).map((t) => t.name)).toEqual(["B", "A"]);
  });
});

describe("days and stops", () => {
  const trip0 = op.createTrip({ name: "T" });
  const id = trip0.tripId;
  const d1 = op.createDay(id, { title: "one" });
  const d2 = op.createDay(id, { title: "two" });
  const s1 = op.createStop(id, d1.dayId, { name: "a" });
  const s2 = op.createStop(id, d1.dayId, { name: "b" });

  it("appends days and stops with positions 0..n-1", () => {
    const trip = build(trip0, d1, d2, s1, s2);
    expect(trip.days.map((d) => [d.title, d.position])).toEqual([["one", 0], ["two", 1]]);
    expect(trip.days[0].stops.map((s) => [s.name, s.position])).toEqual([["a", 0], ["b", 1]]);
  });

  it("reorders, and ignores a reorder that doesn't match the current items", () => {
    let trip = build(trip0, d1, d2, s1, s2);
    trip = applyToTrip(trip, op.reorderStops(id, d1.dayId, [s2.stopId, s1.stopId]));
    expect(trip.days[0].stops.map((s) => [s.name, s.position])).toEqual([["b", 0], ["a", 1]]);
    const stale = applyToTrip(trip, op.reorderDays(id, [d2.dayId]));
    expect(stale).toEqual(trip);
  });

  it("moves a stop to the end of another day", () => {
    const s3 = op.createStop(id, d2.dayId, { name: "c" });
    const trip = applyToTrip(build(trip0, d1, d2, s1, s2, s3), op.moveStop(id, s1.stopId, d2.dayId));
    expect(trip.days[0].stops.map((s) => [s.name, s.position])).toEqual([["b", 0]]);
    expect(trip.days[1].stops.map((s) => [s.name, s.position, s.day_id])).toEqual([
      ["c", 0, d2.dayId],
      ["a", 1, d2.dayId],
    ]);
  });

  it("deletes a day with its stops and renumbers", () => {
    const trip = applyToTrip(build(trip0, d1, d2, s1), op.deleteDay(id, d1.dayId));
    expect(trip.days.map((d) => [d.title, d.position])).toEqual([["two", 0]]);
  });

  it("ignores ops for another trip", () => {
    const trip = build(trip0, d1);
    expect(applyToTrip(trip, op.createDay("other-trip", {}))).toBe(trip);
  });
});

describe("idempotency (an op may be applied on top of a server copy that already has it)", () => {
  const create = op.createTrip({ name: "T" });
  const id = create.tripId;
  const all = [
    create,
    op.createDay(id, { title: "one" }),
    op.updateTrip(id, { notes: "x" }),
  ];
  const day = all[1].dayId;
  all.push(
    op.createStop(id, day, { name: "a" }),
    op.createDay(id, { title: "two" }),
  );
  all.push(op.moveStop(id, all[3].stopId, all[4].dayId), op.reorderDays(id, [all[4].dayId, day]));

  it.each(all.map((o) => [o.type, o]))("%s twice = once", (_, o) => {
    const before = build(...all.slice(0, all.indexOf(o)));
    const once = applyToTrip(before, o);
    expect(applyToTrip(once, o)).toEqual(once);
  });
});

describe("requests", () => {
  it("maps each op to the right endpoint", () => {
    expect(toRequest(op.moveStop("t", "s", "d"))).toEqual({ method: "PATCH", path: "/stops/s", body: { day_id: "d" } });
    expect(toRequest(op.reorderDays("t", ["a", "b"]))).toEqual({
      method: "PUT",
      path: "/trips/t/days/order",
      body: { ids: ["a", "b"] },
    });
    expect(toRequest(op.deleteDay("t", "d"))).toEqual({ method: "DELETE", path: "/days/d" });
  });
});
