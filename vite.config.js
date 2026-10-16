import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes the app installable and usable offline. At build time this
    // generates a service worker (sw.js, using Google's Workbox) plus the web
    // app manifest. The service worker sits between the page and the network:
    // it keeps a copy of every file of the app (HTML, JS, CSS, icons), so the
    // app opens with no connection. Trip data is NOT cached here; that's the
    // job of src/store (IndexedDB + sync queue).
    // Browsers only run service workers on HTTPS or localhost.
    VitePWA({
      // 'prompt': a new version is downloaded in the background, then the
      // user is asked before switching (UpdateBanner in components/common.jsx).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TripSync',
        short_name: 'TripSync',
        description: 'Plan trips day by day, online or offline.',
        theme_color: '#0f6e6a',
        background_color: '#f6f5f1',
        display: 'standalone', // no browser bars once installed
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          // Android crops icons to its own shape; this one has safe padding.
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Offline, any page URL (/trips/<id>) gets the cached index.html,
        // like nginx's try_files does online. Never for /api: those must
        // really reach the backend (or fail, so the sync queue knows).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Map tiles: kept as they're viewed (cache first, fall back to
            // the network), so areas you've looked at still show offline.
            // Opportunistic only, no prefetching (scope + OSM usage policy).
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // `npm run dev` only: forward /api/... to Flask on port 5000 (python
    // app.py) and drop the /api prefix, the same thing the Ingress does in
    // the cluster. The browser only ever sees one origin, so no CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Vitest (npm test). Plain Node, no browser: the tests cover the logic
  // (ops, sync queue, helpers). fake-indexeddb stands in for the browser's
  // IndexedDB so the store can run.
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
  },
})
