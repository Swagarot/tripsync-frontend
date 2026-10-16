import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { dayColor } from "../colors.js";
import { useTripView } from "../trip/context.js";
import { ATTRIBUTION, pin, TILE_URL } from "./map.js";

// Zooms the map to fit `points` whenever the set of points changes (not on
// every render, so it doesn't fight the user's own panning). With no points,
// shows the trip's destination ("Where to?"), else the whole world.
function FitTo({ points, fallback }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|") + `#${fallback?.join(",")}`;
  useEffect(() => {
    // The panel covers part of the map (left on desktop, bottom on phones):
    // fit the pins into the part that's actually visible.
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    const padding = desktop
      ? { paddingTopLeft: [500, 50], paddingBottomRight: [50, 50] }
      : { paddingTopLeft: [30, 30], paddingBottomRight: [30, window.innerHeight * 0.5] };
    // One point (or a destination) becomes a small box around it, so the
    // same padding logic applies.
    const around = ([lat, lng], d) => [[lat - d, lng - d], [lat + d, lng + d]];
    if (points.length === 1) map.fitBounds(around(points[0], 0.004), { ...padding, maxZoom: 15 });
    else if (points.length > 1) map.fitBounds(points, { ...padding, maxZoom: 15 });
    else if (fallback) {
      const spread = 360 / 2 ** fallback[2]; // roughly what that zoom level shows
      map.fitBounds(around(fallback, spread / 2), padding);
    } else map.fitBounds(WORLD_VIEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the points' content
  }, [key, map]);
  return null;
}

// Inhabited latitudes; the map can't be dragged past the poles (the grey
// "nothing" above and below the world).
const WORLD_VIEW = [[-50, -170], [72, 170]];
const WORLD_EDGES = [[-85, -200], [85, 200]];

// All stops with coordinates: one colour per day, numbered in visiting order,
// lines between them. Plus, while searching, the results as small grey pins.
export default function TripMap({ days, trip }) {
  const { highlight, focus, preview, routeFor } = useTripView();

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
    <MapContainer
      center={[30, 10]}
      zoom={2}
      minZoom={2}
      maxBounds={WORLD_EDGES}
      maxBoundsViscosity={1}
      className="map"
      scrollWheelZoom
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} noWrap />
      {/* While searching, fit the results; otherwise the trip's stops; otherwise its destination. */}
      <FitTo
        points={previewPoints.length ? previewPoints : stopPoints}
        fallback={trip.dest_lat != null ? [trip.dest_lat, trip.dest_lng, trip.dest_zoom ?? 10] : null}
      />

      {routes.map(({ day, color, stops }) => (
        <Fragment key={day.id}>
          {/* The real route when loaded, else dashed straight lines. Different
              keys on purpose: Leaflet keeps a line's old dash pattern when only
              its style changes, so the route must be a new line, not an update. */}
          {routeFor(day)?.parts ? (
            // Transit: each part separately. Rides in the line's own colour,
            // walks as dots, legs without a journey as dashed straight lines.
            routeFor(day).parts.map((part, i) => (
              <Polyline
                key={`part-${i}-${part.mode}`}
                positions={part.points}
                pathOptions={
                  part.mode === "WALK"
                    ? { color: "#6b675f", weight: 3, opacity: 0.8, dashArray: "1 6", lineCap: "round" }
                    : part.mode === "NONE"
                      ? { color, weight: 3, opacity: 0.6, dashArray: "6 6" }
                      : { color: part.color ?? color, weight: 6, opacity: 0.9 }
                }
              />
            ))
          ) : routeFor(day) ? (
            <Polyline key="route" positions={routeFor(day).geometry} pathOptions={{ color, weight: 5, opacity: 0.8 }} />
          ) : (
            stops.length > 1 && (
              <Polyline
                key="straight"
                positions={stops.map((s) => [s.lat, s.lng])}
                pathOptions={{ color, weight: 3, opacity: 0.6, dashArray: "6 6" }}
              />
            )
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

      {/* Saved ideas: hollow pins, not yet part of any day. */}
      {(trip.ideas ?? [])
        .filter((i) => i.lat != null)
        .map((idea) => (
          <Marker
            key={idea.id}
            position={[idea.lat, idea.lng]}
            icon={pin("★", "#8a8577", { highlighted: highlight === idea.id, hollow: true })}
            eventHandlers={{ click: () => focus(idea.id) }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              Idea: {idea.name}
            </Tooltip>
          </Marker>
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
