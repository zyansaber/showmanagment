import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StateData {
  shows: number;
  totalSales: number;
  totalDays: number;
}

interface AustraliaMapProps {
  stateStats: Record<string, StateData>;
  onStateClick: (state: string) => void;
  selectedState: string;
}

const MAP_EMBED_URL =
  'https://www.openstreetmap.org/export/embed.html?bbox=110.0%2C-48.0%2C180.0%2C-10.0&layer=mapnik';

const MARKERS: Array<{
  code: string;
  label: string;
  top: string;
  left: string;
}> = [
  { code: 'WA', label: 'Western Australia', top: '58%', left: '20%' },
  { code: 'NT', label: 'Northern Territory', top: '30%', left: '38%' },
  { code: 'SA', label: 'South Australia', top: '60%', left: '40%' },
  { code: 'QLD', label: 'Queensland', top: '34%', left: '58%' },
  { code: 'NSW', label: 'New South Wales', top: '55%', left: '65%' },
  { code: 'VIC', label: 'Victoria', top: '68%', left: '63%' },
  { code: 'TAS', label: 'Tasmania', top: '83%', left: '68%' },
  { code: 'ACT', label: 'ACT', top: '58%', left: '62%' },
  { code: 'NZ', label: 'New Zealand', top: '65%', left: '88%' },
];

const DEFAULT_STATS: StateData = {
  shows: 0,
  totalSales: 0,
  totalDays: 0,
};

const formatNumber = (value: number) =>
  value > 0 ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : 'N/A';

const formatCurrency = (value: number) =>
  value > 0 ? `$${value.toLocaleString('en-AU', { maximumFractionDigits: 0 })}` : 'N/A';

export default function AustraliaMap({ stateStats, onStateClick, selectedState }: AustraliaMapProps) {
  const aggregate = useMemo(() => {
    const totals = Object.values(stateStats).reduce(
      (acc, stats) => {
        acc.shows += stats.shows;
        acc.totalSales += stats.totalSales;
        acc.totalDays += stats.totalDays;
        return acc;
      },
      { ...DEFAULT_STATS }
    );

    return totals;
  }, [stateStats]);

  const selectedStats = selectedState === 'All'
    ? aggregate
    : stateStats[selectedState] ?? DEFAULT_STATS;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]" />
        <div className="relative aspect-[1200/720]">
          <iframe
            src={MAP_EMBED_URL}
            title="Australia and New Zealand map"
            className="absolute inset-0 h-full w-full border-0 opacity-90"
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/10 via-slate-950/10 to-blue-900/20 mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(15,23,42,0.55),transparent_70%)]" />

          <div className="absolute left-6 top-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onStateClick('All')}
              className={cn(
                'rounded-full border border-white/20 bg-white/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-white backdrop-blur transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900',
                selectedState === 'All' && 'bg-blue-500 text-white border-blue-400 hover:bg-blue-500'
              )}
            >
              All Regions
            </button>
            <div className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-200 backdrop-blur">
              {formatNumber(aggregate.shows)} shows tracked
            </div>
          </div>

          {MARKERS.map((marker) => {
            const stats = stateStats[marker.code] ?? DEFAULT_STATS;
            const isActive = selectedState === marker.code;
            const hasShows = stats.shows > 0;

            return (
              <button
                key={marker.code}
                type="button"
                onClick={() => onStateClick(marker.code)}
                style={{ top: marker.top, left: marker.left }}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] shadow-lg transition focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900',
                  isActive
                    ? 'border-blue-400 bg-blue-500 text-white'
                    : 'border-white/30 bg-white/80 text-slate-800 hover:bg-white'
                )}
              >
                <span>{marker.code}</span>
                {hasShows && (
                  <span className="ml-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-bold text-white">
                    {stats.shows}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-4">
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 px-6 py-4 text-center text-slate-100 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300">{selectedState === 'All' ? 'All Regions' : selectedState}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm">
                <span>
                  <strong className="text-base font-semibold text-white">{formatNumber(selectedStats.shows)}</strong>
                  <span className="ml-1 text-slate-300">shows</span>
                </span>
                <span>
                  <strong className="text-base font-semibold text-white">{formatCurrency(selectedStats.totalSales)}</strong>
                  <span className="ml-1 text-slate-300">sales</span>
                </span>
                <span>
                  <strong className="text-base font-semibold text-white">{formatNumber(selectedStats.totalDays)}</strong>
                  <span className="ml-1 text-slate-300">days</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MARKERS.map((marker) => {
          const stats = stateStats[marker.code];
          if (!stats) return null;

          return (
            <div
              key={`summary-${marker.code}`}
              className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">{marker.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(stats.shows)}</p>
                </div>
                <Badge variant="outline" className="border-slate-300 bg-white text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  {marker.code}
                </Badge>
              </div>
              <div className="mt-4 space-y-1 text-sm text-slate-600">
                <p>
                  Sales: <span className="font-semibold text-slate-900">{formatCurrency(stats.totalSales)}</span>
                </p>
                <p>
                  Days on show: <span className="font-semibold text-slate-900">{formatNumber(stats.totalDays)}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
