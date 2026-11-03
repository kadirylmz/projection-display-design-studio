import { describe, expect, it } from 'vitest';
import { blendDrive, computeLayout, gridLayout, horizontalBlendAt, pctToPx } from './multiproj';

describe('çoklu projektör kanvası (kabul testi 4)', () => {
  const ox = pctToPx(10, 1920);
  it('%10 yatay örtüşme → 192 px', () => expect(ox).toBe(192));
  it('2×1 1920x1200: kanvas 3648×1200, 2. projektör x=1728', () => {
    const L = computeLayout(gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: ox, overlapY: 0 }));
    expect(L.canvasW).toBe(3648);
    expect(L.canvasH).toBe(1200);
    expect(L.slots[1].x).toBe(1728);
    expect(L.naiveW).toBe(3840);                  // toplam çözünürlük YANLIŞ değerdir
    expect(L.overlaps).toHaveLength(1);
    expect(L.overlaps[0]).toMatchObject({ x: 1728, w: 192, h: 1200 });
    expect(L.warnings).toEqual([]);
  });
  it('3×1: 3·1920 − 2·192 = 5376; üçüncü x=3456', () => {
    const L = computeLayout(gridLayout({ cols: 3, rows: 1, w: 1920, h: 1200, overlapX: ox, overlapY: 0 }));
    expect(L.canvasW).toBe(5376);
    expect(L.slots[2].x).toBe(3456);
  });
  it('2×2 hem yatay hem dikey örtüşme; köşe örtüşmesi tek bölge', () => {
    const L = computeLayout(gridLayout({ cols: 2, rows: 2, w: 1920, h: 1200, overlapX: 192, overlapY: 120 }));
    expect(L.canvasW).toBe(3648);
    expect(L.canvasH).toBe(2280);
    expect(L.overlaps).toHaveLength(6);           // 4 komşu çift + 2 çapraz
    expect(L.slots[3]).toMatchObject({ x: 1728, y: 1080 });
  });
  it('harman bölgeleri doğru atanır', () => {
    const s = gridLayout({ cols: 3, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 });
    expect(s[0].blend).toEqual({ l: 0, r: 192, t: 0, b: 0 });
    expect(s[1].blend).toEqual({ l: 192, r: 192, t: 0, b: 0 });
  });
  it('geçersiz örtüşmeyi reddeder', () => {
    expect(() => gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 1920, overlapY: 0 })).toThrow();
    expect(() => gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 1000, overlapY: 0 })).toThrow();
    expect(() => pctToPx(100, 1920)).toThrow();
    expect(() => gridLayout({ cols: 0, rows: 1, w: 1, h: 1, overlapX: 0, overlapY: 0 })).toThrow();
  });
});

describe('serbest düzen, kırpma, boşluk', () => {
  it('negatif koordinatlar normalize edilir', () => {
    const L = computeLayout([
      { id: 'A', label: 'A', x: -100, y: 0, w: 1000, h: 500 },
      { id: 'B', label: 'B', x: 900, y: 0, w: 1000, h: 500 },
    ]);
    expect(L.slots[0].x).toBe(0);
    expect(L.slots[1].x).toBe(1000);
    expect(L.canvasW).toBe(2000);
  });
  it('kırpma aktif bölgeyi küçültür', () => {
    const L = computeLayout([{ id: 'A', label: 'A', x: 0, y: 0, w: 1000, h: 500, crop: { l: 10, r: 20, t: 5, b: 5 } }]);
    expect(L.active.A).toEqual({ x: 10, y: 5, w: 970, h: 490 });
  });
  it('boşluk uyarısı', () => {
    const L = computeLayout([
      { id: 'A', label: 'A', x: 0, y: 0, w: 100, h: 100 },
      { id: 'B', label: 'B', x: 200, y: 0, w: 100, h: 100 },
    ]);
    expect(L.warnings.length).toBe(1);
  });
  it('yinelenen kimlik ve geçersiz kırpma reddedilir', () => {
    const a = { id: 'A', label: 'A', x: 0, y: 0, w: 10, h: 10 };
    expect(() => computeLayout([a, a])).toThrow();
    expect(() => computeLayout([{ ...a, crop: { l: 10, r: 0, t: 0, b: 0 } }])).toThrow();
  });
});

describe('kenar harmanlama', () => {
  it('iki projektörün ışık toplamı 1 (lineer ışıkta)', () => {
    const g = 2.2, z = 192;
    for (const px of [0, 50, 100, 191]) {
      const tIn = (px + 0.5) / z;
      const inD = blendDrive(tIn, g), outD = blendDrive(1 - tIn, g);
      expect(Math.pow(inD, g) + Math.pow(outD, g)).toBeCloseTo(1, 9);
    }
  });
  it('projektör içi harman çarpanı: kenar < 1, orta = 1', () => {
    const [p1, p2] = gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 });
    expect(horizontalBlendAt(p1, 960, 2.2)).toBe(1);
    expect(horizontalBlendAt(p1, 1919, 2.2)).toBeLessThan(0.1);
    expect(horizontalBlendAt(p2, 0, 2.2)).toBeLessThan(0.1);
  });
});
