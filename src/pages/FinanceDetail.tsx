import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { dbGet } from '@/lib/firebase';

type SummaryRow = {
  id: string;
  aufnr: string;
  aufnrNorm: string;
  glAccountRaw: string;
  glAccountNorm: string;
  companyCode: string;
  fiscalYear: string;
  vkorg: string;
  currency: string;
  netAmount: number;
  debitAmount: number;
  creditAmount: number;
  absAmount: number;
  lineCount: number;
  updatedAt?: string;
};

type LineRow = {
  id: string;
  aufnrNorm: string;
  glAccountNorm: string;
  companyCode: string;
  fiscalYear: string;
  vkorg: string;
  currency: string;
  postingDate?: string;
  docNo?: string;
  lineNo?: string;
  dcInd?: string;
  amount?: number;
  debitAmount?: number;
  creditAmount?: number;
  absAmount?: number;
  sgtxt?: string;
  costCenter?: string;
  profitCenter?: string;
  reference?: string;
};

type Filters = {
  aufnr: string;
  gl: string;
  company: string;
  fiscalYear: string;
  currency: string;
  vkorg: string;
  search: string;
};

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

const normaliseSummaryRows = (data: unknown): { summaries: SummaryRow[]; lines: LineRow[] } => {
  if (!data || typeof data !== 'object') return { summaries: [], lines: [] };
  const root = data as Record<string, unknown>;
  const summaries: SummaryRow[] = [];
  const lines: LineRow[] = [];

  Object.entries(root).forEach(([aufnrKey, glBuckets]) => {
    if (!glBuckets || typeof glBuckets !== 'object') return;
    const aufnrNorm = leadingZeroSafe(aufnrKey);

    Object.entries(glBuckets as Record<string, unknown>).forEach(([glKey, glValue]) => {
      if (!glValue || typeof glValue !== 'object') return;
      const glAccountNorm = leadingZeroSafe(glKey);
      const glBucket = glValue as Record<string, unknown>;

      if (glBucket.summary && typeof glBucket.summary === 'object') {
        Object.entries(glBucket.summary as Record<string, unknown>).forEach(([dimKey, rawSummary]) => {
          if (!rawSummary || typeof rawSummary !== 'object') return;
          const summary = rawSummary as Record<string, unknown>;
          const id = `${aufnrNorm}-${glAccountNorm}-${dimKey}`;
          summaries.push({
            id,
            aufnr: typeof summary.aufnr === 'string' ? summary.aufnr : '',
            aufnrNorm,
            glAccountRaw: typeof summary.gl_account_raw === 'string' ? summary.gl_account_raw : '',
            glAccountNorm:
              typeof summary.gl_account_norm === 'string'
                ? summary.gl_account_norm
                : typeof summary.gl_norm === 'string'
                  ? summary.gl_norm
                  : glAccountNorm,
            companyCode: typeof summary.company_code === 'string' ? summary.company_code : 'NA',
            fiscalYear:
              typeof summary.fiscal_year === 'number'
                ? summary.fiscal_year.toString()
                : typeof summary.fiscal_year === 'string'
                  ? summary.fiscal_year
                  : 'NA',
            vkorg: typeof summary.vkorg === 'string' ? summary.vkorg : 'NA',
            currency: typeof summary.currency === 'string' ? summary.currency : 'NA',
            netAmount: numberOrZero(summary.net_amount ?? summary.amount),
            debitAmount: numberOrZero(summary.debit_amount),
            creditAmount: numberOrZero(summary.credit_amount),
            absAmount: numberOrZero(summary.abs_amount),
            lineCount: typeof summary.line_cnt === 'number' ? summary.line_cnt : numberOrZero(summary.line_cnt),
            updatedAt: typeof summary.updated_at === 'string' ? summary.updated_at : undefined,
          });
        });
      }

      if (glBucket.lines && typeof glBucket.lines === 'object') {
        Object.entries(glBucket.lines as Record<string, unknown>).forEach(([lineId, rawLine]) => {
          if (!rawLine || typeof rawLine !== 'object') return;
          const line = rawLine as Record<string, unknown>;
          lines.push({
            id: lineId,
            aufnrNorm,
            glAccountNorm,
            companyCode: typeof line.company_code === 'string' ? line.company_code : 'NA',
            fiscalYear:
              typeof line.fiscal_year === 'number'
                ? line.fiscal_year.toString()
                : typeof line.fiscal_year === 'string'
                  ? line.fiscal_year
                  : 'NA',
            vkorg: typeof line.vkorg === 'string' ? line.vkorg : 'NA',
            currency: typeof line.currency === 'string' ? line.currency : 'NA',
            postingDate: typeof line.posting_date === 'string' ? line.posting_date : undefined,
            docNo: typeof line.doc_no === 'string' ? line.doc_no : undefined,
            lineNo: typeof line.line_no === 'string' ? line.line_no : undefined,
            dcInd: typeof line.dc_ind === 'string' ? line.dc_ind : undefined,
            amount: numberOrZero(line.amount),
            debitAmount: numberOrZero(line.debit_amount),
            creditAmount: numberOrZero(line.credit_amount),
            absAmount: numberOrZero(line.abs_amount),
            sgtxt: typeof line.sgtxt === 'string' ? line.sgtxt : undefined,
            costCenter: typeof line.cost_center === 'string' ? line.cost_center : undefined,
            profitCenter: typeof line.profit_center === 'string' ? line.profit_center : undefined,
            reference: typeof line.reference === 'string' ? line.reference : undefined,
          });
        });
      }
    });
  });

  return { summaries, lines };
};

const formatAmount = (value: number, currency?: string) => {
  if (!Number.isFinite(value)) return '—';
  return `${currency ?? ''}${currency ? ' ' : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export default function FinanceDetail() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [filters, setFilters] = useState<Filters>({
    aufnr: '',
    gl: '',
    company: '',
    fiscalYear: '',
    currency: '',
    vkorg: '',
    search: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await dbGet('finance/glByAufnrGl');
      const parsed = normaliseSummaryRows(data);
      setSummaries(parsed.summaries);
      setLines(parsed.lines);
      setError(null);
    } catch (err) {
      console.error('Failed to load finance detail', err);
      setError('Unable to load finance detail data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSummaries = useMemo(
    () =>
      summaries.filter((row) => {
        const matches = (value: string, needle: string) => value.toLowerCase().includes(needle.toLowerCase());
        return (
          (filters.aufnr ? matches(row.aufnrNorm, filters.aufnr) : true) &&
          (filters.gl ? matches(row.glAccountNorm, filters.gl) : true) &&
          (filters.company ? matches(row.companyCode, filters.company) : true) &&
          (filters.fiscalYear ? matches(row.fiscalYear, filters.fiscalYear) : true) &&
          (filters.currency ? matches(row.currency, filters.currency) : true) &&
          (filters.vkorg ? matches(row.vkorg, filters.vkorg) : true)
        );
      }),
    [filters, summaries]
  );

  const filteredLines = useMemo(
    () =>
      lines.filter((row) => {
        const matches = (value: string | undefined, needle: string) =>
          (value ?? '').toLowerCase().includes(needle.toLowerCase());
        return (
          (filters.aufnr ? matches(row.aufnrNorm, filters.aufnr) : true) &&
          (filters.gl ? matches(row.glAccountNorm, filters.gl) : true) &&
          (filters.company ? matches(row.companyCode, filters.company) : true) &&
          (filters.fiscalYear ? matches(row.fiscalYear, filters.fiscalYear) : true) &&
          (filters.currency ? matches(row.currency, filters.currency) : true) &&
          (filters.vkorg ? matches(row.vkorg, filters.vkorg) : true) &&
          (filters.search
            ? matches(row.sgtxt, filters.search) ||
              matches(row.docNo, filters.search) ||
              matches(row.reference, filters.search)
            : true)
        );
      }),
    [filters, lines]
  );

  const summaryTotals = useMemo(() => {
    return filteredSummaries.reduce(
      (acc, row) => {
        acc.net += row.netAmount;
        acc.debit += row.debitAmount;
        acc.credit += row.creditAmount;
        acc.abs += row.absAmount;
        acc.lines += row.lineCount;
        return acc;
      },
      { net: 0, debit: 0, credit: 0, abs: 0, lines: 0 }
    );
  }, [filteredSummaries]);

  const clearFilters = () =>
    setFilters({
      aufnr: '',
      gl: '',
      company: '',
      fiscalYear: '',
      currency: '',
      vkorg: '',
      search: '',
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Finance Detail</p>
          <h1 className="text-2xl font-bold text-slate-900">AUFNR / GL Breakdown</h1>
          <p className="text-sm text-slate-600">
            Explore finance/glByAufnrGl summaries and lines grouped by AUFNR and GL account with quick filters and totals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter by AUFNR, GL, company, fiscal year, currency, VKORG, or text search (lines).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Input
            placeholder="AUFNR (e.g. 500439)"
            value={filters.aufnr}
            onChange={(e) => setFilters((prev) => ({ ...prev, aufnr: e.target.value.trim() }))}
          />
          <Input
            placeholder="GL (e.g. 4000)"
            value={filters.gl}
            onChange={(e) => setFilters((prev) => ({ ...prev, gl: e.target.value.trim() }))}
          />
          <Input
            placeholder="Company Code"
            value={filters.company}
            onChange={(e) => setFilters((prev) => ({ ...prev, company: e.target.value.trim() }))}
          />
          <Input
            placeholder="Fiscal Year"
            value={filters.fiscalYear}
            onChange={(e) => setFilters((prev) => ({ ...prev, fiscalYear: e.target.value.trim() }))}
          />
          <Input
            placeholder="Currency"
            value={filters.currency}
            onChange={(e) => setFilters((prev) => ({ ...prev, currency: e.target.value.trim() }))}
          />
          <Input
            placeholder="VKORG"
            value={filters.vkorg}
            onChange={(e) => setFilters((prev) => ({ ...prev, vkorg: e.target.value.trim() }))}
          />
          <div className="md:col-span-2 lg:col-span-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search text (SGTXT / Doc / Reference)"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Net Amount</CardDescription>
            <CardTitle className="text-2xl text-slate-900">{formatAmount(summaryTotals.net)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Debit</CardDescription>
            <CardTitle className="text-2xl text-slate-900">{formatAmount(summaryTotals.debit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Credit</CardDescription>
            <CardTitle className="text-2xl text-slate-900">{formatAmount(summaryTotals.credit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>Total Lines</CardDescription>
            <CardTitle className="text-2xl text-slate-900">{summaryTotals.lines.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Summary by AUFNR / GL</CardTitle>
            <CardDescription>One row per dimKey under finance/glByAufnrGl/{'{aufnr}'}/{'{gl}'}/summary</CardDescription>
          </div>
          <Badge variant="outline" className="text-slate-700">
            {filteredSummaries.length} record{filteredSummaries.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading summaries…
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[90px]">AUFNR</TableHead>
                  <TableHead className="min-w-[70px]">GL</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>VKORG</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Abs</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="min-w-[140px]">Updated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-sm text-slate-500">
                      No matching summaries.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSummaries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold text-slate-900">{row.aufnrNorm}</TableCell>
                      <TableCell className="font-semibold text-slate-900">{row.glAccountNorm}</TableCell>
                      <TableCell>{row.companyCode}</TableCell>
                      <TableCell>{row.fiscalYear}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell>{row.vkorg}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.netAmount, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.debitAmount, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.creditAmount, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.absAmount, row.currency)}</TableCell>
                      <TableCell className="text-right">{row.lineCount}</TableCell>
                      <TableCell className="text-slate-600">{row.updatedAt ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>finance/glByAufnrGl/{'{aufnr}'}/{'{gl}'}/lines/{'{lineId}'}</CardDescription>
          </div>
          <Badge variant="outline" className="text-slate-700">
            {filteredLines.length} line{filteredLines.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[90px]">AUFNR</TableHead>
                  <TableHead className="min-w-[70px]">GL</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Curr</TableHead>
                  <TableHead>Doc / Line</TableHead>
                  <TableHead>Posting Date</TableHead>
                  <TableHead>DC</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Abs</TableHead>
                  <TableHead>Cost Center</TableHead>
                  <TableHead>Profit Center</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="min-w-[180px]">SGTXT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center text-sm text-slate-500">
                      No matching lines.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLines.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold text-slate-900">{row.aufnrNorm}</TableCell>
                      <TableCell className="font-semibold text-slate-900">{row.glAccountNorm}</TableCell>
                      <TableCell>{row.companyCode}</TableCell>
                      <TableCell>{row.fiscalYear}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{row.docNo ?? '—'}</span>
                          <span className="text-slate-600">{row.lineNo ?? '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.postingDate ?? '—'}</TableCell>
                      <TableCell>{row.dcInd ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.amount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.debitAmount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.creditAmount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatAmount(row.absAmount ?? 0, row.currency)}</TableCell>
                      <TableCell>{row.costCenter ?? '—'}</TableCell>
                      <TableCell>{row.profitCenter ?? '—'}</TableCell>
                      <TableCell>{row.reference ?? '—'}</TableCell>
                      <TableCell className="text-slate-900">{row.sgtxt ?? '—'}</TableCell>
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
