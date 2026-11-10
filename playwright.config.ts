import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:3457' },
  webServer: {
    command: 'REVIEW_FIT=1 npm run start -- --port 3457',
    url: 'http://127.0.0.1:3457/binder/review-fit',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
