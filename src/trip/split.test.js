import { describe, expect, it } from "vitest";
import { balances, settleUp, sharersOf, splitCents } from "./split.js";

const members = [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }];
const rates = { EUR: 1, JPY: 160 }; // home currency EUR

describe("splitting expenses", () => {
  it("splits to the cent, leftover cents to the first people", () => {
    expect(splitCents(1000, ["c", "a", "b"])).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.values(splitCents(1001, ["a", "b", "c"])).reduce((x, y) => x + y)).toBe(1001);
  });

  it("null split_between means everyone on the trip", () => {
    expect(sharersOf({ split_between: null }, members)).toEqual(["a", "b", "c"]);
    expect(sharersOf({ split_between: ["a", "b"] }, members)).toEqual(["a", "b"]);
  });

  it("works out who owes whom, in the home currency", () => {
    const { net, skipped } = balances(
      [
        { amount: 30, currency: "EUR", paid_by: "a", split_between: null }, // a +20, b -10, c -10
        { amount: 1600, currency: "JPY", paid_by: "b", split_between: ["a", "b"] }, // 10 EUR: b +5, a -5
        { amount: 5, currency: "EUR", paid_by: null }, // nobody marked as paying
        { amount: 5, currency: "XYZ", paid_by: "a" }, // no rate
      ],
      members,
      rates,
    );
    expect(net).toEqual({ a: 1500, b: -500, c: -1000 });
    expect(skipped).toHaveLength(2);
    expect(Object.values(net).reduce((x, y) => x + y)).toBe(0); // money is conserved
  });

  it("settles up in few payments", () => {
    expect(settleUp({ a: 1500, b: -500, c: -1000 })).toEqual([
      { from: "c", to: "a", cents: 1000 },
      { from: "b", to: "a", cents: 500 },
    ]);
    expect(settleUp({ a: 0, b: 0 })).toEqual([]);
  });

  it("someone who left the trip still counts in old expenses", () => {
    const { net } = balances([{ amount: 10, currency: "EUR", paid_by: "gone", split_between: ["gone", "a"] }], members, rates);
    expect(net).toEqual({ a: -500, b: 0, c: 0, gone: 500 });
  });
});
