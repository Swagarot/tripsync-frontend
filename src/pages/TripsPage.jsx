import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { TripForm } from "../components/forms.jsx";
import { formatRange } from "../dates.js";
import { useStore, useTripList } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshList } from "../store/store.js";

export default function TripsPage() {
  const trips = useTripList(); // null = nothing downloaded yet
  const { online } = useStore();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  // Show the stored list right away, and fetch a fresh one in the background.
  useEffect(() => {
    refreshList();
  }, []);

  async function createTrip(values) {
    // Works offline too: the trip gets its ID here and is sent later.
    const o = op.createTrip(values);
    await dispatch(o);
    navigate(`/trips/${o.tripId}`);
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Your trips</h1>
        {!creating && (
          <button className="primary" onClick={() => setCreating(true)}>
            New trip
          </button>
        )}
      </div>

      {creating && (
        <div className="card">
          <h2>New trip</h2>
          <TripForm submitLabel="Create trip" onSubmit={createTrip} onCancel={() => setCreating(false)} />
        </div>
      )}

      {trips === null &&
        (online ? (
          <p className="muted">Loading…</p>
        ) : (
          <p className="muted">You're offline, and your trips haven't been downloaded to this device yet.</p>
        ))}

      {trips?.length === 0 && !creating && (
        <div className="empty">
          <p>No trips yet.</p>
          <button className="primary" onClick={() => setCreating(true)}>
            Plan your first trip
          </button>
        </div>
      )}

      <ul className="trip-list">
        {trips?.map((trip) => (
          <li key={trip.id}>
            <Link to={`/trips/${trip.id}`} className="card trip-card">
              <span className="trip-name">{trip.name}</span>
              <span className="muted">
                {trip.destination && trip.destination !== trip.name.replace(/^Trip to /, "") && `${trip.destination} · `}
                {formatRange(trip.start_date, trip.end_date)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
