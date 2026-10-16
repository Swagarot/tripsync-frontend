// Your own photos: an upload queue that also works without a connection.
//
// A photo is often taken where there's no signal (a temple on a mountain, the
// metro). So "Add photo" never uploads directly: the file goes into a queue
// in IndexedDB (files can be stored there as Blobs), shows up at once from the
// device, and is sent when there's a connection, the same idea as the change
// outbox in store/store.js, just for files.
//
// Each photo gets its id here (like trips and stops), so a retry after a lost
// response can't create it twice: the server answers 409 "already exists".
import { createStore, del, entries, set } from "idb-keyval";
import { getToken } from "../api.js";
import { newId } from "../store/ops.js";
import { refreshTrip } from "../store/store.js";

const idb = createStore("tripsync-photos", "outbox");
const listeners = new Set();
let pending = []; // [{ id, tripId, stopId, blob, preview }]
let loaded = false;
let uploading = false;
let lastError = null;

const emit = () => listeners.forEach((l) => l());

export function subscribePhotos(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getPendingPhotos = () => pending;
export const getPhotoError = () => lastError;

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await entries(idb);
    pending = stored.map(([, item]) => ({ ...item, preview: URL.createObjectURL(item.blob) }));
    emit();
  } catch {
    // no IndexedDB: the queue lives in memory only
  }
}

export async function addPhotos(tripId, stopId, files) {
  await load();
  for (const file of files) {
    const item = { id: newId(), tripId, stopId, blob: file };
    try {
      await set(item.id, item, idb);
    } catch {
      // kept in memory
    }
    pending = [...pending, { ...item, preview: URL.createObjectURL(file) }];
  }
  lastError = null;
  emit();
  flushPhotos();
}

export function discardPhoto(id) {
  const item = pending.find((p) => p.id === id);
  if (item) URL.revokeObjectURL(item.preview);
  pending = pending.filter((p) => p.id !== id);
  del(id, idb).catch(() => {});
  emit();
}

export async function flushPhotos() {
  await load();
  if (uploading || pending.length === 0) return;
  uploading = true;
  emit();
  const touched = new Set();
  try {
    for (const item of [...pending]) {
      const form = new FormData();
      form.append("id", item.id);
      form.append("file", item.blob, item.blob.name || "photo.jpg");
      let res;
      try {
        res = await fetch(`/api/stops/${item.stopId}/photos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        });
      } catch {
        return; // offline: try again later
      }
      if (res.status >= 500 || res.status === 429 || res.status === 401) return; // retry later
      if (!res.ok && res.status !== 409) {
        // Refused for good (not a photo, too big, the stop was deleted).
        const data = await res.json().catch(() => null);
        lastError = data?.error ?? `Upload failed (${res.status})`;
      }
      discardPhoto(item.id);
      touched.add(item.tripId);
    }
  } finally {
    uploading = false;
    emit();
    // Show the uploaded photos from the server (signed links, thumbnails).
    for (const tripId of touched) refreshTrip(tripId);
  }
}

export const isUploading = () => uploading;

// Retry when the connection comes back, and every 30 s while something waits.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => flushPhotos());
  setInterval(() => pending.length && flushPhotos(), 30_000);
  load().then(flushPhotos);
}

// The picture for a stop: the photo you picked as cover, else the famous
// photo, else your first photo.
export function coverUrl(stop) {
  const own = stop.photos ?? [];
  const chosen = own.find((p) => p.id === stop.cover_photo_id);
  if (chosen) return chosen.thumb_url;
  if (stop.photo_url) return stop.photo_url;
  return own[0]?.thumb_url ?? null;
}
