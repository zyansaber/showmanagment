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
  DoorOpen,
  Maximize,
  Minimize,
  Save,
  FileDown,
  Route,
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

const CARAVAN_SIZES = {
  small: { width: 7, height: 3, label: 'Small (7m x 3m)', color: '#0ea5e9' },
  medium: { width: 8, height: 3, label: 'Medium (8m x 3m)', color: '#6366f1' },
  large: { width: 9, height: 3, label: 'Large (9m x 3m)', color: '#a855f7' },
};

type CaravanSize = keyof typeof CARAVAN_SIZES;

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
    label: 'Caravan bay (configurable)',
    width: CARAVAN_SIZES.small.width,
    height: CARAVAN_SIZES.small.height,
    description: 'Standard caravan footprint with generous spacing.',
    color: CARAVAN_SIZES.small.color,
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
  {
    id: 'site',
    kind: 'site' as const,
    label: 'Freeform site',
    width: 12,
    height: 8,
    description: 'Drop a deformable quadrilateral site and drag each corner.',
    color: '#10b981',
  },
  {
    id: 'gate',
    kind: 'gate' as const,
    label: 'Entry arch / gate',
    width: 6,
    height: 3,
    description: 'Curved entry arch to mark the arrival moment.',
    color: '#fbbf24',
  },
  {
    id: 'street',
    kind: 'street' as const,
    label: 'Street corridor',
    width: 18,
    height: 6,
    description: 'Long shaded strip for roads or promenades with diagonal hatch.',
    color: '#334155',
  },
];

type Tool = 'select' | 'line';

type ShapeKind = (typeof paletteItems)[number]['kind'];

type RectShapeKind = Exclude<ShapeKind, 'site'>;

interface BaseElement {
  id: string;
  label: string;
}

interface RectShapeElement extends BaseElement {
  kind: RectShapeKind;
  x: number; // meters, center
  y: number;
  width: number; // meters
  height: number; // meters
  rotation: number; // degrees
  color: string;
  caravanSize?: CaravanSize;
  caravanVariant?: 'SRP' | 'SRT' | 'SRH' | 'SRV' | 'SRC';
}

const CARAVAN_VARIANT_COLORS: Record<
  NonNullable<RectShapeElement['caravanVariant']>,
  string
> = {
  SRP: '#0ea5e9',
  SRT: '#f97316',
  SRH: '#16a34a',
  SRV: '#db2777',
  SRC: '#4f46e5',
};

interface SitePoint {
  x: number;
  y: number;
}

interface SiteShapeElement extends BaseElement {
  kind: 'site';
  points: SitePoint[];
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

type LayoutElement = RectShapeElement | SiteShapeElement | LineElement;

type DragState =
  | { id: string; kind: 'shape'; offsetX: number; offsetY: number }
  | { id: string; kind: 'line'; offsetX: number; offsetY: number }
  | { id: string; kind: 'site-vertex'; vertexIndex: number; offsetX: number; offsetY: number }
  | { id: string; kind: 'rotate-shape'; centerX: number; centerY: number; startAngle: number; startRotation: number };

const getSiteCentroid = (points: SitePoint[]) => {
  const sum = points.reduce(
    (acc, curr) => ({ x: acc.x + curr.x, y: acc.y + curr.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
};

const polygonArea = (points: SitePoint[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
};

const caravanArea = (element: RectShapeElement) => {
  const triangleLength = 1.5;
  const bodyArea = element.width * element.height;
  const triangleArea = (element.height * triangleLength) / 2;
  return bodyArea + triangleArea;
};

const elementArea = (element: LayoutElement) => {
  if (element.kind === 'line') return 0;
  if (element.kind === 'site') return polygonArea(element.points);
  if (element.kind === 'caravan') return caravanArea(element);
  return element.width * element.height;
};

const formatNumber = (value: number, digits = 2) => Number(value.toFixed(digits));

const adjustHexLuminance = (hex: string, amount: number) => {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp((num >> 16) + 255 * amount);
  const g = clamp(((num >> 8) & 0x00ff) + 255 * amount);
  const b = clamp((num & 0x0000ff) + 255 * amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

const getCaravanColor = (variant: NonNullable<RectShapeElement['caravanVariant']>, size: CaravanSize = 'small') => {
  const base = CARAVAN_VARIANT_COLORS[variant];
  const lift = size === 'large' ? 0.14 : size === 'medium' ? 0.08 : 0.02;
  return adjustHexLuminance(base, lift);
};

const getLineAngle = (line: LineElement) => Math.atan2(line.y2 - line.y1, line.x2 - line.x1);

const canvasWidthPx = CANVAS_DIMENSIONS.width * PIXELS_PER_METER;
const canvasHeightPx = CANVAS_DIMENSIONS.height * PIXELS_PER_METER;

const ShowLayoutDesigner = () => {
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoom, setZoom] = useState(2);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [isLengthLocked, setIsLengthLocked] = useState(false);
  const [lockedLength, setLockedLength] = useState(5);
  const [linePreview, setLinePreview] = useState<LineElement | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [firebaseConfig, setFirebaseConfig] = useState({
    apiKey: '',
    projectId: '',
    collection: 'drafts',
  });
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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
    const siteArea = elements
      .filter((item): item is SiteShapeElement => item.kind === 'site')
      .reduce((acc, curr) => acc + polygonArea(curr.points), 0);
    const caravanElements = elements.filter((item): item is RectShapeElement => item.kind === 'caravan');
    const caravanFootprint = caravanElements.reduce((acc, curr) => acc + caravanArea(curr), 0);
    const footprint = elements.reduce((acc, curr) => acc + elementArea(curr), 0);
    const lines = elements.filter((item) => item.kind === 'line').length;
    const caravanVariantCounts = caravanElements.reduce(
      (acc, curr) => {
        const variant = curr.caravanVariant ?? 'SRP';
        acc[variant] = (acc[variant] ?? 0) + 1;
        return acc;
      },
      {} as Record<NonNullable<RectShapeElement['caravanVariant']>, number>
    );

    return {
      items: elements.length,
      footprint: formatNumber(footprint, 1),
      lines,
      siteArea: formatNumber(siteArea, 2),
      caravanArea: formatNumber(caravanFootprint, 2),
      netArea: formatNumber(Math.max(siteArea - caravanFootprint, 0), 2),
      caravanVariantCounts,
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
    const center = { x: position?.x ?? CANVAS_DIMENSIONS.width / 2, y: position?.y ?? CANVAS_DIMENSIONS.height / 2 };

    if (palette.kind === 'site') {
      const halfWidth = palette.width / 2;
      const halfHeight = palette.height / 2;
      const points: SitePoint[] = [
        { x: center.x - halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y - halfHeight },
        { x: center.x + halfWidth, y: center.y + halfHeight },
        { x: center.x - halfWidth, y: center.y + halfHeight },
      ];
      setElements((prev) => [
        ...prev,
        {
          id: uuidv4(),
          kind: 'site',
          points,
          color: palette.color,
          label: palette.label,
        },
      ]);
      return;
    }

    const defaultCaravanSize: CaravanSize = 'small';
    const paletteColor =
      palette.kind === 'caravan'
        ? getCaravanColor('SRP', defaultCaravanSize)
        : palette.color;
    const paletteWidth = palette.kind === 'caravan' ? CARAVAN_SIZES[defaultCaravanSize].width : palette.width;
    const paletteHeight = palette.kind === 'caravan' ? CARAVAN_SIZES[defaultCaravanSize].height : palette.height;

    setElements((prev) => [
      ...prev,
      {
        id: uuidv4(),
        kind: palette.kind,
        x: center.x,
        y: center.y,
        width: paletteWidth,
        height: paletteHeight,
        rotation: 0,
        color: paletteColor,
        caravanSize: palette.kind === 'caravan' ? defaultCaravanSize : undefined,
        caravanVariant: palette.kind === 'caravan' ? 'SRP' : undefined,
        label: palette.kind === 'caravan' ? 'SRP' : palette.label,
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
      if (dragStateRef.current.kind === 'rotate-shape') {
        const angle = Math.atan2(point.y - dragStateRef.current.centerY, point.x - dragStateRef.current.centerX);
        const deltaDeg = ((angle - dragStateRef.current.startAngle) * 180) / Math.PI;
        setElements((prev) =>
          prev.map((item) =>
            item.id === dragStateRef.current?.id && item.kind !== 'line' && item.kind !== 'site'
              ? { ...item, rotation: (dragStateRef.current.startRotation + deltaDeg + 360) % 360 }
              : item
          )
        );
        return;
      }
      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== dragStateRef.current?.id) return item;
          if (dragStateRef.current?.kind === 'shape' && item.kind !== 'line') {
            if (item.kind === 'site') {
              const centroid = getSiteCentroid(item.points);
              const nextCenterX = snapValue(point.x - dragStateRef.current.offsetX);
              const nextCenterY = snapValue(point.y - dragStateRef.current.offsetY);
              const deltaX = nextCenterX - centroid.x;
              const deltaY = nextCenterY - centroid.y;
              return {
                ...item,
                points: item.points.map((p) => ({ x: p.x + deltaX, y: p.y + deltaY })),
              };
            }

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
          if (dragStateRef.current?.kind === 'site-vertex' && item.kind === 'site') {
            const updated = [...item.points];
            updated[dragStateRef.current.vertexIndex] = {
              x: snapValue(point.x - dragStateRef.current.offsetX),
              y: snapValue(point.y - dragStateRef.current.offsetY),
            };
            return { ...item, points: updated };
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
    } else if (element.kind === 'site') {
      const centroid = getSiteCentroid(element.points);
      dragStateRef.current = {
        id: element.id,
        kind: 'shape',
        offsetX: point.x - centroid.x,
        offsetY: point.y - centroid.y,
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

  const handleSiteVertexPointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    element: SiteShapeElement,
    index: number
  ) => {
    event.stopPropagation();
    if (tool !== 'select') return;
    setSelectedId(element.id);
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    dragStateRef.current = {
      id: element.id,
      kind: 'site-vertex',
      vertexIndex: index,
      offsetX: point.x - element.points[index].x,
      offsetY: point.y - element.points[index].y,
    };
  };

  const handleRotationPointerDown = (
    event: React.PointerEvent<SVGCircleElement>,
    element: RectShapeElement,
    centerX: number,
    centerY: number
  ) => {
    event.stopPropagation();
    if (tool !== 'select') return;
    setSelectedId(element.id);
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const startAngle = Math.atan2(point.y - centerY, point.x - centerX);
    dragStateRef.current = {
      id: element.id,
      kind: 'rotate-shape',
      centerX,
      centerY,
      startAngle,
      startRotation: element.rotation,
    };
  };

  const updateSelectedElement = (updates: Partial<RectShapeElement> | Partial<SiteShapeElement> | Partial<LineElement>) => {
    if (!selectedElement) return;
    setElements((prev) => prev.map((item) => (item.id === selectedElement.id ? { ...item, ...updates } : item)));
  };

  const handleShapeDimensionChange = (dimension: 'width' | 'height', value: number) => {
    if (!selectedElement || selectedElement.kind === 'line' || selectedElement.kind === 'site') return;
    updateSelectedElement({ [dimension]: Math.max(0.5, value) } as Partial<RectShapeElement>);
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

  const duplicateSelected = () => {
    if (!selectedElement) return;
    setElements((prev) => {
      const source = prev.find((item) => item.id === selectedElement.id);
      if (!source) return prev;
      const offset = 1;
      if (source.kind === 'line') {
        const clone: LineElement = {
          ...source,
          id: uuidv4(),
          label: `${source.label} copy`,
          x1: source.x1 + offset,
          x2: source.x2 + offset,
          y1: source.y1 + offset,
          y2: source.y2 + offset,
        };
        setSelectedId(clone.id);
        return [...prev, clone];
      }

      if (source.kind === 'site') {
        const clone: SiteShapeElement = {
          ...source,
          id: uuidv4(),
          label: `${source.label} copy`,
          points: source.points.map((point) => ({ x: point.x + offset, y: point.y + offset })),
        };
        setSelectedId(clone.id);
        return [...prev, clone];
      }

      const clone: RectShapeElement = {
        ...source,
        id: uuidv4(),
        label: `${source.label} copy`,
        x: source.x + offset,
        y: source.y + offset,
      };
      setSelectedId(clone.id);
      return [...prev, clone];
    });
  };

  const saveDraftToFirebase = async () => {
    setIsSavingDraft(true);
    setDraftMessage(null);
    try {
      if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        setDraftMessage('Add your Firebase API key and project ID to save drafts.');
        return;
      }

      const payload = {
        elements,
        stats,
        savedAt: new Date().toISOString(),
      };

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/${firebaseConfig.collection}?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              data: { stringValue: JSON.stringify(payload) },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Unable to save draft');
      }
      setDraftMessage('Draft saved to Firebase successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error saving draft';
      setDraftMessage(message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const exportToPdf = async () => {
    if (!svgRef.current) return;

    setIsExporting(true);
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgRef.current);
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const image = new Image();
      image.src = url;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = svgRef.current.clientWidth * window.devicePixelRatio;
      canvas.height = svgRef.current.clientHeight * window.devicePixelRatio;
      const context = canvas.getContext('2d');
      if (!context) return;

      context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);

      const imgData = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!printWindow) return;

      printWindow.document.write(
        `<html><head><title>Show layout</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#f8fafc;">
          <img src="${imgData}" style="max-width:100%;height:auto;" />
        </body></html>`
      );
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      console.error('Unable to export PDF', error);
    } finally {
      setIsExporting(false);
    }
  };

  const renderRectShape = (element: RectShapeElement) => {
    const widthPx = element.width * PIXELS_PER_METER;
    const heightPx = element.height * PIXELS_PER_METER;
    const translateX = element.x * PIXELS_PER_METER;
    const translateY = element.y * PIXELS_PER_METER;
    const isSelected = element.id === selectedId;
    const triangleLengthPx = 1.5 * PIXELS_PER_METER;
    const hasDrawbar = element.kind === 'caravan';
    const streetPatternId = `street-pattern-${element.id}`;

    const caravanPath = hasDrawbar
      ? `M ${-widthPx / 2} ${-heightPx / 2} h ${widthPx} l ${triangleLengthPx} ${heightPx / 2} l ${-triangleLengthPx} ${heightPx / 2} h ${-widthPx} z`
      : undefined;

    const archHeight = element.kind === 'gate' ? heightPx : 0;
    const archWidth = element.kind === 'gate' ? widthPx : 0;
    const archRadius = archWidth / 2;
    const labelContent =
      element.kind === 'caravan'
        ? `${(element.caravanVariant ?? 'SRP').toUpperCase()}`
        : element.label;
    const secondaryLabel =
      element.kind === 'caravan'
        ? CARAVAN_SIZES[element.caravanSize ?? 'small'].label
        : `${element.width.toFixed(1)}m × ${element.height.toFixed(1)}m`;

    const primaryFontSize =
      element.kind === 'caravan'
        ? Math.max(16, Math.min(heightPx * 0.55, widthPx * 0.5))
        : 14;
    const secondaryFontSize =
      element.kind === 'caravan'
        ? Math.max(14, Math.min(heightPx * 0.24, widthPx * 0.35))
        : 11;
    const secondaryYOffset = element.kind === 'caravan' ? heightPx / 2 + secondaryFontSize : heightPx / 2 + 14;

    return (
      <g
        key={element.id}
        transform={`translate(${translateX} ${translateY}) rotate(${element.rotation})`}
        onPointerDown={(event) => handleElementPointerDown(event, element)}
        className="cursor-move"
      >
        {element.kind === 'street' && (
          <defs>
            <pattern id={streetPatternId} patternUnits="userSpaceOnUse" width={18} height={18} patternTransform="rotate(45)">
              <rect width={18} height={18} fill="white" />
              <path d="M -9 9 L 27 9" stroke="#0f172a" strokeWidth={9} opacity={0.5} />
            </pattern>
          </defs>
        )}
        {hasDrawbar ? (
          <path
            d={caravanPath}
            fill={element.color}
            fillOpacity={0.35}
            stroke={isSelected ? '#0ea5e9' : element.color}
            strokeWidth={isSelected ? 4 : 3}
            strokeLinejoin="round"
          />
        ) : element.kind === 'gate' ? (
          <path
            d={`M ${-archWidth / 2} ${archHeight / 2} L ${-archWidth / 2} ${-archHeight / 2} A ${archRadius} ${archRadius} 0 0 1 ${archWidth / 2} ${-archHeight / 2} L ${archWidth / 2} ${archHeight / 2} Z`}
            fill={element.color}
            fillOpacity={0.18}
            stroke={isSelected ? '#0ea5e9' : element.color}
            strokeWidth={isSelected ? 4 : 2}
          />
        ) : (
          <rect
            x={-widthPx / 2}
            y={-heightPx / 2}
            width={widthPx}
            height={heightPx}
            rx={element.kind === 'screen' ? 6 : element.kind === 'plant' ? widthPx / 2 : 12}
            ry={element.kind === 'plant' ? heightPx / 2 : 12}
            fill={element.kind === 'plant' ? '#34d399' : element.kind === 'street' ? `url(#${streetPatternId})` : element.color}
            stroke={isSelected ? '#0ea5e9' : '#0f172a'}
            strokeWidth={isSelected ? 4 : 2}
            opacity={element.kind === 'screen' ? 0.85 : 0.95}
          />
        )}
        {element.kind === 'plant' && !hasDrawbar && (
          <circle cx={0} cy={0} r={Math.min(widthPx, heightPx) / 3} fill="#059669" opacity={0.8} />
        )}
        <text
          x={0}
          y={0}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize={primaryFontSize}
          fontWeight={700}
          fill={element.kind === 'caravan' ? '#0f172a' : 'white'}
        >
          {labelContent}
        </text>
        <text
          x={0}
          y={secondaryYOffset}
          textAnchor="middle"
          fontSize={secondaryFontSize}
          fill={element.kind === 'caravan' ? '#0f172a' : '#334155'}
        >
          {secondaryLabel}
        </text>

        {isSelected && element.kind !== 'line' && (
          <g>
            <line
              x1={0}
              y1={-heightPx / 2 - 20}
              x2={0}
              y2={-heightPx / 2 - 4}
              stroke="#0ea5e9"
              strokeWidth={3}
            />
            <circle
              cx={0}
              cy={-heightPx / 2 - 28}
              r={10}
              fill="#0ea5e9"
              stroke="white"
              strokeWidth={2}
              className="cursor-pointer"
              onPointerDown={(event) =>
                handleRotationPointerDown(event, element, element.x, element.y)
              }
            />
          </g>
        )}
      </g>
    );
  };

  const renderSiteShape = (element: SiteShapeElement) => {
    const isSelected = element.id === selectedId;
    const path = element.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * PIXELS_PER_METER} ${point.y * PIXELS_PER_METER}`)
      .join(' ');

    return (
      <g key={element.id} onPointerDown={(event) => handleElementPointerDown(event, element)} className="cursor-move">
        <path
          d={`${path} Z`}
          fill={element.color}
          fillOpacity={0.1}
          stroke={isSelected ? '#0ea5e9' : element.color}
          strokeWidth={isSelected ? 3 : 2}
        />
        {element.points.map((point, index) => (
          <circle
            key={`${element.id}-pt-${index}`}
            cx={point.x * PIXELS_PER_METER}
            cy={point.y * PIXELS_PER_METER}
            r={8}
            fill="#0ea5e9"
            stroke="white"
            strokeWidth={2}
            className="cursor-pointer"
            onPointerDown={(event) => handleSiteVertexPointerDown(event, element, index)}
          />
        ))}
        <text
          x={getSiteCentroid(element.points).x * PIXELS_PER_METER}
          y={getSiteCentroid(element.points).y * PIXELS_PER_METER}
          textAnchor="middle"
          alignmentBaseline="middle"
          fontSize={14}
          fontWeight={600}
          fill="white"
        >
          {element.label}
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
    <div
      className={`space-y-6 ${
        isFullScreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto shadow-2xl' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Show layout studio</h1>
          <p className="text-sm text-slate-600">
            Design a professional show footprint with precise lines, scalable modules and curated assets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsFullScreen((prev) => !prev)} className="gap-2">
            {isFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {isFullScreen ? 'Exit full screen' : 'Full screen'}
          </Button>
          <Button variant="outline" onClick={resetLayout} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button className="gap-2" onClick={() => setTool('line')}>
            <PenTool className="h-4 w-4" /> Quick line
          </Button>
          <Button className="gap-2" variant="outline" onClick={exportToPdf} disabled={isExporting}>
            <FileDown className="h-4 w-4" /> {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
          <Button className="gap-2" variant="secondary" onClick={saveDraftToFirebase} disabled={isSavingDraft}>
            <Save className="h-4 w-4" /> {isSavingDraft ? 'Saving...' : 'Save draft'}
          </Button>
        </div>
      </div>

      <div
        className={`grid gap-4 lg:grid-cols-[300px_1fr_340px] ${
          isFullScreen ? 'h-[calc(100vh-140px)]' : ''
        }`}
      >
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
            <Tabs defaultValue="palette">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="palette">Palette</TabsTrigger>
                <TabsTrigger value="notes">Guides</TabsTrigger>
              </TabsList>
              <TabsContent value="palette">
                <ScrollArea className="h-[560px] pr-4">
                  <div className="grid gap-3">
                    {paletteItems.map((item) => (
                      <div
                        key={item.id}
                        className="cursor-grab active:cursor-grabbing rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                        draggable
                        onDragStart={(event) => handleDragStart(event, item.id)}
                        onClick={() => addShapeFromPalette(item.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                            <p className="text-xs text-slate-500">{item.description}</p>
                          </div>
                          <div className="rounded-full bg-slate-100 p-2">
                            {item.kind === 'plant' && <Trees className="h-4 w-4 text-emerald-600" />}
                            {item.kind === 'caravan' && <Tent className="h-4 w-4 text-blue-600" />}
                            {item.kind === 'office' && <Building2 className="h-4 w-4 text-slate-700" />}
                            {item.kind === 'screen' && <Monitor className="h-4 w-4 text-orange-500" />}
                            {item.kind === 'service' && <Wrench className="h-4 w-4 text-violet-500" />}
                            {item.kind === 'gate' && <DoorOpen className="h-4 w-4 text-amber-500" />}
                            {item.kind === 'street' && <Route className="h-4 w-4 text-slate-700" />}
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
                  min={0.75}
                  max={3}
                  step={0.1}
                  onValueChange={(value) => setZoom(value[0] ?? 2)}
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
                      {elements.map((element) => {
                        if (element.kind === 'line') return renderLine(element);
                        if (element.kind === 'site') return renderSiteShape(element);
                        return renderRectShape(element);
                      })}
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
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={duplicateSelected}>
                      Duplicate
                    </Button>
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
                </div>

                <div className="space-y-3">
                  <Label className="text-xs text-slate-500">Label</Label>
                  <Input
                    value={selectedElement.label}
                    onChange={(event) => updateSelectedElement({ label: event.target.value })}
                  />
                </div>

                {selectedElement.kind === 'line' && (
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
                )}

                {selectedElement.kind === 'site' && (
                  <div className="space-y-3">
                    <Label className="text-xs text-slate-500">Site area</Label>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                      {polygonArea(selectedElement.points).toFixed(2)} m²
                    </div>
                    <p className="text-xs text-slate-500">
                      Drag any of the four corner nodes to reshape the parcel to match real-world irregularities.
                    </p>
                  </div>
                )}

                {selectedElement.kind !== 'line' && selectedElement.kind !== 'site' && (
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
                    {selectedElement.kind === 'caravan' && (
                      <>
                        <div>
                          <Label className="text-xs text-slate-500">Model range</Label>
                          <select
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                            value={selectedElement.caravanVariant ?? 'SRP'}
                            onChange={(event) => {
                              const variant = event.target.value as RectShapeElement['caravanVariant'];
                              updateSelectedElement({
                                caravanVariant: variant,
                                label: variant.toUpperCase(),
                                color: getCaravanColor(variant, selectedElement.caravanSize ?? 'small'),
                              });
                            }}
                          >
                            {['SRP', 'SRT', 'SRH', 'SRV', 'SRC'].map((variant) => (
                              <option key={variant} value={variant}>
                                {variant}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-500">Size & colour</Label>
                          <select
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                            value={selectedElement.caravanSize ?? 'small'}
                            onChange={(event) => {
                              const sizeKey = event.target.value as CaravanSize;
                              const sizing = CARAVAN_SIZES[sizeKey];
                              updateSelectedElement({
                                caravanSize: sizeKey,
                                width: sizing.width,
                                height: sizing.height,
                                color: getCaravanColor(selectedElement.caravanVariant ?? 'SRP', sizeKey),
                              });
                            }}
                          >
                            {Object.entries(CARAVAN_SIZES).map(([key, value]) => (
                              <option key={key} value={key}>
                                {value.label}
                              </option>
                            ))}
                          </select>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                            <span className="h-3 w-6 rounded-full" style={{ backgroundColor: selectedElement.color }} />
                            <span>Preview colour updates with each size.</span>
                          </div>
                        </div>
                      </>
                    )}
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
                <div className="flex items-center justify-between">
                  <dt>Site area</dt>
                  <dd className="font-semibold text-slate-900">{stats.siteArea} m²</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Caravan coverage</dt>
                  <dd className="font-semibold text-slate-900">{stats.caravanArea} m²</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Usable area</dt>
                  <dd className="font-semibold text-emerald-700">{stats.netArea} m²</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Caravan model mix</dt>
                  <dd className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                    {['SRP', 'SRT', 'SRH', 'SRV', 'SRC'].map((variant) => (
                      <span
                        key={variant}
                        className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-800"
                      >
                        {variant}: {stats.caravanVariantCounts[variant as RectShapeElement['caravanVariant']] ?? 0}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-900">Firebase draft sync</p>
              <p className="text-xs text-slate-500">
                Enter your Firebase REST API details to store drafts. Data is stored as a JSON string in the chosen collection.
              </p>
              <div className="space-y-2 text-sm">
                <Label className="text-xs text-slate-500">API key</Label>
                <Input
                  placeholder="AIza..."
                  value={firebaseConfig.apiKey}
                  onChange={(event) => setFirebaseConfig((prev) => ({ ...prev, apiKey: event.target.value }))}
                />
                <Label className="text-xs text-slate-500">Project ID</Label>
                <Input
                  placeholder="your-project-id"
                  value={firebaseConfig.projectId}
                  onChange={(event) => setFirebaseConfig((prev) => ({ ...prev, projectId: event.target.value }))}
                />
                <Label className="text-xs text-slate-500">Collection (optional)</Label>
                <Input
                  placeholder="drafts"
                  value={firebaseConfig.collection}
                  onChange={(event) => setFirebaseConfig((prev) => ({ ...prev, collection: event.target.value }))}
                />
                {draftMessage && (
                  <p className="text-xs font-semibold text-amber-700">{draftMessage}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ShowLayoutDesigner;
