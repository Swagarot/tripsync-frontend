import { useState } from "react";
import { DeleteIcon } from "../components/icons.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import { formatDay } from "../dates.js";
import { op } from "../store/ops.js";
import { dispatch } from "../store/store.js";

// Where you're staying (hotel, apartment, a friend's place) and on which
// dates. With "Start & end each day here" on, every day in that range begins
// and ends at the stay: it's added to the day's route and travel times
// (rules in stays.js).
export default function Stays({ trip, near }) {
  const [adding, setAdding] = useState(false);
  const stays = trip.lodgings ?? [];

  async function add(fields) {
    // Dates default to the whole trip; change them on the stay afterwards.
    await dispatch(op.createItem("lodgings", trip.id, {
      ...fields,
      check_in: trip.start_date ?? null,
      check_out: trip.end_date ?? null,
      bookends: true,
    }));
    setAdding(false);
  }

  return (
    <section className="stays" aria-label="Where you're staying">
      <div className="stays-head">
        <strong>🛏️ Where you're staying</strong>
        {!adding && (
          <button className="link small" onClick={() => setAdding(true)}>
            + Add a stay
          </button>
        )}
      </div>
      {adding && (
        <PlaceSearch near={near} onAdd={add} onCancel={() => setAdding(false)} addLabel="Add this stay" />
      )}
      {stays.length === 0 && !adding && (
        <p className="muted small">Add your hotel and each day can start and end there automatically.</p>
      )}
      <ul className="stay-list">
        {stays.map((stay) => (
          <Stay key={stay.id} stay={stay} tripId={trip.id} />
        ))}
      </ul>
    </section>
  );
}

function Stay({ stay, tripId }) {
  const update = (fields) => dispatch(op.updateItem("lodgings", tripId, stay.id, fields));
  // Check-out can't be before check-in: the date inputs say so, and the
  // backend refuses it too.
  const nights =
    stay.check_in && stay.check_out
      ? Math.round((new Date(stay.check_out) - new Date(stay.check_in)) / 86400000)
      : null;

  return (
    <li className="stay">
      <div className="stay-top">
        <div className="stop-body">
          <span className="stop-name">{stay.name}</span>
          <p className="muted small">
            {stay.check_in && stay.check_out
              ? `${formatDay(stay.check_in)} → ${formatDay(stay.check_out)} · ${nights} night${nights === 1 ? "" : "s"}`
              : "Set the dates below"}
          </p>
        </div>
        <button
          aria-label={`Remove ${stay.name}`}
          className="danger icon-only"
          onClick={() => window.confirm(`Remove "${stay.name}"?`) && dispatch(op.deleteItem("lodgings", tripId, stay.id))}
        >
          <DeleteIcon />
        </button>
      </div>
      <div className="form-row stay-dates">
        <label className="small">
          Check-in
          <input type="date" value={stay.check_in ?? ""} max={stay.check_out ?? undefined}
            onChange={(e) => update({ check_in: e.target.value || null })} />
        </label>
        <label className="small">
          Check-out
          <input type="date" value={stay.check_out ?? ""} min={stay.check_in ?? undefined}
            onChange={(e) => update({ check_out: e.target.value || null })} />
        </label>
      </div>
      <label className="visited-toggle small">
        <input type="checkbox" checked={stay.bookends !== false} onChange={(e) => update({ bookends: e.target.checked })} />
        Start &amp; end each day here
      </label>
    </li>
  );
}
