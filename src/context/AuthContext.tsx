import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dbGet, dbUpdate } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

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

export default function AdminSettings() {
  const { accounts, createAccount, updateAccount, deleteAccount, user } = useAuth();
  const [formState, setFormState] = useState(emptyAccountForm);
  const [savingAccount, setSavingAccount] = useState(false);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [showSettings, setShowSettings] = useState<Record<string, ShowSettings>>({});
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [loadingShows, setLoadingShows] = useState(true);

  const loadShowData = async () => {
    try {
      setLoadingShows(true);
      const [showsData, templatesData] = await Promise.all([
        dbGet('shows'),
        dbGet('processTemplates'),
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
    return [...shows].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  }, [shows]);

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

  const handleAccountUpdate = async (username: string, updates: Partial<{ password: string; role: string }>) => {
    try {
      await updateAccount(username, {
        ...(updates.password ? { password: updates.password } : {}),
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
                      <TableHead>Password</TableHead>
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
                {sortedShows.map((show) => {
                  const settings = showSettings[show.id];
                  if (!settings) return null;
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
                          <Input
                            value={settings.handoverDealer}
                            onChange={(event) =>
                              handleShowSettingChange(show.id, { handoverDealer: event.target.value })
                            }
                          />
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
  onUpdate: (username: string, updates: { password?: string; role?: string }) => void;
  onDelete: (username: string) => void;
};

const AccountRow = ({ account, onUpdate, onDelete }: AccountRowProps) => {
  const [password, setPassword] = useState(account.password);
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
      <TableCell>
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-w-[160px]"
        />
      </TableCell>
      <TableCell className="text-right space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUpdate(account.username, { password, role })}
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
