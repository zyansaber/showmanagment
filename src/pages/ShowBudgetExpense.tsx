import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { dbGet } from '@/lib/firebase';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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
};

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : '0';

const formatCurrency = (value: number) => {
  const numeric = Number.isFinite(value) ? value : 0;
  return `$${numeric.toLocaleString('en-AU', { minimumFractionDigits: 0 })}`;
};

const formatPercent = (num: number) => {
  if (!Number.isFinite(num)) return '0%';
  return `${num.toFixed(1)}%`;
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

type FinanceLine = {
  aufnrNorm: string;
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

    Object.values(glBuckets as Record<string, unknown>).forEach((glValue) => {
      if (!glValue || typeof glValue !== 'object') return;
      const glBucket = glValue as Record<string, unknown>;
      if (!glBucket.lines || typeof glBucket.lines !== 'object') return;

      Object.values(glBucket.lines as Record<string, unknown>).forEach((rawLine) => {
        if (!rawLine || typeof rawLine !== 'object') return;
        const line = rawLine as Record<string, unknown>;
        lines.push({
          aufnrNorm,
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
  if (show.name === SPECIAL_SHOW_NAME) return true;
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

const classifyTiming = (show: Show) => {
  const today = new Date();
  const start = show.startDate ? new Date(show.startDate) : null;
  const end = show.finishDate ? new Date(show.finishDate) : null;
  if (start && !Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
    if (start <= today && end >= today) return 'current';
    if (start > today) return 'next';
  }
  if (start && !Number.isNaN(start.getTime()) && start > today) return 'next';
  return 'past';
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

export default function ShowBudgetExpense() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, budgetsData, ordersData, financeData, internalOrdersData, teamData] = await Promise.all([
          dbGet('shows'),
          dbGet('showBudgets'),
          dbGet('showOrders'),
          dbGet('finance/glByAufnrGl'),
          dbGet('finance/internalSalesOrders'),
          dbGet('teamMembers'),
        ]);
        const showList: Show[] = showsData ? Object.values(showsData) : [];
        const budgetMap = budgetsData ?? {};
        const orders: ShowOrder[] = ordersData ? Object.values(ordersData) : [];
        const teamMembers: TeamMember[] = teamData ? Object.values(teamData) : [];
        const financeLines = parseFinanceLines(financeData);
        const showsById = showList.reduce<Record<string, Show>>((acc, show) => {
          if (show.id) acc[show.id] = show;
          return acc;
        }, {});
        const aufnrShowMap = buildAufnrShowMap(internalOrdersData, showsById);

        const roleLookup = teamMembers.reduce<Record<string, string>>((acc, member) => {
          const name = member.memberName?.trim();
          const id = member.memberId?.trim();
          if (name) acc[name] = member.role || '';
          if (id) acc[id] = member.role || '';
          return acc;
        }, {});

        const salesCounts = orders.reduce<
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

        const actualsByShow = financeLines.reduce<Record<string, { dealer: number; factory: number }>>((acc, line) => {
          if (getYearFromDate(line.postingDate) !== 2025) return acc;
          const mappedShow = aufnrShowMap[line.aufnrNorm];
          if (!mappedShow?.showId) return acc;
          if (!acc[mappedShow.showId]) acc[mappedShow.showId] = { dealer: 0, factory: 0 };
          if (line.companyCode === '3120') acc[mappedShow.showId].dealer += line.amount;
          else if (line.companyCode === '3110') acc[mappedShow.showId].factory += line.amount;
          return acc;
        }, {});

        const mapped: BudgetRow[] = showList.filter(isRelevantShow).sort(compareShows).map((show) => {
          const budget = (budgetMap?.[show.id] ?? {}) as Record<string, unknown>;
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
          const actual = dealerActual + factoryActual;
          const chargeBack = parseNumber(budget.chargeBack);
          const diff = Number.isFinite(actual - totalBudget) ? actual - totalBudget : 0;
          const sales = salesCounts[show.id] || { total: 0, showTeam: 0, network: 0, office: 0 };
          const year = getShowYear(show);
          return {
            showId: show.id,
            showName: show.name,
            dealership: show.dealership || '',
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
            contractNumber: String(budget.contractNumber ?? ''),
            totalContractValue: Number(budget.totalContractValue ?? 0),
            clawBack: Number(budget.clawBack ?? 0),
          };
        });

        setRows(mapped);
        toast.success('Budget dataset refreshed');
      } catch (err) {
        console.error('Unable to load budget data', err);
        toast.error('Failed to load budget data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.showName} ${row.dealership}`.toLowerCase().includes(term));
  }, [rows, search]);

  const aggregates = useMemo(() => {
    const sum = <K extends keyof BudgetRow>(key: K) => filteredRows.reduce((acc, row) => acc + (row[key] || 0), 0);
    const totalActual = sum('actual');
    const totalBudget = sum('totalBudget');
    const dealerActual = sum('dealerActual');
    const dealerBudget = sum('dealerBudget');
    const factoryActual = sum('factoryActual');
    const factoryBudget = sum('factoryBudget');
    const totalSales = sum('showSales');
    const totalContractValue = sum('totalContractValue');

    const pct = (actual: number, budget: number) => {
      if (budget <= 0) return 0;
      return ((actual - budget) / budget) * 100;
    };

    return {
      totalActual,
      totalBudget,
      dealerActual,
      dealerBudget,
      factoryActual,
      factoryBudget,
      totalSales,
      totalContractValue,
      pctTotal: pct(totalActual, totalBudget),
      pctDealer: pct(dealerActual, dealerBudget),
      pctFactory: pct(factoryActual, factoryBudget),
    };
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Show Budget & Expense</CardTitle>
            <p className="text-sm text-slate-600">Compact finance-style summary across budget, actuals, and sales.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search show or dealership..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-64"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setSearch('');
                window.location.reload();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading budget data...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-5">
                <Card className="border-slate-200">
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Actual Cost</p>
                    <p className="text-xl font-semibold text-slate-900">{formatCurrency(aggregates.totalActual)}</p>
                    <p className="text-xs text-slate-600">
                      Budget {formatCurrency(aggregates.totalBudget)} · {formatPercent(aggregates.pctTotal)} vs budget
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Dealer Actual</p>
                    <p className="text-xl font-semibold text-blue-700">{formatCurrency(aggregates.dealerActual)}</p>
                    <p className="text-xs text-slate-600">
                      Budget {formatCurrency(aggregates.dealerBudget)} · {formatPercent(aggregates.pctDealer)} vs budget
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Factory Actual</p>
                    <p className="text-xl font-semibold text-emerald-700">{formatCurrency(aggregates.factoryActual)}</p>
                    <p className="text-xs text-slate-600">
                      Budget {formatCurrency(aggregates.factoryBudget)} · {formatPercent(aggregates.pctFactory)} vs budget
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Sales 2026</p>
                    <p className="text-xl font-semibold text-slate-900">{formatNumber(aggregates.totalSales)}</p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Total Contract Value</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {formatCurrency(aggregates.totalContractValue)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-sm">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead rowSpan={2} className="min-w-[160px] align-middle">
                        Show Name
                      </TableHead>
                      <TableHead rowSpan={2} className="min-w-[120px] align-middle">
                        Dealership
                      </TableHead>
                      <TableHead colSpan={3} className="text-center border-r-2 border-slate-300">
                        Budget
                      </TableHead>
                      <TableHead colSpan={5} className="text-center bg-slate-100/60 border-r border-slate-200">
                        Actual
                      </TableHead>
                      <TableHead colSpan={8} className="text-center bg-slate-50">
                        Sales Details
                      </TableHead>
                    </TableRow>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right">Total Budget</TableHead>
                      <TableHead className="text-right">Dealer Budget</TableHead>
                      <TableHead className="border-r-2 border-slate-300 text-right">Factory Budget</TableHead>
                      <TableHead className="bg-slate-100/60 text-blue-800 text-right">Actual</TableHead>
                      <TableHead className="bg-slate-100/60 text-right">Dealer Actual</TableHead>
                      <TableHead className="bg-slate-100/60 text-right">Factory Actual</TableHead>
                      <TableHead className="bg-slate-100/60 text-right">Charge Back</TableHead>
                      <TableHead className="bg-slate-100/60 border-r border-slate-200 text-right">Diff</TableHead>
                      <TableHead>Show Target</TableHead>
                      <TableHead>Show Sales</TableHead>
                      <TableHead>Sales by show team</TableHead>
                      <TableHead>Sales by network</TableHead>
                      <TableHead>Sales Office</TableHead>
                      <TableHead>Contract Number</TableHead>
                      <TableHead className="text-right">Total contract value</TableHead>
                      <TableHead className="text-right">Claw Back</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={18} className="text-center text-sm text-slate-500">
                          No data yet. Connect your data source to populate this table.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRows.map((row, idx) => (
                        <TableRow key={row.showId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <TableCell className="font-medium text-slate-900">{row.showName}</TableCell>
                          <TableCell>{row.dealership || '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(row.totalBudget)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.dealerBudget)}</TableCell>
                          <TableCell className="border-r-2 border-slate-300 text-right">{formatCurrency(row.factoryBudget)}</TableCell>
                          <TableCell className="text-right text-blue-700 bg-slate-100/30">{formatCurrency(row.actual)}</TableCell>
                          <TableCell className="text-right bg-slate-100/30">{formatCurrency(row.dealerActual)}</TableCell>
                          <TableCell className="text-right bg-slate-100/30">{formatCurrency(row.factoryActual)}</TableCell>
                          <TableCell className="text-right bg-slate-100/30">{formatCurrency(row.chargeBack)}</TableCell>
                          <TableCell
                            className={`text-right bg-slate-100/30 border-r border-slate-200 ${
                              row.diff < 0 ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatCurrency(row.diff)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal">
                              {formatNumber(row.showTarget)}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatNumber(row.showSales)}</TableCell>
                          <TableCell>{formatNumber(row.salesByShowTeam)}</TableCell>
                          <TableCell>{formatNumber(row.salesByNetwork)}</TableCell>
                          <TableCell>{formatNumber(row.salesOffice)}</TableCell>
                          <TableCell>{row.contractNumber || '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.totalContractValue)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.clawBack)}</TableCell>
                        </TableRow>
                      ))
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
