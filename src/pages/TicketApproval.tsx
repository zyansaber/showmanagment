import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet, dbSet } from '@/lib/firebase';

type ConfirmRequest = { id: string; showId: string; participantIds: string[]; confirmedParticipantIds?: string[]; approvedAt?: string; approvedParticipantIds?: string[] };
type ShowRecord = { name?: string; startDate?: string; finishDate?: string };
type TeamMember = { memberId?: string; memberName?: string };
const normaliseList = <T,>(data: unknown): T[] => !data ? [] : Array.isArray(data) ? data.filter(Boolean) as T[] : Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));

export default function TicketApproval() {
  const { token = '' } = useParams();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [show, setShow] = useState<ShowRecord | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => { (async () => {
    const req = await dbGet(`ticketBookingConfirmations/${decodeURIComponent(token)}`) as ConfirmRequest | null;
    setRequest(req);
    if (!req) return;
    const [showData, memberData] = await Promise.all([dbGet(`shows/${req.showId}`), dbGet('teamMembers')]);
    setShow(showData as ShowRecord | null);
    const confirmedIds = req.confirmedParticipantIds || req.participantIds;
    setMembers(normaliseList<TeamMember>(memberData).filter((member) => confirmedIds.includes(member.memberId || '')));
  })(); }, [token]);

  const approve = async () => {
    if (!request) return;
    const approvedAt = new Date().toISOString();
    const approvedParticipantIds = request.confirmedParticipantIds || request.participantIds;
    const nextRequest = { ...request, approvedAt, approvedParticipantIds };
    await dbSet(`ticketBookingConfirmations/${request.id}`, nextRequest as unknown as Record<string, unknown>);
    setRequest(nextRequest);
    setMessage('Ticket approved. Ticket & Booking can now see this approval.');
  };

  if (!request) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Approval address not found.</div>;
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-xl"><CardHeader><CardTitle>Ticket approval</CardTitle></CardHeader><CardContent className="space-y-4"><div><div className="text-2xl font-black text-slate-900">{show?.name || request.showId}</div></div><div><div className="mb-2 text-sm font-bold uppercase text-slate-500">Confirmed participants</div><ul className="space-y-2">{members.map((member) => <li key={member.memberId} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">{member.memberName || member.memberId}</li>)}</ul></div>{request.approvedAt ? <div className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">Approved at {new Date(request.approvedAt).toLocaleString()}</div> : <Button className="w-full" onClick={approve}>Approve Ticket</Button>}{message && <p className="text-sm text-blue-700">{message}</p>}</CardContent></Card></div>;
}
