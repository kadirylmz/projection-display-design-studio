import { solveProjection } from './throw';
import { evaluatePhysicalCoverage, PhysicalCoverageResult } from './physicalCoverage';
import { computeSurfacePointLuxDistribution, SurfacePointLuxResult } from './feasibility';
import { computeViewingQualityAnalysis, ViewingQualityResult } from './lux';
import { computePixelMapSummary } from './multiproj';
import { analyze as analyzeElectrical, ElectricalResult } from './electrical';
import { DEFAULT_SECTIONS } from './report';
import { validateReportConsistency, ReportValidationResult } from './reportValidation';

export const CALCULATION_ENGINE_VERSION = '2.4.0';

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

export interface CentralDesignResult {
  traceability: {
    scenarioId: string;
    surfaceId: string;
    engineVersion: string;
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
  };
  edgeBlending: {
    adjacentZoneCount: number;
    overlapPctX: number;
    overlapPixelsX: number;
    overlapMetersPerSeam: number;
    totalOverlapMeters: number;
    gamma: number;
    midpointDrivePct: number;
  };
  viewingQuality: ViewingQualityResult & { ppdH: number; ppdV: number; minAxisPpd: number };
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
  const optContentW = Math.round(wM * optPxmH);
  const optContentH = Math.round(hM * optPxmV);
  const contentW = optContentH <= blendedH
    ? Math.min(blendedW, optContentW)
    : Math.min(blendedW, Math.round(blendedH * surfaceAspect));
  const contentH = optContentH <= blendedH
    ? Math.min(blendedH, optContentH)
    : Math.min(blendedH, Math.round(contentW / surfaceAspect));

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

  const blPxmW = r1(blendedW / wM);
  const blPxmH = r1(blendedH / hM);
  const anisoRatio = r3(Math.max(blPxmW, blPxmH) / Math.max(0.1, Math.min(blPxmW, blPxmH)));
  const anisoDiffPct = r1((1 - 1 / Math.max(1, anisoRatio)) * 100);

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
  const overlapMetersPerSeam = cols > 1 ? r2(physCov.singleImageWidthM * (ovXPct / 100)) : 0;

  const luxGrid = computeLuxSimulationGrid(inp, 24, 12);
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

  return {
    traceability: {
      scenarioId: inp.scenarioId || `SCN-${cols}x${rows}-TR${inp.lens.throwRatio}`,
      surfaceId: inp.surface.id || 'main-surface',
      engineVersion: CALCULATION_ENGINE_VERSION,
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
    pixelMapping: {
      nativeRaster: { w: pW, h: pH, mp: r2((pW * pH) / 1_000_000) },
      rawAggregateRaster: { w: rawW, h: rawH, mp: r2((rawW * rawH) / 1_000_000) },
      blendedRaster: {
        w: blendedW,
        h: blendedH,
        mp: r2((blendedW * blendedH) / 1_000_000),
        pxPerMeterW: blPxmW,
        pxPerMeterH: blPxmH,
        mmPerPxW: r2((wM * 1000) / Math.max(1, blendedW)),
        mmPerPxH: r2((hM * 1000) / Math.max(1, blendedH)),
        anisotropyRatio: anisoRatio,
        anisotropyDiffPct: anisoDiffPct,
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
    },
    edgeBlending: {
      adjacentZoneCount: adjacentZones,
      overlapPctX: ovXPct,
      overlapPixelsX: ovPxX,
      overlapMetersPerSeam,
      totalOverlapMeters: r2(overlapMetersPerSeam * Math.max(0, cols - 1)),
      gamma,
      midpointDrivePct,
    },
    viewingQuality: { ...vq, ppdH, ppdV, minAxisPpd },
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
  xM: number;
  yM: number;
  contributionsLux: number[];
  totalLux: number;
}

export interface LuxSimulationGridResult {
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

  const cellW = wM / gC;
  const cellH = hM / gR;

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

      for (let p = 0; p < cols; p++) {
        const startXM = hasPosX ? posX![p] : p * stepM;
        const endXM = startXM + beamW;
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
          const ovWidthM = beamW * ovRatio;
          // Edge blend bölgesi yalnızca yüksek üst-üste binme (%85+) dışı normal blendde zayıflatma uygular
          if (ovRatio <= 0.85 && ovWidthM > 0.05) {
            if (p > 0 && clampedXM < startXM + ovWidthM) {
              blendGain *= Math.max(0, Math.min(1, (clampedXM - startXM) / ovWidthM));
            }
            if (p < cols - 1 && clampedXM > endXM - ovWidthM) {
              blendGain *= Math.max(0, Math.min(1, (endXM - clampedXM) / ovWidthM));
            }
          }
          contrib = Math.round(baseUnitLux * falloff * blendGain * areaOverlapFrac);
        }
        contributionsLux.push(contrib);
        totalLux += contrib;
      }

      sumLux += totalLux;
      minLux = Math.min(minLux, totalLux);
      maxLux = Math.max(maxLux, totalLux);
      cells.push({
        col: c,
        row: r,
        xM: r2(nx * wM),
        yM: r2(ny * hM),
        contributionsLux,
        totalLux,
        ...(maxCellOverlapFrac < 0.95 && maxCellOverlapFrac > 0 ? { partialEdge: true } : {}),
      });
    }
  }

  const avgLux = Math.round(sumLux / Math.max(1, cells.length));
  const safeMin = minLux === Infinity ? 0 : minLux;
  // Tam aktif iç hücreler (kısmi kesilen kenar hücreleri hariç, yoksa totalLux > 0)
  const fullActiveCells = cells.filter(c => c.totalLux > 0 && !(c as { partialEdge?: boolean }).partialEdge);
  const activeCells = fullActiveCells.length > 0 ? fullActiveCells : cells.filter(c => c.totalLux > 0);
  const activeMinLux = activeCells.length > 0 ? Math.min(...activeCells.map(c => c.totalLux)) : 0;
  const activeMaxLux = activeCells.length > 0 ? Math.max(...activeCells.map(c => c.totalLux)) : 0;
  const activeAvgLux = activeCells.length > 0 ? Math.round(activeCells.reduce((a, c) => a + c.totalLux, 0) / activeCells.length) : 0;
  const activeU0Pct = activeAvgLux > 0 ? r1((activeMinLux / activeAvgLux) * 100) : 0;
  const activeU1Pct = activeMaxLux > 0 ? r1((activeMinLux / activeMaxLux) * 100) : 0;
  const zeroCellCount = cells.filter(c => c.totalLux === 0).length;
  const totalCellCount = cells.length;
  const activeAreaRatioPct = totalCellCount > 0 ? r1(((totalCellCount - zeroCellCount) / totalCellCount) * 100) : 0;
  return {
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
    cells,
  };
}

export interface NinePointSampleFromGridResult {
  zones9: Array<{
    id: string;
    label: string;
    normX: number;
    normY: number;
    xM: number;
    yM: number;
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
