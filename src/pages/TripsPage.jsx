import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { TripForm } from "../components/forms.jsx";
import { formatRange } from "../dates.js";
import { useStore, useTripList } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshList } from "../store/store.js";

// Leaflet only loads once a card actually has something to show on a map.
const MiniMap = lazy(() => import("../components/MiniMap.jsx"));

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
    <main className="page wide">
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

      <ul className="trip-grid">
        {trips?.map((trip) => (
          <li key={trip.id}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>
    </main>
  );
}

// A trip card: cover photo (the trip's first place that has one) next to a
// mini map of its places. `preview` comes from GET /trips; a trip created
// offline doesn't have one yet, so everything here is optional.
function TripCard({ trip }) {
  const p = trip.preview ?? { days: 0, places: 0, points: [], photo_url: null };
  const destination = trip.dest_lat != null ? { lat: trip.dest_lat, lng: trip.dest_lng, zoom: trip.dest_zoom } : null;
  const hasMap = p.points.length > 0 || destination;
  const sub = trip.destination && trip.destination !== trip.name.replace(/^Trip to /, "") ? `${trip.destination} · ` : "";

  return (
    <Link to={`/trips/${trip.id}`} className="trip-card">
      <div className="trip-cover">
        {p.photo_url ? (
          <img src={p.photo_url} alt="" loading="lazy" />
        ) : (
          <span className="trip-cover-icon" aria-hidden="true">
            ✈
          </span>
        )}
        {hasMap && (
          <div className="trip-mini">
            <Suspense fallback={null}>
              <MiniMap points={p.points} destination={destination} />
            </Suspense>
          </div>
        )}
      </div>
      <div className="trip-card-body">
        <span className="trip-name">{trip.name}</span>
        <span className="muted small">
          {sub}
          {formatRange(trip.start_date, trip.end_date)}
        </span>
        <span className="muted small">
          {p.days} day{p.days === 1 ? "" : "s"} · {p.places} place{p.places === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
