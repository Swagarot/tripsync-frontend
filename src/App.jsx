import { lazy, Suspense, useEffect, useRef } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { useAuth } from "./auth/context.js";
import { SyncBar, UpdateBanner } from "./components/common.jsx";
import LoginPage from "./pages/LoginPage.jsx";
// Each page is its own JS file, downloaded when it's first opened: the login
// screen no longer downloads the trip page (drag-and-drop, tabs, map glue).
// The service worker still precaches all of them, so they work offline.
const TripPage = lazy(() => import("./pages/TripPage.jsx"));
const TripsPage = lazy(() => import("./pages/TripsPage.jsx"));
import { LANGUAGES, setLanguage, useLanguage } from "./settings.js";
import { useSyncStatus } from "./store/hooks.js";

// Pages that need a logged-in user. While the stored token is still being
// checked (user === undefined) show nothing instead of flashing the login page.
function RequireLogin({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <p className="muted center">Loading…</p>;
  if (user === null) return <Navigate to="/login" replace />;
  return children;
}

function Header() {
  const { user, logout } = useAuth();
  const { pending } = useSyncStatus();
  const language = useLanguage();
  if (!user) return null;

  // Logging out wipes this device's copy, including changes not yet synced.
  const confirmLogout = () => {
    if (pending === 0 || window.confirm(`${pending} change(s) haven't synced yet and will be lost. Log out anyway?`)) {
      logout();
    }
  };

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <span aria-hidden="true">✈</span> TripSync
      </Link>
      <div className="account">
        {/* Language for names: map labels, transit, place details. */}
        <select
          className="language-select"
          aria-label="Language for map and place names"
          title="Language for map and place names"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              🌐 {name}
            </option>
          ))}
        </select>
        <span className="muted small email">{user.email}</span>
        <button className="link" onClick={confirmLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

// The sticky header + status bars change height (a bar appears when offline).
// Publish the current height as a CSS variable, so the trip page's map can
// sit exactly below it.
function useTopHeight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--top-height", `${el.offsetHeight}px`),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function App() {
  const topRef = useTopHeight();
  // The URL decides which page shows. nginx's try_files (and, offline, the
  // service worker) send every unknown path to index.html, so reloading
  // /trips/<id> still lands here.
  return (
    <div className="app">
      <div className="top" ref={topRef}>
        <Header />
        <SyncBar />
        <UpdateBanner />
      </div>
      <Suspense fallback={<p className="muted center">Loading…</p>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireLogin>
              <TripsPage />
            </RequireLogin>
          }
        />
        <Route
          path="/trips/:tripId"
          element={
            <RequireLogin>
              <TripPage />
            </RequireLogin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </div>
  );
}
