import { useState, useEffect } from 'react';
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
import { Users, TrendingUp, Calendar, Target } from 'lucide-react';
import { dbGet } from '@/lib/firebase';
import type { Show, TeamMember, ShowOrder } from '@/types';
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
        dbGet('showOrders')
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
  const employeeStats = teamMembers
    .filter(m => m.activeFlag === 1)
    .map(member => {
      const memberOrders = orders.filter(o => o.salesperson === member.memberName);
      const workDays = member.totalWorkDays || 0;
      return {
        name: member.memberName,
        sales: memberOrders.length,
        workDays: workDays,
        avgDaily: workDays > 0 ? (memberOrders.length / workDays).toFixed(2) : 0
      };
    })
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  // Calculate vehicle type distribution
  const vehicleTypes = orders.reduce((acc, order) => {
    const chassis = order.chassisNumber || '';
    const type = chassis.substring(0, 3).toUpperCase() || 'N/A';
    acc[type] = (acc[type] || 0) + 1;
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
  const totalShows = shows.length;
  const completedShows = shows.filter(s => s.status === 'Completed').length;
  
  // Only sum non-zero (non-N/A) values
  const totalSales2025 = shows.reduce((sum, s) => sum + (s.sales2025 > 0 ? s.sales2025 : 0), 0);
  const target2025 = shows.reduce((sum, s) => sum + (s.target2025 > 0 ? s.target2025 : 0), 0);
  const totalSales2024 = shows.reduce((sum, s) => sum + (s.sales2024 > 0 ? s.sales2024 : 0), 0);
  const target2024 = shows.reduce((sum, s) => sum + (s.target2024 > 0 ? s.target2024 : 0), 0);

  const stats = [
    {
      title: 'Total Shows 2025',
      value: totalShows.toString(),
      description: `${completedShows} completed`,
      icon: Calendar,
      color: 'text-blue-600',
    },
    {
      title: 'Total Sales 2025',
      value: totalSales2025.toString(),
      description: `Target: ${target2025}`,
      icon: TrendingUp,
      color: 'text-green-600',
    },
    {
      title: 'Active Team Members',
      value: teamMembers.filter(m => m.activeFlag === 1).length.toString(),
      description: `${shows.filter(s => s.status === 'In Progress').length} shows in progress`,
      icon: Users,
      color: 'text-purple-600',
    },
    {
      title: 'Target Achievement',
      value: target2025 > 0 ? `${Math.round((totalSales2025 / target2025) * 100)}%` : '0%',
      description: `2025 target: ${target2025} units`,
      icon: Target,
      color: 'text-orange-600',
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Main Content Tabs */}
      <Tabs defaultValue="employees" className="space-y-6">
        <TabsList className="bg-white">
          <TabsTrigger value="employees">Employee Performance</TabsTrigger>
          <TabsTrigger value="shows">Show Analytics</TabsTrigger>
          <TabsTrigger value="caravans">Caravan Distribution</TabsTrigger>
        </TabsList>

        {/* Employee Performance Tab */}
        <TabsContent value="employees" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Sales Performance</CardTitle>
              <CardDescription>Employee sales ranking and statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {employeeStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={employeeStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sales" fill="#3b82f6" name="Total Sales" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No employee data available</div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Work Days Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {employeeStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={employeeStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="workDays" fill="#10b981" name="Work Days" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-gray-500">No work days data available</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Average Daily Sales</CardTitle>
              </CardHeader>
              <CardContent>
                {employeeStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={employeeStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="avgDaily" fill="#f59e0b" name="Avg Daily Sales" />
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
