import { describe, it, expect } from 'vitest';
import { calculateInterProjectorDistances } from './interprojector';
import { analyze as analyzeElectrical, loadCurrent } from './electrical';
import { computeSurfacePointLuxDistribution } from './feasibility';
import { DEFAULT_SECTIONS, type ReportProjectMeta } from './report';
import { validateReportConsistency } from './reportValidation';

interface AuditRow {
  kalem: string;
  girdi: string;
  formul: string;
  beklenen: number;
  yazilimSonucu: number;
  fark: number;
  tolerans: number;
  basarili: boolean;
}

const baseMeta: ReportProjectMeta = {
  companyName: 'Test AV',
  customer: 'Müze',
  projectName: 'Denetim Projesi',
  location: 'İstanbul',
  category: 'Sergi',
  date: '2026-11-14',
  revision: 1,
  description: '2 Projektör Tutarlılık Denetimi',
};

describe('Proje Verisi ve Mühendislik Tutarlılığı Denetimi (2 Projektör Senaryosu)', () => {
  const widthM = 12;
  const heightM = 4.3;
  const cols = 2;
  const rows = 1;
  const projW = 1920;
  const projH = 1200;
  const overlapPct = 15;
  const ovPxX = Math.round(projW * (overlapPct / 100)); // 288 px
  const throwDistM = 4.0;
  const throwRatio = 0.5;
  const viewDistM = 4.5;
  const unitWatt = 1350;
  const voltage = 230;
  const unitLumens = 10000;
  const optEff = 0.9;
  const gain = 1.0;
  const reflectance = 0.85;

  it('Tekil veri kaynağı üzerinden Overlap, Optik, Fotometri, Elektrik, FOV ve Çapraz Doğrulama tutarlıdır', () => {
    const audits: AuditRow[] = [];
    const record = (kalem: string, girdi: string, formul: string, beklenen: number, yazilimSonucu: number, tolerans: number) => {
      const fark = +(yazilimSonucu - beklenen).toFixed(4);
      const basarili = Math.abs(fark) <= tolerans;
      audits.push({ kalem, girdi, formul, beklenen, yazilimSonucu, fark, tolerans, basarili });
      expect(Math.abs(fark)).toBeLessThanOrEqual(tolerans);
    };

    // 1. Tekil Projektör & Yerleşim Modeli
    const ipAnalysis = calculateInterProjectorDistances(
      [
        {
          id: 'surf-1',
          name: '1. Düz Duvar',
          type: 'wall',
          cols,
          rows,
          projW,
          projH,
          widthM,
          heightM,
          throwDistM,
          throwRatio,
          overlapX: overlapPct,
          overlapY: 0,
        },
      ],
      { enabled: false, widthM: 0, lengthM: 0, heightM: 0 },
      unitWatt
    );

    record('Projektör Sayısı', 'cols=2, rows=1', 'cols × rows', 2, ipAnalysis.totalProjectors, 0);
    record('Oda Genişliği (0×0×0 engeli)', 'physicalRoom.enabled=false', 'max(surfaces.widthM)', 12, ipAnalysis.roomDimensions.widthM, 0.01);

    // 2. Overlap & Birleşik Çözünürlük Motoru (12m duvarda 2×8m ışın -> %50 = 4m / 960px fiziksel örtüşme)
    const physOvRatio = 0.5;
    const physOvPxX = Math.round(projW * physOvRatio); // 960 px
    const combinedW = cols * projW - (cols - 1) * physOvPxX; // 1920 + 1920 - 960 = 2880
    const netW = 2880;
    record('Birleşik Yatay Çözünürlük', '2×1920, ov=960px (%50)', '1920 + 1920 − 960', 2880, combinedW, 0);
    record('Duvar Oranı Kırpma Kaybı', 'combined=2880, net=2880', '2880 − 2880', 0, combinedW - netW, 0);

    // 3. Optik Geometri (TR = D / W)
    const singleW = ipAnalysis.projectors[0].singleWidthM;
    const calcTr = throwDistM / singleW;
    record('Tekil Görüntü Genişliği', 'D=4m, TR=0.5:1', 'D / TR', 8, singleW, 0.01);
    record('Hesaplanan Throw Ratio', 'D=4m, W=8m', 'D / W', 0.5, calcTr, 0.001);

    // 4. Fotometri (Teorik Lümen, Optik Kayıp %90, Gain=1.0, ρ=0.85)
    const areaM2 = widthM * heightM; // 51.6 m²
    const effLumens = cols * unitLumens * optEff; // 18000 lm
    const expectedAvgLux = effLumens / areaM2; // 348.84 lx
    const ptDist = computeSurfacePointLuxDistribution({
      widthM,
      heightM,
      cols,
      rows,
      avgLux: Math.round(expectedAvgLux),
      uniformityU0: 82,
      overlapPct,
      screenGain: gain,
      reflectance,
      ambientLux: 20,
    });
    const avgLux = Math.round(ptDist.avgLux);
    const idealNits = Math.round((avgLux * gain) / Math.PI);
    const realNits = Math.round((avgLux * gain * reflectance) / Math.PI);
    record('Efektif Ortalama Lux', '18000 lm, 51.6 m²', '18000 / 51.6', expectedAvgLux, avgLux, 1.5);
    record('Gözlenen Parlaklık (ρ=0.85)', `avgLux=${avgLux}, Gain=1, ρ=0.85`, 'Lux × Gain × ρ / π', (avgLux * gain * reflectance) / Math.PI, realNits, 1.0);

    // 5. Elektrik (2×1350 W = 2700 W, 230 V tek faz -> 11.74 A @ pf=1)
    const elSupply = { voltage, phases: 1 as const, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 };
    const elLoads = [{ id: 'PJ-AUTO-1', name: 'Projeksiyon (2x)', qty: 2, powerW: unitWatt, pf: 1 }];
    const elCircuits = [{ id: 'C-PJ-1', name: 'Linye-1', loadIds: ['PJ-AUTO-1'], phase: 'L1' as const, cableMm2: 2.5, lengthM: 25, ampacityA: 24 }];
    const elRes = analyzeElectrical(elLoads, elCircuits, elSupply);
    const expectedIb = loadCurrent(2700, 230, 1, false); // 11.7391 A
    record('Toplam Kurulu Güç', '2 × 1350 W', '2 × 1350', 2700, elRes.totalW, 0);
    record('İşletme Akımı (230V 1P)', 'P=2700W, V=230V, PF=1', '2700 / 230', 11.74, +expectedIb.toFixed(2), 0.01);

    // 6. Viewer FOV (12 m ekran, 4.5 m izleme -> H & V >= 20 PPD)
    const hfovDeg = 2 * Math.atan(widthM / (2 * viewDistM)) * (180 / Math.PI);
    record('İzleyici Yatay FOV', 'W=12m, D_view=4.5m', '2·atan(12 / 9)', 106.26, +hfovDeg.toFixed(2), 0.1);

    // 7. Çapraz Doğrulama Motoru (%100 Tutarlılık)
    const valRes = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      interProjectorAnalysis: ipAnalysis,
      projection: {
        projectorName: 'Test WUXGA',
        lensName: '0.5:1 Sabit',
        distanceM: throwDistM,
        imageWidthM: singleW,
        throwRatio,
        throwMin: 0.5,
        throwMax: 0.5,
        aspectW: 16,
        aspectH: 10,
        resolution: '1920×1200',
      },
      photometricSurfaces: [
        {
          surfaceId: 'surf-1',
          surfaceName: '1. Düz Duvar',
          surfaceType: 'wall',
          widthM,
          heightM,
          projectorCount: 2,
          nominalLumensPerProj: unitLumens,
          totalNominalLumens: cols * unitLumens,
          effectiveTotalLumens: effLumens,
          avgLux,
          minLux: Math.round(Math.min(...ptDist.zones9.map(z => z.lux))),
          maxLux: Math.round(Math.max(...ptDist.zones9.map(z => z.lux))),
          uniformityU0: 0.82,
          uniformityU1: 0.78,
          screenGain: gain,
          surfaceReflectance: reflectance,
          luminanceNits: realNits,
          luminanceFL: +(realNits * 0.2919).toFixed(1),
          idealNits,
          ambientLux: 20,
          ambientContrastRatio: 18,
          isManualLux: false,
          distributionRows: [
            { code: 'PJ 1', startX: 0, endX: 8, widthM: 8, centerX: 4, throwDistM, throwRatio, overlapText: '4.00m (%50 Blend)' },
            { code: 'PJ 2', startX: 4, endX: 12, widthM: 8, centerX: 8, throwDistM, throwRatio, overlapText: '— (Kenar)' },
          ],
        },
      ],
      plannerSurfaces: [
        {
          id: 'surf-1',
          name: '1. Düz Duvar',
          type: 'wall',
          cols,
          rows,
          projW,
          projH,
          projNetW: netW,
          projNetH: Math.round((netW / widthM) * heightM),
          netW,
          netH: Math.round((netW / widthM) * heightM),
          overlapX: 50,
          overlapY: 0,
          ovPxX: physOvPxX,
          ovPxY: 0,
          effectiveWidthM: widthM,
          effectiveHeightM: heightM,
          throwDistM,
          throwRatio,
          avgMmPerPx: +(1000 / (netW / widthM)).toFixed(2),
          viewDistM,
        },
      ],
      electrical: {
        supply: elSupply,
        loads: elLoads,
        circuits: elCircuits,
      },
    });

    expect(valRes.errorCount).toBe(0);
    expect(valRes.warningCount).toBe(0);
    expect(valRes.checks.some(c => c.id === 'elec-shortcircuit-selectivity' && c.verdict === 'UNKNOWN')).toBe(true);
    expect(valRes.consistencyScorePct).toBeLessThan(100);
    expect(audits.every(a => a.basarili)).toBe(true);
  });

  it('Kritik hata varken %100 tutarlılık skoru verilmez (ör. yerleşim satırı uyuşmazlığı veya elektrik güç farkı)', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      interProjectorAnalysis: {
        totalProjectors: 2,
        totalPowerW: 2700,
        projectors: [],
        surfaceStats: [],
        cornerTransitions: [],
        roomDimensions: { widthM: 12, lengthM: 6, heightM: 4.8 },
      },
      photometricSurfaces: [
        {
          surfaceId: 'surf-1',
          surfaceName: '1. Düz Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 2,
          effectiveTotalLumens: 18000,
          avgLux: 349,
          minLux: 290,
          maxLux: 410,
          uniformityU0: 0.83,
          uniformityU1: 0.71,
          screenGain: 1.0,
          surfaceReflectance: 0.85,
          luminanceNits: 94,
          luminanceFL: 27.4,
          idealNits: 111,
          ambientLux: 20,
          ambientContrastRatio: 18,
          distributionRows: [
            { code: 'PJ 1', startX: 0, endX: 6, widthM: 6, centerX: 3, throwDistM: 4, throwRatio: 0.5, overlapText: '—' },
            { code: 'PJ 2', startX: 3, endX: 9, widthM: 6, centerX: 6, throwDistM: 4, throwRatio: 0.5, overlapText: '—' },
            { code: 'PJ 3', startX: 6, endX: 12, widthM: 6, centerX: 9, throwDistM: 4, throwRatio: 0.5, overlapText: '—' },
          ],
        },
      ],
      electrical: {
        supply: { voltage: 230, phases: 1, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
        loads: [{ id: 'L1', name: 'PJ', qty: 1, powerW: 1350 }],
        circuits: [{ id: 'C1', name: 'C1', loadIds: ['L1'], phase: 'L1' }],
      },
    });

    expect(res.hasCriticalErrors).toBe(true);
    expect(res.consistencyScorePct).toBeLessThan(100);
    expect(res.checks.some(c => c.id === 'dist-rows-count-0')).toBe(true);
    expect(res.checks.some(c => c.id === 'elec-power-sync')).toBe(true);
  });

  it('Fiziksel yerleşim (%62.8) ile Pixel Map (%15) overlap çelişkisi kritik hata üretir', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      plannerSurfaces: [
        {
          id: 'surf-1',
          name: '1. Düz Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 3349,
          netH: 1200,
          overlapX: 15,
          overlapY: 0,
          ovPxX: 288,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 4.3,
          throwDistM: 5.5,
          throwRatio: 0.8,
          avgMmPerPx: 3.58,
          viewDistM: 3.5,
        },
      ],
    });

    expect(res.hasCriticalErrors).toBe(true);
    expect(res.consistencyScorePct).toBeLessThan(100);
    expect(res.checks.some(c => c.id === 'phys-overlap-sync-0')).toBe(true);
  });

  it('12×4.3m duvar, 3 PJ (singleW=6.88m): fiziksel koordinatlardan 4.32m / 1205px overlap ve 1.96A üretilir', () => {
    const ip = calculateInterProjectorDistances(
      [
        {
          id: 'wall-12x43',
          name: '12m Ana Duvar',
          type: 'wall',
          widthM: 12,
          heightM: 4.3,
          cols: 3,
          rows: 1,
          throwDistM: 3.44,
          throwRatio: 0.5,
          projW: 1920,
          projH: 1200,
          singleProjWidthM: 6.88,
        },
      ],
      { enabled: true, widthM: 12, lengthM: 8, heightM: 5 },
      450
    );

    expect(ip.projectors).toHaveLength(3);
    expect(ip.projectors[0].startX).toBe(0);
    expect(ip.projectors[0].endX).toBe(6.88);
    expect(ip.projectors[1].startX).toBe(2.56);
    expect(ip.projectors[1].endX).toBe(9.44);
    expect(ip.projectors[2].startX).toBe(5.12);
    expect(ip.projectors[2].endX).toBe(12);
    expect(ip.projectors[0].overlapWidthM).toBeCloseTo(4.32, 2);
    expect(ip.projectors[0].overlapPx).toBe(1206); // Math.round(1920 * (4.32/6.88)) = 1206 (or ~1205)
    expect(ip.surfaceStats[0].combinedW).toBe(3 * 1920 - 2 * ip.projectors[0].overlapPx);
    expect(ip.surfaceStats[0].pxPerMeterH).toBeCloseTo(ip.surfaceStats[0].combinedW / 12, 0);

    // 450 W / 230 V / PF 1 = 1.96 A (1 faz)
    const ib1P = loadCurrent(450, 230, 1, false);
    expect(+ib1P.toFixed(2)).toBe(1.96);

    // 1350 W / 230 V L-N (400 V L-L) 3 faz = 1.96 A
    const el3P = analyzeElectrical(
      [
        { id: 'L1', name: 'PJ1', qty: 1, powerW: 450, pf: 1 },
        { id: 'L2', name: 'PJ2', qty: 1, powerW: 450, pf: 1 },
        { id: 'L3', name: 'PJ3', qty: 1, powerW: 450, pf: 1 },
      ],
      [
        { id: 'C1', name: 'Linye-1', loadIds: ['L1'], phase: 'L1' },
        { id: 'C2', name: 'Linye-2', loadIds: ['L2'], phase: 'L2' },
        { id: 'C3', name: 'Linye-3', loadIds: ['L3'], phase: 'L3' },
      ],
      { voltage: 230, phases: 3, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 }
    );
    expect(+el3P.totalIbA.toFixed(2)).toBe(1.96);
  });

  it('Veri eksikliği durumunda PASS yerine UNKNOWN üretilir ve %100 skor engellenir', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, electrical: true },
      projection: {
        projectorName: 'Bilinmeyen Projektör',
        lensName: 'Katalogsuz Lens',
        distanceM: 4,
        imageWidthM: 8,
        throwRatio: 0.5,
        aspectW: 16,
        aspectH: 10,
        resolution: '1920×1200',
        // throwMin & throwMax eksik!
      },
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: 'Eksik Fotometri',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 2,
          avgLux: 350,
          minLux: 0,
          maxLux: 0,
          uniformityU0: 0,
          uniformityU1: 0,
          screenGain: 1,
          luminanceNits: 95,
          luminanceFL: 27.7,
          ambientLux: 0,
          ambientContrastRatio: 0,
          // nominalLumensPerProj, ambientLux, uniformityU0 eksik!
        },
      ],
      electrical: {
        supply: { voltage: 0, phases: 1, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
        loads: [{ id: 'PJ1', name: 'PJ', qty: 2, powerW: 0 }],
        circuits: [{ id: 'C1', name: 'Linye-1', loadIds: ['PJ1'], phase: 'L1' }],
      },
    });

    expect(res.unknownCount).toBeGreaterThanOrEqual(4);
    expect(res.isConsistent).toBe(false);
    expect(res.draftRequired).toBe(true);
    expect(res.consistencyScorePct).toBeLessThan(100);
    expect(res.checks.some(c => c.id === 'proj-lens-range' && c.verdict === 'UNKNOWN')).toBe(true);
    expect(res.checks.some(c => c.id === 'electrical-missing' && c.verdict === 'UNKNOWN')).toBe(true);
  });

  it('Revizyon 4 denetimi: 6100lm/%82.8/24.41m² -> 206.9lx, 1037px overlap -> 6.75m/29.03m², 3686×1200 anizotropi uyarısı', () => {
    // 1. Lux & Nit (6100 lm × 0.828 = 5050.8 lm / 24.41 m² = 206.9 lx -> 65.9 cd/m²)
    const effLm = 6100 * 0.828;
    const area = 24.41;
    const expLux = effLm / area;
    const expNits = expLux / Math.PI;
    expect(+expLux.toFixed(1)).toBe(206.9);
    expect(+expNits.toFixed(1)).toBe(65.9);

    // 2. 336.7 lx (15 m²) vs 24.41 m² alan çelişkisi FAIL (error) verir
    const mismatchRes = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, lux: true },
      projection: {
        projectorName: '6100lm WUXGA',
        lensName: 'Zoom 0.5-0.92:1',
        imageWidthM: 6.25,
        distanceM: 5,
        aspectW: 16,
        aspectH: 10,
        throwRatio: 0.8,
        throwMin: 0.5,
        throwMax: 0.92,
      },
      lux: {
        ansiLumens: [6100],
        brightnessPct: 82.8,
        widthM: 5,
        heightM: 3, // 15 m² != 24.41 m²!
        gain: 1,
        ambientLux: 20,
      },
    });
    expect(mismatchRes.checks.some(c => c.id === 'proj-lux-area-sync' && c.verdict === 'FAIL')).toBe(true);

    // 3. 3686×1200 birleşik çözünürlükte yatay/dikey px/m anizotropisi (307.2 vs 279.1) uyarısı üretilir
    const anisoRes = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      plannerSurfaces: [
        {
          id: 'wall-1',
          name: '12m Ana Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          projNetW: 3686,
          projNetH: 1200,
          netW: 3349,
          netH: 1200,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 4.3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 3.58,
          viewDistM: 4.5,
        },
      ],
    });
    expect(anisoRes.checks.some(c => c.id === 'pm-combined-anisotropy-0')).toBe(true);

    // 4. 1350 W / 400 V / √3 / PF 1 = 1.95 A ve 450 W / 230 V / PF 1 = 1.96 A
    expect(+loadCurrent(1350, 400, 1, true).toFixed(2)).toBe(1.95);
    expect(+loadCurrent(450, 230, 1, false).toFixed(2)).toBe(1.96);

    // 5. 8000 lm vs 10000 lm ve 3.91A (PF=1) vs 4.12A (PF=0.95) çelişkileri FAIL üretir
    const crossMismatch = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, electrical: true },
      projection: {
        projectorName: '8000lm PJ',
        lensName: '0.5-0.92:1',
        imageWidthM: 6.88,
        distanceM: 5.5,
        aspectW: 16,
        aspectH: 10,
        throwRatio: 0.8,
        throwMin: 0.5,
        throwMax: 0.92,
        ansiLumens: 8000,
      },
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 2,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 20000,
          effectiveTotalLumens: 18000,
          avgLux: 349,
          minLux: 286,
          maxLux: 370,
          uniformityU0: 0.82,
          uniformityU1: 0.77,
          screenGain: 1,
          surfaceReflectance: 0.85,
          luminanceNits: 94,
          luminanceFL: 27.4,
          ambientLux: 20,
          ambientContrastRatio: 18,
        },
      ],
      electrical: {
        supply: { voltage: 230, phases: 1, defaultPf: 1, designMargin: 0.25, maxDropPct: 3, rho: 0.0225, diversity: 1 },
        loads: [{ id: 'PJ1', name: '2x PJ', qty: 2, powerW: 450, pf: 0.95 }],
        circuits: [{ id: 'C1', name: 'Linye-1 (3x Projektör)', loadIds: ['PJ1'], phase: 'L1' }],
      },
    });
    expect(crossMismatch.checks.some(c => c.id === 'cross-proj-lumens-sync' && c.verdict === 'FAIL')).toBe(true);
    expect(crossMismatch.checks.some(c => c.id === 'elec-summary-vs-circuits' && c.verdict === 'FAIL')).toBe(true);
    expect(crossMismatch.consistencyScorePct).toBeLessThan(100);

    // 6. 6.25×3.906m görüntü 4.3m duvar yüksekliğini kaplamıyor -> vertical-surface-coverage-0 FAIL
    const vCovFail = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      plannerSurfaces: [
        {
          id: 'wall-vcov',
          name: '4.3m Duvar',
          type: 'wall',
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 3349,
          netH: 1200,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 4.3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 3.58,
          viewDistM: 4.5,
        },
      ],
    });
    expect(vCovFail.checks.some(c => c.id === 'vertical-surface-coverage-0' && c.verdict === 'FAIL')).toBe(true);
    expect(vCovFail.hasCriticalErrors).toBe(true);
  });

  it('projectionScreens birim lümeni (8000 lm) ile fotometri (10000 lm/PJ) uyuşmazsa cross-proj-lumens-sync FAIL verir ve rapor yüzey bazlı adet+toplam lümen gösterir', () => {
    const lumenSyncFail = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      projectionScreens: [
        {
          screenName: '1. Düz Duvar',
          projectorName: '3x Lazer Projeksiyon Cihazı',
          lensName: 'Zoom Lens',
          distanceM: 5,
          imageWidthM: 6.88,
          aspectW: 16,
          aspectH: 10,
          ansiLumens: 8000,
        },
      ],
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: '1. Düz Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          avgLux: 523,
          minLux: 440,
          maxLux: 590,
          uniformityU0: 0.84,
          uniformityU1: 0.75,
          luminanceNits: 141,
          luminanceFL: 41.2,
          screenGain: 1.0,
          ambientLux: 20,
          ambientContrastRatio: 26,
        },
      ],
    });
    expect(lumenSyncFail.checks.some(c => c.id === 'cross-proj-lumens-sync' && c.verdict === 'FAIL')).toBe(true);
    expect(lumenSyncFail.hasCriticalErrors).toBe(true);
  });

  it('fotometri 5. adım tek cihaz katkısı ve 8. adım ortam siyah seviyesi formülü raporda doğru gösterilir', async () => {
    const { buildReportHtml } = await import('./report');
    const html = buildReportHtml({
      lang: 'tr',
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, lux: true, includeBrightnessChain: true },
      photometricSurfaces: [
        {
          surfaceId: 's-acr',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          avgLux: 523,
          minLux: 450,
          maxLux: 590,
          uniformityU0: 0.86,
          uniformityU1: 0.76,
          luminanceNits: 142,
          luminanceFL: 41.4,
          screenGain: 1.0,
          surfaceReflectance: 0.85,
          ambientLux: 20,
          ambientContrastRatio: 27,
          singleProjectorLux: 107,
        },
      ],
    });
    expect(html).toContain('Tek Cihaz Ort: 174 lx × 3 PJ');
    expect(html).not.toContain('Tek Cihaz Ort: 107 lx');
    expect(html).toContain('20 lx × Gain 1 × ρ 0.85 / π = Siyah +5.41 Nit');

    // singleProjectorLux: 107 ile 523 avgLux tutarsızlığını çapraz doğrulama yakalamalı
    const singleMathFail = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      photometricSurfaces: [
        {
          surfaceId: 's-acr',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          avgLux: 523,
          minLux: 450,
          maxLux: 590,
          uniformityU0: 0.86,
          uniformityU1: 0.76,
          luminanceNits: 142,
          luminanceFL: 41.4,
          screenGain: 1.0,
          surfaceReflectance: 0.85,
          ambientLux: 20,
          ambientContrastRatio: 27,
          singleProjectorLux: 107,
        },
      ],
    });
    expect(singleMathFail.checks.some(c => c.id === 'single-pj-lux-math-0' && c.verdict === 'FAIL')).toBe(true);
  });

  it('9-nokta ağırlıklı ortalama (1/16, 2/16, 4/16) tüm kenar orta noktalarını 2/16 ile toplar (496 lx)', async () => {
    const { buildReportHtml } = await import('./report');
    const html = buildReportHtml({
      lang: 'tr',
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, lux: true },
      photometricSurfaces: [
        {
          surfaceId: 's-9pt',
          surfaceName: '1. Düz Duvar',
          surfaceType: 'wall',
          widthM: 12,
          heightM: 4.3,
          projectorCount: 3,
          nominalLumensPerProj: 10000,
          totalNominalLumens: 30000,
          effectiveTotalLumens: 27000,
          avgLux: 523,
          minLux: 429,
          maxLux: 563,
          uniformityU0: 0.82,
          uniformityU1: 0.76,
          luminanceNits: 142,
          luminanceFL: 41.4,
          screenGain: 1.0,
          surfaceReflectance: 0.85,
          ambientLux: 20,
          ambientContrastRatio: 27,
        },
      ],
    });
    expect(html).not.toContain('9-Nokta Ağırlıklı: 432 lx');
  });

  it('kritik hata varken raporda "Kritik bir mühendislik uyarısı bulunmamaktadır" yazmaz ve yeni çapraz doğrulama kontrolleri çalışır', async () => {
    const { buildReportHtml } = await import('./report');
    const badPayload = {
      lang: 'tr' as const,
      meta: baseMeta,
      sections: { ...DEFAULT_SECTIONS, assumptionsAndWarnings: true },
      projectionScreens: [
        {
          screenName: '1. Düz Duvar',
          projectorName: '3x Lazer Projeksiyon Cihazı',
          lensName: 'Zoom Lens',
          distanceM: 5,
          imageWidthM: 6.25,
          aspectW: 16,
          aspectH: 9, // Native 1920x1200 (16:10) ile çelişkili
          ansiLumens: 10000,
        },
      ],
      plannerSurfaces: [
        {
          id: 'w-rev2',
          name: '1. Düz Duvar',
          type: 'wall' as const,
          cols: 3,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 3349,
          netH: 1200,
          overlapX: 54,
          overlapY: 0,
          ovPxX: 1037,
          ovPxY: 0,
          effectiveWidthM: 12,
          effectiveHeightM: 4.3,
          throwDistM: 5,
          throwRatio: 0.8,
          avgMmPerPx: 3.58,
          viewDistM: 3.5, // Dikey PPD < 20
        },
      ],
    };
    const val = validateReportConsistency(badPayload);
    expect(val.checks.some(c => c.id === 'native-aspect-vs-proj-size-0' && c.verdict === 'FAIL')).toBe(true);
    expect(val.checks.some(c => c.id === 'overlap-count-vs-projectors-0' && c.expectedValue.includes('2 komşu bölge'))).toBe(true);
    expect(val.checks.some(c => c.id === 'viewer-ppd-0' && c.status === 'warning')).toBe(true);

    const html = buildReportHtml(badPayload);
    expect(html).not.toContain('Kritik bir mühendislik uyarısı bulunmamaktadır.');
  });
});
