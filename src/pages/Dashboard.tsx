import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Show, ShowOrder, TeamMember } from '@/types';
import { format as formatDate } from 'date-fns';

export default function Dashboard() {
  const [shows, setShows] = useState<Show[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orders, setOrders] = useState<ShowOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [showsData, membersData, ordersData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('showOrders'),
      ]);

      setShows(showsData ? Object.values(showsData) : []);
      setTeamMembers(membersData ? Object.values(membersData) : []);
      setOrders(ordersData ? Object.values(ordersData) : []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate employee statistics
  const parseDaysFromEntry = (entry: string) => {
    const match = entry.match(/\((\d+)\)\s*days/i);
    return match ? Number.parseInt(match[1], 10) : 0;
  };

  const teamMemberDaysMap = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      const rawEntries = Array.isArray(member.showDayEntries) ? member.showDayEntries : [];
      const totalDays = rawEntries.reduce((sum, entry) => sum + parseDaysFromEntry(entry), 0);
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

    const withSales = Object.entries(orderStats)
      .map(([name, data]) => ({
        name,
        sales: data.sales,
        avgDaily:
          teamMemberDaysMap[name] > 0
            ? Number((data.sales / teamMemberDaysMap[name]).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.sales - a.sales);

    if (withSales.length >= 10) {
      return withSales.slice(0, 10);
    }

    const needed = 10 - withSales.length;
    const withSalesNames = new Set(withSales.map((entry) => entry.name));
    const fillNames = teamNames
      .filter((name) => !withSalesNames.has(name))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, needed);

    return [
      ...withSales,
      ...fillNames.map((name) => ({ name, sales: 0, avgDaily: 0 })),
    ];
  }, [orders, teamMembers, teamMemberDaysMap]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Main Content Tabs */}
      <Tabs defaultValue="employees" className="space-y-6">
        <TabsList className="bg-white">
          <TabsTrigger value="employees">Employee Performance</TabsTrigger>
          <TabsTrigger value="shows">Show Analytics</TabsTrigger>
          <TabsTrigger value="caravans">Caravan Distribution</TabsTrigger>
        </TabsList>

        {/* Employee Performance Tab */}
        <TabsContent value="employees" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Average Day Performance</CardTitle>
                <CardDescription>Average sales per active day (Top 10)</CardDescription>
              </CardHeader>
              <CardContent>
                {salespersonStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salespersonStats}>
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
                <CardDescription>Total sales counts by salesperson (Top 10)</CardDescription>
              </CardHeader>
              <CardContent>
                {salespersonStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={salespersonStats}>
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
