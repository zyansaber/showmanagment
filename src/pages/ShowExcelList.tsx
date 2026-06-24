import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dbGet } from '@/lib/firebase';

type SiteLocation = {
  number?: string;
  street?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  siteLocation?: SiteLocation;
  startDate?: string;
  finishDate?: string;
  showDuration?: number | string;
  target2024?: number | string;
  sales2024?: number | string;
  target2025?: number | string;
  sales2025?: number | string;
  target2026?: number | string;
  sales2026?: number | string;
  eventOrganiser?: string;
  caravansOnDisplay?: number | string;
  standSize?: string;
  layoutAddress?: string;
  status?: string;
  teamMembers?: string[];
};

type TeamMember = {
  memberId?: string;
  memberName?: string;
  role?: string;
  activeFlag?: number;
};

type InternalSalesOrder = {
  showId?: string;
  internalSalesOrderNumber?: string;
};

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
};

const formatAddress = (site?: SiteLocation) => {
  if (!site) return '';
  return [site.number, site.street, site.suburb, site.state, site.postcode, site.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
};

const calculateShowDuration = (show: ShowRecord) => {
  if (show.showDuration !== undefined && show.showDuration !== null && show.showDuration !== '') {
    return show.showDuration;
  }

  const start = parseDate(show.startDate);
  const finish = parseDate(show.finishDate);
  if (!start || !finish) return '';

  const diffMs = finish.getTime() - start.getTime();
  if (diffMs < 0) return '';
  return Math.floor(diffMs / 86_400_000) + 1;
};

const calculateWeekBeforeStartFromToday = (startDate?: string) => {
  const start = parseDate(startDate);
  if (!start) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 7);

  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
};

export default function ShowExcelList() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [internalSalesOrders, setInternalSalesOrders] = useState<InternalSalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [showsData, teamData, internalOrderData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('finance/internalSalesOrders'),
      ]);

      setShows(normaliseList<ShowRecord>(showsData));
      setTeamMembers(normaliseList<TeamMember>(teamData));
      setInternalSalesOrders(normaliseList<InternalSalesOrder>(internalOrderData));
    } catch (err) {
      console.error('Failed to load show spreadsheet data:', err);
      setError('Failed to load show spreadsheet data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeTeamMembers = useMemo(
    () =>
      teamMembers
        .filter((member) => member.activeFlag === 1)
        .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || '')),
    [teamMembers]
  );

  const internalOrderByShowId = useMemo(() => {
    return internalSalesOrders.reduce((acc, order) => {
      if (order.showId) acc[order.showId] = order.internalSalesOrderNumber || '';
      return acc;
    }, {} as Record<string, string>);
  }, [internalSalesOrders]);

  const teamMemberById = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      if (member.memberId) acc[member.memberId] = member;
      return acc;
    }, {} as Record<string, TeamMember>);
  }, [teamMembers]);

  const sortedShows = useMemo(() => {
    return [...shows].sort((a, b) => {
      const aTime = parseDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = parseDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [shows]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 text-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-bold">All Shows Spreadsheet</h1>
          </div>
          <p className="text-sm text-slate-600">Excel-style list of all shows. This standalone page intentionally has no sidebar.</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {error ? <div className="p-6 text-sm text-red-600">{error}</div> : null}
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading shows...</div>
          ) : (
            <div className="h-[calc(100vh-132px)] overflow-auto">
              <Table className="min-w-max border-collapse text-xs">
                <TableHeader className="sticky top-0 z-10 bg-white">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>internal sales order</TableHead>
                    <TableHead>dealership</TableHead>
                    <TableHead>Suburb</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Finish Date</TableHead>
                    <TableHead>week before start from today</TableHead>
                    <TableHead>Show Duration</TableHead>
                    {activeTeamMembers.map((member) => (
                      <TableHead key={member.memberId || member.memberName}>{member.memberName || member.memberId}</TableHead>
                    ))}
                    <TableHead>Membership excluding Show Manager</TableHead>
                    <TableHead>2024 salesnumber</TableHead>
                    <TableHead>2025 sales number</TableHead>
                    <TableHead>2026 target</TableHead>
                    <TableHead>show address</TableHead>
                    <TableHead>event company</TableHead>
                    <TableHead>vans on display</TableHead>
                    <TableHead>stand size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedShows.map((show, index) => {
                    const assignedMemberIds = new Set(show.teamMembers || []);
                    const membershipExcludingManagers = (show.teamMembers || []).filter((memberId) => {
                      const member = teamMemberById[memberId];
                      return member?.role !== 'Show Manager';
                    }).length;

                    return (
                      <TableRow key={show.id || `${show.name}-${index}`} className="hover:bg-slate-50">
                        <TableCell>{formatValue(show.name)}</TableCell>
                        <TableCell>{formatValue(show.id ? internalOrderByShowId[show.id] : '')}</TableCell>
                        <TableCell>{formatValue(show.dealership)}</TableCell>
                        <TableCell>{formatValue(show.siteLocation?.suburb)}</TableCell>
                        <TableCell>{formatValue(show.siteLocation?.state)}</TableCell>
                        <TableCell>{formatValue(show.startDate)}</TableCell>
                        <TableCell>{formatValue(show.finishDate)}</TableCell>
                        <TableCell>{formatValue(calculateWeekBeforeStartFromToday(show.startDate))}</TableCell>
                        <TableCell>{formatValue(calculateShowDuration(show))}</TableCell>
                        {activeTeamMembers.map((member) => (
                          <TableCell key={member.memberId || member.memberName} className="text-center">
                            {member.memberId && assignedMemberIds.has(member.memberId) ? '1' : ''}
                          </TableCell>
                        ))}
                        <TableCell>{membershipExcludingManagers}</TableCell>
                        <TableCell>{formatValue(show.sales2024)}</TableCell>
                        <TableCell>{formatValue(show.sales2025)}</TableCell>
                        <TableCell>{formatValue(show.target2026)}</TableCell>
                        <TableCell className="max-w-80 whitespace-normal">{formatAddress(show.siteLocation)}</TableCell>
                        <TableCell>{formatValue(show.eventOrganiser)}</TableCell>
                        <TableCell>{formatValue(show.caravansOnDisplay)}</TableCell>
                        <TableCell>{formatValue(show.standSize)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
