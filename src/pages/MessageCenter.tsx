import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet } from '@/lib/firebase';

type TeamMember = { id?: string; memberId?: string; memberName?: string; activeFlag?: number };
type TeamMessage = { id?: string; title: string; body: string; targetMemberIds: string[]; createdAt: string };
type ReadReceipts = Record<string, Record<string, { readAt: string }>>;

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

export default function MessageCenter() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [receipts, setReceipts] = useState<ReadReceipts>({});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    const [teamData, messageData, receiptData] = await Promise.all([
      dbGet('teamMembers'),
      dbGet('teamMessages'),
      dbGet('teamMessageReadReceipts'),
    ]);
    setTeamMembers(normaliseList<TeamMember>(teamData).filter((member) => member.activeFlag === 1));
    setMessages(normaliseList<TeamMessage>(messageData).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    setReceipts((receiptData || {}) as ReadReceipts);
  };

  useEffect(() => {
    loadData();
  }, []);

  const memberNameById = useMemo(() => teamMembers.reduce((acc, member) => {
    if (member.memberId) acc[member.memberId] = member.memberName || member.memberId;
    return acc;
  }, {} as Record<string, string>), [teamMembers]);

  const toggleMember = (memberId?: string) => {
    if (!memberId) return;
    setSelectedMembers((prev) => prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim() || selectedMembers.length === 0) {
      setMessage('Please enter a title, message, and at least one team member.');
      return;
    }

    setSaving(true);
    try {
      const id = `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const record: TeamMessage = {
        id,
        title: title.trim(),
        body: body.trim(),
        targetMemberIds: selectedMembers,
        createdAt: new Date().toISOString(),
      };
      await dbSet(`teamMessages/${id}`, record as unknown as Record<string, unknown>);
      setTitle('');
      setBody('');
      setSelectedMembers([]);
      setMessage('Message sent.');
      await loadData();
    } catch (err) {
      console.error('Failed to send team message:', err);
      setMessage('Failed to send message.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Messages</h1>
        <p className="text-sm text-slate-500">Send notices to selected team members and track who has read them.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />New message</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Message title" />
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message details" className="min-h-32 w-full rounded border px-3 py-2 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((member) => (
                <label key={member.memberId} className="flex items-center gap-2 rounded border bg-white px-3 py-2 text-sm">
                  <input type="checkbox" checked={selectedMembers.includes(member.memberId || '')} onChange={() => toggleMember(member.memberId)} />
                  {member.memberName || member.memberId}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={saving}>{saving ? 'Sending…' : 'Send Message'}</Button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {messages.map((item) => {
          const readCount = item.targetMemberIds.filter((memberId) => receipts[item.id || '']?.[memberId]).length;
          return (
            <Card key={item.id}>
              <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />{item.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap text-slate-700">{item.body}</p>
                <p className="font-semibold text-blue-700">Read: {readCount}/{item.targetMemberIds.length}</p>
                <div className="flex flex-wrap gap-2">
                  {item.targetMemberIds.map((memberId) => (
                    <span key={memberId} className={`rounded-full px-3 py-1 text-xs font-semibold ${receipts[item.id || '']?.[memberId] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {memberNameById[memberId] || memberId}: {receipts[item.id || '']?.[memberId] ? 'Read' : 'Unread'}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
