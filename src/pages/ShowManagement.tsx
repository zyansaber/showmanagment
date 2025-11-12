import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AustraliaMap from '@/components/AustraliaMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Trash2 } from 'lucide-react';
import { dbGet, dbRemove } from '@/lib/firebase';
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

  
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-600">
        Loading show data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            {selectedState !== 'All' && (
              <Button variant="outline" size="sm" onClick={() => setSelectedState('All')}>
                Clear selection
              </Button>
            )}
          </div>
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

