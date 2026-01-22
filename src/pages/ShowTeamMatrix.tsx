import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dbGet } from '@/lib/firebase';

type ShowRecord = {
  id?: string;
  name?: string;
  startDate?: string;
  finishDate?: string;
  dealership?: string;
  handoverDealer?: string;
  siteLocation?: {
    number?: string;
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

type TeamMember = {
  memberId?: string;
  memberName?: string;
  activeFlag?: number;
};

type InternalSalesOrder = {
  showId?: string;
  internalSalesOrderNumber?: string;
  internalSalesOrderNumberDealer?: string;
};

const getYearFromDate = (value?: string | null): number | null => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})/);
  if (match?.[1]) {
    const year = Number(match[1]);
    return Number.isFinite(year) ? year : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getShowStatus = (show: ShowRecord) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(show.startDate);
  const finish = parseDate(show.finishDate);

  if (finish && finish < today) return 'Finished';
  if (start && finish && start <= today && finish >= today) return 'In Progress';
  if (start && start <= today && !finish) return 'In Progress';
  if (!start && finish && finish >= today) return 'In Progress';
  return null;
};

const monthRowClasses = [
  'bg-blue-50',
  'bg-emerald-50',
  'bg-amber-50',
  'bg-violet-50',
  'bg-rose-50',
  'bg-cyan-50',
  'bg-lime-50',
  'bg-orange-50',
  'bg-sky-50',
  'bg-fuchsia-50',
  'bg-teal-50',
  'bg-indigo-50',
];

const getRowBackground = (show: ShowRecord) => {
  const start = parseDate(show.startDate);
  if (!start) return '';
  return monthRowClasses[start.getMonth()] || '';
};

const getShowAddress = (show: ShowRecord) => {
  const location = show.siteLocation;
  if (!location) return '-';
  const { number, street, suburb, state, postcode, country } = location;
  const parts = [number, street, suburb, state, postcode, country].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
};

export default function ShowTeamMatrix() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrder[]>([]);
  const [matrixValues, setMatrixValues] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    const loadData = async () => {
      const [showsData, membersData, ordersData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('finance/internalSalesOrders'),
      ]);

      setShows(showsData ? Object.values(showsData) : []);
      setTeamMembers(membersData ? Object.values(membersData) : []);
      setInternalOrders(ordersData ? Object.values(ordersData) : []);
    };

    loadData();
  }, []);

  const teamMemberList = useMemo(() => {
    return teamMembers
      .filter((member) => member.activeFlag !== 0)
      .sort((a, b) => {
        const nameA = a.memberName?.trim() || a.memberId || '';
        const nameB = b.memberName?.trim() || b.memberId || '';
        return nameA.localeCompare(nameB);
      });
  }, [teamMembers]);

  const internalOrderMap = useMemo(() => {
    return internalOrders.reduce((acc, order) => {
      const showId = order.showId?.trim();
      if (!showId) return acc;
      const candidates = [order.internalSalesOrderNumber, order.internalSalesOrderNumberDealer]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      if (candidates.length === 0) return acc;
      if (!acc[showId]) acc[showId] = [];
      acc[showId].push(...candidates);
      return acc;
    }, {} as Record<string, string[]>);
  }, [internalOrders]);

  const showsFor2026 = useMemo(() => {
    return shows
      .filter((show) => getYearFromDate(show.startDate) === 2026)
      .sort((a, b) => {
        const aTime = parseDate(a.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = parseDate(b.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aTime !== bTime) return aTime - bTime;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [shows]);

  const handleMatrixChange = (showId: string, memberId: string, value: string) => {
    setMatrixValues((prev) => ({
      ...prev,
      [showId]: {
        ...(prev[showId] || {}),
        [memberId]: value,
      },
    }));
  };

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1200px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Show (2026)</TableHead>
            <TableHead>Internal Sales Order #</TableHead>
            <TableHead>Dealership</TableHead>
            <TableHead>Start Date</TableHead>
            {teamMemberList.map((member) => (
              <TableHead key={member.memberId || member.memberName}>
                {member.memberName || member.memberId || 'Unnamed'}
              </TableHead>
            ))}
            <TableHead>Show Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {showsFor2026.map((show, index) => {
            const showId = show.id || `show-${index}`;
            const status = getShowStatus(show);
            const internalNumbers = internalOrderMap[showId] || [];
            const dealership = show.handoverDealer || show.dealership || '-';
            return (
              <TableRow key={showId} className={getRowBackground(show)}>
                <TableCell className="font-medium text-slate-900">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{show.name || 'Untitled show'}</span>
                    {status === 'Finished' && <Badge className="bg-red-500 text-white">Finished</Badge>}
                    {status === 'In Progress' && (
                      <Badge className="bg-emerald-500 text-white">In Progress</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{internalNumbers.length ? internalNumbers.join(', ') : '-'}</TableCell>
                <TableCell>{dealership}</TableCell>
                <TableCell>{formatDate(show.startDate)}</TableCell>
                {teamMemberList.map((member) => {
                  const memberId = member.memberId || member.memberName || 'unknown';
                  const currentValue = matrixValues[showId]?.[memberId] || '';
                  return (
                    <TableCell key={`${showId}-${memberId}`}>
                      <select
                        className="h-8 w-16 rounded border border-slate-200 bg-white text-xs shadow-sm"
                        value={currentValue}
                        onChange={(event) => handleMatrixChange(showId, memberId, event.target.value)}
                      >
                        <option value=""> </option>
                        <option value="X">X</option>
                        <option value="NG">NG</option>
                        <option value="1">1</option>
                      </select>
                    </TableCell>
                  );
                })}
                <TableCell>{getShowAddress(show)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
