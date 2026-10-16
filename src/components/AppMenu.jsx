import { Link } from "react-router";
import { useAuth } from "../auth/context.js";
import { getTheme, LANGUAGES, setLanguage, setTheme, THEMES, useLanguage, useTheme } from "../settings.js";
import { useSyncStatus } from "../store/hooks.js";

// The app-wide settings, in one place: shown at the bottom of the trip page's
// drawer, and in the header menu on the other pages.
export default function AppMenu({ onNavigate }) {
  const { user, logout } = useAuth();
  const { pending } = useSyncStatus();
  const language = useLanguage();
  useTheme(); // re-render when the theme changes
  const theme = getTheme();

  // Logging out wipes this device's copy, including changes not yet synced.
  const confirmLogout = () => {
    if (pending === 0 || window.confirm(`${pending} change(s) haven't synced yet and will be lost. Log out anyway?`)) {
      logout();
    }
  };

  return (
    <div className="app-menu">
      <Link to="/" className="menu-item" onClick={onNavigate}>
        <span aria-hidden="true">🗺️</span> All trips
      </Link>
      <label className="menu-item">
        <span aria-hidden="true">🌐</span>
        <span className="menu-label">Names on the map</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language for map and place names">
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="menu-item">
        <span aria-hidden="true">🎨</span>
        <span className="menu-label">Theme</span>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {Object.entries(THEMES).map(([value, name]) => (
            <button key={value} role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}>
              {name}
            </button>
          ))}
        </div>
      </div>
      {user && (
        <div className="menu-item menu-account">
          <span aria-hidden="true">👤</span>
          <span className="menu-label muted small">{user.email}</span>
          <button className="link" onClick={confirmLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
