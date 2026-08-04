import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { dbGet, dbSet } from '@/lib/firebase';
import { toast } from 'sonner';
import { Copy, Loader2, RefreshCw, Save } from 'lucide-react';

const SCHEDULE_DEALERS = ['Frankston', 'Geelong', 'Launceston', 'ST James', 'Traralgon'] as const;
const COUNTED_ORDER_TYPES = ['New Order', 'Transfer from Stock'] as const;
const MAPPING_PATH = 'scheduleDealerMappings';
const API_PATH = 'scheduleDealerOrderApi';
const FIREBASE_REST_BASE = 'https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app';

type ScheduleDealer = (typeof SCHEDULE_DEALERS)[number];

type ShowRecord = {
  id?: string;
  handoverDealer?: string;
  dealership?: string;
};

type ShowOrderRecord = {
  orderId?: string;
  showId?: string;
  date?: string;
  orderType?: string;
  handoverDealer?: string;
};

type ScheduleDealerMapping = Record<ScheduleDealer, string[]>;

type MonthlyDealerApi = Record<
  string,
  {
    total: number;
    months: Record<string, { total: number; newOrder: number; transferFromStock: number }>;
  }
>;

const emptyMapping = (): ScheduleDealerMapping =>
  SCHEDULE_DEALERS.reduce((acc, dealer) => {
    acc[dealer] = [];
    return acc;
  }, {} as ScheduleDealerMapping);

const splitDealerList = (value: string | undefined | null) =>
  (value || '')
    .split(/[,&/\n]/)
    .map((dealer) => dealer.trim())
    .filter(Boolean);

const normaliseDealer = (value: string | undefined | null) => (value || '').trim().toLowerCase();

const getOrderMonth = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const buildScheduleDealerApi = (
  orders: ShowOrderRecord[],
  shows: ShowRecord[],
  mapping: ScheduleDealerMapping
): MonthlyDealerApi => {
  const showLookup = shows.reduce<Record<string, ShowRecord>>((acc, show) => {
    if (show.id) acc[show.id] = show;
    return acc;
  }, {});

  const handoverToScheduleDealer = new Map<string, ScheduleDealer>();
  SCHEDULE_DEALERS.forEach((scheduleDealer) => {
    mapping[scheduleDealer].forEach((handoverDealer) => {
      const key = normaliseDealer(handoverDealer);
      if (key) handoverToScheduleDealer.set(key, scheduleDealer);
    });
  });

  const api = SCHEDULE_DEALERS.reduce((acc, scheduleDealer) => {
    acc[scheduleDealer] = { total: 0, months: {} };
    return acc;
  }, {} as MonthlyDealerApi);

  orders.forEach((order) => {
    if (!COUNTED_ORDER_TYPES.includes(order.orderType as (typeof COUNTED_ORDER_TYPES)[number])) return;

    const month = getOrderMonth(order.date);
    if (!month) return;

    const show = order.showId ? showLookup[order.showId] : undefined;
    const dealerCandidates = [order.handoverDealer, show?.handoverDealer, show?.dealership].flatMap(splitDealerList);
    const scheduleDealer = dealerCandidates
      .map((dealer) => handoverToScheduleDealer.get(normaliseDealer(dealer)))
      .find(Boolean);

    if (!scheduleDealer) return;

    const monthBucket = api[scheduleDealer].months[month] || { total: 0, newOrder: 0, transferFromStock: 0 };
    monthBucket.total += 1;
    if (order.orderType === 'New Order') monthBucket.newOrder += 1;
    if (order.orderType === 'Transfer from Stock') monthBucket.transferFromStock += 1;
    api[scheduleDealer].months[month] = monthBucket;
    api[scheduleDealer].total += 1;
  });

  return api;
};

export default function ScheduleDealerMappingPage() {
  const [mapping, setMapping] = useState<ScheduleDealerMapping>(emptyMapping);
  const [apiPreview, setApiPreview] = useState<MonthlyDealerApi>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apiUrl = `${FIREBASE_REST_BASE}/${API_PATH}.json`;

  const mappingText = useMemo(
    () =>
      SCHEDULE_DEALERS.reduce<Record<ScheduleDealer, string>>((acc, dealer) => {
        acc[dealer] = mapping[dealer].join('\n');
        return acc;
      }, {} as Record<ScheduleDealer, string>),
    [mapping]
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [mappingData, apiData] = await Promise.all([dbGet(MAPPING_PATH), dbGet(API_PATH)]);
      setMapping({ ...emptyMapping(), ...(mappingData as Partial<ScheduleDealerMapping> | null) });
      setApiPreview((apiData as MonthlyDealerApi | null) || {});
    } catch (error) {
      console.error('Failed to load schedule dealer mapping', error);
      toast.error('Failed to load schedule dealer mapping.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaveAndGenerate = async () => {
    setSaving(true);
    try {
      const [ordersData, showsData] = await Promise.all([dbGet('showOrders'), dbGet('shows')]);
      const orders = ordersData ? (Object.values(ordersData) as ShowOrderRecord[]) : [];
      const shows = showsData ? (Object.values(showsData) as ShowRecord[]) : [];
      const generatedApi = buildScheduleDealerApi(orders, shows, mapping);
      await Promise.all([dbSet(MAPPING_PATH, mapping), dbSet(API_PATH, generatedApi)]);
      setApiPreview(generatedApi);
      toast.success('Schedule dealer mapping and API data generated.');
    } catch (error) {
      console.error('Failed to save schedule dealer mapping', error);
      toast.error('Failed to save schedule dealer mapping.');
    } finally {
      setSaving(false);
    }
  };

  const updateDealerMapping = (scheduleDealer: ScheduleDealer, value: string) => {
    setMapping((prev) => ({ ...prev, [scheduleDealer]: splitDealerList(value) }));
  };

  const copyApiUrl = async () => {
    await navigator.clipboard.writeText(apiUrl);
    toast.success('API URL copied.');
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center gap-2 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading schedule dealer mapping...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <Badge variant="outline" className="mb-3">Hidden admin page</Badge>
        <h1 className="text-3xl font-bold text-slate-900">Schedule Dealer Mapping API</h1>
        <p className="text-slate-600">Map current handover dealer names to scheduledealer keys and publish monthly show-order counts.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Handover dealer to scheduledealer mapping</CardTitle>
          <CardDescription>Enter one or more handover dealer names per scheduledealer. Separate values with new lines, commas, ampersands, or slashes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SCHEDULE_DEALERS.map((dealer) => (
              <div key={dealer} className="space-y-2 rounded-lg border p-4">
                <label className="text-sm font-semibold text-slate-800">{dealer}</label>
                <textarea className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mappingText[dealer]} onChange={(event) => updateDealerMapping(dealer, event.target.value)} placeholder={`Handover dealer names for ${dealer}`} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveAndGenerate} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save mapping & generate API</Button>
            <Button variant="outline" onClick={loadData} disabled={saving}><RefreshCw className="mr-2 h-4 w-4" /> Reload</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Generated API</CardTitle>
          <CardDescription>Use scheduledealer as the primary key. Each dealer contains monthly Ordering Date counts for New Order and Transfer from Stock.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2"><Input readOnly value={apiUrl} /><Button variant="outline" onClick={copyApiUrl}><Copy className="mr-2 h-4 w-4" /> Copy</Button></div>
          <Table>
            <TableHeader><TableRow><TableHead>scheduledealer</TableHead><TableHead>Total</TableHead><TableHead>Months</TableHead></TableRow></TableHeader>
            <TableBody>{SCHEDULE_DEALERS.map((dealer) => <TableRow key={dealer}><TableCell className="font-semibold">{dealer}</TableCell><TableCell>{apiPreview[dealer]?.total || 0}</TableCell><TableCell>{Object.entries(apiPreview[dealer]?.months || {}).map(([month, counts]) => `${month}: ${counts.total} (${counts.newOrder} new, ${counts.transferFromStock} transfer)`).join('; ') || '-'}</TableCell></TableRow>)}</TableBody>
          </Table>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(apiPreview, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
