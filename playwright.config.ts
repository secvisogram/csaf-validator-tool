import { defineConfig, devices } from '@playwright/test'
import { SITES } from './e2e/sites.ts'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  use: { baseURL: SITES[0].url, trace: 'retain-on-failure' },
  // Chrome is the installed stable channel, not Playwright's bundled Chromium.
  projects: [
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: SITES.map((site) => ({
    command: `vite preview --base ${site.path} --port ${site.port} --strictPort --host 127.0.0.1 --bypass-lock`,
    url: site.url,
    reuseExistingServer: false,
  })),
})
