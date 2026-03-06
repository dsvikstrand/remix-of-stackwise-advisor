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
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/p1-oauth' }]],
  timeout: 90_000,
  expect: {
    timeout: 15_000,
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
      testMatch: /.*p1-oauth.*\.ts/,
      use: {
        browserName: 'chromium',
        storageState: 'tests/playwright/.auth/account1.json',
      },
    },
  ],
});
