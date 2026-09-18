/**
 * Toast + parseApiError verification for Category / Entity / Brand.
 * Requires Vite :5173 and Django :8000.
 */
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

async function jumpTo(page, title) {
  await page.keyboard.press('Control+K');
  const box = page.getByPlaceholder(/Search all/i);
  await box.waitFor({ timeout: 8000 });
  await box.fill(title);
  await page.getByText(title, { exact: true }).first().click();
  await page.getByRole('heading', { name: title }).waitFor({ timeout: 10000 });
}

async function toastText(page, kind) {
  const loc = page.locator(`.Toastify__toast--${kind}`).first();
  await loc.waitFor({ timeout: 8000 });
  return (await loc.innerText()).replace(/\s+/g, ' ').trim();
}

async function dismissToasts(page) {
  const close = page.locator('.Toastify__close-button');
  const n = await close.count();
  for (let i = 0; i < n; i++) {
    await close.nth(i).click({ timeout: 1000 }).catch(() => {});
  }
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = [];

  await loginAdmin(page);
  await dismissToasts(page);

  // --- Category: unique save ---
  await jumpTo(page, 'Category Master');
  await page.getByRole('button', { name: /Add Category/i }).click();
  await page.getByRole('heading', { name: /Add Category/i }).waitFor();
  const unique = `T${Date.now().toString().slice(-6)}`;
  await page.getByLabel('Category code').fill(unique);
  await page.getByLabel('Category name').fill('Toast Cotton');
  await page.getByRole('button', { name: /Save Category/i }).click();
  const okCat = await toastText(page, 'success');
  const modalClosed = await page.getByRole('heading', { name: /Add Category/i }).count() === 0;
  results.push({
    name: 'category-success',
    ok: okCat.includes("Category 'Toast Cotton' saved") && modalClosed,
    detail: okCat,
  });
  await page.screenshot({ path: path.join(outDir, 'toast-01-category-success.png') });
  await dismissToasts(page);

  // --- Category: duplicate code ---
  await page.getByRole('button', { name: /Add Category/i }).click();
  await page.getByLabel('Category code').fill(unique);
  await page.getByLabel('Category name').fill('Duplicate Try');
  await page.getByRole('button', { name: /Save Category/i }).click();
  const dupCat = await toastText(page, 'error');
  const modalOpen = await page.getByRole('heading', { name: /Add Category/i }).isVisible();
  const banner = await page.locator('form p.text-\\[var\\(--erp-negative\\)\\]').count();
  const codeInvalid = await page.getByLabel('Category code').evaluate(el => el.getAttribute('aria-invalid') === 'true');
  results.push({
    name: 'category-duplicate',
    ok:
      /Category code '.+' is already in use\. Try a different code\./.test(dupCat)
      && modalOpen
      && banner === 0
      && codeInvalid,
    detail: JSON.stringify({ dupCat, modalOpen, banner, codeInvalid }),
  });
  await page.screenshot({ path: path.join(outDir, 'toast-02-category-duplicate.png') });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await dismissToasts(page);

  // --- Category: 500 fallback ---
  await page.route('**/api/categories/', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Traceback (most recent call last): boom' }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: /Add Category/i }).click();
  await page.getByLabel('Category code').fill(`Z${Date.now().toString().slice(-5)}`);
  await page.getByLabel('Category name').fill('Server Fail');
  await page.getByRole('button', { name: /Save Category/i }).click();
  const five = await toastText(page, 'error');
  results.push({
    name: 'category-500',
    ok: five === 'Something went wrong. Please try again.',
    detail: five,
  });
  await page.screenshot({ path: path.join(outDir, 'toast-03-category-500.png') });
  await page.unroute('**/api/categories/');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await dismissToasts(page);

  // --- Entity duplicate short code ---
  await jumpTo(page, 'Entity Master');
  await page.getByRole('button', { name: /Add Entity/i }).click();
  await page.getByLabel('Short code').fill('GUJ');
  await page.getByLabel('Entity name').fill('Gujarat Clone');
  await page.getByRole('button', { name: /Save Entity/i }).click();
  const dupEnt = await toastText(page, 'error');
  const entModal = await page.getByRole('heading', { name: /Add Entity/i }).isVisible();
  const entBanner = await page.locator('form p.text-\\[var\\(--erp-negative\\)\\]').count();
  results.push({
    name: 'entity-duplicate',
    ok: /already in use/i.test(dupEnt) && entModal && entBanner === 0,
    detail: dupEnt,
  });
  await page.screenshot({ path: path.join(outDir, 'toast-04-entity-duplicate.png') });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await dismissToasts(page);

  // --- Brand duplicate ---
  await jumpTo(page, 'Brand Master');
  const brandCode = `B${Date.now().toString().slice(-5)}`;
  await page.getByRole('button', { name: /Add Brand/i }).click();
  await page.getByLabel('Brand code').fill(brandCode);
  await page.getByLabel('Brand name').fill('Toast Mill');
  await page.getByRole('button', { name: /Save Brand/i }).click();
  const okBrand = await toastText(page, 'success');
  results.push({
    name: 'brand-success',
    ok: okBrand.includes("Brand 'Toast Mill' created successfully"),
    detail: okBrand,
  });
  await dismissToasts(page);
  await page.getByRole('button', { name: /Add Brand/i }).click();
  await page.getByLabel('Brand code').fill(brandCode);
  await page.getByLabel('Brand name').fill('Toast Mill 2');
  await page.getByRole('button', { name: /Save Brand/i }).click();
  const dupBrand = await toastText(page, 'error');
  const brandModal = await page.getByRole('heading', { name: /Add Brand/i }).isVisible();
  results.push({
    name: 'brand-duplicate',
    ok: /already in use/i.test(dupBrand) && brandModal,
    detail: dupBrand,
  });
  await page.screenshot({ path: path.join(outDir, 'toast-05-brand-duplicate.png') });

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log(JSON.stringify(results, null, 2));
  if (failed.length) {
    console.error(`FAILED ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`PASSED ${results.length}/${results.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
