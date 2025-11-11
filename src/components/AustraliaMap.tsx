import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

export default function AustraliaMap({ stateStats, onStateClick, selectedState }: AustraliaMapProps) {
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  const stateColors: Record<string, string> = {
    NSW: '#3b82f6',
    VIC: '#a855f7',
    QLD: '#f97316',
    WA: '#22c55e',
    SA: '#ef4444',
    TAS: '#14b8a6',
    NT: '#eab308',
    ACT: '#ec4899',
    NZ: '#6366f1',
  };

  const getStateColor = (state: string) => {
    if (selectedState === state) return stateColors[state];
    if (hoveredState === state) return stateColors[state];
    return '#e5e7eb';
  };

  const getStateOpacity = (state: string) => {
    if (selectedState === 'All') return hoveredState === state ? 0.8 : 0.5;
    if (selectedState === state) return 0.9;
    return 0.3;
  };

  // State center coordinates for labels
  const statePositions: Record<string, { x: number; y: number }> = {
    WA: { x: 200, y: 250 },
    NT: { x: 350, y: 180 },
    SA: { x: 380, y: 320 },
    QLD: { x: 500, y: 200 },
    NSW: { x: 540, y: 360 },
    VIC: { x: 520, y: 430 },
    TAS: { x: 540, y: 520 },
    ACT: { x: 560, y: 380 },
  };

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 800 600"
        className="w-full h-auto"
        style={{ maxHeight: '600px' }}
      >
        {/* Western Australia */}
        <path
          d="M 50 100 L 50 400 L 300 450 L 320 380 L 300 300 L 280 200 L 250 150 L 200 100 Z"
          fill={getStateColor('WA')}
          fillOpacity={getStateOpacity('WA')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('WA')}
          onMouseEnter={() => setHoveredState('WA')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* Northern Territory */}
        <path
          d="M 280 50 L 280 200 L 300 300 L 320 380 L 380 370 L 400 280 L 420 200 L 400 100 L 350 50 Z"
          fill={getStateColor('NT')}
          fillOpacity={getStateOpacity('NT')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('NT')}
          onMouseEnter={() => setHoveredState('NT')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* South Australia */}
        <path
          d="M 300 300 L 320 380 L 380 370 L 400 400 L 450 420 L 480 380 L 460 320 L 420 280 L 400 280 Z"
          fill={getStateColor('SA')}
          fillOpacity={getStateOpacity('SA')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('SA')}
          onMouseEnter={() => setHoveredState('SA')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* Queensland */}
        <path
          d="M 420 50 L 420 200 L 460 280 L 480 320 L 520 340 L 580 320 L 620 280 L 640 200 L 620 120 L 580 80 L 520 60 Z"
          fill={getStateColor('QLD')}
          fillOpacity={getStateOpacity('QLD')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('QLD')}
          onMouseEnter={() => setHoveredState('QLD')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* New South Wales */}
        <path
          d="M 480 320 L 520 340 L 580 320 L 600 360 L 620 400 L 600 440 L 560 450 L 520 440 L 480 420 L 460 380 Z"
          fill={getStateColor('NSW')}
          fillOpacity={getStateOpacity('NSW')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('NSW')}
          onMouseEnter={() => setHoveredState('NSW')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* Victoria */}
        <path
          d="M 450 420 L 480 420 L 520 440 L 560 450 L 580 470 L 560 490 L 500 500 L 450 480 Z"
          fill={getStateColor('VIC')}
          fillOpacity={getStateOpacity('VIC')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('VIC')}
          onMouseEnter={() => setHoveredState('VIC')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* Tasmania */}
        <path
          d="M 500 520 L 540 510 L 580 520 L 590 550 L 570 570 L 530 570 L 510 550 Z"
          fill={getStateColor('TAS')}
          fillOpacity={getStateOpacity('TAS')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300 hover:stroke-4"
          onClick={() => onStateClick('TAS')}
          onMouseEnter={() => setHoveredState('TAS')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* ACT (small circle) */}
        <circle
          cx="560"
          cy="380"
          r="8"
          fill={getStateColor('ACT')}
          fillOpacity={getStateOpacity('ACT')}
          stroke="#374151"
          strokeWidth="2"
          className="cursor-pointer transition-all duration-300"
          onClick={() => onStateClick('ACT')}
          onMouseEnter={() => setHoveredState('ACT')}
          onMouseLeave={() => setHoveredState(null)}
        />

        {/* State Labels and Stats */}
        {Object.entries(statePositions).map(([state, pos]) => {
          const stats = stateStats[state];
          if (!stats) return null;

          return (
            <g key={state}>
              {/* State abbreviation */}
              <text
                x={pos.x}
                y={pos.y - 20}
                textAnchor="middle"
                className="font-bold text-lg fill-gray-800 pointer-events-none"
                style={{ fontSize: '20px' }}
              >
                {state}
              </text>
              
              {/* Number of shows */}
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                className="font-semibold text-base fill-gray-700 pointer-events-none"
                style={{ fontSize: '16px' }}
              >
                {stats.shows} {stats.shows === 1 ? 'Show' : 'Shows'}
              </text>
              
              {/* Sales data */}
              {stats.totalSales > 0 && (
                <text
                  x={pos.x}
                  y={pos.y + 25}
                  textAnchor="middle"
                  className="text-sm fill-gray-600 pointer-events-none"
                  style={{ fontSize: '14px' }}
                >
                  Sales: {stats.totalSales}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredState && stateStats[hoveredState] && (
        <Card className="absolute top-4 right-4 shadow-lg">
          <CardContent className="p-4">
            <h3 className="font-bold text-lg mb-2">{hoveredState}</h3>
            <div className="space-y-1 text-sm">
              <p>Shows: <span className="font-semibold">{stateStats[hoveredState].shows}</span></p>
              <p>Total Sales: <span className="font-semibold">{stateStats[hoveredState].totalSales || 'N/A'}</span></p>
              <p>Total Days: <span className="font-semibold">{stateStats[hoveredState].totalDays || 'N/A'}</span></p>
              {stateStats[hoveredState].totalDays > 0 && (
                <p>Avg Daily Sales: <span className="font-semibold">
                  {(stateStats[hoveredState].totalSales / stateStats[hoveredState].totalDays).toFixed(2)}
                </span></p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {Object.entries(stateStats).map(([state, stats]) => (
          <Badge
            key={state}
            variant={selectedState === state ? 'default' : 'outline'}
            className="cursor-pointer transition-all"
            style={{
              backgroundColor: selectedState === state ? stateColors[state] : 'transparent',
              borderColor: stateColors[state],
              color: selectedState === state ? 'white' : stateColors[state],
            }}
            onClick={() => onStateClick(state)}
          >
            {state}: {stats.shows}
          </Badge>
        ))}
      </div>
    </div>
  );
}