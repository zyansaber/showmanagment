import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { dbGet, dbSet, dbUpdate, schedulingDbGet } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import type { ScheduleOrder } from '@/types';

const emptyAccountForm = {
  username: '',
  password: '',
  role: 'user',
} as const;

type ShowRecord = {
  id: string;
  firebaseKey: string;
  name?: string;
  startDate?: string;
  finishDate?: string;
  dealership?: string;
  handoverDealer?: string;
  processTemplateId?: string;
  status?: string;
};

type ShowSettings = {
  startDate: string;
  finishDate: string;
  dealership: string;
  handoverDealer: string;
  assignProcessTemplate: boolean;
  processTemplateId: string;
};

type ProcessTemplate = {
  id: string;
  name: string;
};

type OrderStatusOption = {
  id: string;
  label: string;
  description: string;
  color: string;
  sortOrder: number;
};

const STATUS_SWATCHES = [
  '#FECACA',
  '#FDE68A',
  '#BBF7D0',
  '#BFDBFE',
  '#C7D2FE',
  '#E9D5FF',
  '#FBCFE8',
  '#CBD5F5',
  '#E2E8F0',
  '#99F6E4',
  '#F9A8D4',
  '#FDBA74',
];

const createStatusId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `status-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export default function AdminSettings() {
  const { accounts, createAccount, updateAccount, deleteAccount, user } = useAuth();
  const [formState, setFormState] = useState(emptyAccountForm);
  const [savingAccount, setSavingAccount] = useState(false);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [showSettings, setShowSettings] = useState<Record<string, ShowSettings>>({});
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [dealerOptions, setDealerOptions] = useState<string[]>([]);
  const [loadingShows, setLoadingShows] = useState(true);
  const [showSearchTerm, setShowSearchTerm] = useState('');
  const [showSortKey, setShowSortKey] = useState<'name' | 'startDate' | 'finishDate'>('startDate');
  const [showSortDirection, setShowSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);
  const [statusDraft, setStatusDraft] = useState({ label: '', description: '', color: '#E2E8F0' });
  const [savingStatusOptions, setSavingStatusOptions] = useState(false);

  const loadShowData = async () => {
    try {
      setLoadingShows(true);
      const [showsData, templatesData, scheduleData, statusData] = await Promise.all([
        dbGet('shows'),
        dbGet('processTemplates'),
        schedulingDbGet('schedule'),
        dbGet('orderStatusOptions'),
      ]);
      const showList = showsData
        ? (Object.entries(showsData) as Array<[string, Omit<ShowRecord, 'firebaseKey'>]>).map(
            ([key, value]) => ({
              ...value,
              id: value.id || key,
              firebaseKey: key,
            })
          )
        : [];
      const templateList = templatesData
        ? Object.entries(templatesData as Record<string, { name?: string }>).map(([id, value]) => ({
            id,
            name: value.name || id,
          }))
        : [];
      setShows(showList);
      setTemplates(templateList);
      if (scheduleData) {
        const values = Object.values(scheduleData as Record<string, ScheduleOrder>);
        const dealers = Array.from(
          new Set(values.map((order) => order.Dealer?.trim()).filter((name): name is string => Boolean(name)))
        ).sort((a, b) => a.localeCompare(b));
        setDealerOptions(dealers);
      } else {
        setDealerOptions([]);
      }
      const statusList = statusData
        ? (Object.entries(statusData as Record<string, Partial<OrderStatusOption>>).map(([id, value]) => ({
            id,
            label: value.label || '',
            description: value.description || '',
            color: value.color || '#E2E8F0',
            sortOrder: typeof value.sortOrder === 'number' ? value.sortOrder : 0,
          })) as OrderStatusOption[])
        : [];
      setStatusOptions(statusList.sort((a, b) => a.sortOrder - b.sortOrder));
      setShowSettings(() => {
        const next: Record<string, ShowSettings> = {};
        showList.forEach((show) => {
          next[show.id] = {
            startDate: show.startDate || '',
            finishDate: show.finishDate || '',
            dealership: show.dealership || '',
            handoverDealer: show.handoverDealer || '',
            assignProcessTemplate: Boolean(show.processTemplateId),
            processTemplateId: show.processTemplateId || '',
          };
        });
        return next;
      });
    } catch (error) {
      console.error(error);
      toast.error('Failed to load show settings');
    } finally {
      setLoadingShows(false);
    }
  };

  const sortedShows = useMemo(() => {
    const term = showSearchTerm.trim().toLowerCase();
    const filtered = shows.filter((show) => {
      if (!term) return true;
      const name = (show.name || show.id).toLowerCase();
      return name.includes(term);
    });
    const getDateValue = (show: ShowRecord, key: 'startDate' | 'finishDate') => {
      const settings = showSettings[show.id];
      const value = settings?.[key] || show[key] || '';
      const timestamp = value ? new Date(value).getTime() : Number.NaN;
      return Number.isNaN(timestamp) ? null : timestamp;
    };
    return filtered.sort((a, b) => {
      if (showSortKey === 'name') {
        const result = (a.name || a.id).localeCompare(b.name || b.id);
        return showSortDirection === 'asc' ? result : -result;
      }
      const aTime = getDateValue(a, showSortKey);
      const bTime = getDateValue(b, showSortKey);
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return showSortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    });
  }, [showSearchTerm, showSortDirection, showSortKey, showSettings, shows]);

  const handleAccountSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.username || !formState.password) {
      toast.error('Please enter username and password');
      return;
    }
    setSavingAccount(true);
    try {
      await createAccount({
        username: formState.username,
        password: formState.password,
        role: formState.role === 'admin' ? 'admin' : 'user',
      });
      toast.success('Account created');
      setFormState(emptyAccountForm);
    } catch (error) {
      console.error(error);
      toast.error('Failed to create account');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleAccountUpdate = async (username: string, updates: Partial<{ role: string }>) => {
    try {
      await updateAccount(username, {
        ...(updates.role ? { role: updates.role as 'admin' | 'user' } : {}),
      });
      toast.success('Account updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update account');
    }
  };

  const handleAccountDelete = async (username: string) => {
    if (username === user?.username) {
      toast.error('Cannot delete current account');
      return;
    }
    try {
      await deleteAccount(username);
      toast.success('Account deleted');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete account');
    }
  };

  const handleShowSettingChange = (showId: string, updates: Partial<ShowSettings>) => {
    setShowSettings((prev) => ({
      ...prev,
      [showId]: {
        ...prev[showId],
        ...updates,
      },
    }));
  };

  const handleStatusOptionChange = (id: string, updates: Partial<OrderStatusOption>) => {
    setStatusOptions((prev) =>
      prev.map((option) =>
        option.id === id
          ? {
              ...option,
              ...updates,
            }
          : option
      )
    );
  };

  const handleAddStatusOption = () => {
    if (!statusDraft.label.trim()) {
      toast.error('Please add a status name');
      return;
    }
    setStatusOptions((prev) => [
      ...prev,
      {
        id: createStatusId(),
        label: statusDraft.label.trim(),
        description: statusDraft.description.trim(),
        color: statusDraft.color,
        sortOrder: prev.length,
      },
    ]);
    setStatusDraft({ label: '', description: '', color: '#E2E8F0' });
  };

  const handleRemoveStatusOption = (id: string) => {
    setStatusOptions((prev) => prev.filter((option) => option.id !== id));
  };

  const handleSaveStatusOptions = async () => {
    try {
      setSavingStatusOptions(true);
      const payload = statusOptions.reduce<Record<string, Omit<OrderStatusOption, 'id'>>>(
        (acc, option, index) => {
          acc[option.id] = {
            label: option.label.trim(),
            description: option.description.trim(),
            color: option.color,
            sortOrder: index,
          };
          return acc;
        },
        {}
      );
      await dbSet('orderStatusOptions', payload as unknown as Record<string, unknown>);
      setStatusOptions((prev) =>
        prev
          .map((option, index) => ({ ...option, sortOrder: index }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      );
      toast.success('Order status options saved');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save order status options');
    } finally {
      setSavingStatusOptions(false);
    }
  };

  const handleSaveShowSettings = async (show: ShowRecord) => {
    const settings = showSettings[show.id];
    if (!settings) return;
    try {
      await dbUpdate(`shows/${show.firebaseKey}`, {
        startDate: settings.startDate || null,
        finishDate: settings.finishDate || null,
        dealership: settings.dealership || null,
        handoverDealer: settings.handoverDealer || null,
        processTemplateId: settings.assignProcessTemplate ? settings.processTemplateId || null : null,
      } as unknown as Record<string, unknown>);
      toast.success(`${show.name || show.id} updated`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save show settings');
    }
  };

  useEffect(() => {
    loadShowData();
  }, []);

  return (
    <div className="space-y-8">
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Account Management</CardTitle>
            <CardDescription>Create and maintain login accounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="grid gap-4 md:grid-cols-4" onSubmit={handleAccountSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formState.username}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, username: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  value={formState.password}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={formState.role}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, role: value === 'admin' ? 'admin' : 'user' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={savingAccount} className="w-full">
                  {savingAccount ? 'Saving…' : 'Create account'}
                </Button>
              </div>
            </form>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Existing accounts</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <AccountRow
                        key={account.username}
                        account={account}
                        onUpdate={handleAccountUpdate}
                        onDelete={handleAccountDelete}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Order Status Legend</CardTitle>
            <CardDescription>
              Define the status colours and meanings used on the Orders &amp; Sales page. These colours also tint the
              entire row in the orders table.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1.2fr_1.8fr_0.7fr_auto]">
              <div className="space-y-2">
                <Label>Status name</Label>
                <Input
                  placeholder="e.g. Awaiting deposit"
                  value={statusDraft.label}
                  onChange={(event) => setStatusDraft((prev) => ({ ...prev, label: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status meaning</Label>
                <Textarea
                  placeholder="Explain what this colour means..."
                  value={statusDraft.description}
                  onChange={(event) => setStatusDraft((prev) => ({ ...prev, description: event.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Colour</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={statusDraft.color}
                    onChange={(event) => setStatusDraft((prev) => ({ ...prev, color: event.target.value }))}
                    className="h-10 w-12 p-1"
                  />
                  <Input
                    value={statusDraft.color}
                    onChange={(event) => setStatusDraft((prev) => ({ ...prev, color: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddStatusOption}>Add status</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              {STATUS_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setStatusDraft((prev) => ({ ...prev, color: swatch }))}
                  className="h-6 w-6 rounded-full border border-slate-200"
                  style={{ backgroundColor: swatch }}
                  aria-label={`Pick ${swatch}`}
                />
              ))}
            </div>
            <div className="space-y-4">
              {statusOptions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No order statuses yet. Add a status above to start building your colour legend.
                </p>
              ) : (
                statusOptions.map((option) => (
                  <div key={option.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid gap-4 lg:grid-cols-[auto_1fr_2fr_1fr_auto] lg:items-start">
                      <div
                        className="h-10 w-10 rounded-full border border-slate-200"
                        style={{ backgroundColor: option.color }}
                      />
                      <div className="space-y-2">
                        <Label>Status name</Label>
                        <Input
                          value={option.label}
                          onChange={(event) =>
                            handleStatusOptionChange(option.id, { label: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status meaning</Label>
                        <Textarea
                          value={option.description}
                          onChange={(event) =>
                            handleStatusOptionChange(option.id, { description: event.target.value })
                          }
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Colour</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={option.color}
                            onChange={(event) =>
                              handleStatusOptionChange(option.id, { color: event.target.value })
                            }
                            className="h-10 w-12 p-1"
                          />
                          <Input
                            value={option.color}
                            onChange={(event) =>
                              handleStatusOptionChange(option.id, { color: event.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <Button variant="outline" onClick={() => handleRemoveStatusOption(option.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {STATUS_SWATCHES.map((swatch) => (
                        <button
                          key={`${option.id}-${swatch}`}
                          type="button"
                          onClick={() => handleStatusOptionChange(option.id, { color: swatch })}
                          className="h-6 w-6 rounded-full border border-slate-200"
                          style={{ backgroundColor: swatch }}
                          aria-label={`Pick ${swatch}`}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveStatusOptions} disabled={savingStatusOptions}>
                {savingStatusOptions ? 'Saving…' : 'Save status legend'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Show Settings</CardTitle>
            <CardDescription>
              Set start/finish dates, dealerships, and process templates by show name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingShows ? (
              <div className="text-sm text-slate-500">Loading show data…</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="min-w-[220px] flex-1 space-y-2">
                    <Label htmlFor="show-search">Search show name</Label>
                    <Input
                      id="show-search"
                      placeholder="Search by show name"
                      value={showSearchTerm}
                      onChange={(event) => setShowSearchTerm(event.target.value)}
                    />
                  </div>
                  <div className="min-w-[200px] space-y-2">
                    <Label>Sort by</Label>
                    <Select
                      value={showSortKey}
                      onValueChange={(value) =>
                        setShowSortKey(value as 'name' | 'startDate' | 'finishDate')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="startDate">Start date</SelectItem>
                        <SelectItem value="finishDate">Finish date</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setShowSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                      }
                    >
                      {showSortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    </Button>
                  </div>
                </div>
                {sortedShows.map((show) => {
                  const settings = showSettings[show.id];
                  if (!settings) return null;
                  const handoverOptions = dealerOptions.includes(settings.handoverDealer)
                    ? dealerOptions
                    : settings.handoverDealer
                      ? [settings.handoverDealer, ...dealerOptions]
                      : dealerOptions;
                  return (
                    <div key={show.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-semibold text-slate-900">
                          {show.name || 'Unnamed show'}
                        </h3>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Input
                            type="date"
                            value={settings.startDate}
                            onChange={(event) =>
                              handleShowSettingChange(show.id, { startDate: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Finish Date</Label>
                          <Input
                            type="date"
                            value={settings.finishDate}
                            onChange={(event) =>
                              handleShowSettingChange(show.id, { finishDate: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Dealership</Label>
                          <Input
                            value={settings.dealership}
                            onChange={(event) =>
                              handleShowSettingChange(show.id, { dealership: event.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Handover Dealer</Label>
                          <Select
                            value={settings.handoverDealer || 'none'}
                            onValueChange={(value) =>
                              handleShowSettingChange(show.id, {
                                handoverDealer: value === 'none' ? '' : value,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select handover dealer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No dealer</SelectItem>
                              {handoverOptions.map((dealer) => (
                                <SelectItem key={dealer} value={dealer}>
                                  {dealer}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {handoverOptions.length === 0 && (
                            <p className="text-xs text-slate-500">
                              No handover dealers found in scheduling data.
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Process Template</Label>
                          <Select
                            value={settings.processTemplateId || 'none'}
                            onValueChange={(value) =>
                              handleShowSettingChange(show.id, {
                                processTemplateId: value === 'none' ? '' : value,
                              })
                            }
                            disabled={!settings.assignProcessTemplate}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No template</SelectItem>
                              {templates.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={settings.assignProcessTemplate}
                            onCheckedChange={(checked) =>
                              handleShowSettingChange(show.id, { assignProcessTemplate: checked })
                            }
                          />
                          <span className="text-sm text-slate-700">Assign process template</span>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button onClick={() => handleSaveShowSettings(show)}>Save</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

type AccountRowProps = {
  account: { username: string; password: string; role: string };
  onUpdate: (username: string, updates: { role?: string }) => void;
  onDelete: (username: string) => void;
};

const AccountRow = ({ account, onUpdate, onDelete }: AccountRowProps) => {
  const [role, setRole] = useState(account.role);

  return (
    <TableRow>
      <TableCell className="font-medium">{account.username}</TableCell>
      <TableCell>
        <Select value={role} onValueChange={(value) => setRole(value)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUpdate(account.username, { role })}
        >
          Update
        </Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(account.username)}>
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
};
