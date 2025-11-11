# Show Management System - Professional Sidebar Version

## Core Requirements (All Must Be Implemented)

### 1. Layout & Navigation
- Professional sidebar navigation with all menu items
- Responsive design with collapsible sidebar
- Clean, professional UI

### 2. Pages to Create (8 files max)
1. `src/App.tsx` - Main app with sidebar layout
2. `src/pages/Dashboard.tsx` - Employee & Show analytics dashboard
3. `src/pages/ShowCalendar.tsx` - Full calendar view with Australian map
4. `src/pages/ShowDetail.tsx` - Individual show management with orders & tasks
5. `src/pages/TeamManagement.tsx` - Admin panel for team member management
6. `src/pages/PowerBI.tsx` - Power BI report embedding
7. `src/lib/firebase.ts` - Firebase configuration with real data operations
8. `src/types/index.ts` - All TypeScript interfaces

### 3. Key Features (No Mock Data - Firebase Only)
- Firebase Realtime Database integration
- Role-based access control (Show Team, Show Manager, Headquarter Management)
- Full CRUD operations for Shows, Orders, Tasks, Team Members
- Approval workflow for orders
- Calendar with show schedule
- Australian map with state filtering
- Employee performance metrics
- Power BI embedding

### 4. Data Structure (Firebase Realtime Database)
- `/shows` - Show information
- `/teamMembers` - Team member data
- `/showOrders` - Order records
- `/showTasks` - Task tracking
- `/users` - User authentication and roles

## Implementation Priority
1. Read Firebase admin SDK file
2. Setup Firebase with real database operations
3. Create sidebar layout
4. Build Dashboard with real data
5. Build Calendar with full features
6. Build Show Detail page
7. Build Team Management
8. Build Power BI page