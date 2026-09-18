import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('D:/ariav-erp/docs/e2e-screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function loginAdmin(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Enter username').fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.getByRole('button', { name: /continue/i }).click();
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

  const banned = ['Sharda Synthetics', 'Surat Ring Road Textile Mkt', 'Jigneshbhai', 'GST VERIFIED', 'Working Capital Velocity'];
  const body = await page.locator('main').innerText();
  for (const phrase of banned) {
    if (body.includes(phrase)) throw new Error(`mock phrase still visible: ${phrase}`);
  }
  await page.getByText('Total Sales').first().waitFor({ timeout: 10000 });
  await page.getByText('Debtor Outstanding & Credit Aging').waitFor();
  await page.screenshot({ path: path.join(outDir, 'dashboard-admin.png') });

  await page.getByRole('button', { name: 'Entity', exact: true }).click();
  await page.getByText('Entity Turnover Distribution').waitFor({ timeout: 8000 });
  const entitySelect = page.locator('select').filter({ hasText: 'All Entities' });
  await entitySelect.waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'dashboard-entity.png') });

  await page.getByRole('button', { name: 'Staff', exact: true }).click();
  await page.getByText('POs created').waitFor({ timeout: 8000 });
  await page.getByText('Showing records you created').waitFor();
  await page.screenshot({ path: path.join(outDir, 'dashboard-staff.png') });

  await browser.close();
  console.log('PASSED live dashboard — admin/entity/staff, no mock debtor names');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
