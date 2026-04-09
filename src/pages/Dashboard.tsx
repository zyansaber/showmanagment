import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';
import { dbGet } from '@/lib/firebase';
import type { Show, ShowOrder, ShowTask, TeamMember } from '@/types';
import { format as formatDate } from 'date-fns';
import { Progress } from '@/components/ui/progress';

type InternalSalesOrderRecord = {
  showId: string;
  internalSalesOrderNumber?: string;
  internalSalesOrderNumberDealer?: string;
};

type FinanceLine = {
  aufnrNorm: string;
  glAccountNorm: string;
  companyCode: string;
  postingDate?: string;
  amount: number;
};

export default function Dashboard() {
  const [shows, setShows] = useState<Show[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrderRecord[]>([]);
  const [tasks, setTasks] = useState<ShowTask[]>([]);
  const [budgets, setBudgets] = useState<Record<string, Record<string, unknown>>>({});
  const [financeActuals, setFinanceActuals] = useState<Record<string, { dealer: number; factory: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showQ1Results, setShowQ1Results] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [showsData, membersData, ordersData, budgetsData, internalOrdersData, tasksData, financeData, expensesData] =
        await Promise.all([
          dbGet('shows'),
          dbGet('teamMembers'),
          dbGet('showOrders'),
          dbGet('showBudgets'),
          dbGet('finance/internalSalesOrders'),
          dbGet('showTasks'),
          dbGet('finance/glByAufnrGl'),
          dbGet('finance/expenses'),
        ]);

      const showList = showsData ? Object.values(showsData) : [];
      setShows(showList);
      setTeamMembers(membersData ? Object.values(membersData) : []);
      setOrders(ordersData ? Object.values(ordersData) : []);
      setBudgets(budgetsData ?? {});
      setInternalOrders(
        internalOrdersData
          ? Object.values(internalOrdersData as Record<string, InternalSalesOrderRecord>)
          : []
      );
      setTasks(tasksData ? Object.values(tasksData as Record<string, ShowTask>) : []);

      const showsById = showList.reduce((acc, show) => {
        if (show.id) acc[show.id] = show;
        return acc;
      }, {} as Record<string, Show>);
      const aufnrShowMap = buildAufnrShowMap(internalOrdersData, showsById);
      const financeLines = parseFinanceLines(financeData);
      const allowedGlCodes = new Set(
        expensesData
          ? Object.values(expensesData as Record<string, { glCode?: string }>)
              .map((item) => item?.glCode?.trim())
              .filter((gl): gl is string => Boolean(gl))
              .map((gl) => leadingZeroSafe(gl))
          : []
      );
      const actuals = financeLines.reduce((acc, line) => {
        if (!allowedGlCodes.has(line.glAccountNorm)) return acc;
        const mappedShow = aufnrShowMap[line.aufnrNorm];
        if (!mappedShow?.showId) return acc;
        const year = getYearFromDate(line.postingDate);
        if (year !== 2025) return acc;
        if (!acc[mappedShow.showId]) acc[mappedShow.showId] = { dealer: 0, factory: 0 };
        if (line.companyCode === '3120') acc[mappedShow.showId].dealer += line.amount;
        else if (line.companyCode === '3110') acc[mappedShow.showId].factory += line.amount;
        return acc;
      }, {} as Record<string, { dealer: number; factory: number }>);
      setFinanceActuals(actuals);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const parseNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return 0;
      const parsed = Number(trimmed.replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const computeDealerBudget = (entry: Record<string, unknown>) => {
    const total = parseNumber(entry.totalDealerCost);
    if (total > 0) return total;
    return (
      parseNumber(entry.standCosts) / 2 +
      parseNumber(entry.dealerDayRates) +
      parseNumber(entry.dealerCommission) +
      parseNumber(entry.dealerCostsTransport)
    );
  };

  const computeFactoryBudget = (entry: Record<string, unknown>) => {
    const total = parseNumber(entry.totalFactoryCosts ?? entry.totalFactoryCost);
    if (total > 0) return total;
    return parseNumber(entry.factoryCommission) + parseNumber(entry.factoryTravelCosts) + parseNumber(entry.standCosts) / 2;
  };

  const leadingZeroSafe = (value: unknown) => {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const asString = String(value);
    const stripped = asString.replace(/^0+/, '');
    return stripped.length > 0 ? stripped : asString;
  };

  const numberOrZero = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const parseFinanceLines = (data: unknown): FinanceLine[] => {
    if (!data || typeof data !== 'object') return [];
    const lines: FinanceLine[] = [];
    const root = data as Record<string, unknown>;

    Object.entries(root).forEach(([aufnrKey, glBuckets]) => {
      if (!glBuckets || typeof glBuckets !== 'object') return;
      const aufnrNorm = leadingZeroSafe(aufnrKey);

      Object.entries(glBuckets as Record<string, unknown>).forEach(([glKey, glValue]) => {
        if (!glValue || typeof glValue !== 'object') return;
        const glAccountNorm = leadingZeroSafe(glKey);
        const glBucket = glValue as Record<string, unknown>;
        if (!glBucket.lines || typeof glBucket.lines !== 'object') return;

        Object.values(glBucket.lines as Record<string, unknown>).forEach((rawLine) => {
          if (!rawLine || typeof rawLine !== 'object') return;
          const line = rawLine as Record<string, unknown>;
          lines.push({
            aufnrNorm,
            glAccountNorm,
            companyCode: typeof line.company_code === 'string' ? line.company_code : 'NA',
            postingDate: typeof line.posting_date === 'string' ? line.posting_date : undefined,
            amount: numberOrZero(line.amount),
          });
        });
      });
    });

    return lines;
  };

  const getYearFromDate = (value: string | undefined | null): number | null => {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})/);
    if (match?.[1]) {
      const year = Number(match[1]);
      return Number.isFinite(year) ? year : null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  };

  const buildAufnrShowMap = (
    internalOrders: unknown,
    showsById: Record<string, Show>
  ): Record<string, { showId: string; showName?: string }> => {
    const map: Record<string, { showId: string; showName?: string }> = {};
    if (!internalOrders || typeof internalOrders !== 'object') return map;

    Object.values(internalOrders as Record<string, Record<string, unknown>>).forEach((order) => {
      if (!order || typeof order !== 'object') return;
      const dealerNumber =
        typeof order.internalSalesOrderNumberDealer === 'string' ? order.internalSalesOrderNumberDealer.trim() : '';
      const internalNumber = typeof order.internalSalesOrderNumber === 'string' ? order.internalSalesOrderNumber.trim() : '';
      const showId = typeof order.showId === 'string' ? order.showId.trim() : '';
      if (!showId) return;
      const candidates = [dealerNumber, internalNumber].filter(Boolean);
      candidates.forEach((num) => {
        const norm = leadingZeroSafe(num);
        if (!norm) return;
        map[norm] = { showId, showName: showsById[showId]?.name };
      });
    });

    return map;
  };

  // Calculate employee statistics
  const buildMemberShowDaysList = (member: TeamMember) => {
    const rawDays = member.showDays;
    if (Array.isArray(rawDays)) {
      return rawDays
        .map((entry) => ({
          showId: typeof entry?.showId === 'string' ? entry.showId : '',
          days: typeof entry?.days === 'number' ? entry.days : Number(entry?.days),
        }))
        .filter((entry) => entry.showId && Number.isFinite(entry.days) && entry.days > 0);
    }
    if (rawDays && typeof rawDays === 'object') {
      return Object.entries(rawDays).reduce(
        (acc, [showId, days]) => {
          const numeric = typeof days === 'number' ? days : Number(days);
          if (Number.isFinite(numeric) && numeric > 0) {
            acc.push({ showId, days: numeric });
          }
          return acc;
        },
        [] as { showId: string; days: number }[]
      );
    }
    return [] as { showId: string; days: number }[];
  };

  const teamMemberDaysMap = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      const showDays = buildMemberShowDaysList(member);
      const totalDays = showDays.reduce((sum, entry) => sum + entry.days, 0);
      acc[member.memberName] = totalDays;
      return acc;
    }, {} as Record<string, number>);
  }, [teamMembers]);

  const salespersonStats = useMemo(() => {
    const orderStats = orders.reduce((acc, order) => {
      const name = typeof order.salesperson === 'string' ? order.salesperson.trim() : '';
      if (!name || name.toLowerCase() === 'n/a') return acc;
      if (!acc[name]) {
        acc[name] = { sales: 0 };
      }
      acc[name].sales += 1;
      return acc;
    }, {} as Record<string, { sales: number }>);

    const teamNames = teamMembers
      .filter((member) => member.activeFlag === 1)
      .map((member) => member.memberName)
      .filter((name): name is string => !!name && name.trim().length > 0);

    const allNames = new Set([...teamNames, ...Object.keys(orderStats)]);

    return Array.from(allNames).map((name) => {
      const sales = orderStats[name]?.sales || 0;
      return {
        name,
        sales,
        avgDaily: teamMemberDaysMap[name] > 0 ? Number((sales / teamMemberDaysMap[name]).toFixed(2)) : 0,
      };
    });
  }, [orders, teamMembers, teamMemberDaysMap]);

  const salespersonStatsByAvgDaily = useMemo(
    () => [...salespersonStats].sort((a, b) => b.avgDaily - a.avgDaily || b.sales - a.sales || a.name.localeCompare(b.name)),
    [salespersonStats]
  );

  const salespersonStatsBySales = useMemo(
    () => [...salespersonStats].sort((a, b) => b.sales - a.sales || b.avgDaily - a.avgDaily || a.name.localeCompare(b.name)),
    [salespersonStats]
  );

  // Calculate vehicle type distribution
  const vehicleTypes = orders.reduce((acc, order) => {
    const modelPrefix = order.model?.substring(0, 3).toUpperCase() || 'N/A';
    acc[modelPrefix] = (acc[modelPrefix] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const vehicleTypeData = Object.entries(vehicleTypes).map(([name, value], index) => ({
    name,
    value,
    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]
  }));

  const vehicleTrendMap = orders.reduce((acc, order) => {
    if (!order.date) return acc;
    const parsed = new Date(order.date);
    if (Number.isNaN(parsed.getTime())) return acc;
    const key = formatDate(parsed, 'yyyy-MM');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const vehicleTrendData = Object.entries(vehicleTrendMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      month: formatDate(new Date(`${key}-01`), 'MMM yyyy'),
      value,
    }));

  // Calculate show statistics by state (skip N/A values)
  const stateStats = shows.reduce((acc, show) => {
    const state = show.siteLocation?.state?.trim();
    if (!state) {
      return acc;
    }
    if (!acc[state]) {
      acc[state] = { shows: 0, totalSales: 0, totalDays: 0 };
    }
    acc[state].shows += 1;
    // Only add sales if not N/A (not 0)
    if (show.sales2025 > 0) {
      acc[state].totalSales += show.sales2025;
    }
    // Only add days if not N/A (not 0)
    if (show.showDuration && show.showDuration > 0) {
      acc[state].totalDays += show.showDuration;
    }
    return acc;
  }, {} as Record<string, { shows: number; totalSales: number; totalDays: number }>);

  const stateData = Object.entries(stateStats).map(([state, data]) => ({
    state,
    shows: data.shows,
    dailySales: data.totalDays > 0 ? (data.totalSales / data.totalDays).toFixed(2) : 0
  }));

  // Calculate overall statistics (skip N/A values)
  const getYear = (date?: string) => {
    if (!date) return null;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear();
  };

  const getShowYear = (show: Show) => {
    const startYear = getYear(show.startDate);
    if (startYear) return startYear;

    const finishYear = getYear(show.finishDate);
    if (finishYear) return finishYear;

    if (show.target2026 > 0) return 2026;
    if (show.target2025 > 0) return 2025;
    if (show.target2024 > 0) return 2024;
    return null;
  };

  const showsByYear = shows.reduce((acc, show) => {
    const year = getShowYear(show);
    if (!year) return acc;
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(show);
    return acc;
  }, {} as Record<number, Show[]>);

  const shows2026 = showsByYear[2026] || [];
  const shows2025 = showsByYear[2025] || [];

  const totalShows2026 = shows2026.length;
  const totalShows = shows.length;
  const completedShows = shows2026.filter(s => s.status === 'Completed').length;

  const showYearById = shows.reduce((acc, show) => {
    const year = getShowYear(show);
    if (year) {
      acc[show.id] = year;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalSales2026 = orders.reduce((sum, order) => {
    const year = showYearById[order.showId];
    return year === 2026 ? sum + 1 : sum;
  }, 0);

  // Only sum non-zero (non-N/A) values
  const target2026 = shows2026.reduce((sum, s) => sum + (s.target2026 > 0 ? s.target2026 : 0), 0);
  const totalSales2025 = shows.reduce((sum, s) => sum + (s.sales2025 > 0 ? s.sales2025 : 0), 0);
  const target2025 = shows2025.reduce((sum, s) => sum + (s.target2025 > 0 ? s.target2025 : 0), 0);
  const totalSales2024 = shows.reduce((sum, s) => sum + (s.sales2024 > 0 ? s.sales2024 : 0), 0);
  const target2024 = shows.reduce((sum, s) => sum + (s.target2024 > 0 ? s.target2024 : 0), 0);

  const completedShowIds = new Set(shows2026.filter(show => show.status === 'Completed').map(show => show.id));
  const completedShowOrders = orders.filter(order => completedShowIds.has(order.showId));
  const completedShowTarget2026 = shows2026.reduce(
    (sum, show) => sum + (show.status === 'Completed' && show.target2026 > 0 ? show.target2026 : 0),
    0
  );
  const completedAchievement = completedShowTarget2026 > 0
    ? Math.round((completedShowOrders.length / completedShowTarget2026) * 100)
    : 0;
  const overallAchievement = target2026 > 0 ? Math.round((totalSales2026 / target2026) * 100) : 0;
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const isQ1Date = (value?: string) => {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    const month = parsed.getMonth();
    return month >= 0 && month <= 2;
  };

  const getCompletedShowYear = (show: Show) => {
    const completedDate = show.finishDate || show.startDate;
    if (!completedDate) return null;
    const parsed = new Date(completedDate);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getFullYear();
  };

  const isAcceptedOrder = (order: ShowOrder) => {
    const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
    if (status === 'approved' || status === 'accepted' || status === 'confirmed') return true;
    return Boolean((order as ShowOrder & { dealerConfirm?: boolean }).dealerConfirm);
  };

  const getQ1CompletedShowIds = (year: number) =>
    new Set(
      shows
        .filter((show) => {
          if (show.status !== 'Completed') return false;
          const completedDate = show.finishDate || show.startDate;
          if (!isQ1Date(completedDate)) return false;
          return getCompletedShowYear(show) === year;
        })
        .map((show) => show.id)
        .filter(Boolean)
    );

  const q1CompletedShowIdsCurrent = getQ1CompletedShowIds(currentYear);
  const q1CompletedShowIdsPrevious = getQ1CompletedShowIds(previousYear);

  const q1AcceptedOrdersCurrent = orders.filter(
    (order) => q1CompletedShowIdsCurrent.has(order.showId) && isAcceptedOrder(order)
  ).length;
  const q1AcceptedOrdersPrevious = orders.filter(
    (order) => q1CompletedShowIdsPrevious.has(order.showId) && isAcceptedOrder(order)
  ).length;
  const q1YoYGrowth = q1AcceptedOrdersPrevious > 0
    ? ((q1AcceptedOrdersCurrent - q1AcceptedOrdersPrevious) / q1AcceptedOrdersPrevious) * 100
    : null;

  const stats = [
    {
      title: 'Total Shows 2026',
      value: totalShows2026.toString(),
      description: `${completedShows} completed`,
      icon: Calendar,
      color: 'text-blue-600',
    },
    {
      title: 'Total Sales 2025',
      value: totalSales2025.toString(),
      description: `Target: ${target2025}`,
      icon: TrendingUp,
      color: 'text-purple-600',
    },
  ];

  const gaugePercent = target2026 > 0 ? Math.round((totalSales2026 / target2026) * 100) : 0;
  const ytdPercent = target2026 > 0 ? Math.round((completedShowTarget2026 / target2026) * 100) : 0;

  const formatNumber = (value: number) => value.toLocaleString();
  const formatCurrency = (value: number) => `$${value.toLocaleString('en-AU')}`;
  const calculatePercent = (actual: number, target: number) => {
    if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
    return Math.round((actual / target) * 100);
  };

  const getRingStyle = (percent: number, color: string) => {
    const safePercent = Math.min(Math.max(percent, 0), 100);
    return {
      background: `conic-gradient(${color} ${safePercent}%, #e5e7eb ${safePercent}% 100%)`,
    };
  };

  const metricHighlights = [
    {
      label: 'Total Target 2026',
      value: target2026,
      helper: 'Overall annual target',
      accent: 'bg-slate-100 text-slate-700',
    },
    {
      label: 'Completed Show Targets (YTD)',
      value: completedShowTarget2026,
      helper: `${completedShows} completed shows`,
      accent: 'bg-blue-50 text-blue-700',
      pill: `${ytdPercent}% of annual target`,
    },
    {
      label: 'Sales to Date',
      value: totalSales2026,
      helper: `${totalSales2026.toLocaleString()} orders placed`,
      accent: 'bg-emerald-50 text-emerald-700',
      pill: `${gaugePercent}% of annual target`,
    },
  ];

  const timelineShows = useMemo(() => {
    const safeDate = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const now = new Date();
    const enriched = shows
      .map((show) => ({
        ...show,
        start: safeDate(show.startDate),
        finish: safeDate(show.finishDate),
      }))
      .filter((entry) => entry.start || entry.finish);

    const ongoing = enriched
      .filter((entry) => {
        const start = entry.start?.getTime() ?? -Infinity;
        const finish = entry.finish?.getTime() ?? Infinity;
        return start <= now.getTime() && now.getTime() <= finish;
      })
      .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

    const upcoming = enriched
      .filter((entry) => (entry.start?.getTime() ?? Infinity) >= now.getTime())
      .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));

    const completed = enriched
      .filter((entry) => (entry.finish?.getTime() ?? entry.start?.getTime() ?? 0) < now.getTime())
      .sort(
        (a, b) =>
          (b.finish?.getTime() ?? b.start?.getTime() ?? 0) - (a.finish?.getTime() ?? a.start?.getTime() ?? 0)
      );

    return {
      currentShow: ongoing[0] || upcoming[0] || null,
      lastShow: completed[0] || null,
    };
  }, [shows]);

  const buildShowSnapshot = (showEntry: (Show & { start?: Date | null; finish?: Date | null }) | null) => {
    if (!showEntry) return null;
    const showBudget = (budgets?.[showEntry.id] as Record<string, unknown>) || {};
    const targetSales =
      showEntry.target2026 ||
      showEntry.target2025 ||
      showEntry.target2024 ||
      parseNumber((showBudget as Record<string, unknown>).salesTarget) ||
      0;
    const salesActual = orders.filter((order) => order.showId === showEntry.id).length;

    const dealerTarget = computeDealerBudget(showBudget);
    const factoryTarget = computeFactoryBudget(showBudget);
    const financeActual = financeActuals[showEntry.id];
    const dealerActual = numberOrZero(financeActual?.dealer ?? showBudget.dealerActual);
    const factoryActual = numberOrZero(financeActual?.factory ?? showBudget.factoryActual);
    const internalOrder = internalOrders.find((order) => order.showId === showEntry.id);
    const taskSummary = taskCompletionByShow[showEntry.id];
    const teamMemberCount = Array.isArray(showEntry.teamMembers)
      ? showEntry.teamMembers.filter(Boolean).length
      : 0;

    const startLabel = showEntry.start
      ? formatDate(showEntry.start, 'dd MMM yyyy')
      : showEntry.startDate
        ? showEntry.startDate
        : 'TBC';
    const endLabel = showEntry.finish ? formatDate(showEntry.finish, 'dd MMM yyyy') : showEntry.finishDate || 'TBC';

    return {
      id: showEntry.id,
      name: showEntry.name || 'Unnamed show',
      dealership: showEntry.dealership || '',
      startLabel,
      endLabel,
      salesActual,
      targetSales,
      dealerActual,
      dealerTarget,
      factoryActual,
      factoryTarget,
      internalSalesOrderNumber: internalOrder?.internalSalesOrderNumber || '',
      internalSalesOrderNumberDealer: internalOrder?.internalSalesOrderNumberDealer || '',
      taskCompletion: taskSummary && taskSummary.total > 0
        ? {
            completed: taskSummary.completed,
            total: taskSummary.total,
            percent: Math.round((taskSummary.completed / taskSummary.total) * 100),
          }
        : null,
      teamMemberCount,
    };
  };

  const taskCompletionByShow = useMemo(() => {
    return tasks.reduce((acc, task) => {
      const eventId = typeof task.eventId === 'string' ? task.eventId.trim() : '';
      if (!eventId) return acc;
      if (!acc[eventId]) acc[eventId] = { completed: 0, total: 0 };
      acc[eventId].total += 1;
      if (task.status === 'Done') acc[eventId].completed += 1;
      return acc;
    }, {} as Record<string, { completed: number; total: number }>);
  }, [tasks]);

  const currentShowSnapshot = useMemo(
    () => buildShowSnapshot(timelineShows.currentShow),
    [timelineShows, budgets, orders, internalOrders, taskCompletionByShow, teamMembers, financeActuals]
  );
  const lastShowSnapshot = useMemo(
    () => buildShowSnapshot(timelineShows.lastShow),
    [timelineShows, budgets, orders, internalOrders, taskCompletionByShow, teamMembers, financeActuals]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="hover:shadow-lg transition-shadow border-blue-100">
        <CardHeader>
          <CardTitle>Current and Last Show</CardTitle>
          <CardDescription>Quick pulse on the most recent shows with performance versus targets.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[
              { title: 'Current / Upcoming Show', data: currentShowSnapshot, tone: 'blue', isCurrent: true },
              { title: 'Last Completed Show', data: lastShowSnapshot, tone: 'emerald', isCurrent: false },
            ].map((entry) => (
              <Card key={entry.title} className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{entry.title}</span>
                    {entry.data ? (
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${entry.tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {entry.data.dealership || 'Show on deck'}
                      </span>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    {entry.data ? `${entry.data.startLabel} → ${entry.data.endLabel}` : 'No show available'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {entry.data ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">{entry.title}</p>
                        <p className="text-lg font-bold text-slate-900">{entry.data.name}</p>
                        <p className="text-xs text-slate-600">
                          {entry.data.startLabel} → {entry.data.endLabel}
                        </p>
                        {entry.isCurrent && entry.data.taskCompletion ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Tasks: {entry.data.taskCompletion.completed}/{entry.data.taskCompletion.total} (
                            {entry.data.taskCompletion.percent}%)
                          </div>
                        ) : null}
                        {(entry.data.internalSalesOrderNumber || entry.data.internalSalesOrderNumberDealer) && (
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {entry.data.internalSalesOrderNumber ? (
                              <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                                Internal Sales Order: {entry.data.internalSalesOrderNumber}
                              </span>
                            ) : null}
                            {entry.data.internalSalesOrderNumberDealer ? (
                              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                                Dealer Internal: {entry.data.internalSalesOrderNumberDealer}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Sales</p>
                            <p className="text-lg font-semibold text-slate-900">{formatNumber(entry.data.salesActual)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500">Target</p>
                            <p className="text-sm font-semibold text-blue-700">{formatNumber(entry.data.targetSales)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-slate-500">Team Members</p>
                            <p className="text-lg font-semibold text-slate-900">{entry.data.teamMemberCount}</p>
                          </div>
                          <div className="text-right text-xs text-slate-500">Assigned to this show</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          {
                            label: 'Dealer Cost',
                            actual: entry.data.dealerActual,
                            target: entry.data.dealerTarget,
                            textClass: 'text-amber-700',
                          },
                          {
                            label: 'Factory Cost',
                            actual: entry.data.factoryActual,
                            target: entry.data.factoryTarget,
                            textClass: 'text-indigo-700',
                          },
                        ].map((metric) => {
                          const percent = calculatePercent(metric.actual, metric.target);
                          const progressValue = Math.min(Math.max(percent, 0), 100);
                          return (
                            <div
                              key={metric.label}
                              className="rounded-lg border p-3 shadow-[0_1px_6px_rgba(0,0,0,0.04)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-500">{metric.label}</p>
                                  <p className={`text-lg font-bold ${metric.textClass}`}>
                                    {formatCurrency(Number.isFinite(metric.actual) ? metric.actual : 0)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[11px] text-slate-500">Target</p>
                                  <p className="text-sm font-semibold text-slate-800">
                                    {formatCurrency(Number.isFinite(metric.target) ? metric.target : 0)}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <Progress value={progressValue} className="h-2 flex-1 bg-slate-100" />
                                <span className="text-xs font-semibold text-slate-700">{percent}%</span>
                              </div>
                              <p className="text-[11px] text-slate-500">Actual vs target</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      No show data found. Add show dates to see live insights.
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Target Completion Gauge & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>2026 Target Completion</CardTitle>
            <CardDescription>
              Visual comparison between the overall 2026 target, completed-show targets (YTD), and sales achieved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
              <div className="relative mx-auto h-64 w-64">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-50 via-white to-slate-100 shadow-inner" />
                <div className="absolute inset-2 rounded-full border border-slate-200" />
                <div
                  className="absolute inset-3 rounded-full"
                  style={getRingStyle(ytdPercent, 'rgba(59, 130, 246, 0.45)')}
                />
                <div
                  className="absolute inset-6 rounded-full"
                  style={getRingStyle(gaugePercent, 'rgba(16, 185, 129, 0.65)')}
                />
                <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-white text-center shadow">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Sales Completion</p>
                  <p className="text-4xl font-bold text-gray-900">{gaugePercent}%</p>
                  <p className="text-xs text-gray-500">of {formatNumber(target2026)} target</p>
                </div>
                <div className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 gap-3 text-xs font-medium">
                  <span className="flex items-center gap-1 text-blue-700">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Completed targets
                  </span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Sales
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {metricHighlights.map((metric) => (
                  <div key={metric.label} className="rounded-lg border p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-600">{metric.label}</p>
                        <p className="text-2xl font-bold text-gray-900">{formatNumber(metric.value)}</p>
                        <p className="text-xs text-gray-500">{metric.helper}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${metric.accent}`}>
                        {metric.pill || 'Target detail'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
          {stats.map((stat, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="hover:shadow-lg transition-shadow border-slate-200">
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Q1 Show Conversion</CardTitle>
            <CardDescription>
              Compare accepted orders from completed Q1 shows between {currentYear} and {previousYear}.
            </CardDescription>
          </div>
          <Button onClick={() => setShowQ1Results((prev) => !prev)}>
            {showQ1Results ? 'Hide Results' : 'Show Results'}
          </Button>
        </CardHeader>
        {showQ1Results ? (
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>
              {currentYear}年Q1展会订单：{formatNumber(q1AcceptedOrdersCurrent)}台（来自 {q1CompletedShowIdsCurrent.size} 场展会）
            </p>
            <p>
              {previousYear}年同期：{formatNumber(q1AcceptedOrdersPrevious)}台
            </p>
            <p>
              同比增长：
              {q1YoYGrowth === null ? ' N/A（去年同期为0）' : ` ${q1YoYGrowth >= 0 ? '+' : ''}${q1YoYGrowth.toFixed(1)}%`}
            </p>
          </CardContent>
        ) : null}
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="employees" className="space-y-6">
        <TabsList className="bg-white">
          <TabsTrigger value="employees">Employee Performance</TabsTrigger>
          <TabsTrigger value="shows">Show Analytics</TabsTrigger>
          <TabsTrigger value="caravans">Caravan Distribution</TabsTrigger>
        </TabsList>

        {/* Employee Performance Tab */}
        <TabsContent value="employees" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Average Day Performance</CardTitle>
                <CardDescription>Average sales per active day (all salespeople)</CardDescription>
              </CardHeader>
              <CardContent>
                {salespersonStatsByAvgDaily.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salespersonStatsByAvgDaily}>
                      <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avgDaily" fill="#10b981" name="Avg Daily Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No sales data available</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Sales Performance</CardTitle>
                <CardDescription>Total sales counts by salesperson (all salespeople)</CardDescription>
              </CardHeader>
              <CardContent>
                {salespersonStatsBySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salespersonStatsBySales}>
                      <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="sales" fill="#f59e0b" name="Total Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No sales data available</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Show Analytics Tab */}
        <TabsContent value="shows" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shows by State</CardTitle>
              <CardDescription>Show count and daily sales performance by Australian state</CardDescription>
            </CardHeader>
            <CardContent>
              {stateData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={stateData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="state" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="shows" fill="#3b82f6" name="Number of Shows" />
                    <Bar yAxisId="right" dataKey="dailySales" fill="#10b981" name="Avg Daily Sales" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No show data available</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Target Achievement (YTD)</CardTitle>
              <CardDescription>
                Progress based on completed shows in 2026 compared to their targets and the overall annual target
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-gray-600">Completed Shows</p>
                  <p className="text-2xl font-bold text-gray-900">{completedShows}</p>
                  <p className="text-xs text-gray-500">Orders received: {completedShowOrders.length}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-gray-600">Completed Show Target</p>
                  <p className="text-2xl font-bold text-blue-600">{completedShowTarget2026}</p>
                  <p className="text-xs text-gray-500">Achievement: {completedAchievement}%</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-gray-600">Overall 2026 Target</p>
                  <p className="text-2xl font-bold text-green-600">{target2026}</p>
                  <p className="text-xs text-gray-500">Current achievement: {overallAchievement}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>2024 vs 2025 Target Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-600">2024 Target</p>
                      <p className="text-2xl font-bold text-gray-900">{target2024} units</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Achieved</p>
                      <p className="text-2xl font-bold text-green-600">{totalSales2024} units</p>
                      <p className="text-xs text-gray-500">
                        {target2024 > 0 ? `${Math.round((totalSales2024 / target2024) * 100)}%` : '0%'}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-600">2025 Target</p>
                      <p className="text-2xl font-bold text-gray-900">{target2025} units</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Current</p>
                      <p className="text-2xl font-bold text-blue-600">{totalSales2025} units</p>
                      <p className="text-xs text-gray-500">
                        {target2025 > 0 ? `${Math.round((totalSales2025 / target2025) * 100)}%` : '0%'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Show Status Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <span className="text-sm font-medium">Completed Shows</span>
                    <span className="text-lg font-bold text-green-600">{completedShows}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <span className="text-sm font-medium">In Progress</span>
                    <span className="text-lg font-bold text-blue-600">
                      {shows.filter(s => s.status === 'In Progress').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <span className="text-sm font-medium">Not Started</span>
                    <span className="text-lg font-bold text-orange-600">
                      {shows.filter(s => s.status === 'Not Started').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <span className="text-sm font-medium">Total Registered</span>
                      <span className="text-lg font-bold text-gray-900">{totalShows}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Vehicle Distribution Tab */}
        <TabsContent value="caravans" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Sales by Caravan Type</CardTitle>
                <CardDescription>Distribution based on chassis number prefix</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                {vehicleTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={vehicleTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {vehicleTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No vehicle data available</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Caravan Range Comparison</CardTitle>
                <CardDescription>Units sold per model range</CardDescription>
              </CardHeader>
              <CardContent>
                {vehicleTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={vehicleTypeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" name="Units">
                        {vehicleTypeData.map((entry, index) => (
                          <Cell key={`bar-${entry.name}-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No caravan data available</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">            
            <Card>
              <CardHeader>
                <CardTitle>Caravan Type Details</CardTitle>
              </CardHeader>
              <CardContent>
                {vehicleTypeData.length > 0 ? (
                  <div className="space-y-4">
                    {vehicleTypeData.map((vehicle) => (
                      <div key={vehicle.name} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: vehicle.color }}
                          />
                          <span className="font-medium">{vehicle.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{vehicle.value}</p>
                          <p className="text-xs text-gray-500">units sold</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">No caravan data available</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Trend</CardTitle>
                <CardDescription>Monthly order intake across all shows</CardDescription>
              </CardHeader>
              <CardContent>
                {vehicleTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={vehicleTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} name="Orders" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No order trend data available</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
