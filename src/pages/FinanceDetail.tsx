import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { dbGet } from '@/lib/firebase';

type SummaryRow = {
  id: string;
  aufnr: string;
  aufnrNorm: string;
  glAccountRaw: string;
  glAccountNorm: string;
  glName: string;
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
  showId?: string;
  showName?: string;
};

type LineRow = {
  id: string;
  aufnrNorm: string;
  glAccountNorm: string;
  glName: string;
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
  sgtxt?: string;
  sfgxt?: string;
  personTokens?: string[];
  costCenter?: string;
  profitCenter?: string;
  reference?: string;
  showId?: string;
  showName?: string;
};

type Filters = {
  showId: string;
  glCode: string;
  company: string;
  fiscalYear: string;
  search: string;
};

type ShowRecord = {
  id: string;
  name?: string;
};

type PersonOption = {
  key: string;
  tokens: string[];
};

type InternalOrder = {
  showId: string;
  internalSalesOrderNumberDealer?: string;
  internalSalesOrderNumber?: string;
};

type ExpenseItem = {
  glCode?: string;
  category?: string;
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

function extractPersonKey(text: string | undefined): PersonOption | null {
  if (!text) return null;
  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  const tokens = words.slice(-2).map((w) => w.toLowerCase());
  if (tokens.length === 0) return null;
  return { key: tokens.join(' '), tokens };
}

const buildMemberTokens = (name: string): string[] => {
  const lower = name.toLowerCase().trim();
  if (!lower) return [];
  const parts = lower
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, '').trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const initials: string[] = [];
  if (firstName) initials.push(firstName[0]);
  if (lastName) initials.push(lastName[0]);

  const tokens = new Set<string>();
  parts.forEach((p) => tokens.add(p));
  tokens.add(parts.join(' ')); // full name
  tokens.add(parts.join('')); // full name without spaces
  initials.forEach((i) => tokens.add(i));
  if (initials.length === 2) {
    tokens.add(initials.join('')); // combined initials
    tokens.add(`${initials[0]} ${initials[1]}`);
  }

  return Array.from(tokens).filter(Boolean);
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
            glName: '',
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
            glName: '',
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
            sgtxt: typeof line.sgtxt === 'string' ? line.sgtxt : undefined,
            sfgxt: typeof (line as Record<string, unknown>).sfgxt === 'string' ? (line as Record<string, unknown>).sfgxt : undefined,
            costCenter: typeof line.cost_center === 'string' ? line.cost_center : undefined,
            profitCenter: typeof line.profit_center === 'string' ? line.profit_center : undefined,
            reference: typeof line.reference === 'string' ? line.reference : undefined,
            personTokens: extractPersonKey(line.sgtxt)?.tokens,
          });
        });
      }
    });
  });

  return { summaries, lines };
};

const ALL_SHOWS = 'all';
const ALL_YEARS = 'all-years';
const ALL_MEMBERS = 'all-members';

const formatAmount = (value: number, currency?: string) => {
  if (!Number.isFinite(value)) return '—';
  return `${currency ?? ''}${currency ? ' ' : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatAmountStyled = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  if (value < 0) {
    return <span className="text-red-600 font-semibold">({formatted})</span>;
  }
  if (value > 0) {
    return <span className="text-emerald-600 font-semibold">{formatted}</span>;
  }
  return <span className="text-slate-700">{formatted}</span>;
};

const formatAmountExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  if (value > 0) return <span className="text-red-600 font-semibold">({formatted})</span>;
  if (value < 0) return <span className="text-emerald-600 font-semibold">{formatted}</span>;
  return <span className="text-slate-700">{formatted}</span>;
};

const formatDebitExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  return <span className="text-red-600 font-semibold">({formatted})</span>;
};

const formatCreditExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  return <span className="text-emerald-600 font-semibold">{formatted}</span>;
};

export default function FinanceDetail() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [filters, setFilters] = useState<Filters>({
    showId: ALL_SHOWS,
    glCode: '',
    company: '',
    fiscalYear: ALL_YEARS,
    search: '',
  });
  const [showLookup, setShowLookup] = useState<Record<string, ShowRecord>>({});
  const [aufnrToShow, setAufnrToShow] = useState<Record<string, { showId: string; showName?: string }>>({});
  const [glNameLookup, setGlNameLookup] = useState<Record<string, string>>({});
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [members, setMembers] = useState<PersonOption[]>([]);
  const [memberFilter, setMemberFilter] = useState<string>(ALL_MEMBERS);
  const [memberTokensLookup, setMemberTokensLookup] = useState<Record<string, string[]>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [glData, showsData, ordersData, expensesData, teamData] = await Promise.all([
        dbGet('finance/glByAufnrGl'),
        dbGet('shows'),
        dbGet('finance/internalSalesOrders'),
        dbGet('finance/expenses'),
        dbGet('teamMembers'),
      ]);

      const parsed = normaliseSummaryRows(glData);
      const shows: Record<string, ShowRecord> = showsData
        ? Object.entries(showsData).reduce((acc, [id, value]) => {
            if (typeof id === 'string') {
              const name = value && typeof value === 'object' && typeof (value as Record<string, unknown>).name === 'string'
                ? (value as Record<string, unknown>).name
                : undefined;
              acc[id] = { id, name };
            }
            return acc;
          }, {} as Record<string, ShowRecord>)
        : {};

      const glNames: Record<string, string> = expensesData
        ? Object.values(expensesData as Record<string, ExpenseItem>).reduce((acc, item) => {
            const gl = item?.glCode?.trim();
            if (gl) {
              acc[leadingZeroSafe(gl)] = item.category?.trim() || 'GL Code';
            }
            return acc;
          }, {} as Record<string, string>)
        : {};

      const aufnrShowMap = buildAufnrShowMap(ordersData, shows);

      const annotateSummary = parsed.summaries.map((row) => ({
        ...row,
        glName: glNames[row.glAccountNorm] || 'Undefined GL Code',
        showId: aufnrShowMap[row.aufnrNorm]?.showId,
        showName: aufnrShowMap[row.aufnrNorm]?.showName || aufnrShowMap[row.aufnrNorm]?.showId,
      }));

      const annotateLines = parsed.lines.map((row) => ({
        ...row,
        glName: glNames[row.glAccountNorm] || 'Undefined GL Code',
        showId: aufnrShowMap[row.aufnrNorm]?.showId,
        showName: aufnrShowMap[row.aufnrNorm]?.showName || aufnrShowMap[row.aufnrNorm]?.showId,
      }));

      setShowLookup(shows);
      setGlNameLookup(glNames);
      setAufnrToShow(aufnrShowMap);
      setSummaries(annotateSummary);
      setLines(annotateLines);
      const years = new Set<string>();
      annotateSummary.forEach((row) => years.add(row.fiscalYear));
      annotateLines.forEach((row) => years.add(row.fiscalYear));
      const sortedYears = Array.from(years).filter(Boolean).sort();
      setAvailableYears(sortedYears);
      const memberList: PersonOption[] = teamData
        ? Object.values(teamData as Record<string, { memberName?: string }>)
            .map((member) => {
              const name = member?.memberName?.trim();
              if (!name) return null;
              const tokens = buildMemberTokens(name);
              if (tokens.length === 0) return null;
              return { key: name, tokens } as PersonOption;
            })
            .filter(Boolean) as PersonOption[]
        : [];
      setMembers(memberList);
      const tokenLookup: Record<string, string[]> = {};
      memberList.forEach((member) => {
        tokenLookup[member.key] = member.tokens;
      });
      setMemberTokensLookup(tokenLookup);
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
        const matches = (value: string | undefined, needle: string) =>
          (value ?? '').toLowerCase().includes(needle.toLowerCase());
        return (
          (filters.showId !== ALL_SHOWS ? row.showId === filters.showId : true) &&
          (filters.glCode ? matches(row.glAccountNorm, filters.glCode) : true) &&
          (filters.company ? row.companyCode === filters.company : true) &&
          (filters.fiscalYear !== ALL_YEARS ? row.fiscalYear === filters.fiscalYear : true)
        );
      }),
    [filters, summaries, ALL_SHOWS, ALL_YEARS]
  );

  const filteredLines = useMemo(
    () =>
      lines.filter((row) => {
        const matches = (value: string | undefined, needle: string) =>
          (value ?? '').toLowerCase().includes(needle.toLowerCase());
        const personTokens = row.personTokens ?? extractPersonKey(row.sgtxt)?.tokens ?? [];
        const memberTokens = memberTokensLookup[memberFilter] ?? [];
        const normalizedSgtxt = (row.sgtxt ?? '').toLowerCase();
        const sanitizedSgtxt = normalizedSgtxt.replace(/[^\p{L}\p{N}\s]/gu, ' ');
        const sgtxtTokens = sanitizedSgtxt
          .split(/\s+/)
          .map((t) => t.trim())
          .filter(Boolean);
        const memberMatches =
          filters.glCode === '688304'
            ? memberFilter === ALL_MEMBERS
              ? true
              : memberTokens.some(
                  (token) =>
                    personTokens.includes(token) ||
                    sgtxtTokens.includes(token) ||
                    sanitizedSgtxt.replace(/\s+/g, '').includes(token.replace(/\s+/g, ''))
                )
            : true;
        return (
          (filters.showId !== ALL_SHOWS ? row.showId === filters.showId : true) &&
          (filters.glCode ? matches(row.glAccountNorm, filters.glCode) : true) &&
          (filters.company ? row.companyCode === filters.company : true) &&
          (filters.fiscalYear !== ALL_YEARS ? row.fiscalYear === filters.fiscalYear : true) &&
          memberMatches &&
          (filters.search
            ? matches(row.sgtxt, filters.search) ||
              matches(row.sfgxt, filters.search) ||
              matches(row.docNo, filters.search) ||
              matches(row.reference, filters.search)
            : true)
        );
      }),
    [filters, lines, ALL_SHOWS, ALL_YEARS, memberTokensLookup]
  );

  const summaryTotals = useMemo(() => {
    return filteredSummaries.reduce(
      (acc, row) => {
        acc.net += row.netAmount;
        acc.debit += row.debitAmount;
        acc.credit += row.creditAmount;
        acc.lines += row.lineCount;
        return acc;
      },
      { net: 0, debit: 0, credit: 0, lines: 0 }
    );
  }, [filteredSummaries]);

  const clearFilters = () =>
    setFilters({
      showId: ALL_SHOWS,
      glCode: '',
      company: '',
      fiscalYear: ALL_YEARS,
      search: '',
      member: ALL_MEMBERS,
    });

  const buildAufnrShowMap = (
    ordersData: unknown,
    shows: Record<string, ShowRecord>
  ): Record<string, { showId: string; showName?: string }> => {
    const map: Record<string, { showId: string; showName?: string }> = {};
    if (!ordersData || typeof ordersData !== 'object') return map;

    Object.values(ordersData as Record<string, InternalOrder>).forEach((order) => {
      if (!order || typeof order !== 'object') return;
      const dealerNumber =
        typeof order.internalSalesOrderNumberDealer === 'string' ? order.internalSalesOrderNumberDealer.trim() : '';
      const internalNumber =
        typeof order.internalSalesOrderNumber === 'string' ? order.internalSalesOrderNumber.trim() : '';
      const candidates = [dealerNumber, internalNumber].filter(Boolean);
      candidates.forEach((num) => {
        const norm = leadingZeroSafe(num);
        if (!norm) return;
        const showId = order.showId;
        if (!showId) return;
        const showName = shows[showId]?.name;
        map[norm] = { showId, showName };
      });
    });
    return map;
  };

  const financeShowOptions = useMemo(() => {
    const ids = new Set<string>();
    summaries.forEach((row) => row.showId && ids.add(row.showId));
    lines.forEach((row) => row.showId && ids.add(row.showId));
    return Array.from(ids);
  }, [summaries, lines]);

  useEffect(() => {
    if (filters.glCode !== '688304' && memberFilter !== ALL_MEMBERS) {
      setMemberFilter(ALL_MEMBERS);
    }
  }, [filters.glCode, memberFilter]);

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

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Show Filter</CardTitle>
            <CardDescription>Shows with finance records (mapped from internal sales order AUFNR)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Select value={filters.showId} onValueChange={(value) => setFilters((prev) => ({ ...prev, showId: value }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All shows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHOWS}>All shows</SelectItem>
                {financeShowOptions
                  .map((id) => ({
                    id,
                    name: showLookup[id]?.name || id,
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      {show.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search text (SGTXT / Doc / Reference)"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="md:col-span-1 lg:col-span-1">
              <Select
                value={filters.fiscalYear}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, fiscalYear: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All fiscal years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS}>All fiscal years</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>GL Code</CardTitle>
              <CardDescription>GL code from finance/expenses glCode (Undefined if not mapped).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[...new Set(summaries.map((row) => row.glAccountNorm))].map((gl) => {
                const isActive = filters.glCode === gl;
                const glName = glNameLookup[gl] || 'Undefined GL Code';
                const glNet = summaries
                  .filter((row) => row.glAccountNorm === gl && (!filters.company || row.companyCode === filters.company))
                  .reduce((acc, row) => acc + row.netAmount, 0);
                return (
                  <button
                    key={gl}
                    className={`rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${
                      isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setFilters((prev) => ({ ...prev, glCode: isActive ? '' : gl }))}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{gl || '—'}</p>
                      {isActive && <Badge variant="secondary">Selected</Badge>}
                    </div>
                    <p className="text-xs text-slate-600">备注: {glName}</p>
                    <p className="mt-2 text-sm font-semibold">{formatAmountStyled(glNet)}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
              <CardDescription>Factory Cost (3110) / Dealer Cost (3120)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {['3110', '3120'].map((company) => {
                const isActive = filters.company === company;
                const companyNet = summaries
                  .filter((row) => row.companyCode === company && (!filters.glCode || row.glAccountNorm === filters.glCode))
                  .reduce((acc, row) => acc + row.netAmount, 0);
                const label = company === '3110' ? 'Factory Cost' : 'Dealer Cost';
                return (
                  <button
                    key={company}
                    className={`rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${
                      isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setFilters((prev) => ({ ...prev, company: isActive ? '' : company }))}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      {isActive && <Badge variant="secondary">Selected</Badge>}
                    </div>
                    <p className="text-sm mt-2 font-semibold">Net: {formatAmountStyled(companyNet)}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-sm md:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Net Amount</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{formatAmountStyled(summaryTotals.net)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white shadow-sm md:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Current filters: Show / GL / Company / Fiscal Year</CardDescription>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge variant="outline">
                Show: {filters.showId !== ALL_SHOWS ? showLookup[filters.showId]?.name || filters.showId : 'All'}
              </Badge>
              <Badge variant="outline">
                GL: {filters.glCode || 'All'} {filters.glCode ? `(${glNameLookup[filters.glCode] || 'Undefined GL Code'})` : ''}
              </Badge>
              <Badge variant="outline">
                Company: {filters.company === '3110' ? 'Factory Cost' : filters.company === '3120' ? 'Dealer Cost' : 'All'}
              </Badge>
              <Badge variant="outline">
                Fiscal Year: {filters.fiscalYear !== ALL_YEARS ? filters.fiscalYear : 'All'}
              </Badge>
            </div>
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
                  <TableHead className="min-w-[140px]">Show</TableHead>
                  <TableHead className="min-w-[70px]">GL</TableHead>
                  <TableHead>GL Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>VKORG</TableHead>
                  <TableHead className="text-right">Net</TableHead>
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
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.showName || 'Unknown Show'}</span>
                          <span className="text-xs text-slate-600">AUFNR: {row.aufnrNorm}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{row.glAccountNorm}</TableCell>
                      <TableCell className="text-slate-700">{row.glName}</TableCell>
                      <TableCell>{row.companyCode}</TableCell>
                      <TableCell>{row.fiscalYear}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell>{row.vkorg}</TableCell>
                      <TableCell className="text-right">{formatAmountStyled(row.netAmount, row.currency)}</TableCell>
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
          {members.length > 0 && filters.glCode === '688304' && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              <Badge
                variant={memberFilter === ALL_MEMBERS ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setMemberFilter(ALL_MEMBERS)}
              >
                All members
              </Badge>
              {members.map((member) => (
                <Badge
                  key={member.key}
                  variant={memberFilter === member.key ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setMemberFilter((prev) => (prev === member.key ? ALL_MEMBERS : member.key))}
                >
                  {member.key}
                </Badge>
              ))}
            </div>
          )}
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Show</TableHead>
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
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.showName || 'Unknown Show'}</span>
                          <span className="text-xs text-slate-600">AUFNR: {row.aufnrNorm}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.glAccountNorm}</span>
                          <span className="text-xs text-slate-600">{row.glName}</span>
                        </div>
                      </TableCell>
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
                      <TableCell className="text-right">{formatAmountExpense(row.amount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatDebitExpense(row.debitAmount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatCreditExpense(row.creditAmount ?? 0, row.currency)}</TableCell>
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
