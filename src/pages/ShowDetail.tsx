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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, CheckCircle, XCircle, Clock, Edit2, Save, X, Users, Sparkles, Check } from 'lucide-react';
import { dbGet, dbSet, dbUpdate, dbRemove, schedulingDbGet } from '@/lib/firebase';
import type {
  Show,
  ShowOrder,
  ShowTask,
  TeamMember,
  SiteLocation,
  ProcessTemplate,
  ProcessTemplateTask,
  ShowCaravanPick,
  ScheduleOrder,
} from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TASK_STATUSES: ShowTask['status'][] = ['Not Started', 'In Progress', 'Blocked', 'Done'];
const TASK_STAGES: ShowTask['stage'][] = ['Design', 'Booking', 'Logistics', 'Marketing'];

const normalisePercentComplete = (value: unknown): number => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 100) return 100;
  return Math.round(numeric);
};

const toSafeNumber = (value: unknown): number => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN;

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const normaliseTaskRecord = (
  task: Partial<ShowTask> | undefined,
  fallbackEventId?: string,
  fallbackTaskId?: string
): ShowTask => {
  const safeTask = task ?? {};
  const rawTaskId =
    typeof safeTask.taskId === 'string' && safeTask.taskId.trim().length > 0
      ? safeTask.taskId.trim()
      : fallbackTaskId || `task-${fallbackEventId || 'unknown'}-${Date.now()}`;
  const rawEventId =
    typeof safeTask.eventId === 'string' && safeTask.eventId.trim().length > 0
      ? safeTask.eventId.trim()
      : fallbackEventId || '';
  const trimmedName =
    typeof safeTask.taskName === 'string' && safeTask.taskName.trim().length > 0
      ? safeTask.taskName.trim()
      : 'Untitled Task';
  const stageCandidate = typeof safeTask.stage === 'string' ? safeTask.stage : undefined;
  const statusCandidate = typeof safeTask.status === 'string' ? safeTask.status : undefined;

  const responsiblePeople = Array.isArray(safeTask.responsiblePeople)
    ? Array.from(
        new Set(
          safeTask.responsiblePeople.filter((name): name is string =>
            typeof name === 'string' && name.trim().length > 0
          )
        )
      )
    : [];

  return {
    taskId: rawTaskId,
    eventId: rawEventId,
    taskName: trimmedName,
    responsiblePeople,
    stage: TASK_STAGES.includes(stageCandidate as ShowTask['stage'])
      ? (stageCandidate as ShowTask['stage'])
      : 'Design',
    status: TASK_STATUSES.includes(statusCandidate as ShowTask['status'])
      ? (statusCandidate as ShowTask['status'])
      : 'Not Started',
    startDate: typeof safeTask.startDate === 'string' ? safeTask.startDate : '',
    dueDate: typeof safeTask.dueDate === 'string' ? safeTask.dueDate : '',
    percentComplete: normalisePercentComplete(safeTask.percentComplete),
    costBudget: toSafeNumber(safeTask.costBudget),
    costActual: toSafeNumber(safeTask.costActual),
    attachmentUrl:
      typeof safeTask.attachmentUrl === 'string' ? safeTask.attachmentUrl : '',
    notes: typeof safeTask.notes === 'string' ? safeTask.notes : '',
  };
};

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
  const [caravanPicks, setCaravanPicks] = useState<ShowCaravanPick[]>([]);
  const [availableCaravans, setAvailableCaravans] = useState<ScheduleOrder[]>([]);
  const [loadingCaravans, setLoadingCaravans] = useState<boolean>(false);
  const [caravanSearch, setCaravanSearch] = useState('');
  const [currentShowKey, setCurrentShowKey] = useState<string | null>(null);
  const [handoverDealerOptions, setHandoverDealerOptions] = useState<string[]>([]);
  const [selectedHandoverDealer, setSelectedHandoverDealer] = useState('');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);

  const [newOrder, setNewOrder] = useState<Partial<ShowOrder>>({
    chassisNumber: '',
    model: '',
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
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<ShowTask | null>(null);
  const [editingTaskForm, setEditingTaskForm] = useState<Partial<ShowTask>>({});
  const [isSalespersonPickerOpen, setIsSalespersonPickerOpen] = useState(false);

  useEffect(() => {
    loadShowData();
  }, [id]);

  useEffect(() => {
    if (show?.handoverDealer) {
      setSelectedHandoverDealer(show.handoverDealer);
    }
  }, [show?.handoverDealer]);

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
      const [
        showsData,
        ordersData,
        tasksData,
        teamData,
        templatesData,
        caravanPickData,
      ] = await Promise.all([
        dbGet('shows'),
        dbGet('showOrders'),
        dbGet('showTasks'),
        dbGet('teamMembers'),
        dbGet('processTemplates'),
        dbGet('showCaravanPicks'),
      ]);

      const showEntries = showsData ? Object.entries(showsData as Record<string, Show>) : [];
      const matchedShowEntry = showEntries.find(([, value]) => value.id === id);
      const currentShow = matchedShowEntry ? matchedShowEntry[1] : null;
      setCurrentShowKey(matchedShowEntry ? matchedShowEntry[0] : null);
      setShow(currentShow || null);
      setEditedShow(currentShow || {});
      setSelectedTeamMembers(currentShow?.teamMembers || []);
      setSelectedHandoverDealer(currentShow?.handoverDealer || '');

      const allOrders: ShowOrder[] = ordersData ? Object.values(ordersData) : [];
      setOrders(allOrders.filter(o => o.showId === id));

      const allTasks = tasksData
        ? Object.values(tasksData as Record<string, Partial<ShowTask>>)
        : [];
      const tasksForShow = allTasks
        .filter((task) => task?.eventId === id)
        .map((task, index) => normaliseTaskRecord(task, id, task?.taskId || `task-${index}`));
      setTasks(tasksForShow);

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

      if (caravanPickData && id) {
        const picks = Object.entries(caravanPickData as Record<string, ShowCaravanPick | null | undefined>).reduce<
          ShowCaravanPick[]
        >((acc, [pickId, value]) => {
          if (!value || value.showId !== id) return acc;
          acc.push({ ...value, id: pickId });
          return acc;
        }, []);
        setCaravanPicks(picks);
      } else {
        setCaravanPicks([]);
      }
    } catch (error) {
      console.error('Error loading show data:', error);
      toast.error('Failed to load show data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadSchedule = async () => {
      try {
        setLoadingCaravans(true);
        const scheduleData = await schedulingDbGet('schedule');
        if (scheduleData) {
          const values = Object.values(scheduleData as Record<string, ScheduleOrder>);
          const dealers = Array.from(
            new Set(values.map((order) => order.Dealer?.trim()).filter((dealer): dealer is string => Boolean(dealer)))
          ).sort((a, b) => a.localeCompare(b));
          setHandoverDealerOptions(dealers);
          const models = Array.from(
            new Set(values.map((order) => order.Model?.trim()).filter((model): model is string => Boolean(model)))
          ).sort((a, b) => a.localeCompare(b));
          setModelOptions(models);
          const filtered = values.filter((order) => {
            const dealer = order.Dealer?.trim();
            const production = order['Regent Production']?.trim();
            return dealer === 'Snowy Stock' && production !== 'Finished';
          });
          setAvailableCaravans(filtered);
        } else {
          setHandoverDealerOptions([]);
          setModelOptions([]);
          setAvailableCaravans([]);
        }
      } catch (error) {
        console.error('Error loading caravan schedule:', error);
        toast.error('Failed to load caravan schedule');
      } finally {
        setLoadingCaravans(false);
      }
    };

    loadSchedule();
  }, []);

  const sanitiseKey = (value: string) => {
    const invalidChars = ['.', '#', '$', '[', ']', '/'];
    return invalidChars.reduce((result, char) => result.split(char).join('-'), value);
  };

  const createCaravanPickId = (showId: string, chassis: string) =>
    `pick-${sanitiseKey(showId)}-${sanitiseKey(chassis.toUpperCase())}`;

  const handleAddCaravanToShow = async (order: ScheduleOrder) => {
    if (!id) return;
    const chassis = order.Chassis?.trim();
    if (!chassis) {
      toast.error('This caravan is missing a chassis number.');
      return;
    }

    const pickId = createCaravanPickId(id, chassis);
    const payload: ShowCaravanPick = {
      id: pickId,
      showId: id,
      chassis,
      model: order.Model?.trim() || 'Unknown',
      dealer: order.Dealer?.trim() || 'Unknown',
      productionStatus: order['Regent Production']?.trim() || 'Unknown',
      requestDeliveryDate: order['Request Delivery Date']?.trim() || '',
    };

    try {
      await dbSet(`showCaravanPicks/${pickId}`, payload as unknown as Record<string, unknown>);
      setCaravanPicks((prev) => {
        const others = prev.filter((pick) => pick.id !== pickId);
        return [...others, payload];
      });
      toast.success('Caravan added to show picks.');
    } catch (error) {
      console.error('Error adding caravan to show:', error);
      toast.error('Failed to add caravan to this show.');
    }
  };

  const handleRemoveCaravanPick = async (pickId: string) => {
    try {
      await dbRemove(`showCaravanPicks/${pickId}`);
      setCaravanPicks((prev) => prev.filter((pick) => pick.id !== pickId));
      toast.success('Caravan removed from show picks.');
    } catch (error) {
      console.error('Error removing caravan from show:', error);
      toast.error('Failed to remove caravan from this show.');
    }
  };

  const pickExists = (chassis: string | undefined) => {
    if (!chassis) return false;
    return caravanPicks.some((pick) => pick.chassis.toUpperCase() === chassis.trim().toUpperCase());
  };

  const filteredAvailableCaravans = useMemo(() => {
    const query = caravanSearch.trim().toLowerCase();
    if (!query) return availableCaravans;
    return availableCaravans.filter((order) => order.Model?.toLowerCase().includes(query));
  }, [availableCaravans, caravanSearch]);

  const caravanPickRangeStats = useMemo(() => {
    const summary = new Map<string, { count: number; models: Set<string> }>();

    caravanPicks.forEach((pick) => {
      const prefix = (pick.model || '').slice(0, 3).toUpperCase() || 'N/A';
      const existing = summary.get(prefix) ?? { count: 0, models: new Set<string>() };
      existing.count += 1;
      if (pick.model) {
        existing.models.add(pick.model);
      }
      summary.set(prefix, existing);
    });

    return Array.from(summary.entries())
      .map(([range, value]) => ({
        range,
        count: value.count,
        models: Array.from(value.models).sort(),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.range.localeCompare(b.range);
      });
  }, [caravanPicks]);

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
      if (!editedShow.name) {
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

      const firebaseKey = currentShowKey || id;
      if (!firebaseKey) {
        toast.error('Unable to determine show location in database.');
        return;
      }

      await dbUpdate(`shows/${firebaseKey}`, updatedShow);
      setShow(updatedShow);
      setIsEditingInfo(false);
      toast.success('Show information updated successfully');
    } catch (error) {
      console.error('Error updating show:', error);
      toast.error('Failed to update show information');
    }
  };

  const handleAddOrder = async () => {
    const requiresHandoverDealer = orders.length === 0 && !show?.handoverDealer;
    try {
      if (!newOrder.salesperson) {
        toast.error('Please fill in all required fields');
        return;
      }

      if (requiresHandoverDealer && !selectedHandoverDealer) {
        toast.error('Please choose a handover dealer for this show');
        return;
      }

      const selectedModel = newOrder.model?.trim();
      const isValidModel = selectedModel
        ? modelOptions.some((option) => option.toLowerCase() === selectedModel.toLowerCase())
        : false;
      if (!isValidModel) {
        toast.error('Please select a model from the schedule list');
        return;
      }

      const order: ShowOrder = {
        id: `ORD-${Date.now()}`,
        showId: id || '',
        chassisNumber: newOrder.chassisNumber || '',
        model: selectedModel || '',
        orderType: newOrder.orderType as 'New Order' | 'Transfer from Stock',
        salesperson: newOrder.salesperson || '',
        date: new Date().toISOString().split('T')[0],
        status: 'Pending',
      };

      await dbSet(`showOrders/${order.id}`, order as unknown as Record<string, unknown>);
      if (requiresHandoverDealer && selectedHandoverDealer) {
        const firebaseKey = currentShowKey || id;
        if (!firebaseKey) {
          toast.error('Unable to update show with selected dealer.');
          return;
        }
        await dbUpdate(`shows/${firebaseKey}`, { handoverDealer: selectedHandoverDealer });
        setShow((prev) => (prev ? { ...prev, handoverDealer: selectedHandoverDealer } : prev));
      }
      setOrders((prev) => [...prev, order]);
      setIsAddingOrder(false);
      setNewOrder({
        chassisNumber: '',
        model: '',
        orderType: 'New Order',
        salesperson: '',
        status: 'Pending',
      });
      if (requiresHandoverDealer) {
        setSelectedHandoverDealer('');
      }
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

      await dbSet(`showTasks/${task.taskId}`, task as unknown as Record<string, unknown>);
      setTasks((prev) => [...prev, normaliseTaskRecord(task, id, task.taskId)]);
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

  const formatScheduleDate = (value: string) => {
    if (!value) return 'TBD';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  };

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

      await Promise.all(
        tasksToCreate.map((task) => dbSet(`showTasks/${task.taskId}`, task as unknown as Record<string, unknown>))
      );
      setTasks((prev) => [
        ...prev,
        ...tasksToCreate.map((task) => normaliseTaskRecord(task, id, task.taskId)),
      ]);
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
      setTasks((prev) =>
        prev.map((t) =>
          t.taskId === taskId ? { ...t, status: status as ShowTask['status'], percentComplete } : t
        )
      );
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
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status: 'Approved' as const, approvedBy: 'Current User' } : o
        )
      );
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
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
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
        setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
        toast.success('Task deleted successfully');
      } catch (error) {
        console.error('Error deleting task:', error);
        toast.error('Failed to delete task');
      }
    }
  };

  const statusProgressMap: Record<ShowTask['status'], number> = {
    'Not Started': 0,
    'In Progress': 50,
    Blocked: 50,
    Done: 100,
  };

  const openTaskEditor = (task: ShowTask) => {
    setEditingTask(task);
    setEditingTaskForm({
      ...task,
      responsiblePeople: [...(task.responsiblePeople || [])],
      notes: task.notes ?? '',
    });
    setIsEditingTask(true);
  };

  const closeTaskEditor = () => {
    setIsEditingTask(false);
    setEditingTask(null);
    setEditingTaskForm({});
  };

  const clampPercent = (value: number) => {
    if (Number.isNaN(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
  };

  const handleSaveTaskEdits = async () => {
    if (!editingTask) return;

    const name = editingTaskForm.taskName?.trim();
    if (!name) {
      toast.error('Task name is required.');
      return;
    }

    if (!editingTaskForm.startDate || !editingTaskForm.dueDate) {
      toast.error('Start and due dates are required.');
      return;
    }

    const percent = clampPercent(
      editingTaskForm.percentComplete ?? statusProgressMap[editingTaskForm.status as ShowTask['status']] ?? editingTask.percentComplete
    );

    const responsible = Array.isArray(editingTaskForm.responsiblePeople)
      ? editingTaskForm.responsiblePeople
      : [];

    const payload: ShowTask = {
      ...editingTask,
      taskName: name,
      stage: (editingTaskForm.stage || editingTask.stage) as ShowTask['stage'],
      status: (editingTaskForm.status || editingTask.status) as ShowTask['status'],
      startDate: editingTaskForm.startDate,
      dueDate: editingTaskForm.dueDate,
      responsiblePeople: responsible,
      notes: editingTaskForm.notes ?? '',
      percentComplete: percent,
      costBudget: parseValue(editingTaskForm.costBudget ?? editingTask.costBudget),
      costActual: parseValue(editingTaskForm.costActual ?? editingTask.costActual),
    };

    try {
      await dbUpdate(`showTasks/${editingTask.taskId}`, {
        taskName: payload.taskName,
        stage: payload.stage,
        status: payload.status,
        startDate: payload.startDate,
        dueDate: payload.dueDate,
        responsiblePeople: payload.responsiblePeople,
        notes: payload.notes,
        percentComplete: payload.percentComplete,
        costBudget: payload.costBudget,
        costActual: payload.costActual,
      });

      setTasks((prev) =>
        prev.map((task) =>
          task.taskId === payload.taskId
            ? normaliseTaskRecord(payload, id, payload.taskId)
            : task
        )
      );
      toast.success('Task updated successfully');
      closeTaskEditor();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
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
        <TabsList className="flex flex-wrap gap-2 rounded-xl bg-white p-1 shadow-sm">
          <TabsTrigger value="info" className="px-6 py-3 text-base">
            Show Information
          </TabsTrigger>
          <TabsTrigger value="team" className="px-6 py-3 text-base">
            Team Members
          </TabsTrigger>
          <TabsTrigger value="tasks" className="px-6 py-3 text-base">
            Tasks & Project Management
          </TabsTrigger>
          <TabsTrigger value="orders" className="px-6 py-3 text-base">
            Orders & Sales
          </TabsTrigger>
          <TabsTrigger value="caravan" className="px-6 py-3 text-base">
            Caravan Pick
          </TabsTrigger>
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
                        <Label>Start Date</Label>
                        <Input
                          type="date"
                          value={editedShow.startDate}
                          onChange={(e) => setEditedShow({ ...editedShow, startDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Finish Date</Label>
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
                        const firebaseKey = currentShowKey || id;
                        if (!firebaseKey) {
                          toast.error('Unable to determine show location in database.');
                          return;
                        }
                        try {
                          await dbUpdate(`shows/${firebaseKey}`, { teamMembers: selectedTeamMembers });
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
                                            Starts{' '}
                                            <span className="font-medium text-gray-900">
                                              {formatDateForPreview(start)}
                                            </span>
                                          </p>
                                          <p>
                                            Due{' '}
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
                  <Dialog open={isEditingTask} onOpenChange={(open) => (open ? setIsEditingTask(true) : closeTaskEditor())}>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Task</DialogTitle>
                        <DialogDescription>Update task details and progress</DialogDescription>
                      </DialogHeader>
                      {editingTask && (
                        <div className="space-y-4 py-4">
                          <div>
                            <Label>Task Name *</Label>
                            <Input
                              value={editingTaskForm.taskName ?? ''}
                              onChange={(e) =>
                                setEditingTaskForm((prev) => ({ ...prev, taskName: e.target.value }))
                              }
                              placeholder="Enter task name"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <Label>Stage</Label>
                              <Select
                                value={(editingTaskForm.stage ?? editingTask.stage) as ShowTask['stage']}
                                onValueChange={(value) =>
                                  setEditingTaskForm((prev) => ({
                                    ...prev,
                                    stage: value as ShowTask['stage'],
                                  }))
                                }
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
                              <Label>Status</Label>
                              <Select
                                value={(editingTaskForm.status ?? editingTask.status) as ShowTask['status']}
                                onValueChange={(value) => {
                                  const mapped = statusProgressMap[value as ShowTask['status']];
                                  setEditingTaskForm((prev) => ({
                                    ...prev,
                                    status: value as ShowTask['status'],
                                    percentComplete: mapped,
                                  }));
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Not Started">Not Started</SelectItem>
                                  <SelectItem value="In Progress">In Progress</SelectItem>
                                  <SelectItem value="Blocked">Blocked</SelectItem>
                                  <SelectItem value="Done">Done</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <Label>Start Date *</Label>
                              <Input
                                type="date"
                                value={editingTaskForm.startDate ?? editingTask.startDate}
                                onChange={(e) =>
                                  setEditingTaskForm((prev) => ({ ...prev, startDate: e.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <Label>Due Date *</Label>
                              <Input
                                type="date"
                                value={editingTaskForm.dueDate ?? editingTask.dueDate}
                                onChange={(e) =>
                                  setEditingTaskForm((prev) => ({ ...prev, dueDate: e.target.value }))
                                }
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                              <Label>Progress (%)</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={editingTaskForm.percentComplete ?? editingTask.percentComplete}
                                onChange={(e) =>
                                  setEditingTaskForm((prev) => ({
                                    ...prev,
                                    percentComplete: clampPercent(Number(e.target.value)),
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <Label>Cost Budget</Label>
                              <Input
                                value={(
                                  editingTaskForm.costBudget ?? editingTask.costBudget ?? ''
                                ).toString()}
                                onChange={(e) =>
                                  setEditingTaskForm((prev) => {
                                    if (e.target.value === '') {
                                      return { ...prev, costBudget: undefined };
                                    }
                                    const parsed = Number(e.target.value);
                                    return {
                                      ...prev,
                                      costBudget: Number.isNaN(parsed) ? prev.costBudget : parsed,
                                    };
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Cost Actual</Label>
                              <Input
                                value={(
                                  editingTaskForm.costActual ?? editingTask.costActual ?? ''
                                ).toString()}
                                onChange={(e) =>
                                  setEditingTaskForm((prev) => {
                                    if (e.target.value === '') {
                                      return { ...prev, costActual: undefined };
                                    }
                                    const parsed = Number(e.target.value);
                                    return {
                                      ...prev,
                                      costActual: Number.isNaN(parsed) ? prev.costActual : parsed,
                                    };
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Responsible People</Label>
                            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
                              {showTeamMembers.map((member) => {
                                const responsible = Array.isArray(editingTaskForm.responsiblePeople)
                                  ? editingTaskForm.responsiblePeople
                                  : editingTask.responsiblePeople;
                                const isChecked = responsible?.includes(member.memberName);
                                return (
                                  <div key={member.memberId} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`edit-task-${member.memberId}`}
                                      checked={Boolean(isChecked)}
                                      onCheckedChange={(checked) => {
                                        setEditingTaskForm((prev) => {
                                          const current = Array.isArray(prev.responsiblePeople)
                                            ? prev.responsiblePeople
                                            : [...(editingTask.responsiblePeople || [])];
                                          if (checked) {
                                            if (current.includes(member.memberName)) {
                                              return prev;
                                            }
                                            return {
                                              ...prev,
                                              responsiblePeople: [...current, member.memberName],
                                            };
                                          }
                                          return {
                                            ...prev,
                                            responsiblePeople: current.filter((name) => name !== member.memberName),
                                          };
                                        });
                                      }}
                                    />
                                    <label htmlFor={`edit-task-${member.memberId}`} className="text-sm">
                                      {member.memberName}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Textarea
                              value={editingTaskForm.notes ?? ''}
                              onChange={(e) =>
                                setEditingTaskForm((prev) => ({ ...prev, notes: e.target.value }))
                              }
                              placeholder="Enter task notes"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={closeTaskEditor}>
                              Cancel
                            </Button>
                            <Button onClick={handleSaveTaskEdits}>Save Changes</Button>
                          </div>
                        </div>
                      )}
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
                      <TableHead className="w-32 text-right">Actions</TableHead>
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
                              const mapped = statusProgressMap[value as ShowTask['status']];
                              handleUpdateTaskStatus(
                                task.taskId,
                                value,
                                mapped !== undefined ? mapped : task.percentComplete
                              );
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openTaskEditor(task)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTask(task.taskId)}
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
                    {orders.length === 0 && !show?.handoverDealer && (
                      <div>
                        <Label>Handover Dealer *</Label>
                        <Select
                          value={selectedHandoverDealer}
                          onValueChange={(value) => setSelectedHandoverDealer(value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select handover dealer" />
                          </SelectTrigger>
                          <SelectContent>
                            {handoverDealerOptions.map((dealer) => (
                              <SelectItem key={dealer} value={dealer}>
                                {dealer}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {handoverDealerOptions.length === 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Dealer list unavailable. Please refresh after schedule sync.
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <Label>Model *</Label>
                      <Popover open={isModelPickerOpen} onOpenChange={setIsModelPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isModelPickerOpen}
                            className="w-full justify-between"
                            disabled={modelOptions.length === 0}
                          >
                            {newOrder.model ? newOrder.model : 'Select model'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0">
                          <Command>
                            <CommandInput placeholder="Search model..." />
                            <CommandList>
                              <CommandEmpty>No model found.</CommandEmpty>
                              <CommandGroup heading="Schedule models">
                                {modelOptions.map((model) => (
                                  <CommandItem
                                    key={model}
                                    value={model}
                                    onSelect={(value) => {
                                      setNewOrder({ ...newOrder, model: value });
                                      setIsModelPickerOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        newOrder.model === model ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    {model}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {newOrder.model && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => setNewOrder({ ...newOrder, model: '' })}
                        >
                          Clear selection
                        </Button>
                      )}
                      {modelOptions.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Model list unavailable. Please refresh after schedule sync.
                        </p>
                      )}
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
                        <Popover
                          open={isSalespersonPickerOpen}
                          onOpenChange={setIsSalespersonPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={isSalespersonPickerOpen}
                              className="w-full justify-between"
                            >
                              {newOrder.salesperson
                                ? newOrder.salesperson
                                : 'Select salesperson'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px] p-0">
                            <Command>
                              <CommandInput placeholder="Search team member..." />
                              <CommandList>
                                <CommandEmpty>No team member found.</CommandEmpty>
                                <CommandGroup heading="Active Team Members">
                                  {showTeamMembers.map((member) => (
                                    <CommandItem
                                      key={member.memberId}
                                      value={member.memberName}
                                      onSelect={(value) => {
                                        setNewOrder({ ...newOrder, salesperson: value });
                                        setIsSalespersonPickerOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          newOrder.salesperson === member.memberName
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      <div className="flex flex-col">
                                        <span>{member.memberName}</span>
                                        <span className="text-xs text-muted-foreground">{member.role}</span>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {newOrder.salesperson && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => setNewOrder({ ...newOrder, salesperson: '' })}
                          >
                            Clear selection
                          </Button>
                        )}
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
                      <TableHead>Model</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Handover Dealer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.id}</TableCell>
                        <TableCell>{order.model || 'Not set'}</TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell>{order.salesperson}</TableCell>
                        <TableCell>{order.date}</TableCell>
                        <TableCell>{show?.handoverDealer || 'Not set'}</TableCell>
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

        {/* Caravan Pick Tab */}
        <TabsContent value="caravan">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Caravan Pick</CardTitle>
                  <CardDescription>
                    Assign caravans from the Snowy Stock schedule to this show and keep track of their readiness.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Show Pick Vans</h3>
                    <Badge variant="outline">{caravanPicks.length}</Badge>
                  </div>
                  {caravanPickRangeStats.length > 0 && (
                    <div className="rounded-lg border bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                          Model Range Dashboard
                        </h4>
                        <span className="text-xs font-medium text-gray-500">
                          Showing grouped totals by first three characters
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {caravanPickRangeStats.map((stat) => (
                          <div key={stat.range} className="rounded-md border bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between text-sm text-gray-500">
                              <span>Range</span>
                              <span className="font-semibold text-blue-600">{stat.range}</span>
                            </div>
                            <div className="mt-2 text-2xl font-bold text-gray-900">{stat.count}</div>
                            <p className="mt-2 text-xs text-gray-500">
                              {stat.models.length > 0 ? stat.models.join(', ') : 'No model names available'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {caravanPicks.length > 0 ? (
                    <div className="space-y-3">
                      {caravanPicks
                        .slice()
                        .sort((a, b) => a.chassis.localeCompare(b.chassis))
                        .map((pick) => (
                          <div key={pick.id} className="rounded-lg border p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-base font-semibold text-gray-900">{pick.model}</p>
                                <p className="text-sm text-gray-500">Chassis: {pick.chassis}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveCaravanPick(pick.id)}
                                aria-label={`Remove ${pick.chassis} from show picks`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
                              <div>
                                <dt className="text-xs uppercase text-gray-500">Dealer</dt>
                                <dd className="font-medium text-gray-900">{pick.dealer}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase text-gray-500">Production</dt>
                                <dd className="font-medium text-gray-900">{pick.productionStatus}</dd>
                              </div>
                              <div className="sm:col-span-2">
                                <dt className="text-xs uppercase text-gray-500">Delivery Target</dt>
                                <dd className="font-medium text-gray-900">
                                  {pick.requestDeliveryDate
                                    ? formatScheduleDate(pick.requestDeliveryDate)
                                    : 'TBD'}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                      No caravans selected yet. Choose from the list on the right to build this show's display.
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">Available Caravans</h3>
                      <Badge variant="outline">{filteredAvailableCaravans.length}</Badge>
                    </div>
                    <Input
                      value={caravanSearch}
                      onChange={(event) => setCaravanSearch(event.target.value)}
                      placeholder="Search by model name..."
                      className="w-full"
                    />
                  </div>
                  <div className="rounded-xl border">
                    {loadingCaravans ? (
                      <div className="flex h-48 items-center justify-center text-gray-500">
                        Loading caravan schedule...
                      </div>
                    ) : filteredAvailableCaravans.length > 0 ? (
                      <div className="max-h-[520px] divide-y overflow-y-auto">
                        {filteredAvailableCaravans.map((order) => {
                          const chassis = order.Chassis || `${order.Model}-${order.Index1}`;
                          const alreadyAdded = pickExists(order.Chassis);
                          return (
                            <div
                              key={chassis}
                              className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p className="font-semibold text-gray-900">{order.Model || 'Unknown model'}</p>
                                <p className="text-sm text-gray-500">Chassis: {order.Chassis || 'N/A'}</p>
                                <p className="text-xs text-gray-500">
                                  Regent Production: {order['Regent Production'] || 'N/A'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Request Delivery: {formatScheduleDate(order['Request Delivery Date'] || '')}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant={alreadyAdded ? 'outline' : 'default'}
                                disabled={alreadyAdded}
                                onClick={() => handleAddCaravanToShow(order)}
                              >
                                {alreadyAdded ? 'Added' : 'Add to show'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex h-48 items-center justify-center text-gray-500">
                        {caravanSearch.trim()
                          ? 'No caravans match your search.'
                          : 'No caravans currently available for Snowy Stock.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
