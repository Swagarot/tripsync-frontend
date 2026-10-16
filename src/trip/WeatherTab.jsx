import { formatDay } from "../dates.js";
import { useTripView } from "./context.js";
import { describe } from "./weather.js";

// The forecast for each day of the trip, with warnings. Open-Meteo forecasts
// reach 16 days ahead; days further out say when their forecast will appear.
export default function WeatherTab({ trip }) {
  const { weatherFor } = useTripView();
  const days = trip.days;

  if (days.length === 0) return <p className="tab-body muted">Add days to see their weather.</p>;

  return (
    <div className="tab-body">
      <ul className="weather-list">
        {days.map((day, i) => {
          const w = weatherFor(day);
          const f = w?.forecast;
          const d = describe(f?.weather_code);
          return (
            <li key={day.id} className={`weather-day${w?.warnings.some((x) => x.level === "warn") ? " bad" : ""}`}>
              <span className="weather-icon" aria-hidden="true">
                {f ? d.icon : "🗓️"}
              </span>
              <div className="stop-body">
                <strong>
                  Day {i + 1}
                  {day.date && <span className="muted"> · {formatDay(day.date)}</span>}
                </strong>
                {f ? (
                  <p className="small">
                    {d.text} · {Math.round(f.temperature_2m_min)}°–{Math.round(f.temperature_2m_max)}° · rain{" "}
                    {f.precipitation_probability_max ?? 0}%
                    {f.wind_speed_10m_max >= 30 && ` · wind ${Math.round(f.wind_speed_10m_max)} km/h`}
                  </p>
                ) : (
                  <p className="muted small">{forecastNote(day, w)}</p>
                )}
                {w?.warnings.map((x) => (
                  <p key={x.text} className={x.level === "warn" ? "weather-warning small" : "muted small"}>
                    {x.level === "warn" ? "⚠ " : ""}
                    {x.text}
                  </p>
                ))}
                {w?.outdoor.length > 0 && (
                  <p className="small">Outdoor stops that day: {w.outdoor.map((s) => s.name).join(", ")}. Consider swapping days.</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="attribution">
        Forecast:{" "}
        <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
      </p>
    </div>
  );
}

function forecastNote(day, w) {
  if (!day.date) return "Give this day a date to see its forecast.";
  if (w === null) return "No location yet: add a stop or the trip's destination.";
  const daysAway = Math.round((new Date(day.date) - new Date()) / 86400000);
  if (daysAway > 15) return `Forecast appears about 16 days before (in ${daysAway - 15} days).`;
  if (daysAway < 0) return "This day has passed.";
  return "Forecast not loaded yet.";
}
