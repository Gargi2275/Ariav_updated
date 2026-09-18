/**
 * Duplicate-code must not create rows. Requires Vite :5173 + Django :8000.
 */
import { chromium } from 'playwright-core';

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
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }, { method, path, body });
}

async function toastError(page) {
  const loc = page.locator('.Toastify__toast--error').first();
  await loc.waitFor({ timeout: 8000 });
  return (await loc.innerText()).replace(/\s+/g, ' ').trim();
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const listed = await api(page, 'GET', '/api/categories/');
  if (listed.status !== 200) throw new Error(`list failed ${listed.status}`);
  const before = Array.isArray(listed.data) ? listed.data.length : (listed.data.results || []).length;

  const codes = new Set((listed.data.results || listed.data).map(r => r.category_code));
  if (!codes.has('CF')) {
    const seed = await api(page, 'POST', '/api/categories/', {
      category_code: 'CF',
      category_name: 'Cotton Fabric',
      parent_category_id: null,
      status: 'Active',
    });
    if (![200, 201].includes(seed.status)) throw new Error(`seed CF failed ${seed.status} ${JSON.stringify(seed.data)}`);
  }
  const afterSeed = await api(page, 'GET', '/api/categories/');
  const baseline = (afterSeed.data.results || afterSeed.data).length;

  for (let i = 0; i < 3; i++) {
    const res = await api(page, 'POST', '/api/categories/', {
      category_code: 'CF',
      category_name: 'Toast Cotton',
      parent_category_id: null,
      status: 'Active',
    });
    if (res.status !== 400) throw new Error(`attempt ${i + 1} expected 400, got ${res.status} ${JSON.stringify(res.data)}`);
    const msg = (res.data.category_code || []).join(' ');
    if (!/already in use/i.test(msg)) throw new Error(`attempt ${i + 1} message: ${msg}`);
  }

  const after = await api(page, 'GET', '/api/categories/');
  const afterCount = (after.data.results || after.data).length;
  const toastRows = (after.data.results || after.data).filter(r => r.category_name === 'Toast Cotton');
  if (afterCount !== baseline) throw new Error(`count ${baseline} -> ${afterCount} (started ${before})`);
  if (toastRows.length !== 0) throw new Error(`Toast Cotton rows appeared: ${JSON.stringify(toastRows)}`);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Category Master');
  await page.getByText('Category Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Category Master' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Add Category/i }).click();
  await page.getByLabel('Category code').fill('CF');
  await page.getByLabel('Category name').fill('Toast Cotton');
  await page.getByRole('button', { name: /Save Category/i }).click();
  const t1 = await toastError(page);
  if (!/Category code 'CF' is already in use/.test(t1)) throw new Error(`toast 1: ${t1}`);
  if (!(await page.getByRole('heading', { name: /Add Category/i }).isVisible())) throw new Error('modal closed');
  await page.getByRole('button', { name: /Save Category/i }).click();
  const t2 = await toastError(page);
  if (!/already in use/.test(t2)) throw new Error(`toast 2: ${t2}`);
  await page.getByRole('button', { name: /Save Category/i }).click();
  const t3 = await toastError(page);
  if (!/already in use/.test(t3)) throw new Error(`toast 3: ${t3}`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  const afterUi = await api(page, 'GET', '/api/categories/');
  const afterUiCount = (afterUi.data.results || afterUi.data).length;
  const toastAfterUi = (afterUi.data.results || afterUi.data).filter(r => r.category_name === 'Toast Cotton');
  if (afterUiCount !== baseline) throw new Error(`after UI submits count ${baseline} -> ${afterUiCount}`);
  if (toastAfterUi.length !== 0) throw new Error(`Toast Cotton rows after UI: ${JSON.stringify(toastAfterUi)}`);
  if (await page.getByRole('heading', { name: /Add Category/i }).count()) throw new Error('modal still open after cancel');

  await browser.close();
  console.log(`PASSED duplicate CF x3: API count stayed ${baseline}, toasts fired, no Toast Cotton rows`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
