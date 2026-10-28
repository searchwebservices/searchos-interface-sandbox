/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Sandbox: the console runs on the Lenovo; through the SSH tunnel it is localhost:8800. SEARCHOS_BACKEND overrides.
const CONSOLE = process.env.SEARCHOS_BACKEND || 'http://localhost:8800'

export default defineConfig({
  base: '/v2/',
  plugins: [react(), tailwindcss()],
  // @cards is the shared card registry (schemas, envelope, fixtures) that the plugin and the console read too.
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '@cards': path.resolve(__dirname, '../console/lib/cards') } },
  server: {
    fs: { allow: ['..'] },
    port: 3300,
    strictPort: true,
    proxy: {
      // SSE rides on /api/stream; ws stays off and the proxy streams chunks as they come.
      '/api': { target: CONSOLE, changeOrigin: false, ws: false },
      // The built CRM the console ships (an iframe at /v2/apps/crm); its source is ../crm.
      '/v2/apps/crm': { target: CONSOLE, changeOrigin: false, ws: false },
      '/ui': { target: CONSOLE, changeOrigin: false, ws: false },
    },
  },
  build: { outDir: 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'], exclude: ['e2e/**', 'node_modules/**'] },
})
