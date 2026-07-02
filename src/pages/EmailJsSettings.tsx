import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet } from '@/lib/firebase';

type EmailTemplateSettings = {
  subject: string;
  body: string;
  confirmationSubject: string;
  confirmationBody: string;
  confirmationReceipt: string;
  ticketApprovalReceipt: string;
  ticketApprovalSubject: string;
  ticketApprovalBody: string;
  serviceId: string;
  publicKey: string;
  privateKey: string;
};

const TICKET_BOOKING_TEMPLATE_ID = 'template_1qpfll8';

const defaults: EmailTemplateSettings = {
  subject: 'New ticket and booking files for {{show_name}}',
  body: 'Hi {{team_member_name}},\n\nNew files have been uploaded for {{show_name}}.\n\nFiles:\n{{file_links}}',
  confirmationSubject: 'Please confirm participants for {{show_name}}',
  confirmationBody: 'Hi {{team_member_name}},\n\nPlease confirm the participants for {{show_name}}.\n\nShow time: {{show_time}}\nParticipants: {{participants}}\n\nConfirm here: {{confirm_url}}',
  confirmationReceipt: '',
  ticketApprovalReceipt: '',
  ticketApprovalSubject: 'Ticket approval changing teammember required for {{show_name}}',
  ticketApprovalBody: 'Show manager has confirmed the following participants. Please approve ticket.\n\nShow: {{show_name}}\nParticipants: {{participants}}\n\nApprove here: {{approval_url}}',
  serviceId: 'service_d39k2lv',
  publicKey: 'Ox1_IwykSClDMOhqz',
  privateKey: 'Dg7xyuMhc-xtKQbROJT7H',
};

export default function EmailJsSettings() {
  const [settings, setSettings] = useState<EmailTemplateSettings>(defaults);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const data = await dbGet('settings/emailjsTicketBooking');
      if (data) setSettings({ ...defaults, ...(data as Partial<EmailTemplateSettings>) });
    };
    loadSettings();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await dbSet('settings/emailjsTicketBooking', { ...settings, templateId: TICKET_BOOKING_TEMPLATE_ID } as unknown as Record<string, unknown>);
      setMessage('EmailJS settings saved.');
    } catch (err) {
      console.error('Failed to save EmailJS settings:', err);
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">EmailJS Settings</h1>
        <p className="text-sm text-slate-500">Edit the single EmailJS template used by Ticket & Booking, confirmations, and team messages.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Shared EmailJS template</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Input value={settings.serviceId} onChange={(e) => setSettings({ ...settings, serviceId: e.target.value })} placeholder="EmailJS service ID" />
          <div className="rounded border bg-slate-50 px-3 py-2 text-sm text-slate-600">Shared template: <span className="font-semibold text-slate-900">{TICKET_BOOKING_TEMPLATE_ID}</span></div>
          <Input value={settings.publicKey} onChange={(e) => setSettings({ ...settings, publicKey: e.target.value })} placeholder="EmailJS public key" />
          <Input value={settings.privateKey} onChange={(e) => setSettings({ ...settings, privateKey: e.target.value })} placeholder="EmailJS private key" />
          <p className="text-xs text-slate-500">EmailJS template variables required in template_1qpfll8: {'{{title}}'}, {'{{content}}'}, {'{{receipt}}'}. Team portal emails also send {'{{portal_url}}'} for templates that want to render the member portal link separately.</p>

          <div className="rounded-lg border bg-slate-50 p-4">
            <h3 className="mb-3 font-semibold text-slate-900">1. Attachment upload / replacement email</h3>
            <Input value={settings.subject} onChange={(e) => setSettings({ ...settings, subject: e.target.value })} placeholder="Attachment email title" />
            <textarea value={settings.body} onChange={(e) => setSettings({ ...settings, body: e.target.value })} className="mt-4 min-h-40 w-full rounded border px-3 py-2 text-sm" />
            <p className="mt-2 text-xs text-slate-500">Sent to every admin email set in Admin Settings. Variables: {'{{team_member_name}}'}, {'{{show_name}}'}, {'{{file_links}}'}, {'{{uploaded_at}}'}.</p>
          </div>

          <div className="rounded-lg border bg-blue-50 p-4">
            <h3 className="mb-3 font-semibold text-slate-900">2. Participant confirmation email</h3>
            <Input value={settings.confirmationReceipt} onChange={(e) => setSettings({ ...settings, confirmationReceipt: e.target.value })} placeholder="Fixed confirmation receipt email (optional)" />
            <Input className="mt-4" value={settings.confirmationSubject} onChange={(e) => setSettings({ ...settings, confirmationSubject: e.target.value })} placeholder="Confirmation email title" />
            <textarea value={settings.confirmationBody} onChange={(e) => setSettings({ ...settings, confirmationBody: e.target.value })} className="mt-4 min-h-48 w-full rounded border px-3 py-2 text-sm" />
            <p className="mt-2 text-xs text-slate-500">If fixed receipt is blank, confirmations go to each participant email. Variables: {'{{team_member_name}}'}, {'{{show_name}}'}, {'{{show_time}}'}, {'{{participants}}'}, {'{{confirm_url}}'}.</p>
          </div>
          <div className="rounded-lg border bg-emerald-50 p-4">
            <h3 className="mb-3 font-semibold text-slate-900">3. Ticket approval email</h3>
            <Input value={settings.ticketApprovalReceipt} onChange={(e) => setSettings({ ...settings, ticketApprovalReceipt: e.target.value })} placeholder="Ticket approval receipt email" />
            <Input className="mt-4" value={settings.ticketApprovalSubject} onChange={(e) => setSettings({ ...settings, ticketApprovalSubject: e.target.value })} placeholder="Ticket approval title" />
            <textarea value={settings.ticketApprovalBody} onChange={(e) => setSettings({ ...settings, ticketApprovalBody: e.target.value })} className="mt-4 min-h-40 w-full rounded border px-3 py-2 text-sm" />
            <p className="mt-2 text-xs text-slate-500">Variables: {'{{show_name}}'}, {'{{participants}}'}, {'{{approval_url}}'}.</p>
          </div>
          <Button onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
