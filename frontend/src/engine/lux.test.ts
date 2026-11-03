import { describe, expect, it } from 'vitest';
import { computeLux, heatmap, nitsToFL, projectorWidth, luxToFc, flToNits } from './lux';
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
