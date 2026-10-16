// Money: exchange rates (backend /rates -> European Central Bank rates) and
// converting expenses into the trip's home currency.
import { createStore, get, set } from "idb-keyval";
import { api } from "../api.js";

// The ~30 currencies the ECB publishes rates for (the converter's limit).
export const CURRENCIES = [
  "ILS", "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "HKD", "KRW", "SGD", "THB",
  "INR", "IDR", "MYR", "PHP", "TRY", "PLN", "CZK", "HUF", "RON", "SEK", "NOK", "DKK", "ISK", "MXN",
  "BRL", "ZAR",
];

// A sensible default home currency from the browser's language/region.
export function guessHomeCurrency() {
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  const byRegion = { IL: "ILS", US: "USD", GB: "GBP", JP: "JPY", CA: "CAD", AU: "AUD", CH: "CHF" };
  if (byRegion[region]) return byRegion[region];
  if ((navigator.language || "").startsWith("he")) return "ILS";
  return "USD";
}

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// rates: 1 unit of the home currency = rates[X] units of X. So an amount
// paid in X is amount / rates[X] in the home currency. null if X is unknown.
export function toHome(amount, currency, rates) {
  if (!rates) return null;
  const rate = rates[currency];
  return rate ? amount / rate : null;
}

// Totals per category in the home currency; expenses that can't be converted
// (no rates yet, or a currency the ECB doesn't cover) are listed separately.
export function totals(expenses, rates) {
  const byCategory = {};
  let total = 0;
  const unconverted = [];
  for (const e of expenses) {
    const value = toHome(e.amount, e.currency, rates);
    if (value == null) {
      unconverted.push(e);
      continue;
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + value;
    total += value;
  }
  return { total, byCategory, unconverted };
}

// Rates kept on the device: totals still work offline, with the last rates.
const idb = createStore("tripsync-rates", "rates");

export async function loadRates(base) {
  let stored = null;
  try {
    stored = await get(base, idb);
  } catch {
    // no IndexedDB
  }
  if (stored && Date.now() - stored.at < 6 * 3600 * 1000) return stored;
  try {
    const res = await api(`/rates?base=${base}`);
    const value = { at: Date.now(), date: res.date, rates: res.rates };
    set(base, value, idb).catch(() => {});
    return value;
  } catch {
    return stored;
  }
}
