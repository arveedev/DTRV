import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { target: 'es2022', sourcemap: false },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
    workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'] },
    manifest: {
      name: 'DTRV', short_name: 'DTRV', description: 'Personal Daily Time Record (CS Form 48)',
      start_url: '/', display: 'standalone', orientation: 'portrait', background_color: '#0a0f1c', theme_color: '#0a0f1c',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
  })],
  test: { environment: 'node', include: ['test/**/*.test.js'], testTimeout: 20000 },
});
