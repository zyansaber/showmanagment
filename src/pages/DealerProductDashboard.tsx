import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ArrowUpRight, Boxes, CalendarDays, Car, CheckCircle2, Loader2, PackageCheck, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dbGet, schedulingDbGet } from '@/lib/firebase';

const DEALERS = ['Frankston', 'Geelong', 'Launceston', 'ST James', 'Traralgon'] as const;
const SHOW_API_URL = 'https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app/scheduleDealerOrderApi.json';
const COLORS = ['#2563eb', '#7c3aed', '#0f766e', '#ea580c', '#db2777'];

type Dealer = (typeof DEALERS)[number];
type ShowApi = Record<string, { total?: number; months?: Record<string, { total?: number; newOrder?: number; transferFromStock?: number }> }>;
type OrderRecord = { orderId?: string; showId?: string; orderType?: string; handoverDealer?: string; expectedHandoverDate?: string; handoverDate?: string; date?: string; customerName?: string; status?: string; orderStatusId?: string };
type ShowRecord = { id?: string; handoverDealer?: string; dealership?: string };
type ScheduleRecord = Record<string, unknown> & { Dealer?: string; Status?: string; Customer?: string; customer?: string; 'Regent Production'?: string; Type?: string; Used?: string; NewUsed?: string };

type DealerStats = {
  dealer: Dealer;
  newMtd: number;
  newYtd: number;
  secondMtd: number;
  secondYtd: number;
  inventory: number;
  customerStock: number;
  stock: number;
  secondhand: number;
  showTransfer: number;
  showNewVan: number;
  showTotal: number;
};

const normalise = (value: unknown) => String(value || '').trim().toLowerCase();
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const isSecondhand = (value: unknown) => /second|used|pre[-\s]?owned|trade/.test(normalise(value));
const splitDealers = (value: unknown) => String(value || '').split(/[,&/\n]/).map((item) => item.trim()).filter(Boolean);

function findDealer(value: unknown): Dealer | null {
  const text = normalise(value);
  return DEALERS.find((dealer) => text.includes(normalise(dealer))) || null;
}

function getOrderDealer(order: OrderRecord, showLookup: Record<string, ShowRecord>) {
  const show = order.showId ? showLookup[order.showId] : undefined;
  return [order.handoverDealer, show?.handoverDealer, show?.dealership].flatMap(splitDealers).map(findDealer).find(Boolean) || null;
}

function getHandoverDate(order: OrderRecord) {
  return parseDate(order.handoverDate) || parseDate(order.expectedHandoverDate) || parseDate(order.date);
}

function classifyStock(record: ScheduleRecord) {
  const joined = Object.values(record).join(' ');
  const dealer = normalise(record.Dealer);
  const status = normalise(record.Status);
  const production = normalise(record['Regent Production']);
  const hasCustomer = Boolean(record.Customer || record.customer) || /customer|sold|allocated/.test(status);
  const stockLike = dealer.includes('stock') || status.includes('stock') || production !== 'finished';
  return { secondhand: isSecondhand(joined), hasCustomer, stockLike };
}

export default function DealerProductDashboard() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRecord[]>([]);
  const [showApi, setShowApi] = useState<ShowApi>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersData, showsData, scheduleData, apiResponse] = await Promise.all([
        dbGet('showOrders'),
        dbGet('shows'),
        schedulingDbGet('schedule'),
        fetch(SHOW_API_URL).then((response) => response.json()),
      ]);
      setOrders(ordersData ? Object.values(ordersData as Record<string, OrderRecord>) : []);
      setShows(showsData ? Object.values(showsData as Record<string, ShowRecord>) : []);
      setSchedule(scheduleData ? Object.values(scheduleData as Record<string, ScheduleRecord>) : []);
      setShowApi((apiResponse as ShowApi) || {});
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const { stats, monthlySecondhand, totals } = useMemo(() => {
    const now = new Date();
    const currentMonth = monthKey(now);
    const currentYear = now.getFullYear();
    const showLookup = shows.reduce<Record<string, ShowRecord>>((acc, show) => { if (show.id) acc[show.id] = show; return acc; }, {});
    const base = DEALERS.reduce<Record<Dealer, DealerStats>>((acc, dealer) => {
      const showMonths = showApi[dealer]?.months || {};
      const currentShow = showMonths[currentMonth] || {};
      acc[dealer] = { dealer, newMtd: 0, newYtd: 0, secondMtd: 0, secondYtd: 0, inventory: 0, customerStock: 0, stock: 0, secondhand: 0, showTransfer: currentShow.transferFromStock || 0, showNewVan: currentShow.newOrder || 0, showTotal: currentShow.total || 0 };
      return acc;
    }, {} as Record<Dealer, DealerStats>);

    orders.forEach((order) => {
      const dealer = getOrderDealer(order, showLookup);
      const date = getHandoverDate(order);
      if (!dealer || !date || date.getFullYear() !== currentYear) return;
      const second = isSecondhand(order.orderType);
      if (second) base[dealer].secondYtd += 1; else base[dealer].newYtd += 1;
      if (monthKey(date) === currentMonth) {
        if (second) base[dealer].secondMtd += 1;
        else base[dealer].newMtd += 1;
      }
    });

    schedule.forEach((record) => {
      const dealer = findDealer(record.Dealer);
      if (!dealer) return;
      const stock = classifyStock(record);
      base[dealer].inventory += 1;
      if (stock.hasCustomer) base[dealer].customerStock += 1;
      if (stock.stockLike) base[dealer].stock += 1;
      if (stock.secondhand) base[dealer].secondhand += 1;
    });

    const months = Array.from({ length: now.getMonth() + 1 }, (_, index) => `${currentYear}-${String(index + 1).padStart(2, '0')}`);
    const monthly = months.map((month) => {
      const row: Record<string, string | number> = { month };
      DEALERS.forEach((dealer) => { row[dealer] = 0; });
      orders.forEach((order) => {
        const dealer = getOrderDealer(order, showLookup);
        const date = getHandoverDate(order);
        if (dealer && date && monthKey(date) === month && isSecondhand(order.orderType)) row[dealer] = Number(row[dealer]) + 1;
      });
      return row;
    });

    const list = DEALERS.map((dealer) => base[dealer]);
    return { stats: list, monthlySecondhand: monthly, totals: list.reduce((acc, item) => ({ handovers: acc.handovers + item.newYtd + item.secondYtd, inventory: acc.inventory + item.inventory, shows: acc.shows + item.showTotal, secondhand: acc.secondhand + item.secondhand }), { handovers: 0, inventory: 0, shows: 0, secondhand: 0 }) };
  }, [orders, schedule, showApi, shows]);

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center gap-3 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading dealer intelligence…</div>;

  return (
    <div className="min-h-screen space-y-6 bg-[#f7f8fb] p-1 text-slate-950">
      <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-2xl shadow-slate-200">
        <div className="relative p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,.35),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,.28),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><Badge className="mb-4 border-white/10 bg-white/10 text-white hover:bg-white/10"><Sparkles className="mr-1 h-3 w-3" /> Modern SaaS Dashboard</Badge><h1 className="max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">Dealer Product Intelligence</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">Frankston, Geelong, Launceston, ST James and Traralgon compared across handover velocity, secondhand trend, live inventory and show demand.</p></div>
            <Button onClick={loadData} className="rounded-full bg-white text-slate-950 hover:bg-slate-100"><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[['YTD handovers', totals.handovers, CheckCircle2], ['Inventory', totals.inventory, Boxes], ['MTD show orders', totals.shows, CalendarDays], ['Secondhand units', totals.secondhand, Car]].map(([label, value, Icon]) => <Card key={String(label)} className="rounded-3xl border-white bg-white/85 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label as string}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-3 text-3xl font-semibold">{String(value)}</p></CardContent></Card>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-3xl border-white bg-white shadow-sm"><CardHeader><CardTitle>Handover comparison</CardTitle><CardDescription>New van and secondhand MTD/YTD handovers by dealer.</CardDescription></CardHeader><CardContent className="h-[390px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="dealer" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="newMtd" name="New MTD" fill="#2563eb" radius={[8,8,0,0]} /><Bar dataKey="newYtd" name="New YTD" fill="#93c5fd" radius={[8,8,0,0]} /><Bar dataKey="secondMtd" name="Secondhand MTD" fill="#7c3aed" radius={[8,8,0,0]} /><Bar dataKey="secondYtd" name="Secondhand YTD" fill="#c4b5fd" radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="rounded-3xl border-white bg-white shadow-sm"><CardHeader><CardTitle>Secondhand monthly trend</CardTitle><CardDescription>Hover to see each dealer's secondhand count for every month.</CardDescription></CardHeader><CardContent className="h-[390px]"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthlySecondhand}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend />{DEALERS.map((dealer, index) => <Line key={dealer} type="monotone" dataKey={dealer} stroke={COLORS[index]} strokeWidth={3} dot={{ r: 3 }} />)}</ComposedChart></ResponsiveContainer></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">{stats.map((item, index) => <Card key={item.dealer} className="rounded-3xl border-white bg-white shadow-sm"><CardHeader><div className="flex items-center justify-between"><CardTitle>{item.dealer}</CardTitle><span className="h-3 w-3 rounded-full" style={{ background: COLORS[index] }} /></div><CardDescription>Dealer scorecard</CardDescription></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid grid-cols-2 gap-3">{[['New MTD', item.newMtd], ['New YTD', item.newYtd], ['2H MTD', item.secondMtd], ['2H YTD', item.secondYtd]].map(([label, value]) => <div key={label} className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div><div className="space-y-2 rounded-2xl border p-3"><p className="flex items-center gap-2 font-medium"><PackageCheck className="h-4 w-4" /> Inventory</p><div className="grid grid-cols-2 gap-2 text-slate-600"><span>Total {item.inventory}</span><span>Customer {item.customerStock}</span><span>Stock {item.stock}</span><span>Secondhand {item.secondhand}</span></div></div><div className="rounded-2xl bg-slate-950 p-3 text-white"><p className="mb-2 flex items-center gap-2 text-sm"><Activity className="h-4 w-4" /> Shows MTD</p><div className="flex justify-between text-xs text-slate-300"><span>Stock transfer</span><b className="text-white">{item.showTransfer}</b></div><div className="mt-1 flex justify-between text-xs text-slate-300"><span>New van</span><b className="text-white">{item.showNewVan}</b></div></div></CardContent></Card>)}</div>
      <p className="flex items-center gap-2 text-xs text-slate-500"><ArrowUpRight className="h-3 w-3" /> Last updated {lastUpdated?.toLocaleString()}. Show metrics are loaded from scheduleDealerOrderApi.</p>
    </div>
  );
}
