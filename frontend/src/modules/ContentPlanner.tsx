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
  rotate90: boolean;    // Şemada yüzeyi 90 derece döndür (Kutu açılımında yan duvarlar için)
}

export interface CalculatedSurface extends SurfaceItem {
  projW: number;        // Oryantasyona göre tek projektör W
  projH: number;        // Oryantasyona göre tek projektör H
  ovPxX: number;        // İki projektör arası yatay overlap (px)
  ovPxY: number;        // İki projektör arası dikey overlap (px)
  totalRawW: number;    // Ham genişlik (N * W)
  totalRawH: number;    // Ham yükseklik (M * H)
  totalOvW: number;     // Toplam düşülen yatay overlap ((N-1) * O_x)
  totalOvH: number;     // Toplam düşülen dikey overlap ((M-1) * O_y)
  netW: number;         // Net Pixel Map Genişliği: (N*W) - ((N-1)*O_x)
  netH: number;         // Net Pixel Map Yüksekliği: (M*H) - ((M-1)*O_y)
  drawW: number;        // Canvas üzerindeki genişlik (rotate90'a göre)
  drawH: number;        // Canvas üzerindeki yükseklik (rotate90'a göre)
  posX: number;         // Toplam Canvas içindeki başlangıç X (px)
  posY: number;         // Toplam Canvas içindeki başlangıç Y (px)
  mmPerPxW: number;     // Yatay piksel boyutu (mm/px)
  mmPerPxH: number;     // Dikey piksel boyutu (mm/px)
  avgMmPerPx: number;   // Ortalama piksel boyutu (mm/px)
  ppi: number;          // Piksel yoğunluğu (PPI)
  aspectPhysical: number;
  aspectPixel: number;
  aspectDiffPct: number;
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
    overlapX: 12,
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
    overlapX: 12,
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
    overlapX: 12,
    overlapY: 15,
    color: SURFACE_COLORS[3],
    canvasX: 0,
    canvasY: 0,
    rotate90: false,
  },
];

export default function ContentPlanner({ unit: _unit }: { unit: LengthUnit }) {
  const [surfaces, setSurfaces] = useState<SurfaceItem[]>(INITIAL_SURFACES);
  const [selectedId, setSelectedId] = useState<string>('surf-1');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('strip');
  const [showSlices, setShowSlices] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // ==========================================
  // HAZIR ODA ŞABLONLARI (HIZLI YÜKLEME)
  // ==========================================
  const applyPreset = (preset: 'single' | 'l-wall' | 'u-3wall' | 'u-floor' | 'box-5') => {
    if (preset === 'single') {
      const s: SurfaceItem[] = [{
        id: 'surf-1', name: '1. Ana Duvar', type: 'wall', widthM: 16.0, heightM: 4.0,
        resIdx: 1, customW: 1920, customH: 1080, orient: 'landscape', cols: 4, rows: 1,
        overlapMode: 'percent', overlapX: 10, overlapY: 10, color: SURFACE_COLORS[0], canvasX: 0, canvasY: 0, rotate90: false,
      }];
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
      setSurfaces(s);
      setSelectedId('surf-1');
      setLayoutMode('strip');
    } else if (preset === 'u-floor') {
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
      widthM: type === 'floor' ? 12.0 : 10.0,
      heightM: type === 'floor' ? 7.0 : 4.0,
      resIdx: 0,
      customW: 1920,
      customH: 1200,
      orient: 'landscape',
      cols: 2,
      rows: type === 'floor' ? 2 : 1,
      overlapMode: 'percent',
      overlapX: 10,
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
  // DİNAMİK PIXEL MAP VE KOORDİNAT MOTORU
  // ==========================================
  const calculation = useMemo(() => {
    // 1. Her yüzeyi bağımsız hesapla
    const rawCalculated: CalculatedSurface[] = surfaces.map(s => {
      const preset = RESOLUTIONS[s.resIdx];
      const baseW = s.resIdx === RESOLUTIONS.length - 1 ? s.customW : preset.w;
      const baseH = s.resIdx === RESOLUTIONS.length - 1 ? s.customH : preset.h;

      const projW = s.orient === 'landscape' ? baseW : baseH;
      const projH = s.orient === 'landscape' ? baseH : baseW;

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

      // Net Pixel Map Formülü: W_toplam = (N * W) - ((N - 1) * O)
      const netW = Math.max(100, totalRawW - totalOvW);
      const netH = Math.max(100, totalRawH - totalOvH);

      const drawW = s.rotate90 ? netH : netW;
      const drawH = s.rotate90 ? netW : netH;

      // Piksel Yoğunluğu (mm/px ve PPI)
      const mmPerPxW = round((s.widthM * 1000) / netW, 2);
      const mmPerPxH = round((s.heightM * 1000) / netH, 2);
      const avgMmPerPx = round((mmPerPxW + mmPerPxH) / 2, 2);
      const ppi = round(25.4 / avgMmPerPx, 1);

      // En-boy oranı uyumu (Fiziksel vs Piksel)
      const aspectPhysical = round(s.widthM / s.heightM, 2);
      const aspectPixel = round(netW / netH, 2);
      const aspectDiffPct = round((Math.abs(aspectPhysical - aspectPixel) / aspectPhysical) * 100, 1);

      // Her bir projektörün yüzey içindeki başlangıç-bitiş piksel koordinatları (Slice)
      const projSlices: CalculatedSurface['projSlices'] = [];
      let idx = 1;
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const startX = c * (projW - ovPxX);
          const endX = startX + projW;
          const startY = r * (projH - ovPxY);
          const endY = startY + projH;
          projSlices.push({ index: idx++, col: c, row: r, startX, endX, startY, endY });
        }
      }

      return {
        ...s,
        projW,
        projH,
        ovPxX,
        ovPxY,
        totalRawW,
        totalRawH,
        totalOvW,
        totalOvH,
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
        aspectPhysical,
        aspectPixel,
        aspectDiffPct,
        totalProjectors: s.cols * s.rows,
        projSlices,
      };
    });

    // 2. Seçilen Yerleşim Moduna (LayoutMode) göre yüzeylerin Toplam Canvas üzerindeki X, Y koordinatlarını diz
    const positioned: CalculatedSurface[] = [];

    if (layoutMode === 'strip') {
      // Yan yana panoramik şerit (Duvarlar yan yana, zemin/tavan varsa altına veya yanına)
      const walls = rawCalculated.filter(s => s.type === 'wall' || s.type === 'curved' || s.type === 'column');
      const others = rawCalculated.filter(s => s.type === 'floor' || s.type === 'ceiling');

      let curX = 0;
      let maxWallH = 0;
      walls.forEach(w => {
        positioned.push({ ...w, drawW: w.netW, drawH: w.netH, posX: curX, posY: 0 });
        curX += w.netW;
        if (w.netH > maxWallH) maxWallH = w.netH;
      });

      let curY = maxWallH;
      others.forEach(o => {
        positioned.push({ ...o, drawW: o.netW, drawH: o.netH, posX: 0, posY: curY });
        curY += o.netH;
      });
    } else if (layoutMode === 'stacked') {
      // Alt alta sıra dizilimi
      let curY = 0;
      rawCalculated.forEach(s => {
        positioned.push({ ...s, drawW: s.netW, drawH: s.netH, posX: 0, posY: curY });
        curY += s.netH;
      });
    } else if (layoutMode === 'cross') {
      // Kutu Açılımı (Cross Unwrap): Zemin merkezde, duvarlar etrafında
      const floor = rawCalculated.find(s => s.type === 'floor') || rawCalculated[0];
      const walls = rawCalculated.filter(s => s.id !== floor.id);

      const leftWall = walls[0];
      const topWall = walls[1];
      const rightWall = walls[2];
      const bottomWall = walls[3];

      const leftMargin = leftWall ? leftWall.netH : 0;
      const topMargin = topWall ? topWall.netH : 0;

      // Zemin (düşey boy = floor.netW, yatay en = floor.netH olarak kutu açılımında merkezde)
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
      // 5'ten fazla yüzey varsa sağ alta ekle
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
      // Custom (Özel X,Y koordinatları)
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
    };
  }, [surfaces, layoutMode]);

  const activeSurface = calculation.surfaces.find(s => s.id === selectedId) || calculation.surfaces[0];

  // ==========================================
  // 1:1 PNG PIXEL MAP ŞABLONU İNDİRME
  // ==========================================
  const downloadPixelMapPng = () => {
    const c = document.createElement('canvas');
    // Çok devasa canvaslarda tarayıcı limitini aşmamak için ölçek kontrolü (maks 16384 px)
    const scale = Math.min(1, 16384 / Math.max(calculation.totalCanvasW, calculation.totalCanvasH));
    c.width = Math.round(calculation.totalCanvasW * scale);
    c.height = Math.round(calculation.totalCanvasH * scale);
    const g = c.getContext('2d')!;
    g.scale(scale, scale);

    // Arkaplan
    g.fillStyle = '#090d16';
    g.fillRect(0, 0, calculation.totalCanvasW, calculation.totalCanvasH);

    // Yüzeyleri çiz
    calculation.surfaces.forEach(s => {
      // Yüzey ana dolgusu
      g.fillStyle = s.color + '28';
      g.fillRect(s.posX, s.posY, s.drawW, s.drawH);

      // Test Grid Çizgileri
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

      // Projektör dilimleri (Slices) ve Overlap alanları
      if (showSlices && !s.rotate90) {
        s.projSlices.forEach(sl => {
          g.strokeStyle = 'rgba(250, 204, 21, 0.45)';
          g.lineWidth = 3;
          g.setLineDash([12, 8]);
          g.strokeRect(s.posX + sl.startX, s.posY + sl.startY, s.projW, s.projH);
          g.setLineDash([]);
        });
      }

      // Yüzey çerçevesi
      g.strokeStyle = s.color;
      g.lineWidth = 6;
      g.strokeRect(s.posX, s.posY, s.drawW, s.drawH);

      // Yüzey orta bilgi yazısı
      const fs = Math.max(24, Math.round(Math.min(s.drawW, s.drawH) / 14));
      g.fillStyle = '#ffffff';
      g.font = `bold ${fs}px sans-serif`;
      g.textAlign = 'center';
      const cx = s.posX + s.drawW / 2;
      const cy = s.posY + s.drawH / 2;
      g.fillText(s.name.toUpperCase(), cx, cy - fs * 0.6);

      g.fillStyle = '#38bdf8';
      g.font = `bold ${Math.round(fs * 0.85)}px monospace`;
      g.fillText(`${s.netW} × ${s.netH} px`, cx, cy + fs * 0.35);

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
      `Toplam İçerik Canvas Çözünürlüğü : ${calculation.totalCanvasW} × ${calculation.totalCanvasH} px (${calculation.megapixels} MP)`,
      `Toplam Projektör Sayısı          : ${calculation.totalProjectors} Adet`,
      `Piksel Yoğunluğu Aralığı         : ${calculation.minMm} - ${calculation.maxMm} mm/px (Fark: %${calculation.densityMismatchPct})`,
      '-------------------------------------------------------------------',
      'YÜZEY BAZLI PIXEL MAP DETAYLARI:',
    ];

    calculation.surfaces.forEach((s, idx) => {
      lines.push(
        `\n${idx + 1}. ${s.name.toUpperCase()} (${s.widthM} m × ${s.heightM} m):`,
        `   - Projektör Çözünürlüğü : ${s.projW} × ${s.projH} px (${s.orient === 'landscape' ? 'Yatay' : 'Dikey'})`,
        `   - Projektör Dizilimi    : ${s.cols} Yatay × ${s.rows} Dikey = ${s.totalProjectors} Projektör`,
        `   - Overlap (Örtüşme)     : Yatay ${s.ovPxX} px, Dikey ${s.ovPxY} px`,
        `   - Ham Çözünürlük        : ${s.totalRawW} × ${s.totalRawH} px`,
        `   - Toplam Overlap Düşümü : -${s.totalOvW} px (Yatay), -${s.totalOvH} px (Dikey)`,
        `   - NET PIXEL MAP         : ${s.netW} × ${s.netH} px`,
        `   - Canvas Başlangıç (X,Y): X=${s.posX} px, Y=${s.posY} px`,
        `   - Piksel Boyutu / PPI   : ~${s.avgMmPerPx} mm/px (${s.ppi} PPI)`
      );
    });

    lines.push('===================================================================');
    navigator.clipboard.writeText(lines.join('\n'));
    alert('Tüm yüzeylerin Pixel Map teknik raporu panoya kopyalandı!');
  };

  return (
    <div className="space-y-3 h-full flex flex-col text-xs">
      {/* ÜST ARAÇ ÇUBUĞU: HIZLI ŞABLONLAR & GENEL ÖZET */}
      <div className="bg-slate-900 p-2.5 rounded border border-slate-800 flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-semibold mr-1">Hızlı Kurulum:</span>
          <button onClick={() => applyPreset('single')} className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            Tek Duvar
          </button>
          <button onClick={() => applyPreset('l-wall')} className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            L-Duvar (2 Yüzey)
          </button>
          <button onClick={() => applyPreset('u-3wall')} className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
            U-Oda (3 Duvar)
          </button>
          <button onClick={() => applyPreset('u-floor')} className="px-2.5 py-1 rounded bg-sky-900/60 hover:bg-sky-800 text-sky-200 border border-sky-700 font-semibold">
            3 Duvar + Zemin
          </button>
          <button onClick={() => applyPreset('box-5')} className="px-2.5 py-1 rounded bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 font-semibold">
            5-Yüzey Tam Kutu (Cross)
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-slate-400 text-[10px] block">TOPLAM İÇERİK CANVAS:</span>
            <b className="text-sm text-sky-400 font-mono">{calculation.totalCanvasW} × {calculation.totalCanvasH} px</b>
            <span className="text-slate-500 text-[10px] ml-1.5">({calculation.megapixels} MP · {calculation.totalProjectors} PJ)</span>
          </div>
          <button
            onClick={downloadPixelMapPng}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded shadow flex items-center gap-1"
          >
            <span>1:1 PNG Şablon İndir</span>
          </button>
          <button
            onClick={copySpecsToClipboard}
            className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 text-white font-semibold rounded flex items-center gap-1"
          >
            <span>Raporu Kopyala</span>
          </button>
        </div>
      </div>

      {/* ANA ÇALIŞMA ALANI: SOL LİSTE & EDİTÖR | SAĞ PIXEL MAP ŞEMASI & TABLO */}
      <div className="grid lg:grid-cols-[440px_1fr] gap-3 flex-1 overflow-auto">
        {/* SOL PANEL: YÜZEY LİSTESİ + SEÇİLİ YÜZEY HESAP EDİTÖRÜ */}
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

            {/* Yüzey Kartları Listesi */}
            <div className="space-y-1.5 max-h-[210px] overflow-auto pr-0.5">
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
                        <div className="font-bold text-slate-200 truncate">{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {s.widthM}m × {s.heightM}m | {s.cols}×{s.rows} PJ |{' '}
                          <b className="text-emerald-400">{s.netW}×{s.netH} px</b>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => moveSurface(idx, -1)}
                        disabled={idx === 0}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                        title="Yukarı Taşı"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveSurface(idx, 1)}
                        disabled={idx === surfaces.length - 1}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300"
                        title="Aşağı Taşı"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeSurface(s.id)}
                        disabled={surfaces.length <= 1}
                        className="px-1.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-800 disabled:opacity-30 text-rose-300 ml-0.5"
                        title="Yüzeyi Sil"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. SEÇİLİ YÜZEYİN DETAYLI ÖLÇÜ VE PROJEKSİYON GİRİŞİ */}
          {activeSurface && (
            <div className="p-3 rounded bg-slate-900 border border-sky-800/80 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={activeSurface.color}
                    onChange={e => updateSurface(activeSurface.id, { color: e.target.value })}
                    className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
                    title="Yüzey Rengi Seç"
                  />
                  <span className="font-bold text-sky-400 text-sm">{activeSurface.name} — Ayarları</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono text-[10px]">
                  {activeSurface.totalProjectors} Projektör
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
                  Fiziksel Genişlik (m)
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
                  Fiziksel Yükseklik (m)
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

              {/* B) Projektör Çözünürlüğü & Yönü */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 block text-[11px]">Projektör Çözünürlüğü ve Yönelimi</span>
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
                </div>

                {/* Özel Çözünürlük Seçiliyse Manuel W x H */}
                {activeSurface.resIdx === RESOLUTIONS.length - 1 && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label>
                      Özel Genişlik (px)
                      <input
                        className="inp font-mono"
                        type="number"
                        min="320"
                        value={activeSurface.customW}
                        onChange={e => updateSurface(activeSurface.id, { customW: Math.max(100, +e.target.value) })}
                      />
                    </label>
                    <label>
                      Özel Yükseklik (px)
                      <input
                        className="inp font-mono"
                        type="number"
                        min="240"
                        value={activeSurface.customH}
                        onChange={e => updateSurface(activeSurface.id, { customH: Math.max(100, +e.target.value) })}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* C) Projektör Sayısı (Yatay & Dikey) ve Overlap */}
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300 text-[11px]">Projektör Sayısı & Edge Blend (Overlap)</span>
                  <div className="flex rounded overflow-hidden border border-slate-700 text-[10px]">
                    <button
                      onClick={() => updateSurface(activeSurface.id, { overlapMode: 'percent' })}
                      className={`px-2 py-0.5 ${activeSurface.overlapMode === 'percent' ? 'bg-sky-700 text-white font-bold' : 'bg-slate-900 text-slate-400'}`}
                    >
                      Yüzde (%)
                    </button>
                    <button
                      onClick={() => updateSurface(activeSurface.id, { overlapMode: 'pixel', overlapX: activeSurface.ovPxX, overlapY: activeSurface.ovPxY })}
                      className={`px-2 py-0.5 ${activeSurface.overlapMode === 'pixel' ? 'bg-sky-700 text-white font-bold' : 'bg-slate-900 text-slate-400'}`}
                    >
                      Piksel (px)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
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
                    Yatay Overlap ({activeSurface.overlapMode === 'percent' ? '%' : 'px'})
                    <div className="flex items-center gap-1.5">
                      <input
                        className="inp font-bold"
                        type="number"
                        min="0"
                        max={activeSurface.overlapMode === 'percent' ? 50 : activeSurface.projW - 100}
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
                  <label>
                    Dikey Overlap ({activeSurface.overlapMode === 'percent' ? '%' : 'px'})
                    <div className="flex items-center gap-1.5">
                      <input
                        className="inp font-bold"
                        type="number"
                        min="0"
                        max={activeSurface.overlapMode === 'percent' ? 50 : activeSurface.projH - 100}
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

                {/* Özel Yerleşim Modundaysa Manuel X,Y ve Döndürme */}
                {layoutMode === 'custom' && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                    <label>
                      Canvas X (px)
                      <input
                        className="inp font-mono"
                        type="number"
                        step="10"
                        value={activeSurface.canvasX}
                        onChange={e => updateSurface(activeSurface.id, { canvasX: +e.target.value })}
                      />
                    </label>
                    <label>
                      Canvas Y (px)
                      <input
                        className="inp font-mono"
                        type="number"
                        step="10"
                        value={activeSurface.canvasY}
                        onChange={e => updateSurface(activeSurface.id, { canvasY: +e.target.value })}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 pt-4 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeSurface.rotate90}
                        onChange={e => updateSurface(activeSurface.id, { rotate90: e.target.checked })}
                      />
                      <span>Şemada 90° Döndür</span>
                    </label>
                  </div>
                )}
              </div>

              {/* D) ADIM ADIM PIXEL MAP HESAPLAMA KARTI (Kullanıcının İstediği Net Hesap Özeti) */}
              <div className="p-2.5 rounded bg-emerald-950/30 border border-emerald-700/60 space-y-1.5">
                <div className="flex justify-between items-center border-b border-emerald-800/50 pb-1">
                  <span className="font-bold text-emerald-300">Hesaplama Sonucu ({activeSurface.name})</span>
                  <span className="font-mono text-[10px] text-emerald-400">W = (N×W) - ((N-1)×O)</span>
                </div>

                <div className="grid grid-cols-2 gap-2 py-1">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Net Pixel Map Çözünürlüğü:</span>
                    <b className="text-lg text-emerald-400 font-mono">
                      {activeSurface.netW.toLocaleString()} × {activeSurface.netH.toLocaleString()} px
                    </b>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[10px] block">Piksel Yoğunluğu (Mevcut):</span>
                    <b className="text-sm text-sky-300 font-mono">~{activeSurface.avgMmPerPx} mm/px</b>
                    <span className="text-slate-400 text-[10px] block">({activeSurface.ppi} PPI · İdeal: 2.0-3.5 mm)</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10.5px] bg-slate-950/80 p-2 rounded border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">Toplam Ham Genişlik:</span>
                    <b className="text-slate-200 font-mono">{activeSurface.totalRawW.toLocaleString()} px</b>
                    <span className="text-[9.5px] text-slate-500 block">({activeSurface.cols} × {activeSurface.projW})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Toplam Overlap:</span>
                    <b className="text-amber-400 font-mono">{activeSurface.totalOvW.toLocaleString()} px</b>
                    <span className="text-[9.5px] text-slate-500 block">({activeSurface.cols - 1} × {activeSurface.ovPxX} px)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Tek Overlap:</span>
                    <b className="text-sky-400 font-mono">{activeSurface.ovPxX} px</b>
                    <span className="text-[9.5px] text-slate-500 block">
                      (Dikey: {activeSurface.ovPxY} px)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SAĞ PANEL: BİRLEŞİK PIXEL MAP ÇİZİMİ VE PROJEKTÖR KOORDİNAT TABLOSU */}
        <div className="space-y-3 min-w-0 flex flex-col overflow-auto">
          {/* ÇİZİM KONTROL ÇUBUĞU */}
          <div className="p-2.5 rounded bg-slate-900 border border-slate-800 flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-semibold">Çizim Yerleşimi:</span>
              <button
                onClick={() => setLayoutMode('strip')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'strip' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Yan Yana Şerit (Panorama)
              </button>
              <button
                onClick={() => setLayoutMode('cross')}
                className={`px-2.5 py-1 rounded font-semibold ${layoutMode === 'cross' ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                Kutu Açılımı (Cross Unwrap)
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

            <div className="flex items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                <input type="checkbox" checked={showSlices} onChange={e => setShowSlices(e.target.checked)} />
                <span>Projektör Sınırlarını & Overlap Göster</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
                <span>Piksel Grid</span>
              </label>
            </div>
          </div>

          {/* Homojenlik Uyarısı */}
          {calculation.surfaces.length > 1 && calculation.densityMismatchPct > 15 && (
            <div className="p-2 rounded bg-amber-950/50 border border-amber-700/60 text-amber-300 text-[11px] flex justify-between items-center">
              <span>
                ⚠ Yüzeyler arası piksel yoğunluğu farkı <b>%{calculation.densityMismatchPct}</b> ({calculation.minMm} mm/px ile {calculation.maxMm} mm/px arası). İçerik geçişlerinde ölçek farkı oluşabilir.
              </span>
              <span className="text-[10px] text-amber-400 font-mono">İdeal: Tüm yüzeylerde yakın mm/px</span>
            </div>
          )}

          {/* CANLI İNTERAKTİF PIXEL MAP VEKTÖR ÇİZİM ALANI */}
          <div className="border border-slate-700 rounded bg-slate-950 p-3 flex-1 flex flex-col items-center justify-center min-h-[380px] relative">
            <div className="w-full flex justify-between items-center text-[11px] text-slate-400 mb-2 border-b border-slate-800 pb-1">
              <span>
                Canlı Pixel Map Şeması — Yüzeye tıklayarak düzenleyebilirsiniz
              </span>
              <span className="font-mono text-sky-400">
                Toplam Canvas: {calculation.totalCanvasW} × {calculation.totalCanvasH} px
              </span>
            </div>

            <div className="w-full flex-1 flex items-center justify-center overflow-auto p-2">
              {(() => {
                const padLeft = 90;
                const padTop = 70;
                const padRight = 90;
                const padBottom = 70;
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
                        28,
                        Math.min(baseFont * 1.15, Math.min(s.drawW, s.drawH) / 5.5)
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
                            fill={s.color + (isSel ? '38' : '20')}
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
                                stroke="rgba(250, 204, 21, 0.45)"
                                strokeWidth={Math.max(3, baseFont * 0.08)}
                                strokeDasharray={`${baseFont * 0.3} ${baseFont * 0.2}`}
                              />
                              <text
                                x={sx + sl.startX + surfFont * 0.4}
                                y={sy + sl.startY + surfFont * 0.9}
                                fill="rgba(250, 204, 21, 0.75)"
                                fontSize={surfFont * 0.55}
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                PJ{sl.index} ({sl.startX}-{sl.endX})
                              </text>
                            </g>
                          ))}

                          {/* Yüzey Üst/Sol Fiziksel & Piksel Ölçü Etiketleri */}
                          <text
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 - surfFont * 0.65}
                            fill="#f8fafc"
                            fontSize={surfFont}
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {s.name}
                          </text>

                          <text
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 + surfFont * 0.35}
                            fill="#4ade80"
                            fontSize={surfFont * 1.05}
                            fontWeight="bold"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {s.netW} × {s.netH} px
                          </text>

                          <text
                            x={sx + s.drawW / 2}
                            y={sy + s.drawH / 2 + surfFont * 1.3}
                            fill="#bae6fd"
                            fontSize={surfFont * 0.72}
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {s.widthM}m × {s.heightM}m · {s.cols}×{s.rows} PJ · ~{s.avgMmPerPx} mm/px
                          </text>

                          {/* Başlangıç Koordinatı (X, Y) */}
                          <text
                            x={sx + surfFont * 0.35}
                            y={sy + s.drawH - surfFont * 0.35}
                            fill="#94a3b8"
                            fontSize={surfFont * 0.55}
                            fontFamily="monospace"
                          >
                            ({s.posX}, {s.posY})
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* ALT TABLO: YÜZEY VE PROJEKTÖR KOORDİNAT LİSTESİ (WATCHOUT / RESOLUME İÇİN) */}
          <div className="grid xl:grid-cols-2 gap-3">
            {/* Tablo 1: Tüm Yüzeylerin Pixel Map Özeti */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800 overflow-auto">
              <div className="font-bold text-slate-200 mb-1.5 flex justify-between items-center">
                <span>Yüzey Pixel Map & Yoğunluk Tablosu</span>
                <span className="text-[10px] text-slate-400">Tüm Eklenen Alanlar</span>
              </div>
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1 pr-2">Yüzey</th>
                    <th className="py-1 pr-2">Ölçü (m)</th>
                    <th className="py-1 pr-2">PJ</th>
                    <th className="py-1 pr-2">Overlap</th>
                    <th className="py-1 pr-2">Net Pixel Map</th>
                    <th className="py-1 pr-2">Canvas (X,Y)</th>
                    <th className="py-1">Yoğunluk</th>
                  </tr>
                </thead>
                <tbody>
                  {calculation.surfaces.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`border-b border-slate-800/60 cursor-pointer ${s.id === activeSurface?.id ? 'bg-sky-950/40' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className="py-1 pr-2 font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </td>
                      <td className="py-1 pr-2 font-mono text-slate-300">{s.widthM}×{s.heightM}m</td>
                      <td className="py-1 pr-2 font-mono text-amber-300">{s.cols}×{s.rows}</td>
                      <td className="py-1 pr-2 font-mono text-slate-400">{s.ovPxX}px</td>
                      <td className="py-1 pr-2 font-mono font-bold text-emerald-400">{s.netW}×{s.netH}</td>
                      <td className="py-1 pr-2 font-mono text-sky-300">{s.posX}, {s.posY}</td>
                      <td className="py-1 font-mono text-slate-200">
                        ~{s.avgMmPerPx} mm <span className="text-slate-500">({s.ppi} PPI)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tablo 2: Seçili Yüzeyin Projektör Slice Koordinatları */}
            {activeSurface && (
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 overflow-auto max-h-[190px]">
                <div className="font-bold text-slate-200 mb-1.5 flex justify-between items-center">
                  <span>{activeSurface.name} — Projektör Koordinatları (Slice)</span>
                  <span className="text-[10px] text-sky-400 font-mono">Resolume / Watchout Input Map</span>
                </div>
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-1 pr-2">Projektör</th>
                      <th className="py-1 pr-2">Konum</th>
                      <th className="py-1 pr-2">Yüzey İçi X</th>
                      <th className="py-1 pr-2">Yüzey İçi Y</th>
                      <th className="py-1">Global Canvas (X, Y)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSurface.projSlices.map(sl => (
                      <tr key={sl.index} className="border-b border-slate-800/50">
                        <td className="py-1 pr-2 font-bold text-amber-400 font-mono">PJ {sl.index}</td>
                        <td className="py-1 pr-2 text-slate-400">Sütun {sl.col + 1}, Satır {sl.row + 1}</td>
                        <td className="py-1 pr-2 font-mono text-emerald-400">{sl.startX} → {sl.endX} px</td>
                        <td className="py-1 pr-2 font-mono text-emerald-400">{sl.startY} → {sl.endY} px</td>
                        <td className="py-1 font-mono text-sky-300">
                          X: {activeSurface.posX + sl.startX}..{activeSurface.posX + sl.endX} | Y: {activeSurface.posY + sl.startY}..{activeSurface.posY + sl.endY}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
