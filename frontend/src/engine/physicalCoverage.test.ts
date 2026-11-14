import { describe, expect, it } from 'vitest';
import { evaluatePhysicalCoverage } from './physicalCoverage';
import { evaluateSystemFeasibility } from './feasibility';

describe('Physical Coverage Validation (Fiziksel Yüzey Kaplama Doğrulaması)', () => {
  it('6.25×3.906 m (TR 0.80, D=5 m) ile 12×4.3 m duvarı kaplayamadığında FAIL ve TR=0.727 önerir', () => {
    const res = evaluatePhysicalCoverage({
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
    expect(res.verdict).toBe('FAIL');
    expect(res.isHorizontalCovered).toBe(true);
    expect(res.isVerticalCovered).toBe(false);
    expect(res.uncoveredHeightM).toBeCloseTo(0.39, 1);
    expect(res.requiredSingleWidthForFullHeightM).toBeCloseTo(6.88, 2);
    expect(res.requiredThrowRatioForFullHeight).toBeCloseTo(0.727, 3);
    expect(res.recommendedAction).toBe('adjust_throw_or_tr');
  });

  it('6.88×4.3 m (TR 0.727, D=5 m) ile 12×4.3 m duvarı tam kapladığında PASS verir', () => {
    const res = evaluatePhysicalCoverage({
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      cols: 3,
      rows: 1,
      projW: 1920,
      projH: 1200,
      throwDistM: 5,
      throwRatio: 0.727,
      overlapX: 60,
    });
    expect(res.verdict).toBe('PASS');
    expect(res.isFullyCovered).toBe(true);
    expect(res.verticalCoveragePct).toBe(100);
  });

  it('yatay kaplama yetersizse FAIL verir', () => {
    const res = evaluatePhysicalCoverage({
      surfaceWidthM: 12,
      surfaceHeightM: 3.5,
      cols: 2,
      rows: 1,
      projW: 1920,
      projH: 1200,
      throwDistM: 4,
      throwRatio: 0.8,
      overlapX: 15,
    });
    expect(res.verdict).toBe('FAIL');
    expect(res.isHorizontalCovered).toBe(false);
    expect(res.uncoveredWidthM).toBeGreaterThan(2);
  });

  it('atım mesafesi veya throw ratio eksikse PASS değil UNKNOWN verir', () => {
    const res = evaluatePhysicalCoverage({
      surfaceWidthM: 12,
      surfaceHeightM: 4.3,
      cols: 3,
      rows: 1,
      projW: 1920,
      projH: 1200,
      throwDistM: 0,
      throwRatio: 0.8,
    });
    expect(res.verdict).toBe('UNKNOWN');
    expect(res.isFullyCovered).toBe(false);
  });

  it('evaluateSystemFeasibility yatayda %100 kaplasa bile dikey kaplama yetersizse ok yerine critical verir', () => {
    const feas = evaluateSystemFeasibility({
      widthM: 12,
      heightM: 4.3,
      throwDistM: 5,
      throwRatio: 0.8,
      cols: 3,
      rows: 1,
      projW: 1920,
      projH: 1200,
      overlapPct: 54,
      avgLux: 419,
      ambientLux: 20,
      uniformityU0: 82,
    });
    const lensCat = feas.categories.find(c => c.id === 'lens_limits');
    expect(lensCat?.severity).toBe('critical');
    expect(lensCat?.metricsText).toContain('V %90.8');
  });
});
