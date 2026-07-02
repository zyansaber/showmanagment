import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet, dbSet } from '@/lib/firebase';

type ShowRecord = { id?: string; name?: string; startDate?: string; finishDate?: string };
type TeamMember = { memberId?: string; memberName?: string };
type ConfirmRequest = { id: string; showId: string; participantIds: string[]; confirmedParticipantIds?: string[]; confirmedAt?: string; approvalUrl?: string; requiresTicketApproval?: boolean };
const normaliseList = <T,>(data: unknown): T[] => !data ? [] : Array.isArray(data) ? data.filter(Boolean) as T[] : Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
const fmt = (v?: string) => v ? new Date(v).toLocaleDateString() : '-';
const TICKET_BOOKING_TEMPLATE_ID = 'template_1qpfll8';
const renderTemplate = (template: string, values: Record<string, string>) => Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{{${key}}}`, value), template);
const sendEmailJs = async (toEmail: string, title: string, content: string) => {
  const settings = (await dbGet('settings/emailjsTicketBooking')) as Record<string, string> | null;
  if (!toEmail || !settings?.serviceId || !settings?.publicKey) return;
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: settings.serviceId,
      template_id: TICKET_BOOKING_TEMPLATE_ID,
      user_id: settings.publicKey,
      accessToken: settings.privateKey,
      template_params: { to_email: toEmail, to_name: 'Ticket approval', title, content, receipt: toEmail },
    }),
  });
  if (!response.ok) throw new Error(`EmailJS failed ${response.status}: ${await response.text()}`);
};

export default function TicketBookingConfirm() {
  const { token = '' } = useParams();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => { (async () => {
    const req = await dbGet(`ticketBookingConfirmations/${decodeURIComponent(token)}`) as ConfirmRequest | null;
    setRequest(req);
    if (req) {
      const [showData, memberData] = await Promise.all([dbGet(`shows/${req.showId}`), dbGet('teamMembers')]);
      setShow(showData as ShowRecord | null);
      const all = normaliseList<TeamMember>(memberData);
      setMembers(all.filter((member) => req.participantIds.includes(member.memberId || '')));
    }
  })(); }, [token]);

  const confirm = async () => {
    if (!request) return;
    const confirmedAt = new Date().toISOString();
    const approvalUrl = `${window.location.origin}/ticket-approval/${encodeURIComponent(request.id)}`;
    const nextRequest = { ...request, confirmedAt, confirmedParticipantIds: request.participantIds, approvalUrl };
    await dbSet(`ticketBookingConfirmations/${request.id}`, nextRequest as unknown as Record<string, unknown>);
    setRequest(nextRequest);
    setMessage('Participants confirmed. Ticket & Booking can now see this confirmation.');
    if (!request.requiresTicketApproval) return;
    try {
      const settings = (await dbGet('settings/emailjsTicketBooking')) as Record<string, string> | null;
      const approvalReceipt = settings?.ticketApprovalReceipt || '';
      const participantNames = members.map((member) => member.memberName || member.memberId).join(', ');
      const variables = { show_name: show?.name || request.showId, participants: participantNames, approval_url: approvalUrl };
      await sendEmailJs(
        approvalReceipt,
        renderTemplate(settings?.ticketApprovalSubject || 'Ticket approval changing teammember required for {{show_name}}', variables),
        renderTemplate(settings?.ticketApprovalBody || `Show manager has confirmed the following participants. Please approve ticket.\n\nShow: {{show_name}}\nParticipants: {{participants}}\n\nApprove here: {{approval_url}}`, variables)
      );
    } catch (err) {
      console.error('Ticket approval email failed:', err);
    }
  };

  if (!request) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Confirmation address not found.</div>;
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-xl"><CardHeader><CardTitle>Confirm show participants</CardTitle></CardHeader><CardContent className="space-y-4"><div><div className="text-2xl font-black text-slate-900">{show?.name || request.showId}</div><div className="text-sm text-slate-500">{fmt(show?.startDate)} - {fmt(show?.finishDate)}</div></div><div><div className="mb-2 text-sm font-bold uppercase text-slate-500">Participants</div><ul className="space-y-2">{members.map((member) => <li key={member.memberId} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">{member.memberName || member.memberId}</li>)}</ul></div>{request.confirmedAt ? <div className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">Confirmed at {new Date(request.confirmedAt).toLocaleString()}</div> : <Button className="w-full" onClick={confirm}>Confirm</Button>}{message && <p className="text-sm text-blue-700">{message}</p>}</CardContent></Card></div>;
}
