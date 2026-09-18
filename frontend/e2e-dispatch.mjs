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

async function ensureAcceptedPo(page) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  if (ents.status !== 200 || !ents.data?.length) throw new Error('need an entity');
  const entity = ents.data[0];
  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2EDC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E Dispatch Customer',
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
      brand_code: `E2EDB${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Dispatch Mills',
      order_method: 'Digital PO',
    });
    if (created.status !== 201) throw new Error(`brand ${JSON.stringify(created)}`);
    brand = created.data;
  }
  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2EDR', category_name: 'E2E D Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2EDS',
      category_name: 'E2E D Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }
  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  while (list.length < 2) {
    const n = list.length + 1;
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EDP${Date.now().toString().slice(-6)}${n}`,
      product_name: `E2E Dispatch Yarn ${n}`,
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: '10.00',
    });
    if (prod.status !== 201) throw new Error(`product ${JSON.stringify(prod)}`);
    list.push(prod.data);
  }
  const poNumber = `E2E-DSP-${Date.now().toString().slice(-6)}`;
  const created = await api(page, 'POST', '/api/purchase-orders/', {
    po_number: poNumber,
    entity_id: entity.id,
    customer_id: customer.id,
    brand_id: brand.id,
    po_date: '2026-09-16',
    lines: [
      { product_id: list[0].id, quantity: '10.00', rate: '10.00' },
      { product_id: list[1].id, quantity: '4.00', rate: '20.00' },
    ],
  });
  if (created.status !== 201) throw new Error(`po ${JSON.stringify(created)}`);
  const draftDispatch = await api(page, 'POST', '/api/dispatches/', {
    purchase_order_id: created.data.id,
    dispatch_date: '2026-09-16',
    lr_number: 'LR-BLOCK',
    transporter: 'X',
    challan_reference: 'Y',
    lines: [{ purchase_order_line_id: created.data.lines[0].id, dispatched_quantity: '1' }],
  });
  if (draftDispatch.status !== 400) throw new Error(`draft dispatch should 400, got ${draftDispatch.status}`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/submit/`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Sent to Brand' });
  const accepted = await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Brand Accepted' });
  if (accepted.status !== 200) throw new Error(`accept ${JSON.stringify(accepted)}`);
  return { po: accepted.data, poNumber };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);
  const fx = await ensureAcceptedPo(page);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Purchase Orders');
  await page.getByText('Purchase Orders', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Purchase Orders' }).waitFor({ timeout: 10000 });

  const row = page.getByRole('row').filter({ hasText: fx.poNumber });
  await row.getByTitle('View').click();
  await page.getByRole('button', { name: 'Record Dispatch' }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Record Dispatch' }).click();
  const form = page.locator('form').filter({ hasText: 'Record Dispatch' });
  await form.waitFor();
  await form.getByRole('button', { name: 'Save dispatch' }).click();
  await form.getByText('This field is required.').first().waitFor({ timeout: 5000 });

  await form.getByLabel('LR number').fill('LR-E2E-1');
  await form.getByLabel('Transporter').fill('VRL Logistics');
  await form.getByLabel('Challan / reference').fill('CH-E2E-1');
  const qtyInputs = form.locator('tbody input');
  await qtyInputs.nth(0).fill('10');
  await qtyInputs.nth(1).fill('1');
  await form.screenshot({ path: path.join(outDir, 'dispatch-record-form.png') });
  await form.getByRole('button', { name: 'Save dispatch' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /Partially Dispatched/i }).waitFor({ timeout: 12000 });
  await page.getByText('PARTIALLY DISPATCHED', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(outDir, 'dispatch-partial-detail.png') });

  await page.getByRole('button', { name: 'Record Dispatch' }).click();
  const form2 = page.locator('form').filter({ hasText: 'Record Dispatch' });
  await form2.getByLabel('LR number').fill('LR-E2E-2');
  await form2.getByLabel('Transporter').fill('VRL Logistics');
  await form2.getByLabel('Challan / reference').fill('CH-E2E-2');
  await form2.locator('tbody input').first().fill('9');
  await form2.getByRole('button', { name: 'Save dispatch' }).click();
  await form2.getByText(/Cannot exceed pending/i).waitFor({ timeout: 5000 });
  await form2.locator('tbody input').first().fill('3');
  await form2.getByRole('button', { name: 'Save dispatch' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /Fully Dispatched/i }).waitFor({ timeout: 12000 });
  await page.getByText('FULLY DISPATCHED', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(outDir, 'dispatch-complete-detail.png') });

  await page.locator('div.fixed.inset-0.z-50').filter({ hasText: fx.poNumber }).locator('svg.lucide-x').locator('xpath=ancestor::button[1]').click();
  await page.getByRole('button', { name: 'Download PDF' }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

  await page.getByTitle('Purchase Orders & Dispatch').hover();
  await page.locator('span.font-body').filter({ hasText: /^Dispatches$/ }).click();
  await page.getByRole('heading', { name: 'Dispatches' }).waitFor({ timeout: 10000 });
  await page.getByRole('row').filter({ hasText: fx.poNumber }).first().waitFor();
  await page.getByRole('row').filter({ hasText: 'LR-E2E-2' }).filter({ hasText: fx.poNumber }).waitFor();
  await page.screenshot({ path: path.join(outDir, 'dispatch-list.png') });

  await browser.close();
  console.log(`PASSED dispatch ${fx.poNumber}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
