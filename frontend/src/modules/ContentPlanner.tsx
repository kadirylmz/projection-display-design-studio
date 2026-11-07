import { useState, useMemo } from 'react';
import { pctToPx } from '../engine/multiproj';
import { LengthUnit, round } from '../engine/units';
import { download } from '../util';

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
  widthM: number;       // Düz duvar genişliği (m) — Kavis/Silindir/Küre modlarında otomatik yay uzunluğu
  heightM: number;      // Yükseklik (m)
  radiusM: number;      // Kavis yarıçapı (R) veya Silindir/Kubbe/Küre yarıçapı (m)
  angleDeg: number;     // Kavis merkez açısı (derece, örn: 120°, 180°, 360°)
  resIdx: number;       // Seçili çözünürlük indeksi
  customW: number;      // Özel projektör genişliği (px)
  customH: number;      // Özel projektör yüksekliği (px)
  orient: 'landscape' | 'portrait';
  cols: number;         // Yatay/Çevresel projektör sayısı (N_x)
  rows: number;         // Dikey/Meridyen projektör sırası (N_y)
  overlapMode: 'percent' | 'pixel';
  overlapX: number;     // Yatay overlap (% veya px)
  overlapY: number;     // Dikey overlap (% veya px)
  color: string;        // Şemadaki yüzey rengi
  canvasX: number;      // Özel yerleşim modunda X koordinatı (px)
  canvasY: number;      // Özel yerleşim modunda Y koordinatı (px)
  rotate90: boolean;    // Şemada yüzeyi 90 derece döndür
}

export interface CalculatedSurface extends SurfaceItem {
  effectiveWidthM: number;   // Hesaplanan gerçek açınım genişliği (Yay/Çevre/Meridyen m)
  effectiveHeightM: number;  // Hesaplanan gerçek açınım yüksekliği (m)
  chordWidthM: number;       // Kavisli duvarda iki uç arası düz mesafe (Kiriş / Chord m)
  sagittaM: number;          // Kavis derinliği (Ok yüksekliği / Sagitta m)
  isClosedLoopX: boolean;    // 360° tam turda son projektör ilk projektörle birleşir (N overlap)
  isCircularMask: boolean;   // Kubbe (Domemaster) veya Dairesel Zemin için dairesel maske

  projW: number;
  projH: number;
  aspectPhysical: number;    // Açınım Fiziksel Oranı (effectiveWidthM / effectiveHeightM)
  aspectProjector: number;   // Toplam Projeksiyon Oranı (projNetW / projNetH)
  aspectContent: number;     // Aktif İçerik Oranı (netW / netH)

  // 1) Orana Göre İçerik Çözünürlüğü (Aspect Ratio Bazlı)
  aspectW: number;
  aspectH: number;

  // 2) Projeksiyon & Overlap Bazlı Donanım Çözünürlüğü
  ovPxX: number;
  ovPxY: number;
  overlapCountX: number;     // Düz/Kavis = cols - 1, 360° Silindir = cols
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
  mmPerPxW: number;
  mmPerPxH: number;
  avgMmPerPx: number;
  ppi: number;
  totalProjectors: number;
  geometryFormulaText: string;
  projSlices: { index: number; col: number; row: number; startX: number; endX: number; startY: number; endY: number }[];
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
    overlapX: 12.2,
    overlapY: 10,
    color: SURFACE_COLORS[0],
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
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
    overlapX: 12.2,
    overlapY: 10,
    color: SURFACE_COLORS[2],
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
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
    overlapX: 12.2,
    overlapY: 18.6,
    color: SURFACE_COLORS[3],
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
  },
];

export default function ContentPlanner({ unit: _unit }: { unit: LengthUnit }) {
  const [surfaces, setSurfaces] = useState<SurfaceItem[]>(INITIAL_SURFACES);
  const [selectedId, setSelectedId] = useState<string>('surf-1');
  const [calcMethod, setCalcMethod] = useState<CalcMethod>('aspect_ref');
  const [refHeightM, setRefHeightM] = useState<number>(4.30);
  const [refHeightPx, setRefHeightPx] = useState<number>(1200);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('cross');
  const [showSlices, setShowSlices] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // ==========================================
  // HAZIR ODA & ÖZEL GEOMETRİ ŞABLONLARI
  // ==========================================
  const applyPreset = (preset: 'box-5' | 'u-floor' | 'concave' | 'cylinder-360' | 'dome-planetarium' | 'sphere-360') => {
    if (preset === 'u-floor') {
      setRefHeightM(4.30);
      setRefHeightPx(1200);
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
          overlapMode: 'percent', overlapX: 15, overlapY: 10, color: SURFACE_COLORS[4], canvasX: 0, canvasY: 0, rotate90: false,
        },
        INITIAL_SURFACES[3],
      ];
      setRefHeightM(4.30);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('cross');
    } else if (preset === 'concave') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'İçbükey Kavisli Sahne (135°)', type: 'wall', geometry: 'concave_arc',
          widthM: 18.85, heightM: 4.00, radiusM: 8.0, angleDeg: 135,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 4, rows: 1,
          overlapMode: 'percent', overlapX: 15, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(4.00);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'cylinder-360') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: '360° Silindir Duvar (Çap 10m)', type: 'wall', geometry: 'cylinder_360',
          widthM: 31.42, heightM: 4.00, radiusM: 5.0, angleDeg: 360,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 6, rows: 1,
          overlapMode: 'percent', overlapX: 18, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
        {
          id: 'surf-2', name: 'Yuvarlak Zemin (Çap 10m)', type: 'floor', geometry: 'circle_floor',
          widthM: 10.0, heightM: 10.0, radiusM: 5.0, angleDeg: 360,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 3,
          overlapMode: 'percent', overlapX: 15, overlapY: 15, color: SURFACE_COLORS[3], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(4.00);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'dome-planetarium') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'Kubbe / Planetarium (Çap 12m)', type: 'ceiling', geometry: 'dome',
          widthM: 18.85, heightM: 18.85, radiusM: 6.0, angleDeg: 180,
          resIdx: 2, customW: 3840, customH: 2160, orient: 'landscape', cols: 3, rows: 2,
          overlapMode: 'percent', overlapX: 20, overlapY: 20, color: SURFACE_COLORS[5], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(18.85);
      setRefHeightPx(4096);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'sphere-360') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: 'Tam Küre 360°×180° (Çap 8m)', type: 'wall', geometry: 'sphere',
          widthM: 25.13, heightM: 12.57, radiusM: 4.0, angleDeg: 360,
          resIdx: 2, customW: 3840, customH: 2160, orient: 'landscape', cols: 4, rows: 2,
          overlapMode: 'percent', overlapX: 15, overlapY: 15, color: SURFACE_COLORS[4], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(12.57);
      setRefHeightPx(4096);
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
      heightM: refHeightM,
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
      color: SURFACE_COLORS[surfaces.length % SURFACE_COLORS.length],
      canvasX: 0,
      canvasY: 0,
      rotate90: false,
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
  // DİNAMİK GEOMETRİK AÇINIM (UNWRAP) VE PIXEL MAP MOTORU
  // ==========================================
  const calculation = useMemo(() => {
    const pxPerMeterRef = refHeightPx / Math.max(0.1, refHeightM);

    const rawCalculated: CalculatedSurface[] = surfaces.map(s => {
      // 1. GEOMETRİ TİPİNE GÖRE FİZİKSEL AÇINIM (UNWRAP) GENİŞLİK VE YÜKSEKLİĞİ
      let effectiveWidthM = s.widthM;
      let effectiveHeightM = s.heightM;
      let chordWidthM = s.widthM;
      let sagittaM = 0;
      let isClosedLoopX = false;
      let isCircularMask = false;
      let geometryFormulaText = `Düz Yüzey: ${s.widthM}m × ${s.heightM}m`;

      const R = Math.max(0.5, s.radiusM);
      const D = R * 2;
      const rad = (s.angleDeg * Math.PI) / 180;

      if (s.geometry === 'concave_arc') {
        // Yay Uzunluğu: L = 2 * pi * R * (Açı / 360)
        effectiveWidthM = round(2 * Math.PI * R * (s.angleDeg / 360), 2);
        effectiveHeightM = s.heightM;
        // Kiriş (iki uç arası düz mesafe): Chord = 2 * R * sin(Açı / 2)
        chordWidthM = round(2 * R * Math.sin(rad / 2), 2);
        // Kavis derinliği (Sagitta): s = R * (1 - cos(Açı / 2))
        sagittaM = round(R * (1 - Math.cos(rad / 2)), 2);
        geometryFormulaText = `Yay Açınımı: L = 2·π·${R}m·(${s.angleDeg}°/360°) = ${effectiveWidthM}m (Kiriş: ${chordWidthM}m, Derinlik: ${sagittaM}m)`;
      } else if (s.geometry === 'cylinder_360') {
        // 360° Tam Silindir: Çevre = 2 * pi * R = pi * D
        effectiveWidthM = round(2 * Math.PI * R, 2);
        effectiveHeightM = s.heightM;
        chordWidthM = round(D, 2);
        sagittaM = R;
        isClosedLoopX = true; // 360 derecede son projektör ile ilk projektör de overlap yapar (N overlap)
        geometryFormulaText = `360° Silindir Çevresi: L = π·D = 3.1416 × ${D}m = ${effectiveWidthM}m (360° Sonsuz Döngü: ${s.cols} Overlap)`;
      } else if (s.geometry === 'dome') {
        // Kubbe / Yarım Küre (Fulldome Fisheye Domemaster 1:1 Kare):
        // Kubbe üzerinden geçen yay (ufuktan zenite ve karşı ufka) = pi * R
        const domeArc = round(Math.PI * R, 2);
        effectiveWidthM = domeArc;
        effectiveHeightM = domeArc;
        chordWidthM = round(D, 2);
        sagittaM = R;
        isCircularMask = true;
        geometryFormulaText = `Kubbe (Domemaster 1:1 Polar Fisheye): Çap=${D}m, Kubbe Yay Uzunluğu = π·R = ${domeArc}m × ${domeArc}m (1:1 Kare İçinde Dairesel Maske)`;
      } else if (s.geometry === 'sphere') {
        // Tam Küre (Equirectangular 2:1 Açınım): Ekvator Çevresi = 2*pi*R, Kutup Yay Boyu = pi*R
        effectiveWidthM = round(2 * Math.PI * R, 2);
        effectiveHeightM = round(Math.PI * R, 2);
        chordWidthM = round(D, 2);
        sagittaM = R;
        isClosedLoopX = true;
        geometryFormulaText = `Tam Küre (Equirectangular 2:1 Harita): Ekvator = 2·π·R = ${effectiveWidthM}m, Meridyen = π·R = ${effectiveHeightM}m (Oran 2:1)`;
      } else if (s.geometry === 'circle_floor') {
        // Tam Yuvarlak Dairesel Zemin: Çap x Çap (1:1 Kare içinde Daire)
        effectiveWidthM = round(D, 2);
        effectiveHeightM = round(D, 2);
        chordWidthM = round(D, 2);
        isCircularMask = true;
        geometryFormulaText = `Yuvarlak Zemin: Çap D = ${D}m × ${D}m (1:1 Kare Canvas İçinde Dairesel Maske)`;
      }

      // 2. PROJEKTÖR DONANIM VE OVERLAP HESABI
      const preset = RESOLUTIONS[s.resIdx];
      const baseW = s.resIdx === RESOLUTIONS.length - 1 ? s.customW : preset.w;
      const baseH = s.resIdx === RESOLUTIONS.length - 1 ? s.customH : preset.h;

      const projW = s.orient === 'landscape' ? baseW : baseH;
      const projH = s.orient === 'landscape' ? baseH : baseW;

      // 360° kapalı döngüde N adet overlap vardır, açık yüzeylerde (N - 1) adet overlap vardır!
      const overlapCountX = isClosedLoopX ? s.cols : Math.max(0, s.cols - 1);
      const overlapCountY = Math.max(0, s.rows - 1);

      const ovPxX = overlapCountX > 0
        ? (s.overlapMode === 'percent' ? pctToPx(s.overlapX, projW) : Math.round(s.overlapX))
        : 0;
      const ovPxY = overlapCountY > 0
        ? (s.overlapMode === 'percent' ? pctToPx(s.overlapY, projH) : Math.round(s.overlapY))
        : 0;

      const totalRawW = s.cols * projW;
      const totalRawH = s.rows * projH;
      const totalOvW = overlapCountX * ovPxX;
      const totalOvH = overlapCountY * ovPxY;

      const projNetW = Math.max(100, totalRawW - totalOvW);
      const projNetH = Math.max(100, totalRawH - totalOvH);

      // 3. ORANA GÖRE İÇERİK ÇÖZÜNÜRLÜĞÜ (Fiziksel Açınım Oranı = İçerik Piksel Oranı)
      const aspectW = Math.max(100, Math.round(effectiveWidthM * pxPerMeterRef));
      const aspectH = Math.max(100, Math.round(effectiveHeightM * pxPerMeterRef));

      const netW = calcMethod === 'aspect_ref' ? aspectW : projNetW;
      const netH = calcMethod === 'aspect_ref' ? aspectH : projNetH;

      // Oranlar (Aspect Ratios)
      const aspectPhysical = round(effectiveWidthM / Math.max(0.1, effectiveHeightM), 2);
      const aspectProjector = round(projNetW / Math.max(1, projNetH), 2);
      const aspectContent = round(netW / Math.max(1, netH), 2);

      // İçerik genişliğini (netW) tutturmak için gereken gerçek overlap:
      const impliedTotalOvW = totalRawW - netW;
      const impliedOvPxX = overlapCountX > 0 ? round(impliedTotalOvW / overlapCountX, 1) : 0;
      const impliedOvPctX = overlapCountX > 0 ? round((impliedOvPxX / projW) * 100, 1) : 0;

      const drawW = s.rotate90 ? netH : netW;
      const drawH = s.rotate90 ? netW : netH;

      // Piksel Yoğunluğu (mm/px ve PPI)
      const mmPerPxW = round((effectiveWidthM * 1000) / netW, 2);
      const mmPerPxH = round((effectiveHeightM * 1000) / netH, 2);
      const avgMmPerPx = round((mmPerPxW + mmPerPxH) / 2, 2);
      const ppi = round(25.4 / avgMmPerPx, 1);

      // Projektör Slice Koordinatları
      const sliceStepX = overlapCountX > 0
        ? (isClosedLoopX ? netW / s.cols : (netW - projW) / Math.max(1, s.cols - 1))
        : 0;
      const sliceStepY = overlapCountY > 0 ? (netH - projH) / Math.max(1, s.rows - 1) : 0;
      const projSlices: CalculatedSurface['projSlices'] = [];
      let idx = 1;
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const startX = Math.round(c * sliceStepX);
          const endX = Math.min(netW, startX + projW);
          const startY = Math.round(r * sliceStepY);
          const endY = Math.min(netH, startY + projH);
          projSlices.push({ index: idx++, col: c, row: r, startX, endX, startY, endY });
        }
      }

      return {
        ...s,
        effectiveWidthM,
        effectiveHeightM,
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
        ppi,
        totalProjectors: s.cols * s.rows,
        geometryFormulaText,
        projSlices,
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
        positioned.push({ ...w, rotate90: false, drawW: w.netW, drawH: w.netH, posX: curX, posY: 0 });
        curX += w.netW;
        if (w.netH > maxWallH) maxWallH = w.netH;
      });

      let curY = maxWallH;
      let otherX = 0;
      others.forEach(o => {
        positioned.push({ ...o, rotate90: false, drawW: o.netW, drawH: o.netH, posX: otherX, posY: curY });
        otherX += o.netW;
      });
    } else if (layoutMode === 'stacked') {
      let curY = 0;
      rawCalculated.forEach(s => {
        positioned.push({ ...s, rotate90: false, drawW: s.netW, drawH: s.netH, posX: 0, posY: curY });
        curY += s.netH;
      });
    } else if (layoutMode === 'cross') {
      const floor = rawCalculated.find(s => s.type === 'floor') || rawCalculated[0];
      const walls = rawCalculated.filter(s => s.id !== floor.id);

      const leftWall = walls[0];
      const topWall = walls[1];
      const rightWall = walls[2];
      const bottomWall = walls[3];

      const leftMargin = leftWall ? leftWall.netH : 0;
      const topMargin = topWall ? topWall.netH : 0;

      const floorDrawW = floor.netH;
      const floorDrawH = floor.netW;
      positioned.push({
        ...floor,
        rotate90: true,
        drawW: floorDrawW,
        drawH: floorDrawH,
        posX: leftMargin,
        posY: topMargin,
      });

      if (leftWall) {
        positioned.push({
          ...leftWall,
          rotate90: true,
          drawW: leftWall.netH,
          drawH: leftWall.netW,
          posX: 0,
          posY: topMargin,
        });
      }
      if (topWall) {
        positioned.push({
          ...topWall,
          rotate90: false,
          drawW: topWall.netW,
          drawH: topWall.netH,
          posX: leftMargin,
          posY: 0,
        });
      }
      if (rightWall) {
        positioned.push({
          ...rightWall,
          rotate90: true,
          drawW: rightWall.netH,
          drawH: rightWall.netW,
          posX: leftMargin + floorDrawW,
          posY: topMargin,
        });
      }
      if (bottomWall) {
        positioned.push({
          ...bottomWall,
          rotate90: false,
          drawW: bottomWall.netW,
          drawH: bottomWall.netH,
          posX: leftMargin,
          posY: topMargin + floorDrawH,
        });
      }
      let extraY = topMargin + floorDrawH + (bottomWall ? bottomWall.netH : 0);
      walls.slice(4).forEach(ex => {
        positioned.push({
          ...ex,
          rotate90: false,
          drawW: ex.netW,
          drawH: ex.netH,
          posX: leftMargin,
          posY: extraY,
        });
        extraY += ex.netH;
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
      pxPerMeterRef: round(pxPerMeterRef, 1),
    };
  }, [surfaces, layoutMode, calcMethod, refHeightM, refHeightPx]);

  const activeSurface = calculation.surfaces.find(s => s.id === selectedId) || calculation.surfaces[0];

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

      // Kubbe veya Dairesel Zemin ise Polar Daire Maskesini Çiz
      if (s.isCircularMask) {
        const cx = s.posX + s.drawW / 2;
        const cy = s.posY + s.drawH / 2;
        const r = Math.min(s.drawW, s.drawH) / 2;
        g.strokeStyle = s.color;
        g.lineWidth = 6;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();

        // Polar halkalar (30°, 60°)
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

      if (showSlices && !s.rotate90) {
        s.projSlices.forEach(sl => {
          g.strokeStyle = 'rgba(250, 204, 21, 0.45)';
          g.lineWidth = 3;
          g.setLineDash([12, 8]);
          g.strokeRect(s.posX + sl.startX, s.posY + sl.startY, s.projW, s.projH);
          g.setLineDash([]);
        });
      }

      g.strokeStyle = s.color;
      g.lineWidth = 6;
      g.strokeRect(s.posX, s.posY, s.drawW, s.drawH);

      const fs = Math.max(24, Math.round(Math.min(s.drawW, s.drawH) / 14));
      g.fillStyle = '#ffffff';
      g.font = `bold ${fs}px sans-serif`;
      g.textAlign = 'center';
      const cx = s.posX + s.drawW / 2;
      const cy = s.posY + s.drawH / 2;
      g.fillText(s.name.toUpperCase(), cx, cy - fs * 0.6);

      g.fillStyle = '#38bdf8';
      g.font = `bold ${Math.round(fs * 0.85)}px monospace`;
      g.fillText(`${s.netW} × ${s.netH} px (Oran ${s.aspectContent}:1)`, cx, cy + fs * 0.35);

      g.fillStyle = '#94a3b8';
      g.font = `${Math.round(fs * 0.65)}px monospace`;
      g.fillText(`Açınım: ${s.effectiveWidthM}m × ${s.effectiveHeightM}m | ${s.cols}×${s.rows} PJ | ~${s.avgMmPerPx} mm/px`, cx, cy + fs * 1.2);
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
      `Hesaplama Yöntemi                : ${calcMethod === 'aspect_ref' ? 'Fiziksel Açınım Oranına Göre (Homojen Piksel)' : 'Projektör & Overlap Formülüne Göre'}`,
      `Toplam İçerik Canvas Çözünürlüğü : ${calculation.totalCanvasW} × ${calculation.totalCanvasH} px (${calculation.megapixels} MP)`,
      `Toplam Projektör Sayısı          : ${calculation.totalProjectors} Adet`,
      `Piksel Yoğunluğu Aralığı         : ${calculation.minMm} - ${calculation.maxMm} mm/px`,
      '-------------------------------------------------------------------',
      'YÜZEY BAZLI GEOMETRİ, ORAN & PIXEL MAP DETAYLARI:',
    ];

    calculation.surfaces.forEach((s, idx) => {
      lines.push(
        `\n${idx + 1}. ${s.name.toUpperCase()} [${GEOMETRY_LABELS[s.geometry]}]:`,
        `   - Geometrik Açınım       : ${s.geometryFormulaText}`,
        `   - Yüzey Fiziksel Oranı   : ${s.aspectPhysical}:1 (${s.effectiveWidthM}m / ${s.effectiveHeightM}m)`,
        `   - İçerik Pixel Map       : ${s.netW} × ${s.netH} px (Oran: ${s.aspectContent}:1)`,
        `   - Projektör Dizilimi     : ${s.cols}×${s.rows} Adet (${s.projW}×${s.projH} px, ${s.overlapCountX} Yatay Overlap)`,
        `   - Gereken Overlap        : Toplam ${s.impliedTotalOvW} px (Projektör arası ~${s.impliedOvPxX} px / %${s.impliedOvPctX})`,
        `   - Piksel Boyutu / PPI    : ~${s.avgMmPerPx} mm/px (${s.ppi} PPI)`
      );
    });

    lines.push('===================================================================');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('Tüm yüzeylerin Geometri, Oran ve Pixel Map teknik raporu panoya kopyalandı!');
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
              1. Yüzey / Yay Oranına Göre İçerik (Homojen)
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

          {calcMethod === 'aspect_ref' && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-emerald-800/70">
              <span className="text-emerald-400 font-semibold">Referans:</span>
              <input
                type="number"
                step="0.1"
                value={refHeightM}
                onChange={e => setRefHeightM(Math.max(0.5, +e.target.value))}
                className="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono font-bold text-white text-center"
              />
              <span className="text-slate-400">m =</span>
              <input
                type="number"
                step="10"
                value={refHeightPx}
                onChange={e => setRefHeightPx(Math.max(100, +e.target.value))}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono font-bold text-emerald-400 text-center"
              />
              <span className="text-slate-400">px</span>
            </div>
          )}
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
      <div className="grid lg:grid-cols-[470px_1fr] gap-3 flex-1 overflow-auto">
        {/* SOL PANEL: YÜZEY EKLEME LİSTESİ + SEÇİLİ YÜZEY GEOMETRİ & ORAN EDİTÖRÜ */}
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
            <div className="space-y-1.5 max-h-[175px] overflow-auto pr-0.5 pt-1">
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
                          Açınım: {s.effectiveWidthM}m × {s.effectiveHeightM}m →{' '}
                          <b className="text-emerald-400">{s.netW} × {s.netH} px</b> ({s.cols}×{s.rows} PJ)
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
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
          </div>

          {/* 2. SEÇİLİ YÜZEYİN GEOMETRİ, ÖLÇÜ VE ORAN EDİTÖRÜ */}
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
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-[11px] font-bold">
                  {activeSurface.netW} × {activeSurface.netH} px
                </span>
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
                        <b className="text-amber-300 text-xs">{round(activeSurface.effectiveWidthM * activeSurface.effectiveHeightM, 1)} m²</b>
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
                        <b className="text-amber-300 text-xs">{round(4 * Math.PI * activeSurface.radiusM * activeSurface.radiusM, 1)} m²</b>
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
                        <b className="text-amber-300 text-xs">{round(2 * Math.PI * activeSurface.radiusM * activeSurface.radiusM, 1)} m²</b>
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
                        <b className="text-amber-300 text-xs">{round(Math.PI * activeSurface.radiusM * activeSurface.radiusM, 1)} m²</b>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* C) ORANLAR KARŞILAŞTIRMA KARTI */}
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

                <div className="text-[10.5px] text-slate-300 bg-slate-900/90 p-2 rounded border border-slate-800 font-mono leading-relaxed">
                  {activeSurface.overlapCountX > 0 && (
                    <div className="text-amber-300">
                      • <b>{activeSurface.cols} Projektör ({activeSurface.totalRawW}px ham, {activeSurface.overlapCountX} overlap)</b> ile{' '}
                      <b>{activeSurface.netW}px</b> içeriği eşlemek için gereken overlap:{' '}
                      <b>Toplam {activeSurface.impliedTotalOvW} px</b> (Projektör arası{' '}
                      <b>~{activeSurface.impliedOvPxX} px / %{activeSurface.impliedOvPctX}</b>)
                    </div>
                  )}
                </div>
              </div>

              {/* D) Projektör Çözünürlüğü, Sayısı ve Overlap */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300 text-[11px]">
                    Projektör Donanımı & Dizilimi
                  </span>
                  {calcMethod === 'aspect_ref' && activeSurface.overlapCountX > 0 && (
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
                    Yatay Overlap ({activeSurface.overlapMode === 'percent' ? '%' : 'px'})
                    <div className="flex items-center gap-1.5">
                      <input
                        className="inp font-bold"
                        type="number"
                        step="0.5"
                        min="0"
                        value={activeSurface.overlapX}
                        disabled={activeSurface.overlapCountX <= 0}
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
                        disabled={activeSurface.rows <= 1}
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

        {/* SAĞ PANEL: BİRLEŞİK PIXEL MAP ÇİZİMİ VE KARŞILAŞTIRMALI ORAN TABLOSU */}
        <div className="space-y-3 min-w-0 flex flex-col overflow-auto">
          {/* ÇİZİM KONTROL ÇUBUĞU */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">Çizim Yerleşimi:</span>
              <button
                onClick={() => setLayoutMode('cross')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'cross' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Kutu Açılımı (Cross Unwrap)
              </button>
              <button
                onClick={() => setLayoutMode('strip')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'strip' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Yan Yana Şerit (Panorama / Silindir)
              </button>
              <button
                onClick={() => setLayoutMode('stacked')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'stacked' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Alt Alta Dizilim
              </button>
              <button
                onClick={() => setLayoutMode('custom')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'custom' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Özel Koordinat (X,Y)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 cursor-pointer text-slate-300 text-[11px]">
                <input type="checkbox" checked={showSlices} onChange={e => setShowSlices(e.target.checked)} />
                <span>Projektör Sınırları</span>
              </label>
              <button
                onClick={downloadPixelMapPng}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded shadow"
              >
                1:1 PNG Şablon İndir
              </button>
              <button
                onClick={copySpecsToClipboard}
                className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white font-semibold rounded"
              >
                Raporu Kopyala
              </button>
            </div>
          </div>

          {/* CANLI İNTERAKTİF PIXEL MAP VEKTÖR ÇİZİM ALANI */}
          <div className="border border-slate-700 rounded bg-slate-950 p-3 flex-1 flex flex-col items-center justify-center min-h-[380px] relative">
            <div className="w-full flex justify-between items-center text-[11px] text-slate-400 mb-2 border-b border-slate-800 pb-1">
              <span>
                Canlı Pixel Map & Geometrik Açınım Şeması (Düz, Kavisli, 360° Silindir, Kubbe & Küre)
              </span>
              <span className="font-mono text-sky-400 font-bold">
                Toplam Canvas: {calculation.totalCanvasW} × {calculation.totalCanvasH} px ({calculation.megapixels} MP)
              </span>
            </div>

            <div className="w-full flex-1 flex items-center justify-center overflow-auto p-2">
              {(() => {
                const padLeft = 100;
                const padTop = 80;
                const padRight = 100;
                const padBottom = 80;
                const vbW = calculation.totalCanvasW + padLeft + padRight;
                const vbH = calculation.totalCanvasH + padTop + padBottom;
                const baseFont = Math.max(36, Math.round(Math.max(calculation.totalCanvasW, calculation.totalCanvasH) / 42));

                return (
                  <svg
                    viewBox={`0 0 ${vbW} ${vbH}`}
                    className="max-w-full max-h-[430px] select-none drop-shadow"
                  >
                    {/* Toplam Canvas Dış Sınır Çizgisi */}
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

                    {/* Her Bir Yüzeyi Çiz */}
                    {calculation.surfaces.map(s => {
                      const sx = padLeft + s.posX;
                      const sy = padTop + s.posY;
                      const isSel = s.id === activeSurface?.id;
                      const surfFont = Math.max(
                        26,
                        Math.min(baseFont * 1.1, Math.min(s.drawW, s.drawH) / 5.5)
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
                          {/* Yüzey Dikdörtgen Bounding Box */}
                          <rect
                            x={sx}
                            y={sy}
                            width={s.drawW}
                            height={s.drawH}
                            fill={s.color + (isSel ? '35' : '18')}
                            stroke={isSel ? '#facc15' : s.color}
                            strokeWidth={isSel ? Math.max(8, baseFont * 0.22) : Math.max(4, baseFont * 0.12)}
                          />

                          {/* Kubbe (Dome) veya Dairesel Zemin ise Polar Fisheye / Daire Çizgileri */}
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

                          {/* 360° Silindir, Kavisli Duvar ve Tam Küre İçin Derece / Açınım Cetveli */}
                          {(s.geometry === 'cylinder_360' || s.geometry === 'sphere' || s.geometry === 'concave_arc') && !s.rotate90 && (
                            <g>
                              {/* Yatay Açınım Derece Bölümleri (0° - 90° - 180° - 270° - 360°) */}
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
                                      x={lx + (ratio === 1 ? -surfFont * 0.4 : ratio === 0 ? surfFont * 0.4 : 0)}
                                      y={sy + surfFont * 0.75}
                                      fill="#38bdf8"
                                      fontSize={surfFont * 0.52}
                                      fontFamily="monospace"
                                      fontWeight="bold"
                                      textAnchor={ratio === 1 ? 'end' : ratio === 0 ? 'start' : 'middle'}
                                    >
                                      {degLabel}° ({round(s.effectiveWidthM * ratio, 1)}m)
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Küre (Sphere) ise Dikey Enlem Çizgileri (+90° Kuzey, 0° Ekvator, -90° Güney) */}
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
                                      x={sx + surfFont * 0.4}
                                      y={ly - surfFont * 0.2}
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

                          {/* Projektör Slice & Overlap Alanları */}
                          {showSlices && !s.rotate90 && s.projSlices.map(sl => (
                            <g key={sl.index}>
                              <rect
                                x={sx + sl.startX}
                                y={sy + sl.startY}
                                width={s.projW}
                                height={s.projH}
                                fill="none"
                                stroke="rgba(250, 204, 21, 0.4)"
                                strokeWidth={Math.max(3, baseFont * 0.08)}
                                strokeDasharray={`${baseFont * 0.3} ${baseFont * 0.2}`}
                              />
                            </g>
                          ))}

                          {/* Yüzey Adı */}
                          <text
                            x={cx}
                            y={cy - surfFont * 0.85}
                            fill="#f8fafc"
                            fontSize={surfFont * 0.95}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {s.name}
                          </text>

                          {/* İçerik Pixel Map Çözünürlüğü */}
                          <text
                            x={cx}
                            y={cy + surfFont * 0.2}
                            fill="#4ade80"
                            fontSize={surfFont * 1.1}
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {s.netW} × {s.netH} pixel
                          </text>

                          {/* Fiziksel Açınım & Oran Bilgisi */}
                          <text
                            x={cx}
                            y={cy + surfFont * 1.15}
                            fill="#bae6fd"
                            fontSize={surfFont * 0.7}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            Açınım: {s.effectiveWidthM}m × {s.effectiveHeightM}m (Oran {s.aspectPhysical}:1) · ~{s.avgMmPerPx} mm/px
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* ALT TABLO: YÜZEY GEOMETRİSİ, ORANLARI VE İÇERİK ÇÖZÜNÜRLÜĞÜ TABLOSU */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 overflow-auto">
            <div className="font-bold text-slate-200 mb-1.5 flex justify-between items-center">
              <span>Yüzey Geometrileri, Açınım Oranları ve İçerik Çözünürlüğü (Pixel Map) Tablosu</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Referans: {refHeightM}m = {refHeightPx}px (~{round((refHeightM * 1000) / refHeightPx, 2)} mm/px)
              </span>
            </div>
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1.5 pr-2">Yüzey Adı</th>
                  <th className="py-1.5 pr-2">Geometri</th>
                  <th className="py-1.5 pr-2">Açınım Ölçüsü</th>
                  <th className="py-1.5 pr-2">Oran</th>
                  <th className="py-1.5 pr-2 text-emerald-400">İçerik Pixel Map</th>
                  <th className="py-1.5 pr-2 text-sky-400">Projeksiyon</th>
                  <th className="py-1.5 pr-2 text-amber-400">Gereken Overlap</th>
                  <th className="py-1.5">Yoğunluk</th>
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
                    <td className="py-1.5 pr-2 text-slate-400 text-[10px]">
                      {s.geometry === 'flat' ? 'Düz' :
                       s.geometry === 'concave_arc' ? `Kavis (${s.angleDeg}°, R=${s.radiusM}m)` :
                       s.geometry === 'cylinder_360' ? `360° Silindir (D=${s.radiusM*2}m)` :
                       s.geometry === 'dome' ? `Kubbe (D=${s.radiusM*2}m)` :
                       s.geometry === 'sphere' ? `Küre (D=${s.radiusM*2}m)` : `Daire Zemin (D=${s.radiusM*2}m)`}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-slate-300">
                      {s.effectiveWidthM}m × {s.effectiveHeightM}m
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-amber-300">
                      {s.aspectPhysical}:1
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-emerald-400">
                      {s.netW} × {s.netH} px
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-sky-300">
                      {s.cols}×{s.rows} PJ {s.isClosedLoopX ? '(360° Döngü)' : ''}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-amber-400">
                      {s.overlapCountX > 0 ? `${s.impliedOvPxX} px (%${s.impliedOvPctX})` : 'Yok'}
                    </td>
                    <td className="py-1.5 font-mono text-slate-200">
                      ~{s.avgMmPerPx} mm/px
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
