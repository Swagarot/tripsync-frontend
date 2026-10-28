import { describe, expect, it } from "vitest";
import { googleMapsDayUrl, keepsakeFileName, sketchMap } from "./export.js";

const stop = (id, lat, lng) => ({ id, name: id, lat, lng });

describe("Google Maps link for a day", () => {
  it("origin, waypoints, destination and the day's travel mode", () => {
    const day = { travel_mode: "transit", stops: [stop("a", 35.1, 139.1), stop("b", 35.2, 139.2), stop("c", 35.3, 139.3)] };
    const { url, truncated } = googleMapsDayUrl(day);
    const params = new URL(url).searchParams;
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    expect(params.get("origin")).toBe("35.1,139.1");
    expect(params.get("waypoints")).toBe("35.2,139.2");
    expect(params.get("destination")).toBe("35.3,139.3");
    expect(params.get("travelmode")).toBe("transit");
    expect(truncated).toBe(false);
  });

  it("starts and ends at the stay, skips places without a position, caps waypoints at 9", () => {
    const hotel = { id: "h", name: "Hotel", lat: 1, lng: 1, check_in: "2027-04-01", check_out: "2027-04-05", bookends: true };
    const stops = [stop("x", null, null), ...Array.from({ length: 11 }, (_, i) => stop(`s${i}`, 2 + i, 2))];
    const { url, truncated } = googleMapsDayUrl({ date: "2027-04-02", stops }, [hotel]);
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe("1,1");
    expect(params.get("destination")).toBe("1,1");
    expect(params.get("waypoints").split("|")).toHaveLength(9);
    expect(params.get("travelmode")).toBe("walking");
    expect(truncated).toBe(true);
  });

  it("one place is a search, none is no link", () => {
    expect(googleMapsDayUrl({ stops: [stop("a", 1, 2)] }).url).toContain("/maps/search/?api=1&query=1,2");
    expect(googleMapsDayUrl({ stops: [] })).toBeNull();
  });
});

describe("keepsake helpers", () => {
  it("draws the trip inside the box, keeping its shape", () => {
    const days = [{ stops: [stop("a", 35, 139), stop("b", 36, 140)] }];
    const map = sketchMap(days, []);
    for (const [x, y] of map.pins[0]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(640);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(360);
    }
    // North is up: the northern stop (b) is higher on the page.
    expect(map.pins[0][1][1]).toBeLessThan(map.pins[0][0][1]);
    expect(sketchMap([{ stops: [] }], [])).toBeNull();
  });

  it("makes a safe file name", () => {
    expect(keepsakeFileName('Tokyo: "spring" / 2027')).toBe("Tokyo spring 2027.html");
    expect(keepsakeFileName("")).toBe("Trip.html");
  });
});
