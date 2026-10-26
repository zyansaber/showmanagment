import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { exportFinanceWorkbook, parseFinanceWorkbook } from '../src/lib/financeResultExcel.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = new URL('../.test-output/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const fixture = {
  authAccounts: { admin: { username: 'admin', password: 'test-only', role: 'admin' } },
  shows: { legacy: { id: 'legacy', name: 'Original 2026 Show', dealership: 'Geelong', startDate: '2026-12-10', finishDate: '2026-12-12', target2026: 5, status: 'Not Started', siteLocation: { state: 'VIC', suburb: 'Geelong' }, teamMembers: [] } },
  showBudgets: { legacy: { totalDealerCost: 600, totalFactoryCosts: 400 } },
  years: { 2027: {} },
};
const mock = `
import { activeYear, yearPath } from '/src/lib/showYear.ts';
const read = () => JSON.parse(localStorage.getItem('test-db'));
const lookup = (root, path) => path.split('/').reduce((value, key) => value?.[key], root) ?? null;
const put = (root, path, value) => { const parts = path.split('/'); let node = root; for (const part of parts.slice(0, -1)) node = node[part] ??= {}; if (value === null) delete node[parts.at(-1)]; else node[parts.at(-1)] = value; };
export const dbGet = async (path) => lookup(read(), yearPath(path));
export const dbGet2026ShowsForFinanceTemplate = async () => read().shows;
export const dbSet = async (path, value) => { const root = read(); put(root, yearPath(path), value); localStorage.setItem('test-db', JSON.stringify(root)); };
export const dbUpdate = async (path, values) => { const root = read(); for (const [key, value] of Object.entries(values)) put(root, yearPath(path) + '/' + key, value); localStorage.setItem('test-db', JSON.stringify(root)); };
export const dbRemove = async (path) => dbSet(path, null);
export const dbPush = async (path, value) => { const id = crypto.randomUUID(); await dbSet(path + '/' + id, value); return id; };
export const dbSubscribe = (path, callback) => { dbGet(path).then(callback); return () => {}; };
export const dbImport2027 = async (updates) => { if (activeYear !== 2027) throw Error('wrong year'); const root = read(); for (const [path, value] of Object.entries(updates)) put(root, 'years/2027/' + path, value); localStorage.setItem('test-db', JSON.stringify(root)); };
export const schedulingDbGet = async () => null;
export const schedulingDbSet = async () => {};
export const schedulingDbUpdate = async () => {};
export const schedulingDbRemove = async () => {};
export const schedulingDbPush = async () => 'test-id';
export const uploadStorageFile = async () => 'test-file';
`;

const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addInitScript((data) => {
    if (!localStorage.getItem('test-db')) localStorage.setItem('test-db', JSON.stringify(data));
    localStorage.setItem('show-manager-auth-user', JSON.stringify({ username: 'admin', role: 'admin' }));
  }, fixture);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/src/lib/firebase.ts') return route.fulfill({ contentType: 'application/javascript', body: mock });
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const waitText = async (text) => page.getByText(text, { exact: true }).first().waitFor({ timeout: 30000 });
  await page.goto('http://127.0.0.1:5173/budget?year=2026');
  await waitText('Original 2026 Show');
  assert.equal(await page.getByRole('button', { name: 'Import Excel', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Export Excel', exact: true }).count(), 0);
  await page.getByRole('button', { name: '2027', exact: true }).click();
  await waitText('Awaiting 2027 data');
  assert.equal(await page.getByText('Original 2026 Show', { exact: true }).count(), 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('test-db')).years[2027]), {});
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template' }).click();
  const template = await templateDownload;
  await template.saveAs(new URL('template.xlsx', out).pathname.replace(/^\/(\w:)/, '$1'));
  await page.screenshot({ path: new URL('2027-empty.png', out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  const row = { showId: '', showName: 'Imported 2027 Show', dealership: 'Frankston', internalSalesOrderNumber: '000123', startDate: '2027-01-15', finishDate: '2027-01-17', status: 'Not Started', showDuration: 3, totalBudget: 1000, dealerBudget: 600, factoryBudget: 400, actual: 900, dealerActual: 500, factoryActual: 400, chargeBack: 0, diff: -100, showTarget: 20, showSales: 10, salesByShowTeam: 6, salesByNetwork: 3, salesOffice: 1, contractNumber: '10', totalContractValue: 800000, clawBack: 0 };
  const upload = Buffer.from(await exportFinanceWorkbook([row]));
  await page.locator('input[type=file]').setInputFiles({ name: '2027.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: upload });
  await page.getByRole('button', { name: 'Import into 2027' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await waitText('Imported 2027 Show');
  await page.screenshot({ path: new URL('2027-imported.png', out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Excel', exact: true }).click();
  const downloaded = await downloadPromise;
  const downloadPath = await downloaded.path();
  const exported = await parseFinanceWorkbook(await fs.readFile(downloadPath));
  assert.equal(exported.length, 1);
  assert.equal(exported[0].showSales, 10);
  assert.equal(exported[0].internalSalesOrderNumber, '000123');
  assert.ok(exported[0].showId);
  // Round-trip the same workbook: update, never duplicate.
  await page.locator('input[type=file]').setInputFiles({ name: 'exported.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await fs.readFile(downloadPath) });
  await page.getByRole('button', { name: 'Import into 2027' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('test-db')));
  assert.equal(Object.keys(stored.years[2027].shows).length, 1);
  assert.deepEqual(stored.shows, fixture.shows);
  assert.deepEqual(stored.showBudgets, fixture.showBudgets);
  assert.equal(await page.getByText('Original 2026 Show', { exact: true }).count(), 1);
  // Fill a retained name: the new 2027 row replaces its placeholder exactly once.
  await page.locator('input[type=file]').setInputFiles({ name: 'filled-name.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await exportFinanceWorkbook([{ ...row, showName: 'Original 2026 Show', internalSalesOrderNumber: '000456' }])) });
  await page.getByRole('button', { name: 'Import into 2027' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByText('Awaiting 2027 data', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('Original 2026 Show', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await waitText('2027 Target Completion');
  assert.match(await page.locator('main').innerText(), /20/);
  await page.getByRole('button', { name: 'Show Calendar', exact: true }).click();
  await waitText('Imported 2027 Show');
  await page.getByRole('button', { name: 'Show Management', exact: true }).click();
  await waitText('Imported 2027 Show');
  await page.reload();
  await waitText('Imported 2027 Show');
  await page.getByRole('button', { name: 'Finance Result', exact: true }).click();
  await waitText('Imported 2027 Show');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('aside button').first().click();
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().right <= 1 && parseFloat(getComputedStyle(document.querySelector('main').parentElement).marginLeft) === 0);
  await page.screenshot({ path: new URL('2027-mobile.png', out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
  await page.getByRole('button', { name: '2026', exact: true }).click();
  await waitText('Original 2026 Show');
  assert.equal(await page.getByRole('button', { name: 'Import Excel', exact: true }).count(), 0);
  assert.equal(await page.getByText('Imported 2027 Show', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: 2026 isolation, 2027 template/import/export/reimport, Dashboard, Calendar, Show Management, reload, mobile and switching back.');
} finally { await browser.close(); }
