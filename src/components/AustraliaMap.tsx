import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { regionFeatures } from '@/data/australiaRegions';

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

interface ProjectedRegion {
  id: string;
  name: string;
  projectedRings: Array<Array<{ x: number; y: number }>>;
  labelPoint: { x: number; y: number };
}

const MAP_WIDTH = 920;
const MAP_HEIGHT = 680;

const stateColors: Record<string, string> = {
  WA: '#2563eb',
  NT: '#a855f7',
  SA: '#f97316',
  QLD: '#22c55e',
  NSW: '#3b82f6',
  VIC: '#6366f1',
  TAS: '#14b8a6',
  ACT: '#f59e0b',
  NZ: '#0ea5e9',
  All: '#0f172a',
};

const legendStates = ['All', 'WA', 'NT', 'SA', 'QLD', 'NSW', 'VIC', 'TAS', 'ACT', 'NZ'];

const DEFAULT_STATS: StateData = {
  shows: 0,
  totalSales: 0,
  totalDays: 0,
};

const formatNumber = (value: number) =>
  value > 0 ? value.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : 'N/A';

const toPath = (ring: Array<{ x: number; y: number }>) => {
  if (ring.length === 0) return '';
  const [first, ...rest] = ring;
  const commands = rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${commands} Z`;
};

export default function AustraliaMap({ stateStats, onStateClick, selectedState }: AustraliaMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const mapGeometry = useMemo(() => {
    const allCoordinates = regionFeatures.flatMap((region) =>
      region.coordinates.flatMap((ring) => ring)
    );

    const lons = allCoordinates.map(([lon]) => lon);
    const lats = allCoordinates.map(([, lat]) => lat);

    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const project = (lon: number, lat: number) => {
      const x = ((lon - minLon) / (maxLon - minLon)) * MAP_WIDTH;
      const y = (1 - (lat - minLat) / (maxLat - minLat)) * MAP_HEIGHT;
      return { x, y };
    };

    const projectedRegions: ProjectedRegion[] = regionFeatures.map((region) => ({
      id: region.id,
      name: region.name,
      projectedRings: region.coordinates.map((ring) => ring.map(([lon, lat]) => project(lon, lat))),
      labelPoint: project(region.label.lon, region.label.lat),
    }));

    const backgroundOutline = projectedRegions
      .filter((region) => region.id !== 'NZ')
      .flatMap((region) => region.projectedRings)
      .map((ring) => toPath(ring));

    return { regions: projectedRegions, backgroundOutline };
  }, []);

  const aggregatedStats = useMemo(() => {
    return Object.values(stateStats).reduce(
      (acc, stats) => ({
        shows: acc.shows + (stats?.shows ?? 0),
        totalSales: acc.totalSales + (stats?.totalSales ?? 0),
        totalDays: acc.totalDays + (stats?.totalDays ?? 0),
      }),
      { ...DEFAULT_STATS }
    );
  }, [stateStats]);

  const displayState = hoveredState ?? (selectedState !== 'All' ? selectedState : null);
  const displayStats = displayState
    ? stateStats[displayState] ?? { ...DEFAULT_STATS }
    : aggregatedStats;
  const displayLabel = displayState ?? 'All Regions';

  const getFillOpacity = (regionId: string) => {
    const hasShows = (stateStats[regionId]?.shows ?? 0) > 0;
    if (selectedState === regionId) return 0.95;
    if (hoveredState === regionId) return 0.82;
    if (selectedState === 'All') {
      return hasShows ? 0.7 : 0.32;
    }
    return hasShows ? 0.5 : 0.2;
  };

  const handleStateClick = (state: string) => {
    if (selectedState === state) {
      onStateClick('All');
      return;
    }
    onStateClick(state);
  };

  const summaryTiles = [
    {
      label: 'Total Shows',
      value: displayStats.shows.toString(),
    },
    {
      label: 'Total Sales',
      value: formatNumber(displayStats.totalSales),
    },
    {
      label: 'Total Days',
      value: displayStats.totalDays > 0 ? displayStats.totalDays.toString() : 'N/A',
    },
    displayStats.totalDays > 0 && displayStats.totalSales > 0
      ? {
          label: 'Avg Daily Sales',
          value: (displayStats.totalSales / displayStats.totalDays).toFixed(1),
        }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="w-full h-auto" role="img" aria-labelledby="mapTitle">
        <title id="mapTitle">Australia and New Zealand show statistics map</title>
        <defs>
          <linearGradient id="oceanGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <pattern id="oceanPattern" width="120" height="120" patternUnits="userSpaceOnUse">
            <path
              d="M0 60 Q30 30 60 60 T120 60"
              fill="none"
              stroke="rgba(14, 116, 144, 0.2)"
              strokeWidth="1.5"
            />
            <path
              d="M0 100 Q30 70 60 100 T120 100"
              fill="none"
              stroke="rgba(14, 116, 144, 0.15)"
              strokeWidth="1.5"
            />
          </pattern>
          <radialGradient id="spotlight" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="stateShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="rgba(15,23,42,0.25)" />
          </filter>
          <filter id="labelShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="rgba(15,23,42,0.35)" />
          </filter>
        </defs>

        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#oceanGradient)" rx="32" />
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#oceanPattern)" opacity="0.4" rx="32" />
        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#spotlight)" rx="32" opacity="0.65" />

        <g opacity={0.18} stroke="rgba(14,116,144,0.25)" strokeWidth="1">
          {Array.from({ length: 6 }).map((_, index) => {
            const y = ((index + 1) / 7) * MAP_HEIGHT;
            return <line key={`h-${index}`} x1={64} y1={y} x2={MAP_WIDTH - 64} y2={y} />;
          })}
          {Array.from({ length: 8 }).map((_, index) => {
            const x = ((index + 1) / 9) * MAP_WIDTH;
            return <line key={`v-${index}`} y1={48} x1={x} y2={MAP_HEIGHT - 48} x2={x} />;
          })}
        </g>

        <g>
          {mapGeometry.backgroundOutline.map((path, index) => (
            <path
              key={`outline-${index}`}
              d={path}
              fill="rgba(15,23,42,0.04)"
              stroke="rgba(15,23,42,0.12)"
              strokeWidth={4}
            />
          ))}
        </g>

        <g>
          {mapGeometry.regions.map((region) => {
            const color = stateColors[region.id] ?? stateColors.NZ;
            const isActive = selectedState === region.id || hoveredState === region.id;
            const opacity = getFillOpacity(region.id);

            return (
              <g key={region.id}>
                {region.projectedRings.map((ring, ringIndex) => (
                  <path
                    key={`${region.id}-${ringIndex}`}
                    d={toPath(ring)}
                    fill={color}
                    fillOpacity={opacity}
                    stroke={isActive ? '#0f172a' : 'rgba(15,23,42,0.55)'}
                    strokeWidth={isActive ? 3.5 : 2.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="transition-all duration-300 cursor-pointer"
                    style={{ filter: isActive ? 'url(#stateShadow)' : undefined }}
                    onClick={() => handleStateClick(region.id)}
                    onMouseEnter={() => setHoveredState(region.id)}
                    onMouseLeave={() => setHoveredState(null)}
                  />
                ))}

                <text
                  x={region.labelPoint.x}
                  y={region.labelPoint.y}
                  textAnchor="middle"
                  className="fill-white font-semibold drop-shadow-md uppercase tracking-wide"
                  style={{
                    fontSize: region.id === 'ACT' ? '11px' : region.id === 'NZ' ? '14px' : '16px',
                    letterSpacing: '0.1em',
                    pointerEvents: 'none',
                    filter: 'url(#labelShadow)',
                  }}
                >
                  {region.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur px-6 py-5 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">{displayLabel}</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{displayStats.shows} shows</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {summaryTiles.map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {tile.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{tile.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-3 rounded-full bg-white/85 px-6 py-3 shadow-lg backdrop-blur">
        {legendStates.map((state) => {
          const color = stateColors[state] ?? stateColors.NZ;
          const isActive =
            state === 'All'
              ? selectedState === 'All'
              : selectedState === state || (selectedState === 'All' && hoveredState === state);
          const stats = state === 'All' ? aggregatedStats : stateStats[state] ?? DEFAULT_STATS;

          return (
            <Badge
              key={state}
              variant="outline"
              className="cursor-pointer border-2 px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-all"
              style={{
                backgroundColor: isActive ? color : 'transparent',
                borderColor: color,
                color: isActive ? '#ffffff' : color,
              }}
              onClick={() => handleStateClick(state)}
              onMouseEnter={() => state !== 'All' && setHoveredState(state)}
              onMouseLeave={() => state !== 'All' && setHoveredState(null)}
            >
              {state === 'All' ? `All (${stats.shows})` : `${state} (${stats.shows})`}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
