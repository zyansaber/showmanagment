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
        <p className="text-sm text-slate-500">Edit EmailJS credentials and the email templates used by Ticket & Booking.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Ticket upload email template</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Input value={settings.serviceId} onChange={(e) => setSettings({ ...settings, serviceId: e.target.value })} placeholder="EmailJS service ID" />
          <div className="rounded border bg-slate-50 px-3 py-2 text-sm text-slate-600">Ticket & Booking template: <span className="font-semibold text-slate-900">{TICKET_BOOKING_TEMPLATE_ID}</span></div>
          <Input value={settings.publicKey} onChange={(e) => setSettings({ ...settings, publicKey: e.target.value })} placeholder="EmailJS public key" />
          <Input value={settings.privateKey} onChange={(e) => setSettings({ ...settings, privateKey: e.target.value })} placeholder="EmailJS private key" />
          <Input value={settings.subject} onChange={(e) => setSettings({ ...settings, subject: e.target.value })} placeholder="Subject" />
          <textarea value={settings.body} onChange={(e) => setSettings({ ...settings, body: e.target.value })} className="min-h-48 rounded border px-3 py-2 text-sm" />
          <p className="text-xs text-slate-500">Upload variables: {'{{team_member_name}}'}, {'{{show_name}}'}, {'{{file_links}}'}, {'{{uploaded_at}}'}.</p>
          <div className="rounded-lg border bg-slate-50 p-4">
            <h3 className="mb-3 font-semibold text-slate-900">Participant confirmation email template</h3>
            <Input value={settings.confirmationSubject} onChange={(e) => setSettings({ ...settings, confirmationSubject: e.target.value })} placeholder="Confirmation subject" />
            <textarea value={settings.confirmationBody} onChange={(e) => setSettings({ ...settings, confirmationBody: e.target.value })} className="mt-4 min-h-48 w-full rounded border px-3 py-2 text-sm" />
            <p className="mt-2 text-xs text-slate-500">Confirmation variables: {'{{team_member_name}}'}, {'{{show_name}}'}, {'{{show_time}}'}, {'{{participants}}'}, {'{{confirm_url}}'}.</p>
          </div>
          <Button onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
