import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, FileText, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dbGet } from '@/lib/firebase';

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  startDate?: string;
  finishDate?: string;
  teamMembers?: string[];
};

type TeamMember = {
  id?: string;
  memberId?: string;
  memberName?: string;
  email?: string;
  activeFlag?: number;
};

type ShowOrder = {
  id?: string;
  showId?: string;
  salesperson?: string;
  contractValue?: number | string;
  orderStatusId?: string;
};

type TicketFile = {
  id?: string;
  showId?: string;
  teamMemberId?: string;
  fileName?: string;
  displayName?: string;
  url?: string;
  uploadedAt?: string;
};

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const slugify = (value?: string) => (value || '').trim().replace(/\s+/g, '-').toLowerCase();

const parseDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year && month && day) return new Date(year, month - 1, day);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string) => {
  const date = parseDate(value);
  if (!date) return value || '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

export default function TeamMemberProfile() {
  const { memberSlug = '' } = useParams();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [files, setFiles] = useState<TicketFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [showsData, teamData, ordersData, filesData] = await Promise.all([
          dbGet('shows'),
          dbGet('teamMembers'),
          dbGet('showOrders'),
          dbGet('ticketAndBookingFiles'),
        ]);
        setShows(normaliseList<ShowRecord>(showsData));
        setTeamMembers(normaliseList<TeamMember>(teamData));
        setOrders(normaliseList<ShowOrder>(ordersData));
        setFiles(normaliseList<TicketFile>(filesData));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const member = useMemo(() => {
    const decodedSlug = decodeURIComponent(memberSlug).toLowerCase();
    return teamMembers.find((item) => slugify(item.memberName) === decodedSlug || slugify(item.memberId) === decodedSlug);
  }, [memberSlug, teamMembers]);

  const memberShows = useMemo(() => {
    if (!member?.memberId) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return shows
      .filter((show) => (show.teamMembers || []).includes(member.memberId || ''))
      .filter((show) => {
        const finish = parseDate(show.finishDate) || parseDate(show.startDate);
        return !finish || finish >= today;
      })
      .sort((a, b) => (parseDate(a.startDate)?.getTime() || 0) - (parseDate(b.startDate)?.getTime() || 0));
  }, [member, shows]);

  const memberShowIds = useMemo(() => new Set(memberShows.map((show) => show.id).filter(Boolean)), [memberShows]);
  const memberOrders = orders.filter((order) => order.showId && memberShowIds.has(order.showId));
  const totalSales = memberOrders.reduce((sum, order) => sum + toNumber(order.contractValue), 0);
  const memberFiles = files.filter((file) => file.teamMemberId === member?.memberId);

  if (loading) return <div className="p-6 text-slate-500">Loading team member dashboard…</div>;
  if (!member) return <div className="p-6 text-red-600">Team member not found.</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{member.memberName}</h1>
            <p className="text-sm text-slate-500">{member.email || 'No email saved'}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/ticket_and_booking">Ticket & Booking Files</Link>
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4" />Upcoming shows</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{memberShows.length}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShoppingCart className="h-4 w-4" />Orders</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{memberOrders.length}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" />Sales value</CardTitle></CardHeader><CardContent className="text-3xl font-bold">${totalSales.toLocaleString()}</CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />Files</CardTitle></CardHeader><CardContent className="text-3xl font-bold">{memberFiles.length}</CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Upcoming show list</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {memberShows.length ? memberShows.map((show) => (
              <div key={show.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="font-semibold text-slate-900">{show.name}</div>
                <div className="text-sm text-slate-500">{show.dealership || 'No dealership'} · {formatDate(show.startDate)} - {formatDate(show.finishDate)}</div>
              </div>
            )) : <p className="text-sm text-slate-500">No upcoming shows assigned.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Files</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {memberFiles.length ? memberFiles.map((file) => (
              <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer" className="block rounded border bg-white p-3 text-sm text-blue-700 hover:bg-blue-50">
                {file.displayName || file.fileName || 'Attachment'}
              </a>
            )) : <p className="text-sm text-slate-500">No ticket or booking files uploaded for this member.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
