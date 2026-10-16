import { useEffect, useState } from "react";
import { DeleteIcon } from "../components/icons.jsx";
import { formatDay } from "../dates.js";
import { op } from "../store/ops.js";
import { dispatch } from "../store/store.js";
import { CURRENCIES, formatMoney, guessHomeCurrency, loadRates, toHome, totals } from "./currency.js";

// Expenses: each is entered in the currency actually paid (¥ in Japan), and
// totals are shown in the trip's home currency (₪), using the last known
// European Central Bank rates, which are also kept on the device for offline.
const CATEGORIES = {
  food: "🍜 Food",
  transport: "🚆 Transport",
  lodging: "🛏️ Lodging",
  activities: "🎟️ Activities",
  shopping: "🛍️ Shopping",
  other: "📦 Other",
};

const LAST_CURRENCY_KEY = "tripsync.lastCurrency";

export default function ExpensesTab({ trip }) {
  const home = trip.home_currency ?? guessHomeCurrency();
  const [rates, setRates] = useState(null);
  const expenses = [...(trip.expenses ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  useEffect(() => {
    let cancelled = false;
    loadRates(home).then((r) => !cancelled && setRates(r));
    return () => {
      cancelled = true;
    };
  }, [home]);

  const sum = totals(expenses, rates?.rates);
  const biggest = Math.max(1, ...Object.values(sum.byCategory));

  return (
    <div className="tab-body">
      <div className="expense-summary">
        <div>
          <span className="muted small">Total spent</span>
          <strong className="expense-total">{formatMoney(sum.total, home)}</strong>
        </div>
        <label className="small">
          Show in{" "}
          <select
            value={home}
            onChange={(e) => dispatch(op.updateTrip(trip.id, { home_currency: e.target.value }))}
            aria-label="Home currency"
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      {Object.keys(sum.byCategory).length > 0 && (
        <ul className="category-bars">
          {Object.entries(sum.byCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, value]) => (
              <li key={cat}>
                <span className="small">{CATEGORIES[cat] ?? cat}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(value / biggest) * 100}%` }} />
                </span>
                <span className="small">{formatMoney(value, home)}</span>
              </li>
            ))}
        </ul>
      )}
      {sum.unconverted.length > 0 && (
        <p className="muted small">
          {sum.unconverted.length} expense(s) not in the total: {rates ? "no exchange rate for that currency" : "exchange rates not loaded yet"}.
        </p>
      )}
      {rates?.date && <p className="muted small">Rates from {rates.date} (European Central Bank).</p>}

      <ExpenseForm trip={trip} />

      <ul className="expense-list">
        {expenses.map((e) => {
          const converted = e.currency !== home ? toHome(e.amount, e.currency, rates?.rates) : null;
          return (
            <li key={e.id} className="expense">
              <span className="expense-cat" aria-hidden="true">
                {(CATEGORIES[e.category] ?? "📦").split(" ")[0]}
              </span>
              <div className="stop-body">
                <span>{e.note || (CATEGORIES[e.category] ?? e.category).split(" ").slice(1).join(" ")}</span>
                <p className="muted small">{e.date ? formatDay(e.date) : "No date"}</p>
              </div>
              <div className="expense-amount">
                <strong>{formatMoney(e.amount, e.currency)}</strong>
                {converted != null && <span className="muted small">≈ {formatMoney(converted, home)}</span>}
              </div>
              <button
                aria-label="Delete expense"
                className="danger icon-only"
                onClick={() => dispatch(op.deleteItem("expenses", trip.id, e.id))}
              >
                <DeleteIcon />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ExpenseForm({ trip }) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem(LAST_CURRENCY_KEY) || trip.home_currency || guessHomeCurrency();
    } catch {
      return trip.home_currency || guessHomeCurrency();
    }
  });
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today);

  function add(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) return;
    dispatch(
      op.createItem("expenses", trip.id, {
        amount: Math.round(value * 100) / 100,
        currency,
        category,
        note: note.trim() || null,
        date: date || null,
      }),
    );
    try {
      localStorage.setItem(LAST_CURRENCY_KEY, currency); // next expense: same currency
    } catch {
      // fine
    }
    setAmount("");
    setNote("");
  }

  return (
    <form className="form expense-form" onSubmit={add}>
      <div className="form-row">
        <label className="grow">
          Amount
          <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Currency
          <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Category
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORIES).map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label>
        Note
        <input maxLength={300} placeholder="Ramen at Ichiran" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" className="primary">
        Add expense
      </button>
    </form>
  );
}
