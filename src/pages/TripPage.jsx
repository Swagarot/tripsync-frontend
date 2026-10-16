import {
  closestCenter,
  DndContext,
  pointerWithin,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { dayColor } from "../colors.js";
import { DayForm, StopForm, TripForm } from "../components/forms.jsx";
import { DeleteIcon, DownIcon, EditIcon, GripIcon, UpIcon } from "../components/icons.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import { addDays, formatDay, formatRange } from "../dates.js";
import { centerOf, distanceKm, formatDistance, formatDuration } from "../geo.js";
import { useStore, useTrip } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshTrip } from "../store/store.js";
import { TripViewContext, useTripView } from "../trip/context.js";
import { dayRouteRequest, loadRoute } from "../trip/routes.js";

// The map (Leaflet) is a big library only this page needs, so it's loaded on
// demand: a separate JS file, downloaded the first time a map is shown (and
// cached by the service worker after that, so it works offline too).
const TripMap = lazy(() => import("../components/TripMap.jsx"));

// Layout: itinerary on the left, a big map on the right that stays in view
// while scrolling (on phones: map on top). Every change is an op
// (store/ops.js): dispatch() applies it on screen immediately and the sync
// loop sends it to the server when it can.

const TRAVEL_MODES = { walk: "Walk", bike: "Bike", drive: "Drive" };
const MODE_VERB = { walk: "walk", bike: "by bike", drive: "drive" };

// Loads a route for every day with 2+ placed stops, once the stops have
// stopped changing for a moment (dragging fires several changes in a row and
// each route request counts against the daily quota). Returns routeFor(day),
// which only hands out a route that matches the day's CURRENT stops and mode.
function useRoutes(days) {
  const [routes, setRoutes] = useState({});
  const requests = days.map(dayRouteRequest).filter(Boolean);
  // A plain string as the effect's dependency: it only changes when some
  // day's stops or mode really change, not on every render.
  const signature = JSON.stringify(requests.map((r) => [r.key, r.mode, r.points]));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const [key, mode, points] of JSON.parse(signature)) {
        const route = await loadRoute(mode, points);
        if (cancelled) return;
        if (route) setRoutes((prev) => ({ ...prev, [key]: route }));
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature]);

  return useCallback(
    (day) => {
      const request = dayRouteRequest(day);
      const route = request && routes[request.key];
      return route && !route.none ? route : null;
    },
    [routes],
  );
}

function movedIds(items, index, delta) {
  const ids = items.map((item) => item.id);
  [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
  return ids;
}

function mapsUrl(stop) {
  const query = stop.lat != null ? `${stop.lat},${stop.lng}` : stop.address || stop.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function TripPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const trip = useTrip(tripId);
  const { online } = useStore();
  const [editingTrip, setEditingTrip] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [preview, setPreview] = useState(null);
  const routeFor = useRoutes(trip?.days ?? []);

  // Show the stored copy right away, fetch a fresh one in the background.
  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

  // Clicking a pin scrolls its stop into view.
  const focus = useCallback((stopId) => {
    setHighlight(stopId);
    document.getElementById(`stop-${stopId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const view = useMemo(
    () => ({ highlight, setHighlight, preview, setPreview, focus, routeFor }),
    [highlight, preview, focus, routeFor],
  );

  if (!trip) {
    return (
      <main className="page">
        <Link to="/" className="back">
          ← All trips
        </Link>
        {trip === null ? (
          <p>This trip doesn't exist (or was deleted).</p>
        ) : online ? (
          <p className="muted">Loading…</p>
        ) : (
          <p className="muted">You're offline, and this trip hasn't been opened on this device before.</p>
        )}
      </main>
    );
  }

  const days = trip.days;
  const pinned = days.flatMap((d) => d.stops).filter((s) => s.lat != null);

  function deleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" with all its days and stops?`)) return;
    dispatch(op.deleteTrip(trip.id));
    navigate("/");
  }

  // New days get the next date after the last one (or the trip start), so
  // planning a week is just clicking "Add day" seven times.
  function suggestedDate() {
    const last = days.at(-1)?.date;
    if (last) return addDays(last, 1);
    return trip.start_date ?? null;
  }

  return (
    <TripViewContext.Provider value={view}>
      <main className="trip-layout">
        <section className="itinerary">
          <Link to="/" className="back">
            ← All trips
          </Link>

          {editingTrip ? (
            <div className="card">
              <h2>Edit trip</h2>
              <TripForm
                trip={trip}
                onCancel={() => setEditingTrip(false)}
                onSubmit={async (values) => {
                  await dispatch(op.updateTrip(trip.id, values));
                  setEditingTrip(false);
                }}
              />
              <button className="danger link" onClick={deleteTrip}>
                Delete trip
              </button>
            </div>
          ) : (
            <header className="trip-head">
              <div>
                <h1>{trip.name}</h1>
                <p className="muted">
                  {trip.destination && <>{trip.destination} · </>}
                  {formatRange(trip.start_date, trip.end_date)} · {days.length} day{days.length === 1 ? "" : "s"},{" "}
                  {pinned.length} place{pinned.length === 1 ? "" : "s"} on the map
                </p>
                {trip.notes && <p className="notes">{trip.notes}</p>}
              </div>
              <button onClick={() => setEditingTrip(true)}>Edit</button>
            </header>
          )}

          {/* Place search looks near the trip's stops, else near its destination. */}
          <Itinerary
            trip={trip}
            near={centerOf(pinned) ?? (trip.dest_lat != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null)}
          />

          <button className="add-day" onClick={() => dispatch(op.createDay(trip.id, { date: suggestedDate() }))}>
            + Add day
          </button>
        </section>

        <aside className="map-column">
          <Suspense fallback={<div className="map map-placeholder">Loading map…</div>}>
            <TripMap days={days} trip={trip} />
          </Suspense>
        </aside>
      </main>
    </TripViewContext.Provider>
  );
}

// --- Drag and drop -------------------------------------------------------------
// Each day's stop list is a sortable list (dnd-kit). A stop can be dropped on
// another stop (takes its place) or on a day's empty area (goes to the end).
// Dropping translates into the same ops the buttons use: reorderStops, or
// moveStop + reorderStops for another day, so it works offline too.

// Which drop target is under the dragged stop: a stop under the pointer wins
// (drop = take its place); else the day's list (drop = go to the end); else
// whatever is nearest (keyboard dragging has no pointer).
function stopsFirst(args) {
  const under = pointerWithin(args);
  const stops = under.filter((c) => !String(c.id).startsWith("day:"));
  if (stops.length) return stops;
  if (under.length) return under;
  return closestCenter(args);
}

function Itinerary({ trip, near }) {
  const days = trip.days;
  const [dragging, setDragging] = useState(null);
  const sensors = useSensors(
    // Mouse: start after moving 5 px, so a click is still a click.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch: press and hold 200 ms, so swiping still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Keyboard: focus the handle, Space to lift, arrows to move, Space to drop.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findStop = (id) => {
    for (const day of days) {
      const index = day.stops.findIndex((s) => s.id === id);
      if (index !== -1) return { day, index, stop: day.stops[index] };
    }
    return null;
  };

  function onDragEnd({ active, over }) {
    setDragging(null);
    if (!over || active.id === over.id) return;
    const from = findStop(active.id);
    if (!from) return;

    let toDay, toIndex;
    if (String(over.id).startsWith("day:")) {
      toDay = days.find((d) => `day:${d.id}` === over.id);
      toIndex = toDay?.stops.length;
    } else {
      const target = findStop(over.id);
      toDay = target?.day;
      toIndex = target?.index;
    }
    if (!toDay) return;

    if (toDay.id === from.day.id) {
      const ids = arrayMove(from.day.stops.map((s) => s.id), from.index, Math.min(toIndex, from.day.stops.length - 1));
      dispatch(op.reorderStops(trip.id, toDay.id, ids));
    } else {
      dispatch(op.moveStop(trip.id, active.id, toDay.id)); // lands at the end of toDay
      const ids = toDay.stops.map((s) => s.id);
      if (toIndex < ids.length) {
        ids.splice(toIndex, 0, active.id);
        dispatch(op.reorderStops(trip.id, toDay.id, ids));
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={stopsFirst}
      onDragStart={({ active }) => setDragging(findStop(active.id)?.stop ?? null)}
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <ol className="day-list">
        {days.map((day, index) => (
          <Day key={day.id} day={day} index={index} days={days} near={near} />
        ))}
      </ol>
      <DragOverlay>{dragging && <div className="stop drag-overlay">{dragging.name}</div>}</DragOverlay>
    </DndContext>
  );
}

function Day({ day, index, days, near }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(null); // null | "search" | "manual"
  const tripId = day.trip_id;
  const color = dayColor(index);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.id}` });
  const { routeFor } = useTripView();
  const route = routeFor(day);
  // Route legs go between consecutive stops that have coordinates.
  const pinnedIds = day.stops.filter((s) => s.lat != null).map((s) => s.id);
  const legFor = (stop) => {
    const i = pinnedIds.indexOf(stop.id);
    return route && i > 0 ? route.legs[i - 1] : null;
  };

  const reorder = (delta) => dispatch(op.reorderDays(tripId, movedIds(days, index, delta)));
  const remove = () => {
    const what = day.stops.length ? ` and its ${day.stops.length} stop(s)` : "";
    if (window.confirm(`Delete day ${index + 1}${what}?`)) dispatch(op.deleteDay(tripId, day.id));
  };
  const addStop = async (values) => {
    await dispatch(op.createStop(tripId, day.id, values));
    setAdding(null);
  };

  // Search near this day's own stops first, else the whole trip's.
  const dayPins = day.stops.filter((s) => s.lat != null);
  const searchNear = centerOf(dayPins) ?? near;

  return (
    <li className="card day" style={{ "--day-color": color }}>
      {editing ? (
        <DayForm
          day={day}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await dispatch(op.updateDay(tripId, day.id, values));
            setEditing(false);
          }}
        />
      ) : (
        <div className="day-head">
          <div>
            <h2>
              <span className="day-badge">{index + 1}</span>
              Day {index + 1}
              {day.date && <span className="day-date"> · {formatDay(day.date)}</span>}
            </h2>
            {day.title && <p className="day-title">{day.title}</p>}
            {route && (
              <p className="muted small">
                {formatDuration(route.duration_s)} {MODE_VERB[day.travel_mode ?? "walk"]} · {formatDistance(route.distance_m / 1000)} in
                total
              </p>
            )}
            {day.notes && <p className="notes">{day.notes}</p>}
          </div>
          <div className="icon-buttons">
            <select
              className="mode-select"
              aria-label="How you get around this day"
              value={day.travel_mode ?? "walk"}
              onChange={(e) => dispatch(op.updateDay(tripId, day.id, { travel_mode: e.target.value }))}
            >
              {Object.entries(TRAVEL_MODES).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
            <button aria-label="Move day up" disabled={index === 0} onClick={() => reorder(-1)}>
              <UpIcon />
            </button>
            <button aria-label="Move day down" disabled={index === days.length - 1} onClick={() => reorder(1)}>
              <DownIcon />
            </button>
            <button aria-label="Edit day" onClick={() => setEditing(true)}>
              <EditIcon />
            </button>
            <button aria-label="Delete day" className="danger" onClick={remove}>
              <DeleteIcon />
            </button>
          </div>
        </div>
      )}

      <SortableContext items={day.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className={`stop-list${isOver ? " drop-target" : ""}`}>
          {day.stops.map((stop, stopIndex) => (
            <Stop
              key={stop.id}
              stop={stop}
              index={stopIndex}
              day={day}
              days={days}
              previous={stopIndex > 0 ? day.stops[stopIndex - 1] : null}
              leg={legFor(stop)}
            />
          ))}
          {day.stops.length === 0 && <li className="empty-day muted small">No stops yet. Drag one here or add a place.</li>}
        </ol>
      </SortableContext>

      {adding === "search" && (
        <PlaceSearch near={searchNear} onAdd={addStop} onCustom={() => setAdding("manual")} onCancel={() => setAdding(null)} />
      )}
      {adding === "manual" && (
        <StopForm submitLabel="Add stop" near={searchNear} onCancel={() => setAdding(null)} onSubmit={addStop} />
      )}
      {adding === null && (
        <button className="link" onClick={() => setAdding("search")}>
          + Add a place
        </button>
      )}
    </li>
  );
}

function Stop({ stop, index, day, days, previous, leg }) {
  const [editing, setEditing] = useState(false);
  const { highlight, setHighlight } = useTripView();
  const tripId = day.trip_id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (editing) {
    return (
      <li ref={setNodeRef} style={style} className="stop editing">
        <StopForm
          stop={stop}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await dispatch(op.updateStop(tripId, stop.id, values));
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const reorder = (delta) =>
    dispatch(op.reorderStops(tripId, day.id, movedIds(day.stops, index, delta)));

  return (
    <>
      {previous && <Leg from={previous} to={stop} mode={day.travel_mode ?? "walk"} leg={leg} />}
      <li
        ref={setNodeRef}
        id={`stop-${stop.id}`}
        style={style}
        className={`stop${highlight === stop.id ? " highlighted" : ""}${isDragging ? " dragging" : ""}`}
        onMouseEnter={() => setHighlight(stop.id)}
        onMouseLeave={() => setHighlight(null)}
        onClick={() => setHighlight(stop.id)}
      >
        <button
          ref={setActivatorNodeRef}
          className="grip"
          aria-label={`Drag ${stop.name}`}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <span className="stop-number">{index + 1}</span>
        {stop.photo_url && <img className="stop-photo" src={stop.photo_url} alt="" loading="lazy" />}
        <div className="stop-body">
          <a className="stop-name" href={mapsUrl(stop)} target="_blank" rel="noreferrer">
            {stop.name}
          </a>
          <p className="muted small">{[stop.time, stop.category, stop.address].filter(Boolean).join(" · ")}</p>
          {stop.opening_hours && <p className="small hours">Hours: {stop.opening_hours}</p>}
          {stop.notes && <p className="notes small">{stop.notes}</p>}
          {stop.website && (
            <a className="small" href={stop.website} target="_blank" rel="noreferrer">
              Website
            </a>
          )}
        </div>
        <div className="icon-buttons stop-actions">
          {/* Buttons stay for keyboard/screen-reader users and precise moves. */}
          <button aria-label="Move stop up" disabled={index === 0} onClick={() => reorder(-1)}>
            <UpIcon />
          </button>
          <button aria-label="Move stop down" disabled={index === day.stops.length - 1} onClick={() => reorder(1)}>
            <DownIcon />
          </button>
          {days.length > 1 && (
            <select
              className="move-select"
              aria-label="Move to another day"
              value=""
              onChange={(e) => e.target.value && dispatch(op.moveStop(tripId, stop.id, e.target.value))}
            >
              <option value="">Move…</option>
              {days.map((d, i) =>
                d.id === day.id ? null : (
                  <option key={d.id} value={d.id}>
                    To day {i + 1}
                  </option>
                ),
              )}
            </select>
          )}
          <button aria-label="Edit stop" onClick={() => setEditing(true)}>
            <EditIcon />
          </button>
          <button
            aria-label="Delete stop"
            className="danger"
            onClick={() => window.confirm(`Delete "${stop.name}"?`) && dispatch(op.deleteStop(tripId, stop.id))}
          >
            <DeleteIcon />
          </button>
        </div>
      </li>
    </>
  );
}

// Between two stops: travel time and distance along the real route, or, when
// there's no route (offline before it was ever loaded, quota used up), the
// straight-line distance.
function Leg({ from, to, mode, leg }) {
  if (from.lat == null || to.lat == null) return null;
  const text = leg
    ? `${formatDuration(leg.duration_s)} ${MODE_VERB[mode]} · ${formatDistance(leg.distance_m / 1000)}`
    : `~${formatDistance(distanceKm(from, to))} straight line`;
  return (
    <li className="leg muted small">
      <span className="leg-line" aria-hidden="true" />
      {text}
    </li>
  );
}
