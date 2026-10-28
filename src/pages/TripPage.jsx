import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import AppMenu from "../components/AppMenu.jsx";
import { TripForm } from "../components/forms.jsx";
import { HomeIcon } from "../components/icons.jsx";
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
import SharePanel from "../trip/SharePanel.jsx";
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

const NO_STAYS = []; // a stable empty list (a new [] each render would re-run effects)

const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

// Loads a route for every day with 2+ placed stops, once the stops have
// stopped changing for a moment (dragging fires several changes in a row and
// each route request counts against the daily quota). routeFor(day) only
// hands out a route that matches the day's CURRENT stops and mode.
function useRoutes(days, lodgings) {
  const [routes, setRoutes] = useState({});
  const lang = useLanguage();
  const requests = days.map((d) => dayRouteRequest(d, lang, lodgings)).filter(Boolean);
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
      const request = dayRouteRequest(day, lang, lodgings);
      const route = request && routes[request.key];
      return route && !route.none ? route : null;
    },
    [routes, lang, lodgings],
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
  const routeFor = useRoutes(trip?.days ?? [], trip?.lodgings ?? NO_STAYS);
  const weatherFor = useWeather(trip);
  const language = useLanguage();
  // Hebrew reads right to left, so the drawer and search bar sit on the right.
  const side = RTL_LANGUAGES.has(language) ? "right" : "left";

  // Show the stored copy right away, fetch a fresh one in the background.
  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

  // Shared trips: pick up other people's changes by asking again every 20 s
  // while the page is visible ("polling"; live push via websockets is out of
  // scope). Your own pending changes are re-applied on top of each fresh copy
  // (store.js), so nothing you're typing gets lost. Changes to the same field
  // from two people: the one saved last wins.
  const sharedTrip = (trip?.members?.length ?? 0) > 1;
  useEffect(() => {
    if (!sharedTrip) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) refreshTrip(tripId);
    }, 20_000);
    return () => clearInterval(timer);
  }, [sharedTrip, tripId]);

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
          <p>This trip doesn't exist, was deleted, or you're no longer on it.</p>
        ) : online ? (
          <p className="muted">Loading…</p>
        ) : (
          <p className="muted">You're offline, and this trip hasn't been opened on this device before.</p>
        )}
      </main>
    );
  }

  const readOnly = trip.role === "viewer";
  const pinned = trip.days.flatMap((d) => d.stops).filter((s) => s.lat != null);
  const near = centerOf(pinned) ?? (trip.dest_lat != null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null);
  const badDays = trip.days.filter((d) => weatherFor(d)?.warnings.some((w) => w.level === "warn")).length;

  // Where the search bar can put a place: any day, a brand-new day, or Ideas.
  const targets = [
    ...trip.days.map((d, i) => ({ id: d.id, label: `Day ${i + 1}${d.date ? ` · ${formatDay(d.date)}` : ""}` })),
    { id: "new-day", label: "A new day" },
    { id: "ideas", label: "Ideas (no day yet)" },
    { id: "stay", label: "Where I'm staying" },
  ];

  async function quickAdd(fields, target) {
    if (target === "ideas") return dispatch(op.createItem("ideas", trip.id, fields));
    if (target === "stay") {
      // Dates default to the whole trip; adjust them in "Where you're staying".
      return dispatch(op.createItem("lodgings", trip.id, {
        ...fields, check_in: trip.start_date ?? null, check_out: trip.end_date ?? null, bookends: true,
      }));
    }
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
          targets={readOnly ? null : targets}
          addLabel="Add"
          onAdd={readOnly ? null : quickAdd}
          leading={
            <>
              <button
                className="icon-btn menu-btn"
                aria-label={open ? "Close trip panel" : "Open trip panel"}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
              >
                ☰
              </button>
              <Link to="/" className="icon-btn home-btn" aria-label="All trips" title="All trips">
                <HomeIcon />
              </Link>
            </>
          }
        />
        <Drawer trip={trip} tab={tab} setTab={setTab} badDays={badDays} open={open} setOpen={setOpen} readOnly={readOnly}>
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

const SHEET_SNAPS = { half: 0.5, full: 0.92 }; // share of the screen height
const SHEET_PEEK_PX = 150; // same as .drawer.sheet-peek in index.css

function Drawer({ trip, tab, setTab, badDays, open, setOpen, readOnly, children }) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState(null); // null = the tabs, "edit" = trip details, "share" = sharing
  const togglePanel = (name) => setPanel((p) => (p === name ? null : name));
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

  // Phone: dragging the sheet's top (the handle bar and the trip name under
  // it, a ~90 px tall target instead of a thin bar) resizes it live; letting
  // go snaps it to peek / half / full. A quick flick counts too: a short fast
  // swipe moves it one step that way. A touch only becomes a drag after moving a few pixels,
  // so the buttons in the header (home, Edit) still work as normal taps.
  const sheetRef = useRef(null);
  const suppressClick = useRef(false);
  function onSheetDown(e) {
    suppressClick.current = false;
    if (isDesktop() || !e.target.closest(".sheet-handle, .drawer-head")) return;
    drag.current = {
      id: e.pointerId,
      startY: e.clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
      moving: false,
      lastY: e.clientY,
      lastT: e.timeStamp,
      speed: 0, // px per ms, positive = upwards
      height: null,
    };
  }
  function onSheetMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moving) {
      if (Math.abs(e.clientY - d.startY) < 6) return;
      d.moving = true;
      // From now on this element gets the moves even if the finger leaves it.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.speed = (d.lastY - e.clientY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.height = Math.min(window.innerHeight * SHEET_SNAPS.full, Math.max(80, d.startHeight + (d.startY - e.clientY)));
    setDragHeight(d.height);
  }
  function onSheetUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d?.moving) return;
    // The click that follows a drag must not also toggle the sheet.
    suppressClick.current = true;
    const heights = [SHEET_PEEK_PX, window.innerHeight * SHEET_SNAPS.half, window.innerHeight * SHEET_SNAPS.full];
    const nearest = (h) => heights.reduce((best, x, i) => (Math.abs(x - h) < Math.abs(heights[best] - h) ? i : best), 0);
    let target = nearest(d.height); // a slow drag: wherever it was let go
    // A flick (fast, and not held still before letting go): at least one
    // step in its direction from where the drag started, like Google Maps.
    const speed = e.timeStamp - d.lastT > 100 ? 0 : d.speed;
    const from = nearest(d.startHeight);
    if (speed > 0.4) target = Math.max(target, Math.min(from + 1, 2));
    if (speed < -0.4) target = Math.min(target, Math.max(from - 1, 0));
    setOpen(target > 0);
    setFull(target === 2);
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
      ref={sheetRef}
      className={`drawer sheet-${sheet}${open ? " open" : ""}${dragHeight != null ? " dragging" : ""}`}
      style={style}
      aria-label="Trip planner"
      aria-hidden={!open && isDesktop() ? true : undefined}
      onPointerDown={onSheetDown}
      onPointerMove={onSheetMove}
      onPointerUp={onSheetUp}
      onPointerCancel={onSheetUp}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <div
        className="sheet-handle"
        role="button"
        tabIndex={0}
        aria-label="Resize panel"
        onClick={cycleSheet}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && cycleSheet()}
      >
        <span />
      </div>

      <header className="drawer-head">
        <Link to="/" className="icon-btn home-btn" aria-label="All trips" title="All trips">
          <HomeIcon />
        </Link>
        <div className="panel-title">
          <h1>{trip.name}</h1>
          <p className="muted small">
            {[trip.destination, formatRange(trip.start_date, trip.end_date), `${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {trip.role && trip.role !== "owner" && (
            <p className="shared-note small">
              Shared by {trip.members?.find((m) => m.role === "owner")?.email.split("@")[0] ?? "someone"} ·{" "}
              {readOnly ? "you can view" : "you can edit"}
            </p>
          )}
        </div>
        <div className="panel-actions">
          <button aria-pressed={panel === "share"} onClick={() => togglePanel("share")}>
            Share
          </button>
          {!readOnly && (
            <button aria-pressed={panel === "edit"} onClick={() => togglePanel("edit")}>
              {panel === "edit" ? "Close" : "Edit"}
            </button>
          )}
          <button className="icon-btn close-btn" aria-label="Close trip panel" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
      </header>

      {panel === "share" ? (
        <div className="drawer-body">
          <SharePanel trip={trip} onClose={() => setPanel(null)} />
        </div>
      ) : panel === "edit" ? (
        <div className="drawer-body">
          <div className="tab-body">
            <TripForm
              trip={trip}
              nameLocked={trip.role !== "owner"}
              onCancel={() => setPanel(null)}
              onSubmit={async (values) => {
                await dispatch(op.updateTrip(trip.id, values));
                setPanel(null);
              }}
            />
            {trip.role === "owner" && (
              <button className="danger link" onClick={deleteTrip}>
                Delete trip
              </button>
            )}
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
          <div className="drawer-body">
            {/* Viewers: every button and field inside is disabled at once. */}
            <fieldset className="read-only-scope" disabled={readOnly}>
              {children}
            </fieldset>
          </div>
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
