// One place that talks to the backend. Every request goes to the relative
// path /api/..., so the browser sends it to the same origin the page came
// from: the Ingress (k3s/EKS), the compose gateway, or Vite's dev proxy
// (vite.config.js) all strip /api and forward the rest to Flask. Same origin
// means no CORS anywhere.

const TOKEN_KEY = "tripsync.token";

// The login token lives in localStorage so it survives closing the tab (and,
// later, works offline). Trade-off: any script running on this page can read
// it, so the app must never inject untrusted HTML. React escapes everything
// it renders by default, which is what protects us here.
// try/catch: storage can be blocked (private mode, strict settings).
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Not stored; the user just has to log in again next visit.
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Fired when the server rejects our token (expired after 7 days, or the
// account is gone). AuthProvider listens and sends the user to the login page.
export const LOGGED_OUT_EVENT = "tripsync:logged-out";

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch only throws when there was no response at all.
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return null; // e.g. DELETE: success, no body
  // The backend always answers JSON; .catch covers a proxy's HTML error page.
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(LOGGED_OUT_EVENT));
    }
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data;
}
