import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
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
import { useState } from "react";
import { dayColor } from "../colors.js";
import { DayForm, StopForm } from "../components/forms.jsx";
import { DeleteIcon, DownIcon, EditIcon, GripIcon, UpIcon } from "../components/icons.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import { addDays, formatDay } from "../dates.js";
import { centerOf, distanceKm, formatDistance, formatDuration } from "../geo.js";
import { op } from "../store/ops.js";
import { dispatch } from "../store/store.js";
import { categoryIcon } from "./categories.js";
import { useTripView } from "./context.js";
import { describe as describeWeather } from "./weather.js";

// The Itinerary tab: days, their stops, travel between them, and adding
// places. Every change is an op (store/ops.js): dispatch() applies it on
// screen immediately and the sync loop sends it when there's a connection.

const TRAVEL_MODES = { walk: "Walk", bike: "Bike", drive: "Drive", transit: "Transit" };
const MODE_VERB = { walk: "walk", bike: "by bike", drive: "drive", transit: "by transit" };

// Plain names for public-transport modes (Transitous / GTFS mode names).
const TRANSIT_NAMES = {
  SUBWAY: "Subway", METRO: "Metro", TRAM: "Tram", BUS: "Bus", COACH: "Coach", FERRY: "Ferry",
  AIRPLANE: "Flight", RAIL: "Train", REGIONAL_RAIL: "Train", REGIONAL_FAST_RAIL: "Express train",
  HIGHSPEED_RAIL: "High-speed train", LONG_DISTANCE: "Long-distance train", NIGHT_RAIL: "Night train",
  SUBURBAN: "Suburban train", CABLE_CAR: "Cable car", FUNICULAR: "Funicular", AERIAL_LIFT: "Cable car",
};

// Icons for public-transport legs (Transitous / GTFS mode names).
const TRANSIT_ICONS = {
  SUBWAY: "🚇", METRO: "🚇", TRAM: "🚊", BUS: "🚌", COACH: "🚌", FERRY: "⛴️", AIRPLANE: "✈️",
  RAIL: "🚆", REGIONAL_RAIL: "🚆", REGIONAL_FAST_RAIL: "🚆", HIGHSPEED_RAIL: "🚄", LONG_DISTANCE: "🚄",
  NIGHT_RAIL: "🚆", SUBURBAN: "🚆", CABLE_CAR: "🚡", FUNICULAR: "🚞", AERIAL_LIFT: "🚡",
};

function movedIds(items, index, delta) {
  const ids = items.map((item) => item.id);
  [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
  return ids;
}

function mapsUrl(stop) {
  const query = stop.lat != null ? `${stop.lat},${stop.lng}` : stop.address || stop.name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function ItineraryTab({ trip, near }) {
  const days = trip.days;

  // New days get the next date after the last one (or the trip start), so
  // planning a week is just clicking "Add day" seven times.
  function suggestedDate() {
    const last = days.at(-1)?.date;
    if (last) return addDays(last, 1);
    return trip.start_date ?? null;
  }

  return (
    <div className="tab-body">
      <Itinerary trip={trip} near={near} />
      <button className="add-day" onClick={() => dispatch(op.createDay(trip.id, { date: suggestedDate() }))}>
        + Add day
      </button>
    </div>
  );
}

// --- Drag and drop -------------------------------------------------------------
// Each day's stop list is a sortable list (dnd-kit). A stop dropped on another
// stop takes its place; dropped on a day's empty area it goes to the end.
// Drops become the same ops the buttons use, so they work offline too.

// Which drop target is under the dragged stop: a stop under the pointer wins,
// else the day's list, else whatever is nearest (keyboard has no pointer).
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
    // Touch: press and hold 200 ms, so swiping still scrolls.
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
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(null); // null | "search" | "manual"
  const tripId = day.trip_id;
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.id}` });
  const { routeFor, weatherFor } = useTripView();
  const route = routeFor(day);
  const weather = weatherFor(day);
  const forecast = weather?.forecast;
  const warn = weather?.warnings.find((w) => w.level === "warn");

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

  // Search near this day's own stops first, else the trip's.
  const searchNear = centerOf(day.stops.filter((s) => s.lat != null)) ?? near;

  return (
    <li className="day" style={{ "--day-color": dayColor(index) }}>
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
          <div className="day-title-block">
            <h2>
              <span className="day-badge">{index + 1}</span>
              Day {index + 1}
              {day.date && <span className="day-date"> · {formatDay(day.date)}</span>}
              {forecast && (
                <span className="day-weather" title={describeWeather(forecast.weather_code).text}>
                  {describeWeather(forecast.weather_code).icon} {Math.round(forecast.temperature_2m_max)}°
                </span>
              )}
            </h2>
            {day.title && <p className="day-title">{day.title}</p>}
            {route && (
              <p className="muted small">
                {formatDuration(route.duration_s)} {MODE_VERB[day.travel_mode ?? "walk"]}
                {route.distance_m > 0 && ` · ${formatDistance(route.distance_m / 1000)}`} in total
                {route.planned_for && route.planned_for !== day.date && (
                  <> · times for a typical {new Date(route.planned_for).toLocaleDateString(undefined, { weekday: "long" })}</>
                )}
              </p>
            )}
            {warn && (
              <p className="weather-warning small" role="note">
                ⚠ {warn.text}
                {weather.outdoor.length > 0 &&
                  ` · ${weather.outdoor.length} outdoor stop${weather.outdoor.length > 1 ? "s" : ""}: ${weather.outdoor
                    .map((s) => s.name)
                    .join(", ")}`}
              </p>
            )}
            {day.notes && <p className="notes">{day.notes}</p>}
          </div>
          <div className="day-tools">
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
            <button className="more" aria-label={`Day ${index + 1} actions`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              ⋯
            </button>
          </div>
          {menu && (
            <div className="actions-row">
              <button disabled={index === 0} onClick={() => reorder(-1)}>
                <UpIcon /> Earlier
              </button>
              <button disabled={index === days.length - 1} onClick={() => reorder(1)}>
                <DownIcon /> Later
              </button>
              <button onClick={() => setEditing(true)}>
                <EditIcon /> Edit
              </button>
              <button className="danger" onClick={remove}>
                <DeleteIcon /> Delete
              </button>
            </div>
          )}
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
  const [menu, setMenu] = useState(false);
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

  const reorder = (delta) => dispatch(op.reorderStops(tripId, day.id, movedIds(day.stops, index, delta)));

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
        <button ref={setActivatorNodeRef} className="grip" aria-label={`Drag ${stop.name}`} {...attributes} {...listeners}>
          <GripIcon />
        </button>
        <Thumb place={stop} number={index + 1} />
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
        <button
          className="more"
          aria-label={`${stop.name} actions`}
          aria-expanded={menu}
          onClick={(e) => {
            e.stopPropagation();
            setMenu((m) => !m);
          }}
        >
          ⋯
        </button>
        {menu && (
        <div className="actions-row">
          {/* Besides dragging: for keyboard/screen-reader users and precise moves. */}
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
        )}
      </li>
    </>
  );
}

// The place's photo, or an icon for its kind of place when there's none,
// with its number in the day on top.
export function Thumb({ place, number }) {
  return (
    <div className="thumb">
      {place.photo_url ? (
        <img src={place.photo_url} alt="" loading="lazy" />
      ) : (
        <span className="thumb-icon" aria-hidden="true">
          {categoryIcon(place.category)}
        </span>
      )}
      {number != null && <span className="thumb-number">{number}</span>}
    </div>
  );
}

// Between two stops: travel time and distance along the real route, or the
// straight-line distance when there's no route (offline before it was loaded,
// daily quota used up).
function Leg({ from, to, mode, leg }) {
  if (from.lat == null || to.lat == null) return null;
  if (leg?.steps) {
    // Public transport: total time, then one line per ride: badge in the
    // line's colour, what it is, and where to get on and off.
    return (
      <li className="leg transit-leg small">
        <span className="leg-line" aria-hidden="true" />
        <div className="transit-rides">
          <span className="muted">
            {formatDuration(leg.duration_s)} by public transport
            {leg.transfers > 0 && ` · ${leg.transfers} change${leg.transfers > 1 ? "s" : ""}`}
          </span>
          {leg.steps.length === 0 && <span className="muted">Walk the whole way</span>}
          {leg.steps.map((s, i) => (
            <div key={i} className="ride" title={s.title || s.line}>
              <span className="line-badge" style={{ "--line": s.color ?? "var(--muted)" }}>
                {TRANSIT_ICONS[s.mode] ?? "🚍"} {s.line}
              </span>
              <span>
                {TRANSIT_NAMES[s.mode] ?? "Transit"}
                {s.from && s.to && (
                  <span className="muted">
                    {" "}
                    · {s.from} → {s.to}
                  </span>
                )}
                {s.minutes > 0 && <span className="muted"> · {s.minutes} min</span>}
              </span>
            </div>
          ))}
        </div>
      </li>
    );
  }
  const text = leg
    ? `${formatDuration(leg.duration_s)} ${MODE_VERB[mode]} · ${formatDistance(leg.distance_m / 1000)}`
    : `~${formatDistance(distanceKm(from, to))} straight line${mode === "transit" ? " (no transit found)" : ""}`;
  return (
    <li className="leg muted small">
      <span className="leg-line" aria-hidden="true" />
      {text}
    </li>
  );
}
