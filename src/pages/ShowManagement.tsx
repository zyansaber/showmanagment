import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2 } from 'lucide-react';
import { dbGet, dbPush, dbRemove } from '@/lib/firebase';
import type { Show, SiteLocation } from '@/types';
import { toast } from 'sonner';

export default function ShowManagement() {
  const navigate = useNavigate();
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingShow, setIsAddingShow] = useState(false);

  const [newShow, setNewShow] = useState<Partial<Show>>({
    name: '',
    siteLocation: {
      number: '',
      street: '',
      suburb: '',
      postcode: '',
      state: 'NSW',
      country: 'Australia'
    },
    dealership: '',
    startDate: '',
    finishDate: '',
    target2024: 0,
    sales2024: 0,
    target2025: 0,
    sales2025: 0,
    target2026: 0,
    sales2026: 0,
    eventOrganiser: '',
    caravansOnDisplay: 0,
    standSize: '',
    layoutAddress: '',
    status: 'Not Started'
  });

  useEffect(() => {
    loadShows();
  }, []);

  const loadShows = async () => {
    try {
      const showsData = await dbGet('shows');
      const allShows: Show[] = showsData ? Object.values(showsData) : [];
      setShows(allShows);
    } catch (error) {
      console.error('Error loading shows:', error);
      toast.error('Failed to load shows');
    } finally {
      setLoading(false);
    }
  };

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const parseValue = (value: string | number): number => {
    if (typeof value === 'number') return value;
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'na' || trimmed === 'n/a' || trimmed === '') return 0;
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  const formatValue = (value: number | undefined): string => {
    if (!value || value === 0) return 'N/A';
    return value.toString();
  };

  const handleAddShow = async () => {
    try {
      if (!newShow.name || !newShow.startDate || !newShow.finishDate) {
        toast.error('Please fill in all required fields');
        return;
      }

      const showId = `SHOW-${Date.now()}`;
      const duration = calculateDuration(newShow.startDate || '', newShow.finishDate || '');
      
      const show: Show = {
        id: showId,
        name: newShow.name || '',
        siteLocation: newShow.siteLocation as SiteLocation,
        dealership: newShow.dealership || '',
        startDate: newShow.startDate || '',
        finishDate: newShow.finishDate || '',
        showDuration: duration,
        target2024: parseValue(newShow.target2024 || 0),
        sales2024: parseValue(newShow.sales2024 || 0),
        target2025: parseValue(newShow.target2025 || 0),
        sales2025: parseValue(newShow.sales2025 || 0),
        target2026: parseValue(newShow.target2026 || 0),
        sales2026: parseValue(newShow.sales2026 || 0),
        eventOrganiser: newShow.eventOrganiser || '',
        caravansOnDisplay: parseValue(newShow.caravansOnDisplay || 0),
        standSize: newShow.standSize || '',
        layoutAddress: newShow.layoutAddress || '',
        status: 'Not Started',
        teamMembers: []
      };
      
      await dbPush('shows', show);
      setShows([...shows, show]);
      setIsAddingShow(false);
      toast.success('Show added successfully');
      resetForm();
    } catch (error) {
      console.error('Error adding show:', error);
      toast.error('Failed to add show');
    }
  };

  const resetForm = () => {
    setNewShow({
      name: '',
      siteLocation: {
        number: '',
        street: '',
        suburb: '',
        postcode: '',
        state: 'NSW',
        country: 'Australia'
      },
      dealership: '',
      startDate: '',
      finishDate: '',
      target2024: 0,
      sales2024: 0,
      target2025: 0,
      sales2025: 0,
      target2026: 0,
      sales2026: 0,
      eventOrganiser: '',
      caravansOnDisplay: 0,
      standSize: '',
      layoutAddress: '',
      status: 'Not Started'
    });
  };

  const handleDeleteShow = async (showId: string) => {
    if (window.confirm('Are you sure you want to delete this show?')) {
      try {
        await dbRemove(`shows/${showId}`);
        setShows(shows.filter(s => s.id !== showId));
        toast.success('Show deleted successfully');
      } catch (error) {
        console.error('Error deleting show:', error);
        toast.error('Failed to delete show');
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      Completed: 'bg-green-500',
      'In Progress': 'bg-blue-500',
      'Not Started': 'bg-gray-500',
    };
    return <Badge className={colors[status] || 'bg-gray-500'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading shows...</div>
      </div>
    );
  }

  const ShowFormContent = () => (
    <div className="space-y-6 py-4">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Basic Information</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="name">Show Name *</Label>
            <Input
              id="name"
              value={newShow.name}
              onChange={(e) => setNewShow({ ...newShow, name: e.target.value })}
              placeholder="e.g., Sydney Caravan Show 2025"
            />
          </div>
          <div>
            <Label htmlFor="dealership">Dealership</Label>
            <Input
              id="dealership"
              value={newShow.dealership}
              onChange={(e) => setNewShow({ ...newShow, dealership: e.target.value })}
              placeholder="Enter dealership name"
            />
          </div>
          <div>
            <Label htmlFor="organiser">Event Organiser</Label>
            <Input
              id="organiser"
              value={newShow.eventOrganiser}
              onChange={(e) => setNewShow({ ...newShow, eventOrganiser: e.target.value })}
              placeholder="Enter organiser name"
            />
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Location</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="number">Number</Label>
            <Input
              id="number"
              value={newShow.siteLocation?.number}
              onChange={(e) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, number: e.target.value }
              })}
              placeholder="Street number"
            />
          </div>
          <div>
            <Label htmlFor="street">Street</Label>
            <Input
              id="street"
              value={newShow.siteLocation?.street}
              onChange={(e) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, street: e.target.value }
              })}
              placeholder="Street name"
            />
          </div>
          <div>
            <Label htmlFor="suburb">Suburb</Label>
            <Input
              id="suburb"
              value={newShow.siteLocation?.suburb}
              onChange={(e) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, suburb: e.target.value }
              })}
              placeholder="Suburb"
            />
          </div>
          <div>
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode"
              value={newShow.siteLocation?.postcode}
              onChange={(e) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, postcode: e.target.value }
              })}
              placeholder="Postcode"
            />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Select
              value={newShow.siteLocation?.state}
              onValueChange={(value) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, state: value }
              })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NSW">NSW</SelectItem>
                <SelectItem value="VIC">VIC</SelectItem>
                <SelectItem value="QLD">QLD</SelectItem>
                <SelectItem value="WA">WA</SelectItem>
                <SelectItem value="SA">SA</SelectItem>
                <SelectItem value="TAS">TAS</SelectItem>
                <SelectItem value="NT">NT</SelectItem>
                <SelectItem value="ACT">ACT</SelectItem>
                <SelectItem value="NZ">NZ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={newShow.siteLocation?.country}
              onChange={(e) => setNewShow({ 
                ...newShow, 
                siteLocation: { ...newShow.siteLocation!, country: e.target.value }
              })}
              placeholder="Country"
            />
          </div>
        </div>
      </div>

      {/* Dates & Details */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Dates & Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate">Start Date *</Label>
            <Input
              id="startDate"
              type="date"
              value={newShow.startDate}
              onChange={(e) => setNewShow({ ...newShow, startDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="finishDate">Finish Date *</Label>
            <Input
              id="finishDate"
              type="date"
              value={newShow.finishDate}
              onChange={(e) => setNewShow({ ...newShow, finishDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="caravans">Caravans on Display (Enter N/A if unknown)</Label>
            <Input
              id="caravans"
              value={newShow.caravansOnDisplay}
              onChange={(e) => setNewShow({ ...newShow, caravansOnDisplay: e.target.value as unknown as number })}
              placeholder="Number of caravans or N/A"
            />
          </div>
          <div>
            <Label htmlFor="standSize">Stand Size</Label>
            <Input
              id="standSize"
              value={newShow.standSize}
              onChange={(e) => setNewShow({ ...newShow, standSize: e.target.value })}
              placeholder="e.g., 10m x 10m"
            />
          </div>
        </div>
      </div>

      {/* Targets */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Targets & Sales (Enter N/A if unknown)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="target2024">2024 Target</Label>
            <Input
              id="target2024"
              value={newShow.target2024}
              onChange={(e) => setNewShow({ ...newShow, target2024: e.target.value as unknown as number })}
              placeholder="Target or N/A"
            />
          </div>
          <div>
            <Label htmlFor="sales2024">2024 Sales</Label>
            <Input
              id="sales2024"
              value={newShow.sales2024}
              onChange={(e) => setNewShow({ ...newShow, sales2024: e.target.value as unknown as number })}
              placeholder="Sales or N/A"
            />
          </div>
          <div></div>
          <div>
            <Label htmlFor="target2025">2025 Target</Label>
            <Input
              id="target2025"
              value={newShow.target2025}
              onChange={(e) => setNewShow({ ...newShow, target2025: e.target.value as unknown as number })}
              placeholder="Target or N/A"
            />
          </div>
          <div>
            <Label htmlFor="sales2025">2025 Sales</Label>
            <Input
              id="sales2025"
              value={newShow.sales2025}
              onChange={(e) => setNewShow({ ...newShow, sales2025: e.target.value as unknown as number })}
              placeholder="Sales or N/A"
            />
          </div>
          <div></div>
          <div>
            <Label htmlFor="target2026">2026 Target</Label>
            <Input
              id="target2026"
              value={newShow.target2026}
              onChange={(e) => setNewShow({ ...newShow, target2026: e.target.value as unknown as number })}
              placeholder="Target or N/A"
            />
          </div>
          <div>
            <Label htmlFor="sales2026">2026 Sales</Label>
            <Input
              id="sales2026"
              value={newShow.sales2026}
              onChange={(e) => setNewShow({ ...newShow, sales2026: e.target.value as unknown as number })}
              placeholder="Sales or N/A"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => {
          setIsAddingShow(false);
          resetForm();
        }}>
          Cancel
        </Button>
        <Button onClick={handleAddShow}>Add Show</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Show Management</CardTitle>
              <CardDescription>Manage all caravan shows and events</CardDescription>
            </div>
            <Dialog open={isAddingShow} onOpenChange={setIsAddingShow}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Show
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Show</DialogTitle>
                  <DialogDescription>Enter complete show information (use N/A for unknown values)</DialogDescription>
                </DialogHeader>
                <ShowFormContent />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {shows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Show Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>2025 Target</TableHead>
                  <TableHead>2025 Sales</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shows.map((show) => {
                  try {
                    return (
                      <TableRow key={show.id}>
                        <TableCell 
                          className="font-medium cursor-pointer hover:text-blue-600 hover:underline"
                          onClick={() => navigate(`/show/${show.id}`)}
                        >
                          {show.name || 'Unnamed Show'}
                        </TableCell>
                        <TableCell>
                          {show.siteLocation?.suburb || 'N/A'}, {show.siteLocation?.state || 'N/A'}
                        </TableCell>
                        <TableCell>{show.startDate || 'N/A'}</TableCell>
                        <TableCell>{show.finishDate || 'N/A'}</TableCell>
                        <TableCell>{show.showDuration || 0} days</TableCell>
                        <TableCell>{formatValue(show.target2025)}</TableCell>
                        <TableCell>{formatValue(show.sales2025)}</TableCell>
                        <TableCell>{getStatusBadge(show.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/show/${show.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteShow(show.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  } catch (error) {
                    console.error('Error rendering show row:', error);
                    return null;
                  }
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No shows yet. Add your first show to get started.</p>
              <Button onClick={() => setIsAddingShow(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Show
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}