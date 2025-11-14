import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dbGet } from '@/lib/firebase';
import type { Show, ShowCaravanPick, ShowOrder, TeamMember } from '@/types';
import { Download, Loader2, Search } from 'lucide-react';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Bar } from 'recharts';

const SALES_YEARS = ['2024', '2025', '2026'] as const;
type SalesYear = (typeof SALES_YEARS)[number];

const formatCurrency = (value: number) =>
  value > 0
    ? value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
    : 'N/A';

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
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

const getLocation = (show: Show | null) => {
  if (!show?.siteLocation) return 'N/A';
  const { number, street, suburb, state, postcode } = show.siteLocation;
  return [number, street, suburb, state, postcode].filter(Boolean).join(', ');
};

export default function ShowReport() {
  const [shows, setShows] = useState<Show[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [caravanPicks, setCaravanPicks] = useState<ShowCaravanPick[]>([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [reportShowId, setReportShowId] = useState('');
  const [selectedYear, setSelectedYear] = useState<SalesYear>('2025');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, ordersData, teamData, pickData] = await Promise.all([
          dbGet('shows'),
          dbGet('showOrders'),
          dbGet('teamMembers'),
          dbGet('showCaravanPicks'),
        ]);

        setShows(showsData ? Object.values(showsData) : []);
        setOrders(ordersData ? Object.values(ordersData) : []);
        setTeamMembers(teamData ? Object.values(teamData) : []);
        if (pickData) {
          const entries = Object.entries(pickData as Record<string, ShowCaravanPick>);
          setCaravanPicks(entries.map(([pickId, value]) => ({ ...value, id: value.id || pickId })));
        } else {
          setCaravanPicks([]);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to load report data', err);
        setError('Unable to load the data required for this report. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const selectedShow = useMemo(
    () => shows.find((show) => show.id === selectedShowId) ?? null,
    [shows, selectedShowId]
  );

  const reportShow = useMemo(
    () => shows.find((show) => show.id === reportShowId) ?? null,
    [shows, reportShowId]
  );

  const reportOrders = useMemo(
    () => orders.filter((order) => order.showId === reportShowId),
    [orders, reportShowId]
  );

  const reportTeamMembers = useMemo(() => {
    if (!reportShow?.teamMembers?.length) return [];
    const memberIds = new Set(reportShow.teamMembers);
    return teamMembers
      .filter((member) => memberIds.has(member.memberId))
      .sort((a, b) => a.memberName.localeCompare(b.memberName));
  }, [reportShow?.teamMembers, teamMembers]);

  const reportCaravanPicks = useMemo(
    () => caravanPicks.filter((pick) => pick.showId === reportShowId),
    [caravanPicks, reportShowId]
  );

  const durationDays = useMemo(() => calculateDurationDays(reportShow), [reportShow]);

  const getYearMetric = (type: 'sales' | 'target', year: SalesYear): number => {
    if (!reportShow) return 0;
    const key = `${type}${year}` as keyof Show;
    const value = reportShow[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };

  const selectedYearSales = getYearMetric('sales', selectedYear);
  const selectedYearTarget = getYearMetric('target', selectedYear);
  const previousYearValue = (Number(selectedYear) - 1).toString();
  const hasPreviousYear = (SALES_YEARS as readonly string[]).includes(previousYearValue);
  const previousYearSales = hasPreviousYear
    ? getYearMetric('sales', previousYearValue as SalesYear)
    : 0;
  const salesDelta = selectedYearSales - previousYearSales;
  const salesDeltaPercentage = previousYearSales > 0 ? (salesDelta / previousYearSales) * 100 : null;
  const averageDailySales = durationDays > 0 ? selectedYearSales / durationDays : null;

  const ordersByType = useMemo(() => {
    return reportOrders.reduce(
      (acc, order) => {
        const key = order.orderType === 'Transfer from Stock' ? 'transfer' : 'new';
        acc[key] += 1;
        return acc;
      },
      { new: 0, transfer: 0 }
    );
  }, [reportOrders]);

  const modelRangeData = useMemo(() => {
    const counts = new Map<string, number>();
    reportOrders.forEach((order) => {
      const range = (order.chassisNumber || '').substring(0, 3).toUpperCase() || 'N/A';
      counts.set(range, (counts.get(range) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [reportOrders]);

  const pickRangeSummary = useMemo(() => {
    const summary = new Map<string, number>();
    reportCaravanPicks.forEach((pick) => {
      const prefix = (pick.model || '').substring(0, 3).toUpperCase() || 'N/A';
      summary.set(prefix, (summary.get(prefix) ?? 0) + 1);
    });
    return Array.from(summary.entries())
      .map(([range, count]) => ({ range, count }))
      .sort((a, b) => b.count - a.count);
  }, [reportCaravanPicks]);

  const teamRanking = useMemo(() => {
    const rankingMap = new Map<string, { name: string; role?: string; orders: number }>();

    reportTeamMembers.forEach((member) => {
      const name = member.memberName || member.memberId;
      rankingMap.set(name, { name, role: member.role, orders: 0 });
    });

    reportOrders.forEach((order) => {
      const salesperson = order.salesperson?.trim() || 'Unassigned';
      const record = rankingMap.get(salesperson);
      if (record) {
        record.orders += 1;
      } else {
        rankingMap.set(salesperson, { name: salesperson, role: 'External', orders: 1 });
      }
    });

    return Array.from(rankingMap.values()).sort((a, b) => {
      if (b.orders !== a.orders) return b.orders - a.orders;
      return a.name.localeCompare(b.name);
    });
  }, [reportOrders, reportTeamMembers]);

  const yearSeries = useMemo(
    () =>
      SALES_YEARS.map((year) => ({
        year,
        sales: getYearMetric('sales', year),
        target: getYearMetric('target', year),
      })),
    [reportShow]
  );

  const handleGenerateReport = () => {
    if (!selectedShowId) return;
    setReportShowId(selectedShowId);
  };

  const handleDownloadPdf = () => {
    if (!reportShow) return;
    if (typeof window === 'undefined') return;
    const originalTitle = document.title;
    document.title = `${reportShow.name} - Show Report`;
    window.print();
    document.title = originalTitle;
  };

  const showOptions = useMemo(
    () =>
      shows
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((show) => ({
          id: show.id,
          label: show.name || 'Untitled show',
          description: `${formatDate(show.startDate)} · ${show.siteLocation?.state || 'Unknown location'}`,
        })),
    [shows]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Show Report</h2>
          <p className="text-sm text-gray-500">
            Pick a show, run fuzzy search, and generate a professional-grade summary with PDF export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[220px] justify-between">
                {selectedShow ? selectedShow.name : 'Select a show'}
                <Search className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0">
              <Command>
                <CommandInput placeholder="Search shows..." />
                <CommandList>
                  <CommandEmpty>No shows match your search.</CommandEmpty>
                  <CommandGroup>
                    {showOptions.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={option.label}
                        onSelect={() => {
                          setSelectedShowId(option.id);
                          setIsPickerOpen(false);
                        }}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{option.label}</span>
                          <span className="text-xs text-muted-foreground">{option.description}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={selectedYear} onValueChange={(value) => setSelectedYear(value as SalesYear)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {SALES_YEARS.map((year) => (
                <SelectItem key={year} value={year}>
                  Year {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleGenerateReport} disabled={!selectedShowId || loading}>
            Generate report
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadPdf}
            disabled={!reportShow}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading show data...
          </CardContent>
        </Card>
      ) : reportShow ? (
        <div id="show-report-print" className="space-y-6 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-gray-400">Show Overview</p>
              <h3 className="mt-1 text-3xl font-semibold text-gray-900">{reportShow.name}</h3>
              <p className="text-sm text-gray-500">{getLocation(reportShow)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{reportShow.status}</Badge>
              <div className="text-right">
                <p className="text-xs text-gray-500">Duration</p>
                <p className="text-lg font-semibold text-gray-900">
                  {durationDays || 'N/A'} days
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardDescription>Actual sales ({selectedYear})</CardDescription>
                <CardTitle className="text-2xl">{formatCurrency(selectedYearSales)}</CardTitle>
                <p className="text-xs text-gray-500">Target {formatCurrency(selectedYearTarget)}</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Year-over-year delta</CardDescription>
                <CardTitle className="text-2xl">
                  {hasPreviousYear
                    ? `${salesDelta >= 0 ? '+' : ''}${salesDelta.toLocaleString('en-AU')}`
                    : 'N/A'}
                </CardTitle>
                <p
                  className={`text-xs ${
                    (salesDeltaPercentage ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {hasPreviousYear && salesDeltaPercentage !== null
                    ? `${salesDeltaPercentage.toFixed(1)}% vs ${Number(selectedYear) - 1}`
                    : 'No comparison data'}
                </p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Average daily sales</CardDescription>
                <CardTitle className="text-2xl">
                  {averageDailySales ? formatCurrency(Math.round(averageDailySales)) : 'N/A'}
                </CardTitle>
                <p className="text-xs text-gray-500">Based on {durationDays || 0} days</p>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Order overview</CardDescription>
                <CardTitle className="text-2xl">{reportOrders.length}</CardTitle>
                <p className="text-xs text-gray-500">
                  New orders {ordersByType.new} · Transfers {ordersByType.transfer}
                </p>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Show fundamentals</CardTitle>
                <CardDescription>Dates, venue, footprint, and other core details</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">Dates</dt>
                    <dd className="font-medium">
                      {formatDate(reportShow.startDate)} - {formatDate(reportShow.finishDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Organizer / Lead</dt>
                    <dd className="font-medium">{reportShow.eventOrganiser || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Dealership</dt>
                    <dd className="font-medium">{reportShow.dealership || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Stand / Units</dt>
                    <dd className="font-medium">
                      {reportShow.standSize || 'N/A'} · {reportShow.caravansOnDisplay || 0} display units
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Layout file</dt>
                    <dd className="font-medium">{reportShow.layoutAddress || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">BI link</dt>
                    <dd className="font-medium">{reportShow.biUrl || 'N/A'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>On-site team</CardTitle>
                <CardDescription>Attendees and role coverage</CardDescription>
              </CardHeader>
              <CardContent>
                {reportTeamMembers.length ? (
                  <div className="space-y-3">
                    {reportTeamMembers.map((member) => (
                      <div
                        key={member.memberId}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">{member.memberName}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                        <Badge variant="outline">{member.role}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No team members have been assigned for this show.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Yearly sales performance</CardTitle>
              <CardDescription>Target vs. actual for the 2024-2026 planning window</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Achievement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearSeries.map((item) => {
                    const achievement = item.target > 0 ? (item.sales / item.target) * 100 : null;
                    return (
                      <TableRow key={item.year}>
                        <TableCell>{item.year}</TableCell>
                        <TableCell>{formatCurrency(item.target)}</TableCell>
                        <TableCell>{formatCurrency(item.sales)}</TableCell>
                        <TableCell>
                          {achievement !== null ? `${achievement.toFixed(1)}%` : 'N/A'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Order model-range distribution</CardTitle>
                <CardDescription>Shows which model ranges are driving orders</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {modelRangeData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modelRangeData} layout="vertical" margin={{ left: 40 }}>
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="range" width={80} />
                      <Tooltip cursor={{ fill: 'rgba(59,130,246,0.1)' }} />
                      <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-500">No order data available.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team sales ranking</CardTitle>
                <CardDescription>Contribution ranking derived from show orders</CardDescription>
              </CardHeader>
              <CardContent>
                {teamRanking.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamRanking.map((member) => (
                        <TableRow key={member.name}>
                          <TableCell>{member.name}</TableCell>
                          <TableCell>{member.role || '-'}</TableCell>
                          <TableCell className="text-right">{member.orders}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-gray-500">No team or order data available.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Order detail</CardTitle>
                <CardDescription>Includes type, seller, and approval status</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[360px] space-y-3 overflow-y-auto pr-2">
                {reportOrders.length ? (
                  reportOrders.map((order) => (
                    <div key={order.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{order.chassisNumber || 'Untitled order'}</p>
                        <Badge variant="outline">{order.orderType}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>Salesperson: {order.salesperson || 'Unassigned'}</span>
                        <span>Status: {order.status}</span>
                        <span>Date: {formatDate(order.date)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No orders recorded.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Caravan Picks</CardTitle>
                <CardDescription>Units selected for display and build status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-gray-500">Units picked</p>
                    <p className="text-2xl font-semibold">{reportCaravanPicks.length}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-gray-500">Model ranges</p>
                    <p className="text-2xl font-semibold">{pickRangeSummary.length || 0}</p>
                  </div>
                </div>
                {reportCaravanPicks.length ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-2 text-sm">
                    {reportCaravanPicks.map((pick) => (
                      <div key={pick.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{pick.model}</p>
                          <Badge variant="outline">{(pick.model || '').substring(0, 3).toUpperCase()}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">Chassis: {pick.chassis}</p>
                        <p className="text-xs text-gray-500">Dealer: {pick.dealer}</p>
                        <p className="text-xs text-gray-500">Status: {pick.productionStatus}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No caravan picks recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-500">
            Select a show and click "Generate report" to see the detailed analytics.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
