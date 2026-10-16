import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { dayColor } from "../colors.js";
import { DayForm, StopForm, TripForm } from "../components/forms.jsx";
import { DeleteIcon, DownIcon, EditIcon, UpIcon } from "../components/icons.jsx";
import { addDays, formatDay, formatRange } from "../dates.js";
import { useStore, useTrip } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshTrip } from "../store/store.js";

// The map (Leaflet) is a big library only this page needs, so it's loaded on
// demand: a separate JS file, downloaded the first time a map is shown (and
// cached by the service worker after that, so it works offline too).
const TripMap = lazy(() => import("../components/TripMap.jsx"));

// Every change is an op (store/ops.js): dispatch() applies it on screen
// immediately and the sync loop sends it to the server when it can.

// Swap an item with its neighbour and return the list of IDs in the new
// order, which is what the reorder endpoints expect.
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
  const [showMap, setShowMap] = useState(true);

  // Show the stored copy right away, fetch a fresh one in the background.
  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

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
  const hasPins = days.some((d) => d.stops.some((s) => s.lat != null));

  function deleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" with all its days and stops?`)) return;
    dispatch(op.deleteTrip(trip.id));
    navigate("/");
  }

  // New days get the next date after the last one (or after the trip start),
  // so planning a week is just clicking "Add day" seven times.
  function suggestedDate() {
    const last = days.at(-1)?.date;
    if (last) return addDays(last, 1);
    return trip.start_date ?? null;
  }

  return (
    <main className="page">
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
            <p className="muted">{formatRange(trip.start_date, trip.end_date)}</p>
            {trip.notes && <p className="notes">{trip.notes}</p>}
          </div>
          <div className="head-actions">
            {hasPins && (
              <button aria-pressed={showMap} onClick={() => setShowMap((v) => !v)}>
                Map
              </button>
            )}
            <button onClick={() => setEditingTrip(true)}>Edit</button>
          </div>
        </header>
      )}

      {hasPins && showMap && (
        <Suspense fallback={<div className="card map-placeholder">Loading map…</div>}>
          <TripMap days={days} />
        </Suspense>
      )}

      <ol className="day-list">
        {days.map((day, index) => (
          <Day key={day.id} day={day} index={index} days={days} />
        ))}
      </ol>

      <button
        className="add-day"
        onClick={() => dispatch(op.createDay(trip.id, { date: suggestedDate() }))}
      >
        + Add day
      </button>
    </main>
  );
}

function Day({ day, index, days }) {
  const [editing, setEditing] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const tripId = day.trip_id;

  const reorder = (delta) => dispatch(op.reorderDays(tripId, movedIds(days, index, delta)));

  const remove = () => {
    const what = day.stops.length ? ` and its ${day.stops.length} stop(s)` : "";
    if (window.confirm(`Delete day ${index + 1}${what}?`)) dispatch(op.deleteDay(tripId, day.id));
  };

  // Where to centre the "pick on map" map: the last stop of this day that has
  // coordinates, else any stop of the trip.
  const nearby = [...day.stops, ...days.flatMap((d) => d.stops)].reverse().find((s) => s.lat != null);

  return (
    <li className="card day">
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
              <span className="day-badge" style={{ "--day-color": dayColor(index) }}>
                {index + 1}
              </span>
              Day {index + 1}
              {day.date && <span className="day-date"> · {formatDay(day.date)}</span>}
            </h2>
            {day.title && <p className="day-title">{day.title}</p>}
            {day.notes && <p className="notes">{day.notes}</p>}
          </div>
          <div className="icon-buttons">
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

      <ol className="stop-list">
        {day.stops.map((stop, stopIndex) => (
          <Stop key={stop.id} stop={stop} index={stopIndex} day={day} days={days} nearby={nearby} />
        ))}
      </ol>

      {addingStop ? (
        <StopForm
          submitLabel="Add stop"
          near={nearby}
          onCancel={() => setAddingStop(false)}
          onSubmit={async (values) => {
            await dispatch(op.createStop(tripId, day.id, values));
            setAddingStop(false);
          }}
        />
      ) : (
        <button className="link" onClick={() => setAddingStop(true)}>
          + Add stop
        </button>
      )}
    </li>
  );
}

function Stop({ stop, index, day, days, nearby }) {
  const [editing, setEditing] = useState(false);
  const stops = day.stops;
  const tripId = day.trip_id;

  if (editing) {
    return (
      <li className="stop editing">
        <StopForm
          stop={stop}
          near={nearby}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            await dispatch(op.updateStop(tripId, stop.id, values));
            setEditing(false);
          }}
        />
      </li>
    );
  }

  const reorder = (delta) => dispatch(op.reorderStops(tripId, day.id, movedIds(stops, index, delta)));

  return (
    <li className="stop">
      <span className="stop-time">{stop.time ?? ""}</span>
      <div className="stop-body">
        <a className="stop-name" href={mapsUrl(stop)} target="_blank" rel="noreferrer">
          {stop.name}
        </a>
        {stop.address && <p className="muted small">{stop.address}</p>}
        {stop.notes && <p className="notes small">{stop.notes}</p>}
      </div>
      <div className="icon-buttons">
        <button aria-label="Move stop up" disabled={index === 0} onClick={() => reorder(-1)}>
          <UpIcon />
        </button>
        <button aria-label="Move stop down" disabled={index === stops.length - 1} onClick={() => reorder(1)}>
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
  );
}
