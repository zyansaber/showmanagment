import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, FileText, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dbGet } from '@/lib/firebase';

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  startDate?: string;
  finishDate?: string;
  showDuration?: number | string;
  teamMembers?: string[];
};

type ShowDayEntry = { showId?: string; showName?: string; days?: number | string };

type TeamMember = {
  id?: string;
  memberId?: string;
  memberName?: string;
  email?: string;
  activeFlag?: number;
  showDays?: ShowDayEntry[] | Record<string, number | string>;
};

type ShowOrder = {
  id?: string;
  showId?: string;
  salesperson?: string;
  contractValue?: number | string;
  orderStatusId?: string;
  status?: string;
  dealerConfirm?: boolean;
  model?: string;
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

const calculateShowDays = (show: ShowRecord) => {
  if (show.showDuration !== undefined && show.showDuration !== null && show.showDuration !== '') return toNumber(show.showDuration);
  const start = parseDate(show.startDate);
  const finish = parseDate(show.finishDate);
  if (!start || !finish) return 0;
  const diff = finish.getTime() - start.getTime();
  return diff >= 0 ? Math.floor(diff / 86_400_000) + 1 : 0;
};

const buildMemberShowDays = (member?: TeamMember) => {
  const rawDays = member?.showDays;
  if (Array.isArray(rawDays)) {
    return rawDays
      .map((entry) => ({ showId: entry.showId || '', days: toNumber(entry.days) }))
      .filter((entry) => entry.showId && entry.days > 0);
  }
  if (rawDays && typeof rawDays === 'object') {
    return Object.entries(rawDays)
      .map(([showId, days]) => ({ showId, days: toNumber(days) }))
      .filter((entry) => entry.showId && entry.days > 0);
  }
  return [] as { showId: string; days: number }[];
};

const isConfirmedOrder = (order: ShowOrder) => {
  const status = (order.status || '').trim().toLowerCase();
  const orderStatusId = (order.orderStatusId || '').trim().toLowerCase();
  return orderStatusId === 'confirmation' || status === 'confirmation' || status === 'confirmed' || Boolean(order.dealerConfirm);
};

const StatCard = ({ title, value, icon: Icon, note }: { title: string; value: string | number; icon: typeof Users; note?: string }) => (
  <Card className="overflow-hidden border-0 bg-white/90 shadow-sm ring-1 ring-slate-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      <Icon className="h-5 w-5 text-blue-500" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-slate-950 sm:text-3xl">{value}</div>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </CardContent>
  </Card>
);

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

  const assignedShows = useMemo(() => {
    if (!member?.memberId) return [];
    return shows
      .filter((show) => (show.teamMembers || []).includes(member.memberId || ''))
      .sort((a, b) => (parseDate(a.startDate)?.getTime() || 0) - (parseDate(b.startDate)?.getTime() || 0));
  }, [member, shows]);

  const upcomingShows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return assignedShows.filter((show) => {
      const finish = parseDate(show.finishDate) || parseDate(show.startDate);
      return !finish || finish >= today;
    });
  }, [assignedShows]);

  const memberOrders = useMemo(() => {
    const memberName = (member?.memberName || '').trim().toLowerCase();
    if (!memberName) return [];
    return orders.filter((order) => (order.salesperson || '').trim().toLowerCase() === memberName);
  }, [member, orders]);

  const confirmedOrders = memberOrders.filter(isConfirmedOrder);
  const totalSales = confirmedOrders.reduce((sum, order) => sum + toNumber(order.contractValue), 0);
  const showDayMap = buildMemberShowDays(member).reduce((acc, entry) => {
    acc[entry.showId] = entry.days;
    return acc;
  }, {} as Record<string, number>);
  const totalDays = assignedShows.reduce((sum, show) => sum + (show.id && showDayMap[show.id] ? showDayMap[show.id] : calculateShowDays(show)), 0);
  const totalHours = Math.round(totalDays * 8);
  const memberFiles = files.filter((file) => file.teamMemberId === member?.memberId);
  const modelCounts = memberOrders.reduce((acc, order) => {
    const model = (order.model || 'Unknown model').trim() || 'Unknown model';
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxModelCount = Math.max(1, ...topModels.map(([, count]) => count));

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading team member dashboard…</div>;
  if (!member) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-600">Team member not found.</div>;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#eef2ff)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:p-10">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-blue-200">Team Member Performance</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{member.memberName}</h1>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">{member.email || 'No email saved'} · {assignedShows.length} total shows · {upcomingShows.length} upcoming</p>
            </div>
            <div className="flex flex-col justify-end gap-3 sm:flex-row lg:flex-col">
              <Button asChild className="bg-white text-slate-950 hover:bg-blue-50">
                <Link to="/ticket_and_booking">Upload Ticket / Booking</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
                <Link to="/shows-excel">Back to Shows Excel</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Total shows" value={assignedShows.length} icon={Users} note={`${upcomingShows.length} upcoming`} />
          <StatCard title="Total hours" value={totalHours} icon={Clock} note={`${totalDays.toFixed(1)} show days`} />
          <StatCard title="Orders under member" value={memberOrders.length} icon={ShoppingCart} />
          <StatCard title="Confirmed orders" value={confirmedOrders.length} icon={CheckCircle2} />
          <StatCard title="Confirmed sales" value={`$${totalSales.toLocaleString()}`} icon={TrendingUp} />
          <StatCard title="Files" value={memberFiles.length} icon={FileText} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader><CardTitle>Upcoming shows</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {upcomingShows.length ? upcomingShows.map((show) => (
                <div key={show.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{show.name}</div>
                      <div className="text-sm text-slate-500">{show.dealership || 'No dealership'}</div>
                    </div>
                    <div className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                      {formatDate(show.startDate)} - {formatDate(show.finishDate)}
                    </div>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No upcoming shows assigned.</p>}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader><CardTitle>Model range</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {topModels.length ? topModels.map(([model, count]) => (
                <div key={model}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium text-slate-700">{model}</span><span className="text-slate-500">{count}</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${(count / maxModelCount) * 100}%` }} />
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No order models found for this member.</p>}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader><CardTitle>Recent orders</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {memberOrders.slice(0, 8).map((order) => (
                <div key={order.id} className="rounded-xl border bg-white p-3 text-sm">
                  <div className="font-semibold text-slate-900">{order.model || 'Unknown model'}</div>
                  <div className="text-slate-500">{isConfirmedOrder(order) ? 'Confirmed' : 'Not confirmed'} · ${toNumber(order.contractValue).toLocaleString()}</div>
                </div>
              ))}
              {!memberOrders.length && <p className="text-sm text-slate-500">No orders found under this salesperson name.</p>}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader><CardTitle>Ticket & booking files</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {memberFiles.length ? memberFiles.map((file) => (
                <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer" className="block rounded-xl border bg-white p-3 text-sm text-blue-700 hover:bg-blue-50">
                  {file.displayName || file.fileName || 'Attachment'}
                </a>
              )) : <p className="text-sm text-slate-500">No ticket or booking files uploaded for this member.</p>}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
