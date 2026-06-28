import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet, uploadStorageFile } from '@/lib/firebase';

type ShowRecord = { id?: string; name?: string; startDate?: string; finishDate?: string };
type TeamMember = { id?: string; memberId?: string; memberName?: string; activeFlag?: number };
type TicketFile = { id: string; showId: string; teamMemberId: string; displayName: string; fileName: string; path: string; url: string; uploadedAt: string };

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

export default function TicketAndBooking() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [showsData, teamData] = await Promise.all([dbGet('shows'), dbGet('teamMembers')]);
      setShows(normaliseList<ShowRecord>(showsData));
      setTeamMembers(normaliseList<TeamMember>(teamData).filter((member) => member.activeFlag === 1));
    };
    loadData();
  }, []);

  const selectedShow = useMemo(() => shows.find((show) => show.id === selectedShowId), [selectedShowId, shows]);
  const selectedMember = useMemo(() => teamMembers.find((member) => member.memberId === selectedMemberId), [selectedMemberId, teamMembers]);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files || []));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedShowId || !selectedMemberId || files.length === 0) {
      setMessage('Please choose a show, team member, and at least one file.');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      for (const file of files) {
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const path = `ticket_and_booking/${selectedShowId}/${selectedMemberId}/${id}-${safeFileName(file.name)}`;
        const url = await uploadStorageFile(path, file);
        const record: TicketFile = {
          id,
          showId: selectedShowId,
          teamMemberId: selectedMemberId,
          displayName: displayName || file.name,
          fileName: file.name,
          path,
          url,
          uploadedAt: new Date().toISOString(),
        };
        await dbSet(`ticketAndBookingFiles/${id}`, record as unknown as Record<string, unknown>);
      }
      setMessage(`Uploaded ${files.length} file(s) for ${selectedMember?.memberName || 'team member'} / ${selectedShow?.name || 'show'}.`);
      setFiles([]);
      setDisplayName('');
    } catch (err) {
      console.error('Ticket and booking upload failed:', err);
      setMessage('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Ticket & Booking</h1>
        <p className="text-sm text-slate-500">Upload multiple files to Firebase Storage and attach them to a show and team member.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UploadCloud className="h-5 w-5" />Upload attachments</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <select value={selectedShowId} onChange={(e) => setSelectedShowId(e.target.value)} className="rounded border px-3 py-2">
              <option value="">Select show</option>
              {shows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}
            </select>
            <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)} className="rounded border px-3 py-2">
              <option value="">Select team member</option>
              {teamMembers.map((member) => <option key={member.memberId} value={member.memberId}>{member.memberName}</option>)}
            </select>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Attachment display name (optional)" />
            <Input type="file" multiple onChange={handleFiles} />
            <Button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload Files'}</Button>
          </form>
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
