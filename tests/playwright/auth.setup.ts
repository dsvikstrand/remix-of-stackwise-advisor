import { expect, test } from '@playwright/test';
import { getPlaywrightEnv, loadPlaywrightLocalEnv } from './env';

loadPlaywrightLocalEnv();

const authStatePath = 'tests/playwright/.auth/account1.json';

test('authenticate account1 and save storage state', async ({ page }) => {
  const email = getPlaywrightEnv('BLEU_ACCOUNT_1_EMAIL');
  const password = getPlaywrightEnv('BLEU_ACCOUNT_1_PASSWORD');

  await page.goto('auth');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL(/\/wall$/);
  await expect(page.getByText('Bleup').first()).toBeVisible();

  await page.context().storageState({ path: authStatePath });
});
