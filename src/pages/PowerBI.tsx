import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCcw, ExternalLink } from 'lucide-react';
import { dbGet } from '@/lib/firebase';

export default function PowerBI() {
  const [biUrl, setBiUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
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

    loadBiUrl();
  }, []);

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  const handleOpenExternal = () => {
    if (!biUrl) return;
    window.open(biUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-800 bg-slate-950/80 p-16 text-center shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),transparent_65%)]" />
        <div className="relative flex flex-col items-center gap-4 text-slate-200">
          <motion.div
            className="grid h-32 w-32 place-items-center rounded-full bg-gradient-to-br from-sky-500/70 via-indigo-500/60 to-blue-400/70"
            animate={{ scale: [1, 1.04, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Loader2 className="h-12 w-12 animate-spin text-white" />
          </motion.div>
          <p className="text-lg font-semibold tracking-wide text-white/90">Loading Power BI</p>
        </div>
      </div>
    );
  }

  if (!biUrl) {
    return (
      <div className="rounded-[2.5rem] border border-dashed border-slate-300/60 bg-white/60 p-12 text-center shadow-xl">
        <p className="text-xl font-semibold text-slate-700">No Power BI report has been linked yet.</p>
        <p className="mt-2 text-sm text-slate-500">Add a bi/url entry in Firebase to surface the embed here.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950/80 shadow-[0_40px_120px_-30px_rgba(15,23,42,0.9)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_70%)]" />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900/95" />
      <div className="absolute inset-0 opacity-30 blur-3xl" style={{ background: 'conic-gradient(from 90deg at 20% 20%, #22d3ee33, #6366f133, transparent 65%)' }} />

      <div className="relative space-y-6 p-6 sm:p-10">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              onClick={handleRefresh}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button className="bg-sky-500 text-white hover:bg-sky-400" onClick={handleOpenExternal}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
          </div>
        </div>

        <motion.div
          key={refreshKey}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 shadow-[0_25px_70px_-25px_rgba(56,189,248,0.45)]"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-transparent to-sky-500/20" />
            <iframe
              key={`${refreshKey}-${biUrl}`}
              src={biUrl}
              title="Power BI Report"
              allowFullScreen
              loading="lazy"
              className="relative z-10 h-[860px] w-full border-0"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
