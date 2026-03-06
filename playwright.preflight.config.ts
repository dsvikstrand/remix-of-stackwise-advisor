import { defineConfig } from '@playwright/test';
import { loadPlaywrightLocalEnv, requirePlaywrightEnv } from './tests/playwright/env';

loadPlaywrightLocalEnv();

const baseURL = process.env.PLAYWRIGHT_BASE_URL
  || process.env.BLEU_PLAYWRIGHT_BASE_URL
  || 'https://dsvikstrand.github.io/remix-of-stackwise-advisor/';

requirePlaywrightEnv(['BLEU_ACCOUNT_1_EMAIL', 'BLEU_ACCOUNT_1_PASSWORD']);

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/preflight' }]],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /.*\.setup\.ts/,
      use: {
        browserName: 'chromium',
        storageState: 'tests/playwright/.auth/account1.json',
      },
    },
  ],
});
