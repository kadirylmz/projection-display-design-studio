import { describe, expect, it } from 'vitest';
import {
  computeEffectiveMultiProjectorPixelArea,
  computeSurfacePointLuxDistribution,
  evaluatePointAt,
  evaluateSystemFeasibility,
  recommendProjectorAndLenses,
} from './feasibility';

describe('recommendProjectorAndLenses', () => {
  it('verilen mekân ölçülerine göre TR, zoom aralığı ve parlaklık eşleşen projektör/lens alternatifleri üretir', () => {
    const rec = recommendProjectorAndLenses({
      widthM: 8,
      heightM: 3,
      throwDistM: 4.0,
      maxRoomThrowM: 6.0,
      cols: 2,
      rows: 1,
      overlapPct: 15,
      targetLux: 350,
      ambientLux: 50,
    });

    expect(rec.areaM2).toBe(24);
    expect(rec.alternatives.length).toBeGreaterThan(0);
    expect(rec.alternatives.length).toBeLessThanOrEqual(6);
    expect(rec.alternatives[0].matchScore).toBeGreaterThanOrEqual(rec.alternatives[rec.alternatives.length - 1].matchScore);
    expect(rec.alternatives.some(a => a.lensCoversTR)).toBe(true);
  });
});

describe('computeEffectiveMultiProjectorPixelArea', () => {
  it('overlap ve keystone/warp kayıpları düşüldükten sonra net efektif piksel alanını doğru hesaplar', () => {
    const res = computeEffectiveMultiProjectorPixelArea({
      widthM: 12,
      heightM: 3.5,
      projW: 1920,
      projH: 1200,
      cols: 3,
      rows: 1,
      overlapPctX: 15,
      keystoneDegV: 0,
      isCurved: false,
    });

    // Ham = 3 * 1920 = 5760px; Overlap = 2 * round(0.15 * 1920) = 576px => netW = 5184px
    expect(res.rawW).toBe(5760);
    expect(res.totalOverlapPxW).toBe(576);
    expect(res.netW).toBe(5184);
    expect(res.netH).toBe(1200);
    expect(res.usableContentW).toBe(5184);
    expect(res.overlapLostPct).toBeCloseTo(10, 1);
    expect(res.mmPerPx).toBeCloseTo(12000 / 5184, 1);
  });

  it('keystone açısı ve eğrisel warp olduğunda kullanılabilir piksel alanını ek olarak azaltır', () => {
    const flat = computeEffectiveMultiProjectorPixelArea({
      widthM: 8,
      heightM: 3,
      projW: 1920,
      projH: 1080,
      cols: 2,
      rows: 1,
      overlapPctX: 15,
    });
    const warped = computeEffectiveMultiProjectorPixelArea({
      widthM: 8,
      heightM: 3,
      projW: 1920,
      projH: 1080,
      cols: 2,
      rows: 1,
      overlapPctX: 15,
      keystoneDegV: 12,
      isCurved: true,
    });

    expect(warped.geometricLossPct).toBeGreaterThan(10);
    expect(warped.usableEffectivePixels).toBeLessThan(flat.usableEffectivePixels);
  });
});

describe('computeSurfacePointLuxDistribution', () => {
  it('merkez, kenar ve köşe bölgelerinde tutarlı 9 noktalı lux ve nit dağılımı üretir', () => {
    const dist = computeSurfacePointLuxDistribution({
      widthM: 10,
      heightM: 3.5,
      cols: 2,
      avgLux: 400,
      uniformityU0: 75,
      overlapPct: 18,
      screenGain: 1.0,
      reflectance: 0.85,
    });

    expect(dist.zones9).toHaveLength(9);
    const center = dist.zones9.find(z => z.id === 'center')!;
    expect(center.lux).toBeGreaterThan(dist.cornerAvgLux);
    expect(dist.edgeAvgLux).toBeGreaterThanOrEqual(dist.cornerAvgLux);
    expect(dist.centerToCornerDropPct).toBeGreaterThan(15);

    const probe = evaluatePointAt(0.25, 0.5, {
      widthM: 10,
      heightM: 3.5,
      cols: 2,
      avgLux: 400,
      uniformityU0: 75,
    });
    expect(probe.xM).toBe(2.5);
    expect(probe.yM).toBe(1.75);
    expect(probe.lux).toBeGreaterThan(0);
  });
});

describe('evaluateSystemFeasibility', () => {
  it('tüm 5 kategoride kritik hataları (lens sınırı, düşük lux, gölge, montaj, aşırı kayıp) yakalar', () => {
    const poor = evaluateSystemFeasibility({
      widthM: 10,
      heightM: 4,
      throwDistM: 6,
      throwRatio: 1.6,
      lensThrowMin: 0.75,
      lensThrowMax: 0.95,
      maxRoomThrowM: 5.5,
      roomHeightM: 3.8,
      projMountHeightM: 3.75,
      viewDistM: 2.5,
      humanHeightM: 1.8,
      cols: 2,
      rows: 1,
      projW: 1920,
      projH: 1080,
      overlapPct: 5,
      avgLux: 140,
      ambientLux: 120,
      uniformityU0: 55,
      keystoneDegV: 20,
      hasInterProjectorOcclusion: true,
    });

    expect(poor.categories).toHaveLength(5);
    expect(poor.criticalCount).toBe(5);
    expect(poor.overallSeverity).toBe('critical');
    expect(poor.overallScorePct).toBeLessThan(30);
  });

  it('uygun mühendislik kurulumunda tüm 5 kategoriyi onaylar', () => {
    const good = evaluateSystemFeasibility({
      widthM: 8.2,
      heightM: 2.8,
      throwDistM: 3.6,
      throwRatio: 0.8,
      lensThrowMin: 0.75,
      lensThrowMax: 0.95,
      maxRoomThrowM: 7,
      roomHeightM: 4.5,
      projMountHeightM: 3.1,
      viewDistM: 4.2,
      cols: 2,
      rows: 1,
      projW: 1920,
      projH: 1200,
      overlapPct: 16,
      avgLux: 450,
      ambientLux: 25,
      uniformityU0: 82,
      keystoneDegV: 0,
    });

    expect(good.criticalCount).toBe(0);
    expect(good.warningCount).toBe(0);
    expect(good.okCount).toBe(5);
    expect(good.overallSeverity).toBe('ok');
    expect(good.overallScorePct).toBe(100);
  });
});
