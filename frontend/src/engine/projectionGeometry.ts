/**
 * Merkezi Projeksiyon Geometrisi & Fotometri Kaynak Modeli (Rev.1)
 *
 * - Projektör ayak izi poligonları (eksen hizalı dikdörtgenler) ve TÜM kesişimleri
 *   (komşu olmayan PJ1∩PJ3 dahil, üçlü/çoklu overlap) → inclusion–exclusion + doğrudan
 *   geometrik birleşim (elementer hücre süpürmesi) ile çift doğrulama.
 * - Tek kanvas geometrisinden içerik kanvası & piksel yoğunluğu (H/V px/m, mm/px, px/m², MP).
 * - Teorik / Simüle LuxField / Ölçülen aydınlık kayıtlarının ayrıştırılması ve kaynak etiketli nit/ACR.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const EPS = 1e-9;

// ─────────────────────────────── 1. Ayak izi & çoklu overlap ───────────────────────────────

export interface ProjectorFootprint {
  projectorId: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface FootprintIntersection {
  projectorIds: string[];
  multiplicity: number;
  adjacent: boolean;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  widthM: number;
  heightM: number;
  areaM2: number;
  /** Fiziksel duvar sınırları içinde kırpılmış genişlik (m) */
  clippedWidthM?: number;
  /** Fiziksel duvar sınırları içinde kırpılmış yükseklik (m) */
  clippedHeightM?: number;
  /** Fiziksel duvar sınırları içinde kırpılmış kesişim alanı (m²) */
  clippedAreaM2?: number;
}

export interface FootprintOverlapAnalysis {
  footprints: ProjectorFootprint[];
  /** Tüm i<j çiftleri (komşu olmayanlar dahil) */
  pairwiseIntersections: FootprintIntersection[];
  /** 3 ve daha fazla projektörün ortak kesişimleri */
  higherOrderIntersections: FootprintIntersection[];
  maxMultiplicity: number;
  hasNonAdjacentOverlap: boolean;
  /** Projeksiyon düzleminde tam olarak k projektörün aydınlattığı alan (m²) */
  multiplicityAreasM2: Record<number, number>;
  /** Hedef yüzey içinde tam olarak k projektörün aydınlattığı alan (m²); 0 = kaplanmayan */
  surfaceMultiplicityAreasM2: Record<number, number>;
  sumFootprintAreaM2: number;
  unionAreaM2: number;
  unionAreaInclusionExclusionM2: number | null;
  /** Σ ayak izi − birleşim: çoklu kesişimlerde tekrar aydınlatılan (blend kaybı) alan (tam projeksiyon düzleminde) */
  redundantOverlapAreaM2: number;
  /** Fiziksel duvar sınırları içinde kırpılmış tekil ayak izleri toplamı (m²) */
  surfaceSumFootprintAreaM2: number;
  /** Fiziksel duvar sınırları içinde tekrar aydınlatılan (Σ kırpılmış ayak izi − duvar kaplama) alan (m²) */
  surfaceRedundantOverlapAreaM2: number;
  /** Fiziksel duvar sınırları içinde ≥3 projektörün üst üste bindiği alan (m²) */
  surfaceHigherOrderOverlapAreaM2: number;
  surfaceAreaM2: number;
  surfaceCoveredAreaM2: number;
  surfaceUncoveredAreaM2: number;
  surfaceCoveragePct: number;
  geometryConsistent: boolean;
}

export function intersectFootprints(fs: ProjectorFootprint[]): { x0: number; x1: number; y0: number; y1: number } | null {
  if (fs.length === 0) return null;
  const x0 = Math.max(...fs.map(f => f.x0));
  const x1 = Math.min(...fs.map(f => f.x1));
  const y0 = Math.max(...fs.map(f => f.y0));
  const y1 = Math.min(...fs.map(f => f.y1));
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return null;
  return { x0, x1, y0, y1 };
}

/**
 * Izgara yerleşimli projektörler için ayak izlerini üretir.
 * Yatay: PJ_i başlangıcı = i × W × (1 − ov); dikeyde yüzey ortasına hizalı.
 */
export function buildGridFootprints(inp: {
  cols: number;
  rows: number;
  imageWidthM: number;
  imageHeightM: number;
  overlapFracX: number;
  overlapFracY?: number;
  surfaceHeightM: number;
  startXM?: number;
  positionsX?: number[];
}): ProjectorFootprint[] {
  const cols = Math.max(1, Math.round(inp.cols));
  const rows = Math.max(1, Math.round(inp.rows));
  const ovX = cols > 1 ? Math.max(0, Math.min(0.995, inp.overlapFracX)) : 0;
  const ovY = rows > 1 ? Math.max(0, Math.min(0.995, inp.overlapFracY ?? 0)) : 0;
  const stepX = inp.imageWidthM * (1 - ovX);
  const stepY = inp.imageHeightM * (1 - ovY);
  const totalH = rows * inp.imageHeightM - (rows - 1) * inp.imageHeightM * ovY;
  const baseY = (inp.surfaceHeightM - totalH) / 2;
  const out: ProjectorFootprint[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const x0 = Array.isArray(inp.positionsX) && inp.positionsX.length >= cols ? inp.positionsX[c] : (inp.startXM ?? 0) + c * stepX;
      const y0 = baseY + r * stepY;
      out.push({
        projectorId: `PJ-${String(idx + 1).padStart(2, '0')}`,
        x0: r3(x0),
        x1: r3(x0 + inp.imageWidthM),
        y0: r3(y0),
        y1: r3(y0 + inp.imageHeightM),
      });
    }
  }
  return out;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      res.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return res;
}

export function analyzeFootprintOverlaps(
  footprints: ProjectorFootprint[],
  surfaceWidthM: number,
  surfaceHeightM: number,
  cols?: number
): FootprintOverlapAnalysis {
  const n = footprints.length;
  const colCount = Math.max(1, cols ?? n);
  const isAdjacent = (ids: number[]) => {
    if (ids.length !== 2) return false;
    const [a, b] = ids;
    const ra = Math.floor(a / colCount), ca = a % colCount;
    const rb = Math.floor(b / colCount), cb = b % colCount;
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  };
  const toRegion = (ids: number[]): FootprintIntersection | null => {
    const rect = intersectFootprints(ids.map(i => footprints[i]));
    if (!rect) return null;
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const cx0 = Math.max(0, rect.x0);
    const cx1 = Math.min(surfaceWidthM, rect.x1);
    const cy0 = Math.max(0, rect.y0);
    const cy1 = Math.min(surfaceHeightM, rect.y1);
    const cw = Math.max(0, cx1 - cx0);
    const ch = Math.max(0, cy1 - cy0);
    return {
      projectorIds: ids.map(i => footprints[i].projectorId),
      multiplicity: ids.length,
      adjacent: isAdjacent(ids),
      x0: r3(rect.x0),
      x1: r3(rect.x1),
      y0: r3(rect.y0),
      y1: r3(rect.y1),
      widthM: r3(w),
      heightM: r3(h),
      areaM2: r3(w * h),
      clippedWidthM: r3(cw),
      clippedHeightM: r3(ch),
      clippedAreaM2: r3(cw * ch),
    };
  };
  const indices = footprints.map((_, i) => i);

  const pairwiseIntersections = combinations(indices, 2)
    .map(toRegion)
    .filter((x): x is FootprintIntersection => x !== null);
  const higherOrderIntersections: FootprintIntersection[] = [];
  for (let k = 3; k <= Math.min(n, 8); k++) {
    for (const combo of combinations(indices, k)) {
      const reg = toRegion(combo);
      if (reg) higherOrderIntersections.push(reg);
    }
  }

  // Inclusion–Exclusion (n ≤ 12)
  let unionIE: number | null = null;
  if (n <= 12) {
    unionIE = 0;
    for (let k = 1; k <= n; k++) {
      const sign = k % 2 === 1 ? 1 : -1;
      for (const combo of combinations(indices, k)) {
        const rect = intersectFootprints(combo.map(i => footprints[i]));
        if (rect) unionIE += sign * (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
      }
    }
  }

  // Doğrudan geometrik birleşim: elementer hücre süpürmesi
  const xs = Array.from(new Set([0, surfaceWidthM, ...footprints.flatMap(f => [f.x0, f.x1])])).sort((a, b) => a - b);
  const ys = Array.from(new Set([0, surfaceHeightM, ...footprints.flatMap(f => [f.y0, f.y1])])).sort((a, b) => a - b);
  const multiplicityAreasM2: Record<number, number> = {};
  const surfaceMultiplicityAreasM2: Record<number, number> = {};
  let unionArea = 0;
  let surfaceCovered = 0;
  let maxMultiplicity = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cw = xs[i + 1] - xs[i];
      const ch = ys[j + 1] - ys[j];
      if (cw <= EPS || ch <= EPS) continue;
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      const k = footprints.filter(f => cx > f.x0 && cx < f.x1 && cy > f.y0 && cy < f.y1).length;
      const a = cw * ch;
      const inSurface = cx > 0 && cx < surfaceWidthM && cy > 0 && cy < surfaceHeightM;
      if (k > 0) {
        multiplicityAreasM2[k] = (multiplicityAreasM2[k] ?? 0) + a;
        unionArea += a;
        maxMultiplicity = Math.max(maxMultiplicity, k);
      }
      if (inSurface) {
        surfaceMultiplicityAreasM2[k] = (surfaceMultiplicityAreasM2[k] ?? 0) + a;
        if (k > 0) surfaceCovered += a;
      }
    }
  }
  for (const k of Object.keys(multiplicityAreasM2)) multiplicityAreasM2[+k] = r3(multiplicityAreasM2[+k]);
  for (const k of Object.keys(surfaceMultiplicityAreasM2)) surfaceMultiplicityAreasM2[+k] = r3(surfaceMultiplicityAreasM2[+k]);

  const sumFootprint = footprints.reduce((a, f) => a + (f.x1 - f.x0) * (f.y1 - f.y0), 0);
  const surfaceSumFootprint = footprints.reduce((a, f) => {
    const cw = Math.max(0, Math.min(surfaceWidthM, f.x1) - Math.max(0, f.x0));
    const ch = Math.max(0, Math.min(surfaceHeightM, f.y1) - Math.max(0, f.y0));
    return a + cw * ch;
  }, 0);
  const surfaceHigherOrderArea = Object.entries(surfaceMultiplicityAreasM2)
    .filter(([k]) => Number(k) >= 3)
    .reduce((acc, [, v]) => acc + v, 0);
  const surfaceArea = Math.max(EPS, surfaceWidthM * surfaceHeightM);
  const geometryConsistent = unionIE === null || Math.abs(unionIE - unionArea) < 1e-3 * Math.max(1, unionArea);

  return {
    footprints,
    pairwiseIntersections,
    higherOrderIntersections,
    maxMultiplicity,
    hasNonAdjacentOverlap: pairwiseIntersections.some(p => !p.adjacent),
    multiplicityAreasM2,
    surfaceMultiplicityAreasM2,
    sumFootprintAreaM2: r3(sumFootprint),
    unionAreaM2: r3(unionArea),
    unionAreaInclusionExclusionM2: unionIE === null ? null : r3(unionIE),
    redundantOverlapAreaM2: r3(sumFootprint - unionArea),
    surfaceSumFootprintAreaM2: r3(surfaceSumFootprint),
    surfaceRedundantOverlapAreaM2: r3(Math.max(0, surfaceSumFootprint - surfaceCovered)),
    surfaceHigherOrderOverlapAreaM2: r3(surfaceHigherOrderArea),
    surfaceAreaM2: r3(surfaceArea),
    surfaceCoveredAreaM2: r3(surfaceCovered),
    surfaceUncoveredAreaM2: r3(Math.max(0, surfaceArea - surfaceCovered)),
    surfaceCoveragePct: r2((surfaceCovered / surfaceArea) * 100),
    geometryConsistent,
  };
}

/**
 * Normalize edge-blend maskeleri: her koordinatta kapsayan projektörlerin "feather" ağırlıkları
 * (kendi kenarına uzaklık) toplamı 1 olacak şekilde normalize edilir. Üçlü/çoklu overlap
 * bölgelerinde toplam katkı tek projektör seviyesine eşitlenir (gamma öncesi lineer alan).
 */
export function normalizedBlendWeights(footprints: ProjectorFootprint[], xM: number, yM: number): number[] {
  const raw = footprints.map(f => {
    if (xM < f.x0 || xM > f.x1 || yM < f.y0 || yM > f.y1) return 0;
    const dx = Math.min(xM - f.x0, f.x1 - xM);
    const dy = Math.min(yM - f.y0, f.y1 - yM);
    return Math.max(1e-6, Math.min(dx, dy));
  });
  const covering = raw.filter(w => w > 0).length;
  if (covering <= 1) return raw.map(w => (w > 0 ? 1 : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(w => w / sum);
}

// ─────────────────────────────── 2. İçerik kanvası (tek kaynak) ───────────────────────────────

export interface ContentCanvasResult {
  projectionRaster: { w: number; h: number; mp: number };
  contentCanvas: { w: number; h: number; mp: number };
  physicalWidthM: number;
  physicalHeightM: number;
  pxPerMeterH: number;
  pxPerMeterV: number;
  mmPerPxH: number;
  mmPerPxV: number;
  pxPerSqMeter: number;
  anisotropyPct: number;
  /** Yüzey projeksiyon alanına sığıyor → doğal ölçekli kırpma; aksi halde yüzey oranına kırpma */
  mode: 'native-crop' | 'aspect-crop';
}

/**
 * Tek kanvas geometrisi:
 *  optW = round(W_yüzey × px/m_optik_H), optH = round(H_yüzey × px/m_optik_V)
 *  optH ≤ raster_H  → içerik = min(raster_W, optW) × optH          (doğal ölçekli kırpma)
 *  aksi halde        → içerik = raster yüzey en-boy oranına kırpılır (aspect-crop)
 *  px/m_H = içerik_W / W_yüzey, px/m_V = içerik_H / H_yüzey, mm/px = 1000 / (px/m)
 */
export function computeContentCanvas(inp: {
  rasterW: number;
  rasterH: number;
  opticalPxPerMeterH: number;
  opticalPxPerMeterV: number;
  surfaceWidthM: number;
  surfaceHeightM: number;
}): ContentCanvasResult {
  const sW = Math.max(0.01, inp.surfaceWidthM);
  const sH = Math.max(0.01, inp.surfaceHeightM);
  const aspect = sW / sH;
  const optW = Math.round(sW * inp.opticalPxPerMeterH);
  const optH = Math.round(sH * inp.opticalPxPerMeterV);
  const nativeFit = optH <= inp.rasterH;
  const w = nativeFit ? Math.min(inp.rasterW, optW) : Math.min(inp.rasterW, Math.round(inp.rasterH * aspect));
  const h = nativeFit ? Math.min(inp.rasterH, optH) : Math.min(inp.rasterH, Math.round(w / aspect));
  const pxmH = w / sW;
  const pxmV = h / sH;
  return {
    projectionRaster: { w: inp.rasterW, h: inp.rasterH, mp: r2((inp.rasterW * inp.rasterH) / 1e6) },
    contentCanvas: { w, h, mp: r2((w * h) / 1e6) },
    physicalWidthM: sW,
    physicalHeightM: sH,
    pxPerMeterH: r2(pxmH),
    pxPerMeterV: r2(pxmV),
    mmPerPxH: r3(1000 / Math.max(0.01, pxmH)),
    mmPerPxV: r3(1000 / Math.max(0.01, pxmV)),
    pxPerSqMeter: Math.round((w * h) / (sW * sH)),
    anisotropyPct: r2((Math.abs(pxmH - pxmV) / Math.max(0.01, pxmH, pxmV)) * 100),
    mode: nativeFit ? 'native-crop' : 'aspect-crop',
  };
}

/** Raporlanan mm/px değerinin hangi kaynaktan geldiğini belirler (H, V, H/V ortalaması veya kaynaksız). */
export function identifyMmPerPxSource(
  reported: number,
  mmH: number,
  mmV: number,
  tolPct = 2
): 'horizontal' | 'vertical' | 'mean' | 'unmatched' {
  const dev = (ref: number) => (Math.abs(reported - ref) / Math.max(0.001, ref)) * 100;
  const mean = (mmH + mmV) / 2;
  if (dev(mmH) <= tolPct) return 'horizontal';
  if (dev(mmV) <= tolPct) return 'vertical';
  if (dev(mean) <= tolPct) return 'mean';
  return 'unmatched';
}

// ─────────────────────────────── 3. Aydınlık kaynakları ───────────────────────────────

export type IlluminanceSource = 'THEORETICAL' | 'SIMULATED_LUXFIELD' | 'MEASURED';

export interface IlluminanceRecord {
  source: IlluminanceSource;
  label: string;
  avgLux: number | null;
  minLux: number | null;
  maxLux: number | null;
  u0Pct: number | null;
  u1Pct: number | null;
  sampleCount: number;
  areaM2: number;
  luxFieldId?: string;
  formula: string;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  issues: string[];
}

/** min ≤ avg ≤ max zorunlu kuralı (0.5 lx yuvarlama toleransı) */
export function validateLuxOrder(minLux: number | null, avgLux: number | null, maxLux: number | null): string[] {
  const issues: string[] = [];
  if (avgLux !== null && maxLux !== null && avgLux > maxLux + 0.5) issues.push(`Ortalama (${avgLux} lx) maksimumu (${maxLux} lx) aşıyor`);
  if (minLux !== null && avgLux !== null && minLux > avgLux + 0.5) issues.push(`Minimum (${minLux} lx) ortalamayı (${avgLux} lx) aşıyor`);
  if (minLux !== null && maxLux !== null && minLux > maxLux + 0.5) issues.push(`Minimum (${minLux} lx) maksimumu (${maxLux} lx) aşıyor`);
  return issues;
}

export function buildTheoreticalIlluminance(totalNominalLumens: number, efficiencyPct: number, areaM2: number): IlluminanceRecord {
  const ok = totalNominalLumens > 0 && efficiencyPct > 0 && areaM2 > 0;
  return {
    source: 'THEORETICAL',
    label: 'Teorik Aydınlık (Φ_efektif / A)',
    avgLux: ok ? r2((totalNominalLumens * (efficiencyPct / 100)) / areaM2) : null,
    minLux: null,
    maxLux: null,
    u0Pct: null,
    u1Pct: null,
    sampleCount: 0,
    areaM2: r2(areaM2),
    formula: 'E_teorik = Φ_nominal × η / A_yüzey',
    status: ok ? 'PASS' : 'UNKNOWN',
    issues: ok ? [] : ['Lümen, verim veya alan eksik'],
  };
}

export function buildSimulatedIlluminance(grid: {
  avgLux: number;
  minLux: number;
  maxLux: number;
  sampleCount: number;
  areaM2: number;
  luxFieldId: string;
} | null): IlluminanceRecord {
  if (!grid) {
    return {
      source: 'SIMULATED_LUXFIELD',
      label: 'Simüle LuxField (288-nokta)',
      avgLux: null,
      minLux: null,
      maxLux: null,
      u0Pct: null,
      u1Pct: null,
      sampleCount: 0,
      areaM2: 0,
      formula: 'E(x,y) = Σ_p E_p(x,y) × mask_p(x,y)',
      status: 'UNKNOWN',
      issues: ['LuxField simülasyonu yok'],
    };
  }
  const issues = validateLuxOrder(grid.minLux, grid.avgLux, grid.maxLux);
  return {
    source: 'SIMULATED_LUXFIELD',
    label: 'Simüle LuxField (288-nokta)',
    avgLux: grid.avgLux,
    minLux: grid.minLux,
    maxLux: grid.maxLux,
    u0Pct: grid.avgLux > 0 ? r2((grid.minLux / grid.avgLux) * 100) : null,
    u1Pct: grid.maxLux > 0 ? r2((grid.minLux / grid.maxLux) * 100) : null,
    sampleCount: grid.sampleCount,
    areaM2: grid.areaM2,
    luxFieldId: grid.luxFieldId,
    formula: 'E(x,y) = Σ_p E_p(x,y) × mask_p(x,y)',
    status: issues.length > 0 ? 'FAIL' : 'PASS',
    issues,
  };
}

export function buildMeasuredIlluminance(samples: number[] | null | undefined, areaM2: number): IlluminanceRecord {
  const vals = (samples ?? []).filter(v => Number.isFinite(v) && v >= 0);
  if (vals.length === 0) {
    return {
      source: 'MEASURED',
      label: 'Saha Ölçümü (Lüksmetre)',
      avgLux: null,
      minLux: null,
      maxLux: null,
      u0Pct: null,
      u1Pct: null,
      sampleCount: 0,
      areaM2: r2(areaM2),
      formula: 'E_ölçüm = Σ E_i / n',
      status: 'UNKNOWN',
      issues: ['Saha ölçümü girilmedi'],
    };
  }
  const avg = r2(vals.reduce((a, b) => a + b, 0) / vals.length);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  return {
    source: 'MEASURED',
    label: 'Saha Ölçümü (Lüksmetre)',
    avgLux: avg,
    minLux: mn,
    maxLux: mx,
    u0Pct: avg > 0 ? r2((mn / avg) * 100) : null,
    u1Pct: mx > 0 ? r2((mn / mx) * 100) : null,
    sampleCount: vals.length,
    areaM2: r2(areaM2),
    formula: 'E_ölçüm = Σ E_i / n',
    status: 'PASS',
    issues: [],
  };
}

// ─────────────────────────────── 4. Nit & ACR (kaynak etiketli) ───────────────────────────────

export interface LuminanceRecord {
  source: IlluminanceSource;
  luxUsed: number | null;
  nits: number | null;
  formula: string;
}

/** L = E × Gain × ρ / π — E'nin kaynak etiketi korunur. */
export function computeLuminanceFromSource(rec: IlluminanceRecord, gain: number, reflectance: number): LuminanceRecord {
  return {
    source: rec.source,
    luxUsed: rec.avgLux,
    nits: rec.avgLux === null ? null : r2((rec.avgLux * gain * reflectance) / Math.PI),
    formula: 'L = E × Gain × ρ / π',
  };
}

export interface ContrastAnalysis {
  whiteSource: IlluminanceSource;
  whiteNits: number | null;
  ambientBlackNits: number | null;
  nativeBlackNits: number | null;
  /** Yalnızca ortam ışığına göre tahmini kontrast (doğal siyah hariç) */
  estimatedAmbientContrast: number | null;
  /** Gerçek ACR = (L_beyaz + L_siyah_toplam) / L_siyah_toplam — doğal siyah zorunlu */
  acr: number | null;
  acrVerified: boolean;
  status: 'PASS' | 'UNKNOWN';
  message: string;
}

export function computeContrastAnalysis(inp: {
  white: LuminanceRecord;
  ambientLux: number | null | undefined;
  gain: number;
  reflectance: number;
  nativeContrast?: number | null;
  nativeBlackNits?: number | null;
}): ContrastAnalysis {
  const white = inp.white.nits;
  const ambBlack =
    inp.ambientLux === null || inp.ambientLux === undefined || !Number.isFinite(inp.ambientLux)
      ? null
      : r3((inp.ambientLux * inp.gain * inp.reflectance) / Math.PI);
  let nativeBlack: number | null = null;
  if (inp.nativeBlackNits !== null && inp.nativeBlackNits !== undefined && inp.nativeBlackNits > 0) nativeBlack = inp.nativeBlackNits;
  else if (white !== null && inp.nativeContrast && inp.nativeContrast > 0) nativeBlack = r3(white / inp.nativeContrast);

  const estimated = white !== null && ambBlack !== null && ambBlack > 0 ? r2((white + ambBlack) / ambBlack) : null;
  const totalBlack = (ambBlack ?? 0) + (nativeBlack ?? 0);
  const verified = white !== null && ambBlack !== null && nativeBlack !== null && totalBlack > 0;
  const acr = verified ? r2((white! + totalBlack) / totalBlack) : null;
  return {
    whiteSource: inp.white.source,
    whiteNits: white,
    ambientBlackNits: ambBlack,
    nativeBlackNits: nativeBlack,
    estimatedAmbientContrast: estimated,
    acr,
    acrVerified: verified,
    status: verified ? 'PASS' : 'UNKNOWN',
    message: verified
      ? `ACR ${acr}:1 (beyaz ${white} nit [${inp.white.source}], ortam siyahı ${ambBlack} nit, doğal siyah ${nativeBlack} nit).`
      : nativeBlack === null
        ? `Cihaz doğal siyah seviyesi / native kontrast girilmedi; gerçek ACR doğrulanamaz (UNKNOWN). Tahmini ortam kontrastı: ${estimated ?? '—'}:1.`
        : 'Beyaz seviyesi veya ortam ışığı eksik; ACR hesaplanamadı (UNKNOWN).',
  };
}
