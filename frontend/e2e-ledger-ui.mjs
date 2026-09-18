import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('D:/ariav-erp/docs/e2e-screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function loginAdmin(page) {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  const form = page.locator('form').filter({ hasText: 'Username / Account' });
  await form.waitFor({ timeout: 15000 });
  await form.getByPlaceholder('Enter username').fill('admin');
  await form.locator('input[type="password"]').first().fill('admin123');
  await form.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('heading', { name: 'Master PIN verification' }).waitFor({ timeout: 15000 });
  await page.locator('input[inputmode="numeric"]').first().click();
  await page.keyboard.type('002468');
  await page.getByRole('button', { name: /verifying|unlock|continue|authenticate/i }).click({ timeout: 5000 }).catch(() => {});
  await page.getByRole('heading', { name: 'Business Analytics & Position' }).waitFor({ timeout: 20000 });
}

async function openScreen(page, title) {
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill(title);
  await page.getByText(title, { exact: true }).first().click();
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 15000 });
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

  const before = await api(page, 'GET', '/api/customers/?status=Active');
  const existing = Array.isArray(before.data) ? before.data : [];

  await openScreen(page, 'Customer Ledger');

  const apply = page.getByRole('button', { name: 'Apply dates' });
  if (!(await apply.isDisabled())) throw new Error('Apply dates should be disabled until a customer is selected');

  if (existing.length === 0) {
    await page.getByRole('button', { name: 'Open Customer Master' }).waitFor({ timeout: 8000 });
    await page.getByRole('paragraph').filter({ hasText: /^No customers found — add one in Customer Master$/ }).waitFor();
    const selectText = await page.locator('#ledger-customer option').first().textContent();
    if (!selectText?.includes('No customers found')) {
      throw new Error(`empty dropdown option was "${selectText}"`);
    }
    await page.screenshot({ path: path.join(outDir, 'customer-ledger-empty.png'), fullPage: true });
  } else {
    await page.getByText('Select a customer to view their ledger.').waitFor({ timeout: 8000 });
    await page.screenshot({ path: path.join(outDir, 'customer-ledger-empty.png'), fullPage: true });
  }

  const ents = await api(page, 'GET', '/api/entities/?status=Active');
  const entity = (ents.data || []).find(e => e.short_code === 'GUJ') || (ents.data || [])[0];
  if (!entity?.id) throw new Error(`need an entity: ${JSON.stringify(ents)}`);

  let customer = existing.find(c => c.customer_code === 'MHT-LED');
  let created = false;
  if (!customer) {
    const posted = await api(page, 'POST', '/api/customers/', {
      customer_code: 'MHT-LED',
      customer_name: 'Mehta Weaving Co',
      customer_type: 'Company',
      credit_days: 30,
      city: 'Surat',
      entities: [{ entity_id: entity.id, primary_entity: true }],
    });
    if (posted.status !== 201) throw new Error(`customer create ${JSON.stringify(posted)}`);
    customer = posted.data;
    created = true;
  }

  await openScreen(page, 'Customer Master');
  await openScreen(page, 'Customer Ledger');

  await page.locator('#ledger-customer').selectOption(String(customer.id));
  await page.getByText('Total Invoiced').waitFor({ timeout: 10000 });
  await page.getByText('Total Paid').waitFor();
  await page.getByText('Outstanding Balance').waitFor();
  await page.getByText('Advance/Credit Balance').waitFor();
  await page.getByText('Overdue Amount').waitFor();
  await page.getByRole('button', { name: /Download Statement PDF/ }).waitFor();
  if (await apply.isDisabled()) throw new Error('Apply dates should enable once a customer is selected');
  await page.getByRole('columnheader', { name: 'Date' }).waitFor();
  await page.getByRole('columnheader', { name: 'Running Balance' }).waitFor();
  await page.screenshot({ path: path.join(outDir, 'customer-ledger-loaded.png'), fullPage: true });

  await browser.close();
  console.log(JSON.stringify({
    passed: true,
    created,
    customer_id: customer.id,
    customer_code: customer.customer_code,
    customer_name: customer.customer_name,
    entity: `${entity.short_code} · ${entity.entity_name}`,
  }));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
