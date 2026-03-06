import fs from 'node:fs/promises';
import { devices, expect, type Browser, type Page, type TestInfo } from '@playwright/test';

export type MobileDeviceName = 'iPhone 13' | 'Pixel 7';

type EvidenceRecord = {
  test_id: string;
  status: 'passed' | 'skipped';
  device: MobileDeviceName | 'n/a';
  flow: string;
  start_route: string;
  expected_route: string;
  actual_route: string;
  notes: string[];
  response_status?: number | null;
};

export async function createStoredMobilePage(
  browser: Browser,
  storageStatePath: string,
  deviceName: MobileDeviceName,
) {
  const context = await browser.newContext({
    ...devices[deviceName],
    storageState: storageStatePath,
  });
  const page = await context.newPage();
  return { context, page };
}

export async function saveEvidenceJson(testInfo: TestInfo, fileName: string, payload: unknown) {
  const outputPath = testInfo.outputPath(fileName);
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await testInfo.attach(fileName, {
    path: outputPath,
    contentType: 'application/json',
  });
}

export async function saveEvidenceScreenshot(testInfo: TestInfo, page: Page, fileName: string) {
  const outputPath = testInfo.outputPath(fileName);
  await page.screenshot({ path: outputPath, fullPage: true });
  await testInfo.attach(fileName, {
    path: outputPath,
    contentType: 'image/png',
  });
}

export async function expectCallbackParamsCleared(page: Page) {
  await expect(page).not.toHaveURL(/yt_connect=/);
  await expect(page).not.toHaveURL(/yt_code=/);
}

export async function recordEvidence(
  testInfo: TestInfo,
  input: EvidenceRecord,
) {
  await saveEvidenceJson(testInfo, 'evidence.json', {
    ...input,
    captured_at: new Date().toISOString(),
  });
}
