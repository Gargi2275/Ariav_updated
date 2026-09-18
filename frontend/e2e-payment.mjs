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

async function ensureIssuedInvoice(page) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = ents.data[0];
  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2EPC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E Payment Customer',
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
      brand_code: `E2EPB${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Payment Mills',
      order_method: 'Digital PO',
    });
    brand = created.data;
  }
  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2EPR', category_name: 'E2E P Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2EPS',
      category_name: 'E2E P Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }
  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  if (!list.length) {
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EPP${Date.now().toString().slice(-6)}`,
      product_name: 'E2E Pay Yarn',
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: '10.00',
    });
    list.push(prod.data);
  }
  const poNumber = `E2E-PAYPO-${Date.now().toString().slice(-6)}`;
  const created = await api(page, 'POST', '/api/purchase-orders/', {
    po_number: poNumber,
    entity_id: entity.id,
    customer_id: customer.id,
    brand_id: brand.id,
    po_date: '2026-09-16',
    lines: [{ product_id: list[0].id, quantity: '10.00', rate: '10.00' }],
  });
  if (created.status !== 201) throw new Error(`po ${JSON.stringify(created)}`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/submit/`);
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Sent to Brand' });
  await api(page, 'POST', `/api/purchase-orders/${created.data.id}/status/`, { status: 'Brand Accepted' });
  const dsp = await api(page, 'POST', '/api/dispatches/', {
    purchase_order_id: created.data.id,
    dispatch_date: '2026-09-16',
    lr_number: `LR-PAY-${Date.now().toString().slice(-4)}`,
    transporter: 'VRL',
    challan_reference: 'CH-PAY',
    lines: [{ purchase_order_line_id: created.data.lines[0].id, dispatched_quantity: '10.00' }],
  });
  if (dsp.status !== 201) throw new Error(`dispatch ${JSON.stringify(dsp)}`);
  const invNumber = `INV-PAY-${Date.now().toString().slice(-6)}`;
  const invoice = await api(page, 'POST', '/api/invoices/', {
    invoice_number: invNumber,
    invoice_date: '2026-09-16',
    purchase_order_id: created.data.id,
    lines: [{ purchase_order_line_id: created.data.lines[0].id, quantity: '4.00' }],
  });
  if (invoice.status !== 201) throw new Error(`invoice ${JSON.stringify(invoice)}`);
  const issued = await api(page, 'POST', `/api/invoices/${invoice.data.id}/issue/`);
  if (issued.status !== 200) throw new Error(`issue ${JSON.stringify(issued)}`);
  return { entity, customer, invoice: issued.data, invNumber };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);
  const fx = await ensureIssuedInvoice(page);
  const payNumber = `PAY-E2E-${Date.now().toString().slice(-6)}`;

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Payments');
  await page.getByText('Payments', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Payments' }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Record Payment' }).first().click();

  const form = page.locator('form').filter({ hasText: 'Record Payment' });
  await form.waitFor({ timeout: 8000 });
  await form.locator('select').nth(0).selectOption({ value: String(fx.entity.id) });
  await form.locator('select').nth(1).selectOption({ value: String(fx.customer.id) });
  await form.getByLabel('Payment number').fill(payNumber);
  await form.getByLabel('Amount').fill('40');
  await form.getByLabel('Bank / cash account').fill('HDFC Current');
  await form.getByText(fx.invNumber).waitFor({ timeout: 8000 });
  await form.getByRole('row').filter({ hasText: fx.invNumber }).locator('input').fill('40');
  await form.screenshot({ path: path.join(outDir, 'payment-record-form.png') });
  await form.getByRole('button', { name: 'Save payment' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /recorded/i }).waitFor({ timeout: 12000 });
  await page.getByRole('row').filter({ hasText: payNumber }).waitFor({ timeout: 10000 });

  const listed = await api(page, 'GET', `/api/payments/?search=${payNumber}`);
  const created = (listed.data || []).find(r => r.payment_number === payNumber);
  if (!created) throw new Error(`payment missing ${JSON.stringify(listed)}`);
  if (created.unallocated_amount !== '0.00') throw new Error(`unallocated ${created.unallocated_amount}`);

  const inv = await api(page, 'GET', `/api/invoices/${fx.invoice.id}/`);
  if (inv.data.status !== 'Paid') throw new Error(`invoice status ${inv.data.status}`);
  if (inv.data.remaining_balance !== '0.00') throw new Error(`balance ${inv.data.remaining_balance}`);

  await page.getByRole('row').filter({ hasText: payNumber }).getByTitle('View').click();
  await page.getByText(fx.invNumber).waitFor();
  await page.screenshot({ path: path.join(outDir, 'payment-detail.png') });

  await browser.close();
  console.log(`PASSED payment ${payNumber} → ${fx.invNumber} Paid`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
