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

async function ensureIssuedInvoice(page, quantity, invoiceNumber) {
  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = ents.data[0];
  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2EAC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E Adjustment Customer',
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
      brand_code: `E2EAB${Date.now().toString().slice(-4)}`,
      brand_name: 'E2E Adj Mills',
      order_method: 'Digital PO',
    });
    brand = created.data;
  }
  const cats = await api(page, 'GET', '/api/categories/');
  let sub = (cats.data || []).find(c => c.parent_category_id);
  if (!sub) {
    const root = await api(page, 'POST', '/api/categories/', { category_code: 'E2EAR', category_name: 'E2E A Root' });
    const child = await api(page, 'POST', '/api/categories/', {
      category_code: 'E2EAS',
      category_name: 'E2E A Sub',
      parent_category_id: root.data.id,
    });
    sub = child.data;
  }
  let products = await api(page, 'GET', `/api/products/?status=Active&brand_id=${brand.id}`);
  const list = products.data || [];
  if (!list.length) {
    const prod = await api(page, 'POST', '/api/products/', {
      product_code: `E2EAP${Date.now().toString().slice(-6)}`,
      product_name: 'E2E Adj Yarn',
      brand_id: brand.id,
      category_id: sub.id,
      unit: 'Meter',
      rate: '10.00',
    });
    list.push(prod.data);
  }
  const poNumber = `E2E-ADJPO-${Date.now().toString().slice(-6)}`;
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
    lr_number: `LR-ADJ-${Date.now().toString().slice(-4)}`,
    transporter: 'VRL',
    challan_reference: 'CH-ADJ',
    lines: [{ purchase_order_line_id: created.data.lines[0].id, dispatched_quantity: '10.00' }],
  });
  if (dsp.status !== 201) throw new Error(`dispatch ${JSON.stringify(dsp)}`);
  const invoice = await api(page, 'POST', '/api/invoices/', {
    invoice_number: invoiceNumber,
    invoice_date: '2026-09-16',
    purchase_order_id: created.data.id,
    lines: [{ purchase_order_line_id: created.data.lines[0].id, quantity }],
  });
  if (invoice.status !== 201) throw new Error(`invoice ${JSON.stringify(invoice)}`);
  const issued = await api(page, 'POST', `/api/invoices/${invoice.data.id}/issue/`);
  if (issued.status !== 200) throw new Error(`issue ${JSON.stringify(issued)}`);
  return { entity, customer, po: created.data, invoice: issued.data };
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const stamp = Date.now().toString().slice(-6);
  const firstInvNo = `INV-ADJ-${stamp}A`;
  const secondInvNo = `INV-ADJ-${stamp}B`;
  const fx = await ensureIssuedInvoice(page, '4.00', firstInvNo);
  const second = await api(page, 'POST', '/api/invoices/', {
    invoice_number: secondInvNo,
    invoice_date: '2026-09-16',
    purchase_order_id: fx.po.id,
    lines: [{ purchase_order_line_id: fx.po.lines[0].id, quantity: '6.00' }],
  });
  if (second.status !== 201) throw new Error(`second invoice ${JSON.stringify(second)}`);
  const issued2 = await api(page, 'POST', `/api/invoices/${second.data.id}/issue/`);
  if (issued2.status !== 200) throw new Error(`issue2 ${JSON.stringify(issued2)}`);

  const payNumber = `PAY-ADJ-${stamp}`;
  const payment = await api(page, 'POST', '/api/payments/', {
    payment_number: payNumber,
    payment_date: '2026-09-16',
    entity_id: fx.entity.id,
    customer_id: fx.customer.id,
    amount: '100.00',
    payment_mode: 'NEFT',
    bank_cash_account: 'HDFC Current',
    allocations: [{ invoice_id: fx.invoice.id, allocated_amount: '40.00' }],
  });
  if (payment.status !== 201) throw new Error(`payment ${JSON.stringify(payment)}`);
  if ((payment.data.adjustments || []).length) {
    throw new Error(`initial payment created adjustments ${JSON.stringify(payment.data.adjustments)}`);
  }

  const missingReason = await api(page, 'POST', `/api/payments/${payment.data.id}/allocate/`, {
    invoice_id: issued2.data.id,
    allocated_amount: '60.00',
  });
  if (missingReason.status !== 400) {
    throw new Error(`expected 400 without reason, got ${missingReason.status} ${JSON.stringify(missingReason.data)}`);
  }

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Payments');
  await page.getByText('Payments', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Payments' }).waitFor({ timeout: 10000 });
  await page.getByRole('row').filter({ hasText: payNumber }).getByTitle('View').click();
  await page.getByText('Allocate remaining advance').waitFor({ timeout: 8000 });
  await page.getByText('No post-receipt adjustments on this payment.').waitFor();

  const modal = page.locator('.fixed').filter({ hasText: payNumber });
  await modal.locator('select').first().selectOption({ value: String(issued2.data.id) });
  await modal.getByLabel('Amount').fill('60');
  await modal.locator('select').nth(1).selectOption('Applied advance to new invoice');
  await page.screenshot({ path: path.join(outDir, 'payment-adjustment-allocate.png') });
  await modal.getByRole('button', { name: 'Allocate' }).click();
  await page.locator('.Toastify__toast--success').filter({ hasText: /allocated/i }).waitFor({ timeout: 12000 });
  await page.getByText('Adjustment History').waitFor();
  await page.getByText(secondInvNo).first().waitFor();
  await page.getByText('Applied advance to new invoice').waitFor();
  await page.screenshot({ path: path.join(outDir, 'payment-adjustment-history.png') });

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Payment Adjustments');
  await page.getByText('Payment Adjustments', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Payment Adjustments' }).waitFor({ timeout: 10000 });
  await page.getByRole('row').filter({ hasText: payNumber }).filter({ hasText: secondInvNo }).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Search reason/i).fill('Applied advance');
  await page.getByRole('row').filter({ hasText: payNumber }).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'payment-adjustments-list.png') });

  const listed = await api(page, 'GET', `/api/payment-adjustments/?payment_id=${payment.data.id}`);
  if (!Array.isArray(listed.data) || listed.data.length !== 1) {
    throw new Error(`adjustments ${JSON.stringify(listed)}`);
  }
  if (listed.data[0].status !== 'Approved') throw new Error(`status ${listed.data[0].status}`);
  if (listed.data[0].reason !== 'Applied advance to new invoice') throw new Error(`reason ${listed.data[0].reason}`);

  await browser.close();
  console.log(`PASSED payment adjustment ${payNumber} → ${secondInvNo}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
