import { defineConfig } from '@playwright/test';

// Playwright config for Electron E2E tests of the iReport Admin app.
// Requires a desktop session (a display) — does not run headless in CI without xvfb.
// Setup:  npm i -D @playwright/test playwright   (browser download not needed for Electron)
// Build first:  npm run build
// Run:    npx playwright test --config e2e/playwright.config.ts
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { trace: 'on-first-retry' },
});
