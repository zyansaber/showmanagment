import type { FinanceSummary } from './financeResultExcel';
import { activeYear } from './showYear';

export function importedFinance(show: unknown): FinanceSummary | undefined {
  return activeYear === 2027 ? (show as { financeResult?: FinanceSummary } | null)?.financeResult : undefined;
}
