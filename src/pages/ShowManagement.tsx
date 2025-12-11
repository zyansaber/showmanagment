import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AustraliaMap from '@/components/AustraliaMap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarClock, Download, MapPin, Plus, Search, SortAsc, SortDesc, Trash2, Upload } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRemove, dbSet, dbUpdate } from '@/lib/firebase';
import type { Show } from '@/types';
import { toast } from 'sonner';

type StateStats = {
  shows: number;
  totalSales: number;
  totalDays: number;
};

const parseMetric = (value: number | string | undefined | null): number => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const normalised = trimmed.toLowerCase();
    if (normalised === 'n/a' || normalised === 'na') return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
};

const normaliseState = (state: string | undefined | null): string | null => {
  if (!state || typeof state !== 'string') return null;
  const trimmed = state.trim();
  if (!trimmed) return null;
  const normalised = trimmed.toLowerCase();
  if (normalised === 'n/a' || normalised === 'na') return null;
  return trimmed.toUpperCase();
};

const formatCurrency = (value: number) =>
  value > 0 ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : 'N/A';

const formatNumber = (value: number) =>
  value > 0 ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : 'N/A';

const formatDate = (value: string | undefined) => {
  if (!value) return 'N/A';
  const trimmed = value.trim();
  if (!trimmed) return 'N/A';
  const normalised = trimmed.toLowerCase();
  if (normalised === 'n/a' || normalised === 'na') return 'N/A';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function ShowManagement() {
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string>('All');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreatingShow, setIsCreatingShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'startDate'>('startDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showDealerMappings, setShowDealerMappings] = useState<Record<string, unknown> | null>(null);
  const [dealerSlugFilter, setDealerSlugFilter] = useState('dealer');
  const [showDealerError, setShowDealerError] = useState<string | null>(null);
  const [showDealerLoading, setShowDealerLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadShows = async () => {
      try {
        const showsData = await dbGet('shows');
        setShows(showsData ? Object.values(showsData) : []);
        setError(null);
      } catch (err) {
        console.error('Error loading shows:', err);
        setError('Failed to load show data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadShows();
  }, []);

  useEffect(() => {
    const loadShowDealerMappings = async () => {
      try {
        const mappings = await dbGet('showDealerMappings');
        setShowDealerMappings(mappings ?? {});
        setShowDealerError(null);
      } catch (err) {
        console.error('Error loading show dealer mappings:', err);
        setShowDealerError('无法载入 showDealerMappings 数据');
      } finally {
        setShowDealerLoading(false);
      }
    };

    loadShowDealerMappings();
  }, []);

  const determineStatus = (show: Show): Show['status'] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = show.startDate ? new Date(show.startDate) : null;
    const finish = show.finishDate ? new Date(show.finishDate) : null;

    if (start && !Number.isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
    if (finish && !Number.isNaN(finish.getTime())) finish.setHours(0, 0, 0, 0);

    if (start && !Number.isNaN(start.getTime()) && today < start) {
      return 'Not Started';
    }

    if (finish && !Number.isNaN(finish.getTime()) && today > finish) {
      return 'Finished';
    }

    if (
      start &&
      !Number.isNaN(start.getTime()) &&
      finish &&
      !Number.isNaN(finish.getTime()) &&
      today >= start &&
      today <= finish
    ) {
      return 'In Progress';
    }

    if (start && !Number.isNaN(start.getTime()) && !finish) {
      return today >= start ? 'In Progress' : 'Not Started';
    }

    if (finish && !Number.isNaN(finish.getTime()) && !start) {
      return today > finish ? 'Finished' : 'In Progress';
    }

    return 'Not Started';
  };

  useEffect(() => {
    const syncStatuses = async () => {
      if (shows.length === 0) return;

      const updatedShows: Show[] = [];
      const statusUpdates: { id: string; status: Show['status'] }[] = [];

      for (const show of shows) {
        const computedStatus = determineStatus(show);
        if (computedStatus !== show.status && show.id) {
          statusUpdates.push({ id: show.id, status: computedStatus });
          updatedShows.push({ ...show, status: computedStatus });
        } else {
          updatedShows.push(show);
        }
      }

      if (statusUpdates.length === 0) return;

      setShows(updatedShows);

      await Promise.all(
        statusUpdates.map(({ id, status }) =>
          dbUpdate(`shows/${id}`, { status } as unknown as Record<string, unknown>)
        )
      );
    };

    syncStatuses();
  }, [shows]);

  const validShows = useMemo(
    () =>
      shows.filter((show) => {
        try {
          return Boolean(show && show.name && normaliseState(show.siteLocation?.state));
        } catch {
          return false;
        }
      }),
    [shows]
  );

  const stateStats = useMemo(() => {
    return validShows.reduce((acc, show) => {
      const state = normaliseState(show.siteLocation?.state);
      if (!state) return acc;

      if (!acc[state]) {
        acc[state] = { shows: 0, totalSales: 0, totalDays: 0 } as StateStats;
      }

      acc[state].shows += 1;

      const sales = parseMetric(show.sales2025);
      if (sales > 0) {
        acc[state].totalSales += sales;
      }

      const duration = parseMetric(show.showDuration);
      if (duration > 0) {
        acc[state].totalDays += duration;
      }

      return acc;
    }, {} as Record<string, StateStats>);
  }, [validShows]);

  const normaliseDealerSlug = (value: string | undefined | null) => {
    if (!value) return '';
    return value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  const dealerMappings = useMemo(() => {
    if (!showDealerMappings) return [] as Array<{ id: string; dealerSlug: string; showId?: string }>;

    return Object.entries(showDealerMappings)
      .map(([id, raw]) => {
        const mapping = raw as Record<string, unknown>;
        const dealerSlug = normaliseDealerSlug(
          String(
            (mapping.dealerSlug as string) ||
              (mapping.dealer as string) ||
              (mapping.dealershipSlug as string) ||
              (mapping.dealership as string) ||
              ''
          )
        );
        const showId = (mapping.showId as string) || (mapping.showID as string) || (mapping.show as string);

        if (!dealerSlug) return null;
        return { id, dealerSlug, showId };
      })
      .filter((entry): entry is { id: string; dealerSlug: string; showId?: string } => Boolean(entry?.dealerSlug));
  }, [showDealerMappings]);

  const dealerShows = useMemo(() => {
    const filterSlug = normaliseDealerSlug(dealerSlugFilter);
    const filteredMappings = dealerMappings.filter((mapping) =>
      filterSlug ? mapping.dealerSlug.includes(filterSlug) : true
    );

    const seen = new Set<string>();

    return filteredMappings.reduce(
      (acc, mapping) => {
        const matchedShow = shows.find((show) => show.id === mapping.showId);

        if (matchedShow && (!matchedShow.id || !seen.has(matchedShow.id))) {
          if (matchedShow.id) seen.add(matchedShow.id);
          acc.push({ mapping, show: matchedShow });
          return acc;
        }

        const fallbackShow = shows.find(
          (show) => normaliseDealerSlug(show.dealership) === mapping.dealerSlug
        );

        if (fallbackShow && (!fallbackShow.id || !seen.has(fallbackShow.id))) {
          if (fallbackShow.id) seen.add(fallbackShow.id);
          acc.push({ mapping, show: fallbackShow });
        }

        return acc;
      },
      [] as Array<{ mapping: { id: string; dealerSlug: string; showId?: string }; show: Show }>
    );
  }, [dealerMappings, dealerSlugFilter, shows]);

  const filteredShows = useMemo(() => {
    if (selectedState === 'All') return validShows;
    return validShows.filter(
      (show) => normaliseState(show.siteLocation?.state) === selectedState
    );
  }, [validShows, selectedState]);

  const fuzzyMatch = (query: string, text: string | undefined) => {
    if (!query || !text) return false;
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();

    if (lowerText.includes(lowerQuery)) return true;

    let qi = 0;
    for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i += 1) {
      if (lowerText[i] === lowerQuery[qi]) {
        qi += 1;
      }
    }

    return qi === lowerQuery.length;
  };

  const searchedShows = useMemo(() => {
    if (!searchTerm.trim()) return filteredShows;

    return filteredShows.filter((show) => {
      const state = normaliseState(show.siteLocation?.state) || '';
      return (
        fuzzyMatch(searchTerm, show.name) ||
        fuzzyMatch(searchTerm, show.dealership) ||
        fuzzyMatch(searchTerm, show.siteLocation?.suburb) ||
        fuzzyMatch(searchTerm, state) ||
        fuzzyMatch(searchTerm, show.status)
      );
    });
  }, [filteredShows, searchTerm]);

  const statusPriority = useMemo<Record<Show['status'], number>>(
    () => ({
      'In Progress': 0,
      'Not Started': 1,
      Finished: 2,
      Completed: 3,
    }),
    []
  );

  const sortedShows = useMemo(() => {
    return [...searchedShows].sort((a, b) => {
      const statusDiff = (statusPriority[a.status] ?? 99) - (statusPriority[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;

      const direction = sortDirection === 'asc' ? 1 : -1;

      if (sortKey === 'name') {
        return a.name.localeCompare(b.name) * direction;
      }

      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;

      return (dateA - dateB) * direction;
    });
  }, [searchedShows, sortDirection, sortKey, statusPriority]);

  const searchSuggestions = useMemo(() => {
    if (!searchTerm.trim()) return [] as string[];
    const names = Array.from(new Set(validShows.map((show) => show.name?.trim()).filter(Boolean)));
    return names
      .filter((name) => fuzzyMatch(searchTerm, name || ''))
      .slice(0, 5) as string[];
  }, [searchTerm, validShows]);

  const handleStateSelect = (state: string) => {
    setSelectedState(state);
  };

  const handleRowClick = (id: string | undefined) => {
    if (id) {
      navigate(`/show/${id}`);
    }
  };

  const handleDeleteShow = async (id: string | undefined, name?: string) => {
    if (!id) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete the show "${name || 'Unnamed Show'}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await dbRemove(`shows/${id}`);
      setShows((prev) => prev.filter((show) => show.id !== id));
      toast.success('Show deleted successfully');
    } catch (err) {
      console.error('Error deleting show:', err);
      toast.error('Failed to delete show. Please try again.');
    }
  };

  const handleAddShow = async () => {
    setIsCreatingShow(true);
    try {
      const id = uuidv4();
      const newShow: Show = {
        id,
        name: 'New Show',
        siteLocation: {
          number: '',
          street: '',
          suburb: '',
          postcode: '',
          state: '',
          country: '',
        },
        dealership: '',
        startDate: '',
        finishDate: '',
        showDuration: 0,
        target2024: 0,
        sales2024: 0,
        target2025: 0,
        sales2025: 0,
        target2026: 0,
        sales2026: 0,
        eventOrganiser: '',
        caravansOnDisplay: 0,
        standSize: '',
        layoutAddress: '',
        sapExpenseCode: '',
        status: 'Not Started',
        teamMembers: [],
      };

      await dbSet(`shows/${id}`, newShow as unknown as Record<string, unknown>);
      setShows((prev) => [...prev, newShow]);
      toast.success('New show created. You can now add details.');
      navigate(`/show/${id}`);
    } catch (err) {
      console.error('Error creating show:', err);
      toast.error('Failed to create a new show. Please try again.');
    } finally {
      setIsCreatingShow(false);
    }
  };
  
  const csvHeaders = [
    'ID',
    'Name',
    'Dealership',
    'Site Number',
    'Street',
    'Suburb',
    'Postcode',
    'State',
    'Country',
    'Start Date',
    'Finish Date',
    'Show Duration',
    'Target 2024',
    'Sales 2024',
    'Target 2025',
    'Sales 2025',
    'Target 2026',
    'Sales 2026',
    'Event Organiser',
    'Caravans On Display',
    'Stand Size',
    'Layout Address',
    'SAP Expense Code',
    'Status',
  ];

  const escapeCsvValue = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const handleDownloadCsv = () => {
    if (shows.length === 0) {
      toast.info('No shows available to export');
      return;
    }

    setIsExporting(true);

    try {
      const rows = shows.map((show) => [
        show.id,
        show.name,
        show.dealership,
        show.siteLocation?.number,
        show.siteLocation?.street,
        show.siteLocation?.suburb,
        show.siteLocation?.postcode,
        show.siteLocation?.state,
        show.siteLocation?.country,
        show.startDate,
        show.finishDate,
        show.showDuration,
        show.target2024,
        show.sales2024,
        show.target2025,
        show.sales2025,
        show.target2026,
        show.sales2026,
        show.eventOrganiser,
        show.caravansOnDisplay,
        show.standSize,
        show.layoutAddress,
        show.sapExpenseCode,
        show.status,
      ]);

      const csvContent = [
        csvHeaders.map(escapeCsvValue).join(','),
        ...rows.map((row) => row.map(escapeCsvValue).join(',')),
      ].join('\n');

      const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shows.csv';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Export complete. You can open the CSV directly in Excel.');
    } catch (err) {
      console.error('Error exporting shows:', err);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const parseCsvLine = (line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map((cell) => cell.trim());
  };

  const parseNumberCell = (value: string | undefined) => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  function stripUndefined<T>(value: T): T {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    return Object.entries(value).reduce((acc, [key, val]) => {
      if (val === undefined) return acc;

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const cleaned = stripUndefined(val);
        if (Object.keys(cleaned).length === 0) return acc;
        acc[key as keyof T] = cleaned as T[keyof T];
        return acc;
      }

      acc[key as keyof T] = val as T[keyof T];
      return acc;
    }, {} as T);
  }
  
  const applyCsvUpdate = async (file: File) => {
    setIsImporting(true);

    try {
      const text = await file.text();
      const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        toast.error('File is empty or has an invalid format.');
        return;
      }

      const header = parseCsvLine(lines[0]);
      const headerIndex = Object.fromEntries(header.map((title, idx) => [title, idx]));

      if (!('ID' in headerIndex)) {
        toast.error('Missing the ID column. Please keep the ID column from the exported template.');
        return;
      }
      const existingShows = new Map(shows.map((show) => [show.id, show]));
      const updatedShows: Show[] = [];
      const failedIds: string[] = [];

      const updates = lines.slice(1).map((line) => parseCsvLine(line)).filter((cells) => cells.length > 1);

      const getCell = (key: (typeof csvHeaders)[number], cells: string[]) => {
        const index = headerIndex[key];
        if (index === undefined) return undefined;
        return cells[index];
      };

      const getUpdatedText = (key: (typeof csvHeaders)[number], cells: string[], fallback: string | undefined) => {
        const value = getCell(key, cells);
        if (value === undefined) return fallback;
        const trimmed = value.trim();
        return trimmed ? trimmed : fallback;
      };

      for (const cells of updates) {
        const id = getCell('ID', cells);
        if (!id) continue;

        const existing = existingShows.get(id);
        if (!existing) {
          failedIds.push(id);
          continue;
        }

        const updatedData: Show = {
          ...existing,
          id,
          name: getUpdatedText('Name', cells, existing.name),
          dealership: getUpdatedText('Dealership', cells, existing.dealership),
          siteLocation: {
            ...(existing.siteLocation || {}),
            number: getUpdatedText('Site Number', cells, existing.siteLocation?.number || ''),
            street: getUpdatedText('Street', cells, existing.siteLocation?.street || ''),
            suburb: getUpdatedText('Suburb', cells, existing.siteLocation?.suburb || ''),
            postcode: getUpdatedText('Postcode', cells, existing.siteLocation?.postcode || ''),
            state: getUpdatedText('State', cells, existing.siteLocation?.state || ''),
            country: getUpdatedText('Country', cells, existing.siteLocation?.country || ''),
          },
          startDate: getUpdatedText('Start Date', cells, existing.startDate),
          finishDate: getUpdatedText('Finish Date', cells, existing.finishDate),
          showDuration: parseNumberCell(getCell('Show Duration', cells)) ?? existing.showDuration,
          target2024: parseNumberCell(getCell('Target 2024', cells)) ?? existing.target2024,
          sales2024: parseNumberCell(getCell('Sales 2024', cells)) ?? existing.sales2024,
          target2025: parseNumberCell(getCell('Target 2025', cells)) ?? existing.target2025,
          sales2025: parseNumberCell(getCell('Sales 2025', cells)) ?? existing.sales2025,
          target2026: parseNumberCell(getCell('Target 2026', cells)) ?? existing.target2026,
          sales2026: parseNumberCell(getCell('Sales 2026', cells)) ?? existing.sales2026,
          eventOrganiser: getUpdatedText('Event Organiser', cells, existing.eventOrganiser),
          caravansOnDisplay:
            parseNumberCell(getCell('Caravans On Display', cells)) ?? existing.caravansOnDisplay,
          standSize: getUpdatedText('Stand Size', cells, existing.standSize),
          layoutAddress: getUpdatedText('Layout Address', cells, existing.layoutAddress),
          sapExpenseCode: getUpdatedText('SAP Expense Code', cells, existing.sapExpenseCode),
          status: (getUpdatedText('Status', cells, existing.status) as Show['status']) || existing.status,
        };

        const cleanedData = stripUndefined(updatedData);

        await dbUpdate(`shows/${id}`, cleanedData as unknown as Record<string, unknown>);
        updatedShows.push(cleanedData);
        existingShows.set(id, cleanedData);
      }

      if (updatedShows.length > 0) {
        setShows(Array.from(existingShows.values()));
        toast.success(`Updated ${updatedShows.length} record(s).`);
      } else {
        toast.info('No records were updated.');
      }

      if (failedIds.length > 0) {
        toast.warning(`The following IDs were not found: ${failedIds.join(', ')}`);
      }
    } catch (err) {
      console.error('Error importing CSV:', err);
      toast.error('Import failed. Please confirm the CSV format and try again.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-600">
        Loading show data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) applyCsvUpdate(file);
        }}
      />

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>Show Distribution</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Click on a region to focus the table below.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleAddShow} disabled={isCreatingShow}>
                <Plus className="mr-2 h-4 w-4" /> {isCreatingShow ? 'Creating...' : 'Add Show'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isImporting}>
                <Upload className="mr-2 h-4 w-4" /> Import & Overwrite
              </Button>
              {selectedState !== 'All' && (
                <Button variant="outline" size="sm" onClick={() => setSelectedState('All')}>
                  Clear selection
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            After downloading, change only the fields from column 2 onward and leave the ID column untouched. Save the sheet
            as CSV before uploading—the import will overwrite matching records by ID.
          </p>
        </CardHeader>
        <CardContent>
          <AustraliaMap
            stateStats={stateStats}
            onStateClick={handleStateSelect}
            selectedState={selectedState}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>Dealer Show Connections</CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                通过 <code>showDealerMappings</code> 匹配经销商 slug 与 show 记录，并展示对应的展会时间。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={dealerSlugFilter}
                  onChange={(event) => setDealerSlugFilter(event.target.value)}
                  placeholder="输入 dealer slug，如 dealer"
                  className="pl-9"
                />
              </div>
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                {dealerShows.length} shows
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showDealerLoading ? (
            <div className="py-8 text-sm text-gray-600">载入 show-dealer 映射数据中...</div>
          ) : showDealerError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {showDealerError}
            </div>
          ) : dealerShows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              当前 slug 没有关联的 show，试试其他筛选关键词。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dealerShows.map(({ mapping, show }) => {
                const location = [show.siteLocation?.suburb, show.siteLocation?.state]
                  .map((value) => value?.trim())
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={`${mapping.id}-${show.id ?? show.name}`}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-gray-900">{show.name || 'Unnamed Show'}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            {mapping.dealerSlug || 'dealer'}
                          </Badge>
                          {show.dealership && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                              {show.dealership}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                        Linked
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-gray-400" />
                        <span>
                          {formatDate(show.startDate)} — {formatDate(show.finishDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span>{location || 'Location N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>
                Shows in {selectedState === 'All' ? 'All Regions' : selectedState}
              </CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Select a row to view detailed information about each show.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search shows..."
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                {searchSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
                    {searchSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => setSearchTerm(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortKey(sortKey === 'name' ? 'startDate' : 'name')}
                >
                  {sortKey === 'name' ? 'Sort by Date' : 'Sort by Name'}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  aria-label="Toggle sort direction"
                >
                  {sortDirection === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sortedShows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Show</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Sales 2025</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedShows.map((show) => {
                  const state = normaliseState(show.siteLocation?.state);
                  const locationParts = [
                    show.siteLocation?.suburb?.trim(),
                    state || undefined,
                  ].filter(Boolean);
                  const sales = parseMetric(show.sales2025);
                  const target = parseMetric(show.target2025);
                  const duration = parseMetric(show.showDuration);

                  const statusVariant =
                    show.status === 'Finished'
                      ? 'default'
                      : show.status === 'In Progress'
                        ? 'secondary'
                        : 'outline';

                  return (
                    <TableRow
                      key={show.id}
                      className="cursor-pointer transition hover:bg-slate-50"
                      onClick={() => handleRowClick(show.id)}
                    >
                      <TableCell>
                        <div className="font-medium text-gray-900">{show.name || 'Unnamed Show'}</div>
                        <div className="text-xs text-gray-500">{show.dealership || 'N/A'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span>{locationParts.length > 0 ? locationParts.join(', ') : 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-gray-900">
                          {formatDate(show.startDate)} - {formatDate(show.finishDate)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {duration > 0 ? `${duration} days` : 'Duration N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(sales)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Target: {formatNumber(target)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant}>{show.status || 'Unknown'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteShow(show.id, show.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500">
              No shows found for {selectedState === 'All' ? 'any region' : selectedState}.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
