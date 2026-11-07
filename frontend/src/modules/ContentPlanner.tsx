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

export type SurfaceType = 'wall' | 'floor' | 'ceiling' | 'column' | 'curved';
export type LayoutMode = 'strip' | 'cross' | 'stacked' | 'custom';
export type CalcMethod = 'aspect_ref' | 'projector_blend';

export interface SurfaceItem {
  id: string;
  name: string;
  type: SurfaceType;
  widthM: number;       // Fiziksel genişlik (m)
  heightM: number;      // Fiziksel yükseklik/derinlik (m)
  resIdx: number;       // Seçili çözünürlük indeksi
  customW: number;      // Özel projektör genişliği (px)
  customH: number;      // Özel projektör yüksekliği (px)
  orient: 'landscape' | 'portrait';
  cols: number;         // Yatay projektör sayısı (N_x)
  rows: number;         // Dikey projektör sırası (N_y)
  overlapMode: 'percent' | 'pixel';
  overlapX: number;     // Yatay overlap (% veya px)
  overlapY: number;     // Dikey overlap (% veya px)
  color: string;        // Şemadaki yüzey rengi
  canvasX: number;      // Özel yerleşim modunda X koordinatı (px)
  canvasY: number;      // Özel yerleşim modunda Y koordinatı (px)
  rotate90: boolean;    // Şemada yüzeyi 90 derece döndür
}

export interface CalculatedSurface extends SurfaceItem {
  projW: number;            // Oryantasyona göre tek projektör W
  projH: number;            // Oryantasyona göre tek projektör H
  aspectPhysical: number;   // Duvar Fiziksel Oranı (W_m / H_m)
  aspectProjector: number;  // Toplam Projeksiyon Oranı (projNetW / projNetH)
  aspectContent: number;    // Aktif İçerik Oranı (netW / netH)

  // 1) Orana Göre İçerik Çözünürlüğü (Aspect Ratio Bazlı)
  aspectW: number;          // round(refPxH * (widthM / heightM))
  aspectH: number;          // refPxH (örn. 1200 px)

  // 2) Projeksiyon & Overlap Bazlı Donanım Çözünürlüğü
  ovPxX: number;            // İki projektör arası yatay overlap (px)
  ovPxY: number;            // İki projektör arası dikey overlap (px)
  totalRawW: number;        // Ham genişlik (N * W)
  totalRawH: number;        // Ham yükseklik (M * H)
  totalOvW: number;         // Toplam düşülen yatay overlap ((N-1) * O_x)
  totalOvH: number;         // Toplam düşülen dikey overlap ((M-1) * O_y)
  projNetW: number;         // Donanım Net Genişlik: (N*W) - ((N-1)*O_x)
  projNetH: number;         // Donanım Net Yükseklik: (M*H) - ((M-1)*O_y)

  // İçerik (Oran) için gereken ideal overlap
  impliedTotalOvW: number;  // totalRawW - aspectW
  impliedOvPxX: number;     // (totalRawW - aspectW) / (cols - 1)
  impliedOvPctX: number;    // (impliedOvPxX / projW) * 100

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

const INITIAL_SURFACES: SurfaceItem[] = [
  {
    id: 'surf-1',
    name: '1. Duvar (Sol Uzun)',
    type: 'wall',
    widthM: 23.30,
    heightM: 4.30,
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
    widthM: 7.00,
    heightM: 4.30,
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
    widthM: 23.30,
    heightM: 4.30,
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
    widthM: 23.30,
    heightM: 7.00,
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
  // HAZIR ODA ŞABLONLARI (HIZLI YÜKLEME)
  // ==========================================
  const applyPreset = (preset: 'single' | 'l-wall' | 'u-3wall' | 'u-floor' | 'box-5') => {
    if (preset === 'single') {
      const s: SurfaceItem[] = [{
        id: 'surf-1', name: '1. Ana Duvar', type: 'wall', widthM: 16.0, heightM: 4.0,
        resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 3, rows: 1,
        overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
      }];
      setRefHeightM(4.0);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'l-wall') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: '1. Duvar (Sol)', type: 'wall', widthM: 12.0, heightM: 4.0,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 1,
          overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
        {
          id: 'surf-2', name: '2. Duvar (Ön)', type: 'wall', widthM: 8.0, heightM: 4.0,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 1,
          overlapMode: 'percent', overlapX: 15, overlapY: 10, color: SURFACE_COLORS[1], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(4.0);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'u-3wall') {
      const s: SurfaceItem[] = [
        {
          id: 'surf-1', name: '1. Duvar (Sol)', type: 'wall', widthM: 15.0, heightM: 4.0,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 3, rows: 1,
          overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
        },
        {
          id: 'surf-2', name: '2. Duvar (Merkez)', type: 'wall', widthM: 10.0, heightM: 4.0,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 2, rows: 1,
          overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[1], canvasX: 0, canvasY: 0, rotate90: false,
        },
        {
          id: 'surf-3', name: '3. Duvar (Sağ)', type: 'wall', widthM: 15.0, heightM: 4.0,
          resIdx: 0, customW: 1920, customH: 1200, orient: 'landscape', cols: 3, rows: 1,
          overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[2], canvasX: 0, canvasY: 0, rotate90: false,
        },
      ];
      setRefHeightM(4.0);
      setRefHeightPx(1200);
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'u-floor') {
      setRefHeightM(4.30);
      setRefHeightPx(1200);
      setSurfaces(INITIAL_SURFACES);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'box-5') {
      const s: SurfaceItem[] = [
        ...INITIAL_SURFACES.slice(0, 3),
        {
          id: 'surf-5', name: '4. Duvar (Arka Kısa)', type: 'wall', widthM: 7.00, heightM: 4.30,
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
    }
  };

  // ==========================================
  // YÜZEY EKLEME / SİLME / GÜNCELLEME
  // ==========================================
  const addSurface = (type: SurfaceType) => {
    const id = `surf-${Date.now()}`;
    const wallCount = surfaces.filter(s => s.type === 'wall').length;
    const defaultName =
      type === 'wall' ? `${wallCount + 1}. Duvar` :
      type === 'floor' ? 'Zemin (Floor)' :
      type === 'ceiling' ? 'Tavan (Ceiling)' :
      type === 'curved' ? 'Kavisli Yüzey (Curved)' : 'Kolon / Özel Yüzey';

    const newSurf: SurfaceItem = {
      id,
      name: defaultName,
      type,
      widthM: type === 'floor' ? 23.30 : 10.0,
      heightM: type === 'floor' ? 7.0 : refHeightM,
      resIdx: 0,
      customW: 1920,
      customH: 1200,
      orient: 'landscape',
      cols: type === 'floor' ? 4 : 2,
      rows: type === 'floor' ? 2 : 1,
      overlapMode: 'percent',
      overlapX: 12,
      overlapY: 10,
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
  // DİNAMİK PIXEL MAP, ORAN VE KOORDİNAT MOTORU
  // ==========================================
  const calculation = useMemo(() => {
    // 1. Birim metre başına düşen referans piksel yoğunluğu (Oran bazlı hesap için)
    // Örn: Referans Yükseklik 4.30m = 1200px ise -> 1 metre = 279.069767 px
    const pxPerMeterRef = refHeightPx / Math.max(0.1, refHeightM);

    const rawCalculated: CalculatedSurface[] = surfaces.map(s => {
      const preset = RESOLUTIONS[s.resIdx];
      const baseW = s.resIdx === RESOLUTIONS.length - 1 ? s.customW : preset.w;
      const baseH = s.resIdx === RESOLUTIONS.length - 1 ? s.customH : preset.h;

      const projW = s.orient === 'landscape' ? baseW : baseH;
      const projH = s.orient === 'landscape' ? baseH : baseW;

      // A) DONANIM & OVERLAP BAZLI ÇÖZÜNÜRLÜK: W = (N*W) - ((N-1)*O)
      const ovPxX = s.cols > 1
        ? (s.overlapMode === 'percent' ? pctToPx(s.overlapX, projW) : Math.round(s.overlapX))
        : 0;
      const ovPxY = s.rows > 1
        ? (s.overlapMode === 'percent' ? pctToPx(s.overlapY, projH) : Math.round(s.overlapY))
        : 0;

      const totalRawW = s.cols * projW;
      const totalRawH = s.rows * projH;
      const totalOvW = (s.cols - 1) * ovPxX;
      const totalOvH = (s.rows - 1) * ovPxY;

      const projNetW = Math.max(100, totalRawW - totalOvW);
      const projNetH = Math.max(100, totalRawH - totalOvH);

      // B) ORANA GÖRE İÇERİK ÇÖZÜNÜRLÜĞÜ (Duvar Fiziksel Ölçü Oranı = İçerik Piksel Oranı)
      // Örn: 23.30m / 4.30m * 1200px = 6502.32 -> 6503 px
      // Örn: 7.00m / 4.30m * 1200px = 1953.48 -> 1954 px
      const aspectW = Math.max(100, Math.round(s.widthM * pxPerMeterRef));
      const aspectH = Math.max(100, Math.round(s.heightM * pxPerMeterRef));

      // Seçili Hesaplama Metoduna göre aktif İçerik Çözünürlüğü (netW x netH)
      const netW = calcMethod === 'aspect_ref' ? aspectW : projNetW;
      const netH = calcMethod === 'aspect_ref' ? aspectH : projNetH;

      // Oranlar (Aspect Ratios)
      const aspectPhysical = round(s.widthM / s.heightM, 2);
      const aspectProjector = round(projNetW / projNetH, 2);
      const aspectContent = round(netW / netH, 2);

      // Eğer Orana Göre İçerik çözünürlüğü (aspectW) kullanılıyorsa,
      // seçilen projektörlerin bu alanı tam doldurması için gereken gerçek Overlap miktarı:
      const impliedTotalOvW = totalRawW - netW;
      const impliedOvPxX = s.cols > 1 ? round(impliedTotalOvW / (s.cols - 1), 1) : 0;
      const impliedOvPctX = s.cols > 1 ? round((impliedOvPxX / projW) * 100, 1) : 0;

      const drawW = s.rotate90 ? netH : netW;
      const drawH = s.rotate90 ? netW : netH;

      // Piksel Yoğunluğu (mm/px ve PPI)
      const mmPerPxW = round((s.widthM * 1000) / netW, 2);
      const mmPerPxH = round((s.heightM * 1000) / netH, 2);
      const avgMmPerPx = round((mmPerPxW + mmPerPxH) / 2, 2);
      const ppi = round(25.4 / avgMmPerPx, 1);

      // Projektör Slice Koordinatları
      const sliceStepX = s.cols > 1 ? (netW - projW) / (s.cols - 1) : 0;
      const sliceStepY = s.rows > 1 ? (netH - projH) / (s.rows - 1) : 0;
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
        projW,
        projH,
        aspectPhysical,
        aspectProjector,
        aspectContent,
        aspectW,
        aspectH,
        ovPxX,
        ovPxY,
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
        projSlices,
      };
    });

    // 2. Seçilen Yerleşim Moduna (LayoutMode) göre yüzeylerin Toplam Canvas üzerindeki X, Y koordinatlarını diz
    const positioned: CalculatedSurface[] = [];

    if (layoutMode === 'strip') {
      const walls = rawCalculated.filter(s => s.type === 'wall' || s.type === 'curved' || s.type === 'column');
      const others = rawCalculated.filter(s => s.type === 'floor' || s.type === 'ceiling');

      let curX = 0;
      let maxWallH = 0;
      walls.forEach(w => {
        positioned.push({ ...w, rotate90: false, drawW: w.netW, drawH: w.netH, posX: curX, posY: 0 });
        curX += w.netW;
        if (w.netH > maxWallH) maxWallH = w.netH;
      });

      let curY = maxWallH;
      others.forEach(o => {
        positioned.push({ ...o, rotate90: false, drawW: o.netW, drawH: o.netH, posX: 0, posY: curY });
        curY += o.netH;
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

    // 3. Toplam Canvas genişlik, yükseklik ve istatistikleri
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
      g.fillText(`${s.widthM}m × ${s.heightM}m | ${s.cols}×${s.rows} PJ | ~${s.avgMmPerPx} mm/px`, cx, cy + fs * 1.2);
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
      `Hesaplama Yöntemi                : ${calcMethod === 'aspect_ref' ? 'Fiziksel Duvar Oranına Göre (Homojen Piksel)' : 'Projektör & Overlap Formülüne Göre'}`,
      `Toplam İçerik Canvas Çözünürlüğü : ${calculation.totalCanvasW} × ${calculation.totalCanvasH} px (${calculation.megapixels} MP)`,
      `Toplam Projektör Sayısı          : ${calculation.totalProjectors} Adet`,
      `Piksel Yoğunluğu Aralığı         : ${calculation.minMm} - ${calculation.maxMm} mm/px`,
      '-------------------------------------------------------------------',
      'YÜZEY BAZLI PIXEL MAP & ORAN DETAYLARI:',
    ];

    calculation.surfaces.forEach((s, idx) => {
      lines.push(
        `\n${idx + 1}. ${s.name.toUpperCase()} (${s.widthM} m × ${s.heightM} m):`,
        `   - Duvar Fiziksel Oranı       : ${s.aspectPhysical}:1 (${s.widthM}m / ${s.heightM}m)`,
        `   - İçerik Pixel Map Çözünürlük: ${s.netW} × ${s.netH} px (Oran: ${s.aspectContent}:1)`,
        `   - Projektör Donanım Dizilimi : ${s.cols}×${s.rows} Adet (${s.projW}×${s.projH} px)`,
        `   - Donanım Kapasitesi (Ham)   : ${s.totalRawW} × ${s.totalRawH} px`,
        `   - Gereken Overlap (Örtüşme)  : Toplam ${s.impliedTotalOvW} px (Projektör arası ~${s.impliedOvPxX} px / %${s.impliedOvPctX})`,
        `   - Piksel Boyutu / Yoğunluk   : ~${s.avgMmPerPx} mm/px (${s.ppi} PPI)`
      );
    });

    lines.push('===================================================================');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('Tüm yüzeylerin Oran ve Pixel Map teknik raporu panoya kopyalandı!');
  };

  return (
    <div className="space-y-3 h-full flex flex-col text-xs">
      {/* ÜST ARAÇ ÇUBUĞU: HESAPLAMA MODU & HIZLI ŞABLONLAR */}
      <div className="bg-slate-900 p-2.5 rounded border border-slate-800 flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* HESAPLAMA METODU SEÇİMİ */}
          <div className="flex rounded overflow-hidden border border-sky-700 bg-slate-950 p-0.5">
            <button
              onClick={() => setCalcMethod('aspect_ref')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                calcMethod === 'aspect_ref'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Duvarın metre oranına göre (Örn: 23.30m / 4.30m × 1200px = 6503px) birebir ölçekli içerik çözünürlüğü hesaplar."
            >
              1. Duvar Oranına Göre İçerik Çözünürlüğü (Önerilen)
            </button>
            <button
              onClick={() => setCalcMethod('projector_blend')}
              className={`px-3 py-1 rounded text-xs font-bold transition ${
                calcMethod === 'projector_blend'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Projektör adedi ve girilen % overlap formülüne göre W = (N×W) - ((N-1)×O) hesaplar."
            >
              2. Projektör & Overlap Formülüne Göre
            </button>
          </div>

          {/* Oran Bazlı Referans Ölçek Ayarı */}
          {calcMethod === 'aspect_ref' && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-emerald-800/70">
              <span className="text-emerald-400 font-semibold">Referans:</span>
              <input
                type="number"
                step="0.1"
                value={refHeightM}
                onChange={e => setRefHeightM(Math.max(0.5, +e.target.value))}
                className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 font-mono font-bold text-white text-center"
                title="Referans Duvar Yüksekliği (m)"
              />
              <span className="text-slate-400">m =</span>
              <input
                type="number"
                step="10"
                value={refHeightPx}
                onChange={e => setRefHeightPx(Math.max(100, +e.target.value))}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 font-mono font-bold text-emerald-400 text-center"
                title="Referans Piksel Karşılığı (px)"
              />
              <span className="text-slate-400">px</span>
              <span className="text-[10px] text-slate-500 font-mono ml-1">
                (1m = {calculation.pxPerMeterRef} px)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Şablon:</span>
          <button onClick={() => applyPreset('single')} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            Tek Duvar
          </button>
          <button onClick={() => applyPreset('u-3wall')} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            3 Duvar
          </button>
          <button onClick={() => applyPreset('u-floor')} className="px-2 py-1 rounded bg-sky-900/60 hover:bg-sky-800 text-sky-200 border border-sky-700 font-semibold">
            3 Duvar + Zemin
          </button>
          <button onClick={() => applyPreset('box-5')} className="px-2 py-1 rounded bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 font-semibold">
            5-Yüzey Tam Kutu (23.3×7×4.3m)
          </button>
        </div>
      </div>

      {/* ANA ÇALIŞMA ALANI */}
      <div className="grid lg:grid-cols-[460px_1fr] gap-3 flex-1 overflow-auto">
        {/* SOL PANEL: YÜZEY LİSTESİ + SEÇİLİ YÜZEY HESAP VE ORAN EDİTÖRÜ */}
        <div className="space-y-3 flex flex-col overflow-auto pr-1" style={{ maxHeight: '83vh' }}>
          {/* 1. YÜZEY EKLEME VE SIRALAMA LİSTESİ */}
          <div className="p-3 rounded bg-slate-900 border border-slate-700 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-200 text-xs uppercase tracking-wider">
                1. Proje Yüzeyleri ({surfaces.length} Alan)
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => addSurface('wall')}
                  className="px-2 py-1 rounded bg-sky-700 hover:bg-sky-600 text-white font-semibold text-[11px]"
                >
                  + Duvar Ekle
                </button>
                <button
                  onClick={() => addSurface('floor')}
                  className="px-2 py-1 rounded bg-teal-700 hover:bg-teal-600 text-white font-semibold text-[11px]"
                >
                  + Zemin
                </button>
                <button
                  onClick={() => addSurface('ceiling')}
                  className="px-2 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white font-semibold text-[11px]"
                >
                  + Tavan
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-[195px] overflow-auto pr-0.5">
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
                          {s.widthM}m × {s.heightM}m →{' '}
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

          {/* 2. SEÇİLİ YÜZEYİN DETAYLI ÖLÇÜ, ORAN VE PROJEKSİYON GİRİŞİ */}
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

              {/* A) Yüzey Adı ve Fiziksel Ölçüler */}
              <div className="grid grid-cols-3 gap-2">
                <label className="col-span-1">
                  Yüzey Adı
                  <input
                    className="inp font-semibold text-white"
                    value={activeSurface.name}
                    onChange={e => updateSurface(activeSurface.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  Genişlik / Uzunluk (m)
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

              {/* B) ORANLAR KARŞILAŞTIRMA KARTI (Kullanıcının İstediği Oran Analizi) */}
              <div className="p-2.5 rounded bg-slate-950 border border-amber-700/60 space-y-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                  <span className="font-bold text-amber-400 text-[11px] uppercase tracking-wider">
                    Oran Analizi (Duvar vs İçerik vs Projeksiyon)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {activeSurface.widthM}m / {activeSurface.heightM}m = {activeSurface.aspectPhysical}:1
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">1. Duvar Fiziksel Oranı</span>
                    <b className="text-sm text-amber-300 font-mono">{activeSurface.aspectPhysical} : 1</b>
                    <span className="text-[10px] text-slate-500 block font-mono">
                      {activeSurface.widthM}m × {activeSurface.heightM}m
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

                {/* Oran Hesabı Açıklaması */}
                <div className="text-[10.5px] text-slate-300 bg-slate-900/90 p-2 rounded border border-slate-800 font-mono leading-relaxed">
                  <div>
                    • <b>Oran Hesabı:</b> ({activeSurface.widthM}m ÷ {refHeightM}m) × {refHeightPx}px ={' '}
                    <b className="text-emerald-400">{activeSurface.aspectW} px</b> genişlik,{' '}
                    ({activeSurface.heightM}m ÷ {refHeightM}m) × {refHeightPx}px ={' '}
                    <b className="text-emerald-400">{activeSurface.aspectH} px</b> yükseklik.
                  </div>
                  {activeSurface.cols > 1 && (
                    <div className="mt-1 text-amber-300">
                      • <b>{activeSurface.cols} Projektör ({activeSurface.totalRawW}px ham)</b> ile{' '}
                      <b>{activeSurface.aspectW}px</b> içeriği eşlemek için gereken overlap:{' '}
                      <b>Toplam {activeSurface.impliedTotalOvW} px</b> (Projektör arası{' '}
                      <b>~{activeSurface.impliedOvPxX} px / %{activeSurface.impliedOvPctX}</b>)
                    </div>
                  )}
                </div>
              </div>

              {/* C) Projektör Çözünürlüğü, Sayısı ve Overlap */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300 text-[11px]">
                    Projektör Donanımı & Dizilimi
                  </span>
                  {calcMethod === 'aspect_ref' && activeSurface.cols > 1 && (
                    <button
                      onClick={() =>
                        updateSurface(activeSurface.id, {
                          overlapMode: 'percent',
                          overlapX: Math.max(0, activeSurface.impliedOvPctX),
                        })
                      }
                      className="px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-[10px] font-semibold"
                      title="Overlap değerini duvar oranına (içerik çözünürlüğüne) tam uyacak şekilde otomatik eşitle"
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
                    Yatay Projektör Sayısı (N)
                    <input
                      className="inp font-bold text-amber-300"
                      type="number"
                      min="1"
                      max="24"
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

                {/* Projektör & Overlap Modundaysa Manuel Overlap Girişi */}
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
                        disabled={activeSurface.cols <= 1}
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

              {/* D) Piksel Yoğunluğu & İdeal Müze Standartları Özeti */}
              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-700/60 flex justify-between items-center">
                <div>
                  <span className="text-slate-400 text-[10px] block">Aktif İçerik Çözünürlüğü (Pixel Map):</span>
                  <b className="text-lg text-emerald-400 font-mono">
                    {activeSurface.netW} × {activeSurface.netH} pixel
                  </b>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 text-[10px] block">Piksel Boyutu (Mevcut vs İdeal):</span>
                  <b className="text-sm text-sky-300 font-mono">~{activeSurface.avgMmPerPx} mm/px ({activeSurface.ppi} PPI)</b>
                  <span className="text-emerald-400/80 text-[10px] block">İdeal Standart: 2.0 - 3.5 mm/px</span>
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
                Yan Yana Şerit (1.Duvar + 2.Duvar...)
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
                Canlı Pixel Map & Oran Şeması ({calcMethod === 'aspect_ref' ? 'Duvar Oranına Göre Homojen Ölçekli' : 'Projektör Overlap Bazlı'})
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

                      return (
                        <g
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          className="cursor-pointer transition-opacity hover:opacity-95"
                        >
                          {/* Yüzey Arkaplanı */}
                          <rect
                            x={sx}
                            y={sy}
                            width={s.drawW}
                            height={s.drawH}
                            fill={s.color + (isSel ? '38' : '22')}
                            stroke={isSel ? '#facc15' : s.color}
                            strokeWidth={isSel ? Math.max(8, baseFont * 0.22) : Math.max(4, baseFont * 0.12)}
                          />

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
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 - surfFont * 0.8}
                            fill="#f8fafc"
                            fontSize={surfFont * 0.95}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {s.name}
                          </text>

                          {/* İçerik Pixel Map Çözünürlüğü */}
                          <text
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 + surfFont * 0.25}
                            fill="#4ade80"
                            fontSize={surfFont * 1.1}
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {s.netW} × {s.netH} pixel
                          </text>

                          {/* Fiziksel Ölçü & Oran Bilgisi */}
                          <text
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 + surfFont * 1.2}
                            fill="#bae6fd"
                            fontSize={surfFont * 0.72}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {s.widthM}m × {s.heightM}m (Oran {s.aspectPhysical}:1) · ~{s.avgMmPerPx} mm/px
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* ALT TABLO: YÜZEY ORANLARI, İÇERİK ÇÖZÜNÜRLÜĞÜ VE PROJEKSİYON KARŞILAŞTIRMASI */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 overflow-auto">
            <div className="font-bold text-slate-200 mb-1.5 flex justify-between items-center">
              <span>Yüzey Oranları, İçerik Çözünürlüğü (Pixel Map) ve Projeksiyon Karşılaştırma Tablosu</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Referans: {refHeightM}m = {refHeightPx}px (~{round((refHeightM * 1000) / refHeightPx, 2)} mm/px)
              </span>
            </div>
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1.5 pr-2">Yüzey Adı</th>
                  <th className="py-1.5 pr-2">Fiziksel Ölçü</th>
                  <th className="py-1.5 pr-2">Duvar Oranı</th>
                  <th className="py-1.5 pr-2 text-emerald-400">Orana Göre İçerik (Pixel Map)</th>
                  <th className="py-1.5 pr-2 text-sky-400">Projeksiyon Dizilimi</th>
                  <th className="py-1.5 pr-2 text-amber-400">Gereken Overlap</th>
                  <th className="py-1.5">Piksel Boyutu</th>
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
                      {s.widthM}m × {s.heightM}m
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-amber-300">
                      {s.aspectPhysical} : 1
                    </td>
                    <td className="py-1.5 pr-2 font-mono font-bold text-emerald-400">
                      {s.aspectW} × {s.aspectH} px{' '}
                      <span className="text-[10px] text-emerald-500 font-normal">
                        ({round(s.aspectW / s.aspectH, 2)}:1)
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-sky-300">
                      {s.cols}×{s.rows} PJ ({s.totalRawW}×{s.totalRawH} ham)
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-amber-400">
                      {s.cols > 1 ? `${s.impliedOvPxX} px (%${s.impliedOvPctX})` : 'Yok (Tek PJ)'}
                    </td>
                    <td className="py-1.5 font-mono text-slate-200">
                      ~{s.avgMmPerPx} mm/px <span className="text-slate-500">({s.ppi} PPI)</span>
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
