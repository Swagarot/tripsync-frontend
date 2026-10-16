# tripsync-frontend

React (Vite) single-page app for TripSync, served by nginx in its container.
Deployed by this repo's Jenkinsfile with the Helm chart from `tripsync-devops`.

## Layout

| Path | What |
|---|---|
| `src/api.js` | The only place that calls the backend (`/api/...`, adds the token) |
| `src/auth/` | Logged-in user state (`AuthProvider`, `useAuth`) |
| `src/pages/` | `LoginPage`, `TripsPage` (list), `TripPage` (days and stops) |
| `src/components/` | Forms, icons, error message, server status |
| `nginx.conf` | Serves the build; unknown paths fall back to `index.html` |

## Local development

```sh
npm ci
npm run dev      # http://localhost:5173, proxies /api to Flask on :5000 (vite.config.js)
npm run lint
npm run build
```

Start the backend first (`python app.py` in `tripsync-backend`), or run the
whole stack with `docker compose up --build` in `tripsync-devops`
(http://localhost:8080).
