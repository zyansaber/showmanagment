import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, CheckCircle, XCircle, Clock, Edit2, Save, X, Users, Sparkles } from 'lucide-react';
import { dbGet, dbPush, dbUpdate, dbRemove } from '@/lib/firebase';
import type {
  Show,
  ShowOrder,
  ShowTask,
  TeamMember,
  SiteLocation,
  ProcessTemplate,
  ProcessTemplateTask,
} from '@/types';
import { toast } from 'sonner';

export default function ShowDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [show, setShow] = useState<Show | null>(null);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [tasks, setTasks] = useState<ShowTask[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isManagingTeam, setIsManagingTeam] = useState(false);
  const [editedShow, setEditedShow] = useState<Partial<Show>>({});
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [processTemplates, setProcessTemplates] = useState<ProcessTemplate[]>([]);
  const [isUsingTemplate, setIsUsingTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templatePreviewTasks, setTemplatePreviewTasks] = useState<ProcessTemplateTask[]>([]);

  const [newOrder, setNewOrder] = useState<Partial<ShowOrder>>({
    chassisNumber: '',
    orderType: 'New Order',
    salesperson: '',
    status: 'Pending',
  });

  const [newTask, setNewTask] = useState<Partial<ShowTask>>({
    taskName: '',
    responsiblePeople: [],
    stage: 'Design',
    status: 'Not Started',
    percentComplete: 0,
    costBudget: 0,
    costActual: 0,
    notes: '',
    startDate: '',
    dueDate: '',
  });

  useEffect(() => {
    loadShowData();
  }, [id]);

  const normaliseTemplate = (template: ProcessTemplate): ProcessTemplate => {
    const timestamp = Date.now();
    const rawTasks = Array.isArray(template.tasks)
      ? template.tasks
      : template.tasks && typeof template.tasks === 'object'
        ? Object.values(template.tasks as unknown as Record<string, ProcessTemplateTask>)
        : [];
    return {
      ...template,
      tasks: rawTasks.map((task, index) => ({
        ...task,
        id: task.id || `tpl-task-${template.id || timestamp}-${index}`,
        durationDays:
          Number.isFinite(task.durationDays) && task.durationDays > 0
            ? Math.round(task.durationDays)
            : 1,
        leadTimeDays:
          Number.isFinite(task.leadTimeDays) && task.leadTimeDays >= 0
            ? Math.round(task.leadTimeDays)
            : 0,
      })),
    };
  };

  const loadShowData = async () => {
    try {
      const [showsData, ordersData, tasksData, teamData, templatesData] = await Promise.all([
        dbGet('shows'),
        dbGet('showOrders'),
        dbGet('showTasks'),
        dbGet('teamMembers'),
        dbGet('processTemplates')
      ]);

      const allShows: Show[] = showsData ? Object.values(showsData) : [];
      const currentShow = allShows.find(s => s.id === id);
      setShow(currentShow || null);
      setEditedShow(currentShow || {});
      setSelectedTeamMembers(currentShow?.teamMembers || []);

      const allOrders: ShowOrder[] = ordersData ? Object.values(ordersData) : [];
      setOrders(allOrders.filter(o => o.showId === id));

      const allTasks: ShowTask[] = tasksData ? Object.values(tasksData) : [];
      setTasks(allTasks.filter(t => t.eventId === id));

      const allTeamMembers: TeamMember[] = teamData ? Object.values(teamData) : [];
      setTeamMembers(allTeamMembers.filter(m => m.activeFlag === 1));

      if (templatesData) {
        const entries = Object.entries(templatesData as Record<string, ProcessTemplate>).map(([templateId, value]) => ({
          id: templateId,
          ...value,
        }));
        setProcessTemplates(entries.map((template) => normaliseTemplate(template)));
      } else {
        setProcessTemplates([]);
      }
    } catch (error) {
      console.error('Error loading show data:', error);
      toast.error('Failed to load show data');
    } finally {
      setLoading(false);
    }
  };

  const startDateInfo = useMemo(() => {
    if (show?.startDate) {
      const parsed = new Date(show.startDate);
      if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed, hasStartDate: true } as const;
      }
    }
    return { date: new Date(), hasStartDate: false } as const;
  }, [show?.startDate]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplatePreviewTasks([]);
      return;
    }

    const template = processTemplates.find((tpl) => tpl.id === selectedTemplateId);
    if (template) {
      const timestamp = Date.now();
      setTemplatePreviewTasks(
        template.tasks.map((task, index) => ({
          ...task,
          id: task.id || `tpl-task-preview-${timestamp}-${index}`,
        }))
      );
    } else {
      setTemplatePreviewTasks([]);
    }
  }, [selectedTemplateId, processTemplates]);

  const parseValue = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return value;
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'na' || trimmed === 'n/a' || trimmed === '') return 0;
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatValue = (value: number | undefined): string => {
    if (value === undefined || value === null || value === 0) return 'N/A';
    return value.toString();
  };

  const handleSaveShowInfo = async () => {
    try {
      if (!editedShow.name || !editedShow.startDate || !editedShow.finishDate) {
        toast.error('Please fill in all required fields');
        return;
      }

      const calculateDuration = (start: string, end: string) => {
        if (!start || !end) return 0;
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };

      const duration = calculateDuration(editedShow.startDate || '', editedShow.finishDate || '');

      const updatedShow: Show = {
        ...show!,
        name: editedShow.name || '',
        siteLocation: editedShow.siteLocation as SiteLocation,
        dealership: editedShow.dealership || '',
        startDate: editedShow.startDate || '',
        finishDate: editedShow.finishDate || '',
        showDuration: duration,
        target2024: parseValue(editedShow.target2024),
        sales2024: parseValue(editedShow.sales2024),
        target2025: parseValue(editedShow.target2025),
        sales2025: parseValue(editedShow.sales2025),
        target2026: parseValue(editedShow.target2026),
        sales2026: parseValue(editedShow.sales2026),
        eventOrganiser: editedShow.eventOrganiser || '',
        caravansOnDisplay: parseValue(editedShow.caravansOnDisplay),
        standSize: editedShow.standSize || '',
        layoutAddress: editedShow.layoutAddress || '',
        status: editedShow.status || 'Not Started',
        teamMembers: selectedTeamMembers
      };

      await dbUpdate(`shows/${id}`, updatedShow);
      setShow(updatedShow);
      setIsEditingInfo(false);
      toast.success('Show information updated successfully');
    } catch (error) {
      console.error('Error updating show:', error);
      toast.error('Failed to update show information');
    }
  };

  const handleAddOrder = async () => {
    try {
      if (!newOrder.chassisNumber || !newOrder.salesperson) {
        toast.error('Please fill in all required fields');
        return;
      }

      const order: ShowOrder = {
        id: `ORD-${Date.now()}`,
        showId: id || '',
        chassisNumber: newOrder.chassisNumber || '',
        orderType: newOrder.orderType as 'New Order' | 'Transfer from Stock',
        salesperson: newOrder.salesperson || '',
        date: new Date().toISOString().split('T')[0],
        status: 'Pending',
      };
      
      await dbPush('showOrders', order);
      setOrders([...orders, order]);
      setIsAddingOrder(false);
      setNewOrder({
        chassisNumber: '',
        orderType: 'New Order',
        salesperson: '',
        status: 'Pending',
      });
      toast.success('Order added successfully');
    } catch (error) {
      console.error('Error adding order:', error);
      toast.error('Failed to add order');
    }
  };

  const handleAddTask = async () => {
    try {
      if (!newTask.taskName || !newTask.startDate || !newTask.dueDate) {
        toast.error('Please fill in all required fields');
        return;
      }

      const task: ShowTask = {
        taskId: `TSK-${Date.now()}`,
        eventId: id || '',
        taskName: newTask.taskName || '',
        responsiblePeople: newTask.responsiblePeople || [],
        stage: newTask.stage as 'Design' | 'Booking' | 'Logistics' | 'Marketing',
        status: 'Not Started',
        startDate: newTask.startDate || '',
        dueDate: newTask.dueDate || '',
        percentComplete: 0,
        costBudget: parseValue(newTask.costBudget),
        costActual: 0,
        attachmentUrl: '',
        notes: newTask.notes || '',
      };
      
      await dbPush('showTasks', task);
      setTasks([...tasks, task]);
      setIsAddingTask(false);
      setNewTask({
        taskName: '',
        responsiblePeople: [],
        stage: 'Design',
        status: 'Not Started',
        percentComplete: 0,
        costBudget: 0,
        costActual: 0,
        notes: '',
        startDate: '',
        dueDate: '',
      });
      toast.success('Task added successfully');
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('Failed to add task');
    }
  };

  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

  const formatDateForPreview = (date: Date) =>
    date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

  const updatePreviewTask = (taskId: string, updates: Partial<ProcessTemplateTask>) => {
    setTemplatePreviewTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...updates,
            }
          : task
      )
    );
  };

  const calculateTaskDates = (task: ProcessTemplateTask) => {
    const baseDate = new Date(startDateInfo.date);
    const lead = Number.isFinite(task.leadTimeDays) ? task.leadTimeDays : 0;
    const duration = Number.isFinite(task.durationDays) ? Math.max(1, task.durationDays) : 1;
    const due = new Date(baseDate);
    due.setDate(due.getDate() - lead);
    const start = new Date(due);
    start.setDate(start.getDate() - (duration - 1));
    return { start, due };
  };

  const handleApplyTemplate = async () => {
    if (!id) return;

    if (!selectedTemplateId) {
      toast.error('Select a template to use.');
      return;
    }

    const validTasks = templatePreviewTasks.filter((task) => task.taskName.trim().length > 0);
    if (validTasks.length === 0) {
      toast.error('The selected template does not contain any tasks.');
      return;
    }

    try {
      if (!startDateInfo.hasStartDate) {
        toast.info('Show start date is missing, using today to schedule template tasks.');
      }

      const timestamp = Date.now();
      const tasksToCreate = validTasks.map((task, index) => {
        const { start, due } = calculateTaskDates(task);
        const payload: ShowTask = {
          taskId: `TSK-${timestamp + index}`,
          eventId: id,
          taskName: task.taskName,
          responsiblePeople: [],
          stage: task.stage,
          status: 'Not Started',
          startDate: formatDateForInput(start),
          dueDate: formatDateForInput(due),
          percentComplete: 0,
          costBudget: 0,
          costActual: 0,
          attachmentUrl: '',
          notes: task.notes ?? '',
        };
        return payload;
      });

      await Promise.all(tasksToCreate.map((task) => dbPush('showTasks', task)));
      setTasks((prev) => [...prev, ...tasksToCreate]);
      setIsUsingTemplate(false);
      setSelectedTemplateId('');
      setTemplatePreviewTasks([]);
      toast.success('Template tasks added to this show.');
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template. Please try again.');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string, percentComplete: number) => {
    try {
      await dbUpdate(`showTasks/${taskId}`, { status, percentComplete });
      setTasks(tasks.map(t => 
        t.taskId === taskId ? { ...t, status: status as ShowTask['status'], percentComplete } : t
      ));
      toast.success('Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleApproveOrder = async (orderId: string) => {
    try {
      await dbUpdate(`showOrders/${orderId}`, {
        status: 'Approved',
        approvedBy: 'Current User'
      });
      setOrders(orders.map(o => 
        o.id === orderId ? { ...o, status: 'Approved' as const, approvedBy: 'Current User' } : o
      ));
      toast.success('Order approved successfully');
    } catch (error) {
      console.error('Error approving order:', error);
      toast.error('Failed to approve order');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await dbRemove(`showOrders/${orderId}`);
        setOrders(orders.filter(o => o.id !== orderId));
        toast.success('Order deleted successfully');
      } catch (error) {
        console.error('Error deleting order:', error);
        toast.error('Failed to delete order');
      }
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await dbRemove(`showTasks/${taskId}`);
        setTasks(tasks.filter(t => t.taskId !== taskId));
        toast.success('Task deleted successfully');
      } catch (error) {
        console.error('Error deleting task:', error);
        toast.error('Failed to delete task');
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
      case 'Done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Rejected':
      case 'Blocked':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'Pending':
      case 'In Progress':
        return <Clock className="h-4 w-4 text-orange-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Approved: 'bg-green-500',
      Pending: 'bg-orange-500',
      Rejected: 'bg-red-500',
      Done: 'bg-green-500',
      'In Progress': 'bg-blue-500',
      Blocked: 'bg-red-500',
      'Not Started': 'bg-gray-500',
      Completed: 'bg-green-500',
    };
    return <Badge className={colors[status] || 'bg-gray-500'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading show details...</div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="text-lg text-gray-600 mb-4">Show not found</div>
        <Button onClick={() => navigate('/shows')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Show Management
        </Button>
      </div>
    );
  }

  const showTeamMembers = teamMembers.filter(m => selectedTeamMembers.includes(m.memberId));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/shows')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{show.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {show.siteLocation?.suburb || 'N/A'}, {show.siteLocation?.state || 'N/A'}
            </p>
          </div>
        </div>
        {getStatusBadge(show.status)}
      </div>

      {/* Show Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Target 2025</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatValue(show.target2025)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Current Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatValue(show.sales2025)}</div>
            {show.target2025 > 0 && (
              <Progress value={(show.sales2025 / show.target2025) * 100} className="mt-2" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{selectedTeamMembers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              {tasks.filter(t => t.status === 'Done').length} completed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="bg-white">
          <TabsTrigger value="info">Show Information</TabsTrigger>
          <TabsTrigger value="team">Team Members</TabsTrigger>
          <TabsTrigger value="tasks">Tasks & Project Management</TabsTrigger>
          <TabsTrigger value="orders">Orders & Sales</TabsTrigger>
        </TabsList>

        {/* Show Info Tab */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Show Information</CardTitle>
                  <CardDescription>Complete details about the show</CardDescription>
                </div>
                {!isEditingInfo ? (
                  <Button onClick={() => setIsEditingInfo(true)}>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Information
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsEditingInfo(false);
                      setEditedShow(show);
                    }}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                    <Button onClick={handleSaveShowInfo}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isEditingInfo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-600">Show Name</Label>
                      <p className="font-medium">{show.name}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Location</Label>
                      <p className="font-medium">
                        {show.siteLocation?.number} {show.siteLocation?.street}<br />
                        {show.siteLocation?.suburb}, {show.siteLocation?.state} {show.siteLocation?.postcode}<br />
                        {show.siteLocation?.country}
                      </p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Dealership</Label>
                      <p className="font-medium">{show.dealership || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Event Organiser</Label>
                      <p className="font-medium">{show.eventOrganiser || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Start Date</Label>
                      <p className="font-medium">{show.startDate}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">End Date</Label>
                      <p className="font-medium">{show.finishDate}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Duration</Label>
                      <p className="font-medium">{show.showDuration} days</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-gray-600">2024 Target / Sales</Label>
                      <p className="font-medium">{formatValue(show.target2024)} / {formatValue(show.sales2024)}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">2025 Target / Sales</Label>
                      <p className="font-medium">{formatValue(show.target2025)} / {formatValue(show.sales2025)}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">2026 Target / Sales</Label>
                      <p className="font-medium">{formatValue(show.target2026)} / {formatValue(show.sales2026)}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Caravans on Display</Label>
                      <p className="font-medium">{formatValue(show.caravansOnDisplay)}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Stand Size</Label>
                      <p className="font-medium">{show.standSize || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-gray-600">Status</Label>
                      <div className="mt-1">{getStatusBadge(show.status)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Edit Form - Similar to ShowManagement but inline */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Basic Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Label>Show Name *</Label>
                        <Input
                          value={editedShow.name}
                          onChange={(e) => setEditedShow({ ...editedShow, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Dealership</Label>
                        <Input
                          value={editedShow.dealership}
                          onChange={(e) => setEditedShow({ ...editedShow, dealership: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Event Organiser</Label>
                        <Input
                          value={editedShow.eventOrganiser}
                          onChange={(e) => setEditedShow({ ...editedShow, eventOrganiser: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Location</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Number</Label>
                        <Input
                          value={editedShow.siteLocation?.number}
                          onChange={(e) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, number: e.target.value }
                          })}
                        />
                      </div>
                      <div>
                        <Label>Street</Label>
                        <Input
                          value={editedShow.siteLocation?.street}
                          onChange={(e) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, street: e.target.value }
                          })}
                        />
                      </div>
                      <div>
                        <Label>Suburb</Label>
                        <Input
                          value={editedShow.siteLocation?.suburb}
                          onChange={(e) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, suburb: e.target.value }
                          })}
                        />
                      </div>
                      <div>
                        <Label>Postcode</Label>
                        <Input
                          value={editedShow.siteLocation?.postcode}
                          onChange={(e) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, postcode: e.target.value }
                          })}
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Select
                          value={editedShow.siteLocation?.state}
                          onValueChange={(value) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, state: value }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NSW">NSW</SelectItem>
                            <SelectItem value="VIC">VIC</SelectItem>
                            <SelectItem value="QLD">QLD</SelectItem>
                            <SelectItem value="WA">WA</SelectItem>
                            <SelectItem value="SA">SA</SelectItem>
                            <SelectItem value="TAS">TAS</SelectItem>
                            <SelectItem value="NT">NT</SelectItem>
                            <SelectItem value="ACT">ACT</SelectItem>
                            <SelectItem value="NZ">NZ</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Country</Label>
                        <Input
                          value={editedShow.siteLocation?.country}
                          onChange={(e) => setEditedShow({ 
                            ...editedShow, 
                            siteLocation: { ...editedShow.siteLocation!, country: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Dates & Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Date *</Label>
                        <Input
                          type="date"
                          value={editedShow.startDate}
                          onChange={(e) => setEditedShow({ ...editedShow, startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Finish Date *</Label>
                        <Input
                          type="date"
                          value={editedShow.finishDate}
                          onChange={(e) => setEditedShow({ ...editedShow, finishDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Caravans on Display</Label>
                        <Input
                          value={editedShow.caravansOnDisplay}
                          onChange={(e) => setEditedShow({ ...editedShow, caravansOnDisplay: e.target.value as unknown as number })}
                          placeholder="Number or N/A"
                        />
                      </div>
                      <div>
                        <Label>Stand Size</Label>
                        <Input
                          value={editedShow.standSize}
                          onChange={(e) => setEditedShow({ ...editedShow, standSize: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Targets & Sales (Enter N/A if unknown)</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>2024 Target</Label>
                        <Input
                          value={editedShow.target2024}
                          onChange={(e) => setEditedShow({ ...editedShow, target2024: e.target.value as unknown as number })}
                        />
                      </div>
                      <div>
                        <Label>2024 Sales</Label>
                        <Input
                          value={editedShow.sales2024}
                          onChange={(e) => setEditedShow({ ...editedShow, sales2024: e.target.value as unknown as number })}
                        />
                      </div>
                      <div></div>
                      <div>
                        <Label>2025 Target</Label>
                        <Input
                          value={editedShow.target2025}
                          onChange={(e) => setEditedShow({ ...editedShow, target2025: e.target.value as unknown as number })}
                        />
                      </div>
                      <div>
                        <Label>2025 Sales</Label>
                        <Input
                          value={editedShow.sales2025}
                          onChange={(e) => setEditedShow({ ...editedShow, sales2025: e.target.value as unknown as number })}
                        />
                      </div>
                      <div></div>
                      <div>
                        <Label>2026 Target</Label>
                        <Input
                          value={editedShow.target2026}
                          onChange={(e) => setEditedShow({ ...editedShow, target2026: e.target.value as unknown as number })}
                        />
                      </div>
                      <div>
                        <Label>2026 Sales</Label>
                        <Input
                          value={editedShow.sales2026}
                          onChange={(e) => setEditedShow({ ...editedShow, sales2026: e.target.value as unknown as number })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Status</h3>
                    <Select
                      value={editedShow.status}
                      onValueChange={(value) => setEditedShow({ ...editedShow, status: value as Show['status'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Not Started">Not Started</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Members Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage team members assigned to this show</CardDescription>
                </div>
                <Dialog open={isManagingTeam} onOpenChange={setIsManagingTeam}>
                  <DialogTrigger asChild>
                    <Button>
                      <Users className="h-4 w-4 mr-2" />
                      Manage Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Select Team Members</DialogTitle>
                      <DialogDescription>Choose team members to assign to this show</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      {teamMembers.map((member) => (
                        <div key={member.memberId} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                          <Checkbox
                            id={member.memberId}
                            checked={selectedTeamMembers.includes(member.memberId)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTeamMembers([...selectedTeamMembers, member.memberId]);
                              } else {
                                setSelectedTeamMembers(selectedTeamMembers.filter(id => id !== member.memberId));
                              }
                            }}
                          />
                          <label
                            htmlFor={member.memberId}
                            className="flex-1 cursor-pointer"
                      >
                            <div className="font-medium">{member.memberName}</div>
                            <div className="text-sm text-gray-500">{member.role} • {member.email}</div>
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsManagingTeam(false)}>
                        Cancel
                      </Button>
                      <Button onClick={async () => {
                        try {
                          await dbUpdate(`shows/${id}`, { teamMembers: selectedTeamMembers });
                          setShow({ ...show!, teamMembers: selectedTeamMembers });
                          setIsManagingTeam(false);
                          toast.success('Team members updated successfully');
                        } catch (error) {
                          console.error('Error updating team members:', error);
                          toast.error('Failed to update team members');
                        }
                      }}>
                        Save Team
                      </Button>
                    </div>
                    </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
            <CardContent>
              {showTeamMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {showTeamMembers.map((member) => (
                    <Card key={member.memberId}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{member.memberName}</h3>
                            <p className="text-sm text-gray-600">{member.role}</p>
                            <p className="text-sm text-gray-500 mt-1">{member.email}</p>
                          </div>
                          <Badge variant="outline">{member.activeFlag === 1 ? 'Active' : 'Inactive'}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No team members assigned yet</p>
                  <Button onClick={() => setIsManagingTeam(true)}>
                    <Users className="h-4 w-4 mr-2" />
                    Add Team Members
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Tasks & Project Management</CardTitle>
                  <CardDescription>Track project tasks, deadlines, and responsibilities</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog
                    open={isUsingTemplate}
                    onOpenChange={(open) => {
                      setIsUsingTemplate(open);
                      if (!open) {
                        setSelectedTemplateId('');
                        setTemplatePreviewTasks([]);
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button variant="secondary">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Use Template
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Use Process Template</DialogTitle>
                        <DialogDescription>
                          Select a saved process to instantly load tasks with calculated start and due dates.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-6">
                        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                          {startDateInfo.hasStartDate ? (
                            <span>
                              Tasks will be scheduled backwards from the show start date of{' '}
                              <span className="font-semibold">{formatDateForPreview(startDateInfo.date)}</span>.
                            </span>
                          ) : (
                            <span>
                              The show is missing a start date, so tasks will be scheduled using today as the reference
                              point.
                            </span>
                          )}
                        </div>

                        {processTemplates.length > 0 ? (
                          <div className="space-y-4">
                            <div>
                              <Label>Select template</Label>
                              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a template" />
                                </SelectTrigger>
                                <SelectContent>
                                  {processTemplates.map((template) => (
                                    <SelectItem key={template.id} value={template.id}>
                                      {template.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {selectedTemplateId && templatePreviewTasks.length > 0 ? (
                              <div className="space-y-4">
                                {templatePreviewTasks.map((task) => {
                                  const { start, due } = calculateTaskDates(task);
                                  return (
                                    <div key={task.id} className="rounded-lg border p-4">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div>
                                          <h4 className="text-base font-semibold text-gray-900">{task.taskName}</h4>
                                          <p className="text-xs uppercase tracking-wide text-gray-500">Stage: {task.stage}</p>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          <p>
                                            Starts:{' '}
                                            <span className="font-medium text-gray-900">
                                              {formatDateForPreview(start)}
                                            </span>
                                          </p>
                                          <p>
                                            Due:{' '}
                                            <span className="font-medium text-gray-900">
                                              {formatDateForPreview(due)}
                                            </span>
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-4 grid gap-4 md:grid-cols-3">
                                        <div>
                                          <Label className="text-xs uppercase text-gray-500">Duration (days)</Label>
                                          <Input
                                            type="number"
                                            min={1}
                                            value={task.durationDays}
                                            onChange={(event) =>
                                              updatePreviewTask(task.id, {
                                                durationDays: Math.max(1, Number(event.target.value) || 1),
                                              })
                                            }
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs uppercase text-gray-500">
                                            Lead time before show (days)
                                          </Label>
                                          <Input
                                            type="number"
                                            min={0}
                                            value={task.leadTimeDays}
                                            onChange={(event) =>
                                              updatePreviewTask(task.id, {
                                                leadTimeDays: Math.max(0, Number(event.target.value) || 0),
                                              })
                                            }
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs uppercase text-gray-500">Notes</Label>
                                          <Textarea
                                            value={task.notes ?? ''}
                                            onChange={(event) => updatePreviewTask(task.id, { notes: event.target.value })}
                                            placeholder="Notes for this show"
                                            rows={2}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              selectedTemplateId && (
                                <p className="text-sm text-gray-500">
                                  This template has no tasks yet. Edit it from the Process Templates page.
                                </p>
                              )
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-sm text-gray-500">
                              No process templates found. Create one from the Process Templates page to get started.
                            </p>
                            <Button variant="outline" onClick={() => navigate('/process-templates')}>
                              Manage Templates
                            </Button>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsUsingTemplate(false);
                              setSelectedTemplateId('');
                              setTemplatePreviewTasks([]);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleApplyTemplate}
                            disabled={!selectedTemplateId || templatePreviewTasks.length === 0}
                          >
                            Apply Template
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Task
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add New Task</DialogTitle>
                        <DialogDescription>Create a new project management task</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Task Name *</Label>
                          <Input
                            value={newTask.taskName}
                            onChange={(e) => setNewTask({ ...newTask, taskName: e.target.value })}
                            placeholder="Enter task name"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Stage</Label>
                            <Select
                              value={newTask.stage}
                              onValueChange={(value) => setNewTask({ ...newTask, stage: value as ShowTask['stage'] })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Design">Design</SelectItem>
                                <SelectItem value="Booking">Booking</SelectItem>
                                <SelectItem value="Logistics">Logistics</SelectItem>
                                <SelectItem value="Marketing">Marketing</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Cost Budget</Label>
                            <Input
                              value={newTask.costBudget}
                              onChange={(e) => setNewTask({ ...newTask, costBudget: e.target.value as unknown as number })}
                              placeholder="Budget or N/A"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Start Date *</Label>
                            <Input
                              type="date"
                              value={newTask.startDate}
                              onChange={(e) => setNewTask({ ...newTask, startDate: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Due Date *</Label>
                            <Input
                              type="date"
                              value={newTask.dueDate}
                              onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Responsible People</Label>
                          <div className="space-y-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                            {showTeamMembers.map((member) => (
                              <div key={member.memberId} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`task-${member.memberId}`}
                                  checked={newTask.responsiblePeople?.includes(member.memberName)}
                                  onCheckedChange={(checked) => {
                                    const current = newTask.responsiblePeople || [];
                                    if (checked) {
                                      setNewTask({ ...newTask, responsiblePeople: [...current, member.memberName] });
                                    } else {
                                      setNewTask({
                                        ...newTask,
                                        responsiblePeople: current.filter((name) => name !== member.memberName),
                                      });
                                    }
                                  }}
                                />
                                <label htmlFor={`task-${member.memberId}`} className="text-sm cursor-pointer">
                                  {member.memberName}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Textarea
                            value={newTask.notes}
                            onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                            placeholder="Enter task notes"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button variant="outline" onClick={() => setIsAddingTask(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddTask}>Add Task</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {tasks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task Name</TableHead>
                      <TableHead>Responsible People</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.taskId}>
                        <TableCell className="font-medium">{task.taskName}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {task.responsiblePeople.length > 0 ? task.responsiblePeople.join(', ') : 'Unassigned'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{task.stage}</Badge>
                        </TableCell>
                        <TableCell>{task.startDate}</TableCell>
                        <TableCell>{task.dueDate}</TableCell>
                        <TableCell>
                          <Select
                            value={task.status}
                            onValueChange={(value) => {
                              const percentMap: Record<string, number> = {
                                'Not Started': 0,
                                'In Progress': 50,
                                'Blocked': 50,
                                'Done': 100
                              };
                              handleUpdateTaskStatus(task.taskId, value, percentMap[value] || task.percentComplete);
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Started">Not Started</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Blocked">Blocked</SelectItem>
                              <SelectItem value="Done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={task.percentComplete} className="w-16" />
                            <span className="text-xs">{task.percentComplete}%</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatValue(task.costBudget)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.taskId)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No tasks yet. Add your first task to get started.</p>
                  <Button onClick={() => setIsAddingTask(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Task
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Orders & Sales</CardTitle>
                  <CardDescription>Manage orders and track sales performance</CardDescription>
                </div>
                <Dialog open={isAddingOrder} onOpenChange={setIsAddingOrder}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Order</DialogTitle>
                      <DialogDescription>Enter order details</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Chassis Number *</Label>
                        <Input
                          value={newOrder.chassisNumber}
                          onChange={(e) => setNewOrder({ ...newOrder, chassisNumber: e.target.value })}
                          placeholder="e.g., SRV123456"
                        />
                      </div>
                      <div>
                        <Label>Order Type</Label>
                        <Select
                          value={newOrder.orderType}
                          onValueChange={(value) => setNewOrder({ ...newOrder, orderType: value as ShowOrder['orderType'] })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="New Order">New Order</SelectItem>
                            <SelectItem value="Transfer from Stock">Transfer from Stock</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Salesperson *</Label>
                        <Select
                          value={newOrder.salesperson}
                          onValueChange={(value) => setNewOrder({ ...newOrder, salesperson: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select salesperson" />
                          </SelectTrigger>
                          <SelectContent>
                            {showTeamMembers.map((member) => (
                              <SelectItem key={member.memberId} value={member.memberName}>
                                {member.memberName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsAddingOrder(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleAddOrder}>Add Order</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Chassis Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.id}</TableCell>
                        <TableCell>{order.chassisNumber}</TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell>{order.salesperson}</TableCell>
                        <TableCell>{order.date}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(order.status)}
                            {getStatusBadge(order.status)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {order.status === 'Pending' && (
                              <Button 
                                size="sm" 
                                onClick={() => handleApproveOrder(order.id)}
                              >
                                Approve
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteOrder(order.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No orders yet. Add your first order to get started.</p>
                  <Button onClick={() => setIsAddingOrder(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Order
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
