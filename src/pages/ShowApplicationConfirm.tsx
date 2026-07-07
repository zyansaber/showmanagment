import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet, dbSet } from '@/lib/firebase';
import { calculateDuration, renderShowDetails, sendEmailJs, type ShowApplicationForm } from './ShowApplication';

type Application = { id: string; form: ShowApplicationForm; status: string; submittedAt?: string; confirmedAt?: string; financeEmail?: string; financeUrl?: string };

type DetailRow = { label: string; value?: string | number };

const valueOrDash = (value?: string | number) => (value === undefined || value === null || value === '' ? '-' : value);
const row = ({ label, value }: DetailRow) => <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{valueOrDash(value)}</div></div>;

const buildDetailRows = (form: ShowApplicationForm, application: Application): DetailRow[] => [
  { label: 'Show Name', value: form.name },
  { label: 'Application Status', value: application.status },
  { label: 'Submitted', value: application.submittedAt ? new Date(application.submittedAt).toLocaleString() : '-' },
  { label: 'Dealership', value: form.dealership },
  { label: 'Handover Dealer', value: form.handoverDealer },
  { label: 'Event Organiser', value: form.eventOrganiser },
  { label: 'Start Date', value: form.startDate },
  { label: 'Finish Date', value: form.finishDate },
  { label: 'Show Duration', value: calculateDuration(form.startDate, form.finishDate) ? `${calculateDuration(form.startDate, form.finishDate)} day(s)` : '-' },
  { label: 'Site Number', value: form.siteNumber },
  { label: 'Street', value: form.street },
  { label: 'Suburb', value: form.suburb },
  { label: 'Postcode', value: form.postcode },
  { label: 'State', value: form.state },
  { label: 'Country', value: form.country },
  { label: 'Caravans on Display', value: form.caravansOnDisplay },
  { label: 'Stand Size', value: form.standSize },
  { label: '2025 Target', value: form.target2025 },
  { label: '2025 Sales', value: form.sales2025 },
  { label: '2026 Target', value: form.target2026 },
];

export default function ShowApplicationConfirm() {
  const { token = '' } = useParams();
  const [application, setApplication] = useState<Application | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    (async () => {
      const data = (await dbGet(`showApplications/${decodeURIComponent(token)}`)) as Application | null;
      setApplication(data);
      setLoading(false);
    })();
  }, [token]);

  const confirm = async () => {
    if (!application) return;
    setConfirming(true);
    const financeUrl = `${window.location.origin}/show-application-finance/${encodeURIComponent(application.id)}`;
    const next = { ...application, status: 'Pending finance code assignment', confirmedAt: new Date().toISOString(), financeUrl };
    try {
      await dbSet(`showApplications/${application.id}`, next as unknown as Record<string, unknown>);
      setApplication(next);
      const emailed = await sendEmailJs(
        application.financeEmail || '',
        `Internal Sales Order Number required: ${application.form.name}`,
        `A new show has been confirmed and needs Internal Sales Order Number values.\n\n${renderShowDetails(application.form)}\n\nAssign finance codes here: ${financeUrl}`
      );
      setMessage(emailed ? 'Confirmed. Finance email has been sent.' : 'Confirmed. Finance email was not sent because recipient or EmailJS settings are missing.');
    } catch (err) {
      console.error(err);
      setMessage('Confirmation failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!application) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Show application address not found.</div>;
  const form = application.form;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6">
      <Card className="mx-auto max-w-6xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-r from-slate-900 to-blue-800 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100">Reviewer confirmation</p>
          <h1 className="mt-2 text-4xl font-black">{form.name}</h1>
          <p className="mt-2 text-blue-100">Review the link and every submitted show detail, then confirm to notify finance.</p>
        </div>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Full show application details</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><b>Finance assignment link:</b> {application.financeUrl || 'Will be created after confirmation.'}</div>
          <div className="grid gap-4 md:grid-cols-3">
            {buildDetailRows(form, application).map((detail) => <div key={detail.label}>{row(detail)}</div>)}
          </div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-500">Notes</div><p className="mt-1 whitespace-pre-wrap text-slate-800">{valueOrDash(form.notes)}</p></div>
          {application.confirmedAt ? <div className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-700">Confirmed at {new Date(application.confirmedAt).toLocaleString()}</div> : <Button onClick={confirm} disabled={confirming} className="w-full bg-emerald-600 hover:bg-emerald-700">{confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Confirm and email finance</Button>}
          {message && <p className="text-sm font-semibold text-blue-700">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
