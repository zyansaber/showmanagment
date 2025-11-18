import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AustraliaMap from '@/components/AustraliaMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, MapPin, Trash2, Upload } from 'lucide-react';
import { dbGet, dbRemove, dbUpdate } from '@/lib/firebase';
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

  const filteredShows = useMemo(() => {
    if (selectedState === 'All') return validShows;
    return validShows.filter(
      (show) => normaliseState(show.siteLocation?.state) === selectedState
    );
  }, [validShows, selectedState]);

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
    'Status',
    'Team Members (semicolon separated)',
    'BI URL',
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
        show.status,
        Array.isArray(show.teamMembers) ? show.teamMembers.join(';') : '',
        show.biUrl,
      ]);

      const csvContent = [
        csvHeaders.map(escapeCsvValue).join(','),
        ...rows.map((row) => row.map(escapeCsvValue).join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shows.xlsx';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Excel 导出完成（以 CSV 形式，Excel 可直接打开）');
    } catch (err) {
      console.error('Error exporting shows:', err);
      toast.error('导出失败，请稍后重试');
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

  const applyCsvUpdate = async (file: File) => {
    setIsImporting(true);

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        toast.error('文件内容为空或格式不正确');
        return;
      }

      const header = parseCsvLine(lines[0]);
      const missingHeaders = csvHeaders.filter((expected) => !header.includes(expected));

      if (missingHeaders.length > 0) {
        toast.error('文件头部缺失必要字段，请使用导出的模板进行修改');
        return;
      }

      const existingShows = new Map(shows.map((show) => [show.id, show]));
      const updatedShows: Show[] = [];
      const failedIds: string[] = [];

      const headerIndex = Object.fromEntries(header.map((title, idx) => [title, idx]));

      const updates = lines.slice(1).map((line) => parseCsvLine(line)).filter((cells) => cells.length > 1);

      for (const cells of updates) {
        const id = cells[headerIndex['ID']];
        if (!id) continue;

        const existing = existingShows.get(id);
        if (!existing) {
          failedIds.push(id);
          continue;
        }

        const teamMembersCell = cells[headerIndex['Team Members (semicolon separated)']];
        const updatedData: Show = {
          ...existing,
          id,
          name: cells[headerIndex['Name']] || existing.name,
          dealership: cells[headerIndex['Dealership']] || existing.dealership,
          siteLocation: {
            ...existing.siteLocation,
            number: cells[headerIndex['Site Number']] || existing.siteLocation?.number || '',
            street: cells[headerIndex['Street']] || existing.siteLocation?.street || '',
            suburb: cells[headerIndex['Suburb']] || existing.siteLocation?.suburb || '',
            postcode: cells[headerIndex['Postcode']] || existing.siteLocation?.postcode || '',
            state: cells[headerIndex['State']] || existing.siteLocation?.state || '',
            country: cells[headerIndex['Country']] || existing.siteLocation?.country || '',
          },
          startDate: cells[headerIndex['Start Date']] || existing.startDate,
          finishDate: cells[headerIndex['Finish Date']] || existing.finishDate,
          showDuration: parseNumberCell(cells[headerIndex['Show Duration']]) ?? existing.showDuration,
          target2024: parseNumberCell(cells[headerIndex['Target 2024']]) ?? existing.target2024,
          sales2024: parseNumberCell(cells[headerIndex['Sales 2024']]) ?? existing.sales2024,
          target2025: parseNumberCell(cells[headerIndex['Target 2025']]) ?? existing.target2025,
          sales2025: parseNumberCell(cells[headerIndex['Sales 2025']]) ?? existing.sales2025,
          target2026: parseNumberCell(cells[headerIndex['Target 2026']]) ?? existing.target2026,
          sales2026: parseNumberCell(cells[headerIndex['Sales 2026']]) ?? existing.sales2026,
          eventOrganiser: cells[headerIndex['Event Organiser']] || existing.eventOrganiser,
          caravansOnDisplay:
            parseNumberCell(cells[headerIndex['Caravans On Display']]) ?? existing.caravansOnDisplay,
          standSize: cells[headerIndex['Stand Size']] || existing.standSize,
          layoutAddress: cells[headerIndex['Layout Address']] || existing.layoutAddress,
          status: (cells[headerIndex['Status']] as Show['status']) || existing.status,
          teamMembers:
            teamMembersCell?.split(';').map((member) => member.trim()).filter(Boolean) || existing.teamMembers,
          biUrl: cells[headerIndex['BI URL']] || existing.biUrl,
        };

        await dbUpdate(`shows/${id}`, updatedData as unknown as Record<string, unknown>);
        updatedShows.push(updatedData);
        existingShows.set(id, updatedData);
      }

      if (updatedShows.length > 0) {
        setShows(Array.from(existingShows.values()));
        toast.success(`成功更新 ${updatedShows.length} 条记录`);
      } else {
        toast.info('没有可更新的记录');
      }

      if (failedIds.length > 0) {
        toast.warning(`以下 ID 未找到，未被更新：${failedIds.join(', ')}`);
      }
    } catch (err) {
      console.error('Error importing CSV:', err);
      toast.error('上传或解析文件失败，请确认格式正确');
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
              <Button variant="outline" size="sm" onClick={handleDownloadCsv} disabled={isExporting}>
                <Download className="mr-2 h-4 w-4" /> 导出 Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={isImporting}>
                <Upload className="mr-2 h-4 w-4" /> 导入并覆盖
              </Button>
              {selectedState !== 'All' && (
                <Button variant="outline" size="sm" onClick={() => setSelectedState('All')}>
                  Clear selection
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            下载后仅修改第二列开始的数据，请保持 ID 列不变。上传 CSV（Excel 另存为 CSV）后，将按 ID 覆盖对应记录。
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
              <CardTitle>
                Shows in {selectedState === 'All' ? 'All Regions' : selectedState}
              </CardTitle>
              <p className="mt-1 text-sm text-gray-500">
                Select a row to view detailed information about each show.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredShows.length > 0 ? (
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
                {filteredShows.map((show) => {
                  const state = normaliseState(show.siteLocation?.state);
                  const locationParts = [
                    show.siteLocation?.suburb?.trim(),
                    state || undefined,
                  ].filter(Boolean);
                  const sales = parseMetric(show.sales2025);
                  const target = parseMetric(show.target2025);
                  const duration = parseMetric(show.showDuration);

                  const statusVariant =
                    show.status === 'Completed'
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

