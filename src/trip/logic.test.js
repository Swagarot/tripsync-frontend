import { describe, expect, it } from "vitest";
import { toHome, totals } from "./currency.js";
import { dayWeather, describe as describeCode, warningsFor } from "./weather.js";

describe("weather warnings", () => {
  it("flags storms, heavy rain, heat, cold and wind", () => {
    expect(warningsFor({ weather_code: 95 })).toEqual([{ level: "warn", text: "Thunderstorms forecast" }]);
    expect(warningsFor({ weather_code: 63, precipitation_probability_max: 85, precipitation_sum: 12 })[0].text)
      .toBe("Heavy rain likely (12 mm)");
    expect(warningsFor({ weather_code: 61, precipitation_probability_max: 65, precipitation_sum: 1 })[0].level).toBe("info");
    expect(warningsFor({ weather_code: 0, temperature_2m_max: 38 })[0].text).toBe("Very hot (38°)");
    expect(warningsFor({ weather_code: 0, temperature_2m_min: -8 })[0].text).toBe("Very cold (-8°)");
    expect(warningsFor({ weather_code: 0, wind_speed_10m_max: 62 })[0].text).toBe("Strong wind (62 km/h)");
  });

  it("is quiet on a nice day or without a forecast", () => {
    expect(warningsFor({ weather_code: 1, precipitation_probability_max: 10, temperature_2m_max: 24 })).toEqual([]);
    expect(warningsFor(undefined)).toEqual([]);
  });

  it("names the outdoor stops only when the weather is bad", () => {
    const day = { stops: [{ name: "Park", category: "Park" }, { name: "Museum", category: "Museum" }] };
    expect(dayWeather(day, { weather_code: 95 }).outdoor.map((s) => s.name)).toEqual(["Park"]);
    expect(dayWeather(day, { weather_code: 1 }).outdoor).toEqual([]);
  });

  it("describes weather codes", () => {
    expect(describeCode(0).text).toBe("Clear");
    expect(describeCode(81).text).toBe("Rain");
    expect(describeCode(75).text).toBe("Snow");
    expect(describeCode(96).text).toBe("Thunderstorms");
  });
});

describe("currency", () => {
  const rates = { ILS: 1, JPY: 40, EUR: 0.25 }; // 1 ILS = 40 JPY = 0.25 EUR

  it("converts into the home currency", () => {
    expect(toHome(4000, "JPY", rates)).toBe(100);
    expect(toHome(10, "EUR", rates)).toBe(40);
    expect(toHome(10, "VND", rates)).toBe(null);
  });

  it("totals per category, keeping unconvertible ones apart", () => {
    const t = totals([
      { amount: 4000, currency: "JPY", category: "food" },
      { amount: 10, currency: "EUR", category: "food" },
      { amount: 50, currency: "ILS", category: "transport" },
      { amount: 99, currency: "VND", category: "food" },
    ], rates);
    expect(t.total).toBe(190);
    expect(t.byCategory).toEqual({ food: 140, transport: 50 });
    expect(t.unconverted.map((e) => e.currency)).toEqual(["VND"]);
  });
});

describe("stop picture", () => {
  it("is your chosen cover, else the famous photo, else your first photo", async () => {
    const { coverUrl } = await import("./photos.js");
    const own = [{ id: "a", thumb_url: "/a" }, { id: "b", thumb_url: "/b" }];
    expect(coverUrl({ photo_url: "https://wiki/x.jpg", photos: own, cover_photo_id: "b" })).toBe("/b");
    expect(coverUrl({ photo_url: "https://wiki/x.jpg", photos: own, cover_photo_id: null })).toBe("https://wiki/x.jpg");
    expect(coverUrl({ photo_url: null, photos: own })).toBe("/a");
    expect(coverUrl({ photo_url: null })).toBe(null);
  });
});
