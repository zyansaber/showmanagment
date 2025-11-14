import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Calendar,
  Users,
  BarChart3,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ShowCalendar from './pages/ShowCalendar';
import ShowDetail from './pages/ShowDetail';
import ShowManagement from './pages/ShowManagement';
import TeamManagement from './pages/TeamManagement';
import PowerBI from './pages/PowerBI';
import DealershipManagement from './pages/DealershipManagement';
import ProcessTemplates from './pages/ProcessTemplates';
import OrdersAndSales from './pages/OrdersAndSales';
import ShowReport from './pages/ShowReport';

const queryClient = new QueryClient();

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Calendar, label: 'Show Calendar', path: '/calendar' },
    { icon: Briefcase, label: 'Show Management', path: '/shows' },
    { icon: FileSpreadsheet, label: 'Orders & Sales', path: '/orders' },
    { icon: ClipboardList, label: 'Process Templates', path: '/process-templates' },
    { icon: Building2, label: 'Dealership Management', path: '/dealerships' },
    { icon: Users, label: 'Team Management', path: '/team' },
    { icon: FileText, label: 'Show Report', path: '/show-report' },
    { icon: BarChart3, label: 'Power BI Reports', path: '/powerbi' },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64' : 'w-0 lg:w-20'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            {isOpen && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold">
                  S
                </div>
                <span className="font-bold text-lg">Show Manager</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="text-white hover:bg-slate-700 lg:hidden"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Button
                  key={item.path}
                  variant="ghost"
                  className={`
                    w-full justify-start gap-3 text-white hover:bg-slate-700
                    ${isActive ? 'bg-slate-700' : ''}
                    ${!isOpen ? 'lg:justify-center' : ''}
                  `}
                  onClick={() => {
                    navigate(item.path);
                    if (window.innerWidth < 1024) setIsOpen(false);
                  }}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {isOpen && <span className="text-sm leading-tight break-words">{item.label}</span>}
                </Button>
              );
            })}
          </nav>

          {/* Toggle button for desktop */}
          <div className="hidden lg:flex p-4 border-t border-slate-700">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="w-full text-white hover:bg-slate-700"
            >
              {isOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      
      {/* Main content */}
      <div
        className={`
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}
        `}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex-1 lg:ml-0 ml-4">
              <h1 className="text-xl font-bold text-gray-900">Caravan Show Management System</h1>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendar" element={<ShowCalendar />} />
            <Route path="/shows" element={<ShowManagement />} />
            <Route path="/show/:id" element={<ShowDetail />} />
            <Route path="/dealerships" element={<DealershipManagement />} />
            <Route path="/orders" element={<OrdersAndSales />} />
            <Route path="/process-templates" element={<ProcessTemplates />} />
            <Route path="/team" element={<TeamManagement />} />
            <Route path="/powerbi" element={<PowerBI />} />
            <Route path="/show-report" element={<ShowReport />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
