import { chromium } from 'playwright-core';

async function loginAdmin(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.getByPlaceholder('Enter username').fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('heading', { name: 'Master PIN verification' }).waitFor({ timeout: 15000 });
  await page.locator('input[inputmode="numeric"]').first().click();
  await page.keyboard.type('002468');
  await page.getByRole('button', { name: /verifying|unlock|continue|authenticate/i }).click({ timeout: 5000 }).catch(() => {});
  await page.getByRole('heading', { name: 'Business Analytics & Position' }).waitFor({ timeout: 20000 });
  return errors;
}

async function jumpCategory(page) {
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Category Master');
  await page.getByText('Category Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Category Master' }).waitFor({ timeout: 10000 });
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
  const errors = await loginAdmin(page);

  const existing = await api(page, 'GET', '/api/categories/');
  for (const row of (existing.data.results || existing.data)) {
    if (row.category_name !== 'Kebab Probe') continue;
    if (row.status === 'Active') await api(page, 'DELETE', `/api/categories/${row.id}/`);
    await api(page, 'DELETE', `/api/categories/${row.id}/?permanent=true`);
  }

  const code = `KB${Date.now().toString().slice(-5)}`;
  const created = await api(page, 'POST', '/api/categories/', {
    category_code: code,
    category_name: 'Kebab Probe',
    parent_category_id: null,
    status: 'Active',
  });
  if (created.status !== 201) throw new Error(`create ${created.status}`);
  const id = created.data.id;
  await api(page, 'DELETE', `/api/categories/${id}/`);

  await jumpCategory(page);
  await page.getByRole('button', { name: 'Inactive', exact: true }).click();
  const row = page.locator('div.flex.items-center').filter({ hasText: code }).first();
  await row.waitFor({ timeout: 10000 });

  const kebab = row.getByTitle('More actions');
  const onclick = await kebab.evaluate(el => typeof el.onclick === 'function' || el.getAttribute('aria-haspopup') === 'menu');
  if (!onclick) throw new Error('kebab has no menu wiring');

  await kebab.click();
  const menu = page.getByRole('menu');
  await menu.waitFor({ timeout: 5000 });
  const box = await menu.boundingBox();
  if (!box || box.height < 20) throw new Error(`menu not visible: ${JSON.stringify(box)}`);
  await page.getByRole('menuitem', { name: 'Reactivate' }).waitFor();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).waitFor();

  await page.getByRole('heading', { name: 'Category Master' }).click();
  await page.getByRole('menu').waitFor({ state: 'hidden', timeout: 3000 });

  await kebab.click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('heading', { name: 'Permanently delete category?' }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  await kebab.click();
  await page.getByRole('menuitem', { name: 'Reactivate' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /reactivated/i }).waitFor();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  const activeRow = page.locator('div.flex.items-center').filter({ hasText: code }).first();
  await activeRow.getByTitle('Deactivate').waitFor();

  const listed = await api(page, 'GET', `/api/categories/${id}/`);
  if (listed.data.status !== 'Active') throw new Error(`status ${listed.data.status}`);

  await api(page, 'DELETE', `/api/categories/${id}/`);
  await api(page, 'DELETE', `/api/categories/${id}/?permanent=true`);

  if (errors.length) console.log('console errors', errors);
  await browser.close();
  console.log(`PASSED kebab ${code}: open, close-outside, delete dialog, reactivate`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
