import type { FinanceExportRow } from './financeResultExcel';

export type FinanceNameTemplate = FinanceExportRow & {
  isTemplateRow: true;
  showYear: 2027;
  actualOverridden: false;
};

// These rows are presentation-only. Only an explicit Excel import creates a
// 2027 show. Legacy dates are reference dates, never the actual 2027 schedule.
export function createFinanceNameTemplates(
  names: { id: string; name: string; dealership?: string; startDate?: string; finishDate?: string }[],
  currentRows: Pick<FinanceExportRow, 'showName'>[],
): FinanceNameTemplate[] {
  const filled = new Map<string, number>();
  const normalize = (name: string) => name.trim().toLowerCase();
  currentRows.forEach((row) => filled.set(normalize(row.showName), (filled.get(normalize(row.showName)) || 0) + 1));
  return names.flatMap(({ id, name, dealership, startDate, finishDate }) => {
    if (!name?.trim()) return [];
    const key = normalize(name);
    const count = filled.get(key) || 0;
    if (count) { filled.set(key, count - 1); return []; }
    return [{
      showId: `template:${id}`, showName: name, isTemplateRow: true, showYear: 2027, actualOverridden: false,
      dealership: dealership || '', internalSalesOrderNumber: '', status: 'Not Started', startDate: '', finishDate: '', showDuration: 0,
      referenceStartDate2026: startDate || '', referenceFinishDate2026: finishDate || '', month2027: '',
      totalBudget: 0, dealerBudget: 0, factoryBudget: 0, actual: 0, dealerActual: 0, factoryActual: 0,
      chargeBack: 0, diff: 0, showTarget: 0, showSales: 0, salesByShowTeam: 0, salesByNetwork: 0,
      salesOffice: 0, contractNumber: '', totalContractValue: 0, clawBack: 0,
    } satisfies FinanceNameTemplate];
  });
}
