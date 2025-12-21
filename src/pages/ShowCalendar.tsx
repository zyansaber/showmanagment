import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar as CalendarIcon, Users } from 'lucide-react';
import { format, parseISO, isValid, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { dbGet } from '@/lib/firebase';
import type { Show, ShowTask } from '@/types';
import AustraliaMap from '@/components/AustraliaMap';

export default function ShowCalendar() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [tasks, setTasks] = useState<ShowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string>('All');
  const [selectedDealership, setSelectedDealership] = useState<string>('All');
  const [taskDialogShowId, setTaskDialogShowId] = useState<string | null>(null);

  useEffect(() => {
    loadShows();
  }, []);

  const loadShows = async () => {
    try {
      const [showsData, tasksData] = await Promise.all([dbGet('shows'), dbGet('showTasks')]);
      setShows(showsData ? Object.values(showsData) : []);
      setTasks(tasksData ? Object.values(tasksData) : []);
    } catch (error) {
      console.error('Error loading shows:', error);
    } finally {
      setLoading(false);
    }
  };

  const stateColors: Record<string, string> = {
    NSW: 'bg-blue-500',
    VIC: 'bg-purple-500',
    QLD: 'bg-orange-500',
    WA: 'bg-green-500',
    SA: 'bg-red-500',
    TAS: 'bg-teal-500',
    NT: 'bg-yellow-500',
    ACT: 'bg-pink-500',
    NZ: 'bg-indigo-500',
  };

  const isValidDate = (dateString: string | undefined): boolean => {
    if (!dateString || typeof dateString !== 'string') return false;
    const trimmed = dateString.trim().toLowerCase();
    if (trimmed === 'n/a' || trimmed === '' || trimmed === 'na') return false;
    try {
      const parsed = parseISO(dateString);
      return isValid(parsed);
    } catch {
      return false;
    }
  };

  const isValidNumber = (value: number | string | undefined): boolean => {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === 'n/a' || trimmed === '' || trimmed === 'na') return false;
    }
    if (typeof value === 'number') {
      return value > 0 && isFinite(value);
    }
    const num = Number(value);
    return !isNaN(num) && num > 0 && isFinite(num);
  };

  const isValidState = (state: string | undefined): boolean => {
    if (!state || typeof state !== 'string') return false;
    const trimmed = state.trim().toLowerCase();
    return trimmed !== 'n/a' && trimmed !== '' && trimmed !== 'na';
  };

  const isValidLocation = (location: Show['siteLocation'] | undefined): boolean => {
    if (!location) return false;
    return isValidState(location.state) && 
           location.suburb && 
           typeof location.suburb === 'string' &&
           location.suburb.trim().toLowerCase() !== 'n/a' &&
           location.suburb.trim() !== '';
  };

  const formatValue = (value: number | undefined): string => {
    if (!value || value === 0) return 'N/A';
    return value.toString();
  };

  const getShowTimelineStatus = (show: Show) => {
    const now = new Date();
    const start = parseISO(show.startDate);
    const end = parseISO(show.finishDate);
    if (now < start) return 'Not Started';
    if (now > end) return 'Finished';
    return 'In Progress';
  };

  const validShows = shows.filter(show => {
    try {
      return show && 
             show.name &&
             isValidDate(show.startDate) && 
             isValidDate(show.finishDate) &&
             isValidLocation(show.siteLocation);
    } catch {
      return false;
    }
  });

  const dealershipOptions = useMemo(() => {
    const uniqueDealers = new Set(
      validShows
        .map((show) => (typeof show.dealership === 'string' ? show.dealership.trim() : ''))
        .filter((dealer) => dealer)
    );
    return ['All', ...Array.from(uniqueDealers).sort((a, b) => a.localeCompare(b))];
  }, [validShows]);

  const filteredShows = validShows.filter(show => {
    try {
      const matchesState = selectedState === 'All' || show.siteLocation?.state === selectedState;
      const dealerValue = typeof show.dealership === 'string' ? show.dealership.trim() : '';
      const matchesDealer = selectedDealership === 'All' || dealerValue === selectedDealership;
      const timelineStatus = getShowTimelineStatus(show);
      return matchesState && matchesDealer && timelineStatus !== 'Finished';
    } catch {
      return false;
    }
  });

  const sortedFilteredShows = useMemo(() => {
    return [...filteredShows].sort((a, b) => {
      const aDate = parseISO(a.startDate);
      const bDate = parseISO(b.startDate);
      return aDate.getTime() - bDate.getTime();
    });
  }, [filteredShows]);

  const showsOnDate = selectedDate
    ? filteredShows
        .filter(show => {
          try {
            const start = parseISO(show.startDate);
            const end = parseISO(show.finishDate);
            return selectedDate >= start && selectedDate <= end;
          } catch {
            return false;
          }
        })
        .sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime())
    : [];

  const displayedShows = selectedDate ? showsOnDate : sortedFilteredShows;

  const showTaskSummary = useMemo(() => {
    return tasks.reduce((acc, task) => {
      const eventId = typeof task.eventId === 'string' ? task.eventId.trim() : '';
      if (!eventId) return acc;
      if (!acc[eventId]) {
        acc[eventId] = { total: 0, completed: 0, percentSum: 0 };
      }
      const percent = Number(task.percentComplete || 0);
      acc[eventId].total += 1;
      acc[eventId].percentSum += Number.isFinite(percent) ? percent : 0;
      if (task.status === 'Done' || percent >= 100) {
        acc[eventId].completed += 1;
      }
      return acc;
    }, {} as Record<string, { total: number; completed: number; percentSum: number }>);
  }, [tasks]);

  const tasksByShow = useMemo(() => {
    return tasks.reduce((acc, task) => {
      const eventId = typeof task.eventId === 'string' ? task.eventId.trim() : '';
      if (!eventId) return acc;
      if (!acc[eventId]) acc[eventId] = [];
      acc[eventId].push(task);
      return acc;
    }, {} as Record<string, ShowTask[]>);
  }, [tasks]);

  const getTaskCompletion = (showId?: string) => {
    if (!showId) return null;
    const summary = showTaskSummary[showId];
    if (!summary || summary.total === 0) return null;
    const percent = Math.round(summary.percentSum / summary.total);
    return {
      percent,
      label: `${summary.completed}/${summary.total} tasks complete`,
    };
  };

  const activeShow = useMemo(
    () => shows.find((show) => show.id === taskDialogShowId) || null,
    [shows, taskDialogShowId]
  );
  const activeShowTasks = taskDialogShowId ? tasksByShow[taskDialogShowId] || [] : [];
  const sortedActiveShowTasks = useMemo(() => {
    return [...activeShowTasks].sort((a, b) => {
      const aDate = a.dueDate ? parseISO(a.dueDate) : null;
      const bDate = b.dueDate ? parseISO(b.dueDate) : null;
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return a.taskName.localeCompare(b.taskName);
    });
  }, [activeShowTasks]);

  const statusBadgeStyles: Record<string, string> = {
    'Not Started': 'bg-slate-100 text-slate-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    Finished: 'bg-emerald-100 text-emerald-700',
  };

  const stateStats = validShows.reduce((acc, show) => {
    try {
      const state = show.siteLocation?.state;
      if (!isValidState(state)) return acc;

      if (!acc[state]) {
        acc[state] = { shows: 0, totalSales: 0, totalDays: 0 };
      }
      acc[state].shows += 1;

      if (isValidNumber(show.sales2025)) {
        acc[state].totalSales += Number(show.sales2025);
      }

      if (show.showDuration && isValidNumber(show.showDuration)) {
        acc[state].totalDays += Number(show.showDuration);
      }
    } catch (error) {
      console.error('Error processing show stats:', error);
    }
    return acc;
  }, {} as Record<string, { shows: number; totalSales: number; totalDays: number }>);

  const mapStateStats = shows.reduce((acc, show) => {
    try {
      if (!isValidLocation(show.siteLocation)) return acc;
      const state = show.siteLocation?.state;
      if (!isValidState(state)) return acc;

      if (!acc[state]) {
        acc[state] = { shows: 0, totalSales: 0, totalDays: 0 };
      }

      acc[state].shows += 1;

      if (isValidNumber(show.sales2025)) {
        acc[state].totalSales += Number(show.sales2025);
      }

      if (show.showDuration && isValidNumber(show.showDuration)) {
        acc[state].totalDays += Number(show.showDuration);
      }
    } catch (error) {
      console.error('Error building map stats:', error);
    }

    return acc;
  }, {} as Record<string, { shows: number; totalSales: number; totalDays: number }>);

  const states = ['All', ...Object.keys(stateStats).sort()];

  // Generate calendar days
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const hasShowOnDate = (date: Date) => {
    return filteredShows.some(show => {
      try {
        const start = parseISO(show.startDate);
        const end = parseISO(show.finishDate);
        return date >= start && date <= end;
      } catch {
        return false;
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading show calendar...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Show Calendar & Map</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter by State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {states.map(state => (
                <Button
                  key={state}
                  variant={selectedState === state ? 'default' : 'outline'}
                  onClick={() => setSelectedState(state)}
                  className={selectedState === state && state !== 'All' ? stateColors[state] : ''}
                >
                  {state}
                  {state !== 'All' && stateStats[state] && (
                    <Badge variant="secondary" className="ml-2">
                      {stateStats[state].shows}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-700">Filter by Dealership</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {dealershipOptions.map((dealer) => (
                  <Button
                    key={dealer}
                    size="sm"
                    variant={selectedDealership === dealer ? 'default' : 'outline'}
                    onClick={() => setSelectedDealership(dealer)}
                  >
                    {dealer}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                >
                  →
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-600 py-2">
                  {day}
                </div>
              ))}

              {/* Empty cells for days before month starts */}
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}

              {/* Calendar days */}
              {daysInMonth.map(day => {
                const hasShow = hasShowOnDate(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      aspect-square flex items-center justify-center rounded-lg text-sm font-medium
                      transition-all duration-200
                      ${hasShow ? 'bg-blue-500 text-white hover:bg-blue-600' : 'hover:bg-gray-100'}
                      ${isSelected ? 'ring-2 ring-blue-700 ring-offset-2' : ''}
                    `}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              <h3 className="font-semibold text-sm">Legend</h3>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-blue-500" />
                <span className="text-xs">Show Date</span>
              </div>
            </div>

            {selectedDate && (
              <div className="mt-4 space-y-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-900">
                    {showsOnDate.length} show{showsOnDate.length === 1 ? '' : 's'} on {format(selectedDate, 'MMM dd, yyyy')}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedDate(null)}>
                  Clear date filter
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>
                {selectedDate
                  ? `Shows on ${format(selectedDate, 'MMM dd, yyyy')}${selectedState === 'All' ? '' : ` in ${selectedState}`}`
                  : selectedState === 'All'
                    ? 'NEXT SHOW'
                    : `Shows in ${selectedState}`}
              </CardTitle>
              {selectedDate && (
                <Badge variant="secondary" className="whitespace-nowrap">
                  {showsOnDate.length} selected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {displayedShows.length > 0 ? (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {displayedShows.map((show) => {
                  try {
                    const timelineStatus = getShowTimelineStatus(show);
                    return (
                      <div
                        key={show.id}
                        className="p-4 border rounded-lg hover:shadow-md transition-all cursor-pointer bg-white"
                        onClick={() => navigate(`/show/${show.id}`)}
                      >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex-1 space-y-3">
                          <div>
                            <h3 className="font-semibold text-lg text-gray-900">{show.name || 'Unnamed Show'}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <MapPin className="h-4 w-4 text-gray-500" />
                              <span className="text-sm text-gray-600">
                                {show.siteLocation?.suburb || 'Unknown'}, {show.siteLocation?.state || 'Unknown'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4" />
                              <span>
                                {format(parseISO(show.startDate), 'MMM dd')} - {format(parseISO(show.finishDate), 'MMM dd, yyyy')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span>{formatValue(show.caravansOnDisplay)} caravans</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-gray-500">
                              Sales: {formatValue(show.sales2025)}/{formatValue(show.target2025)}
                            </span>
                            <Badge className={statusBadgeStyles[timelineStatus] || 'bg-slate-100 text-slate-700'}>
                              {timelineStatus}
                            </Badge>
                          </div>
                          {(() => {
                            const completion = getTaskCompletion(show.id);
                            if (!completion) return null;
                            return (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTaskDialogShowId(show.id);
                                }}
                                className="w-full text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition hover:border-emerald-200 hover:bg-emerald-50"
                              >
                                <div className="flex items-center justify-between text-xs text-slate-600">
                                  <span>Show tasks completion</span>
                                  <span className="font-semibold text-slate-900">{completion.percent}%</span>
                                </div>
                                <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                                  <div
                                    className="h-2 rounded-full bg-emerald-500"
                                    style={{ width: `${completion.percent}%` }}
                                  />
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{completion.label}</p>
                              </button>
                            );
                          })()}
                        </div>
                        <div className="flex flex-col items-start gap-2 lg:items-end">
                          <Badge className={stateColors[show.siteLocation?.state] || 'bg-gray-500'}>
                            {show.siteLocation?.state || 'N/A'}
                          </Badge>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Dealership</p>
                            <p className="text-sm font-semibold text-slate-900">{show.dealership || 'N/A'}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
                            <p className="text-xs uppercase tracking-wide text-slate-400">Handover Dealer</p>
                            <p className="text-sm font-semibold text-slate-900">{show.handoverDealer || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                      </div>
                    );
                  } catch (error) {
                    console.error('Error rendering show:', error);
                    return null;
                  }
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                {selectedDate
                  ? `No shows found on ${format(selectedDate, 'MMM dd, yyyy')} ${selectedState === 'All' ? '' : `in ${selectedState}`}`
                  : `No shows found for ${selectedState === 'All' ? 'any state' : selectedState}`}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>Show Statistics by State</CardTitle>
            <p className="text-sm text-muted-foreground max-w-xl">
              Click on a state or New Zealand to focus the list above. The fill intensity reflects how many shows are
              recorded for that region.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <AustraliaMap
            stateStats={mapStateStats}
            onStateClick={(state) => setSelectedState(state)}
            selectedState={selectedState}
          />
        </CardContent>
      </Card>

      <Dialog
        open={!!taskDialogShowId}
        onOpenChange={(open) => {
          if (!open) setTaskDialogShowId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {activeShow?.name || 'Show Tasks'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {sortedActiveShowTasks.length} task{sortedActiveShowTasks.length === 1 ? '' : 's'} scheduled
            </div>
            {sortedActiveShowTasks.length > 0 ? (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {sortedActiveShowTasks.map((task) => (
                  <div key={task.taskId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{task.taskName}</p>
                        <p className="text-xs text-slate-500">{task.stage}</p>
                      </div>
                      <Badge className="bg-slate-100 text-slate-700">{task.status}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>Start: {task.startDate || 'TBD'}</span>
                      <span>Due: {task.dueDate || 'TBD'}</span>
                      <span>{Math.round(task.percentComplete || 0)}% complete</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(Math.max(task.percentComplete || 0, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                No tasks for this show yet.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
