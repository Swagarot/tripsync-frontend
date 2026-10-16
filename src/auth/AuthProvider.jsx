import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken, LOGGED_OUT_EVENT, setToken } from "../api.js";
import { init as initStore, wipe as wipeStore } from "../store/store.js";
import { AuthContext } from "./context.js";

// The user is remembered next to the token, so the app can start offline:
// with no network, /auth/me can't answer, but we still know who's logged in.
const USER_KEY = "tripsync.user";

function loadUser() {
  try {
    return getToken() ? JSON.parse(localStorage.getItem(USER_KEY)) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // Storage blocked: fine while the tab is open.
  }
}

export default function AuthProvider({ children }) {
  // undefined = still checking the stored token, null = logged out,
  // object = the logged-in user.
  const [user, setUser] = useState(() => loadUser() ?? (getToken() ? undefined : null));

  // On page load: if there's a stored token, ask the backend who it belongs
  // to. This also catches a token that expired while the app was closed.
  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then((me) => {
        saveUser(me);
        setUser(me);
      })
      .catch((err) => {
        // No connection (status 0) or server trouble: keep the remembered
        // user and work offline. Only a real "no" from the server logs out.
        if (err.status === 401) setUser(null);
        else setUser((current) => current ?? null);
      });
  }, []);

  // api.js fires this when any request comes back 401 with our token.
  // The offline copy is kept: unsynced changes go out after the next login.
  useEffect(() => {
    const onLoggedOut = () => setUser(null);
    window.addEventListener(LOGGED_OUT_EVENT, onLoggedOut);
    return () => window.removeEventListener(LOGGED_OUT_EVENT, onLoggedOut);
  }, []);

  // Load this user's offline copy and start syncing.
  const userId = user?.id;
  useEffect(() => {
    if (userId) initStore(userId);
  }, [userId]);

  // register and login answer the same way: a token plus the user.
  const signIn = useCallback(async (endpoint, email, password) => {
    const data = await api(endpoint, { method: "POST", body: { email, password } });
    setToken(data.access_token);
    saveUser(data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    // The token is just forgotten; the server keeps no session to end.
    // (It stays technically valid until it expires, a known JWT trade-off.)
    // The offline copy is wiped so the next person on this device can't see it.
    setToken(null);
    saveUser(null);
    setUser(null);
    await wipeStore();
  }, []);

  // useMemo: only hand children a new object when something changed, so
  // they don't all re-render on every render of this component.
  const value = useMemo(
    () => ({
      user,
      login: (email, password) => signIn("/auth/login", email, password),
      register: (email, password) => signIn("/auth/register", email, password),
      logout,
    }),
    [user, signIn, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
