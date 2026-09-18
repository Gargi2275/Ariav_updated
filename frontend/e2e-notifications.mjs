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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = ents.data[0];
  let customers = await api(page, 'GET', `/api/customers/?status=Active&entity_id=${entity.id}`);
  let customer = (customers.data || [])[0];
  if (!customer) {
    const created = await api(page, 'POST', '/api/customers/', {
      customer_code: `E2ENC${Date.now().toString().slice(-5)}`,
      customer_name: 'E2E Notify Customer',
      customer_type: 'Company',
      credit_days: 15,
      entities: [{ entity_id: entity.id, primary_entity: true }],
    });
    customer = created.data;
  }

  const before = await api(page, 'GET', '/api/notifications/unread-count/');
  const payNumber = `PAY-NOTE-${Date.now().toString().slice(-6)}`;
  const payment = await api(page, 'POST', '/api/payments/', {
    payment_number: payNumber,
    payment_date: '2026-09-16',
    entity_id: entity.id,
    customer_id: customer.id,
    amount: '15.00',
    payment_mode: 'NEFT',
    bank_cash_account: 'HDFC Current',
  });
  if (payment.status !== 201) throw new Error(`payment ${JSON.stringify(payment)}`);

  const after = await api(page, 'GET', '/api/notifications/unread-count/');
  if (after.data.unread_count < before.data.unread_count + 1) {
    throw new Error(`unread did not increase ${JSON.stringify({ before: before.data, after: after.data })}`);
  }

  await page.getByRole('button', { name: 'Notifications' }).click();
  await page.getByText(`Payment ${payNumber} received`).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'notifications-bell.png') });
  await page.getByText(`Payment ${payNumber} received`).click();
  await page.getByRole('heading', { name: payNumber }).waitFor({ timeout: 10000 });

  const mid = await api(page, 'GET', '/api/notifications/unread-count/');
  if (mid.data.unread_count !== after.data.unread_count - 1) {
    throw new Error(`mark-read badge ${JSON.stringify(mid.data)}`);
  }

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Notifications');
  await page.getByText('Notifications', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Notifications' }).waitFor({ timeout: 10000 });
  await page.getByText(`Payment ${payNumber} received`).waitFor({ timeout: 8000 });
  await page.screenshot({ path: path.join(outDir, 'notifications-list.png') });

  await browser.close();
  console.log(`PASSED notifications ${payNumber} unread ${before.data.unread_count} → ${after.data.unread_count} → ${mid.data.unread_count}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
