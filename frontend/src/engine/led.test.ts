import { describe, expect, it } from 'vitest';
import { cabinetGrid, cabinetsForSize, curvedLayout, jointAngleFromRadius, ledFromCabinets, radiusFromJointAngle, resolutionFromSize, sizeFromResolution, Cabinet } from './led';
import { lcdWall, activeAreaFromDiagonal } from './lcd';
import { PRESET_ASPECTS } from './aspect';

// Kurgusal test kabini (üretici verisi değil): 500×500 mm, 2.5 mm pitch → 200×200 px
const cab: Cabinet = { pitchMm: 2.5, widthMm: 500, heightMm: 500, weightKg: 8, powerTypW: 100, powerMaxW: 250 };

describe('LED duvar (kabul testi 5)', () => {
  it('4×3 kabin: 2000×1500 mm, 800×600 px, 12 kabin', () => {
    const r = ledFromCabinets(cab, 4, 3, 0.05, { voltage: 230, powerFactor: 1 });
    expect(r.widthMm).toBe(2000); expect(r.heightMm).toBe(1500);
    expect(r.resX).toBe(800); expect(r.resY).toBe(600);
    expect(r.resX * 2.5).toBe(r.widthMm);            // piksel·pitch = fiziksel
    expect(r.totalPixels).toBe(480000);
    expect(r.qty).toBe(12);
    expect(r.weightKg).toBe(96);
    expect(r.powerTypW).toBe(1200); expect(r.powerMaxW).toBe(3000);
    expect(r.currentMaxA).toBeCloseTo(3000 / 230, 9);
    expect(r.spareQty).toBe(1);                      // ceil(0.6)
    expect(r.areaM2).toBeCloseTo(3, 12);
    expect(r.diagonalMm).toBeCloseTo(2500, 9);
    expect(r.aspect).toBeCloseTo(4 / 3, 12);
  });
  it('mod A: boyut → çözünürlük, hata ≤ pitch/2', () => {
    const r = resolutionFromSize(2.5, 2003, 1498);
    expect(r.resX).toBe(801); expect(r.resY).toBe(599);
    expect(Math.abs(r.widthErrorMm)).toBeLessThanOrEqual(r.toleranceMm);
    expect(Math.abs(r.heightErrorMm)).toBeLessThanOrEqual(r.toleranceMm);
  });
  it('mod B: çözünürlük → boyut; A ile gidiş-dönüş', () => {
    const s = sizeFromResolution(2.5, 1920, 1080);
    expect(s).toEqual({ widthMm: 4800, heightMm: 2700 });
    const back = resolutionFromSize(2.5, s.widthMm, s.heightMm);
    expect([back.resX, back.resY]).toEqual([1920, 1080]);
  });
  it('mod C: kabin adedi yuvarlama stratejileri', () => {
    expect(cabinetsForSize(cab, 4800, 2700, 'ceil')).toMatchObject({ cols: 10, rows: 6 });
    expect(cabinetsForSize(cab, 4800, 2700, 'floor')).toMatchObject({ cols: 9, rows: 5 });
    expect(cabinetsForSize(cab, 4800, 2700, 'nearest')).toMatchObject({ cols: 10, rows: 5 });
    expect(cabinetsForSize(cab, 4000, 3000, 'ceil')).toMatchObject({ cols: 8, rows: 6, widthErrorMm: 0 });
  });
  it('kabin ızgarası pozisyonları', () => {
    const g = cabinetGrid(cab, 3, 2);
    expect(g).toHaveLength(6);
    expect(g[4]).toMatchObject({ col: 1, row: 1, xMm: 500, yMm: 500, pxX: 200, pxY: 200 });
  });
  it('tutarsız kabin çözünürlüğü uyarı verir; geçersiz girdi reddedilir', () => {
    expect(ledFromCabinets({ ...cab, resX: 180, resY: 200 }, 1, 1).warnings.length).toBe(1);
    expect(() => ledFromCabinets(cab, 0, 1)).toThrow();
    expect(() => ledFromCabinets({ ...cab, pitchMm: 0 }, 1, 1)).toThrow();
    expect(() => ledFromCabinets(cab, 1, 1, 0, { voltage: 230, powerFactor: 1.2 })).toThrow();
  });
});

describe('kavisli LED', () => {
  it('yarıçap ↔ eklem açısı gidiş-dönüş', () => {
    const a = jointAngleFromRadius(500, 5000);
    expect(radiusFromJointAngle(500, a)).toBeCloseTo(5000, 6);
  });
  it('simetrik yerleşim; kabin merkezleri yarıçap üzerinde', () => {
    const c = curvedLayout(500, 4, 5000);
    expect(c.cells[0].cx).toBeCloseTo(-c.cells[3].cx, 9);
    c.cells.forEach(k => expect(Math.hypot(k.cx, k.cz)).toBeCloseTo(5000, 6));
    expect(c.totalAngleDeg).toBeCloseTo(4 * c.jointAngleDeg, 9);
    expect(c.arcLengthMm).toBeGreaterThan(c.chordMm);
  });
  it('geçersiz yarıçapı reddeder', () => {
    expect(() => jointAngleFromRadius(500, 100)).toThrow();
    expect(() => curvedLayout(500, 100, 300)).toThrow();
  });
});

describe('LCD video duvarı', () => {
  it('55" 16:9 aktif alan', () => {
    const a = activeAreaFromDiagonal(55 * 25.4, PRESET_ASPECTS['16:9']);
    expect(a.activeWmm).toBeCloseTo(1217.6, 0);
    expect(a.activeHmm).toBeCloseTo(684.9, 0);
  });
  it('2×2, bezel 2 mm/kenar: dikiş 4 mm, dış boyut ve çözünürlük', () => {
    const r = lcdWall({ activeWmm: 1200, activeHmm: 675, bezelMm: 2, nativeW: 1920, nativeH: 1080, cols: 2, rows: 2 });
    expect(r.seamMm).toBe(4);
    expect(r.outerWmm).toBe(2 * 1204);
    expect(r.outerHmm).toBe(2 * 679);
    expect(r.visibleWmm).toBe(2 * 1200 + 4);
    expect(r.resX).toBe(3840); expect(r.resY).toBe(2160);
    expect(r.count).toBe(4);
    // piksel aralığı 0.625 mm → 4/0.625 = 6.4 → 6 px
    expect(r.compensatedCanvasW).toBe(3840 + 6);
  });
  it('3×3 ve montaj boşluğu', () => {
    const r = lcdWall({ activeWmm: 1000, activeHmm: 600, bezelMm: 1, gapMm: 1, nativeW: 1920, nativeH: 1080, cols: 3, rows: 3 });
    expect(r.seamMm).toBe(3);
    expect(r.outerWmm).toBe(3 * 1002 + 2);
  });
  it('geçersiz girdi', () => {
    expect(() => lcdWall({ activeWmm: 1, activeHmm: 1, bezelMm: -1, nativeW: 1, nativeH: 1, cols: 1, rows: 1 })).toThrow();
    expect(() => lcdWall({ activeWmm: 1, activeHmm: 1, bezelMm: 0, nativeW: 1, nativeH: 1, cols: 0, rows: 1 })).toThrow();
  });
});
