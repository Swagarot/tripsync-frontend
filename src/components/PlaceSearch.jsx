import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useStore } from "../store/hooks.js";
import { useTripView } from "../trip/context.js";

// Type a place name -> results from the backend (/places/search, which asks
// Photon/OpenStreetMap) -> pick one -> see its details (photo, hours,
// website, from /places/<ref>) -> add it to the day.
// Results are biased towards `near` (the middle of the trip's stops), so
// "cathedral" finds the one in the city being planned.
export default function PlaceSearch({ near, onAdd, onCustom, onCancel }) {
  const { online } = useStore();
  const { setPreview } = useTripView();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // { result, details?, loading }
  const latest = useRef(0);
  // Plain numbers as effect dependencies: `near` is a new object on every
  // render, which would otherwise re-run the search each time.
  const nearLat = near?.lat;
  const nearLng = near?.lng;

  // Search 300 ms after the last keystroke, not on every key: fewer requests
  // for us and for the free service behind us. A newer search makes any older
  // answer still in flight irrelevant (`latest` check).
  useEffect(() => {
    const q = query.trim();
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      setError(null);
      const params = new URLSearchParams({ q });
      if (nearLat != null) {
        params.set("lat", nearLat.toFixed(3));
        params.set("lng", nearLng.toFixed(3));
      }
      try {
        const found = await api(`/places/search?${params}`);
        if (id === latest.current) setResults(found);
      } catch (err) {
        if (id === latest.current) setError(err);
      } finally {
        if (id === latest.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, nearLat, nearLng]);

  // Show the results (and the one picked) as temporary pins on the map.
  useEffect(() => {
    setPreview(results.length ? { results, selectedRef: selected?.result.osm_ref ?? null } : null);
  }, [results, selected, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  async function pick(result) {
    setSelected({ result, details: null, loading: true });
    try {
      const details = await api(`/places/${result.osm_ref}`);
      setSelected((s) => (s?.result === result ? { result, details, loading: false } : s));
    } catch {
      // Details are a bonus: the place can still be added from the result.
      setSelected((s) => (s?.result === result ? { result, details: null, loading: false } : s));
    }
  }

  function add() {
    const place = { ...selected.result, ...(selected.details ?? {}) };
    onAdd({
      name: place.name.slice(0, 200),
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      osm_ref: place.osm_ref,
      photo_url: place.photo_url ?? null,
      website: place.website ?? null,
      opening_hours: place.opening_hours ?? null,
    });
  }

  if (!online) {
    return (
      <div className="place-search">
        <p className="muted small">Place search needs a connection. You can still add a stop by hand.</p>
        <div className="form-actions">
          <button onClick={onCustom}>Add by hand</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="place-search">
      <div className="search-row">
        <input
          type="search"
          autoFocus
          placeholder="Search places: museums, cafés, landmarks…"
          aria-label="Search places"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
        />
        <button onClick={onCancel}>Cancel</button>
      </div>

      {error && <p className="error">{error.message}</p>}

      {selected ? (
        <PlaceCard selected={selected} onAdd={add} onBack={() => setSelected(null)} />
      ) : (
        <>
          {searching && <p className="muted small">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
            <p className="muted small">No places found.</p>
          )}
          <ul className="results">
            {results.map((r) => (
              <li key={r.osm_ref}>
                <button className="result" onClick={() => pick(r)}>
                  <span className="result-name">{r.name}</span>
                  <span className="muted small">{[r.category, r.address].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="link small" onClick={onCustom}>
            Can't find it? Add a stop by hand
          </button>
        </>
      )}
      <p className="attribution">
        Search: <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> ·{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </p>
    </div>
  );
}

function PlaceCard({ selected, onAdd, onBack }) {
  const { result, details, loading } = selected;
  const place = { ...result, ...(details ?? {}) };
  const facts = [
    place.cuisine && `Cuisine: ${place.cuisine}`,
    place.fee === "yes" ? "Entry fee" : place.fee === "no" ? "Free entry" : place.fee && `Fee: ${place.fee}`,
    place.wheelchair === "yes" ? "Wheelchair accessible" : place.wheelchair === "limited" && "Limited wheelchair access",
  ].filter(Boolean);

  return (
    <div className="place-card">
      {place.photo_url && <img className="place-photo" src={place.photo_url} alt="" loading="lazy" />}
      <div className="place-body">
        <h3>{place.name}</h3>
        <p className="muted small">{[place.category, place.address].filter(Boolean).join(" · ")}</p>
        {loading && <p className="muted small">Loading details…</p>}
        {place.description && (
          <p className="small place-description">
            {place.description}{" "}
            {place.source_url && (
              <a href={place.source_url} target="_blank" rel="noreferrer">
                Wikipedia
              </a>
            )}
          </p>
        )}
        {place.opening_hours && (
          <p className="small">
            <strong>Hours:</strong> {place.opening_hours}
          </p>
        )}
        {facts.length > 0 && <p className="small">{facts.join(" · ")}</p>}
        {(place.website || place.phone) && (
          <p className="small">
            {place.website && (
              <a href={place.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
            {place.website && place.phone && " · "}
            {place.phone && <a href={`tel:${place.phone}`}>{place.phone}</a>}
          </p>
        )}
        <div className="form-actions">
          <button className="primary" onClick={onAdd}>
            Add to day
          </button>
          <button onClick={onBack}>Back to results</button>
        </div>
      </div>
    </div>
  );
}
