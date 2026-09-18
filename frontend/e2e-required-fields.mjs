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

async function openScreen(page, title) {
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill(title);
  await page.getByText(title, { exact: true }).first().click();
  await page.getByRole('heading', { name: title }).waitFor();
}

async function assertForm(page, opts) {
  const { addName, requiredLabels, screenshot, submitName, extraErrors = [] } = opts;
  await page.getByRole('button', { name: addName }).first().click();
  const form = page.locator('form').filter({ hasText: 'Required field' });
  await form.waitFor();
  await form.getByText('* Required field').waitFor({ timeout: 3000 }).catch(async () => {
    await form.getByText('Required field').waitFor();
  });
  for (const label of requiredLabels) {
    const lab = form.getByText(label, { exact: false }).first();
    await lab.waitFor();
  }
  const stars = await form.locator('span[aria-hidden="true"]').filter({ hasText: '*' }).count();
  if (stars < requiredLabels.length) {
    throw new Error(`${screenshot}: expected >= ${requiredLabels.length} asterisks, got ${stars}`);
  }
  await page.getByRole('button', { name: submitName }).click();
  await form.getByText('This field is required.').first().waitFor({ timeout: 5000 });
  for (const msg of extraErrors) {
    await form.getByText(msg).waitFor({ timeout: 3000 });
  }
  await form.screenshot({ path: path.join(outDir, screenshot) });
  await page.getByRole('button', { name: 'Cancel' }).click();
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await loginAdmin(page);

  await openScreen(page, 'Entity Master');
  await assertForm(page, {
    addName: /Add Entity|Add first/i,
    requiredLabels: ['Short code', 'Entity name'],
    submitName: 'Save Entity',
    screenshot: 'required-entity-form.png',
  });

  await openScreen(page, 'Brand Master');
  await assertForm(page, {
    addName: /Add Brand|Add first/i,
    requiredLabels: ['Brand code', 'Brand name', 'Order method'],
    submitName: 'Save Brand',
    screenshot: 'required-brand-form.png',
  });

  await openScreen(page, 'Category Master');
  await assertForm(page, {
    addName: /Add Category|Add first/i,
    requiredLabels: ['Category code', 'Category name'],
    submitName: 'Save Category',
    screenshot: 'required-category-form.png',
  });

  await openScreen(page, 'Product Catalogue');
  await assertForm(page, {
    addName: /Add Product|Add first/i,
    requiredLabels: ['Product code', 'Product name', 'Brand', 'Subcategory'],
    submitName: 'Save Product',
    screenshot: 'required-product-form.png',
  });

  await openScreen(page, 'Customer Master');
  await assertForm(page, {
    addName: /Add Customer|Add first/i,
    requiredLabels: ['Customer code', 'Customer name', 'Entities'],
    submitName: 'Save Customer',
    screenshot: 'required-customer-form.png',
    extraErrors: ['Select at least one entity and mark exactly one as primary.'],
  });

  await browser.close();
  console.log('PASSED required-field asterisks, legend, and client-side validation on all 5 masters');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
