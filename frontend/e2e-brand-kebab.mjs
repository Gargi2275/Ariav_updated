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

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(`http://localhost:8000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, { method, path, body });
}

async function openBrandMaster(page) {
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Brand Master');
  await page.getByText('Brand Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Brand Master' }).waitFor({ timeout: 10000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const toastListed = await api(page, 'GET', '/api/brands/?search=B45391');
  const toast = (toastListed.data || []).find(r => r.brand_code === 'B45391' || r.brand_name === 'Toast Mill');
  if (!toast) throw new Error(`Toast Mill B45391 not found: ${JSON.stringify(toastListed)}`);
  const toastWasInactive = toast.status === 'Inactive';
  if (toast.status === 'Active') {
    const soft = await api(page, 'DELETE', `/api/brands/${toast.id}/`);
    if (soft.status !== 200) throw new Error(`could not deactivate Toast Mill: ${JSON.stringify(soft)}`);
  }

  await openBrandMaster(page);
  await page.getByRole('button', { name: 'Inactive', exact: true }).click();
  const toastRow = page.getByRole('row').filter({ hasText: 'B45391' });
  await toastRow.waitFor({ timeout: 10000 });
  const kebab = toastRow.getByTitle('More actions');
  await kebab.waitFor();
  await kebab.click();
  const menu = page.getByRole('menu');
  await menu.waitFor({ timeout: 5000 });
  await page.getByRole('menuitem', { name: 'Reactivate' }).waitFor();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).waitFor();
  await menu.screenshot({ path: path.join(outDir, 'brand-kebab-toast-mill.png') });

  await page.getByRole('heading', { name: 'Brand Master' }).click();
  await page.getByRole('menu').waitFor({ state: 'hidden', timeout: 3000 });

  await kebab.click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('heading', { name: 'Permanently delete brand?' }).waitFor();
  await page.getByRole('dialog').screenshot({ path: path.join(outDir, 'brand-hard-delete-confirm.png') });

  const products = await api(page, 'GET', `/api/products/?brand_id=${toast.id}&status=Active`);
  const linkedActive = Array.isArray(products.data) ? products.data.length : 0;
  if (linkedActive > 0) {
    await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
    await page.getByRole('heading', { name: 'Cannot delete brand' }).waitFor({ timeout: 8000 });
    await page.getByRole('dialog').screenshot({ path: path.join(outDir, 'brand-hard-delete-blocked.png') });
    await page.getByRole('dialog').getByRole('button', { name: 'Understood' }).click();
  } else {
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  }

  await kebab.click();
  await page.getByRole('menuitem', { name: 'Reactivate' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /reactivated/i }).waitFor();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  const activeRow = page.getByRole('row').filter({ hasText: 'B45391' });
  await activeRow.getByTitle('Deactivate').waitFor();
  if (await activeRow.getByTitle('More actions').count()) {
    throw new Error('Active Toast Mill still shows kebab');
  }

  if (toastWasInactive) {
    await activeRow.getByTitle('Deactivate').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await page.locator('.Toastify__toast--success').filter({ hasText: /deactivated/i }).waitFor();
  }

  await browser.close();
  console.log('PASSED brand kebab: Toast Mill menu, hard-delete dialog, reactivate');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
