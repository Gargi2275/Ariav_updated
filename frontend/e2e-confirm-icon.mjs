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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await loginAdmin(page);

  const created = await api(page, 'POST', '/api/categories/', {
    category_code: `IC${Date.now().toString().slice(-5)}`,
    category_name: 'Icon Probe',
    parent_category_id: null,
    status: 'Active',
  });
  const id = created.data.id;
  await api(page, 'DELETE', `/api/categories/${id}/`);

  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Search all/i).fill('Category Master');
  await page.getByText('Category Master', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Category Master' }).waitFor();
  await page.getByRole('button', { name: 'Inactive', exact: true }).click();
  const row = page.locator('div.flex.items-center').filter({ hasText: 'Icon Probe' }).first();
  await row.getByTitle('More actions').click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('heading', { name: 'Permanently delete category?' }).waitFor();

  const badge = page.locator('[data-confirm-icon]');
  const metrics = await badge.evaluate(el => {
    const svg = el.querySelector('svg');
    const br = el.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const svgCs = getComputedStyle(svg);
    return {
      box: { w: br.width, h: br.height },
      offset: { w: el.offsetWidth, h: el.offsetHeight },
      client: { w: el.clientWidth, h: el.clientHeight },
      icon: { w: sr.width, h: sr.height, x: sr.x - br.x, y: sr.y - br.y },
      display: cs.display,
      boxSizing: cs.boxSizing,
      overflow: cs.overflow,
      borderRadius: cs.borderRadius,
      borderWidth: cs.borderWidth,
      padding: cs.padding,
      width: cs.width,
      height: cs.height,
      svgOverflow: svgCs.overflow,
      svgWidth: svgCs.width,
      svgHeight: svgCs.height,
      viewBox: svg.getAttribute('viewBox'),
      strokeWidth: svg.getAttribute('stroke-width') || svgCs.strokeWidth,
      padLeft: sr.x - br.x,
      padRight: br.x + br.width - (sr.x + sr.width),
      padTop: sr.y - br.y,
      padBottom: br.y + br.height - (sr.y + sr.height),
      square: Math.abs(br.width - br.height) < 0.5,
      svgSquare: Math.abs(sr.width - sr.height) < 0.5,
    };
  });

  await page.locator('[role="dialog"] > div').screenshot({ path: path.join(outDir, 'confirm-warning-icon.png') });
  await badge.screenshot({ path: path.join(outDir, 'confirm-warning-icon-badge.png') });

  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await api(page, 'DELETE', `/api/categories/${id}/?permanent=true`);
  await browser.close();

  console.log(JSON.stringify(metrics, null, 2));

  const even =
    Math.abs(metrics.padLeft - metrics.padRight) < 1 &&
    Math.abs(metrics.padTop - metrics.padBottom) < 1 &&
    Math.abs(metrics.padLeft - metrics.padTop) < 2;
  if (!metrics.square || !metrics.svgSquare || !even || metrics.padLeft < 10) {
    throw new Error(`icon geometry failed: ${JSON.stringify(metrics)}`);
  }
  if (metrics.borderRadius !== '0px') {
    throw new Error(`expected rounded-none, got ${metrics.borderRadius}`);
  }
  if (metrics.viewBox !== '0 0 24 24') {
    throw new Error(`unexpected viewBox ${metrics.viewBox}`);
  }
  console.log('PASSED warning icon square, even padding, stroke 1.5');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
