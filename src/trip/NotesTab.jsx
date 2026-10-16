import { useState } from "react";
import { DeleteIcon } from "../components/icons.jsx";
import { op } from "../store/ops.js";
import { dispatch } from "../store/store.js";

// Notes (free text, saved when you leave the box) and a checklist (packing,
// bookings, to-dos).
export default function NotesTab({ trip }) {
  const [notes, setNotes] = useState(trip.notes ?? "");
  const [newItem, setNewItem] = useState("");
  const items = [...(trip.checklist ?? [])].sort((a, b) => a.position - b.position);
  const done = items.filter((i) => i.done).length;

  function saveNotes() {
    const value = notes.trim() || null;
    if (value !== (trip.notes ?? null)) dispatch(op.updateTrip(trip.id, { notes: value }));
  }

  function addItem(e) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    dispatch(op.createItem("checklist", trip.id, { text }));
    setNewItem("");
  }

  return (
    <div className="tab-body">
      <label className="form notes-field">
        <strong>Notes</strong>
        <textarea
          rows={6}
          maxLength={5000}
          placeholder="Flight numbers, hotel addresses, ideas…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
        />
      </label>

      <div className="checklist">
        <strong>
          Checklist {items.length > 0 && <span className="muted small">{done}/{items.length} done</span>}
        </strong>
        <ul>
          {items.map((item) => (
            <li key={item.id} className={item.done ? "done" : ""}>
              <label>
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => dispatch(op.updateItem("checklist", trip.id, item.id, { done: e.target.checked }))}
                />
                <span>{item.text}</span>
              </label>
              <button
                aria-label={`Remove ${item.text}`}
                className="danger icon-only"
                onClick={() => dispatch(op.deleteItem("checklist", trip.id, item.id))}
              >
                <DeleteIcon />
              </button>
            </li>
          ))}
        </ul>
        <form className="search-row" onSubmit={addItem}>
          <input placeholder="Passport, adapter, JR pass…" maxLength={300} value={newItem} onChange={(e) => setNewItem(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
