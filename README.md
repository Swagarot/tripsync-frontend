# tripsync-frontend

React (Vite) app for TripSync, an installable PWA that keeps working offline:
every change is saved on the device first and synced when the connection is
back. Built into static files and served by nginx (non-root) in its container.
Built, tested and deployed by this repo's Jenkinsfile with the Helm chart from
`tripsync-devops`.

## Layout

| Path | What |
|---|---|
| `src/api.js` | The only place that calls the backend (`/api/...`, adds the token) |
| `src/auth/` | Logged-in user state; refreshes the token on every online start |
| `src/store/` | Offline-first data: changes as "ops", kept in IndexedDB, synced in order when online |
| `src/pages/` | Login, trip list, trip page, invite (join) page, print page |
| `src/trip/` | The trip page's tabs: itinerary, ideas, expenses (split, settle up), stays, weather, notes, sharing, photos, PDF/keepsake export |
| `src/components/` | Maps (Leaflet), place search, forms, icons, app menu |
| `nginx.conf` | Serves the build: unknown paths fall back to `index.html`, gzip, cache headers, never-cached service worker |
| `vite.config.js` | Build, the PWA (service worker, manifest), dev proxy of `/api` to Flask |
| `*.test.js` | Vitest unit tests (store and sync, routes, expense splitting, export) |

## Local development

```sh
npm ci
npm run dev      # http://localhost:5173, proxies /api to Flask on :5000 (vite.config.js)
npm run lint
npm test         # Vitest
npm run build
```

Start the backend first (`python app.py` in `tripsync-backend`), or run the
whole stack with `docker compose up --build` in `tripsync-devops`
(http://localhost:8080).
