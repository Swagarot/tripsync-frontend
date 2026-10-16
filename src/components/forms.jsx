import { lazy, Suspense, useState } from "react";
import { parseCoordinates } from "../coords.js";
import DestinationInput from "./DestinationInput.jsx";

// Loaded on demand, like the trip map (Leaflet is large).
const MapPicker = lazy(() => import("./MapPicker.jsx"));

// Small controlled forms: React state holds each field's value, and the
// inputs show and update that state. Empty optional fields are sent as null,
// which the backend stores as "not set".

function useFields(initial) {
  const [values, setValues] = useState(initial);
  const bind = (key) => ({
    value: values[key] ?? "",
    onChange: (e) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });
  return [values, bind, setValues];
}

const orNull = (s) => (s && s.trim() ? s.trim() : null);

// Disables the buttons while the request runs, so a double click can't
// create the same trip twice.
function useSubmit(onSubmit) {
  const [busy, setBusy] = useState(false);
  const handle = async (e, payload) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(payload);
    } finally {
      setBusy(false);
    }
  };
  return [busy, handle];
}

function Actions({ busy, label, onCancel }) {
  return (
    <div className="form-actions">
      <button type="submit" className="primary" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
    </div>
  );
}

export function TripForm({ trip, onSubmit, onCancel, submitLabel = "Save" }) {
  const [values, bind] = useFields({
    name: trip?.name,
    start_date: trip?.start_date,
    end_date: trip?.end_date,
    notes: trip?.notes,
  });
  const [destination, setDestination] = useState({
    destination: trip?.destination ?? null,
    dest_lat: trip?.dest_lat ?? null,
    dest_lng: trip?.dest_lng ?? null,
    dest_zoom: trip?.dest_zoom ?? null,
  });
  const [busy, handle] = useSubmit(onSubmit);

  // No name typed? "Trip to Japan" from the destination, like Wanderlog.
  const autoName = destination.destination ? `Trip to ${destination.destination}` : "";

  const submit = (e) =>
    handle(e, {
      name: (values.name?.trim() || autoName).slice(0, 200),
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      notes: orNull(values.notes),
      ...destination,
    });

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Where to?
        <DestinationInput value={destination} onChange={setDestination} />
      </label>
      <label>
        Trip name {autoName && <span className="hint">optional</span>}
        <input
          required={!autoName}
          maxLength={200}
          placeholder={autoName || "Japan in spring"}
          {...bind("name")}
        />
      </label>
      <div className="form-row">
        <label>
          Start
          <input type="date" {...bind("start_date")} />
        </label>
        <label>
          End
          <input type="date" min={values.start_date || undefined} {...bind("end_date")} />
        </label>
      </div>
      {trip && (
        <label>
          Notes
          <textarea rows={3} maxLength={5000} {...bind("notes")} />
        </label>
      )}
      <Actions busy={busy} label={submitLabel} onCancel={onCancel} />
    </form>
  );
}

export function DayForm({ day, onSubmit, onCancel }) {
  const [values, bind] = useFields({ title: day.title, date: day.date, notes: day.notes });
  const [busy, handle] = useSubmit(onSubmit);

  const submit = (e) =>
    handle(e, { title: orNull(values.title), date: values.date || null, notes: orNull(values.notes) });

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Title
          <input maxLength={200} placeholder="Tokyo, Asakusa" {...bind("title")} />
        </label>
        <label>
          Date
          <input type="date" {...bind("date")} />
        </label>
      </div>
      <label>
        Notes
        <textarea rows={2} maxLength={5000} {...bind("notes")} />
      </label>
      <Actions busy={busy} label="Save day" onCancel={onCancel} />
    </form>
  );
}

// The pin to show on the picker: the typed coordinates, if they're valid.
function currentPin(text) {
  try {
    const { lat, lng } = parseCoordinates(text);
    return lat == null ? null : [lat, lng];
  } catch {
    return null;
  }
}

export function StopForm({ stop, near, onSubmit, onCancel, submitLabel = "Save stop" }) {
  const [picking, setPicking] = useState(false);
  const [values, bind, setValues] = useFields({
    name: stop?.name,
    time: stop?.time,
    address: stop?.address,
    coords: stop?.lat != null ? `${stop.lat}, ${stop.lng}` : "",
    notes: stop?.notes,
  });
  const [error, setError] = useState(null);
  const [busy, handle] = useSubmit(onSubmit);

  const submit = (e) => {
    let coords;
    try {
      coords = parseCoordinates(values.coords);
    } catch (err) {
      e.preventDefault();
      setError(err.message);
      return;
    }
    setError(null);
    handle(e, {
      name: values.name?.trim() ?? "",
      time: values.time || null,
      address: orNull(values.address),
      notes: orNull(values.notes),
      ...coords,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="grow">
          Place
          <input required maxLength={200} placeholder="Senso-ji temple" {...bind("name")} />
        </label>
        <label>
          Time
          <input type="time" {...bind("time")} />
        </label>
      </div>
      <label>
        Address
        <input maxLength={500} {...bind("address")} />
      </label>
      <div className="coords-field">
        <label>
          Coordinates <span className="hint">optional, lat, lng</span>
          <input inputMode="decimal" placeholder="35.7148, 139.7967" {...bind("coords")} />
        </label>
        <button type="button" aria-pressed={picking} onClick={() => setPicking((p) => !p)}>
          {picking ? "Done" : "Pick on map"}
        </button>
      </div>
      {picking && (
        <Suspense fallback={<div className="map map-picker map-placeholder">Loading map…</div>}>
          <MapPicker
            value={currentPin(values.coords)}
            near={near}
            onPick={(lat, lng) => setValues((v) => ({ ...v, coords: `${lat}, ${lng}` }))}
          />
          <p className="hint">Tap the map to place the stop.</p>
        </Suspense>
      )}
      <label>
        Notes
        <textarea rows={2} maxLength={5000} {...bind("notes")} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Actions busy={busy} label={submitLabel} onCancel={onCancel} />
    </form>
  );
}
