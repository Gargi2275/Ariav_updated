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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  if (ents.status !== 200 || !ents.data?.length) {
    throw new Error(`need at least one entity: ${JSON.stringify(ents)}`);
  }
  const primary = ents.data[0];

  const existing = await api(page, 'GET', '/api/customers/?search=E2E-CUST');
  for (const row of existing.data || []) {
    if (row.status === 'Active') {
      await api(page, 'DELETE', `/api/customers/${row.id}/`);
    }
    await api(page, 'DELETE', `/api/customers/${row.id}/?permanent=true`);
  }

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Customer Master');
  await page.getByText('Customer Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Customer Master' }).waitFor();
  await page.screenshot({ path: path.join(outDir, 'customer-master-list.png') });

  await page.getByRole('button', { name: /Add Customer|Add first customer/i }).first().click();
  await page.getByLabel('Customer code').fill('E2E-CUST');
  await page.getByLabel('Customer name').fill('E2E Trading Co');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save Customer' }).click();
  await page.getByText(/created successfully/i).waitFor({ timeout: 10000 });

  await page.getByRole('button', { name: 'Add Customer' }).click();
  await page.getByLabel('Customer code').fill('E2E-CUST');
  await page.getByLabel('Customer name').fill('Clone Trading');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save Customer' }).click();
  await page.locator('.Toastify__toast--error').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Cancel' }).click();

  const listed = await api(page, 'GET', '/api/customers/?search=E2E-CUST');
  const id = listed.data?.[0]?.id;
  if (!id) throw new Error(`created customer not found: ${JSON.stringify(listed)}`);

  const row = page.getByRole('row', { name: /E2E Trading Co/ });
  await row.getByTitle('Deactivate').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await page.getByText(/deactivated/i).waitFor({ timeout: 8000 });

  await page.getByRole('button', { name: 'Inactive', exact: true }).click();
  const inactiveRow = page.getByRole('row', { name: /E2E Trading Co/ });
  await inactiveRow.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  await page.getByText(/permanently deleted/i).waitFor({ timeout: 8000 });

  await page.screenshot({ path: path.join(outDir, 'customer-master-after-hard-delete.png') });
  await browser.close();
  console.log('PASSED customer master create / duplicate toast / deactivate / hard delete');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
