import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../auth/context.js";
import { useTrip } from "../store/hooks.js";
import { refreshTrip } from "../store/store.js";
import { useLanguage } from "../settings.js";
import { guessHomeCurrency, loadRates } from "../trip/currency.js";
import { dayRouteRequest, loadRoute } from "../trip/routes.js";
import docCss from "../trip/trip-document.css?raw";
import TripDocument from "../trip/TripDocument.jsx";

// /trips/<id>/print: the trip as a document.
// "Save as PDF" = the browser's own print dialog (every browser can print to
// PDF), so no PDF library is needed, nothing is generated on the server, and
// it works offline. The same document can be downloaded as the keepsake file.
export default function PrintPage() {
  const { tripId } = useParams();
  const trip = useTrip(tripId);
  const { user } = useAuth();
  const lang = useLanguage();
  const [rates, setRates] = useState(null);
  const [routes, setRoutes] = useState({});
  const [saving, setSaving] = useState(null); // keepsake progress text

  useEffect(() => {
    refreshTrip(tripId);
  }, [tripId]);

  const home = trip?.home_currency ?? guessHomeCurrency();
  useEffect(() => {
    loadRates(home).then((r) => setRates(r?.rates ?? null));
  }, [home]);

  // Routes (travel times, and the real path for the sketch map). Usually
  // already on the device from viewing the trip, so these cost nothing.
  const days = trip?.days;
  const lodgings = trip?.lodgings;
  useEffect(() => {
    if (!days) return;
    let cancelled = false;
    (async () => {
      for (const day of days) {
        const req = dayRouteRequest(day, lang, lodgings ?? []);
        if (!req) continue;
        const route = await loadRoute(req.mode, req.points, req.date, req.lang);
        if (cancelled) return;
        if (route && !route.none) setRoutes((r) => ({ ...r, [day.id]: route }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days, lodgings, lang]);
  const routeFor = useCallback((day) => routes[day.id] ?? null, [routes]);

  async function keepsake() {
    setSaving("Collecting photos…");
    try {
      // Loaded only when needed: it brings React's HTML renderer (~150 kB).
      const { buildKeepsake, downloadFile, keepsakeFileName } = await import("../trip/keepsake.js");
      const html = await buildKeepsake(trip, {
        rates,
        routeFor,
        meId: user?.id,
        onProgress: (done, total) => setSaving(`Collecting photos ${done}/${total}…`),
      });
      downloadFile(keepsakeFileName(trip.name), html);
      setSaving(null);
    } catch (err) {
      setSaving(`Couldn't make the file: ${err.message}`);
    }
  }

  if (!trip) {
    return (
      <main className="page">
        <p className="muted">{trip === null ? "This trip doesn't exist." : "Loading…"}</p>
      </main>
    );
  }

  return (
    <main className="print-page">
      <style>{docCss}</style>
      <div className="print-toolbar">
        <Link to={`/trips/${trip.id}`}>← Back to the trip</Link>
        <span className="grow" />
        <button className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button onClick={keepsake} disabled={saving?.endsWith("…")}>
          Download keepsake
        </button>
        {saving && <span className="muted small">{saving}</span>}
      </div>
      <p className="muted small print-hint">
        PDF: press "Print / Save as PDF" and choose "Save as PDF" as the printer. Keepsake: one .html file with
        everything inside, photos included; it opens in any browser, offline, forever.
      </p>
      <TripDocument trip={trip} rates={rates} routeFor={routeFor} meId={user?.id} />
    </main>
  );
}
