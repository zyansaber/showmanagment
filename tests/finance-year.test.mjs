import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportFinanceWorkbook, parseFinanceWorkbook, prepareFinanceImport } from '../src/lib/financeResultExcel.ts';
import { yearPath, resolveShowYear } from '../src/lib/showYear.ts';
import { createFinanceNameTemplates } from '../src/lib/financeNameTemplates.ts';

export const sample = {
  month2027: '',
  showId: '', showName: '2027 Caravan Show', dealership: 'Frankston', internalSalesOrderNumber: '000123',
  startDate: '2027-01-15', finishDate: '2027-01-17', showDuration: 3, status: 'Not Started',
  totalBudget: 1000.25, dealerBudget: 600.25, factoryBudget: 400, actual: 900.75,
  dealerActual: 500.75, factoryActual: 400, chargeBack: -20, diff: -99.5,
  showTarget: 20, showSales: 10, salesByShowTeam: 6, salesByNetwork: 3, salesOffice: 1,
  contractNumber: '10', totalContractValue: 800000.50, clawBack: 50,
};

async function changedWorkbook(change) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await exportFinanceWorkbook([sample]));
  change(book.worksheets[0]);
  return book.xlsx.writeBuffer();
}

test('every 2026 business path remains unchanged, 2027 records are isolated', () => {
  for (const path of ['shows', 'shows/id', 'showBudgets/id', 'showOrders', 'finance/glByAufnrGl', 'finance/internalSalesOrders', 'finance/expenses', 'teamMembers', 'showTasks', 'ticketBookingConfirmations', 'teamMessages', 'processTemplates', 'scheduleDealerMappings']) {
    assert.equal(yearPath(path, 2026), path);
    assert.equal(yearPath(path, 2027), `years/2027/${path}`);
  }
  for (const path of ['authAccounts', 'userAccounts/admin', 'settings/emailjsTicketBooking']) assert.equal(yearPath(path, 2027), path);
  assert.throws(() => yearPath('../shows', 2027));
  assert.throws(() => yearPath('years/2026/shows', 2027));
});

test('explicit URLs win, legacy public links always resolve to 2026', () => {
  assert.equal(resolveShowYear('?year=2027', '/budget', '2026'), 2027);
  assert.equal(resolveShowYear('?year=2026', '/budget', '2027'), 2026);
  assert.equal(resolveShowYear('', '/budget', '2027'), 2027);
  assert.equal(resolveShowYear('?year=2099', '/budget', null), 2026);
  assert.equal(resolveShowYear('', '/ticket-confirm/abc', '2027'), 2026);
  assert.equal(resolveShowYear('?year=2027', '/ticket-confirm/abc', '2026'), 2027);
});

test('Excel round-trip retains every editable metric, dates and leading-zero SO', async () => {
  const buffer = await exportFinanceWorkbook([sample]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  assert.deepEqual([1, 2, 3, 4].map((col) => sheet.getRow(7).getCell(col).text), ['Show', 'Start date', 'Finish date', 'Month 2027']);
  assert.equal(sheet.getCell('P8').formula, 'L8-I8');
  assert.equal(sheet.getCell('I9').formula, 'SUM(I8:I8)');
  const rows = await parseFinanceWorkbook(buffer);
  assert.deepEqual(rows, [sample]);
});

test('previous Excel column order remains importable after moving dates forward', async () => {
  const current = new ExcelJS.Workbook();
  await current.xlsx.load(await exportFinanceWorkbook([sample]));
  const old = new ExcelJS.Workbook();
  const sheet = old.addWorksheet('Finance Result 2027');
  const oldOrder = [1, ...Array.from({ length: 21 }, (_, i) => i + 5), 2, 3, 26, 4];
  for (const row of [7, 8]) sheet.getRow(row).values = oldOrder.map((col) => current.worksheets[0].getRow(row).getCell(col).value);
  sheet.getCell('M8').value = { formula: 'I8-F8', result: sample.diff };
  sheet.getCell('A9').value = 'Total';
  sheet.getCell('F9').value = { formula: 'SUM(F8:F8)', result: sample.totalBudget };
  assert.deepEqual(await parseFinanceWorkbook(await old.xlsx.writeBuffer()), [sample]);
});

test('empty template is styled and does not import its placeholder row', async () => {
  const buffer = await exportFinanceWorkbook([]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  assert.equal(sheet.getCell('I6').value, 'BUDGET');
  assert.equal(sheet.getCell('L6').value, 'ACTUAL');
  assert.equal(sheet.getCell('Q6').value, 'SALES');
  assert.equal(sheet.views[0].state, 'frozen');
  assert.equal(sheet.getCell('Y8').value, 2027);
  await assert.rejects(parseFinanceWorkbook(buffer), /No show data/);
});

test('wrong year, invalid date, nonnumeric money and invalid counts are rejected', async () => {
  for (const [cell, value, expected] of [
    ['Y8', 2026, /only 2027/], ['B8', '2026-12-31', /same year/], ['B8', '2027-02-30', /valid 2026 reference or 2027 date/],
    ['C8', '2027-01-01', /Finish date must/], ['L8', 'not money', /valid number/],
    ['R8', 1.5, /whole number/], ['R8', -1, /whole number/], ['I8', 900, /Total budget/],
    ['S8', 11, /cannot exceed Sold/], ['Z8', '../2026', /invalid Show ID/], ['A7', 'renamed', /Column 1/],
  ]) await assert.rejects(parseFinanceWorkbook(await changedWorkbook((sheet) => { sheet.getCell(cell).value = value; })), expected);
});

test('Excel date cells, currency text and zero values are supported', async () => {
  const rows = await parseFinanceWorkbook(await changedWorkbook((sheet) => {
    sheet.getCell('B8').value = new Date('2027-01-15T00:00:00Z');
    sheet.getCell('L8').value = '$1,200.50';
    sheet.getCell('X8').value = '(50.25)';
    for (const col of ['R', 'S', 'T', 'U', 'V', 'W']) sheet.getCell(`${col}8`).value = 0;
  }));
  assert.equal(rows[0].actual, 1200.5);
  assert.equal(rows[0].clawBack, -50.25);
  assert.equal(rows[0].showSales, 0);
  assert.equal(rows[0].startDate, sample.startDate);
});

test('new shows and existing shows update atomically without replacing unrelated fields', () => {
  const first = prepareFinanceImport([sample], {}, {}, () => 'new-id');
  assert.equal(first.created, 1);
  assert.equal(first.updates['shows/new-id/target2027'], 20);
  assert.equal(first.updates['shows/new-id/financeResult'].showSales, 10);
  assert.equal(first.updates['showActualOverrides/new-id'], null);
  assert.ok(Object.keys(first.updates).every((path) => !path.includes('2026')));
  const shows = { 'new-id': { id: 'new-id', name: sample.showName, dealership: sample.dealership, startDate: sample.startDate, teamMembers: ['keep-me'] } };
  const second = prepareFinanceImport([{ ...sample, actual: 0 }], shows, { so: { id: 'so', showId: 'new-id', internalSalesOrderNumber: '000123', internalSalesOrderNumberDealer: 'keep-dealer-so' } }, () => 'unused');
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);
  assert.equal(second.updates['shows/new-id/financeResult'].actual, 0);
  assert.equal(second.updates['shows/new-id/teamMembers'], undefined);
  assert.equal(second.updates['finance/internalSalesOrders/so/internalSalesOrderNumberDealer'], undefined);
  assert.deepEqual(shows['new-id'].teamMembers, ['keep-me']);
});

test('duplicate rows and unknown IDs fail before any write', () => {
  assert.throws(() => prepareFinanceImport([sample, sample], {}, {}, () => 'id'), /Duplicate show/);
  assert.throws(() => prepareFinanceImport([{ ...sample, showId: 'from-2026' }], {}, {}, () => 'id'), /Unknown 2027 Show ID/);
});

test('2026 names remain as blank 2027 templates without overwriting actual 2027 rows', () => {
  const names = [{ id: 'a', name: 'Existing show' }, { id: 'b', name: 'Next show' }, { id: 'c', name: 'Next show' }];
  const templates = createFinanceNameTemplates(names, [{ showName: ' Existing SHOW ' }, { showName: 'Next show' }]);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].showName, 'Next show');
  assert.equal(templates[0].showId, 'template:c');
  assert.equal(templates[0].actual, 0);
  assert.equal(templates[0].showYear, 2027);
  assert.equal(templates[0].startDate, '');
  assert.equal(templates[0].dealership, '');
  assert.equal(names.length, 3);
});

test('prefilled Excel keeps 2026 reference dates without IDs or amounts; partial imports skip untouched templates', async () => {
  const templates = createFinanceNameTemplates([{ id: 'old-a', name: 'First show', startDate: '2026-03-01', finishDate: '2026-03-03' }, { id: 'old-b', name: 'Later show', startDate: '2026-05-01', finishDate: '2026-05-03' }], []);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await exportFinanceWorkbook(templates));
  const sheet = book.worksheets[0];
  assert.equal(sheet.getCell('A8').value, 'First show');
  assert.equal(sheet.getCell('Z8').text, '');
  assert.equal(sheet.getCell('B8').text, '2026-03-01');
  assert.equal(sheet.getCell('C8').text, '2026-03-03');
  assert.equal(sheet.getCell('D7').text, 'Month 2027');
  assert.equal(sheet.getCell('L8').value, null);
  await assert.rejects(parseFinanceWorkbook(await book.xlsx.writeBuffer()), /No show data/);
  sheet.getCell('F8').value = 'Frankston';
  sheet.getCell('B8').value = '2027-03-01';
  sheet.getCell('C8').value = '2027-03-03';
  sheet.getCell('L8').value = 500;
  const rows = await parseFinanceWorkbook(await book.xlsx.writeBuffer());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].showName, 'First show');
  assert.equal(rows[0].showId, '');
  assert.equal(rows[0].actual, 500);
  assert.deepEqual(createFinanceNameTemplates([{ id: 'old-a', name: 'First show' }, { id: 'old-b', name: 'Later show' }], rows).map((row) => row.showName), ['Later show']);
});

test('Month 2027 can be imported with copied 2026 dates without creating a past 2027 schedule', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await exportFinanceWorkbook(createFinanceNameTemplates([
    { id: 'old', name: 'Planned show', startDate: '2026-03-01', finishDate: '2026-03-03' },
  ], [])));
  const sheet = book.worksheets[0];
  for (const value of ['March', 'mar', 3, '03', '2027-03', '3月']) {
    sheet.getCell('D8').value = value;
    const rows = await parseFinanceWorkbook(await book.xlsx.writeBuffer());
    assert.equal(rows[0].month2027, 'March');
    assert.equal(rows[0].startDate, '');
    assert.equal(rows[0].finishDate, '');
    assert.equal(rows[0].referenceStartDate2026, '2026-03-01');
    assert.equal(rows[0].referenceFinishDate2026, '2026-03-03');
    assert.equal(rows[0].showDuration, 0);
    const prepared = prepareFinanceImport(rows, {}, {}, () => 'planned');
    assert.equal(prepared.updates['shows/planned/year'], 2027);
    assert.equal(prepared.updates['shows/planned/month2027'], 'March');
    assert.equal(prepared.updates['shows/planned/startDate'], '');
    assert.deepEqual(await parseFinanceWorkbook(await exportFinanceWorkbook(rows)), rows);
  }
  for (const value of [0, 13, '2026-03', 'not a month']) {
    sheet.getCell('D8').value = value;
    await assert.rejects(parseFinanceWorkbook(await book.xlsx.writeBuffer()), /Month 2027/);
  }
});

test('older templates without Month 2027 remain importable and do not clear a saved month', async () => {
  const buffer = await changedWorkbook((sheet) => { sheet.getCell('D7').value = null; });
  const rows = await parseFinanceWorkbook(buffer);
  assert.equal(rows[0].month2027, undefined);
  assert.equal(prepareFinanceImport(rows, {}, {}, () => 'old-template').updates['shows/old-template/month2027'], undefined);
});
