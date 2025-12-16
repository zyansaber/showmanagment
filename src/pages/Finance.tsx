+664
-0

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Loader2, Plus, Save, Upload, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dbGet, dbSet } from '@/lib/firebase';

type ExpenseCategory = 'Dealer Cost' | 'Factory Cost' | 'Factory Commissions';

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  handoverDealer?: string;
};

type InternalSalesOrder = {
  id: string;
  showId: string;
  internalSalesOrderNumber: string;
  internalSalesOrderNumberDealer: string;
  dealership: string;
};

type ExpenseItem = {
  id: string;
  category: ExpenseCategory;
  name: string;
  glCode: string;
  contains?: string;
};

const DEFAULT_EXPENSE_ITEMS: ExpenseItem[] = [
  { id: 'dealer-stand-cost', category: 'Dealer Cost', name: 'Stand Cost', glCode: '', contains: '' },
  { id: 'dealer-day-rates', category: 'Dealer Cost', name: 'Dealer Day Rates', glCode: '', contains: '' },
  { id: 'dealer-commission', category: 'Dealer Cost', name: 'Dealer Commission', glCode: '', contains: '' },
  { id: 'dealer-transport', category: 'Dealer Cost', name: 'Dealer Costs Transport', glCode: '', contains: '' },
  { id: 'factory-cost', category: 'Factory Cost', name: 'Factory Cost', glCode: '', contains: '' },
  { id: 'factory-commissions', category: 'Factory Commissions', name: 'Factory Commissions', glCode: '', contains: '' },
];

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `finance-${Date.now()}-${Math.random()}`;

const normaliseShow = (value: unknown): ShowRecord | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined;
  const dealership = typeof candidate.dealership === 'string' ? candidate.dealership.trim() : undefined;
  const handoverDealer = typeof candidate.handoverDealer === 'string' ? candidate.handoverDealer.trim() : undefined;
  if (!id) return null;
  return { id, name, dealership, handoverDealer };
};

const normaliseInternalOrders = (value: unknown): InternalSalesOrder[] => {
  if (!value) return [];
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return records
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const showId = typeof raw.showId === 'string' ? raw.showId.trim() : '';
      if (!showId) return null;
      const id =
        typeof raw.id === 'string' && raw.id.trim().length > 0
          ? raw.id.trim()
          : `order-${showId}-${Math.random().toString(16).slice(2)}`;
      const internalSalesOrderNumber =
        typeof raw.internalSalesOrderNumber === 'string' ? raw.internalSalesOrderNumber.trim() : '';
      const internalSalesOrderNumberDealer =
        typeof raw.internalSalesOrderNumberDealer === 'string' ? raw.internalSalesOrderNumberDealer.trim() : '';
      const dealership = typeof raw.dealership === 'string' ? raw.dealership.trim() : '';
      return { id, showId, internalSalesOrderNumber, internalSalesOrderNumberDealer, dealership };
    })
    .filter(Boolean) as InternalSalesOrder[];
};

const normaliseExpenseItems = (value: unknown): ExpenseItem[] => {
  if (!value) return [];
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return records
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const id =
        typeof raw.id === 'string' && raw.id.trim().length > 0
          ? raw.id.trim()
          : `expense-${Math.random().toString(16).slice(2)}`;
      const category =
        raw.category === 'Dealer Cost' || raw.category === 'Factory Cost' || raw.category === 'Factory Commissions'
          ? raw.category
          : 'Dealer Cost';
      const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : 'Unnamed Item';
      const glCode = typeof raw.glCode === 'string' ? raw.glCode.trim() : '';
      const contains = typeof raw.contains === 'string' ? raw.contains.trim() : '';
      return { id, category, name, glCode, contains };
    })
    .filter(Boolean) as ExpenseItem[];
};

const loadXlsxModule = async () => {
  try {
    const mod = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    return mod;
  } catch (err) {
    console.error('Failed to load xlsx parser from CDN', err);
    return null;
  }
};

const parseSpreadsheetRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const buffer = await file.arrayBuffer();
  const xlsx = await loadXlsxModule();

  if (xlsx) {
    const workbook = xlsx.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      return (xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]) ?? [];
    }
  }

  // Fallback for CSV if xlsx module is unavailable
  const text = new TextDecoder().decode(buffer);
  const [headerRow, ...dataRows] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!headerRow) return [];

  const headers = headerRow.split(',').map((cell) => cell.trim());
  return dataRows.map((row) => {
    const values = row.split(',').map((cell) => cell.trim());
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    return record;
  });
};

const findMatchingShowDealer = (show: ShowRecord | undefined) => show?.handoverDealer || show?.dealership || '';

export default function Finance() {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrder[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>(DEFAULT_EXPENSE_ITEMS);
  const [savingOrders, setSavingOrders] = useState(false);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<'orders' | 'expenses'>('orders');
  const [newExpense, setNewExpense] = useState<Pick<ExpenseItem, 'category' | 'name' | 'glCode' | 'contains'>>({
    category: 'Dealer Cost',
    name: '',
    glCode: '',
    contains: '',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [showsData, ordersData, expensesData] = await Promise.all([
          dbGet('shows'),
          dbGet('finance/internalSalesOrders'),
          dbGet('finance/expenses'),
        ]);

        const normalisedShows = showsData
          ? Object.entries(showsData)
              .map(([key, value]) => normaliseShow({ id: key, ...(value as Record<string, unknown>) }))
              .filter(Boolean) ?? []
          : [];

        setShows(normalisedShows as ShowRecord[]);
        setInternalOrders(normaliseInternalOrders(ordersData));

        const expenseList = normaliseExpenseItems(expensesData);
        setExpenses(expenseList.length > 0 ? expenseList : DEFAULT_EXPENSE_ITEMS);

        setError(null);
      } catch (err) {
        console.error('Failed to load finance data', err);
        setError('Unable to load finance data. Please try again.');
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
      }, {} as Record<string, ShowRecord>),
    [shows]
  );

  const persistInternalOrders = async (orders: InternalSalesOrder[]) => {
    const payload = orders.reduce((acc, order) => {
      acc[order.id] = order;
      return acc;
    }, {} as Record<string, InternalSalesOrder>);
    await dbSet('finance/internalSalesOrders', payload as unknown as Record<string, unknown>);
  };

  const persistExpenses = async (items: ExpenseItem[]) => {
    const payload = items.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {} as Record<string, ExpenseItem>);
    await dbSet('finance/expenses', payload as unknown as Record<string, unknown>);
  };

  const handleOrderChange = (id: string, updates: Partial<InternalSalesOrder>) => {
    setInternalOrders((prev) =>
      prev.map((order) => {
        if (order.id !== id) return order;
        return { ...order, ...updates };
      })
    );
  };

  const handleSaveOrders = async () => {
    try {
      setSavingOrders(true);
      const filtered = internalOrders.filter((order) => order.showId);
      await persistInternalOrders(filtered);
      toast.success('Internal sales orders saved to finance dataset.');
    } catch (err) {
      console.error('Failed to save internal sales orders', err);
      toast.error('Failed to save internal sales orders.');
    } finally {
      setSavingOrders(false);
    }
  };

  const handleImportOrders = async (file: File) => {
    setImporting(true);
    try {
      const rows = await parseSpreadsheetRows(file);
      const uploaded = rows
        .map((row) => {
          const showId =
            typeof row['Show ID'] === 'string' && row['Show ID'].trim()
              ? row['Show ID'].trim()
              : typeof row['showId'] === 'string'
                ? row['showId'].trim()
                : '';
          if (!showId) return null;
          const dealership =
            typeof row.Dealership === 'string'
              ? row.Dealership.trim()
              : typeof row.dealership === 'string'
                ? row.dealership.trim()
                : '';
          const internalSalesOrderNumber =
            typeof row['Internal Sales Order Number'] === 'string'
              ? row['Internal Sales Order Number'].trim()
              : typeof row.internalSalesOrderNumber === 'string'
                ? row.internalSalesOrderNumber.trim()
                : '';
          const internalSalesOrderNumberDealer =
            typeof row['Internal Sales Order Number (dealer)'] === 'string'
              ? row['Internal Sales Order Number (dealer)'].trim()
              : typeof row.internalSalesOrderNumberDealer === 'string'
                ? row.internalSalesOrderNumberDealer.trim()
                : '';
          return {
            id: newId(),
            showId,
            dealership,
            internalSalesOrderNumber,
            internalSalesOrderNumberDealer,
          } as InternalSalesOrder;
        })
        .filter(Boolean) as InternalSalesOrder[];

      if (uploaded.length === 0) {
        toast.error('No valid rows found in the uploaded file.');
        return;
      }

      const existingByShowId = internalOrders.reduce((acc, order) => {
        acc[order.showId] = order;
        return acc;
      }, {} as Record<string, InternalSalesOrder>);

      const merged: InternalSalesOrder[] = [...internalOrders];
      uploaded.forEach((row) => {
        const existing = existingByShowId[row.showId];
        if (existing) {
          merged.splice(merged.indexOf(existing), 1, {
            ...existing,
            ...row,
            id: existing.id,
          });
        } else {
          merged.push(row);
        }
      });

      setInternalOrders(merged);
      await persistInternalOrders(merged);
      toast.success('Excel data imported into finance/internalSalesOrder.');
    } catch (err) {
      console.error('Failed to import internal sales orders', err);
      toast.error('Failed to import internal sales orders. Please check the file format.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteOrder = (id: string) => {
    setInternalOrders((prev) => prev.filter((order) => order.id !== id));
  };

  const handleAddExpenseItem = () => {
    if (!newExpense.name.trim()) {
      toast.error('Please enter a subcategory name.');
      return;
    }
    setExpenses((prev) => [...prev, { ...newExpense, id: newId() }]);
    setNewExpense({ category: 'Dealer Cost', name: '', glCode: '', contains: '' });
  };

  const handleExpenseChange = (id: string, updates: Partial<ExpenseItem>) => {
    setExpenses((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveExpenses = async () => {
    try {
      setSavingExpenses(true);
      await persistExpenses(expenses);
      toast.success('Expense GL codes saved to finance dataset.');
    } catch (err) {
      console.error('Failed to save expenses', err);
      toast.error('Failed to save expense items.');
    } finally {
      setSavingExpenses(false);
    }
  };

  const groupedExpenses = useMemo(
    () =>
      ['Dealer Cost', 'Factory Cost', 'Factory Commissions'].map((category) => ({
        category: category as ExpenseCategory,
        items: expenses.filter((item) => item.category === category),
      })),
    [expenses]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-700">
            <Banknote className="h-5 w-5" />
            <p className="text-sm font-medium uppercase tracking-wide">Data Sets</p>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Finance Dataset</h1>
          <p className="text-sm text-slate-600">
            Manage finance/internalsalesorder and finance/expense entries stored in Firebase.
          </p>
        </div>
        <Badge variant="secondary" className="text-slate-700">
          Auto-linked to shows for names and default dealership
        </Badge>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-red-800">
            <XCircle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={activeTable === 'orders' ? 'default' : 'outline'}
              onClick={() => setActiveTable('orders')}
              className="text-sm"
            >
              Internal Sales Order
            </Button>
            <Button
              variant={activeTable === 'expenses' ? 'default' : 'outline'}
              onClick={() => setActiveTable('expenses')}
              className="text-sm"
            >
              GL Account
            </Button>
          </div>
          {activeTable === 'orders' ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleImportOrders(file);
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {importing ? 'Uploading...' : 'Upload Excel'}
              </Button>
              <Button onClick={handleSaveOrders} disabled={savingOrders}>
                {savingOrders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {savingOrders ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSaveExpenses} disabled={savingExpenses}>
                {savingExpenses ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {savingExpenses ? 'Saving...' : 'Save GL Accounts'}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {activeTable === 'orders' ? (
            loading ? (
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading finance data...
              </div>
            ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-300 shadow">
              <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[170px]">Show ID</TableHead>
                      <TableHead>Show Name</TableHead>
                      <TableHead>Dealership</TableHead>
                      <TableHead>Internal Sales Order Number</TableHead>
                      <TableHead>Internal Sales Order Number (Dealer)</TableHead>
                      <TableHead className="w-16 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {internalOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-slate-500">
                          No internal sales orders yet. Upload a spreadsheet or add a row to begin.
                        </TableCell>
                      </TableRow>
                    ) : (
                      internalOrders.map((order) => {
                        const linkedShow = order.showId ? showLookup[order.showId] : undefined;
                        return (
                          <TableRow key={order.id} className="align-middle">
                            <TableCell>
                              <p className="font-semibold text-slate-900">{order.showId || '—'}</p>
                            </TableCell>
                            <TableCell>
                              <p className="font-semibold text-slate-900">{linkedShow?.name || 'Unknown Show'}</p>
                            </TableCell>
                            <TableCell>
                              <p className="text-slate-800">{order.dealership || linkedShow?.dealership || '—'}</p>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={order.internalSalesOrderNumber}
                                onChange={(event) =>
                                  handleOrderChange(order.id, { internalSalesOrderNumber: event.target.value })
                                }
                                placeholder="Internal Sales Order Number"
                                className="h-9"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={order.internalSalesOrderNumberDealer}
                                onChange={(event) =>
                                  handleOrderChange(order.id, { internalSalesOrderNumberDealer: event.target.value })
                                }
                                placeholder="Internal Sales Order Number (Dealer)"
                                className="h-9"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteOrder(order.id)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={newExpense.category}
                    onValueChange={(value) => setNewExpense((prev) => ({ ...prev, category: value as ExpenseCategory }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dealer Cost">Dealer Cost</SelectItem>
                      <SelectItem value="Factory Cost">Factory Cost</SelectItem>
                      <SelectItem value="Factory Commissions">Factory Commissions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Input
                    value={newExpense.name}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="e.g. Stand Cost"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Contains</Label>
                  <Input
                    value={newExpense.contains}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, contains: event.target.value }))}
                    placeholder="Describe what goes into this account"
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label>GL Code</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newExpense.glCode}
                      onChange={(event) => setNewExpense((prev) => ({ ...prev, glCode: event.target.value }))}
                      placeholder="Enter GL code"
                      className="h-9"
                    />
                    <Button variant="outline" onClick={handleAddExpenseItem}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {groupedExpenses.map(({ category, items }) => (
                  <Card key={category} className="border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                      <div>
                        <CardTitle className="text-base">{category}</CardTitle>
                        <CardDescription>Update GL codes or extend the list with new subcategories.</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-slate-700">
                        {items.length} item{items.length === 1 ? '' : 's'}
                      </Badge>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-32">Subcategory</TableHead>
                            <TableHead className="w-48">Contains</TableHead>
                            <TableHead className="w-32">GL Code</TableHead>
                            <TableHead className="w-16 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                                No entries yet for {category}. Add a subcategory above.
                              </TableCell>
                            </TableRow>
                          ) : (
                            items.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="align-middle font-medium text-slate-900">{item.name}</TableCell>
                                <TableCell className="align-middle">
                                  <Input
                                    value={item.contains || ''}
                                    onChange={(event) => handleExpenseChange(item.id, { contains: event.target.value })}
                                    placeholder="Describe contents"
                                    className="h-9"
                                  />
                                </TableCell>
                                <TableCell className="align-middle">
                                  <Input
                                    value={item.glCode}
                                    onChange={(event) => handleExpenseChange(item.id, { glCode: event.target.value })}
                                    placeholder="GL code"
                                    className="h-9"
                                  />
                                </TableCell>
                                <TableCell className="text-right align-middle">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-600"
                                    onClick={() => handleDeleteExpense(item.id)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
