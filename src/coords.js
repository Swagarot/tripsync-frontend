// One text box for coordinates, because that's how they get copied: Google
// Maps (right-click a spot) and most map apps give "35.7148, 139.7967".
export function parseCoordinates(text) {
  if (!text || !text.trim()) return { lat: null, lng: null };
  const parts = text.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error('Coordinates must look like "35.7148, 139.7967"');
  }
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error("Latitude must be within ±90 and longitude within ±180");
  }
  return { lat, lng };
}
