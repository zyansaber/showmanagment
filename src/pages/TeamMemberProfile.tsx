import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, FileText, MessageSquare, QrCode, ShoppingCart, Star, TrendingUp, UserCog, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dbGet, dbSet } from '@/lib/firebase';

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  startDate?: string;
  finishDate?: string;
  showDuration?: number | string;
  teamMembers?: string[];
  siteLocation?: { state?: string; number?: string; street?: string; suburb?: string; postcode?: string; country?: string };
  layoutAddress?: string;
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
  customerName?: string;
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

type TeamMessage = {
  id?: string;
  title?: string;
  body?: string;
  targetMemberIds?: string[];
  createdAt?: string;
};

type ReadReceipts = Record<string, Record<string, { readAt: string }>>;
type InternalSalesOrder = { id?: string; showId?: string; internalSalesOrderNumber?: string };

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

const isShowFinished = (show: ShowRecord) => {
  const finish = parseDate(show.finishDate);
  if (!finish) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  finish.setHours(0, 0, 0, 0);
  return finish < today;
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

type ProfileSection = 'home' | 'dashboard' | 'showPlan' | 'tickets' | 'messages' | 'personalInfo' | 'snowyCalendar' | 'historyInternal';
type CalendarView = 'calendar' | 'region' | 'list';

const sectionFromSlug = (sectionSlug?: string): ProfileSection => {
  if (sectionSlug === 'dashboard') return 'dashboard';
  if (sectionSlug === 'show-plan') return 'showPlan';
  if (sectionSlug === 'ticket-booking') return 'tickets';
  if (sectionSlug === 'messages') return 'messages';
  if (sectionSlug === 'personal-info') return 'personalInfo';
  if (sectionSlug === 'snowy-calendar') return 'snowyCalendar';
  if (sectionSlug === 'history-internal') return 'historyInternal';
  return 'home';
};

const slugFromSection = (section: ProfileSection) => {
  if (section === 'dashboard') return 'dashboard';
  if (section === 'showPlan') return 'show-plan';
  if (section === 'tickets') return 'ticket-booking';
  if (section === 'messages') return 'messages';
  if (section === 'personalInfo') return 'personal-info';
  if (section === 'snowyCalendar') return 'snowy-calendar';
  if (section === 'historyInternal') return 'history-internal';
  return '';
};

export default function TeamMemberProfile() {
  const { memberSlug = '', sectionSlug } = useParams();
  const navigate = useNavigate();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [files, setFiles] = useState<TicketFile[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrder[]>([]);
  const [receipts, setReceipts] = useState<ReadReceipts>({});
  const [loading, setLoading] = useState(true);
  const [emailDraft, setEmailDraft] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [calendarView, setCalendarView] = useState<CalendarView>('calendar');
  const [historySearch, setHistorySearch] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarShow, setSelectedCalendarShow] = useState<ShowRecord | null>(null);
  const activeSection = sectionFromSlug(sectionSlug);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [showsData, teamData, ordersData, filesData, messageData, receiptData, internalOrderData] = await Promise.all([
          dbGet('shows'),
          dbGet('teamMembers'),
          dbGet('showOrders'),
          dbGet('ticketAndBookingFiles'),
          dbGet('teamMessages'),
          dbGet('teamMessageReadReceipts'),
          dbGet('finance/internalSalesOrders'),
        ]);
        setShows(normaliseList<ShowRecord>(showsData));
        setTeamMembers(normaliseList<TeamMember>(teamData));
        setOrders(normaliseList<ShowOrder>(ordersData));
        setFiles(normaliseList<TicketFile>(filesData));
        setMessages(normaliseList<TeamMessage>(messageData));
        setReceipts((receiptData || {}) as ReadReceipts);
        setInternalOrders(normaliseList<InternalSalesOrder>(internalOrderData));
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

  useEffect(() => {
    setEmailDraft(member?.email || '');
  }, [member?.email]);

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
  const memberFiles = files.filter((file) => file.teamMemberId === member?.memberId);
  const showNameById = shows.reduce((acc, show) => {
    if (show.id) acc[show.id] = show.name || show.id;
    return acc;
  }, {} as Record<string, string>);
  const internalOrderByShowId = internalOrders.reduce((acc, order) => {
    if (order.showId) acc[order.showId] = order.internalSalesOrderNumber || '';
    return acc;
  }, {} as Record<string, string>);
  const internalOrderRows = shows
    .map((show) => ({
      show,
      internalOrder: internalOrderByShowId[show.id || ''] || '',
    }))
    .filter((row) => {
      const term = historySearch.trim().toLowerCase();
      if (!term) return true;
      return (row.show.name || '').toLowerCase().includes(term) || row.internalOrder.toLowerCase().includes(term);
    });

  const filesByShowId = memberFiles.reduce((acc, file) => {
    const showId = file.showId || '';
    if (!showId) return acc;
    if (!acc[showId]) acc[showId] = [];
    acc[showId].push(file);
    return acc;
  }, {} as Record<string, TicketFile[]>);
  const formatShowAddress = (show: ShowRecord) => show.layoutAddress || [show.siteLocation?.number, show.siteLocation?.street, show.siteLocation?.suburb, show.siteLocation?.state, show.siteLocation?.postcode, show.siteLocation?.country].filter(Boolean).join(', ') || 'No address';
  const publicProfileUrl = `${window.location.origin}/team/${memberSlug}`;
  const calendarShowsByState = shows.reduce((acc, show) => {
    const state = show.siteLocation?.state || 'No State';
    if (!acc[state]) acc[state] = [];
    acc[state].push(show);
    return acc;
  }, {} as Record<string, ShowRecord[]>);

  const calendarMonthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarStart = new Date(calendarMonthStart);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
  const showsByCalendarDay = shows.reduce((acc, show) => {
    const start = parseDate(show.startDate);
    const finish = parseDate(show.finishDate) || start;
    if (!start || !finish) return acc;
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    finish.setHours(0, 0, 0, 0);
    while (cursor <= finish) {
      const key = cursor.toISOString().slice(0, 10);
      if (!acc[key]) acc[key] = [];
      acc[key].push(show);
      cursor.setDate(cursor.getDate() + 1);
    }
    return acc;
  }, {} as Record<string, ShowRecord[]>);

  const modelCounts = memberOrders.reduce((acc, order) => {
    const model = (order.model || 'Unknown model').trim() || 'Unknown model';
    acc[model] = (acc[model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topModels = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxModelCount = Math.max(1, ...topModels.map(([, count]) => count));
  const memberMessages = messages
    .filter((item) => member?.memberId && (item.targetMemberIds || []).includes(member.memberId))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const unreadMessages = memberMessages.filter((item) => member?.memberId && !receipts[item.id || '']?.[member.memberId]);

  const markMessageRead = async (messageId?: string) => {
    if (!messageId || !member?.memberId) return;
    const readAt = new Date().toISOString();
    await dbSet(`teamMessageReadReceipts/${messageId}/${member.memberId}`, { readAt });
    setReceipts((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] || {}),
        [member.memberId || '']: { readAt },
      },
    }));
  };

  const goToSection = (section: ProfileSection) => {
    const nextSlug = slugFromSection(section);
    navigate(nextSlug ? `/team/${memberSlug}/${nextSlug}` : `/team/${memberSlug}`);
  };

  const savePersonalInfo = async () => {
    if (!member?.id) {
      setInfoMessage('Cannot update email because this member record has no database key.');
      return;
    }
    await dbSet(`teamMembers/${member.id}`, { ...member, email: emailDraft } as unknown as Record<string, unknown>);
    setTeamMembers((prev) => prev.map((item) => (item.id === member.id ? { ...item, email: emailDraft } : item)));
    setInfoMessage('Email updated.');
  };

  const copyProfileLink = async () => {
    await navigator.clipboard?.writeText(publicProfileUrl);
    setInfoMessage('Profile link copied. You can bookmark this page in the browser.');
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading team member dashboard…</div>;
  if (!member) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-red-600">Team member not found.</div>;

  const menuCards = [
    {
      id: 'messages' as ProfileSection,
      title: 'Message & Notification',
      icon: MessageSquare,
      color: 'from-violet-500 to-purple-600',
    },
    {
      id: 'showPlan' as ProfileSection,
      title: 'My Show Plan',
      icon: CalendarDays,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      id: 'historyInternal' as ProfileSection,
      title: 'History & Internal Sales Order',
      icon: FileText,
      color: 'from-amber-500 to-yellow-600',
    },
    {
      id: 'tickets' as ProfileSection,
      title: 'Ticket & Booking',
      icon: FileText,
      color: 'from-orange-500 to-rose-600',
    },
    {
      id: 'dashboard' as ProfileSection,
      title: 'My Dashboard',
      icon: TrendingUp,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      id: 'snowyCalendar' as ProfileSection,
      title: 'Snowy Show Calendar',
      icon: CalendarDays,
      color: 'from-cyan-500 to-blue-600',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="rounded-[2rem] bg-gradient-to-br from-slate-800 to-slate-900 p-5 shadow-2xl ring-1 ring-white/10 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-200">Snowy River Shows</p>
              <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Hi, {member.memberName}</h1>
              <p className="mt-2 text-sm text-slate-300">{member.email || 'Team member portal'}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => goToSection('personalInfo')}
                className="rounded-full bg-white/10 p-3 text-white ring-1 ring-white/20"
                title="Personal Info Edit"
              >
                <UserCog className="h-5 w-5" />
              </button>
              {activeSection !== 'home' && (
                <button
                  type="button"
                  onClick={() => goToSection('home')}
                  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20"
                >
                  Back
                </button>
              )}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-white/10 p-2 text-center">
            <div><div className="text-xl font-bold">{assignedShows.length}</div><div className="text-[11px] text-slate-300">Shows</div></div>
            <div><div className="text-xl font-bold">{memberOrders.length}</div><div className="text-[11px] text-slate-300">Orders</div></div>
            <div><div className="text-xl font-bold">{totalDays.toFixed(1)}</div><div className="text-[11px] text-slate-300">Total Days</div></div>
          </div>
        </header>

        {activeSection === 'home' && (
          <main className="flex-1 space-y-4 py-5">
            {menuCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => goToSection(card.id)}
                  className="w-full overflow-hidden rounded-[1.75rem] bg-white text-left text-slate-950 shadow-xl transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4 p-5 sm:p-6">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${card.color} text-white shadow-lg`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-black">{card.title}</h2>
                    </div>
                    {card.id === 'messages' && unreadMessages.length > 0 && (
                      <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
                        {unreadMessages.length}
                      </span>
                    )}
                    <span className="text-2xl text-slate-300">›</span>
                  </div>
                </button>
              );
            })}
          </main>
        )}

        {activeSection === 'dashboard' && (
          <main className="space-y-4 py-5 text-slate-950">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard title="Total shows" value={assignedShows.length} icon={Users} note={`${upcomingShows.length} upcoming`} />
              <StatCard title="Total Days" value={totalDays.toFixed(1)} icon={Clock} note="From team show days" />
              <StatCard title="Orders" value={memberOrders.length} icon={ShoppingCart} />
              <StatCard title="Confirmed" value={confirmedOrders.length} icon={CheckCircle2} />
              <StatCard title="Sales" value={`$${totalSales.toLocaleString()}`} icon={TrendingUp} />
              <StatCard title="Files" value={memberFiles.length} icon={FileText} />
            </section>

            <Card className="rounded-[1.75rem] border-0 shadow-xl">
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

            <Card className="rounded-[1.75rem] border-0 shadow-xl">
              <CardHeader><CardTitle>Recent orders</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {memberOrders.slice(0, 8).map((order) => (
                  <div key={order.id} className="rounded-2xl border bg-white p-3 text-sm">
                    <div className="font-semibold text-slate-900">{order.customerName || 'Unknown customer'} · {order.model || 'Unknown model'}</div>
                    <div className="text-slate-500">{showNameById[order.showId || ''] || 'Unknown show'} · {isConfirmedOrder(order) ? 'Confirmed' : 'Not confirmed'} · ${toNumber(order.contractValue).toLocaleString()}</div>
                  </div>
                ))}
                {!memberOrders.length && <p className="text-sm text-slate-500">No orders found under this salesperson name.</p>}
              </CardContent>
            </Card>
          </main>
        )}

        {activeSection === 'showPlan' && (
          <main className="space-y-4 py-5 text-slate-950">
            {upcomingShows.length ? upcomingShows.map((show) => (
              <Card key={show.id} className="rounded-[1.75rem] border-0 shadow-xl">
                <CardContent className="p-5">
                  <div className="text-lg font-black text-slate-900">{show.name}</div>
                  <div className="mt-1 text-sm text-slate-500">{show.dealership || 'No dealership'}</div>
                  <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
                    Time: {formatDate(show.startDate)} - {formatDate(show.finishDate)}
                  </div>
                  <div className="mt-3 text-sm text-slate-500">Internal Sales Order: {internalOrderByShowId[show.id || ''] || '-'}</div>
                  <div className="mt-1 text-sm text-slate-500">Address: {formatShowAddress(show)}</div>
                  <div className="mt-1 text-sm text-slate-500">Team days: {((show.id && showDayMap[show.id]) || calculateShowDays(show)).toFixed(1)}</div>
                  <div className="mt-3 space-y-2">
                    {(filesByShowId[show.id || ''] || []).map((file) => (
                      <a key={file.id || file.url} href={file.url} target="_blank" rel="noreferrer" className="block rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-blue-700">
                        Attachment: {file.displayName || file.fileName || 'File'}
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )) : <Card className="rounded-[1.75rem]"><CardContent className="p-5 text-sm text-slate-500">No upcoming shows assigned.</CardContent></Card>}
          </main>
        )}

        {activeSection === 'tickets' && (
          <main className="space-y-4 py-5 text-slate-950">
            <Card className="rounded-[1.75rem] border-0 shadow-xl">
              <CardHeader><CardTitle>Ticket & Booking files</CardTitle></CardHeader>
              <CardContent>
                {memberFiles.length ? (
                  <div className="overflow-hidden rounded-2xl border">
                    <div className="grid grid-cols-[1fr_1fr_90px] bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <span>Show</span>
                      <span>Display name</span>
                      <span className="text-right">File</span>
                    </div>
                    {memberFiles.map((file) => (
                      <div key={file.id || file.url} className="grid grid-cols-[1fr_1fr_90px] items-center gap-2 border-t bg-white px-3 py-3 text-sm">
                        <span className="font-medium text-slate-700">{showNameById[file.showId || ''] || file.showId || 'Show'}</span>
                        <span className="text-slate-600">{file.displayName || file.fileName || 'Attachment'}</span>
                        <a href={file.url} target="_blank" rel="noreferrer" className="text-right font-semibold text-blue-700 underline">Download</a>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-500">No ticket or booking files uploaded for this member.</p>}
              </CardContent>
            </Card>
          </main>
        )}


        {activeSection === 'historyInternal' && (
          <main className="space-y-4 py-5 text-slate-950">
            <Card className="rounded-[1.75rem] border-0 shadow-xl">
              <CardHeader><CardTitle>History & Internal Sales Order</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Shows this member participated in</h3>
                  <div className="space-y-2">
                    {assignedShows.map((show) => (
                      <div key={show.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                        <div className="font-black text-slate-900">{show.name}</div>
                        <div className="text-slate-500">{formatDate(show.startDate)} - {formatDate(show.finishDate)}</div>
                        <div className="mt-1 font-semibold text-blue-700">Internal Sales Order: {internalOrderByShowId[show.id || ''] || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Search all internal sales orders</h3>
                  <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm" placeholder="Search show name or internal sales order..." />
                  <div className="space-y-2">
                    {internalOrderRows.map(({ show, internalOrder }) => (
                      <div key={show.id} className="rounded-2xl border bg-white p-4 text-sm shadow-sm">
                        <div className="font-semibold text-slate-900">{show.name}</div>
                        <div className="text-slate-500">{show.siteLocation?.state || 'No State'} · {formatDate(show.startDate)} - {formatDate(show.finishDate)}</div>
                        <div className="mt-1 font-semibold text-blue-700">{internalOrder || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </main>
        )}

        {activeSection === 'snowyCalendar' && (
          <main className="space-y-4 py-5 text-slate-950">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 text-sm font-semibold shadow-xl">
              {(['calendar', 'region', 'list'] as CalendarView[]).map((view) => (
                <button key={view} type="button" onClick={() => setCalendarView(view)} className={`rounded-xl px-3 py-2 capitalize ${calendarView === view ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>
                  {view}
                </button>
              ))}
            </div>
            {calendarView === 'calendar' && (
              <Card className="rounded-[1.5rem] border-0 shadow-xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <button className="rounded-full bg-slate-100 px-3 py-1" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button>
                    <CardTitle>{calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</CardTitle>
                    <button className="rounded-full bg-slate-100 px-3 py-1" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
                  </div>
                  <div className="mt-2 grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                      const key = day.toISOString().slice(0, 10);
                      const dayShows = showsByCalendarDay[key] || [];
                      const inMonth = day.getMonth() === calendarMonth.getMonth();
                      return (
                        <button key={key} type="button" onClick={() => dayShows[0] && setSelectedCalendarShow(dayShows[0])} className={`min-h-16 rounded-xl border p-1 text-left ${inMonth ? 'bg-white' : 'bg-slate-50 text-slate-300'} ${dayShows.length ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-100'}`}>
                          <div className="text-xs font-bold">{day.getDate()}</div>
                          {dayShows.slice(0, 2).map((show) => <div key={show.id} className="mt-1 truncate rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700">{show.name}</div>)}
                        </button>
                      );
                    })}
                  </div>
                  {selectedCalendarShow && (
                    <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm">
                      <div className="font-black text-slate-900">{selectedCalendarShow.name}</div>
                      <div className="text-blue-700">{formatDate(selectedCalendarShow.startDate)} - {formatDate(selectedCalendarShow.finishDate)}</div>
                      <div className="text-slate-500">{selectedCalendarShow.siteLocation?.state || 'No State'}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            {calendarView === 'region' && Object.entries(calendarShowsByState).map(([state, stateShows]) => (
              <Card key={state} className="rounded-[1.5rem] border-0 shadow-xl">
                <CardHeader><CardTitle>{state}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {stateShows.map((show) => <div key={show.id} className="rounded-xl bg-slate-50 p-3 text-sm"><b>{show.name}</b> {isShowFinished(show) && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">finished</span>}<br />{formatDate(show.startDate)} - {formatDate(show.finishDate)}</div>)}
                </CardContent>
              </Card>
            ))}
            {calendarView === 'list' && (
              <Card className="rounded-[1.5rem] border-0 shadow-xl">
                <CardContent className="divide-y p-0">
                  {shows.map((show) => <div key={show.id} className="grid grid-cols-[1fr_90px] gap-2 p-4 text-sm"><span className="font-semibold">{show.name} {isShowFinished(show) && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">finished</span>}</span><span className="text-right text-slate-500">{show.siteLocation?.state || '-'}</span><span className="col-span-2 text-slate-500">{formatDate(show.startDate)} - {formatDate(show.finishDate)}</span></div>)}
                </CardContent>
              </Card>
            )}
          </main>
        )}

        {activeSection === 'personalInfo' && (
          <main className="space-y-4 py-5 text-slate-950">
            <Card className="rounded-[1.75rem] border-0 shadow-xl">
              <CardHeader><CardTitle>Personal Info Edit</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <label className="block text-sm font-semibold text-slate-600">Email</label>
                <input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} className="w-full rounded-2xl border px-4 py-3 text-sm" placeholder="email@example.com" />
                <Button className="w-full rounded-2xl" onClick={savePersonalInfo}>Save Email</Button>
                <Button variant="outline" className="w-full gap-2 rounded-2xl" onClick={copyProfileLink}><Star className="h-4 w-4" />Copy / Bookmark Profile Link</Button>
                <div className="rounded-2xl bg-slate-50 p-4 text-center">
                  <QrCode className="mx-auto mb-2 h-6 w-6 text-slate-500" />
                  <img className="mx-auto rounded-xl" alt="Profile QR code" src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicProfileUrl)}`} />
                  <p className="mt-3 break-all text-xs text-slate-500">{publicProfileUrl}</p>
                </div>
                {infoMessage && <p className="text-sm text-blue-700">{infoMessage}</p>}
              </CardContent>
            </Card>
          </main>
        )}
        {activeSection === 'messages' && (
          <main className="space-y-4 py-5 text-slate-950">
            {memberMessages.length ? memberMessages.map((item) => {
              const isRead = Boolean(member?.memberId && receipts[item.id || '']?.[member.memberId]);
              return (
                <Card key={item.id} className="rounded-[1.75rem] border-0 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-3">
                      <span>{item.title || 'Message'}</span>
                      <span className={`rounded-full px-3 py-1 text-xs ${isRead ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {isRead ? 'Read' : 'Unread'}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{item.body}</p>
                    <p className="text-xs text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                    {!isRead && (
                      <Button className="w-full rounded-2xl" onClick={() => markMessageRead(item.id)}>
                        Mark as read
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            }) : <Card className="rounded-[1.75rem]"><CardContent className="p-5 text-sm text-slate-500">No messages yet.</CardContent></Card>}
          </main>
        )}
      </div>
    </div>
  );
}
