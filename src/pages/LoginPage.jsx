import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/context.js";
import { ErrorMessage } from "../components/common.jsx";

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const from = useLocation().state?.from;

  // Already logged in (or just succeeded): back to where you were going (an
  // invite link), else the trip list.
  if (user) return <Navigate to={from ?? "/"} replace />;

  const isRegister = mode === "register";

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (isRegister ? register : login)(email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="brand-mark" aria-hidden="true">
        ✈
      </div>
      <h1>TripSync</h1>
      <p className="muted">Plan trips day by day.</p>

      <div className="card auth-card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={!isRegister} onClick={() => setMode("login")}>
            Log in
          </button>
          <button role="tab" aria-selected={isRegister} onClick={() => setMode("register")}>
            Create account
          </button>
        </div>

        <form className="form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              maxLength={128}
              // Tells password managers which kind of form this is.
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {isRegister && <p className="hint">At least 8 characters.</p>}
          <ErrorMessage error={error} />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
