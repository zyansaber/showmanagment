import { useId, useMemo, useState } from 'react';
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

interface Point {
  x: number;
  y: number;
}

interface ProjectedRegion {
  id: string;
  name: string;
  smoothPaths: string[];
  labelPoint: Point;
}

interface CityPoint {
  name: string;
  region: string;
  point: Point;
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const MAP_PADDING = 68;

const GRID_LATITUDES = [-44, -36, -28, -20, -12];
const GRID_LONGITUDES = [112, 120, 128, 136, 144, 152, 160, 168, 174];

const CITY_COORDS = [
  { name: 'Perth', lon: 115.86, lat: -31.95, region: 'WA' },
  { name: 'Darwin', lon: 130.84, lat: -12.46, region: 'NT' },
  { name: 'Adelaide', lon: 138.6, lat: -34.93, region: 'SA' },
  { name: 'Brisbane', lon: 153.02, lat: -27.47, region: 'QLD' },
  { name: 'Sydney', lon: 151.21, lat: -33.87, region: 'NSW' },
  { name: 'Melbourne', lon: 144.96, lat: -37.81, region: 'VIC' },
  { name: 'Hobart', lon: 147.33, lat: -42.88, region: 'TAS' },
  { name: 'Canberra', lon: 149.13, lat: -35.28, region: 'ACT' },
  { name: 'Auckland', lon: 174.76, lat: -36.85, region: 'NZ' },
  { name: 'Wellington', lon: 174.78, lat: -41.29, region: 'NZ' },
];

const CITY_LABEL_OFFSETS: Record<string, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  Perth: { dx: -18, dy: -10, anchor: 'end' },
  Darwin: { dx: 14, dy: -8, anchor: 'start' },
  Adelaide: { dx: 16, dy: 18, anchor: 'start' },
  Brisbane: { dx: 16, dy: -4, anchor: 'start' },
  Sydney: { dx: 16, dy: 16, anchor: 'start' },
  Melbourne: { dx: -18, dy: 18, anchor: 'end' },
  Hobart: { dx: -16, dy: 22, anchor: 'end' },
  Canberra: { dx: -18, dy: -14, anchor: 'end' },
  Auckland: { dx: 16, dy: -10, anchor: 'start' },
  Wellington: { dx: 18, dy: 12, anchor: 'start' },
};

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

const toMercator = (lon: number, lat: number): Point => {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  return {
    x: lambda,
    y: Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  };
};

const densifyRing = (ring: Point[]): Point[] => {
  if (ring.length < 2) return ring;
  const maxSegmentLength = 42;
  const densified: Point[] = [];

  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    densified.push(current);

    const distance = Math.hypot(next.x - current.x, next.y - current.y);
    if (distance > maxSegmentLength) {
      const segments = Math.floor(distance / maxSegmentLength);
      for (let s = 1; s <= segments; s++) {
        const t = s / (segments + 1);
        densified.push({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        });
      }
    }
  }

  return densified;
};

const createSmoothPath = (ring: Point[]) => {
  if (ring.length < 3) {
    if (ring.length === 0) return '';
    const [first, ...rest] = ring;
    const commands = rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${commands} Z`;
  }

  const tension = 0.22;
  let path = `M ${ring[0].x.toFixed(1)} ${ring[0].y.toFixed(1)}`;

  for (let i = 1; i <= ring.length; i++) {
    const current = ring[i % ring.length];
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const prevPrev = ring[(i - 2 + ring.length) % ring.length];
    const next = ring[(i + 1) % ring.length];

    const control1 = {
      x: prev.x + (current.x - prevPrev.x) * tension,
      y: prev.y + (current.y - prevPrev.y) * tension,
    };
    const control2 = {
      x: current.x - (next.x - prev.x) * tension,
      y: current.y - (next.y - prev.y) * tension,
    };

    path += ` C ${control1.x.toFixed(1)} ${control1.y.toFixed(1)}, ${control2.x.toFixed(1)} ${control2.y.toFixed(1)}, ${
      current.x.toFixed(1)
    } ${current.y.toFixed(1)}`;
  }

  return `${path} Z`;
};

const createLinePath = (points: Point[]) => {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  const commands = rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${commands}`;
};

export default function AustraliaMap({ stateStats, onStateClick, selectedState }: AustraliaMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const oceanGradientId = useId();
  const oceanPatternId = useId();
  const haloGradientId = useId();
  const labelShadowId = useId();
  const glowFilterId = useId();
  const landClipId = useId();

  const mapGeometry = useMemo(() => {
    const allCoordinates = regionFeatures.flatMap((region) =>
      region.coordinates.flatMap((ring) => ring)
    );

    const mercatorPoints = allCoordinates.map(([lon, lat]) => toMercator(lon, lat));
    const xs = mercatorPoints.map((point) => point.x);
    const ys = mercatorPoints.map((point) => point.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const scale = Math.min(
      (MAP_WIDTH - MAP_PADDING * 2) / (maxX - minX),
      (MAP_HEIGHT - MAP_PADDING * 2) / (maxY - minY)
    );

    const project = (lon: number, lat: number): Point => {
      const { x, y } = toMercator(lon, lat);
      return {
        x: (x - minX) * scale + MAP_PADDING,
        y: (maxY - y) * scale + MAP_PADDING,
      };
    };

    const projectedRegions: ProjectedRegion[] = regionFeatures.map((region) => {
      const smoothPaths = region.coordinates.map((ring) => {
        const projectedRing = ring.map(([lon, lat]) => project(lon, lat));
        return createSmoothPath(densifyRing(projectedRing));
      });

      return {
        id: region.id,
        name: region.name,
        smoothPaths,
        labelPoint: project(region.label.lon, region.label.lat),
      };
    });

    const silhouettePaths = projectedRegions.flatMap((region) => region.smoothPaths);

    const cityPoints: CityPoint[] = CITY_COORDS.map((city) => ({
      name: city.name,
      region: city.region,
      point: project(city.lon, city.lat),
    }));

    const latitudeLines = GRID_LATITUDES.map((latitude) => {
      const samples: Point[] = [];
      const startLon = 110;
      const endLon = 176;
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const lon = startLon + ((endLon - startLon) * i) / steps;
        samples.push(project(lon, latitude));
      }
      return createLinePath(samples);
    });

    const longitudeLines = GRID_LONGITUDES.map((longitude) => {
      const samples: Point[] = [];
      const startLat = -48;
      const endLat = -8;
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const lat = startLat + ((endLat - startLat) * i) / steps;
        samples.push(project(longitude, lat));
      }
      return createLinePath(samples);
    });

    return { regions: projectedRegions, silhouettePaths, cityPoints, latitudeLines, longitudeLines };
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

  const focusRegionId = hoveredState ?? (selectedState !== 'All' ? selectedState : null);
  const focusRegion = focusRegionId
    ? mapGeometry.regions.find((region) => region.id === focusRegionId)
    : null;
  const focusColor = focusRegion ? stateColors[focusRegion.id] ?? stateColors.NZ : stateColors.All;

  return (
    <div className="relative isolate">
      <div className="pointer-events-none absolute -inset-x-16 -top-32 h-64 bg-[radial-gradient(circle,_rgba(59,130,246,0.28),transparent_65%)] opacity-60 blur-3xl" />

      <div className="relative overflow-hidden rounded-[2.75rem] border border-white/70 bg-gradient-to-br from-slate-50 via-white to-indigo-100 shadow-[0_60px_140px_-80px_rgba(30,64,175,0.45)]">
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="h-auto w-full" role="img" aria-labelledby="mapTitle">
          <title id="mapTitle">Australia and New Zealand show statistics map</title>
          <defs>
            <linearGradient id={oceanGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(191,219,254,0.95)" />
              <stop offset="45%" stopColor="rgba(224,242,254,0.95)" />
              <stop offset="100%" stopColor="rgba(148,197,253,0.85)" />
            </linearGradient>
            <pattern id={oceanPatternId} width="140" height="140" patternUnits="userSpaceOnUse">
              <path
                d="M0 70 Q35 40 70 70 T140 70"
                fill="none"
                stroke="rgba(30,64,175,0.15)"
                strokeWidth="1.4"
              />
              <path
                d="M0 110 Q35 80 70 110 T140 110"
                fill="none"
                stroke="rgba(14,116,144,0.12)"
                strokeWidth="1.2"
              />
            </pattern>
            <radialGradient id={haloGradientId} cx="48%" cy="52%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.45)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={labelShadowId} x="-150%" y="-150%" width="300%" height="300%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(15,23,42,0.55)" />
            </filter>
            <clipPath id={landClipId}>
              {mapGeometry.silhouettePaths.map((path, index) => (
                <path key={`clip-${index}`} d={path} />
              ))}
            </clipPath>
          </defs>

          <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${oceanGradientId})`} rx="40" />
          <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${oceanPatternId})`} opacity="0.35" rx="40" />

          <g opacity={0.18} stroke="rgba(30,64,175,0.18)" strokeWidth="1">
            {mapGeometry.longitudeLines.map((line, index) => (
              <path key={`lon-${index}`} d={line} fill="none" strokeDasharray="12 16" />
            ))}
            {mapGeometry.latitudeLines.map((line, index) => (
              <path key={`lat-${index}`} d={line} fill="none" strokeDasharray="10 18" />
            ))}
          </g>

          <g clipPath={`url(#${landClipId})`}>
            <rect x="-40" y="-40" width={MAP_WIDTH + 80} height={MAP_HEIGHT + 80} fill={`url(#${haloGradientId})`} opacity="0.8" />
            {mapGeometry.silhouettePaths.map((path, index) => (
              <path key={`silhouette-${index}`} d={path} fill="rgba(15,23,42,0.04)" />
            ))}
          </g>

          {focusRegion?.smoothPaths.map((path, index) => (
            <path
              key={`focus-${focusRegion.id}-${index}`}
              d={path}
              fill="none"
              stroke={focusColor}
              strokeWidth={6}
              strokeOpacity={0.6}
              style={{ filter: `url(#${glowFilterId})`, pointerEvents: 'none' }}
            />
          ))}

          {mapGeometry.regions.map((region) => {
            const color = stateColors[region.id] ?? stateColors.NZ;
            const isActive = selectedState === region.id || hoveredState === region.id;
            const opacity = getFillOpacity(region.id);

            return region.smoothPaths.map((path, ringIndex) => (
              <path
                key={`${region.id}-${ringIndex}`}
                d={path}
                fill={color}
                fillOpacity={opacity}
                stroke={isActive ? 'rgba(15,23,42,0.55)' : 'rgba(15,23,42,0.28)'}
                strokeWidth={isActive ? 2.8 : 1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-500 ease-out [mix-blend-mode:multiply]"
                style={{ filter: isActive ? `url(#${glowFilterId})` : undefined }}
                onClick={() => handleStateClick(region.id)}
                onMouseEnter={() => setHoveredState(region.id)}
                onMouseLeave={() => setHoveredState(null)}
              />
            ));
          })}

          {mapGeometry.cityPoints.map((city) => {
            const color = stateColors[city.region] ?? stateColors.NZ;
            const offsets = CITY_LABEL_OFFSETS[city.name] ?? { dx: 12, dy: -8, anchor: 'start' as const };
            return (
              <g key={`city-${city.name}`} className="pointer-events-none">
                <circle
                  cx={city.point.x}
                  cy={city.point.y}
                  r={7}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.45}
                  strokeWidth={1.4}
                  className="animate-[ping_3s_ease-in-out_infinite]"
                  style={{ transformOrigin: `${city.point.x}px ${city.point.y}px` }}
                />
                <circle cx={city.point.x} cy={city.point.y} r={3.6} fill="#ffffff" stroke={color} strokeWidth={1.6} />
                <text
                  x={city.point.x + offsets.dx}
                  y={city.point.y + offsets.dy}
                  textAnchor={offsets.anchor}
                  className="text-xs font-semibold tracking-wide"
                  fill="rgba(15,23,42,0.78)"
                  style={{ filter: `url(#${labelShadowId})` }}
                >
                  {city.name}
                </text>
              </g>
            );
          })}

          {mapGeometry.regions.map((region) => (
            <text
              key={`label-${region.id}`}
              x={region.labelPoint.x}
              y={region.labelPoint.y}
              textAnchor="middle"
              className="font-semibold uppercase tracking-[0.28em]"
              fill="rgba(15,23,42,0.75)"
              style={{
                fontSize: region.id === 'ACT' ? 12 : region.id === 'NZ' ? 14 : 16,
                letterSpacing: '0.22em',
                pointerEvents: 'none',
                filter: `url(#${labelShadowId})`,
              }}
            >
              {region.id}
            </text>
          ))}
        </svg>
      </div>

      <div className="pointer-events-none absolute left-8 top-8 z-10 flex max-w-sm flex-col gap-4">
        <div className="pointer-events-auto rounded-[1.9rem] border border-white/70 bg-white/95 px-6 py-6 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <Badge className="rounded-full bg-slate-900 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white">
              {displayLabel}
            </Badge>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              {displayStats.shows} shows
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {summaryTiles.map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{tile.label}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{tile.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-3 rounded-full bg-white/90 px-6 py-3 shadow-xl backdrop-blur">
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
              className="flex items-center gap-1.5 rounded-full border-2 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] transition-all"
              style={{
                background: isActive
                  ? `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`
                  : 'rgba(255,255,255,0.85)',
                borderColor: color,
                color: isActive ? '#ffffff' : color,
                boxShadow: isActive ? `0 12px 32px -18px ${color}` : undefined,
              }}
              onClick={() => handleStateClick(state)}
              onMouseEnter={() => state !== 'All' && setHoveredState(state)}
              onMouseLeave={() => state !== 'All' && setHoveredState(null)}
            >
              <span>{state === 'All' ? 'All Regions' : state}</span>
              <span className="text-[10px] font-medium tracking-[0.2em] opacity-80">{stats.shows}</span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
