import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, RefreshCw, Save, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { dbGet, dbUpdate } from '@/lib/firebase';

type ShowRecord = {
  id: string;
  name?: string;
  dealership?: string;
};

type BudgetFields = {
  showId: string;
  durationDays: number;
  standCosts: number;
  dealerDayRates: number;
  dealerCommission: number;
  dealerCostsTransport: number;
  totalDealerCost: number;
  factoryCommission: number;
  factoryTravelCosts: number;
  totalFactoryCosts: number;
  lastUpdated?: string;
};

type BudgetRow = BudgetFields & {
  showName: string;
  dealership: string;
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

const computeDealerTotal = (row: Pick<BudgetFields, 'standCosts' | 'dealerDayRates' | 'dealerCommission' | 'dealerCostsTransport'>) =>
  parseNumber(row.standCosts) +
  parseNumber(row.dealerDayRates) +
  parseNumber(row.dealerCommission) +
  parseNumber(row.dealerCostsTransport);

const computeFactoryTotal = (row: Pick<BudgetFields, 'factoryCommission' | 'factoryTravelCosts'>) =>
  parseNumber(row.factoryCommission) + parseNumber(row.factoryTravelCosts);

const normaliseBudget = (value: unknown, fallbackShowId?: string): BudgetFields | null => {
  if (!value || typeof value !== 'object') {
    if (!fallbackShowId) return null;
    return {
      showId: fallbackShowId,
      durationDays: 0,
      standCosts: 0,
      dealerDayRates: 0,
      dealerCommission: 0,
      dealerCostsTransport: 0,
      totalDealerCost: 0,
      factoryCommission: 0,
      factoryTravelCosts: 0,
      totalFactoryCosts: 0,
    };
  }
  const raw = value as Record<string, unknown>;
  const showId = typeof raw.showId === 'string' && raw.showId.trim() ? raw.showId.trim() : fallbackShowId || '';
  if (!showId) return null;

  const standCosts = parseNumber(raw.standCosts ?? raw.standcosts);
  const dealerDayRates = parseNumber(raw.dealerDayRates ?? raw.dealerDayRate);
  const dealerCommission = parseNumber(raw.dealerCommission ?? raw.dealerComission ?? raw.dealerCommissions);
  const dealerCostsTransport = parseNumber(raw.dealerCostsTransport ?? raw.dealerTransport);
  const factoryCommission = parseNumber(raw.factoryCommission ?? raw.factoryCommissions);
  const factoryTravelCosts = parseNumber(raw.factoryTravelCosts ?? raw.factoryTravelCost);
  const durationDays = parseNumber(raw.durationDays ?? raw.duration ?? raw.days);
  const lastUpdated = typeof raw.lastUpdated === 'string' ? raw.lastUpdated : undefined;

  const totalDealerCost =
    parseNumber(raw.totalDealerCost) ||
    computeDealerTotal({ standCosts, dealerDayRates, dealerCommission, dealerCostsTransport });
  const totalFactoryCosts =
    parseNumber(raw.totalFactoryCosts ?? raw.totalFactoryCost) ||
    computeFactoryTotal({ factoryCommission, factoryTravelCosts });

  return {
    showId,
    durationDays,
    standCosts,
    dealerDayRates,
    dealerCommission,
    dealerCostsTransport,
    totalDealerCost,
    factoryCommission,
    factoryTravelCosts,
    totalFactoryCosts,
    lastUpdated,
  };
};

const loadXlsxModule = async () => {
  try {
    const mod = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    return mod;
  } catch (err) {
    console.error('Failed to load xlsx parser from CDN', err);
    return null;
  }
};

const parseSpreadsheetRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const buffer = await file.arrayBuffer();
  const xlsx = await loadXlsxModule();

  if (xlsx) {
    const workbook = xlsx.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      return (xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]) ?? [];
    }
  }

  const text = new TextDecoder().decode(buffer);
  const [headerRow, ...dataRows] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!headerRow) return [];

  const headers = headerRow.split(',').map((cell) => cell.trim());
  return dataRows.map((row) => {
    const values = row.split(',').map((cell) => cell.trim());
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return record;
  });
};

export default function BudgetSetting() {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [budgetSnapshot, setBudgetSnapshot] = useState<Record<string, Record<string, unknown>>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, budgetsData] = await Promise.all([dbGet('shows'), dbGet('showBudgets')]);
        const showList: ShowRecord[] = showsData
          ? (Object.entries(showsData) as Array<[string, ShowRecord]>).map(([key, value]) => ({
              ...value,
              id: value.id || key,
            }))
          : [];

        const budgetEntries = budgetsData
          ? (Object.entries(budgetsData) as Array<[string, Record<string, unknown>]>).reduce(
              (acc, [key, value]) => {
                const entry = normaliseBudget(value, key);
                if (entry) {
                  acc[entry.showId] = { ...(value || {}), ...entry } as Record<string, unknown>;
                }
                return acc;
              },
              {} as Record<string, Record<string, unknown>>
            )
          : {};

        setBudgetSnapshot(budgetEntries);

        const rowsMapped: BudgetRow[] = showList.map((show) => {
          const budget = normaliseBudget(budgetEntries[show.id], show.id);
          const base: BudgetFields =
            budget || {
              showId: show.id,
              durationDays: 0,
              standCosts: 0,
              dealerDayRates: 0,
              dealerCommission: 0,
              dealerCostsTransport: 0,
              totalDealerCost: 0,
              factoryCommission: 0,
              factoryTravelCosts: 0,
              totalFactoryCosts: 0,
            };
          return {
            ...base,
            totalDealerCost: computeDealerTotal(base),
            totalFactoryCosts: computeFactoryTotal(base),
            showName: show.name || show.id,
            dealership: show.dealership || '—',
          };
        });

        setRows(rowsMapped);
      } catch (error) {
        console.error('Failed to load budget settings', error);
        toast.error('Unable to load Budget setting dataset.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => `${row.showName} ${row.dealership}`.toLowerCase().includes(term));
  }, [rows, searchTerm]);

  const summary = useMemo(
    () =>
      filteredRows.reduce(
        (acc, row) => {
          acc.shows += 1;
          acc.dealerCost += row.totalDealerCost;
          acc.factoryCost += row.totalFactoryCosts;
          return acc;
        },
        { shows: 0, dealerCost: 0, factoryCost: 0 }
      ),
    [filteredRows]
  );

  const handleFieldChange = (showId: string, key: keyof BudgetFields, value: number) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.showId !== showId) return row;
        const next = { ...row, [key]: value } as BudgetRow;
        return {
          ...next,
          totalDealerCost: computeDealerTotal(next),
          totalFactoryCosts: computeFactoryTotal(next),
        };
      })
    );
  };

  const persistRow = async (row: BudgetRow) => {
    const lastUpdated = new Date().toISOString();
    const payload: BudgetFields = {
      showId: row.showId,
      durationDays: row.durationDays,
      standCosts: row.standCosts,
      dealerDayRates: row.dealerDayRates,
      dealerCommission: row.dealerCommission,
      dealerCostsTransport: row.dealerCostsTransport,
      totalDealerCost: row.totalDealerCost,
      factoryCommission: row.factoryCommission,
      factoryTravelCosts: row.factoryTravelCosts,
      totalFactoryCosts: row.totalFactoryCosts,
      lastUpdated,
    };

    try {
      setSavingId(row.showId);
      await dbUpdate(`showBudgets/${row.showId}`, payload as unknown as Record<string, unknown>);
      setBudgetSnapshot((prev) => ({
        ...prev,
        [row.showId]: { ...(prev[row.showId] ?? {}), ...payload },
      }));
      setRows((prev) => prev.map((r) => (r.showId === row.showId ? { ...r, lastUpdated } : r)));
      toast.success(`${row.showName} budget updated.`);
    } catch (error) {
      console.error('Failed to save budget row', error);
      toast.error('Failed to save this budget entry.');
    } finally {
      setSavingId(null);
    }
  };

  const stringifyCell = (value: unknown) => {
    const text = String(value ?? '');
    return text.includes(',') || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Show ID',
      'Show Name',
      'Dealership',
      'Duration Days',
      'Stand Costs',
      'Dealer Day Rates',
      'Dealer Commission',
      'Dealer Costs Transport',
      'Total Dealer Cost',
      'Factory Commission',
      'Factory Travel Costs',
      'Total Factory Costs',
      'Last Updated',
    ];

    const csvRows = [headers.join(',')];
    filteredRows.forEach((row) => {
      const values = [
        row.showId,
        row.showName,
        row.dealership,
        row.durationDays,
        row.standCosts,
        row.dealerDayRates,
        row.dealerCommission,
        row.dealerCostsTransport,
        row.totalDealerCost,
        row.factoryCommission,
        row.factoryTravelCosts,
        row.totalFactoryCosts,
        row.lastUpdated || '',
      ].map(stringifyCell);
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'budget-setting-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (file: File) => {
    setImporting(true);
    try {
      const records = await parseSpreadsheetRows(file);
      const updates: Record<string, BudgetFields> = {};

      records.forEach((record) => {
        const showId =
          typeof record['Show ID'] === 'string' && record['Show ID'].trim()
            ? record['Show ID'].trim()
            : typeof record.showId === 'string'
              ? record.showId.trim()
              : '';
        if (!showId) return;
        const durationDays = parseNumber(record['Duration Days'] ?? record.durationDays);
        const standCosts = parseNumber(record['Stand Costs'] ?? record.standCosts);
        const dealerDayRates = parseNumber(record['Dealer Day Rates'] ?? record.dealerDayRates);
        const dealerCommission = parseNumber(record['Dealer Commission'] ?? record.dealerCommission);
        const dealerCostsTransport = parseNumber(record['Dealer Costs Transport'] ?? record.dealerCostsTransport);
        const factoryCommission = parseNumber(record['Factory Commission'] ?? record.factoryCommission);
        const factoryTravelCosts = parseNumber(record['Factory Travel Costs'] ?? record.factoryTravelCosts);

        const draft: BudgetFields = {
          showId,
          durationDays,
          standCosts,
          dealerDayRates,
          dealerCommission,
          dealerCostsTransport,
          totalDealerCost: computeDealerTotal({
            standCosts,
            dealerDayRates,
            dealerCommission,
            dealerCostsTransport,
          }),
          factoryCommission,
          factoryTravelCosts,
          totalFactoryCosts: computeFactoryTotal({
            factoryCommission,
            factoryTravelCosts,
          }),
          lastUpdated: new Date().toISOString(),
        };

        updates[showId] = draft;
      });

      if (Object.keys(updates).length === 0) {
        toast.error('No valid rows found in the uploaded file.');
        return;
      }

      const payload = Object.entries(updates).reduce((acc, [showId, values]) => {
        acc[showId] = { ...(budgetSnapshot[showId] ?? {}), ...values };
        return acc;
      }, {} as Record<string, Record<string, unknown>>);

      await dbUpdate('showBudgets', payload as unknown as Record<string, unknown>);

      setBudgetSnapshot((prev) => ({ ...prev, ...payload }));
      setRows((prev) =>
        prev.map((row) => {
          const next = updates[row.showId];
          return next
            ? {
                ...row,
                ...next,
              }
            : row;
        })
      );
      toast.success('Budget entries synced from upload.');
    } catch (error) {
      console.error('Failed to import budget template', error);
      toast.error('Failed to import template. Please verify the column names.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-700">Admin only</p>
          <h1 className="text-2xl font-bold text-slate-900">Budget setting</h1>
          <p className="text-sm text-slate-600">
            Manage showBudgets fields for dealer and factory costs. Edit inline, upload a template, or download current
            data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search show or dealership"
            className="h-9 w-64"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <Button variant="outline" size="icon" onClick={() => window.location.reload()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription>Shows in scope</CardDescription>
            <CardTitle className="text-2xl">{summary.shows}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription>Total Dealer Cost</CardDescription>
            <CardTitle className="text-2xl text-emerald-700">{summary.dealerCost.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription>TOTAL Factory Costs</CardDescription>
            <CardTitle className="text-2xl text-blue-700">{summary.factoryCost.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>Budget grid</CardTitle>
            <CardDescription>Inline edit totals, or import/export via spreadsheet.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download template
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {importing ? 'Uploading...' : 'Upload template'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading budgets...
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50 text-[11px] uppercase text-slate-700">
                  <TableHead className="min-w-[180px]">Show Name</TableHead>
                  <TableHead className="min-w-[140px]">Dealership</TableHead>
                  <TableHead className="min-w-[80px]">Duration Days</TableHead>
                  <TableHead className="min-w-[110px]">Stand Costs</TableHead>
                  <TableHead className="min-w-[130px]">Dealer Day Rates</TableHead>
                  <TableHead className="min-w-[130px]">Dealer Commission</TableHead>
                  <TableHead className="min-w-[150px]">Dealer Costs Transport</TableHead>
                  <TableHead className="min-w-[130px] text-emerald-700">Total Dealer Cost</TableHead>
                  <TableHead className="min-w-[130px]">Factory Commission</TableHead>
                  <TableHead className="min-w-[150px]">Factory Travel Costs</TableHead>
                  <TableHead className="min-w-[140px] text-blue-700">TOTAL Factory Costs</TableHead>
                  <TableHead className="min-w-[120px]">Last Updated</TableHead>
                  <TableHead className="min-w-[110px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-6 text-center text-sm text-slate-500">
                      No rows found. Add a show or import a template to begin.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.showId} className="align-middle">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{row.showName}</span>
                          <span className="text-[11px] text-slate-500">ID: {row.showId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">{row.dealership}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.durationDays ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'durationDays', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.standCosts ?? 0}
                          onChange={(event) => handleFieldChange(row.showId, 'standCosts', parseNumber(event.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.dealerDayRates ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'dealerDayRates', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.dealerCommission ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'dealerCommission', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.dealerCostsTransport ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'dealerCostsTransport', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-700">{row.totalDealerCost.toLocaleString()}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.factoryCommission ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'factoryCommission', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-8"
                          value={row.factoryTravelCosts ?? 0}
                          onChange={(event) =>
                            handleFieldChange(row.showId, 'factoryTravelCosts', parseNumber(event.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-blue-700">{row.totalFactoryCosts.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.lastUpdated ? (
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {new Date(row.lastUpdated).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-slate-500">Not saved yet</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => persistRow(row)} disabled={savingId === row.showId}>
                          {savingId === row.showId ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          {savingId === row.showId ? 'Saving...' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
