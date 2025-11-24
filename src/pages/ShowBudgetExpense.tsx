import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { dbGet, dbSet } from '@/lib/firebase';
import type { BudgetExpenseItem, ExpenseCategory, Show, ShowBudgetProfile } from '@/types';
import { Check, Loader2, Plus, Save, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const formatCurrency = (value: number) =>
  value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });

const formatUnits = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} units`;

const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
};

const calculateDurationDays = (show: Show | null): number => {
  if (!show) return 0;
  if (show.showDuration && show.showDuration > 0) return show.showDuration;
  if (!show.startDate || !show.finishDate) return 0;

  const start = new Date(show.startDate);
  const end = new Date(show.finishDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
};

const normaliseExpense = (expense: Partial<BudgetExpenseItem> | undefined): BudgetExpenseItem => {
  const safe = expense ?? {};
  const idCandidate =
    typeof safe.id === 'string' && safe.id.trim().length > 0
      ? safe.id.trim()
      : crypto.randomUUID ? crypto.randomUUID() : `expense-${Date.now()}`;

  const description =
    typeof safe.description === 'string' && safe.description.trim().length > 0
      ? safe.description.trim()
      : 'Unspecified';

  const category: ExpenseCategory =
    safe.category === 'Dealer Operations' ||
    safe.category === 'Factory' ||
    safe.category === 'Stand & Venue' ||
    safe.category === 'Other'
      ? safe.category
      : 'Other';

  const date = typeof safe.date === 'string' && safe.date.trim().length > 0 ? safe.date : '';

  const amount = toSafeNumber(safe.amount);
  const notes = typeof safe.notes === 'string' ? safe.notes : undefined;

  return {
    id: idCandidate,
    description,
    category,
    amount,
    date,
    notes,
  };
};

const normaliseBudget = (show: Show, existing?: Partial<ShowBudgetProfile>): ShowBudgetProfile => {
  const durationDays = calculateDurationDays(show);
  const defaultSalesTarget =
    toSafeNumber(existing?.salesTarget) ||
    toSafeNumber(show.target2025) ||
    toSafeNumber(show.target2024) ||
    toSafeNumber(show.target2026);

  const expenses = Array.isArray(existing?.expenses)
    ? existing?.expenses.map((item) => normaliseExpense(item))
    : [];

  return {
    showId: show.id,
    durationDays,
    salesTarget: defaultSalesTarget,
    standCosts: toSafeNumber(existing?.standCosts),
    dealerCostsTransport: toSafeNumber(existing?.dealerCostsTransport),
    factoryTravelCosts: toSafeNumber(existing?.factoryTravelCosts),
    expenses,
    lastUpdated: existing?.lastUpdated,
  };
};

export default function ShowBudgetExpense() {
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [budget, setBudget] = useState<ShowBudgetProfile | null>(null);
  const [existingBudgets, setExistingBudgets] = useState<Record<string, ShowBudgetProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [quickUpload, setQuickUpload] = useState({
    showId: '',
    standCosts: 0,
    dealerCostsTransport: 0,
    factoryTravelCosts: 0,
  });

  const [newExpense, setNewExpense] = useState<Partial<BudgetExpenseItem>>({
    category: 'Dealer Operations',
    description: '',
    amount: 0,
    date: '',
    notes: '',
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, budgetsData] = await Promise.all([dbGet('shows'), dbGet('showBudgets')]);
        setShows(showsData ? Object.values(showsData) : []);
        setExistingBudgets(budgetsData ?? {});
        setError(null);
      } catch (err) {
        console.error('Unable to load budget data', err);
        setError('Failed to load shows and budgets. Please retry shortly.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    const activeShow = shows.find((item) => item.id === selectedShowId);
    if (!activeShow) {
      setBudget(null);
      return;
    }

    const existingBudget = existingBudgets[selectedShowId];
    const normalised = normaliseBudget(activeShow, existingBudget);
    setBudget(normalised);
  }, [existingBudgets, selectedShowId, shows]);

  const dealerDayRates = useMemo(() => (budget ? budget.durationDays * 500 * 6 : 0), [budget]);
  const dealerCommission = useMemo(() => (budget ? budget.salesTarget * 1000 : 0), [budget]);
  const totalDealerCosts = useMemo(
    () =>
      budget
        ? budget.standCosts + dealerDayRates + dealerCommission + budget.dealerCostsTransport
        : 0,
    [budget, dealerCommission, dealerDayRates]
  );

  const factoryCommission = useMemo(() => (budget ? budget.salesTarget * 500 : 0), [budget]);
  const totalFactoryCosts = useMemo(
    () => (budget ? budget.factoryTravelCosts + factoryCommission : 0),
    [budget, factoryCommission]
  );

  const totalBudget = useMemo(
    () => totalDealerCosts + totalFactoryCosts,
    [totalDealerCosts, totalFactoryCosts]
  );

  const expenseSummary = useMemo(() => {
    if (!budget) return { total: 0, byCategory: {} as Record<ExpenseCategory, number> };
    const byCategory: Record<ExpenseCategory, number> = {
      'Dealer Operations': 0,
      Factory: 0,
      'Stand & Venue': 0,
      Other: 0,
    };

    const total = budget.expenses.reduce((sum, entry) => {
      const amount = toSafeNumber(entry.amount);
      byCategory[entry.category] += amount;
      return sum + amount;
    }, 0);

    return { total, byCategory };
  }, [budget]);

  const variance = useMemo(() => totalBudget - expenseSummary.total, [totalBudget, expenseSummary.total]);
  const coverage = useMemo(
    () => (totalBudget > 0 ? Math.min(100, Math.round((expenseSummary.total / totalBudget) * 100)) : 0),
    [expenseSummary.total, totalBudget]
  );

  const actualDealerSpend = useMemo(
    () =>
      (expenseSummary.byCategory?.['Dealer Operations'] ?? 0) +
      (expenseSummary.byCategory?.['Stand & Venue'] ?? 0) +
      (expenseSummary.byCategory?.Other ?? 0),
    [expenseSummary.byCategory]
  );

  const actualFactorySpend = useMemo(
    () => expenseSummary.byCategory?.Factory ?? 0,
    [expenseSummary.byCategory]
  );

  const compactSnapshot = useMemo(
    () =>
      budget
        ? (
            [
              {
                label: 'Dealer Operations',
                budgeted: totalDealerCosts,
                actual: expenseSummary.byCategory?.['Dealer Operations'] ?? 0,
              },
              {
                label: 'Stand & Venue',
                budgeted: budget.standCosts,
                actual: expenseSummary.byCategory?.['Stand & Venue'] ?? 0,
              },
              {
                label: 'Factory',
                budgeted: totalFactoryCosts,
                actual: expenseSummary.byCategory?.Factory ?? 0,
              },
              {
                label: 'Other',
                budgeted: 0,
                actual: expenseSummary.byCategory?.Other ?? 0,
              },
            ] as const
          )
        : [],
    [budget, expenseSummary.byCategory, totalDealerCosts, totalFactoryCosts]
  );

  const handleBudgetChange = (key: keyof ShowBudgetProfile, value: number) => {
    if (!budget) return;
    setBudget({ ...budget, [key]: value });
  };

  const handleAddExpense = () => {
    if (!budget) return;
    const entry = normaliseExpense(newExpense);
    setBudget({ ...budget, expenses: [...budget.expenses, entry] });
    setNewExpense({
      category: newExpense.category || 'Dealer Operations',
      description: '',
      amount: 0,
      date: '',
      notes: '',
    });
  };

  const handleRemoveExpense = (id: string) => {
    if (!budget) return;
    setBudget({ ...budget, expenses: budget.expenses.filter((item) => item.id !== id) });
  };

  const handleSave = async () => {
    if (!budget) return;
    try {
      setSaving(true);
      const payload: ShowBudgetProfile = { ...budget, lastUpdated: new Date().toISOString() };
      await dbSet(`showBudgets/${budget.showId}`, payload as unknown as Record<string, unknown>);
      setExistingBudgets((prev) => ({ ...prev, [budget.showId]: payload }));
      toast.success('Budget and expenses saved to the database.');
    } catch (err) {
      console.error('Failed to save budget', err);
      toast.error('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickUpload = async () => {
    const trimmedShowId = quickUpload.showId.trim();
    if (!trimmedShowId) {
      toast.error('Enter a valid show ID to upload costs.');
      return;
    }

    const baseShow = shows.find((item) => item.id === trimmedShowId) ?? null;
    const defaultSalesTarget =
      toSafeNumber(baseShow?.target2025) ||
      toSafeNumber(baseShow?.target2024) ||
      toSafeNumber(baseShow?.target2026) ||
      0;
    const durationDays = baseShow ? calculateDurationDays(baseShow) : 0;
    const existingBudget = existingBudgets[trimmedShowId];

    const payload: ShowBudgetProfile = {
      showId: trimmedShowId,
      durationDays: durationDays || existingBudget?.durationDays || 0,
      salesTarget: defaultSalesTarget || existingBudget?.salesTarget || 0,
      standCosts: toSafeNumber(quickUpload.standCosts),
      dealerCostsTransport: toSafeNumber(quickUpload.dealerCostsTransport),
      factoryTravelCosts: toSafeNumber(quickUpload.factoryTravelCosts),
      expenses: existingBudget?.expenses ?? [],
      lastUpdated: new Date().toISOString(),
    };

    try {
      setSaving(true);
      await dbSet(`showBudgets/${trimmedShowId}`, payload as unknown as Record<string, unknown>);
      setExistingBudgets((prev) => ({ ...prev, [trimmedShowId]: payload }));
      if (selectedShowId === trimmedShowId) {
        setBudget(payload);
      }
      toast.success('Quick costs uploaded for this show.');
      setQuickUpload({ showId: trimmedShowId, standCosts: 0, dealerCostsTransport: 0, factoryTravelCosts: 0 });
    } catch (err) {
      console.error('Failed to upload quick costs', err);
      toast.error('Upload failed. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const selectedShow = useMemo(
    () => shows.find((item) => item.id === selectedShowId) ?? null,
    [selectedShowId, shows]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Show Budget &amp; Expense</h1>
          <p className="text-slate-600">
            Professional-grade budget and expense statement with built-in formulas, real expense capture, and live variances.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!budget || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save budget to database
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Select show</CardTitle>
          <CardDescription>Pick a show to manage its budget and expenses; duration and sales target will auto-fill.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={isPickerOpen}
                className="w-full justify-between lg:w-96"
              >
                {selectedShow ? selectedShow.name : 'Choose a show'}
                <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search show..." />
                <CommandList>
                  <CommandEmpty>No matching shows found</CommandEmpty>
                  <CommandGroup>
                    {shows.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.name}
                        onSelect={() => {
                          setSelectedShowId(item.id);
                          setIsPickerOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selectedShowId === item.id ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <span className="flex-1">{item.name}</span>
                        <Badge variant="secondary">{item.siteLocation?.state || 'N/A'}</Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedShow && budget && (
            <div className="grid w-full gap-4 rounded-xl bg-slate-50/80 p-4 text-sm text-slate-700 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-slate-500">Duration (days)</p>
                <p className="text-lg font-semibold">{budget.durationDays || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Sales Target (units)</p>
                <p className="text-lg font-semibold">{formatUnits(budget.salesTarget)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Last updated</p>
                <p className="text-lg font-semibold">{budget.lastUpdated ? new Date(budget.lastUpdated).toLocaleString() : 'Not saved'}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Quick cost upload by Show ID</CardTitle>
          <CardDescription>
            Temporary entry pad to push Stand Costs, Dealer Costs + Transport, and Factory Travel Costs directly to the
            database when you only have the show ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="quick-show-id">Show ID</Label>
              <Input
                id="quick-show-id"
                placeholder="Enter show ID"
                value={quickUpload.showId}
                onChange={(e) => setQuickUpload((prev) => ({ ...prev, showId: e.target.value }))}
              />
              <p className="text-xs text-slate-500">Matches the ID used in the shows list.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-stand">Stand Costs</Label>
              <Input
                id="quick-stand"
                type="number"
                value={quickUpload.standCosts}
                onChange={(e) => setQuickUpload((prev) => ({ ...prev, standCosts: toSafeNumber(e.target.value) }))}
                placeholder="e.g., 15000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-dealer">Dealer Costs + Transport</Label>
              <Input
                id="quick-dealer"
                type="number"
                value={quickUpload.dealerCostsTransport}
                onChange={(e) =>
                  setQuickUpload((prev) => ({ ...prev, dealerCostsTransport: toSafeNumber(e.target.value) }))
                }
                placeholder="e.g., 8000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-factory">Factory Travel Costs</Label>
              <Input
                id="quick-factory"
                type="number"
                value={quickUpload.factoryTravelCosts}
                onChange={(e) =>
                  setQuickUpload((prev) => ({ ...prev, factoryTravelCosts: toSafeNumber(e.target.value) }))
                }
                placeholder="e.g., 6000"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-slate-50/80 p-4 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
            <p className="max-w-3xl">
              Saves costs straight to <code>showBudgets</code> with any existing expenses preserved. If the show exists, duration
              and targets will be back-filled automatically next time you load it.
            </p>
            <Button onClick={handleQuickUpload} disabled={saving} className="w-full gap-2 md:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Upload costs
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading data...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {budget && selectedShow && !loading && (
        <>
          <div className="lg:flex lg:justify-end">
            <Card className="w-full shadow-md lg:max-w-xl">
              <CardHeader className="pb-4">
                <CardTitle>Executive Expense Snapshot</CardTitle>
                <CardDescription>
                  Compact financial-summary view showing category totals, overall spend, and budget variance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Total budget</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(totalBudget)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Total expense</p>
                    <p className="text-lg font-semibold text-slate-900">{formatCurrency(expenseSummary.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500">Budget balance</p>
                    <p className={`text-lg font-semibold ${variance >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {formatCurrency(variance)}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="w-1/2">Cost bucket</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {compactSnapshot.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.budgeted)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.actual)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.budgeted - row.actual)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-50/80 font-semibold">
                        <TableCell>Totals</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalBudget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(expenseSummary.total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(variance)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <p className="text-xs text-slate-500">
                  Right-aligned for leadership visibility: a concise, ledger-like rollup mirroring professional financial reports.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Statement of Expenditure Position</CardTitle>
              <CardDescription>
                A financial-report view summarizing budgeted vs. actual spend with variances at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-slate-500">Budgeted total (Dealer + Factory)</p>
                  <p className="text-xl font-semibold text-slate-900">{formatCurrency(totalBudget)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Actual expenditures recorded</p>
                  <p className="text-xl font-semibold text-slate-900">{formatCurrency(expenseSummary.total)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Variance</p>
                  <p className={`text-xl font-semibold ${variance >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {formatCurrency(variance)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70">
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Budget (AUD)</TableHead>
                      <TableHead className="text-right">Actual (AUD)</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Dealer Costs</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalDealerCosts)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(actualDealerSpend)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalDealerCosts - actualDealerSpend)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Factory Costs</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalFactoryCosts)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(actualFactorySpend)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalFactoryCosts - actualFactorySpend)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/70 font-semibold">
                      <TableCell>Totals</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalBudget)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(expenseSummary.total)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(variance)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase text-slate-500">Sales Target (units)</p>
                  <p className="text-lg font-semibold text-slate-900">{formatUnits(budget.salesTarget)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Expense coverage</p>
                  <p className="text-lg font-semibold text-slate-900">{coverage}%</p>
                  <p className="text-xs text-slate-500">Actual spend divided by total budget.</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Last updated</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {budget.lastUpdated ? new Date(budget.lastUpdated).toLocaleString() : 'Not saved'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Dealer Budget Sheet</CardTitle>
              <CardDescription>Auto-calculates Dealer Day Rates and commissions with transparent formulas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <Label>Stand Costs</Label>
                  <Input
                    type="number"
                    value={budget.standCosts}
                    onChange={(e) => handleBudgetChange('standCosts', toSafeNumber(e.target.value))}
                    placeholder="Enter stand costs"
                  />
                  <p className="text-xs text-slate-500">Provided by on-site team; includes venue, build, and fixed costs.</p>
                </div>
                <div className="space-y-3">
                  <Label>Sales Target (adjustable)</Label>
                  <Input
                    type="number"
                    value={budget.salesTarget}
                    onChange={(e) => handleBudgetChange('salesTarget', toSafeNumber(e.target.value))}
                    placeholder="e.g., 120"
                  />
                  <p className="text-xs text-slate-500">Used to calculate Dealer/Factory commissions; defaults to the show target.</p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70">
                      <TableHead>Line Item</TableHead>
                      <TableHead>Formula</TableHead>
                      <TableHead className="text-right">Amount (AUD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Stand Costs</TableCell>
                      <TableCell>Manual input</TableCell>
                      <TableCell className="text-right">{formatCurrency(budget.standCosts)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Dealer Day Rates</TableCell>
                      <TableCell>
                        {budget.durationDays} days × 500 × 6 people
                        <div className="text-xs text-slate-500">Automatically updates with show duration</div>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(dealerDayRates)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Dealer Commission</TableCell>
                      <TableCell>Sales Target × 1000</TableCell>
                      <TableCell className="text-right">{formatCurrency(dealerCommission)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Dealer Costs + Transport</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={budget.dealerCostsTransport}
                          onChange={(e) => handleBudgetChange('dealerCostsTransport', toSafeNumber(e.target.value))}
                          placeholder="Enter transport, lodging, and other variable costs"
                        />
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(budget.dealerCostsTransport)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/70 font-semibold">
                      <TableCell colSpan={2}>TOTAL Dealer Costs</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalDealerCosts)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Factory Budget Sheet</CardTitle>
              <CardDescription>Calculates factory commissions from the sales target and combines travel for a total.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label>Factory Travel Costs</Label>
                <Input
                  type="number"
                  value={budget.factoryTravelCosts}
                  onChange={(e) => handleBudgetChange('factoryTravelCosts', toSafeNumber(e.target.value))}
                  placeholder="Enter airfare, lodging, and other travel budget"
                />
                <p className="text-xs text-slate-500">Travel budget for factory teams, ready for later actual vs. budget comparison.</p>
              </div>

              <div className="mt-6 rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70">
                      <TableHead>Line Item</TableHead>
                      <TableHead>Formula</TableHead>
                      <TableHead className="text-right">Amount (AUD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Factory Commissions</TableCell>
                      <TableCell>Sales Target × 500</TableCell>
                      <TableCell className="text-right">{formatCurrency(factoryCommission)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Factory Travel Costs</TableCell>
                      <TableCell>Manual input</TableCell>
                      <TableCell className="text-right">{formatCurrency(budget.factoryTravelCosts)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/70 font-semibold">
                      <TableCell colSpan={2}>TOTAL Factory Costs</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalFactoryCosts)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Budget vs Actual</CardTitle>
              <CardDescription>Compare budget against actuals to quickly see gaps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-slate-50/60 p-4">
                  <p className="text-xs uppercase text-slate-500">Dealer Total Budget</p>
                  <p className="text-xl font-semibold">{formatCurrency(totalDealerCosts)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50/60 p-4">
                  <p className="text-xs uppercase text-slate-500">Factory Total Budget</p>
                  <p className="text-xl font-semibold">{formatCurrency(totalFactoryCosts)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50/60 p-4">
                  <p className="text-xs uppercase text-slate-500">Actual Expenses</p>
                  <p className={`text-xl font-semibold ${expenseSummary.total > totalBudget ? 'text-red-600' : 'text-emerald-700'}`}>
                    {formatCurrency(expenseSummary.total)}
                  </p>
                </div>
                <div className="rounded-lg border bg-slate-50/60 p-4">
                  <p className="text-xs uppercase text-slate-500">Variance (Budget - Actual)</p>
                  <p className={`text-xl font-semibold ${variance < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                    {formatCurrency(variance)}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70">
                      <TableHead>Expense Category</TableHead>
                      <TableHead>Budget (AUD)</TableHead>
                      <TableHead>Actual (AUD)</TableHead>
                      <TableHead>Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Dealer Related</TableCell>
                      <TableCell>{formatCurrency(totalDealerCosts)}</TableCell>
                      <TableCell>{formatCurrency(expenseSummary.byCategory['Dealer Operations'])}</TableCell>
                      <TableCell>
                        {formatCurrency(totalDealerCosts - expenseSummary.byCategory['Dealer Operations'])}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Factory Related</TableCell>
                      <TableCell>{formatCurrency(totalFactoryCosts)}</TableCell>
                      <TableCell>{formatCurrency(expenseSummary.byCategory.Factory)}</TableCell>
                      <TableCell>{formatCurrency(totalFactoryCosts - expenseSummary.byCategory.Factory)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Stand & Venue</TableCell>
                      <TableCell>{formatCurrency(budget.standCosts)}</TableCell>
                      <TableCell>{formatCurrency(expenseSummary.byCategory['Stand & Venue'])}</TableCell>
                      <TableCell>{formatCurrency(budget.standCosts - expenseSummary.byCategory['Stand & Venue'])}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Other / Unclassified</TableCell>
                      <TableCell>{formatCurrency(0)}</TableCell>
                      <TableCell>{formatCurrency(expenseSummary.byCategory.Other)}</TableCell>
                      <TableCell>{formatCurrency(0 - expenseSummary.byCategory.Other)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50/70 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell>{formatCurrency(totalBudget)}</TableCell>
                      <TableCell>{formatCurrency(expenseSummary.total)}</TableCell>
                      <TableCell>{formatCurrency(variance)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Record Actual Expenses</CardTitle>
              <CardDescription>Capture actuals by category; the system aggregates and compares against budget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="expense-category">Category</Label>
                  <select
                    id="expense-category"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newExpense.category}
                    onChange={(e) =>
                      setNewExpense((prev) => ({ ...prev, category: e.target.value as ExpenseCategory }))
                    }
                  >
                    <option value="Dealer Operations">Dealer Operations</option>
                    <option value="Factory">Factory</option>
                    <option value="Stand & Venue">Stand & Venue</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-desc">Expense description</Label>
                  <Input
                    id="expense-desc"
                    placeholder="e.g., final payment for booth build"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-amount">Amount</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    value={newExpense.amount ?? ''}
                    onChange={(e) => setNewExpense((prev) => ({ ...prev, amount: toSafeNumber(e.target.value) }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expense-date">Date</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={newExpense.date || ''}
                    onChange={(e) => setNewExpense((prev) => ({ ...prev, date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-notes">Notes</Label>
                <Textarea
                  id="expense-notes"
                  placeholder="Additional details, contract number, or approvals"
                  value={newExpense.notes || ''}
                  onChange={(e) => setNewExpense((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <Button
                type="button"
                className="gap-2"
                disabled={!newExpense.description || !newExpense.amount || saving}
                onClick={handleAddExpense}
              >
                <Plus className="h-4 w-4" /> Add expense and update variance
              </Button>

              <Separator />

              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/70">
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {budget.expenses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500">
                          No expenses recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {budget.expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="font-medium">{expense.category}</TableCell>
                        <TableCell>{expense.description}</TableCell>
                        <TableCell>{expense.date || 'Not provided'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveExpense(expense.id)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
