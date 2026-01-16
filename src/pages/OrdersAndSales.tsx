import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import OrderCommentsEditor from '@/components/OrderCommentsEditor';
import { dbGet, dbSet, dbUpdate, schedulingDbGet, uploadStorageFile } from '@/lib/firebase';
import type { ScheduleOrder, Show, ShowOrder, TeamMember } from '@/types';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONFIRMATION_STATUS_ID = 'confirmation';
const CANCELLATION_STATUS_ID = 'cancellation';
const DEFAULT_STATUS_OPTIONS: OrderStatusOption[] = [
  {
    id: CONFIRMATION_STATUS_ID,
    label: 'Confirmation',
    description: 'Order is confirmed and approved.',
    color: '#BBF7D0',
    sortOrder: 0,
  },
  {
    id: CANCELLATION_STATUS_ID,
    label: 'Cancellation',
    description: 'Order has been cancelled.',
    color: '#FECACA',
    sortOrder: 1,
  },
];

type DealerStatus = 'Pending' | 'Approved' | 'Cancelled';
type ShowTimelineStatus = 'Finished' | 'Current' | 'Not Started';

type ShowOrderWithContract = ShowOrder & {
  contractValue?: number;
  contractNumber?: string;
  dealNumber?: number;
  conditions?: string;
  topUpDate?: string;
  deposit?: number;
  orderStatusId?: string;
};

type OrderStatusOption = {
  id: string;
  label: string;
  description?: string;
  color: string;
  sortOrder: number;
};

interface DecoratedOrder extends ShowOrderWithContract {
  showName: string;
  handoverDealer: string;
  dealerStatus: DealerStatus;
}

type OrderAttachment = {
  name: string;
  url: string;
  path: string;
  uploadedAt: string;
};

const DEFAULT_DEPOSIT = 5000;

const statusStyles: Record<DealerStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-800',
};

const showStatusStyles: Record<ShowTimelineStatus, string> = {
  Finished: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  Current: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  'Not Started': 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
};

const parseContractValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseHandoverDealers = (value: string | undefined | null) => {
  if (!value) return [] as string[];
  return value
    .split(/[,&/]/)
    .map((dealer) => dealer.trim())
    .filter(Boolean);
};

const formatCurrency = (value?: number) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (!numeric) return '-';
  return `$${numeric.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
};

const formatDate = (value: string | undefined) => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const parseDateValue = (value: string | undefined | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeHex = (value: string) => value.replace('#', '').trim();

const hexToRgb = (hex: string) => {
  const cleaned = normalizeHex(hex);
  if (cleaned.length === 3) {
    const expanded = cleaned
      .split('')
      .map((char) => char + char)
      .join('');
    const int = Number.parseInt(expanded, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }
  if (cleaned.length === 6) {
    const int = Number.parseInt(cleaned, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255,
    };
  }
  return null;
};

const getTextColorForBackground = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#0f172a';
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 160 ? '#0f172a' : '#ffffff';
};

const deriveShowTimelineStatus = (show: Show): ShowTimelineStatus => {
  const normalized = (show.status || '').toLowerCase();
  if (normalized.includes('finish')) return 'Finished';
  if (normalized.includes('progress') || normalized.includes('current')) return 'Current';
  if (normalized.includes('not')) return 'Not Started';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = parseDateValue(show.startDate);
  const finish = parseDateValue(show.finishDate);

  if (start) start.setHours(0, 0, 0, 0);
  if (finish) finish.setHours(0, 0, 0, 0);

  if (start && today < start) return 'Not Started';
  if (finish && today > finish) return 'Finished';
  if (start && finish && today >= start && today <= finish) return 'Current';
  if (start && !finish) return today >= start ? 'Current' : 'Not Started';
  if (finish && !start) return today > finish ? 'Finished' : 'Current';

  return 'Not Started';
};

const formatShowDates = (show: Show) => {
  const start = parseDateValue(show.startDate);
  const finish = parseDateValue(show.finishDate);
  if (start && finish) {
    return `${start.toLocaleDateString('en-AU', { month: 'short', day: '2-digit' })} - ${finish.toLocaleDateString(
      'en-AU',
      { month: 'short', day: '2-digit' }
    )}`;
  }
  if (start) return start.toLocaleDateString('en-AU', { month: 'short', day: '2-digit', year: 'numeric' });
  if (finish) return finish.toLocaleDateString('en-AU', { month: 'short', day: '2-digit', year: 'numeric' });
  return 'Dates not set';
};

const getPrimaryShowDateValue = (show: Show) => {
  const start = parseDateValue(show.startDate);
  const finish = parseDateValue(show.finishDate);
  if (start) return start.getTime();
  if (finish) return finish.getTime();
  return Number.MAX_SAFE_INTEGER;
};

export default function OrdersAndSales() {
  const [orders, setOrders] = useState<ShowOrderWithContract[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [dealerOptions, setDealerOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [statusOptions, setStatusOptions] = useState<OrderStatusOption[]>([]);
  const [contractPriceMap, setContractPriceMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ShowOrderWithContract | null>(null);
  const [isSalespersonPickerOpen, setIsSalespersonPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [addingTeamMemberId, setAddingTeamMemberId] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<OrderAttachment[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [newOrder, setNewOrder] = useState<Partial<ShowOrderWithContract>>({
    chassisNumber: '',
    model: '',
    customerName: '',
    orderType: 'New Order',
    salesperson: '',
    status: 'Pending',
    showId: '',
    date: new Date().toISOString().split('T')[0],
    contractValue: 0,
    contractNumber: '',
    handoverDealer: '',
    salespersonOrderComments: '',
    conditions: '',
    topUpDate: '',
    orderStatusId: '',
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | string>('all');
  const [dealerFilter, setDealerFilter] = useState('all');
  const [inlineEdits, setInlineEdits] = useState<Record<string, { conditions?: string; topUpDate?: string }>>({});


  useEffect(() => {
    const loadData = async () => {
      try {
        const [ordersData, showsData, teamData, scheduleData, contractData, statusData] = await Promise.all([
          dbGet('showOrders'),
          dbGet('shows'),
          dbGet('teamMembers'),
          schedulingDbGet('schedule'),
          dbGet('finance/caravanContractPrices'),
          dbGet('orderStatusOptions'),
        ]);

        const ordersList: ShowOrderWithContract[] = ordersData
          ? Object.values(ordersData).map((order) => ({
              ...order,
              contractValue: parseContractValue((order as Record<string, unknown>).contractValue),
            }))
          : [];

        setOrders(ordersList);
        const showList = showsData ? Object.values(showsData) : [];
        setShows(showList);
        setTeamMembers(teamData ? Object.values(teamData) : []);
        const statusList = statusData
          ? (Object.entries(statusData as Record<string, Partial<OrderStatusOption>>).map(([id, value]) => ({
              id,
              label: value.label || '',
              description: value.description || '',
              color: value.color || '#E2E8F0',
              sortOrder: typeof value.sortOrder === 'number' ? value.sortOrder : 0,
            })) as OrderStatusOption[])
          : [];
        const mergedStatusMap = new Map<string, OrderStatusOption>();
        [...DEFAULT_STATUS_OPTIONS, ...statusList].forEach((option) => {
          if (!mergedStatusMap.has(option.id)) {
            mergedStatusMap.set(option.id, option);
          }
        });
        setStatusOptions(
          Array.from(mergedStatusMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)
        );

        const contractPrices = contractData
          ? Object.values(contractData as Record<string, Record<string, unknown>>).reduce<Record<string, number>>(
              (acc, item) => {
                if (typeof item.model === 'string') {
                  acc[item.model.toLowerCase()] = parseContractValue(item.contractValue);
                }
                return acc;
              },
              {}
            )
          : {};
        setContractPriceMap(contractPrices);

        if (scheduleData) {
          const values = Object.values(scheduleData as Record<string, ScheduleOrder>);
          const dealers = Array.from(
            new Set(values.map((order) => order.Dealer?.trim()).filter((name): name is string => Boolean(name)))
          ).sort((a, b) => a.localeCompare(b));
          const models = Array.from(
            new Set(values.map((order) => order.Model?.trim()).filter((name): name is string => Boolean(name)))
          ).sort((a, b) => a.localeCompare(b));
          setDealerOptions(dealers);
          setModelOptions(models);
        }

        if (!scheduleData) {
          setDealerOptions([]);
          setModelOptions([]);
        }

        setError(null);
      } catch (err) {
        console.error('Error loading orders:', err);
        setError('Failed to load orders. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const showLookup = useMemo(
    () =>
      shows.reduce((acc, show) => {
        if (show.id) {
          acc[show.id] = show;
        }
        return acc;
      }, {} as Record<string, Show>),
    [shows]
  );

  const deriveDealerStatus = useCallback((order: ShowOrderWithContract): DealerStatus => {
    if ((order.status || '').toLowerCase() === 'cancelled') return 'Cancelled';
    return order.dealerConfirm ? 'Approved' : 'Pending';
  }, []);

  const statusLookup = useMemo(() => {
    return statusOptions.reduce<Record<string, OrderStatusOption>>((acc, option) => {
      acc[option.id] = option;
      return acc;
    }, {});
  }, [statusOptions]);

  const dealerFilterOptions = useMemo(() => {
    const combined = new Set<string>();
    dealerOptions.forEach((dealer) => combined.add(dealer));
    shows.forEach((show) => {
      if (show.handoverDealer) {
        combined.add(show.handoverDealer);
      }
    });
    orders.forEach((order) => {
      if (order.handoverDealer) combined.add(order.handoverDealer);
    });
    return Array.from(combined).sort((a, b) => a.localeCompare(b));
  }, [dealerOptions, orders, shows]);

  const decoratedOrders: DecoratedOrder[] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.date ?? '').getTime();
        const dateB = new Date(b.date ?? '').getTime();
        return Number.isNaN(dateB) ? -1 : Number.isNaN(dateA) ? 1 : dateB - dateA;
      })
      .filter((order) => {
        if (statusFilter === 'unassigned' && order.orderStatusId) return false;
        if (statusFilter !== 'all' && statusFilter !== 'unassigned' && order.orderStatusId !== statusFilter) {
          return false;
        }
        const dealerValue = order.handoverDealer || showLookup[order.showId]?.handoverDealer || '';
        if (dealerFilter !== 'all' && dealerValue !== dealerFilter) return false;
        if (!term) return true;
        const matchedShow = showLookup[order.showId];
        const haystack = [
          order.chassisNumber,
          order.orderType,
          order.customerName,
          order.salesperson,
          order.model,
          order.contractNumber,
          order.dealNumber ? `deal-${order.dealNumber}` : '',
          order.conditions,
          order.topUpDate,
          statusLookup[order.orderStatusId || '']?.label,
          matchedShow?.name,
          matchedShow?.handoverDealer,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .map((order) => ({
        ...order,
        showName: showLookup[order.showId]?.name || 'Unknown Show',
        handoverDealer: order.handoverDealer || showLookup[order.showId]?.handoverDealer || 'Not set',
        dealerStatus: deriveDealerStatus(order),
    }));
  }, [dealerFilter, deriveDealerStatus, orders, searchTerm, showLookup, statusFilter, statusLookup]);

  const statusCounts = useMemo(
    () =>
      statusOptions.reduce<Record<string, number>>((acc, option) => {
        acc[option.id] = orders.filter((order) => order.orderStatusId === option.id).length;
        return acc;
      }, {}),
    [orders, statusOptions]
  );

  const unassignedCount = useMemo(
    () => orders.filter((order) => !order.orderStatusId).length,
    [orders]
  );

  const selectedShow = useMemo(() => shows.find((show) => show.id === newOrder.showId), [newOrder.showId, shows]);

  const showTeamMembers = useMemo(() => {
    if (!selectedShow) return [] as TeamMember[];
    const memberIds = selectedShow.teamMembers || [];
    return teamMembers.filter((member) => memberIds.includes(member.memberId));
  }, [selectedShow, teamMembers]);

  const availableTeamMembers = useMemo(() => {
    if (!selectedShow) return [] as TeamMember[];
    const assigned = new Set(selectedShow.teamMembers || []);
    return teamMembers.filter((member) => !assigned.has(member.memberId));
  }, [selectedShow, teamMembers]);

  const sortedShowOptions = useMemo(() => {
    return shows
      .map((show) => ({
        ...show,
        timelineStatus: deriveShowTimelineStatus(show),
        primaryDate: getPrimaryShowDateValue(show),
      }))
      .sort((a, b) => {
        if (a.timelineStatus === 'Current' && b.timelineStatus !== 'Current') return -1;
        if (b.timelineStatus === 'Current' && a.timelineStatus !== 'Current') return 1;
        if (a.primaryDate !== b.primaryDate) return a.primaryDate - b.primaryDate;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [shows]);

  const currentShowOptions = useMemo(
    () => sortedShowOptions.filter((show) => show.timelineStatus === 'Current'),
    [sortedShowOptions]
  );

  const otherShowOptions = useMemo(
    () => sortedShowOptions.filter((show) => show.timelineStatus !== 'Current'),
    [sortedShowOptions]
  );

  const isValidModelSelection = (value: string | undefined) => {
    if (!value) return false;
    return modelOptions.some((option) => option.toLowerCase() === value.trim().toLowerCase());
  };

  useEffect(() => {
    if (!selectedShow) {
      setNewOrder((prev) => ({ ...prev, handoverDealer: '' }));
      return;
    }
    const defaults = parseHandoverDealers(selectedShow.handoverDealer);
    setNewOrder((prev) => ({ ...prev, handoverDealer: defaults[0] || '' }));
  }, [selectedShow]);

  const handoverDealerChoices = useMemo(() => {
    const defaults = parseHandoverDealers(selectedShow?.handoverDealer);
    const all = new Set([...defaults, ...dealerOptions]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [dealerOptions, selectedShow]);

  useEffect(() => {
    if (!editingOrder && !newOrder.orderStatusId && statusOptions.length > 0) {
      setNewOrder((prev) => ({ ...prev, orderStatusId: statusOptions[0].id }));
    }
  }, [editingOrder, newOrder.orderStatusId, statusOptions]);

  const getNextDealNumber = (showId: string) => {
    const maxExisting = orders
      .filter((order) => order.showId === showId)
      .reduce((max, order) => Math.max(max, Number(order.dealNumber || 0)), 0);
    return maxExisting + 1;
  };

  const handleStatusChange = async (order: ShowOrderWithContract, statusId: string) => {
    if (!order.id) return;
    const nextStatusId = statusId === 'none' ? '' : statusId;
    const statusLabel = statusOptions.find((option) => option.id === nextStatusId)?.label || '';
    try {
      await dbUpdate(`showOrders/${order.id}`, {
        orderStatusId: nextStatusId || null,
        status: statusLabel || null,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? {
                ...existing,
                orderStatusId: nextStatusId,
                status: statusLabel,
              }
            : existing
        )
      );
      toast.success('Status updated');
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleOrderStatusSelection = (order: ShowOrderWithContract, statusId: string) => {
    if (statusId === 'none') {
      handleStatusChange(order, statusId);
      return;
    }
    if (statusId === CONFIRMATION_STATUS_ID) {
      confirmOrder(order);
      return;
    }
    if (statusId === CANCELLATION_STATUS_ID) {
      cancelOrder(order);
      return;
    }
    handleStatusChange(order, statusId);
  };

  const getInlineValue = (
    order: ShowOrderWithContract,
    field: 'conditions' | 'topUpDate'
  ) => inlineEdits[order.id || '']?.[field] ?? order[field] ?? '';

  const updateInlineDraft = (
    orderId: string | undefined,
    field: 'conditions' | 'topUpDate',
    value: string
  ) => {
    if (!orderId) return;
    setInlineEdits((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value,
      },
    }));
  };

  const saveInlineField = async (
    order: ShowOrderWithContract,
    field: 'conditions' | 'topUpDate'
  ) => {
    if (!order.id) return;
    const value = (inlineEdits[order.id]?.[field] ?? order[field] ?? '').trim();
    if ((order[field] ?? '') === value) return;
    try {
      await dbUpdate(`showOrders/${order.id}`, {
        [field]: value,
      } as unknown as Record<string, unknown>);
      setOrders((prev) =>
        prev.map((existing) => (existing.id === order.id ? { ...existing, [field]: value } : existing))
      );
      toast.success('Order updated');
    } catch (err) {
      console.error('Error updating order', err);
      toast.error('Failed to update order');
    }
  };

  const confirmOrder = async (order: ShowOrderWithContract) => {
    if (!order.id) {
      toast.error('Order is missing an ID.');
      return;
    }

    try {
      await dbUpdate(`showOrders/${order.id}`, {
        status: 'Approved',
        dealerConfirm: true,
        approvedBy: 'Orders Dashboard',
        date: order.date,
        orderStatusId: CONFIRMATION_STATUS_ID,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? {
                ...existing,
                status: 'Approved',
                dealerConfirm: true,
                approvedBy: 'Orders Dashboard',
                orderStatusId: CONFIRMATION_STATUS_ID,
              }
            : existing
        )
      );
      toast.success(`Order ${order.id} confirmed.`);
    } catch (err) {
      console.error('Error confirming order:', err);
      toast.error('Failed to confirm order. Please try again.');
    } finally {
      // no-op
    }
  };

  const cancelOrder = async (order: ShowOrderWithContract) => {
    if (!order.id) {
      toast.error('Order is missing an ID.');
      return;
    }

    try {
      await dbUpdate(`showOrders/${order.id}`, {
        status: 'Cancelled',
        dealerConfirm: false,
        cancelledBy: 'Orders Dashboard',
        orderStatusId: CANCELLATION_STATUS_ID,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? {
                ...existing,
                status: 'Cancelled',
                dealerConfirm: false,
                cancelledBy: 'Orders Dashboard',
                orderStatusId: CANCELLATION_STATUS_ID,
              }
            : existing
        )
      );
      toast.success(`Order ${order.id} cancelled.`);
    } catch (err) {
      console.error('Error cancelling order:', err);
      toast.error('Failed to cancel order. Please try again.');
    } finally {
      // no-op
    }
  };

  const sanitizeFilename = (filename: string) =>
    filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const uploadAttachments = async (orderId: string, files: File[]) => {
    if (files.length === 0) return [];
    const uploads = files.map(async (file) => {
      const safeName = sanitizeFilename(file.name || 'attachment');
      const path = `showOrders/${orderId}/attachments/${Date.now()}-${safeName}`;
      const url = await uploadStorageFile(path, file);
      return {
        name: file.name,
        url,
        path,
        uploadedAt: new Date().toISOString(),
      } as OrderAttachment;
    });
    return Promise.all(uploads);
  };

  const resetOrderForm = () => {
    setNewOrder({
      chassisNumber: '',
      orderType: 'New Order',
      customerName: '',
      salesperson: '',
      status: 'Pending',
      showId: '',
      date: new Date().toISOString().split('T')[0],
      model: '',
      contractValue: 0,
      contractNumber: '',
      handoverDealer: '',
      salespersonOrderComments: '',
      conditions: '',
      topUpDate: '',
      orderStatusId: statusOptions[0]?.id || '',
    });
    setAttachmentFiles([]);
    setExistingAttachments([]);
    setEditingOrder(null);
  };

  const handleAddOrder = async () => {
    if (editingOrder && deriveDealerStatus(editingOrder) === 'Approved') {
      toast.error('Approved orders cannot be edited.');
      return;
    }
    const contractValue = parseContractValue(newOrder.contractValue);
    if (
      !newOrder.salesperson ||
      !newOrder.showId ||
      !newOrder.date ||
      !newOrder.customerName?.trim() ||
      !newOrder.contractNumber?.trim() ||
      !contractValue ||
      !newOrder.handoverDealer?.trim()
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!isValidModelSelection(newOrder.model)) {
      toast.error('Please select a model from the schedule list');
      return;
    }

    try {
      setIsSavingOrder(true);
      const orderId = editingOrder?.id || `ORD-${Date.now()}`;
      const uploadedAttachments = await uploadAttachments(orderId, attachmentFiles);
      const mergedAttachments = [...existingAttachments, ...uploadedAttachments];

      const dealNumber = editingOrder?.dealNumber ?? getNextDealNumber(newOrder.showId);
      const order: ShowOrderWithContract = {
        id: orderId,
        showId: newOrder.showId,
        chassisNumber: newOrder.chassisNumber || '',
        customerName: newOrder.customerName?.trim() || '',
        model: newOrder.model || '',
        orderType: (newOrder.orderType as ShowOrder['orderType']) || 'New Order',
        salesperson: newOrder.salesperson,
        date: newOrder.date,
        contractValue,
        contractNumber: newOrder.contractNumber?.trim() || '',
        handoverDealer: newOrder.handoverDealer?.trim() || '',
        status: 'Pending',
        salespersonOrderComments: newOrder.salespersonOrderComments || '',
        orderAttachments: mergedAttachments,
        dealNumber,
        deposit: editingOrder?.deposit ?? DEFAULT_DEPOSIT,
        conditions: newOrder.conditions || '',
        topUpDate: newOrder.topUpDate || '',
        orderStatusId: newOrder.orderStatusId || '',
      };

      if (editingOrder) {
        await dbUpdate(`showOrders/${order.id}`, order as unknown as Record<string, unknown>);
        setOrders((prev) => prev.map((item) => (item.id === order.id ? order : item)));
        toast.success('Order updated successfully');
      } else {
        await dbSet(`showOrders/${order.id}`, order as unknown as Record<string, unknown>);
        setOrders((prev) => [...prev, order]);
        toast.success('Order added successfully');
      }
      setIsAddingOrder(false);
      resetOrderForm();
    } catch (err) {
      console.error('Error adding order:', err);
      toast.error(editingOrder ? 'Failed to update order' : 'Failed to add order');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleAddTeamMemberToShow = async (member: TeamMember) => {
    if (!selectedShow?.id) {
      toast.error('Please select a show first');
      return;
    }

    setAddingTeamMemberId(member.memberId);
    const nextTeamMembers = Array.from(new Set([...(selectedShow.teamMembers || []), member.memberId]));

    try {
      await dbUpdate(`shows/${selectedShow.id}`, { teamMembers: nextTeamMembers });
      setShows((prev) =>
        prev.map((show) => (show.id === selectedShow.id ? { ...show, teamMembers: nextTeamMembers } : show))
      );
      setNewOrder({ ...newOrder, salesperson: member.memberName });
      toast.success(`${member.memberName} added to ${selectedShow.name}`);
      setIsSalespersonPickerOpen(false);
    } catch (err) {
      console.error('Error adding team member to show:', err);
      toast.error('Failed to add team member to this show');
    } finally {
      setAddingTeamMemberId(null);
    }
  };

  const handleOpenNewOrder = () => {
    resetOrderForm();
    setIsAddingOrder(true);
  };

  const handleEditOrder = (order: ShowOrderWithContract, dealerStatus: DealerStatus) => {
    if (dealerStatus === 'Approved') {
      toast.error('Approved orders cannot be edited.');
      return;
    }
    setEditingOrder(order);
    setExistingAttachments((order.orderAttachments as OrderAttachment[]) || []);
    setAttachmentFiles([]);
    setNewOrder({
      chassisNumber: order.chassisNumber || '',
      model: order.model || '',
      customerName: order.customerName || '',
      orderType: order.orderType || 'New Order',
      salesperson: order.salesperson || '',
      status: order.status || 'Pending',
      showId: order.showId,
      date: order.date,
      contractValue: order.contractValue || 0,
      contractNumber: order.contractNumber || '',
      handoverDealer: order.handoverDealer || '',
      salespersonOrderComments: order.salespersonOrderComments || '',
      conditions: order.conditions || '',
      topUpDate: order.topUpDate || '',
      orderStatusId: order.orderStatusId || '',
    });
    setIsAddingOrder(true);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading orders...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders & Sales</h1>
          <p className="text-sm text-gray-500">Overview of all show orders and sales confirmations</p>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('all')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('all')}
          className={cn('cursor-pointer transition shadow-sm', statusFilter === 'all' ? 'ring-2 ring-blue-500' : '')}
        >
          <CardHeader className="pb-2">
            <CardDescription>All Statuses</CardDescription>
            <CardTitle className="text-3xl">{orders.length}</CardTitle>
          </CardHeader>
        </Card>
        {statusOptions.map((status) => (
          <Card
            key={status.id}
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter(status.id)}
            onKeyDown={(event) => event.key === 'Enter' && setStatusFilter(status.id)}
            className={cn(
              'cursor-pointer transition shadow-sm',
              statusFilter === status.id ? 'ring-2 ring-slate-400' : ''
            )}
            style={{ borderTop: `4px solid ${status.color}` }}
          >
            <CardHeader className="pb-2">
              <CardDescription>{status.label || 'Untitled status'}</CardDescription>
              <CardTitle className="text-3xl">{statusCounts[status.id] ?? 0}</CardTitle>
              {status.description && <p className="text-xs text-slate-500">{status.description}</p>}
            </CardHeader>
          </Card>
        ))}
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('unassigned')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('unassigned')}
          className={cn('cursor-pointer transition shadow-sm', statusFilter === 'unassigned' ? 'ring-2 ring-slate-400' : '')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Unassigned Status</CardDescription>
            <CardTitle className="text-3xl">{unassignedCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Orders List</CardTitle>
                <CardDescription>Search and confirm orders across every show</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Dialog
                  open={isAddingOrder}
                  onOpenChange={(open) => {
                    setIsAddingOrder(open);
                    if (!open) {
                      resetOrderForm();
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button onClick={handleOpenNewOrder}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-5xl">
                    <DialogHeader>
                      <DialogTitle>{editingOrder ? 'Edit Order' : 'Add New Order'}</DialogTitle>
                      <DialogDescription>
                        {editingOrder ? 'Update order details for this show' : 'Link a new order to an existing show'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Show *</Label>
                          <Select
                            value={newOrder.showId}
                            onValueChange={(value) => setNewOrder({ ...newOrder, showId: value, salesperson: '' })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select show" />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                                <Sparkles className="h-4 w-4 animate-pulse" />
                                Current shows are highlighted first
                              </div>
                              {currentShowOptions.map((show) => (
                                <SelectItem key={show.id} value={show.id}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{show.name}</span>
                                      <span className="text-xs text-muted-foreground">{formatShowDates(show)}</span>
                                    </div>
                                    <span
                                      className={cn(
                                        'rounded-full px-2 py-1 text-[11px] font-semibold',
                                        showStatusStyles[show.timelineStatus]
                                      )}
                                    >
                                      Current
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                              {currentShowOptions.length > 0 && (
                                <div className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Scheduled & finished
                                </div>
                              )}
                              {otherShowOptions.map((show) => (
                                <SelectItem key={show.id} value={show.id}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex flex-col">
                                      <span className="font-medium">{show.name}</span>
                                      <span className="text-xs text-muted-foreground">{formatShowDates(show)}</span>
                                    </div>
                                    <span
                                      className={cn(
                                        'rounded-full px-2 py-1 text-[11px] font-semibold',
                                        showStatusStyles[show.timelineStatus]
                                      )}
                                    >
                                      {show.timelineStatus}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Handover Dealer *</Label>
                          <Select
                            value={newOrder.handoverDealer || ''}
                            onValueChange={(value) => setNewOrder({ ...newOrder, handoverDealer: value })}
                            disabled={handoverDealerChoices.length === 0}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select handover dealer" />
                            </SelectTrigger>
                            <SelectContent>
                              {handoverDealerChoices.map((dealer) => (
                                <SelectItem key={dealer} value={dealer}>
                                  {dealer}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {handoverDealerChoices.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Dealer list unavailable. Please try again after schedule sync.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
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
                                {newOrder.model || 'Select model'}
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
                                          const defaultValue = contractPriceMap[value.toLowerCase()] ?? 0;
                                          setNewOrder({ ...newOrder, model: value, contractValue: defaultValue });
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
                              onClick={() => setNewOrder({ ...newOrder, model: '', contractValue: 0 })}
                            >
                              Clear selection
                            </Button>
                          )}
                          {modelOptions.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Model list unavailable. Please try again after schedule sync.
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Contract Number *</Label>
                          <Input
                            placeholder="Enter contract number"
                            value={newOrder.contractNumber || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, contractNumber: event.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Contract Value *</Label>
                          <Input
                            type="number"
                            placeholder="Standard contract value"
                            value={newOrder.contractValue ?? ''}
                            onChange={(event) =>
                              setNewOrder({ ...newOrder, contractValue: parseContractValue(event.target.value) })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Prefilled from the Caravan Contract Price dataset; adjust if needed for this order.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Customer Name *</Label>
                          <Input
                            placeholder="Enter customer name"
                            value={newOrder.customerName || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, customerName: event.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Order Type</Label>
                          <Select
                            value={newOrder.orderType}
                            onValueChange={(value) =>
                              setNewOrder({ ...newOrder, orderType: value as ShowOrder['orderType'] })
                            }
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

                        <div className="space-y-2">
                          <Label>Salesperson *</Label>
                          <Popover open={isSalespersonPickerOpen} onOpenChange={setIsSalespersonPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isSalespersonPickerOpen}
                                className="w-full justify-between"
                                disabled={!selectedShow}
                              >
                                {newOrder.salesperson || 'Select salesperson'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[280px] p-0">
                              <Command>
                                <CommandInput placeholder="Search team member..." />
                                <CommandList>
                                  <CommandEmpty>No team member found.</CommandEmpty>
                                  <CommandGroup heading={selectedShow ? 'Team Members' : 'Select a show first'}>
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
                                            newOrder.salesperson === member.memberName ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        <div className="flex flex-col">
                                          <span>{member.memberName}</span>
                                          <span className="text-xs text-muted-foreground">{member.role}</span>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                  {selectedShow && (
                                    <CommandGroup heading="Add team member to this show">
                                      {availableTeamMembers.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">
                                          All active team members are already on this show.
                                        </div>
                                      ) : (
                                        availableTeamMembers.map((member) => (
                                          <CommandItem
                                            key={member.memberId}
                                            value={`add-${member.memberId}`}
                                            onSelect={() => handleAddTeamMemberToShow(member)}
                                            className="flex items-start justify-between gap-2"
                                          >
                                            <div className="flex flex-col">
                                              <span className="font-medium">{member.memberName}</span>
                                              <span className="text-xs text-muted-foreground">{member.role}</span>
                                            </div>
                                            {addingTeamMemberId === member.memberId ? (
                                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            ) : (
                                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                                Add to show
                                              </span>
                                            )}
                                          </CommandItem>
                                        ))
                                      )}
                                    </CommandGroup>
                                  )}
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

                        <div className="space-y-2">
                          <Label>Date *</Label>
                          <Input
                            type="date"
                            value={newOrder.date}
                            onChange={(event) => setNewOrder({ ...newOrder, date: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Deposit</Label>
                          <Input value={formatCurrency(DEFAULT_DEPOSIT)} disabled />
                          <p className="text-xs text-muted-foreground">Deposit is fixed at $5,000 for every order.</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label>Salesperson Order Comments</Label>
                        <OrderCommentsEditor
                          value={newOrder.salespersonOrderComments || ''}
                          onChange={(value) => setNewOrder({ ...newOrder, salespersonOrderComments: value })}
                        />
                        <div className="space-y-2">
                          <Label>Attachments</Label>
                          <Input
                            type="file"
                            multiple
                            onChange={(event) => setAttachmentFiles(Array.from(event.target.files || []))}
                          />
                          {(existingAttachments.length > 0 || attachmentFiles.length > 0) && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {existingAttachments.map((file) => (
                                <div key={file.path} className="flex items-center justify-between">
                                  <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                                    {file.name}
                                  </a>
                                  <span>Stored</span>
                                </div>
                              ))}
                              {attachmentFiles.map((file) => (
                                <div key={file.name}>{file.name}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Conditions</Label>
                          <Input
                            placeholder="Add any deal conditions"
                            value={newOrder.conditions || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, conditions: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Top Up Date</Label>
                          <Input
                            placeholder="Add top up details"
                            value={newOrder.topUpDate || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, topUpDate: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={newOrder.orderStatusId || 'none'}
                            onValueChange={(value) =>
                              setNewOrder({ ...newOrder, orderStatusId: value === 'none' ? '' : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No status</SelectItem>
                              {statusOptions.map((status) => (
                                <SelectItem key={status.id} value={status.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-3 w-3 rounded-full border border-slate-200"
                                      style={{ backgroundColor: status.color }}
                                    />
                                    <span>{status.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddingOrder(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddOrder} disabled={isSavingOrder}>
                        {isSavingOrder ? 'Saving...' : editingOrder ? 'Save Changes' : 'Add Order'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by deal #, show, model, customer, salesperson or type"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full lg:w-72"
                  />
                </div>
                <div className="min-w-[200px]">
                  <Select value={dealerFilter} onValueChange={setDealerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter dealer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All dealers</SelectItem>
                      {dealerFilterOptions.map((dealer) => (
                        <SelectItem key={dealer} value={dealer}>
                          {dealer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {decoratedOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Ordering Date</TableHead>
                    <TableHead>Deal #</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Contract Number</TableHead>
                    <TableHead className="text-right">Contract Value</TableHead>
                    <TableHead>Sales Person</TableHead>
                    <TableHead>Deposit</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Top Up Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Handover Dealer</TableHead>
                    <TableHead>Dealer Status</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decoratedOrders.map((order) => {
                    const rowKey = order.id || `${order.showId}-${order.date}`;
                    const statusOption = order.orderStatusId ? statusLookup[order.orderStatusId] : undefined;
                    const rowBackground = statusOption?.color;
                    const rowTextColor = rowBackground ? getTextColorForBackground(rowBackground) : undefined;
                    return (
                      <TableRow
                        key={rowKey}
                        className="transition-colors"
                        style={
                          rowBackground
                            ? {
                                backgroundColor: rowBackground,
                                color: rowTextColor,
                              }
                            : undefined
                        }
                      >
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleEditOrder(order, order.dealerStatus)}
                            disabled={order.dealerStatus === 'Approved'}
                            aria-label="Edit order"
                          >
                            <span role="img" aria-hidden="true">
                              🖊
                            </span>
                          </Button>
                        </TableCell>
                        <TableCell>{formatDate(order.date)}</TableCell>
                        <TableCell className="font-semibold">#{order.dealNumber ?? '-'}</TableCell>
                        <TableCell>{order.customerName || 'Not set'}</TableCell>
                        <TableCell>{order.model || 'Not set'}</TableCell>
                        <TableCell>{order.contractNumber || 'Not set'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(order.contractValue)}</TableCell>
                        <TableCell>{order.salesperson || 'Unassigned'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            {formatCurrency(order.deposit ?? DEFAULT_DEPOSIT)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <Input
                            value={getInlineValue(order, 'conditions')}
                            onChange={(event) =>
                              updateInlineDraft(order.id, 'conditions', event.target.value)
                            }
                            onBlur={() => saveInlineField(order, 'conditions')}
                            placeholder="Add conditions"
                            className="min-w-[180px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={getInlineValue(order, 'topUpDate')}
                            onChange={(event) =>
                              updateInlineDraft(order.id, 'topUpDate', event.target.value)
                            }
                            onBlur={() => saveInlineField(order, 'topUpDate')}
                            placeholder="Add top up details"
                            className="min-w-[150px]"
                          />
                        </TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell>{order.handoverDealer}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[order.dealerStatus]}`}>
                            {order.dealerStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={order.orderStatusId || 'none'}
                            onValueChange={(value) => handleOrderStatusSelection(order, value)}
                          >
                            <SelectTrigger className="min-w-[160px]">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No status</SelectItem>
                              {statusOptions.map((status) => (
                                <SelectItem key={status.id} value={status.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-3 w-3 rounded-full border border-slate-200"
                                      style={{ backgroundColor: status.color }}
                                    />
                                    <span>{status.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-10 text-center text-gray-500">No orders found</div>
            )}
          </CardContent>
        </Card>

    </div>
  );
}
