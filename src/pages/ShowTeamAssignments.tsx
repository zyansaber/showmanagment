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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const buildShowQuarterKey = (show?: Show) => {
  if (!show) return null;
  const date = parseDate(show.startDate) ?? parseDate(show.finishDate);
  if (!date) return null;
  const quarter = `Q${Math.floor(date.getMonth() / 3) + 1}`;
  return `${date.getFullYear()}-${quarter}`;
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
  const [selectedQuarterFilter, setSelectedQuarterFilter] = useState<'all' | string>('all');

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rank = (show: Show) => {
      const start = parseDate(show.startDate);
      const end = parseDate(show.finishDate);
      if (start && end && start <= today && end >= today) return 0; // in progress
      if (end && end < today) return 1; // finished (recent first)
      return 2; // upcoming
    };
    return [...shows].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const aStart = parseDate(a.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bStart = parseDate(b.startDate)?.getTime() ?? Number.POSITIVE_INFINITY;
      const aEnd = parseDate(a.finishDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bEnd = parseDate(b.finishDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (rank(a) === 1) {
        if (aEnd !== bEnd) return bEnd - aEnd;
      } else if (aStart !== bStart) {
        return aStart - bStart;
      }
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

  const showNameById = useMemo(() => {
    const map: Record<string, string> = {};
    shows.forEach((show) => {
      if (!show.id) return;
      map[show.id] = show.name || show.id;
    });
    return map;
  }, [shows]);

  const showDateRangeById = useMemo(() => {
    const map: Record<string, string> = {};
    shows.forEach((show) => {
      if (!show.id) return;
      map[show.id] = formatDateRange(show);
    });
    return map;
  }, [shows]);

  const quarterFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { value: string; label: string }[] = [];
    shows.forEach((show) => {
      if (!show.id) return;
      const date = parseDate(show.startDate) ?? parseDate(show.finishDate);
      if (!date) return;
      const quarter = `Q${Math.floor(date.getMonth() / 3) + 1}`;
      const key = `${date.getFullYear()}-${quarter}`;
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ value: key, label: `${date.getFullYear()} ${quarter}` });
    });
    return options.sort((a, b) => b.value.localeCompare(a.value));
  }, [shows]);

  const workingDaysMatrix = useMemo(() => {
    const includedShowIds = new Set(
      shows.filter((show) => selectedQuarterFilter === 'all' || buildShowQuarterKey(show) === selectedQuarterFilter).map((show) => show.id || '')
    );

    const usedShowIds = new Set<string>();
    teamMembers.forEach((member) => {
      buildMemberShowDaysList(member).forEach((entry) => {
        if (entry.days > 0 && includedShowIds.has(entry.showId)) {
          usedShowIds.add(entry.showId);
        }
      });
    });

    const orderedShowIds = [...usedShowIds].sort((a, b) => {
      const showA = shows.find((show) => show.id === a);
      const showB = shows.find((show) => show.id === b);
      const timestampDiff = getShowTimestamp(showA || ({} as Show)) - getShowTimestamp(showB || ({} as Show));
      if (timestampDiff !== 0) return timestampDiff;
      const nameA = showNameById[a] || a;
      const nameB = showNameById[b] || b;
      return nameA.localeCompare(nameB);
    });

    const rows = teamMembers.map((member) => {
      const dayMap = buildMemberShowDaysList(member).reduce(
        (acc, entry) => {
          if (!includedShowIds.has(entry.showId)) return acc;
          acc[entry.showId] = (acc[entry.showId] || 0) + entry.days;
          return acc;
        },
        {} as Record<string, number>
      );
      const total = Object.values(dayMap).reduce((sum, days) => sum + days, 0);
      return {
        memberId: member.memberId,
        memberName: member.memberName || member.memberId,
        dayMap,
        total,
      };
    });

    const columnTotals = orderedShowIds.reduce(
      (acc, showId) => {
        acc[showId] = rows.reduce((sum, row) => sum + (row.dayMap[showId] || 0), 0);
        return acc;
      },
      {} as Record<string, number>
    );

    const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

    return { orderedShowIds, rows, columnTotals, grandTotal };
  }, [teamMembers, shows, showNameById, selectedQuarterFilter]);

  const handleExportExcel = () => {
    const headerRow = [
      'Member',
      'Total Working Days',
      ...workingDaysMatrix.orderedShowIds.map((showId) => showNameById[showId] || showId),
    ];
    const timeRow = [
      'Show Time',
      '',
      ...workingDaysMatrix.orderedShowIds.map((showId) => showDateRangeById[showId] || '-'),
    ];
    const memberRows = workingDaysMatrix.rows.map((row) => [
      row.memberName,
      String(row.total),
      ...workingDaysMatrix.orderedShowIds.map((showId) => String(row.dayMap[showId] || 0)),
    ]);
    const totalRow = [
      'Show Totals',
      String(workingDaysMatrix.grandTotal),
      ...workingDaysMatrix.orderedShowIds.map((showId) => String(workingDaysMatrix.columnTotals[showId] || 0)),
    ];

    const csv = [headerRow, timeRow, ...memberRows, totalRow]
      .map((cols) => cols.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `working-days-${selectedQuarterFilter}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

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
        <CardContent>
          <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-md">
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-[0.2em] text-slate-500">Choose show</Label>
              <Select value={selectedShowId} onValueChange={setSelectedShowId}>
                <SelectTrigger className="h-14 w-full rounded-xl border-slate-200 bg-white/90 text-base shadow-sm transition hover:border-blue-200 focus:ring-2 focus:ring-blue-200 lg:text-lg">
                  <SelectValue placeholder="Select a show to manage the team" />
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
              <p className="text-sm text-slate-500">
                Pick a show to unlock team assignments and show day tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Assign Team Members</CardTitle>
              <CardDescription>
                Choose who will attend the selected show. {selectedTeamMembers.length > 0
                  ? `${selectedTeamMembers.length} selected`
                  : 'No members selected yet.'}
              </CardDescription>
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
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/30 hover:shadow-md"
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
          <CardDescription>Record and review working days for each member and each show.</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedShow ? (
            showTeamMembers.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {showTeamMembers.map((member) => (
                  <div
                    key={member.memberId}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
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

          <div className="mt-8">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <h3 className="text-base font-semibold text-slate-900">Working Days Summary (All Shows)</h3>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="w-52">
                  <Label className="mb-1 block text-xs uppercase text-slate-500">Show Quarter</Label>
                  <Select value={selectedQuarterFilter} onValueChange={setSelectedQuarterFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Filter by quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Quarters</SelectItem>
                      {quarterFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleExportExcel}>
                  下载Excel
                </Button>
              </div>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Includes show time, each member total, each show total, and the overall total.
            </p>

            {workingDaysMatrix.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Member</TableHead>
                      <TableHead className="text-right">Total Working Days</TableHead>
                      {workingDaysMatrix.orderedShowIds.map((showId) => (
                        <TableHead key={showId} className="text-right">
                          {showNameById[showId] || showId}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-xs text-slate-500">Show Time</TableHead>
                      <TableHead className="text-right text-xs text-slate-500">-</TableHead>
                      {workingDaysMatrix.orderedShowIds.map((showId) => (
                        <TableHead key={`time-${showId}`} className="text-right text-xs text-slate-500">
                          {showDateRangeById[showId] || '-'}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workingDaysMatrix.rows.map((row) => (
                      <TableRow key={row.memberId}>
                        <TableCell className="font-medium">{row.memberName}</TableCell>
                        <TableCell className="text-right font-semibold">{row.total}</TableCell>
                        {workingDaysMatrix.orderedShowIds.map((showId) => (
                          <TableCell key={`${row.memberId}-${showId}`} className="text-right">
                            {row.dayMap[showId] || 0}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50">
                      <TableCell className="font-semibold">Show Totals</TableCell>
                      <TableCell className="text-right font-semibold">{workingDaysMatrix.grandTotal}</TableCell>
                      {workingDaysMatrix.orderedShowIds.map((showId) => (
                        <TableCell key={`total-${showId}`} className="text-right font-semibold">
                          {workingDaysMatrix.columnTotals[showId] || 0}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No working days data yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
