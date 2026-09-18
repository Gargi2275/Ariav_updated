import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('D:/ariav-erp/docs/e2e-screenshots');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const staff = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await admin.newPage();
  const staffPage = await staff.newPage();

  await adminPage.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await adminPage.getByPlaceholder('Enter username').fill('admin');
  await adminPage.locator('input[type="password"]').first().fill('admin123');
  await adminPage.getByRole('button', { name: /continue/i }).click();
  await adminPage.getByRole('heading', { name: 'Master PIN verification' }).waitFor({ timeout: 15000 });
  await adminPage.locator('input[inputmode="numeric"]').first().click();
  await adminPage.keyboard.type('002468');
  await adminPage.getByRole('button', { name: /verifying|unlock|continue|authenticate/i }).click({ timeout: 5000 }).catch(() => {});
  await adminPage.getByRole('heading', { name: 'Business Analytics & Position' }).waitFor({ timeout: 20000 });
  await adminPage.waitForTimeout(1500);
  await adminPage.screenshot({ path: path.join(outDir, '03-admin-dashboard.png'), fullPage: true });

  await staffPage.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await staffPage.getByPlaceholder('Enter username').fill('bhavin.operator');
  await staffPage.locator('input[type="password"]').first().fill('operator123');
  await staffPage.getByRole('button', { name: /continue/i }).click();
  await staffPage.getByText('Waiting for approval').waitFor({ timeout: 20000 });
  await staffPage.screenshot({ path: path.join(outDir, '04-staff-waiting.png'), fullPage: true });

  await adminPage.keyboard.press('Control+K');
  await adminPage.getByText('Live Approval Queue').waitFor({ timeout: 8000 });
  await adminPage.getByText('Live Approval Queue').click();
  await adminPage.waitForTimeout(1200);
  await adminPage.screenshot({ path: path.join(outDir, '05-admin-queue.png'), fullPage: true });

  const approve = adminPage.getByRole('button', { name: /approve/i }).first();
  await approve.waitFor({ timeout: 10000 });
  await approve.click();
  await adminPage.getByText('VERBAL OTP CLEARED').waitFor({ timeout: 10000 });
  await adminPage.waitForTimeout(500);
  await adminPage.screenshot({ path: path.join(outDir, '06-admin-otp-reveal.png'), fullPage: true });

  const otpEl = adminPage.locator('div.tracking-\\[0\\.25em\\]').first();
  await otpEl.waitFor({ timeout: 5000 });
  const otp = (await otpEl.innerText()).trim();

  await staffPage.getByRole('heading', { name: 'Security Code Entry' }).waitFor({ timeout: 20000 });
  await staffPage.screenshot({ path: path.join(outDir, '07-staff-otp.png'), fullPage: true });

  if (otp) {
    await staffPage.getByPlaceholder('e.g. 530-535').fill(otp);
    await staffPage.getByRole('button', { name: 'Validate & Enter' }).click();
    await staffPage.getByRole('heading', { name: 'Business Analytics & Position' }).waitFor({ timeout: 20000 });
    await staffPage.waitForTimeout(1200);
  }
  await staffPage.screenshot({ path: path.join(outDir, '08-staff-dashboard.png'), fullPage: true });
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
