import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet } from '@/lib/firebase';

type EmailTemplateSettings = {
  subject: string;
  body: string;
  serviceId: string;
  templateId: string;
  publicKey: string;
  privateKey: string;
};

const defaults: EmailTemplateSettings = {
  subject: 'New ticket and booking files for {{show_name}}',
  body: 'Hi {{team_member_name}},\n\nNew files have been uploaded for {{show_name}}.\n\nFiles:\n{{file_links}}',
  serviceId: 'service_d39k2lv',
  templateId: 'template_7780rdu',
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
      await dbSet('settings/emailjsTicketBooking', settings as unknown as Record<string, unknown>);
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
        <p className="text-sm text-slate-500">Edit how team members should be emailed when ticket and booking files are uploaded.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Ticket upload email template</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Input value={settings.serviceId} onChange={(e) => setSettings({ ...settings, serviceId: e.target.value })} placeholder="EmailJS service ID" />
          <Input value={settings.templateId} onChange={(e) => setSettings({ ...settings, templateId: e.target.value })} placeholder="EmailJS template ID" />
          <Input value={settings.publicKey} onChange={(e) => setSettings({ ...settings, publicKey: e.target.value })} placeholder="EmailJS public key" />
          <Input value={settings.privateKey} onChange={(e) => setSettings({ ...settings, privateKey: e.target.value })} placeholder="EmailJS private key" />
          <Input value={settings.subject} onChange={(e) => setSettings({ ...settings, subject: e.target.value })} placeholder="Subject" />
          <textarea value={settings.body} onChange={(e) => setSettings({ ...settings, body: e.target.value })} className="min-h-48 rounded border px-3 py-2 text-sm" />
          <p className="text-xs text-slate-500">Available variables: {'{{team_member_name}}'}, {'{{show_name}}'}, {'{{file_links}}'}, {'{{uploaded_at}}'}.</p>
          <Button onClick={saveSettings} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
