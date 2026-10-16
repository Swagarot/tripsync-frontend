import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { getLanguage } from "../settings.js";
import { useStore } from "../store/hooks.js";
import { useTripView } from "../trip/context.js";

// Type a place name -> results from the backend (/places/search, which asks
// Photon/OpenStreetMap) -> pick one -> see its details (photo, hours,
// website, from /places/<ref>) -> add it to the day.
// Results are biased towards `near` (the middle of the trip's stops), so
// "cathedral" finds the one in the city being planned.
//
// Two looks:
//   inline (default): inside a day ("+ Add a place"), with a Cancel button;
//   compact: the search bar floating on top of the map (like Google Maps):
//     always there, results drop down while you type, `leading` (the ☰
//     button) sits inside the bar, and `targets` lets you pick where the
//     place goes (a day, or Ideas). After adding it resets for the next one.
export default function PlaceSearch({
  near, onAdd, onCustom, onCancel, initialQuery = "", addLabel = "Add to day",
  compact = false, leading = null, targets = null,
}) {
  const { online } = useStore();
  const { setPreview } = useTripView();
  const [query, setQuery] = useState(initialQuery);
  const [done, setDone] = useState(null); // "Added to Day 1" after a compact add
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
      const params = new URLSearchParams({ q, lang: getLanguage() });
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
    // Details are a bonus: if they fail, the place can still be added from
    // the search result alone (hence the catch -> null).
    const details = api(`/places/${result.osm_ref}?lang=${getLanguage()}`).catch(() => null);
    setSelected({ result, details: null, loading: true, pending: details });
    const loaded = await details;
    setSelected((s) => (s?.result === result ? { ...s, details: loaded, loading: false } : s));
  }

  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState(null);
  const chosenTarget = target ?? targets?.[0]?.id ?? null;

  async function add() {
    // Tapped "Add" before the details arrived? Wait for them (a second or
    // two), otherwise the stop would be saved without photo and hours.
    setAdding(true);
    const details = selected.details ?? (await selected.pending);
    const place = { ...selected.result, ...(details ?? {}) };
    await onAdd({
      name: place.name.slice(0, 200),
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      category: place.category,
      osm_ref: place.osm_ref,
      photo_url: place.photo_url ?? null,
      website: place.website ?? null,
      opening_hours: place.opening_hours ?? null,
    }, chosenTarget);
    if (compact) {
      // Ready for the next place; say where this one went.
      const label = targets?.find((t) => t.id === chosenTarget)?.label;
      setDone(`Added "${place.name}"${label ? ` to ${label}` : ""}`);
      setTimeout(() => setDone(null), 3000);
      setQuery("");
      setSelected(null);
      setResults([]);
      setAdding(false);
      // Next place defaults to the first choice again (Day 1), not to wherever
      // the last one went: "A new day" twice would make two new days.
      setTarget(null);
    }
  }

  if (compact) {
    const open = query.trim().length >= 2 || selected;
    const clear = () => {
      setQuery("");
      setSelected(null);
    };
    return (
      <div className={`top-search${open ? " open" : ""}`}>
        <div className="top-search-bar">
          {leading}
          <input
            type="search"
            placeholder={online ? "Search places to add…" : "Search needs a connection"}
            aria-label="Search places"
            disabled={!online}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            onKeyDown={(e) => e.key === "Escape" && clear()}
          />
          {query && (
            <button className="icon-btn" aria-label="Clear search" onClick={clear}>
              ✕
            </button>
          )}
        </div>
        {done && !open && <div className="top-search-done" role="status">✓ {done}</div>}
        {open && (
          <div className="top-search-results">
            {error && <p className="error">{error.message}</p>}
            {selected ? (
              <PlaceCard
                selected={selected}
                adding={adding}
                addLabel={addLabel}
                onAdd={add}
                onBack={() => setSelected(null)}
                targets={targets}
                target={chosenTarget}
                onTarget={setTarget}
              />
            ) : (
              <>
                {searching && <p className="muted small">Searching…</p>}
                {!searching && results.length === 0 && !error && <p className="muted small">No places found.</p>}
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
              </>
            )}
            <p className="attribution">
              Search: <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> ·{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
            </p>
          </div>
        )}
      </div>
    );
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
        <PlaceCard selected={selected} adding={adding} addLabel={addLabel} onAdd={add} onBack={() => setSelected(null)} />
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
          {onCustom && (
            <button className="link small" onClick={onCustom}>
              Can't find it? Add a stop by hand
            </button>
          )}
        </>
      )}
      <p className="attribution">
        Search: <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> ·{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </p>
    </div>
  );
}

function PlaceCard({ selected, adding, addLabel, onAdd, onBack, targets, target, onTarget }) {
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
          {targets && (
            <select aria-label="Add to" value={target ?? ""} onChange={(e) => onTarget(e.target.value)}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
          <button className="primary" onClick={onAdd} disabled={adding}>
            {adding ? "Saving…" : addLabel}
          </button>
          <button onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  );
}
