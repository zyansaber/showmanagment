import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw, Edit2, Save, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet } from '@/lib/firebase';

type SiteLocation = {
  number?: string;
  street?: string;
  suburb?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

type ShowRecord = {
  id?: string;
  name?: string;
  dealership?: string;
  siteLocation?: SiteLocation;
  startDate?: string;
  finishDate?: string;
  showDuration?: number | string;
  target2024?: number | string;
  sales2024?: number | string;
  target2025?: number | string;
  sales2025?: number | string;
  target2026?: number | string;
  sales2026?: number | string;
  eventOrganiser?: string;
  caravansOnDisplay?: number | string;
  standSize?: string;
  layoutAddress?: string;
  status?: string;
  teamMembers?: string[];
  rowColor?: string;
};

type TeamMember = {
  memberId?: string;
  memberName?: string;
  role?: string;
  activeFlag?: number;
};

type InternalSalesOrder = {
  showId?: string;
  internalSalesOrderNumber?: string;
};

const normaliseList = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean) as T[];
  return Object.entries(data as Record<string, T>).map(([key, value]) => ({ id: key, ...value }));
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
};

const formatAddress = (site?: SiteLocation) => {
  if (!site) return '';
  return [site.number, site.street, site.suburb, site.state, site.postcode, site.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
};

const calculateShowDuration = (show: ShowRecord) => {
  if (show.showDuration !== undefined && show.showDuration !== null && show.showDuration !== '') {
    return show.showDuration;
  }
  const start = parseDate(show.startDate);
  const finish = parseDate(show.finishDate);
  if (!start || !finish) return '';
  const diffMs = finish.getTime() - start.getTime();
  if (diffMs < 0) return '';
  return Math.floor(diffMs / 86_400_000) + 1;
};

const calculateWeekBeforeStartFromToday = (startDate?: string) => {
  const start = parseDate(startDate);
  if (!start) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 7);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
};

const ROW_COLORS = ['bg-white', 'bg-blue-50', 'bg-green-50', 'bg-yellow-50', 'bg-purple-50', 'bg-pink-50'];

export default function ShowExcelList() {
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [internalSalesOrders, setInternalSalesOrders] = useState<InternalSalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [editData, setEditData] = useState<ShowRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [showsData, teamData, internalOrderData] = await Promise.all([
        dbGet('shows'),
        dbGet('teamMembers'),
        dbGet('finance/internalSalesOrders'),
      ]);
      setShows(normaliseList<ShowRecord>(showsData));
      setTeamMembers(normaliseList<TeamMember>(teamData));
      setInternalSalesOrders(normaliseList<InternalSalesOrder>(internalOrderData));
    } catch (err) {
      console.error('Failed to load show spreadsheet data:', err);
      setError('Failed to load show spreadsheet data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeTeamMembers = useMemo(
    () =>
      teamMembers
        .filter((member) => member.activeFlag === 1)
        .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || '')),
    [teamMembers]
  );

  const internalOrderByShowId = useMemo(() => {
    return internalSalesOrders.reduce((acc, order) => {
      if (order.showId) acc[order.showId] = order.internalSalesOrderNumber || '';
      return acc;
    }, {} as Record<string, string>);
  }, [internalSalesOrders]);

  const teamMemberById = useMemo(() => {
    return teamMembers.reduce((acc, member) => {
      if (member.memberId) acc[member.memberId] = member;
      return acc;
    }, {} as Record<string, TeamMember>);
  }, [teamMembers]);

  const sortedShows = useMemo(() => {
    return [...shows]
      .filter((show) =>
        !searchTerm ||
        (show.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (show.dealership || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (show.siteLocation?.suburb || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const aTime = parseDate(a.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDate(b.startDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [shows, searchTerm]);

  const handleEditClick = (show: ShowRecord) => {
    setEditingShowId(show.id || null);
    setEditData({ ...show });
  };

  const handleSaveEdit = async () => {
    if (!editData || !editingShowId) return;
    setIsSaving(true);
    try {
      await dbSet(`shows/${editingShowId}`, editData);
      setShows(shows.map((s) => (s.id === editingShowId ? editData : s)));
      setEditingShowId(null);
      setEditData(null);
    } catch (err) {
      console.error('Failed to save changes:', err);
      setError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingShowId(null);
    setEditData(null);
  };

  const handleRowColorChange = (showId: string, newColor: string) => {
    const updated = shows.map((s) =>
      s.id === showId ? { ...s, rowColor: newColor } : s
    );
    setShows(updated);
    if (editingShowId === showId && editData) {
      setEditData({ ...editData, rowColor: newColor });
    }
  };

  const EditCell = ({
    value,
    onChange,
    type = 'text',
  }: {
    value?: unknown;
    onChange: (val: string) => void;
    type?: string;
  }) => (
    <input
      type={type}
      value={formatValue(value)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      {/* Header Section */}
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg">
                <FileSpreadsheet className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900">All Shows Spreadsheet</h1>
            </div>
            <p className="text-sm text-slate-600 ml-11">
              Manage and track all shows with real-time editing and search capabilities
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isEditMode ? 'destructive' : 'default'}
              onClick={() => {
                setIsEditMode(!isEditMode);
                setEditingShowId(null);
                setEditData(null);
              }}
              className="gap-2"
            >
              {isEditMode ? (
                <>
                  <X className="h-4 w-4" /> Exit Edit
                </>
              ) : (
                <>
                  <Edit2 className="h-4 w-4" /> Edit Mode
                </>
              )}
            </Button>
            <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by show name, dealership, or suburb..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white border-slate-200"
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="p-8 text-center text-slate-500">Loading shows...</div>
      )}

      {/* Main Content */}
      {!loading && (
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardContent className="p-0">
            {sortedShows.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {searchTerm ? 'No shows match your search' : 'No shows found'}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-20">
                      {/* Block 1: Basic Info */}
                      <th className="px-4 py-3 text-left font-bold border-r-2 border-blue-500">Name</th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Internal Order
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Dealership
                      </th>

                      {/* Block 2: Location */}
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">Suburb</th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">State</th>

                      {/* Block 3: Dates & Duration */}
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Start Date
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Finish Date
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Week Before
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Duration
                      </th>

                      {/* Block 4: Team & Sales */}
                      {activeTeamMembers.map((member) => (
                        <th
                          key={member.memberId || member.memberName}
                          className="px-2 py-3 text-center font-semibold border-r border-blue-500 min-w-12 text-xs"
                          title={member.memberName}
                        >
                          {(member.memberName || member.memberId || '').substring(0, 3)}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center font-semibold border-r-2 border-blue-500">
                        Team Count
                      </th>

                      {/* Block 5: Sales & Details */}
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        2024 Sales
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        2025 Sales
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        2026 Target
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Address
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Event Organizer
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Caravans
                      </th>
                      <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                        Stand Size
                      </th>
                      {isEditMode && (
                        <>
                          <th className="px-3 py-3 text-left font-semibold border-r-2 border-blue-500">
                            Row Color
                          </th>
                          <th className="px-3 py-3 text-center font-semibold">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedShows.map((show, index) => {
                      const assignedMemberIds = new Set(show.teamMembers || []);
                      const membershipExcludingManagers = (show.teamMembers || []).filter((memberId) => {
                        const member = teamMemberById[memberId];
                        return member?.role !== 'Show Manager';
                      }).length;

                      const isEditing = editingShowId === show.id;
                      const rowData = isEditing ? editData : show;
                      const rowColorClass = rowData?.rowColor || 'bg-white';

                      return (
                        <tr
                          key={show.id || `${show.name}-${index}`}
                          className={`${rowColorClass} hover:opacity-90 border-b border-slate-200 transition-colors`}
                        >
                          {/* Block 1: Basic Info */}
                          <td className="px-4 py-3 font-bold text-blue-900 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.name}
                                onChange={(val) => setEditData({ ...rowData, name: val } as ShowRecord)}
                              />
                            ) : (
                              formatValue(show.name)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={show.id ? internalOrderByShowId[show.id] : ''}
                                onChange={() => {}}
                              />
                            ) : (
                              formatValue(show.id ? internalOrderByShowId[show.id] : '')
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.dealership}
                                onChange={(val) => setEditData({ ...rowData, dealership: val } as ShowRecord)}
                              />
                            ) : (
                              formatValue(show.dealership)
                            )}
                          </td>

                          {/* Block 2: Location */}
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.siteLocation?.suburb}
                                onChange={(val) =>
                                  setEditData({
                                    ...rowData,
                                    siteLocation: { ...rowData?.siteLocation, suburb: val },
                                  } as ShowRecord)
                                }
                              />
                            ) : (
                              formatValue(show.siteLocation?.suburb)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.siteLocation?.state}
                                onChange={(val) =>
                                  setEditData({
                                    ...rowData,
                                    siteLocation: { ...rowData?.siteLocation, state: val },
                                  } as ShowRecord)
                                }
                              />
                            ) : (
                              formatValue(show.siteLocation?.state)
                            )}
                          </td>

                          {/* Block 3: Dates & Duration */}
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.startDate}
                                onChange={(val) => setEditData({ ...rowData, startDate: val } as ShowRecord)}
                                type="date"
                              />
                            ) : (
                              formatValue(show.startDate)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.finishDate}
                                onChange={(val) => setEditData({ ...rowData, finishDate: val } as ShowRecord)}
                                type="date"
                              />
                            ) : (
                              formatValue(show.finishDate)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200 text-center">
                            {formatValue(calculateWeekBeforeStartFromToday(show.startDate))}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200 text-center font-medium">
                            {formatValue(calculateShowDuration(show))}
                          </td>

                          {/* Block 4: Team & Sales */}
                          {activeTeamMembers.map((member) => (
                            <td
                              key={member.memberId || member.memberName}
                              className="px-2 py-3 text-center border-r border-slate-200 text-sm"
                            >
                              {member.memberId && assignedMemberIds.has(member.memberId) ? (
                                <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded font-semibold text-xs">
                                  ✓
                                </span>
                              ) : (
                                ''
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3 border-r-2 border-slate-200 text-center font-bold text-blue-900">
                            {membershipExcludingManagers}
                          </td>

                          {/* Block 5: Sales & Details */}
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.sales2024}
                                onChange={(val) => setEditData({ ...rowData, sales2024: val } as ShowRecord)}
                                type="number"
                              />
                            ) : (
                              formatValue(show.sales2024)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.sales2025}
                                onChange={(val) => setEditData({ ...rowData, sales2025: val } as ShowRecord)}
                                type="number"
                              />
                            ) : (
                              formatValue(show.sales2025)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.target2026}
                                onChange={(val) => setEditData({ ...rowData, target2026: val } as ShowRecord)}
                                type="number"
                              />
                            ) : (
                              formatValue(show.target2026)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200 max-w-xs">
                            {isEditing ? (
                              <EditCell
                                value={formatAddress(rowData?.siteLocation)}
                                onChange={(val) => {
                                  const parts = val.split(',').map((p) => p.trim());
                                  setEditData({
                                    ...rowData,
                                    siteLocation: {
                                      ...rowData?.siteLocation,
                                      number: parts[0],
                                      street: parts[1],
                                      suburb: parts[2],
                                      state: parts[3],
                                      postcode: parts[4],
                                      country: parts[5],
                                    },
                                  } as ShowRecord);
                                }}
                              />
                            ) : (
                              <div className="text-xs whitespace-normal">{formatAddress(show.siteLocation)}</div>
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.eventOrganiser}
                                onChange={(val) => setEditData({ ...rowData, eventOrganiser: val } as ShowRecord)}
                              />
                            ) : (
                              formatValue(show.eventOrganiser)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.caravansOnDisplay}
                                onChange={(val) => setEditData({ ...rowData, caravansOnDisplay: val } as ShowRecord)}
                                type="number"
                              />
                            ) : (
                              formatValue(show.caravansOnDisplay)
                            )}
                          </td>
                          <td className="px-3 py-3 border-r-2 border-slate-200">
                            {isEditing ? (
                              <EditCell
                                value={rowData?.standSize}
                                onChange={(val) => setEditData({ ...rowData, standSize: val } as ShowRecord)}
                              />
                            ) : (
                              formatValue(show.standSize)
                            )}
                          </td>

                          {/* Edit Mode Controls */}
                          {isEditMode && (
                            <>
                              <td className="px-3 py-3 border-r-2 border-slate-200">
                                <select
                                  value={rowData?.rowColor || 'bg-white'}
                                  onChange={(e) => handleRowColorChange(show.id || '', e.target.value)}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                >
                                  {ROW_COLORS.map((color) => (
                                    <option key={color} value={color}>
                                      {color.replace('bg-', '').replace('-50', '').toUpperCase() || 'White'}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {isEditing ? (
                                  <div className="flex gap-2 justify-center">
                                    <Button
                                      size="sm"
                                      onClick={handleSaveEdit}
                                      disabled={isSaving}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      <Save className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancel}
                                      disabled={isSaving}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => handleEditClick(show)}
                                    className="bg-blue-600 hover:bg-blue-700"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
