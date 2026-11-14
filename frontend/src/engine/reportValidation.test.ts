import { describe, it, expect } from 'vitest';
import { DEFAULT_SECTIONS, ReportProjectMeta } from './report';
import { validateReportConsistency } from './reportValidation';

const baseMeta: ReportProjectMeta = {
  companyName: 'Test AV',
  customer: 'Müze',
  projectName: 'Müze Salonu',
  location: 'İstanbul',
  category: 'Sergi',
  date: '2026-11-13',
  revision: 1,
  description: 'Test projesi',
};

describe('validateReportConsistency (Mühendislik Çapraz Doğrulama Motoru)', () => {
  it('tutarlı verilerde %100 tutarlılık skoru ve 0 hata üretir', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      projection: {
        projectorName: 'PJ-1',
        lensName: '0.8:1',
        imageWidthM: 5,
        distanceM: 4,
        aspectW: 16,
        aspectH: 10,
        throwRatio: 0.8,
        throwMin: 0.75,
        throwMax: 0.95,
      },
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 5,
          heightM: 3,
          projectorCount: 1,
          avgLux: 400,
          minLux: 350,
          maxLux: 450,
          uniformityU0: 87.5,
          uniformityU1: 77.8,
          luminanceNits: Math.round((400 * 1.0) / Math.PI),
          luminanceFL: 37.2,
          ambientLux: 30,
          ambientContrastRatio: 14.3,
          screenGain: 1.0,
          surfaceReflectance: 1.0,
          nominalLumensPerProj: 6667,
          totalNominalLumens: 6667,
          effectiveTotalLumens: 6000,
          idealNits: Math.round((400 * 1.0) / Math.PI),
        },
      ],
    });

    expect(res.isConsistent).toBe(true);
    expect(res.errorCount).toBe(0);
    expect(res.warningCount).toBe(0);
    expect(res.consistencyScorePct).toBe(100);
  });

  it('modüller arası matematiksel çelişki ve lens sınırı ihlalinde otomatik uyarı üretir', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: { ...baseMeta, projectName: 'Hatalı Proje' },
      sections: DEFAULT_SECTIONS,
      projection: {
        projectorName: 'PJ-1',
        lensName: '1.2-1.5:1',
        imageWidthM: 5,
        distanceM: 3,
        aspectW: 16,
        aspectH: 10,
        throwRatio: 1.3,
        throwMin: 1.2,
        throwMax: 1.5,
      },
      photometricSurfaces: [
        {
          surfaceId: 's1',
          surfaceName: 'Ana Duvar',
          surfaceType: 'wall',
          widthM: 5,
          heightM: 3,
          projectorCount: 1,
          avgLux: 900,
          minLux: 700,
          maxLux: 1100,
          uniformityU0: 78,
          uniformityU1: 64,
          luminanceNits: 286,
          luminanceFL: 83.6,
          ambientLux: 30,
          ambientContrastRatio: 30,
          screenGain: 1.0,
          effectiveTotalLumens: 3000,
        },
      ],
    });

    expect(res.isConsistent).toBe(false);
    expect(res.errorCount).toBeGreaterThanOrEqual(2);
    expect(res.warnings.length).toBeGreaterThanOrEqual(2);
    expect(res.consistencyScorePct).toBeLessThan(100);
  });

  it('tek projektörde overlap, kapasite aşımı, 0W güç, 0×0×0 oda ve çapraz modül farklarını yakalar', () => {
    const res = validateReportConsistency({
      lang: 'tr',
      meta: baseMeta,
      sections: DEFAULT_SECTIONS,
      projection: {
        projectorName: 'PJ-1',
        lensName: '1.42:1',
        imageWidthM: 4,
        distanceM: 5.68,
        aspectW: 16,
        aspectH: 9,
        throwRatio: 1.42,
        resolution: '1920×1080',
      },
      interProjectorAnalysis: {
        totalProjectors: 1,
        totalPowerW: 0,
        roomDimensions: { widthM: 0, lengthM: 0, heightM: 0 },
        surfaceStats: [],
        cornerTransitions: [],
        projectors: [],
      },
      plannerSurfaces: [
        {
          id: 's1',
          name: 'Ana Duvar',
          type: 'wall',
          cols: 1,
          rows: 1,
          projW: 1920,
          projH: 1200,
          netW: 2200,
          netH: 1200,
          overlapX: 15,
          overlapY: 0,
          ovPxX: 288,
          ovPxY: 0,
          effectiveWidthM: 5.5,
          effectiveHeightM: 3.0,
          throwRatio: 0.8,
          avgMmPerPx: 2.5,
          viewDistM: 3.5,
        },
      ],
    });

    expect(res.isConsistent).toBe(false);
    expect(res.consistencyScorePct).toBeLessThan(70);
    expect(res.checks.some(c => c.id.startsWith('single-pj-overlap'))).toBe(true);
    expect(res.checks.some(c => c.id.startsWith('native-cap'))).toBe(true);
    expect(res.checks.some(c => c.id === 'cross-screen-dims')).toBe(true);
    expect(res.checks.some(c => c.id === 'cross-lens-tr')).toBe(true);
    expect(res.checks.some(c => c.id === 'cross-resolution')).toBe(true);
    expect(res.checks.some(c => c.id === 'room-dims-zero')).toBe(true);
    expect(res.checks.some(c => c.id === 'power-zero')).toBe(true);
  });
});
