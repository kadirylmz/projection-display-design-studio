import { describe, expect, it } from 'vitest';
import { newDrawing, parseDxfEntities, toDxf, toSvg } from './drawing';
import { analyze, BREAKER_RATINGS_A, defaultSupply, loadCurrent, selectBreaker, voltageDrop, Load, Circuit } from './electrical';
import { electricalSingleLine, ledElevation, mappingDrawing, roomPlan } from './drawings';
import { computeLayout, gridLayout } from './multiproj';

describe('DXF yazıcı', () => {
  const d = newDrawing('t', 'mm');
  d.prims.push({ t: 'line', x1: 0, y1: 0, x2: 100, y2: 50, layer: 'GEOMETRI' });
  d.prims.push({ t: 'rect', x: 10, y: 10, w: 20, h: 30, layer: 'PROJEKTOR' });
  d.prims.push({ t: 'circle', cx: 5, cy: 5, r: 2.5, layer: 'IMAJ' });
  d.prims.push({ t: 'text', x: 1, y: 2, h: 3, text: 'Işık şeması', layer: 'METIN' });
  const dxf = toDxf(d);
  it('geçerli bölüm yapısı ve EOF', () => {
    expect(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);
    expect(dxf.trimEnd().endsWith('0\r\nEOF')).toBe(true);
    expect((dxf.match(/SECTION/g) ?? []).length).toBe(3 + 0);
    expect(dxf).toContain('AC1009');
  });
  it('varlıklar geri okunur: 1 çizgi + 4 (dikdörtgen) + daire + metin', () => {
    const e = parseDxfEntities(dxf);
    expect(e.filter(x => x.type === 'LINE')).toHaveLength(5);
    expect(e.filter(x => x.type === 'CIRCLE')).toHaveLength(1);
    const l = e.find(x => x.type === 'LINE')!;
    expect(l.layer).toBe('GEOMETRI'); expect(l.v['11']).toBe('100'); expect(l.v['21']).toBe('50');
    expect(e.find(x => x.type === 'CIRCLE')!.v['40']).toBe('2.5');
  });
  it('Türkçe karakterler \\U+ ile kodlanır; ASCII korunur', () => {
    const t = parseDxfEntities(dxf).find(x => x.type === 'TEXT')!;
    expect(t.v['1']).toBe('I\\U+015F\\U+0131k \\U+015Femas\\U+0131');
    expect(dxf).not.toMatch(/[^\x00-\x7F]/);
  });
  it('tanımsız katmanı reddeder', () => {
    const b = newDrawing('x', 'mm'); b.prims.push({ t: 'line', x1: 0, y1: 0, x2: 1, y2: 1, layer: 'YOK' });
    expect(() => toDxf(b)).toThrow();
  });
  it('SVG aynı geometriyi içerir (y çevrilmiş)', () => {
    const s = toSvg(d);
    expect(s).toContain('<svg'); expect(s).toContain('<line'); expect(s).toContain('Işık şeması');
  });
});

describe('elektrik hesapları', () => {
  it('tek faz akım: 2300 W / 230 V = 10 A; üç faz', () => {
    expect(loadCurrent(2300, 230, 1, false)).toBeCloseTo(10, 12);
    expect(loadCurrent(6000, 400, 1, true)).toBeCloseTo(6000 / (Math.sqrt(3) * 400), 12);
    expect(loadCurrent(2300, 230, 0.5, false)).toBeCloseTo(20, 12);
  });
  it('koruma seçimi: Ib 10 A, marj %25 → 12.5 → 13 A; Ib 30 → 40 A; aşırı → null', () => {
    expect(selectBreaker(10, 0.25).inA).toBe(13);
    expect(selectBreaker(30, 0.25).inA).toBe(40);
    expect(selectBreaker(120, 0.25).inA).toBeNull();
    expect(BREAKER_RATINGS_A).toEqual([...BREAKER_RATINGS_A].sort((a, b) => a - b));
  });
  it('gerilim düşümü: 16 A, 30 m, 2.5 mm², ρ 0.0225 → 8.64 V (%3.76)', () => {
    const v = voltageDrop(16, 30, 2.5, 0.0225, 230, false);
    expect(v.volts).toBeCloseTo(2 * 0.0225 * 30 * 16 / 2.5, 12);
    expect(v.percent).toBeCloseTo(v.volts / 230 * 100, 12);
  });
  const loads: Load[] = [{ id: 'a', name: 'LED', qty: 12, powerW: 250 }, { id: 'b', name: 'Projektör', qty: 2, powerW: 600 }, { id: 'c', name: 'Atanmamış', qty: 1, powerW: 100 }];
  const circuits: Circuit[] = [
    { id: '1', name: 'D1', loadIds: ['a'], phase: 'L1', cableMm2: 4, lengthM: 20, ampacityA: 25 },
    { id: '2', name: 'D2', loadIds: ['b'], phase: 'L2', cableMm2: 1.5, lengthM: 40 },
  ];
  it('devre analizi', () => {
    const r = analyze(loads, circuits, { ...defaultSupply(), phases: 3, voltage: 230 });
    expect(r.circuits[0].powerW).toBe(3000);
    expect(r.circuits[0].ibA).toBeCloseTo(3000 / 230, 9);
    expect(r.circuits[0].breakerA).toBe(20);           // 13.04·1.25 = 16.3 → 20
    expect(r.totalW).toBe(4200);
    expect(r.warnings.some(w => w.includes('Atanmamış'))).toBe(true);
    expect(r.circuits[1].warnings.some(w => w.includes('Iz'))).toBe(true);
    expect(r.circuits[0].dropPct).toBeCloseTo((2 * 0.0225 * 20 * (3000 / 230) / 4) / 230 * 100, 9);
    expect(r.phaseLoadsW.L1).toBe(3000);
    expect(r.imbalancePct).not.toBeNull();
  });
  it('In > Iz uyarısı ve geçersiz girdiler', () => {
    const r = analyze(loads, [{ ...circuits[0], ampacityA: 16 }], defaultSupply());
    expect(r.circuits[0].warnings.some(w => w.includes('In ≤ Iz'))).toBe(true);
    expect(() => loadCurrent(0, 230, 1, false)).toThrow();
    expect(() => loadCurrent(100, 230, 1.2, false)).toThrow();
    expect(() => analyze(loads, circuits, { ...defaultSupply(), diversity: 0 })).toThrow();
  });
});

describe('çizim üreticileri', () => {
  it('LED ön görünüş: kabin başına 4 çizgi, genel ölçü', () => {
    const d = ledElevation({ pitchMm: 2.5, widthMm: 500, heightMm: 500 }, 4, 3);
    const e = parseDxfEntities(toDxf(d));
    expect(d.prims.filter(p => p.t === 'rect')).toHaveLength(12);
    expect(e.some(x => x.type === 'TEXT' && x.v['1'] === '2000 mm')).toBe(true);
    expect(e.some(x => x.type === 'TEXT' && x.v['1'] === '1500 mm')).toBe(true);
  });
  it('piksel haritası ve oda planı geçerli DXF üretir', () => {
    const L = computeLayout(gridLayout({ cols: 2, rows: 1, w: 1920, h: 1200, overlapX: 192, overlapY: 0 }));
    const md = mappingDrawing(L);
    expect(md.prims.filter(p => p.t === 'rect')).toHaveLength(1 + 2 + 1);
    const plan = roomPlan({ w: 10, l: 12, h: 4 },
      [{ id: 'P', label: 'P1', pos: [0, 2.5, 4], yawDeg: 0, pitchDeg: 0, throwRatio: 1.5, aspect: 16 / 9 }],
      [{ kind: 'plane', id: 'S', label: 'duvar', center: [0, 2, 12], yawDeg: 180, pitchDeg: 0, width: 10, height: 4 }], []);
    expect(parseDxfEntities(toDxf(plan)).length).toBeGreaterThan(8);
  });
  it('tek hat şeması: devre ve yük metinleri', () => {
    const loads: Load[] = [{ id: 'a', name: 'LED', qty: 12, powerW: 250 }];
    const circuits: Circuit[] = [{ id: '1', name: 'D1', loadIds: ['a'], phase: 'L1', cableMm2: 4, lengthM: 20 }];
    const res = analyze(loads, circuits, defaultSupply());
    const d = electricalSingleLine(loads, circuits, defaultSupply(), res);
    const texts = parseDxfEntities(toDxf(d)).filter(e => e.type === 'TEXT').map(e => e.v['1']);
    expect(texts.some(t => t.includes('3000 W'))).toBe(true);
    expect(texts.some(t => t.includes('BESLEME 230 V'))).toBe(true);
    expect(texts.some(t => t.includes('4 mm2'))).toBe(true);
  });
});
