// The trip keepsake: the whole trip as ONE .html file you keep forever.
// It opens in any browser, offline, with no account and no server: the
// document, its stylesheet and every photo are inside the file (photos as
// "data:" URLs, i.e. the image bytes written into the page as base64).
import { createElement } from "react";
import { getToken } from "../api.js";
import { renderToStaticMarkup } from "react-dom/server";
import docCss from "./trip-document.css?raw";
import { keepsakeFileName } from "./export.js";
import { coverUrl } from "./photos.js";
import TripDocument from "./TripDocument.jsx";

// Every picture the document shows.
function imageUrls(trip) {
  const urls = new Set();
  for (const day of trip.days ?? []) {
    for (const stop of day.stops) {
      const cover = coverUrl(stop);
      if (cover) urls.add(cover);
      for (const p of (stop.photos ?? []).slice(0, 4)) urls.add(p.thumb_url);
    }
  }
  return [...urls];
}

// Famous-place photos come from Wikimedia through redirects the browser may not
// read (no CORS header), so they're fetched via our backend (places.py /photo).
const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/";

async function toDataUrl(url) {
  const viaBackend = url.startsWith(COMMONS);
  const res = await fetch(viaBackend ? `/api/places/photo?url=${encodeURIComponent(url)}` : url, {
    headers: viaBackend ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Embeds what it can (a few at a time); a photo that can't be fetched (offline,
// or a site that doesn't allow it) keeps its normal link instead.
async function embedImages(urls, onProgress) {
  const images = {};
  let done = 0;
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        images[url] = await toDataUrl(url);
      } catch {
        // keep the link
      }
      onProgress?.(++done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return images;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export async function buildKeepsake(trip, { rates, routeFor, meId, onProgress } = {}) {
  const images = await embedImages(imageUrls(trip), onProgress);
  // React escapes all text it renders, so trip names and notes can't inject
  // markup into the file.
  const body = renderToStaticMarkup(createElement(TripDocument, { trip, rates, routeFor, images, meId }));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(trip.name)} · TripSync keepsake</title>
<style>
body { margin: 0; background: #f6f5f1; }
${docCss}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function downloadFile(name, text, type = "text/html") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { keepsakeFileName };
