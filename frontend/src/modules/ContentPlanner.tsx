import { useState, useMemo, lazy, Suspense, useEffect, useRef } from 'react';
import { pctToPx } from '../engine/multiproj';
import { LengthUnit, round } from '../engine/units';
import { download } from '../util';
import { usePlannerStore } from '../plannerStore';
import { useProjectStore } from '../projectStore';

const PlannerRoom3D = lazy(() => import('./PlannerRoom3D'));

interface PresetRes { label: string; w: number; h: number }
const RESOLUTIONS: PresetRes[] = [
  { label: 'WUXGA (1920×1200) - 16:10', w: 1920, h: 1200 },
  { label: 'Full HD (1920×1080) - 16:9', w: 1920, h: 1080 },
  { label: '4K UHD (3840×2160) - 16:9', w: 3840, h: 2160 },
  { label: '4K DCI (4096×2160)', w: 4096, h: 2160 },
  { label: 'WXGA (1280×800)', w: 1280, h: 800 },
  { label: 'Özel (Custom)', w: 1920, h: 1080 },
];

export type SurfaceType = 'wall' | 'floor' | 'ceiling';
export type SurfaceGeometry =
  | 'flat'          // Düz Duvar / Dikdörtgen Zemin
  | 'concave_arc'   // İçbükey / Dışbükey Kavisli Duvar (Yarıçap R + Açı °)
  | 'cylinder_360'  // 360° Tam Yuvarlak Silindir Oda (Çap D + Yükseklik H, Sonsuz Döngü N Overlap)
  | 'dome'          // Kubbe / Yarım Küre (Fulldome Fisheye 1:1 Kare Master)
  | 'sphere'        // Tam Küre 360°×180° (Equirectangular 2:1 Açınım)
  | 'circle_floor'; // Yuvarlak Dairesel Zemin (1:1 Kare İçinde Daire Maske)

export type LayoutMode = 'cross' | 'strip' | 'stacked' | 'custom';
export type CalcMethod = 'aspect_ref' | 'projector_blend';

export interface SurfaceItem {
  id: string;
  name: string;
  type: SurfaceType;
  geometry: SurfaceGeometry;
  widthM: number;       // Düz duvar genişliği (m)
  heightM: number;      // Yükseklik (m)
  radiusM: number;      // Kavis yarıçapı (R) veya Silindir/Kubbe/Küre yarıçapı (m)
  angleDeg: number;     // Kavis merkez açısı (derece)
  resIdx: number;       // Seçili çözünürlük indeksi
  customW: number;      // Özel projektör genişliği (px)
  customH: number;      // Özel projektör yüksekliği (px)
  orient: 'landscape' | 'portrait';
  cols: number;         // Yatay/Çevresel projektör sayısı (N_x)
  rows: number;         // Dikey/Meridyen projektör sırası (N_y)
  overlapMode: 'percent' | 'pixel';
  overlapX: number;     // Yatay overlap (% veya px)
  overlapY: number;     // Dikey overlap (% veya px)
  // UZAKLIK, LENS VE PROJEKTÖR YÜKSEKLİK / KAYDIRMA PARAMETRELERİ
  throwDistM: number;   // Projektörün duvara/yüzeye atım uzaklığı (m)
  throwRatio: number;   // Projektör Lens Atım Oranı (Throw Ratio, örn: 0.80 : 1)
  viewDistM: number;    // İzleyicinin yüzeye bakış uzaklığı (m) -> İdeal mm/px'i belirler!
  projMountHeightM?: number; // Projektörün yerden montaj yüksekliği (m) (örn: 4.1m)
  projShiftXM?: number;      // Projektör dizisini ve görüntüyü yatay sağa/sola kaydırma (m) (- sol, + sağ)
  projShiftYM?: number;      // Görüntü hedef merkezini dikey yukarı/aşağı kaydırma (m)
  textOffsetX?: number;      // 2B şemada yazı etiketlerini X yönünde kaydırma (px)
  textOffsetY?: number;      // 2B şemada yazı etiketlerini Y yönünde kaydırma (px)
  textOffsets?: {
    name?: { x: number; y: number };
    resolution?: { x: number; y: number };
    density?: { x: number; y: number };
    dimensions?: { x: number; y: number };
  };
  color: string;        // Şemadaki yüzey rengi
  canvasX: number;      // Özel yerleşim modunda X koordinatı (px)
  canvasY: number;      // Özel yerleşim modunda Y koordinatı (px)
  rotate90: boolean;    // Şemada yüzeyi 90 derece döndür
  syncFloorWithWalls?: boolean; // Zemini duvar piksel yoğunluğuyla eşitle
}

export interface CalculatedSurface extends SurfaceItem {
  effectiveWidthM: number;   // Hesaplanan gerçek açınım genişliği (m)
  effectiveHeightM: number;  // Hesaplanan gerçek açınım yüksekliği (m)
  areaM2: number;            // Fiziksel yüzey alanı (m²)
  chordWidthM: number;       // Kavisli duvarda kiriş (m)
  sagittaM: number;          // Kavis derinliği (m)
  isClosedLoopX: boolean;    // 360° tam turda N overlap
  isCircularMask: boolean;   // Kubbe veya Dairesel Zemin için dairesel maske

  projW: number;
  projH: number;
  aspectPhysical: number;    // Açınım Fiziksel Oranı (effectiveWidthM / effectiveHeightM)
  aspectProjector: number;   // Toplam Projeksiyon Oranı (projNetW / projNetH)
  aspectContent: number;     // Aktif İçerik Oranı (netW / netH)

  // 1) Orana Göre İçerik Çözünürlüğü
  aspectW: number;
  aspectH: number;

  // 2) Projeksiyon & Overlap Bazlı Donanım Çözünürlüğü
  ovPxX: number;
  ovPxY: number;
  overlapCountX: number;
  totalRawW: number;
  totalRawH: number;
  totalOvW: number;
  totalOvH: number;
  projNetW: number;
  projNetH: number;

  // İçerik (Oran) için gereken ideal overlap
  impliedTotalOvW: number;
  impliedOvPxX: number;
  impliedOvPctX: number;

  // Seçili metoda göre aktif kullanılan netW ve netH
  netW: number;
  netH: number;
  drawW: number;
  drawH: number;
  posX: number;
  posY: number;

  // A) YÜZEYDEKİ MEVCUT PİKSEL YOĞUNLUĞU (Yüzeye Tam Oturduğunda)
  mmPerPxW: number;          // Yatay 1 piksel kaç mm: (effectiveWidthM * 1000) / netW
  mmPerPxH: number;          // Dikey 1 piksel kaç mm: (effectiveHeightM * 1000) / netH
  avgMmPerPx: number;        // Ortalama piksel boyutu (mm/px)
  pxPerMeterW: number;       // 1 metredeki yatay piksel sayısı (px/m)
  pxPerMeterH: number;       // 1 metredeki dikey piksel sayısı (px/m)
  pxPerCm: number;           // 1 cm'deki piksel sayısı (px/cm)
  ppi: number;               // İnç başına piksel yoğunluğu (PPI = 25.4 / avgMmPerPx)
  pxPerM2: number;           // 1 m² alana düşen toplam piksel yoğunluğu (px/m²)

  // B) PROJEKTÖR UZAKLIĞI (throwDistM) VE LENS (throwRatio) BAZLI GERÇEK OPTİK HESAP
  singleProjWidthM: number;  // Tek projektörün bu uzaklıktan açtığı görüntü genişliği: D / TR (m)
  singleProjHeightM: number; // Tek projektörün bu uzaklıktan açtığı görüntü yüksekliği (m)
  totalOpticalWidthM: number;// N projektörün overlap sonrası bu uzaklıktan kapladığı toplam en (m)
  distMmPerPx: number;       // Uzaklığa göre 1 pikselin gerçek optik boyutu: (singleProjWidthM * 1000) / projW
  distPpi: number;           // Uzaklığa göre gerçek optik PPI
  distPxPerMeter: number;    // Uzaklığa göre gerçek optik px/m
  requiredThrowDistM: number;// Duvar yüksekliğini tam doldurmak için gereken ideal projektör uzaklığı (m)
  recommendedColsForDist: number; // Girilen uzaklıktan bu duvar genişliğini doldurmak için gereken projektör adedi

  // C) İZLEYİCİ BAKIŞ UZAKLIĞINA (viewDistM) GÖRE İDEAL PİKSEL BOYUTU (İnsan Gözü Acuity)
  idealRetinaMmPerPx: number;// 1 arcmin kusursuz keskinlik sınırı (mm/px)
  idealMuseumMmPerPx: number;// İzleme mesafesine göre ideal müze/immersive piksel boyutu (mm/px)
  idealMuseumPpi: number;    // İzleme mesafesine göre ideal PPI
  minViewingDistM: number;   // Mevcut piksel boyutunda piksellerin seçilmeyeceği minimum bakış mesafesi (m)
  isQualityOkForViewer: boolean; // Mevcut piksel boyutu izleyici mesafesi için uygun mu?

  totalProjectors: number;
  geometryFormulaText: string;
  projSlices: { index: number; col: number; row: number; startX: number; endX: number; startY: number; endY: number }[];
  overlapZonesX: { index: number; startX: number; width: number; pct: number }[];
  overlapZonesY: { index: number; startY: number; height: number; pct: number }[];
}

const SURFACE_COLORS = [
  '#0ea5e9', // Sky
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
];

const GEOMETRY_LABELS: Record<SurfaceGeometry, string> = {
  flat: 'Düz Yüzey (Dikdörtgen Duvar / Zemin)',
  concave_arc: 'İçbükey / Dışbükey Kavisli Duvar (Concave / Convex Arc)',
  cylinder_360: '360° Tam Yuvarlak Silindir Oda (Sonsuz Döngü)',
  dome: 'Kubbe / Yarım Küre (Fulldome 1:1 Fisheye Master)',
  sphere: 'Tam Küre 360°×180° (Equirectangular 2:1 Açınım)',
  circle_floor: 'Tam Yuvarlak Dairesel Zemin (1:1 Daire Maskeli)',
};

const INITIAL_SURFACES: SurfaceItem[] = [
  {
    id: 'surf-1',
    name: '1. Duvar (Sol Uzun)',
    type: 'wall',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 120,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: SURFACE_COLORS[0],
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
  },
  {
    id: 'surf-2',
    name: '2. Duvar (Ön Kısa)',
    type: 'wall',
    geometry: 'flat',
    widthM: 7.00,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 90,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 2,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 15,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: SURFACE_COLORS[1],
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
  },
  {
    id: 'surf-3',
    name: '3. Duvar (Sağ Uzun)',
    type: 'wall',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 4.30,
    radiusM: 6.0,
    angleDeg: 120,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 1,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 10,
    throwDistM: 5.50,
    throwRatio: 0.80,
    viewDistM: 3.50,
    color: SURFACE_COLORS[2],
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
  },
  {
    id: 'surf-4',
    name: 'Zemin (Floor)',
    type: 'floor',
    geometry: 'flat',
    widthM: 23.30,
    heightM: 7.00,
    radiusM: 6.0,
    angleDeg: 360,
    resIdx: 0,
    customW: 1920,
    customH: 1200,
    orient: 'landscape',
    cols: 4,
    rows: 2,
    overlapMode: 'percent',
    overlapX: 20.4,
    overlapY: 18.6,
    throwDistM: 4.30,
    throwRatio: 0.65,
    viewDistM: 1.80,
    color: SURFACE_COLORS[3],
    canvasX: 0,
    canvasY: 0,
    rotate90: true,
    syncFloorWithWalls: true,
  },
];

export interface PhysicalRoomConfig {
  enabled: boolean;
  widthM: number;   // Fiziksel oda genişliği (X - m)
  lengthM: number;  // Fiziksel oda uzunluğu/derinliği (Z - m)
  heightM: number;  // Fiziksel oda tavan yüksekliği (Y - m) (Duvar yüksekliğinden bağımsız!)
}

export default function ContentPlanner({ unit: _unit }: { unit: LengthUnit }) {
  const storeSurfaces = usePlannerStore(state => state.surfaces);
  const storePhysicalRoom = usePlannerStore(state => state.physicalRoom);
  const setStoreSurfaces = usePlannerStore(state => state.setSurfaces);
  const setStorePhysicalRoom = usePlannerStore(state => state.setPhysicalRoom);
  const setStoreCalculatedSurfaces = usePlannerStore(state => state.setCalculatedSurfaces);

  const [surfaces, setSurfaces] = useState<SurfaceItem[]>(storeSurfaces);
  const [selectedId, setSelectedId] = useState<string>('surf-1');
  const [calcMethod, setCalcMethod] = useState<CalcMethod>('aspect_ref');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('cross');
  const [showSlices, setShowSlices] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [show2dName, setShow2dName] = useState<boolean>(true);
  const [show2dResolution, setShow2dResolution] = useState<boolean>(true);
  const [show2dDensity, setShow2dDensity] = useState<boolean>(true);
  const [show2dDimensions, setShow2dDimensions] = useState<boolean>(true);
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [isExpandedView, setIsExpandedView] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [physicalRoom, setPhysicalRoom] = useState<PhysicalRoomConfig>(storePhysicalRoom);
  const [report2dToast, setReport2dToast] = useState(false);
  const svg2dRef = useRef<SVGSVGElement | null>(null);

  const capture2DViewToReport = () => {
    const svgEl = svg2dRef.current;
    if (!svgEl) return;
    try {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        const w = (svgEl.clientWidth || 1200) * scale;
        const h = (svgEl.clientHeight || 700) * scale;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#060911';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png');

          const prevMeta = useProjectStore.getState().meta;
          const existing = prevMeta.room3dSnapshots && prevMeta.room3dSnapshots.length > 0
            ? prevMeta.room3dSnapshots
            : (prevMeta.room3dSnapshotUrl ? [prevMeta.room3dSnapshotUrl] : []);
          const updated = [...existing, dataUrl];
          useProjectStore.getState().setMeta({
            room3dSnapshotUrl: dataUrl,
            room3dSnapshots: updated,
          });
          setReport2dToast(true);
          setTimeout(() => setReport2dToast(false), 3000);
        }
        URL.revokeObjectURL(blobUrl);
      };
      img.src = blobUrl;
    } catch (err) {
      console.error('2B Açınım Çizimini Rapora Aktarma Hatası:', err);
    }
  };

  // 2B Açınım Çiziminde Yazı Gruplarını ve Seçilen Metinleri Bağımsız Sürükleme / Kaydırma
  type TextItemKey = 'name' | 'resolution' | 'density' | 'dimensions';
  const [draggingText, setDraggingText] = useState<{ surfaceId: string; key: TextItemKey } | null>(null);
  const dragTextStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number; scale: number } | null>(null);

  const handleStartDragText = (surfaceId: string, key: TextItemKey, e: React.PointerEvent, scaledWidthPx: number, vbW: number) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    const surf = surfaces.find(s => s.id === surfaceId);
    const scale = vbW / Math.max(1, scaledWidthPx);
    const baseOffsetX = surf?.textOffsets?.[key]?.x ?? (surf?.textOffsetX || 0);
    const baseOffsetY = surf?.textOffsets?.[key]?.y ?? (surf?.textOffsetY || 0);
    setDraggingText({ surfaceId, key });
    dragTextStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: baseOffsetX,
      initY: baseOffsetY,
      scale,
    };
  };

  const handlePointerMoveText = (e: React.PointerEvent) => {
    if (!draggingText || !dragTextStartRef.current) return;
    const { startX, startY, initX, initY, scale } = dragTextStartRef.current;
    const dx = (e.clientX - startX) * scale;
    const dy = (e.clientY - startY) * scale;
    const { surfaceId, key } = draggingText;
    setSurfaces(prev =>
      prev.map(s => {
        if (s.id !== surfaceId) return s;
        const currentOffsets = s.textOffsets || {};
        return {
          ...s,
          textOffsets: {
            ...currentOffsets,
            [key]: { x: Math.round(initX + dx), y: Math.round(initY + dy) },
          },
        };
      })
    );
  };

  const handlePointerUpText = (e: React.PointerEvent) => {
    if (draggingText) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingText(null);
      dragTextStartRef.current = null;
    }
  };

  const resetAllTextOffsets = () => {
    setSurfaces(prev => prev.map(s => ({ ...s, textOffsetX: 0, textOffsetY: 0, textOffsets: undefined })));
  };

  // Değişiklikleri CAD & Elektrik modülünün okuduğu ortak plannerStore'a yaz
  useEffect(() => {
    setStoreSurfaces(surfaces);
  }, [surfaces, setStoreSurfaces]);

  useEffect(() => {
    setStorePhysicalRoom(physicalRoom);
  }, [physicalRoom, setStorePhysicalRoom]);

  // ==========================================
  // HAZIR ODA & ÖZEL GEOMETRİ ŞABLONLARI
  // ==========================================
  const applyPreset = (preset: 'box-5' | 'u-floor' | 'concave' | 'cylinder-360' | 'dome-planetarium' | 'sphere-360') => {
    if (preset === 'u-floor') {
      setSurfaces(INITIAL_SURFACES);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'box-5') {
      const s: SurfaceItem[] = [
        ...INITIAL_SURFACES.slice(0, 3),
        {
          id: 'surf-5', name: '4. Duvar (Arka Kısa)', type: 'wall', geometry: 'flat',
          widthM: 7.00, heightM: 4.30, radiusM: 5, angleDeg: 90,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 1,
          overlapMode: 'percent', overlapX: 15, overlapY: 10,
          throwDistM: 5.50, throwRatio: 0.80, viewDistM: 3.50,
          color: SURFACE_COLORS[4], canvasX: 0, canvasY: 0, rotate90: false,
        },
        INITIAL_SURFACES[3],
      ];
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('cross');
    } else if (preset === 'concave') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'İçbükey Kavisli Sahne (135°)', type: 'wall', geometry: 'concave_arc',
          widthM: 18.85, heightM: 4.00, radiusM: 8.0, angleDeg: 135,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 4, rows: 1,
          overlapMode: 'percent', overlapX: 15, overlapY: 10,
          throwDistM: 6.40, throwRatio: 1.00, viewDistM: 4.00,
          color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'cylinder-360') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: '360° Silindir Duvar (Çap 10m)', type: 'wall', geometry: 'cylinder_360',
          widthM: 31.42, heightM: 4.00, radiusM: 5.0, angleDeg: 360,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 6, rows: 1,
          overlapMode: 'percent', overlapX: 18, overlapY: 10,
          throwDistM: 5.00, throwRatio: 0.80, viewDistM: 3.50,
          color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
        {
          id: 'surf-2', name: 'Yuvarlak Zemin (Çap 10m)', type: 'floor', geometry: 'circle_floor',
          widthM: 10.0, heightM: 10.0, radiusM: 5.0, angleDeg: 360,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 3,
          overlapMode: 'percent', overlapX: 15, overlapY: 15,
          throwDistM: 4.00, throwRatio: 0.65, viewDistM: 1.80,
          color: SURFACE_COLORS[3], canvasX: 0, canvasY: 0, rotate90: false,
          syncFloorWithWalls: true,
        },
      ];
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'dome-planetarium') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'Kubbe / Planetarium (Çap 12m)', type: 'ceiling', geometry: 'dome',
          widthM: 18.85, heightM: 18.85, radiusM: 6.0, angleDeg: 180,
          resIdx: 2, customW: 3840, customH: 2160, orient: 'landscape', cols: 2, rows: 2,
          overlapMode: 'percent', overlapX: 15, overlapY: 15,
          throwDistM: 6.00, throwRatio: 0.60, viewDistM: 6.00,
          color: SURFACE_COLORS[5], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'sphere-360') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'Tam Küre 360°×180° (Çap 8m)', type: 'wall', geometry: 'sphere',
          widthM: 25.13, heightM: 12.57, radiusM: 4.0, angleDeg: 360,
          resIdx: 2, customW: 3840, customH: 2160, orient: 'landscape', cols: 4, rows: 2,
          overlapMode: 'percent', overlapX: 15, overlapY: 15,
          throwDistM: 4.00, throwRatio: 0.60, viewDistM: 4.00,
          color: SURFACE_COLORS[4], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    }
  };

  // ==========================================
  // YÜZEY EKLEME / SİLME / GÜNCELLEME
  // ==========================================
  const addSurface = (geometry: SurfaceGeometry, type: SurfaceType = 'wall') => {
    const id = `surf-${Date.now()}`;
    const count = surfaces.length + 1;
    const defaultName =
      geometry === 'flat' && type === 'wall' ? `${count}. Düz Duvar` :
      geometry === 'flat' && type === 'floor' ? 'Dikdörtgen Zemin' :
      geometry === 'concave_arc' ? `${count}. Kavisli Duvar (Concave)` :
      geometry === 'cylinder_360' ? '360° Tam Silindir Duvar' :
      geometry === 'dome' ? 'Kubbe / Yarım Küre (Dome)' :
      geometry === 'sphere' ? 'Tam Küre (Sphere 360°)' : 'Dairesel Yuvarlak Zemin';

    const newSurf: SurfaceItem = {
      id,
      name: defaultName,
      type,
      geometry,
      widthM: 12.0,
      heightM: 4.30,
      radiusM: 5.0,
      angleDeg: geometry === 'concave_arc' ? 120 : 360,
      resIdx: 0,
      customW: 1920,
      customH: 1200,
      orient: 'landscape',
      cols: geometry === 'cylinder_360' ? 6 : 3,
      rows: geometry === 'dome' || geometry === 'sphere' || geometry === 'circle_floor' ? 2 : 1,
      overlapMode: 'percent',
      overlapX: 15,
      overlapY: 15,
      throwDistM: type === 'floor' ? 4.30 : 5.00,
      throwRatio: type === 'floor' ? 0.65 : 0.80,
      viewDistM: type === 'floor' ? 1.80 : 3.50,
      color: SURFACE_COLORS[surfaces.length % SURFACE_COLORS.length],
      canvasX: 0,
      canvasY: 0,
      rotate90: false,
      syncFloorWithWalls: type === 'floor',
    };
    setSurfaces(prev => [...prev, newSurf]);
    setSelectedId(id);
  };

  const removeSurface = (id: string) => {
    if (surfaces.length <= 1) return;
    const filtered = surfaces.filter(s => s.id !== id);
    setSurfaces(filtered);
    if (selectedId === id) {
      setSelectedId(filtered[0].id);
    }
  };

  const moveSurface = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= surfaces.length) return;
    const copy = [...surfaces];
    const temp = copy[index];
    copy[index] = copy[target];
    copy[target] = temp;
    setSurfaces(copy);
  };

  const updateSurface = (id: string, patch: Partial<SurfaceItem>) => {
    setSurfaces(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  // ==========================================
  // DİNAMİK GEOMETRİK AÇINIM, UZAKLIK BAZLI OPTİK PİKSEL YOĞUNLUĞU VE PIXEL MAP MOTORU
  // ==========================================
  const calculation = useMemo(() => {
    const firstWall = surfaces.find(s => s.type === 'wall') || surfaces[0];
    const fwPreset = RESOLUTIONS[firstWall.resIdx];
    const fwBaseW = firstWall.resIdx === RESOLUTIONS.length - 1 ? firstWall.customW : fwPreset.w;
    const fwBaseH = firstWall.resIdx === RESOLUTIONS.length - 1 ? firstWall.customH : fwPreset.h;
    const fwProjH = firstWall.orient === 'landscape' ? fwBaseH : fwBaseW;
    const fwOvY = firstWall.rows > 1
      ? (firstWall.overlapMode === 'percent' ? pctToPx(firstWall.overlapY, fwProjH) : Math.round(firstWall.overlapY))
      : 0;
    const fwNetH = Math.max(100, firstWall.rows * fwProjH - (firstWall.rows - 1) * fwOvY);
    const wallRefPxPerMeter = fwNetH / Math.max(0.1, firstWall.heightM);

    const rawCalculated: CalculatedSurface[] = surfaces.map(s => {
      // 1. GEOMETRİ TİPİNE GÖRE FİZİKSEL AÇINIM (UNWRAP) GENİŞLİK, YÜKSEKLİK VE ALAN (m²)
      let effectiveWidthM = s.widthM;
      let effectiveHeightM = s.heightM;
      let areaM2 = round(s.widthM * s.heightM, 2);
      let chordWidthM = s.widthM;
      let sagittaM = 0;
      let isClosedLoopX = false;
      let isCircularMask = false;
      let geometryFormulaText = `Düz Yüzey: ${s.widthM}m × ${s.heightM}m (${areaM2} m²)`;

      const R = Math.max(0.5, s.radiusM);
      const D = R * 2;
      const rad = (s.angleDeg * Math.PI) / 180;

      if (s.geometry === 'concave_arc') {
        effectiveWidthM = round(2 * Math.PI * R * (s.angleDeg / 360), 2);
        effectiveHeightM = s.heightM;
        areaM2 = round(effectiveWidthM * effectiveHeightM, 2);
        chordWidthM = round(2 * R * Math.sin(rad / 2), 2);
        sagittaM = round(R * (1 - Math.cos(rad / 2)), 2);
        geometryFormulaText = `Yay Açınımı: L = 2·π·${R}m·(${s.angleDeg}°/360°) = ${effectiveWidthM}m (Kiriş: ${chordWidthM}m, Derinlik: ${sagittaM}m)`;
      } else if (s.geometry === 'cylinder_360') {
        effectiveWidthM = round(2 * Math.PI * R, 2);
        effectiveHeightM = s.heightM;
        areaM2 = round(effectiveWidthM * effectiveHeightM, 2);
        chordWidthM = round(D, 2);
        sagittaM = R;
        isClosedLoopX = true;
        geometryFormulaText = `360° Silindir Çevresi: L = π·D = 3.1416 × ${D}m = ${effectiveWidthM}m (${areaM2} m²)`;
      } else if (s.geometry === 'dome') {
        const domeArc = round(Math.PI * R, 2);
        effectiveWidthM = domeArc;
        effectiveHeightM = domeArc;
        areaM2 = round(2 * Math.PI * R * R, 2);
        chordWidthM = round(D, 2);
        sagittaM = R;
        isCircularMask = true;
        geometryFormulaText = `Kubbe (Domemaster 1:1): Çap=${D}m, Kubbe Yay = π·R = ${domeArc}m × ${domeArc}m (Alan: ${areaM2} m²)`;
      } else if (s.geometry === 'sphere') {
        effectiveWidthM = round(2 * Math.PI * R, 2);
        effectiveHeightM = round(Math.PI * R, 2);
        areaM2 = round(4 * Math.PI * R * R, 2);
        chordWidthM = round(D, 2);
        sagittaM = R;
        isClosedLoopX = true;
        geometryFormulaText = `Tam Küre (2:1 Harita): Ekvator = 2·π·R = ${effectiveWidthM}m, Kutup Yay = π·R = ${effectiveHeightM}m (Alan: ${areaM2} m²)`;
      } else if (s.geometry === 'circle_floor') {
        effectiveWidthM = round(D, 2);
        effectiveHeightM = round(D, 2);
        areaM2 = round(Math.PI * R * R, 2);
        chordWidthM = round(D, 2);
        isCircularMask = true;
        geometryFormulaText = `Yuvarlak Zemin: Çap D = ${D}m × ${D}m (Alan: ${areaM2} m²)`;
      }

      // 2. SEÇİLEN PROJEKTÖRÜN DONANIM VE OVERLAP HESABI
      const preset = RESOLUTIONS[s.resIdx];
      const baseW = s.resIdx === RESOLUTIONS.length - 1 ? s.customW : preset.w;
      const baseH = s.resIdx === RESOLUTIONS.length - 1 ? s.customH : preset.h;

      const projW = s.orient === 'landscape' ? baseW : baseH;
      const projH = s.orient === 'landscape' ? baseH : baseW;

      // Dikeyde tek sıra projektör varsa (rows === 1) iki projektör arasında overlap olmaz,
      // bu nedenle projNetH doğrudan tek projektörün yüksekliğidir (1200 px).
      // Sadece rows > 1 ise dikey overlap düşülür.
      const overlapCountX = isClosedLoopX ? (s.cols > 1 ? s.cols : 0) : Math.max(0, s.cols - 1);
      const overlapCountY = Math.max(0, s.rows - 1);
      const ovPxX = s.overlapMode === 'percent' ? pctToPx(s.overlapX, projW) : Math.round(s.overlapX);
      const ovPxY = s.overlapMode === 'percent' ? pctToPx(s.overlapY, projH) : Math.round(s.overlapY);

      const totalRawW = s.cols * projW;
      const totalRawH = s.rows * projH;

      // Yatayda 1 projektör varsa ve kullanıcı manuel kırpma/pay istediyse 1*ovPxX, aksi halde (N-1)*ovPxX
      const effectiveOvCountX = s.cols === 1 ? (s.overlapX > 0 ? 1 : 0) : overlapCountX;
      // Dikeyde sadece sıra sayısı > 1 ise overlap uygulanır
      const effectiveOvCountY = overlapCountY;
      const totalOvW = effectiveOvCountX * ovPxX;
      const totalOvH = effectiveOvCountY * ovPxY;

      const projNetW = Math.max(100, totalRawW - totalOvW);
      const projNetH = Math.max(100, totalRawH - totalOvH);

      // 3. ORANA GÖRE İÇERİK ÇÖZÜNÜRLÜĞÜ
      const surfacePxPerMeter =
        s.type === 'floor' && s.syncFloorWithWalls
          ? wallRefPxPerMeter
          : projNetH / Math.max(0.1, effectiveHeightM);

      const aspectH =
        s.type === 'floor' && s.syncFloorWithWalls
          ? Math.max(100, Math.round(effectiveHeightM * wallRefPxPerMeter))
          : projNetH;
      const aspectW = Math.max(100, Math.round(effectiveWidthM * surfacePxPerMeter));

      const netW = calcMethod === 'aspect_ref' ? aspectW : projNetW;
      const netH = calcMethod === 'aspect_ref' ? aspectH : projNetH;

      // Oranlar (Aspect Ratios)
      const aspectPhysical = round(effectiveWidthM / Math.max(0.1, effectiveHeightM), 2);
      const aspectProjector = round(projNetW / Math.max(1, projNetH), 2);
      const aspectContent = round(netW / Math.max(1, netH), 2);

      // İçerik genişliğini (netW) tutturmak için gereken gerçek overlap (1 projektörde de manuel pay olarak gösterilir):
      const impliedTotalOvW = totalRawW - netW;
      const denomX = overlapCountX > 0 ? overlapCountX : 1;
      const impliedOvPxX = round(impliedTotalOvW / denomX, 1);
      const impliedOvPctX = round((impliedOvPxX / projW) * 100, 1);

      const drawW = s.rotate90 ? netH : netW;
      const drawH = s.rotate90 ? netW : netH;

      // 4. A) YÜZEY BAZLI PİKSEL YOĞUNLUĞU (Görüntü Yüzeye Tam Oturduğunda)
      const mmPerPxW = round((effectiveWidthM * 1000) / netW, 2);
      const mmPerPxH = round((effectiveHeightM * 1000) / netH, 2);
      const avgMmPerPx = round((mmPerPxW + mmPerPxH) / 2, 2);
      const pxPerMeterW = round(netW / effectiveWidthM, 1);
      const pxPerMeterH = round(netH / effectiveHeightM, 1);
      const pxPerCm = round(pxPerMeterW / 100, 2);
      const ppi = round(25.4 / avgMmPerPx, 1);
      const pxPerM2 = Math.round((netW * netH) / Math.max(0.1, areaM2));

      // 4. B) PROJEKTÖR UZAKLIĞI (throwDistM) VE LENS (throwRatio) BAZLI GERÇEK OPTİK PİKSEL YOĞUNLUĞU!
      // Tek projektörün duvara olan uzaklığından (D) ve Lens oranından (TR) açtığı gerçek görüntü eni: W_opt = D / TR
      const safeTR = Math.max(0.15, s.throwRatio);
      const safeThrowDist = Math.max(0.5, s.throwDistM);
      const singleProjWidthM = round(safeThrowDist / safeTR, 2);
      const singleProjHeightM = round(singleProjWidthM * (projH / projW), 2);

      // Bu uzaklıktan projektörün duvara düşürdüğü 1 pikselin GERÇEK OPTİK BOYUTU (mm/px):
      const distMmPerPx = round((singleProjWidthM * 1000) / projW, 2);
      const distPpi = round(25.4 / distMmPerPx, 1);
      const distPxPerMeter = round(projW / singleProjWidthM, 1);

      // N adet projektörün bu uzaklıktan toplam kapladığı optik genişlik (m):
      const totalOpticalWidthM = round(singleProjWidthM * (projNetW / projW), 2);

      // Duvar yüksekliğini (effectiveHeightM) tam doldurmak için projektörün konulması gereken İDEAL UZAKLIK (m):
      const neededSingleProjHeightM = effectiveHeightM / (projNetH / projH);
      const neededSingleProjWidthM = neededSingleProjHeightM * (projW / projH);
      const requiredThrowDistM = round(neededSingleProjWidthM * safeTR, 2);

      // Girilen uzaklıktan bu duvar genişliğini (%15 overlap ile) doldurmak için gereken projektör sayısı:
      const effectiveStepM = singleProjWidthM * 0.85;
      const recommendedColsForDist = Math.max(1, Math.ceil(effectiveWidthM / Math.max(0.2, effectiveStepM)));

      // 4. C) İZLEYİCİ BAKIŞ UZAKLIĞINA (viewDistM) GÖRE İDEAL PİKSEL BOYUTU (Acuity)
      // İnsan gözü 1 arcmin (0.0002909 rad) çözünürlüğe sahiptir.
      // Kusursuz Retina Sınırı (1.2 arcmin) ve İdeal Müze/İmmersive Standart (2.5 arcmin):
      const safeViewDist = Math.max(0.3, s.viewDistM);
      const idealRetinaMmPerPx = round(safeViewDist * 0.35, 2);
      const idealMuseumMmPerPx = round(safeViewDist * 0.85, 2);
      const idealMuseumPpi = round(25.4 / idealMuseumMmPerPx, 1);
      // Mevcut piksel boyutunda (avgMmPerPx) piksellerin göze batmayacağı minimum izleme uzaklığı (m):
      const minViewingDistM = round(avgMmPerPx / 0.85, 2);
      const isQualityOkForViewer = avgMmPerPx <= idealMuseumMmPerPx * 1.15;

      // Projektör Slice ve Overlap (Örtüşme) Çizgi Koordinatları:
      // ÇOK ÖNEMLİ: Projektörler duvarın (netW × netH) içine TAM ORTALANIR (Simetrik!).
      // Örn: 2 projektör varsa kesişim bölgesi duvarın tam ortasına (netW / 2) denk gelir;
      // 3 projektör varsa 1/3 ve 2/3 noktalarına simetrik oturur ve genişliği doğrudan ovPxX / ovPxY olur!
      const sliceStepX = Math.max(20, projW - ovPxX);
      const sliceStepY = Math.max(20, projH - ovPxY);
      const totalSpanX = s.cols === 1 ? projW : (isClosedLoopX ? s.cols * sliceStepX : (s.cols - 1) * sliceStepX + projW);
      const totalSpanY = s.rows === 1 ? projH : (s.rows - 1) * sliceStepY + projH;

      // Duvar genişliğine (netW) ve yüksekliğine (netH) göre tam merkezleme ofseti:
      const centerOffsetX = (netW - totalSpanX) / 2;
      const centerOffsetY = (netH - totalSpanY) / 2;

      const projSlices: CalculatedSurface['projSlices'] = [];
      let idx = 1;
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const startX = Math.round(centerOffsetX + c * sliceStepX);
          const endX = startX + projW;
          const startY = Math.round(centerOffsetY + r * sliceStepY);
          const endY = startY + projH;
          projSlices.push({ index: idx++, col: c, row: r, startX, endX, startY, endY });
        }
      }

      // İki projektör arasındaki kesişim / overlap bölgeleri (Duvara göre tam simetrik ve ortalanmış!)
      const overlapZonesX: CalculatedSurface['overlapZonesX'] = [];
      if (s.cols > 1) {
        const countX = isClosedLoopX ? s.cols : s.cols - 1;
        for (let c = 0; c < countX; c++) {
          // c. projektör ile (c+1). projektörün kesişim merkezi, duvarı s.cols eşit parçaya bölen simetrik noktadır
          const seamCenterX = ((c + 1) / s.cols) * netW;
          const ovW = Math.max(0, ovPxX);
          const ovStartX = Math.round(seamCenterX - ovW / 2);
          const ovPct = round((ovPxX / Math.max(1, projW)) * 100, 1);
          overlapZonesX.push({ index: c + 1, startX: ovStartX, width: ovW, pct: ovPct });
        }
      }

      const overlapZonesY: CalculatedSurface['overlapZonesY'] = [];
      if (s.rows > 1) {
        for (let r = 0; r < s.rows - 1; r++) {
          const seamCenterY = ((r + 1) / s.rows) * netH;
          const ovH = Math.max(0, ovPxY);
          const ovStartY = Math.round(seamCenterY - ovH / 2);
          const ovPct = round((ovPxY / Math.max(1, projH)) * 100, 1);
          overlapZonesY.push({ index: r + 1, startY: ovStartY, height: ovH, pct: ovPct });
        }
      }

      return {
        ...s,
        effectiveWidthM,
        effectiveHeightM,
        areaM2,
        chordWidthM,
        sagittaM,
        isClosedLoopX,
        isCircularMask,
        projW,
        projH,
        aspectPhysical,
        aspectProjector,
        aspectContent,
        aspectW,
        aspectH,
        ovPxX,
        ovPxY,
        overlapCountX,
        totalRawW,
        totalRawH,
        totalOvW,
        totalOvH,
        projNetW,
        projNetH,
        impliedTotalOvW,
        impliedOvPxX,
        impliedOvPctX,
        netW,
        netH,
        drawW,
        drawH,
        posX: s.canvasX,
        posY: s.canvasY,
        mmPerPxW,
        mmPerPxH,
        avgMmPerPx,
        pxPerMeterW,
        pxPerMeterH,
        pxPerCm,
        ppi,
        pxPerM2,
        singleProjWidthM,
        singleProjHeightM,
        totalOpticalWidthM,
        distMmPerPx,
        distPpi,
        distPxPerMeter,
        requiredThrowDistM,
        recommendedColsForDist,
        idealRetinaMmPerPx,
        idealMuseumMmPerPx,
        idealMuseumPpi,
        minViewingDistM,
        isQualityOkForViewer,
        totalProjectors: s.cols * s.rows,
        geometryFormulaText,
        projSlices,
        overlapZonesX,
        overlapZonesY,
      };
    });

    // Seçilen Yerleşim Moduna (LayoutMode) göre yüzeyleri diz
    const positioned: CalculatedSurface[] = [];

    if (layoutMode === 'strip') {
      const walls = rawCalculated.filter(s => s.type === 'wall');
      const others = rawCalculated.filter(s => s.type !== 'wall');

      let curX = 0;
      let maxWallH = 0;
      walls.forEach(w => {
        const dW = w.rotate90 ? w.netH : w.netW;
        const dH = w.rotate90 ? w.netW : w.netH;
        positioned.push({ ...w, drawW: dW, drawH: dH, posX: curX, posY: 0 });
        curX += dW;
        if (dH > maxWallH) maxWallH = dH;
      });

      let curY = maxWallH;
      let otherX = 0;
      others.forEach(o => {
        const dW = o.rotate90 ? o.netH : o.netW;
        const dH = o.rotate90 ? o.netW : o.netH;
        positioned.push({ ...o, drawW: dW, drawH: dH, posX: otherX, posY: curY });
        otherX += dW;
      });
    } else if (layoutMode === 'stacked') {
      let curY = 0;
      rawCalculated.forEach(s => {
        const dW = s.rotate90 ? s.netH : s.netW;
        const dH = s.rotate90 ? s.netW : s.netH;
        positioned.push({ ...s, drawW: dW, drawH: dH, posX: 0, posY: curY });
        curY += dH;
      });
    } else if (layoutMode === 'cross') {
      const floor = rawCalculated.find(s => s.type === 'floor') || rawCalculated[0];
      const walls = rawCalculated.filter(s => s.id !== floor.id);

      const leftWall = walls[0];
      const topWall = walls[1];
      const rightWall = walls[2];
      const bottomWall = walls[3];

      const leftW = leftWall ? (leftWall.rotate90 ? leftWall.netH : leftWall.netW) : 0;
      const leftH = leftWall ? (leftWall.rotate90 ? leftWall.netW : leftWall.netH) : 0;

      const topW = topWall ? (topWall.rotate90 ? topWall.netH : topWall.netW) : 0;
      const topH = topWall ? (topWall.rotate90 ? topWall.netW : topWall.netH) : 0;

      const rightW = rightWall ? (rightWall.rotate90 ? rightWall.netH : rightWall.netW) : 0;
      const rightH = rightWall ? (rightWall.rotate90 ? rightWall.netW : rightWall.netH) : 0;

      const bottomW = bottomWall ? (bottomWall.rotate90 ? bottomWall.netH : bottomWall.netW) : 0;
      const bottomH = bottomWall ? (bottomWall.rotate90 ? bottomWall.netW : bottomWall.netH) : 0;

      const floorDrawW = floor.rotate90 ? floor.netH : floor.netW;
      const floorDrawH = floor.rotate90 ? floor.netW : floor.netH;

      positioned.push({
        ...floor,
        drawW: floorDrawW,
        drawH: floorDrawH,
        posX: leftW,
        posY: topH,
      });

      if (leftWall) {
        positioned.push({
          ...leftWall,
          drawW: leftW,
          drawH: leftH,
          posX: 0,
          posY: topH,
        });
      }
      if (topWall) {
        positioned.push({
          ...topWall,
          drawW: topW,
          drawH: topH,
          posX: leftW,
          posY: 0,
        });
      }
      if (rightWall) {
        positioned.push({
          ...rightWall,
          drawW: rightW,
          drawH: rightH,
          posX: leftW + floorDrawW,
          posY: topH,
        });
      }
      if (bottomWall) {
        positioned.push({
          ...bottomWall,
          drawW: bottomW,
          drawH: bottomH,
          posX: leftW,
          posY: topH + floorDrawH,
        });
      }
      let extraY = topH + floorDrawH + bottomH;
      walls.slice(4).forEach(ex => {
        const exW = ex.rotate90 ? ex.netH : ex.netW;
        const exH = ex.rotate90 ? ex.netW : ex.netH;
        positioned.push({
          ...ex,
          drawW: exW,
          drawH: exH,
          posX: leftW,
          posY: extraY,
        });
        extraY += exH;
      });
    } else {
      rawCalculated.forEach(s => {
        positioned.push({
          ...s,
          drawW: s.rotate90 ? s.netH : s.netW,
          drawH: s.rotate90 ? s.netW : s.netH,
          posX: Math.max(0, s.canvasX),
          posY: Math.max(0, s.canvasY),
        });
      });
    }

    let totalCanvasW = 0;
    let totalCanvasH = 0;
    let totalActivePixels = 0;
    let totalProjectors = 0;

    positioned.forEach(p => {
      if (p.posX + p.drawW > totalCanvasW) totalCanvasW = p.posX + p.drawW;
      if (p.posY + p.drawH > totalCanvasH) totalCanvasH = p.posY + p.drawH;
      totalActivePixels += p.netW * p.netH;
      totalProjectors += p.totalProjectors;
    });

    const megapixels = round(totalActivePixels / 1_000_000, 2);
    const mmValues = positioned.map(p => p.avgMmPerPx);
    const minMm = Math.min(...mmValues);
    const maxMm = Math.max(...mmValues);
    const densityMismatchPct = minMm > 0 ? round(((maxMm - minMm) / minMm) * 100, 1) : 0;

    return {
      surfaces: positioned,
      totalCanvasW: Math.max(100, totalCanvasW),
      totalCanvasH: Math.max(100, totalCanvasH),
      totalActivePixels,
      megapixels,
      totalProjectors,
      minMm,
      maxMm,
      densityMismatchPct,
    };
  }, [surfaces, layoutMode, calcMethod]);

  const activeSurface = calculation.surfaces.find(s => s.id === selectedId) || calculation.surfaces[0];

  useEffect(() => {
    setStoreCalculatedSurfaces(calculation.surfaces);
  }, [calculation.surfaces, setStoreCalculatedSurfaces]);

  // ==========================================
  // 1:1 PNG PIXEL MAP ŞABLONU İNDİRME
  // ==========================================
  const downloadPixelMapPng = () => {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 16384 / Math.max(calculation.totalCanvasW, calculation.totalCanvasH));
    c.width = Math.round(calculation.totalCanvasW * scale);
    c.height = Math.round(calculation.totalCanvasH * scale);
    const g = c.getContext('2d')!;
    g.scale(scale, scale);

    g.fillStyle = '#090d16';
    g.fillRect(0, 0, calculation.totalCanvasW, calculation.totalCanvasH);

    calculation.surfaces.forEach(s => {
      g.fillStyle = s.color + '28';
      g.fillRect(s.posX, s.posY, s.drawW, s.drawH);

      if (s.isCircularMask) {
        const cx = s.posX + s.drawW / 2;
        const cy = s.posY + s.drawH / 2;
        const r = Math.min(s.drawW, s.drawH) / 2;
        g.strokeStyle = s.color;
        g.lineWidth = 6;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();

        g.strokeStyle = 'rgba(255,255,255,0.2)';
        g.lineWidth = 3;
        g.setLineDash([12, 10]);
        g.beginPath(); g.arc(cx, cy, r * 0.66, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx, cy, r * 0.33, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }

      if (showGrid) {
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth = 2;
        const step = 200;
        for (let x = s.posX; x <= s.posX + s.drawW; x += step) {
          g.beginPath(); g.moveTo(x, s.posY); g.lineTo(x, s.posY + s.drawH); g.stroke();
        }
        for (let y = s.posY; y <= s.posY + s.drawH; y += step) {
          g.beginPath(); g.moveTo(s.posX, y); g.lineTo(s.posX + s.drawW, y); g.stroke();
        }
      }

      if (showSlices && s.totalProjectors > 1) {
        g.save();
        g.beginPath();
        g.rect(s.posX, s.posY, s.drawW, s.drawH);
        g.clip();

        // Yatay Overlap (Örtüşme) Bölgeleri: Tam simetrik merkezde iki kesikli sarı çizgi ve sarı şerit dolgusu
        s.overlapZonesX.forEach(oz => {
          if (oz.width <= 0) return;
          const ox = s.rotate90 ? s.posX : s.posX + oz.startX;
          const oy = s.rotate90 ? s.posY + oz.startX : s.posY;
          const ow = s.rotate90 ? s.drawW : oz.width;
          const oh = s.rotate90 ? oz.width : s.drawH;

          g.fillStyle = 'rgba(250, 204, 21, 0.16)';
          g.fillRect(ox, oy, ow, oh);

          g.strokeStyle = 'rgba(250, 204, 21, 0.7)';
          g.lineWidth = 3;
          g.setLineDash([14, 9]);
          if (s.rotate90) {
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ow, oy); g.stroke();
            g.beginPath(); g.moveTo(ox, oy + oh); g.lineTo(ox + ow, oy + oh); g.stroke();
          } else {
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, oy + oh); g.stroke();
            g.beginPath(); g.moveTo(ox + ow, oy); g.lineTo(ox + ow, oy + oh); g.stroke();
          }
          g.setLineDash([]);
        });

        // Dikey Overlap (Örtüşme) Bölgeleri
        s.overlapZonesY.forEach(oz => {
          if (oz.height <= 0) return;
          const ox = s.rotate90 ? s.posX + oz.startY : s.posX;
          const oy = s.rotate90 ? s.posY : s.posY + oz.startY;
          const ow = s.rotate90 ? oz.height : s.drawW;
          const oh = s.rotate90 ? s.drawH : oz.height;

          g.fillStyle = 'rgba(250, 204, 21, 0.16)';
          g.fillRect(ox, oy, ow, oh);

          g.strokeStyle = 'rgba(250, 204, 21, 0.7)';
          g.lineWidth = 3;
          g.setLineDash([14, 9]);
          if (s.rotate90) {
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, oy + oh); g.stroke();
            g.beginPath(); g.moveTo(ox + ow, oy); g.lineTo(ox + ow, oy + oh); g.stroke();
          } else {
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + ow, oy); g.stroke();
            g.beginPath(); g.moveTo(ox, oy + oh); g.lineTo(ox + ow, oy + oh); g.stroke();
          }
          g.setLineDash([]);
        });
        g.restore();
      }

      g.strokeStyle = s.color;
      g.lineWidth = 6;
      g.strokeRect(s.posX, s.posY, s.drawW, s.drawH);

      g.save();
      g.beginPath();
      g.rect(s.posX + 8, s.posY + 8, Math.max(20, s.drawW - 16), Math.max(20, s.drawH - 16));
      g.clip();

      const isVerticalBox = s.drawH > s.drawW * 1.45;
      const longSide = Math.max(s.drawW, s.drawH);
      const shortSide = Math.min(s.drawW, s.drawH);
      const maxTextSpan = longSide * 0.90;

      const fs = Math.max(16, Math.min(Math.round(shortSide / 8), Math.round(longSide / 19)));
      const cx = s.posX + s.drawW / 2;
      const cy = s.posY + s.drawH / 2;

      g.translate(cx, cy);
      if (isVerticalBox) {
        g.rotate(-Math.PI / 2);
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = `bold ${fs}px sans-serif`;
      g.fillText(s.name.toUpperCase(), 0, -fs * 1.1, maxTextSpan);

      g.fillStyle = '#4ade80';
      g.font = `bold ${Math.round(fs * 0.95)}px monospace`;
      g.fillText(`${s.netW} × ${s.netH} px (Oran ${s.aspectContent}:1)`, 0, -fs * 0.05, maxTextSpan);

      g.fillStyle = '#38bdf8';
      g.font = `bold ${Math.round(fs * 0.75)}px monospace`;
      g.fillText(
        `Piksel: ${s.avgMmPerPx} mm/px (İdeal ≤${s.idealMuseumMmPerPx}mm @${s.viewDistM}m) | ${s.pxPerMeterW} px/m (${s.ppi} PPI)`,
        0,
        fs * 0.85,
        maxTextSpan
      );

      g.fillStyle = '#cbd5e1';
      g.font = `${Math.round(fs * 0.68)}px monospace`;
      g.fillText(
        `Açınım: ${s.effectiveWidthM}m × ${s.effectiveHeightM}m | PJ Uzaklık: ${s.throwDistM}m (Lens ${s.throwRatio}:1 → ${s.distMmPerPx} mm/px)`,
        0,
        fs * 1.65,
        maxTextSpan
      );
      g.restore();
    });

    c.toBlob(blob => {
      if (blob) download(`pixel-map-${calculation.totalCanvasW}x${calculation.totalCanvasH}.png`, blob);
    });
  };

  // ==========================================
  // TEKNİK ŞARTNAME METNİ KOPYALAMA
  // ==========================================
  const copySpecsToClipboard = () => {
    const lines: string[] = [
      '===================================================================',
      'PROJEKSİYON & İÇERİK ÇÖZÜNÜRLÜĞÜ (PIXEL MAP) TEKNİK RAPORU',
      '===================================================================',
      `Hesaplama Yöntemi                : ${calcMethod === 'aspect_ref' ? 'Yüzey Fiziksel Oranına Göre (Kare Piksel)' : 'Projektör & Overlap Formülüne Göre'}`,
      `Toplam İçerik Canvas Çözünürlüğü : ${calculation.totalCanvasW} × ${calculation.totalCanvasH} px (${calculation.megapixels} MP)`,
      `Toplam Projektör Sayısı          : ${calculation.totalProjectors} Adet`,
      `Piksel Boyutu Aralığı            : ${calculation.minMm} - ${calculation.maxMm} mm/px`,
      '-------------------------------------------------------------------',
      'YÜZEY BAZLI GEOMETRİ, UZAKLIK, PİKSEL YOĞUNLUĞU & PIXEL MAP DETAYLARI:',
    ];

    calculation.surfaces.forEach((s, idx) => {
      lines.push(
        `\n${idx + 1}. ${s.name.toUpperCase()} [${GEOMETRY_LABELS[s.geometry]}]:`,
        `   - Geometrik Açınım            : ${s.geometryFormulaText}`,
        `   - Yüzey Fiziksel Oranı        : ${s.aspectPhysical}:1 (${s.effectiveWidthM}m / ${s.effectiveHeightM}m)`,
        `   - İçerik Pixel Map            : ${s.netW} × ${s.netH} px (Oran: ${s.aspectContent}:1)`,
        `   - Yüzey Piksel Boyutu         : ${s.avgMmPerPx} mm/px (${s.pxPerMeterW} px/m · ${s.ppi} PPI · ${s.pxPerM2.toLocaleString()} px/m²)`,
        `   - Projektör Uzaklığı & Lens   : Atım Mesafesi = ${s.throwDistM}m, Lens TR = ${s.throwRatio}:1`,
        `   - Uzaklığa Göre Optik Piksel  : Tek PJ Eni = ${s.singleProjWidthM}m → ${s.distMmPerPx} mm/px (${s.distPpi} PPI)`,
        `   - İzleyici Bakış Uzaklığı     : ${s.viewDistM}m → İdeal Piksel Boyutu ≤ ${s.idealMuseumMmPerPx} mm/px (${s.isQualityOkForViewer ? 'UYGUN' : 'PİKSELLENME RİSKİ'})`,
        `   - Projektör Dizilimi          : ${s.cols}×${s.rows} Adet (${s.projW}×${s.projH} px, Gereken Overlap: ~${s.impliedOvPxX} px / %${s.impliedOvPctX})`
      );
    });

    lines.push('===================================================================');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('Tüm yüzeylerin Geometri, Uzaklık, Piksel Yoğunluğu ve Pixel Map teknik raporu panoya kopyalandı!');
  };

  return (
    <div className="space-y-3 h-full flex flex-col text-xs">
      {/* ÜST ARAÇ ÇUBUĞU: HESAPLAMA MODU & HIZLI GEOMETRİ ŞABLONLARI */}
      <div className="bg-slate-900 p-2.5 rounded border border-slate-800 flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded overflow-hidden border border-sky-700 bg-slate-950 p-0.5">
            <button
              onClick={() => setCalcMethod('aspect_ref')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                calcMethod === 'aspect_ref'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              1. Yüzey Oranına Göre İçerik Çözünürlüğü (Kare Piksel)
            </button>
            <button
              onClick={() => setCalcMethod('projector_blend')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                calcMethod === 'projector_blend'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2. Projektör & Overlap Formülüne Göre
            </button>
          </div>
        </div>

        {/* HIZLI ODA & GEOMETRİ ŞABLONLARI */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-semibold">Hazır Şablonlar:</span>
          <button onClick={() => applyPreset('box-5')} className="px-2 py-1 rounded bg-sky-900/60 hover:bg-sky-800 text-sky-200 border border-sky-700 font-semibold">
            5-Yüzey Kutu
          </button>
          <button onClick={() => applyPreset('concave')} className="px-2 py-1 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-200 border border-amber-700 font-semibold">
            İçbükey Kavis (Concave)
          </button>
          <button onClick={() => applyPreset('cylinder-360')} className="px-2 py-1 rounded bg-emerald-900/50 hover:bg-emerald-800 text-emerald-200 border border-emerald-700 font-semibold">
            360° Silindir Oda + Yuvarlak Zemin
          </button>
          <button onClick={() => applyPreset('dome-planetarium')} className="px-2 py-1 rounded bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700 font-semibold">
            Kubbe (Dome 1:1)
          </button>
          <button onClick={() => applyPreset('sphere-360')} className="px-2 py-1 rounded bg-pink-900/50 hover:bg-pink-800 text-pink-200 border border-pink-700 font-semibold">
            Tam Küre (Sphere 2:1)
          </button>
        </div>
      </div>

      {/* ANA ÇALIŞMA ALANI */}
      <div className="grid lg:grid-cols-[490px_1fr] gap-3 flex-1 overflow-auto">
        {/* SOL PANEL: YÜZEY EKLEME LİSTESİ + SEÇİLİ YÜZEY GEOMETRİ, UZAKLIK, ORAN & YOĞUNLUK EDİTÖRÜ */}
        <div className="space-y-3 flex flex-col overflow-auto pr-1" style={{ maxHeight: '83vh' }}>
          {/* 1. FARKLI GEOMETRİLERDE YÜZEY EKLEME BUTONLARI */}
          <div className="p-3 rounded bg-slate-900 border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-200 text-xs uppercase tracking-wider">
                1. Proje Yüzeyleri ({surfaces.length} Alan) — Yüzey Ekle:
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => addSurface('flat', 'wall')}
                className="px-2 py-1.5 rounded bg-sky-800/80 hover:bg-sky-700 text-white font-semibold text-[11px] border border-sky-600/50"
              >
                + Düz Duvar
              </button>
              <button
                onClick={() => addSurface('concave_arc', 'wall')}
                className="px-2 py-1.5 rounded bg-amber-800/80 hover:bg-amber-700 text-white font-semibold text-[11px] border border-amber-600/50"
              >
                + Kavisli (Concave)
              </button>
              <button
                onClick={() => addSurface('cylinder_360', 'wall')}
                className="px-2 py-1.5 rounded bg-emerald-800/80 hover:bg-emerald-700 text-white font-semibold text-[11px] border border-emerald-600/50"
              >
                + 360° Silindir
              </button>
              <button
                onClick={() => addSurface('dome', 'ceiling')}
                className="px-2 py-1.5 rounded bg-purple-800/80 hover:bg-purple-700 text-white font-semibold text-[11px] border border-purple-600/50"
              >
                + Kubbe (Dome)
              </button>
              <button
                onClick={() => addSurface('sphere', 'wall')}
                className="px-2 py-1.5 rounded bg-pink-800/80 hover:bg-pink-700 text-white font-semibold text-[11px] border border-pink-600/50"
              >
                + Küre (Sphere)
              </button>
              <button
                onClick={() => addSurface('circle_floor', 'floor')}
                className="px-2 py-1.5 rounded bg-teal-800/80 hover:bg-teal-700 text-white font-semibold text-[11px] border border-teal-600/50"
              >
                + Zemin (Düz/Daire)
              </button>
            </div>

            {/* Eklenen Yüzeyler Listesi */}
            <div className="space-y-1.5 max-h-[155px] overflow-auto pr-0.5 pt-1">
              {calculation.surfaces.map((s, idx) => {
                const isSelected = s.id === activeSurface.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`p-2 rounded border cursor-pointer transition flex justify-between items-center ${
                      isSelected
                        ? 'bg-slate-800/90 border-sky-500 shadow-sm'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <div className="truncate">
                        <div className="font-bold text-slate-200 truncate flex items-center gap-1.5">
                          <span>{s.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-amber-300">
                            Oran {s.aspectPhysical}:1
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {s.effectiveWidthM}×{s.effectiveHeightM}m →{' '}
                          <b className="text-emerald-400">{s.netW}×{s.netH} px</b> |{' '}
                          <span className="text-sky-300">{s.avgMmPerPx} mm/px ({s.ppi} PPI)</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => updateSurface(s.id, { rotate90: !s.rotate90 })}
                        title="Bu yüzeyi çizimde 90° Çevir (Yatay / Dikey)"
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] transition ${
                          s.rotate90
                            ? 'bg-amber-600 text-white hover:bg-amber-500'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ↻ 90°
                      </button>
                      <button
                        onClick={() => moveSurface(idx, -1)}
                        disabled={idx === 0}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSurface(idx, 1)}
                        disabled={idx === surfaces.length - 1}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeSurface(s.id)}
                        disabled={surfaces.length <= 1}
                        className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-800 disabled:opacity-30 text-rose-300 ml-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 1.5 FİZİKSEL ODA KABUĞU ÖLÇÜLERİ (Duvar Projeksiyon Alanından Bağımsız Mimari Oda) */}
            <div className="p-2.5 rounded bg-slate-950 border border-indigo-800/70 space-y-2 mt-2">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-indigo-300 text-[11px]">
                  <input
                    type="checkbox"
                    checked={physicalRoom.enabled}
                    onChange={e => setPhysicalRoom(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  <span>🏛️ Fiziksel Oda Kabuğunu Göster (Duvar Ölçüsünden Bağımsız)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const walls = calculation.surfaces.filter(s => s.type === 'wall');
                    const floor = calculation.surfaces.find(s => s.type === 'floor');
                    const l = walls[0]?.effectiveWidthM || floor?.effectiveWidthM || 23.3;
                    const w = walls[1]?.effectiveWidthM || floor?.effectiveHeightM || 7.0;
                    const h = Math.max(4.5, (walls[0]?.effectiveHeightM || 4.3) + 0.7);
                    setPhysicalRoom(prev => ({ ...prev, widthM: w, lengthM: l, heightM: round(h, 2) }));
                  }}
                  className="px-1.5 py-0.5 rounded bg-indigo-900/70 hover:bg-indigo-800 text-indigo-200 text-[9.5px] font-semibold border border-indigo-700"
                  title="Oda genişlik ve derinliğini duvarlara eşitle, tavanı +0.7m yüksek yap"
                >
                  Duvarlara Uydur
                </button>
              </div>

              {physicalRoom.enabled && (
                <div className="grid grid-cols-3 gap-2 text-[10.5px]">
                  <label>
                    Oda Genişliği X (m)
                    <input
                      className="inp font-bold text-indigo-300"
                      type="number"
                      step="0.2"
                      min="2"
                      value={physicalRoom.widthM}
                      onChange={e => setPhysicalRoom(prev => ({ ...prev, widthM: Math.max(2, +e.target.value) }))}
                    />
                  </label>
                  <label>
                    Oda Uzunluğu Z (m)
                    <input
                      className="inp font-bold text-indigo-300"
                      type="number"
                      step="0.2"
                      min="2"
                      value={physicalRoom.lengthM}
                      onChange={e => setPhysicalRoom(prev => ({ ...prev, lengthM: Math.max(2, +e.target.value) }))}
                    />
                  </label>
                  <label>
                    Oda Tavan Yüksekliği (m)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      step="0.1"
                      min="2"
                      value={physicalRoom.heightM}
                      onChange={e => setPhysicalRoom(prev => ({ ...prev, heightM: Math.max(2, +e.target.value) }))}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* 2. SEÇİLİ YÜZEYİN GEOMETRİ, UZAKLIK, LENS VE PİKSEL YOĞUNLUĞU EDİTÖRÜ */}
          {activeSurface && (
            <div className="p-3 rounded bg-slate-900 border border-sky-800/80 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={activeSurface.color}
                    onChange={e => updateSurface(activeSurface.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                  />
                  <span className="font-bold text-sky-400 text-sm">{activeSurface.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateSurface(activeSurface.id, { rotate90: !activeSurface.rotate90 })}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-bold border transition ${
                      activeSurface.rotate90
                        ? 'bg-amber-600 text-white border-amber-400 shadow'
                        : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                    }`}
                    title="Seçili duvarı/yüzeyi çizimde 90° döndür (Yatay ↔ Dikey)"
                  >
                    ↻ Çizimde 90° Çevir ({activeSurface.rotate90 ? 'Dikey Duruyor' : 'Yatay Duruyor'})
                  </button>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[11px] font-bold">
                    {activeSurface.netW} × {activeSurface.netH} px
                  </span>
                </div>
              </div>

              {/* A) Yüzey Adı ve Geometri Tipi Seçimi */}
              <div className="grid grid-cols-2 gap-2">
                <label>
                  Yüzey Adı
                  <input
                    className="inp font-semibold text-white"
                    value={activeSurface.name}
                    onChange={e => updateSurface(activeSurface.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  Yüzey Şekli / Geometrisi
                  <select
                    className="inp font-bold text-amber-300"
                    value={activeSurface.geometry}
                    onChange={e => updateSurface(activeSurface.id, { geometry: e.target.value as SurfaceGeometry })}
                  >
                    {Object.entries(GEOMETRY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* B) GEOMETRİ TİPİNE GÖRE DİNAMİK FİZİKSEL ÖLÇÜ GİRİŞLERİ */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                {activeSurface.geometry === 'flat' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        Duvar / Zemin Genişliği (m)
                        <input
                          className="inp font-bold text-sky-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.widthM}
                          onChange={e => updateSurface(activeSurface.id, { widthM: Math.max(0.1, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Yükseklik / Kısa Kenar (m)
                        <input
                          className="inp font-bold text-sky-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.heightM}
                          onChange={e => updateSurface(activeSurface.id, { heightM: Math.max(0.1, +e.target.value) })}
                        />
                      </label>
                    </div>
                    {activeSurface.type === 'floor' && calcMethod === 'aspect_ref' && (
                      <label className="flex items-center gap-1.5 text-[11px] text-teal-300 cursor-pointer pt-1 border-t border-slate-900">
                        <input
                          type="checkbox"
                          checked={!!activeSurface.syncFloorWithWalls}
                          onChange={e => updateSurface(activeSurface.id, { syncFloorWithWalls: e.target.checked })}
                        />
                        <span>Zemin piksel yoğunluğunu (mm/px) duvarlarla birebir eşitle</span>
                      </label>
                    )}
                  </div>
                )}

                {activeSurface.geometry === 'concave_arc' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <label>
                        Kavis Yarıçapı R (m)
                        <input
                          className="inp font-bold text-amber-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.radiusM}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Kavis Açısı (° Derece)
                        <input
                          className="inp font-bold text-amber-300"
                          type="number"
                          step="5"
                          min="10"
                          max="359"
                          value={activeSurface.angleDeg}
                          onChange={e => updateSurface(activeSurface.id, { angleDeg: Math.min(359, Math.max(10, +e.target.value)) })}
                        />
                      </label>
                      <label>
                        Duvar Yüksekliği (m)
                        <input
                          className="inp font-bold text-sky-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.heightM}
                          onChange={e => updateSurface(activeSurface.id, { heightM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-900 p-2 rounded border border-amber-900/50 font-mono">
                      <div>
                        <span className="text-slate-400 block">Yay Açınımı (Gerçek):</span>
                        <b className="text-emerald-400 text-xs">{activeSurface.effectiveWidthM} m</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Kiriş (Uçtan Uca Düz):</span>
                        <b className="text-sky-300 text-xs">{activeSurface.chordWidthM} m</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Kavis Derinliği (Ok):</span>
                        <b className="text-amber-300 text-xs">{activeSurface.sagittaM} m</b>
                      </div>
                    </div>
                  </div>
                )}

                {activeSurface.geometry === 'cylinder_360' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <label>
                        Silindir Yarıçapı R (m)
                        <input
                          className="inp font-bold text-emerald-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.radiusM}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Silindir Çapı D (m)
                        <input
                          className="inp font-bold text-emerald-300"
                          type="number"
                          step="0.2"
                          min="1"
                          value={round(activeSurface.radiusM * 2, 2)}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value / 2) })}
                        />
                      </label>
                      <label>
                        Duvar Yüksekliği H (m)
                        <input
                          className="inp font-bold text-sky-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.heightM}
                          onChange={e => updateSurface(activeSurface.id, { heightM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-900 p-2 rounded border border-emerald-900/50 font-mono">
                      <div>
                        <span className="text-slate-400 block">360° Tam Çevre Açınımı:</span>
                        <b className="text-emerald-400 text-xs">{activeSurface.effectiveWidthM} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(2·π·R = π·D)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Mekan İç Çapı (D):</span>
                        <b className="text-sky-300 text-xs">{activeSurface.chordWidthM} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(Yarıçap: {activeSurface.radiusM}m)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Toplam Yüzey Alanı:</span>
                        <b className="text-amber-300 text-xs">{activeSurface.areaM2} m²</b>
                        <span className="text-[9.5px] text-slate-500 block">({activeSurface.cols} PJ Döngü)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeSurface.geometry === 'sphere' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        Küre Yarıçapı R (m)
                        <input
                          className="inp font-bold text-pink-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.radiusM}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Küre Çapı D (m)
                        <input
                          className="inp font-bold text-pink-300"
                          type="number"
                          step="0.2"
                          min="1"
                          value={round(activeSurface.radiusM * 2, 2)}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value / 2) })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-900 p-2 rounded border border-pink-900/50 font-mono">
                      <div>
                        <span className="text-slate-400 block">360° Ekvator Açınımı:</span>
                        <b className="text-emerald-400 text-xs">{activeSurface.effectiveWidthM} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(2·π·R Yatay)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">180° Kutup Yay Boyu:</span>
                        <b className="text-sky-300 text-xs">{activeSurface.effectiveHeightM} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(π·R Dikey)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Küre Yüzey Alanı:</span>
                        <b className="text-amber-300 text-xs">{activeSurface.areaM2} m²</b>
                        <span className="text-[9.5px] text-slate-500 block">(4·π·R² · Oran 2:1)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeSurface.geometry === 'dome' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        Kubbe Yarıçapı R (m)
                        <input
                          className="inp font-bold text-purple-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.radiusM}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Kubbe Taban Çapı D (m)
                        <input
                          className="inp font-bold text-purple-300"
                          type="number"
                          step="0.2"
                          min="1"
                          value={round(activeSurface.radiusM * 2, 2)}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value / 2) })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-900 p-2 rounded border border-purple-900/50 font-mono">
                      <div>
                        <span className="text-slate-400 block">180° Kubbe Yay Açınımı:</span>
                        <b className="text-emerald-400 text-xs">{activeSurface.effectiveWidthM} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(π·R Ufuktan Ufka)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Taban Çevresi (360°):</span>
                        <b className="text-sky-300 text-xs">{round(2 * Math.PI * activeSurface.radiusM, 2)} m</b>
                        <span className="text-[9.5px] text-slate-500 block">(Zenit Yükseklik: {activeSurface.radiusM}m)</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Kubbe Yüzey Alanı:</span>
                        <b className="text-amber-300 text-xs">{activeSurface.areaM2} m²</b>
                        <span className="text-[9.5px] text-slate-500 block">(2·π·R² · 1:1 Fisheye)</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeSurface.geometry === 'circle_floor' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        Zemin Yarıçapı R (m)
                        <input
                          className="inp font-bold text-teal-300"
                          type="number"
                          step="0.1"
                          min="0.5"
                          value={activeSurface.radiusM}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value) })}
                        />
                      </label>
                      <label>
                        Zemin Çapı D (m)
                        <input
                          className="inp font-bold text-teal-300"
                          type="number"
                          step="0.2"
                          min="1"
                          value={round(activeSurface.radiusM * 2, 2)}
                          onChange={e => updateSurface(activeSurface.id, { radiusM: Math.max(0.5, +e.target.value / 2) })}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-900 p-2 rounded border border-teal-900/50 font-mono">
                      <div>
                        <span className="text-slate-400 block">Kare Açınım Kutusu:</span>
                        <b className="text-emerald-400 text-xs">{activeSurface.effectiveWidthM}×{activeSurface.effectiveHeightM} m</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Daire Çevresi:</span>
                        <b className="text-sky-300 text-xs">{round(2 * Math.PI * activeSurface.radiusM, 2)} m</b>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Dairesel Zemin Alanı:</span>
                        <b className="text-amber-300 text-xs">{activeSurface.areaM2} m²</b>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* C) UZAKLIK (MESAFE), LENS VE İZLEYİCİ BAKIŞ MESAFESİ GİRİŞİ VE PİKSEL YOĞUNLUĞU KARTI */}
              <div className="p-2.5 rounded bg-slate-950 border border-sky-700/80 space-y-2.5">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                  <span className="font-bold text-sky-400 text-[11px] uppercase tracking-wider">
                    Uzaklık (Mesafe) & Piksel Yoğunluğu Hesabı
                  </span>
                  <button
                    onClick={() => updateSurface(activeSurface.id, { throwDistM: activeSurface.requiredThrowDistM })}
                    className="px-2 py-0.5 rounded bg-sky-800 hover:bg-sky-700 text-white text-[10px] font-semibold"
                    title="Projektör atım mesafesini duvar yüksekliğini tam dolduracak optik mesafeye eşitle"
                  >
                    Uzaklığı Duvara Eşitle ({activeSurface.requiredThrowDistM}m)
                  </button>
                </div>

                {/* 3'lü Uzaklık ve Lens Girişi */}
                <div className="grid grid-cols-3 gap-2">
                  <label>
                    Projektör Uzaklığı D (m)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={activeSurface.throwDistM}
                      onChange={e => updateSurface(activeSurface.id, { throwDistM: Math.max(0.5, +e.target.value) })}
                    />
                  </label>
                  <label>
                    Lens Throw Ratio (TR)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      step="0.05"
                      min="0.2"
                      value={activeSurface.throwRatio}
                      onChange={e => updateSurface(activeSurface.id, { throwRatio: Math.max(0.15, +e.target.value) })}
                    />
                  </label>
                  <label>
                    İzleyici Bakış Uzaklığı (m)
                    <input
                      className="inp font-bold text-emerald-300"
                      type="number"
                      step="0.2"
                      min="0.3"
                      value={activeSurface.viewDistM}
                      onChange={e => updateSurface(activeSurface.id, { viewDistM: Math.max(0.3, +e.target.value) })}
                    />
                  </label>
                </div>

                {/* 3'lü Projektör Montaj Yüksekliği, Sağa-Sola ve Yukarı-Aşağı Kaydırma (Shift) */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-900">
                  <label>
                    PJ Montaj Yüksekliği (m)
                    <input
                      className="inp font-bold text-sky-300"
                      type="number"
                      step="0.1"
                      min="0.3"
                      max="25"
                      value={activeSurface.projMountHeightM ?? round(Math.max(2.2, activeSurface.effectiveHeightM - 0.15), 2)}
                      onChange={e => updateSurface(activeSurface.id, { projMountHeightM: Math.max(0.3, +e.target.value) })}
                    />
                  </label>
                  <label>
                    PJ Sağa/Sola Kaydır (m)
                    <div className="flex items-center gap-1">
                      <input
                        className="inp font-bold text-amber-300"
                        type="number"
                        step="0.2"
                        value={activeSurface.projShiftXM ?? 0}
                        onChange={e => updateSurface(activeSurface.id, { projShiftXM: +e.target.value })}
                      />
                      {(activeSurface.projShiftXM ?? 0) !== 0 && (
                        <button
                          type="button"
                          onClick={() => updateSurface(activeSurface.id, { projShiftXM: 0 })}
                          className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                          title="Yatay kaydırmayı sıfırla (Merkezle)"
                        >
                          0
                        </button>
                      )}
                    </div>
                  </label>
                  <label>
                    Görüntü Dikey Offset (m)
                    <div className="flex items-center gap-1">
                      <input
                        className="inp font-bold text-amber-300"
                        type="number"
                        step="0.1"
                        value={activeSurface.projShiftYM ?? 0}
                        onChange={e => updateSurface(activeSurface.id, { projShiftYM: +e.target.value })}
                      />
                      {(activeSurface.projShiftYM ?? 0) !== 0 && (
                        <button
                          type="button"
                          onClick={() => updateSurface(activeSurface.id, { projShiftYM: 0 })}
                          className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300"
                          title="Dikey kaydırmayı sıfırla"
                        >
                          0
                        </button>
                      )}
                    </div>
                  </label>
                </div>

                {/* 3'lü Karşılaştırma: 1. Uzaklığa Göre Optik Piksel | 2. Duvar Piksel Boyutu | 3. İzleyici Mesafesine Göre İdeal Piksel */}
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="p-1.5 rounded bg-amber-950/30 border border-amber-800/70">
                    <span className="text-[9.5px] text-amber-300 block">
                      1. {activeSurface.throwDistM}m Uzaklıktan Optik
                    </span>
                    <b className="text-xs text-amber-400">{activeSurface.distMmPerPx} mm/px</b>
                    <span className="text-[9px] text-slate-400 block">
                      ({activeSurface.distPpi} PPI · Tek PJ: {activeSurface.singleProjWidthM}m)
                    </span>
                  </div>

                  <div className="p-1.5 rounded bg-sky-950/30 border border-sky-800/70">
                    <span className="text-[9.5px] text-sky-300 block">
                      2. Duvar İçerik Piksel
                    </span>
                    <b className="text-xs text-sky-300">{activeSurface.avgMmPerPx} mm/px</b>
                    <span className="text-[9px] text-slate-400 block">
                      ({activeSurface.pxPerMeterW} px/m · {activeSurface.ppi} PPI)
                    </span>
                  </div>

                  <div className={`p-1.5 rounded border ${
                    activeSurface.isQualityOkForViewer
                      ? 'bg-emerald-950/30 border-emerald-700/70'
                      : 'bg-rose-950/40 border-rose-700/80'
                  }`}>
                    <span className="text-[9.5px] text-emerald-300 block">
                      3. {activeSurface.viewDistM}m Bakış İçin İdeal
                    </span>
                    <b className={`text-xs ${activeSurface.isQualityOkForViewer ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ≤ {activeSurface.idealMuseumMmPerPx} mm/px
                    </b>
                    <span className="text-[9px] text-slate-400 block">
                      (Retina: {activeSurface.idealRetinaMmPerPx}mm · Min: {activeSurface.minViewingDistM}m)
                    </span>
                  </div>
                </div>

                {/* Uzaklık ve Yoğunluk Mühendislik Açıklaması */}
                <div className="text-[10px] text-slate-300 bg-slate-900/90 p-2 rounded border border-slate-800 font-mono space-y-1 leading-relaxed">
                  <div>
                    • <b>Projektör Uzaklık Hesabı:</b> {activeSurface.throwDistM}m uzaklık ÷ {activeSurface.throwRatio} lens ={' '}
                    tek projektör <b>{activeSurface.singleProjWidthM}m × {activeSurface.singleProjHeightM}m</b> görüntü açar →{' '}
                    ({(activeSurface.singleProjWidthM * 1000).toLocaleString()}mm ÷ {activeSurface.projW}px ={' '}
                    <b className="text-amber-300">{activeSurface.distMmPerPx} mm/px</b>).
                  </div>
                  <div>
                    • <b>{activeSurface.effectiveHeightM}m yüksekliği tam doldurmak için</b> projektör{' '}
                    <b className="text-sky-300">{activeSurface.requiredThrowDistM} m</b> uzağa konulmalı;{' '}
                    {activeSurface.throwDistM}m mesafeden {activeSurface.effectiveWidthM}m genişliği kapatmak için{' '}
                    <b className="text-amber-300">en az {activeSurface.recommendedColsForDist} projektör</b> gerekir.
                  </div>
                  <div className={activeSurface.isQualityOkForViewer ? 'text-emerald-400' : 'text-rose-400'}>
                    • <b>İzleyici Göz Analizi ({activeSurface.viewDistM}m):</b>{' '}
                    {activeSurface.isQualityOkForViewer
                      ? `✓ Mevcut ${activeSurface.avgMmPerPx} mm/px boyutu, ${activeSurface.viewDistM}m izleme mesafesi için net ve uygundur.`
                      : `⚠ Mevcut ${activeSurface.avgMmPerPx} mm/px boyutu, ${activeSurface.viewDistM}m mesafeden pikselli görünebilir (En az ${activeSurface.minViewingDistM}m uzaktan bakılmalı veya 4K / daha fazla projektör seçilmeli).`}
                  </div>
                </div>
              </div>

              {/* D) ORANLAR KARŞILAŞTIRMA KARTI */}
              <div className="p-2.5 rounded bg-slate-950 border border-amber-700/60 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                  <span className="font-bold text-amber-400 text-[11px] uppercase tracking-wider">
                    Oran Analizi (Açınım vs İçerik vs Projeksiyon)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {activeSurface.effectiveWidthM}m / {activeSurface.effectiveHeightM}m = {activeSurface.aspectPhysical}:1
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">1. Açınım Fiziksel Oranı</span>
                    <b className="text-sm text-amber-300 font-mono">{activeSurface.aspectPhysical} : 1</b>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {activeSurface.effectiveWidthM}m × {activeSurface.effectiveHeightM}m
                    </span>
                  </div>

                  <div className="p-1.5 rounded bg-emerald-950/30 border border-emerald-800/70">
                    <span className="text-[10px] text-emerald-300 block">2. İçerik (Oran) Pixel Map</span>
                    <b className="text-sm text-emerald-400 font-mono">{activeSurface.aspectW} × {activeSurface.aspectH}</b>
                    <span className="text-[10px] text-emerald-500 block font-mono">
                      Oran: {round(activeSurface.aspectW / activeSurface.aspectH, 2)} : 1
                    </span>
                  </div>

                  <div className="p-1.5 rounded bg-sky-950/30 border border-sky-800/70">
                    <span className="text-[10px] text-sky-300 block">3. Projeksiyon Kapasitesi</span>
                    <b className="text-sm text-sky-400 font-mono">{activeSurface.projNetW} × {activeSurface.projNetH}</b>
                    <span className="text-[10px] text-sky-500 block font-mono">
                      Oran: {activeSurface.aspectProjector} : 1
                    </span>
                  </div>
                </div>

                <div className="text-[10.5px] text-amber-300 bg-slate-900/90 p-2 rounded border border-slate-800 font-mono">
                  • <b>{activeSurface.cols} Projektör ({activeSurface.totalRawW}px ham{activeSurface.overlapCountX > 0 ? `, ${activeSurface.overlapCountX} overlap` : ', Manuel Pay'})</b> ile{' '}
                  <b>{activeSurface.netW}px</b> içeriği eşlemek için gereken overlap/pay:{' '}
                  <b>Toplam {activeSurface.impliedTotalOvW} px</b> ({activeSurface.overlapCountX > 0 ? 'Projektör arası ' : 'Manuel Pay '}
                  <b>~{activeSurface.impliedOvPxX} px / %{activeSurface.impliedOvPctX}</b>)
                </div>
              </div>

              {/* E) Projektör Çözünürlüğü, Sayısı ve Overlap */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300 text-[11px]">
                    Projektör Donanımı & Dizilimi
                  </span>
                  {calcMethod === 'aspect_ref' && (
                    <button
                      onClick={() =>
                        updateSurface(activeSurface.id, {
                          overlapMode: 'percent',
                          overlapX: Math.max(0, activeSurface.impliedOvPctX),
                        })
                      }
                      className="px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold"
                    >
                      Overlap'i Orana Eşitle (%{activeSurface.impliedOvPctX})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label>
                    Projektör Çözünürlüğü
                    <select
                      className="inp"
                      value={activeSurface.resIdx}
                      onChange={e => updateSurface(activeSurface.id, { resIdx: +e.target.value })}
                    >
                      {RESOLUTIONS.map((r, i) => (
                        <option key={i} value={i}>{r.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Yerleşim Yönü (Orientation)
                    <select
                      className="inp"
                      value={activeSurface.orient}
                      onChange={e => updateSurface(activeSurface.id, { orient: e.target.value as 'landscape' | 'portrait' })}
                    >
                      <option value="landscape">Yatay (Landscape)</option>
                      <option value="portrait">Dikey (Portrait 90°)</option>
                    </select>
                  </label>

                  <label>
                    Yatay / Çevresel Projektör (N)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      min="1"
                      max="36"
                      value={activeSurface.cols}
                      onChange={e => updateSurface(activeSurface.id, { cols: Math.max(1, Math.round(+e.target.value)) })}
                    />
                  </label>
                  <label>
                    Dikey Projektör Sırası (M)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      min="1"
                      max="12"
                      value={activeSurface.rows}
                      onChange={e => updateSurface(activeSurface.id, { rows: Math.max(1, Math.round(+e.target.value)) })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-900">
                  <label>
                    <div className="flex justify-between items-center">
                      <span>Yatay Overlap ({activeSurface.overlapMode === 'percent' ? '%' : 'px'})</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateSurface(activeSurface.id, {
                            overlapMode: activeSurface.overlapMode === 'percent' ? 'pixel' : 'percent',
                          })
                        }
                        className="text-[9.5px] text-sky-400 hover:underline"
                      >
                        {activeSurface.overlapMode === 'percent' ? 'px yap' : '% yap'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="inp font-bold"
                        type="number"
                        step="0.5"
                        min="0"
                        value={activeSurface.overlapX}
                        onChange={e => updateSurface(activeSurface.id, { overlapX: Math.max(0, +e.target.value) })}
                      />
                      <span className="text-[10px] font-mono text-sky-400 shrink-0">
                        = {activeSurface.ovPxX} px
                      </span>
                    </div>
                  </label>
                  <label>
                    Dikey Overlap ({activeSurface.overlapMode === 'percent' ? '%' : 'px'})
                    <div className="flex items-center gap-1.5">
                      <input
                        className="inp font-bold"
                        type="number"
                        step="0.5"
                        min="0"
                        value={activeSurface.overlapY}
                        onChange={e => updateSurface(activeSurface.id, { overlapY: Math.max(0, +e.target.value) })}
                      />
                      <span className="text-[10px] font-mono text-sky-400 shrink-0">
                        = {activeSurface.ovPxY} px
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SAĞ PANEL: BİRLEŞİK PIXEL MAP ÇİZİMİ VE KARŞILAŞTIRMALI ORAN/YOĞUNLUK TABLOSU */}
        <div className="space-y-3 min-w-0 flex flex-col overflow-auto">
          {/* ÇİZİM KONTROL ÇUBUĞU (2B PIXEL MAP vs 3B ODA SİMÜLASYONU GEÇİŞİ) */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 flex flex-wrap justify-between items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* 2B / 3B Görünüm Seçici */}
              <div className="flex rounded overflow-hidden border border-amber-600/80 bg-slate-950 p-0.5">
                <button
                  onClick={() => setViewMode('2d')}
                  className={`px-2.5 py-1 rounded font-bold transition ${
                    viewMode === '2d'
                      ? 'bg-sky-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📐 2B Pixel Map Açılım Şeması
                </button>
                <button
                  onClick={() => setViewMode('3d')}
                  className={`px-2.5 py-1 rounded font-bold transition ${
                    viewMode === '3d'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-amber-300 hover:text-white'
                  }`}
                >
                  🎥 3B Oda & Projeksiyon Simülasyonu
                </button>
              </div>

              {viewMode === '2d' && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-semibold ml-1">Yerleşim:</span>
                  <button
                    onClick={() => setLayoutMode('cross')}
                    className={`px-2 py-1 rounded font-semibold ${layoutMode === 'cross' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    Kutu Açılımı
                  </button>
                  <button
                    onClick={() => setLayoutMode('strip')}
                    className={`px-2 py-1 rounded font-semibold ${layoutMode === 'strip' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    Yan Yana Şerit
                  </button>
                  <button
                    onClick={() => setLayoutMode('stacked')}
                    className={`px-2 py-1 rounded font-semibold ${layoutMode === 'stacked' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    Alt Alta
                  </button>
                  <button
                    onClick={() => setLayoutMode('custom')}
                    className={`px-2 py-1 rounded font-semibold ${layoutMode === 'custom' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
                  >
                    Özel (X,Y)
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {viewMode === '2d' && (
                <div className="flex flex-wrap items-center gap-2 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[10.5px]">
                  <span className="font-bold text-amber-300">✍️ Yazılar:</span>
                  <label className="flex items-center gap-1 cursor-pointer text-slate-200" title="Yüzey Adı">
                    <input type="checkbox" checked={show2dName} onChange={e => setShow2dName(e.target.checked)} />
                    <span>Yüzey</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-emerald-400" title="Net Piksel Çözünürlüğü">
                    <input type="checkbox" checked={show2dResolution} onChange={e => setShow2dResolution(e.target.checked)} />
                    <span>Piksel</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-sky-400" title="Piksel Yoğunluğu (mm/px)">
                    <input type="checkbox" checked={show2dDensity} onChange={e => setShow2dDensity(e.target.checked)} />
                    <span>mm/px</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-indigo-300" title="Açınım Boyutları ve Oran">
                    <input type="checkbox" checked={show2dDimensions} onChange={e => setShow2dDimensions(e.target.checked)} />
                    <span>Ölçüler</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-amber-300" title="Projektör Sınırları ve Overlap">
                    <input type="checkbox" checked={showSlices} onChange={e => setShowSlices(e.target.checked)} />
                    <span>Projektörler</span>
                  </label>
                  <span className="text-[10px] text-sky-400 font-medium px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-850" title="Yazıların üzerine tıklayıp basılı tutarak dilediğiniz konuma kaydırabilirsiniz">
                    ✋ Yazıları Sürükle
                  </span>
                  {surfaces.some(s => (s.textOffsetX && s.textOffsetX !== 0) || (s.textOffsetY && s.textOffsetY !== 0)) && (
                    <button
                      onClick={resetAllTextOffsets}
                      className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-semibold"
                      title="Kaydırılan tüm yazıları varsayılan merkez konumuna döndürür"
                    >
                      ⟲ Sıfırla
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={downloadPixelMapPng}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded shadow"
              >
                1:1 PNG Şablon İndir
              </button>
              <button
                onClick={capture2DViewToReport}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow flex items-center gap-1 transition"
                title="Mevcut 2B Açınım Çizimini Müşteri Raporu Görsel Galerisine Ekler"
              >
                <span>{report2dToast ? '✓ Rapora Eklendi!' : '📋 2B Açınımı Rapora Ekle'}</span>
              </button>
              <button
                onClick={copySpecsToClipboard}
                className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white font-semibold rounded"
              >
                Raporu Kopyala
              </button>
            </div>
          </div>

          {/* CANLI İNTERAKTİF 2B PIXEL MAP ÇİZİMİ VEYA 3B ODA PROJEKSİYON SİMÜLASYONU */}
          <div
            className={`border border-slate-700 rounded bg-slate-950 p-3 flex flex-col ${
              isExpandedView
                ? 'fixed inset-3 z-50 shadow-2xl border-sky-500'
                : 'flex-1 min-h-[560px] relative'
            }`}
          >
            <div className="w-full flex flex-wrap justify-between items-center gap-2 text-[11px] text-slate-300 mb-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sky-400">
                  {viewMode === '2d'
                    ? 'Canlı Pixel Map, Açınım & Piksel Yoğunluğu Şeması'
                    : 'Canlı 3B Oda, Projektör Yerleşimi & Optik Atım (Frustum) Simülasyonu'}
                </span>
                <span className="font-mono text-slate-400">
                  ({calculation.totalCanvasW} × {calculation.totalCanvasH} px · {calculation.megapixels} MP · {calculation.totalProjectors} Projektör)
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-700">
                {viewMode === '2d' && (
                  <>
                    <span className="text-slate-400 text-[10px]">Yakınlaştır (Zoom):</span>
                    <button
                      onClick={() => setZoomPct(z => Math.max(40, z - 20))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min="40"
                      max="300"
                      step="10"
                      value={zoomPct}
                      onChange={e => setZoomPct(+e.target.value)}
                      className="w-24 accent-sky-500 cursor-pointer"
                    />
                    <button
                      onClick={() => setZoomPct(z => Math.min(300, z + 20))}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold"
                    >
                      +
                    </button>
                    <span className="font-mono text-sky-300 font-bold w-11 text-center">%{zoomPct}</span>
                    <button
                      onClick={() => setZoomPct(100)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                    >
                      Sığdır (%100)
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsExpandedView(v => !v)}
                  className={`px-2.5 py-0.5 rounded font-bold text-[10px] ${
                    isExpandedView
                      ? 'bg-rose-700 hover:bg-rose-600 text-white'
                      : 'bg-sky-700 hover:bg-sky-600 text-white'
                  }`}
                >
                  {isExpandedView ? '✕ Tam Ekrandan Çık' : '⛶ Tam Ekran Yap'}
                </button>
              </div>
            </div>

            {viewMode === '3d' ? (
              <div className="w-full flex-1 flex flex-col" style={{ minHeight: isExpandedView ? 'calc(100vh - 95px)' : '500px' }}>
                <Suspense fallback={<div className="p-8 text-center text-slate-400">3B Oda ve Projeksiyon Simülasyonu Yükleniyor...</div>}>
                  <PlannerRoom3D
                    surfaces={calculation.surfaces}
                    selectedId={selectedId}
                    onSelect={id => setSelectedId(id)}
                    physicalRoom={physicalRoom}
                    onUpdatePhysicalRoom={patch => setPhysicalRoom(prev => ({ ...prev, ...patch }))}
                  />
                </Suspense>
              </div>
            ) : (
              /* ÖNEMLİ DÜZELTME: Zoom yapıldığında üst ve sol kısımların kesilmemesi için items-center justify-center yerine m-auto kullanıldı */
              <div
                className="w-full flex-1 flex overflow-auto p-3 bg-slate-950/90 rounded border border-slate-900"
                style={{ maxHeight: isExpandedView ? 'calc(100vh - 95px)' : '620px' }}
                onWheel={e => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    setZoomPct(z => Math.min(300, Math.max(40, z + (e.deltaY < 0 ? 15 : -15))));
                  }
                }}
              >
                {(() => {
                  const padLeft = 110;
                  const padTop = 90;
                  const padRight = 110;
                  const padBottom = 90;
                  const vbW = calculation.totalCanvasW + padLeft + padRight;
                  const vbH = calculation.totalCanvasH + padTop + padBottom;
                  const baseFont = Math.max(32, Math.round(Math.max(calculation.totalCanvasW, calculation.totalCanvasH) / 44));
                  const aspect = vbW / Math.max(1, vbH);
                  const baseHeightPx = isExpandedView ? 760 : 500;
                  const baseWidthPx = Math.min(isExpandedView ? 1500 : 940, Math.round(baseHeightPx * aspect));
                  const scaledWidthPx = Math.round((baseWidthPx * zoomPct) / 100);
                  const scaledHeightPx = Math.round((scaledWidthPx / aspect));

                  return (
                    <div className="m-auto shrink-0" style={{ width: `${scaledWidthPx}px`, height: `${scaledHeightPx}px` }}>
                      <svg
                        ref={svg2dRef}
                        viewBox={`0 0 ${vbW} ${vbH}`}
                        width={scaledWidthPx}
                        height={scaledHeightPx}
                        className="select-none drop-shadow block"
                        onPointerMove={handlePointerMoveText}
                        onPointerUp={handlePointerUpText}
                      >
                    <defs>
                      {calculation.surfaces.map(s => (
                        <clipPath key={`clip-${s.id}`} id={`clip-${s.id}`}>
                          <rect
                            x={padLeft + s.posX + 6}
                            y={padTop + s.posY + 6}
                            width={Math.max(10, s.drawW - 12)}
                            height={Math.max(10, s.drawH - 12)}
                          />
                        </clipPath>
                      ))}
                    </defs>

                    <rect
                      x={padLeft}
                      y={padTop}
                      width={calculation.totalCanvasW}
                      height={calculation.totalCanvasH}
                      fill="#0b1120"
                      stroke="#334155"
                      strokeWidth={Math.max(4, baseFont * 0.1)}
                      strokeDasharray={`${baseFont * 0.4} ${baseFont * 0.25}`}
                    />

                    {calculation.surfaces.map(s => {
                      const sx = padLeft + s.posX;
                      const sy = padTop + s.posY;
                      const isSel = s.id === activeSurface?.id;

                      const isVerticalBox = s.drawH > s.drawW * 1.45;
                      const longSide = Math.max(s.drawW, s.drawH);
                      const shortSide = Math.min(s.drawW, s.drawH);

                      const surfFont = Math.max(
                        16,
                        Math.min(baseFont * 1.0, shortSide / 7.8, longSide / 19)
                      );

                      const cx = sx + s.drawW / 2;
                      const cy = sy + s.drawH / 2;
                      const circleR = Math.min(s.drawW, s.drawH) / 2;

                      return (
                        <g
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          className="cursor-pointer transition-opacity hover:opacity-95"
                        >
                          <rect
                            x={sx}
                            y={sy}
                            width={s.drawW}
                            height={s.drawH}
                            fill={s.color + (isSel ? '35' : '18')}
                            stroke={isSel ? '#facc15' : s.color}
                            strokeWidth={isSel ? Math.max(8, baseFont * 0.22) : Math.max(4, baseFont * 0.12)}
                          />

                          <g clipPath={`url(#clip-${s.id})`}>
                            {s.isCircularMask && (
                              <g>
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={circleR * 0.98}
                                  fill={s.color + '25'}
                                  stroke="#facc15"
                                  strokeWidth={Math.max(5, baseFont * 0.14)}
                                />
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={circleR * 0.65}
                                  fill="none"
                                  stroke="rgba(255,255,255,0.25)"
                                  strokeWidth={Math.max(3, baseFont * 0.08)}
                                  strokeDasharray={`${baseFont * 0.3} ${baseFont * 0.2}`}
                                />
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={circleR * 0.33}
                                  fill="none"
                                  stroke="rgba(255,255,255,0.25)"
                                  strokeWidth={Math.max(3, baseFont * 0.08)}
                                  strokeDasharray={`${baseFont * 0.3} ${baseFont * 0.2}`}
                                />
                                <line x1={cx - circleR} y1={cy} x2={cx + circleR} y2={cy} stroke="rgba(255,255,255,0.2)" strokeWidth={Math.max(2, baseFont * 0.06)} />
                                <line x1={cx} y1={cy - circleR} x2={cx} y2={cy + circleR} stroke="rgba(255,255,255,0.2)" strokeWidth={Math.max(2, baseFont * 0.06)} />
                              </g>
                            )}

                            {(s.geometry === 'cylinder_360' || s.geometry === 'sphere' || s.geometry === 'concave_arc') && !s.rotate90 && (
                              <g>
                                {[0, 0.25, 0.5, 0.75, 1].map((ratio, rIdx) => {
                                  const lx = sx + s.drawW * ratio;
                                  const degLabel = Math.round(
                                    (s.geometry === 'concave_arc' ? s.angleDeg : 360) * ratio
                                  );
                                  return (
                                    <g key={rIdx}>
                                      <line
                                        x1={lx}
                                        y1={sy}
                                        x2={lx}
                                        y2={sy + s.drawH}
                                        stroke="rgba(56, 189, 248, 0.3)"
                                        strokeWidth={Math.max(2, baseFont * 0.06)}
                                        strokeDasharray={`${baseFont * 0.25} ${baseFont * 0.2}`}
                                      />
                                      <text
                                        x={lx + (ratio === 1 ? -surfFont * 0.5 : ratio === 0 ? surfFont * 0.5 : 0)}
                                        y={sy + surfFont * 0.9}
                                        fill="#38bdf8"
                                        fontSize={surfFont * 0.5}
                                        fontFamily="monospace"
                                        fontWeight="bold"
                                        textAnchor={ratio === 1 ? 'end' : ratio === 0 ? 'start' : 'middle'}
                                      >
                                        {degLabel}° ({round(s.effectiveWidthM * ratio, 1)}m)
                                      </text>
                                    </g>
                                  );
                                })}

                                {s.geometry === 'sphere' && [0.25, 0.5, 0.75].map((yRatio, yIdx) => {
                                  const ly = sy + s.drawH * yRatio;
                                  const latLabel = yRatio === 0.5 ? '0° Ekvator' : yRatio === 0.25 ? '+45° K' : '-45° G';
                                  return (
                                    <g key={yIdx}>
                                      <line
                                        x1={sx}
                                        y1={ly}
                                        x2={sx + s.drawW}
                                        y2={ly}
                                        stroke={yRatio === 0.5 ? 'rgba(244, 63, 94, 0.5)' : 'rgba(255, 255, 255, 0.18)'}
                                        strokeWidth={yRatio === 0.5 ? Math.max(4, baseFont * 0.1) : Math.max(2, baseFont * 0.05)}
                                        strokeDasharray={yRatio === 0.5 ? undefined : `${baseFont * 0.25} ${baseFont * 0.2}`}
                                      />
                                      <text
                                        x={sx + surfFont * 0.5}
                                        y={ly - surfFont * 0.25}
                                        fill="#fda4af"
                                        fontSize={surfFont * 0.48}
                                        fontFamily="monospace"
                                      >
                                        {latLabel}
                                      </text>
                                    </g>
                                  );
                                })}
                              </g>
                            )}

                            {/* Projektör Overlap (Örtüşme) Çizgileri ve Şeritleri: Duvara Göre Tam Simetrik Ortalanmış! */}
                            {showSlices && s.totalProjectors > 1 && (
                              <g>
                                {/* 1. Yatay Overlap Bölgeleri (İki Kesikli Sarı Sınır Çizgisi + Sarı Şerit Dolgusu + Piksel/% Etiketi) */}
                                {s.overlapZonesX.map(oz => {
                                  const ox = s.rotate90 ? sx : sx + oz.startX;
                                  const oy = s.rotate90 ? sy + oz.startX : sy;
                                  const ow = s.rotate90 ? s.drawW : Math.max(2, oz.width);
                                  const oh = s.rotate90 ? Math.max(2, oz.width) : s.drawH;
                                  const labelX = ox + ow / 2;
                                  const labelY = s.rotate90 ? oy + oh / 2 : sy + surfFont * 0.65;

                                  return (
                                    <g key={`ovx-${oz.index}`}>
                                      {oz.width > 0 && (
                                        <rect
                                          x={ox}
                                          y={oy}
                                          width={ow}
                                          height={oh}
                                          fill="rgba(250, 204, 21, 0.16)"
                                        />
                                      )}
                                      {/* Sol / Üst Kesikli Overlap Sınırı */}
                                      <line
                                        x1={ox}
                                        y1={oy}
                                        x2={s.rotate90 ? ox + ow : ox}
                                        y2={s.rotate90 ? oy : oy + oh}
                                        stroke="rgba(250, 204, 21, 0.75)"
                                        strokeWidth={Math.max(3, baseFont * 0.08)}
                                        strokeDasharray={`${baseFont * 0.32} ${baseFont * 0.2}`}
                                      />
                                      {/* Sağ / Alt Kesikli Overlap Sınırı */}
                                      {oz.width > 0 && (
                                        <line
                                          x1={s.rotate90 ? ox : ox + ow}
                                          y1={s.rotate90 ? oy + oh : oy}
                                          x2={ox + ow}
                                          y2={oy + oh}
                                          stroke="rgba(250, 204, 21, 0.75)"
                                          strokeWidth={Math.max(3, baseFont * 0.08)}
                                          strokeDasharray={`${baseFont * 0.32} ${baseFont * 0.2}`}
                                        />
                                      )}
                                      <text
                                        x={labelX}
                                        y={labelY}
                                        fill="#fde047"
                                        fontSize={Math.max(12, surfFont * 0.42)}
                                        fontFamily="monospace"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        transform={s.rotate90 ? `rotate(-90 ${labelX} ${labelY})` : undefined}
                                      >
                                        {`Ov: ${oz.width}px (%${oz.pct})`}
                                      </text>
                                    </g>
                                  );
                                })}

                                {/* 2. Dikey Overlap Bölgeleri */}
                                {s.overlapZonesY.map(oz => {
                                  const ox = s.rotate90 ? sx + oz.startY : sx;
                                  const oy = s.rotate90 ? sy : sy + oz.startY;
                                  const ow = s.rotate90 ? Math.max(2, oz.height) : s.drawW;
                                  const oh = s.rotate90 ? s.drawH : Math.max(2, oz.height);
                                  return (
                                    <g key={`ovy-${oz.index}`}>
                                      {oz.height > 0 && (
                                        <rect
                                          x={ox}
                                          y={oy}
                                          width={ow}
                                          height={oh}
                                          fill="rgba(250, 204, 21, 0.16)"
                                        />
                                      )}
                                      <line
                                        x1={ox}
                                        y1={oy}
                                        x2={s.rotate90 ? ox : ox + ow}
                                        y2={s.rotate90 ? oy + oh : oy}
                                        stroke="rgba(250, 204, 21, 0.75)"
                                        strokeWidth={Math.max(3, baseFont * 0.08)}
                                        strokeDasharray={`${baseFont * 0.32} ${baseFont * 0.2}`}
                                      />
                                      {oz.height > 0 && (
                                        <line
                                          x1={s.rotate90 ? ox + ow : ox}
                                          y1={s.rotate90 ? oy : oy + oh}
                                          x2={ox + ow}
                                          y2={oy + oh}
                                          stroke="rgba(250, 204, 21, 0.75)"
                                          strokeWidth={Math.max(3, baseFont * 0.08)}
                                          strokeDasharray={`${baseFont * 0.32} ${baseFont * 0.2}`}
                                        />
                                      )}
                                    </g>
                                  );
                                })}
                              </g>
                            )}

                            {/* Merkez Bilgi Yazıları - Her Seçilen Metin Mouse ile Bağımsız Sürüklenebilir & Kaydırılabilir */}
                            <g transform={isVerticalBox ? `rotate(-90 ${cx} ${cy})` : undefined}>
                              {show2dName && (() => {
                                const off = s.textOffsets?.name || { x: s.textOffsetX || 0, y: s.textOffsetY || 0 };
                                return (
                                  <g
                                    transform={`translate(${off.x}, ${off.y})`}
                                    className="cursor-move group"
                                    onPointerDown={e => handleStartDragText(s.id, 'name', e, scaledWidthPx, vbW)}
                                  >
                                    <rect
                                      x={cx - Math.max(120, surfFont * 9)}
                                      y={cy - surfFont * 1.65}
                                      width={Math.max(240, surfFont * 18)}
                                      height={surfFont * 1.25}
                                      fill="transparent"
                                      className="group-hover:fill-sky-500/20 group-hover:stroke-sky-400/80 group-hover:stroke-1 rounded"
                                    />
                                    <text
                                      x={cx}
                                      y={cy - surfFont * 0.8}
                                      fill="#f8fafc"
                                      fontSize={surfFont * 0.95}
                                      fontWeight="bold"
                                      textAnchor="middle"
                                      className="pointer-events-none select-none"
                                    >
                                      {s.name}
                                    </text>
                                  </g>
                                );
                              })()}

                              {show2dResolution && (() => {
                                const off = s.textOffsets?.resolution || { x: s.textOffsetX || 0, y: s.textOffsetY || 0 };
                                return (
                                  <g
                                    transform={`translate(${off.x}, ${off.y})`}
                                    className="cursor-move group"
                                    onPointerDown={e => handleStartDragText(s.id, 'resolution', e, scaledWidthPx, vbW)}
                                  >
                                    <rect
                                      x={cx - Math.max(140, surfFont * 9.5)}
                                      y={cy - surfFont * 0.55}
                                      width={Math.max(280, surfFont * 19)}
                                      height={surfFont * 1.25}
                                      fill="transparent"
                                      className="group-hover:fill-emerald-500/20 group-hover:stroke-emerald-400/80 group-hover:stroke-1 rounded"
                                    />
                                    <text
                                      x={cx}
                                      y={cy + surfFont * 0.35}
                                      fill="#4ade80"
                                      fontSize={surfFont * 1.05}
                                      fontWeight="bold"
                                      fontFamily="monospace"
                                      textAnchor="middle"
                                      className="pointer-events-none select-none"
                                    >
                                      {s.netW} × {s.netH} pixel
                                    </text>
                                  </g>
                                );
                              })()}

                              {show2dDensity && (() => {
                                const off = s.textOffsets?.density || { x: s.textOffsetX || 0, y: s.textOffsetY || 0 };
                                return (
                                  <g
                                    transform={`translate(${off.x}, ${off.y})`}
                                    className="cursor-move group"
                                    onPointerDown={e => handleStartDragText(s.id, 'density', e, scaledWidthPx, vbW)}
                                  >
                                    <rect
                                      x={cx - Math.max(200, surfFont * 14)}
                                      y={cy + surfFont * 0.55}
                                      width={Math.max(400, surfFont * 28)}
                                      height={surfFont * 1.15}
                                      fill="transparent"
                                      className="group-hover:fill-sky-500/20 group-hover:stroke-sky-400/80 group-hover:stroke-1 rounded"
                                    />
                                    <text
                                      x={cx}
                                      y={cy + surfFont * 1.3}
                                      fill="#38bdf8"
                                      fontSize={surfFont * 0.72}
                                      fontWeight="bold"
                                      fontFamily="monospace"
                                      textAnchor="middle"
                                      className="pointer-events-none select-none"
                                    >
                                      Piksel: {s.avgMmPerPx} mm/px (İdeal ≤{s.idealMuseumMmPerPx}mm) · Optik @{s.throwDistM}m: {s.distMmPerPx} mm/px
                                    </text>
                                  </g>
                                );
                              })()}

                              {show2dDimensions && (() => {
                                const off = s.textOffsets?.dimensions || { x: s.textOffsetX || 0, y: s.textOffsetY || 0 };
                                return (
                                  <g
                                    transform={`translate(${off.x}, ${off.y})`}
                                    className="cursor-move group"
                                    onPointerDown={e => handleStartDragText(s.id, 'dimensions', e, scaledWidthPx, vbW)}
                                  >
                                    <rect
                                      x={cx - Math.max(180, surfFont * 12)}
                                      y={cy + surfFont * 1.55}
                                      width={Math.max(360, surfFont * 24)}
                                      height={surfFont * 1.15}
                                      fill="transparent"
                                      className="group-hover:fill-amber-500/20 group-hover:stroke-amber-400/80 group-hover:stroke-1 rounded"
                                    />
                                    <text
                                      x={cx}
                                      y={cy + surfFont * 2.3}
                                      fill="#cbd5e1"
                                      fontSize={surfFont * 0.68}
                                      fontFamily="monospace"
                                      textAnchor="middle"
                                      className="pointer-events-none select-none"
                                    >
                                      Açınım: {s.effectiveWidthM}m × {s.effectiveHeightM}m (Oran {s.aspectPhysical}:1 · {s.cols}×{s.rows} PJ)
                                    </text>
                                  </g>
                                );
                              })()}
                            </g>
                          </g>
                        </g>
                      );
                    })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ALT TABLO: YÜZEY GEOMETRİSİ, UZAKLIK, PİKSEL YOĞUNLUĞU VE PIXEL MAP TABLOSU */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 overflow-auto">
            <div className="font-bold text-slate-200 mb-1.5 flex justify-between items-center">
              <span>Yüzey Geometrileri, Projektör Uzaklığı, Piksel Yoğunluğu ve İçerik Çözünürlüğü Tablosu</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Projektör atım mesafesi (D), Lens (TR) ve İzleyici uzaklığına göre optik piksel boyutu (mm/px)
              </span>
            </div>
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1.5 pr-2">Yüzey Adı</th>
                  <th className="py-1.5 pr-2">Açınım</th>
                  <th className="py-1.5 pr-2 text-emerald-400">İçerik Pixel Map</th>
                  <th className="py-1.5 pr-2 text-amber-300">PJ Uzaklık & Lens</th>
                  <th className="py-1.5 pr-2 text-amber-400">Optik Piksel (@Uzaklık)</th>
                  <th className="py-1.5 pr-2 text-sky-400">Duvar Piksel Boyutu</th>
                  <th className="py-1.5">İzleyici Mesafesi & İdeal</th>
                </tr>
              </thead>
              <tbody>
                {calculation.surfaces.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`border-b border-slate-800/60 cursor-pointer ${
                      s.id === activeSurface?.id ? 'bg-sky-950/40' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-semibold text-slate-200 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-slate-300">
                      {s.effectiveWidthM}×{s.effectiveHeightM}m ({s.aspectPhysical}:1)
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-emerald-400">
                      {s.netW} × {s.netH} px
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-amber-300">
                      {s.throwDistM}m / TR {s.throwRatio}:1
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-amber-400">
                      {s.distMmPerPx} mm/px ({s.distPpi} PPI)
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-sky-300">
                      {s.avgMmPerPx} mm/px ({s.pxPerMeterW} px/m)
                    </td>
                    <td className="py-1.5 font-mono">
                      <span className={s.isQualityOkForViewer ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        @{s.viewDistM}m → İdeal ≤{s.idealMuseumMmPerPx}mm {s.isQualityOkForViewer ? '✓' : '⚠'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
