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
  PenTool,
  Wallet,
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ShowCalendar from './pages/ShowCalendar';
