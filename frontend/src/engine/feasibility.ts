import {
  CATALOG_PROJECTORS,
  CatalogProjector,
  CatalogLens,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';
import { evaluatePhysicalCoverage } from './physicalCoverage';

/* ============================================================================
 * 1. OTOMATİK PROJEKTÖR VE LENS ÖNERİ MOTORU
 * ==========================================================================*/

export interface ProjectorRecommendationInput {
  widthM: number;
  heightM: number;
  throwDistM: number;
  maxRoomThrowM?: number;
  cols?: number;
  rows?: number;
  overlapPct?: number;
  targetLux?: number;
  ambientLux?: number;
  screenGain?: number;
  reflectance?: number;
  opticalEfficiency?: number;
  preferredNativeH?: number;
}

export interface RecommendedProjectorOption {
  id: string;
  projectorId: string;
  manufacturer: string;
  projectorModel: string;
  lensId: string;
  lensModel: string;
  throwMin: number;
  throwMax: number;
  ansiLumens: number;
  nativeW: number;
  nativeH: number;
  aspect: string;
  technology: string;
  recommendedCols: number;
  recommendedRows: number;
  totalProjectors: number;
  requiredTR: number;
  appliedTR: number;
  lensCoversTR: boolean;
  zoomPositionPct: number;
  validThrowRangeM: [number, number];
  estimatedAvgLux: number;
  estimatedNits: number;
  estimatedACR: number;
  effectiveCanvasW: number;
  effectiveCanvasH: number;
  effectiveMP: number;
  mmPerPx: number;
  tierLabel: string;
  matchScore: number;
  reasonText: string;
}

export interface ProjectorRecommendationResult {
  areaM2: number;
  baseCols: number;
  baseRows: number;
  autoOptimalCols: number;
  requiredTotalLumens: number;
  requiredLumensPerProjector: number;
  requiredTR: number;
  idealMuseumTRRange: [number, number];
  alternatives: RecommendedProjectorOption[];
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function evaluateCandidate(
  proj: CatalogProjector,
  lens: CatalogLens,
  cCount: number,
  rCount: number,
  inp: {
    widthM: number;
    heightM: number;
    throwDistM: number;
    maxRoomThrowM?: number;
    overlapRatio: number;
    targetLux: number;
    ambientLux: number;
    screenGain: number;
    reflectance: number;
    opticalEfficiency: number;
    baseCols: number;
  }
): RecommendedProjectorOption {
  const effSpanX = Math.max(0.25, cCount - (cCount - 1) * inp.overlapRatio);
  const singleImageW = inp.widthM / effSpanX;
  const reqTR = r2(inp.throwDistM / Math.max(0.1, singleImageW));
  const aspect = proj.nativeW / Math.max(1, proj.nativeH);
  const minSingleWForHeight = (inp.heightM / Math.max(1, rCount)) * aspect;
  const maxTRForFullHeight = r2(inp.throwDistM / Math.max(0.1, minSingleWForHeight));
  const coversFullHeightAtDist = lens.throwMin <= maxTRForFullHeight + 0.01;
  const minDistForFullHeight = r2(minSingleWForHeight * lens.throwMin);
  const eps = 0.02;
  const lensCoversTR = reqTR >= lens.throwMin - eps && reqTR <= lens.throwMax + eps && coversFullHeightAtDist;

  const appliedTR = r2(Math.min(lens.throwMax, Math.max(lens.throwMin, reqTR)));
  const spanTR = Math.max(0, lens.throwMax - lens.throwMin);
  const zoomPositionPct =
    spanTR > 0.01 ? Math.round(((appliedTR - lens.throwMin) / spanTR) * 100) : 50;

  const validThrowMin = r2(singleImageW * lens.throwMin);
  const validThrowMax = r2(singleImageW * lens.throwMax);
  const maxAllowedThrow = inp.maxRoomThrowM && inp.maxRoomThrowM > 0 ? inp.maxRoomThrowM : Infinity;
  const fitsRoom = validThrowMin <= maxAllowedThrow + 0.05 && inp.throwDistM <= maxAllowedThrow + 0.05;

  const pjTotal = cCount * rCount;
  const areaM2 = Math.max(0.1, inp.widthM * inp.heightM);
  const netSystemEfficiency = inp.opticalEfficiency;
  const estimatedAvgLux = Math.round((proj.ansiLumens * pjTotal * netSystemEfficiency) / areaM2);
  const estimatedNits = Math.round((estimatedAvgLux * inp.screenGain * inp.reflectance) / Math.PI);
  const estimatedACR = inp.ambientLux > 0 ? r1((estimatedAvgLux + inp.ambientLux) / inp.ambientLux) : 0;

  const effectiveCanvasW = Math.round(proj.nativeW * effSpanX);
  const effSpanY = Math.max(0.25, rCount - (rCount - 1) * Math.min(0.35, inp.overlapRatio));
  const effectiveCanvasH = Math.round(proj.nativeH * effSpanY);
  const effectiveMP = r2((effectiveCanvasW * effectiveCanvasH) / 1_000_000);
  const mmPerPx = r2((inp.widthM * 1000) / Math.max(1, effectiveCanvasW));

  // Çok kriterli mühendislik skoru (0..100)
  let score = 100;

  // 1) Lens atım oranı uyumu
  if (!lensCoversTR) {
    const gap = reqTR < lens.throwMin ? lens.throwMin - reqTR : reqTR - lens.throwMax;
    score -= Math.min(48, 22 + gap * 35);
  } else if (spanTR > 0.05 && (zoomPositionPct < 10 || zoomPositionPct > 90)) {
    score -= 6; // Zoom uç noktası penaltısı
  }

  // 2) Oda derinlik sınırı
  if (!fitsRoom) {
    score -= 22;
  }

  // 3) Hedef parlaklık uyumu
  const luxRatio = estimatedAvgLux / Math.max(50, inp.targetLux);
  if (luxRatio < 0.7) {
    score -= Math.min(35, (0.7 - luxRatio) * 50);
  } else if (luxRatio < 0.95) {
    score -= (0.95 - luxRatio) * 28;
  } else if (luxRatio > 2.8) {
    score -= Math.min(8, (luxRatio - 2.8) * 3); // Aşırı güç tüketimi/overkill hafif kesinti
  }

  // 4) Çözünürlük / piksel yoğunluğu bonusu
  if (proj.nativeW >= 3840) score += 6;
  else if (proj.nativeW >= 2560) score += 3;
  if (mmPerPx > 3.5) score -= Math.min(12, (mmPerPx - 3.5) * 3);

  // 5) Mevcut cihaz adedini koruyabiliyorsa küçük öncelik
  if (cCount === inp.baseCols && lensCoversTR && luxRatio >= 0.85) {
    score += 4;
  }

  // Mekanik lens shift, montaj kısıtları ve üretici katalog doğrulaması saha kontrolü gerektirdiğinden üst tavan %96
  const matchScore = Math.max(5, Math.min(96, Math.round(score)));

  let tierLabel = '💡 Kompakt / Ekonomik';
  if (cCount !== inp.baseCols && lensCoversTR) {
    tierLabel = '📐 Alternatif Dizilim';
  } else if (proj.nativeW >= 2560 && lensCoversTR) {
    tierLabel = '🔬 Yüksek Çözünürlük';
  } else if (estimatedAvgLux >= inp.targetLux * 1.35 && lensCoversTR) {
    tierLabel = '🔆 Yüksek Parlaklık';
  } else if (matchScore >= 85 && lensCoversTR) {
    tierLabel = '✓ TR & Akı Uyumlu (Katalog Kontrolü Gerekir)';
  } else if (!lensCoversTR) {
    tierLabel = '⚠ Yakın Lens Alternatifi';
  }

  const reasons: string[] = [];
  if (!coversFullHeightAtDist) {
    reasons.push(`FAIL: Tam ${inp.heightM}m dikey kaplama için TR ≤ ${maxTRForFullHeight}:1 gerekir; min ${lens.throwMin}:1 lensle en az ${minDistForFullHeight}m mesafe şart`);
  } else if (lensCoversTR) {
    reasons.push(`TR ${reqTR}:1 gereksinimi [${lens.throwMin}–${lens.throwMax}] aralığında (Zoom %${zoomPositionPct})`);
  } else {
    reasons.push(`Gereken TR ${reqTR}:1 lens sınırı [${lens.throwMin}–${lens.throwMax}] dışında`);
  }
  reasons.push(`${estimatedAvgLux} Lux (${estimatedACR > 0 ? `Tahmini Ortam ACR ${estimatedACR}:1` : 'ACR: UNKNOWN'}) · ${mmPerPx} mm/px`);
  if (!fitsRoom) {
    reasons.push(`Dikkat: oda sınırı (${inp.maxRoomThrowM}m) aşıyor`);
  }

  return {
    id: `${proj.id}__${lens.id}__${cCount}x${rCount}`,
    projectorId: proj.id,
    manufacturer: proj.manufacturer,
    projectorModel: proj.model,
    lensId: lens.id,
    lensModel: lens.model,
    throwMin: lens.throwMin,
    throwMax: lens.throwMax,
    ansiLumens: proj.ansiLumens,
    nativeW: proj.nativeW,
    nativeH: proj.nativeH,
    aspect: proj.aspect,
    technology: proj.technology,
    recommendedCols: cCount,
    recommendedRows: rCount,
    totalProjectors: pjTotal,
    requiredTR: reqTR,
    appliedTR,
    lensCoversTR,
    zoomPositionPct,
    validThrowRangeM: [validThrowMin, validThrowMax],
    estimatedAvgLux,
    estimatedNits,
    estimatedACR,
    effectiveCanvasW,
    effectiveCanvasH,
    effectiveMP,
    mmPerPx,
    tierLabel,
    matchScore,
    reasonText: reasons.join(' · '),
  };
}

/**
 * Verilen mekân/yüzey ölçülerine, atım mesafesine ve hedef parlaklığa göre
 * katalogdaki en uygun projektör + lens + adet alternatiflerini üretir.
 */
export function recommendProjectorAndLenses(
  inp: ProjectorRecommendationInput
): ProjectorRecommendationResult {
  const widthM = Math.max(0.2, Number.isFinite(inp.widthM) ? inp.widthM : 6);
  const heightM = Math.max(0.2, Number.isFinite(inp.heightM) ? inp.heightM : 3);
  const throwDistM = Math.max(0.3, Number.isFinite(inp.throwDistM) ? inp.throwDistM : 4.5);
  const baseCols = Math.max(1, Math.round(inp.cols ?? 1));
  const baseRows = Math.max(1, Math.round(inp.rows ?? 1));
  const overlapPct = Math.max(0, Math.min(99.5, inp.overlapPct ?? 15));
  const overlapRatio = overlapPct / 100;
  const targetLux = Math.max(50, inp.targetLux ?? 350);
  const ambientLux = Math.max(0, inp.ambientLux ?? 50);
  const screenGain = Math.max(0.3, Math.min(3.0, inp.screenGain ?? 1.0));
  const reflectance = Math.max(0.1, Math.min(1.0, inp.reflectance ?? 0.85));
  const opticalEfficiency = Math.max(0.3, Math.min(1.0, inp.opticalEfficiency ?? 0.90));

  const areaM2 = r2(widthM * heightM);
  const baseSpanX = Math.max(0.25, baseCols - (baseCols - 1) * overlapRatio);
  const baseSingleW = widthM / baseSpanX;
  const requiredTR = r2(throwDistM / Math.max(0.1, baseSingleW));

  // Standart 0.85:1 müze kısa-geniş lens ile yüzeyi en verimli kaplayan otomatik cihaz sayısı
  const idealSingleW = throwDistM / 0.85;
  const rawAutoCols = Math.ceil((widthM / Math.max(0.2, idealSingleW) - overlapRatio) / Math.max(0.4, 1 - overlapRatio));
  const autoOptimalCols = Math.max(1, Math.min(12, rawAutoCols));

  const requiredTotalLumens = Math.round((targetLux * areaM2) / opticalEfficiency);
  const requiredLumensPerProjector = Math.ceil(requiredTotalLumens / Math.max(1, baseCols * baseRows));

  const layoutCounts = Array.from(new Set([baseCols, autoOptimalCols]));
  const matchingCatalog = inp.preferredNativeH
    ? CATALOG_PROJECTORS.filter(p => p.nativeH === inp.preferredNativeH)
    : [];
  const catalogPool = matchingCatalog.length > 0 ? matchingCatalog : CATALOG_PROJECTORS;
  const allCandidates: RecommendedProjectorOption[] = [];

  for (const cCount of layoutCounts) {
    for (const proj of catalogPool) {
      const lenses = getCompatibleCatalogLenses(proj);
      if (lenses.length === 0) continue;

      // Bu projektör için bu dizilimde en yüksek puanlı lensi seç (liste çeşitliliğini korur)
      let bestForProj: RecommendedProjectorOption | null = null;
      for (const lens of lenses) {
        const cand = evaluateCandidate(proj, lens, cCount, baseRows, {
          widthM,
          heightM,
          throwDistM,
          maxRoomThrowM: inp.maxRoomThrowM,
          overlapRatio,
          targetLux,
          ambientLux,
          screenGain,
          reflectance,
          opticalEfficiency,
          baseCols,
        });
        if (!bestForProj || cand.matchScore > bestForProj.matchScore) {
          bestForProj = cand;
        }
      }
      if (bestForProj) {
        allCandidates.push(bestForProj);
      }
    }
  }

  allCandidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (a.lensCoversTR !== b.lensCoversTR) return a.lensCoversTR ? -1 : 1;
    return b.nativeW - a.nativeW;
  });

  // İlk 6 öneriyi seç (mümkünse farklı marka & kademeleri koruyarak)
  const picked: RecommendedProjectorOption[] = [];
  const seenKey = new Set<string>();
  for (const c of allCandidates) {
    const key = `${c.manufacturer}__${c.projectorId}`;
    if (picked.length < 4 && seenKey.has(key)) continue;
    seenKey.add(key);
    picked.push(c);
    if (picked.length >= 6) break;
  }
  if (picked.length < 6) {
    for (const c of allCandidates) {
      if (!picked.some(p => p.id === c.id)) {
        picked.push(c);
        if (picked.length >= 6) break;
      }
    }
  }

  return {
    areaM2,
    baseCols,
    baseRows,
    autoOptimalCols,
    requiredTotalLumens,
    requiredLumensPerProjector,
    requiredTR,
    idealMuseumTRRange: [0.65, 1.3],
    alternatives: picked,
  };
}

/* ============================================================================
 * 2. ÇOKLU PROJEKTÖR OVERLAP DÜŞÜLMÜŞ EFEKTİF PİKSEL ALANI HESABI
 * ==========================================================================*/

export interface MultiProjectorEffectivePixelInput {
  widthM: number;
  heightM: number;
  projW: number;
  projH: number;
  cols: number;
  rows: number;
  overlapPctX: number;
  overlapPctY?: number;
  isClosedLoopX?: boolean;
  keystoneDegH?: number;
  keystoneDegV?: number;
  isCurved?: boolean;
}

export interface MultiProjectorEffectivePixelResult {
  totalProjectors: number;
  rawW: number;
  rawH: number;
  rawTotalPixels: number;
  rawMP: number;
  overlapCountX: number;
  overlapCountY: number;
  overlapPxX: number;
  overlapPxY: number;
  totalOverlapPxW: number;
  totalOverlapPxH: number;
  netW: number;
  netH: number;
  netPixelsAfterOverlap: number;
  netMPAfterOverlap: number;
  overlapLostPixels: number;
  overlapLostMP: number;
  overlapLostPct: number;
  overlapPhysicalWidthM: number;
  overlapPhysicalAreaM2: number;
  geometricLossPct: number;
  usableContentW: number;
  usableContentH: number;
  usableEffectivePixels: number;
  usableEffectiveMP: number;
  totalRetentionPct: number;
  pxPerMeterW: number;
  pxPerMeterH: number;
  mmPerPx: number;
  ppi: number;
  pxPerM2: number;
}

/**
 * Çoklu projektör kurulumlarında overlap bindirmesi ve geometrik warp/keystone
 * düşüldükten sonra içerik üretimi için kalan net efektif piksel alanını hesaplar.
 */
export function computeEffectiveMultiProjectorPixelArea(
  inp: MultiProjectorEffectivePixelInput
): MultiProjectorEffectivePixelResult {
  const widthM = Math.max(0.1, Number.isFinite(inp.widthM) ? inp.widthM : 1);
  const heightM = Math.max(0.1, Number.isFinite(inp.heightM) ? inp.heightM : 1);
  const projW = Math.max(64, Math.round(Number.isFinite(inp.projW) ? inp.projW : 1920));
  const projH = Math.max(64, Math.round(Number.isFinite(inp.projH) ? inp.projH : 1080));
  const cols = Math.max(1, Math.round(inp.cols));
  const rows = Math.max(1, Math.round(inp.rows));
  const overlapPctX = Math.max(0, Math.min(60, inp.overlapPctX));
  const overlapPctY = Math.max(0, Math.min(60, inp.overlapPctY ?? 10));

  const totalProjectors = cols * rows;
  const rawW = cols * projW;
  const rawH = rows * projH;
  const rawTotalPixels = rawW * rawH;
  const rawMP = r2(rawTotalPixels / 1_000_000);

  const overlapCountX = inp.isClosedLoopX ? (cols > 1 ? cols : 0) : Math.max(0, cols - 1);
  const overlapCountY = Math.max(0, rows - 1);
  const overlapPxX = overlapCountX > 0 ? Math.round((overlapPctX / 100) * projW) : 0;
  const overlapPxY = overlapCountY > 0 ? Math.round((overlapPctY / 100) * projH) : 0;

  const totalOverlapPxW = overlapCountX * overlapPxX;
  const totalOverlapPxH = overlapCountY * overlapPxY;

  const netW = Math.max(100, rawW - totalOverlapPxW);
  const netH = Math.max(100, rawH - totalOverlapPxH);
  const netPixelsAfterOverlap = netW * netH;
  const netMPAfterOverlap = r2(netPixelsAfterOverlap / 1_000_000);

  const overlapLostPixels = Math.max(0, rawTotalPixels - netPixelsAfterOverlap);
  const overlapLostMP = r2(overlapLostPixels / 1_000_000);
  const overlapLostPct = r1((overlapLostPixels / Math.max(1, rawTotalPixels)) * 100);

  const areaM2 = widthM * heightM;
  const overlapPhysicalWidthM = r2((totalOverlapPxW / Math.max(1, netW)) * widthM);
  const overlapPhysicalAreaM2 = r2(overlapPhysicalWidthM * heightM);

  const kH = Math.min(45, Math.abs(inp.keystoneDegH ?? 0));
  const kV = Math.min(45, Math.abs(inp.keystoneDegV ?? 0));
  const geometricLossPct = r1(Math.min(55, kH * 0.65 + kV * 0.65 + (inp.isCurved ? 6.5 : 0)));
  const geomScale = Math.sqrt(Math.max(0.25, 1 - geometricLossPct / 100));

  const usableContentW = Math.round(netW * geomScale);
  const usableContentH = Math.round(netH * geomScale);
  const usableEffectivePixels = usableContentW * usableContentH;
  const usableEffectiveMP = r2(usableEffectivePixels / 1_000_000);
  const totalRetentionPct = r1((usableEffectivePixels / Math.max(1, rawTotalPixels)) * 100);

  const pxPerMeterW = r1(usableContentW / widthM);
  const pxPerMeterH = r1(usableContentH / heightM);
  const mmPerPx = r2((widthM * 1000) / Math.max(1, usableContentW));
  const ppi = r1(25.4 / Math.max(0.01, mmPerPx));
  const pxPerM2 = Math.round(usableEffectivePixels / Math.max(0.1, areaM2));

  return {
    totalProjectors,
    rawW,
    rawH,
    rawTotalPixels,
    rawMP,
    overlapCountX,
    overlapCountY,
    overlapPxX,
    overlapPxY,
    totalOverlapPxW,
    totalOverlapPxH,
    netW,
    netH,
    netPixelsAfterOverlap,
    netMPAfterOverlap,
    overlapLostPixels,
    overlapLostMP,
    overlapLostPct,
    overlapPhysicalWidthM,
    overlapPhysicalAreaM2,
    geometricLossPct,
    usableContentW,
    usableContentH,
    usableEffectivePixels,
    usableEffectiveMP,
    totalRetentionPct,
    pxPerMeterW,
    pxPerMeterH,
    mmPerPx,
    ppi,
    pxPerM2,
  };
}

/* ============================================================================
 * 3. YÜZEY NOKTASAL LUX & PARLAKLIK DAĞILIM HARİTASI (3x3 + BLEND + İMLEÇ)
 * ==========================================================================*/

export interface SurfacePointLuxInput {
  widthM: number;
  heightM: number;
  cols?: number;
  rows?: number;
  avgLux: number;
  uniformityU0?: number; // 0..1 veya 0..100
  overlapPct?: number;
  screenGain?: number;
  reflectance?: number;
  ambientLux?: number;
}

export interface SurfaceLuxPoint {
  id: string;
  label: string;
  xM: number;
  yM: number;
  normX: number;
  normY: number;
  lux: number;
  nits: number;
  fl: number;
  pctOfAvg: number;
  pctOfPeak: number;
  zoneKind: 'center' | 'edge' | 'corner' | 'blend' | 'probe';
  statusLabel: string;
}

export interface SurfacePointLuxResult {
  avgLux: number;
  peakCenterLux: number;
  cornerAvgLux: number;
  edgeAvgLux: number;
  blendSeamLux: number;
  blendSeamNits: number;
  centerToCornerDropPct: number;
  zones9: SurfaceLuxPoint[];
}

function normalizeU0Ratio(raw?: number): number {
  const val = raw ?? 78;
  const ratio = val <= 1 ? val : val / 100;
  return Math.max(0.25, Math.min(0.98, ratio));
}

function pointStatus(lux: number, avgLux: number): string {
  const ratio = lux / Math.max(1, avgLux);
  if (ratio >= 1.05) return 'Tepe / Merkez Aydınlığı';
  if (ratio >= 0.85) return 'İdeal Homojen Bölge';
  if (ratio >= 0.68) return 'Hafif Kenar Düşüşü';
  return 'Belirgin Köşe Kararması (Vinyet)';
}

/**
 * Yüzey üzerinde normalize edilmiş herhangi bir `(normX, normY) ∈ [0..1]²` noktasındaki
 * noktasal Lux, Nit, fL ve oran bilgisini hesaplar (2B ısı haritası hover & sorgu için).
 */
export function evaluatePointAt(
  normX: number,
  normY: number,
  inp: SurfacePointLuxInput,
  peakRefLux?: number,
  label = 'İmleç Noktası',
  id = 'probe',
  zoneKind: SurfaceLuxPoint['zoneKind'] = 'probe'
): SurfaceLuxPoint {
  const nx = Math.max(0, Math.min(1, normX));
  const ny = Math.max(0, Math.min(1, normY));
  const widthM = Math.max(0.1, inp.widthM || 1);
  const heightM = Math.max(0.1, inp.heightM || 1);
  const cols = Math.max(1, Math.round(inp.cols ?? 1));
  const avgLux = Math.max(0, inp.avgLux || 0);
  const u0Ratio = normalizeU0Ratio(inp.uniformityU0);
  const overlapPct = Math.max(0, Math.min(99.5, inp.overlapPct ?? 15));
  const gain = Math.max(0.3, Math.min(3.0, inp.screenGain ?? 1.0));
  const refl = Math.max(0.1, Math.min(1.0, inp.reflectance ?? 0.85));

  const dx = Math.abs(nx - 0.5) * 2;
  const dy = Math.abs(ny - 0.5) * 2;
  const radial = 0.55 * dx * dx + 0.45 * dy * dy;

  const peakCenterRatio = 1 + (1 - u0Ratio) * 0.42;
  const minCornerRatio = u0Ratio;
  let relFactor = peakCenterRatio - (peakCenterRatio - minCornerRatio) * Math.min(1.08, radial / 0.65);

  // Çoklu projektörde fiziksel ayak izi toplamı E_total(x,y) = Σ E_i(x,y) ve soft-edge blend etkisi
  if (cols > 1) {
    const ovRatio = Math.max(0, Math.min(0.75, (inp.overlapPct ?? 15) / 100));
    const spanNorm = Math.max(0.25, cols - (cols - 1) * ovRatio);
    const beamNormW = 1 / spanNorm;
    const stepNormW = cols > 1 ? (1 - beamNormW) / (cols - 1) : 0;
    let summedWeight = 0;
    let activeContributors = 0;
    for (let c = 0; c < cols; c++) {
      const startX = c * stepNormW;
      const endX = startX + beamNormW;
      if (nx >= startX - 0.001 && nx <= endX + 0.001) {
        activeContributors++;
        const localU = (nx - startX) / Math.max(0.01, beamNormW);
        // Tek projektör içi merkezden kenara doğal ışık düşüşü (cosine⁴ / hotspot profili)
        const localProfile = 1 - 0.12 * Math.pow((localU - 0.5) * 2, 2);
        // Blend bölgesinde gamma rampası (ideal kalibrasyonda toplam ≈ 1, gerçekte küçük dalgalanma)
        let blendGain = 1;
        if (c > 0 && nx < startX + beamNormW * ovRatio && ovRatio > 0.01) {
          const t = Math.max(0, Math.min(1, (nx - startX) / (beamNormW * ovRatio)));
          blendGain *= Math.pow(t, 0.85);
        }
        if (c < cols - 1 && nx > endX - beamNormW * ovRatio && ovRatio > 0.01) {
          const t = Math.max(0, Math.min(1, (endX - nx) / (beamNormW * ovRatio)));
          blendGain *= Math.pow(t, 0.85);
        }
        summedWeight += localProfile * blendGain;
      }
    }
    if (activeContributors > 0) {
      // Enerji korunumu: ortalama yoğunluk bazlı relFactor üzerine çoklu projektör katkı farkını yansıt
      relFactor *= Math.max(0.75, Math.min(1.22, summedWeight));
    }
  }

  const lux = Math.max(0, Math.round(avgLux * Math.max(0.15, relFactor)));
  const nits = r1((lux * gain * refl) / Math.PI);
  const fl = r1(nits * 0.2919);
  const peak = peakRefLux ?? Math.max(1, Math.round(avgLux * peakCenterRatio));

  return {
    id,
    label,
    xM: r2(nx * widthM),
    yM: r2(ny * heightM),
    normX: r2(nx),
    normY: r2(ny),
    lux,
    nits,
    fl,
    pctOfAvg: avgLux > 0 ? Math.round((lux / avgLux) * 100) : 0,
    pctOfPeak: peak > 0 ? Math.round((lux / peak) * 100) : 0,
    zoneKind,
    statusLabel: pointStatus(lux, avgLux),
  };
}

/**
 * Yüzeyin merkez, 4 kenar ve 4 köşe (9 bölge) + çoklu projektör blend kesişim
 * noktalarındaki noktasal Lux & Nit dağılım haritasını üretir.
 */
export function computeSurfacePointLuxDistribution(
  inp: SurfacePointLuxInput
): SurfacePointLuxResult {
  const cols = Math.max(1, Math.round(inp.cols ?? 1));
  const avgLux = Math.max(0, inp.avgLux || 0);
  const u0Ratio = normalizeU0Ratio(inp.uniformityU0);
  const centerPoint = evaluatePointAt(0.5, 0.5, inp, undefined, 'Tam Merkez', 'center', 'center');
  const peakRef = Math.max(1, centerPoint.lux);

  const defs: Array<{ id: string; label: string; nx: number; ny: number; kind: SurfaceLuxPoint['zoneKind'] }> = [
    { id: 'top-left', label: 'Sol-Üst Köşe', nx: 0.08, ny: 0.88, kind: 'corner' },
    { id: 'top-center', label: 'Üst Kenar Orta', nx: 0.5, ny: 0.88, kind: 'edge' },
    { id: 'top-right', label: 'Sağ-Üst Köşe', nx: 0.92, ny: 0.88, kind: 'corner' },
    { id: 'mid-left', label: 'Sol Kenar Orta', nx: 0.08, ny: 0.5, kind: 'edge' },
    { id: 'center', label: 'Tam Merkez', nx: 0.5, ny: 0.5, kind: 'center' },
    { id: 'mid-right', label: 'Sağ Kenar Orta', nx: 0.92, ny: 0.5, kind: 'edge' },
    { id: 'bot-left', label: 'Sol-Alt Köşe', nx: 0.08, ny: 0.12, kind: 'corner' },
    { id: 'bot-center', label: 'Alt Kenar Orta', nx: 0.5, ny: 0.12, kind: 'edge' },
    { id: 'bot-right', label: 'Sağ-Alt Köşe', nx: 0.92, ny: 0.12, kind: 'corner' },
  ];

  const zones9 = defs.map(d => evaluatePointAt(d.nx, d.ny, inp, peakRef, d.label, d.id, d.kind));
  const corners = zones9.filter(z => z.zoneKind === 'corner');
  const edges = zones9.filter(z => z.zoneKind === 'edge');

  const cornerAvgLux = Math.round(corners.reduce((s, c) => s + c.lux, 0) / Math.max(1, corners.length));
  const edgeAvgLux = Math.round(edges.reduce((s, e) => s + e.lux, 0) / Math.max(1, edges.length));

  const seamX = cols > 1 ? 1 / cols : 0.5;
  const seamPt = evaluatePointAt(seamX, 0.5, inp, peakRef, 'Blend Bölgesi', 'blend', 'blend');

  const centerToCornerDropPct = r1(
    Math.max(0, Math.min(85, ((centerPoint.lux - cornerAvgLux) / Math.max(1, centerPoint.lux)) * 100 || (1 - u0Ratio) * 100))
  );

  return {
    avgLux: Math.round(avgLux),
    peakCenterLux: centerPoint.lux,
    cornerAvgLux,
    edgeAvgLux,
    blendSeamLux: seamPt.lux,
    blendSeamNits: seamPt.nits,
    centerToCornerDropPct,
    zones9,
  };
}

/* ============================================================================
 * 4. HATA VE UYGULANABİLİRLİK ANALİZİ (5 KATEGORİLİ MÜHENDİSLİK DENETİMİ)
 * ==========================================================================*/

export type FeasibilitySeverity = 'ok' | 'warning' | 'critical';

export interface SystemFeasibilityInput {
  widthM: number;
  heightM: number;
  throwDistM: number;
  throwRatio: number;
  lensThrowMin?: number;
  lensThrowMax?: number;
  maxRoomThrowM?: number;
  roomHeightM?: number;
  projMountHeightM?: number;
  viewDistM?: number;
  humanHeightM?: number;
  cols: number;
  rows: number;
  projW: number;
  projH: number;
  overlapPct: number;
  avgLux: number;
  minLux?: number;
  ambientLux?: number;
  uniformityU0?: number; // 0..1 veya 0..100
  keystoneDegH?: number;
  keystoneDegV?: number;
  isCurved?: boolean;
  hasInterProjectorOcclusion?: boolean;
}

export interface FeasibilityCategoryItem {
  id: 'lens_limits' | 'insufficient_brightness' | 'shadow_occlusion' | 'mounting_obstacles' | 'resolution_loss';
  title: string;
  severity: FeasibilitySeverity;
  badgeText: string;
  metricsText: string;
  issues: string[];
  actionText: string;
}

export interface SystemFeasibilityReport {
  overallScorePct: number;
  overallSeverity: FeasibilitySeverity;
  overallVerdict: string;
  criticalCount: number;
  warningCount: number;
  okCount: number;
  categories: FeasibilityCategoryItem[];
}

function worstSeverity(a: FeasibilitySeverity, b: FeasibilitySeverity): FeasibilitySeverity {
  if (a === 'critical' || b === 'critical') return 'critical';
  if (a === 'warning' || b === 'warning') return 'warning';
  return 'ok';
}

function badgeFor(sev: FeasibilitySeverity): string {
  if (sev === 'critical') return '⛔ Kritik Hata';
  if (sev === 'warning') return '⚠ Uyarı / Sınırda';
  return '✓ Uygun';
}

/**
 * 5 kritik uygulanabilirlik kategorisi için kapsamlı mühendislik denetimi yapar:
 * 1) Lens sınırları, 2) Yetersiz parlaklık, 3) Gölgelenme, 4) Montaj engelleri, 5) Çözünürlük kayıpları.
 */
export function evaluateSystemFeasibility(inp: SystemFeasibilityInput): SystemFeasibilityReport {
  const widthM = Math.max(0.2, inp.widthM || 1);
  const heightM = Math.max(0.2, inp.heightM || 1);
  const throwDistM = Math.max(0.2, inp.throwDistM || 1);
  const throwRatio = Math.max(0.15, inp.throwRatio || 0.8);
  const cols = Math.max(1, Math.round(inp.cols || 1));
  const rows = Math.max(1, Math.round(inp.rows || 1));
  const overlapPct = Math.max(0, Math.min(60, inp.overlapPct ?? 15));
  const u0Pct = normalizeU0Ratio(inp.uniformityU0) * 100;
  const ambientLux = Math.max(0, inp.ambientLux ?? 50);
  const roomH = inp.roomHeightM && inp.roomHeightM > 0 ? inp.roomHeightM : heightM + 0.6;
  const mountH = inp.projMountHeightM ?? Math.max(2.2, heightM - 0.15);
  const humanH = inp.humanHeightM ?? 1.75;
  const viewDist = inp.viewDistM ?? Math.max(1.5, throwDistM * 0.75);

  // --- 1. LENS SINIRLARI & FİZİKSEL YÜZEY KAPLAMA DOĞRULAMASI ---
  const lensIssues: string[] = [];
  let lensSev: FeasibilitySeverity = 'ok';
  const overlapRatio = overlapPct / 100;
  const neededTRForExact = r2(throwDistM / (widthM / Math.max(0.25, cols - (cols - 1) * overlapRatio)));
  const physCov = evaluatePhysicalCoverage({
    surfaceWidthM: widthM,
    surfaceHeightM: heightM,
    cols,
    rows,
    projW: inp.projW || 1920,
    projH: inp.projH || 1200,
    throwDistM,
    throwRatio,
    overlapX: overlapPct,
    overlapY: 0,
  });
  const coveragePct = Math.round(physCov.horizontalCoveragePct);

  if (inp.lensThrowMin !== undefined && inp.lensThrowMax !== undefined) {
    if (throwRatio < inp.lensThrowMin - 0.01 || throwRatio > inp.lensThrowMax + 0.01) {
      lensSev = worstSeverity(lensSev, 'critical');
      lensIssues.push(`Seçili TR (${throwRatio}:1), lensin [${inp.lensThrowMin}–${inp.lensThrowMax}:1] sınırları dışında.`);
    }
    if (neededTRForExact < inp.lensThrowMin - 0.02 || neededTRForExact > inp.lensThrowMax + 0.02) {
      lensSev = worstSeverity(lensSev, 'warning');
      lensIssues.push(`Duvarı tam doldurmak için gereken TR (${neededTRForExact}:1) aktif lens aralığını aşıyor.`);
    }
  }
  if (inp.maxRoomThrowM && inp.maxRoomThrowM > 0 && throwDistM > inp.maxRoomThrowM - 0.3) {
    lensSev = worstSeverity(lensSev, 'critical');
    lensIssues.push(`Atım mesafesi (${throwDistM}m), mekân derinliği sınırına (${inp.maxRoomThrowM}m) çarpıyor.`);
  }
  if (!physCov.isVerticalCovered) {
    lensSev = worstSeverity(lensSev, 'critical');
    lensIssues.push(
      `Dikey yüzey kaplama yetersiz (%${physCov.verticalCoveragePct}): görüntü yüksekliği ${physCov.coveredHeightM} m < duvar ${heightM} m (${r1(physCov.uncoveredHeightM * 100)} cm açık). Tam dikey kaplama için TR ≤ ${physCov.requiredThrowRatioForFullHeight}:1 (veya portrait/uzak atım) gerekir.`
    );
  }
  if (!physCov.isHorizontalCovered) {
    lensSev = worstSeverity(lensSev, coveragePct < 80 ? 'critical' : 'warning');
    lensIssues.push(`Yatay optik kaplama yüzeyin yalnızca %${physCov.horizontalCoveragePct}'ini dolduruyor; kenarlarda karanlık boşluk kalıyor.`);
  } else if (physCov.horizontalOverflowM > widthM * 0.18) {
    lensSev = worstSeverity(lensSev, 'warning');
    lensIssues.push(`Görüntü yüzeyden yatayda +${physCov.horizontalOverflowM} m taşıyor (optik kırpma / taşma).`);
  }

  const lensCat: FeasibilityCategoryItem = {
    id: 'lens_limits',
    title: '1. Lens Sınırları & Fiziksel Kaplama',
    severity: lensSev,
    badgeText: badgeFor(lensSev),
    metricsText: `TR ${throwRatio}:1 (Dikey Gerek: ${physCov.requiredThrowRatioForFullHeight}:1) · H %${physCov.horizontalCoveragePct} / V %${physCov.verticalCoveragePct}`,
    issues: lensIssues.length > 0 ? lensIssues : ['Lens atım oranı, zoom penceresi ve yatay/dikey fiziksel yüzey kaplaması uyumlu.'],
    actionText:
      lensSev === 'ok'
        ? 'Optik yerleşim ve tam yüzey kaplaması geçerli.'
        : !physCov.isVerticalCovered
          ? `TR ≤ ${physCov.requiredThrowRatioForFullHeight}:1 lens, daha uzak atım mesafesi veya dikey (portrait) montaj seçin.`
          : 'Otomatik öneriden daha kısa/geniş lens veya uygun cihaz sayısı seçin.',
  };

  // --- 2. YETERSİZ PARLAKLIK VE KONTRAST ---
  const brightIssues: string[] = [];
  let brightSev: FeasibilitySeverity = 'ok';
  const avgLux = Math.round(inp.avgLux || 0);
  const minLux = Math.round(inp.minLux ?? avgLux * (u0Pct / 100));
  const acr = ambientLux > 0 ? r1((avgLux + ambientLux) / ambientLux) : 0;

  if (avgLux < 200) {
    brightSev = worstSeverity(brightSev, 'critical');
    brightIssues.push(`Ortalama ekran aydınlığı (${avgLux} Lux) sergileme alt sınırı (200 Lux) altında.`);
  } else if (avgLux < 300) {
    brightSev = worstSeverity(brightSev, 'warning');
    brightIssues.push(`Ortalama aydınlık (${avgLux} Lux) yalnızca düşük/karartılmış ortamda yeterlidir (hedef ≥300 Lux).`);
  }
  if (ambientLux <= 0) {
    brightIssues.push('Ortam ışığı / cihaz doğal siyah seviyesi tanımlı olmadığından ACR doğrulanamadı (UNKNOWN).');
  } else if (acr < 7) {
    brightSev = worstSeverity(brightSev, 'critical');
    brightIssues.push(`Tahmini ortam kontrastı (ACR ${acr}:1 < 7:1) yetersiz; ortam ışığı görüntüyü yıkıyor.`);
  } else if (acr < 15) {
    brightSev = worstSeverity(brightSev, 'warning');
    brightIssues.push(`Tahmini ortam kontrastı (${acr}:1) video/grafik netliği için sınırda (hedef ≥15:1).`);
  }
  if (u0Pct < 60) {
    brightSev = worstSeverity(brightSev, 'critical');
    brightIssues.push(`Parlaklık düzgünlüğü U0 (%${r1(u0Pct)}) düşük; köşe aydınlığı (${minLux} lx) merkezden kopuyor.`);
  } else if (u0Pct < 75) {
    brightSev = worstSeverity(brightSev, 'warning');
    brightIssues.push(`Köşe düzgünlüğü U0 (%${r1(u0Pct)}) sergi standardı %75 altında.`);
  }

  const brightCat: FeasibilityCategoryItem = {
    id: 'insufficient_brightness',
    title: '2. Yetersiz Parlaklık ve Kontrast',
    severity: brightSev,
    badgeText: badgeFor(brightSev),
    metricsText: `Ort ${avgLux} Lux · Min ${minLux} lx · ${ambientLux > 0 ? `Tahmini Ortam ACR ${acr}:1` : 'ACR UNKNOWN'} · U0 %${r1(u0Pct)}`,
    issues: brightIssues.length > 0 ? brightIssues : ['Ekran aydınlığı, köşe dengesi ve ortam kontrastı ideal seviyede.'],
    actionText:
      brightSev === 'ok'
        ? 'Parlaklık hedefi karşılanıyor.'
        : 'Daha yüksek lümenli cihaz seçin, projektör ekleyin veya ortam ışığını düşürün.',
  };

  // --- 3. GÖLGELENME (İNSAN VE CİHAZ OKLÜZYONU) ---
  const shadowIssues: string[] = [];
  let shadowSev: FeasibilitySeverity = 'ok';
  let shadowHeightOnWall = 0;

  if (viewDist > 0.1 && viewDist < throwDistM - 0.05) {
    const distProjToViewer = throwDistM - viewDist;
    const tHit = throwDistM / Math.max(0.15, distProjToViewer);
    const shadowTopY = mountH + (humanH - mountH) * tHit;
    if (shadowTopY > 0.1) {
      shadowHeightOnWall = r2(Math.min(heightM, shadowTopY));
      const pctOfWall = Math.round((shadowHeightOnWall / heightM) * 100);
      if (pctOfWall >= 25 || shadowHeightOnWall >= 0.85) {
        shadowSev = worstSeverity(shadowSev, 'critical');
        shadowIssues.push(`İzleyici (${viewDist}m) ışık konisine giriyor; duvarda ${shadowHeightOnWall}m (%${pctOfWall}) insan gölgesi oluşuyor.`);
      } else {
        shadowSev = worstSeverity(shadowSev, 'warning');
        shadowIssues.push(`İzleyici hattında alt duvara ${shadowHeightOnWall}m hafif gölge düşme riski var.`);
      }
    }
  }
  if (inp.hasInterProjectorOcclusion) {
    shadowSev = worstSeverity(shadowSev, 'critical');
    shadowIssues.push('Karşı projektör gövdesi veya askı borusu diğer projektörün ışık yolunu kesiyor.');
  }

  const shadowCat: FeasibilityCategoryItem = {
    id: 'shadow_occlusion',
    title: '3. Gölgelenme (İnsan & Cihaz Oklüzyonu)',
    severity: shadowSev,
    badgeText: badgeFor(shadowSev),
    metricsText:
      shadowHeightOnWall > 0
        ? `İzleyici ${viewDist}m < Atım ${throwDistM}m · Gölge ${shadowHeightOnWall}m`
        : `İzleyici ${viewDist}m · Askı H=${r2(mountH)}m (Gölge Yok)`,
    issues: shadowIssues.length > 0 ? shadowIssues : ['İzleyici ve karşı cihaz ışık konisini kesmiyor.'],
    actionText:
      shadowSev === 'ok'
        ? 'Gölgesiz projeksiyon yolu.'
        : 'Kısa/UST atımlı lense geçin veya projektör askı kotunu yükseltin.',
  };

  // --- 4. MONTAJ ENGELLERİ VE FİZİKSEL KISITLAR ---
  const mountIssues: string[] = [];
  let mountSev: FeasibilitySeverity = 'ok';
  const pitchXM = cols > 1 ? widthM / cols : widthM;

  if (mountH > roomH - 0.12) {
    mountSev = worstSeverity(mountSev, 'critical');
    mountIssues.push(`Projektör montaj kotu (${r2(mountH)}m), oda tavan yüksekliğine (${r2(roomH)}m) sığmıyor (askı/şasi payı ≥0.15m gerekli).`);
  }
  if (mountH < 2.1) {
    mountSev = worstSeverity(mountSev, mountH < 1.8 ? 'critical' : 'warning');
    mountIssues.push(`Alçak montaj (${r2(mountH)}m): ziyaretçi sirkülasyonu ve göz kamaşma/çarpma riski.`);
  }
  if (cols > 1 && pitchXM < 0.6) {
    mountSev = worstSeverity(mountSev, pitchXM < 0.45 ? 'critical' : 'warning');
    mountIssues.push(`Cihazlar arası yatay aralık çok dar (${r2(pitchXM)}m < 0.60m); şasi ve bakım payı çakışıyor.`);
  }
  if (mountH > heightM + 0.5) {
    mountSev = worstSeverity(mountSev, 'warning');
    mountIssues.push(`Projektör yüksekliği yüzey üst kenarını (${r2(heightM)}m) +0.5m aşıyor; aşırı lens shift/keystone gerekir.`);
  }

  const mountCat: FeasibilityCategoryItem = {
    id: 'mounting_obstacles',
    title: '4. Montaj Engelleri ve Fiziksel Kısıtlar',
    severity: mountSev,
    badgeText: badgeFor(mountSev),
    metricsText: `Askı ${r2(mountH)}m / Tavan ${r2(roomH)}m · Aralık ${r2(pitchXM)}m`,
    issues: mountIssues.length > 0 ? mountIssues : ['Tavan payı, cihaz aralığı ve askı yüksekliği fiziksel olarak uygun.'],
    actionText:
      mountSev === 'ok'
        ? 'Montaj geometrisi uygulanabilir.'
        : 'Askı yüksekliğini ayarlayın, tavan kotunu kontrol edin veya cihaz aralığını açın.',
  };

  // --- 5. ÇÖZÜNÜRLÜK VE PİKSEL KAYIPLARI ---
  const resIssues: string[] = [];
  let resSev: FeasibilitySeverity = 'ok';
  const pixStats = computeEffectiveMultiProjectorPixelArea({
    widthM,
    heightM,
    projW: inp.projW,
    projH: inp.projH,
    cols,
    rows,
    overlapPctX: overlapPct,
    keystoneDegH: inp.keystoneDegH,
    keystoneDegV: inp.keystoneDegV,
    isCurved: inp.isCurved,
  });

  if (cols > 1 && overlapPct < 8) {
    resSev = worstSeverity(resSev, 'critical');
    resIssues.push(`Blend overlap oranı (%${overlapPct}) %8 altında; iki projektör arasında belirgin parlak dikiş izi kalır.`);
  } else if (cols > 1 && overlapPct > 32) {
    resSev = worstSeverity(resSev, 'warning');
    resIssues.push(`Yüksek overlap (%${overlapPct}) nedeniyle toplam piksel alanının %${pixStats.overlapLostPct}'i bindirmede harcanıyor.`);
  }
  if (pixStats.geometricLossPct > 15) {
    resSev = worstSeverity(resSev, pixStats.geometricLossPct > 28 ? 'critical' : 'warning');
    resIssues.push(`Keystone/Warp düzeltmesi efektif içeriğin %${pixStats.geometricLossPct}'ini kestiriyor.`);
  }
  if (viewDist > 0 && pixStats.mmPerPx > viewDist * 0.9) {
    resSev = worstSeverity(resSev, 'warning');
    resIssues.push(`Piksel boyutu (${pixStats.mmPerPx} mm/px), ${viewDist}m izleme mesafesi için kaba kalıyor.`);
  }

  const resCat: FeasibilityCategoryItem = {
    id: 'resolution_loss',
    title: '5. Çözünürlük ve Piksel Kayıpları',
    severity: resSev,
    badgeText: badgeFor(resSev),
    metricsText: `Efektif ${pixStats.usableContentW}×${pixStats.usableContentH} px · Verim %${pixStats.totalRetentionPct} · ${pixStats.mmPerPx} mm/px`,
    issues: resIssues.length > 0 ? resIssues : ['Overlap verimliliği ve efektif içerik çözünürlüğü dengeli.'],
    actionText:
      resSev === 'ok'
        ? 'Piksel bütçesi verimli kullanılıyor.'
        : 'Overlap değerini %12–22 bandına çekin, keystone yerine optik lens shift kullanın.',
  };

  const categories = [lensCat, brightCat, shadowCat, mountCat, resCat];
  const criticalCount = categories.filter(c => c.severity === 'critical').length;
  const warningCount = categories.filter(c => c.severity === 'warning').length;
  const okCount = categories.filter(c => c.severity === 'ok').length;

  const overallSeverity: FeasibilitySeverity =
    criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'ok';
  const overallScorePct = Math.max(
    10,
    Math.min(100, 100 - criticalCount * 22 - warningCount * 9)
  );

  let overallVerdict = 'Tüm 5 kriterden geçti — saha kurulumuna hazır.';
  if (criticalCount > 0) {
    overallVerdict = `${criticalCount} kritik engel tespit edildi; kurulum öncesi revizyon şart.`;
  } else if (warningCount > 0) {
    overallVerdict = `Kurulabilir, ancak ${warningCount} başlıkta optimizasyon önerilir.`;
  }

  return {
    overallScorePct,
    overallSeverity,
    overallVerdict,
    criticalCount,
    warningCount,
    okCount,
    categories,
  };
}
