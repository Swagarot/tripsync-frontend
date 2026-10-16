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
