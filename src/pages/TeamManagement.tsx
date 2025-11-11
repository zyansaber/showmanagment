import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Edit, Trash2, Lock } from 'lucide-react';
import { dbGet, dbPush, dbUpdate, dbRemove } from '@/lib/firebase';
import type { TeamMember, UserRole } from '@/types';

export default function TeamManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingMember, setIsAddingMember] = useState(false);

  const [newMember, setNewMember] = useState<Partial<TeamMember>>({
    memberName: '',
    role: 'Show Team',
    email: '',
    activeFlag: 1,
  });

  useEffect(() => {
    if (isAuthenticated) {
      loadTeamMembers();
    }
  }, [isAuthenticated]);

  const loadTeamMembers = async () => {
    try {
      const membersData = await dbGet('teamMembers');
      setTeamMembers(membersData ? Object.values(membersData) : []);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    if (password === 'admin123') {
      setIsAuthenticated(true);
    } else {
      alert('Incorrect password');
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
      };
      
      await dbPush('teamMembers', member);
      setTeamMembers([...teamMembers, member]);
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

  const handleToggleActive = async (memberId: string, currentFlag: 0 | 1) => {
    try {
      const newFlag = currentFlag === 1 ? 0 : 1;
      await dbUpdate(`teamMembers/${memberId}`, { activeFlag: newFlag });
      setTeamMembers(teamMembers.map(m => 
        m.memberId === memberId ? { ...m, activeFlag: newFlag } : m
      ));
    } catch (error) {
      console.error('Error toggling member status:', error);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'Headquarter Management':
        return 'bg-purple-500';
      case 'Show Manager':
        return 'bg-blue-500';
      case 'Show Team':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle>Admin Panel Access</CardTitle>
            <CardDescription>Enter password to access team management</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter admin password"
                />
                <p className="text-xs text-gray-500 mt-1">Demo password: admin123</p>
              </div>
              <Button onClick={handleLogin} className="w-full">
                Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              <CardDescription>Manage employee information and roles</CardDescription>
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
                          <SelectItem value="Show Manager">Show Manager</SelectItem>
                          <SelectItem value="Headquarter Management">Headquarter Management</SelectItem>
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
              <Button variant="outline" onClick={() => setIsAuthenticated(false)}>
                Logout
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {teamMembers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Total Sales</TableHead>
                  <TableHead>Work Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.memberId}>
                    <TableCell className="font-medium">{member.memberId}</TableCell>
                    <TableCell>{member.memberName}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge className={getRoleBadgeColor(member.role)}>{member.role}</Badge>
                    </TableCell>
                    <TableCell>{member.totalSales || 0}</TableCell>
                    <TableCell>{member.totalWorkDays || 0}</TableCell>
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
                          onClick={() => handleToggleActive(member.memberId, member.activeFlag)}
                        >
                          <Edit className="h-4 w-4" />
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

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>Overview of access levels for each role</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <Badge className="bg-green-500 mb-2">Show Team</Badge>
              <h3 className="font-semibold mb-2">Show Team</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• View show information</li>
                <li>• View assigned tasks</li>
                <li>• Read-only access</li>
                <li>• Cannot modify data</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge className="bg-blue-500 mb-2">Show Manager</Badge>
              <h3 className="font-semibold mb-2">Show Manager</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Add and edit show data</li>
                <li>• Manage team assignments</li>
                <li>• Create and update tasks</li>
                <li>• Submit for approval</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <Badge className="bg-purple-500 mb-2">Headquarter Management</Badge>
              <h3 className="font-semibold mb-2">Headquarter Management</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Full system access</li>
                <li>• Approve/reject submissions</li>
                <li>• Set targets and budgets</li>
                <li>• Manage all users</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}