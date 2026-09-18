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

async function openScreen(page, title) {
  await page.keyboard.press('Control+K');
  const palette = page.getByPlaceholder(/Search all/i);
  await palette.waitFor({ timeout: 8000 });
  await palette.fill(title);
  await page.locator('[class*="z-50"]').getByText(title, { exact: true }).first().click();
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  await openScreen(page, 'Customer 360°');
  await page.getByRole('heading', { name: 'Customer 360°' }).waitFor({ timeout: 10000 });

  const select = page.locator('#c360-customer');
  await select.waitFor({ timeout: 8000 });
  const options = await select.locator('option').allTextContents();
  const mehtaOption = options.find(t => t.includes('MHT-LED'));
  if (mehtaOption) {
    const value = await select.locator('option').filter({ hasText: 'MHT-LED' }).getAttribute('value');
    const responsePromise = page.waitForResponse(r => r.url().includes('/360/') && r.request().method() === 'GET', { timeout: 15000 });
    await select.selectOption(value);
    const api = await responsePromise;
    if (!api.ok()) throw new Error(`360 API ${api.status()} ${await api.text()}`);
    await page.getByText('Outstanding', { exact: true }).waitFor({ timeout: 10000 });
    await page.getByText('Advance / Credit', { exact: true }).waitFor();
    await page.getByText('Overdue', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Basic Info' }).click();
    await page.getByText('CREDIT DAYS').waitFor();
    await page.screenshot({ path: path.join(outDir, 'customer-360-basic.png'), fullPage: true });
    await page.getByRole('button', { name: 'Purchase History' }).click();
    await page.getByText('No purchase orders yet.').waitFor();
    await page.screenshot({ path: path.join(outDir, 'customer-360-empty-history.png'), fullPage: true });
  } else {
    await page.getByText('Select a customer to open their 360° profile.').waitFor({ timeout: 8000 });
    await page.screenshot({ path: path.join(outDir, 'customer-360-empty-history.png'), fullPage: true });
  }

  await openScreen(page, 'Customer Master');
  const mehta = page.getByRole('row').filter({ hasText: 'MHT-LED' });
  await page.getByRole('heading', { name: 'Customer Master' }).waitFor();
  const hasMehtaRow = await mehta.count();
  if (hasMehtaRow) {
    await mehta.getByTitle('View 360°').click();
    await page.getByRole('heading', { name: 'Customer 360°' }).waitFor({ timeout: 10000 });
    await page.getByText('Mehta Weaving Co').first().waitFor();
  }

  await browser.close();
  console.log(JSON.stringify({ passed: true, mehta: Boolean(mehtaOption), masterAction: Boolean(hasMehtaRow) }));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
