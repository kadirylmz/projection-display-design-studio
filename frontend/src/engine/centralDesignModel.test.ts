import { describe, expect, it } from 'vitest';
import {
  evaluateCentralProjectionDesign,
  compareLayoutScenarios,
  computeLuxSimulationGrid,
  sampleNinePointsFromLuxGrid,
  CentralDesignInput,
} from './centralDesignModel';
import { buildReportHtml, DEFAULT_SECTIONS } from './report';

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
    expect(res.traceability.engineVersion).toBe('2.4.0');

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
});
