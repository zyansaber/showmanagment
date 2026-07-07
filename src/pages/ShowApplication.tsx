import { FormEvent, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ClipboardCheck, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { dbGet, dbSet } from '@/lib/firebase';

type ShowApplicationForm = {
  name: string;
  dealership: string;
  handoverDealer: string;
  startDate: string;
  finishDate: string;
  siteNumber: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  eventOrganiser: string;
  caravansOnDisplay: string;
  standSize: string;
  target2025: string;
  sales2025: string;
  target2026: string;
  notes: string;
};

type EmailSettings = {
  serviceId?: string;
  publicKey?: string;
  privateKey?: string;
  templateId?: string;
};

const emptyForm: ShowApplicationForm = {
  name: '',
  dealership: '',
  handoverDealer: '',
  startDate: '',
  finishDate: '',
  siteNumber: '',
  street: '',
  suburb: '',
  postcode: '',
  state: '',
  country: 'Australia',
  eventOrganiser: '',
  caravansOnDisplay: '',
  standSize: '',
  target2025: '',
  sales2025: '',
  target2026: '',
  notes: '',
};

const TICKET_BOOKING_TEMPLATE_ID = 'template_1qpfll8';

const formatAddress = (form: ShowApplicationForm) =>
  [form.siteNumber, form.street, form.suburb, form.state, form.postcode, form.country].filter(Boolean).join(' ');

const calculateDuration = (startDate: string, finishDate: string) => {
  const start = startDate ? new Date(startDate) : null;
  const finish = finishDate ? new Date(finishDate) : null;
  if (!start || !finish || Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) return 0;
  return Math.max(1, Math.round((finish.getTime() - start.getTime()) / 86400000) + 1);
};

const renderShowDetails = (form: ShowApplicationForm) => `
Show: ${form.name}
Dealership: ${form.dealership || '-'}
Handover Dealer: ${form.handoverDealer || '-'}
Dates: ${form.startDate || '-'} to ${form.finishDate || '-'}
Address: ${formatAddress(form) || '-'}
Event Organiser: ${form.eventOrganiser || '-'}
Caravans on Display: ${form.caravansOnDisplay || '-'}
Stand Size: ${form.standSize || '-'}
Target 2025: ${form.target2025 || '-'}
Sales 2025: ${form.sales2025 || '-'}
Target 2026: ${form.target2026 || '-'}
Notes: ${form.notes || '-'}
`.trim();

const sendEmailJs = async (toEmail: string, title: string, content: string) => {
  const settings = (await dbGet('settings/emailjsTicketBooking')) as EmailSettings | null;
  if (!toEmail || !settings?.serviceId || !settings?.publicKey) return false;
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: settings.serviceId,
      template_id: settings.templateId || TICKET_BOOKING_TEMPLATE_ID,
      user_id: settings.publicKey,
      accessToken: settings.privateKey,
      template_params: { to_email: toEmail, to_name: 'Show application reviewer', title, content, receipt: toEmail },
    }),
  });
  if (!response.ok) throw new Error(`EmailJS failed ${response.status}: ${await response.text()}`);
  return true;
};

export default function ShowApplication() {
  const [form, setForm] = useState<ShowApplicationForm>(emptyForm);
  const [status, setStatus] = useState('Ready for a new show application.');
  const [submitting, setSubmitting] = useState(false);


  const duration = useMemo(() => calculateDuration(form.startDate, form.finishDate), [form.startDate, form.finishDate]);

  const updateField = (key: keyof ShowApplicationForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));


  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    const requiredFields: Array<[keyof ShowApplicationForm, string]> = [
      ['name', 'Show Name'],
      ['dealership', 'Dealership'],
      ['handoverDealer', 'Handover Dealer'],
      ['startDate', 'Start Date'],
      ['finishDate', 'Finish Date'],
      ['postcode', 'Postcode'],
      ['state', 'State'],
      ['country', 'Country'],
      ['eventOrganiser', 'Event Organiser'],
      ['standSize', 'Stand Size'],
      ['target2025', '2025 Target'],
      ['sales2025', '2025 Sales'],
      ['target2026', '2026 Target'],
    ];
    const missingField = requiredFields.find(([key]) => !form[key].trim());
    if (missingField) {
      toast.error(`Please complete ${missingField[1]}.`);
      return;
    }
    setSubmitting(true);
    const id = uuidv4();
    const confirmUrl = `${window.location.origin}/show-application-confirm/${encodeURIComponent(id)}`;
    try {
      const applicationSettings = (await dbGet('settings/showApplication')) as { approverEmail?: string; financeEmail?: string } | null;
      const application = {
        id,
        form,
        status: 'Pending reviewer confirmation',
        submittedAt: new Date().toISOString(),
        confirmUrl,
        financeEmail: applicationSettings?.financeEmail || '',
      };
      await dbSet(`showApplications/${id}`, application as unknown as Record<string, unknown>);
      const emailed = await sendEmailJs(
        applicationSettings?.approverEmail || '',
        `New show submitted: ${form.name}`,
        `A new show has been submitted and needs confirmation.\n\n${renderShowDetails(form)}\n\nConfirm here: ${confirmUrl}`
      );
      setStatus(emailed ? 'Submitted. Confirmation email sent to the reviewer.' : 'Submitted. No reviewer email was sent because recipient or EmailJS settings are missing.');
      setForm(emptyForm);
      toast.success('Show application submitted.');
    } catch (err) {
      console.error(err);
      setStatus('Submission failed. Please check the console and try again.');
      toast.error('Failed to submit show application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 p-8 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100">Show Application</p>
            <h1 className="mt-2 text-4xl font-black">Submit a new show for approval</h1>
            <p className="mt-3 max-w-3xl text-blue-50">Fill in the same show fields needed for Add Show. Finance codes stay empty until the finance approver assigns them.</p>
          </div>
          <Badge className="w-fit bg-white/15 px-4 py-2 text-sm text-white backdrop-blur"><ClipboardCheck className="mr-2 h-4 w-4" /> {status}</Badge>
        </div>
      </div>


      <form onSubmit={submitApplication}>
        <Card>
          <CardHeader><CardTitle>Show details</CardTitle><CardDescription>Most fields are required. Caravans on Display, Site Number, Street, Suburb and Notes are optional.</CardDescription></CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Show Name *</Label><Input required value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. Melbourne Caravan Show" /></div>
            <div><Label>Dealership *</Label><Input required value={form.dealership} onChange={(e) => updateField('dealership', e.target.value)} /></div>
            <div><Label>Handover Dealer *</Label><Input required value={form.handoverDealer} onChange={(e) => updateField('handoverDealer', e.target.value)} /></div>
            <div><Label>Start Date *</Label><Input required type="date" value={form.startDate} onChange={(e) => updateField('startDate', e.target.value)} /></div>
            <div><Label>Finish Date *</Label><Input required type="date" value={form.finishDate} onChange={(e) => updateField('finishDate', e.target.value)} /></div>
            <div><Label>Show Duration</Label><Input value={duration ? `${duration} day${duration === 1 ? '' : 's'}` : ''} readOnly /></div>
            <div><Label>Caravans on Display (optional)</Label><Input type="number" min="0" value={form.caravansOnDisplay} onChange={(e) => updateField('caravansOnDisplay', e.target.value)} /></div>
            <div><Label>Site Number (optional)</Label><Input value={form.siteNumber} onChange={(e) => updateField('siteNumber', e.target.value)} /></div>
            <div><Label>Street (optional)</Label><Input value={form.street} onChange={(e) => updateField('street', e.target.value)} /></div>
            <div><Label>Suburb (optional)</Label><Input value={form.suburb} onChange={(e) => updateField('suburb', e.target.value)} /></div>
            <div><Label>Postcode *</Label><Input required value={form.postcode} onChange={(e) => updateField('postcode', e.target.value)} /></div>
            <div><Label>State *</Label><Input required value={form.state} onChange={(e) => updateField('state', e.target.value.toUpperCase())} placeholder="VIC" /></div>
            <div><Label>Country *</Label><Input required value={form.country} onChange={(e) => updateField('country', e.target.value)} /></div>
            <div><Label>Event Organiser *</Label><Input required value={form.eventOrganiser} onChange={(e) => updateField('eventOrganiser', e.target.value)} /></div>
            <div><Label>Stand Size *</Label><Input required value={form.standSize} onChange={(e) => updateField('standSize', e.target.value)} /></div>
            <div><Label>2025 Target *</Label><Input required type="number" min="0" value={form.target2025} onChange={(e) => updateField('target2025', e.target.value)} /></div>
            <div><Label>2025 Sales *</Label><Input required type="number" min="0" value={form.sales2025} onChange={(e) => updateField('sales2025', e.target.value)} /></div>
            <div><Label>2026 Target *</Label><Input required type="number" min="0" value={form.target2026} onChange={(e) => updateField('target2026', e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} placeholder="Anything the reviewer or finance team should know" /></div>
            <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={submitting} className="bg-blue-700 hover:bg-blue-800">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit show application</Button></div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export { renderShowDetails, calculateDuration, sendEmailJs };
export type { ShowApplicationForm };
