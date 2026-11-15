import { solveProjection } from './throw';
import { evaluatePhysicalCoverage, PhysicalCoverageResult } from './physicalCoverage';
import { computeSurfacePointLuxDistribution, SurfacePointLuxResult } from './feasibility';
import { computeViewingQualityAnalysis, ViewingQualityResult } from './lux';
import { computePixelMapSummary } from './multiproj';
import { analyze as analyzeElectrical, ElectricalResult } from './electrical';
import { DEFAULT_SECTIONS } from './report';
import { validateReportConsistency, ReportValidationResult } from './reportValidation';
import {
  analyzeFootprintOverlaps,
  buildGridFootprints,
  buildMeasuredIlluminance,
  buildSimulatedIlluminance,
  buildTheoreticalIlluminance,
  computeContentCanvas,
  computeContrastAnalysis,
  computeLuminanceFromSource,
  normalizedBlendWeights,
  validateLensZoomMargin,
  ContentCanvasResult,
  ContrastAnalysis,
  FootprintOverlapAnalysis,
  IlluminanceRecord,
  LuminanceRecord,
  ProjectorFootprint,
  TargetSurface,
  ProjectedFootprint,
  ActiveProjectionArea,
  BlendedRaster,
  ContentCanvas,
  MappedContentArea,
  LensCatalogEntry,
  DetailedPixelMapMetrics,
} from './projectionGeometry';

export const CALCULATION_ENGINE_VERSION = '2.5.0';

export interface CentralDesignInput {
  scenarioId?: string;
  projectName?: string;
  room: { widthM: number; lengthM: number; heightM: number };
  surface: {
    id?: string;
    name: string;
    widthM: number;
    heightM: number;
    viewingDistanceM: number;
  };
  projector: {
    model: string;
    cols: number;
    rows: number;
    nativeW: number;
    nativeH: number;
    ansiLumensPerUnit: number;
    powerWPerUnit: number;
    nativeContrast?: number;
    orient?: 'landscape' | 'portrait';
    projectorPositionsX?: number[];
  };
  lens: {
    model: string;
    throwDistM: number;
    throwRatio: number;
    throwMin?: number;
    throwMax?: number;
    lensShiftVMaxPct?: number;
    lensShiftHMaxPct?: number;
    transmissionPct?: number;
  };
  photometrics: {
    opticalEfficiencyPct?: number;
    screenGain?: number;
    reflectance?: number;
    ambientLux?: number;
    uniformityU0Pct?: number;
    /** Saha lüksmetre ölçümleri (lx) — Teorik/Simüle değerlerin yerine KULLANILMAZ */
    measuredLuxSamples?: number[];
  };
  blending: {
    overlapPctX: number;
    overlapPctY?: number;
    gamma?: number;
  };
  electrical: {
    supplyVoltageV?: number;
    phases?: 1 | 3;
    pf?: number;
    cableLengthM?: number;
    cableMm2?: number;
    ampacityA?: number;
    shortCircuitVerified?: boolean;
    selectivityVerified?: boolean;
  };
}

export interface ProjectorDistributionRecord {
  projectorId: string;
  surfaceId: string;
  scenarioId: string;
  positionX_M: number;
  positionY_M: number;
  positionZ_M: number;
  throwDistM: number;
  imageWidthM: number;
  imageHeightM: number;
  throwRatio: number;
  coverageStartX_M: number;
  coverageEndX_M: number;
  coverageStartY_M: number;
  coverageEndY_M: number;
  overlapLeftM: number;
  overlapRightM: number;
}

export interface ScenarioComparisonItem {
  projectorCount: number;
  cols: number;
  rows: number;
  singleImageWidthM: number;
  singleImageHeightM: number;
  blendedRasterW: number;
  blendedRasterH: number;
  blendedMp: number;
  contentCanvasW: number;
  contentCanvasH: number;
  contentMp: number;
  netPixelEfficiencyPct: number;
  totalLumensNominal: number;
  totalLumensEffective: number;
  surfaceAreaM2: number;
  activeProjectionAreaM2: number;
  theoreticalAvgLux: number;
  activeAvgLux: number;
  powerW: number;
  ppdH: number;
  ppdV: number;
  verticalCoveragePct: number;
  horizontalCoveragePct: number;
  lensCatalogStatus: 'PASS' | 'FAIL' | 'UNKNOWN';
  notes: string;
}

export interface CentralDesignResult {
  traceability: {
    scenarioId: string;
    surfaceId: string;
    engineVersion: string;
  };
  singleSourceGeometry: {
    targetSurface: TargetSurface;
    projectedFootprint: ProjectedFootprint[];
    activeProjectionArea: ActiveProjectionArea;
    blendedRaster: BlendedRaster;
    contentCanvas: ContentCanvas;
    mappedContentArea: MappedContentArea;
  };
  roomGeometry: CentralDesignInput['room'];
  surfaceGeometry: {
    name: string;
    widthM: number;
    heightM: number;
    areaM2: number;
    aspectRatio: number;
  };
  projectorSpecs: {
    model: string;
    count: number;
    cols: number;
    rows: number;
    nativeW: number;
    nativeH: number;
    ansiLumensPerUnit: number;
    totalAnsiLumens: number;
    powerWPerUnit: number;
    totalPowerW: number;
  };
  lensSpecs: {
    model: string;
    throwDistM: number;
    throwRatio: number;
    hasCatalogRange: boolean;
    throwMin?: number;
    throwMax?: number;
    inZoomRange: boolean | null;
    singleImageWidthM: number;
    singleImageHeightM: number;
    catalogStatus: 'PASS' | 'FAIL' | 'UNKNOWN';
    zoomMarginPct?: number;
    zoomMarginWarning?: string;
  };
  physicalCoverage: PhysicalCoverageResult;
  photometricModel: {
    opticalEfficiencyPct: number;
    lensTransmissionPct: number;
    effectiveTotalLumens: number;
    theoreticalAvgLux: number;
    gridIntegratedAvgLux: number;
    gridMinLux: number;
    gridMaxLux: number;
    photometricStatus: 'SIMULATION / APPROXIMATION';
    ninePointEqualAvgLux: number;
    ninePointWeightedAvgLux: number;
    singleProjectorAvgContributionLux: number;
    u0Pct: number;
    u1Pct: number;
    idealNits: number;
    realisticNits: number;
    ambientBlackNits: number;
    projectorBlackNits: number | null;
    acr: number | null;
    acrVerified: boolean;
    pointDistribution: SurfacePointLuxResult;
  };
  /** 8 Ayrı Aydınlık Kaynağı (Birbirinin yerine kullanılamaz) */
  photometricSources: {
    nominalTotalLumens: number;
    effectiveTotalLumens: number;
    theoreticalAvgLux: number;
    theoreticalActiveAvgLux: number;
    theoreticalSurfaceAvgLux: number;
    simulated9PointEqualAvgLux: number;
    simulated9PointWeightedAvgLux: number;
    simulatedGridAvgLux: number;
    measuredLux: number | null;
  };
  /** A: Aktif Projeksiyon Alanı Homojenliği */
  activeProjectionUniformity: {
    minLux: number;
    maxLux: number;
    avgLux: number;
    u0Pct: number;
    u1Pct: number;
    sampleCount: number;
    verdict: 'PASS' | 'FAIL';
  };
  /** B: Tüm Fiziksel Yüzey Homojenliği (Kapsanmayan bölgeler 0 lx) */
  fullSurfaceUniformity: {
    minLux: number;
    maxLux: number;
    avgLux: number;
    u0Pct: number;
    u1Pct: number;
    zeroCellCount: number;
    totalCellCount: number;
    verdict: 'PASS' | 'FAIL';
    message: string;
  };
  /** Renk ve Blend Parametre Kaynak Güvenilirliği */
  colorAndBlend: {
    deltaE2000: number | null;
    deltaE2000Status: 'VERIFIED' | 'UNKNOWN' | 'ASSUMED' | 'NOT_MEASURED';
    deltaCctK: number | null;
    deltaCctStatus: 'VERIFIED' | 'UNKNOWN' | 'ASSUMED' | 'NOT_MEASURED';
    colorUniformityPct: number | null;
    colorUniformityStatus: 'VERIFIED' | 'UNKNOWN' | 'ASSUMED' | 'NOT_MEASURED';
    blendTransitionStatus: 'VERIFIED' | 'UNKNOWN' | 'ASSUMED' | 'NOT_MEASURED';
    gamma: number;
    gammaStatus: 'VERIFIED' | 'UNKNOWN' | 'ASSUMED' | 'NOT_MEASURED';
  };
  scenarioComparison: ScenarioComparisonItem[];
  pixelMapping: {
    nativeRaster: { w: number; h: number; mp: number };
    rawAggregateRaster: { w: number; h: number; mp: number };
    blendedRaster: {
      w: number;
      h: number;
      mp: number;
      pxPerMeterW: number;
      pxPerMeterH: number;
      mmPerPxW: number;
      mmPerPxH: number;
      anisotropyRatio: number;
      anisotropyDiffPct: number;
    };
    surfaceContentRaster: {
      w: number;
      h: number;
      mp: number;
      pxPerMeterW: number;
      pxPerMeterH: number;
      mmPerPxW: number;
      mmPerPxH: number;
      ppi: number;
      aspectRatio: number;
    };
    cropFromBlendedPxW: number;
    cropFromBlendedPxH: number;
    targetSurface: {
      widthM: number;
      heightM: number;
      areaM2: number;
      pxPerMeterW: number;
      pxPerMeterH: number;
      mmPerPxW: number;
      mmPerPxH: number;
      pxPerSqMeter: number;
      anisotropyDiffPct: number;
    };
    activeProjectionArea: {
      widthM: number;
      heightM: number;
      areaM2: number;
      pxPerMeterW: number;
      pxPerMeterH: number;
      mmPerPxW: number;
      mmPerPxH: number;
      pxPerSqMeter: number;
      anisotropyDiffPct: number;
    };
  };
  projectorDistribution: ProjectorDistributionRecord[];
  edgeBlending: {
    adjacentZoneCount: number;
    overlapPctX: number;
    overlapPctOfSingleProjectorW: number;
    overlapPctOfTotalRawRaster: number;
    overlapPctOfPhysicalImageW: number;
    overlapPixelsX: number;
    overlapMetersPerSeam: number;
    totalOverlapMeters: number;
    netRasterW: number;
    overlapRegions: Array<{ pair: string; overlapPx: number; overlapM: number }>;
    gamma: number;
    midpointDrivePct: number;
  };
  viewingQuality: ViewingQualityResult & {
    ppdH: number;
    ppdV: number;
    minAxisPpd: number;
    targetSurfacePpd?: { ppdH: number; ppdV: number; fovH: number; fovV: number };
    activeProjectionPpd?: { ppdH: number; ppdV: number; fovH: number; fovV: number };
    contentCanvasPpd?: { ppdH: number; ppdV: number };
  };
  electricalLoad: {
    phases: 1 | 3;
    voltageV: number;
    totalPowerW: number;
    phaseCurrentA: number;
    maxVoltageDropPct: number;
    protectionStatus: 'PASS' | 'UNKNOWN';
    analysis: ElectricalResult;
  };
  crossValidation: ReportValidationResult;
  /** Tek kanvas geometrisi (içerik kanvası, H/V px/m, mm/px, px/m², MP) */
  contentCanvas: ContentCanvasResult;
  /** Tüm projektör ayak izi poligonları ve çoklu (üçlü dahil) kesişimler */
  overlapGeometry: FootprintOverlapAnalysis;
  /** Teorik / Simüle LuxField / Ölçülen aydınlık — birbirinin yerine kullanılmaz */
  illuminance: {
    theoretical: IlluminanceRecord;
    simulated: IlluminanceRecord;
    measured: IlluminanceRecord;
    ninePoint: { luxFieldId: string; equalMeanLux: number; weightedMeanLux: number; minLux: number; maxLux: number; sampleCount: number };
  };
  /** Kaynak etiketli parlaklık (nit) */
  luminance: {
    theoretical: LuminanceRecord;
    simulated: LuminanceRecord;
    measured: LuminanceRecord;
  };
  contrast: ContrastAnalysis;
  calculationTrace: CalculationTraceEntry[];
}

export interface CalculationTraceEntry {
  step: string;
  formula: string;
  inputs: string;
  result: string;
  status: 'PASS' | 'WARNING' | 'FAIL' | 'UNKNOWN';
  scenarioId: string;
  surfaceId: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function evaluateCentralProjectionDesign(inp: CentralDesignInput): CentralDesignResult {
  const cols = Math.max(1, Math.round(inp.projector.cols));
  const rows = Math.max(1, Math.round(inp.projector.rows));
  const pjCount = cols * rows;
  const pW = Math.max(1, inp.projector.nativeW);
  const pH = Math.max(1, inp.projector.nativeH);
  const wM = Math.max(0.1, inp.surface.widthM);
  const hM = Math.max(0.1, inp.surface.heightM);
  const areaM2 = r2(wM * hM);

  const solvedLens = solveProjection({
    imageWidth: inp.lens.throwDistM / Math.max(0.05, inp.lens.throwRatio),
    distance: inp.lens.throwDistM,
    aspect: { w: pW, h: pH },
    throwRange:
      inp.lens.throwMin && inp.lens.throwMax
        ? { min: inp.lens.throwMin, max: inp.lens.throwMax }
        : undefined,
  });

  const hasCatalogRange = Boolean(
    inp.lens.throwMin && inp.lens.throwMax && inp.lens.throwMin > 0 && inp.lens.throwMax >= inp.lens.throwMin
  );
  const inZoomRange = hasCatalogRange
    ? inp.lens.throwRatio >= (inp.lens.throwMin as number) - 0.01 &&
      inp.lens.throwRatio <= (inp.lens.throwMax as number) + 0.01
    : null;
  const catalogStatus: 'PASS' | 'FAIL' | 'UNKNOWN' = !hasCatalogRange
    ? 'UNKNOWN'
    : inZoomRange
      ? 'PASS'
      : 'FAIL';

  const imgWExact = inp.lens.throwDistM / Math.max(0.05, inp.lens.throwRatio);
  const imgHExact = imgWExact * (pH / pW);
  const optPxmH = pW / Math.max(0.01, imgWExact);
  const optPxmV = pH / Math.max(0.01, imgHExact);

  const posX = inp.projector.projectorPositionsX;
  const hasPosX = Array.isArray(posX) && posX.length >= cols && cols > 1;
  const ovXPctRaw = hasPosX
    ? Math.max(0, Math.min(99.5, ((imgWExact - Math.max(0, posX![1] - posX![0])) / Math.max(0.01, imgWExact)) * 100))
    : (cols > 1 ? Math.max(0, Math.min(99.5, inp.blending.overlapPctX)) : 0);
  const ovXPct = r2(ovXPctRaw);
  const ovYPct = rows > 1 ? Math.max(0, Math.min(99.5, inp.blending.overlapPctY ?? 0)) : 0;
  const ovPxXExact = cols > 1 ? pW * (ovXPctRaw / 100) : 0;
  const ovPxX = Math.round(ovPxXExact);
  const ovPxY = rows > 1 ? Math.round(pH * (ovYPct / 100)) : 0;

  const physCov = evaluatePhysicalCoverage({
    surfaceWidthM: wM,
    surfaceHeightM: hM,
    cols,
    rows,
    projW: pW,
    projH: pH,
    throwDistM: inp.lens.throwDistM,
    throwRatio: inp.lens.throwRatio,
    overlapX: ovXPct,
    overlapY: ovYPct,
    ovPxX,
    ovPxY,
  });

  // Pixel Mapping: 1. Native, 2. Blended (erken yuvarlama olmadan), 3. Surface Content Raster
  const rawW = cols * pW;
  const rawH = rows * pH;
  const blendedW = Math.max(1, Math.round(rawW - Math.max(0, cols - 1) * ovPxXExact));
  const blendedH = Math.max(1, rows * pH - Math.max(0, rows - 1) * ovPxY);

  const surfaceAspect = wM / hM;
  // Tek kanvas geometrisi: içerik kanvası ve tüm H/V yoğunlukları aynı fonksiyondan türetilir
  const contentCanvasRes = computeContentCanvas({
    rasterW: blendedW,
    rasterH: blendedH,
    opticalPxPerMeterH: optPxmH,
    opticalPxPerMeterV: optPxmV,
    surfaceWidthM: wM,
    surfaceHeightM: hM,
    activeWidthM: physCov.coveredWidthM,
    activeHeightM: physCov.coveredHeightM,
    surfaceId: inp.surface.id || 'SURF-01',
    rasterId: `RASTER-BLENDED-${cols}x${rows}`,
  });
  const contentW = contentCanvasRes.contentCanvas.w;
  const contentH = contentCanvasRes.contentCanvas.h;

  const pmSlots = Array.from({ length: pjCount }, (_, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    return {
      id: `PJ-${idx + 1}`,
      label: `PJ-${idx + 1}`,
      x: c * Math.max(1, pW - ovPxX),
      y: r * Math.max(1, pH - ovPxY),
      w: pW,
      h: pH,
      blend: { l: c > 0 ? ovPxX : 0, r: c < cols - 1 ? ovPxX : 0, t: r > 0 ? ovPxY : 0, b: r < rows - 1 ? ovPxY : 0 },
    };
  });
  computePixelMapSummary({ slots: pmSlots, wallWidthM: wM, wallHeightM: hM });

  const activeCovW = Math.max(0.01, physCov.coveredWidthM);
  const activeCovH = Math.max(0.01, physCov.coveredHeightM);
  const blPxmW = r1(blendedW / activeCovW);
  const blPxmH = r1(blendedH / activeCovH);
  const anisoRatio = r3(Math.max(blPxmW, blPxmH) / Math.max(0.1, Math.min(blPxmW, blPxmH)));
  const anisoDiffPct = r2((Math.abs(blPxmW - blPxmH) / Math.max(0.1, blPxmW, blPxmH)) * 100);

  const cntPxmW = r1(contentW / wM);
  const cntPxmH = r1(contentH / hM);
  const cntMmW = r3((wM * 1000) / Math.max(1, contentW));
  const cntMmH = r3((hM * 1000) / Math.max(1, contentH));
  const cntPpi = r1(25.4 / Math.max(0.01, (cntMmW + cntMmH) / 2));

  // Photometrics
  const optEffPct = inp.photometrics.opticalEfficiencyPct ?? 90;
  const transPct = inp.lens.transmissionPct ?? 100;
  const gain = inp.photometrics.screenGain ?? 1.0;
  const refl = inp.photometrics.reflectance ?? 0.85;
  const ambLux = inp.photometrics.ambientLux ?? 20;

  const totalAnsiLumens = pjCount * inp.projector.ansiLumensPerUnit;
  const effectiveTotalLumens = Math.round(totalAnsiLumens * (optEffPct / 100) * (transPct / 100));
  const theoreticalAvgLux = r2(effectiveTotalLumens / areaM2);
  const theoreticalActiveAvgLux = r2(effectiveTotalLumens / Math.max(0.01, physCov.coveredWidthM * physCov.coveredHeightM));

  const ptDist = computeSurfacePointLuxDistribution({
    widthM: wM,
    heightM: hM,
    cols,
    rows,
    avgLux: theoreticalAvgLux,
    uniformityU0: inp.photometrics.uniformityU0Pct ?? 82,
    overlapPct: ovXPct,
    screenGain: gain,
    reflectance: refl,
    ambientLux: ambLux,
  });

  const eq9Mean = Math.round(ptDist.zones9.reduce((a, z) => a + z.lux, 0) / Math.max(1, ptDist.zones9.length));
  const w9Mean = Math.round(
    ptDist.zones9.reduce((a, z) => {
      const w = z.zoneKind === 'center' ? 4 : z.zoneKind === 'edge' ? 2 : 1;
      return a + z.lux * w;
    }, 0) / 16
  );

  const idealNits = r1((theoreticalAvgLux * gain) / Math.PI);
  const realisticNits = r1((theoreticalAvgLux * gain * refl) / Math.PI);
  const ambBlackNits = r2((ambLux * gain * refl) / Math.PI);
  const hasNativeContrast = Boolean(inp.projector.nativeContrast && inp.projector.nativeContrast > 0);
  const pjBlackNits = hasNativeContrast ? r2(realisticNits / (inp.projector.nativeContrast as number)) : null;
  const totalBlackNits = ambBlackNits + (pjBlackNits ?? 0);
  const acr = totalBlackNits > 0 ? r1((realisticNits + totalBlackNits) / totalBlackNits) : null;

  // Edge Blending
  const adjacentZones = Math.max(0, (cols - 1) * rows + (rows - 1) * cols);
  const gamma = inp.blending.gamma ?? 2.2;
  const midpointDrivePct = r1(Math.pow(0.5, 1 / gamma) * 100);
  const overlapMetersPerSeam = cols > 1 ? r3(imgWExact * (ovXPct / 100)) : 0;

  const luxGrid = computeLuxSimulationGrid(inp, 24, 12);
  const luxNine = sampleNinePointsFromLuxGrid(luxGrid, wM, hM, gain, refl);

  // Kaynak ayrımı: Teorik ≠ Simüle LuxField ≠ Ölçüm
  const theoreticalRec = buildTheoreticalIlluminance(totalAnsiLumens, optEffPct * (transPct / 100), areaM2);
  const simulatedRec = buildSimulatedIlluminance(luxGrid);
  const measuredRec = buildMeasuredIlluminance(inp.photometrics.measuredLuxSamples, areaM2);
  const lumTheoretical = computeLuminanceFromSource(theoreticalRec, gain, refl);
  const lumSimulated = computeLuminanceFromSource(simulatedRec, gain, refl);
  const lumMeasured = computeLuminanceFromSource(measuredRec, gain, refl);
  // ACR beyaz seviyesi: ölçüm varsa ölçüm, yoksa simüle LuxField (teorik değil)
  const contrastAnalysis = computeContrastAnalysis({
    white: lumMeasured.nits !== null ? lumMeasured : lumSimulated,
    ambientLux: inp.photometrics.ambientLux,
    gain,
    reflectance: refl,
    nativeContrast: inp.projector.nativeContrast ?? null,
  });

  // Çoklu overlap geometrisi (aynı ayak izi modeli LuxField ile paylaşılır)
  const overlapGeometry = analyzeFootprintOverlaps(
    buildGridFootprints({
      cols,
      rows,
      imageWidthM: imgWExact,
      imageHeightM: imgHExact,
      overlapFracX: ovXPct / 100,
      overlapFracY: ovYPct / 100,
      surfaceHeightM: hM,
      positionsX: inp.projector.projectorPositionsX,
    }),
    wM,
    hM,
    cols
  );

  // Zoom Limit Kontrolü (%5 marj uyarısı)
  const zoomMargin = hasCatalogRange && inp.lens.throwMin && inp.lens.throwMax
    ? validateLensZoomMargin(inp.lens.throwRatio, inp.lens.throwMin, inp.lens.throwMax)
    : undefined;

  // 1. Tek Kaynaklı Geometri Nesneleri
  const targetSurfaceObj: TargetSurface = {
    surfaceId: inp.surface.id || 'SURF-01',
    name: inp.surface.name,
    widthM: wM,
    heightM: hM,
    areaM2: areaM2,
    aspectRatio: r3(wM / hM),
  };
  const projectedFootprintObj: ProjectedFootprint[] = overlapGeometry.footprints.map(f => ({
    projectorId: f.projectorId,
    x0: f.x0,
    x1: f.x1,
    y0: f.y0,
    y1: f.y1,
    widthM: r3(f.x1 - f.x0),
    heightM: r3(f.y1 - f.y0),
    areaM2: r3((f.x1 - f.x0) * (f.y1 - f.y0)),
  }));
  const activeProjectionAreaObj: ActiveProjectionArea = {
    surfaceId: targetSurfaceObj.surfaceId,
    widthM: physCov.coveredWidthM,
    heightM: physCov.coveredHeightM,
    areaM2: r2(physCov.coveredWidthM * physCov.coveredHeightM),
    aspectRatio: r3(physCov.coveredWidthM / Math.max(0.01, physCov.coveredHeightM)),
    x0: 0,
    x1: physCov.coveredWidthM,
    y0: r3((hM - physCov.coveredHeightM) / 2),
    y1: r3((hM - physCov.coveredHeightM) / 2 + physCov.coveredHeightM),
    topMarginM: r3(Math.max(0, (hM - physCov.coveredHeightM) / 2)),
    bottomMarginM: r3(Math.max(0, (hM - physCov.coveredHeightM) / 2)),
    leftMarginM: 0,
    rightMarginM: 0,
    verticalCoveragePct: physCov.verticalCoveragePct,
    horizontalCoveragePct: physCov.horizontalCoveragePct,
    areaCoveragePct: r2(((physCov.coveredWidthM * physCov.coveredHeightM) / areaM2) * 100),
    uncoveredHeightM: physCov.uncoveredHeightM,
    uncoveredWidthM: physCov.uncoveredWidthM,
    uncoveredAreaM2: r2(Math.max(0, areaM2 - physCov.coveredWidthM * physCov.coveredHeightM)),
  };
  const blendedRasterObj: BlendedRaster = {
    rasterId: `RASTER-BLENDED-${cols}x${rows}`,
    w: blendedW,
    h: blendedH,
    mp: r2((blendedW * blendedH) / 1e6),
    aspectRatio: r3(blendedW / blendedH),
    pxPerMeterH: contentCanvasRes.detailedMetrics?.activeRaster.pxPerMeterH ?? r1(blendedW / physCov.coveredWidthM),
    pxPerMeterV: contentCanvasRes.detailedMetrics?.activeRaster.pxPerMeterV ?? r1(blendedH / physCov.coveredHeightM),
    mmPerPxH: contentCanvasRes.detailedMetrics?.activeRaster.mmPerPxH ?? r3(1000 / (blendedW / physCov.coveredWidthM)),
    mmPerPxV: contentCanvasRes.detailedMetrics?.activeRaster.mmPerPxV ?? r3(1000 / (blendedH / physCov.coveredHeightM)),
    pxPerSqMeter: contentCanvasRes.detailedMetrics?.activeRaster.pxPerSqMeter ?? Math.round((blendedW * blendedH) / (physCov.coveredWidthM * physCov.coveredHeightM)),
    ppi: contentCanvasRes.detailedMetrics?.activeRaster.ppi ?? r1(25.4 / (1000 / (blendedW / physCov.coveredWidthM))),
    anisotropyPct: contentCanvasRes.detailedMetrics?.activeRaster.anisotropyPct ?? anisoDiffPct,
  };
  const contentCanvasObj: ContentCanvas = {
    canvasId: `CANVAS-CONTENT-${targetSurfaceObj.surfaceId}`,
    targetSurfaceId: targetSurfaceObj.surfaceId,
    w: contentW,
    h: contentH,
    mp: r2((contentW * contentH) / 1e6),
    aspectRatio: r3(contentW / contentH),
    pxPerMeterH: contentCanvasRes.pxPerMeterH,
    pxPerMeterV: contentCanvasRes.pxPerMeterV,
    mmPerPxH: contentCanvasRes.mmPerPxH,
    mmPerPxV: contentCanvasRes.mmPerPxV,
    pxPerSqMeter: contentCanvasRes.pxPerSqMeter,
    ppi: contentCanvasRes.ppi,
    anisotropyPct: contentCanvasRes.anisotropyPct,
    mode: 'square-pixel-fit',
    cropFromBlendedPxW: Math.max(0, blendedW - contentW),
    cropFromBlendedPxH: Math.max(0, blendedH - contentH),
    letterboxPadPxW: 0,
    letterboxPadPxH: 0,
    increasesPhysicalCoverage: false,
  };
  const mappedContentAreaObj: MappedContentArea = {
    canvasId: contentCanvasObj.canvasId,
    surfaceId: targetSurfaceObj.surfaceId,
    mappedWidthM: wM,
    mappedHeightM: hM,
    mappedAreaM2: areaM2,
    scaleX: 1,
    scaleY: 1,
  };

  // 8 Ayrı Aydınlık Kaynağı
  const photometricSources = {
    nominalTotalLumens: totalAnsiLumens,
    effectiveTotalLumens,
    theoreticalAvgLux,
    theoreticalActiveAvgLux,
    theoreticalSurfaceAvgLux: theoreticalAvgLux,
    simulated9PointEqualAvgLux: luxNine.equalMeanLux,
    simulated9PointWeightedAvgLux: luxNine.weightedMeanLux,
    simulatedGridAvgLux: luxGrid.avgLux,
    measuredLux: inp.photometrics.measuredLuxSamples && inp.photometrics.measuredLuxSamples.length > 0 ? measuredRec.avgLux : null,
  };

  // A: Aktif Projeksiyon Homojenliği
  const activeProjectionUniformity = {
    minLux: luxNine.minLux,
    maxLux: luxNine.maxLux,
    avgLux: luxNine.equalMeanLux,
    u0Pct: luxNine.u0Pct,
    u1Pct: luxNine.u1Pct,
    sampleCount: 9,
    verdict: (luxNine.u0Pct >= 70 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
  };

  // B: Tüm Fiziksel Yüzey Homojenliği (Kapsanmayan bölgeler U0'ı düşürür)
  const fullSurfaceMin = luxGrid.zeroCellCount > 0 ? 0 : luxGrid.minLux;
  const fullSurfaceU0 = luxGrid.u0Pct;
  const fullSurfaceU1 = luxGrid.u1Pct;
  const isFullCovered = physCov.status === 'pass' && luxGrid.zeroCellCount === 0;

  const fullSurfaceUniformity = {
    minLux: fullSurfaceMin,
    maxLux: luxGrid.maxLux,
    avgLux: luxGrid.avgLux,
    u0Pct: fullSurfaceU0,
    u1Pct: fullSurfaceU1,
    zeroCellCount: luxGrid.zeroCellCount,
    totalCellCount: luxGrid.totalCellCount,
    verdict: (isFullCovered && fullSurfaceU0 >= 60 ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
    message: isFullCovered
      ? `Tüm yüzey homojenliği PASS (U0=%${fullSurfaceU0}, sıfır hücre yok).`
      : `Tüm yüzey homojenliği FAIL: Yüzeyde aydınlatılmayan açık alan mevcuttur (fiziksel kaplama %${physCov.verticalCoveragePct} V, U0=%${fullSurfaceU0}).`,
  };

  // Renk ve Blend Parametre Kaynak Durumları
  const colorAndBlend = {
    deltaE2000: null,
    deltaE2000Status: 'UNKNOWN' as const,
    deltaCctK: null,
    deltaCctStatus: 'UNKNOWN' as const,
    colorUniformityPct: null,
    colorUniformityStatus: 'UNKNOWN' as const,
    blendTransitionStatus: 'UNKNOWN' as const,
    gamma,
    gammaStatus: 'ASSUMED' as const,
  };

  // Senaryo Karşılaştırması (2, 3, 4 Projektör) — Aynı fiziksel yüzey alanı ve lümen modeli
  const scenarioComparison: ScenarioComparisonItem[] = [2, 3, 4].map(count => {
    const sW_pj = inp.lens.throwRatio > 0 ? inp.lens.throwDistM / inp.lens.throwRatio : wM / count;
    const sH_pj = sW_pj * (pH / pW);
    const ovPct = count === 2 ? 15 : count === 3 ? 18.75 : 20;
    const ovPx = Math.round(pW * (ovPct / 100));
    const blW = Math.round(count * pW - (count - 1) * ovPx);
    const blH = pH;
    const blMp = r2((blW * blH) / 1e6);
    const sqPxmV = blH / hM;
    const cntW = Math.round(wM * sqPxmV);
    const cntH = blH;
    const cntMp = r2((cntW * cntH) / 1e6);
    const effPct = r1((cntMp / Math.max(0.1, count * (pW * pH / 1e6))) * 100);
    const power = count * inp.projector.powerWPerUnit;
    const covH = r1(Math.min(100, ((sW_pj * count - (count - 1) * sW_pj * (ovPct / 100)) / wM) * 100));
    const covV = r1(Math.min(100, (sH_pj / hM) * 100));
    const fovH = 2 * Math.atan(wM / (2 * inp.surface.viewingDistanceM)) * (180 / Math.PI);
    const fovV = 2 * Math.atan(hM / (2 * inp.surface.viewingDistanceM)) * (180 / Math.PI);
    const ppdH_sc = r1(cntW / Math.max(0.5, fovH));
    const ppdV_sc = r1(cntH / Math.max(0.5, fovV));

    // Aynı fiziksel yüzey alanı, aynı optik verim ve aynı fotometrik model
    const totalLumensNominal = count * inp.projector.ansiLumensPerUnit;
    const totalLumensEffective = Math.round(totalLumensNominal * (optEffPct / 100) * (transPct / 100));
    const theoreticalAvgLux = r1(totalLumensEffective / areaM2);
    const activeSpanW = Math.min(wM, sW_pj * count - (count - 1) * sW_pj * (ovPct / 100));
    const activeSpanH = Math.min(hM, sH_pj);
    const activeProjectionAreaM2 = r2(activeSpanW * activeSpanH);
    const activeAvgLux = r1(totalLumensEffective / Math.max(0.1, activeProjectionAreaM2));

    let notes = '';
    if (count === 2) notes = 'Daha düşük donanım maliyeti; ancak optik kaplama veya çözünürlük kısıtlı olabilir.';
    else if (count === 3) notes = 'Mevcut tasarım referansı: Dengeli piksel yoğunluğu ve kontrollü blend genişliği.';
    else if (count === 4) notes = 'Daha fazla blend bindirmesi nedeniyle net piksel verimi düşer; enerji tüketimi ve bakım maliyeti %33 artar.';

    return {
      projectorCount: count,
      cols: count,
      rows: 1,
      singleImageWidthM: r3(sW_pj),
      singleImageHeightM: r3(sH_pj),
      blendedRasterW: blW,
      blendedRasterH: blH,
      blendedMp: blMp,
      contentCanvasW: cntW,
      contentCanvasH: cntH,
      contentMp: cntMp,
      netPixelEfficiencyPct: effPct,
      totalLumensNominal,
      totalLumensEffective,
      surfaceAreaM2: areaM2,
      activeProjectionAreaM2,
      theoreticalAvgLux,
      activeAvgLux,
      powerW: power,
      ppdH: ppdH_sc,
      ppdV: ppdV_sc,
      verticalCoveragePct: covV,
      horizontalCoveragePct: covH,
      lensCatalogStatus: inp.lens.throwMin && inp.lens.throwMax ? 'PASS' : 'UNKNOWN',
      notes,
    };
  });

  const gridU0Pct = luxGrid.u0Pct;
  const gridU1Pct = r1((luxGrid.minLux / Math.max(1, luxGrid.maxLux)) * 100);

  // Viewing Quality (strictly on final Surface Content Raster)
  const vq = computeViewingQualityAnalysis({
    widthM: wM,
    heightM: hM,
    resW: contentW,
    resH: contentH,
    viewingDistanceM: inp.surface.viewingDistanceM,
    screenGain: gain,
    reflectance: refl,
    avgLux: luxGrid.avgLux,
    ambientLux: ambLux,
    nativeContrast: inp.projector.nativeContrast ?? 2000,
    uniformityU0: gridU0Pct,
    uniformityU1: gridU1Pct,
    projectorCount: pjCount,
    overlapPct: ovXPct,
    colorCalibrated: true,
  });
  const ppdH = r1(contentW / Math.max(0.5, vq.horizontalFovDeg));
  const ppdV = r1(contentH / Math.max(0.5, vq.verticalFovDeg));
  const minAxisPpd = Math.min(ppdH, ppdV);

  // Electrical
  const phases = inp.electrical.phases ?? (pjCount >= 3 ? 3 : 1);
  const voltageV = inp.electrical.supplyVoltageV ?? 230;
  const pf = inp.electrical.pf ?? 1.0;
  const cableLen = inp.electrical.cableLengthM ?? 25;
  const cableMm2 = inp.electrical.cableMm2 ?? 2.5;
  const ampacityA = inp.electrical.ampacityA ?? 24;

  const phaseNames: Array<'L1' | 'L2' | 'L3'> = ['L1', 'L2', 'L3'];
  const elLoads =
    phases === 3 && pjCount >= 3
      ? phaseNames.map((ph, idx) => ({
          id: `PJ-${ph}`,
          name: `Projeksiyon Faz ${ph}`,
          powerW: inp.projector.powerWPerUnit,
          qty: Math.floor(pjCount / 3) + (idx < pjCount % 3 ? 1 : 0),
          pf,
        }))
      : [
          {
            id: 'PJ-1',
            name: `Projeksiyon (${pjCount}x)`,
            powerW: inp.projector.powerWPerUnit,
            qty: pjCount,
            pf,
          },
        ];
  const elCircuits = elLoads.map((l, idx) => ({
    id: `C-${idx + 1}`,
    name: `Linye-${idx + 1} (${phases === 3 ? phaseNames[idx] : 'L1'} · ${l.qty}x Projektör)`,
    loadIds: [l.id],
    phase: (phases === 3 ? phaseNames[idx] : 'L1') as 'L1' | 'L2' | 'L3',
    cableMm2,
    lengthM: cableLen,
    ampacityA,
  }));

  const supplyObj = {
    voltage: voltageV,
    phases,
    defaultPf: pf,
    maxDropPct: 3,
    designMargin: 0.25,
    rho: 0.0225,
    diversity: 1,
  };
  const elAnalysis = analyzeElectrical(elLoads, elCircuits, supplyObj);
  const phaseCurrentA = r2(elAnalysis.circuits[0]?.ibA ?? elAnalysis.totalIbA);
  const maxDropPct = r2(Math.max(...elAnalysis.circuits.map(c => c.dropPct ?? 0), 0));
  const protectionStatus: 'PASS' | 'UNKNOWN' =
    inp.electrical.shortCircuitVerified && inp.electrical.selectivityVerified ? 'PASS' : 'UNKNOWN';

  // Cross Validation
  const crossValidation = validateReportConsistency({
    lang: 'tr',
    meta: {
      projectName: inp.projectName || 'Central Design Audit',
      customer: '',
      location: '',
      category: 'Müze',
      date: '2026-11-14',
      revision: 1,
      companyName: '',
      description: '',
    },
    sections: {
      ...DEFAULT_SECTIONS,
      room3d: false,
      led: false,
      projection: true,
      lux: true,
      multiProjector: true,
      electrical: true,
      architecturalPlan: false,
      drawings2d: false,
      equipmentList: false,
      assumptionsAndWarnings: true,
    },
    projectionScreens: [
      {
        screenName: inp.surface.name,
        projectorName: `${pjCount}x ${inp.projector.model}`,
        lensName: inp.lens.model,
        distanceM: inp.lens.throwDistM,
        imageWidthM: physCov.singleImageWidthM,
        aspectW: pW,
        aspectH: pH,
        throwRatio: inp.lens.throwRatio,
        throwMin: inp.lens.throwMin,
        throwMax: inp.lens.throwMax,
        ansiLumens: inp.projector.ansiLumensPerUnit,
        resolution: `${pW}×${pH}`,
      },
    ],
    photometricSurfaces: [
      {
        surfaceId: inp.surface.id || 'surf-1',
        surfaceName: inp.surface.name,
        surfaceType: 'wall',
        widthM: wM,
        heightM: hM,
        projectorCount: pjCount,
        nominalLumensPerProj: inp.projector.ansiLumensPerUnit,
        totalNominalLumens: totalAnsiLumens,
        effectiveTotalLumens,
        avgLux: Math.round(theoreticalAvgLux),
        minLux: Math.round(luxGrid.minLux),
        maxLux: Math.round(luxGrid.maxLux),
        uniformityU0: gridU0Pct / 100,
        uniformityU1: gridU1Pct / 100,
        luminanceNits: Math.round(realisticNits),
        idealNits: Math.round(idealNits),
        luminanceFL: r1(realisticNits * 0.2919),
        screenGain: gain,
        surfaceReflectance: refl,
        ambientLux: ambLux,
        ambientContrastRatio: acr !== null ? Math.round(acr) : 0,
      },
    ],
    plannerSurfaces: [
      {
        id: inp.surface.id || 'surf-1',
        name: inp.surface.name,
        type: 'wall',
        cols,
        rows,
        projW: pW,
        projH: pH,
        netW: contentW,
        netH: contentH,
        overlapX: ovXPct,
        overlapY: ovYPct,
        ovPxX,
        ovPxY,
        effectiveWidthM: wM,
        effectiveHeightM: hM,
        throwDistM: inp.lens.throwDistM,
        throwRatio: inp.lens.throwRatio,
        avgMmPerPx: r2((cntMmW + cntMmH) / 2),
        viewDistM: inp.surface.viewingDistanceM,
      },
    ],
    electrical: {
      supply: supplyObj,
      loads: elLoads,
      circuits: elCircuits,
    },
  });

  const activeProjW_M = r3(Math.max(0.1, cols * imgWExact - Math.max(0, cols - 1) * overlapMetersPerSeam));
  const activeProjH_M = r3(Math.max(0.1, imgHExact));
  const activeAreaM2 = r3(activeProjW_M * activeProjH_M);
  const tgtPxmW = r2(blendedW / wM);
  const tgtPxmH = r2(blendedH / hM);
  const tgtAniso = r1((Math.abs(tgtPxmW - tgtPxmH) / Math.max(0.01, tgtPxmW, tgtPxmH)) * 100);
  const actPxmW = r2(blendedW / activeProjW_M);
  const actPxmH = r2(blendedH / activeProjH_M);
  const actAniso = r1((Math.abs(actPxmW - actPxmH) / Math.max(0.01, actPxmW, actPxmH)) * 100);

  const scenarioIdVal = inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`;
  const surfaceIdVal = inp.surface.id || 'main-surface';
  const mountY_M = r2(Math.min(inp.room.heightM - 0.3, hM + 0.35));
  const stepX_M = Math.max(0.05, imgWExact - overlapMetersPerSeam);
  const totalSpanX_M = cols * imgWExact - Math.max(0, cols - 1) * overlapMetersPerSeam;
  const startOffsetX_M = (wM - totalSpanX_M) / 2;
  const projectorDistribution: ProjectorDistributionRecord[] = Array.from({ length: pjCount }, (_, idx) => {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);
    const covStartX = r3(startOffsetX_M + colIdx * stepX_M);
    const covEndX = r3(covStartX + imgWExact);
    const covStartY = r3((hM - imgHExact) / 2);
    const covEndY = r3(covStartY + imgHExact);
    return {
      projectorId: `PJ-${String(idx + 1).padStart(2, '0')}`,
      surfaceId: surfaceIdVal,
      scenarioId: scenarioIdVal,
      positionX_M: r3(covStartX + imgWExact / 2),
      positionY_M: r3(inp.lens.throwDistM),
      positionZ_M: r3(mountY_M - rowIdx * 0.4),
      throwDistM: r3(inp.lens.throwDistM),
      imageWidthM: r3(imgWExact),
      imageHeightM: r3(imgHExact),
      throwRatio: r3(inp.lens.throwRatio),
      coverageStartX_M: covStartX,
      coverageEndX_M: covEndX,
      coverageStartY_M: covStartY,
      coverageEndY_M: covEndY,
      overlapLeftM: colIdx > 0 ? r3(overlapMetersPerSeam) : 0,
      overlapRightM: colIdx < cols - 1 ? r3(overlapMetersPerSeam) : 0,
    };
  });

  const overlapRegions = Array.from({ length: Math.max(0, cols - 1) }, (_, idx) => ({
    pair: `PJ-${String(idx + 1).padStart(2, '0')}↔PJ-${String(idx + 2).padStart(2, '0')}`,
    overlapPx: Math.round(ovPxXExact),
    overlapM: r3(overlapMetersPerSeam),
  }));
  const totalOverlapPxSum = overlapRegions.reduce((a, r) => a + r.overlapPx, 0);
  const overlapPctOfTotalRawRaster = rawW > 0 ? r2((totalOverlapPxSum / rawW) * 100) : 0;
  const overlapPctOfPhysicalImageW = imgWExact > 0 ? r2((overlapMetersPerSeam / imgWExact) * 100) : 0;

  const targetSurfacePpd = Math.abs(hM - activeProjH_M) > 0.02 || Math.abs(wM - activeProjW_M) > 0.02
    ? {
        ppdH: r1(blendedW / Math.max(1, 2 * Math.atan(wM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
        ppdV: r1(blendedH / Math.max(1, 2 * Math.atan(hM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
        fovH: r1(2 * Math.atan(wM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI)),
        fovV: r1(2 * Math.atan(hM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI)),
      }
    : undefined;

  return {
    traceability: {
      scenarioId: scenarioIdVal,
      surfaceId: surfaceIdVal,
      engineVersion: CALCULATION_ENGINE_VERSION,
    },
    singleSourceGeometry: {
      targetSurface: targetSurfaceObj,
      projectedFootprint: projectedFootprintObj,
      activeProjectionArea: activeProjectionAreaObj,
      blendedRaster: blendedRasterObj,
      contentCanvas: contentCanvasObj,
      mappedContentArea: mappedContentAreaObj,
    },
    roomGeometry: inp.room,
    surfaceGeometry: { name: inp.surface.name, widthM: wM, heightM: hM, areaM2, aspectRatio: r3(surfaceAspect) },
    projectorSpecs: {
      model: inp.projector.model,
      count: pjCount,
      cols,
      rows,
      nativeW: pW,
      nativeH: pH,
      ansiLumensPerUnit: inp.projector.ansiLumensPerUnit,
      totalAnsiLumens,
      powerWPerUnit: inp.projector.powerWPerUnit,
      totalPowerW: pjCount * inp.projector.powerWPerUnit,
    },
    lensSpecs: {
      model: inp.lens.model,
      throwDistM: inp.lens.throwDistM,
      throwRatio: inp.lens.throwRatio,
      hasCatalogRange,
      throwMin: inp.lens.throwMin,
      throwMax: inp.lens.throwMax,
      inZoomRange,
      singleImageWidthM: r2(solvedLens.imageWidth),
      singleImageHeightM: Math.round(imgHExact * 10000) / 10000,
      catalogStatus,
      zoomMarginPct: zoomMargin?.marginToLimitPct,
      zoomMarginWarning: zoomMargin?.warning,
    },
    physicalCoverage: physCov,
    photometricModel: {
      opticalEfficiencyPct: optEffPct,
      lensTransmissionPct: transPct,
      effectiveTotalLumens,
      theoreticalAvgLux,
      gridIntegratedAvgLux: luxGrid.avgLux,
      gridMinLux: luxGrid.minLux,
      gridMaxLux: luxGrid.maxLux,
      photometricStatus: 'SIMULATION / APPROXIMATION',
      ninePointEqualAvgLux: eq9Mean,
      ninePointWeightedAvgLux: w9Mean,
      singleProjectorAvgContributionLux: r2(theoreticalAvgLux / pjCount),
      u0Pct: gridU0Pct,
      u1Pct: gridU1Pct,
      idealNits,
      realisticNits,
      ambientBlackNits: ambBlackNits,
      projectorBlackNits: pjBlackNits,
      acr,
      acrVerified: hasNativeContrast,
      pointDistribution: ptDist,
    },
    photometricSources,
    activeProjectionUniformity,
    fullSurfaceUniformity,
    colorAndBlend,
    scenarioComparison,
    pixelMapping: {
      nativeRaster: { w: pW, h: pH, mp: r2((pW * pH) / 1_000_000) },
      rawAggregateRaster: { w: rawW, h: rawH, mp: r2((rawW * rawH) / 1_000_000) },
      blendedRaster: {
        w: blendedW,
        h: blendedH,
        mp: r2((blendedW * blendedH) / 1_000_000),
        pxPerMeterW: contentCanvasRes.detailedMetrics?.activeRaster.pxPerMeterH ?? blPxmW,
        pxPerMeterH: contentCanvasRes.detailedMetrics?.activeRaster.pxPerMeterV ?? blPxmH,
        mmPerPxW: contentCanvasRes.detailedMetrics?.activeRaster.mmPerPxH ?? r3((activeCovW * 1000) / Math.max(1, blendedW)),
        mmPerPxH: contentCanvasRes.detailedMetrics?.activeRaster.mmPerPxV ?? r3((activeCovH * 1000) / Math.max(1, blendedH)),
        anisotropyRatio: anisoRatio,
        anisotropyDiffPct: contentCanvasRes.detailedMetrics?.activeRaster.anisotropyPct ?? anisoDiffPct,
      },
      surfaceContentRaster: {
        w: contentW,
        h: contentH,
        mp: r2((contentW * contentH) / 1_000_000),
        pxPerMeterW: cntPxmW,
        pxPerMeterH: cntPxmH,
        mmPerPxW: cntMmW,
        mmPerPxH: cntMmH,
        ppi: cntPpi,
        aspectRatio: r3(contentW / Math.max(1, contentH)),
      },
      cropFromBlendedPxW: Math.max(0, blendedW - contentW),
      cropFromBlendedPxH: Math.max(0, blendedH - contentH),
      targetSurface: {
        widthM: wM,
        heightM: hM,
        areaM2,
        pxPerMeterW: tgtPxmW,
        pxPerMeterH: tgtPxmH,
        mmPerPxW: r3(1000 / Math.max(0.01, tgtPxmW)),
        mmPerPxH: r3(1000 / Math.max(0.01, tgtPxmH)),
        pxPerSqMeter: Math.round((blendedW * blendedH) / Math.max(0.01, areaM2)),
        anisotropyDiffPct: tgtAniso,
      },
      activeProjectionArea: {
        widthM: activeProjW_M,
        heightM: activeProjH_M,
        areaM2: activeAreaM2,
        pxPerMeterW: actPxmW,
        pxPerMeterH: actPxmH,
        mmPerPxW: r3(1000 / Math.max(0.01, actPxmW)),
        mmPerPxH: r3(1000 / Math.max(0.01, actPxmH)),
        pxPerSqMeter: Math.round((blendedW * blendedH) / Math.max(0.01, activeAreaM2)),
        anisotropyDiffPct: actAniso,
      },
    },
    projectorDistribution,
    edgeBlending: {
      adjacentZoneCount: adjacentZones,
      overlapPctX: ovXPct,
      overlapPctOfSingleProjectorW: ovXPct,
      overlapPctOfTotalRawRaster,
      overlapPctOfPhysicalImageW,
      overlapPixelsX: ovPxX,
      overlapMetersPerSeam,
      totalOverlapMeters: r2(overlapMetersPerSeam * Math.max(0, cols - 1)),
      netRasterW: Math.max(1, rawW - totalOverlapPxSum),
      overlapRegions,
      gamma,
      midpointDrivePct,
    },
    viewingQuality: {
      ...vq,
      ppdH,
      ppdV,
      minAxisPpd,
      targetSurfacePpd,
      activeProjectionPpd: {
        ppdH: r1(blendedW / Math.max(1, 2 * Math.atan(activeProjW_M / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
        ppdV: r1(blendedH / Math.max(1, 2 * Math.atan(activeProjH_M / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
        fovH: r1(2 * Math.atan(activeProjW_M / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI)),
        fovV: r1(2 * Math.atan(activeProjH_M / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI)),
      },
      contentCanvasPpd: {
        ppdH: r1(contentW / Math.max(1, 2 * Math.atan(wM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
        ppdV: r1(contentH / Math.max(1, 2 * Math.atan(hM / (2 * Math.max(0.5, inp.surface.viewingDistanceM))) * (180 / Math.PI))),
      },
    },
    electricalLoad: {
      phases,
      voltageV,
      totalPowerW: elAnalysis.totalW,
      phaseCurrentA,
      maxVoltageDropPct: maxDropPct,
      protectionStatus,
      analysis: elAnalysis,
    },
    crossValidation,
    contentCanvas: contentCanvasRes,
    overlapGeometry,
    illuminance: {
      theoretical: theoreticalRec,
      simulated: simulatedRec,
      measured: measuredRec,
      ninePoint: {
        luxFieldId: luxNine.luxFieldId,
        equalMeanLux: luxNine.equalMeanLux,
        weightedMeanLux: luxNine.weightedMeanLux,
        minLux: luxNine.minLux,
        maxLux: luxNine.maxLux,
        sampleCount: luxNine.sampleCount,
      },
    },
    luminance: { theoretical: lumTheoretical, simulated: lumSimulated, measured: lumMeasured },
    contrast: contrastAnalysis,
    calculationTrace: [
      {
        step: 'Optik Görüntü & Yoğunluk',
        formula: 'W = D / TR, H = W × (nativeH / nativeW), px/m = nativeW / W',
        inputs: `D=${inp.lens.throwDistM}m, TR=${inp.lens.throwRatio}, ${pW}×${pH}`,
        result: `${r3(imgWExact)}×${r3(imgHExact)}m (${r1(optPxmH)} px/m, ${r3(1000 / Math.max(0.1, optPxmH))} mm/px)`,
        status: catalogStatus === 'FAIL' ? 'FAIL' : catalogStatus === 'UNKNOWN' ? 'UNKNOWN' : 'PASS',
        scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
        surfaceId: inp.surface.id || 'main-surface',
      },
      {
        step: 'Overlap & Blended Raster',
        formula: 'BlendedW = N × nativeW − (N − 1) × (overlapM × px/m)',
        inputs: `N=${cols}, Overlap=%${ovXPct} (${r2(ovPxXExact)} px)`,
        result: `${blendedW}×${blendedH} px (Ham ${rawW}×${rawH} px)`,
        status: ovXPct > 45 ? 'WARNING' : 'PASS',
        scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
        surfaceId: inp.surface.id || 'main-surface',
      },
      {
        step: 'Fiziksel Yüzey Kanvası',
        formula: 'ContentW = min(BlendedW, W_wall × px/m), ContentH = min(BlendedH, H_wall × px/m)',
        inputs: `Duvar=${wM}×${hM}m`,
        result: `${contentW}×${contentH} px (Oran ${r3(contentW / Math.max(1, contentH))}:1)`,
        status: physCov.verdict,
        scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
        surfaceId: inp.surface.id || 'main-surface',
      },
      {
        step: 'Lux Grid Simülasyonu (APPROXIMATION)',
        formula: 'E_total(x,y) = Σ E_p(x,y), U0 = Emin/Eavg, U1 = Emin/Emax',
        inputs: `${effectiveTotalLumens} lm (Üst sınır teorik: ${theoreticalAvgLux} lx)`,
        result: `Grid Ort: ${luxGrid.avgLux} lx (Min ${luxGrid.minLux} / Max ${luxGrid.maxLux} lx · U0 %${gridU0Pct} · U1 %${gridU1Pct})`,
        status: luxGrid.avgLux >= 300 ? 'PASS' : 'WARNING',
        scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
        surfaceId: inp.surface.id || 'main-surface',
      },
      {
        step: 'Luminans & ACR',
        formula: 'L = E × Gain × ρ / π, ACR = (L_white + L_black) / L_black',
        inputs: `ρ=${refl}, E_ort=${ambLux} lx`,
        result: acr !== null ? `ACR ${acr}:1 (Beyaz ${realisticNits} Nit / Siyah ${r2(totalBlackNits)} Nit)` : 'UNKNOWN (Siyah seviyesi / ortam ölçümü yok)',
        status: acr === null ? 'UNKNOWN' : hasNativeContrast ? 'PASS' : 'WARNING',
        scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
        surfaceId: inp.surface.id || 'main-surface',
      },
    ],
  };
}

export interface LayoutScenarioComparisonRow {
  projectorCount: number;
  overlapPct: number;
  requiredTR: number;
  coveredWidthM: number;
  coveredHeightM: number;
  coverageVerdict: 'PASS' | 'FAIL' | 'UNKNOWN';
  effectiveLumens: number;
  avgLux: number;
  contentW: number;
  contentH: number;
  mmPerPx: number;
  totalPowerW: number;
  mountingComplexity: 'Düşük' | 'Orta' | 'Yüksek';
  pixelEfficiencyVerdict: 'PASS' | 'WARNING';
  brightnessVerdict: 'PASS' | 'WARNING';
  overallVerdict: 'PASS' | 'WARNING' | 'FAIL';
  isRecommended: boolean;
}

/**
 * Aynı yüzey üzerinde 2, 3 ve 4 projektörlü alternatif yerleşimleri
 * fiziksel kaplama, overlap, çözünürlük, lux, güç ve montaj zorluğu açısından karşılaştırır.
 */
export function compareLayoutScenarios(
  inp: CentralDesignInput,
  candidateCounts: number[] = [2, 3, 4]
): LayoutScenarioComparisonRow[] {
  const wM = Math.max(0.1, inp.surface.widthM);
  const hM = Math.max(0.1, inp.surface.heightM);
  const pW = Math.max(1, inp.projector.nativeW);
  const pH = Math.max(1, inp.projector.nativeH);
  const nativeAspect = pW / pH;
  const distM = Math.max(0.1, inp.lens.throwDistM);
  const optEff = (inp.photometrics.opticalEfficiencyPct ?? 90) / 100;
  const transEff = (inp.lens.transmissionPct ?? 100) / 100;

  // Dikey tam kaplama için gereken tekil genişlik ve TR
  const reqSingleWForH = hM * nativeAspect;
  const reqTRForH = r3(distM / Math.max(0.1, reqSingleWForH));
  const surfaceAspect = wM / hM;

  const rows = candidateCounts.map(cnt => {
    const n = Math.max(1, Math.round(cnt));
    const singleW = Math.max(reqSingleWForH, wM / n);
    const neededTR = Math.floor((distM / singleW) * 1000) / 1000;
    const actualSingleW = neededTR > 0 ? distM / neededTR : singleW;
    const minNeededOverlapPct =
      n > 1 && n * actualSingleW > wM
        ? Math.floor(Math.min(85, Math.max(5, ((n * actualSingleW - wM) / ((n - 1) * actualSingleW)) * 100)) * 10) / 10
        : 0;
    const cov = evaluatePhysicalCoverage({
      surfaceWidthM: wM,
      surfaceHeightM: hM,
      cols: n,
      rows: 1,
      projW: pW,
      projH: pH,
      throwDistM: distM,
      throwRatio: neededTR,
      overlapX: minNeededOverlapPct,
    });
    const ovPx = n > 1 ? Math.round(pW * (minNeededOverlapPct / 100)) : 0;
    const blendedW = n * pW - Math.max(0, n - 1) * ovPx;
    const contentW = Math.min(blendedW, Math.round(pH * surfaceAspect));
    const contentH = Math.min(pH, Math.round(contentW / surfaceAspect));
    const effLumens = Math.round(n * inp.projector.ansiLumensPerUnit * optEff * transEff);
    const avgLux = Math.round(effLumens / Math.max(0.1, wM * hM));
    const mmPerPx = r2((wM * 1000) / Math.max(1, contentW));
    const totalPowerW = n * inp.projector.powerWPerUnit;
    const mountingComplexity: 'Düşük' | 'Orta' | 'Yüksek' = n <= 2 ? 'Düşük' : n === 3 ? 'Orta' : 'Yüksek';
    const pixelEfficiencyVerdict: 'PASS' | 'WARNING' = minNeededOverlapPct > 45 ? 'WARNING' : 'PASS';
    const brightnessVerdict: 'PASS' | 'WARNING' = avgLux >= 300 ? 'PASS' : 'WARNING';
    const overallVerdict: 'PASS' | 'WARNING' | 'FAIL' =
      cov.verdict === 'FAIL'
        ? 'FAIL'
        : pixelEfficiencyVerdict === 'WARNING' || brightnessVerdict === 'WARNING'
          ? 'WARNING'
          : 'PASS';

    return {
      projectorCount: n,
      overlapPct: minNeededOverlapPct,
      requiredTR: neededTR,
      coveredWidthM: cov.coveredWidthM,
      coveredHeightM: cov.coveredHeightM,
      coverageVerdict: cov.verdict,
      effectiveLumens: effLumens,
      avgLux,
      contentW,
      contentH,
      mmPerPx,
      totalPowerW,
      mountingComplexity,
      pixelEfficiencyVerdict,
      brightnessVerdict,
      overallVerdict,
      isRecommended: false,
    };
  });

  // En iyi aday: PASS olanlar arasından en düşük overlap + uygun lux (>= 300 lx) dengesi
  const valid = rows.filter(r => r.coverageVerdict === 'PASS' && r.requiredTR >= Math.min(0.4, reqTRForH - 0.1));
  const pool = valid.length > 0 ? valid : rows;
  const best = [...pool].sort((a, b) => {
    const aLuxOk = a.avgLux >= 300 ? 0 : 1;
    const bLuxOk = b.avgLux >= 300 ? 0 : 1;
    if (aLuxOk !== bLuxOk) return aLuxOk - bLuxOk;
    return a.overlapPct - b.overlapPct || b.contentW - a.contentW;
  })[0];
  if (best) best.isRecommended = true;

  return rows;
}

export interface LuxSimulationGridCell {
  col: number;
  row: number;
  gridIndex: number;
  xM: number;
  yM: number;
  cellAreaM2: number;
  isInsideWall: boolean;
  isInsideActiveProjection: boolean;
  contributingProjectors: string[];
  contributionsLux: number[];
  projectorLux?: number;
  ambientLux?: number;
  totalWithAmbientLux?: number;
  totalLux: number;
  /** Hücre merkezini aydınlatan projektör sayısı (1 = tek, 2 = ikili, 3+ = çoklu overlap) */
  coverageCount?: number;
  coverageStatus: 'FULL' | 'PARTIAL_EDGE' | 'OUTSIDE_PROJECTION';
}

export interface LuxSimulationGridResult {
  surfaceId: string;
  luxFieldId: string;
  samplingMethod: '288-point-grid';
  sampleCount: number;
  areaM2: number;
  gridCols: number;
  gridRows: number;
  projectorCount: number;
  minLux: number;
  maxLux: number;
  avgLux: number;
  u0Pct: number;
  u1Pct: number;
  activeMinLux: number;
  activeMaxLux: number;
  activeAvgLux: number;
  activeU0Pct: number;
  activeU1Pct: number;
  zeroCellCount: number;
  totalCellCount: number;
  activeAreaRatioPct: number;
  /** Herhangi bir noktada aynı anda ışık veren maksimum projektör sayısı */
  maxCoverageCount: number;
  /** 3+ projektörün kesiştiği hücre sayısı (üçlü/çoklu overlap) */
  multiOverlapCellCount: number;
  cells: LuxSimulationGridCell[];
}

/**
 * Çözünürlüğü ayarlanabilir grid üzerinde her projektörün noktasal lux katkısını
 * E_total(x,y) = E_1(x,y) + ... + E_n(x,y) olarak hesaplar.
 */
export function computeLuxSimulationGrid(
  inp: CentralDesignInput,
  gridCols = 16,
  gridRows = 8
): LuxSimulationGridResult {
  const gC = Math.max(3, Math.round(gridCols));
  const gR = Math.max(3, Math.round(gridRows));
  const wM = Math.max(0.1, inp.surface.widthM);
  const hM = Math.max(0.1, inp.surface.heightM);
  const cols = Math.max(1, Math.round(inp.projector.cols));
  const beamW = inp.lens.throwDistM > 0 && inp.lens.throwRatio > 0
    ? inp.lens.throwDistM / inp.lens.throwRatio
    : wM / cols;
  const beamH = beamW * (inp.projector.nativeH / Math.max(1, inp.projector.nativeW));
  const ovRatio = cols > 1 ? Math.max(0, Math.min(0.995, inp.blending.overlapPctX / 100)) : 0;
  const optEff = (inp.photometrics.opticalEfficiencyPct ?? 90) / 100;
  const transEff = (inp.lens.transmissionPct ?? 100) / 100;
  const unitEffLumens = inp.projector.ansiLumensPerUnit * optEff * transEff;

  // Gerçek projektör ayak izi alanı (beamW × beamH): duvar dışına taşan ışık akısı duvara düşmez
  const footprintAreaM2 = Math.max(0.1, beamW * beamH);
  const baseUnitLux = unitEffLumens / footprintAreaM2;
  const posX = inp.projector.projectorPositionsX;
  const hasPosX = Array.isArray(posX) && posX.length >= cols;
  const stepM = cols > 1 ? (beamW * (1 - ovRatio)) : 0;

  const cells: LuxSimulationGridCell[] = [];
  let sumLux = 0;
  let minLux = Infinity;
  let maxLux = 0;
  let maxCoverageCount = 0;
  let multiOverlapCellCount = 0;

  const cellW = wM / gC;
  const cellH = hM / gR;
  // Tüm projektör ayak izleri tek koordinat sisteminde (komşu olmayan PJ1∩PJ3 kesişimi dahil)
  const beamYStartAll = (hM - beamH) / 2;
  const gridFootprints: ProjectorFootprint[] = Array.from({ length: cols }, (_, p) => {
    const sx = hasPosX ? posX![p] : p * stepM;
    return { projectorId: `PJ-${String(p + 1).padStart(2, '0')}`, x0: sx, x1: sx + beamW, y0: beamYStartAll, y1: beamYStartAll + beamH };
  });
  // %85+ overlap = bilinçli istifleme (stacking): blend yok, katkılar toplanır
  const isStacking = ovRatio > 0.85;

  for (let r = 0; r < gR; r++) {
    const cellY0 = r * cellH;
    const cellY1 = (r + 1) * cellH;
    const ny = (r + 0.5) / gR;
    const yM = ny * hM;
    // Dikeyde duvar beamH ortasında hizalı kabul edilir
    const beamYStart = (hM - beamH) / 2;
    const beamYEnd = beamYStart + beamH;
    const yOverlap = Math.max(0, Math.min(cellY1, beamYEnd) - Math.max(cellY0, beamYStart)) / Math.max(1e-6, cellH);
    const clampedYM = Math.max(beamYStart, Math.min(beamYEnd, yM));
    const localV = (clampedYM - beamYStart) / Math.max(0.01, beamH);
    const dy = Math.abs(localV - 0.5) * 2;
    for (let c = 0; c < gC; c++) {
      const cellX0 = c * cellW;
      const cellX1 = (c + 1) * cellW;
      const nx = (c + 0.5) / gC;
      const xM = nx * wM;
      const contributionsLux: number[] = [];
      let totalLux = 0;
      let maxCellOverlapFrac = 0;
      // Normalize blend maskeleri: her koordinatta kapsayan projektör ağırlıkları toplamı = 1
      const blendW = isStacking ? null : normalizedBlendWeights(gridFootprints, Math.max(0, Math.min(wM, xM)), clampedYM);
      const coverageCount = gridFootprints.filter(f => xM > f.x0 && xM < f.x1 && yM > f.y0 && yM < f.y1).length;
      maxCoverageCount = Math.max(maxCoverageCount, coverageCount);
      if (coverageCount >= 3) multiOverlapCellCount++;

      for (let p = 0; p < cols; p++) {
        const startXM = gridFootprints[p].x0;
        const endXM = gridFootprints[p].x1;
        const xOverlap = Math.max(0, Math.min(cellX1, endXM) - Math.max(cellX0, startXM)) / Math.max(1e-6, cellW);
        const areaOverlapFrac = xOverlap * yOverlap;
        maxCellOverlapFrac = Math.max(maxCellOverlapFrac, areaOverlapFrac);
        let contrib = 0;
        if (areaOverlapFrac > 0) {
          const clampedXM = Math.max(startXM, Math.min(endXM, xM));
          const localU = (clampedXM - startXM) / Math.max(0.01, beamW);
          const dx = Math.abs(localU - 0.5) * 2;
          const falloff = Math.max(0.72, 1 - 0.14 * dx * dx - 0.10 * dy * dy);
          let blendGain = 1;
          if (blendW) {
            // Hücre merkezi ayak izi dışında (kısmi kenar hücresi) ise tek katkı olarak kabul edilir
            const wP = blendW[p];
            blendGain = wP > 0 ? wP : (blendW.every(v => v === 0) ? 1 : 0);
          }
          contrib = Math.round(baseUnitLux * falloff * blendGain * areaOverlapFrac);
        }
        contributionsLux.push(contrib);
        totalLux += contrib;
      }

      sumLux += totalLux;
      minLux = Math.min(minLux, totalLux);
      maxLux = Math.max(maxLux, totalLux);
      const ambientLuxVal = inp.photometrics.ambientLux ?? 0;
      const isInsideWall = xM >= 0 && xM <= wM && yM >= 0 && yM <= hM;
      const isInsideActiveProjection = gridFootprints.some(f => xM >= f.x0 && xM <= f.x1 && yM >= f.y0 && yM <= f.y1);
      const contributingProjectors = gridFootprints
        .filter((_, pIdx) => (contributionsLux[pIdx] || 0) > 0)
        .map(f => f.projectorId);
      const coverageStatus: 'FULL' | 'PARTIAL_EDGE' | 'OUTSIDE_PROJECTION' =
        totalLux <= 0
          ? 'OUTSIDE_PROJECTION'
          : maxCellOverlapFrac < 0.95
          ? 'PARTIAL_EDGE'
          : 'FULL';

      cells.push({
        col: c,
        row: r,
        gridIndex: r * gC + c,
        xM: r2(nx * wM),
        yM: r2(ny * hM),
        cellAreaM2: r3(cellW * cellH),
        isInsideWall,
        isInsideActiveProjection,
        contributingProjectors,
        contributionsLux,
        projectorLux: totalLux,
        ambientLux: ambientLuxVal,
        totalWithAmbientLux: totalLux + ambientLuxVal,
        totalLux,
        coverageCount,
        coverageStatus,
      });
    }
  }

  const avgLux = Math.round(sumLux / Math.max(1, cells.length));
  const safeMin = minLux === Infinity ? 0 : minLux;
  // Tam aktif iç hücreler (kısmi kesilen kenar hücreleri hariç, yoksa totalLux > 0)
  const fullActiveCells = cells.filter(c => c.coverageStatus === 'FULL');
  const activeCells = fullActiveCells.length > 0 ? fullActiveCells : cells.filter(c => c.totalLux > 0);
  const activeMinLux = activeCells.length > 0 ? Math.min(...activeCells.map(c => c.totalLux)) : 0;
  const activeMaxLux = activeCells.length > 0 ? Math.max(...activeCells.map(c => c.totalLux)) : 0;
  const activeAvgLux = activeCells.length > 0 ? Math.round(activeCells.reduce((a, c) => a + c.totalLux, 0) / activeCells.length) : 0;
  const activeU0Pct = activeAvgLux > 0 ? r1((activeMinLux / activeAvgLux) * 100) : 0;
  const activeU1Pct = activeMaxLux > 0 ? r1((activeMinLux / activeMaxLux) * 100) : 0;
  const zeroCellCount = cells.filter(c => c.totalLux === 0).length;
  const totalCellCount = cells.length;
  const activeAreaRatioPct = totalCellCount > 0 ? r1(((totalCellCount - zeroCellCount) / totalCellCount) * 100) : 0;
  const surfaceIdVal = inp.surface.id || 'main-surface';
  return {
    surfaceId: surfaceIdVal,
    luxFieldId: `LF-${surfaceIdVal}-${gC}x${gR}`,
    samplingMethod: '288-point-grid',
    sampleCount: cells.length,
    areaM2: r2(wM * hM),
    gridCols: gC,
    gridRows: gR,
    projectorCount: cols,
    minLux: safeMin,
    maxLux,
    avgLux,
    u0Pct: avgLux > 0 ? r1((safeMin / avgLux) * 100) : 0,
    u1Pct: maxLux > 0 ? r1((safeMin / maxLux) * 100) : 0,
    activeMinLux,
    activeMaxLux,
    activeAvgLux,
    activeU0Pct,
    activeU1Pct,
    zeroCellCount,
    totalCellCount,
    activeAreaRatioPct,
    maxCoverageCount,
    multiOverlapCellCount,
    cells,
  };
}

export interface NinePointSampleFromGridResult {
  surfaceId: string;
  luxFieldId: string;
  samplingMethod: '9-point-sampling';
  sampleCount: number;
  areaM2: number;
  zones9: Array<{
    id: string;
    label: string;
    normX: number;
    normY: number;
    xM: number;
    yM: number;
    gridIndex?: number;
    cellCol?: number;
    cellRow?: number;
    projectorLux?: number;
    ambientLux?: number;
    totalWithAmbientLux?: number;
    lux: number;
    nits: number;
    fl: number;
    pctOfAvg: number;
    pctOfPeak: number;
    statusLabel: string;
    zoneKind: 'corner' | 'edge' | 'center';
  }>;
  avgLux: number;
  equalMeanLux: number;
  weightedMeanLux: number;
  minLux: number;
  maxLux: number;
  u0Pct: number;
  u1Pct: number;
  peakCenterLux: number;
  cornerAvgLux: number;
  edgeAvgLux: number;
  centerToCornerDropPct: number;
}

/**
 * 9-nokta örneklemesini doğrudan 288-nokta LuxField matrisinden örnekler;
 * böylece 288-nokta haritası ile 9-nokta tablosu tek veri kaynağını paylaşır.
 */
export function sampleNinePointsFromLuxGrid(
  grid: LuxSimulationGridResult,
  widthM: number,
  heightM: number,
  screenGain = 1.0,
  reflectance = 0.85
): NinePointSampleFromGridResult {
  const defs: Array<{ id: string; label: string; nx: number; ny: number; kind: 'corner' | 'edge' | 'center' }> = [
    { id: 'top-left', label: 'Sol-Üst Köşe', nx: 0.08, ny: 0.88, kind: 'corner' },
    { id: 'top-center', label: 'Üst Kenar Orta', nx: 0.50, ny: 0.88, kind: 'edge' },
    { id: 'top-right', label: 'Sağ-Üst Köşe', nx: 0.92, ny: 0.88, kind: 'corner' },
    { id: 'mid-left', label: 'Sol Kenar Orta', nx: 0.08, ny: 0.50, kind: 'edge' },
    { id: 'center', label: 'Tam Merkez', nx: 0.50, ny: 0.50, kind: 'center' },
    { id: 'mid-right', label: 'Sağ Kenar Orta', nx: 0.92, ny: 0.50, kind: 'edge' },
    { id: 'bot-left', label: 'Sol-Alt Köşe', nx: 0.08, ny: 0.12, kind: 'corner' },
    { id: 'bot-center', label: 'Alt Kenar Orta', nx: 0.50, ny: 0.12, kind: 'edge' },
    { id: 'bot-right', label: 'Sağ-Alt Köşe', nx: 0.92, ny: 0.12, kind: 'corner' },
  ];

  const refAvg = Math.max(1, grid.avgLux);
  const centerCell = grid.cells.find(
    c => c.col === Math.floor(0.5 * grid.gridCols) && c.row === Math.floor(0.5 * grid.gridRows)
  );
  const refPeak = Math.max(1, centerCell?.totalLux ?? grid.maxLux);
  const zones9 = defs.map(d => {
    const targetCol = Math.min(grid.gridCols - 1, Math.max(0, Math.floor(d.nx * grid.gridCols)));
    const targetRow = Math.min(grid.gridRows - 1, Math.max(0, Math.floor(d.ny * grid.gridRows)));
    const cell = grid.cells.find(c => c.col === targetCol && c.row === targetRow) ?? grid.cells[0];
    const lux = cell ? cell.totalLux : 0;
    const projectorLux = cell?.projectorLux ?? lux;
    const ambientLux = cell?.ambientLux ?? 0;
    const totalWithAmbientLux = cell?.totalWithAmbientLux ?? (lux + ambientLux);
    const nits = r1((lux * screenGain * reflectance) / Math.PI);
    const fl = r1(nits * 0.2919);
    const pctOfAvg = Math.round((lux / refAvg) * 100);
    const pctOfPeak = Math.round((lux / refPeak) * 100);
    const statusLabel = pctOfAvg >= 95 ? '✓ İdeal' : pctOfAvg >= 75 ? '✓ Uygun' : lux > 0 ? '⚠ Düşük' : '⛔ Kaplama Dışı';
    return {
      id: d.id,
      label: d.label,
      normX: d.nx,
      normY: d.ny,
      xM: r2(d.nx * widthM),
      yM: r2(d.ny * heightM),
      gridIndex: cell.gridIndex,
      cellCol: targetCol,
      cellRow: targetRow,
      projectorLux,
      ambientLux,
      totalWithAmbientLux,
      lux,
      nits,
      fl,
      pctOfAvg,
      pctOfPeak,
      statusLabel,
      zoneKind: d.kind,
    };
  });

  const luxes = zones9.map(z => z.lux);
  const minLux = luxes.length > 0 ? Math.min(...luxes) : 0;
  const maxLux = luxes.length > 0 ? Math.max(...luxes) : 0;
  const equalMeanLux = Math.round(luxes.reduce((a, b) => a + b, 0) / Math.max(1, luxes.length));
  const weightedMeanLux = r2(
    zones9.reduce((a, z) => a + z.lux * (z.zoneKind === 'center' ? 4 : z.zoneKind === 'edge' ? 2 : 1), 0) / 16
  );
  const cornerAvgLux = Math.round(zones9.filter(z => z.zoneKind === 'corner').reduce((a, z) => a + z.lux, 0) / 4);
  const edgeAvgLux = Math.round(zones9.filter(z => z.zoneKind === 'edge').reduce((a, z) => a + z.lux, 0) / 4);
  const peakCenterLux = zones9.find(z => z.zoneKind === 'center')?.lux ?? maxLux;
  const u0Pct = equalMeanLux > 0 ? r1((minLux / equalMeanLux) * 100) : 0;
  const u1Pct = maxLux > 0 ? r1((minLux / maxLux) * 100) : 0;
  const centerToCornerDropPct = peakCenterLux > 0 ? r1(Math.max(0, ((peakCenterLux - cornerAvgLux) / peakCenterLux) * 100)) : 0;

  return {
    surfaceId: grid.surfaceId,
    luxFieldId: grid.luxFieldId,
    samplingMethod: '9-point-sampling',
    sampleCount: zones9.length,
    areaM2: r2(widthM * heightM),
    zones9,
    avgLux: grid.avgLux,
    equalMeanLux,
    weightedMeanLux,
    minLux,
    maxLux,
    u0Pct,
    u1Pct,
    peakCenterLux,
    cornerAvgLux,
    edgeAvgLux,
    centerToCornerDropPct,
  };
}
