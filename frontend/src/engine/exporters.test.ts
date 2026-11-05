import { describe, expect, it } from 'vitest';
import { fromConfig, layoutToSvg, toConfig } from './exporters';
import { computeLayout, createDefaultBezierMask, createUniformWarp, gridLayout } from './multiproj';

const slots = gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 });

describe('dışa aktarım', () => {
  it('SVG kanvas boyutlarını ve projektör koordinatlarını içerir', () => {
    const svg = layoutToSvg(computeLayout(slots), { gridStep: 100 });
    expect(svg).toContain('viewBox="0 0 3648 1200"');
    expect(svg).toContain('x="1728"');
    expect(svg).toContain('1920×1200');
    expect(svg).toContain('(1728, 0) → (3648, 1200)');
  });
  it('Poligon maske, Bezier maske ve Mesh Warp ızgarasını SVG olarak işler', () => {
    const custom = slots.map((s, i) => i === 0 ? {
      ...s,
      polygonMask: [{ x: 10, y: 10 }, { x: 500, y: 10 }, { x: 250, y: 400 }],
      bezierMask: createDefaultBezierMask(s.w, s.h),
      warp: createUniformWarp(s.w, s.h, 3, 3),
    } : s);
    const svg = layoutToSvg(computeLayout(custom));
    expect(svg).toContain('<polygon points="10,10 500,10 250,400"');
    expect(svg).toContain('<path d="M ');
    expect(svg).toContain('<circle ');
  });
  it('JSON yapılandırma gidiş-dönüş kayıpsız (kabul testi 9 - geometri)', () => {
    const cfg = toConfig(slots, { w: 3648, h: 1200 });
    const back = fromConfig(JSON.stringify(cfg));
    expect(back).toEqual(cfg);
    expect(computeLayout(back.projectors).canvasW).toBe(3648);
  });
  it('geçersiz yapılandırmayı reddeder', () => {
    expect(() => fromConfig('{"schema":"x"}')).toThrow();
  });
});
