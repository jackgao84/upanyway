/**
 * End-to-end tests: WebKit with touch, against `vite preview` of the production build (service
 * worker included) at /upanyway/. Three sizes: iPad portrait, iPad landscape, a phone.
 * No retries: a flaky test should show up as a failure, not hide behind a second run.
 */
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.PW_PORT) || 4173
const CI = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Each WebKit page with full-screen canvases at 2–3× takes a lot of memory; a few at a time is
  // plenty (PW_WORKERS overrides).
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : CI ? 2 : 3,
  forbidOnly: CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}/upanyway/`,
    browserName: 'webkit',
    hasTouch: true,
    locale: 'en-GB',
    reducedMotion: 'no-preference',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'ipad-portrait',
      use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
    },
    {
      name: 'ipad-landscape',
      use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 },
    },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/upanyway/`,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
