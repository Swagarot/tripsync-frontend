import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./coords.js";
import { addDays, formatRange } from "./dates.js";

describe("parseCoordinates", () => {
  it("reads the 'lat, lng' format map apps copy", () => {
    expect(parseCoordinates("35.7148, 139.7967")).toEqual({ lat: 35.7148, lng: 139.7967 });
    expect(parseCoordinates("-33.9,18.4")).toEqual({ lat: -33.9, lng: 18.4 });
  });

  it("treats empty as no coordinates", () => {
    expect(parseCoordinates("  ")).toEqual({ lat: null, lng: null });
  });

  it.each(["35.7", "abc, def", "1, 2, 3", "91, 0", "0, 181"])("rejects %j", (text) => {
    expect(() => parseCoordinates(text)).toThrow();
  });
});

describe("dates", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("describes missing dates", () => {
    expect(formatRange(null, null)).toBe("No dates yet");
  });
});

describe("newId without crypto.randomUUID (plain http)", () => {
  it("still makes valid v4 UUIDs", async () => {
    const { newId } = await import("./store/ops.js");
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const id = newId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(newId()).not.toBe(id);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
