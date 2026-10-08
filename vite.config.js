import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

const build = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; } })();

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  build: { target: 'es2022', sourcemap: false },
  plugins: [VitePWA({
    registerType: 'prompt', injectRegister: false,   // updates are applied by src/main.js: at once if the app is in the background, otherwise on tap
    includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
    workbox: {
      navigateFallbackDenylist: [/^\/api\//],
      /* the install downloads only what the first screens need: woff2 fonts (every PWA browser has them) and not the PDF libraries */
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      globIgnores: ['**/jspdf*', '**/html2canvas*', '**/purify*', '**/index.es-*'],
      runtimeCaching: [{ urlPattern: /\/assets\/(jspdf|html2canvas|purify|index\.es)[^/]*\.js$/, handler: 'CacheFirst', options: { cacheName: 'on-demand', expiration: { maxEntries: 8 } } }],
    },
    manifest: {
      name: 'DTRV', short_name: 'DTRV', description: 'Personal Daily Time Record (CS Form 48)',
      start_url: '/', display: 'standalone', orientation: 'portrait', background_color: '#0a0f1c', theme_color: '#0a0f1c',
      shortcuts: [
        { name: 'My DTR', short_name: 'My DTR', description: 'Open my month', url: '/?go=my', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        { name: 'Add a remark', short_name: 'Remark', description: 'Leave, day-off, holiday or other', url: '/?go=remark', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      ],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  })],
  test: { environment: 'node', include: ['test/**/*.test.js'], testTimeout: 20000 },
});
