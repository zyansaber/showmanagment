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
  parseNumber(draft.standCosts) +
  parseNumber(draft.dealerDayRates) +
  parseNumber(draft.dealerCommission) +
  parseNumber(draft.dealerCostsTransport);

const computeFactoryTotal = (draft: Record<string, unknown>) =>
  parseNumber(draft.factoryCommission) + parseNumber(draft.factoryTravelCosts);

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : '0';

export default function ShowBudgetExpense() {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, budgetsData] = await Promise.all([dbGet('shows'), dbGet('showBudgets')]);
        const showList: Show[] = showsData ? Object.values(showsData) : [];
        const budgetMap = budgetsData ?? {};

        const mapped: BudgetRow[] = showList.map((show) => {
          const budget = (budgetMap?.[show.id] ?? {}) as Record<string, unknown>;
          const dealerBudget =
            parseNumber(budget.totalDealerCost) || parseNumber(budget.dealerBudget) || computeDealerTotal(budget);
          const factoryBudget =
            parseNumber(budget.totalFactoryCosts ?? budget.totalFactoryCost) ||
            parseNumber(budget.factoryBudget) ||
            computeFactoryTotal(budget);
          const totalBudget = dealerBudget + factoryBudget;
          const actual = parseNumber(budget.actual);
          const dealerActual = parseNumber(budget.dealerActual);
          const factoryActual = parseNumber(budget.factoryActual);
          const chargeBack = parseNumber(budget.chargeBack);
          const diff = Number.isFinite(actual - totalBudget) ? actual - totalBudget : 0;
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
            showTarget: Number(budget.salesTarget ?? show.target2025 ?? 0),
            showSales: Number(budget.sales ?? show.sales2025 ?? 0),
            salesByShowTeam: Number(budget.salesByShowTeam ?? 0),
            salesByNetwork: Number(budget.salesByNetwork ?? 0),
            salesOffice: Number(budget.salesOffice ?? 0),
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
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-slate-500">Total Budget</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {formatNumber(filteredRows.reduce((sum, row) => sum + row.totalBudget, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-slate-500">Total Actual</p>
                    <p className="text-xl font-semibold text-blue-700">
                      {formatNumber(filteredRows.reduce((sum, row) => sum + row.actual, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-slate-500">Total Diff</p>
                    <p className="text-xl font-semibold text-emerald-700">
                      {formatNumber(filteredRows.reduce((sum, row) => sum + row.diff, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-slate-500">Total Show Sales</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {formatNumber(filteredRows.reduce((sum, row) => sum + row.showSales, 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-300 shadow-sm">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead rowSpan={2} className="min-w-[140px] align-middle">
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
                      <TableHead>Total Budget</TableHead>
                      <TableHead>Dealer Budget</TableHead>
                      <TableHead className="border-r-2 border-slate-300">Factory Budget</TableHead>
                      <TableHead className="bg-slate-100/60 text-blue-800">Actual</TableHead>
                      <TableHead className="bg-slate-100/60">Dealer Actual</TableHead>
                      <TableHead className="bg-slate-100/60">Factory Actual</TableHead>
                      <TableHead className="bg-slate-100/60">Charge Back</TableHead>
                      <TableHead className="bg-slate-100/60 border-r border-slate-200">Diff</TableHead>
                      <TableHead>Show Target</TableHead>
                      <TableHead>Show Sales</TableHead>
                      <TableHead>Sales by show team</TableHead>
                      <TableHead>Sales by network</TableHead>
                      <TableHead>Sales Office</TableHead>
                      <TableHead>Contract Number</TableHead>
                      <TableHead>Total contract value</TableHead>
                      <TableHead>Claw Back</TableHead>
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
                      filteredRows.map((row) => (
                        <TableRow key={row.showId} className="hover:bg-slate-50/80">
                          <TableCell className="font-medium text-slate-900">{row.showName}</TableCell>
                          <TableCell>{row.dealership || '-'}</TableCell>
                          <TableCell className="font-semibold text-slate-900">{formatNumber(row.totalBudget)}</TableCell>
                          <TableCell>{formatNumber(row.dealerBudget)}</TableCell>
                          <TableCell className="border-r-2 border-slate-300">{formatNumber(row.factoryBudget)}</TableCell>
                          <TableCell className="text-blue-700 bg-slate-100/30">{formatNumber(row.actual)}</TableCell>
                          <TableCell className="bg-slate-100/30">{formatNumber(row.dealerActual)}</TableCell>
                          <TableCell className="bg-slate-100/30">{formatNumber(row.factoryActual)}</TableCell>
                          <TableCell className="bg-slate-100/30">{formatNumber(row.chargeBack)}</TableCell>
                          <TableCell
                            className={`bg-slate-100/30 border-r border-slate-200 ${
                              row.diff < 0 ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatNumber(row.diff)}
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
                          <TableCell>{formatNumber(row.totalContractValue)}</TableCell>
                          <TableCell>{formatNumber(row.clawBack)}</TableCell>
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
