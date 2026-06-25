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
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  ClipboardList,
  FileSpreadsheet,
  Wallet,
  Banknote,
  Calculator,
  ListTree,
  Mail,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ShowCalendar from './pages/ShowCalendar';
import ShowDetail from './pages/ShowDetail';
import ShowManagement from './pages/ShowManagement';
import TeamManagement from './pages/TeamManagement';
import PowerBI from './pages/PowerBI';
import ProcessTemplates from './pages/ProcessTemplates';
import OrdersAndSales from './pages/OrdersAndSales';
import ShowBudgetExpense from './pages/ShowBudgetExpense';
import AIHelpAssistant from './components/AIHelpAssistant';
import Finance from './pages/Finance';
import FinanceDetail from './pages/FinanceDetail';
import Login from './pages/Login';
import AdminSettings from './pages/AdminSettings';
import BudgetSetting from './pages/BudgetSetting';
import ShowTeamAssignments from './pages/ShowTeamAssignments';
import EmailDigestCenter from './pages/EmailDigestCenter';
import ShowExcelList from './pages/ShowExcelList';
import TeamMemberProfile from './pages/TeamMemberProfile';
import TicketAndBooking from './pages/TicketAndBooking';
import EmailJsSettings from './pages/EmailJsSettings';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigate } from 'react-router-dom';

const queryClient = new QueryClient();

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuSections = [
    {
      title: 'Basic Show Info.',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Calendar, label: 'Show Calendar', path: '/calendar' },
        { icon: Briefcase, label: 'Show Management', path: '/shows' },
        { icon: FileSpreadsheet, label: 'Orders & Sales', path: '/orders' },
        { icon: Users, label: 'Show Team', path: '/show-team' },
        { icon: Mail, label: 'Confirmation Email', path: '/order-digest-mail', adminOnly: true },
        { icon: FileSpreadsheet, label: 'Ticket & Booking', path: '/ticket_and_booking' },
        { icon: Mail, label: 'EmailJS', path: '/emailjs', adminOnly: true },
      ],
    },
    {
      title: 'Finance',
      items: [
        { icon: Banknote, label: 'Finance Code', path: '/finance' },
        { icon: ListTree, label: 'Finance Detail', path: '/finance-detail' },
        { icon: Wallet, label: 'Finance Result', path: '/budget' },
        { icon: Calculator, label: 'Budget setting', path: '/budget-setting', adminOnly: true },
      ],
    },
    {
      title: 'Admin',
      items: [
        { icon: ClipboardList, label: 'Process Templates', path: '/process-templates' },
        { icon: Users, label: 'Team Management', path: '/team' },
        { icon: Users, label: 'Admin Settings', path: '/admin', adminOnly: true },
      ],
    },
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
            {menuSections.map((section, index) => (
              <div key={section.title ?? index} className="space-y-2">
                {section.title && isOpen && (
                  <p className="px-3 text-xs uppercase tracking-wide text-slate-400">{section.title}</p>
                )}
                {section.items.map((item) => {
                  if (item.adminOnly && user?.role !== 'admin') {
                    return null;
                  }
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
              </div>
            ))}
          </nav>

          <div className="px-4 pb-4">
            {isOpen && user && (
              <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200">
                Signed in as <span className="font-semibold">{user.username}</span>
              </div>
            )}
            {isOpen && user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
                className="mt-3 w-full justify-start text-white hover:bg-slate-700"
              >
                Logout
              </Button>
            )}
          </div>

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
  const { user, loading } = useAuth();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isStandaloneShowExcelPage = location.pathname === '/shows-excel';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  }

  if (!user && !isLoginPage) {
    return <Navigate to="/login" replace />;
  }

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    );
  }

  if (isStandaloneShowExcelPage) {
    return (
      <Routes>
        <Route
          path="/shows-excel"
          element={
            <ProtectedRoute>
              <ShowExcelList />
            </ProtectedRoute>
          }
        />
      </Routes>
    );
  }

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
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/calendar"
              element={
                <ProtectedRoute>
                  <ShowCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shows"
              element={
                <ProtectedRoute>
                  <ShowManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/show/:id"
              element={
                <ProtectedRoute>
                  <ShowDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <OrdersAndSales />
                </ProtectedRoute>
              }
            />
            <Route
              path="/process-templates"
              element={
                <ProtectedRoute>
                  <ProcessTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team"
              element={
                <ProtectedRoute>
                  <TeamManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team/:memberSlug"
              element={
                <ProtectedRoute>
                  <TeamMemberProfile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/powerbi"
              element={
                <ProtectedRoute>
                  <PowerBI />
                </ProtectedRoute>
              }
            />
            <Route
              path="/budget"
              element={
                <ProtectedRoute>
                  <ShowBudgetExpense />
                </ProtectedRoute>
              }
            />
            <Route
              path="/show-team"
              element={
                <ProtectedRoute>
                  <ShowTeamAssignments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance"
              element={
                <ProtectedRoute>
                  <Finance />
                </ProtectedRoute>
              }
            />
            <Route
              path="/finance-detail"
              element={
                <ProtectedRoute>
                  <FinanceDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/budget-setting"
              element={
                <ProtectedRoute requiredRole="admin">
                  <BudgetSetting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/order-digest-mail"
              element={
                <ProtectedRoute requiredRole="admin">
                  <EmailDigestCenter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticket_and_booking"
              element={
                <ProtectedRoute>
                  <TicketAndBooking />
                </ProtectedRoute>
              }
            />
            <Route
              path="/emailjs"
              element={
                <ProtectedRoute requiredRole="admin">
                  <EmailJsSettings />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
        <AIHelpAssistant />
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <AuthProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
