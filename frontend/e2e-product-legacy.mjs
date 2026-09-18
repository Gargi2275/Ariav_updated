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

async function assertNoAsterisk(form, labelRe) {
  const lab = form.locator('label').filter({ hasText: labelRe }).first();
  await lab.waitFor();
  const stars = await lab.locator('span').filter({ hasText: '*' }).count();
  if (stars !== 0) throw new Error(`optional field "${labelRe}" has an asterisk`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const brands = await api(page, 'GET', '/api/brands/?status=Active');
  const cats = await api(page, 'GET', '/api/categories/?status=Active');
  if (brands.status !== 200 || !brands.data?.length) throw new Error(`need a brand: ${JSON.stringify(brands)}`);
  const brand = brands.data[0];
  const top = (cats.data || []).find(c => !c.parent_category_id);
  const sub = (cats.data || []).find(c => c.parent_category_id);
  if (!top || !sub) throw new Error(`need category + subcategory: ${JSON.stringify(cats)}`);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Product Catalogue');
  await page.getByText('Product Catalogue', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Product Catalogue' }).waitFor();

  await page.getByRole('button', { name: /Add Product|Add first/i }).first().click();
  const form = page.locator('form').filter({ hasText: 'Required field' });
  await form.waitFor();

  await form.getByRole('button', { name: 'Save Product' }).click();
  await form.getByText('This field is required.').first().waitFor({ timeout: 5000 });
  const requiredCount = await form.getByText('This field is required.').count();
  if (requiredCount < 4) throw new Error(`expected 4 required messages, got ${requiredCount}`);

  await assertNoAsterisk(form, /^Print name$/);
  await assertNoAsterisk(form, /^Product type$/);
  await assertNoAsterisk(form, /^Group$/);
  await assertNoAsterisk(form, /^Description$/);
  await assertNoAsterisk(form, /^FRate/);
  await assertNoAsterisk(form, /^TRate/);
  await assertNoAsterisk(form, /^Rate/);

  await form.screenshot({ path: path.join(outDir, 'product-legacy-required.png') });

  const code = `E2E-L${Date.now().toString().slice(-8)}`;
  await form.getByLabel('Product code').fill(code);
  await form.getByLabel('Product name').fill('Legacy Item Shirt');
  await form.getByLabel('Print name').fill('Shirt — Invoice');
  await form.locator('select').nth(0).selectOption(String(brand.id));
  await form.locator('select').nth(1).selectOption(String(sub.parent_category_id || top.id));
  await form.locator('select').nth(2).selectOption(String(sub.id));
  await form.getByLabel('Product type').fill('Yarn');
  await form.getByLabel('Group').fill('Export');
  await form.locator('textarea').fill('Fine count for shirting.');
  await form.getByRole('textbox', { name: 'Rate (₹)', exact: true }).fill('125.50');
  await form.getByRole('textbox', { name: 'FRate (₹)' }).fill('110.25');
  await form.getByRole('textbox', { name: 'TRate (₹)' }).fill('130.00');

  await form.screenshot({ path: path.join(outDir, 'product-legacy-filled.png') });
  await form.getByRole('button', { name: 'Save Product' }).click();
  await page.locator('.Toastify__toast--success').first().waitFor({ timeout: 12000 });
  await form.waitFor({ state: 'hidden', timeout: 8000 });

  const listed = await api(page, 'GET', `/api/products/?search=${code}`);
  if (listed.status !== 200) throw new Error(`list failed: ${JSON.stringify(listed)}`);
  const created = (listed.data || []).find(r => r.product_code === code);
  if (!created) throw new Error(`created product missing: ${JSON.stringify(listed)}`);
  const checks = {
    print_name: 'Shirt — Invoice',
    description: 'Fine count for shirting.',
    product_type: 'Yarn',
    group: 'Export',
    frate: '110.25',
    trate: '130.00',
    rate: '125.50',
  };
  for (const [k, v] of Object.entries(checks)) {
    if (String(created[k]) !== v) throw new Error(`API ${k}=${created[k]} expected ${v}`);
  }

  const row = page.getByRole('row').filter({ hasText: code });
  await row.getByRole('button').first().click();
  const edit = page.locator('form').filter({ hasText: 'Edit Product' });
  await edit.waitFor();
  if ((await edit.getByLabel('Print name').inputValue()) !== 'Shirt — Invoice') throw new Error('print_name did not load');
  if ((await edit.getByLabel('Product type').inputValue()) !== 'Yarn') throw new Error('product_type did not load');
  if ((await edit.getByLabel('Group').inputValue()) !== 'Export') throw new Error('group did not load');
  if ((await edit.locator('textarea').inputValue()) !== 'Fine count for shirting.') throw new Error('description did not load');
  if ((await edit.getByRole('textbox', { name: 'FRate (₹)' }).inputValue()) !== '110.25') throw new Error('frate did not load');
  if ((await edit.getByRole('textbox', { name: 'TRate (₹)' }).inputValue()) !== '130.00') throw new Error('trate did not load');
  const rateVal = await edit.getByRole('textbox', { name: 'Rate (₹)', exact: true }).inputValue();
  if (rateVal !== '125.5' && rateVal !== '125.50') throw new Error(`rate did not load: ${rateVal}`);
  await edit.screenshot({ path: path.join(outDir, 'product-legacy-edit.png') });

  await edit.getByLabel('Print name').fill('Shirt — Dispatch');
  await edit.getByRole('button', { name: 'Save Product' }).click();
  await page.locator('.Toastify__toast--success').first().waitFor({ timeout: 12000 });
  await edit.waitFor({ state: 'hidden', timeout: 8000 });

  const again = await api(page, 'GET', `/api/products/${created.id}/`);
  if (again.status !== 200 || again.data.print_name !== 'Shirt — Dispatch') {
    throw new Error(`edit did not persist: ${JSON.stringify(again)}`);
  }
  if (again.data.frate !== '110.25' || again.data.trate !== '130.00' || again.data.rate !== '125.50') {
    throw new Error(`rates changed unexpectedly: ${JSON.stringify(again.data)}`);
  }

  await browser.close();
  console.log('PASSED product legacy fields create/edit/API/required validation');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
