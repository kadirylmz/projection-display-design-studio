/**
 * Çoklu projektör düzeni (piksel uzayı, tamsayı).
 * Kanvas = sınırlayıcı kutu; çözünürlükler TOPLANMAZ, örtüşme çıkarılır:
 *   W_canvas = cols·w − (cols−1)·ox      H_canvas = rows·h − (rows−1)·oy
 * Yüzde → piksel dönüşümü: ox = round(pct/100 · w). Kullanılan gerçek yüzde ayrıca raporlanır.
 */
export interface Crop { l: number; r: number; t: number; b: number }

export interface Point2D { x: number; y: number }

export interface BezierPoint {
  x: number; y: number;
  cp1x: number; cp1y: number;
  cp2x: number; cp2y: number;
}

export interface WarpGrid {
  cols: number;
  rows: number;
  /** (cols+1)*(rows+1) uzunluğunda, projektör yerel piksel uzayında (0..w, 0..h) kontrol noktaları */
  points: Point2D[];
}

export type MappingSurfaceGeometry =
  | 'flat'
  | 'concave_arc'
  | 'convex_arc'
  | 'cylinder_360'
  | 'dome'
  | 'sphere'
  | 'circle_floor'
  | 'corner_l';

export interface KeystoneConfig {
  vDeg: number;
  hDeg: number;
  useOpticalShift?: boolean;
}

export interface ProjectorSlot {
  id: string;
  label: string;
  x: number; y: number;       // kanvas içindeki sol-üst piksel
  w: number; h: number;       // projektör çıkış çözünürlüğü
  output?: string;            // ör. "DP-1" veya "GPU-1 Out 1"
  physicalWidthM?: number;    // Fiziksel görüntü genişliği (metre)
  physicalHeightM?: number;   // Fiziksel görüntü yüksekliği (metre)
  crop?: Crop;                // maskelenen (kırpılan) piksel miktarları
  blend?: { l: number; r: number; t: number; b: number };
  polygonMask?: Point2D[];
  bezierMask?: BezierPoint[];
  warp?: WarpGrid;
  keystone?: KeystoneConfig;
  surfaceGeometry?: MappingSurfaceGeometry;
  surfaceRadiusM?: number;
  surfaceAngleDeg?: number;
}

/** Piksel yoğunluğu (PPI), piksel/metre (px/m) ve piksel boyutu (mm/px) hesabı */
export function calculatePixelDensity(wPx: number, hPx: number, wM?: number, hM?: number) {
  if (!wM || !hM || wM <= 0 || hM <= 0) return null;
  const diagPx = Math.hypot(wPx, hPx);
  const diagInches = (Math.hypot(wM, hM) * 1000) / 25.4;
  const ppi = diagPx / diagInches;
  const mmPerPxW = (wM * 1000) / wPx;
  const mmPerPxH = (hM * 1000) / hPx;
  const avgMmPerPx = (mmPerPxW + mmPerPxH) / 2;
  const pxPerMeterW = wPx / wM;
  const pxPerMeterH = hPx / hM;
  return {
    ppi: Math.round(ppi * 10) / 10,
    mmPerPxW: Math.round(mmPerPxW * 100) / 100,
    mmPerPxH: Math.round(mmPerPxH * 100) / 100,
    avgMmPerPx: Math.round(avgMmPerPx * 100) / 100,
    pxPerMeterW: Math.round(pxPerMeterW * 10) / 10,
    pxPerMeterH: Math.round(pxPerMeterH * 10) / 10,
    avgPxPerMeter: Math.round(((pxPerMeterW + pxPerMeterH) / 2) * 10) / 10,
    pxPerCm: Math.round((wPx / (wM * 100)) * 100) / 100,
    pxPerM2: Math.round((wPx * hPx) / (wM * hM)),
  };
}

/** Varsayılan düzgün (deforme olmamış) mesh warp ızgarası üretir. */
export function createUniformWarp(w: number, h: number, cols = 3, rows = 3): WarpGrid {
  if (cols < 1 || rows < 1 || !Number.isInteger(cols) || !Number.isInteger(rows)) {
    throw new RangeError('Warp ızgara sütun/satır sayısı pozitif tam sayı olmalı');
  }
  const points: Point2D[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      points.push({ x: Math.round((c / cols) * w), y: Math.round((r / rows) * h) });
    }
  }
  return { cols, rows, points };
}

/** Varsayılan eliptik/yumuşak köşeli 4 noktalı kapalı Bezier maskesi üretir. */
export function createDefaultBezierMask(w: number, h: number, marginRatio = 0.08): BezierPoint[] {
  const mx = Math.round(w * marginRatio), my = Math.round(h * marginRatio);
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  const kx = Math.round((w / 2 - mx) * 0.55), ky = Math.round((h / 2 - my) * 0.55);
  return [
    { x: cx, y: my, cp1x: cx - kx, cp1y: my, cp2x: cx + kx, cp2y: my },
    { x: w - mx, y: cy, cp1x: w - mx, cp1y: cy - ky, cp2x: w - mx, cp2y: cy + ky },
    { x: cx, y: h - my, cp1x: cx + kx, cp1y: h - my, cp2x: cx - kx, cp2y: h - my },
    { x: mx, y: cy, cp1x: mx, cp1y: cy + ky, cp2x: mx, cp2y: cy - ky },
  ];
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface OverlapRegion extends Rect { a: string; b: string }

export interface LayoutResult {
  slots: ProjectorSlot[];     // origin normalize edilmiş
  canvasW: number; canvasH: number;
  naiveW: number; naiveH: number;     // yalnızca karşılaştırma için: çözünürlük toplamı (YANLIŞ değer, kullanma)
  overlaps: OverlapRegion[];
  active: Record<string, Rect>;       // projektörün kanvas üzerindeki aktif (kırpma sonrası) bölgesi
  warnings: string[];
}

export function pctToPx(pct: number, size: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) throw new RangeError('Örtüşme yüzdesi [0,100) olmalı');
  return Math.round(pct / 100 * size);
}

export function gridLayout(opts: {
  cols: number; rows: number; w: number; h: number; overlapX: number; overlapY: number; // piksel
  outputs?: string[];
}): ProjectorSlot[] {
  const { cols, rows, w, h, overlapX: ox, overlapY: oy } = opts;
  for (const [n, v] of [['cols', cols], ['rows', rows], ['w', w], ['h', h]] as const)
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${n} pozitif tam sayı olmalı`);
  if (!Number.isInteger(ox) || !Number.isInteger(oy) || ox < 0 || oy < 0) throw new RangeError('Örtüşme negatif olmayan tam sayı piksel olmalı');
  if (ox >= w || oy >= h) throw new RangeError('Örtüşme projektör çözünürlüğünden küçük olmalı');
  if (cols > 1 && 2 * ox > w) throw new RangeError('Yatay örtüşme, projektör genişliğinin yarısını aşamaz (harman bölgeleri çakışır)');
  if (rows > 1 && 2 * oy > h) throw new RangeError('Dikey örtüşme, projektör yüksekliğinin yarısını aşamaz');
  const slots: ProjectorSlot[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      slots.push({
        id: `P${i + 1}`, label: `Projektör ${i + 1}`,
        x: c * (w - ox), y: r * (h - oy), w, h,
        output: opts.outputs?.[i],
        blend: { l: c > 0 ? ox : 0, r: c < cols - 1 ? ox : 0, t: r > 0 ? oy : 0, b: r < rows - 1 ? oy : 0 },
      });
    }
  return slots;
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

export function computeLayout(input: ProjectorSlot[]): LayoutResult {
  if (!input.length) throw new RangeError('En az bir projektör gerekli');
  const ids = new Set<string>();
  for (const s of input) {
    if (ids.has(s.id)) throw new RangeError(`Yinelenen projektör kimliği: ${s.id}`);
    ids.add(s.id);
    if (!Number.isInteger(s.w) || !Number.isInteger(s.h) || s.w < 1 || s.h < 1) throw new RangeError(`${s.id}: çözünürlük pozitif tam sayı olmalı`);
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) throw new RangeError(`${s.id}: konum tam sayı piksel olmalı`);
    const c = s.crop;
    if (c && (c.l < 0 || c.r < 0 || c.t < 0 || c.b < 0 || c.l + c.r >= s.w || c.t + c.b >= s.h))
      throw new RangeError(`${s.id}: geçersiz kırpma`);
  }
  const minX = Math.min(...input.map(s => s.x)), minY = Math.min(...input.map(s => s.y));
  const slots = input.map(s => ({ ...s, x: s.x - minX, y: s.y - minY }));
  const canvasW = Math.max(...slots.map(s => s.x + s.w));
  const canvasH = Math.max(...slots.map(s => s.y + s.h));
  const overlaps: OverlapRegion[] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const r = intersect(slots[i], slots[j]);
      if (r) overlaps.push({ ...r, a: slots[i].id, b: slots[j].id });
    }
  const active: Record<string, Rect> = {};
  for (const s of slots) {
    const c = s.crop ?? { l: 0, r: 0, t: 0, b: 0 };
    active[s.id] = { x: s.x + c.l, y: s.y + c.t, w: s.w - c.l - c.r, h: s.h - c.t - c.b };
  }
  // Kapsanmayan (boş) kanvas alanı uyarısı: piksel alanı karşılaştırması
  const warnings: string[] = [];
  let covered = 0;
  const rects = Object.values(active);
  // kapsanan alan = birleşim alanı (sıkıştırılmış koordinat taraması)
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++)
      if (rects.some(r => r.x <= xs[i] && r.x + r.w >= xs[i + 1] && r.y <= ys[j] && r.y + r.h >= ys[j + 1]))
        covered += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  if (covered < canvasW * canvasH) warnings.push(`Kanvasın ${canvasW * canvasH - covered} pikseli hiçbir projektör tarafından kapsanmıyor (boşluk).`);
  return {
    slots, canvasW, canvasH,
    naiveW: input.reduce((a, s) => a + s.w, 0), naiveH: input.reduce((a, s) => a + s.h, 0),
    overlaps, active, warnings,
  };
}

/** Harman eğrisi: gelen projektör için ışık-lineer ağırlık t, sürüş değeri = t^(1/gamma). */
export function blendDrive(t: number, gamma: number): number {
  if (t < 0 || t > 1) throw new RangeError('t [0,1] olmalı');
  if (gamma <= 0) throw new RangeError('gamma > 0 olmalı');
  return Math.pow(t, 1 / gamma);
}

/** Projektör içinde, x konumu (projektör yerel pikseli) için yatay harman sürüş çarpanı. */
export function horizontalBlendAt(s: ProjectorSlot, px: number, gamma: number): number {
  const b = s.blend ?? { l: 0, r: 0, t: 0, b: 0 };
  let v = 1;
  if (b.l > 0 && px < b.l) v = Math.min(v, blendDrive((px + 0.5) / b.l, gamma));
  if (b.r > 0 && px >= s.w - b.r) v = Math.min(v, blendDrive((s.w - px - 0.5) / b.r, gamma));
  return v;
}

export interface PixelMapSummaryResult {
  nativeW: number;
  nativeH: number;
  nativeMP: number;
  projectorCount: number;
  rawTotalW: number;
  rawTotalH: number;
  rawTotalPixels: number;
  combinedW: number;
  combinedH: number;
  combinedPixels: number;
  combinedMP: number;
  lostPxW: number;
  lostPxH: number;
  lostOverlapPixels: number;
  lostOverlapPct: number;
  wallWidthM: number | null;
  wallHeightM: number | null;
  pxPerMeterW: number | null;
  pxPerMeterH: number | null;
  avgPxPerMeter: number | null;
  mmPerPxW: number | null;
  mmPerPxH: number | null;
  avgMmPerPx: number | null;
  ppi: number | null;
  pxPerCm: number | null;
  pxPerM2: number | null;
  wallAspectPixelsW: number | null;
  wallAspectPixelsH: number | null;
  lostWidthM: number | null;
  lostAreaM2: number | null;
  contentProductionW: number;
  contentProductionH: number;
  contentProductionMP: number;
  contentAspect: number;
}

/** 8 Kalemli Pixel Map & Çözünürlük Özet Hesabı */
export function computePixelMapSummary(opts: {
  slots: ProjectorSlot[];
  wallWidthM?: number;
  wallHeightM?: number;
  contentW?: number;
  contentH?: number;
}): PixelMapSummaryResult {
  const { slots } = opts;
  const layout = computeLayout(slots);
  const first = slots[0];
  const nativeW = first.w;
  const nativeH = first.h;
  const nativeMP = Math.round(((nativeW * nativeH) / 1_000_000) * 100) / 100;

  // Benzersiz satır/sütun yerine toplam ham projektör pikseli ve sınırlayıcı kanvas karşılaştırması
  const rawTotalPixels = slots.reduce((s, p) => s + p.w * p.h, 0);
  // Eğer ağırlıklı yatay/dikey dizilim varsa ham W/H tahmini:
  const sumW = slots.reduce((s, p) => s + p.w, 0);
  const sumH = slots.reduce((s, p) => s + p.h, 0);
  const hasHorizontalSpread = layout.canvasW > first.w || slots.length === 1;
  const hasVerticalSpread = layout.canvasH > first.h;
  const rawTotalW = hasHorizontalSpread ? sumW : first.w;
  const rawTotalH = hasVerticalSpread ? sumH : first.h;

  const combinedW = layout.canvasW;
  const combinedH = layout.canvasH;
  const combinedPixels = combinedW * combinedH;
  const combinedMP = Math.round((combinedPixels / 1_000_000) * 100) / 100;

  const lostPxW = Math.max(0, rawTotalW - combinedW);
  const lostPxH = Math.max(0, rawTotalH - combinedH);
  const overlapAreaSum = layout.overlaps.reduce((s, o) => s + o.w * o.h, 0);
  const lostOverlapPixels = Math.max(overlapAreaSum, Math.max(0, rawTotalPixels - combinedPixels));
  const lostOverlapPct = rawTotalPixels > 0
    ? Math.round((lostOverlapPixels / rawTotalPixels) * 1000) / 10
    : 0;

  // Fiziksel duvar ölçüsü (parametre verilmişse onu kullan, yoksa slotlardan topla)
  const slotPhysWidths = slots.map(p => p.physicalWidthM).filter((v): v is number => typeof v === 'number' && v > 0);
  const slotPhysHeights = slots.map(p => p.physicalHeightM).filter((v): v is number => typeof v === 'number' && v > 0);
  const wallWidthM = opts.wallWidthM && opts.wallWidthM > 0
    ? opts.wallWidthM
    : (slotPhysWidths.length === slots.length && slotPhysWidths.length > 0
        ? Math.round((slotPhysWidths.reduce((a, b) => a + b, 0) * (combinedW / Math.max(1, rawTotalW))) * 100) / 100
        : null);
  const wallHeightM = opts.wallHeightM && opts.wallHeightM > 0
    ? opts.wallHeightM
    : (slotPhysHeights.length > 0
        ? Math.round((Math.max(...slotPhysHeights) * (combinedH / Math.max(1, first.h))) * 100) / 100
        : null);

  const dens = wallWidthM && wallHeightM
    ? calculatePixelDensity(combinedW, combinedH, wallWidthM, wallHeightM)
    : null;

  const wallAspectPixelsH = wallWidthM && wallHeightM ? combinedH : null;
  const wallAspectPixelsW = wallWidthM && wallHeightM
    ? Math.round(combinedH * (wallWidthM / wallHeightM))
    : null;

  const lostWidthM = wallWidthM
    ? Math.round((wallWidthM * (lostPxW / Math.max(1, rawTotalW))) * 100) / 100
    : null;
  const lostAreaM2 = wallWidthM && wallHeightM
    ? Math.round(((wallWidthM * wallHeightM) * (lostOverlapPct / 100)) * 100) / 100
    : null;

  const contentProductionW = opts.contentW && opts.contentW > 0 ? Math.round(opts.contentW) : combinedW;
  const contentProductionH = opts.contentH && opts.contentH > 0 ? Math.round(opts.contentH) : combinedH;
  const contentProductionMP = Math.round(((contentProductionW * contentProductionH) / 1_000_000) * 100) / 100;
  const contentAspect = Math.round((contentProductionW / Math.max(1, contentProductionH)) * 100) / 100;

  return {
    nativeW,
    nativeH,
    nativeMP,
    projectorCount: slots.length,
    rawTotalW,
    rawTotalH,
    rawTotalPixels,
    combinedW,
    combinedH,
    combinedPixels,
    combinedMP,
    lostPxW,
    lostPxH,
    lostOverlapPixels,
    lostOverlapPct,
    wallWidthM,
    wallHeightM,
    pxPerMeterW: dens?.pxPerMeterW ?? null,
    pxPerMeterH: dens?.pxPerMeterH ?? null,
    avgPxPerMeter: dens?.avgPxPerMeter ?? null,
    mmPerPxW: dens?.mmPerPxW ?? null,
    mmPerPxH: dens?.mmPerPxH ?? null,
    avgMmPerPx: dens?.avgMmPerPx ?? null,
    ppi: dens?.ppi ?? null,
    pxPerCm: dens?.pxPerCm ?? null,
    pxPerM2: dens?.pxPerM2 ?? null,
    wallAspectPixelsW,
    wallAspectPixelsH,
    lostWidthM,
    lostAreaM2,
    contentProductionW,
    contentProductionH,
    contentProductionMP,
    contentAspect,
  };
}

/** İçbükey/dışbükey kavisli veya keystone şekilli mesh warp ızgarası üretir. */
export function createCurvedWarp(
  w: number,
  h: number,
  cols = 4,
  rows = 4,
  bendPct = 12,
  mode: 'concave' | 'convex' | 'keystone' = 'concave',
): WarpGrid {
  const base = createUniformWarp(w, h, cols, rows);
  const k = Math.max(-0.45, Math.min(0.45, bendPct / 100));
  const points = base.points.map((pt, idx) => {
    const r = Math.floor(idx / (cols + 1));
    const c = idx % (cols + 1);
    const u = c / cols;        // 0..1
    const v = r / rows;        // 0..1
    const uCentered = (u - 0.5) * 2; // -1..1
    const vCentered = (v - 0.5) * 2; // -1..1
    if (mode === 'keystone') {
      // Üst kenarı daraltan veya genişleten trapez warp
      const shrink = (1 - v) * k * (w * 0.5);
      return {
        x: Math.round(pt.x - uCentered * shrink),
        y: Math.round(pt.y),
      };
    }
    // İçbükey (kenarlarda dışa, ortada içe) veya Dışbükey (ortada dışa) parabolik eğri
    const edgeWeightY = 1 - uCentered * uCentered; // ortada 1, kenarda 0
    const sign = mode === 'concave' ? 1 : -1;
    const dy = sign * k * h * edgeWeightY * (-vCentered);
    return {
      x: Math.round(pt.x),
      y: Math.max(0, Math.min(h, Math.round(pt.y + dy))),
    };
  });
  return { cols, rows, points };
}

/** Shoelace formülü ile kapalı poligon alanı (px²). */
export function polygonAreaPx(pts: Point2D[]): number {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

function bezierMaskAreaPx(bm: BezierPoint[]): number {
  if (!bm || bm.length < 2) return 0;
  const sampled: Point2D[] = [];
  const steps = 12;
  for (let k = 0; k < bm.length; k++) {
    const p0 = bm[k];
    const p3 = bm[(k + 1) % bm.length];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p0.cp2x +
        3 * mt * t * t * p3.cp1x +
        t * t * t * p3.x;
      const y =
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p0.cp2y +
        3 * mt * t * t * p3.cp1y +
        t * t * t * p3.y;
      sampled.push({ x, y });
    }
  }
  return polygonAreaPx(sampled);
}

const SURFACE_GEOM_LABELS: Record<MappingSurfaceGeometry, string> = {
  flat: 'Düz Yüzey (Planar)',
  concave_arc: 'İçbükey Kavis (Concave Arc)',
  convex_arc: 'Dışbükey Kavis (Convex Arc)',
  cylinder_360: '360° Silindirik Kabuk',
  dome: 'Kubbe / Fulldome',
  sphere: 'Tam Küre (360°×180°)',
  circle_floor: 'Dairesel Zemin',
  corner_l: 'Çoklu Köşe / L-Duvar',
};

export interface GeometricMappingSummaryResult {
  // 1. Keystone Düzeltmesi
  maxKeystoneVDeg: number;
  maxKeystoneHDeg: number;
  trapezoidShrinkPct: number;
  keystonePixelLossPct: number;
  opticalShiftActive: boolean;
  // 2. Warp / Mesh Mapping
  activeWarpSlots: number;
  meshCols: number;
  meshRows: number;
  totalControlPoints: number;
  meshGridLabel: string;
  avgWarpDisplacementPx: number;
  warpPixelLossPct: number;
  // 3. Surface Mapping
  surfaceGeometry: MappingSurfaceGeometry;
  surfaceGeometryLabel: string;
  effectiveWidthM: number;
  effectiveHeightM: number;
  chordWidthM: number;
  sagittaM: number;
  arcToChordRatio: number;
  // 4. Masking
  croppedPixels: number;
  polygonMaskCount: number;
  bezierMaskCount: number;
  circularMaskActive: boolean;
  maskedOutPixels: number;
  maskedOutPct: number;
  visibleActivePixels: number;
  visibleActivePct: number;
  // 5. Edge Blending
  overlapZoneCount: number;
  blendWidthPxX: number;
  blendWidthPxY: number;
  blendPhysicalWidthM: number;
  gamma: number;
  midpointDrivePct: number;
  blendAreaPct: number;
  // 6. Geometrik Bozulma Analizi
  pixelAnisotropyRatio: number;
  pixelStretchPct: number;
  cornerStretchPct: number;
  depthOfFieldSpreadM: number;
  distortionSeverity: 'low' | 'moderate' | 'high';
  distortionLabel: string;
  // 7. Birden Fazla Yüzeyin Eşleştirilmesi
  totalSurfacesCount: number;
  matchedSurfacesCount: number;
  densitySpreadPct: number;
  seamTransitionCount: number;
  multiSurfaceStatus: string;
  // 8. Toplam / Nihai Özet
  geometricEfficiencyPct: number;
  totalGeometricLossPct: number;
  effectiveUsablePixels: number;
  effectiveUsableMP: number;
  effectiveResolutionW: number;
  effectiveResolutionH: number;
  qualityGrade: string;
}

/** 7 Adımlı Geometrik Düzeltme & Mapping Hesap Zinciri */
export function computeGeometricMappingSummary(opts: {
  slots: ProjectorSlot[];
  wallWidthM?: number;
  wallHeightM?: number;
  gamma?: number;
  surfaceGeometry?: MappingSurfaceGeometry;
  radiusM?: number;
  angleDeg?: number;
  chordWidthM?: number;
  sagittaM?: number;
  throwDistM?: number;
  mmPerPxW?: number;
  mmPerPxH?: number;
  otherSurfaceMmPerPx?: number[];
  keystoneVDeg?: number;
  keystoneHDeg?: number;
  useOpticalShift?: boolean;
  isCircularMask?: boolean;
  seamTransitionCount?: number;
}): GeometricMappingSummaryResult {
  const { slots } = opts;
  const layout = computeLayout(slots);
  const pm = computePixelMapSummary({
    slots,
    wallWidthM: opts.wallWidthM,
    wallHeightM: opts.wallHeightM,
  });

  // 1. Keystone Düzeltmesi
  const slotMaxV = slots.reduce((m, s) => Math.max(m, Math.abs(s.keystone?.vDeg ?? 0)), 0);
  const slotMaxH = slots.reduce((m, s) => Math.max(m, Math.abs(s.keystone?.hDeg ?? 0)), 0);
  const maxKeystoneVDeg = Math.round(Math.max(Math.abs(opts.keystoneVDeg ?? 0), slotMaxV) * 10) / 10;
  const maxKeystoneHDeg = Math.round(Math.max(Math.abs(opts.keystoneHDeg ?? 0), slotMaxH) * 10) / 10;
  const opticalShiftActive = Boolean(opts.useOpticalShift ?? slots.some(s => s.keystone?.useOpticalShift));
  const totalTiltDeg = Math.hypot(maxKeystoneVDeg, maxKeystoneHDeg);
  const trapezoidShrinkPct = totalTiltDeg > 0
    ? Math.round(Math.min(60, Math.sin((Math.min(75, totalTiltDeg) * Math.PI) / 180) * 55) * 10) / 10
    : 0;
  const keystonePixelLossPct = opticalShiftActive
    ? 0
    : Math.round(Math.min(60, trapezoidShrinkPct * 0.85) * 10) / 10;

  // 3. Surface Mapping (Warp ve bozulma hesabında da kullanıldığı için önden çözülür)
  const surfaceGeometry: MappingSurfaceGeometry =
    opts.surfaceGeometry ?? slots.find(s => s.surfaceGeometry)?.surfaceGeometry ?? 'flat';
  const surfaceGeometryLabel = SURFACE_GEOM_LABELS[surfaceGeometry] ?? 'Düz Yüzey (Planar)';
  const effectiveWidthM = opts.wallWidthM && opts.wallWidthM > 0
    ? opts.wallWidthM
    : (pm.wallWidthM ?? Math.round((pm.combinedW / 200) * 100) / 100);
  const effectiveHeightM = opts.wallHeightM && opts.wallHeightM > 0
    ? opts.wallHeightM
    : (pm.wallHeightM ?? Math.round((pm.combinedH / 200) * 100) / 100);

  const radiusM = opts.radiusM ?? slots.find(s => s.surfaceRadiusM && s.surfaceRadiusM > 0)?.surfaceRadiusM ?? 0;
  const angleDeg = opts.angleDeg ?? slots.find(s => s.surfaceAngleDeg && s.surfaceAngleDeg > 0)?.surfaceAngleDeg ?? 0;

  let chordWidthM = opts.chordWidthM ?? effectiveWidthM;
  let sagittaM = opts.sagittaM ?? 0;
  if (opts.chordWidthM === undefined && (surfaceGeometry === 'concave_arc' || surfaceGeometry === 'convex_arc') && radiusM > 0 && angleDeg > 0) {
    const rad = (angleDeg * Math.PI) / 180;
    chordWidthM = Math.round(2 * radiusM * Math.sin(rad / 2) * 100) / 100;
    if (opts.sagittaM === undefined) {
      sagittaM = Math.round(radiusM * (1 - Math.cos(rad / 2)) * 100) / 100;
    }
  } else if (opts.chordWidthM === undefined && surfaceGeometry === 'cylinder_360' && radiusM > 0) {
    chordWidthM = Math.round(2 * radiusM * 100) / 100;
    if (opts.sagittaM === undefined) sagittaM = Math.round(radiusM * 100) / 100;
  } else if (opts.sagittaM === undefined && surfaceGeometry === 'dome' && radiusM > 0) {
    sagittaM = Math.round(radiusM * 100) / 100;
  }
  const arcToChordRatio = chordWidthM > 0 ? Math.round((effectiveWidthM / chordWidthM) * 1000) / 1000 : 1;

  // 2. Warp / Mesh Mapping
  const warpSlots = slots.filter(s => s.warp && s.warp.points.length === (s.warp.cols + 1) * (s.warp.rows + 1));
  const activeWarpSlots = warpSlots.length;
  const firstWarp = warpSlots[0]?.warp;
  const meshCols = firstWarp?.cols ?? 0;
  const meshRows = firstWarp?.rows ?? 0;
  const totalControlPoints = warpSlots.reduce((acc, s) => acc + (s.warp?.points.length ?? 0), 0);
  const meshGridLabel = firstWarp ? `${meshCols}×${meshRows} (${totalControlPoints} nokta)` : 'Düz (Warp Yok)';

  let dispSum = 0;
  let dispCount = 0;
  for (const s of warpSlots) {
    const wGrid = s.warp!;
    for (let idx = 0; idx < wGrid.points.length; idx++) {
      const r = Math.floor(idx / (wGrid.cols + 1));
      const c = idx % (wGrid.cols + 1);
      const ux = (c / wGrid.cols) * s.w;
      const uy = (r / wGrid.rows) * s.h;
      const p = wGrid.points[idx];
      dispSum += Math.hypot(p.x - ux, p.y - uy);
      dispCount++;
    }
  }
  const avgWarpDisplacementPx = dispCount > 0 ? Math.round((dispSum / dispCount) * 10) / 10 : 0;
  const avgSlotW = slots.reduce((a, s) => a + s.w, 0) / Math.max(1, slots.length);
  const dispLossPct = avgWarpDisplacementPx > 0 ? Math.min(25, (avgWarpDisplacementPx / Math.max(1, avgSlotW)) * 120) : 0;
  const curveWarpLossPct = sagittaM > 0 ? Math.min(18, (sagittaM / Math.max(0.2, effectiveWidthM)) * 42) : 0;
  const warpPixelLossPct = Math.round(Math.min(35, Math.max(dispLossPct, curveWarpLossPct)) * 10) / 10;

  // 4. Masking
  const totalSlotRawPixels = slots.reduce((sum, s) => sum + s.w * s.h, 0);
  let croppedPixels = 0;
  let polygonMaskCount = 0;
  let bezierMaskCount = 0;
  let polyBezierLossPx = 0;

  for (const s of slots) {
    const rawA = s.w * s.h;
    const c = s.crop;
    const activeRectArea = c
      ? Math.max(0, (s.w - c.l - c.r) * (s.h - c.t - c.b))
      : rawA;
    croppedPixels += Math.max(0, rawA - activeRectArea);

    let keptArea = activeRectArea;
    if (s.polygonMask && s.polygonMask.length >= 3) {
      polygonMaskCount++;
      keptArea = Math.min(keptArea, polygonAreaPx(s.polygonMask));
    }
    if (s.bezierMask && s.bezierMask.length >= 2) {
      bezierMaskCount++;
      keptArea = Math.min(keptArea, bezierMaskAreaPx(s.bezierMask));
    }
    polyBezierLossPx += Math.max(0, activeRectArea - keptArea);
  }

  const circularMaskActive = Boolean(
    opts.isCircularMask || surfaceGeometry === 'dome' || surfaceGeometry === 'circle_floor',
  );
  let circularLossPx = 0;
  if (circularMaskActive && polygonMaskCount === 0 && bezierMaskCount === 0) {
    // Kare/dikdörtgen çerçeve içindeki elips/daire alanı: π/4 ≈ 78.54% görünür, %21.46 maskelenir
    circularLossPx = Math.round((totalSlotRawPixels - croppedPixels) * (1 - Math.PI / 4));
  }

  const maskedOutPixels = Math.min(
    totalSlotRawPixels,
    Math.round(croppedPixels + polyBezierLossPx + circularLossPx),
  );
  const maskedOutPct = totalSlotRawPixels > 0
    ? Math.round((maskedOutPixels / totalSlotRawPixels) * 1000) / 10
    : 0;
  const visibleActivePct = Math.round((100 - maskedOutPct) * 10) / 10;
  const visibleActivePixels = Math.max(0, Math.round(pm.combinedPixels * (visibleActivePct / 100)));

  // 5. Edge Blending
  const overlapZoneCount = layout.overlaps.length;
  const blendWidthPxX = Math.max(0, ...slots.map(s => Math.max(s.blend?.l ?? 0, s.blend?.r ?? 0)));
  const blendWidthPxY = Math.max(0, ...slots.map(s => Math.max(s.blend?.t ?? 0, s.blend?.b ?? 0)));
  const blendPhysicalWidthM = effectiveWidthM > 0 && pm.combinedW > 0
    ? Math.round((blendWidthPxX * (effectiveWidthM / pm.combinedW)) * 100) / 100
    : 0;
  const gamma = opts.gamma && opts.gamma > 0 ? opts.gamma : 2.2;
  const midpointDrivePct = Math.round(blendDrive(0.5, gamma) * 1000) / 10;
  const overlapAreaPx = layout.overlaps.reduce((a, o) => a + o.w * o.h, 0);
  const blendAreaPct = pm.combinedPixels > 0
    ? Math.round((overlapAreaPx / pm.combinedPixels) * 1000) / 10
    : 0;

  // 6. Geometrik Bozulma Analizi
  const mmW = opts.mmPerPxW && opts.mmPerPxW > 0 ? opts.mmPerPxW : (pm.mmPerPxW ?? 2.0);
  const mmH = opts.mmPerPxH && opts.mmPerPxH > 0 ? opts.mmPerPxH : (pm.mmPerPxH ?? mmW);
  const pixelAnisotropyRatio = mmH > 0 && mmW > 0
    ? Math.round((Math.max(mmW, mmH) / Math.min(mmW, mmH)) * 1000) / 1000
    : 1;
  const pixelStretchPct = Math.round(Math.max(0, (pixelAnisotropyRatio - 1) * 100) * 10) / 10;
  const cornerStretchPct = Math.round(
    Math.min(85, trapezoidShrinkPct * 0.75 + warpPixelLossPct * 0.9 + pixelStretchPct * 0.5) * 10,
  ) / 10;
  const depthOfFieldSpreadM = Math.round(
    (
      sagittaM +
      Math.sin((Math.min(60, maxKeystoneVDeg) * Math.PI) / 180) * (effectiveHeightM / 2) +
      Math.sin((Math.min(60, maxKeystoneHDeg) * Math.PI) / 180) * (effectiveWidthM / 2)
    ) * 100,
  ) / 100;

  let distortionSeverity: 'low' | 'moderate' | 'high' = 'low';
  let distortionLabel = 'Düşük / İdeal Geometri';
  if (cornerStretchPct >= 20 || pixelStretchPct >= 15 || depthOfFieldSpreadM >= 1.0) {
    distortionSeverity = 'high';
    distortionLabel = 'Yüksek Bozulma (Optik Müdahale Önerilir)';
  } else if (cornerStretchPct >= 8 || pixelStretchPct >= 5 || depthOfFieldSpreadM >= 0.35) {
    distortionSeverity = 'moderate';
    distortionLabel = 'Orta Düzey (Warp & Blend ile Dengelenebilir)';
  }

  // 7. Birden Fazla Yüzeyin Eşleştirilmesi
  const baseAvgMm = (mmW + mmH) / 2;
  const otherValidMm = (opts.otherSurfaceMmPerPx ?? []).filter(v => Number.isFinite(v) && v > 0);
  const allMm = [baseAvgMm, ...otherValidMm];
  const totalSurfacesCount = allMm.length;
  let densitySpreadPct = 0;
  let matchedSurfacesCount = 1;
  if (totalSurfacesCount > 1) {
    const minMm = Math.min(...allMm);
    const maxMm = Math.max(...allMm);
    densitySpreadPct = Math.round(((maxMm - minMm) / Math.max(0.01, minMm)) * 1000) / 10;
    matchedSurfacesCount = allMm.filter(v => Math.abs(v - baseAvgMm) / Math.max(0.01, baseAvgMm) <= 0.1).length;
  }
  const seamTransitionCount = opts.seamTransitionCount ?? Math.max(0, totalSurfacesCount - 1);
  let multiSurfaceStatus = 'Tek Yüzey (Bağımsız)';
  if (totalSurfacesCount > 1) {
    if (densitySpreadPct <= 10) multiSurfaceStatus = 'Tam Eşleşmiş (≤%10 Sapma)';
    else if (densitySpreadPct <= 25) multiSurfaceStatus = 'Kabul Edilebilir (%10–25 Sapma)';
    else multiSurfaceStatus = 'Kalibrasyon Gerekli (>%25 Fark)';
  }

  // 8. TOPLAM GEOMETRİK MAPPING & EFEKTİF ÇÖZÜNÜRLÜK ÖZETİ
  const effFactor =
    (1 - keystonePixelLossPct / 100) *
    (1 - warpPixelLossPct / 100) *
    (1 - maskedOutPct / 100);
  const geometricEfficiencyPct = Math.round(Math.max(0, effFactor) * 1000) / 10;
  const totalGeometricLossPct = Math.round((100 - geometricEfficiencyPct) * 10) / 10;
  const effectiveUsablePixels = Math.max(0, Math.round(pm.combinedPixels * Math.max(0, effFactor)));
  const effectiveUsableMP = Math.round((effectiveUsablePixels / 1_000_000) * 100) / 100;
  const linearFactor = Math.sqrt(Math.max(0.01, effFactor));
  const effectiveResolutionW = Math.max(1, Math.round(pm.combinedW * linearFactor));
  const effectiveResolutionH = Math.max(1, Math.round(pm.combinedH * linearFactor));

  let qualityGrade = 'D (Yüksek Piksel Kaybı)';
  if (geometricEfficiencyPct >= 88 && distortionSeverity === 'low') {
    qualityGrade = 'A+ (Referans Kalite)';
  } else if (geometricEfficiencyPct >= 75 && distortionSeverity !== 'high') {
    qualityGrade = 'A / B (Profesyonel Uygun)';
  } else if (geometricEfficiencyPct >= 60) {
    qualityGrade = 'C (Kabul Edilebilir — Optimizasyon Önerilir)';
  }

  return {
    maxKeystoneVDeg,
    maxKeystoneHDeg,
    trapezoidShrinkPct,
    keystonePixelLossPct,
    opticalShiftActive,
    activeWarpSlots,
    meshCols,
    meshRows,
    totalControlPoints,
    meshGridLabel,
    avgWarpDisplacementPx,
    warpPixelLossPct,
    surfaceGeometry,
    surfaceGeometryLabel,
    effectiveWidthM,
    effectiveHeightM,
    chordWidthM,
    sagittaM,
    arcToChordRatio,
    croppedPixels,
    polygonMaskCount,
    bezierMaskCount,
    circularMaskActive,
    maskedOutPixels,
    maskedOutPct,
    visibleActivePixels,
    visibleActivePct,
    overlapZoneCount,
    blendWidthPxX,
    blendWidthPxY,
    blendPhysicalWidthM,
    gamma,
    midpointDrivePct,
    blendAreaPct,
    pixelAnisotropyRatio,
    pixelStretchPct,
    cornerStretchPct,
    depthOfFieldSpreadM,
    distortionSeverity,
    distortionLabel,
    totalSurfacesCount,
    matchedSurfacesCount,
    densitySpreadPct,
    seamTransitionCount,
    multiSurfaceStatus,
    geometricEfficiencyPct,
    totalGeometricLossPct,
    effectiveUsablePixels,
    effectiveUsableMP,
    effectiveResolutionW,
    effectiveResolutionH,
    qualityGrade,
  };
}
