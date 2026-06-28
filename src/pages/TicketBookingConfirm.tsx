import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet, dbSet } from '@/lib/firebase';

type ShowRecord = { id?: string; name?: string; startDate?: string; finishDate?: string };
type TeamMember = { memberId?: string; memberName?: string };
type ConfirmRequest = { id: string; showId: string; participantIds: string[]; confirmedParticipantIds?: string[]; confirmedAt?: string };
const normaliseList = <T,>(data: unknown): T[] => !data ? [] : Array.isArray(data) ? data.filter(Boolean) as T[] : Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
const fmt = (v?: string) => v ? new Date(v).toLocaleDateString() : '-';

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
    const nextRequest = { ...request, confirmedAt, confirmedParticipantIds: request.participantIds };
    await dbSet(`ticketBookingConfirmations/${request.id}`, nextRequest as unknown as Record<string, unknown>);
    setRequest(nextRequest);
    setMessage('Participants confirmed. Ticket & Booking can now see this confirmation.');
  };

  if (!request) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">Confirmation address not found.</div>;
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-xl"><CardHeader><CardTitle>Confirm show participants</CardTitle></CardHeader><CardContent className="space-y-4"><div><div className="text-2xl font-black text-slate-900">{show?.name || request.showId}</div><div className="text-sm text-slate-500">{fmt(show?.startDate)} - {fmt(show?.finishDate)}</div></div><div><div className="mb-2 text-sm font-bold uppercase text-slate-500">Participants</div><ul className="space-y-2">{members.map((member) => <li key={member.memberId} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">{member.memberName || member.memberId}</li>)}</ul></div>{request.confirmedAt ? <div className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-700">Confirmed at {new Date(request.confirmedAt).toLocaleString()}</div> : <Button className="w-full" onClick={confirm}>Confirm</Button>}{message && <p className="text-sm text-blue-700">{message}</p>}</CardContent></Card></div>;
}
