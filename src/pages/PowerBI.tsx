import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { dbGet } from '@/lib/firebase';

export default function PowerBI() {
  const [biUrl, setBiUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBiUrl();
  }, []);

  const loadBiUrl = async () => {
    try {
      const biData = await dbGet('bi');
      if (biData && biData.url) {
        setBiUrl(biData.url);
      }
    } catch (error) {
      console.error('Error loading BI URL:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading Power BI Report...</div>
      </div>
    );
  }

  if (!biUrl) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Power BI Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-gray-500">No Power BI report URL configured</p>
            <p className="text-sm text-gray-400 mt-2">Please configure the BI URL in Firebase database under 'bi/url'</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-2 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <CardTitle className="text-2xl font-bold">Power BI Analytics Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full h-[900px] bg-white rounded-b-lg overflow-hidden">
            <iframe
              src={biUrl}
              className="w-full h-full border-0"
              allowFullScreen
              title="Power BI Report"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}