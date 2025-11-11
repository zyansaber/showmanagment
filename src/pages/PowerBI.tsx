import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, RefreshCcw, Copy } from 'lucide-react';
import { dbGet } from '@/lib/firebase';

const BACKGROUND_BLOBS = [
  { className: 'bg-blue-500/40', size: 420, top: '-15%', left: '-8%', blur: 'blur-3xl' },
  { className: 'bg-indigo-500/30', size: 380, top: '20%', left: '60%', blur: 'blur-3xl' },
  { className: 'bg-cyan-400/25', size: 320, top: '65%', left: '10%', blur: 'blur-2xl' },
];

export default function PowerBI() {
  const [biUrl, setBiUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

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

  useEffect(() => {
    if (copyState === 'copied') {
      const timeout = setTimeout(() => setCopyState('idle'), 2000);
      return () => clearTimeout(timeout);
    }
    if (copyState === 'error') {
      const timeout = setTimeout(() => setCopyState('idle'), 3000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [copyState]);

  const domain = useMemo(() => {
    if (!biUrl) return '';
    try {
      const url = new URL(biUrl);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [biUrl]);

  const handleRefresh = () => setRefreshKey((value) => value + 1);

  const handleOpenExternal = () => {
    if (!biUrl) return;
    window.open(biUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyUrl = async () => {
    if (!biUrl) return;
    try {
      await navigator.clipboard.writeText(biUrl);
      setCopyState('copied');
    } catch (error) {
      console.error('Failed to copy BI URL', error);
      setCopyState('error');
    }
  };

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/40 bg-slate-950/90 p-12 shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.18),transparent_60%)]" />
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
          <motion.div
            className="h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/70 via-indigo-500/60 to-cyan-400/70"
            animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <p className="text-lg font-medium text-slate-200">Preparing your Power BI experience…</p>
          <p className="text-sm text-slate-400">
            Fetching the latest embedded analytics link from Firebase.
          </p>
        </div>
      </div>
    );
  }

  if (!biUrl) {
    return (
      <Card className="overflow-hidden border border-dashed border-slate-200/70 bg-white/60 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-slate-900">Power BI Report</CardTitle>
          <CardDescription className="text-slate-500">
            No Power BI report URL has been configured yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Add a <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">bi/url</code> entry in Firebase Realtime Database
            to embed the latest analytics experience here.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            Need inspiration? Try wiring multiple report tabs into a single published link so teams land in the correct
            workspace instantly.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative space-y-8">
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),transparent_65%)]" />

      <div className="relative isolate overflow-hidden rounded-3xl border border-white/15 bg-slate-950/70 shadow-[0_40px_90px_-40px_rgba(15,23,42,0.8)] backdrop-blur">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {BACKGROUND_BLOBS.map((blob, index) => (
            <div
              key={index}
              className={`absolute ${blob.className} ${blob.blur}`}
              style={{
                width: blob.size,
                height: blob.size,
                top: blob.top,
                left: blob.left,
                borderRadius: blob.size,
              }}
            />
          ))}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.75),transparent_70%)]" />
        </div>

        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Embedded Analytics</p>
                <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Power BI Experience Hub</h1>
                {domain && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                    <Badge variant="outline" className="border-slate-500/60 bg-white/5 text-slate-200">
                      {domain}
                    </Badge>
                    <span>is supplying this live report.</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="border-slate-600/70 bg-white/10 text-slate-200 hover:bg-white/20" onClick={handleRefresh}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Refresh Embed
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-400" onClick={handleOpenExternal}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open in Tab
                </Button>
              </div>
            </div>

            <motion.div
              key={refreshKey}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/60 shadow-[0_25px_60px_-25px_rgba(59,130,246,0.45)]"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/30 via-transparent to-blue-500/10" />
                <iframe
                  key={`${refreshKey}-${biUrl}`}
                  src={biUrl}
                  title="Power BI Report"
                  allowFullScreen
                  className="relative z-10 h-[720px] w-full border-0"
                />
              </div>
            </motion.div>
          </div>

          <aside className="relative z-10 flex flex-col gap-6 border-t border-white/5 bg-white/5 p-6 backdrop-blur sm:p-8 lg:border-l lg:border-t-0">
            <Card className="border border-white/10 bg-white/5 text-slate-100 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Report Controls</CardTitle>
                <CardDescription className="text-slate-300/70">
                  Keep the embed fresh and shareable for the broader team.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  variant="secondary"
                  className="w-full border border-white/10 bg-slate-900/80 text-slate-100 hover:bg-slate-900"
                  onClick={handleCopyUrl}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copyState === 'copied' ? 'Copied report link' : copyState === 'error' ? 'Copy failed – retry' : 'Copy embed URL'}
                </Button>
                <div className="space-y-3 text-sm text-slate-300/80">
                  <p className="flex items-start gap-3">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_0_4px_rgba(34,197,94,0.15)]" />
                    Changes to the Power BI report publish link update here automatically after a refresh.
                  </p>
                  <p className="flex items-start gap-3">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400/80 shadow-[0_0_0_4px_rgba(56,189,248,0.15)]" />
                    Embed runs inside a hardened glassmorphic shell for focus and readability.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/5 text-slate-100 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Best Practice</CardTitle>
                <CardDescription className="text-slate-300/70">
                  Encourage teams to bookmark this hub rather than individual report tabs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-300/80">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-slate-100">One-link distribution</p>
                  <p className="mt-1 text-slate-300/80">
                    Publish a single Power BI app and surface it here to minimise version drift across state teams.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-slate-100">Optimised fullscreen</p>
                  <p className="mt-1 text-slate-300/80">
                    Use the “Open in Tab” control for presentations or kiosk screens—navigation chrome is stripped away
                    for maximum canvas space.
                  </p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
