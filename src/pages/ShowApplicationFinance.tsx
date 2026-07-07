import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dbGet, dbSet } from '@/lib/firebase';
import { calculateDuration, type ShowApplicationForm } from './ShowApplication';

type Application = { id: string; form: ShowApplicationForm; status: string; confirmedAt?: string; completedAt?: string; showId?: string };
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `finance-${Date.now()}-${Math.random()}`);

export default function ShowApplicationFinance() {
  const { token = '' } = useParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [internalSalesOrderNumber, setInternalSalesOrderNumber] = useState('');
  const [internalSalesOrderNumberDealer, setInternalSalesOrderNumberDealer] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const data = (await dbGet(`showApplications/${decodeURIComponent(token)}`)) as Application | null;
      setApplication(data);
      setLoading(false);
    })();
  }, [token]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!application || !internalSalesOrderNumber.trim() || !internalSalesOrderNumberDealer.trim()) {
      setMessage('Please enter both Internal Sales Order Number values.');
      return;
    }
    setSaving(true);
    const form = application.form;
    const showId = application.showId || newId();
    const orderId = `order-${showId}`;
    const show = {
      id: showId,
      name: form.name,
      siteLocation: { number: form.siteNumber, street: form.street, suburb: form.suburb, postcode: form.postcode, state: form.state, country: form.country },
      dealership: form.dealership,
      handoverDealer: form.handoverDealer,
      startDate: form.startDate,
      finishDate: form.finishDate,
      showDuration: calculateDuration(form.startDate, form.finishDate),
      target2024: 0,
      sales2024: 0,
      target2025: Number(form.target2025) || 0,
      sales2025: Number(form.sales2025) || 0,
      target2026: Number(form.target2026) || 0,
      sales2026: 0,
      eventOrganiser: form.eventOrganiser,
      caravansOnDisplay: Number(form.caravansOnDisplay) || 0,
      standSize: form.standSize,
      layoutAddress: '',
      sapExpenseCode: '',
      status: 'Not Started',
      teamMembers: [],
    };
    try {
      await Promise.all([
        dbSet(`shows/${showId}`, show as unknown as Record<string, unknown>),
        dbSet(`finance/internalSalesOrders/${orderId}`, { id: orderId, showId, dealership: form.dealership, internalSalesOrderNumber, internalSalesOrderNumberDealer } as Record<string, unknown>),
        dbSet(`showApplications/${application.id}`, { ...application, status: 'Completed - show added', completedAt: new Date().toISOString(), showId, internalSalesOrderNumber, internalSalesOrderNumberDealer } as unknown as Record<string, unknown>),
      ]);
      setApplication((prev) => prev ? { ...prev, status: 'Completed - show added', completedAt: new Date().toISOString(), showId } : prev);
      setMessage('Finance codes saved. The show has been added to the show list automatically.');
    } catch (err) {
      console.error(err);
      setMessage('Failed to save finance codes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!application) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Show application address not found.</div>;
  const form = application.form;

  return <div className="min-h-screen bg-slate-50 p-6"><Card className="mx-auto max-w-3xl shadow-xl"><CardHeader className="bg-slate-900 text-white"><CardTitle className="text-3xl">Assign finance codes</CardTitle><p className="text-slate-200">{form.name}</p></CardHeader><CardContent className="space-y-6 p-6"><div className="grid gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950 md:grid-cols-2"><div><b>Dealership:</b> {form.dealership || '-'}</div><div><b>Dates:</b> {form.startDate} to {form.finishDate}</div><div className="md:col-span-2"><b>Address:</b> {[form.siteNumber, form.street, form.suburb, form.state, form.postcode, form.country].filter(Boolean).join(' ') || '-'}</div><div><b>2025 Target:</b> {form.target2025 || '-'}</div><div><b>2025 Sales:</b> {form.sales2025 || '-'}</div><div><b>2026 Target:</b> {form.target2026 || '-'}</div></div>{application.completedAt ? <div className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-700"><CheckCircle2 className="mr-2 inline h-5 w-5" /> Completed. Show ID: {application.showId}</div> : <form onSubmit={save} className="space-y-4"><div><Label>Internal Sales Order Number</Label><Input value={internalSalesOrderNumber} onChange={(e) => setInternalSalesOrderNumber(e.target.value)} placeholder="Enter factory/internal number" /></div><div><Label>Internal Sales Order Number (Dealer)</Label><Input value={internalSalesOrderNumberDealer} onChange={(e) => setInternalSalesOrderNumberDealer(e.target.value)} placeholder="Enter dealer number" /></div><Button type="submit" disabled={saving} className="w-full bg-blue-700 hover:bg-blue-800">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save codes and add show</Button></form>}{message && <p className="font-semibold text-blue-700">{message}</p>}</CardContent></Card></div>;
}
