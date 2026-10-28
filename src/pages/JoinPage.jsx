import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api } from "../api.js";
import { ErrorMessage } from "../components/common.jsx";
import { refreshList } from "../store/store.js";

// /join/<token>: the page an invite link opens. Shows what you're being invited
// to, and joins only when you press the button (so a link preview or a stray
// click can't add you to someone's trip). Not logged in? RequireLogin sends you
// to the login page first and back here afterwards.
const ROLE_TEXT = { editor: "plan and edit", viewer: "view" };

export default function JoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(undefined); // undefined = loading
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/invites/${token}`)
      .then(setInvite)
      .catch((err) => {
        setInvite(null);
        setError(err);
      });
  }, [token]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/invites/${token}/accept`, { method: "POST" });
      await refreshList();
      navigate(`/trips/${res.trip_id}`, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="card join-card">
        {invite === undefined && <p className="muted">Loading invite…</p>}
        {invite && (
          <>
            <p className="muted small">Trip invite</p>
            <h1>{invite.trip_name}</h1>
            {invite.destination && <p className="muted">{invite.destination}</p>}
            {invite.your_role ? (
              <>
                <p>You're already on this trip.</p>
                <Link className="button primary" to={`/trips/${invite.trip_id}`}>
                  Open it
                </Link>
              </>
            ) : (
              <>
                <p>
                  <strong>{invite.owner_email}</strong> invited you to {ROLE_TEXT[invite.role]} this trip with them.
                </p>
                <div className="form-actions">
                  <button className="primary" disabled={busy} onClick={join}>
                    {busy ? "Joining…" : "Join trip"}
                  </button>
                  <Link to="/">Not now</Link>
                </div>
              </>
            )}
          </>
        )}
        <ErrorMessage error={error} />
        {invite === null && <Link to="/">Back to your trips</Link>}
      </div>
    </main>
  );
}
