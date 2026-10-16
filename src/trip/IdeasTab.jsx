import { useState } from "react";
import { DeleteIcon } from "../components/icons.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import { op } from "../store/ops.js";
import { dispatch } from "../store/store.js";
import { useTripView } from "./context.js";
import { Thumb } from "./ItineraryTab.jsx";

// Ideas: places you might visit but haven't put on a day yet. They show on
// the map as hollow pins; "Add to day" turns one into a stop.
const PLACE_FIELDS = ["name", "lat", "lng", "address", "notes", "osm_ref", "category", "photo_url", "website", "opening_hours"];

export default function IdeasTab({ trip, near }) {
  const [searching, setSearching] = useState(false);
  const { highlight, setHighlight } = useTripView();
  const ideas = trip.ideas ?? [];

  function schedule(idea, dayId) {
    // Two ops: a new stop with the idea's details, then the idea goes away.
    // Offline they queue in that order like any other changes.
    const fields = Object.fromEntries(PLACE_FIELDS.filter((k) => idea[k] != null).map((k) => [k, idea[k]]));
    dispatch(op.createStop(trip.id, dayId, fields));
    dispatch(op.deleteItem("ideas", trip.id, idea.id));
  }

  return (
    <div className="tab-body">
      <p className="muted small">Places you might visit. Save them here, then add them to a day when you decide.</p>
      {searching ? (
        <PlaceSearch
          near={near}
          onAdd={async (fields) => {
            await dispatch(op.createItem("ideas", trip.id, fields));
            setSearching(false);
          }}
          onCustom={() => setSearching(false)}
          onCancel={() => setSearching(false)}
        />
      ) : (
        <button className="primary" onClick={() => setSearching(true)}>
          + Save a place
        </button>
      )}

      {ideas.length === 0 && !searching && <p className="empty muted">No saved places yet.</p>}

      <ul className="idea-list">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            id={`stop-${idea.id}`}
            className={`stop idea${highlight === idea.id ? " highlighted" : ""}`}
            onMouseEnter={() => setHighlight(idea.id)}
            onMouseLeave={() => setHighlight(null)}
          >
            <Thumb place={idea} />
            <div className="stop-body">
              <span className="stop-name">{idea.name}</span>
              <p className="muted small">{[idea.category, idea.address].filter(Boolean).join(" · ")}</p>
              {idea.opening_hours && <p className="small hours">Hours: {idea.opening_hours}</p>}
            </div>
            <div className="icon-buttons">
              {trip.days.length > 0 ? (
                <select
                  className="move-select"
                  aria-label={`Add ${idea.name} to a day`}
                  value=""
                  onChange={(e) => e.target.value && schedule(idea, e.target.value)}
                >
                  <option value="">Add to day…</option>
                  {trip.days.map((d, i) => (
                    <option key={d.id} value={d.id}>
                      Day {i + 1}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="muted small">Add a day first</span>
              )}
              <button
                aria-label={`Remove ${idea.name}`}
                className="danger"
                onClick={() => dispatch(op.deleteItem("ideas", trip.id, idea.id))}
              >
                <DeleteIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
