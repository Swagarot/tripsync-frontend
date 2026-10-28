// The whole trip as a document: what the print page shows (and the browser
// turns into a PDF), and what the keepsake file contains. Plain markup and
// its own stylesheet (trip-document.css), no app state, so it can also be
// rendered to an HTML string with renderToStaticMarkup.
//
// images: optional { originalUrl: dataUrl } map. The keepsake passes every
// photo embedded as data, so the file has no links that can break later.
import { dayColor } from "../colors.js";
import { formatDay, formatRange } from "../dates.js";
import { EXPENSE_CATEGORIES, categoryIcon } from "./categories.js";
import { formatMoney, totals } from "./currency.js";
import { sketchMap } from "./export.js";
import { personName } from "./people.js";
import { coverUrl } from "./photos.js";
import { balances, settleUp } from "./split.js";
import { dayEnds } from "./stays.js";

const MODE_TEXT = { walk: "on foot", bike: "by bike", drive: "by car", transit: "by public transport" };

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function minutes(seconds) {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export default function TripDocument({ trip, rates, routeFor, images = {}, meId = null, exportedAt = new Date() }) {
  const img = (url) => (url ? (images[url] ?? url) : null);
  const days = trip.days ?? [];
  const lodgings = trip.lodgings ?? [];
  const places = days.reduce((n, d) => n + d.stops.length, 0);
  const members = trip.members ?? [];
  const home = trip.home_currency ?? "EUR";
  const expenses = trip.expenses ?? [];
  const sum = totals(expenses, rates);
  const map = sketchMap(days, lodgings, (d) => routeFor?.(d)?.geometry);

  return (
    <article className="trip-doc">
      <header className="doc-head">
        <p className="doc-kicker">TripSync</p>
        <h1>{trip.name}</h1>
        <p className="doc-sub">
          {[trip.destination, formatRange(trip.start_date, trip.end_date), plural(days.length, "day"), plural(places, "place")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {members.length > 1 && (
          <p className="doc-sub">With {members.map((m) => m.email.split("@")[0]).join(", ")}</p>
        )}
      </header>

      {map && (
        <figure className="doc-map">
          <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label="Map of the trip's route">
            <rect width={map.width} height={map.height} rx="12" className="doc-map-bg" />
            {map.lines.map((line, i) =>
              line.length > 1 ? (
                <polyline key={`l${i}`} points={line.map((p) => p.join(",")).join(" ")} stroke={dayColor(i)} />
              ) : null,
            )}
            {map.stays.map(([x, y], i) => (
              <g key={`s${i}`} className="doc-map-stay">
                <rect x={x - 9} y={y - 9} width="18" height="18" rx="4" />
                <text x={x} y={y + 3.5}>
                  H
                </text>
              </g>
            ))}
            {map.pins.map((pins, i) =>
              pins.map(([x, y], j) => (
                <g key={`p${i}-${j}`}>
                  <circle cx={x} cy={y} r="9" fill={dayColor(i)} />
                  <text x={x} y={y + 3.5}>
                    {j + 1}
                  </text>
                </g>
              )),
            )}
          </svg>
          <figcaption>
            {map.stays.length > 0 && (
              <span>
                <i className="doc-key-stay" /> Where you stay
              </span>
            )}
            {days.map((d, i) => (
              <span key={d.id}>
                <i style={{ background: dayColor(i) }} /> Day {i + 1}
              </span>
            ))}
          </figcaption>
        </figure>
      )}

      {lodgings.length > 0 && (
        <section>
          <h2>Where you're staying</h2>
          <ul className="doc-list">
            {lodgings.map((s) => (
              <li key={s.id}>
                <strong>🛏 {s.name}</strong>
                <span className="doc-muted">
                  {[s.check_in && s.check_out ? `${formatDay(s.check_in)} – ${formatDay(s.check_out)}` : null, s.address]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {days.map((day, i) => {
        const route = routeFor?.(day);
        const ends = dayEnds(day, lodgings);
        return (
          <section key={day.id} className="doc-day">
            <h2>
              <span className="doc-badge" style={{ background: dayColor(i) }}>
                {i + 1}
              </span>
              Day {i + 1}
              {day.date && <span className="doc-muted"> · {formatDay(day.date)}</span>}
            </h2>
            {day.title && <p className="doc-title">{day.title}</p>}
            {route && (
              <p className="doc-muted">
                {minutes(route.duration_s)} {MODE_TEXT[day.travel_mode ?? "walk"]}
                {route.distance_m > 0 && ` · ${(route.distance_m / 1000).toFixed(1)} km`}
              </p>
            )}
            {day.notes && <p className="doc-notes">{day.notes}</p>}
            <ol className="doc-stops">
              {ends.start && <li className="doc-stay">Start at {ends.start.name}</li>}
              {day.stops.map((stop) => {
                const photo = img(coverUrl(stop));
                const own = (stop.photos ?? []).slice(0, 4);
                return (
                  <li key={stop.id} className="doc-stop">
                    {photo ? (
                      <img className="doc-thumb" src={photo} alt="" />
                    ) : (
                      <span className="doc-thumb doc-icon">{categoryIcon(stop.category)}</span>
                    )}
                    <div>
                      <p className="doc-stop-name">
                        {stop.time && <span className="doc-time">{stop.time}</span>}
                        {stop.name}
                        {stop.visited && <span className="doc-visited"> ✓ visited</span>}
                        {stop.rating && <span className="doc-stars"> {"★".repeat(stop.rating)}</span>}
                      </p>
                      <p className="doc-muted">
                        {[stop.category, stop.address].filter(Boolean).join(" · ")}
                      </p>
                      {stop.opening_hours && <p className="doc-muted">Hours: {stop.opening_hours}</p>}
                      {stop.notes && <p className="doc-notes">{stop.notes}</p>}
                      {own.length > 1 && (
                        <div className="doc-photos">
                          {own.map((p) => (
                            <img key={p.id} src={img(p.thumb_url)} alt="" />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              {ends.end && <li className="doc-stay">End at {ends.end.name}</li>}
            </ol>
            {day.stops.length === 0 && <p className="doc-muted">Nothing planned yet.</p>}
          </section>
        );
      })}

      {trip.ideas?.length > 0 && (
        <section>
          <h2>Ideas</h2>
          <ul className="doc-list">
            {trip.ideas.map((idea) => (
              <li key={idea.id}>
                <strong>
                  {categoryIcon(idea.category)} {idea.name}
                </strong>
                {idea.notes && <span className="doc-muted">{idea.notes}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {expenses.length > 0 && (
        <section>
          <h2>Expenses</h2>
          <p>
            <strong>{formatMoney(sum.total, home)}</strong> in total
            {sum.unconverted.length > 0 && <span className="doc-muted"> (+{sum.unconverted.length} without an exchange rate)</span>}
          </p>
          <ul className="doc-list doc-columns">
            {Object.entries(sum.byCategory).map(([cat, value]) => (
              <li key={cat}>
                {EXPENSE_CATEGORIES[cat] ?? cat}: {formatMoney(value, home)}
              </li>
            ))}
          </ul>
          {members.length > 1 && rates && <DocBalances expenses={expenses} members={members} rates={rates} home={home} meId={meId} />}
        </section>
      )}

      {trip.checklist?.length > 0 && (
        <section>
          <h2>Checklist</h2>
          <ul className="doc-list doc-columns">
            {trip.checklist.map((c) => (
              <li key={c.id}>
                {c.done ? "☑" : "☐"} {c.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {trip.notes && (
        <section>
          <h2>Notes</h2>
          <p className="doc-notes">{trip.notes}</p>
        </section>
      )}

      <footer className="doc-foot">Exported from TripSync on {exportedAt.toLocaleDateString()}.</footer>
    </article>
  );
}

function DocBalances({ expenses, members, rates, home, meId }) {
  const payments = settleUp(balances(expenses, members, rates).net);
  if (payments.length === 0) return <p className="doc-muted">Everyone is settled up.</p>;
  const name = (id) => personName(members, id, meId);
  return (
    <>
      <h3>To settle up</h3>
      <ul className="doc-list">
        {payments.map((p, i) => (
          <li key={i}>
            {name(p.from)} → {name(p.to)}: {formatMoney(p.cents / 100, home)}
          </li>
        ))}
      </ul>
    </>
  );
}
