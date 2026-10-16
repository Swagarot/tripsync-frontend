import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { TripForm } from "../components/forms.jsx";
import { formatRange } from "../dates.js";
import { centerOf } from "../geo.js";
import { useStore, useTrip } from "../store/hooks.js";
import { op } from "../store/ops.js";
import { dispatch, refreshTrip } from "../store/store.js";
import { TripViewContext } from "../trip/context.js";
import ExpensesTab from "../trip/ExpensesTab.jsx";
import IdeasTab from "../trip/IdeasTab.jsx";
import ItineraryTab from "../trip/ItineraryTab.jsx";
import NotesTab from "../trip/NotesTab.jsx";
import { dayRouteRequest, loadRoute } from "../trip/routes.js";
import { cellKey, dayLocation, dayWeather, loadForecast } from "../trip/weather.js";
import WeatherTab from "../trip/WeatherTab.jsx";

// Map-first trip page: the map fills the screen, and everything else lives in
// a panel over it. Desktop: a frosted panel on the left (see-through until you
// use it, can be collapsed). Phone: a bottom sheet you drag up and down.
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
  const requests = days.map(dayRouteRequest).filter(Boolean);
  // A plain string as the effect's dependency: it only changes when some
  // day's stops or mode really change, not on every render.
  const signature = JSON.stringify(requests.map((r) => [r.key, r.mode, r.points]));

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const [key, mode, points] of JSON.parse(signature)) {
        const route = await loadRoute(mode, points);
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
      const request = dayRouteRequest(day);
      const route = request && routes[request.key];
      return route && !route.none ? route : null;
    },
    [routes],
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
  const routeFor = useRoutes(trip?.days ?? []);
  const weatherFor = useWeather(trip);

  // Show the stored copy right away, fetch a fresh one in the background.
  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

  // Clicking a pin opens the right tab and scrolls to the stop or idea.
  const focus = useCallback(
    (id) => {
      setHighlight(id);
      if (trip?.ideas?.some((i) => i.id === id)) setTab("ideas");
      else if (trip?.days.some((d) => d.stops.some((s) => s.id === id))) setTab("itinerary");
      setTimeout(() => document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    },
    [trip],
  );
  const view = useMemo(
    () => ({ highlight, setHighlight, preview, setPreview, focus, routeFor, weatherFor }),
    [highlight, preview, focus, routeFor, weatherFor],
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

  return (
    <TripViewContext.Provider value={view}>
      <main className="trip-screen">
        <div className="map-layer">
          <Suspense fallback={<div className="map map-placeholder">Loading map…</div>}>
            <TripMap days={trip.days} trip={trip} />
          </Suspense>
        </div>
        <Panel trip={trip} tab={tab} setTab={setTab} badDays={badDays}>
          {tab === "itinerary" && <ItineraryTab trip={trip} near={near} />}
          {tab === "ideas" && <IdeasTab trip={trip} near={near} />}
          {tab === "expenses" && <ExpensesTab trip={trip} />}
          {tab === "notes" && <NotesTab key={trip.id} trip={trip} />}
          {tab === "weather" && <WeatherTab trip={trip} />}
        </Panel>
      </main>
    </TripViewContext.Provider>
  );
}

// --- The panel / bottom sheet ---------------------------------------------------

const SHEET_SNAPS = { peek: 0.18, half: 0.5, full: 0.92 }; // share of the screen height

function Panel({ trip, tab, setTab, badDays, children }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState("half");
  const [dragHeight, setDragHeight] = useState(null);
  const drag = useRef(null);

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
      setSheet(nearest);
    }
    setDragHeight(null);
  }
  const cycleSheet = () => setSheet((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"));

  function deleteTrip() {
    if (!window.confirm(`Delete "${trip.name}" with everything in it?`)) return;
    dispatch(op.deleteTrip(trip.id));
    navigate("/");
  }

  if (collapsed) {
    return (
      <button className="panel-reopen" onClick={() => setCollapsed(false)}>
        ☰ {trip.name}
      </button>
    );
  }

  const style = dragHeight != null ? { "--sheet-height": `${dragHeight}px` } : undefined;

  return (
    <aside className={`panel sheet-${sheet}${dragHeight != null ? " dragging" : ""}`} style={style} aria-label="Trip planner">
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

      <header className="panel-head">
        <div className="panel-title">
          <Link to="/" className="back small">
            ← All trips
          </Link>
          <h1>{trip.name}</h1>
          <p className="muted small">
            {[trip.destination, formatRange(trip.start_date, trip.end_date), `${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="panel-actions">
          <button onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</button>
          <button className="collapse-btn" aria-label="Hide panel" onClick={() => setCollapsed(true)}>
            ⟨
          </button>
        </div>
      </header>

      {editing ? (
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
                  if (sheet === "peek") setSheet("half");
                }}
              >
                {label}
                {id === "weather" && badDays > 0 && <span className="tab-badge" title={`${badDays} day(s) with a weather warning`}>{badDays}</span>}
                {id === "ideas" && trip.ideas?.length > 0 && <span className="tab-count">{trip.ideas.length}</span>}
              </button>
            ))}
          </nav>
          <div className="panel-body">{children}</div>
        </>
      )}
    </aside>
  );
}
