import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.GOLDEN_PORT || 18971)

// The goldens run against a throwaway console that serves web/dist (run `npm run build` first).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  snapshotPathTemplate: '{testDir}/goldens/marvin-v1/{arg}{ext}',
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:' + PORT },
  webServer: {
    command: 'node e2e/serve-console.mjs',
    url: 'http://127.0.0.1:' + PORT + '/ui/sovereign.css',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
