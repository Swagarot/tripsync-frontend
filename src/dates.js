// The API sends plain dates as "2027-04-01". new Date("2027-04-01") would
// read that as midnight UTC, which is still the previous day in timezones
// west of UTC. Building the date from its parts keeps it in local time.
function parse(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const fullFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export function formatDay(iso) {
  return iso ? dayFormat.format(parse(iso)) : "";
}

export function formatRange(start, end) {
  if (start && end) return `${fullFormat.format(parse(start))} – ${fullFormat.format(parse(end))}`;
  if (start) return `From ${fullFormat.format(parse(start))}`;
  if (end) return `Until ${fullFormat.format(parse(end))}`;
  return "No dates yet";
}

// "2027-04-01" + 2 days -> "2027-04-03" (used to suggest the next day's date).
export function addDays(iso, days) {
  const date = parse(iso);
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
