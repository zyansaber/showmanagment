import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, History, Mail, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet, dbSubscribe, uploadStorageFile } from '@/lib/firebase';

type ShowRecord = { id?: string; name?: string; startDate?: string; finishDate?: string; teamMembers?: string[] };
type TeamMember = { id?: string; memberId?: string; memberName?: string; email?: string; activeFlag?: number };
type TicketFile = { id: string; showId: string; teamMemberId: string; displayName: string; fileName: string; path: string; url: string; uploadedAt: string; replacedAt?: string };
type ConfirmRequest = { id: string; showId: string; token: string; requestedAt: string; confirmUrl: string; confirmedAt?: string; participantIds: string[]; confirmedParticipantIds?: string[]; approvedAt?: string; approvedParticipantIds?: string[]; requiresTicketApproval?: boolean };
type EmailSettings = { serviceId: string; templateId: string; publicKey: string; privateKey: string; subject: string; body: string; confirmationSubject: string; confirmationBody: string; confirmationReceipt?: string };

const TICKET_BOOKING_TEMPLATE_ID = 'template_1qpfll8';

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');
const isDealershipMember = (member?: TeamMember) =>
  (member?.memberName || member?.memberId || '').trim().toLowerCase() === 'dealership';
const parseDate = (value?: string) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatDate = (value?: string) => {
  const date = parseDate(value);
  if (!date) return value || '-';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};
const daysUntil = (value?: string) => {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
};
const nextThreeMonths = (shows: ShowRecord[]) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setMonth(end.getMonth() + 3);
  return shows.filter((show) => {
    const date = parseDate(show.startDate) || parseDate(show.finishDate);
    return date && date >= today && date <= end;
  }).sort((a, b) => (parseDate(a.startDate)?.getTime() || 0) - (parseDate(b.startDate)?.getTime() || 0));
};


const haveSameMembers = (left: string[], right: string[]) => left.length === right.length && left.every((id) => right.includes(id));

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

const loadEmailSettings = async (): Promise<EmailSettings> => {
  const settings = (await dbGet('settings/emailjsTicketBooking')) as Partial<EmailSettings> | null;
  return {
    serviceId: settings?.serviceId || 'service_d39k2lv',
    templateId: TICKET_BOOKING_TEMPLATE_ID,
    publicKey: settings?.publicKey || 'Ox1_IwykSClDMOhqz',
    privateKey: settings?.privateKey || 'Dg7xyuMhc-xtKQbROJT7H',
    subject: settings?.subject || 'New ticket and booking files for {{show_name}}',
    body: settings?.body || 'Hi {{team_member_name}},\n\nNew files have been uploaded for {{show_name}}.\n\nFiles:\n{{file_links}}',
    confirmationSubject: settings?.confirmationSubject || 'Please confirm participants for {{show_name}}',
    confirmationBody: settings?.confirmationBody || 'Hi {{team_member_name}},\n\nPlease confirm the participants for {{show_name}}.\n\nShow time: {{show_time}}\nParticipants: {{participants}}\n\nConfirm here: {{confirm_url}}',
    confirmationReceipt: settings?.confirmationReceipt || '',
  };
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
  const [draggingQuickTarget, setDraggingQuickTarget] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const quickFileRef = useRef<HTMLInputElement>(null);
  const [quickUpload, setQuickUpload] = useState<{ showId: string; memberId: string; displayName: string; replaceId?: string } | null>(null);

  const applyRealtimeData = (path: string, value: unknown) => {
    if (path === 'shows') setShows(normaliseList<ShowRecord>(value));
    if (path === 'teamMembers') setTeamMembers(normaliseList<TeamMember>(value).filter((member) => member.activeFlag === 1));
    if (path === 'ticketAndBookingFiles') setTicketFiles(normaliseList<TicketFile>(value).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')));
    if (path === 'ticketBookingConfirmations') setConfirmations(normaliseList<ConfirmRequest>(value));
  };

  useEffect(() => {
    const paths = ['shows', 'teamMembers', 'ticketAndBookingFiles', 'ticketBookingConfirmations'];
    const unsubscribers = paths.map((path) => dbSubscribe(path, (value) => applyRealtimeData(path, value)));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  const selectedShow = useMemo(() => shows.find((show) => show.id === selectedShowId), [selectedShowId, shows]);
  const selectedMember = useMemo(() => teamMembers.find((member) => member.memberId === selectedMemberId), [selectedMemberId, teamMembers]);
  const memberById = useMemo(() => Object.fromEntries(teamMembers.map((member) => [member.memberId, member])), [teamMembers]);
  const upcomingShows = useMemo(() => nextThreeMonths(shows), [shows]);

  const uploadOne = async (showId: string, memberId: string, file: File, name: string, replaceId?: string) => {
    const id = replaceId || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `ticket_and_booking/${showId}/${memberId}/${id}-${safeFileName(file.name)}`;
    const url = await uploadStorageFile(path, file);
    const existing = ticketFiles.find((item) => item.id === replaceId);
    const record: TicketFile = {
      id,
      showId,
      teamMemberId: memberId,
      displayName: name || file.name,
      fileName: file.name,
      path,
      url,
      uploadedAt: existing?.uploadedAt || new Date().toISOString(),
      ...(replaceId ? { replacedAt: new Date().toISOString() } : {}),
    };
    await dbSet(`ticketAndBookingFiles/${id}`, record as unknown as Record<string, unknown>);
    return record;
  };



  const notifyAttachmentUpdate = async (record: TicketFile, wasReplacement: boolean) => {
    const member = teamMembers.find((item) => item.memberId === record.teamMemberId);
    const show = shows.find((item) => item.id === record.showId);
    const authAccounts = normaliseList<{ username?: string; role?: string; email?: string }>(await dbGet('authAccounts'));
    const adminRecipients = authAccounts.filter((account) => account.role === 'admin' && account.email);
    if (adminRecipients.length === 0) return;
    const settings = await loadEmailSettings();
    const title = wasReplacement ? 'Ticket & Booking attachment updated' : 'New ticket and booking files upload';
    const content = [
      `Show: ${show?.name || record.showId}`,
      `Team member: ${member?.memberName || record.teamMemberId}`,
      `Attachment: ${record.displayName}`,
      `File: ${record.fileName}`,
      `Uploaded at: ${new Date(record.replacedAt || record.uploadedAt).toLocaleString()}`,
      `Download: ${record.url}`,
    ].join('\n');
    await Promise.all(adminRecipients.map((admin) => sendEmailJs(admin.email || '', admin.username || 'Admin', {
      title,
      content,
      receipt: admin.email,
    }, settings)));
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => setFiles(Array.from(event.target.files || []));

  const uploadQuickFiles = async (showId: string, memberId: string, incomingFiles: File[], name: string, replaceId?: string) => {
    if (incomingFiles.length === 0) return;
    const filesToUpload = replaceId ? incomingFiles.slice(0, 1) : incomingFiles;
    setUploading(true);
    try {
      for (const file of filesToUpload) {
        const record = await uploadOne(showId, memberId, file, name, replaceId);
        try {
          await notifyAttachmentUpdate(record, Boolean(replaceId));
        } catch (emailErr) {
          console.error('Attachment notification email failed:', emailErr);
        }
      }
      setMessage(replaceId ? 'Upload record replaced.' : `${filesToUpload.length} file(s) uploaded.`);
    } catch (err) {
      console.error('Ticket and booking quick upload failed:', err);
      setMessage(`Upload failed: ${err instanceof Error ? err.message : 'Please check Firebase Storage permissions and network.'}`);
    } finally { setUploading(false); setDraggingQuickTarget(''); }
  };

  const handleQuickDrop = async (event: DragEvent<HTMLButtonElement>, showId: string, memberId: string, name: string, replaceId?: string) => {
    event.preventDefault();
    await uploadQuickFiles(showId, memberId, Array.from(event.dataTransfer.files || []), name, replaceId);
  };

  const quickUploadClass = (target: string) => draggingQuickTarget === target ? 'border-blue-500 bg-blue-50 text-blue-700' : '';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedShowId || !selectedMemberId || files.length === 0) return setMessage('Please choose a show, team member, and at least one file.');
    setUploading(true); setMessage('');
    try {
      for (const file of files) {
        const record = await uploadOne(selectedShowId, selectedMemberId, file, displayName);
        try {
          await notifyAttachmentUpdate(record, false);
        } catch (emailErr) {
          console.error('Attachment notification email failed:', emailErr);
        }
      }
      setMessage(`Uploaded ${files.length} file(s) for ${selectedMember?.memberName || 'team member'} / ${selectedShow?.name || 'show'}.`);
      setFiles([]); setDisplayName('');
    } catch (err) {
      console.error('Ticket and booking upload failed:', err);
      setMessage(`Upload failed: ${err instanceof Error ? err.message : 'Please check Firebase Storage permissions and network.'}`);
    } finally { setUploading(false); }
  };

  const openQuickUpload = (showId: string, memberId: string, name = 'Flight ticket', replaceId?: string) => {
    setQuickUpload({ showId, memberId, displayName: name, replaceId });
    quickFileRef.current?.click();
  };

  const handleQuickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !quickUpload) return;
    await uploadQuickFiles(quickUpload.showId, quickUpload.memberId, [file], quickUpload.displayName, quickUpload.replaceId);
    setQuickUpload(null);
  };

  const askForConfirm = async (show: ShowRecord) => {
    const participants = (show.teamMembers || []).map((id) => memberById[id]).filter((member) => member && !isDealershipMember(member));
    const recipients = participants.filter((member) => member.email);
    const emailSettings = await loadEmailSettings();
    if (!show.id || (recipients.length === 0 && !emailSettings.confirmationReceipt)) return setMessage('This show has no participants with email addresses.');
    const token = `${show.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const confirmUrl = `${window.location.origin}/ticket-confirm/${encodeURIComponent(token)}`;
    const participantIds = participants.map((member) => member.memberId || '').filter(Boolean);
    const latestConfirmation = latestConfirmedByShowId[show.id];
    const latestConfirmedIds = latestConfirmation?.confirmedParticipantIds || latestConfirmation?.participantIds || [];
    const requiresTicketApproval = Boolean(latestConfirmation?.confirmedAt) && !haveSameMembers(participantIds, latestConfirmedIds);
    const record: ConfirmRequest = { id: token, token, showId: show.id, requestedAt: new Date().toISOString(), confirmUrl, participantIds, requiresTicketApproval };
    const showTime = `${formatDate(show.startDate)} - ${formatDate(show.finishDate)}`;
    const participantNames = participants.map((p) => p.memberName || p.memberId).join(', ');
    await dbSet(`ticketBookingConfirmations/${token}`, record as unknown as Record<string, unknown>);
    const confirmationRecipients = emailSettings.confirmationReceipt
      ? [{ email: emailSettings.confirmationReceipt, memberName: 'Confirmation recipient' }]
      : recipients;
    await Promise.all(confirmationRecipients.map((member) => {
      const receipt = member.email || '';
      const variables = {
        team_member_name: member.memberName || 'Team member',
        show_name: show.name || 'Show',
        show_time: showTime,
        participants: participantNames,
        confirm_url: confirmUrl,
      };
      return sendEmailJs(receipt, member.memberName || 'Team member', {
        title: renderTemplate(emailSettings.confirmationSubject, variables),
        content: renderTemplate(emailSettings.confirmationBody, variables),
        receipt,
      }, emailSettings);
    }));
    setMessage(`Confirmation email sent. New address: ${confirmUrl}`);
  };


  const latestConfirmedByShowId = confirmations.reduce((acc, item) => {
    if (!item.showId || !item.confirmedAt) return acc;
    const current = acc[item.showId];
    if (!current || (item.confirmedAt || '').localeCompare(current.confirmedAt || '') > 0) acc[item.showId] = item;
    return acc;
  }, {} as Record<string, ConfirmRequest>);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <input ref={quickFileRef} type="file" className="hidden" onChange={handleQuickFile} />
      <div><h1 className="text-3xl font-bold text-slate-900">Ticket & Booking</h1><p className="text-sm text-slate-500">Upload attachments, replace wrong files, and confirm show participants.</p></div>
      {message && <div className="rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-800">{message}</div>}

      <Card><CardHeader><CardTitle>Shows in the next 3 months</CardTitle></CardHeader><CardContent className="space-y-4">
        {upcomingShows.map((show) => {
          const participants = (show.teamMembers || []).map((id) => memberById[id]).filter((member) => member && !isDealershipMember(member));
          const remainingDays = daysUntil(show.startDate);
          const confirmation = latestConfirmedByShowId[show.id || ''];
          const confirmedIds = new Set(confirmation?.confirmedParticipantIds || confirmation?.participantIds || []);
          const approvedIds = new Set(confirmation?.approvedParticipantIds || []);
          const currentIds = new Set(show.teamMembers || []);
          const removedConfirmedIds = [...confirmedIds].filter((id) => !currentIds.has(id));
          return <div key={show.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black text-slate-900">{show.name}</h2><p className="text-sm text-slate-500">{formatDate(show.startDate)} - {formatDate(show.finishDate)}</p>{remainingDays !== null && <p className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${remainingDays <= 14 ? 'bg-red-100 text-red-700' : remainingDays <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{remainingDays >= 0 ? `${remainingDays} days until show` : `${Math.abs(remainingDays)} days since show started`}</p>}{confirmation && <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />Latest confirmed {new Date(confirmation.confirmedAt || '').toLocaleString()}{confirmation.approvedAt ? ` · Approved ${new Date(confirmation.approvedAt).toLocaleString()}` : ''}</p>}</div><Button onClick={() => askForConfirm(show)} disabled={uploading} className="gap-2"><Mail className="h-4 w-4" />Ask for confirm</Button></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {participants.map((member) => {
                const memberFiles = ticketFiles.filter((file) => file.showId === show.id && file.teamMemberId === member.memberId);
                const isConfirmed = confirmedIds.has(member.memberId || '');
                const isNewSinceConfirm = Boolean(confirmation) && !isConfirmed;
                const isApproved = approvedIds.has(member.memberId || '');
                const flightFile = memberFiles.find((file) => (file.displayName || '').toLowerCase() === 'flight ticket');
                const flightTarget = `${show.id}-${member.memberId}-flight`;
                const otherTarget = `${show.id}-${member.memberId}-other`;
                return <div key={member.memberId} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{member.memberName || member.memberId}</span>{isConfirmed && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Confirmed</span>}{isApproved && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Ticket approved</span>}{isNewSinceConfirm && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">New after last confirm</span>}</div>{isNewSinceConfirm && <Button size="sm" variant="secondary" className="mt-2" onClick={() => askForConfirm(show)} disabled={uploading}>Confirm for new added member</Button>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => openQuickUpload(show.id || '', member.memberId || '', 'Flight ticket', flightFile?.id)} onDragEnter={(event) => { event.preventDefault(); setDraggingQuickTarget(flightTarget); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingQuickTarget('')} onDrop={(event) => handleQuickDrop(event, show.id || '', member.memberId || '', 'Flight ticket', flightFile?.id)} disabled={uploading} className={`border border-dashed ${quickUploadClass(flightTarget)}`}>{flightFile ? 'Update file' : 'Upload flight ticket'}</Button><Button size="sm" variant="outline" onClick={() => openQuickUpload(show.id || '', member.memberId || '', 'Other')} onDragEnter={(event) => { event.preventDefault(); setDraggingQuickTarget(otherTarget); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingQuickTarget('')} onDrop={(event) => handleQuickDrop(event, show.id || '', member.memberId || '', 'Other')} disabled={uploading} className={`border-dashed ${quickUploadClass(otherTarget)}`}>Upload other</Button></div><p className="mt-1 text-xs text-slate-500">Drag a file onto either upload button.</p>{memberFiles.length > 0 && <div className="mt-3 space-y-2">{memberFiles.map((file) => <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2"><a href={file.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">{file.displayName}</a><Button size="sm" variant="outline" className="gap-1" onClick={() => openQuickUpload(show.id || '', member.memberId || '', file.displayName, file.id)}><History className="h-3 w-3" />Replace</Button></div>)}</div>}</div>;
              })}
            </div>
            {removedConfirmedIds.length > 0 && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{removedConfirmedIds.map((id) => memberById[id]?.memberName || id).join(', ')}: confirmed employee no longer here</div>}
          </div>;
        })}
        {!upcomingShows.length && <p className="text-sm text-slate-500">No shows found in the next three months.</p>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />Upload attachments (existing method)</CardTitle></CardHeader><CardContent><form onSubmit={handleSubmit} className="grid gap-4"><select value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)} className="rounded border px-3 py-2"><option value="">Select show</option>{shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select><select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} className="rounded border px-3 py-2"><option value="">Select team member</option>{teamMembers.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}</select><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Attachment display name (optional)" /><Input type="file" multiple onChange={handleFiles} /><Button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload Files'}</Button></form></CardContent></Card>
    </div>
  );
}
