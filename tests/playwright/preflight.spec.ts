import { expect, test, devices, type Browser } from '@playwright/test';

const subscriptionsPath = 'subscriptions';

async function createMobilePage(browser: Browser, storageStatePath: string, deviceName: 'iPhone 13' | 'Pixel 7') {
  const context = await browser.newContext({
    ...devices[deviceName],
    storageState: storageStatePath,
  });
  const page = await context.newPage();
  return { context, page };
}

async function createAnonymousPage(browser: Browser) {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [],
    },
  });
  const page = await context.newPage();
  return { context, page };
}

test('T1 public landing renders stable shell', async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  try {
    await page.goto('./');

    await expect(page.getByText('Bleup').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to save and follow channels' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('T2 auth route renders sign-in UI and stays on the deep link', async ({ browser }) => {
  const { context, page } = await createAnonymousPage(browser);
  try {
    await page.goto('auth');

    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('T3 iPhone-emulated subscriptions flow can start YouTube connect without inline failure', async ({ browser }) => {
  const { context, page } = await createMobilePage(browser, 'tests/playwright/.auth/account1.json', 'iPhone 13');
  try {
    let redirectedToGoogle = false;
    await context.route('https://accounts.google.com/**', async (route) => {
      redirectedToGoogle = true;
      await route.abort();
    });

    await page.goto(subscriptionsPath);
    await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible();

    const startResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/youtube/connection/start') && response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Connect YouTube' }).click();
    const startResponse = await startResponsePromise;
    expect(startResponse.ok()).toBeTruthy();
    await expect.poll(() => redirectedToGoogle).toBeTruthy();
  } finally {
    await context.close();
  }
});

test('T4 Pixel-emulated subscriptions callback params clear after hydration', async ({ browser }) => {
  const { context, page } = await createMobilePage(browser, 'tests/playwright/.auth/account1.json', 'Pixel 7');
  try {
    await page.goto(`${subscriptionsPath}?yt_connect=success`);

    await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect YouTube' })).toBeVisible();
    await expect(page).not.toHaveURL(/yt_connect=/);
    await expect(page).not.toHaveURL(/yt_code=/);
  } finally {
    await context.close();
  }
});

test('T5 signed-in lazy credit refresh stays quiet until the menu opens', async ({ page }) => {
  const creditRequestUrls: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/credits')) {
      creditRequestUrls.push(response.url());
    }
  });

  await page.goto('wall');
  await expect(page.getByText('Bleup').first()).toBeVisible();

  await page.waitForTimeout(15_000);
  expect(creditRequestUrls).toHaveLength(0);

  await page.locator('button[aria-haspopup="menu"]').last().click();
  await expect.poll(() => creditRequestUrls.length, { timeout: 10_000 }).toBe(1);

  await page.goto('search');
  await expect.poll(() => creditRequestUrls.length, { timeout: 10_000 }).toBe(2);
});
