/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// `base` apunta a la ruta del repositorio en GitHub Pages (decisión aprobada: GitHub Pages para V1).
// Para desplegar en la raíz de un dominio propio, cambia a '/'.
const base = process.env.VITE_BASE ?? '/recomp/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@domain': fileURLToPath(new URL('./src/domain', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@repo': fileURLToPath(new URL('./src/repo', import.meta.url)),
      '@infra': fileURLToPath(new URL('./src/infra', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Recomp',
        short_name: 'Recomp',
        description: 'Sistema diario de recomposición corporal',
        lang: 'es-MX',
        start_url: `${base}?source=pwa`,
        scope: base,
        display: 'standalone',
        background_color: '#F3F4F1',
        theme_color: '#F3F4F1',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${base}index.html`,
        // La app no hace peticiones de red en V1: no hay runtimeCaching.
      },
    }),
  ],
  test: {
    environment: 'node', // los tests de UI declaran '// @vitest-environment jsdom'
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/app/**', 'src/infra/**'] },
  },
})
