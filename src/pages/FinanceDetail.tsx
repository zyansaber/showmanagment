
Update Finance page functionalities
12月31日
·
showmanagment
·
main
·
+1006
-117

归档

分享

创建拉取请求


在/finance也就是src/pages/Finance.tsx这里我需要做点更改，首先internal sales order 那里能够下载template，和现在数据，然后我修改完能上传，然后GL Account 那里不要分类Dealer Cost，Factory Cost，还是Factory Commissions了，这种分类不对，它不需要category，category就是现在的subcatergories，然后我将会把现在的数据库关于这个的都删掉，Stand Cost，Dealer Day Rates这些也不要默认，做到直接读数据，有什么读什么，新增按钮还是要在的
复制
Summary

Added spreadsheet export utilities to download an internal sales order template or current data alongside the existing upload flow in the finance dataset UI.

Simplified GL account management to treat the category field as the subcategory, removed seeded defaults, and present a single editable table driven solely by stored data with a streamlined add form.

Testing

✅ pnpm lint


文件 (1)
帮我新建一页叫做Finance Detail，然后帮我很好看的列表方式，要大小合适列出一下字段以及做filter和总和，字段A. 主表（按 AUFNR / GL 建表）

finance/glByAufnrGl/{aufnr_norm}/{gl_norm}/summary/{dimKey}

aufnr_norm：AUFNR 去前导0（例如 500439）

gl_norm：GL_ACCOUNT 去前导0（例如 4000）

dimKey：为了避免同一个 AUFNR+GL 在不同公司/年度/币种/VKORG 出现多行互相覆盖
形如：{COMPANY_CODE}_{FISCAL_YEAR}_{CURRENCY}_{VKORG}（没有值就用 NA）

每个 summary 行写入字段例子：

{
  "aufnr": "000000500439",
  "aufnr_norm": "500439",
  "gl_account_raw": "000000004000",
  "gl_account_norm": "4000",
  "company_code": "3110",
  "fiscal_year": 2025,
  "vkorg": "3110",
  "currency": "AUD",
  "net_amount": 123.45,
  "debit_amount": 200,
  "credit_amount": 76.55,
  "abs_amount": 276.55,
  "line_cnt": 12,
  "updated_at": "2025-12-30T10:12:30+11:00"
}

B. 明细行（line 级别，仍然挂在 AUFNR / GL 下）

finance/glByAufnrGl/{aufnr_norm}/{gl_norm}/lines/{lineId}

lineId：优先用 DOC_NO + LINE_NO + POSTING_DATE 组成稳定 key；如果缺字段就 fallback 用行号 hash，保证不冲突。

每条 line 至少包含（能组成 GL Amount 的关键字段 + 你要求的 SGTXT）：

AUFNR / GL_ACCOUNT

COMPANY_CODE / FISCAL_YEAR / VKORG / CURRENCY

POSTING_DATE / DOC_NO / LINE_NO / DC_IND

AMOUNT（以及我顺便写入 debit/credit/abs 方便你以后再汇总）

SGTXT

COST_CENTER / PROFIT_CENTER / REFERENCE（如果系统存在）3) 你以后“按 AUFNR + GL_ACCOUNT 建表”怎么读最简单？

例如你要取 AUFNR=500439 的所有 GL：

读：finance/glByAufnrGl/500439

子节点 key 就是 gl_norm（例如 4000、5110…）

每个 GL 下：

summary/{dimKey} 是汇总行（可能多行，按公司/年/币种/VKORG）

lines/{lineId} 是明细
复制
Summary

Added a Finance Detail page that normalizes finance/glByAufnrGl summaries and line items, supports AUFNR/GL/company/year/currency/VKORG and text filters, computes totals, and presents responsive summary and detail tables with SGTXT and reference context.

Wired the new Finance Detail experience into the navigation and routing alongside existing finance pages for easy access.

Testing

✅ pnpm lint


文件 (3)
index-CHE254ON.js:3579 Uncaught ReferenceError: aufnr is not defined
    at PVe (index-CHE254ON.js:3579:15657)
    at rA (index-CHE254ON.js:48:34174)
    at Sj (index-CHE254ON.js:48:62074)
    at r6 (index-CHE254ON.js:48:72534)
    at C6 (index-CHE254ON.js:48:106483)
    at PQ (index-CHE254ON.js:48:105545)
    at c1 (index-CHE254ON.js:48:105375)
    at _6 (index-CHE254ON.js:48:102495)
    at L6 (index-CHE254ON.js:48:113834)
    at MessagePort.L (index-CHE254ON.js:17:1544)？顺便帮我放到sidebar的finance底下
复制
Summary

Fixed Finance Detail page path examples to render literal placeholders and prevent runtime aufnr reference errors in the UI labels.

Finance Detail remains linked under the Finance section of the sidebar for easy navigation.

Testing

✅ pnpm lint


文件 (3)
很好，然后我希望首先credit 和net是负的都用红色加括号，然后debit和net是正的用绿色，然后AUFNR其实就是finance数据中internalSalesOrder下的ordernumber（dealer）的其中一个，所以做filter的时候最好去用showID去找showname，然后GL其实就是expenses下glcode的一个，然后yefilter的时候用这个，然后如果gl没有被glcode定义过，那么就写undefined glcode，然后最好写成这样，显示能选择show，然后GLcode做成不一样的card，并且注释gl的name，然后限制要Net，其他都不要显示再card，Company分成3110和3120两个filter card，然后点击card下面出明细
复制
Summary

Added show-aware and expense-aware context to Finance Detail, mapping AUFNR to internal sales order shows and GL codes to expense labels for clearer filters and labels.

Reworked filters to include show selection, GL code cards with names, company (3110/3120) cards, and text search, with a single net-focused stats card reflecting the current filter state.

Styled amounts so negative net/credit/debit values render red with parentheses and positives render green, while tables now show show names, GL names, and only the net metric in the summary grid to highlight requested fields.

Testing

✅ pnpm lint


文件 (3)
index-D5ygYkR6.js:3570 Uncaught Error: A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.
    at index-D5ygYkR6.js:3570:20046
    at rA (index-D5ygYkR6.js:48:34174)
    at xD (index-D5ygYkR6.js:48:60295)
    at n6 (index-D5ygYkR6.js:48:74552)
    at N6 (index-D5ygYkR6.js:48:106483)
    at OQ (index-D5ygYkR6.js:48:105545)
    at c1 (index-D5ygYkR6.js:48:105375)
    at S6 (index-D5ygYkR6.js:48:102495)
    at DD (index-D5ygYkR6.js:48:113955)
    at Ug (index-D5ygYkR6.js:48:112545)直接报错了
复制
Summary

Fixed Finance Detail’s show selector to use a non-empty default (“All”) and guard filters accordingly, preventing the Select runtime error and keeping filters consistent.

Testing

✅ pnpm lint


文件 (3)
How the lookup works today\nThe dashboard/finance data load fetches shows and builds a showLookup map keyed by show.id.\n\nWhen rendering Internal Sales Orders, each row uses showLookup[order.showId]?.name to display the show name for that order’s showId.\n\nHow to get the show name from your sample record\nGiven the internalSalesOrders entry:\n\ninternalSalesOrderNumber: 500439\n\ninternalSalesOrderNumberDealer: `` (empty)\n\nshowId: SHOW-1762752016907\n\nYou can:\n\nFind the matching internal order by internalSalesOrderNumber (or dealer number).\n\nRead its showId (SHOW-1762752016907).\n\nLook up showLookup[showId] to get the show’s name, e.g., “Crabourne Caravanning & Adventure Leisurefest” for show 368c70d6-f16a-41aa-a60e-8fb82044204e in your shows dataset.\n\nIf you want an explicit helper to search by internal order number (instead of manually filtering), I can add a small utility that:\n\nScans internalOrders for a matching internalSalesOrderNumber or internalSalesOrderNumberDealer.\n\nReturns { showId, showName } using the existing showLookup map.那我明明有为什么显示Unknown Show？而且我需要英语，不要用中文，然后标题company3110改成Factory Cost， Company3120改成dealercost
复制
Summary

Added a robust AUFNR-to-show mapping that searches both dealer and internal order numbers, ensuring Finance Detail resolves the correct show name instead of “Unknown Show.”

Kept the default show selector value non-empty to avoid Select runtime errors and clarified filter badges to reflect Factory Cost (3110) and Dealer Cost (3120).

Updated company filter cards to use Factory Cost/Dealer Cost labels while preserving net-focused summaries and styling.

Testing

✅ pnpm lint


文件 (3)
首先帮我做一个这个再finance-detail里面allshow的filter只给有finance记录glindexbyshow的show，其他不要有，然后需要从，glByAufnrGl\n500470\n500493\n688306\nlines\n5000001291_000001_20251205\nabs_amount\n:\n3280\namount\n:\n3280\naufnr\n:\n"000000500493"\naufnr_norm\n:\n"500493"\ncompany_code\n:\n"3120"\ncredit_amount\n:\n0\ncurrency\n:\n"AUD"\ndc_ind\n:\n"S"\ndebit_amount\n:\n3280\ndoc_no\n:\n"5000001291"\nfiscal_year\n:\n"2025"\ngl_account_norm\n:\n"688306"\ngl_account_raw\n:\n"0000688306"\nline_no\n:\n"000001"\nposting_date\n:\n"20251205"\nprofit_center\n:\n"0000310210"里面的fiscal_year做一个年份year的filter，然后帮我再line添加SFGTXT的关键字搜素
复制
Summary

Restricted the Finance Detail “All shows” list to only shows that have finance data, improving accuracy of the show filter options.

Added a fiscal year filter sourced from finance data and included SFGTXT in line-level text searches for more precise filtering.

Preserved company labels as Factory Cost (3110) and Dealer Cost (3120) and ensured filters reflect the selected labels across badges and cards.

Testing

✅ pnpm lint


文件 (3)
然后帮我做一个事情首先帮我对于SGTXT是GEELONG NOV 28/11/2025-30/11/2025 DAY RATE JOSH，这个取出最后两个单词作为名字，然后带有姓名，然后帮我提出所有SGTXT末尾两个单词是带有这个姓或者名，或者都带有的，然后做出小的card能够选择，然后因为都是expense账号，所有Credit都是绿色，Debit都是括号红色，amount也是正的括号红色，负的绿色，然后每个人的card点击再表格下方出一个总和
复制
Summary

Limited the Finance Detail show selector to only shows that have finance records, added fiscal-year filtering options sourced from finance data, and kept filters English-labeled.

Extracted person names from the last two words of SGTXT to build selectable person cards; selecting a person filters lines and displays per-person totals with expense-specific coloring below the table.

Updated line amount/debit/credit styling to treat credit as green, debit as red parentheses, and amounts with positive as red parentheses/negative green per expense rules, while preserving company labels Factory Cost and Dealer Cost.

Testing

✅ pnpm lint


文件 (3)
index-D--L7r5Z.js:3579 Uncaught ReferenceError: Cannot access 'V' before initialization
    at index-D--L7r5Z.js:3579:14264
    at Array.filter (<anonymous>)
    at index-D--L7r5Z.js:3579:14180
    at Object.IB [as useMemo] (index-D--L7r5Z.js:48:42745)
    at dt.useMemo (index-D--L7r5Z.js:25:7271)
    at kVe (index-D--L7r5Z.js:3579:14166)
    at iA (index-D--L7r5Z.js:48:34174)
    at _j (index-D--L7r5Z.js:48:62074)
    at s6 (index-D--L7r5Z.js:48:72534)
    at O6 (index-D--L7r5Z.js:48:106483)
复制
Summary

Stabilized Finance Detail constants/person filters to remove runtime initialization errors and ensure filtering remains consistent.

Kept person-based filtering and totals derived from the last two words of SGTXT while maintaining show/GL/company/year filters and finance-only show options.

Testing

✅ pnpm lint


文件 (3)
index-D5Jo4J8t.js:3579 Failed to load finance detail ReferenceError: extractPersonKey is not defined
    at index-D5Jo4J8t.js:3579:10795
    at Array.forEach (<anonymous>)
    at index-D5Jo4J8t.js:3579:9780
    at Array.forEach (<anonymous>)
    at index-D5Jo4J8t.js:3579:8723
    at Array.forEach (<anonymous>)
    at RVe (index-D5Jo4J8t.js:3579:8640)
    at j (index-D5Jo4J8t.js:3579:12656)为什么啊，Unable to load finance detail data. Please try again.之前还对的，就做一下filter怎么就废了
复制
Summary

Hoisted the extractPersonKey helper so it’s available during normalization, fixing the Finance Detail runtime error when loading finance data.

Testing

✅ pnpm lint


文件 (3)
只有gl是688304下面才用cards取名字
复制
Summary

Scoped person-card extraction to GL 688304 only and reset the person filter automatically when other GLs are chosen, preventing runtime errors and unintended filtering.

Testing

✅ pnpm lint


文件 (3)
帮我把Abs这列去掉然后帮我找到teamMembers这个数据集，然后找到teamMembers\n-OdfZ2qt05i1Ko3TAhe9\nactiveFlag\n:\n1\nemail\n:\n"yan@regentrv.com.au"\nmemberId\n:\n"TM-001"\nmemberName\n:\n"Zhihai Yan"\nrole\n:\n"Show Team"\nshowDaysSent\nshowDaysSentAt\n:\n"2025-12-23T01:50:02.580Z"\nshowDaysSentConfirmationId\n:\n"CNF-1766454601219-54FBCB44"\ntotalSales\n:\n0\ntotalWorkDays\n:\n0找到memberName的数据，然后把它做成cards，点击cards，无论名还是姓的关键词再SGTXT ，GL是688304的都会被显示
复制
Summary

Removed the Abs column and related calculations from Finance Detail line items to match the requested fields.

Added member-name filters driven by the teamMembers dataset; for GL 688304 you can select a member card and any line whose SGTXT contains that first or last name will display. Cards auto-reset when other GL codes are chosen.

Testing

✅ pnpm lint


文件 (3)
error during build:\n[vite:esbuild] Transform failed with 2 errors:\n/opt/render/project/src/src/pages/FinanceDetail.tsx:270:8: ERROR: The symbol "members" has already been declared\n/opt/render/project/src/src/pages/FinanceDetail.tsx:270:8: ERROR: The symbol "setMembers" has already been declared\nfile: /opt/render/project/src/src/pages/FinanceDetail.tsx:270:8\nThe symbol "members" has already been declared\n268|    const [memberFilter, setMemberFilter] = useState<string>(ALL_MEMBERS);\n269|    const [memberTokensLookup, setMemberTokensLookup] = useState<Record<string, string[]>>({});\n270|    const [members, setMembers] = useState<PersonOption[]>([]);\n   |          ^\n271|  \n272|    const loadData = async () => {\nThe symbol "setMembers" has already been declared\n268|    const [memberFilter, setMemberFilter] = useState<string>(ALL_MEMBERS);\n269|    const [memberTokensLookup, setMemberTokensLookup] = useState<Record<string, string[]>>({});\n270|    const [members, setMembers] = useState<PersonOption[]>([]);\n   |          ^\n271|  \n272|    const loadData = async () => {\n
复制
Summary

Removed the duplicate members state declaration in Finance Detail to resolve the build-time redeclaration error while keeping member-based filtering intact.

Testing

✅ pnpm lint


文件 (3)
找关键词啊，姓的关键词，名的关键词，姓名合起来，或者姓首字母，名首字母都要！！！
复制
Summary

Expanded team member name token generation to cover first name, last name, full name, and initials so GL 688304 filtering matches any of these keyword forms in SGTXT, improving card-based filtering accuracy.

Testing

✅ pnpm lint


文件 (3)
要做那种如果名字是John Koutsikas，那么Koutsikas也要就是其中一个关键词，也就是SGTXT含有Koutsikas，无论大小写都要列出来，这就是一个例子John也要，John Koutsikas也要
复制
Summary

Expanded member token matching for GL 688304 filters to normalize names (first, last, full, initials) with punctuation removed, ensuring case-insensitive matches like “Koutsikas,” or “JK.” are detected in SGTXT.

Testing

✅ pnpm lint


文件 (3)

src/App.tsx
+11
-0

src/pages/Finance.tsx
+150
-117

src/pages/FinanceDetail.tsx
新



差异
日志

src/App.tsx
+11
-0

import { useState } from 'react';
import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import {
import {
  LayoutDashboard,
  LayoutDashboard,
  Calendar,
  Calendar,
  Users,
  Users,
  BarChart3,
  BarChart3,
  Menu,
  Menu,
  X,
  X,
  ChevronLeft,
  ChevronLeft,
  ChevronRight,
  ChevronRight,
  Briefcase,
  Briefcase,
  ClipboardList,
  ClipboardList,
  FileSpreadsheet,
  FileSpreadsheet,
  FileText,
  FileText,
  PenTool,
  PenTool,
  Wallet,
  Wallet,
  Banknote,
  Banknote,
  Calculator,
  Calculator,
  ListTree,
} from 'lucide-react';
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Dashboard from './pages/Dashboard';
import ShowCalendar from './pages/ShowCalendar';
import ShowCalendar from './pages/ShowCalendar';
import ShowDetail from './pages/ShowDetail';
import ShowDetail from './pages/ShowDetail';
import ShowManagement from './pages/ShowManagement';
import ShowManagement from './pages/ShowManagement';
import ShowLayoutDesigner from './pages/ShowLayoutDesigner';
import ShowLayoutDesigner from './pages/ShowLayoutDesigner';
import TeamManagement from './pages/TeamManagement';
import TeamManagement from './pages/TeamManagement';
import PowerBI from './pages/PowerBI';
import PowerBI from './pages/PowerBI';
import ProcessTemplates from './pages/ProcessTemplates';
import ProcessTemplates from './pages/ProcessTemplates';
import OrdersAndSales from './pages/OrdersAndSales';
import OrdersAndSales from './pages/OrdersAndSales';
import ShowReport from './pages/ShowReport';
import ShowReport from './pages/ShowReport';
import ShowBudgetExpense from './pages/ShowBudgetExpense';
import ShowBudgetExpense from './pages/ShowBudgetExpense';
import AIHelpAssistant from './components/AIHelpAssistant';
import AIHelpAssistant from './components/AIHelpAssistant';
import Finance from './pages/Finance';
import Finance from './pages/Finance';
import FinanceDetail from './pages/FinanceDetail';
import Login from './pages/Login';
import Login from './pages/Login';
import AdminSettings from './pages/AdminSettings';
import AdminSettings from './pages/AdminSettings';
import BudgetSetting from './pages/BudgetSetting';
import BudgetSetting from './pages/BudgetSetting';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Navigate } from 'react-router-dom';


const queryClient = new QueryClient();
const queryClient = new QueryClient();


function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) {
  const navigate = useNavigate();
  const navigate = useNavigate();
  const location = useLocation();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { user, logout } = useAuth();


  const menuSections = [
  const menuSections = [
    {
    {
      title: 'Basic Show Info.',
      title: 'Basic Show Info.',
      items: [
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Calendar, label: 'Show Calendar', path: '/calendar' },
        { icon: Calendar, label: 'Show Calendar', path: '/calendar' },
        { icon: Briefcase, label: 'Show Management', path: '/shows' },
        { icon: Briefcase, label: 'Show Management', path: '/shows' },
        { icon: PenTool, label: 'Show Layout Studio', path: '/layout-studio' },
        { icon: PenTool, label: 'Show Layout Studio', path: '/layout-studio' },
        { icon: FileSpreadsheet, label: 'Orders & Sales', path: '/orders' },
        { icon: FileSpreadsheet, label: 'Orders & Sales', path: '/orders' },
        { icon: FileText, label: 'Show Report', path: '/show-report' },
        { icon: FileText, label: 'Show Report', path: '/show-report' },
        { icon: BarChart3, label: 'Power BI Reports', path: '/powerbi' },
        { icon: BarChart3, label: 'Power BI Reports', path: '/powerbi' },
      ],
      ],
    },
    },
    {
    {
      title: 'Finance',
      title: 'Finance',
      items: [
      items: [
        { icon: Banknote, label: 'Finance Code', path: '/finance' },
        { icon: Banknote, label: 'Finance Code', path: '/finance' },
        { icon: ListTree, label: 'Finance Detail', path: '/finance-detail' },
        { icon: Wallet, label: 'Finance Result', path: '/budget' },
        { icon: Wallet, label: 'Finance Result', path: '/budget' },
        { icon: Calculator, label: 'Budget setting', path: '/budget-setting', adminOnly: true },
        { icon: Calculator, label: 'Budget setting', path: '/budget-setting', adminOnly: true },
      ],
      ],
    },
    },
    {
    {
      title: 'Admin',
      title: 'Admin',
      items: [
      items: [
        { icon: ClipboardList, label: 'Process Templates', path: '/process-templates' },
        { icon: ClipboardList, label: 'Process Templates', path: '/process-templates' },
        { icon: Users, label: 'Team Management', path: '/team' },
        { icon: Users, label: 'Team Management', path: '/team' },
        { icon: Users, label: 'Admin Settings', path: '/admin', adminOnly: true },
        { icon: Users, label: 'Admin Settings', path: '/admin', adminOnly: true },
      ],
      ],
    },
    },
  ];
  ];




  return (
  return (
    <>
    <>
      {/* Mobile overlay */}
      {/* Mobile overlay */}
      {isOpen && (
      {isOpen && (
        <div 
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
          onClick={() => setIsOpen(false)}
        />
        />
      )}
      )}
      
      
@@ -321,50 +324,58 @@ function AppLayout() {
            />
            />
            <Route
            <Route
              path="/show-report"
              path="/show-report"
              element={
              element={
                <ProtectedRoute>
                <ProtectedRoute>
                  <ShowReport />
                  <ShowReport />
                </ProtectedRoute>
                </ProtectedRoute>
              }
              }
            />
            />
            <Route
            <Route
              path="/budget"
              path="/budget"
              element={
              element={
                <ProtectedRoute>
                <ProtectedRoute>
                  <ShowBudgetExpense />
                  <ShowBudgetExpense />
                </ProtectedRoute>
                </ProtectedRoute>
              }
              }
            />
            />
            <Route
            <Route
              path="/finance"
              path="/finance"
              element={
              element={
                <ProtectedRoute>
                <ProtectedRoute>
                  <Finance />
                  <Finance />
                </ProtectedRoute>
                </ProtectedRoute>
              }
              }
            />
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
            <Route
              path="/budget-setting"
              path="/budget-setting"
              element={
              element={
                <ProtectedRoute requiredRole="admin">
                <ProtectedRoute requiredRole="admin">
                  <BudgetSetting />
                  <BudgetSetting />
                </ProtectedRoute>
                </ProtectedRoute>
              }
              }
            />
            />
            <Route
            <Route
              path="/admin"
              path="/admin"
              element={
              element={
                <ProtectedRoute requiredRole="admin">
                <ProtectedRoute requiredRole="admin">
                  <AdminSettings />
                  <AdminSettings />
                </ProtectedRoute>
                </ProtectedRoute>
              }
              }
            />
            />
          </Routes>
          </Routes>
        </main>
        </main>
        <AIHelpAssistant />
        <AIHelpAssistant />
      </div>
      </div>
    </div>
    </div>
  );
  );
}
}


const App = () => (
const App = () => (
src/pages/Finance.tsx
+150
-117

import { useEffect, useMemo, useRef, useState } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { toast } from 'sonner';
import { Banknote, Loader2, Plus, Save, Upload, XCircle } from 'lucide-react';
import { Banknote, Loader2, Plus, Save, Upload, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dbGet, dbSet } from '@/lib/firebase';
import { dbGet, dbSet } from '@/lib/firebase';


type ExpenseCategory = 'Dealer Cost' | 'Factory Cost' | 'Factory Commissions';

type ShowRecord = {
type ShowRecord = {
  id?: string;
  id?: string;
  name?: string;
  name?: string;
  dealership?: string;
  dealership?: string;
  handoverDealer?: string;
  handoverDealer?: string;
};
};


type InternalSalesOrder = {
type InternalSalesOrder = {
  id: string;
  id: string;
  showId: string;
  showId: string;
  internalSalesOrderNumber: string;
  internalSalesOrderNumber: string;
  internalSalesOrderNumberDealer: string;
  internalSalesOrderNumberDealer: string;
  dealership: string;
  dealership: string;
};
};


type ExpenseItem = {
type ExpenseItem = {
  id: string;
  id: string;
  category: ExpenseCategory;
  category: string;
  name: string;
  glCode: string;
  glCode: string;
  contains?: string;
  contains?: string;
};
};


const DEFAULT_EXPENSE_ITEMS: ExpenseItem[] = [
  { id: 'dealer-stand-cost', category: 'Dealer Cost', name: 'Stand Cost', glCode: '', contains: '' },
  { id: 'dealer-day-rates', category: 'Dealer Cost', name: 'Dealer Day Rates', glCode: '', contains: '' },
  { id: 'dealer-commission', category: 'Dealer Cost', name: 'Dealer Commission', glCode: '', contains: '' },
  { id: 'dealer-transport', category: 'Dealer Cost', name: 'Dealer Costs Transport', glCode: '', contains: '' },
  { id: 'factory-cost', category: 'Factory Cost', name: 'Factory Cost', glCode: '', contains: '' },
  { id: 'factory-commissions', category: 'Factory Commissions', name: 'Factory Commissions', glCode: '', contains: '' },
];

const newId = () =>
const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `finance-${Date.now()}-${Math.random()}`;
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `finance-${Date.now()}-${Math.random()}`;


const normaliseShow = (value: unknown): ShowRecord | null => {
const normaliseShow = (value: unknown): ShowRecord | null => {
  if (!value || typeof value !== 'object') return null;
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : undefined;
  const dealership = typeof candidate.dealership === 'string' ? candidate.dealership.trim() : undefined;
  const dealership = typeof candidate.dealership === 'string' ? candidate.dealership.trim() : undefined;
  const handoverDealer = typeof candidate.handoverDealer === 'string' ? candidate.handoverDealer.trim() : undefined;
  const handoverDealer = typeof candidate.handoverDealer === 'string' ? candidate.handoverDealer.trim() : undefined;
  if (!id) return null;
  if (!id) return null;
  return { id, name, dealership, handoverDealer };
  return { id, name, dealership, handoverDealer };
};
};


const normaliseInternalOrders = (value: unknown): InternalSalesOrder[] => {
const normaliseInternalOrders = (value: unknown): InternalSalesOrder[] => {
  if (!value) return [];
  if (!value) return [];
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return records
  return records
    .map((item) => {
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const raw = item as Record<string, unknown>;
      const showId = typeof raw.showId === 'string' ? raw.showId.trim() : '';
      const showId = typeof raw.showId === 'string' ? raw.showId.trim() : '';
      if (!showId) return null;
      if (!showId) return null;
      const id =
      const id =
        typeof raw.id === 'string' && raw.id.trim().length > 0
        typeof raw.id === 'string' && raw.id.trim().length > 0
          ? raw.id.trim()
          ? raw.id.trim()
          : `order-${showId}-${Math.random().toString(16).slice(2)}`;
          : `order-${showId}-${Math.random().toString(16).slice(2)}`;
      const internalSalesOrderNumber =
      const internalSalesOrderNumber =
        typeof raw.internalSalesOrderNumber === 'string' ? raw.internalSalesOrderNumber.trim() : '';
        typeof raw.internalSalesOrderNumber === 'string' ? raw.internalSalesOrderNumber.trim() : '';
      const internalSalesOrderNumberDealer =
      const internalSalesOrderNumberDealer =
        typeof raw.internalSalesOrderNumberDealer === 'string' ? raw.internalSalesOrderNumberDealer.trim() : '';
        typeof raw.internalSalesOrderNumberDealer === 'string' ? raw.internalSalesOrderNumberDealer.trim() : '';
      const dealership = typeof raw.dealership === 'string' ? raw.dealership.trim() : '';
      const dealership = typeof raw.dealership === 'string' ? raw.dealership.trim() : '';
      return { id, showId, internalSalesOrderNumber, internalSalesOrderNumberDealer, dealership };
      return { id, showId, internalSalesOrderNumber, internalSalesOrderNumberDealer, dealership };
    })
    })
    .filter(Boolean) as InternalSalesOrder[];
    .filter(Boolean) as InternalSalesOrder[];
};
};


const normaliseExpenseItems = (value: unknown): ExpenseItem[] => {
const normaliseExpenseItems = (value: unknown): ExpenseItem[] => {
  if (!value) return [];
  if (!value) return [];
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  const records = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return records
  return records
    .map((item) => {
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const raw = item as Record<string, unknown>;
      const id =
      const id =
        typeof raw.id === 'string' && raw.id.trim().length > 0
        typeof raw.id === 'string' && raw.id.trim().length > 0
          ? raw.id.trim()
          ? raw.id.trim()
          : `expense-${Math.random().toString(16).slice(2)}`;
          : `expense-${Math.random().toString(16).slice(2)}`;
      const category =
      const categoryCandidate =
        raw.category === 'Dealer Cost' || raw.category === 'Factory Cost' || raw.category === 'Factory Commissions'
        typeof raw.category === 'string' && raw.category.trim().length > 0
          ? raw.category
          ? raw.category.trim()
          : 'Dealer Cost';
          : typeof raw.name === 'string' && raw.name.trim().length > 0
      const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : 'Unnamed Item';
            ? raw.name.trim()
            : '';
      const category = categoryCandidate || 'Uncategorised';
      const glCode = typeof raw.glCode === 'string' ? raw.glCode.trim() : '';
      const glCode = typeof raw.glCode === 'string' ? raw.glCode.trim() : '';
      const contains = typeof raw.contains === 'string' ? raw.contains.trim() : '';
      const contains = typeof raw.contains === 'string' ? raw.contains.trim() : '';
      return { id, category, name, glCode, contains };
      return { id, category, glCode, contains };
    })
    })
    .filter(Boolean) as ExpenseItem[];
    .filter(Boolean) as ExpenseItem[];
};
};


const loadXlsxModule = async () => {
const loadXlsxModule = async () => {
  try {
  try {
    const mod = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    const mod = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    return mod;
    return mod;
  } catch (err) {
  } catch (err) {
    console.error('Failed to load xlsx parser from CDN', err);
    console.error('Failed to load xlsx parser from CDN', err);
    return null;
    return null;
  }
  }
};
};


const parseSpreadsheetRows = async (file: File): Promise<Record<string, unknown>[]> => {
const parseSpreadsheetRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const buffer = await file.arrayBuffer();
  const buffer = await file.arrayBuffer();
  const xlsx = await loadXlsxModule();
  const xlsx = await loadXlsxModule();


  if (xlsx) {
  if (xlsx) {
    const workbook = xlsx.read(buffer, { type: 'array' });
    const workbook = xlsx.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheetName = workbook.SheetNames[0];
    if (sheetName) {
    if (sheetName) {
      const sheet = workbook.Sheets[sheetName];
      const sheet = workbook.Sheets[sheetName];
      return (xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]) ?? [];
      return (xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[]) ?? [];
    }
    }
@@ -131,86 +120,85 @@ const parseSpreadsheetRows = async (file: File): Promise<Record<string, unknown>
  const text = new TextDecoder().decode(buffer);
  const text = new TextDecoder().decode(buffer);
  const [headerRow, ...dataRows] = text
  const [headerRow, ...dataRows] = text
    .split(/\r?\n/)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.trim())
    .filter(Boolean);
    .filter(Boolean);


  if (!headerRow) return [];
  if (!headerRow) return [];


  const headers = headerRow.split(',').map((cell) => cell.trim());
  const headers = headerRow.split(',').map((cell) => cell.trim());
  return dataRows.map((row) => {
  return dataRows.map((row) => {
    const values = row.split(',').map((cell) => cell.trim());
    const values = row.split(',').map((cell) => cell.trim());
    const record: Record<string, string> = {};
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
      record[header] = values[index] ?? '';
    });
    });
    return record;
    return record;
  });
  });
};
};


const findMatchingShowDealer = (show: ShowRecord | undefined) => show?.handoverDealer || show?.dealership || '';
const findMatchingShowDealer = (show: ShowRecord | undefined) => show?.handoverDealer || show?.dealership || '';


export default function Finance() {
export default function Finance() {
  const [loading, setLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrder[]>([]);
  const [internalOrders, setInternalOrders] = useState<InternalSalesOrder[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>(DEFAULT_EXPENSE_ITEMS);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [savingOrders, setSavingOrders] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTable, setActiveTable] = useState<'orders' | 'expenses'>('orders');
  const [activeTable, setActiveTable] = useState<'orders' | 'expenses'>('orders');
  const [newExpense, setNewExpense] = useState<Pick<ExpenseItem, 'category' | 'name' | 'glCode' | 'contains'>>({
  const [newExpense, setNewExpense] = useState<Pick<ExpenseItem, 'category' | 'glCode' | 'contains'>>({
    category: 'Dealer Cost',
    category: '',
    name: '',
    glCode: '',
    glCode: '',
    contains: '',
    contains: '',
  });
  });


  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  useEffect(() => {
  useEffect(() => {
    const loadData = async () => {
    const loadData = async () => {
      try {
      try {
        setLoading(true);
        setLoading(true);
        const [showsData, ordersData, expensesData] = await Promise.all([
        const [showsData, ordersData, expensesData] = await Promise.all([
          dbGet('shows'),
          dbGet('shows'),
          dbGet('finance/internalSalesOrders'),
          dbGet('finance/internalSalesOrders'),
          dbGet('finance/expenses'),
          dbGet('finance/expenses'),
        ]);
        ]);


        const normalisedShows = showsData
        const normalisedShows = showsData
          ? Object.entries(showsData)
          ? Object.entries(showsData)
              .map(([key, value]) => normaliseShow({ id: key, ...(value as Record<string, unknown>) }))
              .map(([key, value]) => normaliseShow({ id: key, ...(value as Record<string, unknown>) }))
              .filter(Boolean) ?? []
              .filter(Boolean) ?? []
          : [];
          : [];


        setShows(normalisedShows as ShowRecord[]);
        setShows(normalisedShows as ShowRecord[]);
        setInternalOrders(normaliseInternalOrders(ordersData));
        setInternalOrders(normaliseInternalOrders(ordersData));


        const expenseList = normaliseExpenseItems(expensesData);
        const expenseList = normaliseExpenseItems(expensesData);
        setExpenses(expenseList.length > 0 ? expenseList : DEFAULT_EXPENSE_ITEMS);
        setExpenses(expenseList);


        setError(null);
        setError(null);
      } catch (err) {
      } catch (err) {
        console.error('Failed to load finance data', err);
        console.error('Failed to load finance data', err);
        setError('Unable to load finance data. Please try again.');
        setError('Unable to load finance data. Please try again.');
      } finally {
      } finally {
        setLoading(false);
        setLoading(false);
      }
      }
    };
    };


    loadData();
    loadData();
  }, []);
  }, []);


  const showLookup = useMemo(
  const showLookup = useMemo(
    () =>
    () =>
      shows.reduce((acc, show) => {
      shows.reduce((acc, show) => {
        if (show.id) {
        if (show.id) {
          acc[show.id] = show;
          acc[show.id] = show;
        }
        }
        return acc;
        return acc;
      }, {} as Record<string, ShowRecord>),
      }, {} as Record<string, ShowRecord>),
    [shows]
    [shows]
  );
  );


  const persistInternalOrders = async (orders: InternalSalesOrder[]) => {
  const persistInternalOrders = async (orders: InternalSalesOrder[]) => {
@@ -312,87 +300,144 @@ export default function Finance() {
            ...row,
            ...row,
            id: existing.id,
            id: existing.id,
          });
          });
        } else {
        } else {
          merged.push(row);
          merged.push(row);
        }
        }
      });
      });


      setInternalOrders(merged);
      setInternalOrders(merged);
      await persistInternalOrders(merged);
      await persistInternalOrders(merged);
      toast.success('Excel data imported into finance/internalSalesOrder.');
      toast.success('Excel data imported into finance/internalSalesOrder.');
    } catch (err) {
    } catch (err) {
      console.error('Failed to import internal sales orders', err);
      console.error('Failed to import internal sales orders', err);
      toast.error('Failed to import internal sales orders. Please check the file format.');
      toast.error('Failed to import internal sales orders. Please check the file format.');
    } finally {
    } finally {
      setImporting(false);
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    }
  };
  };


  const handleDeleteOrder = (id: string) => {
  const handleDeleteOrder = (id: string) => {
    setInternalOrders((prev) => prev.filter((order) => order.id !== id));
    setInternalOrders((prev) => prev.filter((order) => order.id !== id));
  };
  };


  const handleAddExpenseItem = () => {
  const handleAddExpenseItem = () => {
    if (!newExpense.name.trim()) {
    if (!newExpense.category.trim()) {
      toast.error('Please enter a subcategory name.');
      toast.error('Please enter a category.');
      return;
      return;
    }
    }
    setExpenses((prev) => [...prev, { ...newExpense, id: newId() }]);
    setExpenses((prev) => [...prev, { ...newExpense, id: newId() }]);
    setNewExpense({ category: 'Dealer Cost', name: '', glCode: '', contains: '' });
    setNewExpense({ category: '', glCode: '', contains: '' });
  };
  };


  const handleExpenseChange = (id: string, updates: Partial<ExpenseItem>) => {
  const handleExpenseChange = (id: string, updates: Partial<ExpenseItem>) => {
    setExpenses((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    setExpenses((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };
  };


  const handleDeleteExpense = (id: string) => {
  const handleDeleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((item) => item.id !== id));
    setExpenses((prev) => prev.filter((item) => item.id !== id));
  };
  };


  const handleSaveExpenses = async () => {
  const handleSaveExpenses = async () => {
    try {
    try {
      setSavingExpenses(true);
      setSavingExpenses(true);
      await persistExpenses(expenses);
      await persistExpenses(expenses);
      toast.success('Expense GL codes saved to finance dataset.');
      toast.success('Expense GL codes saved to finance dataset.');
    } catch (err) {
    } catch (err) {
      console.error('Failed to save expenses', err);
      console.error('Failed to save expenses', err);
      toast.error('Failed to save expense items.');
      toast.error('Failed to save expense items.');
    } finally {
    } finally {
      setSavingExpenses(false);
      setSavingExpenses(false);
    }
    }
  };
  };


  const groupedExpenses = useMemo(
  const exportSpreadsheet = async (rows: Record<string, unknown>[], fileName: string) => {
    () =>
    try {
      ['Dealer Cost', 'Factory Cost', 'Factory Commissions'].map((category) => ({
      const xlsx = await loadXlsxModule();
        category: category as ExpenseCategory,
      if (xlsx) {
        items: expenses.filter((item) => item.category === category),
        const worksheet = xlsx.utils.json_to_sheet(rows);
      })),
        const workbook = xlsx.utils.book_new();
    [expenses]
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  );
        const arrayBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([arrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const headers = Object.keys(rows[0] ?? {});
      const csvLines = [headers.join(',')];
      rows.forEach((row) => {
        csvLines.push(headers.map((header) => (row[header] ?? '').toString().replace(/,/g, '')).join(','));
      });
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName.replace(/\.xlsx$/, '.csv');
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export spreadsheet', err);
      toast.error('Failed to export spreadsheet.');
    }
  };

  const handleDownloadTemplate = async () => {
    const templateRows = [
      {
        'Show ID': 'ABC123',
        Dealership: 'Dealership Name',
        'Internal Sales Order Number': 'ISO-12345',
        'Internal Sales Order Number (Dealer)': 'ISO-Dealer-12345',
      },
    ];
    await exportSpreadsheet(templateRows, 'internal-sales-order-template.xlsx');
  };

  const handleDownloadOrders = async () => {
    if (internalOrders.length === 0) {
      toast.error('No data available to download.');
      return;
    }

    const rows = internalOrders.map((order) => ({
      'Show ID': order.showId,
      Dealership: order.dealership,
      'Internal Sales Order Number': order.internalSalesOrderNumber,
      'Internal Sales Order Number (Dealer)': order.internalSalesOrderNumberDealer,
    }));

    await exportSpreadsheet(rows, 'internal-sales-orders.xlsx');
  };


  return (
  return (
    <div className="space-y-6">
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
        <div>
          <div className="flex items-center gap-2 text-slate-700">
          <div className="flex items-center gap-2 text-slate-700">
            <Banknote className="h-5 w-5" />
            <Banknote className="h-5 w-5" />
            <p className="text-sm font-medium uppercase tracking-wide">Data Sets</p>
            <p className="text-sm font-medium uppercase tracking-wide">Data Sets</p>
          </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Finance Dataset</h1>
          <h1 className="text-2xl font-bold text-slate-900">Finance Dataset</h1>
          <p className="text-sm text-slate-600">
          <p className="text-sm text-slate-600">
            Manage finance/internalsalesorder and finance/expense entries stored in Firebase.
            Manage finance/internalsalesorder and finance/expense entries stored in Firebase.
          </p>
          </p>
        </div>
        </div>
        <Badge variant="secondary" className="text-slate-700">
        <Badge variant="secondary" className="text-slate-700">
          Auto-linked to shows for names and default dealership
          Auto-linked to shows for names and default dealership
        </Badge>
        </Badge>
      </div>
      </div>


      {error && (
      {error && (
        <Card className="border-red-200 bg-red-50">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-red-800">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-red-800">
            <XCircle className="h-4 w-4" /> {error}
            <XCircle className="h-4 w-4" /> {error}
          </CardContent>
          </CardContent>
        </Card>
        </Card>
@@ -406,50 +451,56 @@ export default function Finance() {
              onClick={() => setActiveTable('orders')}
              onClick={() => setActiveTable('orders')}
              className="text-sm"
              className="text-sm"
            >
            >
              Internal Sales Order
              Internal Sales Order
            </Button>
            </Button>
            <Button
            <Button
              variant={activeTable === 'expenses' ? 'default' : 'outline'}
              variant={activeTable === 'expenses' ? 'default' : 'outline'}
              onClick={() => setActiveTable('expenses')}
              onClick={() => setActiveTable('expenses')}
              className="text-sm"
              className="text-sm"
            >
            >
              GL Account
              GL Account
            </Button>
            </Button>
          </div>
          </div>
          {activeTable === 'orders' ? (
          {activeTable === 'orders' ? (
            <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
              <input
                ref={fileInputRef}
                ref={fileInputRef}
                type="file"
                type="file"
                accept=".xlsx,.xls,.csv"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                className="hidden"
                onChange={(event) => {
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  const file = event.target.files?.[0];
                  if (file) handleImportOrders(file);
                  if (file) handleImportOrders(file);
                }}
                }}
              />
              />
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadOrders} disabled={importing}>
                Download Data
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? (
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                  <Upload className="mr-2 h-4 w-4" />
                )}
                )}
                {importing ? 'Uploading...' : 'Upload Excel'}
                {importing ? 'Uploading...' : 'Upload Excel'}
              </Button>
              </Button>
              <Button onClick={handleSaveOrders} disabled={savingOrders}>
              <Button onClick={handleSaveOrders} disabled={savingOrders}>
                {savingOrders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {savingOrders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {savingOrders ? 'Saving...' : 'Save Changes'}
                {savingOrders ? 'Saving...' : 'Save Changes'}
              </Button>
              </Button>
            </div>
            </div>
          ) : (
          ) : (
            <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSaveExpenses} disabled={savingExpenses}>
              <Button onClick={handleSaveExpenses} disabled={savingExpenses}>
                {savingExpenses ? (
                {savingExpenses ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                  <Save className="mr-2 h-4 w-4" />
                )}
                )}
                {savingExpenses ? 'Saving...' : 'Save GL Accounts'}
                {savingExpenses ? 'Saving...' : 'Save GL Accounts'}
              </Button>
              </Button>
            </div>
            </div>
          )}
          )}
@@ -514,151 +565,133 @@ export default function Finance() {
                                placeholder="Internal Sales Order Number (Dealer)"
                                placeholder="Internal Sales Order Number (Dealer)"
                                className="h-9"
                                className="h-9"
                              />
                              />
                            </TableCell>
                            </TableCell>
                            <TableCell className="text-right">
                            <TableCell className="text-right">
                              <Button
                              <Button
                                variant="ghost"
                                variant="ghost"
                                size="icon"
                                size="icon"
                                className="text-red-500 hover:text-red-600"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDeleteOrder(order.id)}
                                onClick={() => handleDeleteOrder(order.id)}
                              >
                              >
                                <XCircle className="h-4 w-4" />
                                <XCircle className="h-4 w-4" />
                              </Button>
                              </Button>
                            </TableCell>
                            </TableCell>
                          </TableRow>
                          </TableRow>
                        );
                        );
                      })
                      })
                    )}
                    )}
                  </TableBody>
                  </TableBody>
                </Table>
                </Table>
              </div>
              </div>
            )
            )
          ) : (
          ) : (
            <>
            <>
              <div className="grid gap-4 md:grid-cols-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={newExpense.category}
                    onValueChange={(value) => setNewExpense((prev) => ({ ...prev, category: value as ExpenseCategory }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dealer Cost">Dealer Cost</SelectItem>
                      <SelectItem value="Factory Cost">Factory Cost</SelectItem>
                      <SelectItem value="Factory Commissions">Factory Commissions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                <div className="space-y-2">
                  <Label>Subcategory</Label>
                  <Label>Subcategory</Label>
                  <Input
                  <Input
                    value={newExpense.name}
                    value={newExpense.category}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, name: event.target.value }))}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="e.g. Stand Cost"
                    placeholder="e.g. Freight"
                    className="h-9"
                    className="h-9"
                  />
                  />
                </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Contains</Label>
                  <Label>Contains</Label>
                  <Input
                  <Input
                    value={newExpense.contains}
                    value={newExpense.contains}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, contains: event.target.value }))}
                    onChange={(event) => setNewExpense((prev) => ({ ...prev, contains: event.target.value }))}
                    placeholder="Describe what goes into this account"
                    placeholder="Describe what goes into this account"
                    className="h-9"
                    className="h-9"
                  />
                  />
                </div>
                </div>
                <div className="space-y-2">
                <div className="space-y-2">
                  <Label>GL Code</Label>
                  <Label>GL Code</Label>
                  <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                    <Input
                      value={newExpense.glCode}
                      value={newExpense.glCode}
                      onChange={(event) => setNewExpense((prev) => ({ ...prev, glCode: event.target.value }))}
                      onChange={(event) => setNewExpense((prev) => ({ ...prev, glCode: event.target.value }))}
                      placeholder="Enter GL code"
                      placeholder="Enter GL code"
                      className="h-9"
                      className="h-9"
                    />
                    />
                    <Button variant="outline" onClick={handleAddExpenseItem}>
                    <Button variant="outline" onClick={handleAddExpenseItem}>
                      <Plus className="mr-2 h-4 w-4" />
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                      Add
                    </Button>
                    </Button>
                  </div>
                  </div>
                </div>
                </div>
              </div>
              </div>


              <div className="space-y-4">
              <div className="space-y-4">
                {groupedExpenses.map(({ category, items }) => (
                <Card className="border-slate-200">
                  <Card key={category} className="border-slate-200">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <div>
                      <CardTitle className="text-base">GL Accounts</CardTitle>
                        <CardTitle className="text-base">{category}</CardTitle>
                      <CardDescription>Update GL codes or extend the list with new subcategories.</CardDescription>
                        <CardDescription>Update GL codes or extend the list with new subcategories.</CardDescription>
                    </div>
                      </div>
                    <Badge variant="outline" className="text-slate-700">
                      <Badge variant="outline" className="text-slate-700">
                      {expenses.length} item{expenses.length === 1 ? '' : 's'}
                        {items.length} item{items.length === 1 ? '' : 's'}
                    </Badge>
                      </Badge>
                  </CardHeader>
                    </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <CardContent className="overflow-x-auto">
                    <Table className="text-xs">
                      <Table className="text-xs">
                      <TableHeader>
                        <TableHeader>
                        <TableRow>
                          <TableHead className="w-32">Subcategory</TableHead>
                          <TableHead className="w-48">Contains</TableHead>
                          <TableHead className="w-32">GL Code</TableHead>
                          <TableHead className="w-16 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {expenses.length === 0 ? (
                          <TableRow>
                          <TableRow>
                            <TableHead className="w-32">Subcategory</TableHead>
                            <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                            <TableHead className="w-48">Contains</TableHead>
                              No GL accounts yet. Add a subcategory above.
                            <TableHead className="w-32">GL Code</TableHead>
                            </TableCell>
                            <TableHead className="w-16 text-right">Actions</TableHead>
                          </TableRow>
                          </TableRow>
                        </TableHeader>
                        ) : (
                        <TableBody>
                          expenses.map((item) => (
                          {items.length === 0 ? (
                            <TableRow key={item.id}>
                            <TableRow>
                              <TableCell className="align-middle font-medium text-slate-900">{item.category}</TableCell>
                              <TableCell colSpan={4} className="text-center text-sm text-slate-500">
                              <TableCell className="align-middle">
                                No entries yet for {category}. Add a subcategory above.
                                <Input
                                  value={item.contains || ''}
                                  onChange={(event) => handleExpenseChange(item.id, { contains: event.target.value })}
                                  placeholder="Describe contents"
                                  className="h-9"
                                />
                              </TableCell>
                              <TableCell className="align-middle">
                                <Input
                                  value={item.glCode}
                                  onChange={(event) => handleExpenseChange(item.id, { glCode: event.target.value })}
                                  placeholder="GL code"
                                  className="h-9"
                                />
                              </TableCell>
                              <TableCell className="text-right align-middle">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() => handleDeleteExpense(item.id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </TableCell>
                              </TableCell>
                            </TableRow>
                            </TableRow>
                          ) : (
                          ))
                            items.map((item) => (
                        )}
                              <TableRow key={item.id}>
                      </TableBody>
                                <TableCell className="align-middle font-medium text-slate-900">{item.name}</TableCell>
                    </Table>
                                <TableCell className="align-middle">
                  </CardContent>
                                  <Input
                </Card>
                                    value={item.contains || ''}
                                    onChange={(event) => handleExpenseChange(item.id, { contains: event.target.value })}
                                    placeholder="Describe contents"
                                    className="h-9"
                                  />
                                </TableCell>
                                <TableCell className="align-middle">
                                  <Input
                                    value={item.glCode}
                                    onChange={(event) => handleExpenseChange(item.id, { glCode: event.target.value })}
                                    placeholder="GL code"
                                    className="h-9"
                                  />
                                </TableCell>
                                <TableCell className="text-right align-middle">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-500 hover:text-red-600"
                                    onClick={() => handleDeleteExpense(item.id)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
              </div>
            </>
            </>
          )}
          )}
        </CardContent>
        </CardContent>
      </Card>
      </Card>
    </div>
    </div>
  );
  );
}
}
src/pages/FinanceDetail.tsx
新
+845
-0

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { dbGet } from '@/lib/firebase';

type SummaryRow = {
  id: string;
  aufnr: string;
  aufnrNorm: string;
  glAccountRaw: string;
  glAccountNorm: string;
  glName: string;
  companyCode: string;
  fiscalYear: string;
  vkorg: string;
  currency: string;
  netAmount: number;
  debitAmount: number;
  creditAmount: number;
  absAmount: number;
  lineCount: number;
  updatedAt?: string;
  showId?: string;
  showName?: string;
};

type LineRow = {
  id: string;
  aufnrNorm: string;
  glAccountNorm: string;
  glName: string;
  companyCode: string;
  fiscalYear: string;
  vkorg: string;
  currency: string;
  postingDate?: string;
  docNo?: string;
  lineNo?: string;
  dcInd?: string;
  amount?: number;
  debitAmount?: number;
  creditAmount?: number;
  sgtxt?: string;
  sfgxt?: string;
  personTokens?: string[];
  costCenter?: string;
  profitCenter?: string;
  reference?: string;
  showId?: string;
  showName?: string;
};

type Filters = {
  showId: string;
  glCode: string;
  company: string;
  fiscalYear: string;
  search: string;
  member: string;
};

type ShowRecord = {
  id: string;
  name?: string;
};

type PersonOption = {
  key: string;
  tokens: string[];
};

type InternalOrder = {
  showId: string;
  internalSalesOrderNumberDealer?: string;
  internalSalesOrderNumber?: string;
};

type ExpenseItem = {
  glCode?: string;
  category?: string;
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

function extractPersonKey(text: string | undefined): PersonOption | null {
  if (!text) return null;
  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return null;
  const tokens = words.slice(-2).map((w) => w.toLowerCase());
  if (tokens.length === 0) return null;
  return { key: tokens.join(' '), tokens };
}

const buildMemberTokens = (name: string): string[] => {
  const lower = name.toLowerCase().trim();
  if (!lower) return [];
  const parts = lower
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, '').trim())
    .filter(Boolean);

  if (parts.length === 0) return [];

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const initials: string[] = [];
  if (firstName) initials.push(firstName[0]);
  if (lastName) initials.push(lastName[0]);

  const tokens = new Set<string>();
  parts.forEach((p) => tokens.add(p));
  tokens.add(parts.join(' ')); // full name
  initials.forEach((i) => tokens.add(i));
  if (initials.length === 2) {
    tokens.add(initials.join('')); // combined initials
    tokens.add(`${initials[0]} ${initials[1]}`);
  }

  return Array.from(tokens).filter(Boolean);
};

const normaliseSummaryRows = (data: unknown): { summaries: SummaryRow[]; lines: LineRow[] } => {
  if (!data || typeof data !== 'object') return { summaries: [], lines: [] };
  const root = data as Record<string, unknown>;
  const summaries: SummaryRow[] = [];
  const lines: LineRow[] = [];

  Object.entries(root).forEach(([aufnrKey, glBuckets]) => {
    if (!glBuckets || typeof glBuckets !== 'object') return;
    const aufnrNorm = leadingZeroSafe(aufnrKey);

    Object.entries(glBuckets as Record<string, unknown>).forEach(([glKey, glValue]) => {
      if (!glValue || typeof glValue !== 'object') return;
      const glAccountNorm = leadingZeroSafe(glKey);
      const glBucket = glValue as Record<string, unknown>;

      if (glBucket.summary && typeof glBucket.summary === 'object') {
        Object.entries(glBucket.summary as Record<string, unknown>).forEach(([dimKey, rawSummary]) => {
          if (!rawSummary || typeof rawSummary !== 'object') return;
          const summary = rawSummary as Record<string, unknown>;
          const id = `${aufnrNorm}-${glAccountNorm}-${dimKey}`;
          summaries.push({
            id,
            aufnr: typeof summary.aufnr === 'string' ? summary.aufnr : '',
            aufnrNorm,
            glAccountRaw: typeof summary.gl_account_raw === 'string' ? summary.gl_account_raw : '',
            glAccountNorm:
              typeof summary.gl_account_norm === 'string'
                ? summary.gl_account_norm
                : typeof summary.gl_norm === 'string'
                  ? summary.gl_norm
                  : glAccountNorm,
            glName: '',
            companyCode: typeof summary.company_code === 'string' ? summary.company_code : 'NA',
            fiscalYear:
              typeof summary.fiscal_year === 'number'
                ? summary.fiscal_year.toString()
                : typeof summary.fiscal_year === 'string'
                  ? summary.fiscal_year
                  : 'NA',
            vkorg: typeof summary.vkorg === 'string' ? summary.vkorg : 'NA',
            currency: typeof summary.currency === 'string' ? summary.currency : 'NA',
            netAmount: numberOrZero(summary.net_amount ?? summary.amount),
            debitAmount: numberOrZero(summary.debit_amount),
            creditAmount: numberOrZero(summary.credit_amount),
            absAmount: numberOrZero(summary.abs_amount),
            lineCount: typeof summary.line_cnt === 'number' ? summary.line_cnt : numberOrZero(summary.line_cnt),
            updatedAt: typeof summary.updated_at === 'string' ? summary.updated_at : undefined,
          });
        });
      }

      if (glBucket.lines && typeof glBucket.lines === 'object') {
        Object.entries(glBucket.lines as Record<string, unknown>).forEach(([lineId, rawLine]) => {
          if (!rawLine || typeof rawLine !== 'object') return;
          const line = rawLine as Record<string, unknown>;
          lines.push({
            id: lineId,
            aufnrNorm,
            glAccountNorm,
            glName: '',
            companyCode: typeof line.company_code === 'string' ? line.company_code : 'NA',
            fiscalYear:
              typeof line.fiscal_year === 'number'
                ? line.fiscal_year.toString()
                : typeof line.fiscal_year === 'string'
                  ? line.fiscal_year
                  : 'NA',
            vkorg: typeof line.vkorg === 'string' ? line.vkorg : 'NA',
            currency: typeof line.currency === 'string' ? line.currency : 'NA',
            postingDate: typeof line.posting_date === 'string' ? line.posting_date : undefined,
            docNo: typeof line.doc_no === 'string' ? line.doc_no : undefined,
            lineNo: typeof line.line_no === 'string' ? line.line_no : undefined,
            dcInd: typeof line.dc_ind === 'string' ? line.dc_ind : undefined,
            amount: numberOrZero(line.amount),
            debitAmount: numberOrZero(line.debit_amount),
            creditAmount: numberOrZero(line.credit_amount),
            sgtxt: typeof line.sgtxt === 'string' ? line.sgtxt : undefined,
            sfgxt: typeof (line as Record<string, unknown>).sfgxt === 'string' ? (line as Record<string, unknown>).sfgxt : undefined,
            costCenter: typeof line.cost_center === 'string' ? line.cost_center : undefined,
            profitCenter: typeof line.profit_center === 'string' ? line.profit_center : undefined,
            reference: typeof line.reference === 'string' ? line.reference : undefined,
            personTokens: extractPersonKey(line.sgtxt)?.tokens,
          });
        });
      }
    });
  });

  return { summaries, lines };
};

const ALL_SHOWS = 'all';
const ALL_YEARS = 'all-years';
const ALL_MEMBERS = 'all-members';

const formatAmount = (value: number, currency?: string) => {
  if (!Number.isFinite(value)) return '—';
  return `${currency ?? ''}${currency ? ' ' : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatAmountStyled = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  if (value < 0) {
    return <span className="text-red-600 font-semibold">({formatted})</span>;
  }
  if (value > 0) {
    return <span className="text-emerald-600 font-semibold">{formatted}</span>;
  }
  return <span className="text-slate-700">{formatted}</span>;
};

const formatAmountExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  if (value > 0) return <span className="text-red-600 font-semibold">({formatted})</span>;
  if (value < 0) return <span className="text-emerald-600 font-semibold">{formatted}</span>;
  return <span className="text-slate-700">{formatted}</span>;
};

const formatDebitExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  return <span className="text-red-600 font-semibold">({formatted})</span>;
};

const formatCreditExpense = (value: number | undefined, currency?: string) => {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-slate-500">—</span>;
  const formatted = formatAmount(Math.abs(value), currency);
  return <span className="text-emerald-600 font-semibold">{formatted}</span>;
};

export default function FinanceDetail() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [filters, setFilters] = useState<Filters>({
    showId: ALL_SHOWS,
    glCode: '',
    company: '',
    fiscalYear: ALL_YEARS,
    search: '',
  });
  const [showLookup, setShowLookup] = useState<Record<string, ShowRecord>>({});
  const [aufnrToShow, setAufnrToShow] = useState<Record<string, { showId: string; showName?: string }>>({});
  const [glNameLookup, setGlNameLookup] = useState<Record<string, string>>({});
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [members, setMembers] = useState<PersonOption[]>([]);
  const [memberFilter, setMemberFilter] = useState<string>(ALL_MEMBERS);
  const [memberTokensLookup, setMemberTokensLookup] = useState<Record<string, string[]>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [glData, showsData, ordersData, expensesData, teamData] = await Promise.all([
        dbGet('finance/glByAufnrGl'),
        dbGet('shows'),
        dbGet('finance/internalSalesOrders'),
        dbGet('finance/expenses'),
        dbGet('teamMembers'),
      ]);

      const parsed = normaliseSummaryRows(glData);
      const shows: Record<string, ShowRecord> = showsData
        ? Object.entries(showsData).reduce((acc, [id, value]) => {
            if (typeof id === 'string') {
              const name = value && typeof value === 'object' && typeof (value as Record<string, unknown>).name === 'string'
                ? (value as Record<string, unknown>).name
                : undefined;
              acc[id] = { id, name };
            }
            return acc;
          }, {} as Record<string, ShowRecord>)
        : {};

      const glNames: Record<string, string> = expensesData
        ? Object.values(expensesData as Record<string, ExpenseItem>).reduce((acc, item) => {
            const gl = item?.glCode?.trim();
            if (gl) {
              acc[leadingZeroSafe(gl)] = item.category?.trim() || 'GL Code';
            }
            return acc;
          }, {} as Record<string, string>)
        : {};

      const aufnrShowMap = buildAufnrShowMap(ordersData, shows);

      const annotateSummary = parsed.summaries.map((row) => ({
        ...row,
        glName: glNames[row.glAccountNorm] || 'Undefined GL Code',
        showId: aufnrShowMap[row.aufnrNorm]?.showId,
        showName: aufnrShowMap[row.aufnrNorm]?.showName || aufnrShowMap[row.aufnrNorm]?.showId,
      }));

      const annotateLines = parsed.lines.map((row) => ({
        ...row,
        glName: glNames[row.glAccountNorm] || 'Undefined GL Code',
        showId: aufnrShowMap[row.aufnrNorm]?.showId,
        showName: aufnrShowMap[row.aufnrNorm]?.showName || aufnrShowMap[row.aufnrNorm]?.showId,
      }));

      setShowLookup(shows);
      setGlNameLookup(glNames);
      setAufnrToShow(aufnrShowMap);
      setSummaries(annotateSummary);
      setLines(annotateLines);
      const years = new Set<string>();
      annotateSummary.forEach((row) => years.add(row.fiscalYear));
      annotateLines.forEach((row) => years.add(row.fiscalYear));
      const sortedYears = Array.from(years).filter(Boolean).sort();
      setAvailableYears(sortedYears);
      const memberList: PersonOption[] = teamData
        ? Object.values(teamData as Record<string, { memberName?: string }>)
            .map((member) => {
              const name = member?.memberName?.trim();
              if (!name) return null;
              const tokens = buildMemberTokens(name);
              if (tokens.length === 0) return null;
              return { key: name, tokens } as PersonOption;
            })
            .filter(Boolean) as PersonOption[]
        : [];
      setMembers(memberList);
      const tokenLookup: Record<string, string[]> = {};
      memberList.forEach((member) => {
        tokenLookup[member.key] = member.tokens;
      });
      setMemberTokensLookup(tokenLookup);
      setError(null);
    } catch (err) {
      console.error('Failed to load finance detail', err);
      setError('Unable to load finance detail data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSummaries = useMemo(
    () =>
      summaries.filter((row) => {
        const matches = (value: string | undefined, needle: string) =>
          (value ?? '').toLowerCase().includes(needle.toLowerCase());
        return (
          (filters.showId !== ALL_SHOWS ? row.showId === filters.showId : true) &&
          (filters.glCode ? matches(row.glAccountNorm, filters.glCode) : true) &&
          (filters.company ? row.companyCode === filters.company : true) &&
          (filters.fiscalYear !== ALL_YEARS ? row.fiscalYear === filters.fiscalYear : true)
        );
      }),
    [filters, summaries, ALL_SHOWS, ALL_YEARS]
  );

  const filteredLines = useMemo(
    () =>
      lines.filter((row) => {
        const matches = (value: string | undefined, needle: string) =>
          (value ?? '').toLowerCase().includes(needle.toLowerCase());
        const personTokens = row.personTokens ?? extractPersonKey(row.sgtxt)?.tokens ?? [];
        const memberTokens = memberTokensLookup[filters.member] ?? [];
        const normalizedSgtxt = (row.sgtxt ?? '').toLowerCase();
        const memberMatches =
          filters.glCode === '688304'
            ? filters.member === ALL_MEMBERS
              ? true
              : memberTokens.some((token) => personTokens.includes(token) || normalizedSgtxt.includes(token))
            : true;
        return (
          (filters.showId !== ALL_SHOWS ? row.showId === filters.showId : true) &&
          (filters.glCode ? matches(row.glAccountNorm, filters.glCode) : true) &&
          (filters.company ? row.companyCode === filters.company : true) &&
          (filters.fiscalYear !== ALL_YEARS ? row.fiscalYear === filters.fiscalYear : true) &&
          memberMatches &&
          (filters.search
            ? matches(row.sgtxt, filters.search) ||
              matches(row.sfgxt, filters.search) ||
              matches(row.docNo, filters.search) ||
              matches(row.reference, filters.search)
            : true)
        );
      }),
    [filters, lines, ALL_SHOWS, ALL_YEARS, memberTokensLookup]
  );

  const summaryTotals = useMemo(() => {
    return filteredSummaries.reduce(
      (acc, row) => {
        acc.net += row.netAmount;
        acc.debit += row.debitAmount;
        acc.credit += row.creditAmount;
        acc.lines += row.lineCount;
        return acc;
      },
      { net: 0, debit: 0, credit: 0, lines: 0 }
    );
  }, [filteredSummaries]);

  const clearFilters = () =>
    setFilters({
      showId: ALL_SHOWS,
      glCode: '',
      company: '',
      fiscalYear: ALL_YEARS,
      search: '',
      member: ALL_MEMBERS,
    });

  const buildAufnrShowMap = (
    ordersData: unknown,
    shows: Record<string, ShowRecord>
  ): Record<string, { showId: string; showName?: string }> => {
    const map: Record<string, { showId: string; showName?: string }> = {};
    if (!ordersData || typeof ordersData !== 'object') return map;

    Object.values(ordersData as Record<string, InternalOrder>).forEach((order) => {
      if (!order || typeof order !== 'object') return;
      const dealerNumber =
        typeof order.internalSalesOrderNumberDealer === 'string' ? order.internalSalesOrderNumberDealer.trim() : '';
      const internalNumber =
        typeof order.internalSalesOrderNumber === 'string' ? order.internalSalesOrderNumber.trim() : '';
      const candidates = [dealerNumber, internalNumber].filter(Boolean);
      candidates.forEach((num) => {
        const norm = leadingZeroSafe(num);
        if (!norm) return;
        const showId = order.showId;
        if (!showId) return;
        const showName = shows[showId]?.name;
        map[norm] = { showId, showName };
      });
    });
    return map;
  };

  const financeShowOptions = useMemo(() => {
    const ids = new Set<string>();
    summaries.forEach((row) => row.showId && ids.add(row.showId));
    lines.forEach((row) => row.showId && ids.add(row.showId));
    return Array.from(ids);
  }, [summaries, lines]);

  useEffect(() => {
    if (filters.glCode !== '688304' && memberFilter !== ALL_MEMBERS) {
      setMemberFilter(ALL_MEMBERS);
    }
  }, [filters.glCode, memberFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Finance Detail</p>
          <h1 className="text-2xl font-bold text-slate-900">AUFNR / GL Breakdown</h1>
          <p className="text-sm text-slate-600">
            Explore finance/glByAufnrGl summaries and lines grouped by AUFNR and GL account with quick filters and totals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Show Filter</CardTitle>
            <CardDescription>Shows with finance records (mapped from internal sales order AUFNR)</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Select value={filters.showId} onValueChange={(value) => setFilters((prev) => ({ ...prev, showId: value }))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All shows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHOWS}>All shows</SelectItem>
                {financeShowOptions
                  .map((id) => ({
                    id,
                    name: showLookup[id]?.name || id,
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      {show.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search text (SGTXT / Doc / Reference)"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="md:col-span-1 lg:col-span-1">
              <Select
                value={filters.fiscalYear}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, fiscalYear: value }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All fiscal years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_YEARS}>All fiscal years</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>GL Code</CardTitle>
              <CardDescription>GL code from finance/expenses glCode (Undefined if not mapped).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[...new Set(summaries.map((row) => row.glAccountNorm))].map((gl) => {
                const isActive = filters.glCode === gl;
                const glName = glNameLookup[gl] || 'Undefined GL Code';
                const glNet = summaries
                  .filter((row) => row.glAccountNorm === gl && (!filters.company || row.companyCode === filters.company))
                  .reduce((acc, row) => acc + row.netAmount, 0);
                return (
                  <button
                    key={gl}
                    className={`rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${
                      isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setFilters((prev) => ({ ...prev, glCode: isActive ? '' : gl }))}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{gl || '—'}</p>
                      {isActive && <Badge variant="secondary">Selected</Badge>}
                    </div>
                    <p className="text-xs text-slate-600">备注: {glName}</p>
                    <p className="mt-2 text-sm font-semibold">{formatAmountStyled(glNet)}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
              <CardDescription>Factory Cost (3110) / Dealer Cost (3120)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {['3110', '3120'].map((company) => {
                const isActive = filters.company === company;
                const companyNet = summaries
                  .filter((row) => row.companyCode === company && (!filters.glCode || row.glAccountNorm === filters.glCode))
                  .reduce((acc, row) => acc + row.netAmount, 0);
                const label = company === '3110' ? 'Factory Cost' : 'Dealer Cost';
                return (
                  <button
                    key={company}
                    className={`rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${
                      isActive ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setFilters((prev) => ({ ...prev, company: isActive ? '' : company }))}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      {isActive && <Badge variant="secondary">Selected</Badge>}
                    </div>
                    <p className="text-sm mt-2 font-semibold">Net: {formatAmountStyled(companyNet)}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-sm md:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Net Amount</CardDescription>
            <CardTitle className="text-3xl text-slate-900">{formatAmountStyled(summaryTotals.net)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-white shadow-sm md:col-span-2">
          <CardHeader className="pb-2">
            <CardDescription>Current filters: Show / GL / Company / Fiscal Year</CardDescription>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <Badge variant="outline">
                Show: {filters.showId !== ALL_SHOWS ? showLookup[filters.showId]?.name || filters.showId : 'All'}
              </Badge>
              <Badge variant="outline">
                GL: {filters.glCode || 'All'} {filters.glCode ? `(${glNameLookup[filters.glCode] || 'Undefined GL Code'})` : ''}
              </Badge>
              <Badge variant="outline">
                Company: {filters.company === '3110' ? 'Factory Cost' : filters.company === '3120' ? 'Dealer Cost' : 'All'}
              </Badge>
              <Badge variant="outline">
                Fiscal Year: {filters.fiscalYear !== ALL_YEARS ? filters.fiscalYear : 'All'}
              </Badge>
            </div>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Summary by AUFNR / GL</CardTitle>
            <CardDescription>One row per dimKey under finance/glByAufnrGl/{'{aufnr}'}/{'{gl}'}/summary</CardDescription>
          </div>
          <Badge variant="outline" className="text-slate-700">
            {filteredSummaries.length} record{filteredSummaries.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading summaries…
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Show</TableHead>
                  <TableHead className="min-w-[70px]">GL</TableHead>
                  <TableHead>GL Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>VKORG</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="min-w-[140px]">Updated At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-sm text-slate-500">
                      No matching summaries.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSummaries.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.showName || 'Unknown Show'}</span>
                          <span className="text-xs text-slate-600">AUFNR: {row.aufnrNorm}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">{row.glAccountNorm}</TableCell>
                      <TableCell className="text-slate-700">{row.glName}</TableCell>
                      <TableCell>{row.companyCode}</TableCell>
                      <TableCell>{row.fiscalYear}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell>{row.vkorg}</TableCell>
                      <TableCell className="text-right">{formatAmountStyled(row.netAmount, row.currency)}</TableCell>
                      <TableCell className="text-right">{row.lineCount}</TableCell>
                      <TableCell className="text-slate-600">{row.updatedAt ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Line Items</CardTitle>
              <CardDescription>finance/glByAufnrGl/{'{aufnr}'}/{'{gl}'}/lines/{'{lineId}'}</CardDescription>
            </div>
            <Badge variant="outline" className="text-slate-700">
              {filteredLines.length} line{filteredLines.length === 1 ? '' : 's'}
            </Badge>
          </CardHeader>
          {members.length > 0 && filters.glCode === '688304' && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              <Badge
                variant={memberFilter === ALL_MEMBERS ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setMemberFilter(ALL_MEMBERS)}
              >
                All members
              </Badge>
              {members.map((member) => (
                <Badge
                  key={member.key}
                  variant={memberFilter === member.key ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setMemberFilter((prev) => (prev === member.key ? ALL_MEMBERS : member.key))}
                >
                  {member.key}
                </Badge>
              ))}
            </div>
          )}
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading lines…
            </div>
          ) : (
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Show</TableHead>
                  <TableHead className="min-w-[70px]">GL</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Curr</TableHead>
                  <TableHead>Doc / Line</TableHead>
                  <TableHead>Posting Date</TableHead>
                  <TableHead>DC</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Cost Center</TableHead>
                  <TableHead>Profit Center</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="min-w-[180px]">SGTXT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center text-sm text-slate-500">
                      No matching lines.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLines.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.showName || 'Unknown Show'}</span>
                          <span className="text-xs text-slate-600">AUFNR: {row.aufnrNorm}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex flex-col">
                          <span>{row.glAccountNorm}</span>
                          <span className="text-xs text-slate-600">{row.glName}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.companyCode}</TableCell>
                      <TableCell>{row.fiscalYear}</TableCell>
                      <TableCell>{row.currency}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{row.docNo ?? '—'}</span>
                          <span className="text-slate-600">{row.lineNo ?? '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{row.postingDate ?? '—'}</TableCell>
                      <TableCell>{row.dcInd ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatAmountExpense(row.amount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatDebitExpense(row.debitAmount ?? 0, row.currency)}</TableCell>
                      <TableCell className="text-right">{formatCreditExpense(row.creditAmount ?? 0, row.currency)}</TableCell>
                      <TableCell>{row.costCenter ?? '—'}</TableCell>
                      <TableCell>{row.profitCenter ?? '—'}</TableCell>
                      <TableCell>{row.reference ?? '—'}</TableCell>
                      <TableCell className="text-slate-900">{row.sgtxt ?? '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
