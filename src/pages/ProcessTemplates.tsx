import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { dbGet, dbRemove, dbSet } from '@/lib/firebase';
import type { ProcessTemplate, ProcessTemplateTask } from '@/types';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

const stageOptions: ProcessTemplateTask['stage'][] = ['Design', 'Booking', 'Logistics', 'Marketing'];

const generateId = () => `tpl-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createEmptyTask = (): ProcessTemplateTask => ({
  id: generateId(),
  taskName: '',
  stage: 'Design',
  durationDays: 1,
  leadTimeDays: 0,
  notes: '',
});

const createEmptyTemplate = (): ProcessTemplate => ({
  id: '',
  name: '',
  description: '',
  tasks: [createEmptyTask()],
});

const sanitizeTemplate = (template: ProcessTemplate): ProcessTemplate => ({
  ...template,
  tasks: template.tasks.map((task) => ({
    ...task,
    durationDays:
      Number.isFinite(task.durationDays) && task.durationDays > 0
        ? Math.round(task.durationDays)
        : 1,
    leadTimeDays:
      Number.isFinite(task.leadTimeDays) && task.leadTimeDays >= 0
        ? Math.round(task.leadTimeDays)
        : 0,
  })),
});

export default function ProcessTemplates() {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [workingTemplate, setWorkingTemplate] = useState<ProcessTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setLoading(true);
        const data = await dbGet('processTemplates');
        if (data) {
          const mapped = Object.entries(data as Record<string, ProcessTemplate>).map(([id, value]) => ({
            id,
            ...value,
          }));
          setTemplates(mapped.map((item) => sanitizeTemplate({ ...item, id: item.id })));
        } else {
          setTemplates([]);
        }
      } catch (error) {
        console.error('Failed to load templates', error);
        toast.error('Failed to load process templates.');
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const templateCountSummary = useMemo(() => ({
    total: templates.length,
    totalTasks: templates.reduce((sum, tpl) => sum + tpl.tasks.length, 0),
  }), [templates]);

  const openCreateDialog = () => {
    setWorkingTemplate(createEmptyTemplate());
    setDialogOpen(true);
  };

  const openEditDialog = (template: ProcessTemplate) => {
    setWorkingTemplate({
      ...template,
      tasks: template.tasks.length > 0 ? template.tasks.map((task) => ({ ...task })) : [createEmptyTask()],
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setWorkingTemplate(null);
  };

  const updateWorkingTemplate = (updates: Partial<ProcessTemplate>) => {
    if (!workingTemplate) return;
    setWorkingTemplate({ ...workingTemplate, ...updates });
  };

  const updateTask = (taskId: string, updates: Partial<ProcessTemplateTask>) => {
    if (!workingTemplate) return;
    updateWorkingTemplate({
      tasks: workingTemplate.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...updates,
            }
          : task
      ),
    });
  };

  const addTaskToTemplate = () => {
    if (!workingTemplate) return;
    updateWorkingTemplate({ tasks: [...workingTemplate.tasks, createEmptyTask()] });
  };

  const removeTaskFromTemplate = (taskId: string) => {
    if (!workingTemplate) return;
    const remaining = workingTemplate.tasks.filter((task) => task.id !== taskId);
    updateWorkingTemplate({ tasks: remaining.length > 0 ? remaining : [createEmptyTask()] });
  };

  const handleSaveTemplate = async () => {
    if (!workingTemplate) return;

    if (!workingTemplate.name.trim()) {
      toast.error('Template name is required.');
      return;
    }

    const tasksWithNames = workingTemplate.tasks.filter((task) => task.taskName.trim().length > 0);
    if (tasksWithNames.length === 0) {
      toast.error('Add at least one task to the template.');
      return;
    }

    try {
      setSaving(true);
      const templateId = workingTemplate.id || `tpl-${Date.now()}`;
      const payload = sanitizeTemplate({ ...workingTemplate, id: templateId, tasks: tasksWithNames });
      await dbSet(`processTemplates/${templateId}`, payload as unknown as Record<string, unknown>);

      setTemplates((prev) => {
        const exists = prev.some((tpl) => tpl.id === templateId);
        if (exists) {
          return prev.map((tpl) => (tpl.id === templateId ? payload : tpl));
        }
        return [...prev, payload];
      });

      toast.success('Template saved successfully.');
      closeDialog();
    } catch (error) {
      console.error('Failed to save template', error);
      toast.error('Failed to save template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: ProcessTemplate) => {
    const confirmed = window.confirm(`Delete template "${template.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      await dbRemove(`processTemplates/${template.id}`);
      setTemplates((prev) => prev.filter((tpl) => tpl.id !== template.id));
      toast.success('Template deleted.');
    } catch (error) {
      console.error('Failed to delete template', error);
      toast.error('Failed to delete template.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Process Templates</h1>
          <p className="text-gray-600">
            Create reusable task templates for your shows. Each template stores the ideal lead times and durations
            for every step so you can schedule work automatically.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Templates</CardTitle>
            <CardDescription>Reusable processes available</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{templateCountSummary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Tasks</CardTitle>
            <CardDescription>Across all templates</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{templateCountSummary.totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Tasks per Template</CardTitle>
            <CardDescription>Helps gauge template coverage</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {templateCountSummary.total > 0
                ? (templateCountSummary.totalTasks / templateCountSummary.total).toFixed(1)
                : '0.0'}
            </p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex h-48 flex-col items-center justify-center text-center text-gray-500">
            <p className="max-w-md">No process templates yet. Create your first template to quickly plan future shows.</p>
            <Button className="mt-4" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="flex h-full flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="mt-2 whitespace-pre-line text-gray-600">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                  <Badge variant="secondary">{template.tasks.length} tasks</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between">
                <div className="space-y-3">
                  {template.tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900">{task.taskName}</p>
                        <Badge variant="outline">{task.stage}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <span>Duration: {task.durationDays} days</span>
                        <span>Lead time: {task.leadTimeDays} days</span>
                      </div>
                      {task.notes && <p className="mt-2 text-sm text-gray-500">{task.notes}</p>}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteTemplate(template)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{workingTemplate?.id ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              Define the standard workflow for your shows. Lead time is how many days before the show start the task must be
              complete, while duration controls how long the task should run.
            </DialogDescription>
          </DialogHeader>

          {workingTemplate && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="template-name">Template name</Label>
                  <Input
                    id="template-name"
                    value={workingTemplate.name}
                    onChange={(event) => updateWorkingTemplate({ name: event.target.value })}
                    placeholder="e.g. Standard Caravan Show"
                  />
                </div>
                <div>
                  <Label htmlFor="template-description">Description</Label>
                  <Textarea
                    id="template-description"
                    value={workingTemplate.description ?? ''}
                    onChange={(event) => updateWorkingTemplate({ description: event.target.value })}
                    placeholder="Optional summary of this process"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Template tasks</h3>
                    <p className="text-sm text-gray-500">Adjust duration and lead time to fine-tune scheduling.</p>
                  </div>
                  <Button variant="secondary" onClick={addTaskToTemplate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add task
                  </Button>
                </div>
                <Separator />
                <div className="space-y-4">
                  {workingTemplate.tasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label>Task name</Label>
                              <Input
                                value={task.taskName}
                                onChange={(event) => updateTask(task.id, { taskName: event.target.value })}
                                placeholder="e.g. Confirm venue booking"
                              />
                            </div>
                            <div>
                              <Label>Stage</Label>
                              <Select
                                value={task.stage}
                                onValueChange={(value) => updateTask(task.id, { stage: value as ProcessTemplateTask['stage'] })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stageOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <Label>Duration (days)</Label>
                              <Input
                                type="number"
                                min={1}
                                value={task.durationDays}
                                onChange={(event) =>
                                  updateTask(task.id, {
                                    durationDays: Math.max(1, Number(event.target.value) || 1),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Lead time before show (days)</Label>
                              <Input
                                type="number"
                                min={0}
                                value={task.leadTimeDays}
                                onChange={(event) =>
                                  updateTask(task.id, {
                                    leadTimeDays: Math.max(0, Number(event.target.value) || 0),
                                  })
                                }
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Textarea
                              value={task.notes ?? ''}
                              onChange={(event) => updateTask(task.id, { notes: event.target.value })}
                              placeholder="Optional guidance for this step"
                            />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          className="mt-1"
                          onClick={() => removeTaskFromTemplate(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTemplate} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save template
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
