import { describe, expect, it } from 'vitest';
import { PRESET_ASPECTS as A, diagonal, heightFromWidth, widthFromDiagonal, widthFromHeight } from './aspect';
import { distanceFromThrow, distanceRange, offsetToShift, shiftToOffset, solveProjection, throwRatio, widthRange } from './throw';
import { convert, fromMeters, toMeters } from './units';

describe('throw ratio (kabul testleri 1-2)', () => {
  it('4 m genişlik, TR 1.5 → 6 m optik mesafe', () => {
    expect(distanceFromThrow(4, 1.5)).toBeCloseTo(6, 12);
  });
  it('10 m mesafe, 2 m genişlik → TR 5', () => {
    expect(throwRatio(10, 2)).toBeCloseTo(5, 12);
  });
  it('geçersiz girdiyi reddeder', () => {
    expect(() => throwRatio(0, 2)).toThrow(RangeError);
    expect(() => distanceFromThrow(-1, 1.5)).toThrow();
    expect(() => throwRatio(NaN, 2)).toThrow();
  });
});

describe('ekran geometrisi (kabul testi 3)', () => {
  it('16:9, 4 m genişlik → 2.25 m yükseklik', () => {
    expect(heightFromWidth(4, A['16:9'])).toBeCloseTo(2.25, 12);
  });
  it('16:10, 4:3, 1:1', () => {
    expect(heightFromWidth(4, A['16:10'])).toBeCloseTo(2.5, 12);
    expect(heightFromWidth(4, A['4:3'])).toBeCloseTo(3, 12);
    expect(heightFromWidth(4, A['1:1'])).toBeCloseTo(4, 12);
  });
  it('yükseklik→genişlik ve diagonal gidiş-dönüş', () => {
    expect(widthFromHeight(2.25, A['16:9'])).toBeCloseTo(4, 12);
    const d = diagonal(4, 2.25);
    expect(widthFromDiagonal(d, A['16:9'])).toBeCloseTo(4, 12);
  });
  it('100" 16:9 ≈ 2.214 × 1.245 m', () => {
    const d = 100 * 0.0254;
    expect(widthFromDiagonal(d, A['16:9'])).toBeCloseTo(2.2137, 3);
  });
});

describe('birim dönüşümü (kabul testi 8)', () => {
  it('feet↔metre fiziksel sonucu değiştirmez', () => {
    const wFt = 13.123359580052494;
    const m = toMeters(wFt, 'ft');
    const r1 = distanceFromThrow(4, 1.5);
    const r2 = distanceFromThrow(toMeters(fromMeters(4, 'ft'), 'ft'), 1.5);
    expect(r2).toBeCloseTo(r1, 12);
    expect(m).toBeCloseTo(4, 12);
    expect(convert(1, 'in', 'mm')).toBeCloseTo(25.4, 12);
    expect(convert(convert(3.3, 'm', 'ft'), 'ft', 'm')).toBeCloseTo(3.3, 12);
  });
});

describe('zoom aralığı ve ulaşılabilirlik', () => {
  const tr = { min: 1.2, max: 1.9 };
  it('mesafe aralığı', () => {
    const z = distanceRange(4, tr);
    expect(z.distanceMin).toBeCloseTo(4.8, 12);
    expect(z.distanceMax).toBeCloseTo(7.6, 12);
    const w = widthRange(6, tr);
    expect(w.min).toBeCloseTo(6 / 1.9, 12);
    expect(w.max).toBeCloseTo(5, 12);
  });
  it('aralık dışı ulaşılamaz', () => {
    const r = solveProjection({ imageWidth: 4, distance: 12, aspect: A['16:9'], throwRange: tr });
    expect(r.achievable).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('aralık içinde zoom pozisyonu ve şasi mesafesi ayrı', () => {
    const r = solveProjection({
      imageWidth: 4, distance: 6, aspect: A['16:9'], throwRange: tr, lensFrontProtrusion: 0.05,
    });
    expect(r.achievable).toBe(true);
    expect(r.zoomPosition).toBeCloseTo((1.5 - 1.2) / 0.7, 12);
    expect(r.lensToSurface).toBe(6);
    expect(r.chassisFrontToSurface).toBeCloseTo(6.05, 12);
    expect(r.imageHeight).toBeCloseTo(2.25, 12);
  });
  it('yetersiz girdi hata verir', () => {
    expect(() => solveProjection({ imageWidth: 4, aspect: A['16:9'] })).toThrow();
  });
});

describe('lens shift referans konvansiyonu', () => {
  it('yarım ve tam boyut referansları farklı ofset verir', () => {
    expect(shiftToOffset(0.5, 2, 'full-dimension')).toBeCloseTo(1, 12);
    expect(shiftToOffset(0.5, 2, 'half-dimension')).toBeCloseTo(0.5, 12);
    expect(offsetToShift(0.5, 2, 'half-dimension')).toBeCloseTo(0.5, 12);
  });
  it('shift limit dışı ulaşılamaz', () => {
    const r = solveProjection({
      imageWidth: 4, throwRatio: 1.5, aspect: A['16:9'], verticalOffset: 1.5,
      vShift: { min: -0.5, max: 0.5, reference: 'full-dimension' },
    });
    expect(r.achievable).toBe(false);
  });
  it('shift limiti olmadan shift doğrulanamaz uyarısı', () => {
    const r = solveProjection({ imageWidth: 4, throwRatio: 1.5, aspect: A['16:9'], verticalOffset: 0.2 });
    expect(r.warnings.length).toBe(1);
  });
});
