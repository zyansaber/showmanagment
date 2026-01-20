import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dbGet, dbUpdate } from '@/lib/firebase';
import type { Show, TeamMember } from '@/types';

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getShowTimestamp = (show: Show) => {
  const primary = parseDate(show.startDate) ?? parseDate(show.finishDate);
  return primary?.getTime() ?? Number.POSITIVE_INFINITY;
};

const formatDateRange = (show: Show) => {
  if (show.startDate && show.finishDate) {
    return `${show.startDate} - ${show.finishDate}`;
  }
  return show.startDate || show.finishDate || 'Dates not set';
};

const renderTimingBadge = (show?: Show) => {
  if (!show) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(show.startDate);
  const end = parseDate(show.finishDate);

  if (start && end && start <= today && end >= today) {
    return (
      <Badge className="bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.7)] animate-pulse">
        In Progress
      </Badge>
    );
  }
  if (end && end < today) {
    return <Badge className="bg-red-500 text-white">Finished</Badge>;
  }
  if (start && start > today) {
    const diffMs = start.getTime() - today.getTime();
    const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    if (daysUntil <= 10) {
      return (
        <Badge className="bg-yellow-300 text-yellow-900 shadow-[0_0_12px_rgba(234,179,8,0.9)] ring-2 ring-yellow-400 animate-pulse">
          Starts in {daysUntil} day{daysUntil === 1 ? '' : 's'} · {start.toLocaleDateString('en-AU')}
        </Badge>
      );
    }
  }
  return null;
};

const buildMemberShowDaysList = (member: TeamMember) => {
  const rawDays = member.showDays;
  if (Array.isArray(rawDays)) {
    return rawDays
      .map((entry) => ({
        showId: typeof entry?.showId === 'string' ? entry.showId : '',
        showName: typeof entry?.showName === 'string' ? entry.showName : '',
        days: typeof entry?.days === 'number' ? entry.days : Number(entry?.days),
      }))
      .filter((entry) => entry.showId && Number.isFinite(entry.days) && entry.days > 0);
  }
  if (rawDays && typeof rawDays === 'object') {
    return Object.entries(rawDays).reduce(
      (acc, [showId, days]) => {
        const numeric = typeof days === 'number' ? days : Number(days);
        if (Number.isFinite(numeric) && numeric > 0) {
          acc.push({ showId, showName: '', days: numeric });
        }
        return acc;
      },
      [] as { showId: string; showName: string; days: number }[]
    );
  }
  return [] as { showId: string; showName: string; days: number }[];
};

export default function ShowTeamAssignments() {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState<Show[]>([]);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, string>>({});
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMemberKeys, setTeamMemberKeys] = useState<Record<string, string>>({});
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [memberDayDrafts, setMemberDayDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [showsData, teamData] = await Promise.all([dbGet('shows'), dbGet('teamMembers')]);

        const showEntries = showsData ? Object.entries(showsData as Record<string, Show>) : [];
        const map: Record<string, string> = {};
        const showList = showEntries.map(([key, value]) => {
          if (value.id) {
            map[value.id] = key;
          }
          return value;
        });
        setShows(showList);
        setShowKeyMap(map);

        const teamEntries = teamData ? Object.entries(teamData as Record<string, TeamMember>) : [];
        const memberKeyMap: Record<string, string> = {};
        const members = teamEntries.map(([key, value]) => {
          const memberId = value.memberId || key;
          memberKeyMap[memberId] = key;
          return { ...value, memberId };
        });
        setTeamMemberKeys(memberKeyMap);
        setTeamMembers(members.filter((member) => member.activeFlag === 1));
      } catch (error) {
        console.error('Error loading team assignments:', error);
        toast.error('Failed to load team assignment data.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const sortedShows = useMemo(() => {
    return [...shows].sort((a, b) => {
      const aTime = getShowTimestamp(a);
      const bTime = getShowTimestamp(b);
      if (aTime !== bTime) return aTime - bTime;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [shows]);

  useEffect(() => {
    if (selectedShowId || sortedShows.length === 0) return;
    const firstShow = sortedShows.find((show) => show.id);
    if (firstShow?.id) {
      setSelectedShowId(firstShow.id);
    }
  }, [selectedShowId, sortedShows]);

  const selectedShow = useMemo(
    () => sortedShows.find((show) => show.id === selectedShowId),
    [sortedShows, selectedShowId]
  );

  const selectableShows = useMemo(() => sortedShows.filter((show) => Boolean(show.id)), [sortedShows]);

  useEffect(() => {
    if (!selectedShow) {
      setSelectedTeamMembers([]);
      setMemberDayDrafts({});
      return;
    }
    setSelectedTeamMembers(selectedShow.teamMembers || []);
    setMemberDayDrafts({});
  }, [selectedShow]);

  useEffect(() => {
    if (!selectedShow) return;
    setMemberDayDrafts((prev) => {
      const next = { ...prev };
      selectedTeamMembers.forEach((memberId) => {
        if (next[memberId] !== undefined) return;
        const member = teamMembers.find((entry) => entry.memberId === memberId);
        if (!member) return;
        const entry = buildMemberShowDaysList(member).find((item) => item.showId === selectedShow.id);
        next[memberId] = entry && entry.days > 0 ? String(entry.days) : '';
      });
      return next;
    });
  }, [selectedShow, selectedTeamMembers, teamMembers]);

  const showTeamMembers = useMemo(
    () => teamMembers.filter((member) => selectedTeamMembers.includes(member.memberId)),
    [teamMembers, selectedTeamMembers]
  );

  const handleSaveTeam = async () => {
    if (!selectedShow || !selectedShow.id) {
      toast.error('Please select a show first.');
      return;
    }
    const key = showKeyMap[selectedShow.id] || selectedShow.id;
    try {
      await dbUpdate(`shows/${key}`, { teamMembers: selectedTeamMembers });
      toast.success('Team members updated successfully.');
    } catch (error) {
      console.error('Error saving team members:', error);
      toast.error('Failed to update team members.');
    }
  };

  const handleSaveMemberDays = async (member: TeamMember) => {
    if (!selectedShow || !selectedShow.id) {
      toast.error('Please select a show first.');
      return;
    }
    if (!member.memberId) {
      toast.error('Unable to determine team member ID.');
      return;
    }

    const rawValue = memberDayDrafts[member.memberId];
    const parsed = Number(rawValue);
    const days = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
    const existingDays = buildMemberShowDaysList(member);
    const updatedDays = existingDays.filter((entry) => entry.showId !== selectedShow.id);

    if (days > 0) {
      updatedDays.push({
        showId: selectedShow.id,
        showName: selectedShow.name || '',
        days,
      });
    }

    const memberKey = teamMemberKeys[member.memberId] || member.memberId;
    if (!memberKey) {
      toast.error('Unable to determine team member record.');
      return;
    }

    try {
      await dbUpdate(`teamMembers/${memberKey}`, { showDays: updatedDays });
      setTeamMembers((prev) =>
        prev.map((entry) => (entry.memberId === member.memberId ? { ...entry, showDays: updatedDays } : entry))
      );
      setMemberDayDrafts((prev) => ({ ...prev, [member.memberId]: days > 0 ? String(days) : '' }));
      toast.success('Team member days updated.');
    } catch (error) {
      console.error('Error updating team member days:', error);
      toast.error('Failed to update team member days.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading team assignments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Show Team Assignments
          </CardTitle>
          <CardDescription>Select a show to assign team members and track their days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
            <div className="space-y-2">
              <Label>Select show</Label>
              <Select value={selectedShowId} onValueChange={setSelectedShowId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a show" />
                </SelectTrigger>
                <SelectContent>
                  {selectableShows.map((show) => (
                    <SelectItem key={show.id} value={show.id!}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{show.name || show.id}</span>
                          {renderTimingBadge(show)}
                        </div>
                        <span className="text-xs text-slate-500">{formatDateRange(show)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-slate-500">Selected show</p>
                  <p className="text-base font-semibold text-slate-900">
                    {selectedShow?.name || 'No show selected'}
                  </p>
                </div>
                {renderTimingBadge(selectedShow)}
              </div>
              <div className="text-sm text-slate-600">
                {selectedShow ? formatDateRange(selectedShow) : 'Pick a show to view its team.'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Assign Team Members</CardTitle>
              <CardDescription>Choose who will attend the selected show.</CardDescription>
            </div>
            <Button onClick={handleSaveTeam} disabled={!selectedShow}>
              Save Team
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selectedShow ? (
            <div className="grid gap-3 md:grid-cols-2">
              {teamMembers.map((member) => (
                <label
                  key={member.memberId}
                  htmlFor={`team-${member.memberId}`}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <Checkbox
                    id={`team-${member.memberId}`}
                    checked={selectedTeamMembers.includes(member.memberId)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTeamMembers((prev) => [...prev, member.memberId]);
                      } else {
                        setSelectedTeamMembers((prev) => prev.filter((id) => id !== member.memberId));
                        setMemberDayDrafts((prev) => ({ ...prev, [member.memberId]: '' }));
                      }
                    }}
                  />
                  <div>
                    <p className="font-medium text-slate-900">{member.memberName}</p>
                    <p className="text-xs text-slate-500">{member.role} · {member.email || 'No email'}</p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Select a show to manage its team.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Show Days</CardTitle>
          <CardDescription>Record how many days each member will work at this show.</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedShow ? (
            showTeamMembers.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {showTeamMembers.map((member) => (
                  <div key={member.memberId} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{member.memberName}</p>
                        <p className="text-xs text-slate-500">{member.role}</p>
                      </div>
                      <Badge variant="outline">{member.activeFlag === 1 ? 'Active' : 'Inactive'}</Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <Label className="text-xs uppercase text-slate-500">Days</Label>
                      <Input
                        type="number"
                        min={0}
                        value={memberDayDrafts[member.memberId] ?? ''}
                        onChange={(event) =>
                          setMemberDayDrafts((prev) => ({
                            ...prev,
                            [member.memberId]: event.target.value,
                          }))
                        }
                        className="h-9 w-24"
                      />
                      <Button variant="outline" onClick={() => handleSaveMemberDays(member)}>
                        Save
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No team members selected yet.</div>
            )
          ) : (
            <div className="text-sm text-slate-500">Select a show to update team days.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
