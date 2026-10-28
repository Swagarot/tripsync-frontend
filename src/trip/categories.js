// An icon for a kind of place, shown when a place has no photo (most cafés
// and shops don't have one on Wikipedia).
const ICONS = [
  [/caf|coffee/i, "☕"],
  [/restaurant|food|ramen|sushi|pizza|bistro|diner|noodle/i, "🍜"],
  [/bar|pub|nightclub|beer|wine/i, "🍸"],
  [/bakery|pastry|confection|ice cream|dessert/i, "🥐"],
  [/museum|gallery|art/i, "🏛️"],
  [/temple|shrine|church|mosque|synagogue|cathedral|place of worship/i, "⛩️"],
  [/castle|fort|palace|ruins|monument|memorial|tower/i, "🏰"],
  [/park|garden|forest|nature/i, "🌳"],
  [/beach|coast/i, "🏖️"],
  [/peak|mountain|viewpoint|hill/i, "⛰️"],
  [/hotel|hostel|guest|motel|apartment|camp/i, "🛏️"],
  [/station|airport|bus|train|subway|ferry|terminal/i, "🚉"],
  [/shop|mall|market|store|supermarket/i, "🛍️"],
  [/zoo|aquarium/i, "🐾"],
  [/theme|attraction|amusement/i, "🎡"],
];

export function categoryIcon(category) {
  for (const [pattern, icon] of ICONS) if (pattern.test(category ?? "")) return icon;
  return "📍";
}

// Expense categories (the backend accepts exactly these keys).
export const EXPENSE_CATEGORIES = {
  food: "🍜 Food",
  transport: "🚆 Transport",
  lodging: "🛏️ Lodging",
  activities: "🎟️ Activities",
  shopping: "🛍️ Shopping",
  other: "📦 Other",
};
