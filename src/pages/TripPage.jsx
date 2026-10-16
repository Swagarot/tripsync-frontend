import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import AppMenu from "../components/AppMenu.jsx";
import { TripForm } from "../components/forms.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import { addDays, formatDay, formatRange } from "../dates.js";
import { centerOf } from "../geo.js";
import { useStore, useTrip } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshTrip } from "../store/store.js";
import { TripViewContext } from "../trip/context.js";
import ExpensesTab from "../trip/ExpensesTab.jsx";
import IdeasTab from "../trip/IdeasTab.jsx";
import ItineraryTab from "../trip/ItineraryTab.jsx";
import NotesTab from "../trip/NotesTab.jsx";
import { RTL_LANGUAGES, useLanguage } from "../settings.js";
import { dayRouteRequest, loadRoute } from "../trip/routes.js";
import { cellKey, dayLocation, dayWeather, loadForecast } from "../trip/weather.js";
import WeatherTab from "../trip/WeatherTab.jsx";

// Map-first trip page, laid out like Google Maps: the map fills the screen, a
// search bar floats on top (quick add), and everything else lives in a drawer
// that ☰ opens: from the left, or the right for right-to-left languages.
// On phones the drawer is a bottom sheet you drag up and down.
const TripMap = lazy(() => import("../components/TripMap.jsx"));

const TABS = [
  ["itinerary", "Itinerary"],
  ["ideas", "Ideas"],
  ["expenses", "Expenses"],
  ["notes", "Notes"],
  ["weather", "Weather"],
];

const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

// Loads a route for every day with 2+ placed stops, once the stops have
// stopped changing for a moment (dragging fires several changes in a row and
// each route request counts against the daily quota). routeFor(day) only
// hands out a route that matches the day's CURRENT stops and mode.
function useRoutes(days) {
  const [routes, setRoutes] = useState({});
  const lang = useLanguage();
  const requests = days.map((d) => dayRouteRequest(d, lang)).filter(Boolean);
  // A plain string as the effect's dependency: it only changes when some
  // day's stops or mode really change, not on every render.
  const signature = JSON.stringify(requests.map((r) => [r.key, r.mode, r.points, r.date, r.lang]));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const [key, mode, points, date, language] of JSON.parse(signature)) {
        const route = await loadRoute(mode, points, date, language);
        if (cancelled) return;
        if (route) setRoutes((prev) => ({ ...prev, [key]: route }));
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signature]);

  return useCallback(
    (day) => {
      const request = dayRouteRequest(day, lang);
      const route = request && routes[request.key];
      return route && !route.none ? route : null;
    },
    [routes, lang],
  );
}

// Forecasts for the places the trip's dated days happen in (one request per
// ~10 km area). weatherFor(day): undefined = nothing to show (no date, too far
// ahead, still loading), null = the day has no location at all.
function useWeather(trip) {
  const [forecasts, setForecasts] = useState({});
  const cells = [];
  for (const day of trip?.days ?? []) {
    const loc = day.date && dayLocation(day, trip);
    if (loc && !cells.some((c) => cellKey(c) === cellKey(loc))) cells.push(loc);
  }
  const signature = JSON.stringify(cells.map((c) => [cellKey(c), c.lat, c.lng]));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const [key, lat, lng] of JSON.parse(signature)) {
        const days = await loadForecast({ lat, lng });
        if (cancelled) return;
        if (days) setForecasts((prev) => ({ ...prev, [key]: days }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return useCallback(
    (day) => {
      if (!day.date) return undefined;
      const loc = dayLocation(day, trip);
      if (!loc) return null;
      const forecast = forecasts[cellKey(loc)]?.find((f) => f.date === day.date);
      return forecast ? dayWeather(day, forecast) : undefined;
    },
    [forecasts, trip],
  );
}

export default function TripPage() {
  const { tripId } = useParams();
  const trip = useTrip(tripId);
  const { online } = useStore();
  const [highlight, setHighlight] = useState(null);
  const [preview, setPreview] = useState(null);
  const [tab, setTab] = useState("itinerary");
  // Like Google Maps: the map first, the drawer closed until ☰ opens it.
  // (On phones "closed" = the bottom sheet's small peek, "open" = half height.)
  const [open, setOpen] = useState(false);
  const routeFor = useRoutes(trip?.days ?? []);
  const weatherFor = useWeather(trip);
  const language = useLanguage();
  // Hebrew reads right to left, so the drawer and search bar sit on the right.
  const side = RTL_LANGUAGES.has(language) ? "right" : "left";

  // Show the stored copy right away, fetch a fresh one in the background.
  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

  // Clicking a pin opens the drawer on the right tab and scrolls to the stop.
  const focus = useCallback(
    (id) => {
      setHighlight(id);
      setOpen(true);
      if (trip?.ideas?.some((i) => i.id === id)) setTab("ideas");
      else if (trip?.days.some((d) => d.stops.some((s) => s.id === id))) setTab("itinerary");
      setTimeout(() => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    },
    [trip],
  );
  const view = useMemo(
    () => ({ highlight, setHighlight, preview, setPreview, focus, routeFor, weatherFor, drawerOpen: open, side }),
    [highlight, preview, focus, routeFor, weatherFor, open, side],
  );

  if (!trip) {
    return (
      <main className="page">
        <Link to="/" className="back">
          ← All trips
        </Link>
        {trip === null ? (
          <p>This trip doesn't exist (or was deleted).</p>
        ) : online ? (
          <p className="muted">Loading…</p>
        ) : (
          <p className="muted">You're offline, and this trip hasn't been opened on this device before.</p>
        )}
      </main>
    );
  }

  const pinned = trip.days.flatMap((d) => d.stops).filter((s) => s.lat != null);
  const near = centerOf(pinned) ?? (trip.dest_lat != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null);
  const badDays = trip.days.filter((d) => weatherFor(d)?.warnings.some((w) => w.level === "warn")).length;

  // Where the search bar can put a place: any day, a brand-new day, or Ideas.
  const targets = [
    ...trip.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}${d.date ? ` · ${formatDay(d.date)}` : ""}` })),
    { id: "new-day", label: "A new day" },
    { id: "ideas", label: "Ideas (no day yet)" },
  ];

  async function quickAdd(fields, target) {
    if (target === "ideas") return dispatch(op.createItem("ideas", trip.id, fields));
    let dayId = target;
    if (target === "new-day") {
      const last = trip.days.at(-1)?.date;
      const newDay = op.createDay(trip.id, { date: last ? addDays(last, 1) : (trip.start_date ?? null) });
      await dispatch(newDay);
      dayId = newDay.dayId;
    }
    return dispatch(op.createStop(trip.id, dayId, fields));
  }

  return (
    <TripViewContext.Provider value={view}>
      <main className={`trip-screen side-${side}${open ? " drawer-open" : ""}`}>
        <div className="map-layer">
          <Suspense fallback={<div className="map map-placeholder">Loading map…</div>}>
            <TripMap days={trip.days} trip={trip} />
          </Suspense>
        </div>
        <PlaceSearch
          compact
          near={near}
          targets={targets}
          addLabel="Add"
          onAdd={quickAdd}
          leading={
            <button
              className="icon-btn menu-btn"
              aria-label={open ? "Close trip panel" : "Open trip panel"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              ☰
            </button>
          }
        />
        <Drawer trip={trip} tab={tab} setTab={setTab} badDays={badDays} open={open} setOpen={setOpen}>
          {tab === "itinerary" && <ItineraryTab trip={trip} near={near} />}
          {tab === "ideas" && <IdeasTab trip={trip} near={near} />}
          {tab === "expenses" && <ExpensesTab trip={trip} />}
          {tab === "notes" && <NotesTab key={trip.id} trip={trip} />}
          {tab === "weather" && <WeatherTab trip={trip} />}
        </Drawer>
      </main>
    </TripViewContext.Provider>
  );
}

// --- The drawer (desktop) / bottom sheet (phone) ---------------------------------

const SHEET_SNAPS = { peek: 0.16, half: 0.5, full: 0.92 }; // share of the screen height

function Drawer({ trip, tab, setTab, badDays, open, setOpen, children }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [full, setFull] = useState(false); // phone: half or full height when open
  const [dragHeight, setDragHeight] = useState(null);
  const drag = useRef(null);
  const sheet = !open ? "peek" : full ? "full" : "half";

  // Desktop: Escape closes the drawer.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && isDesktop() && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Phone: dragging the handle resizes the sheet live; letting go snaps it to
  // the nearest of peek / half / full.
  function onHandleDown(e) {
    if (isDesktop()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startHeight: e.currentTarget.parentElement.getBoundingClientRect().height };
  }
  function onHandleMove(e) {
    if (!drag.current) return;
    setDragHeight(Math.max(80, drag.current.startHeight + (drag.current.startY - e.clientY)));
  }
  function onHandleUp() {
    if (!drag.current) return;
    drag.current = null;
    if (dragHeight != null) {
      const share = dragHeight / window.innerHeight;
      const nearest = Object.entries(SHEET_SNAPS).sort((a, b) => Math.abs(a[1] - share) - Math.abs(b[1] - share))[0][0];
      setOpen(nearest !== "peek");
      setFull(nearest === "full");
    }
    setDragHeight(null);
  }
  const cycleSheet = () => {
    if (!open) setOpen(true);
    else if (!full) setFull(true);
    else {
      setFull(false);
      setOpen(false);
    }
  };

  function deleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" with everything in it?`)) return;
    dispatch(op.deleteTrip(trip.id));
    navigate("/");
  }

  const style = dragHeight != null ? { "--sheet-height": `${dragHeight}px` } : undefined;

  return (
    <aside
      className={`drawer sheet-${sheet}${open ? " open" : ""}${dragHeight != null ? " dragging" : ""}`}
      style={style}
      aria-label="Trip planner"
      aria-hidden={!open && isDesktop() ? true : undefined}
    >
      <div
        className="sheet-handle"
        role="button"
        tabIndex={0}
        aria-label="Resize panel"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onClick={() => dragHeight == null && cycleSheet()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && cycleSheet()}
      >
        <span />
      </div>

      <header className="drawer-head">
        <div className="panel-title">
          <h1>{trip.name}</h1>
          <p className="muted small">
            {[trip.destination, formatRange(trip.start_date, trip.end_date), `${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="panel-actions">
          <button onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</button>
          <button className="icon-btn close-btn" aria-label="Close trip panel" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      </header>

      {editing ? (
        <div className="drawer-body">
          <div className="tab-body">
            <TripForm
              trip={trip}
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                await dispatch(op.updateTrip(trip.id, values));
                setEditing(false);
              }}
            />
            <button className="danger link" onClick={deleteTrip}>
              Delete trip
            </button>
          </div>
        </div>
      ) : (
        <>
          <nav className="tabs-bar" role="tablist">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                  setOpen(true);
                }}
              >
                {label}
                {id === "weather" && badDays > 0 && (
                  <span className="tab-badge" title={`${badDays} day(s) with a weather warning`}>
                    {badDays}
                  </span>
                )}
                {id === "ideas" && trip.ideas?.length > 0 && <span className="tab-count">{trip.ideas.length}</span>}
              </button>
            ))}
          </nav>
          <div className="drawer-body">{children}</div>
        </>
      )}

      {/* App-wide settings: all trips, names language, theme, account. */}
      <details className="drawer-footer">
        <summary>☰ Menu &amp; settings</summary>
        <AppMenu />
      </details>
    </aside>
  );
}
