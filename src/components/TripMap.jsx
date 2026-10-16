import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { dayColor } from "../colors.js";
import { useTripView } from "../trip/context.js";
import { ATTRIBUTION, pin, TILE_URL } from "./map.js";

// Zooms the map to fit `points` whenever the set of points changes (not on
// every render, so it doesn't fight the user's own panning).
function FitTo({ points }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the points' content
  }, [key, map]);
  return null;
}

// All stops with coordinates: one colour per day, numbered in visiting order,
// lines between them. Plus, while searching, the results as small grey pins.
export default function TripMap({ days }) {
  const { highlight, focus, preview } = useTripView();

  const routes = useMemo(
    () =>
      days.map((day, index) => ({
        day,
        color: dayColor(index),
        stops: day.stops.filter((s) => s.lat != null),
      })),
    [days],
  );
  const stopPoints = routes.flatMap((r) => r.stops.map((s) => [s.lat, s.lng]));
  // While searching: the picked result, else all results.
  const picked = preview?.results.find((r) => r.osm_ref === preview.selectedRef);
  const previewPoints = picked ? [[picked.lat, picked.lng]] : (preview?.results.map((r) => [r.lat, r.lng]) ?? []);

  return (
    <MapContainer center={[30, 10]} zoom={2} className="map" scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {/* While searching, fit the results; otherwise the trip. */}
      <FitTo points={previewPoints.length ? previewPoints : stopPoints} />

      {routes.map(({ day, color, stops }) => (
        <Fragment key={day.id}>
          {stops.length > 1 && (
            <Polyline positions={stops.map((s) => [s.lat, s.lng])} pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "6 6" }} />
          )}
          {stops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={pin(day.stops.indexOf(stop) + 1, color, { highlighted: highlight === stop.id })}
              zIndexOffset={highlight === stop.id ? 1000 : 0}
              eventHandlers={{ click: () => focus(stop.id) }}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                {stop.time ? `${stop.time} · ` : ""}
                {stop.name}
              </Tooltip>
            </Marker>
          ))}
        </Fragment>
      ))}

      {preview?.results.map((r) => {
        const selected = preview.selectedRef === r.osm_ref;
        return (
          <Marker
            key={r.osm_ref}
            position={[r.lat, r.lng]}
            icon={pin("", selected ? "var(--accent)" : "#6b675f", { small: !selected, highlighted: selected })}
            zIndexOffset={selected ? 2000 : 500}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {r.name}
            </Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
