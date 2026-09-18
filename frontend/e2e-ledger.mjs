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

async function seedLedgerCustomer(page) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = ents.data[0];
  const code = `E2ELC${Date.now().toString().slice(-5)}`;
  const customer = await api(page, 'POST', '/api/customers/', {
    customer_code: code,
    customer_name: 'E2E Ledger Customer',
    customer_type: 'Company',
    credit_days: 15,
    entities: [{ entity_id: entity.id, primary_entity: true }],
  });
  if (customer.status !== 201) throw new Error(`customer ${JSON.stringify(customer)}`);
  const brands = await api(page, 'GET', '/api/brands/?status=Active');
  let brand = (brands.data || []).find(b => b.order_method === 'Digital PO');
  if (!brand) {
    const created = await api(page, 'POST', '/api/brands/', {
      brand_code: `E2ELB${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Ledger Mills',
      order_method: 'Digital PO',
    });
    brand = created.data;
  }
  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2ELR', category_name: 'E2E L Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2ELS',
      category_name: 'E2E L Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }
  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  if (!list.length) {
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2ELP${Date.now().toString().slice(-6)}`,
      product_name: 'E2E Ledger Yarn',
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: '10.00',
    });
    list.push(prod.data);
  }
  const po = await api(page, 'POST', '/api/purchase-orders/', {
    po_number: `E2E-LEDPO-${Date.now().toString().slice(-6)}`,
    entity_id: entity.id,
    customer_id: customer.data.id,
    brand_id: brand.id,
    po_date: '2026-09-01',
    lines: [{ product_id: list[0].id, quantity: '10.00', rate: '10.00' }],
  });
  if (po.status !== 201) throw new Error(`po ${JSON.stringify(po)}`);
  await api(page, 'POST', `/api/purchase-orders/${po.data.id}/submit/`);
  await api(page, 'POST', `/api/purchase-orders/${po.data.id}/status/`, { status: 'Sent to Brand' });
  await api(page, 'POST', `/api/purchase-orders/${po.data.id}/status/`, { status: 'Brand Accepted' });
  await api(page, 'POST', '/api/dispatches/', {
    purchase_order_id: po.data.id,
    dispatch_date: '2026-09-01',
    lr_number: `LR-LED-${Date.now().toString().slice(-4)}`,
    transporter: 'VRL',
    challan_reference: 'CH-LED',
    lines: [{ purchase_order_line_id: po.data.lines[0].id, dispatched_quantity: '10.00' }],
  });
  const invA = `INV-LED-${Date.now().toString().slice(-5)}A`;
  const invB = `INV-LED-${Date.now().toString().slice(-5)}B`;
  const a = await api(page, 'POST', '/api/invoices/', {
    invoice_number: invA,
    invoice_date: '2026-09-01',
    purchase_order_id: po.data.id,
    lines: [{ purchase_order_line_id: po.data.lines[0].id, quantity: '4.00' }],
  });
  await api(page, 'POST', `/api/invoices/${a.data.id}/issue/`);
  const b = await api(page, 'POST', '/api/invoices/', {
    invoice_number: invB,
    invoice_date: '2026-09-02',
    purchase_order_id: po.data.id,
    lines: [{ purchase_order_line_id: po.data.lines[0].id, quantity: '6.00' }],
  });
  await api(page, 'POST', `/api/invoices/${b.data.id}/issue/`);
  await api(page, 'POST', '/api/payments/', {
    payment_number: `PAY-LED-${Date.now().toString().slice(-6)}`,
    payment_date: '2026-09-03',
    entity_id: entity.id,
    customer_id: customer.data.id,
    amount: '20.00',
    payment_mode: 'NEFT',
    bank_cash_account: 'HDFC Current',
    allocations: [{ invoice_id: a.data.id, allocated_amount: '20.00' }],
  });
  return { customer: customer.data, code, invA, invB };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);
  const fx = await seedLedgerCustomer(page);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Customer Master');
  await page.getByText('Customer Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Customer Master' }).waitFor({ timeout: 10000 });
  const row = page.getByRole('row').filter({ hasText: fx.code });
  await row.waitFor({ timeout: 10000 });
  await row.getByTitle('View Ledger').click();

  await page.getByRole('heading', { name: 'Customer Ledger' }).waitFor({ timeout: 10000 });
  await page.getByText('Total Invoiced').waitFor();
  await page.getByText(fx.invA).waitFor();
  await page.getByText(fx.invB).waitFor();
  await page.getByText('₹80.00').first().waitFor();
  await page.screenshot({ path: path.join(outDir, 'customer-ledger.png') });

  const pdf = await page.evaluate(async (id) => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(`http://localhost:8000/api/customers/${id}/ledger/pdf/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const buf = await res.arrayBuffer();
    return { status: res.status, magic: String.fromCharCode(...new Uint8Array(buf).slice(0, 4)) };
  }, fx.customer.id);
  if (pdf.status !== 200 || pdf.magic !== '%PDF') throw new Error(`pdf ${JSON.stringify(pdf)}`);

  await page.getByRole('button', { name: fx.invA }).click();
  await page.getByRole('heading', { name: fx.invA }).waitFor({ timeout: 8000 });

  await browser.close();
  console.log(`PASSED ledger ${fx.code}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
