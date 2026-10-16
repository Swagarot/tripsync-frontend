// Stays (lodging): where a day starts and ends.
//
// A stay covers the nights from check_in to check_out. With `bookends` on,
// every dated day from check_in to check_out (inclusive) starts and ends
// there. On a moving day (one stay's check_out = another's check_in) the day
// starts at the old place and ends at the new one.

const covers = (stay, date) =>
  stay.bookends !== false && stay.check_in && stay.check_out && stay.check_in <= date && date <= stay.check_out;

// { start, end }: the stays a day begins and finishes at (or null).
export function dayEnds(day, lodgings) {
  if (!day.date || !lodgings?.length) return { start: null, end: null };
  const here = lodgings.filter((s) => covers(s, day.date) && s.lat != null);
  if (here.length === 0) return { start: null, end: null };
  // Leaving one place today? The day starts there. Arriving somewhere? It ends there.
  const leaving = here.find((s) => s.check_out === day.date && s.check_in !== day.date);
  const arriving = here.find((s) => s.check_in === day.date && s.check_out !== day.date);
  const staying = here.find((s) => s.check_in < day.date && day.date < s.check_out);
  return {
    start: leaving ?? staying ?? here[0],
    end: arriving ?? staying ?? here[here.length - 1],
  };
}

// Everything a day's route goes through, in order: start stay, the stops that
// have coordinates, end stay. `kind` says which is which (for drawing).
export function dayPoints(day, lodgings) {
  const { start, end } = dayEnds(day, lodgings);
  const stops = day.stops.filter((s) => s.lat != null).map((s) => ({ ...s, kind: "stop" }));
  return [
    ...(start ? [{ ...start, kind: "start" }] : []),
    ...stops,
    ...(end ? [{ ...end, kind: "end" }] : []),
  ];
}
