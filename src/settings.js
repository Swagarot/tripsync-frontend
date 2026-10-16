// The app's language for names: map labels, transit lines and stations, and
// place details. (The app's own buttons and texts stay in English.)
// Stored on the device; changing it updates every open map at once.
import { useSyncExternalStore } from "react";

export const LANGUAGES = {
  en: "English",
  he: "עברית",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
};

const KEY = "tripsync.language";
const listeners = new Set();

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGUAGES[saved]) return saved;
  } catch {
    // storage blocked: fall through
  }
  // First visit: the browser's language if we offer it, else English.
  const browser = (typeof navigator !== "undefined" ? navigator.language : "en").slice(0, 2).toLowerCase();
  return LANGUAGES[browser] ? browser : "en";
}

let language = initial();

export function getLanguage() {
  return language;
}

export function setLanguage(value) {
  if (!LANGUAGES[value] || value === language) return;
  language = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // fine: applies until the page is reloaded
  }
  listeners.forEach((l) => l());
}

export function useLanguage() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getLanguage,
  );
}

// --- Colour theme ---------------------------------------------------------------
// "system" follows the device's light/dark setting. The chosen theme is written
// to <html data-theme="light|dark|dim">; index.css defines the colours for each,
// and the map switches to a matching style (BaseMap.jsx).
export const THEMES = { system: "System", light: "Light", dark: "Dark", dim: "Dim" };

const THEME_KEY = "tripsync.theme";
const themeListeners = new Set();
const darkQuery = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && THEMES[saved]) return saved;
  } catch {
    // fall through
  }
  return "system";
}

let theme = initialTheme();

// The theme actually shown: "system" resolved to light or dark.
export function effectiveTheme() {
  if (theme !== "system") return theme;
  return darkQuery?.matches ? "dark" : "light";
}

function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = effectiveTheme();
  // The browser's own controls (scrollbars, date pickers) follow too.
  document.documentElement.style.colorScheme = effectiveTheme() === "light" ? "light" : "dark";
  themeListeners.forEach((l) => l());
}

export function setTheme(value) {
  if (!THEMES[value]) return;
  theme = value;
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    // applies until reload
  }
  applyTheme();
}

export function getTheme() {
  return theme;
}

// Re-renders when the theme (or, in "system" mode, the device setting) changes.
export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      themeListeners.add(l);
      return () => themeListeners.delete(l);
    },
    () => `${theme}|${effectiveTheme()}`,
  );
}

darkQuery?.addEventListener("change", applyTheme);
applyTheme();

// Hebrew is written right to left: the panel and search bar sit on the right.
export const RTL_LANGUAGES = new Set(["he"]);
