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
import { dbGet, dbSet, dbUpdate, schedulingDbGet } from '@/lib/firebase';
import type { ScheduleOrder, Show, ShowOrder, TeamMember } from '@/types';
import { toast } from 'sonner';
import { Check, CheckCircle2, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONFIRMATION_PASSWORD = 'admin123';
const CONFIRMATION_CACHE_KEY = 'orders-dashboard-confirmation';
const CONFIRMATION_DURATION_MS = 5 * 60 * 1000; // 5 minutes

type DealerStatus = 'Pending' | 'Approved';

interface DecoratedOrder extends ShowOrder {
  showName: string;
  handoverDealer: string;
  dealerStatus: DealerStatus;
}

const statusStyles: Record<DealerStatus, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
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

export default function OrdersAndSales() {
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [dealerOptions, setDealerOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingOrder, setPendingOrder] = useState<ShowOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authExpiry, setAuthExpiry] = useState<number | null>(null);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [isSalespersonPickerOpen, setIsSalespersonPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [selectedHandoverDealer, setSelectedHandoverDealer] = useState('');
  const [newOrder, setNewOrder] = useState<Partial<ShowOrder>>({
    chassisNumber: '',
    model: '',
    customerName: '',
    orderType: 'New Order',
    salesperson: '',
    status: 'Pending',
    showId: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [statusFilter, setStatusFilter] = useState<'All' | DealerStatus>('All');

  const requiresPassword = !authExpiry || authExpiry <= Date.now();


  useEffect(() => {
    const cached = typeof window !== 'undefined' ? window.localStorage.getItem(CONFIRMATION_CACHE_KEY) : null;
    if (!cached) return;
    const expires = Number(cached);
    if (Number.isFinite(expires) && expires > Date.now()) {
      setAuthExpiry(expires);
    } else if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONFIRMATION_CACHE_KEY);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ordersData, showsData, teamData, scheduleData] = await Promise.all([
          dbGet('showOrders'),
          dbGet('shows'),
          dbGet('teamMembers'),
          schedulingDbGet('schedule'),
        ]);

        setOrders(ordersData ? Object.values(ordersData) : []);
        const showList = showsData ? Object.values(showsData) : [];
        setShows(showList);
        setTeamMembers(teamData ? Object.values(teamData) : []);

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

  const deriveDealerStatus = useCallback(
    (order: ShowOrder): DealerStatus => (order.dealerConfirm ? 'Approved' : 'Pending'),
    []
  );

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
        const dealerStatus = deriveDealerStatus(order);
        if (statusFilter !== 'All' && dealerStatus !== statusFilter) return false;
        if (!term) return true;
        const matchedShow = showLookup[order.showId];
        const haystack = [
          order.chassisNumber,
          order.orderType,
          order.customerName,
          order.salesperson,
          order.model,
          order.id,
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
        handoverDealer: showLookup[order.showId]?.handoverDealer || 'Not set',
        dealerStatus: deriveDealerStatus(order),
      }));
  }, [deriveDealerStatus, orders, searchTerm, showLookup, statusFilter]);

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((order) => deriveDealerStatus(order) === 'Pending').length;
  const approvedOrders = orders.filter((order) => deriveDealerStatus(order) === 'Approved').length;

  const selectedShow = useMemo(() => shows.find((show) => show.id === newOrder.showId), [newOrder.showId, shows]);

  const showTeamMembers = useMemo(() => {
    if (!selectedShow) return [] as TeamMember[];
    const memberIds = selectedShow.teamMembers || [];
    return teamMembers.filter((member) => memberIds.includes(member.memberId));
  }, [selectedShow, teamMembers]);

  const ordersByShow = useMemo(
    () =>
      orders.reduce((acc, order) => {
        if (!order.showId) return acc;
        acc[order.showId] = (acc[order.showId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    [orders]
  );

  const requiresHandoverDealer = useMemo(() => {
    if (!selectedShow) return false;
    const orderCount = ordersByShow[selectedShow.id] ?? 0;
    return orderCount === 0 && !selectedShow.handoverDealer;
  }, [ordersByShow, selectedShow]);

  const isValidModelSelection = (value: string | undefined) => {
    if (!value) return false;
    return modelOptions.some((option) => option.toLowerCase() === value.trim().toLowerCase());
  };

  useEffect(() => {
    if (selectedShow?.handoverDealer) {
      setSelectedHandoverDealer(selectedShow.handoverDealer);
    } else {
      setSelectedHandoverDealer('');
    }
  }, [selectedShow]);

  const persistAuthExpiry = (expiresAt: number) => {
    setAuthExpiry(expiresAt);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONFIRMATION_CACHE_KEY, expiresAt.toString());
    }
  };

  const confirmOrder = async (order: ShowOrder) => {
    if (!order.id) {
      toast.error('Order is missing an ID.');
      setPendingOrder(null);
      return;
    }

    try {
      await dbUpdate(`showOrders/${order.id}`, {
        status: 'Approved',
        dealerConfirm: true,
        approvedBy: 'Orders Dashboard',
        date: order.date,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? { ...existing, status: 'Approved', dealerConfirm: true, approvedBy: 'Orders Dashboard' }
            : existing
        )
      );
      toast.success(`Order ${order.id} confirmed.`);
    } catch (err) {
      console.error('Error confirming order:', err);
      toast.error('Failed to confirm order. Please try again.');
    } finally {
      setPendingOrder(null);
    }
  };

  const handleConfirmationClick = (order: ShowOrder) => {
    if (deriveDealerStatus(order) === 'Approved') {
      toast.info('Order already confirmed.');
      return;
    }

    setPendingOrder(order);
    if (requiresPassword) {
      setIsDialogOpen(true);
    } else {
      confirmOrder(order);
    }
  };

  const handlePasswordSubmit = () => {
    if (passwordInput.trim() !== CONFIRMATION_PASSWORD) {
      toast.error('Incorrect password');
      return;
    }

    const expiresAt = Date.now() + CONFIRMATION_DURATION_MS;
    persistAuthExpiry(expiresAt);
    setIsDialogOpen(false);
    setPasswordInput('');

    if (pendingOrder) {
      confirmOrder(pendingOrder);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setPasswordInput('');
      setPendingOrder(null);
    }
  };

  const handleAddOrder = async () => {
    if (!newOrder.salesperson || !newOrder.showId || !newOrder.date || !newOrder.customerName?.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (requiresHandoverDealer && !selectedHandoverDealer) {
      toast.error('Please select a handover dealer for this show');
      return;
    }

    if (!isValidModelSelection(newOrder.model)) {
      toast.error('Please select a model from the schedule list');
      return;
    }

    try {
      const order: ShowOrder = {
        id: `ORD-${Date.now()}`,
        showId: newOrder.showId,
        chassisNumber: newOrder.chassisNumber || '',
        customerName: newOrder.customerName?.trim() || '',
        model: newOrder.model || '',
        orderType: (newOrder.orderType as ShowOrder['orderType']) || 'New Order',
        salesperson: newOrder.salesperson,
        date: newOrder.date,
        status: 'Pending',
      };

      await dbSet(`showOrders/${order.id}`, order as unknown as Record<string, unknown>);
      if (requiresHandoverDealer && selectedHandoverDealer) {
        await dbUpdate(`shows/${order.showId}`, { handoverDealer: selectedHandoverDealer });
        setShows((prev) =>
          prev.map((show) =>
            show.id === order.showId ? { ...show, handoverDealer: selectedHandoverDealer } : show
          )
        );
      }
      setOrders((prev) => [...prev, order]);
      setIsAddingOrder(false);
      setNewOrder({
        chassisNumber: '',
        orderType: 'New Order',
        customerName: '',        
        salesperson: '',
        status: 'Pending',
        showId: '',
        date: new Date().toISOString().split('T')[0],
        model: '',
      });
      setSelectedHandoverDealer('');
      toast.success('Order added successfully');
    } catch (err) {
      console.error('Error adding order:', err);
      toast.error('Failed to add order');
    }
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
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ShieldCheck className="h-4 w-4" />
          {requiresPassword ? 'Confirmation requires password' : 'Confirmation unlocked'}
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('All')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('All')}
          className={cn('cursor-pointer transition shadow-sm', statusFilter === 'All' ? 'ring-2 ring-blue-500' : '')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle className="text-3xl">{totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('Pending')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('Pending')}
          className={cn(
            'cursor-pointer transition shadow-sm',
            statusFilter === 'Pending' ? 'ring-2 ring-yellow-500' : ''
          )}
        >
          <CardHeader className="pb-2">
            <CardDescription>Pending Confirmation</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{pendingOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setStatusFilter('Approved')}
          onKeyDown={(event) => event.key === 'Enter' && setStatusFilter('Approved')}
          className={cn('cursor-pointer transition shadow-sm', statusFilter === 'Approved' ? 'ring-2 ring-green-500' : '')}
        >
          <CardHeader className="pb-2">
            <CardDescription>Approved Orders</CardDescription>
            <CardTitle className="text-3xl text-green-600">{approvedOrders}</CardTitle>
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
                <Dialog open={isAddingOrder} onOpenChange={setIsAddingOrder}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Order</DialogTitle>
                      <DialogDescription>Link a new order to an existing show</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
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
                            {shows.map((show) => (
                              <SelectItem key={show.id} value={show.id}>
                                {show.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {requiresHandoverDealer && (
                        <div className="space-y-2">
                          <Label>Handover Dealer *</Label>
                          <Select
                            value={selectedHandoverDealer}
                            onValueChange={(value) => setSelectedHandoverDealer(value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select handover dealer" />
                            </SelectTrigger>
                            <SelectContent>
                              {dealerOptions.map((dealer) => (
                                <SelectItem key={dealer} value={dealer}>
                                  {dealer}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {dealerOptions.length === 0 && (
                            <p className="text-xs text-muted-foreground">
                              Dealer list unavailable. Please try again after schedule sync.
                            </p>
                          )}
                        </div>
                      )}

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
                                        setNewOrder({ ...newOrder, model: value });
                                        setIsModelPickerOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn('mr-2 h-4 w-4', newOrder.model === model ? 'opacity-100' : 'opacity-0')}
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
                          <p className="text-xs text-muted-foreground">Model list unavailable. Please try again after schedule sync.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Customer Name *</Label>
                        <Input
                          placeholder="Enter customer name"
                          value={newOrder.customerName || ''}
                          onChange={(event) =>
                            setNewOrder({ ...newOrder, customerName: event.target.value })
                          }
                        />
                      </div>
                      
                      <div className="space-y-2">
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
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddingOrder(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddOrder}>Add Order</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search by order ID, show, model, customer, salesperson or type"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full lg:w-72"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {decoratedOrders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Show</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Dealer Status</TableHead>
                    <TableHead>Handover Dealer</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decoratedOrders.map((order) => {
                    const rowKey = order.id || `${order.showId}-${order.date}`;
                    return (
                      <TableRow key={rowKey}>
                        <TableCell className="font-medium">{order.id || 'N/A'}</TableCell>
                        <TableCell>{order.model || 'Not set'}</TableCell>
                        <TableCell>{order.customerName || 'Not set'}</TableCell>
                        <TableCell>{order.showName}</TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell>{order.salesperson || 'Unassigned'}</TableCell>
                        <TableCell>{formatDate(order.date)}</TableCell>
                        <TableCell>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[order.dealerStatus]}`}>
                            {order.dealerStatus === 'Approved' ? 'Approved' : 'Pending'}
                          </span>
                        </TableCell>
                        <TableCell>{order.handoverDealer}</TableCell>
                        <TableCell className="text-right">
                          {order.dealerStatus === 'Approved' ? (
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                              Confirmed
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                              onClick={() => handleConfirmationClick(order)}
                            >
                              Confirmation
                            </Button>
                          )}
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

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Confirmation Password</DialogTitle>
            <DialogDescription>Confirming an order requires administrator approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handlePasswordSubmit()}
            />
            <p className="text-xs text-gray-500">Password unlocks confirmation actions for 5 minutes.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePasswordSubmit}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
