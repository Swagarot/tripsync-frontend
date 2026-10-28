// Expense splitting for shared trips: who owes whom.
//
// The server stores only facts per expense: who paid (paid_by) and who shares
// it (split_between, null = everyone on the trip). Everything below is worked
// out from those every time it's shown, never stored, so editing or deleting
// an expense can't leave a stale balance behind.
//
// All maths is in whole cents of the home currency, so shares add up exactly:
// 10.00 split three ways is 3.34 + 3.33 + 3.33, not 3.333... each. The
// leftover cents go one each to the first people in a fixed order (user id),
// so every device computes the same result.
import { toHome } from "./currency.js";

// The people sharing an expense: its split_between, or everyone on the trip.
export function sharersOf(expense, members) {
  return expense.split_between?.length ? expense.split_between : members.map((m) => m.user_id);
}

// Each person's share of `cents`, by user id.
export function splitCents(cents, userIds) {
  const people = [...new Set(userIds)].sort();
  const base = Math.floor(cents / people.length);
  let left = cents - base * people.length;
  const shares = {};
  for (const id of people) {
    shares[id] = base + (left > 0 ? 1 : 0);
    if (left > 0) left -= 1;
  }
  return shares;
}

// Net balance per person in home-currency cents: positive = is owed money,
// negative = owes. Expenses nobody is marked as paying, or in a currency with
// no exchange rate yet, can't be split; they're returned in `skipped`.
export function balances(expenses, members, rates) {
  const net = Object.fromEntries(members.map((m) => [m.user_id, 0]));
  const skipped = [];
  for (const e of expenses) {
    const value = toHome(e.amount, e.currency, rates);
    if (!e.paid_by || value == null) {
      skipped.push(e);
      continue;
    }
    const cents = Math.round(value * 100);
    net[e.paid_by] = (net[e.paid_by] ?? 0) + cents;
    for (const [id, share] of Object.entries(splitCents(cents, sharersOf(e, members)))) {
      net[id] = (net[id] ?? 0) - share;
    }
  }
  return { net, skipped };
}

// The payments that settle everything, few of them: repeatedly the person who
// owes the most pays the person owed the most, as much as possible. This
// greedy method needs at most (people - 1) payments. [{ from, to, cents }]
export function settleUp(net) {
  const owes = Object.entries(net).filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }));
  const owed = Object.entries(net).filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));
  const payments = [];
  const biggest = (list) => list.sort((a, b) => b.c - a.c || a.id.localeCompare(b.id))[0];
  while (owes.some((p) => p.c > 0) && owed.some((p) => p.c > 0)) {
    const from = biggest(owes);
    const to = biggest(owed);
    const cents = Math.min(from.c, to.c);
    payments.push({ from: from.id, to: to.id, cents });
    from.c -= cents;
    to.c -= cents;
  }
  return payments;
}
