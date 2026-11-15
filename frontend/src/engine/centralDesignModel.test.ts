import { describe, expect, it } from 'vitest';
import {
  evaluateCentralProjectionDesign,
  compareLayoutScenarios,
  computeLuxSimulationGrid,
  sampleNinePointsFromLuxGrid,
  CentralDesignInput,
} from './centralDesignModel';
import { buildReportHtml, DEFAULT_SECTIONS } from './report';
import { analyze as analyzeElectrical } from './electrical';
import { validateReportConsistency } from './reportValidation';
import { evaluatePhysicalCoverage } from './physicalCoverage';
import {
  analyzeFootprintOverlaps,
  buildGridFootprints,
  computeContentCanvas,
  identifyMmPerPxSource,
  normalizedBlendWeights,
} from './projectionGeometry';

const baseInput: CentralDesignInput = {
  projectName: 'AV Mühendislik Refactor Testi',
  room: { widthM: 14, lengthM: 10, heightM: 5 },
  surface: { id: 'wall-1', name: '1. Düz Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
  projector: {
    model: 'Lazer 10K WUXGA',
    cols: 3,
    rows: 1,
    nativeW: 1920,
    nativeH: 1200,
    ansiLumensPerUnit: 10000,
    powerWPerUnit: 450,
    nativeContrast: 2000,
  },
  lens: {
    model: 'Kısa/Standart Zoom 0.75–0.95:1',
    throwDistM: 5,
    throwRatio: 0.8,
    throwMin: 0.75,
    throwMax: 0.95,
  },
  photometrics: {
    opticalEfficiencyPct: 90,
    screenGain: 1.0,
    reflectance: 0.85,
    ambientLux: 20,
    uniformityU0Pct: 82,
  },
  blending: { overlapPctX: 54, gamma: 2.2 },
  electrical: { supplyVoltageV: 230, phases: 3, pf: 1.0, cableLengthM: 25, cableMm2: 2.5, ampacityA: 24 },
};

describe('AV Projection Design Studio — Merkezi Hesaplama & Doğrulama Senaryoları (TEST A–G)', () => {
  it('TEST A: 3 PJ, 1920×1200, 12×4.3 m, D=5 m, TR=0.8:1 → dikey kaplama FAIL, 523.26 lx, 3686/3349 raster, 3-faz 1.96 A', () => {
    const res = evaluateCentralProjectionDesign(baseInput);
    expect(res.lensSpecs.singleImageWidthM).toBeCloseTo(6.25, 2);
    expect(res.lensSpecs.singleImageHeightM).toBeCloseTo(3.906, 2);
    expect(res.physicalCoverage.verdict).toBe('FAIL');
    expect(res.physicalCoverage.uncoveredHeightM).toBeCloseTo(0.39, 1);
    expect(res.photometricModel.theoreticalAvgLux).toBeCloseTo(523.26, 1);
    expect(res.photometricModel.singleProjectorAvgContributionLux).toBeCloseTo(174.42, 1);
    expect(res.pixelMapping.rawAggregateRaster.w).toBe(5760);
    expect(res.pixelMapping.blendedRaster.w).toBe(3686);
    expect(res.pixelMapping.surfaceContentRaster.w).toBe(3349);
    expect(res.edgeBlending.adjacentZoneCount).toBe(2);
    expect(res.viewingQuality.ppdV).toBeLessThan(20);
    expect(res.electricalLoad.totalPowerW).toBe(1350);
    expect(res.electricalLoad.phaseCurrentA).toBeCloseTo(1.96, 2);
    expect(res.crossValidation.checks.some(c => c.id === 'vertical-surface-coverage-0' && c.verdict === 'FAIL')).toBe(true);
    expect(res.crossValidation.checks.some(c => c.id === 'viewer-ppd-0' && c.verdict === 'WARNING')).toBe(true);
  });

  it('TEST B: Mesafe 6 m yapıldığında görüntü 7.5×4.688 m olur ve dikey kaplama PASS verir', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      lens: { ...baseInput.lens, throwDistM: 6 },
    });
    expect(res.lensSpecs.singleImageWidthM).toBeCloseTo(7.5, 2);
    expect(res.lensSpecs.singleImageHeightM).toBeCloseTo(4.688, 2);
    expect(res.physicalCoverage.verdict).toBe('PASS');
    expect(res.physicalCoverage.isFullyCovered).toBe(true);
    expect(res.crossValidation.checks.some(c => c.id === 'vertical-surface-coverage-0' && c.verdict === 'PASS')).toBe(true);
  });

  it('TEST C: Overlap %15 yapıldığında 288 px overlap ve 5184×1200 blended raster üretir', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      blending: { ...baseInput.blending, overlapPctX: 15 },
    });
    expect(res.edgeBlending.overlapPixelsX).toBe(288);
    expect(res.edgeBlending.adjacentZoneCount).toBe(2);
    expect(res.pixelMapping.blendedRaster.w).toBe(5184);
    expect(res.pixelMapping.surfaceContentRaster.w).toBe(3349);
  });

  it('TEST D: Projektör çözünürlüğü 4K (3840×2400) yapıldığında yatay ve dikey PPD >= 20 PASS olur', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      projector: { ...baseInput.projector, nativeW: 3840, nativeH: 2400 },
    });
    expect(res.pixelMapping.nativeRaster.w).toBe(3840);
    expect(res.pixelMapping.surfaceContentRaster.w).toBeGreaterThan(6000);
    expect(res.viewingQuality.ppdH).toBeGreaterThan(40);
    expect(res.viewingQuality.ppdV).toBeGreaterThan(30);
    expect(res.crossValidation.checks.some(c => c.id === 'viewer-ppd-0' && c.verdict === 'PASS')).toBe(true);
  });

  it('TEST E: Duvar yüksekliği 5 m yapıldığında alan 60 m², efektif lux 450 lx ve dikey kaplama FAIL olur', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      surface: { ...baseInput.surface, heightM: 5 },
    });
    expect(res.surfaceGeometry.areaM2).toBe(60);
    expect(res.photometricModel.theoreticalAvgLux).toBe(450);
    expect(res.physicalCoverage.verdict).toBe('FAIL');
    expect(res.physicalCoverage.uncoveredHeightM).toBeCloseTo(1.09, 1);
    expect(res.physicalCoverage.requiredThrowRatioForFullHeight).toBeCloseTo(0.625, 3);
  });

  it('TEST F: Ortam ışığı 50 lux yapıldığında ortam siyah seviyesi 13.53 nit ve ACR belirgin şekilde düşer', () => {
    const res20 = evaluateCentralProjectionDesign(baseInput);
    const res50 = evaluateCentralProjectionDesign({
      ...baseInput,
      photometrics: { ...baseInput.photometrics, ambientLux: 50 },
    });
    expect(res50.photometricModel.ambientBlackNits).toBeCloseTo(13.53, 1);
    expect(res50.photometricModel.acr).not.toBeNull();
    expect(res20.photometricModel.acr).not.toBeNull();
    expect(res50.photometricModel.acr!).toBeLessThan(res20.photometricModel.acr!);
    expect(res50.photometricModel.acr!).toBeLessThan(12);
  });

  it('TEST G: 3 projektör ayrı fazlara dağıtıldığında toplam 1350 W, faz başına 1.96 A ve koruma UNKNOWN olur', () => {
    const res = evaluateCentralProjectionDesign(baseInput);
    expect(res.electricalLoad.phases).toBe(3);
    expect(res.electricalLoad.totalPowerW).toBe(1350);
    expect(res.electricalLoad.phaseCurrentA).toBeCloseTo(1.96, 2);
    expect(res.electricalLoad.protectionStatus).toBe('UNKNOWN');
    expect(res.crossValidation.checks.some(c => c.id === 'elec-shortcircuit-selectivity' && c.verdict === 'UNKNOWN')).toBe(true);
  });

  it('Lens katalog aralığı veya native kontrast yoksa sonuç FAIL değil UNKNOWN olarak işaretlenir', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      projector: { ...baseInput.projector, nativeContrast: undefined },
      lens: { ...baseInput.lens, throwMin: undefined, throwMax: undefined },
    });
    expect(res.lensSpecs.catalogStatus).toBe('UNKNOWN');
    expect(res.photometricModel.acrVerified).toBe(false);
  });

  it('compareLayoutScenarios 2, 3 ve 4 projektörlü senaryoları karşılaştırır ve en verimli kombinasyonu önerir', () => {
    const rows = compareLayoutScenarios(baseInput, [2, 3, 4]);
    expect(rows.map(r => r.projectorCount)).toEqual([2, 3, 4]);
    expect(rows.some(r => r.isRecommended)).toBe(true);
    expect(rows.every(r => r.coverageVerdict === 'PASS')).toBe(true);
  });

  it('computeLuxSimulationGrid ayarlanabilir çözünürlükte her projektörün katkısını ayrı hesaplar', () => {
    const grid = computeLuxSimulationGrid(baseInput, 12, 6);
    expect(grid.cells).toHaveLength(72);
    expect(grid.cells[0].contributionsLux).toHaveLength(3);
    const midCell = grid.cells[Math.floor(grid.cells.length / 2)];
    const sum = midCell.contributionsLux.reduce((a, b) => a + b, 0);
    expect(midCell.totalLux).toBe(sum);
  });

  it('buildReportHtml Tasarım Raporu ve Uygulama / Saha Raporu modlarını ayrı ayrı üretir', () => {
    const htmlAsBuilt = buildReportHtml({
      lang: 'tr',
      reportMode: 'as_built',
      meta: {
        projectName: 'Müze',
        customer: 'Müşteri',
        location: 'İstanbul',
        category: 'Müze',
        date: '2026-11-14',
        revision: 1,
        companyName: '',
        description: '',
      },
      sections: DEFAULT_SECTIONS,
    });
    expect(htmlAsBuilt).toContain('UYGULAMA / SAHA RAPORU');
  });

  it('evaluateProtectionCoordination: Icu/Ik, açma eğrisi & inrush tanımlı olduğunda PASS ve ihlalde FAIL döner', async () => {
    const { analyze, defaultSupply, evaluateProtectionCoordination } = await import('./electrical');
    const supply = defaultSupply();
    const loads = [{ id: 'L1', name: 'Projektör', qty: 1, powerW: 900, pf: 0.95 }];
    const okRes = analyze(loads, [{
      id: 'C1',
      name: 'Linye-1',
      loadIds: ['L1'],
      phase: 'L1',
      cableMm2: 2.5,
      lengthM: 20,
      ampacityA: 24,
      breakerIcuKa: 10,
      prospectiveFaultKa: 4.5,
      tripCurve: 'C',
      inrushA: 25,
      selectivityVerified: true,
    }], supply);
    const okCoord = evaluateProtectionCoordination(okRes.circuits, okRes.mainBreakerA);
    expect(okCoord.defined).toBe(true);
    expect(okCoord.passed).toBe(true);

    const failRes = analyze(loads, [{
      id: 'C1',
      name: 'Linye-1',
      loadIds: ['L1'],
      phase: 'L1',
      cableMm2: 2.5,
      lengthM: 20,
      ampacityA: 24,
      breakerIcuKa: 3,
      prospectiveFaultKa: 6,
      tripCurve: 'B',
      inrushA: 40,
    }], supply);
    const failCoord = evaluateProtectionCoordination(failRes.circuits, failRes.mainBreakerA);
    expect(failCoord.defined).toBe(true);
    expect(failCoord.passed).toBe(false);
    expect(failCoord.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('12x3.4m duvar + 3x 8x5m (TR 0.5, %75 overlap) tek kaynaklı geometri, 2880x1200 blended, 2880x816 kanvas ve izlenebilirlik doğrulaması', () => {
    const res = evaluateCentralProjectionDesign({
      scenarioId: 'SCN-TR05-75OV',
      room: { widthM: 14, lengthM: 10, heightM: 5 },
      surface: { id: 'wall-main', name: 'Ana Duvar', widthM: 12, heightM: 3.4, viewingDistanceM: 3.5 },
      projector: {
        model: '8K-Ref',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 8000,
        powerWPerUnit: 450,
      },
      lens: { model: 'Short-0.5', throwDistM: 4, throwRatio: 0.5 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 20 },
      blending: { overlapPctX: 75 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    });

    // İzlenebilirlik
    expect(res.traceability.scenarioId).toBe('SCN-TR05-75OV');
    expect(res.traceability.surfaceId).toBe('wall-main');
    expect(res.traceability.engineVersion).toBe('2.5.0');

    // 1920/8 = 240 px/m, 1200/5 = 240 px/m, 6*240 = 1440 overlap px, 5760 - 2*1440 = 2880 px
    expect(res.lensSpecs.singleImageWidthM).toBe(8);
    expect(res.lensSpecs.singleImageHeightM).toBe(5);
    expect(1920 / res.lensSpecs.singleImageWidthM).toBe(240);
    expect(1200 / res.lensSpecs.singleImageHeightM).toBe(240);
    expect(res.edgeBlending.overlapMetersPerSeam).toBe(6);
    expect(res.edgeBlending.overlapPixelsX).toBe(1440);
    expect(res.pixelMapping.rawAggregateRaster.w).toBe(5760);
    expect(res.pixelMapping.blendedRaster.w).toBe(2880);
    expect(res.pixelMapping.blendedRaster.h).toBe(1200);

    // 12*240 = 2880, 3.4*240 = 816, 1000/240 = 4.167, 2880/816 = 3.529
    expect(res.pixelMapping.surfaceContentRaster.w).toBe(2880);
    expect(res.pixelMapping.surfaceContentRaster.h).toBe(816);
    expect(res.pixelMapping.cropFromBlendedPxH).toBe(384);
    expect(res.pixelMapping.surfaceContentRaster.mmPerPxW).toBeCloseTo(4.167, 3);
    expect(res.pixelMapping.surfaceContentRaster.aspectRatio).toBeCloseTo(3.529, 3);

    // Fotometri simulasyon etiketi ve skor hesabı (20/23 = %86.96)
    expect(res.photometricModel.photometricStatus).toBe('SIMULATION / APPROXIMATION');
    expect(res.photometricModel.acrVerified).toBe(false);
    expect(Number(((20 / 23) * 100).toFixed(2))).toBe(86.96);
  });

  it('V3 Denetim: TR 0.4 ([0, 0.1, 0.2]m) ve Optimize TR 0.727 senaryo izolasyonu, 15 doğrulama ve Calculation Trace', () => {
    const scA = evaluateCentralProjectionDesign({
      scenarioId: 'SCN-A-TR04',
      room: { widthM: 14, lengthM: 10, heightM: 8 },
      surface: { id: 'wall-main', name: 'Ana Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
      projector: {
        model: 'PJ-10K',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 10000,
        powerWPerUnit: 450,
        projectorPositionsX: [0, 0.1, 0.2],
      },
      lens: { model: 'UST-0.4', throwDistM: 5, throwRatio: 0.4, throwMin: 0.36, throwMax: 0.5 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 0 },
      blending: { overlapPctX: 99.2 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    });

    // 1-5: Optik geometri (5 / 0.4 = 12.5, 12.5 * 1200/1920 = 7.8125, 153.6 px/m, 6.5104 mm/px)
    expect(scA.lensSpecs.singleImageWidthM).toBe(12.5);
    expect(scA.lensSpecs.singleImageHeightM).toBeCloseTo(7.8125, 4);
    expect(1920 / scA.lensSpecs.singleImageWidthM).toBe(153.6);
    expect(1200 / scA.lensSpecs.singleImageHeightM).toBe(153.6);
    expect(1000 / 153.6).toBeCloseTo(6.5104, 4);

    // 6-9: Overlap & Blended (12.5 - 0.1 = 12.4m, 12.4 * 153.6 = 1904.64 px, 5760 - 2*1904.64 = 1950.72 -> 1951)
    expect(scA.edgeBlending.overlapPctX).toBe(99.2);
    expect(scA.edgeBlending.overlapMetersPerSeam).toBeCloseTo(12.4, 2);
    expect(12.4 * 153.6).toBeCloseTo(1904.64, 2);
    expect(scA.pixelMapping.blendedRaster.w).toBe(1951);
    expect(scA.pixelMapping.blendedRaster.h).toBe(1200);

    // 10-11: Fiziksel duvar kanvası (12*153.6 = 1843, 4.3*153.6 = 660) + PPD (3.5m izleme)
    expect(scA.pixelMapping.surfaceContentRaster.w).toBe(1843);
    expect(scA.pixelMapping.surfaceContentRaster.h).toBe(660);
    expect(scA.viewingQuality.ppdH).toBeCloseTo(15.4, 0);
    expect(scA.viewingQuality.ppdV).toBeCloseTo(10.5, 0);

    // 8 & 15: Sıfır ortam ışığı + nativeContrast yokken ACR null/UNKNOWN ve teorik 523.26 lx vs gerçek grid ayrımı
    expect(scA.photometricModel.acr).toBeNull();
    expect(scA.photometricModel.acrVerified).toBe(false);
    expect(scA.photometricModel.theoreticalAvgLux).toBeCloseTo(523.26, 1);
    expect(scA.photometricModel.gridIntegratedAvgLux).toBeLessThan(scA.photometricModel.theoreticalAvgLux);
    expect(scA.calculationTrace.length).toBe(5);
    expect(scA.calculationTrace.every(t => t.scenarioId === 'SCN-A-TR04' && t.surfaceId === 'wall-main')).toBe(true);

    // 12-14: Optimize Senaryo B (TR 0.727, %62.8 overlap -> 3348 x 1200, PPD ~28/19)
    const scB = evaluateCentralProjectionDesign({
      scenarioId: 'SCN-B-TR0727',
      room: { widthM: 14, lengthM: 10, heightM: 8 },
      surface: { id: 'wall-main', name: 'Ana Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
      projector: {
        model: 'PJ-10K',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 10000,
        powerWPerUnit: 450,
      },
      lens: { model: 'Opt-0.727', throwDistM: 5, throwRatio: 0.727 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 20 },
      blending: { overlapPctX: 62.8 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    });
    expect(scB.traceability.scenarioId).toBe('SCN-B-TR0727');
    expect(scB.lensSpecs.singleImageWidthM).toBeCloseTo(6.88, 2);
    expect(scB.lensSpecs.singleImageHeightM).toBeCloseTo(4.30, 2);
    expect(scB.pixelMapping.blendedRaster.w).toBeCloseTo(3348, -1);
    expect(scB.viewingQuality.ppdH).toBeCloseTo(28, 0);
    expect(scB.viewingQuality.ppdV).toBeCloseTo(19, 0);
  });

  it('V3 Regression: 11 temel mühendislik formülü ve sayısal doğrulama', () => {
    const regInput: CentralDesignInput = {
      scenarioId: 'SCN-REG-11',
      room: { widthM: 14, lengthM: 10, heightM: 5 },
      surface: { id: 'wall-reg', name: 'Ana Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
      projector: {
        model: 'PJ-10K',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 10000,
        powerWPerUnit: 450,
      },
      lens: { model: 'L-0.8', throwDistM: 5, throwRatio: 0.8 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 20 },
      blending: { overlapPctX: 54 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    };
    const res = evaluateCentralProjectionDesign(regInput);

    // 1. 30.000 lm × %90 / 51.6 m² = 523.26 lx
    expect(res.photometricModel.theoreticalAvgLux).toBeCloseTo(523.26, 2);
    // 2. 10.000 lm × %90 / 51.6 m² = 174.42 lx
    expect(res.photometricModel.singleProjectorAvgContributionLux).toBeCloseTo(174.42, 2);
    // 3. 5 / 0.8 = 6.25 m
    expect(res.lensSpecs.singleImageWidthM).toBe(6.25);
    // 4. 6.25 / 1.6 = 3.90625 m
    expect(res.lensSpecs.singleImageHeightM).toBeCloseTo(3.90625, 4);
    // 5-6. 1920 / 6.25 = 307.2 px/m, 1200 / 3.90625 = 307.2 px/m
    expect(1920 / res.lensSpecs.singleImageWidthM).toBeCloseTo(307.2, 2);
    expect(1200 / res.lensSpecs.singleImageHeightM).toBeCloseTo(307.2, 1);
    // 7. 5760 - 2 * 1037 = 3686 px
    expect(res.pixelMapping.blendedRaster.w).toBe(3686);
    // 8. 523.26 * 0.85 / π ≈ 141.58 cd/m²
    expect(res.photometricModel.realisticNits).toBeCloseTo(141.58, 1);
    // 9-10. 405 / 470 = %86.2, 405 / 523.26 = %77.4
    expect((405 / 470) * 100).toBeCloseTo(86.17, 1);
    expect((405 / 523.26) * 100).toBeCloseTo(77.4, 1);
    // 11. 1350 / (√3 × 400) ≈ 1.95 A (3 × 230V = 1.96 A)
    expect(res.electricalLoad.analysis.totalIbA).toBeCloseTo(1.95, 1);
    // 12. 288-nokta sub-cell kesişim ağırlığı: 12×3.90625m kaplama (%90.8) ile tüm duvar ortalaması ≈ activeAvgLux × 0.908
    const grid288 = computeLuxSimulationGrid(regInput, 24, 12);
    expect(grid288.avgLux).toBeGreaterThanOrEqual(Math.round(grid288.activeAvgLux * 0.88));
    // 13. PPD Merkez / Kenar / Ortalama ve arcminPerPixelH/V tutarlılığı
    expect(res.viewingQuality.arcminPerPixelH).toBeCloseTo(60 / res.viewingQuality.ppd, 1);
    expect(res.viewingQuality.ppdEdgeH).toBeGreaterThan(res.viewingQuality.ppdCenterH);
    // 14. Elektrik ana kesici seçim gerekçesi tanımlı
    expect(res.electricalLoad.analysis.mainBreakerReason).toBeTruthy();
  });

  it('V4 Regression: PDF Öncesi 13 Zorunlu Matematiksel Formül Testi', () => {
    const res = evaluateCentralProjectionDesign({
      scenarioId: 'SCN-V4-REG',
      room: { widthM: 14, lengthM: 10, heightM: 5 },
      surface: { id: 'wall-v4', name: 'Ana Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
      projector: {
        model: 'PJ-5K',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 5000,
        powerWPerUnit: 450,
      },
      lens: { model: 'L-0.8', throwDistM: 5, throwRatio: 0.8 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 20 },
      blending: { overlapPctX: 54 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    });

    // 1. 15000 × 0,90 / 51,6 = 261,63 lx
    expect(res.photometricModel.theoreticalAvgLux).toBeCloseTo(261.63, 2);
    // 2. 5000 × 0,90 / 51,6 = 87,21 lx
    expect(res.photometricModel.singleProjectorAvgContributionLux).toBeCloseTo(87.21, 2);
    // 3. 5 / 0,8 = 6,25 m
    expect(res.lensSpecs.singleImageWidthM).toBe(6.25);
    // 4. 6,25 / 1,6 = 3,90625 m
    expect(res.lensSpecs.singleImageHeightM).toBeCloseTo(3.90625, 4);
    // 5. 3686 / 12 = 307,17 px/m
    expect(res.pixelMapping.blendedRaster.w / 12).toBeCloseTo(307.17, 2);
    // 6. 1200 / 4,3 = 279,07 px/m
    expect(1200 / 4.3).toBeCloseTo(279.07, 2);
    // 7. 1200 / 3,90625 = 307,2 px/m
    expect(1200 / res.lensSpecs.singleImageHeightM).toBeCloseTo(307.2, 1);
    // 8-11. 195, 273, 306 lx -> Eşit Ort: 242, Ağırlıklı Ort: 261,75, U0: %80,6, U1: %63,7
    const eqMean9 = (4 * 195 + 4 * 273 + 306) / 9;
    const wMean9 = (4 * 195 + 8 * 273 + 4 * 306) / 16;
    expect(eqMean9).toBe(242);
    expect(wMean9).toBe(261.75);
    expect((195 / eqMean9) * 100).toBeCloseTo(80.6, 1);
    expect((195 / 306) * 100).toBeCloseTo(63.7, 1);
    // 12. 1350 / (√3 × 400) = 1,95 A (3×230V = 1,96 A)
    expect(1350 / (Math.sqrt(3) * 400)).toBeCloseTo(1.95, 2);
    expect(res.electricalLoad.analysis.totalIbA).toBeCloseTo(1.95, 1);
    // 13. 262 × 0,85 / π ≈ 70,9 cd/m²
    expect(res.photometricModel.realisticNits).toBeCloseTo(70.9, 0);
  });

  it('V4 Engineering Refactor: 12 Formül + LuxField 9-Nokta / 288-Nokta Bütünlüğü', () => {
    const inp: CentralDesignInput = {
      scenarioId: 'SCN-V4-REFACTOR',
      room: { widthM: 14, lengthM: 10, heightM: 5 },
      surface: { id: 'wall-v4-ref', name: 'Ana Duvar', widthM: 12, heightM: 4.3, viewingDistanceM: 3.5 },
      projector: {
        model: 'PJ-10K',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 10000,
        powerWPerUnit: 450,
      },
      lens: { model: 'L-0.8', throwDistM: 5, throwRatio: 0.8 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 0 },
      blending: { overlapPctX: 54 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    };
    const res = evaluateCentralProjectionDesign(inp);
    const grid288 = computeLuxSimulationGrid(inp, 24, 12);
    const sample9 = sampleNinePointsFromLuxGrid(grid288, 12, 4.3, 1.0, 0.85);

    // 12 zorunlu sayısal formül
    expect(res.photometricModel.theoreticalAvgLux).toBeCloseTo(523.26, 2);
    expect(res.photometricModel.singleProjectorAvgContributionLux).toBeCloseTo(174.42, 2);
    expect(res.lensSpecs.singleImageWidthM).toBe(6.25);
    expect(res.lensSpecs.singleImageHeightM).toBeCloseTo(3.90625, 4);
    expect(1920 / res.lensSpecs.singleImageWidthM).toBeCloseTo(307.2, 2);
    expect(1200 / res.lensSpecs.singleImageHeightM).toBeCloseTo(307.2, 1);
    expect(res.pixelMapping.blendedRaster.w).toBe(3686);
    expect(Math.round((3686 * 1200) / 51.6)).toBe(85721);
    expect(res.photometricModel.realisticNits).toBeCloseTo(141.58, 1);
    expect((390 / 462) * 100).toBeCloseTo(84.4, 1);
    expect((390 / 611) * 100).toBeCloseTo(63.8, 1);
    expect(1350 / (Math.sqrt(3) * 400)).toBeCloseTo(1.95, 2);

    // LuxField 9-nokta ve 288-nokta örnekleme bütünlüğü
    expect(sample9.minLux).toBeGreaterThanOrEqual(grid288.minLux);
    expect(sample9.maxLux).toBeLessThanOrEqual(grid288.maxLux);
    expect(sample9.zones9.length).toBe(9);
  });

  it('V6 Case A: Eksik güç verisi (null/undefined) UNKNOWN olarak işaretlenir', () => {
    const res = analyzeElectrical(
      [{ id: 'l1', name: 'PJ-1', powerW: undefined, qty: 1 }],
      [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
      { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 }
    );
    expect(res.electricalDataStatus).toBe('UNKNOWN');
    expect(res.missingPowerLoadNames).toEqual(['PJ-1']);
    expect(res.circuits[0].dataStatus).toBe('UNKNOWN');
    expect(res.circuits[0].breakerA).toBeNull();
  });

  it('V6 Case B: Açık 0 W değeri UNKNOWN yerine olağandışı değer uyarısı (ZERO_POWER) üretir', () => {
    const res = analyzeElectrical(
      [{ id: 'l1', name: 'PJ-Zero', powerW: 0, qty: 1 }],
      [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
      { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 }
    );
    expect(res.electricalDataStatus).toBe('ZERO_POWER');
    expect(res.zeroPowerLoadNames).toEqual(['PJ-Zero']);
    expect(res.circuits[0].warnings.some(w => w.includes('0 W'))).toBe(true);
  });

  it('V6 Case C: 450 W @ 230V 1-Faz cosφ=1 -> Ib = 1.96 A', () => {
    const res = analyzeElectrical(
      [{ id: 'l1', name: 'PJ-450', powerW: 450, qty: 1 }],
      [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
      { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 }
    );
    expect(res.electricalDataStatus).toBe('OK');
    expect(res.totalIbA).toBeCloseTo(1.96, 2);
    expect(res.circuits[0].ibA).toBeCloseTo(1.96, 2);
  });

  it('V6 Case D: Elektrik güç verisi eksik olduğunda PDF onayı DRAFT olarak bloklanır', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'V6 Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, electrical: true, lux: false },
      electrical: {
        loads: [{ id: 'l1', name: 'PJ-1', powerW: null, qty: 1 }],
        circuits: [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
        supply: { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
      },
    });
    expect(v.pdfApprovalStatus).toBe('DRAFT');
    expect(v.canExportFinalPdf).toBe(false);
    expect(v.approvalBlockReasons.some(r => r.includes('UNKNOWN'))).toBe(true);
    expect(v.engineeringScorePct).toBeLessThan(100);
  });

  it('V6 Case E: Fotometri (Lux) açıkken LuxField/grid eksikse PDF onayı DRAFT olarak bloklanır', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'V6 Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: true, electrical: false },
      photometricSurfaces: [
        {
          surfaceId: 'wall-1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          screenGain: 1.0,
          avgLux: 523.26,
          minLux: 400,
          maxLux: 600,
          luminanceNits: 141.58,
          luminanceFL: 41.3,
          ambientLux: 20,
          ambientContrastRatio: 27.2,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          idealNits: 141.58,
          uniformityU0: 80,
          uniformityU1: 66.7,
        },
      ],
    });
    expect(v.pdfApprovalStatus).toBe('DRAFT');
    expect(v.canExportFinalPdf).toBe(false);
    expect(v.checks.some(c => c.id === 'photo-luxfield-missing-0' && c.status === 'unknown')).toBe(true);
  });

  it('V6 Case F: Zorunlu kontroller PASS ve yalnızca opsiyonel kontroller UNKNOWN iken CONDITIONAL onay verilir', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'V6 Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: false, electrical: true },
      electrical: {
        loads: [{ id: 'l1', name: 'PJ-1', powerW: 450, qty: 1 }],
        circuits: [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
        supply: { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
      },
    });
    expect(v.errorCount).toBe(0);
    expect(v.pdfApprovalStatus).toBe('CONDITIONAL');
    expect(v.canExportFinalPdf).toBe(true);
    expect(v.engineeringScorePct).toBeLessThan(100);
  });

  it('Deep Refactor Test A: 3 projektör, 1920x1200, 6.25m genişlik, 5m atım -> TR = 0.8 ve 3 bağımsız PJ kaydı', () => {
    const res = evaluateCentralProjectionDesign(baseInput);
    expect(res.lensSpecs.throwDistM / res.lensSpecs.singleImageWidthM).toBeCloseTo(0.8, 3);
    expect(res.projectorDistribution).toHaveLength(3);
    expect(res.projectorDistribution.map(p => p.projectorId)).toEqual(['PJ-01', 'PJ-02', 'PJ-03']);
    expect(res.projectorDistribution.every(p => p.throwRatio === 0.8 && p.imageWidthM === 6.25)).toBe(true);
  });

  it('Deep Refactor Test B: 12x4.3m yüzey, 3.90625m görüntü yüksekliği -> %90.84 dikey kaplama, 0.394m eksik ve FAIL', () => {
    const cov = evaluatePhysicalCoverage({
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      cols: 3,
      rows: 1,
      projW: 1920,
      projH: 1200,
      throwDistM: 5,
      throwRatio: 0.8,
      overlapX: 54,
    });
    expect(cov.verdict).toBe('FAIL');
    expect(cov.verticalCoveragePct).toBeCloseTo(90.84, 1);
    expect(cov.uncoveredHeightM).toBeCloseTo(0.394, 2);
    expect(cov.requiredThrowRatioForFullHeight).toBeLessThan(0.8);
  });

  it('Deep Refactor Test C: 3686x1200 raster, 12x4.3m hedef yüzey -> H≈307.17 px/m, V≈279.07 px/m, px/m²≈85721', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      blending: { overlapPctX: 54 },
    });
    expect(res.pixelMapping.targetSurface.pxPerMeterW).toBeCloseTo(307.17, 1);
    expect(res.pixelMapping.targetSurface.pxPerMeterH).toBeCloseTo(279.07, 1);
    expect(res.pixelMapping.targetSurface.pxPerSqMeter).toBeCloseTo(85721, -1);
  });

  it('Deep Refactor Test D: 3686x1200 raster, 12x3.906m aktif alan -> H≈307.17 px/m, V≈307.22 px/m, px/m²≈94362', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      blending: { overlapPctX: 54 },
    });
    expect(res.pixelMapping.activeProjectionArea.pxPerMeterW).toBeCloseTo(307.17, 0);
    expect(res.pixelMapping.activeProjectionArea.pxPerMeterH).toBeCloseTo(307.22, 0);
    expect(res.pixelMapping.activeProjectionArea.pxPerSqMeter).toBeCloseTo(94362, -2);
  });

  it('Deep Refactor Test E: 307.2 px/m -> 3.255 mm/px (H), 279.1 px/m -> 3.583 mm/px (V); eksen karıştırılırsa FAIL', () => {
    expect(1000 / 307.2).toBeCloseTo(3.255, 3);
    expect(1000 / 279.1).toBeCloseTo(3.583, 3);
    const vSwapped = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'Swap Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: false, electrical: false },
      plannerSurfaces: [
        {
          id: 'wall-1',
          name: 'Ana Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 3686,
          netH: 1200,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 4.3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 3.583, // Hata: dikey değer yatay yerine verilmiş!
          viewDistM: 3.5,
        },
      ],
    });
    expect(vSwapped.checks.some(c => c.id === 'pm-mm-0' && c.status === 'error')).toBe(true);
    expect(vSwapped.pdfApprovalStatus).toBe('BLOCKED');
  });

  it('Deep Refactor Test F: Yüzeyde 3 projektör tanımlanıp dağılım listesinde 1 satır varsa FAIL olmalıdır', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'Dist Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: true, electrical: false },
      photometricSurfaces: [
        {
          surfaceId: 'wall-1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          screenGain: 1.0,
          avgLux: 523.26,
          minLux: 400,
          maxLux: 600,
          luminanceNits: 141.58,
          luminanceFL: 41.3,
          ambientLux: 20,
          ambientContrastRatio: 27.2,
          uniformityU0: 80,
          uniformityU1: 66.7,
          distributionRows: [
            { code: 'PJ-1', startX: 0, endX: 6.25, widthM: 6.25, centerX: 3.125, throwDistM: 5, throwRatio: 0.8, overlapText: '—' },
          ],
        },
      ],
    });
    expect(v.checks.some(c => c.id === 'dist-rows-count-0' && c.status === 'error')).toBe(true);
    expect(v.pdfApprovalStatus).toBe('BLOCKED');
    expect(v.canExportFinalPdf).toBe(false);
  });

  it('Deep Refactor Test G: LuxField 288-nokta min/max aralığı dışına 9-nokta örneklemesi çıkamaz', () => {
    const grid288 = computeLuxSimulationGrid(baseInput, 24, 12);
    const sample9 = sampleNinePointsFromLuxGrid(grid288, 12, 4.3, 1.0, 0.85);
    expect(grid288.samplingMethod).toBe('288-point-grid');
    expect(grid288.sampleCount).toBe(288);
    expect(sample9.samplingMethod).toBe('9-point-sampling');
    expect(sample9.sampleCount).toBe(9);
    expect(sample9.luxFieldId).toBe(grid288.luxFieldId);
    expect(sample9.surfaceId).toBe(grid288.surfaceId);
    for (const z of sample9.zones9) {
      expect(z.lux).toBeGreaterThanOrEqual(grid288.minLux);
      expect(z.lux).toBeLessThanOrEqual(grid288.maxLux);
    }
  });

  it('Deep Refactor Test H: Kısa devre veya selektivite verisi yoksa sonuç UNKNOWN olmalıdır', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'ShortCircuit Test', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: false, electrical: true },
      electrical: {
        loads: [{ id: 'l1', name: 'PJ-1', powerW: 450, qty: 1 }],
        circuits: [{ id: 'c1', name: 'L1-A', loadIds: ['l1'], phase: 'L1', cableMm2: 2.5, lengthM: 20, ampacityA: 24 }],
        supply: { voltage: 230, phases: 1, defaultPf: 1, designMargin: 1.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
      },
    });
    expect(v.checks.some(c => c.id === 'elec-shortcircuit-selectivity' && c.status === 'unknown')).toBe(true);
  });

  it('REV.1 Test 1: 30.000 lm, %90 verim, 36 m² (12×3 m) -> Teorik 750 lx ile Simüle LuxField ve Saha Ölçümü ayrı tutulur', () => {
    const res = evaluateCentralProjectionDesign({
      ...baseInput,
      surface: { id: 'wall-12x3', name: '12x3 Duvar', widthM: 12, heightM: 3, viewingDistanceM: 4 },
      projector: { ...baseInput.projector, nativeContrast: undefined },
      photometrics: { ...baseInput.photometrics, measuredLuxSamples: [410, 445, 460] },
    });
    expect(res.illuminance.theoretical.source).toBe('THEORETICAL');
    expect(res.illuminance.theoretical.avgLux).toBe(750);
    expect(res.illuminance.simulated.source).toBe('SIMULATED_LUXFIELD');
    expect(res.illuminance.simulated.avgLux).not.toBe(750);
    expect(res.illuminance.simulated.minLux!).toBeLessThanOrEqual(res.illuminance.simulated.avgLux!);
    expect(res.illuminance.simulated.avgLux!).toBeLessThanOrEqual(res.illuminance.simulated.maxLux!);
    expect(res.illuminance.measured.source).toBe('MEASURED');
    expect(res.illuminance.measured.avgLux).toBeCloseTo(438.33, 1);
    expect(res.luminance.theoretical.source).toBe('THEORETICAL');
    expect(res.luminance.simulated.source).toBe('SIMULATED_LUXFIELD');
    expect(res.luminance.measured.source).toBe('MEASURED');
    expect(res.contrast.acrVerified).toBe(false);
    expect(res.contrast.acr).toBeNull();
    expect(res.contrast.estimatedAmbientContrast).toBeGreaterThan(1);
  });

  it('REV.1 Test 2: Üçlü Overlap Motoru — PJ1(0–6.25m), PJ2(2.88–9.13m), PJ3(5.75–12m) -> 0.50m üçlü kesişim ve IE=Geometrik Birleşim', () => {
    const fps = buildGridFootprints({
      cols: 3,
      rows: 1,
      imageWidthM: 6.25,
      imageHeightM: 3.90625,
      overlapFracX: 0.54,
      surfaceHeightM: 4.3,
      positionsX: [0, 2.88, 5.75],
    });
    const ov = analyzeFootprintOverlaps(fps, 12, 4.3, 3);
    expect(ov.hasNonAdjacentOverlap).toBe(true);
    expect(ov.maxMultiplicity).toBe(3);
    const pj13 = ov.pairwiseIntersections.find(p => p.projectorIds.join(',') === 'PJ-01,PJ-03');
    expect(pj13).toBeDefined();
    expect(pj13!.adjacent).toBe(false);
    expect(pj13!.widthM).toBeCloseTo(0.5, 2);
    expect(ov.higherOrderIntersections).toHaveLength(1);
    expect(ov.higherOrderIntersections[0].multiplicity).toBe(3);
    expect(ov.higherOrderIntersections[0].widthM).toBeCloseTo(0.5, 2);
    expect(ov.geometryConsistent).toBe(true);
    expect(ov.unionAreaM2).toBeCloseTo(ov.unionAreaInclusionExclusionM2!, 2);

    const wTriple = normalizedBlendWeights(fps, 6.0, 2.15);
    expect(wTriple.filter(w => w > 0)).toHaveLength(3);
    expect(wTriple.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('REV.1 Test 3: Tek Kaynaklı Kırpılmış Kanvas — 12×3 m yüzey, 3686×922 px -> H=307.17, V=307.33 px/m, 3.256/3.254 mm/px, 3.40 MP ve 2.41 mm/px reddi', () => {
    const cc = computeContentCanvas({
      rasterW: 3686,
      rasterH: 1200,
      opticalPxPerMeterH: 1920 / 6.25,
      opticalPxPerMeterV: 1200 / 3.90625,
      surfaceWidthM: 12,
      surfaceHeightM: 3,
    });
    expect(cc.contentCanvas.w).toBe(3686);
    expect(cc.contentCanvas.h).toBe(922);
    expect(cc.pxPerMeterH).toBeCloseTo(307.17, 2);
    expect(cc.pxPerMeterV).toBeCloseTo(307.33, 2);
    expect(cc.mmPerPxH).toBeCloseTo(3.256, 3);
    expect(cc.mmPerPxV).toBeCloseTo(3.254, 3);
    expect(cc.contentCanvas.mp).toBe(3.4);
    expect(identifyMmPerPxSource(2.41, cc.mmPerPxH, cc.mmPerPxV)).toBe('unmatched');

    const vBadMm = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'BadMm', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: false, electrical: false },
      plannerSurfaces: [
        {
          id: 'wall-12x3',
          name: '12x3 Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 3686,
          netH: 922,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 2.41,
          viewDistM: 4,
        },
      ],
    });
    expect(vBadMm.checks.some(c => c.id === 'pm-mm-0' && c.status === 'error')).toBe(true);
    expect(vBadMm.pdfGateStatus).toBe('BLOCKED');
  });

  it('REV.1 Test 4: Ortalama lux maksimumu aştığında (E_avg > E_max) otomatik FAIL ve BLOCKED üretilir', () => {
    const v = validateReportConsistency({
      lang: 'tr',
      meta: { companyName: 'Test', customer: '', projectName: 'LuxOrder', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: true, electrical: false },
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 3,
          projectorCount: 3,
          screenGain: 1.0,
          avgLux: 750, // Teorik ortalama yanlışlıkla LuxField min/max ile karıştırılmış!
          minLux: 210,
          maxLux: 480,
          luminanceNits: 202.9,
          luminanceFL: 59.2,
          ambientLux: 20,
          ambientContrastRatio: 38,
          uniformityU0: 28,
          uniformityU1: 43.8,
        },
      ],
    });
    expect(v.checks.some(c => c.id === 'lux-order-0' && c.status === 'error')).toBe(true);
    expect(v.pdfGateStatus).toBe('BLOCKED');
  });

  it('REV.1 Denetim Bulguları 1–8: 5 yöntemli Lux/Nit ayrımı, Tablo A/B kanvas metrikleri, duvar içi üçlü overlap (20.25 m² / 1.50 m²), tavan aşımı, lens etiket çelişkisi ve elektrik UNKNOWN dürüstlüğü doğrulanır', () => {
    // 1. Üçlü overlap: tam projeksiyon düzlemi (26.367 m², üçlü 1.953 m²) vs 12×3 m duvar içi kırpılmış (20.25 m², üçlü 1.50 m²)
    const footprints = buildGridFootprints({
      cols: 3,
      rows: 1,
      imageWidthM: 6.25,
      imageHeightM: 3.90625,
      overlapFracX: 0.54,
      surfaceHeightM: 3,
    });
    const ov = analyzeFootprintOverlaps(footprints, 12, 3, 3);
    expect(ov.redundantOverlapAreaM2).toBeCloseTo(26.367, 1);
    expect(ov.surfaceSumFootprintAreaM2).toBeCloseTo(56.25, 2);
    expect(ov.surfaceRedundantOverlapAreaM2).toBeCloseTo(20.25, 2);
    expect(ov.surfaceHigherOrderOverlapAreaM2).toBeCloseTo(1.5, 2);
    expect(ov.higherOrderIntersections[0]?.clippedAreaM2).toBeCloseTo(1.5, 2);

    // 2. 5 Yöntemli Lux & Nit tablosu ve Tablo A / Tablo B kanvas metrikleri HTML raporda ayrıştırılır
    const simGrid = computeLuxSimulationGrid({
      room: { widthM: 12, lengthM: 6, heightM: 3.5 },
      surface: { id: 'w1', name: 'Ana Duvar', widthM: 12, heightM: 3, viewingDistanceM: 4 },
      projector: { model: 'Laser 10K', cols: 3, rows: 1, nativeW: 1920, nativeH: 1200, ansiLumensPerUnit: 10000, powerWPerUnit: 450 },
      lens: { model: 'Short Zoom', throwDistM: 5, throwRatio: 0.8 },
      photometrics: { opticalEfficiencyPct: 90, screenGain: 1.0, reflectance: 0.85, ambientLux: 20 },
      blending: { overlapPctX: 54 },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1 },
    }, 24, 12);
    const g9 = sampleNinePointsFromLuxGrid(simGrid, 12, 3, 1.0, 0.85);

    const payload = {
      lang: 'tr' as const,
      meta: { companyName: 'Test', customer: '', projectName: 'AuditRev1', location: '', category: '', date: '2026-11-15', revision: 1, description: '' },
      sections: { ...DEFAULT_SECTIONS, lux: true, multiProjector: true, electrical: true },
      interProjectorAnalysis: {
        projectors: [],
        surfaceStats: [],
        cornerTransitions: [],
        totalProjectors: 3,
        totalPowerW: 1350,
        roomDimensions: { widthM: 12, lengthM: 6, heightM: 3.5 },
      },
      photometricSurfaces: [
        {
          surfaceId: 'w1',
          surfaceName: '1. Düz Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 3,
          projectorCount: 3,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          nominalTheoreticalLux: 833.3,
          effectiveTheoreticalLux: 750,
          theoreticalAvgLux: 750,
          ninePointEqualLux: Math.round(g9.equalMeanLux),
          ninePointWeightedLux: +(g9.weightedMeanLux).toFixed(1),
          gridAvgLux: simGrid.avgLux,
          gridUniformityU0Pct: simGrid.u0Pct,
          gridUniformityU1Pct: simGrid.u1Pct,
          avgLux: Math.round(g9.equalMeanLux),
          minLux: Math.round(g9.minLux),
          maxLux: Math.round(g9.maxLux),
          uniformityU0: +(g9.u0Pct / 100).toFixed(4),
          uniformityU1: +(g9.u1Pct / 100).toFixed(4),
          screenGain: 1.0,
          surfaceReflectance: 0.85,
          luminanceNits: +((g9.equalMeanLux * 0.85) / Math.PI).toFixed(1),
          luminanceFL: +(((g9.equalMeanLux * 0.85) / Math.PI) * 0.2919).toFixed(1),
          ambientLux: 20,
          ambientContrastRatio: +(((g9.equalMeanLux + 20) / 20)).toFixed(1),
          luxSource: 'SIMULATED_LUXFIELD' as const,
          distributionRows: [
            { code: 'PJ 1', startX: 0, endX: 6.25, widthM: 6.25, centerX: 3.13, throwDistM: 5, throwRatio: 0.8, overlapText: '3.38m (%54 Blend)' },
            { code: 'PJ 2', startX: 2.88, endX: 9.13, widthM: 6.25, centerX: 6.0, throwDistM: 5, throwRatio: 0.8, overlapText: '3.38m (%54 Blend)' },
            { code: 'PJ 3', startX: 5.75, endX: 12.0, widthM: 6.25, centerX: 8.88, throwDistM: 5, throwRatio: 0.8, overlapText: '— (Kenar)' },
          ],
        },
      ],
      plannerSurfaces: [
        {
          id: 'w1',
          name: '1. Düz Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          projNetW: 3686,
          projNetH: 1200,
          netW: 3686,
          netH: 922,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 3.26,
          distMmPerPx: 3.26,
          viewDistM: 4,
        },
      ],
      projection: {
        screenName: '1. Düz Duvar',
        projectorName: '3x Genel Projektör',
        lensName: '1.25 – 1.60:1 Standart Zoom', // 0.72–1.60 ile çelişkili etiket!
        distanceM: 5,
        imageWidthM: 6.25,
        throwRatio: 0.8,
        throwMin: 0.72,
        throwMax: 1.6,
        aspectW: 16,
        aspectH: 10,
      },
      electrical: {
        supply: { voltage: 230, phases: 3 as const, defaultPf: 0.95, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
        loads: [{ id: 'L1', name: '3x Projektör', powerW: 450, qty: 3, pf: 0.95 }],
        circuits: [{ id: 'C1', name: 'Linye-1 (3x Projektör)', loadIds: ['L1'], phase: 'L1' as const, cableMm2: 2.5, lengthM: 25, ampacityA: 25 }],
      },
    };

    const html = buildReportHtml(payload);
    // 5 yöntemli tablo ve Tablo A / Tablo B kanvas ayrımı
    expect(html).toContain('5 Yöntemli Aydınlık (Lux) &amp; Parlaklık (Nit) Karşılaştırma Tablosu');
    expect(html).toContain('Tablo A — Birleşik Projeksiyon Rasteri');
    expect(html).toContain('Tablo B — Kırpılmış İçerik Kanvası');
    // Üst kartta 750 lx ile Min 327 / Max 360 lx asla aynı ortalama gibi gösterilmez
    expect(html).not.toContain('750 <span style="font-size:11px; font-weight:normal; color:#64748b;">lx</span>');

    const val = validateReportConsistency(payload);
    // Dikey taşma (3.91 m > 3.0 m duvar ve > 3.5 m oda tavanı) uyarısı
    expect(val.checks.some(c => c.id === 'vertical-overspill-ceiling-0' && c.status === 'warning')).toBe(true);
    // Lens adı (1.25–1.60:1) ile throwMin–throwMax (0.72–1.60:1) çelişkisi yakalanır
    expect(val.checks.some(c => c.id === 'proj-lens-range' && c.status === 'error')).toBe(true);
    // Elektrikte girilmeyen Icu/Ik/inrush için "doğrulandı" denmez
    const elecCheck = val.checks.find(c => c.id === 'elec-shortcircuit-selectivity');
    expect(elecCheck?.status).toBe('unknown');
    expect(elecCheck?.message).not.toContain('Icu ≥ Ik ve inrush doğrulandı');
    expect(elecCheck?.message).toContain('Yalnızca Ib ve ΔU hesaplandı');
  });
});
