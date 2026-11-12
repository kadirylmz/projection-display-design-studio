import { describe, expect, it } from 'vitest';
import { STANDARD_LENS_PRESETS, distanceForLens, sizeRangeForLens } from './lenses';

describe('lens mesafe ve açılan boyut hesaplamaları', () => {
  it('verilen ekran genişliği için lens atım mesafesi aralığını doğru hesaplar', () => {
    const res = distanceForLens(4.0, 1.25, 1.6);
    expect(res.minDist).toBeCloseTo(5.0, 4);
    expect(res.maxDist).toBeCloseTo(6.4, 4);
  });

  it('sabit lens için min ve max mesafeyi eşit döner', () => {
    const res = distanceForLens(5.0, 0.8, 0.8);
    expect(res.minDist).toBeCloseTo(4.0, 4);
    expect(res.maxDist).toBeCloseTo(4.0, 4);
  });

  it('verilen mesafe ve en-boy oranı için açılan görüntü genişlik ve yüksekliğini doğru hesaplar', () => {
    const aspect169 = 16 / 9;
    const res = sizeRangeForLens(6.0, 1.2, 1.5, aspect169);
    // D = 6.0 m -> maxW = 6.0 / 1.2 = 5.0 m, minW = 6.0 / 1.5 = 4.0 m
    expect(res.minW).toBeCloseTo(4.0, 4);
    expect(res.maxW).toBeCloseTo(5.0, 4);
    expect(res.minH).toBeCloseTo(4.0 / aspect169, 4);
    expect(res.maxH).toBeCloseTo(5.0 / aspect169, 4);
  });

  it('standart lens ön tanımları geçerli throwMin <= throwMax değerlerine sahiptir', () => {
    expect(STANDARD_LENS_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const p of STANDARD_LENS_PRESETS) {
      expect(p.throwMin).toBeGreaterThan(0);
      expect(p.throwMax).toBeGreaterThanOrEqual(p.throwMin);
    }
  });
});
