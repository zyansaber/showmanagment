import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import OrderCommentsEditor from '@/components/OrderCommentsEditor';
import { dbGet, dbSet, dbUpdate, schedulingDbGet, uploadStorageFile } from '@/lib/firebase';
import type { ScheduleOrder, Show, ShowOrder, TeamMember } from '@/types';
import { toast } from 'sonner';
import { ArrowUpRight, CalendarDays, Check, Download, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
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

type DealerStatus = 'Pending' | 'Confirmed' | 'Cancelled';
type ShowTimelineStatus = 'Finished' | 'Current' | 'Not Started';

type ShowOrderWithContract = ShowOrder & {
  contractValue?: number;
  contractNumber?: string;
  dealNumber?: number;
  conditions?: string;
  topUpDate?: string;
  deposit?: number;
  paymentMethod?: 'Cash' | 'Finance' | '';
  tradeIn?: boolean;
  tradeInAllowance?: number;
  depositReceived?: number;
  expectedHandoverDate?: string;
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
  Confirmed: 'bg-green-100 text-green-800',
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

const escapeCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
};

const hasCommissionSent = (value: unknown) => {
  if (value === true) return true;
  if (typeof value === 'number') return true;
  return typeof value === 'string' && value.trim().length > 0;
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

const showOccursInMonth = (show: Show | undefined, selectedMonth: string) => {
  if (!show || !selectedMonth) return true;
  const [yearText, monthText] = selectedMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return true;

  const monthStart = new Date(year, month - 1, 1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(year, month, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const start = parseDateValue(show.startDate);
  const finish = parseDateValue(show.finishDate);
  const primary = start || finish;
  if (!primary) return false;

  if (start && finish) {
    const normalizedStart = new Date(start);
    const normalizedFinish = new Date(finish);
    normalizedStart.setHours(0, 0, 0, 0);
    normalizedFinish.setHours(23, 59, 59, 999);
    return normalizedStart <= monthEnd && normalizedFinish >= monthStart;
  }

  return primary >= monthStart && primary <= monthEnd;
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
  const [isHandoverDealerPickerOpen, setIsHandoverDealerPickerOpen] = useState(false);
  const [addingTeamMemberId, setAddingTeamMemberId] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<OrderAttachment[]>([]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<DecoratedOrder | null>(null);
  const [newOrder, setNewOrder] = useState<Partial<ShowOrderWithContract>>({
    chassisNumber: '',
    model: '',
    customerName: '',
    orderType: 'New Order',
    salesperson: '',
    status: '',
    showId: '',
    date: new Date().toISOString().split('T')[0],
    contractValue: 0,
    contractNumber: '',
    dealNumber: undefined,
    handoverDealer: '',
    salespersonOrderComments: '',
    conditions: '',
    topUpDate: '',
    paymentMethod: '',
    tradeIn: false,
    tradeInAllowance: 0,
    depositReceived: DEFAULT_DEPOSIT,
    expectedHandoverDate: '',
    orderStatusId: '',
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'unassigned' | string>('all');
  const [showFilter, setShowFilter] = useState('all');
  const [orderingDateFilter, setOrderingDateFilter] = useState('');
  const [showMonthFilter, setShowMonthFilter] = useState('');
  const [inlineEdits, setInlineEdits] = useState<Record<string, { dealNumber?: string; conditions?: string; topUpDate?: string }>>({});


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
          const extraModels = ['SRV22.1', 'SRV22.2', 'SRV22.3', 'SRV19.1', 'SRM22.1', 'SRM22.2'];
          const models = Array.from(
            new Set([
              ...values.map((order) => order.Model?.trim()).filter((name): name is string => Boolean(name)),
              ...extraModels,
            ])
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
    const timer = window.setInterval(() => {
      void loadData();
    }, 30000);
    return () => window.clearInterval(timer);
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
    return order.dealerConfirm ? 'Confirmed' : 'Pending';
  }, []);

  const statusLookup = useMemo(() => {
    return statusOptions.reduce<Record<string, OrderStatusOption>>((acc, option) => {
      const key = String(option.id || '').trim();
      if (!key) return acc;
      acc[key] = option;
      acc[key.toLowerCase()] = option;
      return acc;
    }, {});
  }, [statusOptions]);

  const showFilterTabs = useMemo(() => {
    const countMap = orders.reduce<Record<string, number>>((acc, order) => {
      if (!order.showId) return acc;
      acc[order.showId] = (acc[order.showId] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(countMap)
      .map(([showId, count]) => ({
        id: showId,
        label: showLookup[showId]?.name || showId,
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orders, showLookup]);

  useEffect(() => {
    if (showFilter === 'all') return;
    const hasCurrentFilter = showFilterTabs.some((show) => show.id === showFilter);
    if (!hasCurrentFilter) {
      setShowFilter('all');
    }
  }, [showFilter, showFilterTabs]);

  const decoratedOrders: DecoratedOrder[] = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const selectedDate = orderingDateFilter.trim();
    const selectedShowMonth = showMonthFilter.trim();
    return orders
      .slice()
      .sort((a, b) => {
        if (a.showId === b.showId) {
          const dealA = Number(a.dealNumber ?? Number.MAX_SAFE_INTEGER);
          const dealB = Number(b.dealNumber ?? Number.MAX_SAFE_INTEGER);
          if (Number.isFinite(dealA) && Number.isFinite(dealB) && dealA !== dealB) return dealA - dealB;
        }

        const dateA = new Date(a.date ?? '').getTime();
        const dateB = new Date(b.date ?? '').getTime();
        return Number.isNaN(dateB) ? -1 : Number.isNaN(dateA) ? 1 : dateB - dateA;
      })
      .filter((order) => {
        if (statusFilter === 'unassigned' && order.orderStatusId) return false;
        if (statusFilter !== 'all' && statusFilter !== 'unassigned' && order.orderStatusId !== statusFilter) {
          return false;
        }
        if (showFilter !== 'all' && order.showId !== showFilter) return false;
        if (selectedDate && String(order.date || '').slice(0, 10) !== selectedDate) return false;
        if (selectedShowMonth && !showOccursInMonth(showLookup[order.showId], selectedShowMonth)) return false;
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
          order.paymentMethod,
          order.tradeIn ? 'trade-in' : '',
          order.tradeInAllowance ? `${order.tradeInAllowance}` : '',
          order.depositReceived ? `${order.depositReceived}` : '',
          order.expectedHandoverDate,
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
  }, [deriveDealerStatus, orderingDateFilter, orders, searchTerm, showFilter, showLookup, showMonthFilter, statusFilter, statusLookup]);

  const handleExportOrdersExcel = useCallback(() => {
    if (!decoratedOrders.length) {
      toast.error('No orders available to export.');
      return;
    }

    const headers = [
      'Ordering Date',
      'Deal #',
      'Customer Name',
      'Model',
      'Contract Number',
      'Contract Value (AUD)',
      'Sales Person',
      'Deposit Received (AUD)',
      'Conditions',
      'Top Up Date',
      'Type',
      'Handover Dealer',
      'Dealer Status',
      'Status',
      'Commission Sent',
      'Show',
    ];

    const rows = decoratedOrders.map((order) => {
      const statusLabel = order.orderStatusId ? statusLookup[order.orderStatusId]?.label || '' : '';
      const depositReceived = order.depositReceived ?? order.deposit ?? DEFAULT_DEPOSIT;
      return [
        order.date || '',
        order.dealNumber ?? '',
        order.customerName || '',
        order.model || '',
        order.contractNumber || '',
        order.contractValue ?? 0,
        order.salesperson || '',
        depositReceived,
        order.conditions || '',
        order.topUpDate || '',
        order.orderType || '',
        order.handoverDealer || '',
        order.dealerStatus || '',
        statusLabel,
        hasCommissionSent(order.emailconfirmation) ? 'Yes' : 'No',
        order.showName || '',
      ];
    });

    const csvLines = [headers, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(','));
    const csvContent = `\uFEFF${csvLines.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const exportDate = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `orders-export-${exportDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Orders exported. You can open the CSV file in Excel.');
  }, [decoratedOrders, statusLookup]);

  const ordersMatchingLowerFilters = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const selectedDate = orderingDateFilter.trim();
    const selectedShowMonth = showMonthFilter.trim();

    return orders.filter((order) => {
      if (showFilter !== 'all' && order.showId !== showFilter) return false;
      if (selectedDate && String(order.date || '').slice(0, 10) !== selectedDate) return false;
      if (selectedShowMonth && !showOccursInMonth(showLookup[order.showId], selectedShowMonth)) return false;
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
        order.paymentMethod,
        order.tradeIn ? 'trade-in' : '',
        order.tradeInAllowance ? `${order.tradeInAllowance}` : '',
        order.depositReceived ? `${order.depositReceived}` : '',
        order.expectedHandoverDate,
        statusLookup[order.orderStatusId || '']?.label,
        matchedShow?.name,
        matchedShow?.handoverDealer,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [orderingDateFilter, orders, searchTerm, showFilter, showLookup, showMonthFilter, statusLookup]);

  const orderingDateCount = useMemo(() => {
    const selectedDate = orderingDateFilter.trim();
    const selectedShowMonth = showMonthFilter.trim();
    return orders.filter((order) => {
      if (statusFilter === 'unassigned' && order.orderStatusId) return false;
      if (statusFilter !== 'all' && statusFilter !== 'unassigned' && order.orderStatusId !== statusFilter) {
        return false;
      }
      if (showFilter !== 'all' && order.showId !== showFilter) return false;
      if (selectedShowMonth && !showOccursInMonth(showLookup[order.showId], selectedShowMonth)) return false;
      if (!selectedDate) return true;
      if (String(order.date || '').slice(0, 10) !== selectedDate) return false;
      return true;
    }).length;
  }, [orderingDateFilter, orders, showFilter, showLookup, showMonthFilter, statusFilter]);

  const showMonthCount = useMemo(() => {
    const selectedShowMonth = showMonthFilter.trim();
    return orders.filter((order) => {
      if (statusFilter === 'unassigned' && order.orderStatusId) return false;
      if (statusFilter !== 'all' && statusFilter !== 'unassigned' && order.orderStatusId !== statusFilter) return false;
      if (showFilter !== 'all' && order.showId !== showFilter) return false;
      if (!selectedShowMonth) return true;
      return showOccursInMonth(showLookup[order.showId], selectedShowMonth);
    }).length;
  }, [orders, showFilter, showLookup, showMonthFilter, statusFilter]);



  const modelConfirmationInsights = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

    const byModel = new Map<string, { current: number; previous: number }>();

    const filteredConfirmationOrders = orders.filter((order) => {
      if (order.orderStatusId !== CONFIRMATION_STATUS_ID) return false;
      if (showFilter !== 'all' && order.showId !== showFilter) return false;
      if (showMonthFilter && !showOccursInMonth(showLookup[order.showId], showMonthFilter)) return false;
      return true;
    });

    filteredConfirmationOrders.forEach((order) => {
      const modelName = (order.model || 'Unknown Model').trim() || 'Unknown Model';
      const existing = byModel.get(modelName) || { current: 0, previous: 0 };
      const orderDate = parseDateValue(order.date);

      if (orderDate) {
        const year = orderDate.getFullYear();
        const month = orderDate.getMonth();
        if (year == currentYear && month == currentMonth) existing.current += 1;
        if (year == previousMonthDate.getFullYear() && month == previousMonthDate.getMonth()) existing.previous += 1;
      }

      byModel.set(modelName, existing);
    });

    const allModels = Array.from(byModel.entries()).map(([model, counts]) => {
      const delta = counts.current - counts.previous;
      const growthRate = counts.previous === 0 ? (counts.current > 0 ? 100 : 0) : (delta / counts.previous) * 100;
      const total = counts.current + counts.previous;
      return { model, ...counts, total, delta, growthRate };
    });

    const top10ByTotal = [...allModels]
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.current !== a.current) return b.current - a.current;
        return a.model.localeCompare(b.model);
      })
      .slice(0, 10);

    const top10FastestGrowth = [...allModels]
      .filter((item) => item.delta > 0)
      .sort((a, b) => {
        if (b.delta !== a.delta) return b.delta - a.delta;
        if (b.growthRate !== a.growthRate) return b.growthRate - a.growthRate;
        return a.model.localeCompare(b.model);
      })
      .slice(0, 10);

    return {
      top10ByTotal,
      top10FastestGrowth,
      totalCurrent: top10ByTotal.reduce((sum, item) => sum + item.current, 0),
      totalPrevious: top10ByTotal.reduce((sum, item) => sum + item.previous, 0),
      currentMonthLabel: now.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }),
      previousMonthLabel: previousMonthDate.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }),
    };
  }, [orders, showFilter, showLookup, showMonthFilter]);

  const statusCounts = useMemo(
    () =>
      statusOptions.reduce<Record<string, number>>((acc, option) => {
        acc[option.id] = ordersMatchingLowerFilters.filter((order) => order.orderStatusId === option.id).length;
        return acc;
      }, {}),
    [ordersMatchingLowerFilters, statusOptions]
  );


  const resolveStatusValue = useCallback(
    (orderStatusId?: string) => {
      const rawStatusId = String(orderStatusId ?? '').trim();
      const normalized = rawStatusId.toLowerCase();
      if (!normalized) return 'Pending';
      if (normalized === CONFIRMATION_STATUS_ID) return 'Approved';
      if (normalized === CANCELLATION_STATUS_ID) return 'Cancelled';
      return statusLookup[rawStatusId]?.label?.trim() || statusLookup[normalized]?.label?.trim() || 'Pending';
    },
    [statusLookup]
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

  const handoverDealerChoices = useMemo(() => {
    const dealershipDefaults = parseHandoverDealers(selectedShow?.dealership);
    const handoverDefaults = parseHandoverDealers(selectedShow?.handoverDealer);
    const all = new Set([...dealershipDefaults, ...handoverDefaults, ...dealerOptions]);
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [dealerOptions, selectedShow]);

  useEffect(() => {
    if (!selectedShow) {
      setNewOrder((prev) => ({ ...prev, handoverDealer: '' }));
      return;
    }
    setNewOrder((prev) => {
      if (editingOrder) return prev;
      const dealershipDefaults = parseHandoverDealers(selectedShow.dealership);
      const handoverDefaults = parseHandoverDealers(selectedShow.handoverDealer);
      const defaultDealer = dealershipDefaults[0] || handoverDefaults[0] || '';
      if (prev.handoverDealer === defaultDealer) return prev;
      return { ...prev, handoverDealer: defaultDealer };
    });
  }, [editingOrder, selectedShow]);

  const getNextDealNumber = (showId: string) => {
    const maxExisting = orders
      .filter((order) => order.showId === showId)
      .reduce((max, order) => Math.max(max, Number(order.dealNumber || 0)), 0);
    return maxExisting + 1;
  };

  const handleStatusChange = async (order: ShowOrderWithContract, statusId: string) => {
    if (!order.id) return;
    const nextStatusId = statusId === 'none' ? '' : statusId;
    const statusValue = resolveStatusValue(nextStatusId);
    try {
      await dbUpdate(`showOrders/${order.id}`, {
        orderStatusId: nextStatusId || null,
        status: statusValue,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? {
                ...existing,
                orderStatusId: nextStatusId,
                status: statusValue,
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
    field: 'dealNumber' | 'conditions' | 'topUpDate'
  ) => {
    const draft = inlineEdits[order.id || '']?.[field];
    if (draft !== undefined) return draft;
    if (field === 'dealNumber') return order.dealNumber ? String(order.dealNumber) : '';
    return order[field] ?? '';
  };

  const updateInlineDraft = (
    orderId: string | undefined,
    field: 'dealNumber' | 'conditions' | 'topUpDate',
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
    field: 'dealNumber' | 'conditions' | 'topUpDate'
  ) => {
    if (!order.id) return;
    const rawValue = inlineEdits[order.id]?.[field];
    const currentValue = field === 'dealNumber' ? (order.dealNumber ? String(order.dealNumber) : '') : (order[field] ?? '');
    const value = (rawValue ?? currentValue).trim();
    if (currentValue === value) return;

    const payload: Record<string, unknown> = {};
    let nextValue: string | number = value;

    if (field === 'dealNumber') {
      if (!value) {
        payload.dealNumber = null;
        nextValue = '';
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          toast.error('Deal # must be a valid number');
          return;
        }
        payload.dealNumber = parsed;
        nextValue = parsed;
      }
    } else {
      payload[field] = value;
    }

    try {
      await dbUpdate(`showOrders/${order.id}`, payload);
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? { ...existing, ...(field === 'dealNumber' ? { dealNumber: nextValue === '' ? undefined : nextValue as number } : { [field]: nextValue }) }
            : existing
        )
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
        cancelledBy: 'Orders Dashboard',
        orderStatusId: CANCELLATION_STATUS_ID,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? {
                ...existing,
                status: 'Cancelled',
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
      status: '',
      showId: '',
      date: new Date().toISOString().split('T')[0],
      model: '',
      contractValue: 0,
      contractNumber: '',
      dealNumber: undefined,
      handoverDealer: '',
      salespersonOrderComments: '',
      conditions: '',
      topUpDate: '',
      paymentMethod: '',
      tradeIn: false,
      tradeInAllowance: 0,
      depositReceived: DEFAULT_DEPOSIT,
      expectedHandoverDate: '',
      orderStatusId: '',
    });
    setAttachmentFiles([]);
    setExistingAttachments([]);
    setEditingOrder(null);
  };

  const handleAddOrder = async () => {
    if (editingOrder && deriveDealerStatus(editingOrder) === 'Confirmed') {
      toast.error('Approved orders cannot be edited.');
      return;
    }
    if (newOrder.orderType === 'Transfer from Stock' && !newOrder.chassisNumber?.trim()) {
      toast.error('Please enter a chassis number for transfer orders');
      return;
    }
    const contractValue = parseContractValue(newOrder.contractValue);
    if (
      !newOrder.salesperson ||
      !newOrder.showId ||
      !newOrder.date ||
      !newOrder.customerName?.trim() ||
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

      const enteredDealNumber = String(newOrder.dealNumber ?? '').trim();
      const parsedDealNumber = enteredDealNumber ? Number(enteredDealNumber) : NaN;
      if (enteredDealNumber && (!Number.isFinite(parsedDealNumber) || parsedDealNumber < 0)) {
        toast.error('Deal # must be a valid number');
        return;
      }

      const dealNumber = enteredDealNumber ? parsedDealNumber : editingOrder?.dealNumber ?? getNextDealNumber(newOrder.showId);
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
        status: resolveStatusValue(newOrder.orderStatusId || ''),
        salespersonOrderComments: newOrder.salespersonOrderComments || '',
        orderAttachments: mergedAttachments,
        dealNumber,
        deposit: editingOrder?.deposit ?? DEFAULT_DEPOSIT,
        conditions: newOrder.conditions || '',
        topUpDate: newOrder.topUpDate || '',
        paymentMethod: newOrder.paymentMethod || '',
        tradeIn: Boolean(newOrder.tradeIn),
        tradeInAllowance: parseContractValue(newOrder.tradeInAllowance),
        depositReceived: parseContractValue(newOrder.depositReceived),
        expectedHandoverDate: newOrder.expectedHandoverDate || '',
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
    if (dealerStatus === 'Confirmed') {
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
      dealNumber: order.dealNumber,
      handoverDealer: order.handoverDealer || '',
      salespersonOrderComments: order.salespersonOrderComments || '',
      conditions: order.conditions || '',
      topUpDate: order.topUpDate || '',
      paymentMethod: order.paymentMethod || '',
      tradeIn: Boolean(order.tradeIn),
      tradeInAllowance: order.tradeInAllowance ?? 0,
      depositReceived: order.depositReceived ?? order.deposit ?? DEFAULT_DEPOSIT,
      expectedHandoverDate: order.expectedHandoverDate || '',
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
          <h1 className="text-4xl font-extrabold text-gray-900">Orders & Sales</h1>
          <p className="text-sm text-gray-500">Overview of all show orders and sales confirmations</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" className="bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-white shadow-lg hover:opacity-95">
              <Sparkles className="mr-2 h-4 w-4" />
              Model Confirmation Insights
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Model Confirmation Analysis (Top 10 x2)</DialogTitle>
              <DialogDescription>
                Compare confirmed order counts by model between {modelConfirmationInsights.currentMonthLabel} and {modelConfirmationInsights.previousMonthLabel}. Includes both fastest-growing Top 10 and highest-total Top 10.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-indigo-100 bg-indigo-50/70">
                <CardHeader className="pb-2">
                  <CardDescription>{modelConfirmationInsights.currentMonthLabel}</CardDescription>
                  <CardTitle className="text-3xl text-indigo-700">{modelConfirmationInsights.totalCurrent}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader className="pb-2">
                  <CardDescription>{modelConfirmationInsights.previousMonthLabel}</CardDescription>
                  <CardTitle className="text-3xl text-slate-700">{modelConfirmationInsights.totalPrevious}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Top 10 Fastest Growth (By Increase)</h3>
                {modelConfirmationInsights.top10FastestGrowth.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No growth data available.</div>
                )}
                {modelConfirmationInsights.top10FastestGrowth.map((item, index) => (
                  <div key={`growth-${item.model}`} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">#{index + 1}</div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.model}</p>
                        <p className="text-xs text-slate-500">{item.previous} → {item.current} confirmations</p>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <ArrowUpRight className="h-3.5 w-3.5" />+{item.delta} ({item.growthRate.toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Top 10 Highest Confirmations (By Total Count)</h3>
                {modelConfirmationInsights.top10ByTotal.length === 0 && (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No confirmation data available.</div>
                )}
                {modelConfirmationInsights.top10ByTotal.map((item, index) => {
                  return (
                    <div key={`total-${item.model}`} className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">#{index + 1}</div>
                        <div>
                          <p className="font-semibold text-slate-900">{item.model}</p>
                          <p className="text-xs text-slate-500">Total {item.total} ({item.previous} → {item.current})</p>
                        </div>
                      </div>
                      <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Total: {item.total}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="flex flex-nowrap gap-4 overflow-x-auto pb-1">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('all')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('all')}
          className={cn(
            'min-w-[220px] cursor-pointer transition shadow-sm',
            statusFilter === 'all' ? 'ring-2 ring-blue-500' : ''
          )}
        >
          <CardHeader className="pb-2">
            <CardDescription>All Statuses</CardDescription>
            <CardTitle className="text-3xl">{ordersMatchingLowerFilters.length}</CardTitle>
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
              'min-w-[220px] cursor-pointer transition shadow-sm',
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
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilter('all')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              showFilter === 'all'
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <span>All Shows</span>
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', showFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')}>
              {orders.length}
            </span>
          </button>
          {showFilterTabs.map((show) => {
            const isActive = showFilter === show.id;
            return (
              <button
                key={show.id}
                type="button"
                onClick={() => setShowFilter(show.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span>{show.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {show.count}
                </span>
              </button>
            );
          })}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  orderingDateFilter
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{orderingDateFilter ? `Ordering Date: ${orderingDateFilter}` : 'Ordering Date'}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    orderingDateFilter ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {orderingDateCount}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="start">
              <div>
                <p className="text-sm font-medium text-slate-900">Ordering Date</p>
                <p className="text-xs text-slate-500">Filter orders by order date.</p>
              </div>
              <Input
                type="date"
                value={orderingDateFilter}
                onChange={(event) => setOrderingDateFilter(event.target.value)}
              />
              {orderingDateFilter && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setOrderingDateFilter('')}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear date
                </Button>
              )}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  showMonthFilter
                    ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{showMonthFilter ? `Show Month: ${showMonthFilter}` : 'Show Month'}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    showMonthFilter ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {showMonthCount}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="start">
              <div>
                <p className="text-sm font-medium text-slate-900">Show Month</p>
                <p className="text-xs text-slate-500">Filter and export by the month when the show is held.</p>
              </div>
              <Input
                type="month"
                value={showMonthFilter}
                onChange={(event) => setShowMonthFilter(event.target.value)}
              />
              {showMonthFilter && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowMonthFilter('')}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Clear month
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Card>
        <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Orders List</CardTitle>
                <CardDescription>Search and confirm orders across every show</CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative w-full sm:w-80 lg:w-96">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                  <Input
                    placeholder="Search by deal #, show, model, customer, salesperson or type"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-10 border-blue-200 bg-blue-50/60 pl-9 text-slate-900 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
                <Button type="button" variant="outline" onClick={handleExportOrdersExcel}>
                  <Download className="mr-2 h-4 w-4" />
                  Export Excel
                </Button>
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
                  <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-y-auto">
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
                          <Popover open={isHandoverDealerPickerOpen} onOpenChange={setIsHandoverDealerPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={isHandoverDealerPickerOpen}
                                className="w-full justify-between"
                                disabled={handoverDealerChoices.length === 0}
                              >
                                {newOrder.handoverDealer || 'Select handover dealer'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0">
                              <Command>
                                <CommandInput placeholder="Search handover dealer..." />
                                <CommandList>
                                  <CommandEmpty>No dealer found.</CommandEmpty>
                                  <CommandGroup heading="Available dealers">
                                    {handoverDealerChoices.map((dealer) => (
                                      <CommandItem
                                        key={dealer}
                                        value={dealer}
                                        onSelect={(value) => {
                                          setNewOrder({ ...newOrder, handoverDealer: value });
                                          setIsHandoverDealerPickerOpen(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            newOrder.handoverDealer === dealer ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        {dealer}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {newOrder.handoverDealer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2"
                              onClick={() => setNewOrder({ ...newOrder, handoverDealer: '' })}
                            >
                              Clear selection
                            </Button>
                          )}
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
                          <Label>Contract Number</Label>
                          <Input
                            placeholder="Enter contract number"
                            value={newOrder.contractNumber || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, contractNumber: event.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Deal #</Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Enter deal number"
                            value={newOrder.dealNumber ?? ''}
                            onChange={(event) => setNewOrder({ ...newOrder, dealNumber: event.target.value })}
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

                        {newOrder.orderType === 'Transfer from Stock' && (
                          <div className="space-y-2">
                            <Label>Chassis Number *</Label>
                            <Input
                              placeholder="Enter chassis number"
                              value={newOrder.chassisNumber || ''}
                              onChange={(event) => setNewOrder({ ...newOrder, chassisNumber: event.target.value })}
                            />
                          </div>
                        )}

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
                          <Label>Payment Method</Label>
                          <div className="flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={newOrder.paymentMethod === 'Cash'}
                                onCheckedChange={(checked) =>
                                  setNewOrder({ ...newOrder, paymentMethod: checked ? 'Cash' : '' })
                                }
                              />
                              Cash
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <Checkbox
                                checked={newOrder.paymentMethod === 'Finance'}
                                onCheckedChange={(checked) =>
                                  setNewOrder({ ...newOrder, paymentMethod: checked ? 'Finance' : '' })
                                }
                              />
                              Finance
                            </label>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Trade In</Label>
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <Checkbox
                              checked={Boolean(newOrder.tradeIn)}
                              onCheckedChange={(checked) =>
                                setNewOrder({
                                  ...newOrder,
                                  tradeIn: Boolean(checked),
                                  tradeInAllowance: checked ? newOrder.tradeInAllowance ?? 0 : 0,
                                })
                              }
                            />
                            Trade-in included
                          </label>
                        </div>
                        <div className="space-y-2">
                          <Label>Trade-in Allowance (AUD)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            disabled={!newOrder.tradeIn}
                            value={newOrder.tradeInAllowance ?? ''}
                            onChange={(event) =>
                              setNewOrder({ ...newOrder, tradeInAllowance: parseContractValue(event.target.value) })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Deposit Received (AUD)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            value={newOrder.depositReceived ?? ''}
                            onChange={(event) =>
                              setNewOrder({ ...newOrder, depositReceived: parseContractValue(event.target.value) })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Expected Handover Date</Label>
                          <Input
                            type="date"
                            value={newOrder.expectedHandoverDate || ''}
                            onChange={(event) => setNewOrder({ ...newOrder, expectedHandoverDate: event.target.value })}
                          />
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
              </div>
            </div>
          </CardHeader>
        <CardContent>
            {decoratedOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Actions</TableHead>
                    <TableHead>Ordering Date</TableHead>
                    <TableHead>Deal #</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Contract Number</TableHead>
                    <TableHead className="text-right">Contract Value</TableHead>
                    <TableHead>Sales Person</TableHead>
                    <TableHead>Deposit Received</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Top Up Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Handover Dealer</TableHead>
                    <TableHead>Dealer Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Commission</TableHead>
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
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleEditOrder(order, order.dealerStatus)}
                              disabled={order.dealerStatus === 'Confirmed'}
                              aria-label="Edit order"
                            >
                              <span role="img" aria-hidden="true">
                                🖊
                              </span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDetailOrder(order);
                                setIsDetailOpen(true);
                              }}
                            >
                              Details
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(order.date)}</TableCell>
                        <TableCell className="max-w-[120px]">
                          <Input
                            value={getInlineValue(order, 'dealNumber')}
                            onChange={(event) => updateInlineDraft(order.id, 'dealNumber', event.target.value)}
                            onBlur={() => saveInlineField(order, 'dealNumber')}
                            placeholder="Deal #"
                            inputMode="numeric"
                            className="min-w-[90px] font-semibold"
                          />
                        </TableCell>
                        <TableCell>{order.customerName || 'Not set'}</TableCell>
                        <TableCell>{order.model || 'Not set'}</TableCell>
                        <TableCell>{order.contractNumber || 'Not set'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(order.contractValue)}</TableCell>
                        <TableCell>{order.salesperson || 'Unassigned'}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                            {formatCurrency(order.depositReceived ?? order.deposit ?? DEFAULT_DEPOSIT)}
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
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-semibold',
                              hasCommissionSent(order.emailconfirmation)
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                            )}
                            title={hasCommissionSent(order.emailconfirmation) ? 'Confirmation email sent' : 'Not sent yet'}
                          >
                            {hasCommissionSent(order.emailconfirmation) ? '✓' : '-'}
                          </span>
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

      <Dialog
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setDetailOrder(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Full order record for this caravan sale.</DialogDescription>
          </DialogHeader>
          {detailOrder ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Show</p>
                  <p className="font-medium">{detailOrder.showName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Ordering Date</p>
                  <p className="font-medium">{formatDate(detailOrder.date)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Deal #</p>
                  <p className="font-medium">#{detailOrder.dealNumber ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Customer</p>
                  <p className="font-medium">{detailOrder.customerName || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Model</p>
                  <p className="font-medium">{detailOrder.model || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Number</p>
                  <p className="font-medium">{detailOrder.contractNumber || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Contract Value</p>
                  <p className="font-medium">{formatCurrency(detailOrder.contractValue)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Payment Method</p>
                  <p className="font-medium">{detailOrder.paymentMethod || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Trade In</p>
                  <p className="font-medium">{detailOrder.tradeIn ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Trade-in Allowance</p>
                  <p className="font-medium">{formatCurrency(detailOrder.tradeInAllowance)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Deposit Received</p>
                  <p className="font-medium">
                    {formatCurrency(detailOrder.depositReceived ?? detailOrder.deposit ?? DEFAULT_DEPOSIT)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Expected Handover Date</p>
                  <p className="font-medium">
                    {detailOrder.expectedHandoverDate ? formatDate(detailOrder.expectedHandoverDate) : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Salesperson</p>
                  <p className="font-medium">{detailOrder.salesperson || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Order Type</p>
                  <p className="font-medium">{detailOrder.orderType}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Handover Dealer</p>
                  <p className="font-medium">{detailOrder.handoverDealer || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Dealer Status</p>
                  <p className="font-medium">{detailOrder.dealerStatus}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Status</p>
                  <p className="font-medium">{detailOrder.status || 'Pending'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Conditions</p>
                  <p className="font-medium">{detailOrder.conditions || 'None'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Top Up Date</p>
                  <p className="font-medium">{detailOrder.topUpDate || 'Not set'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Salesperson Comments</p>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {detailOrder.salespersonOrderComments || 'No comments recorded.'}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Attachments</p>
                {detailOrder.orderAttachments && detailOrder.orderAttachments.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {(detailOrder.orderAttachments as OrderAttachment[]).map((file) => (
                      <li key={file.path}>
                        <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                          {file.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No attachments uploaded.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-slate-500">No order selected.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
