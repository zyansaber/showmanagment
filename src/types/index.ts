export type UserRole = 'Show Team' | 'Show Manager' | 'Headquarter Management';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface SiteLocation {
  number: string;
  street: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
}

export interface Show {
  id: string;
  name: string;
  siteLocation: SiteLocation;
  dealership: string;
  startDate: string;
  finishDate: string;
  showDuration?: number;
  target2024: number;
  sales2024: number;
  target2025: number;
  sales2025: number;
  target2026: number;
  sales2026: number;
  eventOrganiser: string;
  caravansOnDisplay: number;
  standSize: string;
  layoutAddress: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  teamMembers?: string[];
  biUrl?: string;
}

export interface TeamMember {
  memberId: string;
  memberName: string;
  role: UserRole;
  email: string;
  activeFlag: 0 | 1;
  totalSales?: number;
  totalWorkDays?: number;
}

export interface ShowOrder {
  id: string;
  showId: string;
  chassisNumber: string;
  orderType: 'New Order' | 'Transfer from Stock';
  salesperson: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
}

export interface ShowTask {
  taskId: string;
  eventId: string;
  taskName: string;
  responsiblePeople: string[];
  stage: 'Design' | 'Booking' | 'Logistics' | 'Marketing';
  status: 'Not Started' | 'In Progress' | 'Blocked' | 'Done';
  startDate: string;
  dueDate: string;
  percentComplete: number;
  costBudget: number;
  costActual: number;
  attachmentUrl: string;
  notes: string;
}

export interface ProcessTemplateTask {
  id: string;
  taskName: string;
  stage: ShowTask['stage'];
  durationDays: number;
  leadTimeDays: number;
  notes?: string;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description?: string;
  tasks: ProcessTemplateTask[];
}

export interface DashboardStats {
  totalShows: number;
  completedShows: number;
  totalSales: number;
  avgDailySales: number;
  topSalesperson: string;
  topSales: number;
}

export interface ScheduleOrder {
  Chassis: string;
  Customer: string;
  Dealer: string;
  'Forecast Production Date': string;
  Index1: number;
  Model: string;
  'Model Year': string;
  'Order Received Date': string;
  'Order Sent to Longtree': string;
  'Plans Sent to Dealer': string;
  'Price Date': string;
  'Purchase Order Sent': string;
  Rank1: number;
  Rank2: number;
  'Regent Production': string;
  'Request Delivery Date': string;
  Shipment: string;
  'Signed Plans Received': string;
}

export interface Dealership {
  name: string;
  orders: ScheduleOrder[];
}
