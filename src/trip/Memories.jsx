import { useRef, useSyncExternalStore } from "react";
import { api } from "../api.js";
import { DeleteIcon } from "../components/icons.jsx";
import { useStore } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshTrip } from "../store/store.js";
import { addPhotos, discardPhoto, getPendingPhotos, getPhotoError, subscribePhotos } from "./photos.js";

// Your memories of a stop: stars, "been here", and your own photos.
// Stars and "been here" are ordinary changes (they work offline). Photos go
// through the upload queue in photos.js (they also work offline: they wait on
// the device until there's a connection).

export function Stars({ value, onChange, size = "normal" }) {
  return (
    <span className={`stars stars-${size}`} role={onChange ? "radiogroup" : undefined} aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={n <= (value ?? 0) ? "on" : ""}
            // Tapping your current rating again clears it.
            onClick={() => onChange(value === n ? null : n)}
          >
            ★
          </button>
        ) : (
          <span key={n} className={n <= (value ?? 0) ? "on" : ""} aria-hidden="true">
            ★
          </span>
        ),
      )}
    </span>
  );
}

export default function Memories({ stop, tripId }) {
  const { online } = useStore();
  const input = useRef(null);
  const pending = useSyncExternalStore(subscribePhotos, getPendingPhotos).filter((p) => p.stopId === stop.id);
  const error = useSyncExternalStore(subscribePhotos, getPhotoError);
  const photos = stop.photos ?? [];

  const update = (fields) => dispatch(op.updateStop(tripId, stop.id, fields));

  async function remove(photo) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api(`/photos/${photo.id}`, { method: "DELETE" });
      refreshTrip(tripId);
    } catch (err) {
      window.alert(err.message);
    }
  }

  return (
    <div className="memories">
      <div className="memories-row">
        <Stars value={stop.rating} onChange={(rating) => update({ rating })} />
        <label className="visited-toggle">
          <input type="checkbox" checked={!!stop.visited} onChange={(e) => update({ visited: e.target.checked })} />
          Been here
        </label>
      </div>

      <div className="photo-grid">
        {photos.map((p) => (
          <figure key={p.id} className={stop.cover_photo_id === p.id ? "cover" : ""}>
            <a href={p.url} target="_blank" rel="noreferrer">
              <img src={p.thumb_url} alt="" loading="lazy" />
            </a>
            <figcaption>
              <button
                type="button"
                title="Use as the stop's picture"
                aria-pressed={stop.cover_photo_id === p.id}
                onClick={() => update({ cover_photo_id: stop.cover_photo_id === p.id ? null : p.id })}
              >
                ★
              </button>
              <button type="button" className="danger" title="Delete photo" onClick={() => remove(p)}>
                <DeleteIcon />
              </button>
            </figcaption>
          </figure>
        ))}
        {pending.map((p) => (
          <figure key={p.id} className="pending">
            <img src={p.preview} alt="" />
            <figcaption>
              <span className="small">{online ? "Uploading…" : "Waiting for connection"}</span>
              <button type="button" className="danger" title="Don't upload" onClick={() => discardPhoto(p.id)}>
                <DeleteIcon />
              </button>
            </figcaption>
          </figure>
        ))}
        <button type="button" className="add-photo" onClick={() => input.current?.click()}>
          <span aria-hidden="true">📷</span>
          Add photos
        </button>
      </div>
      {/* accept=image/*: on phones this offers the camera as well as the gallery. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addPhotos(tripId, stop.id, [...e.target.files]);
          e.target.value = "";
        }}
      />
      {error && <p className="error small">{error}</p>}
      {stop.photo_url && photos.length > 0 && (
        <p className="muted small">★ picks the stop's picture; without one, the famous photo is shown.</p>
      )}
    </div>
  );
}
