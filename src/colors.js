// One colour per day, shared by the day badge and its pins on the map.
const DAY_COLORS = ["#0f6e6a", "#c2410c", "#7c3aed", "#0369a1", "#be185d", "#4d7c0f", "#b45309"];

export function dayColor(index) {
  return DAY_COLORS[index % DAY_COLORS.length];
}
