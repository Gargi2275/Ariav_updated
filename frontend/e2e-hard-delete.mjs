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

async function toastKind(page, kind, match) {
  const loc = page.locator(`.Toastify__toast--${kind}`).filter({ hasText: match || /./ }).first();
  await loc.waitFor({ timeout: 8000 });
  return (await loc.innerText()).replace(/\s+/g, ' ').trim();
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
  await page.locator('.Toastify__close-button').first().click({ timeout: 2000 }).catch(() => {});

  const existing = await api(page, 'GET', '/api/categories/');
  for (const row of (existing.data.results || existing.data)) {
    if (row.category_name !== 'Hard Delete Probe') continue;
    if (row.status === 'Active') await api(page, 'DELETE', `/api/categories/${row.id}/`);
    await api(page, 'DELETE', `/api/categories/${row.id}/?permanent=true`);
  }

  const code = `HD${Date.now().toString().slice(-5)}`;
  const created = await api(page, 'POST', '/api/categories/', {
    category_code: code,
    category_name: 'Hard Delete Probe',
    parent_category_id: null,
    status: 'Active',
  });
  if (created.status !== 201) throw new Error(`create failed ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data.id;

  const activeHard = await api(page, 'DELETE', `/api/categories/${id}/?permanent=true`);
  if (activeHard.status !== 400) throw new Error(`active permanent expected 400, got ${activeHard.status}`);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Category Master');
  await page.getByText('Category Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Category Master' }).waitFor({ timeout: 10000 });

  const row = page.locator('div.flex.items-center').filter({ hasText: code }).first();
  await row.waitFor();
  if (await row.getByTitle('More actions').count()) throw new Error('kebab shown on Active row');
  await row.getByTitle('Deactivate').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate', exact: true }).click();
  const soft = await toastKind(page, 'success', /deactivated/i);
  if (!/deactivated/i.test(soft)) throw new Error(`soft toast: ${soft}`);

  await page.getByRole('button', { name: 'Inactive', exact: true }).click();
  const inactiveRow = page.locator('div.flex.items-center').filter({ hasText: code }).first();
  await inactiveRow.waitFor();
  if (await inactiveRow.getByTitle('Deactivate').count()) throw new Error('deactivate trash still on Inactive row');
  await inactiveRow.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('heading', { name: 'Permanently delete category?' }).waitFor();
  const body = await page.locator('#confirm-dialog-title').locator('xpath=following-sibling::p').innerText();
  if (!body.includes(`Permanently delete 'Hard Delete Probe'?`)) throw new Error(`dialog copy: ${body}`);
  await page.screenshot({ path: path.join(outDir, 'toast-06-hard-delete-confirm.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently' }).click();
  const gone = await toastKind(page, 'success', /permanently deleted/i);
  if (!gone.includes("'Hard Delete Probe' permanently deleted.")) throw new Error(`hard toast: ${gone}`);

  const listed = await api(page, 'GET', '/api/categories/');
  const rows = listed.data.results || listed.data;
  if (rows.some(r => r.id === id || r.category_code === code)) throw new Error('row still in API list');

  await browser.close();
  console.log(`PASSED hard-delete ${code}: active=400, deactivate, kebab permanent, row gone`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
