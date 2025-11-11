import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Building2 } from 'lucide-react';
import { dbGet } from '@/lib/firebase';
import type { Show } from '@/types';

interface DealershipWithShows {
  name: string;
  shows: Show[];
}

export default function DealershipManagement() {
  const [dealerships, setDealerships] = useState<DealershipWithShows[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDealership, setSelectedDealership] = useState<DealershipWithShows | null>(null);

  useEffect(() => {
    loadDealerships();
  }, []);

  const loadDealerships = async () => {
    try {
      const showsData = await dbGet('shows');
      
      if (showsData) {
        const allShows: Show[] = Object.values(showsData);
        const dealerMap: Record<string, Show[]> = {};
        
        allShows.forEach((show) => {
          const dealerName = show.dealership;
          if (dealerName && dealerName.trim() && dealerName.toLowerCase() !== 'n/a') {
            if (!dealerMap[dealerName]) {
              dealerMap[dealerName] = [];
            }
            dealerMap[dealerName].push(show);
          }
        });

        const dealershipList: DealershipWithShows[] = Object.entries(dealerMap)
          .map(([name, shows]) => ({
            name,
            shows
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setDealerships(dealershipList);
      }
    } catch (error) {
      console.error('Error loading dealerships:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDealerships = dealerships.filter(d =>
    d.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading dealerships...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Show Dealership Management</h1>
          <p className="text-gray-600 mt-2">Manage dealerships and their associated shows</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          <Building2 className="h-5 w-5 mr-2" />
          {dealerships.length} Dealerships
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Dealerships</CardTitle>
          <CardDescription>Find and view dealership information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by dealership name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Dealership List</CardTitle>
            <CardDescription>{filteredDealerships.length} dealerships found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredDealerships.map((dealership) => (
                <div
                  key={dealership.name}
                  className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                    selectedDealership?.name === dealership.name ? 'bg-blue-50 border-blue-500' : ''
                  }`}
                  onClick={() => setSelectedDealership(dealership)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Building2 className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <span className="font-semibold text-sm break-words">{dealership.name}</span>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0">{dealership.shows.length}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="break-words">
              {selectedDealership ? `${selectedDealership.name}` : 'Select a Dealership'}
            </CardTitle>
            <CardDescription>
              {selectedDealership ? `${selectedDealership.shows.length} shows associated` : 'Click on a dealership to view shows'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedDealership ? (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {selectedDealership.shows.map((show) => (
                  <div key={show.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-lg">{show.name}</h3>
                        <Badge variant={
                          show.status === 'Completed' ? 'default' :
                          show.status === 'In Progress' ? 'secondary' : 'outline'
                        }>
                          {show.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>📍 Location: {show.siteLocation?.suburb}, {show.siteLocation?.state}</p>
                        <p>📅 Dates: {show.startDate} to {show.finishDate}</p>
                        <p>🎯 2025 Target: {show.target2025 > 0 ? show.target2025 : 'N/A'}</p>
                        <p>💰 2025 Sales: {show.sales2025 > 0 ? show.sales2025 : 'N/A'}</p>
                        {show.caravansOnDisplay > 0 && (
                          <p>🚐 Caravans on Display: {show.caravansOnDisplay}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Select a dealership from the list to view associated shows</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}