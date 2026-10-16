import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
// maplibre-gl 6 has no default export: import just what we use.
import { setRTLTextPlugin, setWorkerUrl } from "maplibre-gl";
// MapLibre does the heavy work (decoding tiles, placing labels) in a web
// worker. ?worker&url makes Vite bundle that worker into its own file and give
// us its URL; without this, MapLibre can't find it ("Worker failed to load").
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
// By path, not package name: the package's "exports" only expose its source,
// and MapLibre needs the ready-built file. ?url = copy it as a file and give
// us its URL (MapLibre loads it in a web worker when needed).
import rtlPluginUrl from "../../node_modules/@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js?url";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { useLanguage } from "../settings.js";

// The map's background, drawn in the browser from vector tiles
// (OpenFreeMap: free, no key, OpenStreetMap data) by MapLibre, inside Leaflet
// via the maplibre-gl-leaflet bridge, so our pins, routes and drag-and-drop
// (all Leaflet) work on top unchanged.
//
// Why vector tiles instead of OpenStreetMap's standard picture tiles: those
// have the labels baked into the images, in the local language (Japan shows
// 渋谷). Vector tiles carry every name OpenStreetMap knows (name:en,
// name:he, name:ja...) and the browser draws the labels, so they can be shown
// in the language the user picked.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

// Hebrew (and Arabic) letters must be shaped right-to-left; MapLibre needs
// this plugin for that. Bundled with the app (not loaded from a CDN) so it
// also works offline. "true" = only download it once an RTL label appears.
// It may only be set once per page.
let rtlRequested = false;
function ensureRtlPlugin() {
  if (rtlRequested) return;
  rtlRequested = true;
  setWorkerUrl(workerUrl);
  try {
    setRTLTextPlugin(rtlPluginUrl, true);
  } catch {
    // already set (hot reload): fine
  }
}

// The label for every name on the map: the chosen language, else English,
// else OpenStreetMap's Latin-script name, else the local name.
function labelExpression(lang) {
  const keys = lang === "en" ? ["name:en", "name_en", "name:latin", "name"] : [`name:${lang}`, "name:en", "name:latin", "name"];
  return ["coalesce", ...keys.map((k) => ["get", k])];
}

function applyLanguage(glMap, lang) {
  const style = glMap.getStyle();
  if (!style) return;
  for (const layer of style.layers) {
    const field = layer.layout?.["text-field"];
    // Only name labels; road numbers ("ref") stay as they are.
    if (field && JSON.stringify(field).includes("name")) {
      glMap.setLayoutProperty(layer.id, "text-field", labelExpression(lang));
    }
  }
}

export default function BaseMap() {
  const map = useMap();
  const lang = useLanguage();
  const layerRef = useRef(null);

  useEffect(() => {
    ensureRtlPlugin();
    const layer = maplibreGL({ style: STYLE_URL, attribution: ATTRIBUTION, interactive: false }).addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const glMap = layerRef.current?.getMaplibreMap();
    if (!glMap) return;
    // The style loads asynchronously the first time; afterwards it's there.
    if (glMap.isStyleLoaded()) applyLanguage(glMap, lang);
    const onLoad = () => applyLanguage(glMap, lang);
    glMap.on("style.load", onLoad);
    return () => glMap.off("style.load", onLoad);
  }, [lang]);

  return null;
}
