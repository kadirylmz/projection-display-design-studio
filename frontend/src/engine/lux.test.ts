import { describe, expect, it } from 'vitest';
import { computeLux, computeViewingQualityAnalysis, heatmap, nitsToFL, projectorWidth, luxToFc, flToNits } from './lux';
import { lensesCoveringThrow } from './lenses';

describe('lux (kabul testi 7)', () => {
  it('5000 lm, %100, 4×2.25 m, gain 1 → 555.56 lx, 176.84 nit', () => {
    const r = computeLux({ ansiLumens: [5000], width: 4, height: 2.25 });
    expect(r.illuminanceLux).toBeCloseTo(5000 / 9, 9);
    expect(r.luminanceNits).toBeCloseTo(5000 / 9 / Math.PI, 9);
    expect(r.lumensPerM2).toBeCloseTo(r.illuminanceLux, 9);
  });
  it('parlaklık yüzdesi akıyı ölçekler', () => {
    const r = computeLux({ ansiLumens: [5000], brightnessPct: 80, width: 4, height: 2.25 });
    expect(r.totalLumens).toBeCloseTo(4000, 9);
    expect(r.illuminanceLux).toBeCloseTo(4000 / 9, 9);
  });
  it('lux ≠ nit: gain 1.3 luminance\'ı ölçekler, lux\'u değil', () => {
    const a = computeLux({ ansiLumens: [3000], width: 2, height: 1 });
    const b = computeLux({ ansiLumens: [3000], width: 2, height: 1, gain: 1.3 });
    expect(b.illuminanceLux).toBeCloseTo(a.illuminanceLux, 9);
    expect(b.luminanceNits).toBeCloseTo(a.luminanceNits * 1.3, 9);
  });
  it('çoklu projektör toplanır, açı cos ile ölçekler', () => {
    const r = computeLux({ ansiLumens: [1000, 2000], width: 3, height: 1, surfaceAngleDeg: 60 });
    expect(r.totalLumens).toBe(3000);
    expect(r.illuminanceLux).toBeCloseTo(1000 * 0.5, 6);
  });
  it('ortam ışığı kontrastı', () => {
    const r = computeLux({ ansiLumens: [3000], width: 2, height: 1, ambientLux: 100 });
    expect(r.contrastRatioWithAmbient).toBeCloseTo((1500 + 100) / 100, 9);
  });
  it('birimler', () => {
    expect(nitsToFL(flToNits(16))).toBeCloseTo(16, 9);
    expect(flToNits(1)).toBeCloseTo(3.4262591, 6);
    expect(luxToFc(10.763910417)).toBeCloseTo(1, 9);
  });
  it('geçersiz girdiler', () => {
    expect(() => computeLux({ ansiLumens: [], width: 1, height: 1 })).toThrow();
    expect(() => computeLux({ ansiLumens: [1000], brightnessPct: 0, width: 1, height: 1 })).toThrow();
    expect(() => computeLux({ ansiLumens: [1000], width: 1, height: 1, surfaceAngleDeg: 90 })).toThrow();
  });
  it('9 kalemli gerçekçi parlaklık ve kayıp zinciri hesabı', () => {
    const r = computeLux({
      ansiLumens: [10000, 10000],
      width: 8,
      height: 2.5,
      gain: 1.2,
      ambientLux: 40,
      lumenStandard: 'iso',
      opticalLossPct: 10,
      colorCalibrationLossPct: 8,
      agingLossPct: 5,
      reflectance: 0.85,
    });
    expect(r.area).toBeCloseTo(20, 9);
    expect(r.nominalTotalLumens).toBe(20000);
    expect(r.theoreticalLux).toBeCloseTo(1000, 9);
    const expectedEff = 0.95 * 0.9 * 0.92 * 0.95;
    expect(r.totalLumens).toBeCloseTo(20000 * expectedEff, 6);
    expect(r.lostLumens).toBeCloseTo(20000 - r.totalLumens, 6);
    expect(r.illuminanceLux).toBeCloseTo(r.totalLumens / 20, 6);
    expect(r.singleProjectorLux).toBeCloseTo(r.illuminanceLux / 2, 6);
    expect(r.realisticLuminanceNits).toBeCloseTo(r.illuminanceLux * 1.2 * 0.85 / Math.PI, 6);
    expect(r.realisticAmbientLuminanceNits).toBeCloseTo(40 * 1.2 * 0.85 / Math.PI, 6);
    expect(r.contrastRatioWithAmbient).toBeCloseTo((r.illuminanceLux + 40) / 40, 6);
  });
});

describe('örtüşme ve ısı haritası', () => {
  it('projektör genişliği: 2 projektör, %10 örtüşme, W=1.9 → 1.0', () => {
    expect(projectorWidth(1.9, 2, 0.1)).toBeCloseTo(1.0, 12);
  });
  it('harmanlama olmadan örtüşme bölgesi iki katı aydınlatma', () => {
    const base = { projectors: 2, lumensEach: 1000, width: 1.9, height: 1, overlapFraction: 0.1, cornerUniformity: 1, cols: 190, rows: 4 };
    const nb = heatmap({ ...base, blend: false });
    const mid = nb.data[2 * 190 + 95];   // x≈0.95 örtüşme merkezi (0.9–1.0)
    const out = nb.data[2 * 190 + 20];
    expect(mid / out).toBeCloseTo(2, 6);
  });
  it('ideal harmanlama örtüşmede yaklaşık tek projektör seviyesinde kalır', () => {
    const base = { projectors: 2, lumensEach: 1000, width: 1.9, height: 1, overlapFraction: 0.1, cornerUniformity: 1, cols: 190, rows: 4 };
    const b = heatmap({ ...base, blend: true });
    const out = b.data[2 * 190 + 20];
    expect(b.data[2 * 190 + 95]).toBeCloseTo(out, 6);
  });
  it('köşe düzgünlüğü: ortalama korunur, min < max', () => {
    const h = heatmap({ projectors: 1, lumensEach: 1000, width: 2, height: 1, overlapFraction: 0, blend: false, cornerUniformity: 0.8, cols: 200, rows: 100 });
    expect(h.avg).toBeCloseTo(500, 0);
    expect(h.min).toBeLessThan(h.max);
  });
});

describe('lens optik aralığı', () => {
  it('yalnızca TR aralığı kapsayan lensler', () => {
    const ls = [
      { id: 1, manufacturer: 'T', model: 'a', throw_min: 1, throw_max: 2 },
      { id: 2, manufacturer: 'T', model: 'b', throw_min: 2.5, throw_max: 4 },
    ];
    expect(lensesCoveringThrow(1.5, ls).map(l => l.id)).toEqual([1]);
    expect(lensesCoveringThrow(5, ls)).toEqual([]);
  });
});

describe('computeViewingQualityAnalysis', () => {
  it('tüm 7 izleme ve görüntü kalitesi metriği ile toplam kalite skorunu tutarlı hesaplar', () => {
    const res = computeViewingQualityAnalysis({
      widthM: 6,
      heightM: 3,
      resW: 3840,
      resH: 1920,
      viewingDistanceM: 7.5,
      offAxisAngleDeg: 0,
      screenGain: 1.0,
      reflectance: 0.85,
      avgLux: 450,
      ambientLux: 30,
      nativeContrast: 2000,
      uniformityU0: 82,
      uniformityU1: 88,
      projectorCount: 2,
      overlapPct: 18,
      colorCalibrated: true,
    });

    // 1. İzleme mesafesi (height=3m => min=4.5, optMin=6, optMax=12, max=18)
    expect(res.viewingDistanceM).toBe(7.5);
    expect(res.minViewingDistM).toBe(4.5);
    expect(res.optimalViewingDistMinM).toBe(6);
    expect(res.optimalViewingDistMaxM).toBe(12);
    expect(res.maxViewingDistM).toBe(18);
    expect(res.distanceRatioToHeight).toBe(2.5);
    expect(res.viewingDistanceStatus).toBe('İdeal İzleme Bölgesi');

    // 2. Görüş açısı (2*atan(3/7.5) ≈ 43.6°)
    expect(res.horizontalFovDeg).toBeCloseTo(43.6, 1);
    expect(res.verticalFovDeg).toBeCloseTo(22.6, 1);
    expect(res.offAxisLuminanceDropPct).toBe(0);
    expect(res.fovCategory).toContain('Sinematik');

    // 3. Görüntü keskinliği (3840 / 43.6 ≈ 88.1 PPD => ultra keskin)
    expect(res.ppd).toBeGreaterThan(80);
    expect(res.arcminPerPixel).toBeLessThan(1);
    expect(res.sharpnessScorePct).toBe(100);

    // 4. Piksel görünürlüğü (6000 / 3840 = 1.56 mm/px, minRetina ≈ 5.37m < 7.5m)
    expect(res.mmPerPx).toBeCloseTo(1.56, 2);
    expect(res.pixelVisibilityIndex).toBeGreaterThan(1);
    expect(res.pixelVisibilityLabel).toContain('Retina');

    // 5. Kontrast oranı (450*0.85/pi ≈ 121.75 nits; amb ≈ 8.12 nits => ACR ≈ 15.9)
    expect(res.ambientContrastRatio).toBeGreaterThan(15);
    expect(res.effectiveSystemContrast).toBe(res.ambientContrastRatio);

    // 6. Renk uniformitesi
    expect(res.deltaE2000).toBeLessThan(2.5);
    expect(res.colorUniformityPct).toBeGreaterThan(85);

    // 7. Parlaklık uniformitesi
    expect(res.luminanceUniformityU0Pct).toBe(82);
    expect(res.luminanceUniformityU1Pct).toBe(88);
    expect(res.blendZoneRipplePct).toBeCloseTo(3.5, 1);

    // 8. Toplam özet
    expect(res.overallQualityScorePct).toBeGreaterThanOrEqual(80);
    expect(res.overallQualityGrade).toContain('A');
  });

  it('0..1 normalize edilmiş U0/U1 değerlerini ve yüksek ortam ışığı / kalibrasyonsuz senaryoyu cezalandırır', () => {
    const poor = computeViewingQualityAnalysis({
      widthM: 8,
      heightM: 4,
      resW: 1920,
      resH: 1080,
      viewingDistanceM: 3.5,
      offAxisAngleDeg: 35,
      screenGain: 1.8,
      reflectance: 0.85,
      avgLux: 200,
      ambientLux: 300,
      nativeContrast: 2000,
      uniformityU0: 0.55,
      uniformityU1: 0.62,
      projectorCount: 3,
      overlapPct: 10,
      colorCalibrated: false,
    });

    expect(poor.luminanceUniformityU0Pct).toBe(55);
    expect(poor.luminanceUniformityU1Pct).toBe(62);
    expect(poor.ambientContrastRatio).toBeLessThan(5);
    expect(poor.offAxisLuminanceDropPct).toBeGreaterThan(25);
    expect(poor.deltaE2000).toBeGreaterThan(5);
    expect(poor.pixelVisibilityIndex).toBeLessThan(0.5);
    expect(poor.overallQualityScorePct).toBeLessThan(55);
  });
});
