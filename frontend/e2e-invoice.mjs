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

async function ensureDispatchedPo(page) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = ents.data[0];
  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2EIC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E Invoice Customer',
      customer_type: 'Company',
      credit_days: 15,
      entities: [{ entity_id: entity.id, primary_entity: true }],
    });
    customer = created.data;
  }
  const brands = await api(page, 'GET', '/api/brands/?status=Active');
  let brand = (brands.data || []).find(b => b.order_method === 'Digital PO');
  if (!brand) {
    const created = await api(page, 'POST', '/api/brands/', {
      brand_code: `E2EIB${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Invoice Mills',
      order_method: 'Digital PO',
    });
    if (created.status !== 201) throw new Error(`brand ${JSON.stringify(created)}`);
    brand = created.data;
  }
  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2EIR', category_name: 'E2E I Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2EIS',
      category_name: 'E2E I Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }
  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  while (list.length < 2) {
    const n = list.length + 1;
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EIP${Date.now().toString().slice(-6)}${n}`,
      product_name: `E2E Inv Yarn ${n}`,
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: n === 1 ? '10.00' : '20.00',
    });
    list.push(prod.data);
  }
  const poNumber = `E2E-INVPO-${Date.now().toString().slice(-6)}`;
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
  const blocked = await api(page, 'POST', '/api/invoices/', {
    invoice_number: `INV-BLOCK-${Date.now().toString().slice(-4)}`,
    invoice_date: '2026-09-16',
    purchase_order_id: created.data.id,
    lines: [{ purchase_order_line_id: created.data.lines[0].id, quantity: '1' }],
  });
  if (blocked.status !== 400) throw new Error(`undispatched invoice should 400, got ${blocked.status}`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/submit/`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Sent to Brand' });
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Brand Accepted' });
  const dsp = await api(page, 'POST', '/api/dispatches/', {
    purchase_order_id: created.data.id,
    dispatch_date: '2026-09-16',
    lr_number: `LR-INV-${Date.now().toString().slice(-4)}`,
    transporter: 'VRL',
    challan_reference: 'CH-INV',
    lines: [
      { purchase_order_line_id: created.data.lines[0].id, dispatched_quantity: '10.00' },
      { purchase_order_line_id: created.data.lines[1].id, dispatched_quantity: '4.00' },
    ],
  });
  if (dsp.status !== 201) throw new Error(`dispatch ${JSON.stringify(dsp)}`);
  const po = await api(page, 'GET', `/api/purchase-orders/${created.data.id}/`);
  return { po: po.data, poNumber };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);
  const fx = await ensureDispatchedPo(page);
  const invNumber = `INV-E2E-${Date.now().toString().slice(-6)}`;

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Purchase Orders');
  await page.getByText('Purchase Orders', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Purchase Orders' }).waitFor({ timeout: 10000 });
  const poRow = page.getByRole('row').filter({ hasText: fx.poNumber });
  await poRow.waitFor({ timeout: 10000 });
  await poRow.getByTitle('View').click();
  await page.getByRole('button', { name: 'Create Invoice' }).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Create Invoice' }).click();

  const form = page.locator('form').filter({ hasText: 'Create Invoice' });
  await form.waitFor({ timeout: 10000 });
  await form.getByLabel('Invoice number').fill(invNumber);
  await form.locator('tbody input').first().fill('4');
  await form.getByLabel('Discount %').fill('10');
  await form.getByLabel('Tax %').fill('5');
  await form.screenshot({ path: path.join(outDir, 'invoice-create-form.png') });
  await form.getByRole('button', { name: 'Save as Draft' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /created/i }).waitFor({ timeout: 12000 });
  await page.getByRole('row').filter({ hasText: invNumber }).waitFor({ timeout: 12000 });

  const listed = await api(page, 'GET', `/api/invoices/?search=${invNumber}`);
  const created = (listed.data || []).find(r => r.invoice_number === invNumber);
  if (!created) throw new Error(`invoice missing ${JSON.stringify(listed)}`);
  if (created.subtotal !== '40.00') throw new Error(`subtotal ${created.subtotal}`);
  if (created.net_amount !== '37.80') throw new Error(`net ${created.net_amount}`); // 40 - 4 + 1.80

  await page.getByRole('row').filter({ hasText: invNumber }).getByTitle('View').click();
  await page.getByRole('button', { name: 'Issue' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /issued/i }).waitFor({ timeout: 12000 });
  await page.getByText('ISSUED', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(outDir, 'invoice-issued-detail.png') });

  const pdf = await page.evaluate(async (id) => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(`http://localhost:8000/api/invoices/${id}/pdf/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const buf = await res.arrayBuffer();
    return { status: res.status, magic: String.fromCharCode(...new Uint8Array(buf).slice(0, 4)) };
  }, created.id);
  if (pdf.status !== 200 || pdf.magic !== '%PDF') throw new Error(`pdf ${JSON.stringify(pdf)}`);

  const over = await api(page, 'POST', '/api/invoices/', {
    invoice_number: `${invNumber}-X`,
    invoice_date: '2026-09-16',
    purchase_order_id: fx.po.id,
    lines: [{ purchase_order_line_id: fx.po.lines[0].id, quantity: '50' }],
  });
  if (over.status !== 400) throw new Error(`over invoice should 400, got ${over.status}`);

  await browser.close();
  console.log(`PASSED invoice ${invNumber}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
