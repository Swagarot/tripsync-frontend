import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

// "Where to?": a text box that suggests places (countries, cities, regions)
// from the backend's place search as you type. Picking one gives the trip a
// location and a zoom level, so its map opens there. Typing without picking
// (or being offline) keeps just the text.
//   value:    { destination, dest_lat, dest_lng, dest_zoom }
//   onChange: called with the same shape
export default function DestinationInput({ value, onChange }) {
  const [query, setQuery] = useState(value.destination ?? "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  // The name of the suggestion last picked: no need to search for it again.
  const [picked, setPicked] = useState(value.dest_lat != null ? value.destination : null);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      if (q.length < 2 || q === picked) {
        setSuggestions([]);
        return;
      }
      try {
        const found = await api(`/places/search?${new URLSearchParams({ q })}`);
        // Areas (countries, regions, cities, islands) before single places
        // like a shop or a station, but otherwise keep the search's own
        // relevance order: sorting by size would put Haneda Airport (tagged
        // as an island in OpenStreetMap) above the city of Tokyo.
        const isArea = (r) => (r.zoom ?? 15) <= 13;
        const ranked = [...found].sort((a, b) => isArea(b) - isArea(a));
        if (id === latest.current) setSuggestions(ranked.slice(0, 6));
      } catch {
        if (id === latest.current) setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, picked]);

  function pick(place) {
    setQuery(place.name);
    setPicked(place.name);
    setSuggestions([]);
    setOpen(false);
    onChange({ destination: place.name, dest_lat: place.lat, dest_lng: place.lng, dest_zoom: place.zoom ?? 10 });
  }

  return (
    <div className="destination">
      <input
        placeholder="e.g. Japan, Lisbon, Kyoto"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls="destination-suggestions"
        value={query}
        onFocus={() => setOpen(true)}
        // Delay so a click on a suggestion lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Free text until a suggestion is picked: no location yet.
          onChange({ destination: e.target.value.trim() || null, dest_lat: null, dest_lng: null, dest_zoom: null });
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="suggestions" id="destination-suggestions" role="listbox">
          {suggestions.map((s) => (
            <li key={s.osm_ref} role="option" aria-selected="false">
              <button type="button" className="result" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}>
                <span className="result-name">{s.name}</span>
                <span className="muted small">{[s.category, s.address].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
