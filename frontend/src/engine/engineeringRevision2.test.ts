import { describe, it, expect } from 'vitest';
import {
  computeContentCanvas,
  validateLuxOrder,
  computeContrastAnalysis,
  computeLuminanceFromSource,
  buildTheoreticalIlluminance,
  validateLensZoomMargin,
} from './projectionGeometry';
import {
  evaluateCentralProjectionDesign,
  computeLuxSimulationGrid,
  sampleNinePointsFromLuxGrid,
  CentralDesignInput,
} from './centralDesignModel';
import { validateReportConsistency, ReportValidationResult } from './reportValidation';
import { DEFAULT_SECTIONS } from './report';
import { loadCurrent } from './electrical';

describe('AV Engineering Engine — Revision 2.0 (10 Temel Regresyon + Destek Testleri)', () => {
  const standardInput: CentralDesignInput = {
    room: { widthM: 14, lengthM: 10, heightM: 5 },
    surface: { id: 'SURF-MAIN', name: 'Ana Sergi Duvarı', widthM: 12, heightM: 4.3, viewingDistanceM: 6 },
    projector: {
      model: 'Barco UDM-4K22',
      cols: 3,
      rows: 1,
      nativeW: 1920,
      nativeH: 1200,
      ansiLumensPerUnit: 10000,
      powerWPerUnit: 1200,
      nativeContrast: 2000,
    },
    lens: {
      model: 'TLD+ 1.16-1.49:1',
      throwDistM: 7.42,
      throwRatio: 1.187,
      throwMin: 1.16,
      throwMax: 1.49,
    },
    photometrics: {
      opticalEfficiencyPct: 90,
      screenGain: 1.0,
      reflectance: 0.85,
      ambientLux: 20,
      uniformityU0Pct: 82,
    },
    blending: {
      overlapPctX: 18.75,
      gamma: 2.2,
    },
    electrical: {
      supplyVoltageV: 230,
      phases: 3,
      shortCircuitVerified: true,
      selectivityVerified: true,
    },
  };

  // 1. 12 × 4.3 m duvar ve 12 × 3.906 m projeksiyon: kaplama FAIL
  it('1. 12 × 4.3 m duvar ve 12 × 3.906 m projeksiyon: kaplama FAIL', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    expect(evalRes.singleSourceGeometry.targetSurface.widthM).toBe(12);
    expect(evalRes.singleSourceGeometry.targetSurface.heightM).toBe(4.3);
    expect(evalRes.physicalCoverage.coveredWidthM).toBeGreaterThanOrEqual(12);
    expect(evalRes.physicalCoverage.coveredHeightM).toBeCloseTo(3.906, 2);
    expect(evalRes.physicalCoverage.horizontalCoveragePct).toBe(100);
    expect(evalRes.physicalCoverage.verticalCoveragePct).toBeCloseTo(90.84, 0); // %90.84
    expect(evalRes.physicalCoverage.uncoveredHeightM).toBeCloseTo(0.394, 2); // 0.394 m açık
    expect(evalRes.physicalCoverage.isFullyCovered).toBe(false);
    expect(evalRes.physicalCoverage.verdict).toBe('FAIL');
  });

  // 2. 3686 × 1200 raster ve 12 × 4.3 m yüzey: 3349 × 1200 içerik kanvası
  it('2. 3686 × 1200 raster ve 12 × 4.3 m yüzey: 3349 × 1200 içerik kanvası', () => {
    const res = computeContentCanvas({
      rasterW: 3686,
      rasterH: 1200,
      opticalPxPerMeterH: 1920 / 6.25,
      opticalPxPerMeterV: 1200 / 3.906,
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      activeWidthM: 12,
      activeHeightM: 3.906,
      surfaceId: 'SURF-MAIN',
      rasterId: 'RASTER-BLENDED',
    });

    const dm = res.detailedMetrics!;
    expect(dm).toBeDefined();

    // A: Aktif projeksiyon rasteri
    expect(dm.activeRaster.w).toBe(3686);
    expect(dm.activeRaster.h).toBe(1200);
    expect(dm.activeRaster.pxPerMeterH).toBeCloseTo(307.2, 0);
    expect(dm.activeRaster.pxPerMeterV).toBeCloseTo(307.2, 0);
    expect(dm.activeRaster.mmPerPxH).toBeCloseTo(3.256, 1);
    expect(dm.activeRaster.mmPerPxV).toBeCloseTo(3.256, 1);

    // B: Tam duvara kare piksel içerik kanvası
    expect(dm.squarePixelContentCanvas.w).toBe(3349);
    expect(dm.squarePixelContentCanvas.h).toBe(1200);
    expect(dm.squarePixelContentCanvas.pxPerMeterH).toBeCloseTo(279.1, 0);
    expect(dm.squarePixelContentCanvas.pxPerMeterV).toBeCloseTo(279.1, 0);
    expect(dm.squarePixelContentCanvas.mmPerPxH).toBeCloseTo(3.583, 1);
    expect(dm.squarePixelContentCanvas.mmPerPxV).toBeCloseTo(3.583, 1);

    // İki kanvas asla aynı değeri otomatik kopyalayamaz
    expect(dm.activeRaster.w).not.toBe(dm.squarePixelContentCanvas.w);
  });

  // 3. 9 nokta U0 %95.9, 288 grid U0 %37.1: genel homojenlik PASS olmamalı
  it('3. 9 nokta U0 %95.9, 288 grid U0 %37.1: genel homojenlik PASS olmamalı', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    // 9 nokta aktif iç alanda kaldığı için U0 yüksek (~%91-%96)
    expect(evalRes.activeProjectionUniformity.u0Pct).toBeGreaterThanOrEqual(70);
    // Ancak 288 grid tüm yüzeyde açık marjinler nedeniyle U0 düşük (%37.1 civarı)
    expect(evalRes.fullSurfaceUniformity.u0Pct).toBeLessThan(60);
    // Genel yüzey homojenliği kararı PASS olamaz, FAIL olmalıdır
    expect(evalRes.fullSurfaceUniformity.verdict).toBe('FAIL');
  });

  // 4. Fiziksel kaplama %90.83 ve grid 0/288 sıfır: grid kapsamı açıklanmadan %100 tüm duvar kaplama sonucu verilememeli
  it('4. Fiziksel kaplama %90.83 ve grid 0/288 sıfır: grid kapsamı açıklanmadan %100 tüm duvar kaplama sonucu verilememeli', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    // Aktif alanda 9 nokta örneklemesi PASS
    expect(evalRes.activeProjectionUniformity.sampleCount).toBe(9);
    expect(evalRes.activeProjectionUniformity.verdict).toBe('PASS');
    // Ancak fiziksel dikey kaplama eksik (%90.84)
    expect(evalRes.physicalCoverage.verticalCoveragePct).toBeCloseTo(90.84, 0);
    // Full surface coverage %100 PASS olamaz!
    expect(evalRes.fullSurfaceUniformity.verdict).toBe('FAIL');
    expect(evalRes.physicalCoverage.isFullyCovered).toBe(false);
  });

  // 5. Native siyah seviyesi UNKNOWN: gerçek ACR UNKNOWN
  it('5. Native siyah seviyesi UNKNOWN: gerçek ACR UNKNOWN', () => {
    const theoRec = buildTheoreticalIlluminance(30000, 90, 36);
    const lumRec = computeLuminanceFromSource(theoRec, 1.0, 0.85);
    const acrRes = computeContrastAnalysis({
      white: lumRec,
      ambientLux: 20,
      gain: 1.0,
      reflectance: 0.85,
      nativeContrast: null, // Doğal kontrast bilinmiyor
      nativeBlackNits: null,
    });

    expect(acrRes.acrVerified).toBe(false);
    expect(acrRes.status).toBe('UNKNOWN');
    expect(acrRes.message).toContain('Cihaz doğal siyah seviyesi / native kontrast girilmedi; gerçek ACR doğrulanamaz (UNKNOWN)');
  });

  // 6. Lens zoom aralığı manuel ve katalog doğrulaması yok: MANUFACTURER_VERIFIED PASS olmamalı
  it('6. Lens zoom aralığı manuel ve katalog doğrulaması yok: MANUFACTURER_VERIFIED PASS olmamalı', () => {
    const inputWithCustomLens: CentralDesignInput = {
      ...standardInput,
      lens: {
        model: 'Bilinmeyen Özel Lens',
        throwDistM: 7.42,
        throwRatio: 1.187,
        throwMin: undefined,
        throwMax: undefined,
      },
    };
    const evalRes = evaluateCentralProjectionDesign(inputWithCustomLens);
    expect(evalRes.lensSpecs.catalogStatus).toBe('UNKNOWN');
    expect(evalRes.lensSpecs.catalogStatus).not.toBe('MANUFACTURER_VERIFIED');
  });

  // 7. İki farklı oda geometrisi aynı raporda farklı scenarioId taşımıyorsa rapor bloklanmalı
  it('7. İki farklı oda geometrisi aynı raporda farklı scenarioId taşımıyorsa rapor bloklanmalı', () => {
    const repRes = validateReportConsistency({
      lang: 'tr',
      meta: {
        projectName: 'Çoklu Oda Geometrisi Testi',
        customer: '',
        location: '',
        category: '',
        date: '2026-11-15',
        revision: 1,
        companyName: '',
        description: '',
      },
      sections: DEFAULT_SECTIONS,
      scenarios: [
        {
          scenarioId: 'SCENARIO-1',
          surfaceId: 'SURF-1',
          surfaceName: 'Oda 1 Ana Duvar',
          projectorCount: 3,
          projectorModels: ['Barco UDM-4K22'],
          lensModels: ['TLD+ 1.16-1.49:1'],
          unitLumens: 10000,
          unitPowerW: 1200,
          throwDistM: 7.42,
          imageWidthM: 12,
          imageHeightM: 4.3,
          overlapPct: 18.75,
          combinedW: 3686,
          combinedH: 1200,
          canvasW: 3349,
          canvasH: 1200,
          room: { widthM: 14, lengthM: 10, heightM: 5 },
        },
        {
          scenarioId: 'SCENARIO-1', // ÇAKIŞMA: İki farklı geometri aynı scenarioId altında!
          surfaceId: 'SURF-2',
          surfaceName: 'Oda 2 Küçük Duvar',
          projectorCount: 2,
          projectorModels: ['Barco G60'],
          lensModels: ['Standard'],
          unitLumens: 6000,
          unitPowerW: 600,
          throwDistM: 4.5,
          imageWidthM: 8,
          imageHeightM: 3.6,
          overlapPct: 15,
          combinedW: 3400,
          combinedH: 1080,
          canvasW: 3200,
          canvasH: 1080,
          room: { widthM: 8, lengthM: 6, heightM: 3.6 },
        },
      ],
    });

    const multiGeomCheck = repRes.checks.find(c => c.id === 'multi-room-geometry-conflict');
    expect(multiGeomCheck).toBeDefined();
    expect(multiGeomCheck?.status).toBe('error');
    expect(repRes.structuredErrors.some(e => e.errorId === 'ERR-MULTI-GEOMETRY')).toBe(true);
    expect(repRes.pdfApprovalStatus).toBe('BLOCKED');
  });

  // 8. Kritik hata sayısı, özet, kategori tablosu ve çapraz doğrulamada aynı olmalı
  it('8. Kritik hata sayısı, özet, kategori tablosu ve çapraz doğrulamada aynı olmalı', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    const cv = evalRes.crossValidation;

    const actualErrors = cv.checks.filter(c => c.status === 'error').length;
    const actualWarnings = cv.checks.filter(c => c.status === 'warning').length;
    const actualUnknowns = cv.checks.filter(c => c.status === 'unknown').length;
    const actualPass = cv.checks.filter(c => c.status === 'pass').length;

    expect(cv.errorCount).toBe(actualErrors);
    expect(cv.warningCount).toBe(actualWarnings);
    expect(cv.unknownCount).toBe(actualUnknowns);
    expect(cv.passCount).toBe(actualPass);
  });

  // 9. 1350 W üç faz hat akımı ile 450 W tek faz linye akımı ayrı hesaplanmalı
  it('9. 1350 W üç faz hat akımı ile 450 W tek faz linye akımı ayrı hesaplanmalı', () => {
    // Üç Faz Hat Akımı (1350 W, 400 V, cosφ = 0.95):
    // I = P / (√3 × V_LL × cosφ) = 1350 / (1.73205 × 400 × 0.95) ≈ 2.051 A
    const iThreePhase = loadCurrent(1350, 400, 0.95, true);
    expect(iThreePhase).toBeCloseTo(2.051, 2);

    // Tek Faz Linye Akımı (450 W, 230 V, cosφ = 0.95):
    // I = P / (V_LN × cosφ) = 450 / (230 × 0.95) ≈ 2.059 A
    const iSinglePhase = loadCurrent(450, 230, 0.95, false);
    expect(iSinglePhase).toBeCloseTo(2.059, 2);

    // İki akım birbirinden bağımsız formül ve gerilimle hesaplanır
    expect(iThreePhase).not.toBe(iSinglePhase);
  });

  // 10. Herhangi bir kritik FAIL mevcutken PDF nihai mühendislik onayı verememeli
  it('10. Herhangi bir kritik FAIL mevcutken PDF nihai mühendislik onayı verememeli', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    expect(evalRes.crossValidation.errorCount).toBeGreaterThan(0);
    expect(evalRes.crossValidation.pdfApprovalStatus).toBe('BLOCKED');
    expect(evalRes.crossValidation.pdfGateStatus).toBe('BLOCKED');
    expect(evalRes.crossValidation.canExportFinalPdf).toBe(false);
    expect(evalRes.crossValidation.approvalBlockReasons.some(r => r.includes('kaplama'))).toBe(true);
  });

  // Ek Test 11: Crop yapıldığında fiziksel kaplamanın değişmediği doğrulanıyor mu?
  it('Ek Test 11: Crop yapıldığında fiziksel kaplamanın değişmediği doğrulanıyor mu?', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    const geom = evalRes.singleSourceGeometry;
    expect(geom.contentCanvas.increasesPhysicalCoverage).toBe(false);
    expect(geom.contentCanvas.cropFromBlendedPxW).toBe(geom.blendedRaster.w - geom.contentCanvas.w);
    expect(geom.contentCanvas.cropFromBlendedPxW).toBeGreaterThan(0);
  });

  // Ek Test 12: 2, 3 ve 4 projektörlü senaryolar aynı yüzey için tutarlı karşılaştırılıyor mu?
  it('Ek Test 12: 2, 3 ve 4 projektörlü senaryolar aynı yüzey için tutarlı karşılaştırılıyor mu?', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    expect(evalRes.scenarioComparison).toBeDefined();
    expect(evalRes.scenarioComparison.length).toBe(3);

    const [sc2, sc3, sc4] = evalRes.scenarioComparison;
    expect(sc2.projectorCount).toBe(2);
    expect(sc3.projectorCount).toBe(3);
    expect(sc4.projectorCount).toBe(4);

    expect(sc4.netPixelEfficiencyPct).toBeLessThan(sc2.netPixelEfficiencyPct);
    expect(sc4.powerW).toBe(4 * 1200);
    expect(sc2.powerW).toBe(2 * 1200);
  });

  // Ek Test 13: Renk ve blend parametreleri ölçüm yoksa UNKNOWN olarak etiketleniyor mu?
  it('Ek Test 13: Renk ve blend parametreleri ölçüm yoksa UNKNOWN olarak etiketleniyor mu?', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    expect(evalRes.colorAndBlend.deltaE2000Status).toBe('UNKNOWN');
    expect(evalRes.colorAndBlend.deltaCctStatus).toBe('UNKNOWN');
    expect(evalRes.colorAndBlend.colorUniformityStatus).toBe('UNKNOWN');
    expect(evalRes.colorAndBlend.blendTransitionStatus).toBe('UNKNOWN');
  });

  // Ek Test 14: Feasibility score formülü doğru sonuç üretiyor mu?
  it('Ek Test 14: Feasibility score formülü doğru sonuç üretiyor mu?', () => {
    const evalRes = evaluateCentralProjectionDesign(standardInput);
    expect(evalRes.crossValidation.feasibilityScoreFormula).toBe(
      'S = 0.35·S_cov + 0.25·S_lux + 0.25·S_uni + 0.15·S_el - 35·N_crit'
    );
    expect(evalRes.crossValidation.feasibilityScorePct).toBeGreaterThanOrEqual(0);
    expect(evalRes.crossValidation.feasibilityScorePct).toBeLessThanOrEqual(100);
  });
});
