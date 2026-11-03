import { describe, expect, it } from 'vitest';
import { Aabb, Projector3D, Surface, centerDir, cornerDirs, coverage, dot, frame, projectPoint, rayHit, surfaceArea } from './room3d';
import { fov, frustumCorners, focalForFraming, framing, visibleSize } from './camera';

const proj: Projector3D = { id: 'P', label: 'P', pos: [0, 0, 0], yawDeg: 0, pitchDeg: 0, throwRatio: 1.5, aspect: 16 / 9 };
// 10×6 m duvar, z=6'da, normal −Z (projektöre dönük)
const wall: Surface = { kind: 'plane', id: 'W', label: 'duvar', center: [0, 0, 6], yawDeg: 180, pitchDeg: 0, width: 10, height: 6 };

describe('çerçeve ve projeksiyon', () => {
  it('ortonormal çerçeve', () => {
    for (const [y, p] of [[0, 0], [30, 20], [-75, -40], [180, 10]]) {
      const { f, r, u } = frame(y, p);
      expect(dot(f, f)).toBeCloseTo(1, 12); expect(dot(r, r)).toBeCloseTo(1, 12); expect(dot(u, u)).toBeCloseTo(1, 12);
      expect(dot(f, r)).toBeCloseTo(0, 12); expect(dot(f, u)).toBeCloseTo(0, 12); expect(dot(r, u)).toBeCloseTo(0, 12);
    }
    expect(frame(0, 0).u[1]).toBeCloseTo(1, 12);
    expect(frame(90, 0).f[0]).toBeCloseTo(1, 12);
  });
  it('4 m genişlik / TR 1.5 → 6 m: köşeler duvarda ±2, ±1.125', () => {
    const hits = cornerDirs(proj).map(d => rayHit(proj.pos, d, wall)!);
    expect(hits.every(Boolean)).toBe(true);
    expect(hits[0].p[0]).toBeCloseTo(-2, 9); expect(hits[0].p[1]).toBeCloseTo(-1.125, 9);
    expect(hits[2].p[0]).toBeCloseTo(2, 9); expect(hits[2].p[1]).toBeCloseTo(1.125, 9);
    expect(hits[0].p[2]).toBeCloseTo(6, 9);
  });
  it('dikey lens shift merkezi yukarı kaydırır', () => {
    const h = rayHit(proj.pos, centerDir({ ...proj, vShift: 0.5 }), wall)!;
    expect(h.p[1]).toBeCloseTo(0.5 * 2.25, 9);
  });
  it('projectPoint ters dönüşüm: merkez noktası görüntü merkezinde; arkadaki null', () => {
    const q = projectPoint(proj, [0, 0, 6])!;
    expect(q.u).toBeCloseTo(0, 12); expect(q.z).toBeCloseTo(6, 12);
    expect(projectPoint(proj, [0, 0, -1])).toBeNull();
  });
});

describe('kapsama ve doluluk', () => {
  it('görüntü 4×2.25 / duvar 60 m² → kapsama ≈ %15', () => {
    const c = coverage(proj, wall, [], 400, 240);
    expect(c.coverage).toBeCloseTo(9 / 60, 2);
    expect(c.litAreaM2).toBeCloseTo(9, 0);
    expect(c.avgIncidenceCos).toBeGreaterThan(0.95);
  });
  it('arka yüze bakan yüzeye ışık düşmez', () => {
    const back: Surface = { ...wall, yawDeg: 0 };
    const c = coverage(proj, back, [], 100, 60);
    expect(c.lit).toBe(0); expect(c.backfacing).toBeGreaterThan(0); expect(c.warnings.length).toBeGreaterThan(0);
  });
  it('engel gölge oluşturur', () => {
    const box: Aabb = { id: 'B', label: 'kolon', min: [-0.5, -3, 2], max: [0.5, 3, 3] };
    const free = coverage(proj, wall, [], 200, 120), blocked = coverage(proj, wall, [box], 200, 120);
    expect(blocked.lit).toBeLessThan(free.lit);
    expect(blocked.occluded).toBeGreaterThan(0);
    expect(blocked.warnings.some(w => w.includes('gölge'))).toBe(true);
  });
  it('projektör arkasındaki yüzey kapsanmaz', () => {
    const behind: Surface = { ...wall, center: [0, 0, -6], yawDeg: 0 };
    expect(coverage(proj, behind, [], 60, 40).lit).toBe(0);
  });
});

describe('silindir ve kubbe', () => {
  it('silindir içi: eksendeki projektörün merkez ışını R mesafede', () => {
    const cyl: Surface = { kind: 'cylinder', id: 'C', label: 'silindir', center: [0, -2, 0], radius: 5, height: 4, startDeg: -90, endDeg: 90 };
    const h = rayHit(proj.pos, centerDir(proj), cyl)!;
    expect(h.t).toBeCloseTo(5, 9);
    expect(surfaceArea(cyl)).toBeCloseTo(5 * Math.PI * 4, 9);
    expect(rayHit(proj.pos, [0, 0, -1], cyl)).toBeNull();      // yay dışı (arka)
    const c = coverage(proj, cyl, [], 200, 100);
    expect(c.coverage).toBeGreaterThan(0.05); expect(c.coverage).toBeLessThan(0.5);
  });
  it('kubbe: her yöndeki üst yarım küre ışını R', () => {
    const dome: Surface = { kind: 'dome', id: 'D', label: 'kubbe', center: [0, 0, 0], radius: 4 };
    expect(rayHit([0, 0, 0], [0.3, 0.8, 0.5], dome)!.p.reduce((a, v) => a + v * v, 0)).toBeCloseTo(16, 9);
    expect(rayHit([0, 0, 0], [0, -1, 0], dome)).toBeNull();
    expect(surfaceArea(dome)).toBeCloseTo(2 * Math.PI * 16, 9);
  });
  it('yukarı bakan projektör kubbeyi aydınlatır', () => {
    const dome: Surface = { kind: 'dome', id: 'D', label: 'kubbe', center: [0, 0, 0], radius: 4 };
    const up: Projector3D = { ...proj, pitchDeg: 90, throwRatio: 0.5 };
    const c = coverage(up, dome, [], 200, 100);
    expect(c.lit).toBeGreaterThan(0);
  });
});

describe('kamera FOV', () => {
  const cam = { sensorW: 36, sensorH: 24, focal: 50 };
  it('36×24 mm, 50 mm → 39.6° × 27.0°', () => {
    const f = fov(cam);
    expect(f.hDeg).toBeCloseTo(39.5978, 3);
    expect(f.vDeg).toBeCloseTo(26.9914, 3);
  });
  it('10 m → 7.2 × 4.8 m; odak uzaklığı gidiş-dönüş', () => {
    const v = visibleSize(cam, 10);
    expect(v.width).toBeCloseTo(7.2, 9); expect(v.height).toBeCloseTo(4.8, 9);
    expect(focalForFraming(36, 10, 7.2)).toBeCloseTo(50, 9);
  });
  it('çerçeveleme', () => {
    const fr = framing(cam, 10, 3.6, 4.8);
    expect(fr.fillW).toBeCloseTo(0.5, 9); expect(fr.fillH).toBeCloseTo(1, 9); expect(fr.fits).toBe(true);
    expect(framing(cam, 10, 8, 1).fits).toBe(false);
  });
  it('frustum kesiti boyutu görünür boyutla eşleşir', () => {
    const c = frustumCorners([0, 0, 0], 0, 0, cam, 10);
    expect(Math.abs(c[1][0] - c[0][0])).toBeCloseTo(7.2, 9);
    expect(Math.abs(c[2][1] - c[1][1])).toBeCloseTo(4.8, 9);
  });
  it('geçersiz girdiler', () => {
    expect(() => fov({ sensorW: 0, sensorH: 24, focal: 50 })).toThrow();
    expect(() => visibleSize(cam, -1)).toThrow();
  });
});
