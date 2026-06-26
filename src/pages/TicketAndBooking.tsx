import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, History, Mail, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet, uploadStorageFile } from '@/lib/firebase';

type ShowRecord = { id?: string; name?: string; startDate?: string; finishDate?: string; teamMembers?: string[] };
type TeamMember = { id?: string; memberId?: string; memberName?: string; email?: string; activeFlag?: number };
type TicketFile = { id: string; showId: string; teamMemberId: string; displayName: string; fileName: string; path: string; url: string; uploadedAt: string; replacedAt?: string };
type ConfirmRequest = { id: string; showId: string; token: string; requestedAt: string; confirmUrl: string; confirmedAt?: string; participantIds: string[] };
type EmailSettings = { serviceId: string; templateId: string; publicKey: string; privateKey: string; confirmationSubject: string; confirmationBody: string };

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');
const parseDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value?: string) => parseDate(value)?.toLocaleDateString() || value || '-';
const nextThreeMonths = (shows: ShowRecord[]) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setMonth(end.getMonth() + 3);
  return shows.filter((show) => {
    const date = parseDate(show.startDate) || parseDate(show.finishDate);
    return date && date >= today && date <= end;
  }).sort((a, b) => (parseDate(a.startDate)?.getTime() || 0) - (parseDate(b.startDate)?.getTime() || 0));
};


const renderTemplate = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template);

const sendEmailJs = async (toEmail: string, toName: string, params: Record<string, unknown>, settings: EmailSettings) => {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: settings.serviceId,
      template_id: settings.templateId,
      user_id: settings.publicKey,
      accessToken: settings.privateKey,
      template_params: { to_email: toEmail, to_name: toName, ...params },
    }),
  });
  if (!response.ok) throw new Error(`EmailJS failed ${response.status}: ${await response.text()}`);
};

export default function TicketAndBooking() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [ticketFiles, setTicketFiles] = useState<TicketFile[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmRequest[]>([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const quickFileRef = useRef<HTMLInputElement>(null);
  const [quickUpload, setQuickUpload] = useState<{ showId: string; memberId: string; displayName: string; replaceId?: string } | null>(null);

  const loadData = async () => {
    const [showsData, teamData, filesData, confirmData] = await Promise.all([dbGet('shows'), dbGet('teamMembers'), dbGet('ticketAndBookingFiles'), dbGet('ticketBookingConfirmations')]);
    setShows(normaliseList<ShowRecord>(showsData));
    setTeamMembers(normaliseList<TeamMember>(teamData).filter((member) => member.activeFlag === 1));
    setTicketFiles(normaliseList<TicketFile>(filesData).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')));
    setConfirmations(normaliseList<ConfirmRequest>(confirmData));
  };

  useEffect(() => { loadData(); }, []);

  const selectedShow = useMemo(() => shows.find((show) => show.id === selectedShowId), [selectedShowId, shows]);
  const selectedMember = useMemo(() => teamMembers.find((member) => member.memberId === selectedMemberId), [selectedMemberId, teamMembers]);
  const memberById = useMemo(() => Object.fromEntries(teamMembers.map((member) => [member.memberId, member])), [teamMembers]);
  const upcomingShows = useMemo(() => nextThreeMonths(shows), [shows]);

  const uploadOne = async (showId: string, memberId: string, file: File, name: string, replaceId?: string) => {
    const id = replaceId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `ticket_and_booking/${showId}/${memberId}/${id}-${safeFileName(file.name)}`;
    const url = await uploadStorageFile(path, file);
    const existing = ticketFiles.find((item) => item.id === replaceId);
    const record: TicketFile = { id, showId, teamMemberId: memberId, displayName: name || file.name, fileName: file.name, path, url, uploadedAt: existing?.uploadedAt || new Date().toISOString(), replacedAt: replaceId ? new Date().toISOString() : undefined };
    await dbSet(`ticketAndBookingFiles/${id}`, record as unknown as Record<string, unknown>);
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files || []));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedShowId || !selectedMemberId || files.length === 0) return setMessage('Please choose a show, team member, and at least one file.');
    setUploading(true); setMessage('');
    try {
      for (const file of files) await uploadOne(selectedShowId, selectedMemberId, file, displayName);
      setMessage(`Uploaded ${files.length} file(s) for ${selectedMember?.memberName || 'team member'} / ${selectedShow?.name || 'show'}.`);
      setFiles([]); setDisplayName(''); await loadData();
    } catch (err) { console.error(err); setMessage('Upload failed. Please try again.'); } finally { setUploading(false); }
  };

  const openQuickUpload = (showId: string, memberId: string, name = 'Flight ticket', replaceId?: string) => {
    setQuickUpload({ showId, memberId, displayName: name, replaceId });
    quickFileRef.current?.click();
  };

  const handleQuickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !quickUpload) return;
    setUploading(true);
    try {
      await uploadOne(quickUpload.showId, quickUpload.memberId, file, quickUpload.displayName, quickUpload.replaceId);
      setMessage(quickUpload.replaceId ? 'Upload record replaced.' : 'File uploaded.');
      await loadData();
    } catch (err) { console.error(err); setMessage('Upload failed.'); } finally { setUploading(false); setQuickUpload(null); }
  };

  const askForConfirm = async (show: ShowRecord) => {
    const participants = (show.teamMembers || []).map((id) => memberById[id]).filter(Boolean);
    const recipients = participants.filter((member) => member.email);
    if (!show.id || recipients.length === 0) return setMessage('This show has no participants with email addresses.');
    const token = `${show.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const confirmUrl = `${window.location.origin}/ticket-confirm/${encodeURIComponent(token)}`;
    const record: ConfirmRequest = { id: token, token, showId: show.id, requestedAt: new Date().toISOString(), confirmUrl, participantIds: participants.map((member) => member.memberId || '').filter(Boolean) };
    const settings = (await dbGet('settings/emailjsTicketBooking')) as Partial<EmailSettings> | null;
    const emailSettings: EmailSettings = {
      serviceId: settings?.serviceId || 'service_d39k2lv',
      templateId: settings?.templateId || 'template_7780rdu',
      publicKey: settings?.publicKey || 'Ox1_IwykSClDMOhqz',
      privateKey: settings?.privateKey || 'Dg7xyuMhc-xtKQbROJT7H',
      confirmationSubject: settings?.confirmationSubject || 'Please confirm participants for {{show_name}}',
      confirmationBody: settings?.confirmationBody || 'Hi {{team_member_name}},\n\nPlease confirm the participants for {{show_name}}.\n\nShow time: {{show_time}}\nParticipants: {{participants}}\n\nConfirm here: {{confirm_url}}',
    };
    const showTime = `${formatDate(show.startDate)} - ${formatDate(show.finishDate)}`;
    const participantNames = participants.map((p) => p.memberName || p.memberId).join(', ');
    await dbSet(`ticketBookingConfirmations/${token}`, record as unknown as Record<string, unknown>);
    await Promise.all(recipients.map((member) => {
      const variables = {
        team_member_name: member.memberName || 'Team member',
        show_name: show.name || 'Show',
        show_time: showTime,
        participants: participantNames,
        confirm_url: confirmUrl,
      };
      return sendEmailJs(member.email || '', member.memberName || 'Team member', {
        subject: renderTemplate(emailSettings.confirmationSubject, variables),
        message: renderTemplate(emailSettings.confirmationBody, variables),
        show_name: variables.show_name,
        show_time: variables.show_time,
        participants: variables.participants,
        confirm_url: variables.confirm_url,
      }, emailSettings);
    }));
    setMessage(`Confirmation email sent. New address: ${confirmUrl}`);
    await loadData();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <input ref={quickFileRef} type="file" className="hidden" onChange={handleQuickFile} />
      <div><h1 className="text-3xl font-bold text-slate-900">Ticket & Booking</h1><p className="text-sm text-slate-500">Upload attachments, replace wrong files, and confirm show participants.</p></div>
      {message && <div className="rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-800">{message}</div>}

      <Card><CardHeader><CardTitle>Shows in the next 3 months</CardTitle></CardHeader><CardContent className="space-y-4">
        {upcomingShows.map((show) => {
          const participants = (show.teamMembers || []).map((id) => memberById[id]).filter(Boolean);
          const confirmation = confirmations.find((item) => item.showId === show.id && item.confirmedAt);
          return <div key={show.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black text-slate-900">{show.name}</h2><p className="text-sm text-slate-500">{formatDate(show.startDate)} - {formatDate(show.finishDate)}</p>{confirmation && <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />Confirmed {new Date(confirmation.confirmedAt || '').toLocaleString()}</p>}</div><Button onClick={() => askForConfirm(show)} disabled={uploading} className="gap-2"><Mail className="h-4 w-4" />Ask for confirm</Button></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {participants.map((member) => {
                const memberFiles = ticketFiles.filter((file) => file.showId === show.id && file.teamMemberId === member.memberId);
                return <div key={member.memberId} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="font-bold text-slate-900">{member.memberName || member.memberId}</div><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => openQuickUpload(show.id || '', member.memberId || '', 'Flight ticket')} disabled={uploading}>Upload flight ticket</Button><Button size="sm" variant="outline" onClick={() => openQuickUpload(show.id || '', member.memberId || '', 'Other')} disabled={uploading}>Upload other</Button></div>{memberFiles.length > 0 && <div className="mt-3 space-y-2">{memberFiles.map((file) => <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2"><a href={file.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">{file.displayName}</a><Button size="sm" variant="outline" className="gap-1" onClick={() => openQuickUpload(show.id || '', member.memberId || '', file.displayName, file.id)}><History className="h-3 w-3" />Replace</Button></div>)}</div>}</div>;
              })}
            </div>
          </div>;
        })}
        {!upcomingShows.length && <p className="text-sm text-slate-500">No shows found in the next three months.</p>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />Upload attachments (existing method)</CardTitle></CardHeader><CardContent><form onSubmit={handleSubmit} className="grid gap-4"><select value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)} className="rounded border px-3 py-2"><option value="">Select show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select><select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} className="rounded border px-3 py-2"><option value="">Select team member</option>{teamMembers.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}</select><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Attachment display name (optional)" /><Input type="file" multiple onChange={handleFiles} /><Button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload Files'}</Button></form></CardContent></Card>
    </div>
  );
}
