import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { useAuth } from "./auth/context.js";
import AppMenu from "./components/AppMenu.jsx";
import { SyncBar, UpdateBanner } from "./components/common.jsx";
import LoginPage from "./pages/LoginPage.jsx";
// Each page is its own JS file, downloaded when it's first opened: the login
// screen no longer downloads the trip page (drag-and-drop, tabs, map glue).
// The service worker still precaches all of them, so they work offline.
const TripPage = lazy(() => import("./pages/TripPage.jsx"));
const TripsPage = lazy(() => import("./pages/TripsPage.jsx"));
const JoinPage = lazy(() => import("./pages/JoinPage.jsx"));

// Pages that need a logged-in user. While the stored token is still being
// checked (user === undefined) show nothing instead of flashing the login page.
// Not logged in: go to the login page, and come back here afterwards (an
// invite link opened while logged out lands on the invite after logging in).
function RequireLogin({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <p className="muted center">Loading…</p>;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Header() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  // The trip page is all map, like Google Maps: its menu lives in the drawer.
  if (!user || pathname.startsWith("/trips/")) return null;

  return (
    <header className="app-header">
      <Link to="/" className="brand">
        <span aria-hidden="true">✈</span> TripSync
      </Link>
      <div className="header-menu">
        <button className="icon-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          ☰
        </button>
        {menu && (
          <div className="menu-popover" onClick={(e) => e.stopPropagation()}>
            <AppMenu onNavigate={() => setMenu(false)} />
          </div>
        )}
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
        <Route
          path="/join/:token"
          element={
            <RequireLogin>
              <JoinPage />
            </RequireLogin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </div>
  );
}
