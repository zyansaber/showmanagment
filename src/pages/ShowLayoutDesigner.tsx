import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Ruler,
  PenTool,
  Pointer,
  Trees,
  Tent,
  Building2,
  Monitor,
  Wrench,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grip,
  Sparkles,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PIXELS_PER_METER = 40;
const CANVAS_DIMENSIONS = { width: 120, height: 80 }; // meters
const SNAP_STEP = 0.25; // meters

const paletteItems = [
  {
    id: 'plant',
    kind: 'plant' as const,
    label: 'Sculpted planting',
    width: 3,
    height: 3,
    description: 'Organic greenery island for softening hard edges.',
    color: '#059669',
  },
  {
    id: 'caravan',
    kind: 'caravan' as const,
    label: 'Caravan bay (7m x 3m)',
    width: 7,
    height: 3,
    description: 'Standard caravan footprint with generous spacing.',
    color: '#2563eb',
  },
  {
    id: 'office',
    kind: 'office' as const,
    label: 'Modular office',
    width: 6,
    height: 4,
    description: 'Adjustable sales office or operations suite.',
    color: '#0f172a',
  },
  {
    id: 'screen',
    kind: 'screen' as const,
    label: 'LED screen',
    width: 4,
    height: 0.8,
    description: 'Low profile digital signage wall.',
    color: '#f97316',
  },
  {
    id: 'service',
    kind: 'service' as const,
    label: 'Service area',
    width: 5,
    height: 5,
    description: 'Utilities, charging or hospitality support zone.',
    color: '#7c3aed',
  },
];

type Tool = 'select' | 'line';

type ShapeKind = (typeof paletteItems)[number]['kind'];

interface BaseElement {
  id: string;
  label: string;
}

interface ShapeElement extends BaseElement {
  kind: ShapeKind;
  x: number; // meters, center
  y: number;
  width: number; // meters
  height: number; // meters
  rotation: number; // degrees
  color: string;
}

interface LineElement extends BaseElement {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number; // meters
}

type LayoutElement = ShapeElement | LineElement;

type DragState =
  | { id: string; kind: 'shape'; offsetX: number; offsetY: number }
  | { id: string; kind: 'line'; offsetX: number; offsetY: number };

const formatNumber = (value: number, digits = 2) => Number(value.toFixed(digits));

const getLineAngle = (line: LineElement) => Math.atan2(line.y2 - line.y1, line.x2 - line.x1);

const canvasWidthPx = CANVAS_DIMENSIONS.width * PIXELS_PER_METER;
const canvasHeightPx = CANVAS_DIMENSIONS.height * PIXELS_PER_METER;

const ShowLayoutDesigner = () => {
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isLengthLocked, setIsLengthLocked] = useState(false);
  const [lockedLength, setLockedLength] = useState(5);
  const [linePreview, setLinePreview] = useState<LineElement | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const lineStartRef = useRef<{ x: number; y: number } | null>(null);

  const snapValue = useCallback(
    (value: number) => {
      if (!snapToGrid) return value;
      return Math.round(value / SNAP_STEP) * SNAP_STEP;
    },
    [snapToGrid]
  );

  useEffect(() => {
    if (tool === 'select') return;
    lineStartRef.current = null;
    setLinePreview(null);
  }, [tool]);

  const selectedElement = useMemo(
    () => (selectedId ? elements.find((item) => item.id === selectedId) ?? null : null),
    [elements, selectedId]
  );

  const stats = useMemo(() => {
    const footprint = elements
      .filter((item): item is ShapeElement => item.kind !== 'line')
      .reduce((acc, curr) => acc + curr.width * curr.height, 0);
    const lines = elements.filter((item) => item.kind === 'line').length;
    return {
      items: elements.length,
      footprint: formatNumber(footprint, 1),
      lines,
    };
  }, [elements]);

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const bounds = svgRef.current?.getBoundingClientRect();
      if (!bounds) return null;
      const xPx = (clientX - bounds.left) / zoom;
      const yPx = (clientY - bounds.top) / zoom;
      const xMeters = Math.min(Math.max(xPx / PIXELS_PER_METER, 0), CANVAS_DIMENSIONS.width);
      const yMeters = Math.min(Math.max(yPx / PIXELS_PER_METER, 0), CANVAS_DIMENSIONS.height);
      return { x: xMeters, y: yMeters };
    },
    [zoom]
  );

  const addShapeFromPalette = useCallback((itemId: string, position?: { x: number; y: number }) => {
    const palette = paletteItems.find((entry) => entry.id === itemId);
    if (!palette) return;
    setElements((prev) => [
      ...prev,
      {
        id: uuidv4(),
        kind: palette.kind,
        x: position?.x ?? CANVAS_DIMENSIONS.width / 2,
        y: position?.y ?? CANVAS_DIMENSIONS.height / 2,
        width: palette.width,
        height: palette.height,
        rotation: 0,
        color: palette.color,
        label: palette.label,
      },
    ]);
  }, []);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, paletteId: string) => {
    event.dataTransfer.setData('application/x-show-layout-item', paletteId);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const paletteId = event.dataTransfer.getData('application/x-show-layout-item');
    if (!paletteId) return;
    const point = getCanvasPoint(event.clientX, event.clientY);
    addShapeFromPalette(paletteId, point ?? undefined);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    if (tool === 'line') {
      event.preventDefault();
      const point = getCanvasPoint(event.clientX, event.clientY);
      if (!point) return;
      const snapped = { x: snapValue(point.x), y: snapValue(point.y) };
      lineStartRef.current = snapped;
      setLinePreview({
        id: 'preview',
        kind: 'line',
        x1: snapped.x,
        y1: snapped.y,
        x2: snapped.x,
        y2: snapped.y,
        length: 0,
        label: 'preview',
      });
    } else {
      setSelectedId(null);
    }
  };

  const updateLinePreview = useCallback(
    (clientX: number, clientY: number) => {
      if (!lineStartRef.current) return;
      const point = getCanvasPoint(clientX, clientY);
      if (!point) return;
      let target = { x: point.x, y: point.y };
      if (isLengthLocked && lockedLength > 0) {
        const dx = target.x - lineStartRef.current.x;
        const dy = target.y - lineStartRef.current.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        if (currentLength > 0) {
          const ratio = lockedLength / currentLength;
          target = {
            x: lineStartRef.current.x + dx * ratio,
            y: lineStartRef.current.y + dy * ratio,
          };
        } else {
          target = { x: lineStartRef.current.x + lockedLength, y: lineStartRef.current.y };
        }
      }
      const snapped = { x: snapValue(target.x), y: snapValue(target.y) };
      setLinePreview((prev) =>
        prev
          ? { ...prev, x2: snapped.x, y2: snapped.y, length: Math.hypot(snapped.x - prev.x1, snapped.y - prev.y1) }
          : null
      );
    },
    [getCanvasPoint, isLengthLocked, lockedLength, snapValue]
  );

  const finalizeLine = useCallback(
    (clientX: number, clientY: number) => {
      if (!lineStartRef.current) return;
      const point = getCanvasPoint(clientX, clientY);
      if (!point) return;
      let target = { x: point.x, y: point.y };
      if (isLengthLocked && lockedLength > 0) {
        const dx = target.x - lineStartRef.current.x;
        const dy = target.y - lineStartRef.current.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        if (currentLength > 0) {
          const ratio = lockedLength / currentLength;
          target = {
            x: lineStartRef.current.x + dx * ratio,
            y: lineStartRef.current.y + dy * ratio,
          };
        } else {
          target = { x: lineStartRef.current.x + lockedLength, y: lineStartRef.current.y };
        }
      }
      const snappedStart = { x: snapValue(lineStartRef.current.x), y: snapValue(lineStartRef.current.y) };
      const snappedEnd = { x: snapValue(target.x), y: snapValue(target.y) };
      const distance = Math.hypot(snappedEnd.x - snappedStart.x, snappedEnd.y - snappedStart.y);
      if (distance < 0.2) {
        lineStartRef.current = null;
        setLinePreview(null);
        return;
      }
      const nextId = uuidv4();
      setElements((prev) => [
        ...prev,
        {
          id: nextId,
          kind: 'line',
          x1: snappedStart.x,
          y1: snappedStart.y,
          x2: snappedEnd.x,
          y2: snappedEnd.y,
          length: formatNumber(distance),
          label: `Segment ${prev.filter((item) => item.kind === 'line').length + 1}`,
        },
      ]);
      setSelectedId(nextId);
      lineStartRef.current = null;
      setLinePreview(null);
    },
    [getCanvasPoint, isLengthLocked, lockedLength, snapValue]
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      const point = getCanvasPoint(event.clientX, event.clientY);
      if (!point) return;
      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== dragStateRef.current?.id) return item;
          if (dragStateRef.current?.kind === 'shape' && item.kind !== 'line') {
            return {
              ...item,
              x: snapValue(point.x - dragStateRef.current.offsetX),
              y: snapValue(point.y - dragStateRef.current.offsetY),
            };
          }
          if (dragStateRef.current?.kind === 'line' && item.kind === 'line') {
            const centerX = (item.x1 + item.x2) / 2;
            const centerY = (item.y1 + item.y2) / 2;
            const nextCenterX = snapValue(point.x - dragStateRef.current.offsetX);
            const nextCenterY = snapValue(point.y - dragStateRef.current.offsetY);
            const deltaX = nextCenterX - centerX;
            const deltaY = nextCenterY - centerY;
            return {
              ...item,
              x1: item.x1 + deltaX,
              y1: item.y1 + deltaY,
              x2: item.x2 + deltaX,
              y2: item.y2 + deltaY,
            };
          }
          return item;
        })
      );
      return;
    }

    if (tool === 'line' && lineStartRef.current) {
      updateLinePreview(event.clientX, event.clientY);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null;
      return;
    }
    if (tool === 'line' && lineStartRef.current) {
      finalizeLine(event.clientX, event.clientY);
    }
  };

  const handleElementPointerDown = (
    event: React.PointerEvent<SVGGElement | SVGLineElement>,
    element: LayoutElement
  ) => {
    event.stopPropagation();
    if (tool !== 'select') return;
    setSelectedId(element.id);
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    if (element.kind === 'line') {
      const centerX = (element.x1 + element.x2) / 2;
      const centerY = (element.y1 + element.y2) / 2;
      dragStateRef.current = {
        id: element.id,
        kind: 'line',
        offsetX: point.x - centerX,
        offsetY: point.y - centerY,
      };
    } else {
      dragStateRef.current = {
        id: element.id,
        kind: 'shape',
        offsetX: point.x - element.x,
        offsetY: point.y - element.y,
      };
    }
  };

  const updateSelectedElement = (updates: Partial<ShapeElement> | Partial<LineElement>) => {
    if (!selectedElement) return;
    setElements((prev) => prev.map((item) => (item.id === selectedElement.id ? { ...item, ...updates } : item)));
  };

  const handleShapeDimensionChange = (dimension: 'width' | 'height', value: number) => {
    if (!selectedElement || selectedElement.kind === 'line') return;
    updateSelectedElement({ [dimension]: Math.max(0.5, value) } as Partial<ShapeElement>);
  };

  const handleLineLengthChange = (value: number) => {
    if (!selectedElement || selectedElement.kind !== 'line') return;
    const angle = getLineAngle(selectedElement);
    const centerX = (selectedElement.x1 + selectedElement.x2) / 2;
    const centerY = (selectedElement.y1 + selectedElement.y2) / 2;
    const halfLength = value / 2;
    const dx = Math.cos(angle) * halfLength;
    const dy = Math.sin(angle) * halfLength;
    updateSelectedElement({
      x1: centerX - dx,
      y1: centerY - dy,
      x2: centerX + dx,
      y2: centerY + dy,
      length: formatNumber(value),
    } as Partial<LineElement>);
  };

  const resetLayout = () => {
    setElements([]);
    setSelectedId(null);
    setLinePreview(null);
    lineStartRef.current = null;
  };

  const renderShape = (element: ShapeElement) => {
    const widthPx = element.width * PIXELS_PER_METER;
    const heightPx = element.height * PIXELS_PER_METER;
    const translateX = element.x * PIXELS_PER_METER;
    const translateY = element.y * PIXELS_PER_METER;
    const isSelected = element.id === selectedId;

    return (
      <g
        key={element.id}
        transform={`translate(${translateX} ${translateY}) rotate(${element.rotation})`}
        onPointerDown={(event) => handleElementPointerDown(event, element)}
        className="cursor-move"
      >
        <rect
          x={-widthPx / 2}
          y={-heightPx / 2}
          width={widthPx}
          height={heightPx}
          rx={element.kind === 'screen' ? 6 : element.kind === 'plant' ? widthPx / 2 : 12}
          ry={element.kind === 'plant' ? heightPx / 2 : 12}
          fill={element.kind === 'plant' ? '#34d399' : element.color}
          stroke={isSelected ? '#facc15' : '#0f172a'}
          strokeWidth={isSelected ? 4 : 2}
          opacity={element.kind === 'screen' ? 0.85 : 0.95}
        />
        {element.kind === 'plant' && (
          <circle
            cx={0}
            cy={0}
            r={Math.min(widthPx, heightPx) / 3}
            fill="#059669"
            opacity={0.8}
          />
        )}
        <text
          x={0}
          y={0}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize={14}
          fontWeight={600}
          fill="white"
        >
          {element.label}
        </text>
        <text
          x={0}
          y={heightPx / 2 + 14}
          textAnchor="middle"
          fontSize={11}
          fill="#334155"
        >
          {`${element.width.toFixed(1)}m × ${element.height.toFixed(1)}m`}
        </text>
      </g>
    );
  };

  const renderLine = (line: LineElement) => {
    const x1 = line.x1 * PIXELS_PER_METER;
    const y1 = line.y1 * PIXELS_PER_METER;
    const x2 = line.x2 * PIXELS_PER_METER;
    const y2 = line.y2 * PIXELS_PER_METER;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = (getLineAngle(line) * 180) / Math.PI;
    const isSelected = selectedId === line.id;

    return (
      <g key={line.id} onPointerDown={(event) => handleElementPointerDown(event as React.PointerEvent<SVGGElement>, line)}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={isSelected ? '#f97316' : '#0f172a'}
          strokeWidth={isSelected ? 5 : 3}
          strokeLinecap="round"
        />
        <g transform={`translate(${midX} ${midY}) rotate(${angle})`}>
          <rect
            x={-40}
            y={-16}
            width={80}
            height={24}
            rx={6}
            fill="rgba(255,255,255,0.9)"
            stroke={isSelected ? '#f97316' : '#94a3b8'}
          />
          <text textAnchor="middle" alignmentBaseline="central" fontSize={14} fill="#0f172a" fontWeight={600}>
            {`${line.length.toFixed(2)} m`}
          </text>
        </g>
      </g>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Show layout studio</h1>
          <p className="text-sm text-slate-600">
            Design a professional show footprint with precise lines, scalable modules and curated assets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetLayout} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button className="gap-2" onClick={() => setTool('line')}>
            <PenTool className="h-4 w-4" /> Quick line
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
        <Card className="h-full border-2 border-slate-100">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Layers className="h-5 w-5 text-slate-500" />
              Layout assets
            </CardTitle>
            <CardDescription>
              Drag an asset into the canvas or click it to drop it at the center of the plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-xs uppercase text-slate-500">Tool</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  variant={tool === 'select' ? 'default' : 'outline'}
                  className="gap-2"
                  onClick={() => setTool('select')}
                >
                  <Pointer className="h-4 w-4" /> Select
                </Button>
                <Button
                  variant={tool === 'line' ? 'default' : 'outline'}
                  className="gap-2"
                  onClick={() => setTool('line')}
                >
                  <Ruler className="h-4 w-4" /> Line
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Shift focus between selection and precise line drafting at any time.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">Snap to 0.25 m</span>
                <Switch checked={snapToGrid} onCheckedChange={(checked) => setSnapToGrid(Boolean(checked))} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">Show grid</span>
                <Switch checked={showGrid} onCheckedChange={(checked) => setShowGrid(Boolean(checked))} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600">Lock line length</span>
                <Switch checked={isLengthLocked} onCheckedChange={(checked) => setIsLengthLocked(Boolean(checked))} />
              </div>
              {isLengthLocked && (
                <div>
                  <Label className="text-xs text-slate-500">Length (meters)</Label>
                  <Input
                    type="number"
                    value={lockedLength}
                    onChange={(event) => setLockedLength(Math.max(0.5, Number(event.target.value)))}
                    min={0.5}
                    step={0.1}
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            <Tabs defaultValue="palette">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="palette">Palette</TabsTrigger>
                <TabsTrigger value="notes">Guides</TabsTrigger>
              </TabsList>
              <TabsContent value="palette">
                <ScrollArea className="h-[340px] pr-4">
                  <div className="space-y-4">
                    {paletteItems.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onClick={() => addShapeFromPalette(item.id)}
                        className="cursor-grab active:cursor-grabbing rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500">{item.description}</p>
                          </div>
                          <div className="rounded-full bg-slate-100 p-2">
                            {item.kind === 'plant' && <Trees className="h-4 w-4 text-emerald-600" />}
                            {item.kind === 'caravan' && <Tent className="h-4 w-4 text-blue-600" />}
                            {item.kind === 'office' && <Building2 className="h-4 w-4 text-slate-700" />}
                            {item.kind === 'screen' && <Monitor className="h-4 w-4 text-orange-500" />}
                            {item.kind === 'service' && <Wrench className="h-4 w-4 text-violet-500" />}
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <span>{`${item.width}m x ${item.height}m`}</span>
                          <span>Drag onto canvas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="notes">
                <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Best practices</p>
                  <ul className="space-y-2 list-disc pl-4">
                    <li>Align caravan rows with locked 7 m lines for perfect spacing.</li>
                    <li>Use the service blocks to reserve hospitality or technical areas.</li>
                    <li>Combine straight lines with plants to soften the visitor journey.</li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="h-full border-2 border-blue-100">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-blue-500" />
                Blueprint canvas
              </span>
              <span className="text-sm font-medium text-slate-500">{stats.items} objects</span>
            </CardTitle>
            <CardDescription>
              Hold and drag to reposition assets. Use line mode for precise measurements. Zoom keeps the drawing pixel-perfect.
            </CardDescription>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                <ZoomOut className="h-4 w-4" />
                <Slider
                  value={[zoom]}
                  min={0.5}
                  max={2}
                  step={0.1}
                  onValueChange={(value) => setZoom(value[0] ?? 1)}
                  className="w-32"
                />
                <ZoomIn className="h-4 w-4" />
                <span className="text-xs text-slate-500">{`${Math.round(zoom * 100)}%`}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                <Grip className="h-4 w-4" />
                <span>Drag canvas with scrollbars</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200 bg-slate-50">
              <div className="grid" style={{ gridTemplateColumns: '40px 1fr' }}>
                <div className="h-10 border-b border-r border-slate-200 bg-white" />
                <div className="h-10 border-b border-slate-200 bg-slate-100 overflow-hidden">
                  <div className="flex" style={{ width: canvasWidthPx }}>
                    {Array.from({ length: CANVAS_DIMENSIONS.width + 1 }).map((_, index) => (
                      <div key={`hr-${index}`} className="relative" style={{ width: PIXELS_PER_METER }}>
                        <div className="absolute left-0 top-0 h-3 w-px bg-slate-400" />
                        {index % 5 === 0 && (
                          <span className="absolute bottom-0 left-1 text-[10px] font-semibold text-slate-500">{index}m</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-r border-slate-200 bg-slate-100" style={{ height: canvasHeightPx }}>
                  <div className="flex flex-col" style={{ height: canvasHeightPx }}>
                    {Array.from({ length: CANVAS_DIMENSIONS.height + 1 }).map((_, index) => (
                      <div key={`vr-${index}`} className="relative" style={{ height: PIXELS_PER_METER }}>
                        <div className="absolute right-0 top-0 w-3 h-px bg-slate-400" />
                        {index % 5 === 0 && (
                          <span className="absolute right-2 top-1 text-[10px] font-semibold text-slate-500">{index}m</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="relative overflow-auto"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onDrop={handleCanvasDrop}
                  onDragOver={(event) => event.preventDefault()}
                >
                  <div
                    className="relative"
                    style={{
                      width: canvasWidthPx,
                      height: canvasHeightPx,
                      backgroundImage: showGrid
                        ? `linear-gradient(0deg, rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)`
                        : undefined,
                      backgroundSize: `${PIXELS_PER_METER}px ${PIXELS_PER_METER}px`,
                    }}
                  >
                    <svg
                      ref={svgRef}
                      width={canvasWidthPx}
                      height={canvasHeightPx}
                      className="touch-none"
                      style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}
                      onPointerDown={handleCanvasPointerDown}
                    >
                      <rect width={canvasWidthPx} height={canvasHeightPx} fill="transparent" />
                      {elements.map((element) =>
                        element.kind === 'line' ? renderLine(element) : renderShape(element)
                      )}
                      {linePreview && (
                        <line
                          x1={linePreview.x1 * PIXELS_PER_METER}
                          y1={linePreview.y1 * PIXELS_PER_METER}
                          x2={linePreview.x2 * PIXELS_PER_METER}
                          y2={linePreview.y2 * PIXELS_PER_METER}
                          stroke="#38bdf8"
                          strokeWidth={3}
                          strokeDasharray="6 4"
                        />
                      )}
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full border-2 border-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <PenTool className="h-5 w-5 text-slate-500" />
              Inspector
            </CardTitle>
            <CardDescription>
              Review and edit the currently selected line or module. All dimensions are in meters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {selectedElement ? (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedElement.label}</p>
                    <p className="text-xs text-slate-500">{selectedElement.kind === 'line' ? 'Measurement' : 'Asset'}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-red-500"
                    onClick={() => {
                      setElements((prev) => prev.filter((item) => item.id !== selectedElement.id));
                      setSelectedId(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs text-slate-500">Label</Label>
                  <Input
                    value={selectedElement.label}
                    onChange={(event) => updateSelectedElement({ label: event.target.value })}
                  />
                </div>

                {selectedElement.kind === 'line' ? (
                  <div className="space-y-3">
                    <Label className="text-xs text-slate-500">Length (m)</Label>
                    <Input
                      type="number"
                      min={0.5}
                      step={0.1}
                      value={selectedElement.length.toFixed(2)}
                      onChange={(event) => handleLineLengthChange(Math.max(0.5, Number(event.target.value)))}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-slate-500">Width (m)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.1}
                        value={selectedElement.width}
                        onChange={(event) => handleShapeDimensionChange('width', Number(event.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Depth (m)</Label>
                      <Input
                        type="number"
                        min={0.5}
                        step={0.1}
                        value={selectedElement.height}
                        onChange={(event) => handleShapeDimensionChange('height', Number(event.target.value))}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-slate-500">Rotation</Label>
                      <Slider
                        value={[selectedElement.rotation]}
                        min={0}
                        max={359}
                        step={1}
                        onValueChange={(value) => updateSelectedElement({ rotation: value[0] ?? 0 })}
                      />
                      <div className="mt-1 text-xs text-slate-500">{selectedElement.rotation.toFixed(0)}°</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
                Select a line or module on the canvas to view its exact specification here.
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Project metrics</p>
              <dl className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Modules placed</dt>
                  <dd className="font-semibold text-slate-900">{stats.items}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Total footprint</dt>
                  <dd className="font-semibold text-slate-900">{stats.footprint} m²</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Dimension lines</dt>
                  <dd className="font-semibold text-slate-900">{stats.lines}</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShowLayoutDesigner;
