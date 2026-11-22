import { defineConfig, devices } from '@playwright/test';

// Phone-sized, touch-driven checks of the UI (and one wide-screen run by mouse) against the dev server (which exposes window.__grimm).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000, // most tests take 7-12 s; a failing one gives up sooner (the long ones set their own)
  fullyParallel: false,
  retries: 1, // the game runs in real time; a busy machine can make one tap miss
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testMatch: 'phone.spec.ts' }, // WebKit, like Safari on iOS
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testMatch: 'desktop.spec.ts' },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
