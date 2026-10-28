import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../api.js";
import { useAuth } from "../auth/context.js";
import { ErrorMessage } from "../components/common.jsx";
import { refreshList, refreshTrip } from "../store/store.js";
import { useStore } from "../store/hooks.js";

// Who's on the trip, and (for the owner) inviting people and managing them.
// These talk to the server directly instead of going through the offline
// queue: an invite link or a role change only means something once the server
// has it, so they simply need a connection.
const ROLE_TEXT = { owner: "Owner", editor: "Can edit", viewer: "Can view" };

export default function SharePanel({ trip, onClose }) {
  const { user } = useAuth();
  const { online } = useStore();
  const navigate = useNavigate();
  const [link, setLink] = useState(null); // { url, role, expires_at }
  const [inviteRole, setInviteRole] = useState("editor");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isOwner = trip.role === "owner";
  const members = trip.members ?? [];

  async function run(action) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const makeLink = () =>
    run(async () => {
      const res = await api(`/trips/${trip.id}/invites`, { method: "POST", body: { role: inviteRole } });
      setLink({ ...res, url: `${window.location.origin}/join/${res.token}` });
      setCopied(false);
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // No clipboard access (http, old browser): the link is selectable below.
    }
  }

  const cancelLinks = () =>
    run(async () => {
      if (!window.confirm("Cancel every invite link made so far? People already on the trip stay.")) return;
      await api(`/trips/${trip.id}/invites/reset`, { method: "POST" });
      setLink(null);
    });

  const changeRole = (member, role) =>
    run(async () => {
      await api(`/trips/${trip.id}/members/${member.user_id}`, { method: "PATCH", body: { role } });
      await refreshTrip(trip.id);
    });

  const remove = (member) =>
    run(async () => {
      if (!window.confirm(`Remove ${member.email} from this trip?`)) return;
      await api(`/trips/${trip.id}/members/${member.user_id}`, { method: "DELETE" });
      await refreshTrip(trip.id);
    });

  const leave = () =>
    run(async () => {
      if (!window.confirm(`Leave "${trip.name}"? You'll need a new invite to come back.`)) return;
      await api(`/trips/${trip.id}/members/${user.id}`, { method: "DELETE" });
      await refreshList();
      navigate("/");
    });

  return (
    <div className="tab-body share-panel">
      <div className="panel-row">
        <h2>Sharing</h2>
        <button onClick={onClose}>Done</button>
      </div>
      {!online && <p className="muted small">Sharing needs a connection.</p>}

      <ul className="member-list">
        {members.map((m) => (
          <li key={m.user_id}>
            <span className="member-name">
              {m.email}
              {m.user_id === user?.id && <span className="muted small"> (you)</span>}
            </span>
            {isOwner && m.role !== "owner" ? (
              <span className="member-actions">
                <select
                  aria-label={`Role of ${m.email}`}
                  value={m.role}
                  disabled={busy || !online}
                  onChange={(e) => changeRole(m, e.target.value)}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button className="danger link" disabled={busy || !online} onClick={() => remove(m)}>
                  Remove
                </button>
              </span>
            ) : (
              <span className="muted small">{ROLE_TEXT[m.role]}</span>
            )}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="invite">
          <h3>Invite people</h3>
          <p className="muted small">
            Anyone who opens the link while logged in joins the trip. It works for 7 days; send it only to people you
            mean to invite.
          </p>
          <div className="form-actions">
            <select aria-label="Invite as" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="primary" disabled={busy || !online} onClick={makeLink}>
              Create invite link
            </button>
          </div>
          {link && (
            <div className="invite-link">
              <input readOnly value={link.url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
              <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
              <p className="muted small">
                {ROLE_TEXT[link.role]} · expires {new Date(link.expires_at).toLocaleDateString()}
              </p>
            </div>
          )}
          <button className="link small" disabled={busy || !online} onClick={cancelLinks}>
            Cancel all invite links
          </button>
        </div>
      ) : (
        <button className="danger link" disabled={busy || !online} onClick={leave}>
          Leave this trip
        </button>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
