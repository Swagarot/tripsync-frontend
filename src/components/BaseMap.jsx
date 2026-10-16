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
import { TileLayer, useMap } from "react-leaflet";
import { ATTRIBUTION as OSM_ATTRIBUTION, TILE_URL as OSM_TILES } from "./map.js";
import { effectiveTheme, useLanguage, useTheme } from "../settings.js";

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
// One OpenFreeMap style per app theme, so the map matches the panel around it.
const STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
  dim: "https://tiles.openfreemap.org/styles/fiord", // slate blue, like the Dim theme
};
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

// MapLibre draws with WebGL2 (the browser's GPU graphics). Some computers
// don't offer it: graphics acceleration switched off in the browser, or a GPU
// driver the browser has blocked. Then the vector map can't start at all, so
// fall back to OpenStreetMap's ready-made picture tiles: everything works,
// only the labels stay in the local language.
let webgl2Supported = null;
function supportsWebGL2() {
  if (webgl2Supported === null) {
    try {
      webgl2Supported = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl2Supported = false;
    }
  }
  return webgl2Supported;
}

export default function BaseMap() {
  return supportsWebGL2() ? <VectorBaseMap /> : <RasterFallback />;
}

function RasterFallback() {
  return (
    <TileLayer
      url={OSM_TILES}
      noWrap
      className="raster-tiles"
      attribution={`${OSM_ATTRIBUTION} · basic map: this browser has WebGL2 off, so labels stay in the local language`}
    />
  );
}

function VectorBaseMap() {
  const map = useMap();
  const lang = useLanguage();
  const themeKey = useTheme();
  const layerRef = useRef(null);
  const styleRef = useRef(null); // the style the map currently uses

  useEffect(() => {
    ensureRtlPlugin();
    const style = STYLES[effectiveTheme()] ?? STYLES.light;
    styleRef.current = style;
    const layer = maplibreGL({ style, attribution: ATTRIBUTION, interactive: false }).addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  // Theme changed: load the matching style (labels are re-applied on its
  // style.load below).
  useEffect(() => {
    const glMap = layerRef.current?.getMaplibreMap();
    const style = STYLES[effectiveTheme()] ?? STYLES.light;
    if (glMap && style !== styleRef.current) {
      styleRef.current = style;
      glMap.setStyle(style);
    }
  }, [themeKey]);

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
