import ExcelJS from 'exceljs';

export type FinanceSummary = {
  actual: number; dealerActual: number; factoryActual: number;
  showSales: number; salesByShowTeam: number; salesByNetwork: number; salesOffice: number;
  contractNumber: string; totalContractValue: number;
};

export type FinanceExportRow = FinanceSummary & {
  isTemplateRow?: boolean;
  referenceStartDate2026?: string; referenceFinishDate2026?: string; month2027?: string;
  showId: string; showName: string; dealership: string; internalSalesOrderNumber: string;
  startDate?: string; finishDate?: string; showDuration?: number | string; status?: string;
  totalBudget: number; dealerBudget: number; factoryBudget: number;
  chargeBack: number; diff: number; showTarget: number; clawBack: number;
};

const columns = [
  ['Show', 40], ['Internal SO', 18], ['Dealership', 26], ['Schedule', 18], ['Days', 10],
  ['Total budget', 18], ['Dealer budget', 18], ['Factory budget', 18],
  ['Actual', 18], ['Dealer actual', 18], ['Factory actual', 18], ['Charge back', 18], ['Variance', 18],
  ['Target', 12], ['Sold', 12], ['Show team', 12], ['Network', 12], ['Sales office', 14],
  ['Contracts', 12], ['Contract value', 20], ['Claw back', 16],
  ['Year', 10], ['Start date', 16], ['Finish date', 16], ['Show ID', 38], ['Month 2027', 18],
] as const;
// Keep stable field indexes for parsing; only the exported presentation order changes.
const exportOrder = [1, 23, 24, 26, ...Array.from({ length: 21 }, (_, i) => i + 2), 25];
const exportColumn = (field: number) => exportOrder.indexOf(field) + 1;
const orderValues = (values: ExcelJS.CellValue[]) => exportOrder.map((field) => values[field - 1] ?? null);
const moneyColumns = [6, 7, 8, 9, 10, 11, 12, 13, 20, 21];
const moneyFormat = '$#,##0.00;[Red]-$#,##0.00;"—"';

export async function exportFinanceWorkbook(rows: FinanceExportRow[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Show Manager';
  const sheet = workbook.addWorksheet('Finance Result 2027', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 7 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = exportOrder.map((field) => ({ width: columns[field - 1][1] }));
  sheet.mergeCells('A1:Z1');
  sheet.getCell('A1').value = '2027 | Show Budget & Expense';
  sheet.getCell('A1').font = { size: 20, bold: true, color: { argb: 'FF0F172A' } };
  sheet.getRow(1).height = 36;
  sheet.mergeCells('A2:Z2');
  sheet.getCell('A2').value = 'Names and original 2026 dates are prefilled for reference. Fill Month 2027 (1–12 or month name); replace dates with confirmed 2027 dates when known. Untouched templates are skipped. Keep Year and Show ID; leave ID blank for new shows. Dates: YYYY-MM-DD.';
  sheet.getCell('A2').alignment = { wrapText: true, vertical: 'middle' };
  sheet.getRow(2).height = 34;
  const finished = rows.filter((r) => /^(finished|completed)$/i.test(r.status || '') || (r.finishDate && new Date(r.finishDate).getTime() <= Date.now()));
  sheet.mergeCells('A3:E3'); sheet.mergeCells('A4:E4');
  sheet.getCell('A3').value = 'ACTUAL COST, YEAR TO DATE';
  sheet.getCell('A4').value = finished.reduce((sum, r) => sum + r.actual, 0);
  sheet.getCell('A4').numFmt = moneyFormat;
  const owned = ['Frankston', 'Geelong', 'Launceston', 'ST James', 'Traralgon'];
  for (const [start, end, name, subset] of [
    ['F', 'M', 'SELF-OWNED', rows.filter((r) => owned.includes(r.dealership))],
    ['N', 'U', 'INDEPENDENT DEALERS', rows.filter((r) => !owned.includes(r.dealership))],
  ] as const) {
    sheet.mergeCells(`${start}3:${end}3`); sheet.mergeCells(`${start}4:${end}4`);
    sheet.getCell(`${start}3`).value = name;
    const actual = subset.reduce((s, r) => s + r.actual, 0);
    const contracts = subset.reduce((s, r) => s + r.totalContractValue, 0);
    sheet.getCell(`${start}4`).value = `Actual $${actual.toLocaleString('en-AU')}    |    Show sales ${subset.reduce((s, r) => s + r.showSales, 0)}    |    Contract value $${contracts.toLocaleString('en-AU')}    |    Contract / actual ${actual ? (contracts / actual).toFixed(2) : '0.00'}×`;
  }
  for (const row of [3, 4]) {
    sheet.getRow(row).height = 28;
    sheet.getRow(row).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.font = { bold: true, size: row === 3 ? 10 : 12, color: { argb: 'FF0F172A' } };
    });
  }
  for (const [range, title] of [['A6:H6', 'SHOW'], ['I6:K6', 'BUDGET'], ['L6:P6', 'ACTUAL'], ['Q6:X6', 'SALES'], ['Y6:Z6', 'IMPORT DETAILS']]) {
    sheet.mergeCells(range); sheet.getCell(range.split(':')[0]).value = title;
  }
  sheet.getRow(7).values = exportOrder.map((field) => columns[field - 1][0]);
  for (const row of [6, 7]) {
    sheet.getRow(row).height = 26;
    sheet.getRow(row).eachCell((cell, col) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col >= 12 && col <= 16 ? 'FFE0F2FE' : 'FFF1F5F9' } };
      cell.alignment = { vertical: 'middle', horizontal: row === 6 ? 'center' : 'left' };
    });
  }
  rows.forEach((r) => sheet.addRow(orderValues(r.isTemplateRow ? [
    r.showName, '', '', 'Not Started', null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, 2027, r.referenceStartDate2026 || '', r.referenceFinishDate2026 || '', '', r.month2027 || '',
  ] : [
    r.showName, r.internalSalesOrderNumber, r.dealership, r.status || 'Not Started', r.showDuration || 0,
    r.totalBudget, r.dealerBudget, r.factoryBudget, r.actual, r.dealerActual, r.factoryActual, r.chargeBack, r.diff,
    r.showTarget, r.showSales, r.salesByShowTeam, r.salesByNetwork, r.salesOffice, r.contractNumber,
    r.totalContractValue, r.clawBack, 2027, r.startDate || r.referenceStartDate2026 || '', r.finishDate || r.referenceFinishDate2026 || '', r.showId, r.month2027 || '',
  ])));
  if (!rows.length) sheet.addRow(orderValues(['', '', '', 'Not Started', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 2027]));
  for (let index = 8; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.height = 25;
    row.getCell(exportColumn(13)).value = { formula: `L${index}-I${index}`, result: rows[index - 8]?.diff || 0 };
    row.getCell(exportColumn(26)).dataValidation = { type: 'list', allowBlank: true, formulae: ['"January,February,March,April,May,June,July,August,September,October,November,December"'] };
    for (const col of moneyColumns) row.getCell(exportColumn(col)).numFmt = moneyFormat;
    for (const col of [2, 23, 24, 25]) row.getCell(exportColumn(col)).numFmt = '@';
    for (let col = 1; col <= columns.length; col++) {
      const cell = row.getCell(col);
      cell.font = { size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col >= 12 && col <= 16 ? 'FFF0F9FF' : index % 2 ? 'FFF8FAFC' : 'FFFFFFFF' } };
    }
  }
  const lastDataRow = sheet.rowCount;
  if (rows.length) {
    const total = sheet.addRow(['Total']);
    total.height = 28;
    const metricKeys: Partial<Record<number, keyof FinanceExportRow>> = { 5: 'showDuration', 6: 'totalBudget', 7: 'dealerBudget', 8: 'factoryBudget', 9: 'actual', 10: 'dealerActual', 11: 'factoryActual', 12: 'chargeBack', 13: 'diff', 14: 'showTarget', 15: 'showSales', 16: 'salesByShowTeam', 17: 'salesByNetwork', 18: 'salesOffice', 20: 'totalContractValue', 21: 'clawBack' };
    for (let col = 1; col <= columns.length; col++) {
      const cell = total.getCell(col);
      const metric = metricKeys[exportOrder[col - 1]];
      if (metric) {
        const letter = sheet.getColumn(col).letter;
        cell.value = { formula: `SUM(${letter}8:${letter}${lastDataRow})`, result: rows.reduce((sum, row) => sum + Number(row[metric] || 0), 0) };
      }
      if (moneyColumns.includes(exportOrder[col - 1])) cell.numFmt = moneyFormat;
      cell.font = { bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
  }
  sheet.autoFilter = { from: 'A7', to: `Z${Math.max(8, lastDataRow)}` };
  sheet.pageSetup.printTitlesRow = '6:7';
  return await workbook.xlsx.writeBuffer() as ArrayBuffer;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('formula' in value || 'sharedFormula' in value) {
      if (!('result' in value) || value.result === undefined) throw new Error(`Recalculate and save formula ${cell.address} in Excel before importing.`);
      return value.result;
    }
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    throw new Error(`Unsupported value in ${cell.address}. Use plain text or numbers.`);
  }
  return value;
}

function readNumber(value: unknown, label: string, integer = false): number {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = typeof value === 'string' ? value.trim().replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1') : value;
  const number = typeof cleaned === 'number' || typeof cleaned === 'string' ? Number(cleaned) : NaN;
  if (!Number.isFinite(number) || (integer && (!Number.isInteger(number) || number < 0))) throw new Error(`${label}: enter a valid ${integer ? 'non-negative whole number' : 'number'}.`);
  return number;
}

function readDate(value: unknown, label: string): string {
  let date: string;
  if (value instanceof Date) date = value.toISOString().slice(0, 10);
  else if (typeof value === 'number') date = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  else date = String(value ?? '').trim();
  if (!/^202[67]-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`${label}: use a valid 2026 reference or 2027 date (YYYY-MM-DD).`);
  return date;
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function readMonth(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = text.match(/^(?:2027-)?(0?[1-9]|1[0-2])(?:月)?$/);
  if (numeric) return monthNames[Number(numeric[1]) - 1];
  const name = monthNames.find((month) => [month.toLowerCase(), month.slice(0, 3).toLowerCase()].includes(text.toLowerCase()));
  if (!name) throw new Error(`${label}: use a month name or a number from 1 to 12.`);
  return name;
}

export async function parseFinanceWorkbook(data: ArrayBuffer): Promise<FinanceExportRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet('Finance Result 2027');
  if (!sheet) throw new Error('Use the exported Finance Result 2027 Excel template.');
  const headers = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(7).getCell(index + 1).text.trim());
  const hasMonth = headers.includes('Month 2027');
  const emptyColumn = sheet.columnCount + 1;
  const columnIndexes = columns.map(([name], index) => {
    const position = headers.indexOf(name);
    if (index === 25 && position < 0) return emptyColumn; // Older templates remain supported.
    if (position < 0 || headers.lastIndexOf(name) !== position) throw new Error(`Column ${index + 1} must be "${name}" exactly once. Keep the exported headers.`);
    return position + 1;
  });
  const getCell = (row: ExcelJS.Row, field: number) => row.getCell(columnIndexes[field - 1]);
  if (sheet.rowCount > 5008) throw new Error('Import at most 5,000 shows per workbook.');
  const results: FinanceExportRow[] = [];
  for (let rowNumber = 8; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const budgetLetter = sheet.getColumn(columnIndexes[5]).letter;
    if (rowNumber === sheet.rowCount && getCell(row, 1).text === 'Total' && !getCell(row, 22).value && getCell(row, 6).formula === `SUM(${budgetLetter}8:${budgetLetter}${rowNumber - 1})`) continue;
    const value = (col: number) => cellValue(getCell(row, col));
    // The empty template contains a Year, Schedule and Variance formula only.
    if (![1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26].some((col) => getCell(row, col).value !== null && getCell(row, col).text.trim() !== '')) continue;
    const text = (col: number) => String(value(col) ?? '').trim();
    const num = (col: number, integer = false) => readNumber(value(col), `Row ${rowNumber}, ${columns[col - 1][0]}`, integer);
    if (num(22) !== 2027) throw new Error(`Row ${rowNumber}: only 2027 data can be imported.`);
    const month2027 = readMonth(value(26), `Row ${rowNumber}, Month 2027`);
    const start = text(23) ? readDate(value(23), `Row ${rowNumber}, Start date`) : '';
    const finish = text(24) ? readDate(value(24), `Row ${rowNumber}, Finish date`) : '';
    // Keep untouched templates, including their copied reference dates, out of imports.
    if (text(1) && ['', 'Not Started'].includes(text(4)) &&
      !month2027 && (!start || start.startsWith('2026-')) && (!finish || finish.startsWith('2026-')) &&
      ![2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 25]
        .some((col) => getCell(row, col).value !== null && getCell(row, col).text.trim() !== '')) continue;
    if (!text(1) || (!text(3) && !month2027)) throw new Error(`Row ${rowNumber}: Show and Dealership are required (or fill Month 2027 for a planned show).`);
    if (start && finish && start.slice(0, 4) !== finish.slice(0, 4)) throw new Error(`Row ${rowNumber}: both dates must use the same year, either 2026 reference dates or 2027 dates.`);
    if (start && finish && finish < start) throw new Error(`Row ${rowNumber}: Finish date must be on or after Start date.`);
    const referenceDates = start.startsWith('2026-') || finish.startsWith('2026-');
    const startDate = referenceDates ? '' : start;
    const finishDate = referenceDates ? '' : finish;
    if (!referenceDates && (!startDate || !finishDate) && !month2027) throw new Error(`Row ${rowNumber}: fill both 2027 dates or Month 2027.`);
    const status = text(4) || 'Not Started';
    if (!['Not Started', 'In Progress', 'Completed', 'Finished', 'Cancelled'].includes(status)) throw new Error(`Row ${rowNumber}: Schedule must be Not Started, In Progress, Completed, Finished or Cancelled.`);
    const totalBudget = num(6), dealerBudget = num(7), factoryBudget = num(8);
    const actual = num(9), dealerActual = num(10), factoryActual = num(11);
    if ((dealerBudget || factoryBudget) && Math.abs(totalBudget - dealerBudget - factoryBudget) > 0.01) throw new Error(`Row ${rowNumber}: Total budget must equal Dealer budget + Factory budget (or leave both breakdowns blank).`);
    const showSales = num(15, true), salesByShowTeam = num(16, true), salesByNetwork = num(17, true), salesOffice = num(18, true);
    if (salesByShowTeam + salesByNetwork + salesOffice > showSales) throw new Error(`Row ${rowNumber}: sales breakdown cannot exceed Sold.`);
    const showId = text(25);
    if (showId && !/^[A-Za-z0-9_-]+$/.test(showId)) throw new Error(`Row ${rowNumber}: invalid Show ID.`);
    results.push({
      showId, showName: text(1), dealership: text(3), internalSalesOrderNumber: text(2),
      status, startDate, finishDate, showDuration: num(5, true) || (startDate && finishDate ? Math.round((Date.parse(finishDate) - Date.parse(startDate)) / 86400000) + 1 : 0),
      ...(referenceDates ? { referenceStartDate2026: start, referenceFinishDate2026: finish } : {}),
      ...(hasMonth ? { month2027 } : {}),
      totalBudget, dealerBudget, factoryBudget, actual, dealerActual, factoryActual, chargeBack: num(12), diff: actual - totalBudget,
      showTarget: num(14, true), showSales, salesByShowTeam, salesByNetwork, salesOffice,
      contractNumber: String(num(19, true)), totalContractValue: num(20), clawBack: num(21),
    });
  }
  if (!results.length) throw new Error('No show data found. Fill in the template from row 8.');
  if (results.length > 5000) throw new Error('Import at most 5,000 shows per workbook.');
  return results;
}

type ExistingShow = { id: string; name?: string; dealership?: string; startDate?: string; referenceStartDate2026?: string };
type ExistingInternalOrder = { id?: string; showId?: string; internalSalesOrderNumber?: string };
export function prepareFinanceImport(rows: FinanceExportRow[], shows: Record<string, ExistingShow>, internalOrders: Record<string, ExistingInternalOrder>, newId: () => string) {
  const updates: Record<string, unknown> = {};
  const seen = new Set<string>();
  const identities = new Set<string>();
  let created = 0;
  for (const row of rows) {
    const identity = [row.showName, row.dealership, row.startDate || row.referenceStartDate2026].join('|').toLowerCase();
    if (identities.has(identity)) throw new Error(`Duplicate show: ${row.showName}.`);
    identities.add(identity);
    let id = row.showId;
    if (id && !shows[id]) throw new Error(`Unknown 2027 Show ID for ${row.showName}. Leave Show ID blank for a new show.`);
    if (!id) {
      const matches = Object.entries(shows).filter(([, s]) => [s.name, s.dealership, s.startDate || s.referenceStartDate2026].join('|').toLowerCase() === identity);
      const soMatches = row.internalSalesOrderNumber ? Object.values(internalOrders).filter((o) => o.internalSalesOrderNumber === row.internalSalesOrderNumber && o.showId && shows[o.showId]).map((o) => o.showId!) : [];
      const candidates = new Set([...matches.map(([key]) => key), ...soMatches]);
      if (candidates.size > 1) throw new Error(`Ambiguous match for ${row.showName}. Export again and retain the Show ID.`);
      id = [...candidates][0] || newId();
    }
    if (seen.has(id)) throw new Error(`Multiple rows match ${row.showName}.`);
    seen.add(id);
    updates[`shows/${id}/year`] = 2027;
    for (const key of ['month2027', 'referenceStartDate2026', 'referenceFinishDate2026'] as const) {
      if (row[key] !== undefined) updates[`shows/${id}/${key}`] = row[key];
    }
    updates[`showActualOverrides/${id}`] = null;
    if (!shows[id]) {
      created++;
      updates[`shows/${id}/siteLocation`] = { number: '', street: '', suburb: '', postcode: '', state: '', country: 'Australia' };
      updates[`shows/${id}/teamMembers`] = [];
    }
    const summary: FinanceSummary = {
      actual: row.actual, dealerActual: row.dealerActual, factoryActual: row.factoryActual,
      showSales: row.showSales, salesByShowTeam: row.salesByShowTeam, salesByNetwork: row.salesByNetwork, salesOffice: row.salesOffice,
      contractNumber: row.contractNumber, totalContractValue: row.totalContractValue,
    };
    for (const [key, value] of Object.entries({ id, name: row.showName, dealership: row.dealership, startDate: row.startDate, finishDate: row.finishDate, showDuration: row.showDuration, status: row.status, target2027: row.showTarget, sales2027: row.showSales, financeResult: summary })) updates[`shows/${id}/${key}`] = value;
    for (const [key, value] of Object.entries({ totalBudget: row.totalBudget, totalDealerCost: row.dealerBudget, totalFactoryCosts: row.factoryBudget, dealerDayRates: row.dealerBudget, factoryTravelCosts: row.factoryBudget, standCosts: 0, dealerCommission: 0, dealerCostsTransport: 0, factoryCommission: 0, chargeBack: row.chargeBack, clawBack: row.clawBack, salesTarget2027: row.showTarget, totalContractValue: row.totalContractValue, contractNumber: row.contractNumber })) updates[`showBudgets/${id}/${key}`] = value;
    const internal = Object.entries(internalOrders).find(([, order]) => order.showId === id);
    const internalId = internal?.[0] || `import-${id}`;
    for (const [key, value] of Object.entries({ id: internalId, showId: id, dealership: row.dealership, internalSalesOrderNumber: row.internalSalesOrderNumber })) updates[`finance/internalSalesOrders/${internalId}/${key}`] = value;
  }
  return { updates, created, updated: rows.length - created };
}
