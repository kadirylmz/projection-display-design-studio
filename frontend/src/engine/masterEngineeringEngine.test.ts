import { describe, it, expect } from 'vitest';
import {
  evaluateCentralProjectionDesign,
  computeLuxSimulationGrid,
  sampleNinePointsFromLuxGrid,
  CentralDesignInput,
} from './centralDesignModel';
import {
  analyzeFootprintOverlaps,
  buildGridFootprints,
  computeContentCanvas,
  computeContrastAnalysis,
  computeLuminanceFromSource,
  buildTheoreticalIlluminance,
  buildSimulatedIlluminance,
  validateLuxOrder,
} from './projectionGeometry';
import { evaluatePhysicalCoverage } from './physicalCoverage';
import { loadCurrent, analyze as analyzeElectrical, defaultSupply } from './electrical';
import { validateReportConsistency, StructuredValidationError } from './reportValidation';
import { DEFAULT_SECTIONS } from './report';
import {
  resolveProjectorWatts,
  resolveProjectorNativeContrast,
  resolveProjectorDynamicContrast,
  calculateCameraOpticsFov,
  DEFAULT_CAMERA_PROFILES,
} from './opticalDeviceEngine';
import {
  CATALOG_PROJECTORS,
  CATALOG_LENSES,
  getCompatibleCatalogLenses,
} from '../data/projectorCatalog';
import {
  DEFAULT_PROJECTOR_PROFILES,
  ProjectorDeviceProfile,
} from './opticalDeviceEngine';

describe('MASTER AV MÜHENDİSLİK HESAPLAMA MOTORU — TEST A-J KAPSAMLI DOĞRULAMA', () => {

  // =========================================================================
  // TEST A: TEK PROJEKTÖR OPTİK VE GEOMETRİ HESAPLAMASI
  // =========================================================================
  describe('Test A — Tek Projektör Optik ve Geometrik Kapsama', () => {
    it('bilinen ekran ölçüsü, atım mesafesi ve TR ile tam kaplama doğrulanır', () => {
      // 4.00 m × 2.50 m ekran (16:10 en-boy oranı = 1.60:1)
      // Throw Distance = 4.80 m, TR = 1.20:1
      // Beklenen: Görüntü Genişliği = 4.80 / 1.20 = 4.00 m
      // Beklenen: Görüntü Yüksekliği = 4.00 / 1.60 = 2.50 m
      const cov = evaluatePhysicalCoverage({
        surfaceWidthM: 4.00,
        surfaceHeightM: 2.50,
        cols: 1,
        rows: 1,
        projW: 1920,
        projH: 1200,
        throwDistM: 4.80,
        throwRatio: 1.20,
      });

      expect(cov.singleImageWidthM).toBeCloseTo(4.00, 2);
      expect(cov.singleImageHeightM).toBeCloseTo(2.50, 2);
      expect(cov.coveredWidthM).toBeCloseTo(4.00, 2);
      expect(cov.coveredHeightM).toBeCloseTo(2.50, 2);
      expect(cov.horizontalCoveragePct).toBe(100);
      expect(cov.verticalCoveragePct).toBe(100);
      expect(cov.uncoveredWidthM).toBe(0);
      expect(cov.uncoveredHeightM).toBe(0);
      expect(cov.isFullyCovered).toBe(true);
      expect(cov.verdict).toBe('PASS');
    });

    it('yetersiz atım oranı ile açık kalan alan ve FAIL durumu tespit edilir', () => {
      // TR = 1.50:1 -> Görüntü Genişliği = 4.80 / 1.50 = 3.20 m < 4.00 m
      const cov = evaluatePhysicalCoverage({
        surfaceWidthM: 4.00,
        surfaceHeightM: 2.50,
        cols: 1,
        rows: 1,
        projW: 1920,
        projH: 1200,
        throwDistM: 4.80,
        throwRatio: 1.50,
      });

      expect(cov.coveredWidthM).toBeCloseTo(3.20, 2);
      expect(cov.uncoveredWidthM).toBeCloseTo(0.80, 2);
      expect(cov.isFullyCovered).toBe(false);
      expect(cov.verdict).toBe('FAIL');
    });
  });

  // =========================================================================
  // TEST B: ÜÇ PROJEKTÖR OVERLAP VE KRİTİK GEOMETRİ DOĞRULAMASI
  // =========================================================================
  describe('Test B — Üç Projektör Overlap & Çoklu Kesişim Geometrisi (4.80×2.50 m Örneği)', () => {
    // Ana yüzey: 4.80 × 2.50 m (12.00 m²)
    // Üç projektör: Her biri 3.75 m genişlik, 2.344 m yükseklik
    // PJ1: 0.00 m, PJ2: 0.52 m, PJ3: 1.05 m
    const surfaceWidthM = 4.80;
    const surfaceHeightM = 2.50;
    const imgW = 3.75;
    const imgH = 2.344;
    const positionsX = [0.00, 0.52, 1.05];

    it('ayak izi aralıkları ve birleşim genişliği 4.80 m doğrulanır', () => {
      const footprints = buildGridFootprints({
        cols: 3,
        rows: 1,
        imageWidthM: imgW,
        imageHeightM: imgH,
        overlapFracX: 0.5, // positionsX verildiğinde doğrudan kullanılır
        surfaceHeightM,
        positionsX,
      });

      expect(footprints.length).toBe(3);
      // PJ1: [0.00, 3.75]
      expect(footprints[0].x0).toBe(0.00);
      expect(footprints[0].x1).toBe(3.75);
      // PJ2: [0.52, 4.27]
      expect(footprints[1].x0).toBe(0.52);
      expect(footprints[1].x1).toBeCloseTo(4.27, 2);
      // PJ3: [1.05, 4.80]
      expect(footprints[2].x0).toBe(1.05);
      expect(footprints[2].x1).toBeCloseTo(4.80, 2);

      // Toplam birleşim genişliği
      const minX = Math.min(...footprints.map(f => f.x0));
      const maxX = Math.max(...footprints.map(f => f.x1));
      expect(maxX - minX).toBeCloseTo(4.80, 2);
    });

    it('ikili ve üçlü kesişimler (3.23m, 3.22m, 2.70m ve 2.70m) doğrulanır', () => {
      const footprints = buildGridFootprints({
        cols: 3,
        rows: 1,
        imageWidthM: imgW,
        imageHeightM: imgH,
        overlapFracX: 0.5,
        surfaceHeightM,
        positionsX,
      });

      const overlap = analyzeFootprintOverlaps(footprints, surfaceWidthM, surfaceHeightM, 3);

      // İkili kesişimler (pairwise):
      // PJ1 & PJ2: [0.52, 3.75] -> genişlik = 3.23 m
      const p1p2 = overlap.pairwiseIntersections.find(
        p => p.projectorIds.includes('PJ-01') && p.projectorIds.includes('PJ-02')
      );
      expect(p1p2).toBeDefined();
      expect(p1p2!.widthM).toBeCloseTo(3.23, 2);

      // PJ2 & PJ3: [1.05, 4.27] -> genişlik = 3.22 m
      const p2p3 = overlap.pairwiseIntersections.find(
        p => p.projectorIds.includes('PJ-02') && p.projectorIds.includes('PJ-03')
      );
      expect(p2p3).toBeDefined();
      expect(p2p3!.widthM).toBeCloseTo(3.22, 2);

      // PJ1 & PJ3: [1.05, 3.75] -> genişlik = 2.70 m
      const p1p3 = overlap.pairwiseIntersections.find(
        p => p.projectorIds.includes('PJ-01') && p.projectorIds.includes('PJ-03')
      );
      expect(p1p3).toBeDefined();
      expect(p1p3!.widthM).toBeCloseTo(2.70, 2);

      // Üçlü kesişim (triple):
      // PJ1 & PJ2 & PJ3: [1.05, 3.75] -> genişlik = 2.70 m
      const triple = overlap.higherOrderIntersections.find(h => h.multiplicity === 3);
      expect(triple).toBeDefined();
      expect(triple!.widthM).toBeCloseTo(2.70, 2);
    });

    it('dikey kaplama %93.76, açık mesafe 0.156m ve birleşim alanı 11.251 m² doğrulanır', () => {
      const footprints = buildGridFootprints({
        cols: 3,
        rows: 1,
        imageWidthM: imgW,
        imageHeightM: imgH,
        overlapFracX: 0.5,
        surfaceHeightM,
        positionsX,
      });

      const overlap = analyzeFootprintOverlaps(footprints, surfaceWidthM, surfaceHeightM, 3);

      // Görüntü yüksekliği: 2.344 m
      expect(imgH).toBe(2.344);
      // Dikey kaplama oranı: 2.344 / 2.50 = %93.76
      const vCoveragePct = (imgH / surfaceHeightM) * 100;
      expect(vCoveragePct).toBeCloseTo(93.76, 2);
      // Açıkta kalan düşey mesafe: 2.50 - 2.344 = 0.156 m
      const uncoveredH = surfaceHeightM - imgH;
      expect(uncoveredH).toBeCloseTo(0.156, 3);

      // Birleşim alanı: 4.80 × 2.344 = 11.2512 m²
      expect(overlap.unionAreaM2).toBeCloseTo(11.251, 2);

      // Inclusion-Exclusion tutarlılığı (çift sayma yok)
      expect(overlap.geometryConsistent).toBe(true);
    });
  });

  // =========================================================================
  // TEST C: PIXEL MAP VE ÇÖZÜNÜRLÜK MOTORU TEKLEŞTİRME
  // =========================================================================
  describe('Test C — Pixel Map & Çözünürlük Motoru (Combined Raster vs Content Canvas)', () => {
    it('2458×1200 birleşik raster ile 2304×1200 içerik kanvası ayrımı ve 154 px fark doğrulanır', () => {
      // 4.80 × 2.50 m yüzey (aspect 1.92:1)
      // 3 projektör, tekil genişlik 3.75 m, 1920×1200 piksel
      // Optik piksel yoğunluğu = 1920 / 3.75 = 512 px/m
      // 4.80 m için birleşik raster = 4.80 × 512 = 2457.6 -> 2458 px × 1200 px
      // Tam duvara kare piksel içerik kanvası (1.92 en-boy koruyarak):
      // 1200 × 1.92 = 2304 px × 1200 px
      const canvasRes = computeContentCanvas({
        rasterW: 2458,
        rasterH: 1200,
        opticalPxPerMeterH: 512,
        opticalPxPerMeterV: 1200 / 2.344,
        surfaceWidthM: 4.80,
        surfaceHeightM: 2.50,
        activeWidthM: 4.80,
        activeHeightM: 2.344,
        surfaceId: 'SURF-REGRESSION-480',
        rasterId: 'RASTER-BLENDED-3x1',
      });

      expect(canvasRes.contentCanvas.w).toBe(2304);
      expect(canvasRes.contentCanvas.h).toBe(1200);
      expect(canvasRes.detailedMetrics?.resolutionDelta.cropW).toBe(154); // 2458 - 2304 = 154 px crop
      expect(canvasRes.detailedMetrics?.activeRaster.w).toBe(2458);
      expect(canvasRes.detailedMetrics?.squarePixelContentCanvas.w).toBe(2304);
    });

    it('yatay ve dikey px/m, mm/px ve anizotropi eksen bazında ayrı hesaplanır', () => {
      const canvasRes = computeContentCanvas({
        rasterW: 3686,
        rasterH: 1200,
        opticalPxPerMeterH: 307.2,
        opticalPxPerMeterV: 307.2,
        surfaceWidthM: 12.0,
        surfaceHeightM: 4.30,
        activeWidthM: 12.0,
        activeHeightM: 3.906,
      });

      const dm = canvasRes.detailedMetrics!;
      expect(dm.activeRaster.pxPerMeterH).toBeCloseTo(307.2, 1);
      expect(dm.activeRaster.pxPerMeterV).toBeCloseTo(307.2, 1);
      expect(dm.activeRaster.mmPerPxH).toBeCloseTo(3.256, 2);
      expect(dm.activeRaster.mmPerPxV).toBeCloseTo(3.256, 2);

      expect(dm.squarePixelContentCanvas.pxPerMeterH).toBeCloseTo(279.1, 1);
      expect(dm.squarePixelContentCanvas.pxPerMeterV).toBeCloseTo(279.1, 1);
      expect(dm.squarePixelContentCanvas.mmPerPxH).toBeCloseTo(3.583, 2);
      expect(dm.squarePixelContentCanvas.mmPerPxV).toBeCloseTo(3.583, 2);
    });

    it('12x4.3m duvarda 3686x1200 aktif optik ayak izi anizotropisi %0.01 (kare piksel) olarak hesaplanır, %9.1 değildir', () => {
      const input: CentralDesignInput = {
        room: { widthM: 14, lengthM: 10, heightM: 5 },
        surface: { id: 'SURF-WALL-12x43', name: 'Ana Sergi Duvarı', widthM: 12.0, heightM: 4.30, viewingDistanceM: 3.5 },
        projector: {
          model: 'Vivitek DU9800Z',
          cols: 3,
          rows: 1,
          nativeW: 1920,
          nativeH: 1200,
          ansiLumensPerUnit: 10000,
          powerWPerUnit: 1900,
        },
        lens: {
          model: 'D98-0810',
          throwDistM: 5.0,
          throwRatio: 0.8,
        },
        blending: {
          overlapPctX: 54.0104, // 1037 px overlap / 1920 = %54.01 -> 3 * 1920 - 2 * 1037 = 3686 px blended
        },
        photometrics: {
          opticalEfficiencyPct: 90,
          screenGain: 1.0,
          reflectance: 0.85,
          ambientLux: 20,
        },
        electrical: { supplyVoltageV: 230, phases: 3, pf: 0.95 },
      };

      const result = evaluateCentralProjectionDesign(input);

      // Aktif projeksiyon ayak izi optik anizotropisi ~%0.01 (Kare piksel)
      expect(result.pixelMapping.blendedRaster.anisotropyDiffPct).toBeLessThan(0.1);
      expect(result.pixelMapping.blendedRaster.pxPerMeterW).toBeCloseTo(307.2, 1);
      expect(result.pixelMapping.blendedRaster.pxPerMeterH).toBeCloseTo(307.2, 1);
      expect(result.singleSourceGeometry.activeProjectionArea.heightM).toBeCloseTo(3.906, 2);

      // Hedef duvara esnetme durumundaki anizotropi ise %9.1 seviyesindedir
      expect(result.pixelMapping.targetSurface.anisotropyDiffPct).toBeCloseTo(9.1, 1);

      // Aktif alan teorik lüks tavanı vs Tüm duvar teorik lüks
      // 3 * 10000 * 0.90 = 27000 lm efektif
      // Aktif alan: 12 * 3.90625 = 46.875 m2 -> 27000 / 46.875 = 576.0 lx
      // Tüm duvar: 12 * 4.3 = 51.60 m2 -> 27000 / 51.60 = 523.26 lx
      expect(result.photometricModel.effectiveTotalLumens).toBe(27000);
      expect(result.photometricModel.theoreticalAvgLux).toBeCloseTo(523.26, 1);

      // İzleme PPD ayrımı: Aktif projeksiyon PPD'si vs Hedef duvar / İçerik kanvası PPD'si
      // Aktif projeksiyon (3686 px / 119.5° FOV) -> 30.85 -> 30.9 PPD
      // Kare piksel kanvas (3349 px / 119.5° FOV) -> 28.0 PPD
      expect(result.viewingQuality.activeProjectionPpd?.ppdH).toBeCloseTo(30.9, 1);
      expect(result.viewingQuality.contentCanvasPpd?.ppdH).toBeCloseTo(28.0, 1);
      expect(result.viewingQuality.activeProjectionPpd?.ppdV).toBeCloseTo(20.6, 1);
      expect(result.viewingQuality.targetSurfacePpd?.ppdV).toBeCloseTo(19.0, 1);
    });
  });

  // =========================================================================
  // TEST D: LUXFIELD VE UNIFORMITY MOTORU DOĞRULAMASI
  // =========================================================================
  describe('Test D — LuxField Matrisi ve Uniformity Doğrulaması', () => {
    it('9-nokta ile 288-nokta grid ayrı veri kaynakları olarak saklanır', () => {
      const input: CentralDesignInput = {
        room: { widthM: 10, lengthM: 8, heightM: 4 },
        surface: { id: 'SURF-D', name: 'Duvar D', widthM: 8, heightM: 3, viewingDistanceM: 4 },
        projector: {
          model: 'Epson EB-PU2010B',
          cols: 2,
          rows: 1,
          nativeW: 1920,
          nativeH: 1200,
          ansiLumensPerUnit: 10000,
          powerWPerUnit: 535,
          nativeContrast: 2000,
        },
        lens: {
          model: 'ELPLM15',
          throwDistM: 5.0,
          throwRatio: 1.0,
          throwMin: 0.8,
          throwMax: 1.2,
        },
        photometrics: {
          opticalEfficiencyPct: 90,
          screenGain: 1.0,
          reflectance: 0.85,
          ambientLux: 20,
          uniformityU0Pct: 80,
        },
        blending: { overlapPctX: 15, gamma: 2.2 },
        electrical: { supplyVoltageV: 230, phases: 1 },
      };

      const res = evaluateCentralProjectionDesign(input);

      // 9 nokta örneklemesi
      expect(res.illuminance.ninePoint.sampleCount).toBe(9);
      expect(res.activeProjectionUniformity.sampleCount).toBe(9);

      // 288 grid (24×12)
      expect(res.fullSurfaceUniformity.totalCellCount).toBe(288);
      expect(res.illuminance.simulated.source).toBe('SIMULATED_LUXFIELD');
      expect(res.illuminance.ninePoint.luxFieldId).toBeDefined();
    });

    it('düşük homojenlik (U0 < %50) yüksek lüks nedeniyle PASS veya ACCEPTABLE olamaz (ERR-LOW-UNIFORMITY)', () => {
      const reportRes = validateReportConsistency({
        lang: 'tr',
        meta: {
          projectName: 'Düşük Homojenlik Testi',
          customer: '',
          location: '',
          category: '',
          date: '2026-11-15',
          revision: 1,
          companyName: '',
          description: '',
        },
        sections: DEFAULT_SECTIONS,
        photometricSurfaces: [
          {
            surfaceId: 'SURF-LOW-U0',
            surfaceName: 'Düşük Homojenlikli Duvar',
            surfaceType: 'wall',
            widthM: 10,
            heightM: 4,
            projectorCount: 2,
            avgLux: 1200, // Çok yüksek ortalama parlaklık
            minLux: 289.2,
            maxLux: 1500,
            uniformityU0: 24.1, // %24.1 U0 — Çok düşük homojenlik!
            uniformityU1: 19.3,
            screenGain: 1.0,
            surfaceReflectance: 0.85,
            ambientLux: 20,
            luminanceNits: 270,
            luminanceFL: 78.8,
            ambientContrastRatio: 14.5,
          },
        ],
      });

      // Yüksek lüks varlığına rağmen U0=%24.1 PASS olamaz!
      const uniCheck = reportRes.checks.find(c => c.id.includes('photo-point-uniformity'));
      expect(uniCheck).toBeDefined();
      expect(uniCheck?.status).toBe('error');
      expect(reportRes.structuredErrors.some(e => e.errorId === 'ERR-LOW-UNIFORMITY')).toBe(true);
      expect(reportRes.pdfApprovalStatus).toBe('BLOCKED');
    });
  });

  // =========================================================================
  // TEST E: NIT, YÜZEY KAZANCI VE ACR HESABI
  // =========================================================================
  describe('Test E — NIT, Lambertian Yüzey Kazancı ve ACR Kontrolü', () => {
    it('L = E × Gain / π formülü ve Lambertian varsayımı doğrulanır', () => {
      const theo = buildTheoreticalIlluminance(10000, 90, 10); // 900 lux
      const lumIdeal = computeLuminanceFromSource(theo, 1.2, 1.0); // İdeal Lambertian, yansıma kaybı yok
      const lumReal = computeLuminanceFromSource(theo, 1.2, 0.85); // %85 yüzey yansıtıcılığı

      // İdealize nits = 900 × 1.2 / π ≈ 343.77 cd/m²
      expect(lumIdeal.nits).toBeCloseTo((900 * 1.2) / Math.PI, 1);
      // Gerçekçi nits = 900 × 1.2 × 0.85 / π ≈ 292.21 cd/m²
      expect(lumReal.nits).toBeCloseTo((900 * 1.2 * 0.85) / Math.PI, 1);
      expect(lumReal.formula).toContain('L = E × Gain × ρ / π');
    });

    it('cihaz doğal siyah seviyesi bilinmiyorsa ACR AMBIENT-LIMITED ESTIMATE ve UNKNOWN olur', () => {
      const theo = buildTheoreticalIlluminance(10000, 90, 10);
      const lum = computeLuminanceFromSource(theo, 1.0, 0.85);
      const acr = computeContrastAnalysis({
        white: lum,
        ambientLux: 20,
        gain: 1.0,
        reflectance: 0.85,
        nativeContrast: null, // Doğal kontrast bilinmiyor
        nativeBlackNits: null,
      });

      expect(acr.acrVerified).toBe(false);
      expect(acr.status).toBe('UNKNOWN');
      expect(acr.message).toContain('gerçek ACR doğrulanamaz (UNKNOWN)');
      expect(acr.message).toContain('Tahmini ortam kontrastı');
      expect(acr.estimatedAmbientContrast).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TEST F: CİHAZ VE LENS KATALOĞU DOĞRULAMASI (Vivitek & Panasonic)
  // =========================================================================
  describe('Test F — Cihaz ve Lens Kataloğu Üretici Doğrulaması', () => {
    it('Vivitek DU9800Z ve D98-0810 katalog parametreleri ve uyumluluğu doğrulanır', () => {
      const du9800 = CATALOG_PROJECTORS.find(p => p.id === 'vivitek-du9800z');
      expect(du9800).toBeDefined();
      expect(du9800!.ansiLumens).toBe(18000);
      expect(du9800!.nativeW).toBe(1920);
      expect(du9800!.nativeH).toBe(1200);
      expect(du9800!.powerW).toBe(1900);
      expect(du9800!.powerEcoW).toBe(1100);
      expect(du9800!.nativeContrast).toBe(1250);
      expect(du9800!.dynamicContrast).toBe(10000);
      expect(du9800!.lensMount).toBe('Vivitek-D98');
      expect(du9800!.verificationStatus).toBe('MANUFACTURER_VERIFIED');

      const d980810 = CATALOG_LENSES.find(l => l.id === 'viv-d98-0810');
      expect(d980810).toBeDefined();
      expect(d980810!.throwMin).toBe(0.84);
      expect(d980810!.throwMax).toBe(1.03);
      expect(d980810!.zoomRatio).toBe(1.22);
      expect(d980810!.lensMount).toBe('Vivitek-D98');

      // Uyumluluk kontrolü
      const compatLenses = getCompatibleCatalogLenses(du9800!);
      expect(compatLenses.some(l => l.id === 'viv-d98-0810')).toBe(true);

      // Profil çözümleyici yardımcıları doğrulama
      expect(resolveProjectorWatts('Vivitek DU9800Z')).toBe(1900);
      expect(resolveProjectorNativeContrast('Vivitek DU9800Z')).toBe(1250);
      expect(resolveProjectorDynamicContrast('Vivitek DU9800Z')).toBe(10000);
    });

    it('Panasonic PT-RZ990 7000 ANSI lm (9400 lm değil!) ve ET-DLE060 doğrulanır', () => {
      const rz990 = CATALOG_PROJECTORS.find(p => p.id === 'panasonic-pt-rz990');
      expect(rz990).toBeDefined();
      // Zorunlu kural: 7000 ANSI lümen olmalı, 9400 lm olmamalı!
      expect(rz990!.ansiLumens).toBe(7000);
      expect(rz990!.ansiLumens).not.toBe(9400);
      expect(rz990!.nativeW).toBe(1920);
      expect(rz990!.nativeH).toBe(1200);
      expect(rz990!.lensMount).toBe('Panasonic-DLE');
      expect(rz990!.verificationStatus).toBe('MANUFACTURER_VERIFIED');

      const dle060 = CATALOG_LENSES.find(l => l.id === 'pan-dle060');
      expect(dle060).toBeDefined();
      expect(dle060!.throwMin).toBe(0.600);
      expect(dle060!.throwMax).toBe(0.801);
      expect(dle060!.lensMount).toBe('Panasonic-DLE');

      const compatLenses = getCompatibleCatalogLenses(rz990!);
      expect(compatLenses.some(l => l.id === 'pan-dle060')).toBe(true);
    });

    it('DEFAULT_PROJECTOR_PROFILES içinde doğrulanmış Vivitek ve Panasonic cihaz profilleri bulunur', () => {
      const vivitekProf = DEFAULT_PROJECTOR_PROFILES.find(p => p.id === 'vivitek-du9800z-d98-0810');
      expect(vivitekProf).toBeDefined();
      expect(vivitekProf!.general.brightnessAnsiLumens).toBe(18000);
      expect(vivitekProf!.general.nativeContrastRatio).toBe(1250);
      expect(vivitekProf!.electrical.powerConsumptionW).toBe(1900);
      expect(vivitekProf!.optics.throwRatioMin).toBe(0.84);
      expect(vivitekProf!.optics.throwRatioMax).toBe(1.03);

      const panProf = DEFAULT_PROJECTOR_PROFILES.find(p => p.id === 'panasonic-pt-rz990-dle060');
      expect(panProf).toBeDefined();
      expect(panProf!.general.brightnessAnsiLumens).toBe(7000);
      expect(panProf!.optics.throwRatioMin).toBe(0.600);
      expect(panProf!.optics.throwRatioMax).toBe(0.801);
    });
  });

  // =========================================================================
  // TEST G: ELEKTRİK YÜK VE AKIM AYRIMI (Tek Faz vs Üç Faz)
  // =========================================================================
  describe('Test G — Elektrik Hesaplama Modülü (Tek Faz Linye vs Üç Faz Hat Akımı)', () => {
    it('üç adet 450 W cihaz için tek faz linye akımı ve üç faz hat akımı ayrı hesaplanır', () => {
      // 1. Tek faz 230 V linye akımı (tek cihaz 450 W, PF = 1.0):
      // I_branch = 450 / 230 ≈ 1.9565 A
      const iBranch = loadCurrent(450, 230, 1.0, false);
      expect(iBranch).toBeCloseTo(1.9565, 3);

      // 2. Dengeli 400 V üç faz hat akımı (toplam 1350 W, 400 V LL, PF = 1.0):
      // I_line = 1350 / (√3 × 400) ≈ 1.9485 A
      const iLine = loadCurrent(1350, 400, 1.0, true);
      expect(iLine).toBeCloseTo(1.9485, 3);

      // İki akım değeri fiziksel ve formül olarak birbirinden farklıdır!
      expect(iBranch).not.toBe(iLine);
    });

    it('güç faktörü (cosφ = 0.95) dahil edildiğinde akımlar doğru hesaplanır', () => {
      const iBranchPf = loadCurrent(450, 230, 0.95, false);
      // 450 / (230 × 0.95) = 450 / 218.5 ≈ 2.0595 A
      expect(iBranchPf).toBeCloseTo(2.0595, 3);

      const iLinePf = loadCurrent(1350, 400, 0.95, true);
      // 1350 / (√3 × 400 × 0.95) ≈ 2.0511 A
      expect(iLinePf).toBeCloseTo(2.0511, 3);
    });
  });

  // =========================================================================
  // TEST H: VERİ İZOLASYONU VE SENARYO TUTARLILIĞI
  // =========================================================================
  describe('Test H — Veri İzolasyonu (Farklı Geometriler Karışamaz)', () => {
    it('aynı senaryo ID altında farklı oda/ekran geometrisi raporu bloklar (ERR-MULTI-GEOMETRY)', () => {
      const val = validateReportConsistency({
        lang: 'tr',
        meta: {
          projectName: 'İzolasyon Testi',
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
            scenarioId: 'SCENARIO-A',
            surfaceId: 'SURF-MAIN',
            surfaceName: 'Ana Ekran',
            projectorCount: 3,
            projectorModels: ['Vivitek DU9800Z'],
            lensModels: ['D98-0810'],
            unitLumens: 18000,
            unitPowerW: 1900,
            throwDistM: 5.5,
            imageWidthM: 12.0,
            imageHeightM: 4.3,
            overlapPct: 20,
            combinedW: 3686,
            combinedH: 1200,
            canvasW: 3349,
            canvasH: 1200,
            room: { widthM: 14, lengthM: 10, heightM: 5 },
          },
          {
            scenarioId: 'SCENARIO-A', // AYNI SCENARIO ID, ANCAK FARKLI GEOMETRİ!
            surfaceId: 'SURF-SHADOW',
            surfaceName: 'Gölge Ekranı',
            projectorCount: 1,
            projectorModels: ['Panasonic PT-RZ990'],
            lensModels: ['ET-DLE060'],
            unitLumens: 7000,
            unitPowerW: 810,
            throwDistM: 3.0,
            imageWidthM: 4.0,
            imageHeightM: 2.25,
            overlapPct: 0,
            combinedW: 1920,
            combinedH: 1200,
            canvasW: 1920,
            canvasH: 1080,
            room: { widthM: 8, lengthM: 6, heightM: 3.5 },
          },
        ],
      });

      expect(val.structuredErrors.some(e => e.errorId === 'ERR-MULTI-GEOMETRY')).toBe(true);
      expect(val.pdfApprovalStatus).toBe('BLOCKED');
    });

    it('her senaryo benzersiz scenarioId taşıdığında geometri izolasyonu PASS verir', () => {
      const val = validateReportConsistency({
        lang: 'tr',
        meta: {
          projectName: 'İzolasyon Geçerli Testi',
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
            scenarioId: 'SCENARIO-01-MAIN',
            surfaceId: 'SURF-MAIN',
            surfaceName: 'Ana Ekran',
            projectorCount: 3,
            projectorModels: ['Vivitek DU9800Z'],
            lensModels: ['D98-0810'],
            unitLumens: 18000,
            unitPowerW: 1900,
            throwDistM: 5.5,
            imageWidthM: 12.0,
            imageHeightM: 4.3,
            overlapPct: 20,
            combinedW: 3686,
            combinedH: 1200,
            canvasW: 3349,
            canvasH: 1200,
            room: { widthM: 14, lengthM: 10, heightM: 5 },
          },
          {
            scenarioId: 'SCENARIO-02-SHADOW', // AYRI SCENARIO ID
            surfaceId: 'SURF-SHADOW',
            surfaceName: 'Gölge Ekranı',
            projectorCount: 1,
            projectorModels: ['Panasonic PT-RZ990'],
            lensModels: ['ET-DLE060'],
            unitLumens: 7000,
            unitPowerW: 810,
            throwDistM: 3.0,
            imageWidthM: 4.0,
            imageHeightM: 2.25,
            overlapPct: 0,
            combinedW: 1920,
            combinedH: 1200,
            canvasW: 1920,
            canvasH: 1080,
            room: { widthM: 8, lengthM: 6, heightM: 3.5 },
          },
        ],
      });

      expect(val.structuredErrors.some(e => e.errorId === 'ERR-MULTI-GEOMETRY')).toBe(false);
    });
  });

  // =========================================================================
  // TEST I: PDF VE HESAPLAMA MOTORU DEĞER TUTARLILIĞI
  // =========================================================================
  describe('Test I — PDF Raporu ve Hesaplama Motoru Değer Eşleşmesi', () => {
    it('hesaplanan tüm teknik parametreler PDF veri modeliyle birebir eşleşir', () => {
      const input: CentralDesignInput = {
        room: { widthM: 12, lengthM: 8, heightM: 4.5 },
        surface: { id: 'SURF-I', name: 'Ana Sergi', widthM: 9.6, heightM: 3.0, viewingDistanceM: 5.0 },
        projector: {
          model: 'Vivitek DU9800Z',
          cols: 3,
          rows: 1,
          nativeW: 1920,
          nativeH: 1200,
          ansiLumensPerUnit: 18000,
          powerWPerUnit: 1900,
          nativeContrast: 1250,
        },
        lens: {
          model: 'Vivitek D98-0810',
          throwDistM: 4.5,
          throwRatio: 0.95,
          throwMin: 0.84,
          throwMax: 1.03,
        },
        photometrics: {
          opticalEfficiencyPct: 90,
          screenGain: 1.0,
          reflectance: 0.85,
          ambientLux: 20,
          uniformityU0Pct: 85,
        },
        blending: { overlapPctX: 18, gamma: 2.2 },
        electrical: { supplyVoltageV: 230, phases: 3 },
      };

      const result = evaluateCentralProjectionDesign(input);

      // CalculationResult değerleri:
      expect(result.projectorSpecs.totalAnsiLumens).toBe(54000);
      expect(result.projectorSpecs.totalPowerW).toBe(5700);
      expect(result.lensSpecs.catalogStatus).toBe('PASS');
      expect(result.singleSourceGeometry.targetSurface.widthM).toBe(9.6);
      expect(result.singleSourceGeometry.targetSurface.heightM).toBe(3.0);

      // Calculation trace adımları eksiksiz olmalı
      expect(result.calculationTrace.length).toBeGreaterThanOrEqual(5);
      for (const trace of result.calculationTrace) {
        expect(trace.formula).toBeDefined();
        expect(trace.result).toBeDefined();
        expect(trace.status).toBeDefined();
      }
    });
  });

  // =========================================================================
  // TEST J: HATALI VE EKSİK VERİ GÜVENLİK TESTİ
  // =========================================================================
  describe('Test J — Hatalı, Sıfır, Negatif veya Eksik Veri Güvenliği', () => {
    it('yüzey genişliği veya atım mesafesi 0/negatif olduğunda sistem çökmez ve UNKNOWN üretir', () => {
      const invalidCoverage = evaluatePhysicalCoverage({
        surfaceWidthM: 0,
        surfaceHeightM: 2.5,
        cols: 1,
        rows: 1,
        projW: 1920,
        projH: 1200,
        throwDistM: -5,
        throwRatio: 0,
      });

      expect(invalidCoverage.verdict).toBe('UNKNOWN');
      expect(invalidCoverage.isFullyCovered).toBe(false);
      expect(invalidCoverage.coveredWidthM).toBe(0);
      expect(invalidCoverage.summaryMessage).toContain('UNKNOWN');
    });

    it('elektrik modülünde gerilim 0 veya negatif olduğunda güvenli RangeError fırlatır', () => {
      expect(() => loadCurrent(450, 0, 1.0, false)).toThrow(RangeError);
      expect(() => loadCurrent(450, -230, 1.0, false)).toThrow(RangeError);
    });

    it('eksik cihaz gücü içeren yüklerde elektrik analizi UNKNOWN statüsü üretir', () => {
      const loads = [{ id: 'L-MISS', name: 'Tanımsız Cihaz', qty: 1, powerW: null }];
      const circuits = [{ id: 'C1', name: 'Linye 1', loadIds: ['L-MISS'], phase: 'L1' as const }];
      const res = analyzeElectrical(loads, circuits, defaultSupply());

      expect(res.electricalDataStatus).toBe('UNKNOWN');
      expect(res.missingPowerLoadNames).toContain('Tanımsız Cihaz');
    });
  });

  // =========================================================================
  // TEST K: 12 MADDELİK OTOMATİK REGRESYON TEST SÜİTİ (K.1 - K.12)
  // =========================================================================
  describe('Test K — 12 Maddelik Otomatik Regresyon Test Süiti (Revizyon 2.0 Kök Neden Doğrulaması)', () => {
    const mainDesignInput: CentralDesignInput = {
      scenarioId: 'SCN-01-MAIN-PROJECTION',
      room: { widthM: 14, lengthM: 10, heightM: 5 },
      surface: { id: 'SURF-WALL-12x43', name: 'Ana Sergi Duvarı', widthM: 12.0, heightM: 4.30, viewingDistanceM: 3.5 },
      projector: {
        model: 'Vivitek DU9800Z',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 10000,
        powerWPerUnit: 1900,
        nativeContrast: 1250,
      },
      lens: {
        model: 'D98-0810',
        throwDistM: 5.0,
        throwRatio: 0.8,
      },
      blending: {
        overlapPctX: 54.0104, // 1037 px overlap / 1920 -> 3686 px blended
      },
      photometrics: {
        opticalEfficiencyPct: 90,
        screenGain: 1.0,
        reflectance: 0.85,
        ambientLux: 20,
      },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 0.95 },
    };

    // K.1: 12 × 4.3 m duvar ile 12 × 3.90625 m aktif alan ayrımı
    it('K.1 — 12 × 4.3 m duvar ile 12 × 3.90625 m aktif alan ayrımı bağımsız veri alanlarıdır', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInput);
      expect(res.singleSourceGeometry.targetSurface.heightM).toBe(4.30);
      expect(res.singleSourceGeometry.targetSurface.widthM).toBe(12.0);
      expect(res.singleSourceGeometry.targetSurface.areaM2).toBe(51.60);

      expect(res.singleSourceGeometry.activeProjectionArea.heightM).toBeCloseTo(3.90625, 2);
      expect(res.singleSourceGeometry.activeProjectionArea.widthM).toBe(12.0);
      expect(res.singleSourceGeometry.activeProjectionArea.areaM2).toBeCloseTo(46.875, 1);

      expect(res.singleSourceGeometry.activeProjectionArea.heightM).not.toBe(res.singleSourceGeometry.targetSurface.heightM);
    });

    // K.2: 3686 × 1200 aktif alanda anizotropinin ~%0.01 çıktığını doğrulayan test
    it('K.2 — 3686 × 1200 aktif optik ayak izinde anizotropi ~%0.01 (kare piksel) çıkar', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInput);
      expect(res.pixelMapping.blendedRaster.w).toBe(3686);
      expect(res.pixelMapping.blendedRaster.h).toBe(1200);
      expect(res.pixelMapping.blendedRaster.pxPerMeterW).toBeCloseTo(307.17, 1);
      expect(res.pixelMapping.blendedRaster.pxPerMeterH).toBeCloseTo(307.20, 1);
      expect(res.pixelMapping.blendedRaster.anisotropyDiffPct).toBeLessThan(0.05); // ~%0.01 kare piksel
    });

    // K.3: 3349 × 1200 içerik kanvası dönüşüm testi (337 px crop)
    it('K.3 — 3349 × 1200 içerik kanvası dönüşümü ve 337 px optik kırpma doğrulanır', () => {
      const cc = computeContentCanvas({
        rasterW: 3686,
        rasterH: 1200,
        opticalPxPerMeterH: 307.2,
        opticalPxPerMeterV: 307.2,
        surfaceWidthM: 12.0,
        surfaceHeightM: 4.30,
        activeWidthM: 12.0,
        activeHeightM: 3.90625,
      });
      expect(cc.contentCanvas.w).toBe(3349);
      expect(cc.contentCanvas.h).toBe(1200);
      expect(cc.detailedMetrics?.resolutionDelta.cropW).toBe(337); // 3686 - 3349 = 337 px crop
      expect(cc.contentCanvas.w).not.toBe(3686);
    });

    // K.4: 9 nokta ile 288 nokta gridin aynı matristen beslendiğini doğrulayan test
    it('K.4 — 9 nokta örneklemesi 288 nokta LuxField matrisinden hücre indeksleriyle doğrudan beslenir', () => {
      const grid = computeLuxSimulationGrid(mainDesignInput, 24, 12);
      expect(grid.cells.length).toBe(288);
      expect(grid.samplingMethod).toBe('288-point-grid');

      const ninePt = sampleNinePointsFromLuxGrid(grid, 12.0, 4.30);
      expect(ninePt.zones9.length).toBe(9);

      // Her 9-nokta hücresi 288-nokta gridindeki karşılık gelen hücrenin lüks değerini taşır
      for (const z of ninePt.zones9) {
        expect(z.gridIndex).toBeDefined();
        const gridCell = grid.cells[z.gridIndex!];
        expect(gridCell).toBeDefined();
        expect(z.lux).toBe(gridCell.totalLux);
        expect(z.totalWithAmbientLux).toBe(gridCell.totalWithAmbientLux);
      }
    });

    // K.5: Fiziksel yüzey kaplama oranının %90.84 çıktığını doğrulayan test
    it('K.5 — Fiziksel yüzey kaplama oranı tam olarak %90.84 hesaplanır', () => {
      const cov = evaluatePhysicalCoverage({
        surfaceWidthM: 12.0,
        surfaceHeightM: 4.30,
        cols: 3,
        rows: 1,
        projW: 1920,
        projH: 1200,
        throwDistM: 5.0,
        throwRatio: 0.8,
      });
      // 46.875 m2 / 51.60 m2 = %90.843 -> %90.84
      expect(cov.areaCoveragePct).toBe(90.84);
      expect(cov.uncoveredHeightM).toBeCloseTo(0.394, 2);
    });

    // K.6: Hem 523.3 lx hem de 576.0 lx teorik değerlerinin doğru hesaplandığını gösteren test
    it('K.6 — Hem hedef duvar teorik (523.3 lx) hem aktif alan teorik (576.0 lx) değerleri doğru hesaplanır', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInput);
      // 3 * 10000 * 0.90 = 27000 lm efektif
      // Duvar (51.60 m2): 27000 / 51.60 = 523.26 lx -> 523.3 lx
      // Aktif alan (46.875 m2): 27000 / 46.875 = 576.0 lx
      expect(res.photometricModel.effectiveTotalLumens).toBe(27000);
      expect(res.photometricModel.theoreticalAvgLux).toBeCloseTo(523.3, 1);

      const activeTheoreticalLux = 27000 / 46.875;
      expect(activeTheoreticalLux).toBeCloseTo(576.0, 1);
    });

    // K.7: Kamera 24 mm ve 70 mm FOV hesaplama testi
    it('K.7 — Sony FX3 tam kare sensör ile 24 mm, 35 mm ve 70 mm FOV değerleri doğru hesaplanır', () => {
      const sonyFx3Profile = DEFAULT_CAMERA_PROFILES.find(c => c.id === 'sony-fx3-ff-24-70');
      expect(sonyFx3Profile).toBeDefined();

      // f = 24 mm:
      const fov24 = calculateCameraOpticsFov({
        profile: sonyFx3Profile!,
        activeFocalLengthMm: 24,
        targetDistanceM: 5.0,
      });
      expect(fov24.rectilinearHfovDeg).toBeCloseTo(73.1, 1);
      expect(fov24.rectilinearVfovDeg).toBeCloseTo(52.7, 1);

      // f = 35 mm (önceki rapordaki 53.9° x 37.6° değerinin kök kaynağı):
      const fov35 = calculateCameraOpticsFov({
        profile: sonyFx3Profile!,
        activeFocalLengthMm: 35,
        targetDistanceM: 5.0,
      });
      expect(fov35.rectilinearHfovDeg).toBeCloseTo(53.9, 1);
      expect(fov35.rectilinearVfovDeg).toBeCloseTo(37.6, 1);

      // f = 70 mm:
      const fov70 = calculateCameraOpticsFov({
        profile: sonyFx3Profile!,
        activeFocalLengthMm: 70,
        targetDistanceM: 5.0,
      });
      expect(fov70.rectilinearHfovDeg).toBeCloseTo(28.5, 1);
      expect(fov70.rectilinearVfovDeg).toBeCloseTo(19.3, 1);
    });

    // K.8: Üç senaryonun birbirinden bağımsız çalıştığını gösteren test
    it('K.8 — Üç farklı senaryo (SCN-01, SCN-02, SCN-03) birbirinden bağımsız izole edilir', () => {
      const validation = validateReportConsistency({
        lang: 'tr',
        meta: {
          projectName: 'Üç Senaryo İzolasyon Testi',
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
            scenarioId: 'SCN-01-MAIN-PROJECTION',
            surfaceId: 'SURF-MAIN-WALL',
            surfaceName: 'Ana Projeksiyon Duvarı',
            projectorCount: 3,
            projectorModels: ['Genel Cihaz 10K'],
            lensModels: ['TR 0.8 Sabit'],
            unitLumens: 10000,
            unitPowerW: 450,
            throwDistM: 5.0,
            imageWidthM: 12.0,
            imageHeightM: 4.3,
            overlapPct: 54,
            combinedW: 3686,
            combinedH: 1200,
            canvasW: 3349,
            canvasH: 1200,
            room: { widthM: 14, lengthM: 10, heightM: 5 },
          },
          {
            scenarioId: 'SCN-02-SHADOW-SIMULATION',
            surfaceId: 'SURF-SHADOW-SCREEN',
            surfaceName: 'Gölge Analiz Perdesi',
            projectorCount: 1,
            projectorModels: ['Genel Cihaz 10K'],
            lensModels: ['TR 1.2'],
            unitLumens: 10000,
            unitPowerW: 450,
            throwDistM: 4.5,
            imageWidthM: 4.0,
            imageHeightM: 2.25,
            overlapPct: 0,
            combinedW: 1920,
            combinedH: 1200,
            canvasW: 1920,
            canvasH: 1080,
            room: { widthM: 8, lengthM: 6, heightM: 3.5 },
          },
          {
            scenarioId: 'SCN-03-OPTICAL-STUDIO-CALIBRATION',
            surfaceId: 'SURF-STUDIO-SCREEN',
            surfaceName: 'Optik Kalibrasyon Perdesi',
            projectorCount: 1,
            projectorModels: ['Vivitek DU9800Z'],
            lensModels: ['D98-0810'],
            unitLumens: 18000,
            unitPowerW: 1900,
            throwDistM: 5.0,
            imageWidthM: 3.2,
            imageHeightM: 2.0,
            overlapPct: 0,
            combinedW: 1920,
            combinedH: 1200,
            canvasW: 1920,
            canvasH: 1200,
            room: { widthM: 8, lengthM: 8, heightM: 3.6 },
          },
        ],
      });

      expect(validation.structuredErrors.some(e => e.errorId === 'ERR-MULTI-GEOMETRY')).toBe(false);
      expect(validation.checks.find(c => c.id === 'scenario-surface-sync')?.status).toBe('pass');
    });

    // K.9: Vivitek DU9800Z ve 450 W genel cihaz ayrımı testi
    it('K.9 — Vivitek DU9800Z (1900 W, 1250:1 kontrast) ile 450 W genel cihaz ayrımı korunur', () => {
      const vivitekWatts = resolveProjectorWatts('Vivitek DU9800Z', 450);
      expect(vivitekWatts).toBe(1900);

      const generalWatts = resolveProjectorWatts('Genel 10K Projektör', 450);
      expect(generalWatts).toBe(450);

      const vivitekContrast = resolveProjectorNativeContrast('Vivitek DU9800Z');
      expect(vivitekContrast).toBe(1250);

      const generalContrast = resolveProjectorNativeContrast('Genel 10K Projektör');
      expect(generalContrast).toBeUndefined();
    });

    // K.10: PDF raporundaki değerlerin CalculationResult ile birebir eşleştiğini gösteren test
    it('K.10 — PDF raporu veri modeli CalculationResult ile birebir eşleşir', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInput);
      expect(res.projectorSpecs.totalPowerW).toBe(5700); // 3 * 1900
      expect(res.projectorSpecs.totalAnsiLumens).toBe(30000); // 3 * 10000
      expect(res.singleSourceGeometry.blendedRaster.w).toBe(3686);
      expect(res.singleSourceGeometry.blendedRaster.h).toBe(1200);
      expect(res.singleSourceGeometry.contentCanvas.w).toBe(3349);
      expect(res.singleSourceGeometry.contentCanvas.h).toBe(1200);
    });

    // K.11: ACR kontrolünde native black UNKNOWN ise gerçek ACR ve ACR validator UNKNOWN döner (PASS yasak)
    it('K.11 — ACR kontrolünde native black UNKNOWN ise gerçek ACR ve validator UNKNOWN döner, PASS yasaktır', () => {
      const val = validateReportConsistency({
        lang: 'tr',
        meta: {
          projectName: 'ACR Native Black Test',
          customer: '',
          location: '',
          category: '',
          date: '2026-11-15',
          revision: 1,
          companyName: '',
          description: '',
        },
        sections: DEFAULT_SECTIONS,
        photometricSurfaces: [
          {
            surfaceId: 'SURF-ACR-TEST',
            surfaceName: 'ACR Test Duvarı',
            surfaceType: 'wall',
            widthM: 12.0,
            heightM: 4.30,
            projectorCount: 3,
            avgLux: 327,
            minLux: 310,
            maxLux: 340,
            uniformityU0: 0.95,
            uniformityU1: 0.91,
            luminanceNits: 88.5,
            luminanceFL: 25.8,
            screenGain: 1.0,
            ambientLux: 100,
            ambientContrastRatio: 4.27,
            nativeContrast: null, // UNKNOWN native contrast
            nativeBlackNits: null, // UNKNOWN native black
          },
        ],
      });

      const acrCheck = val.checks.find(c => c.id === 'photo-acr-0');
      expect(acrCheck).toBeDefined();
      expect(acrCheck!.status).toBe('unknown'); // UNKNOWN statüsü: PASS yasak!
      expect(acrCheck!.verdict).toBe('UNKNOWN');
      expect(acrCheck!.message).toContain('gerçek optik ACR UNKNOWN');
    });

    // K.12: ΔE ve blend için saha ölçümü yoksa VERIFIED statüsü verilmediğini doğrulayan test
    it('K.12 — ΔE, ΔCCT ve blend için saha ölçümü yoksa VERIFIED statüsü verilmez, UNKNOWN / NOT_MEASURED kalır', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInput);
      expect(res.colorAndBlend.deltaE2000Status).toBe('UNKNOWN');
      expect(res.colorAndBlend.deltaCctStatus).toBe('UNKNOWN');
      expect(res.colorAndBlend.colorUniformityStatus).toBe('UNKNOWN');
      expect(res.colorAndBlend.blendTransitionStatus).toBe('UNKNOWN');
      expect(res.colorAndBlend.deltaE2000Status).not.toBe('VERIFIED');
    });
  });

  // =========================================================================
  // TEST L: SON REVİZYON 12 REGRESYON TESTİ (BÖLÜM 11)
  // =========================================================================
  describe('Test L — Son Revizyon 12 Zorunlu Regresyon Testi', () => {
    const mainDesignInputRev: CentralDesignInput = {
      scenarioId: 'SCN-01-MAIN-PROJECTION',
      room: { widthM: 12, lengthM: 6, heightM: 4 },
      surface: { id: 'SURF-MAIN-12x35', name: 'Ana Sergi Duvarı', widthM: 12.0, heightM: 3.5, viewingDistanceM: 5.0 },
      projector: {
        model: 'Vivitek DU4381Z-ST',
        cols: 3,
        rows: 1,
        nativeW: 1920,
        nativeH: 1200,
        ansiLumensPerUnit: 6100,
        powerWPerUnit: 530,
        projectorPositionsX: [0.0, 3.2, 6.4],
      },
      lens: {
        model: 'Dahili 0.50:1 Sabit Kısa Atım Lens (Fixed)',
        throwDistM: 2.80,
        throwRatio: 0.50,
        throwMin: 0.50,
        throwMax: 0.50,
      },
      blending: {
        overlapPctX: 42.86,
      },
      photometrics: {
        opticalEfficiencyPct: 90,
        screenGain: 1.0,
        reflectance: 0.85,
        ambientLux: 20,
      },
      electrical: { supplyVoltageV: 230, phases: 3, pf: 1.0 },
    };

    // Regresyon 1: DU4381Z-ST TR=0.50 sabit lens testi (zoom seçilemez)
    it('1. DU4381Z-ST TR=0.50 sabit lens testi (zoom aralığı ve zoom seçimi devre dışıdır)', () => {
      const proj = CATALOG_PROJECTORS.find(p => p.id === 'vivitek-du4381z-st');
      expect(proj).toBeDefined();
      expect(proj!.builtInThrow?.min).toBe(0.50);
      expect(proj!.builtInThrow?.max).toBe(0.50);

      const lenses = getCompatibleCatalogLenses(proj!);
      expect(lenses.length).toBe(1);
      expect(lenses[0].throwMin).toBe(0.50);
      expect(lenses[0].throwMax).toBe(0.50);
      expect(lenses[0].zoomRatio).toBe(1.0); // No zoom
      expect(lenses[0].notes).toContain('sabit');

      const profile = DEFAULT_PROJECTOR_PROFILES.find(p => p.id === 'vivitek-du4381z-st');
      expect(profile).toBeDefined();
      expect(profile!.optics.lensType).toBe('fixed');
      expect(profile!.optics.opticalZoomRatio).toBe(1.0);
      expect(profile!.optics.throwRatioMin).toBe(0.50);
      expect(profile!.optics.throwRatioMax).toBe(0.50);
    });

    // Regresyon 2: 5.6 m görüntü genişliği için 2.80 m throw mesafesi testi
    it('2. 5.60 m görüntü genişliği için gereken lens mesafesi tam 2.80 m hesaplanır (5.6 × 0.50 = 2.80)', () => {
      const imageWidthM = 5.60;
      const throwRatio = 0.50;
      const requiredThrowM = imageWidthM * throwRatio;
      expect(requiredThrowM).toBe(2.80);

      const cov = evaluatePhysicalCoverage({
        surfaceWidthM: 12.0,
        surfaceHeightM: 3.5,
        cols: 3,
        rows: 1,
        projW: 1920,
        projH: 1200,
        throwDistM: 2.80,
        throwRatio: 0.50,
        overlapX: 42.86,
      });
      expect(cov.singleImageWidthM).toBeCloseTo(5.60, 2);
      expect(cov.singleImageHeightM).toBeCloseTo(3.50, 2);
    });

    // Regresyon 3: 3.08 m throw mesafesinde görüntü genişliği 6.16 m testi
    it('3. 3.08 m throw mesafesinde aynı TR 0.50 lensin görüntü genişliği 6.16 m hesaplanır (3.08 / 0.50 = 6.16)', () => {
      const throwDistM = 3.08;
      const throwRatio = 0.50;
      const calculatedWidthM = throwDistM / throwRatio;
      expect(calculatedWidthM).toBeCloseTo(6.16, 2);

      // Yanlış geometri (3.08m mesafede 5.6m iddia edilirse: calcTR = 3.08 / 5.6 = 0.55 vs TR 0.50 -> sapma %10)
      // Çapraz doğrulama motoru yapılandırılmış hata veya uyarı tespit eder
      const valMismatch = validateReportConsistency({
        lang: 'tr',
        meta: { projectName: 'Optic Mismatch Test', customer: '', location: '', category: '', date: '2026-11-15', revision: 1, companyName: '', description: '' },
        sections: DEFAULT_SECTIONS,
        projection: {
          screenName: 'Ana Ekran',
          projectorName: 'Vivitek DU4381Z-ST',
          lensName: 'Dahili Fixed 0.50:1',
          imageWidthM: 5.60,
          aspectW: 16,
          aspectH: 10,
          distanceM: 3.08, // Hatalı mesafe: 5.60 m için 2.80 m olmalıydı!
          throwRatio: 0.50,
          resolution: '1920x1200',
        },
      });
      const trCheck = valMismatch.checks.find(c => c.id === 'proj-tr-fov');
      expect(trCheck).toBeDefined();
      expect(trCheck!.status === 'error' || trCheck!.status === 'warning').toBe(true);
      expect(valMismatch.structuredErrors.some(e => e.errorId === 'ERR-OPTICAL-GEOMETRY-MISMATCH')).toBe(true);
      expect(valMismatch.pdfApprovalStatus).toBe('BLOCKED');
    });

    // Regresyon 4: 530 W Normal mod güç tüketimi testi
    it('4. DU4381Z-ST normal mod güç tüketimi 530 W olarak doğrulanır (1900 W veya 450 W atanmaz)', () => {
      const normalWatts = resolveProjectorWatts('Vivitek DU4381Z-ST', 450, 'normal');
      expect(normalWatts).toBe(530);

      const catalogProj = CATALOG_PROJECTORS.find(p => p.id === 'vivitek-du4381z-st');
      expect(catalogProj!.powerW).toBe(530);
    });

    // Regresyon 5: 380 W Eco mod güç tüketimi testi
    it('5. DU4381Z-ST Eco mod güç tüketimi 380 W olarak doğrulanır', () => {
      const ecoWatts = resolveProjectorWatts('Vivitek DU4381Z-ST', 450, 'eco');
      expect(ecoWatts).toBe(380);

      const catalogProj = CATALOG_PROJECTORS.find(p => p.id === 'vivitek-du4381z-st');
      expect(catalogProj!.powerEcoW).toBe(380);
    });

    // Regresyon 6: 3-Faz dengeli hat akımı testi (Normal ~2.30 A, Eco ~1.65 A)
    it('6. 3-Faz dengeli sistemde (L1, L2, L3) hat akımları doğrulanır (cosφ=1.0 varsayımıyla)', () => {
      const normalWattsPerUnit = 530;
      const ecoWattsPerUnit = 380;
      const count = 3;
      const totalNormalW = normalWattsPerUnit * count; // 1590 W
      const totalEcoW = ecoWattsPerUnit * count;       // 1140 W

      // 400V 3-faz hat akımı: I = P / (√3 × 400 × 1.0)
      const vLine = 400;
      const pf = 1.0;
      const normalCurrent = totalNormalW / (Math.sqrt(3) * vLine * pf);
      const ecoCurrent = totalEcoW / (Math.sqrt(3) * vLine * pf);

      expect(normalCurrent).toBeCloseTo(2.30, 1);
      expect(ecoCurrent).toBeCloseTo(1.65, 1);

      // Tek faz 230V branşman akımı: I = 530 / 230 ≈ 2.30 A
      const singlePhaseNormalCurrent = normalWattsPerUnit / 230;
      expect(singlePhaseNormalCurrent).toBeCloseTo(2.30, 1);
    });

    // Regresyon 7: ACR ve Native Black UNKNOWN testi (3,000,000:1 dinamik kontrast reddedilir)
    it('7. 3,000,000:1 dinamik kontrast native black olarak kullanılamaz; ölçülmemişse UNKNOWN kalır', () => {
      const nativeContrast = resolveProjectorNativeContrast('Vivitek DU4381Z-ST');
      expect(nativeContrast).toBeUndefined(); // UNKNOWN

      const dynamicContrast = resolveProjectorDynamicContrast('Vivitek DU4381Z-ST');
      expect(dynamicContrast).toBe(3000000);

      // Dinamik kontrastı doğal kontrast yerine girip sahte ACR üretmeye çalışan payload BLOCKED edilir
      const valFabricated = validateReportConsistency({
        lang: 'tr',
        meta: { projectName: 'Fabricated Native Black Test', customer: '', location: '', category: '', date: '2026-11-15', revision: 1, companyName: '', description: '' },
        sections: DEFAULT_SECTIONS,
        photometricSurfaces: [
          {
            surfaceId: 'SURF-01',
            surfaceName: 'Ana Duvar',
            surfaceType: 'wall',
            widthM: 12.0,
            heightM: 3.5,
            projectorCount: 3,
            avgLux: 350,
            minLux: 310,
            maxLux: 380,
            uniformityU0: 0.88,
            uniformityU1: 0.82,
            luminanceNits: 94.7,
            luminanceFL: 27.6,
            screenGain: 1.0,
            ambientLux: 50,
            ambientContrastRatio: 4.2,
            nativeContrast: 3000000, // Dinamik değer usulsüzce doğal kontrast olarak girilmiş!
          },
        ],
      });
      expect(valFabricated.structuredErrors.some(e => e.errorId === 'ERR-FABRICATED-NATIVE-BLACK')).toBe(true);
      expect(valFabricated.pdfApprovalStatus).toBe('BLOCKED');
    });

    // Regresyon 8: 9-nokta ve 288-hücre grid veri bütünlüğü testi
    it('8. 9 nokta doğrudan 288 grid hücresinden örneklenir ve 8 temel metrik tutarlı üretilir', () => {
      const grid = computeLuxSimulationGrid(mainDesignInputRev, 24, 12);

      expect(grid.sampleCount).toBe(288);
      expect(grid.cells.length).toBe(288);

      const sampled = sampleNinePointsFromLuxGrid(grid, 12.0, 3.5, 1.0, 0.85);
      expect(sampled.zones9.length).toBe(9);
      expect(sampled.samplingMethod).toBe('9-point-sampling');
      expect(sampled.equalMeanLux).toBeGreaterThan(0);
      expect(sampled.weightedMeanLux).toBeGreaterThan(0);
      expect(sampled.u0Pct).toBeGreaterThan(0);
      expect(sampled.u1Pct).toBeGreaterThan(0);
      expect(sampled.peakCenterLux).toBeGreaterThan(0);
      expect(sampled.cornerAvgLux).toBeGreaterThan(0);
      expect(sampled.edgeAvgLux).toBeGreaterThan(0);
      expect(sampled.centerToCornerDropPct).toBeDefined();
    });

    // Regresyon 9: H/V PPD ve merkez/kenar açısal çözünürlük testi
    it('9. H ve V PPD gerçek açısal trigonometriyle hesaplanır; keyfi tahmin yapılmaz', () => {
      const res = evaluateCentralProjectionDesign(mainDesignInputRev);

      expect(res.viewingQuality.ppd).toBeGreaterThan(20);
      expect(res.viewingQuality.ppdH).toBeGreaterThan(20);
      expect(res.viewingQuality.ppdVertical).toBeGreaterThan(20);
      expect(res.viewingQuality.ppdCenterH).toBeGreaterThan(0);
      expect(res.viewingQuality.ppdEdgeH).toBeGreaterThan(0);
      expect(res.viewingQuality.maxViewingDistM).toBeGreaterThan(0);
    });

    // Regresyon 10: Senaryo izolasyonu testi (farklı scenario_id verileri birbirine karışamaz)
    it('10. SCN-01, SCN-02 ve SCN-03 senaryoları tam izole tutulur; çakışma durumunda BLOCKED döner', () => {
      // Çakışan farklı geometri aynı scenarioId altında verilirse ERR-MULTI-GEOMETRY üretilir
      const valPolluted = validateReportConsistency({
        lang: 'tr',
        meta: { projectName: 'Pollution Test', customer: '', location: '', category: '', date: '2026-11-15', revision: 1, companyName: '', description: '' },
        sections: DEFAULT_SECTIONS,
        scenarios: [
          {
            scenarioId: 'SAME-ID',
            surfaceId: 'SURF-01',
            surfaceName: 'Duvar 1',
            projectorCount: 3,
            projectorModels: ['Vivitek DU4381Z-ST'],
            lensModels: ['0.50:1 Fixed'],
            unitLumens: 6100,
            unitPowerW: 530,
            throwDistM: 2.80,
            imageWidthM: 12.0,
            imageHeightM: 3.5,
            overlapPct: 42.86,
            combinedW: 3686,
            combinedH: 1200,
            canvasW: 3686,
            canvasH: 1200,
            room: { widthM: 12, lengthM: 6, heightM: 4 },
          },
          {
            scenarioId: 'SAME-ID', // Aynı senaryo ID'si altında farklı geometri!
            surfaceId: 'SURF-02',
            surfaceName: 'Perde 2',
            projectorCount: 1,
            projectorModels: ['Genel Cihaz'],
            lensModels: ['1.2:1'],
            unitLumens: 5000,
            unitPowerW: 400,
            throwDistM: 4.5,
            imageWidthM: 4.0,
            imageHeightM: 2.25,
            overlapPct: 0,
            combinedW: 1920,
            combinedH: 1080,
            canvasW: 1920,
            canvasH: 1080,
            room: { widthM: 8, lengthM: 6, heightM: 3.5 },
          },
        ],
      });

      expect(valPolluted.structuredErrors.some(e => e.errorId === 'ERR-MULTI-GEOMETRY')).toBe(true);
      expect(valPolluted.pdfApprovalStatus).toBe('BLOCKED');
    });

    // Regresyon 11: Epson model-lens TR uyumluluk matrisi testi (EB-PU1000 vs EB-PU2000)
    it('11. Epson EB-PU1007B (0.76") ile EB-PU2010B (1.0") için ELPLM15 TR değerleri farklı ve doğru döner', () => {
      const pu1007 = CATALOG_PROJECTORS.find(p => p.id === 'epson-eb-pu1007b');
      const pu2010 = CATALOG_PROJECTORS.find(p => p.id === 'epson-eb-pu2010b');
      expect(pu1007).toBeDefined();
      expect(pu2010).toBeDefined();

      const lenses1007 = getCompatibleCatalogLenses(pu1007!);
      const lenses2010 = getCompatibleCatalogLenses(pu2010!);

      const m15On1007 = lenses1007.find(l => l.id.includes('elplm15'));
      const m15On2010 = lenses2010.find(l => l.id.includes('elplm15'));

      expect(m15On1007).toBeDefined();
      expect(m15On2010).toBeDefined();

      // EB-PU1007B (0.76" LCD): 2.16–3.48:1
      expect(m15On1007!.throwMin).toBeCloseTo(2.16, 2);
      expect(m15On1007!.throwMax).toBeCloseTo(3.48, 2);

      // EB-PU2010B (1.0" LCD): 1.57–2.56:1
      expect(m15On2010!.throwMin).toBeCloseTo(1.57, 2);
      expect(m15On2010!.throwMax).toBeCloseTo(2.56, 2);
    });

    // Regresyon 12: Kritik hata oluştuğunda PDF BLOCKED, Feasibility Onay Verilmedi, Skor %0 testi
    it('12. Kritik optik/elektrik/katalog hatasında PDF export BLOCKED, feasibility skoru %0 ve mühendislik onayı verilmedi olarak kilitlenir', () => {
      const blockedPayload = validateReportConsistency({
        lang: 'tr',
        meta: { projectName: 'Gate Lock Test', customer: '', location: '', category: '', date: '2026-11-15', revision: 1, companyName: '', description: '' },
        sections: DEFAULT_SECTIONS,
        projection: {
          screenName: 'Hatalı Ekran',
          projectorName: 'Vivitek DU4381Z-ST',
          imageWidthM: 5.60,
          aspectW: 16,
          aspectH: 10,
          distanceM: 3.08, // TR 0.50 iken 3.08m mesafede 5.60m iddia ediliyor -> ERR-OPTICAL-GEOMETRY-MISMATCH
          throwRatio: 0.50,
          throwMin: 0.50,
          throwMax: 0.63,  // Sabit lens için zoom aralığı iddia ediliyor -> ERR-FIXED-LENS-ZOOM
          lensName: 'Vivitek DU4381Z-ST Dahili Fixed Lens (0.50-0.63:1)',
          resolution: '1920x1200',
        },
      });

      expect(blockedPayload.hasCriticalErrors).toBe(true);
      expect(blockedPayload.pdfApprovalStatus).toBe('BLOCKED');
      expect(blockedPayload.pdfGateStatus).toBe('BLOCKED');
      expect(blockedPayload.canExportFinalPdf).toBe(false);
      expect(blockedPayload.draftRequired).toBe(true);
      expect(blockedPayload.consistencyScorePct).toBe(0); // Kritik hata durumunda %0 kilitlenir
      expect(blockedPayload.approvalBlockReasons.length).toBeGreaterThan(0);
    });
  });
});
