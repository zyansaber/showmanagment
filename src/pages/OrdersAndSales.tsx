import { useEffect, useMemo, useState } from 'react';
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

interface DecoratedOrder extends ShowOrder {
  showName: string;
  orderStatus: string;
  handoverDealer: string;
  handoverInvoice: string;
}


const statusStyles: Record<ShowOrder['status'], string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
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
  const [scheduleOrders, setScheduleOrders] = useState<Record<string, ScheduleOrder>>({});
  const [invoiceByChassis, setInvoiceByChassis] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingOrder, setPendingOrder] = useState<ShowOrder | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authExpiry, setAuthExpiry] = useState<number | null>(null);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [isSalespersonPickerOpen, setIsSalespersonPickerOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<Partial<ShowOrder>>({
    chassisNumber: '',
    orderType: 'New Order',
    salesperson: '',
    status: 'Pending',
    showId: '',
    date: new Date().toISOString().split('T')[0],
  });

  const requiresPassword = !authExpiry || authExpiry <= Date.now();

  const normaliseChassis = (value?: string | null) => value?.trim().toUpperCase() || '';

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
        const [ordersData, showsData, teamData, scheduleData, invoicesData] = await Promise.all([
          dbGet('showOrders'),
          dbGet('shows'),
          dbGet('teamMembers'),
          schedulingDbGet('schedule'),
          schedulingDbGet('yardnewvaninvoice'),
        ]);

        setOrders(ordersData ? Object.values(ordersData) : []);
        setShows(showsData ? Object.values(showsData) : []);
        setTeamMembers(teamData ? Object.values(teamData) : []);
        if (scheduleData) {
          const map = Object.values(scheduleData as Record<string, ScheduleOrder>).reduce(
            (acc, order) => {
              const key = normaliseChassis(order.Chassis);
              if (key) {
                acc[key] = order;
              }
              return acc;
            },
            {} as Record<string, ScheduleOrder>
          );
          setScheduleOrders(map);
        }

        if (invoicesData) {
          const invoiceMap: Record<string, string> = {};
          Object.values(invoicesData as Record<string, unknown>).forEach((warehouse) => {
            if (!warehouse || typeof warehouse !== 'object') return;

            Object.entries(warehouse as Record<string, unknown>).forEach(([chassis, invoiceEntry]) => {
              const chassisKey = normaliseChassis(chassis);
              if (!chassisKey) return;

              if (typeof invoiceEntry === 'string') {
                invoiceMap[chassisKey] = invoiceEntry;
                return;
              }

              if (!invoiceEntry || typeof invoiceEntry !== 'object') return;

              const invoiceDates = Object.keys(invoiceEntry as Record<string, unknown>);
              if (invoiceDates.length === 0) return;

              const latestDate = invoiceDates
                .slice()
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

              invoiceMap[chassisKey] = latestDate;
            });
          });

          setInvoiceByChassis(invoiceMap);
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

  const showLookup = useMemo(() =>
    shows.reduce((acc, show) => {
      if (show.id) {
        acc[show.id] = show.name || 'Unnamed Show';
      }
      return acc;
    }, {} as Record<string, string>),
  [shows]);

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
        if (!term) return true;
        const haystack = [
          order.chassisNumber,
          order.orderType,
          order.salesperson,
          order.id,
          showLookup[order.showId],
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .map((order) => ({
        ...order,
        showName: showLookup[order.showId] || 'Unknown Show',
        orderStatus: scheduleOrders[normaliseChassis(order.chassisNumber)]?.['Regent Production']?.trim() || 'N/A',
        handoverDealer: scheduleOrders[normaliseChassis(order.chassisNumber)]?.Dealer?.trim() || 'Unknown',
        handoverInvoice:
          invoiceByChassis[normaliseChassis(order.chassisNumber)]
            ? formatDate(invoiceByChassis[normaliseChassis(order.chassisNumber)])
            : 'not invoiced',
      }));
  }, [invoiceByChassis, orders, scheduleOrders, searchTerm, showLookup]);

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((order) => order.status === 'Pending').length;
  const approvedOrders = orders.filter((order) => order.status === 'Approved').length;

  const selectedShow = useMemo(() => shows.find((show) => show.id === newOrder.showId), [newOrder.showId, shows]);

  const showTeamMembers = useMemo(() => {
    if (!selectedShow) return [] as TeamMember[];
    const memberIds = selectedShow.teamMembers || [];
    return teamMembers.filter((member) => memberIds.includes(member.memberId));
  }, [selectedShow, teamMembers]);

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
        approvedBy: 'Orders Dashboard',
        date: order.date,
      });
      setOrders((prev) =>
        prev.map((existing) =>
          existing.id === order.id
            ? { ...existing, status: 'Approved', approvedBy: 'Orders Dashboard' }
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
    if (order.status === 'Approved') {
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
    if (!newOrder.chassisNumber || !newOrder.salesperson || !newOrder.showId || !newOrder.date) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const order: ShowOrder = {
        id: `ORD-${Date.now()}`,
        showId: newOrder.showId,
        chassisNumber: newOrder.chassisNumber,
        orderType: (newOrder.orderType as ShowOrder['orderType']) || 'New Order',
        salesperson: newOrder.salesperson,
        date: newOrder.date,
        status: 'Pending',
      };

      await dbSet(`showOrders/${order.id}`, order as unknown as Record<string, unknown>);
      setOrders((prev) => [...prev, order]);
      setIsAddingOrder(false);
      setNewOrder({
        chassisNumber: '',
        orderType: 'New Order',
        salesperson: '',
        status: 'Pending',
        showId: '',
        date: new Date().toISOString().split('T')[0],
      });
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Orders</CardDescription>
            <CardTitle className="text-3xl">{totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Confirmation</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{pendingOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
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

                      <div className="space-y-2">
                        <Label>Chassis Number *</Label>
                        <Input
                          value={newOrder.chassisNumber}
                          onChange={(event) => setNewOrder({ ...newOrder, chassisNumber: event.target.value })}
                          placeholder="e.g., SRV123456"
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
                    placeholder="Search by chassis, show, salesperson or type"
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
                  <TableHead>Chassis Number</TableHead>
                  <TableHead>Show</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Salesperson</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order Status</TableHead>
                  <TableHead>Handover Dealer</TableHead>
                  <TableHead>Handover Invoice</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decoratedOrders.map((order) => {
                  const rowKey = order.id || `${order.chassisNumber}-${order.date}`;
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-medium">{order.chassisNumber}</TableCell>
                      <TableCell>{order.showName}</TableCell>
                      <TableCell>{order.orderType}</TableCell>
                      <TableCell>{order.salesperson || 'Unassigned'}</TableCell>
                      <TableCell>{formatDate(order.date)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[order.status]}`}>
                          {order.status}
                        </span>
                      </TableCell>
                      <TableCell>{order.orderStatus}</TableCell>
                      <TableCell>{order.handoverDealer}</TableCell>
                      <TableCell>{order.handoverInvoice}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleConfirmationClick(order)}
                          disabled={order.status === 'Approved'}
                        >
                          Confirmation
                        </Button>
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
