import { describe, expect, it } from 'vitest';
import { fromConfig, layoutToSvg, toConfig } from './exporters';
import { computeLayout, gridLayout } from './multiproj';

const slots = gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 });

describe('dışa aktarım', () => {
  it('SVG kanvas boyutlarını ve projektör koordinatlarını içerir', () => {
    const svg = layoutToSvg(computeLayout(slots), { gridStep: 100 });
    expect(svg).toContain('viewBox="0 0 3648 1200"');
    expect(svg).toContain('x="1728"');
    expect(svg).toContain('1920×1200');
    expect(svg).toContain('(1728, 0) → (3648, 1200)');
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
