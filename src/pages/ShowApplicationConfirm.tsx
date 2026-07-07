import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet, dbSet } from '@/lib/firebase';
import { renderShowDetails, sendEmailJs, type ShowApplicationForm } from './ShowApplication';

type Application = { id: string; form: ShowApplicationForm; status: string; submittedAt?: string; confirmedAt?: string; financeEmail?: string; financeUrl?: string };

const row = (label: string, value?: string | number) => <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 font-semibold text-slate-900">{value || '-'}</div></div>;

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
      <Card className="mx-auto max-w-5xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-r from-slate-900 to-blue-800 p-8 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100">Reviewer confirmation</p>
          <h1 className="mt-2 text-4xl font-black">{form.name}</h1>
          <p className="mt-2 text-blue-100">Review the link and all show table contents, then confirm to notify finance.</p>
        </div>
        <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Show application details</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><b>Finance assignment link:</b> {application.financeUrl || 'Will be created after confirmation.'}</div>
          <div className="grid gap-4 md:grid-cols-3">
            {row('Dealership', form.dealership)}{row('Handover Dealer', form.handoverDealer)}{row('Date', `${form.startDate || '-'} to ${form.finishDate || '-'}`)}
            {row('Site', [form.siteNumber, form.street].filter(Boolean).join(' '))}{row('Suburb / State', [form.suburb, form.state, form.postcode].filter(Boolean).join(' '))}{row('Country', form.country)}
            {row('Event Organiser', form.eventOrganiser)}{row('Caravans', form.caravansOnDisplay)}{row('Stand Size', form.standSize)}
            {row('Layout Address', form.layoutAddress)}{row('SAP Expense Code', form.sapExpenseCode)}{row('Submitted', application.submittedAt ? new Date(application.submittedAt).toLocaleString() : '-')}
          </div>
          {form.notes && <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-500">Notes</div><p className="mt-1 whitespace-pre-wrap text-slate-800">{form.notes}</p></div>}
          {application.confirmedAt ? <div className="rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-700">Confirmed at {new Date(application.confirmedAt).toLocaleString()}</div> : <Button onClick={confirm} disabled={confirming} className="w-full bg-emerald-600 hover:bg-emerald-700">{confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Confirm and email finance</Button>}
          {message && <p className="text-sm font-semibold text-blue-700">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
