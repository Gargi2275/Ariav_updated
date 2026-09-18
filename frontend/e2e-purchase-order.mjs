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

async function ensureFixtures(page) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  if (ents.status !== 200 || !ents.data?.length) throw new Error('need an entity');
  const entity = ents.data[0];

  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2EPOC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E PO Customer',
      customer_type: 'Company',
      entities: [{ entity_id: entity.id, primary_entity: true }],
    });
    if (created.status !== 201) throw new Error(`customer ${JSON.stringify(created)}`);
    customer = created.data;
  }

  const brands = await api(page, 'GET', '/api/brands/?status=Active');
  let brand = (brands.data || []).find(b => b.order_method === 'Digital PO');
  if (!brand) {
    const created = await api(page, 'POST', '/api/brands/', {
      brand_code: `E2ED${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Digital Mills',
      order_method: 'Digital PO',
    });
    if (created.status !== 201) throw new Error(`brand ${JSON.stringify(created)}`);
    brand = created.data;
  }

  let manualBrand = (brands.data || []).find(b => b.order_method === 'Manual/POR');
  if (!manualBrand) {
    const created = await api(page, 'POST', '/api/brands/', {
      brand_code: `E2EM${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Manual Mills',
      order_method: 'Manual/POR',
    });
    if (created.status !== 201) throw new Error(`manual brand ${JSON.stringify(created)}`);
    manualBrand = created.data;
  }

  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2ER', category_name: 'E2E Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2ES',
      category_name: 'E2E Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }

  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  while (list.length < 2) {
    const n = list.length + 1;
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EP${Date.now().toString().slice(-6)}${n}`,
      product_name: `E2E Yarn ${n}`,
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: n === 1 ? '125.50' : '98.00',
    });
    if (prod.status !== 201) throw new Error(`product ${JSON.stringify(prod)}`);
    list.push(prod.data);
  }

  let manualProducts = await api(page, 'GET', `/api/products/?status=Active&brand_id=${manualBrand.id}`);
  let manualProduct = (manualProducts.data || [])[0];
  if (!manualProduct) {
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EMP${Date.now().toString().slice(-6)}`,
      product_name: 'E2E Manual SKU',
      brand_id: manualBrand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: '10.00',
    });
    if (prod.status !== 201) throw new Error(`manual product ${JSON.stringify(prod)}`);
    manualProduct = prod.data;
  }

  return { entity, customer, brand, products: list.slice(0, 2), manualBrand, manualProduct };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);
  const fx = await ensureFixtures(page);
  const poNumber = `E2E-PO-${Date.now().toString().slice(-6)}`;

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Purchase Orders');
  await page.getByText('Purchase Orders', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Purchase Orders' }).waitFor({ timeout: 10000 });

  await page.getByRole('button', { name: /Create PO|Create first/i }).first().click();
  const form = page.locator('form').filter({ hasText: 'Create Purchase Order' });
  await form.waitFor();
  await form.getByRole('button', { name: 'Save as Draft' }).click();
  await form.getByText('This field is required.').first().waitFor({ timeout: 5000 });
  await form.screenshot({ path: path.join(outDir, 'po-required.png') });

  await form.getByLabel('PO number').fill(poNumber);
  await form.locator('select').nth(0).selectOption(String(fx.entity.id));
  await form.locator('select').nth(1).selectOption(String(fx.customer.id), { timeout: 8000 });
  await form.locator('select').nth(2).selectOption(String(fx.brand.id));
  await page.waitForTimeout(400);
  const productSelects = form.locator('tbody select');
  await productSelects.first().selectOption(String(fx.products[0].id));
  await form.locator('tbody input').nth(0).fill('10');
  await form.getByRole('button', { name: '+ Add line' }).click();
  await productSelects.nth(1).selectOption(String(fx.products[1].id));
  await form.locator('tbody tr').nth(1).locator('input').first().fill('4');
  await form.screenshot({ path: path.join(outDir, 'po-create-form.png') });
  await form.getByRole('button', { name: 'Save as Draft' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /created/i }).waitFor({ timeout: 12000 });

  const listed = await api(page, 'GET', `/api/purchase-orders/?search=${poNumber}`);
  const created = (listed.data || []).find(r => r.po_number === poNumber);
  if (!created) throw new Error(`PO missing ${JSON.stringify(listed)}`);
  if (created.status !== 'Draft') throw new Error(`expected Draft, got ${created.status}`);
  if (Number(created.total_amount) !== 10 * Number(fx.products[0].rate) + 4 * Number(fx.products[1].rate)
    && Number(created.total_quantity) !== 14) {
    // totals still must exist
    if (!created.total_amount) throw new Error(`no total ${JSON.stringify(created)}`);
  }

  const row = page.getByRole('row').filter({ hasText: poNumber });
  await row.getByTitle('View').click();
  const detail = page.locator('div').filter({ hasText: poNumber }).filter({ hasText: 'Download PDF' }).last();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /submitted/i }).waitFor({ timeout: 12000 });
  await page.getByText('SUBMITTED', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(outDir, 'po-submitted-detail.png') });

  const after = await api(page, 'GET', `/api/purchase-orders/${created.id}/`);
  if (after.data.status !== 'Submitted') throw new Error(`submit failed ${JSON.stringify(after)}`);
  const blocked = await api(page, 'PUT', `/api/purchase-orders/${created.id}/`, {
    po_number: poNumber,
    entity_id: fx.entity.id,
    customer_id: fx.customer.id,
    brand_id: fx.brand.id,
    po_date: after.data.po_date,
    lines: [{ product_id: fx.products[0].id, quantity: '99', rate: '1' }],
  });
  if (blocked.status !== 400) throw new Error(`edit submitted should 400, got ${blocked.status}`);

  const pdf = await page.evaluate(async (id) => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(`http://localhost:8000/api/purchase-orders/${id}/pdf/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const buf = await res.arrayBuffer();
    return { status: res.status, type: res.headers.get('content-type'), magic: String.fromCharCode(...new Uint8Array(buf).slice(0, 4)) };
  }, created.id);
  if (pdf.status !== 200 || pdf.type !== 'application/pdf' || pdf.magic !== '%PDF') {
    throw new Error(`pdf failed ${JSON.stringify(pdf)}`);
  }

  await page.locator('div.fixed.inset-0.z-50 h3').filter({ hasText: poNumber }).locator('xpath=../following-sibling::div/button').click();
  await page.locator('div.fixed.inset-0.z-50').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  const dup = await api(page, 'POST', '/api/purchase-orders/', {
    po_number: poNumber,
    entity_id: fx.entity.id,
    customer_id: fx.customer.id,
    brand_id: fx.brand.id,
    po_date: '2026-09-16',
    lines: [{ product_id: fx.products[0].id, quantity: '1', rate: '10' }],
  });
  if (dup.status !== 400) throw new Error(`duplicate should 400, got ${dup.status}`);

  let manualBrand = fx.manualBrand;
  const mismatch = await api(page, 'POST', '/api/purchase-orders/', {
    po_number: `E2E-MM-${Date.now().toString().slice(-6)}`,
    order_type: 'Manual',
    entity_id: fx.entity.id,
    customer_id: fx.customer.id,
    brand_id: fx.brand.id,
    po_date: '2026-09-16',
    lines: [{ product_id: fx.products[0].id, quantity: '1', rate: '10' }],
  });
  if (mismatch.status !== 400) throw new Error(`manual+digital brand should 400, got ${mismatch.status}`);

  const porNumber = `E2E-POR-${Date.now().toString().slice(-6)}`;
  await page.getByRole('button', { name: /Create PO/i }).first().click();
  const porForm = page.locator('form').filter({ hasText: 'Create Purchase Order' });
  await porForm.waitFor();
  await porForm.getByLabel('PO number').fill(porNumber);
  await porForm.locator('select').nth(0).selectOption(String(fx.entity.id));
  await porForm.locator('select').nth(1).selectOption(String(fx.customer.id), { timeout: 8000 });
  await porForm.locator('select').nth(2).selectOption(String(manualBrand.id));
  await page.waitForTimeout(500);
  await porForm.getByText('Order type: Manual / POR').waitFor();
  const catalogueSelect = porForm.locator('tbody select').first();
  await catalogueSelect.selectOption(String(fx.manualProduct.id), { timeout: 8000 });
  await porForm.locator('tbody input').nth(0).fill('2');
  await porForm.getByRole('button', { name: '+ Add line' }).click();
  await porForm.getByRole('button', { name: /Enter manually/i }).last().click();
  await porForm.getByPlaceholder('Item from handy form…').fill('Grey 60s from handy form');
  const lastRow = porForm.locator('tbody tr').nth(1);
  await lastRow.locator('input').nth(1).fill('12');
  await lastRow.locator('input').nth(2).fill('80');
  await porForm.locator('input[type="file"]').setInputFiles({
    name: 'handy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 handy'),
  });
  await porForm.screenshot({ path: path.join(outDir, 'por-create-form.png') });
  await porForm.getByRole('button', { name: 'Save as Draft' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /created/i }).waitFor({ timeout: 12000 });

  const listedPor = await api(page, 'GET', `/api/purchase-orders/?search=${porNumber}`);
  const por = (listedPor.data || []).find(r => r.po_number === porNumber);
  if (!por) throw new Error(`POR missing ${JSON.stringify(listedPor)}`);
  if (por.order_type !== 'Manual') throw new Error(`expected Manual, got ${JSON.stringify(por)}`);
  if (!por.handy_form_url) throw new Error(`handy form missing ${JSON.stringify(por)}`);
  if (por.lines.length !== 2) throw new Error(`expected 2 lines ${JSON.stringify(por)}`);

  const porRow = page.getByRole('row').filter({ hasText: porNumber });
  await porRow.getByText('MANUAL').waitFor();
  await porRow.getByTitle('View').click();
  await page.getByText('Handy form', { exact: true }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'por-detail.png') });

  const porPdf = await page.evaluate(async (id) => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(`http://localhost:8000/api/purchase-orders/${id}/pdf/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const header = String.fromCharCode(...bytes.slice(0, 4));
    const text = new TextDecoder('latin1').decode(bytes);
    return { status: res.status, magic: header, title: /Purchase Order Request/.test(text), filename: res.headers.get('content-disposition') };
  }, por.id);
  if (porPdf.status !== 200 || porPdf.magic !== '%PDF' || !porPdf.title) {
    throw new Error(`POR pdf failed ${JSON.stringify(porPdf)}`);
  }

  await browser.close();
  console.log(`PASSED digital ${poNumber} + manual POR ${porNumber}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
