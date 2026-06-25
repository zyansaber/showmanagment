import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw, Search, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet } from '@/lib/firebase';

type SiteLocation = {
  number?: string;
  street?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  siteLocation?: SiteLocation;
  startDate?: string;
  finishDate?: string;
  showDuration?: number | string;
  target2024?: number | string;
  sales2024?: number | string;
  target2025?: number | string;
  sales2025?: number | string;
  target2026?: number | string;
  sales2026?: number | string;
  eventOrganiser?: string;
  caravansOnDisplay?: number | string;
  standSize?: string;
  layoutAddress?: string;
  status?: string;
  teamMembers?: string[];
  finished?: boolean;
};

type TeamMember = {
  memberId?: string;
  memberName?: string;
  role?: string;
  activeFlag?: number;
};

type InternalSalesOrder = {
  id?: string;
  showId?: string;
  internalSalesOrderNumber?: string;
  internalSalesOrderNumberDealer?: string;
  dealership?: string;
};

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
};

const isEmptyValue = (value: unknown) => formatValue(value).trim().length === 0;

const EMPTY_EDIT_PASSWORD = 'regshow';

const formatAddress = (site?: SiteLocation) => {
  if (!site) return '';
  return [site.number, site.street, site.suburb, site.state, site.postcode, site.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
};

const calculateShowDuration = (show: ShowRecord) => {
  if (show.showDuration !== undefined && show.showDuration !== null && show.showDuration !== '') {
    return show.showDuration;
  }
  const start = parseDate(show.startDate);
  const finish = parseDate(show.finishDate);
  if (!start || !finish) return '';
  const diffMs = finish.getTime() - start.getTime();
  if (diffMs < 0) return '';
  return Math.floor(diffMs / 86_400_000) + 1;
};

const calculateWeekBeforeStartFromToday = (startDate?: string) => {
  const start = parseDate(startDate);
  if (!start) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 7);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
};

const isShowFinished = (finishDate?: string) => {
  if (!finishDate) return false;
  const finish = parseDate(finishDate);
  if (!finish) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  finish.setHours(0, 0, 0, 0);
  return finish.getTime() < today.getTime();
};

export default function ShowExcelList() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [internalSalesOrders, setInternalSalesOrders] = useState<InternalSalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideFinished, setHideFinished] = useState(false);
  const [editingCell, setEditingCell] = useState<{ showId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [emptyCellsUnlocked, setEmptyCellsUnlocked] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [showsData, teamData, internalOrderData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('finance/internalSalesOrders'),
      ]);
      setShows(normaliseList<ShowRecord>(showsData));
      setTeamMembers(normaliseList<TeamMember>(teamData));
      setInternalSalesOrders(normaliseList<InternalSalesOrder>(internalOrderData));
    } catch (err) {
      console.error('Failed to load show spreadsheet data:', err);
      setError('Failed to load show spreadsheet data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeTeamMembers = useMemo(
    () =>
      teamMembers
        .filter((member) => member.activeFlag === 1)
        .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || '')),
    [teamMembers]
  );

  const internalOrderByShowId = useMemo(() => {
    return internalSalesOrders.reduce((acc, order) => {
      if (order.showId) acc[order.showId] = order.internalSalesOrderNumber || '';
      return acc;
    }, {} as Record<string, string>);
  }, [internalSalesOrders]);

  const internalOrderRecordByShowId = useMemo(() => {
    return internalSalesOrders.reduce((acc, order) => {
      if (order.showId) acc[order.showId] = order;
      return acc;
    }, {} as Record<string, InternalSalesOrder>);
  }, [internalSalesOrders]);

  const teamMemberById = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      if (member.memberId) acc[member.memberId] = member;
      return acc;
    }, {} as Record<string, TeamMember>);
  }, [teamMembers]);

  const sortedShows = useMemo(() => {
    return [...shows]
      .filter((show) => {
        // Search filter
        if (
          searchTerm &&
          !(
            (show.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (show.dealership || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (show.siteLocation?.suburb || '').toLowerCase().includes(searchTerm.toLowerCase())
          )
        ) {
          return false;
        }
        // Hide finished filter
        if (hideFinished && isShowFinished(show.finishDate)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aTime = parseDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [shows, searchTerm, hideFinished]);

  const handleCellEdit = (showId: string, field: string, currentValue: unknown) => {
    if (!showId) return;
    setEditingCell({ showId, field });
    setEditValue(formatValue(currentValue));
  };

  const handleUnlockEmptyCells = () => {
    if (emptyCellsUnlocked) {
      setEmptyCellsUnlocked(false);
      setEditingCell(null);
      return;
    }

    const password = window.prompt('Enter password to unlock empty cells for editing');
    if (password === EMPTY_EDIT_PASSWORD) {
      setEmptyCellsUnlocked(true);
      setError(null);
    } else if (password !== null) {
      setError('Incorrect password. Empty cells remain locked.');
    }
  };

  const persistInternalOrders = async (orders: InternalSalesOrder[]) => {
    const payload = orders.reduce((acc, order) => {
      if (!order.id) return acc;
      acc[order.id] = order;
      return acc;
    }, {} as Record<string, InternalSalesOrder>);
    await dbSet('finance/internalSalesOrders', payload as unknown as Record<string, unknown>);
  };

  const handleSaveCell = async (showId: string, field: string) => {
    const show = shows.find((s) => s.id === showId);
    const currentValue =
      field === 'internalOrder'
        ? internalOrderByShowId[showId]
        : field === 'suburb' || field === 'state'
          ? show?.siteLocation?.[field]
          : field === 'address'
            ? formatAddress(show?.siteLocation)
            : show?.[field as keyof ShowRecord];

    if (editValue === formatValue(currentValue)) {
      setEditingCell(null);
      return;
    }

    setIsSaving(true);
    try {
      if (field === 'internalOrder') {
        const existingOrder = internalOrderRecordByShowId[showId];
        const order: InternalSalesOrder = existingOrder
          ? { ...existingOrder, internalSalesOrderNumber: editValue }
          : {
              id: `order-${showId}`,
              showId,
              internalSalesOrderNumber: editValue,
              internalSalesOrderNumberDealer: '',
              dealership: show?.dealership || '',
            };
        const nextOrders = existingOrder
          ? internalSalesOrders.map((item) => (item.showId === showId ? order : item))
          : [...internalSalesOrders, order];
        await persistInternalOrders(nextOrders);
        setInternalSalesOrders(nextOrders);
        setEditingCell(null);
        return;
      }

      if (!show) return;

      let updateData: ShowRecord;
      if (field === 'suburb' || field === 'state') {
        updateData = {
          ...show,
          siteLocation: { ...show.siteLocation, [field]: editValue },
        };
      } else if (field === 'address') {
        updateData = { ...show, layoutAddress: editValue };
      } else {
        updateData = { ...show, [field]: editValue };
      }

      await dbSet(`shows/${showId}`, updateData);
      setShows(shows.map((s) => (s.id === showId ? updateData : s)));
      setEditingCell(null);
    } catch (err) {
      console.error('Failed to save cell:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const EditableCell = ({
    value,
    showId,
    field,
    type = 'text',
    isEditing,
  }: {
    value: unknown;
    showId: string;
    field: string;
    type?: string;
    isEditing: boolean;
  }) => {
    const shouldHighlightEmpty = emptyCellsUnlocked && isEmptyValue(value);

    if (isEditing) {
      return (
        <input
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => handleSaveCell(showId, field)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSaveCell(showId, field);
            }
            if (e.key === 'Escape') {
              setEditingCell(null);
            }
          }}
          autoFocus
          className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
        />
      );
    }

    return (
      <div
        onClick={() => handleCellEdit(showId, field, value)}
        className={`cursor-pointer px-2 py-1 hover:bg-blue-50 rounded transition-colors ${
          shouldHighlightEmpty ? 'min-h-7 border border-dashed border-amber-400 bg-amber-50 text-amber-700' : ''
        }`}
      >
        {shouldHighlightEmpty ? 'Click to edit' : formatValue(value)}
      </div>
    );
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header - Fixed */}
      <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg">
                <FileSpreadsheet className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">All Shows Spreadsheet</h1>
            </div>
            <p className="text-sm text-slate-600 ml-11">Click any cell to edit • Press Enter to save</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={emptyCellsUnlocked ? 'default' : 'outline'}
              onClick={handleUnlockEmptyCells}
              className="gap-2"
              title="Password required to highlight every blank cell as editable"
            >
              {emptyCellsUnlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {emptyCellsUnlocked ? 'Empty Cells Unlocked' : 'Unlock Empty Cells'}
            </Button>
            <Button
              variant={hideFinished ? 'default' : 'outline'}
              onClick={() => setHideFinished(!hideFinished)}
              className="gap-2"
              title="Click to toggle finished shows visibility"
            >
              {hideFinished ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {hideFinished ? 'Show All' : 'Hide Finished'}
            </Button>
            <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by show name, dealership, or suburb..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <div className="mb-2">Loading shows...</div>
              <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
            </div>
          </div>
        ) : sortedShows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            {searchTerm ? 'No shows match your search' : 'No shows found'}
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <table className="w-full border-collapse text-xs sticky">
              <thead>
                <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-20 h-16">
                  {/* Block 1: Basic Info */}
                  <th className="px-4 py-3 text-left font-bold border-r-2 border-indigo-500 min-w-[200px] bg-indigo-700">
                    Name
                  </th>
                  <th className="px-2 py-3 text-left font-semibold border-r-2 border-indigo-500 min-w-[82px] bg-indigo-700">
                    Internal Order
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-indigo-500 min-w-[140px] bg-indigo-700">
                    Dealership
                  </th>

                  {/* Block 2: Location */}
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    Suburb
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[80px]">
                    State
                  </th>

                  {/* Block 3: Dates & Duration */}
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-emerald-500 min-w-[140px] bg-emerald-700">
                    Start Date
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-emerald-500 min-w-[140px] bg-emerald-700">
                    Finish Date
                  </th>
                  <th className="px-3 py-3 text-center font-semibold border-r-2 border-emerald-500 min-w-[60px] bg-emerald-700">
                    Week
                  </th>
                  <th className="px-3 py-3 text-center font-semibold border-r-2 border-emerald-500 min-w-[70px] bg-emerald-700">
                    Duration
                  </th>

                  {/* Block 4: Team Members */}
                  {activeTeamMembers.map((member) => (
                    <th
                      key={member.memberId || member.memberName}
                      className="relative px-2 py-3 text-center font-semibold border-r border-purple-500 min-w-[80px] whitespace-normal break-words bg-purple-700 overflow-hidden"
                      title={member.memberName}
                    >
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-white/20 [writing-mode:vertical-rl]">
                        Team Member
                      </span>
                      <span className="relative z-10">{member.memberName || member.memberId}</span>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold border-r-2 border-blue-500 min-w-[70px]">
                    Team Count
                  </th>

                  {/* Block 5: Sales & Details */}
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2024 Sales
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2025 Sales
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2026 Target
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[200px]">
                    Address
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[120px]">
                    Event Organizer
                  </th>
                  <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500 min-w-[80px]">
                    Caravans
                  </th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[100px]">Stand Size</th>
                </tr>
              </thead>
              <tbody>
                {sortedShows.map((show, index) => {
                  const assignedMemberIds = new Set(show.teamMembers || []);
                  const membershipExcludingManagers = (show.teamMembers || []).filter((memberId) => {
                    const member = teamMemberById[memberId];
                    return member?.role !== 'Show Manager';
                  }).length;

                  const isFinished = isShowFinished(show.finishDate);

                  return (
                    <tr
                      key={show.id || `${show.name}-${index}`}
                      className={`border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                        isFinished ? 'bg-slate-100' : 'bg-white'
                      }`}
                    >
                      {/* Name with Finished Tag */}
                      <td className="px-4 py-3 font-bold text-blue-900 border-r-2 border-slate-200">
                        <div className="flex flex-col gap-1">
                          <EditableCell
                            value={show.name}
                            showId={show.id || ''}
                            field="name"
                            isEditing={editingCell?.showId === show.id && editingCell?.field === 'name'}
                          />
                          {isFinished && (
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold w-fit">
                              finished
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Internal Order */}
                      <td className="px-2 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.id ? internalOrderByShowId[show.id] : ''}
                          showId={show.id || ''}
                          field="internalOrder"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'internalOrder'}
                        />
                      </td>

                      {/* Dealership */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.dealership}
                          showId={show.id || ''}
                          field="dealership"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'dealership'}
                        />
                      </td>

                      {/* Suburb */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.siteLocation?.suburb}
                          showId={show.id || ''}
                          field="suburb"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'suburb'}
                        />
                      </td>

                      {/* State */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.siteLocation?.state}
                          showId={show.id || ''}
                          field="state"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'state'}
                        />
                      </td>

                      {/* Start Date */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.startDate}
                          showId={show.id || ''}
                          field="startDate"
                          type="date"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'startDate'}
                        />
                      </td>

                      {/* Finish Date */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <div
                          onClick={() => handleCellEdit(show.id || '', 'finishDate', show.finishDate)}
                          className={`cursor-pointer px-2 py-1 hover:bg-blue-50 rounded transition-colors ${
                            isFinished ? 'bg-green-100' : ''
                          }`}
                        >
                          {editingCell?.showId === show.id && editingCell?.field === 'finishDate' ? (
                            <input
                              type="date"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSaveCell(show.id || '', 'finishDate')}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveCell(show.id || '', 'finishDate');
                                }
                                if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              autoFocus
                              className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50"
                            />
                          ) : (
                            formatValue(show.finishDate)
                          )}
                        </div>
                      </td>

                      {/* Week Before */}
                      <td className="px-3 py-3 border-r-2 border-slate-200 text-center text-sm">
                        {formatValue(calculateWeekBeforeStartFromToday(show.startDate))}
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-3 border-r-2 border-slate-200 text-center font-medium">
                        {formatValue(calculateShowDuration(show))}
                      </td>

                      {/* Team Members */}
                      {activeTeamMembers.map((member) => (
                        <td
                          key={member.memberId || member.memberName}
                          className="px-2 py-3 text-center border-r border-slate-200"
                        >
                          {member.memberId && assignedMemberIds.has(member.memberId) ? (
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">
                              ✓
                            </span>
                          ) : (
                            ''
                          )}
                        </td>
                      ))}

                      {/* Team Count */}
                      <td className="px-3 py-3 border-r-2 border-slate-200 text-center font-bold text-blue-900">
                        {membershipExcludingManagers}
                      </td>

                      {/* Sales 2024 */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.sales2024}
                          showId={show.id || ''}
                          field="sales2024"
                          type="number"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'sales2024'}
                        />
                      </td>

                      {/* Sales 2025 */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.sales2025}
                          showId={show.id || ''}
                          field="sales2025"
                          type="number"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'sales2025'}
                        />
                      </td>

                      {/* Target 2026 */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.target2026}
                          showId={show.id || ''}
                          field="target2026"
                          type="number"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'target2026'}
                        />
                      </td>

                      {/* Address */}
                      <td className="px-3 py-3 border-r-2 border-slate-200 text-sm whitespace-normal break-words">
                        <EditableCell
                          value={formatAddress(show.siteLocation)}
                          showId={show.id || ''}
                          field="address"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'address'}
                        />
                      </td>

                      {/* Event Organizer */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.eventOrganiser}
                          showId={show.id || ''}
                          field="eventOrganiser"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'eventOrganiser'}
                        />
                      </td>

                      {/* Caravans */}
                      <td className="px-3 py-3 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.caravansOnDisplay}
                          showId={show.id || ''}
                          field="caravansOnDisplay"
                          type="number"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'caravansOnDisplay'}
                        />
                      </td>

                      {/* Stand Size */}
                      <td className="px-3 py-3">
                        <EditableCell
                          value={show.standSize}
                          showId={show.id || ''}
                          field="standSize"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'standSize'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
