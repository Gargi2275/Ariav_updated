import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('D:/ariav-erp/docs/e2e-screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function loginAdmin(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form').filter({ hasText: 'Username / Account' });
  await form.waitFor({ timeout: 15000 });
  await form.getByPlaceholder('Enter username').fill('admin');
  await form.locator('input[type="password"]').first().fill('admin123');
  await form.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('heading', { name: 'Master PIN verification' }).waitFor({ timeout: 15000 });
  await page.locator('input[inputmode="numeric"]').first().click();
  await page.keyboard.type('002468');
  await page.getByRole('button', { name: /verifying|unlock|continue|authenticate/i }).click({ timeout: 5000 }).catch(() => {});
  await page.getByRole('heading', { name: 'Business Analytics & Position' }).waitFor({ timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Reports & Analytics');
  await page.getByText('Reports & Analytics', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Reports & Analytics' }).waitFor({ timeout: 15000 });
  await page.getByText('No data for this period').waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(outDir, 'reports-empty-purchase-sales.png') });

  await page.getByRole('button', { name: 'Bad Debt Trend', exact: true }).click();
  await page.getByText(/Not tracked yet — no write-off mechanism exists/i).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'reports-bad-debt.png') });

  await page.getByRole('button', { name: 'Entity Performance', exact: true }).click();
  await page.getByRole('cell', { name: 'GUJ · Gujarat' }).waitFor({ timeout: 8000 });
  await page.getByRole('cell', { name: 'ADT · Aditi' }).waitFor();
  await page.getByRole('cell', { name: 'SRV · Shriva' }).waitFor();
  await page.screenshot({ path: path.join(outDir, 'reports-entity-performance.png') });

  await page.getByRole('button', { name: 'Outstanding Report', exact: true }).click();
  await page.getByText('No data for this period').waitFor({ timeout: 8000 });

  const banned = ['Sharda Synthetics', 'E2E PO Customer', 'E2E-'];
  const body = await page.locator('main').innerText().catch(async () => page.locator('body').innerText());
  for (const phrase of banned) {
    if (body.includes(phrase)) throw new Error(`unexpected leftover: ${phrase}`);
  }

  await browser.close();
  console.log('PASSED reports empty states — no E2E leftovers, bad debt not tracked');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
