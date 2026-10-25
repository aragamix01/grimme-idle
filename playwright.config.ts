import { defineConfig, devices } from '@playwright/test';

// Phone-sized, touch-driven checks of the UI against the dev server (which exposes window.__grimm).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 1, // the game runs in real time; a busy machine can make one tap miss
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } }, // WebKit, like Safari on iOS
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
