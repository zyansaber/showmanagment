import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Edit, Check, UserCheck, BarChart3, X, Mail, Loader2 } from 'lucide-react';
import { dbGet, dbSet, dbUpdate } from '@/lib/firebase';
import type { TeamMember, UserRole, Show, ShowOrder } from '@/types';

const TEAM_PORTAL_TEMPLATE_ID = 'template_1qpfll8';

type EmailSettings = { serviceId: string; publicKey: string; privateKey: string };

const slugifyTeamMember = (value?: string) => (value || '').trim().replace(/\s+/g, '-').toLowerCase();

const loadEmailSettings = async (): Promise<EmailSettings> => {
  const settings = (await dbGet('settings/emailjsTicketBooking')) as Partial<EmailSettings> | null;
  return {
    serviceId: settings?.serviceId || 'service_d39k2lv',
    publicKey: settings?.publicKey || 'Ox1_IwykSClDMOhqz',
    privateKey: settings?.privateKey || 'Dg7xyuMhc-xtKQbROJT7H',
  };
};

const sendEmailJs = async (toEmail: string, toName: string, params: { title: string; content: string; receipt: string }, settings: EmailSettings) => {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: settings.serviceId,
      template_id: TEAM_PORTAL_TEMPLATE_ID,
      user_id: settings.publicKey,
      accessToken: settings.privateKey,
      template_params: { to_email: toEmail, to_name: toName, ...params },
    }),
  });
  if (!response.ok) throw new Error(`EmailJS failed ${response.status}: ${await response.text()}`);
};

export default function TeamManagement() {
  type TeamMemberRecord = TeamMember & { dbKey: string };

  const [teamMembers, setTeamMembers] = useState<TeamMemberRecord[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [editingEmailMemberId, setEditingEmailMemberId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [editingRoleMemberId, setEditingRoleMemberId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<UserRole>('Show Team');
  const [sendingPortalMemberId, setSendingPortalMemberId] = useState<string | null>(null);
  const [portalEmailMessage, setPortalEmailMessage] = useState('');

  const [newMember, setNewMember] = useState<Partial<TeamMember>>({
    memberName: '',
    role: 'Show Team',
    email: '',
    activeFlag: 1,
  });

  useEffect(() => {
    loadTeamData();
  }, []);

  const roleOptions: UserRole[] = ['Show Team', 'Factory Team', 'Network Team'];

  const loadTeamData = async () => {
    try {
      const [membersData, showsData, ordersData] = await Promise.all([
        dbGet('teamMembers'),
        dbGet('shows'),
        dbGet('showOrders')
      ]);

      const memberEntries = membersData ? Object.entries(membersData as Record<string, TeamMember>) : [];
      const normalizedMembers = memberEntries.map(([key, value]) => {
        const memberId =
          typeof value.memberId === 'string' && value.memberId.trim().length > 0 ? value.memberId : key;
        return { ...value, memberId, dbKey: key };
      });
      setTeamMembers(normalizedMembers);
      setShows(showsData ? Object.values(showsData) : []);
      setOrders(ordersData ? Object.values(ordersData) : []);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    try {
      const memberId = `TM-${String(teamMembers.length + 1).padStart(3, '0')}`;
      const member: TeamMember = {
        memberId,
        memberName: newMember.memberName || '',
        role: (newMember.role as UserRole) || 'Show Team',
        email: newMember.email || '',
        activeFlag: 1,
        totalSales: 0,
        totalWorkDays: 0,
        showDays: [],
      };
      
      await dbSet(`teamMembers/${memberId}`, member as unknown as Record<string, unknown>);
      setTeamMembers([...teamMembers, { ...member, dbKey: memberId }]);
      setIsAddingMember(false);
      setNewMember({
        memberName: '',
        role: 'Show Team',
        email: '',
        activeFlag: 1,
      });
    } catch (error) {
      console.error('Error adding member:', error);
    }
  };

  const handleToggleActive = async (member: TeamMemberRecord) => {
    if (!member.dbKey) {
      console.error('Missing team member ID while toggling status.');
      return;
    }
    try {
      const newFlag = member.activeFlag === 1 ? 0 : 1;
      await dbUpdate(`teamMembers/${member.dbKey}`, { activeFlag: newFlag });
      setTeamMembers(teamMembers.map(m => 
        m.dbKey === member.dbKey ? { ...m, activeFlag: newFlag } : m
      ));
    } catch (error) {
      console.error('Error toggling member status:', error);
    }
  };

  const handleEmailEditToggle = async (member: TeamMemberRecord) => {
    if (!member.dbKey) {
      console.error('Missing team member ID while editing email.');
      return;
    }
    if (editingEmailMemberId === member.dbKey) {
      try {
        await dbUpdate(`teamMembers/${member.dbKey}`, { email: emailDraft });
        setTeamMembers(teamMembers.map((m) => (
          m.dbKey === member.dbKey ? { ...m, email: emailDraft } : m
        )));
        setEditingEmailMemberId(null);
      } catch (error) {
        console.error('Error updating email:', error);
      }
      return;
    }

    setEditingEmailMemberId(member.dbKey);
    setEmailDraft(member.email || '');
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'Show Team':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'Factory Team':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'Network Team':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      default:
        return 'bg-slate-200 text-slate-800 border border-slate-300';
    }
  };

  const getMemberPortalUrl = (member: TeamMember) => {
    const slug = slugifyTeamMember(member.memberName) || slugifyTeamMember(member.memberId);
    return `${window.location.origin}/team/${encodeURIComponent(slug)}`;
  };

  const handleSendPortalEmail = async (member: TeamMemberRecord) => {
    if (!member.email) {
      setPortalEmailMessage(`Please add an email address for ${member.memberName || member.memberId} first.`);
      return;
    }

    const portalUrl = getMemberPortalUrl(member);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(portalUrl)}`;
    const title = 'Your team member portal QR code';
    const content = [
      `Hi ${member.memberName || 'team member'},`,
      '',
      'Please use the team member portal link below to open your page and QR code:',
      portalUrl,
      '',
      'QR code image:',
      qrCodeUrl,
      '',
      'After opening the page, you can view the QR code for this team member portal.',
    ].join('\n');

    setSendingPortalMemberId(member.dbKey);
    setPortalEmailMessage('');
    try {
      const emailSettings = await loadEmailSettings();
      await sendEmailJs(member.email, member.memberName || 'Team member', {
        title,
        content,
        receipt: member.email,
      }, emailSettings);
      setPortalEmailMessage(`Portal email sent to ${member.email}.`);
    } catch (error) {
      console.error('Error sending team member portal email:', error);
      setPortalEmailMessage(`Failed to send portal email to ${member.email}.`);
    } finally {
      setSendingPortalMemberId(null);
    }
  };

  const handleRoleEdit = (member: TeamMemberRecord) => {
    if (!member.dbKey) {
      console.error('Missing team member ID while editing role.');
      return;
    }
    setEditingRoleMemberId(member.dbKey);
    setRoleDraft(member.role);
  };

  const handleSaveRole = async (member: TeamMemberRecord) => {
    if (!member.dbKey) {
      console.error('Missing team member ID while saving role.');
      return;
    }
    try {
      await dbUpdate(`teamMembers/${member.dbKey}`, { role: roleDraft });
      setTeamMembers((prev) =>
        prev.map((entry) =>
          entry.dbKey === member.dbKey ? { ...entry, role: roleDraft } : entry
        )
      );
      setEditingRoleMemberId(null);
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  const orderCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(order => {
      if (!order.salesperson) return;
      counts[order.salesperson] = (counts[order.salesperson] || 0) + 1;
    });
    return counts;
  }, [orders]);

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

  const buildMemberShowDaysMap = (member: TeamMember) => {
    return buildMemberShowDaysList(member).reduce((acc, entry) => {
      acc[entry.showId] = entry.days;
      return acc;
    }, {} as Record<string, number>);
  };

  const memberDayTotals = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      const showDays = buildMemberShowDaysList(member);
      acc[member.memberId] = showDays.reduce((sum, entry) => sum + entry.days, 0);
      return acc;
    }, {} as Record<string, number>);
  }, [teamMembers]);

  const showParticipationMap = useMemo(() => {
    const counts: Record<string, number> = {};
    shows.forEach(show => {
      show.teamMembers?.forEach(memberName => {
        counts[memberName] = (counts[memberName] || 0) + 1;
      });
    });
    return counts;
  }, [shows]);

  const getShowDuration = (show: Show) => {
    if (!show.startDate || !show.finishDate) return 0;
    const start = new Date(show.startDate);
    const end = new Date(show.finishDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const formatMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  const getShowDaysByMonth = (show: Show) => {
    if (!show.startDate || !show.finishDate) return {} as Record<string, number>;
    const start = new Date(show.startDate);
    const end = new Date(show.finishDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return {} as Record<string, number>;

    const monthMap: Record<string, number> = {};
    const cursor = new Date(start);

    while (cursor <= end) {
      const key = formatMonthKey(cursor);
      monthMap[key] = (monthMap[key] || 0) + 1;
      cursor.setDate(cursor.getDate() + 1);
    }

    return monthMap;
  };

  const buildMemberInsight = (member: TeamMember | null) => {
    if (!member) return null;

    const memberShows = shows.filter((show) => {
      const participants = show.teamMembers || [];
      return participants.includes(member.memberId) || participants.includes(member.memberName);
    });

    const memberOrders = orders.filter((order) => {
      return order.salesperson === member.memberName || order.salesperson === member.memberId;
    });

    const totalCarsSold = memberOrders.length;
    const memberShowDays = buildMemberShowDaysMap(member);
    const entryDaysByShow = memberShows.reduce<Record<string, number>>((acc, show) => {
      const showKey = show.id || show.name || '';
      if (!showKey) return acc;
      acc[showKey] = memberShowDays[showKey] || 0;
      return acc;
    }, {});
    const participationDays = Object.values(memberShowDays).reduce((sum, days) => sum + days, 0);
    const avgDailySales = participationDays > 0 ? totalCarsSold / participationDays : 0;

    const modelCounts = memberOrders.reduce<Record<string, number>>((acc, order) => {
      if (!order.model) return acc;
      acc[order.model] = (acc[order.model] || 0) + 1;
      return acc;
    }, {});

    const orderTrendByMonth = memberOrders.reduce<Record<string, number>>((acc, order) => {
      if (!order.date) return acc;
      const parsed = new Date(order.date);
      if (Number.isNaN(parsed.getTime())) return acc;
      const key = formatMonthKey(parsed);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const participationDaysByMonth = memberShows.reduce<Record<string, number>>((acc, show) => {
      const showKey = show.id || show.name || '';
      const entryDays = showKey ? memberShowDays[showKey] || 0 : 0;
      if (entryDays <= 0) return acc;
      const monthMap = getShowDaysByMonth(show);
      const totalShowDays = Object.values(monthMap).reduce((sum, days) => sum + days, 0);
      if (totalShowDays <= 0) return acc;
      Object.entries(monthMap).forEach(([month, days]) => {
        acc[month] = (acc[month] || 0) + (entryDays * days) / totalShowDays;
      });
      return acc;
    }, {});

    const months = Array.from(new Set([...Object.keys(orderTrendByMonth), ...Object.keys(participationDaysByMonth)])).sort();

    const avgDailyTrend = months.map((month) => {
      const ordersCount = orderTrendByMonth[month] || 0;
      const days = participationDaysByMonth[month] || 0;
      return { month, value: days > 0 ? ordersCount / days : 0 };
    });

    const salesTrend = months.map((month) => ({ month, value: orderTrendByMonth[month] || 0 }));
    const participationTrend = months.map((month) => ({ month, value: participationDaysByMonth[month] || 0 }));

    return {
      memberShows,
      memberOrders,
      modelCounts,
      totalCarsSold,
      participationDays,
      avgDailySales,
      avgDailyTrend,
      salesTrend,
      participationTrend,
      entryDaysByShow,
    };
  };

  const selectedInsight = buildMemberInsight(selectedMember);

  const renderSparkBars = (data: { month: string; value: number }[], label: string) => {
    if (!data.length) return <div className="text-sm text-gray-500">No {label} data yet</div>;

    const maxValue = Math.max(...data.map((item) => item.value), 1);

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span>Last {data.length} months</span>
        </div>
        <div className="flex items-end gap-2">
          {data.map((item) => (
            <div key={item.month} className="flex flex-col items-center gap-1 text-[10px] text-gray-600">
              <div
                className="w-8 rounded bg-blue-100"
                style={{ height: `${(item.value / maxValue) * 64}px` }}
                title={`${item.month}: ${item.value.toFixed(2)}`}
              />
              <span>{item.month}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading team members...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Members Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage employee information, roles, and team portal emails</CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={isAddingMember} onOpenChange={setIsAddingMember}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Team Member</DialogTitle>
                    <DialogDescription>Enter the details of the new team member</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={newMember.memberName}
                        onChange={(e) => setNewMember({ ...newMember, memberName: e.target.value })}
                        placeholder="Enter full name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newMember.email}
                        onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={newMember.role}
                        onValueChange={(value) => setNewMember({ ...newMember, role: value as UserRole })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Show Team">Show Team</SelectItem>
                          <SelectItem value="Factory Team">Factory Team</SelectItem>
                          <SelectItem value="Network Team">Network Team</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setIsAddingMember(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddMember}>Add Member</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {portalEmailMessage && (
            <div className="mb-4 rounded-md border bg-slate-50 px-4 py-3 text-sm text-slate-700">{portalEmailMessage}</div>
          )}
          {teamMembers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Total Sales</TableHead>
                  <TableHead>Shows Participated</TableHead>
                  <TableHead>Total Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.dbKey}>
                    <TableCell className="font-medium">{member.memberId}</TableCell>
                    <TableCell>{member.memberName}</TableCell>
                    <TableCell>
                      {editingEmailMemberId === member.dbKey ? (
                        <Input
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder="Enter email address"
                        />
                      ) : (
                        member.email || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {editingRoleMemberId === member.dbKey ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={roleDraft}
                            onValueChange={(value) => setRoleDraft(value as UserRole)}
                          >
                            <SelectTrigger className={`w-[160px] ${getRoleBadgeColor(roleDraft)}`}>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveRole(member)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingRoleMemberId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-0"
                          onClick={() => handleRoleEdit(member)}
                        >
                          <Badge className={`${getRoleBadgeColor(member.role)} cursor-pointer`}>{member.role}</Badge>
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>{orderCountMap[member.memberName] || 0}</TableCell>
                    <TableCell>
                      {showParticipationMap[member.memberId] || showParticipationMap[member.memberName] || 0}
                    </TableCell>
                    <TableCell>{memberDayTotals[member.memberId] || 0}</TableCell>
                    <TableCell>
                      <Badge variant={member.activeFlag === 1 ? 'default' : 'secondary'}>
                        {member.activeFlag === 1 ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(member)}
                        >
                          <UserCheck className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEmailEditToggle(member)}
                        >
                          {editingEmailMemberId === member.dbKey ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Edit className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendPortalEmail(member)}
                          disabled={sendingPortalMemberId === member.dbKey || !member.email}
                          title={member.email ? `Send ${getMemberPortalUrl(member)} to ${member.email}` : 'Add an email address before sending'}
                        >
                          {sendingPortalMemberId === member.dbKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedMember(member)}
                        >
                          Show performance
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500">No team members yet</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              {selectedMember?.memberName || 'Team Member Insight'}
            </DialogTitle>
            <DialogDescription>Show participation and sales performance breakdown</DialogDescription>
          </DialogHeader>

          {selectedMember && selectedInsight && (
            <div className="space-y-6 py-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="py-3">
                    <CardDescription>Caravans Sold</CardDescription>
                    <CardTitle className="text-2xl">{selectedInsight.totalCarsSold}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="py-3">
                    <CardDescription>Total Show Days</CardDescription>
                    <CardTitle className="text-2xl">{selectedInsight.participationDays}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="py-3">
                    <CardDescription>Average Caravans per Day</CardDescription>
                    <CardTitle className="text-2xl">{selectedInsight.avgDailySales.toFixed(2)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="py-3">
                    <CardDescription>Shows Joined</CardDescription>
                    <CardTitle className="text-2xl">{selectedInsight.memberShows.length}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Shows Participated</CardTitle>
                    <CardDescription>Based on show team assignments</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedInsight.memberShows.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Show</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead className="text-right">Days</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedInsight.memberShows.map((show) => (
                            <TableRow key={show.id || show.name}>
                              <TableCell className="font-medium">{show.name || show.id}</TableCell>
                              <TableCell>
                                {show.startDate && show.finishDate
                                  ? `${show.startDate} - ${show.finishDate}`
                                  : 'Dates not set'}
                              </TableCell>
                              <TableCell className="text-right">
                                {selectedInsight.entryDaysByShow[show.id || show.name || ''] || 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-sm text-gray-500">No assigned shows yet</div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Caravan Models Sold</CardTitle>
                    <CardDescription>Counts from their recorded caravan orders</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.keys(selectedInsight.modelCounts).length ? (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selectedInsight.modelCounts).map(([model, count]) => (
                          <Badge key={model} variant="outline" className="px-3 py-1 text-sm">
                            {model}: {count}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No recorded caravan sales</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Average Daily Trend</CardTitle>
                    <CardDescription>Orders per active show day</CardDescription>
                  </CardHeader>
                  <CardContent>{renderSparkBars(selectedInsight.avgDailyTrend, 'Average/day')}</CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Sales Trend</CardTitle>
                    <CardDescription>Orders per month</CardDescription>
                  </CardHeader>
                  <CardContent>{renderSparkBars(selectedInsight.salesTrend, 'Sales')}</CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Participation Trend</CardTitle>
                    <CardDescription>Show days per month</CardDescription>
                  </CardHeader>
                  <CardContent>{renderSparkBars(selectedInsight.participationTrend, 'Participation')}</CardContent>
                </Card>
              </div>

              <div>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Order History</CardTitle>
                    <CardDescription>Caravan orders attributed to this member</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedInsight.memberOrders.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Deal #</TableHead>
                            <TableHead>Show</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>This Round Days</TableHead>
                            <TableHead>Caravan Model</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedInsight.memberOrders.map((order) => {
                            const show = shows.find((s) => s.id === order.showId);
                            const dealNumber = Number((order as { dealNumber?: number | string }).dealNumber);
                            const showKey = show?.id || order.showId || '';
                            const showLabel = show?.name || 'Unknown show';
                            return (
                              <TableRow key={order.orderId}>
                                <TableCell className="font-medium">{order.orderId}</TableCell>
                                <TableCell>{Number.isFinite(dealNumber) && dealNumber > 0 ? `#${dealNumber}` : '-'}</TableCell>
                                <TableCell>{showLabel}</TableCell>
                                <TableCell>{order.date || '-'}</TableCell>
                                <TableCell>{selectedInsight.entryDaysByShow[showKey] || 0}</TableCell>
                                <TableCell>{order.model || '-'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-sm text-gray-500">No orders linked to this member</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
