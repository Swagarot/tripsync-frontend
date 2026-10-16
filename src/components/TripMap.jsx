import { Fragment } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import { dayColor } from "../colors.js";
import { ATTRIBUTION, pin, TILE_URL } from "./map.js";

// All stops with coordinates, one colour per day, numbered in visiting order,
// with a line per day connecting them.
export default function TripMap({ days }) {
  const routes = days.map((day, index) => ({
    day,
    color: dayColor(index),
    stops: day.stops.filter((s) => s.lat != null),
  }));
  const points = routes.flatMap((r) => r.stops.map((s) => [s.lat, s.lng]));

  // `bounds` makes Leaflet zoom so every pin fits. MapContainer only reads it
  // once, so the key remounts the map when the set of pins changes.
  return (
    <div className="card map-card">
      <MapContainer
        key={points.join("|")}
        bounds={points}
        boundsOptions={{ padding: [30, 30], maxZoom: 15 }}
        scrollWheelZoom={false}
        className="map"
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        {routes.map(({ day, color, stops }) => (
          <Fragment key={day.id}>
            {stops.length > 1 && (
              <Polyline positions={stops.map((s) => [s.lat, s.lng])} pathOptions={{ color, weight: 3, opacity: 0.7 }} />
            )}
            {stops.map((stop) => (
              <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={pin(day.stops.indexOf(stop) + 1, color)}>
                <Tooltip>
                  {stop.time ? `${stop.time} · ` : ""}
                  {stop.name}
                </Tooltip>
              </Marker>
            ))}
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
