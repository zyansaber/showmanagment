import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, RefreshCw, Search, Eye, EyeOff, Lock, Unlock, Download, Upload, Plus } from 'lucide-react';
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

type TicketFile = { showId?: string };
type ConfirmRequest = { showId?: string; confirmedAt?: string };

const TEAM_MEMBER_CHANGE_LOCK_MESSAGE = 'Show team has been confirmed. Please contact Headquarter to make changes.';

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const displayMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (displayMatch) {
    const [, day, month, year] = displayMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
};

const isEmptyValue = (value: unknown) => formatValue(value).trim().length === 0;

const formatDisplayDate = (value?: string) => {
  const date = parseDate(value);
  if (!date) return formatValue(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const convertDisplayDateToStorage = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return trimmed;

  const [, dayPart, monthPart, yearPart] = match;
  const day = Number(dayPart);
  const month = Number(monthPart);
  const year = Number(yearPart);
  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return trimmed;
  }

  return `${yearPart}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const EDIT_MODE_PASSWORD = 'regshow';

const makeMemberSlug = (member: TeamMember) =>
  encodeURIComponent((member.memberName || member.memberId || '').trim().replace(/\s+/g, '-'));

const isDealershipMember = (member: TeamMember) =>
  (member.memberName || member.memberId || '').trim().toLowerCase() === 'dealership';

const escapeCsvCell = (value: unknown) => {
  const text = formatValue(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const parseCsv = (content: string) => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] || '';
      return acc;
    }, {} as Record<string, string>);
  });
};


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
  const diffDays = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'This week';
  const absWeeks = Math.max(1, Math.ceil(Math.abs(diffDays) / 7));
  return diffDays > 0 ? `in ${absWeeks}w` : `${absWeeks}w ago`;
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
  const [ticketFiles, setTicketFiles] = useState<TicketFile[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmRequest[]>([]);
  const [internalSalesOrders, setInternalSalesOrders] = useState<InternalSalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideFinished, setHideFinished] = useState(false);
  const [editingCell, setEditingCell] = useState<{ showId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editModeEnabled, setEditModeEnabled] = useState(false);
  const matrixUploadRef = useRef<HTMLInputElement | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [showsData, teamData, internalOrderData, ticketFileData, confirmationData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('finance/internalSalesOrders'),
        dbGet('ticketAndBookingFiles'),
        dbGet('ticketBookingConfirmations'),
      ]);
      setShows(normaliseList<ShowRecord>(showsData));
      setTeamMembers(normaliseList<TeamMember>(teamData));
      setInternalSalesOrders(normaliseList<InternalSalesOrder>(internalOrderData));
      setTicketFiles(normaliseList<TicketFile>(ticketFileData));
      setConfirmations(normaliseList<ConfirmRequest>(confirmationData));
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
        .sort((a, b) => {
          if (isDealershipMember(a)) return -1;
          if (isDealershipMember(b)) return 1;
          return (a.memberName || '').localeCompare(b.memberName || '');
        }),
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
    if (!editModeEnabled || !showId) return;
    setEditingCell({ showId, field });
    setEditValue(
      field === 'startDate' || field === 'finishDate'
        ? formatDisplayDate(formatValue(currentValue))
        : formatValue(currentValue)
    );
  };

  const handleToggleEditMode = () => {
    if (editModeEnabled) {
      setEditModeEnabled(false);
      setEditingCell(null);
      return;
    }

    const password = window.prompt('Enter password to unlock spreadsheet editing');
    if (password === EDIT_MODE_PASSWORD) {
      setEditModeEnabled(true);
      setError(null);
    } else if (password !== null) {
      setError('Incorrect password. Spreadsheet editing remains locked.');
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

    const nextEditValue = field === 'startDate' || field === 'finishDate' ? convertDisplayDateToStorage(editValue) : editValue;

    if (nextEditValue === formatValue(currentValue)) {
      setEditingCell(null);
      return;
    }

    setIsSaving(true);
    try {
      if (field === 'internalOrder') {
        const existingOrder = internalOrderRecordByShowId[showId];
        const order: InternalSalesOrder = existingOrder
          ? { ...existingOrder, internalSalesOrderNumber: nextEditValue }
          : {
              id: `order-${showId}`,
              showId,
              internalSalesOrderNumber: nextEditValue,
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
          siteLocation: { ...show.siteLocation, [field]: nextEditValue },
        };
      } else if (field === 'address') {
        updateData = { ...show, layoutAddress: nextEditValue };
      } else {
        updateData = { ...show, [field]: nextEditValue };
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

  const handleAddShow = async () => {
    if (!editModeEnabled || isSaving) return;

    const id = `show-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const blankShow: ShowRecord = {
      id,
      name: '',
      dealership: '',
      siteLocation: { suburb: '', state: '' },
      startDate: '',
      finishDate: '',
      teamMembers: [],
    };

    setIsSaving(true);
    try {
      await dbSet(`shows/${id}`, blankShow as unknown as Record<string, unknown>);
      setShows((prev) => [blankShow, ...prev]);
      setEditingCell({ showId: id, field: 'name' });
      setEditValue('');
      setError(null);
    } catch (err) {
      console.error('Failed to add show row:', err);
      setError('Failed to add a new show row. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const isShowTeamChangeLocked = (showId?: string) =>
    Boolean(showId) && (ticketFiles.some((file) => file.showId === showId) || confirmations.some((item) => item.showId === showId && item.confirmedAt));

  const handleToggleTeamMember = async (show: ShowRecord, memberId?: string) => {
    if (!editModeEnabled || !show.id || !memberId || isSaving) return;
    if (isShowTeamChangeLocked(show.id)) {
      window.alert(TEAM_MEMBER_CHANGE_LOCK_MESSAGE);
    }

    setIsSaving(true);
    try {
      const currentMembers = show.teamMembers || [];
      const nextMembers = currentMembers.includes(memberId)
        ? currentMembers.filter((id) => id !== memberId)
        : [...currentMembers, memberId];
      const updateData = { ...show, teamMembers: nextMembers };

      await dbSet(`shows/${show.id}`, updateData);
      setShows(shows.map((item) => (item.id === show.id ? updateData : item)));
    } catch (err) {
      console.error('Failed to save team member assignment:', err);
      setError('Failed to save team member assignment. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadTeamMatrixTemplate = () => {
    const unfinishedShows = sortedShows.filter((show) => !isShowFinished(show.finishDate));
    const headers = ['Show ID', 'Show Name', 'Start Date', 'Finish Date', 'Dealership', ...activeTeamMembers.map((member) => member.memberName || member.memberId || '')];
    const rows = unfinishedShows.map((show) => {
      const assigned = new Set(show.teamMembers || []);
      return [
        show.id || '',
        show.name || '',
        formatDisplayDate(show.startDate),
        formatDisplayDate(show.finishDate),
        show.dealership || '',
        ...activeTeamMembers.map((member) => (member.memberId && assigned.has(member.memberId) ? '1' : '')),
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'show-team-member-matrix-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadTeamMatrix = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    try {
      const rows = parseCsv(await file.text());
      const memberByHeader = activeTeamMembers.reduce((acc, member) => {
        const header = member.memberName || member.memberId || '';
        if (header && member.memberId) acc[header] = member.memberId;
        return acc;
      }, {} as Record<string, string>);
      const nextShows = [...shows];
      let updatedCount = 0;

      for (const row of rows) {
        const showId = row['Show ID'];
        const showIndex = nextShows.findIndex((show) => show.id === showId);
        if (!showId || showIndex === -1) continue;

        const selectedMemberIds = Object.entries(memberByHeader)
          .filter(([header]) => row[header]?.trim() === '1')
          .map(([, memberId]) => memberId);
        const updateData = { ...nextShows[showIndex], teamMembers: selectedMemberIds };
        await dbSet(`shows/${showId}`, updateData);
        nextShows[showIndex] = updateData;
        updatedCount += 1;
      }

      setShows(nextShows);
      setError(updatedCount ? null : 'No matching shows were found in the uploaded matrix.');
    } catch (err) {
      console.error('Failed to upload team matrix:', err);
      setError('Failed to upload team matrix. Please use the downloaded CSV template.');
    } finally {
      setIsSaving(false);
      event.target.value = '';
    }
  };

  const EditableCell = ({
    value,
    showId,
    field,
    isEditing,
    displayValue,
  }: {
    value: unknown;
    showId: string;
    field: string;
    isEditing: boolean;
    displayValue?: string;
  }) => {
    const isBlank = isEmptyValue(value);
    const shouldShowEditableStyle = editModeEnabled;

    if (isEditing) {
      return (
        <input
          type="text"
          placeholder={field === 'startDate' || field === 'finishDate' ? 'dd/mm/yyyy' : undefined}
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
          shouldShowEditableStyle ? 'min-h-7 border border-dashed border-blue-300 bg-blue-50/70 text-slate-800' : ''
        }`}
      >
        {isBlank ? (editModeEnabled ? 'Click to edit' : '') : displayValue || formatValue(value)}
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
            <div className="ml-11 flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-600">Unlock editing to change cells • Use dd/mm/yyyy for dates • Press Enter to save</p>
              {editModeEnabled && (
                <Button type="button" size="sm" onClick={handleAddShow} disabled={isSaving} className="gap-1 rounded-full">
                  <Plus className="h-4 w-4" />
                  Add Show
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={editModeEnabled ? 'default' : 'outline'}
              onClick={handleToggleEditMode}
              className="gap-2"
              title="Password required to unlock all spreadsheet editing"
            >
              {editModeEnabled ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {editModeEnabled ? 'Editing Unlocked' : 'Unlock Editing'}
            </Button>
            <Button variant="outline" onClick={handleDownloadTeamMatrixTemplate} className="gap-2">
              <Download className="h-4 w-4" />
              Download Team Template
            </Button>
            <Button
              variant="outline"
              onClick={() => matrixUploadRef.current?.click()}
              disabled={isSaving}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Team Matrix
            </Button>
            <input
              ref={matrixUploadRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleUploadTeamMatrix}
              className="hidden"
            />
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
                <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-20 h-12">
                  {/* Block 1: Basic Info */}
                  <th className="px-4 py-2 text-left font-bold border-r-2 border-indigo-500 min-w-[200px] bg-indigo-700">
                    Name
                  </th>
                  <th className="px-2 py-2 text-left font-semibold border-r-2 border-indigo-500 min-w-[82px] bg-indigo-700">
                    Internal Order
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-indigo-500 min-w-[140px] bg-indigo-700">
                    Dealership
                  </th>

                  {/* Block 2: Location */}
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    Suburb
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[80px]">
                    State
                  </th>

                  {/* Block 3: Dates & Duration */}
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-emerald-500 min-w-[140px] bg-emerald-700">
                    Start Date
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-emerald-500 min-w-[140px] bg-emerald-700">
                    Finish Date
                  </th>
                  <th className="px-3 py-2 text-center font-semibold border-r-2 border-emerald-500 min-w-[60px] bg-emerald-700">
                    Week
                  </th>
                  <th className="px-3 py-2 text-center font-semibold border-r-2 border-emerald-500 min-w-[70px] bg-emerald-700">
                    Duration
                  </th>

                  {/* Block 4: Team Members */}
                  {activeTeamMembers.map((member) => (
                    <th
                      key={member.memberId || member.memberName}
                      className={`px-2 py-2 text-center font-semibold border-r min-w-[80px] whitespace-normal break-words ${isDealershipMember(member) ? 'border-orange-500 bg-orange-600 text-white' : 'border-purple-500 bg-purple-700'}`}
                      title={member.memberName}
                    >
                      {isDealershipMember(member) ? (
                        <span title="Dealership member is external and does not open a team portal">{member.memberName || member.memberId}</span>
                      ) : (
                        <a
                          href={`/team/${makeMemberSlug(member)}`}
                          className="underline-offset-2 hover:underline"
                          title={`Open ${member.memberName || member.memberId} profile`}
                        >
                          {member.memberName || member.memberId}
                        </a>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold border-r-2 border-blue-500 min-w-[70px]">
                    Team Count
                  </th>

                  {/* Block 5: Sales & Details */}
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2024 Sales
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2025 Sales
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[100px]">
                    2026 Target
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[200px]">
                    Address
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[120px]">
                    Event Organizer
                  </th>
                  <th className="px-3 py-2 text-left font-semibold border-r-2 border-blue-500 min-w-[80px]">
                    Caravans
                  </th>
                  <th className="px-3 py-2 text-left font-semibold min-w-[100px]">Stand Size</th>
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
                      <td className="px-4 py-2 font-bold text-blue-900 border-r-2 border-slate-200">
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
                      <td className="px-2 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.id ? internalOrderByShowId[show.id] : ''}
                          showId={show.id || ''}
                          field="internalOrder"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'internalOrder'}
                        />
                      </td>

                      {/* Dealership */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.dealership}
                          showId={show.id || ''}
                          field="dealership"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'dealership'}
                        />
                      </td>

                      {/* Suburb */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.siteLocation?.suburb}
                          showId={show.id || ''}
                          field="suburb"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'suburb'}
                        />
                      </td>

                      {/* State */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.siteLocation?.state}
                          showId={show.id || ''}
                          field="state"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'state'}
                        />
                      </td>

                      {/* Start Date */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.startDate}
                          displayValue={formatDisplayDate(show.startDate)}
                          showId={show.id || ''}
                          field="startDate"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'startDate'}
                        />
                      </td>

                      {/* Finish Date */}
                      <td className={`px-3 py-2 border-r-2 border-slate-200 ${isFinished ? 'bg-green-50' : ''}`}>
                        <EditableCell
                          value={show.finishDate}
                          displayValue={formatDisplayDate(show.finishDate)}
                          showId={show.id || ''}
                          field="finishDate"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'finishDate'}
                        />
                      </td>

                      {/* Week Before */}
                      <td className="px-3 py-2 border-r-2 border-slate-200 text-center text-sm">
                        {formatValue(calculateWeekBeforeStartFromToday(show.startDate))}
                      </td>

                      {/* Duration */}
                      <td className="px-3 py-2 border-r-2 border-slate-200 text-center font-medium">
                        {formatValue(calculateShowDuration(show))}
                      </td>

                      {/* Team Members */}
                      {activeTeamMembers.map((member) => {
                        const checked = Boolean(member.memberId && assignedMemberIds.has(member.memberId));

                        return (
                          <td
                            key={member.memberId || member.memberName}
                            className={`px-2 py-2 text-center border-r ${isDealershipMember(member) ? 'border-orange-200 bg-orange-50' : 'border-slate-200'}`}
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleTeamMember(show, member.memberId)}
                              disabled={!editModeEnabled || isSaving}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold transition-colors ${
                                checked
                                  ? 'border-green-300 bg-green-100 text-green-800'
                                  : editModeEnabled
                                    ? 'border-dashed border-blue-300 bg-blue-50 text-blue-500 hover:bg-blue-100'
                                    : 'border-transparent text-transparent'
                              }`}
                              title={editModeEnabled ? 'Toggle team member assignment' : 'Unlock editing to change team ticks'}
                            >
                              {checked ? '✓' : editModeEnabled ? '+' : ''}
                            </button>
                          </td>
                        );
                      })}

                      {/* Team Count */}
                      <td className="px-3 py-2 border-r-2 border-slate-200 text-center font-bold text-blue-900">
                        {membershipExcludingManagers}
                      </td>

                      {/* Sales 2024 */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.sales2024}
                          showId={show.id || ''}
                          field="sales2024"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'sales2024'}
                        />
                      </td>

                      {/* Sales 2025 */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.sales2025}
                          showId={show.id || ''}
                          field="sales2025"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'sales2025'}
                        />
                      </td>

                      {/* Target 2026 */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.target2026}
                          showId={show.id || ''}
                          field="target2026"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'target2026'}
                        />
                      </td>

                      {/* Address */}
                      <td className="px-3 py-2 border-r-2 border-slate-200 text-sm whitespace-normal break-words">
                        <EditableCell
                          value={formatAddress(show.siteLocation)}
                          showId={show.id || ''}
                          field="address"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'address'}
                        />
                      </td>

                      {/* Event Organizer */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.eventOrganiser}
                          showId={show.id || ''}
                          field="eventOrganiser"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'eventOrganiser'}
                        />
                      </td>

                      {/* Caravans */}
                      <td className="px-3 py-2 border-r-2 border-slate-200">
                        <EditableCell
                          value={show.caravansOnDisplay}
                          showId={show.id || ''}
                          field="caravansOnDisplay"
                          isEditing={editingCell?.showId === show.id && editingCell?.field === 'caravansOnDisplay'}
                        />
                      </td>

                      {/* Stand Size */}
                      <td className="px-3 py-2">
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
