import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { dbGet, dbSet } from '@/lib/firebase';
import { Eye, Inbox, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Show = {
  id: string;
  name: string;
  dealership?: string;
  target2025?: number;
  sales2025?: number;
  target2026?: number;
  sales2026?: number;
  startDate?: string;
  finishDate?: string;
  status?: string;
};

type ShowOrder = {
  id?: string;
  showId?: string;
  salesperson?: string;
  date?: string;
  model?: string;
  contractValue?: number;
  status?: string;
  orderStatusId?: string;
  dealerConfirm?: boolean;
};

type TeamMember = {
  memberId?: string;
  memberName?: string;
  role?: string;
};

type BudgetRow = {
  showId: string;
  showName: string;
  dealership: string;
  internalSalesOrderNumber: string;
  showYear: number | null;
  startDate?: string;
  finishDate?: string;
  status?: string;
  totalBudget: number;
  dealerBudget: number;
  factoryBudget: number;
  actual: number;
  dealerActual: number;
  factoryActual: number;
  chargeBack: number;
  diff: number;
  showTarget: number;
  showSales: number;
  salesByShowTeam: number;
  salesByNetwork: number;
  salesOffice: number;
  contractNumber: string;
  totalContractValue: number;
  clawBack: number;
  actualOverridden: boolean;
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : '0';

const formatCurrency = (value: number) => {
  const numeric = Number.isFinite(value) ? value : 0;
  const sign = numeric < 0 ? '-' : '';
  return `${sign}$${Math.abs(numeric).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
};

const formatSignedCurrency = (value: number) => {
  const numeric = Number.isFinite(value) ? value : 0;
  return numeric > 0 ? `+${formatCurrency(numeric)}` : formatCurrency(numeric);
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const computeDealerTotal = (draft: Record<string, unknown>) =>
  parseNumber(draft.standCosts) / 2 +
  parseNumber(draft.dealerDayRates) +
  parseNumber(draft.dealerCommission) +
  parseNumber(draft.dealerCostsTransport);

const computeFactoryTotal = (draft: Record<string, unknown>) =>
  parseNumber(draft.factoryCommission) + parseNumber(draft.factoryTravelCosts) + parseNumber(draft.standCosts) / 2;

const TARGET_YEAR = 2026;
const SPECIAL_SHOW_NAME = 'Geelong Caravaning & Adventure Leisurefest - 2025';

const leadingZeroSafe = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const asString = String(value);
  const stripped = asString.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : asString;
};

const numberOrZero = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseDateSafe = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatShortDate = (value?: string | null) => {
  const date = parseDateSafe(value ?? undefined);
  if (!date) return 'Date TBC';
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
};

const isFinishedRow = (row: BudgetRow) => {
  const today = new Date();
  const finish = parseDateSafe(row.finishDate);
  const status = row.status?.toLowerCase();
  if (status === 'finished' || status === 'completed') return true;
  if (finish && finish.getTime() <= today.getTime()) return true;
  return false;
};

const daysUntilStart = (row: BudgetRow) => {
  const today = new Date();
  const start = parseDateSafe(row.startDate);
  if (!start) return null;
  const diffMs = start.getTime() - today.getTime();
  if (diffMs < 0) return null;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return days <= 10 ? days : null;
};

type FinanceLine = {
  aufnrNorm: string;
  glAccountNorm: string;
  companyCode: string;
  postingDate?: string;
  amount: number;
};

const parseFinanceLines = (data: unknown): FinanceLine[] => {
  if (!data || typeof data !== 'object') return [];
  const lines: FinanceLine[] = [];
  const root = data as Record<string, unknown>;

  Object.entries(root).forEach(([aufnrKey, glBuckets]) => {
    if (!glBuckets || typeof glBuckets !== 'object') return;
    const aufnrNorm = leadingZeroSafe(aufnrKey);

    Object.entries(glBuckets as Record<string, unknown>).forEach(([glKey, glValue]) => {
      if (!glValue || typeof glValue !== 'object') return;
      const glAccountNorm = leadingZeroSafe(glKey);
      const glBucket = glValue as Record<string, unknown>;
      if (!glBucket.lines || typeof glBucket.lines !== 'object') return;

      Object.values(glBucket.lines as Record<string, unknown>).forEach((rawLine) => {
        if (!rawLine || typeof rawLine !== 'object') return;
        const line = rawLine as Record<string, unknown>;
        lines.push({
          aufnrNorm,
          glAccountNorm,
          companyCode: typeof line.company_code === 'string' ? line.company_code : 'NA',
          postingDate: typeof line.posting_date === 'string' ? line.posting_date : undefined,
          amount: numberOrZero(line.amount),
        });
      });
    });
  });

  return lines;
};

const getYearFromDate = (value: string | undefined | null): number | null => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})/);
  if (match?.[1]) {
    const year = Number(match[1]);
    return Number.isFinite(year) ? year : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
};

const getShowYear = (show: Show): number | null => {
  const startYear = getYearFromDate(show.startDate);
  if (startYear) return startYear;
  const finishYear = getYearFromDate(show.finishDate);
  if (finishYear) return finishYear;
  if (show.target2026 && show.target2026 > 0) return 2026;
  if (show.target2025 && show.target2025 > 0) return 2025;
  return null;
};

const isRelevantShow = (show: Show) => {
  const year = getShowYear(show);
  return year === TARGET_YEAR;
};

const buildAufnrShowMap = (
  internalOrders: unknown,
  showsById: Record<string, Show>
): Record<string, { showId: string; showName?: string }> => {
  const map: Record<string, { showId: string; showName?: string }> = {};
  if (!internalOrders || typeof internalOrders !== 'object') return map;

  Object.values(internalOrders as Record<string, Record<string, unknown>>).forEach((order) => {
    if (!order || typeof order !== 'object') return;
    const dealerNumber =
      typeof order.internalSalesOrderNumberDealer === 'string' ? order.internalSalesOrderNumberDealer.trim() : '';
    const internalNumber = typeof order.internalSalesOrderNumber === 'string' ? order.internalSalesOrderNumber.trim() : '';
    const showId = typeof order.showId === 'string' ? order.showId.trim() : '';
    if (!showId) return;
    const candidates = [dealerNumber, internalNumber].filter(Boolean);
    candidates.forEach((num) => {
      const norm = leadingZeroSafe(num);
      if (!norm) return;
      map[norm] = { showId, showName: showsById[showId]?.name };
    });
  });

  return map;
};

const compareShows = (a: Show, b: Show) => {
  if (a.name === SPECIAL_SHOW_NAME) return -1;
  if (b.name === SPECIAL_SHOW_NAME) return 1;
  const aDate = a.startDate ? new Date(a.startDate) : a.finishDate ? new Date(a.finishDate) : null;
  const bDate = b.startDate ? new Date(b.startDate) : b.finishDate ? new Date(b.finishDate) : null;
  const aTime = aDate && !Number.isNaN(aDate.getTime()) ? aDate.getTime() : Number.POSITIVE_INFINITY;
  const bTime = bDate && !Number.isNaN(bDate.getTime()) ? bDate.getTime() : Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime - bTime;
  return a.name.localeCompare(b.name);
};

const OPTIONAL_COLUMNS = [
  'dealerBudget', 'factoryBudget', 'dealerActual', 'factoryActual', 'chargeBack', 'salesOffice', 'clawBack',
] as const;
type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
const COLUMN_LABELS: Record<OptionalColumn, string> = {
  dealerBudget: 'Dealer Budget', factoryBudget: 'Factory Budget', dealerActual: 'Dealer Actual',
  factoryActual: 'Factory Actual', chargeBack: 'Charge Back', salesOffice: 'Sales Office', clawBack: 'Claw Back',
};
const SELF_OWNED_DEALERS = ['Frankston', 'Geelong', 'Launceston', 'ST James', 'Traralgon'];

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

/** Shared cell tints so a column group reads as one band across header, body and totals. */
const BAND = {
  budget: 'bg-white',
  actual: 'bg-sky-50/60',
  sales: 'bg-white',
};
const EDGE = 'border-l border-slate-200';

const numeric = 'text-right tabular-nums';

/** Diverging bar centred on zero — under budget grows left, over budget grows right. */
function VarianceBar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, Math.abs(value) / max) : 0;
  const width = `${ratio * 50}%`;
  const over = value > 0;
  return (
    <span aria-hidden className="relative hidden h-3 w-14 shrink-0 xl:inline-block">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300" />
      <span
        className={`absolute inset-y-[3px] rounded-sm ${over ? 'left-1/2 bg-rose-400' : 'right-1/2 bg-emerald-400'}`}
        style={{ width }}
      />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="space-y-px overflow-hidden rounded-xl border border-slate-200">
        <div className="h-10 animate-pulse bg-slate-100" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-11 animate-pulse bg-slate-50" />
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading budget data
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ShowBudgetExpense({ editableActuals = false }: { editableActuals?: boolean }) {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleOptionalColumns, setVisibleOptionalColumns] = useState<Set<OptionalColumn>>(new Set());

  const loadData = useCallback(async (announce = false) => {
    try {
      if (announce) setRefreshing(true);
      else setLoading(true);

      const [showsData, budgetsData, ordersData, financeData, internalOrdersData, teamData, expensesData, mappingData, overridesData] =
        await Promise.all([
          dbGet('shows'),
          dbGet('showBudgets'),
          dbGet('showOrders'),
          dbGet('finance/glByAufnrGl'),
          dbGet('finance/internalSalesOrders'),
          dbGet('teamMembers'),
          dbGet('finance/expenses'),
          dbGet('scheduleDealerMappings'),
          dbGet('showActualOverrides'),
        ]);
      const showList: Show[] = showsData ? Object.values(showsData) : [];
      const budgetMap = budgetsData ?? {};
      const orders: ShowOrder[] = ordersData ? Object.values(ordersData) : [];
      const confirmedOrders = orders.filter((order) => order.orderStatusId?.toLowerCase() === 'confirmation');
      const teamMembers: TeamMember[] = teamData ? Object.values(teamData) : [];
      const financeLines = parseFinanceLines(financeData);
      const allowedGlCodes = new Set(
        expensesData
          ? Object.values(expensesData as Record<string, { glCode?: string }>)
              .map((item) => item?.glCode?.trim())
              .filter((gl): gl is string => Boolean(gl))
              .map((gl) => leadingZeroSafe(gl))
          : []
      );
      const showsById = showList.reduce<Record<string, Show>>((acc, show) => {
        if (show.id) acc[show.id] = show;
        return acc;
      }, {});
      const aufnrShowMap = buildAufnrShowMap(internalOrdersData, showsById);
      const internalOrderByShow = Object.values((internalOrdersData || {}) as Record<string, Record<string, unknown>>).reduce<Record<string, string>>((acc, order) => {
        if (typeof order.showId === 'string') acc[order.showId] = typeof order.internalSalesOrderNumber === 'string' ? order.internalSalesOrderNumber : '';
        return acc;
      }, {});
      const mappedDealerLookup = Object.entries((mappingData || {}) as Record<string, string[]>).reduce<Record<string, string>>((acc, [scheduleDealer, dealers]) => {
        acc[scheduleDealer.trim().toLowerCase()] = scheduleDealer;
        (dealers || []).forEach((dealer) => { acc[dealer.trim().toLowerCase()] = scheduleDealer; });
        return acc;
      }, {});
      const displayDealership = (dealership?: string) => {
        const mapped = (dealership || '').split(/[,&/\n]/).map((dealer) => mappedDealerLookup[dealer.trim().toLowerCase()]).find(Boolean);
        return mapped || dealership || '';
      };

      const roleLookup = teamMembers.reduce<Record<string, string>>((acc, member) => {
        const name = member.memberName?.trim();
        const id = member.memberId?.trim();
        if (name) acc[name] = member.role || '';
        if (id) acc[id] = member.role || '';
        return acc;
      }, {});

      const salesCounts = confirmedOrders.reduce<
        Record<string, { total: number; showTeam: number; network: number; office: number }>
      >((acc, order) => {
        const showId = order.showId;
        if (!showId) return acc;
        const linkedShow = showsById[showId];
        if (!linkedShow || !isRelevantShow(linkedShow)) return acc;
        const orderYear = getYearFromDate(order.date);
        const showYear = getShowYear(linkedShow);
        const include =
          (showYear === TARGET_YEAR && orderYear === TARGET_YEAR) ||
          (linkedShow.name === SPECIAL_SHOW_NAME && orderYear === 2025);
        if (!include) return acc;
        if (!acc[showId]) {
          acc[showId] = { total: 0, showTeam: 0, network: 0, office: 0 };
        }
        acc[showId].total += 1;
        const role = order.salesperson ? roleLookup[order.salesperson] : undefined;
        if (role === 'Show Team') acc[showId].showTeam += 1;
        else if (role === 'Network Team') acc[showId].network += 1;
        else if (role === 'Factory Team') acc[showId].office += 1;
        return acc;
      }, {});

      const contractTotals = confirmedOrders.reduce<Record<string, { total: number; count: number }>>((acc, order) => {
        const showId = order.showId;
        if (!showId) return acc;
        const linkedShow = showsById[showId];
        if (!linkedShow || !isRelevantShow(linkedShow)) return acc;
        const orderYear = getYearFromDate(order.date);
        const showYear = getShowYear(linkedShow);
        const include =
          (showYear === TARGET_YEAR && orderYear === TARGET_YEAR) ||
          (linkedShow.name === SPECIAL_SHOW_NAME && orderYear === 2025);
        if (!include) return acc;
        if (!acc[showId]) acc[showId] = { total: 0, count: 0 };
        acc[showId].total += numberOrZero(order.contractValue);
        acc[showId].count += 1;
        return acc;
      }, {});

      const actualsByShow = financeLines.reduce<Record<string, { dealer: number; factory: number }>>((acc, line) => {
        if (!allowedGlCodes.has(line.glAccountNorm)) return acc;
        const mappedShow = aufnrShowMap[line.aufnrNorm];
        if (!mappedShow?.showId) return acc;
        if (!acc[mappedShow.showId]) acc[mappedShow.showId] = { dealer: 0, factory: 0 };
        if (line.companyCode === '3120') acc[mappedShow.showId].dealer += line.amount;
        else if (line.companyCode === '3110') acc[mappedShow.showId].factory += line.amount;
        return acc;
      }, {});

      const mapped: BudgetRow[] = showList.filter(isRelevantShow).sort(compareShows).map((show) => {
        const budget = (budgetMap?.[show.id] ?? {}) as Record<string, unknown>;
        const year = getShowYear(show);
        const dealerBudget =
          parseNumber(budget.totalDealerCost) || parseNumber(budget.dealerBudget) || computeDealerTotal(budget);
        const factoryBudget =
          parseNumber(budget.totalFactoryCosts ?? budget.totalFactoryCost) ||
          parseNumber(budget.factoryBudget) ||
          computeFactoryTotal(budget);
        const totalBudget = dealerBudget + factoryBudget;
        const financeActual = actualsByShow[show.id] || { dealer: 0, factory: 0 };
        const dealerActual = financeActual.dealer;
        const factoryActual = financeActual.factory;
        const calculatedActual = dealerActual + factoryActual;
        const override = (overridesData as Record<string, { actual?: unknown }> | null)?.[show.id];
        const actualOverridden = override?.actual !== undefined && override?.actual !== null;
        const actual = actualOverridden ? parseNumber(override.actual) : calculatedActual;
        const chargeBack = parseNumber(budget.chargeBack);
        const diff = Number.isFinite(actual - totalBudget) ? actual - totalBudget : 0;
        const sales = salesCounts[show.id] || { total: 0, showTeam: 0, network: 0, office: 0 };
        const contractSummary = contractTotals[show.id] || { total: Number(budget.totalContractValue ?? 0), count: 0 };
        return {
          showId: show.id,
          showName: show.name,
          dealership: displayDealership(show.dealership),
          internalSalesOrderNumber: internalOrderByShow[show.id] || '',
          showYear: year,
          startDate: show.startDate,
          finishDate: show.finishDate,
          status: show.status,
          totalBudget,
          dealerBudget,
          factoryBudget,
          actual,
          dealerActual,
          factoryActual,
          chargeBack,
          diff,
          showTarget:
            year === TARGET_YEAR
              ? Number(show.target2026 ?? budget.salesTarget2026 ?? budget.salesTarget ?? 0)
              : Number(show.target2025 ?? show.target2026 ?? 0),
          showSales: sales.total,
          salesByShowTeam: sales.showTeam,
          salesByNetwork: sales.network,
          salesOffice: sales.office,
          contractNumber: contractSummary.count > 0 ? String(contractSummary.count) : String(budget.contractNumber ?? ''),
          totalContractValue:
            contractSummary.total > 0 ? contractSummary.total : Number(budget.totalContractValue ?? 0),
          clawBack: Number(budget.clawBack ?? 0),
          actualOverridden,
        };
      });

      setRows(mapped);
      if (announce) toast.success('Budget data refreshed');
    } catch (err) {
      console.error('Unable to load budget data', err);
      toast.error('Budget data did not load. Check the connection and try refreshing.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.showName} ${row.dealership}`.toLowerCase().includes(term));
  }, [rows, search]);

  const aggregates = useMemo(() => {
    const rows2026 = filteredRows.filter((row) => row.showYear === TARGET_YEAR);
    const completedRows = rows2026.filter(isFinishedRow);
    const sum = <K extends keyof BudgetRow>(source: BudgetRow[], key: K) =>
      source.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

    const pct = (actual: number, budget: number) => {
      if (budget <= 0) return 0;
      return ((actual - budget) / budget) * 100;
    };

    const ytdTotalActual = sum(completedRows, 'actual');
    const ytdTotalBudget = sum(completedRows, 'totalBudget');
    const selfOwned = rows2026.filter((row) => SELF_OWNED_DEALERS.includes(row.dealership));
    const independent = rows2026.filter((row) => !SELF_OWNED_DEALERS.includes(row.dealership));
    const dealerSummary = (source: BudgetRow[]) => {
      const actual = sum(source, 'actual');
      const contractValue = sum(source, 'totalContractValue');
      return { actual, sales: sum(source, 'showSales'), contractValue, returnOnActual: actual ? contractValue / actual : 0 };
    };

    return {
      completedRows,
      completedCount: completedRows.length,
      ytd: {
        totalActual: ytdTotalActual,
        totalBudget: ytdTotalBudget,
        pctTotal: pct(ytdTotalActual, ytdTotalBudget),
      },
      selfOwned: dealerSummary(selfOwned),
      independent: dealerSummary(independent),
    };
  }, [filteredRows]);

  /** Column totals for the pinned footer row. */
  const totals = useMemo(() => {
    const add = (key: keyof BudgetRow) => filteredRows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    return {
      totalBudget: add('totalBudget'), dealerBudget: add('dealerBudget'), factoryBudget: add('factoryBudget'),
      actual: add('actual'), dealerActual: add('dealerActual'), factoryActual: add('factoryActual'),
      chargeBack: add('chargeBack'), diff: add('diff'), showTarget: add('showTarget'), showSales: add('showSales'),
      salesByShowTeam: add('salesByShowTeam'), salesByNetwork: add('salesByNetwork'), salesOffice: add('salesOffice'),
      totalContractValue: add('totalContractValue'), clawBack: add('clawBack'),
    };
  }, [filteredRows]);

  const maxAbsDiff = useMemo(
    () => filteredRows.reduce((max, row) => Math.max(max, Math.abs(row.diff)), 0),
    [filteredRows]
  );

  const optionalVisible = (column: OptionalColumn) => visibleOptionalColumns.has(column);
  const optionalColumnCount = OPTIONAL_COLUMNS.filter(optionalVisible).length;

  const updateActual = async (showId: string, value: string) => {
    const actual = parseNumber(value);
    setRows((current) => current.map((row) => row.showId === showId ? { ...row, actual, diff: actual - row.totalBudget, actualOverridden: true } : row));
    try {
      await dbSet(`showActualOverrides/${showId}`, { actual, updatedAt: new Date().toISOString() });
      toast.success('Actual cost updated');
    } catch (error) {
      console.error('Unable to update actual cost', error);
      toast.error('Actual cost did not save. Try again.');
    }
  };

  const varianceBadge = (pct: number) => {
    const tone =
      pct > 5
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : pct < -5
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-amber-50 text-amber-800 ring-amber-200';
    const sign = pct > 0 ? '+' : '';
    return (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${tone}`}>
        {sign}{pct.toFixed(1)}% vs budget
      </span>
    );
  };

  const utilisation = aggregates.ytd.totalBudget > 0
    ? Math.min(140, (aggregates.ytd.totalActual / aggregates.ytd.totalBudget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/60 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white">
                {TARGET_YEAR}
              </span>
              <CardTitle className="text-lg tracking-tight">Show Budget &amp; Expense</CardTitle>
            </div>
            <p className="text-sm text-slate-600">
              Budget, actual spend and sales for every {TARGET_YEAR} show, side by side.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search show or dealership"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-64 bg-white pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 bg-white">
                  <Eye className="mr-2 h-4 w-4" />
                  Columns
                  {optionalColumnCount > 0 && (
                    <span className="ml-2 rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold text-white">
                      {optionalColumnCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Optional columns</DropdownMenuLabel>
                {OPTIONAL_COLUMNS.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column}
                    checked={optionalVisible(column)}
                    onCheckedChange={(checked) => setVisibleOptionalColumns((current) => {
                      const next = new Set(current);
                      if (checked) next.add(column); else next.delete(column);
                      return next;
                    })}
                  >
                    {COLUMN_LABELS[column]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="h-9 bg-white"
              disabled={refreshing || loading}
              onClick={() => void loadData(true)}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {loading ? (
            <TableSkeleton />
          ) : (
            <div className="space-y-5">
              {/* Summary ------------------------------------------------ */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="space-y-3 pt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Actual cost, year to date
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
                        {formatCurrency(aggregates.ytd.totalActual)}
                      </p>
                      {aggregates.completedCount > 0 && varianceBadge(aggregates.ytd.pctTotal)}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${
                          aggregates.ytd.pctTotal > 5 ? 'bg-rose-500' : aggregates.ytd.pctTotal < -5 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, utilisation)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="tabular-nums">Budget {formatCurrency(aggregates.ytd.totalBudget)}</span>
                      <span>
                        {aggregates.completedCount > 0
                          ? `${aggregates.completedCount} finished show${aggregates.completedCount === 1 ? '' : 's'}`
                          : 'No finished shows yet'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {(['selfOwned', 'independent'] as const).map((group) => (
                  <Card key={group} className="border-slate-200 shadow-none">
                    <CardContent className="space-y-3 pt-5">
                      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <span className={`h-1.5 w-1.5 rounded-full ${group === 'selfOwned' ? 'bg-slate-900' : 'bg-sky-500'}`} />
                        {group === 'selfOwned' ? 'Self-owned' : 'Independent dealers'}
                      </p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Stat label="Actual" value={formatCurrency(aggregates[group].actual)} />
                        <Stat label="Show sales" value={formatNumber(aggregates[group].sales)} />
                        <Stat label="Contract value" value={formatCurrency(aggregates[group].contractValue)} />
                        <Stat label="Contract / actual" value={`${aggregates[group].returnOnActual.toFixed(2)}×`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>Sales figures count only orders confirmed in the Orders &amp; Sales dashboard.</span>
                <span className="tabular-nums">
                  {filteredRows.length === rows.length
                    ? `${rows.length} shows`
                    : `${filteredRows.length} of ${rows.length} shows`}
                </span>
              </div>

              {/* Table -------------------------------------------------- */}
              <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 shadow-sm">
                <Table className="text-xs [&_td]:px-3 [&_td]:py-2 [&_th]:px-3">
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead rowSpan={2} className="sticky left-0 top-0 z-30 h-9 min-w-[200px] bg-slate-50 align-middle font-semibold text-slate-700">
                        Show
                      </TableHead>
                      <TableHead rowSpan={2} className="sticky top-0 z-20 h-9 min-w-[130px] bg-slate-50 align-middle font-semibold text-slate-700">
                        Internal SO
                      </TableHead>
                      <TableHead rowSpan={2} className="sticky top-0 z-20 h-9 min-w-[120px] bg-slate-50 align-middle font-semibold text-slate-700">
                        Dealership
                      </TableHead>
                      <TableHead rowSpan={2} className="sticky top-0 z-20 h-9 bg-slate-50 text-center align-middle font-semibold text-slate-700">
                        Schedule
                      </TableHead>
                      <TableHead
                        colSpan={1 + Number(optionalVisible('dealerBudget')) + Number(optionalVisible('factoryBudget'))}
                        className={`sticky top-0 z-20 h-9 bg-slate-50 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${EDGE}`}
                      >
                        Budget
                      </TableHead>
                      <TableHead
                        colSpan={2 + Number(optionalVisible('dealerActual')) + Number(optionalVisible('factoryActual')) + Number(optionalVisible('chargeBack'))}
                        className={`sticky top-0 z-20 h-9 bg-sky-100/70 text-center text-[10px] font-semibold uppercase tracking-wider text-sky-900 ${EDGE}`}
                      >
                        Actual
                      </TableHead>
                      <TableHead
                        colSpan={6 + Number(optionalVisible('salesOffice')) + Number(optionalVisible('clawBack'))}
                        className={`sticky top-0 z-20 h-9 bg-slate-50 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${EDGE}`}
                      >
                        Sales
                      </TableHead>
                    </TableRow>
                    <TableRow className="border-slate-200 hover:bg-transparent">
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric} ${EDGE}`}>Total budget</TableHead>
                      {optionalVisible('dealerBudget') && <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Dealer</TableHead>}
                      {optionalVisible('factoryBudget') && <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Factory</TableHead>}
                      <TableHead className={`sticky top-9 z-20 h-9 bg-sky-50 align-middle font-semibold text-sky-900 ${numeric} ${EDGE}`}>Actual</TableHead>
                      {optionalVisible('dealerActual') && <TableHead className={`sticky top-9 z-20 h-9 bg-sky-50 align-middle font-medium text-sky-900 ${numeric}`}>Dealer</TableHead>}
                      {optionalVisible('factoryActual') && <TableHead className={`sticky top-9 z-20 h-9 bg-sky-50 align-middle font-medium text-sky-900 ${numeric}`}>Factory</TableHead>}
                      {optionalVisible('chargeBack') && <TableHead className={`sticky top-9 z-20 h-9 bg-sky-50 align-middle font-medium text-sky-900 ${numeric}`}>Charge back</TableHead>}
                      <TableHead className={`sticky top-9 z-20 h-9 bg-sky-50 align-middle font-medium text-sky-900 ${numeric}`}>Variance</TableHead>
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric} ${EDGE}`}>Target</TableHead>
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Sold</TableHead>
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Show team</TableHead>
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Network</TableHead>
                      {optionalVisible('salesOffice') && <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Sales office</TableHead>}
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Contracts</TableHead>
                      <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Contract value</TableHead>
                      {optionalVisible('clawBack') && <TableHead className={`sticky top-9 z-20 h-9 bg-slate-50 align-middle font-medium text-slate-600 ${numeric}`}>Claw back</TableHead>}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={13 + optionalColumnCount} className="py-14 text-center">
                          <Inbox className="mx-auto mb-3 h-7 w-7 text-slate-300" />
                          <p className="text-sm font-medium text-slate-700">
                            {search ? 'No show matches that search' : `No ${TARGET_YEAR} shows to report on yet`}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {search ? 'Try a shorter term, or clear the search box.' : 'Shows appear here once they are scheduled with a budget.'}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row) => {
                        const finished = isFinishedRow(row);
                        const nextDays = finished ? null : daysUntilStart(row);

                        return (
                          <TableRow
                            key={row.showId}
                            className="border-slate-100 bg-white transition-colors hover:bg-slate-50"
                          >
                            <TableCell className="sticky left-0 z-10 max-w-[240px] truncate bg-inherit font-medium text-slate-900" title={row.showName}>
                              {row.showName}
                            </TableCell>
                            <TableCell className="tabular-nums text-slate-600">{row.internalSalesOrderNumber || <span className="text-slate-300">—</span>}</TableCell>
                            <TableCell className="text-slate-600">{row.dealership || <span className="text-slate-300">—</span>}</TableCell>
                            <TableCell className="text-center">
                              {finished ? (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700">
                                  Finished
                                </Badge>
                              ) : nextDays !== null ? (
                                <Badge variant="outline" className="gap-1.5 border-amber-200 bg-amber-50 font-medium text-amber-800">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse" />
                                  In {nextDays} day{nextDays === 1 ? '' : 's'}
                                </Badge>
                              ) : (
                                <span className="text-slate-500">{formatShortDate(row.startDate)}</span>
                              )}
                            </TableCell>

                            <TableCell className={`${numeric} ${BAND.budget} font-medium text-slate-900 ${EDGE}`}>{formatCurrency(row.totalBudget)}</TableCell>
                            {optionalVisible('dealerBudget') && <TableCell className={`${numeric} text-slate-600`}>{formatCurrency(row.dealerBudget)}</TableCell>}
                            {optionalVisible('factoryBudget') && <TableCell className={`${numeric} text-slate-600`}>{formatCurrency(row.factoryBudget)}</TableCell>}

                            <TableCell className={`${numeric} ${BAND.actual} ${EDGE} ${row.actualOverridden ? 'font-semibold text-rose-600' : 'font-medium text-sky-800'}`}>
                              {editableActuals ? (
                                <Input
                                  type="number"
                                  defaultValue={row.actual}
                                  onBlur={(event) => void updateActual(row.showId, event.target.value)}
                                  className={`h-7 min-w-28 bg-white text-right tabular-nums ${row.actualOverridden ? 'font-semibold text-rose-600' : ''}`}
                                />
                              ) : (
                                <span title={row.actualOverridden ? 'Manually overridden' : undefined}>
                                  {formatCurrency(row.actual)}
                                  {row.actualOverridden && <span className="ml-1 text-[10px] align-super">M</span>}
                                </span>
                              )}
                            </TableCell>
                            {optionalVisible('dealerActual') && <TableCell className={`${numeric} ${BAND.actual} text-sky-900/80`}>{formatCurrency(row.dealerActual)}</TableCell>}
                            {optionalVisible('factoryActual') && <TableCell className={`${numeric} ${BAND.actual} text-sky-900/80`}>{formatCurrency(row.factoryActual)}</TableCell>}
                            {optionalVisible('chargeBack') && <TableCell className={`${numeric} ${BAND.actual} text-sky-900/80`}>{formatCurrency(row.chargeBack)}</TableCell>}

                            <TableCell className={`${BAND.actual} text-right`}>
                              <span className="flex items-center justify-end gap-2">
                                <VarianceBar value={row.diff} max={maxAbsDiff} />
                                <span className={`tabular-nums font-medium ${row.diff > 0 ? 'text-rose-600' : row.diff < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  {row.diff === 0 ? '—' : formatSignedCurrency(row.diff)}
                                </span>
                              </span>
                            </TableCell>

                            <TableCell className={`${numeric} text-slate-500 ${EDGE}`}>{formatNumber(row.showTarget)}</TableCell>
                            <TableCell className={`${numeric} font-medium text-slate-900`}>{formatNumber(row.showSales)}</TableCell>
                            <TableCell className={`${numeric} text-slate-600`}>{formatNumber(row.salesByShowTeam)}</TableCell>
                            <TableCell className={`${numeric} text-slate-600`}>{formatNumber(row.salesByNetwork)}</TableCell>
                            {optionalVisible('salesOffice') && <TableCell className={`${numeric} text-slate-600`}>{formatNumber(row.salesOffice)}</TableCell>}
                            <TableCell className={`${numeric} text-slate-600`}>{row.contractNumber || <span className="text-slate-300">—</span>}</TableCell>
                            <TableCell className={`${numeric} font-medium text-slate-900`}>{formatCurrency(row.totalContractValue)}</TableCell>
                            {optionalVisible('clawBack') && <TableCell className={`${numeric} text-slate-600`}>{formatCurrency(row.clawBack)}</TableCell>}
                          </TableRow>
                        );
                      })
                    )}

                    {filteredRows.length > 0 && (
                      <TableRow className="sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-50 font-semibold hover:bg-slate-50">
                        <TableCell className="sticky left-0 z-10 bg-inherit text-slate-900">Total</TableCell>
                        <TableCell className="bg-inherit" />
                        <TableCell className="bg-inherit" />
                        <TableCell className="bg-inherit" />
                        <TableCell className={`${numeric} bg-inherit text-slate-900 ${EDGE}`}>{formatCurrency(totals.totalBudget)}</TableCell>
                        {optionalVisible('dealerBudget') && <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatCurrency(totals.dealerBudget)}</TableCell>}
                        {optionalVisible('factoryBudget') && <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatCurrency(totals.factoryBudget)}</TableCell>}
                        <TableCell className={`${numeric} bg-inherit text-sky-900 ${EDGE}`}>{formatCurrency(totals.actual)}</TableCell>
                        {optionalVisible('dealerActual') && <TableCell className={`${numeric} bg-inherit text-sky-900`}>{formatCurrency(totals.dealerActual)}</TableCell>}
                        {optionalVisible('factoryActual') && <TableCell className={`${numeric} bg-inherit text-sky-900`}>{formatCurrency(totals.factoryActual)}</TableCell>}
                        {optionalVisible('chargeBack') && <TableCell className={`${numeric} bg-inherit text-sky-900`}>{formatCurrency(totals.chargeBack)}</TableCell>}
                        <TableCell className={`${numeric} bg-inherit ${totals.diff > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatSignedCurrency(totals.diff)}</TableCell>
                        <TableCell className={`${numeric} bg-inherit text-slate-700 ${EDGE}`}>{formatNumber(totals.showTarget)}</TableCell>
                        <TableCell className={`${numeric} bg-inherit text-slate-900`}>{formatNumber(totals.showSales)}</TableCell>
                        <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatNumber(totals.salesByShowTeam)}</TableCell>
                        <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatNumber(totals.salesByNetwork)}</TableCell>
                        {optionalVisible('salesOffice') && <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatNumber(totals.salesOffice)}</TableCell>}
                        <TableCell className="bg-inherit" />
                        <TableCell className={`${numeric} bg-inherit text-slate-900`}>{formatCurrency(totals.totalContractValue)}</TableCell>
                        {optionalVisible('clawBack') && <TableCell className={`${numeric} bg-inherit text-slate-700`}>{formatCurrency(totals.clawBack)}</TableCell>}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
