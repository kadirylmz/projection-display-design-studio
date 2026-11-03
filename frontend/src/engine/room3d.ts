/**
 * 3B oda geometrisi (SI: metre). Koordinatlar: X sağ, Y yukarı, Z ileri (yaw=0 → +Z'ye bakar).
 * Çerçeve(yaw,pitch): forward=(sin y·cos p, sin p, cos y·cos p), right=(cos y,0,−sin y), up=forward×right.
 * Projektör modeli: ideal pinhole. Birim uzaklıktaki görüntü genişliği Wu = 1/TR, yükseklik Hu = Wu/aspect;
 * lens shift (tam-boyut referanslı oran) görüntü merkezini (hs·Wu, vs·Hu) kaydırır.
 * Kapsama: yüzey ÖRNEKLEME ile (Monte-Carlo değil, düzenli ızgara); yaklaşık, çözünürlük ile yakınsar.
 * Doluluk (occlusion): yalnızca eksen-hizalı kutu (AABB) engeller; yüzeyler birbirini perdelemez.
 */
export type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / len(a));
const rad = (d: number) => d * Math.PI / 180;
const EPS = 1e-9;

export interface Frame { f: V3; r: V3; u: V3 }
export function frame(yawDeg: number, pitchDeg: number): Frame {
  const y = rad(yawDeg), p = rad(pitchDeg);
  const f: V3 = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
  const r: V3 = [Math.cos(y), 0, -Math.sin(y)];
  return { f, r, u: cross(f, r) };
}

export interface Projector3D {
  id: string; label: string;
  pos: V3; yawDeg: number; pitchDeg: number;
  throwRatio: number; aspect: number;        // aspect = w/h
  hShift?: number; vShift?: number;          // görüntü boyutuna oran
}

export function imageRectUnit(p: Projector3D) {
  if (!(p.throwRatio > 0) || !(p.aspect > 0)) throw new RangeError('throwRatio ve aspect > 0 olmalı');
  const Wu = 1 / p.throwRatio, Hu = Wu / p.aspect;
  const cu = (p.hShift ?? 0) * Wu, cv = (p.vShift ?? 0) * Hu;
  return { Wu, Hu, uMin: cu - Wu / 2, uMax: cu + Wu / 2, vMin: cv - Hu / 2, vMax: cv + Hu / 2 };
}

/** Görüntü köşelerinin dünya yön vektörleri (z=1 düzleminde): sol-alt, sağ-alt, sağ-üst, sol-üst */
export function cornerDirs(p: Projector3D): V3[] {
  const fr = frame(p.yawDeg, p.pitchDeg), R = imageRectUnit(p);
  return ([[R.uMin, R.vMin], [R.uMax, R.vMin], [R.uMax, R.vMax], [R.uMin, R.vMax]] as [number, number][])
    .map(([u, v]) => add(add(fr.f, mul(fr.r, u)), mul(fr.u, v)));
}
export function centerDir(p: Projector3D): V3 {
  const fr = frame(p.yawDeg, p.pitchDeg), R = imageRectUnit(p);
  return add(add(fr.f, mul(fr.r, (R.uMin + R.uMax) / 2)), mul(fr.u, (R.vMin + R.vMax) / 2));
}

/** Nokta → görüntü koordinatı (birim uzaklık); projektörün arkasındaysa null. */
export function projectPoint(p: Projector3D, q: V3): { u: number; v: number; z: number } | null {
  const fr = frame(p.yawDeg, p.pitchDeg), d = sub(q, p.pos), z = dot(d, fr.f);
  if (z <= EPS) return null;
  return { u: dot(d, fr.r) / z, v: dot(d, fr.u) / z, z };
}

/* ---------- Yüzeyler ---------- */
export type Surface =
  | { kind: 'plane'; id: string; label: string; center: V3; yawDeg: number; pitchDeg: number; width: number; height: number }
  | { kind: 'cylinder'; id: string; label: string; center: V3; radius: number; height: number; startDeg: number; endDeg: number }
  | { kind: 'dome'; id: string; label: string; center: V3; radius: number };

export interface Aabb { id: string; label: string; min: V3; max: V3 }

export function surfaceArea(s: Surface): number {
  if (s.kind === 'plane') return s.width * s.height;
  if (s.kind === 'cylinder') return s.radius * rad(s.endDeg - s.startDeg) * s.height;
  return 2 * Math.PI * s.radius * s.radius;
}

export interface Sample { p: V3; n: V3 }   // n: izleyiciye (iç) bakan birim normal

export function surfaceSamples(s: Surface, nu: number, nv: number): Sample[] {
  const out: Sample[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const fu = (i + 0.5) / nu, fv = (j + 0.5) / nv;
    if (s.kind === 'plane') {
      const fr = frame(s.yawDeg, s.pitchDeg);
      out.push({ p: add(add(s.center, mul(fr.r, (fu - 0.5) * s.width)), mul(fr.u, (fv - 0.5) * s.height)), n: fr.f });
    } else if (s.kind === 'cylinder') {
      const a = rad(s.startDeg + fu * (s.endDeg - s.startDeg));
      out.push({ p: [s.center[0] + s.radius * Math.sin(a), s.center[1] + fv * s.height, s.center[2] + s.radius * Math.cos(a)], n: [-Math.sin(a), 0, -Math.cos(a)] });
    } else {
      // eşit alanlı örnekleme (Arşimet): yükseklik oranı fv düzgün
      const ph = 2 * Math.PI * fu, h = Math.sqrt(1 - fv * fv);
      const p: V3 = [s.center[0] + s.radius * h * Math.sin(ph), s.center[1] + s.radius * fv, s.center[2] + s.radius * h * Math.cos(ph)];
      out.push({ p, n: norm(sub(s.center, p)) });
    }
  }
  return out;
}

export interface Hit { t: number; p: V3; surfaceId: string }

/** Işın–yüzey kesişimi (en yakın pozitif t). d normalize edilmek zorunda değildir. */
export function rayHit(o: V3, d: V3, s: Surface): Hit | null {
  if (s.kind === 'plane') {
    const fr = frame(s.yawDeg, s.pitchDeg), dn = dot(d, fr.f);
    if (Math.abs(dn) < EPS) return null;
    const t = dot(sub(s.center, o), fr.f) / dn;
    if (t <= EPS) return null;
    const p = add(o, mul(d, t)), l = sub(p, s.center);
    if (Math.abs(dot(l, fr.r)) > s.width / 2 + 1e-9 || Math.abs(dot(l, fr.u)) > s.height / 2 + 1e-9) return null;
    return { t, p, surfaceId: s.id };
  }
  if (s.kind === 'cylinder') {
    const ox = o[0] - s.center[0], oz = o[2] - s.center[2];
    const A = d[0] * d[0] + d[2] * d[2], B = 2 * (ox * d[0] + oz * d[2]), C = ox * ox + oz * oz - s.radius * s.radius;
    if (A < EPS) return null;
    const D = B * B - 4 * A * C; if (D < 0) return null;
    const sq = Math.sqrt(D);
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      if (t <= EPS) continue;
      const p = add(o, mul(d, t)), y = p[1] - s.center[1];
      if (y < -1e-9 || y > s.height + 1e-9) continue;
      let az = Math.atan2(p[0] - s.center[0], p[2] - s.center[2]) * 180 / Math.PI;
      const span = s.endDeg - s.startDeg;
      let rel = ((az - s.startDeg) % 360 + 360) % 360;
      if (rel <= span + 1e-9) return { t, p, surfaceId: s.id };
    }
    return null;
  }
  const oc = sub(o, s.center);
  const A = dot(d, d), B = 2 * dot(oc, d), C = dot(oc, oc) - s.radius * s.radius;
  const D = B * B - 4 * A * C; if (D < 0) return null;
  const sq = Math.sqrt(D);
  for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (t <= EPS) continue;
    const p = add(o, mul(d, t));
    if (p[1] >= s.center[1] - 1e-9) return { t, p, surfaceId: s.id };
  }
  return null;
}

/** o→q doğru parçası bir AABB'yi (t∈(ε,1−ε)) kesiyor mu? */
export function segmentBlocked(o: V3, q: V3, b: Aabb): boolean {
  const d = sub(q, o);
  let t0 = 1e-6, t1 = 1 - 1e-6;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < EPS) { if (o[k] < b.min[k] || o[k] > b.max[k]) return false; continue; }
    let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return false;
  }
  return true;
}

export interface Coverage {
  samples: number; lit: number; occluded: number; backfacing: number; outside: number;
  coverage: number;            // lit/samples
  litAreaM2: number; surfaceAreaM2: number;
  avgIncidenceCos: number;     // aydınlatılan örneklerde ortalama cos(θ)
  warnings: string[];
}

export function coverage(p: Projector3D, s: Surface, obstacles: Aabb[], nu = 120, nv = 80): Coverage {
  const R = imageRectUnit(p), smp = surfaceSamples(s, nu, nv);
  let lit = 0, occ = 0, back = 0, outside = 0, cosSum = 0;
  for (const { p: q, n } of smp) {
    const pr = projectPoint(p, q);
    if (!pr || pr.u < R.uMin || pr.u > R.uMax || pr.v < R.vMin || pr.v > R.vMax) { outside++; continue; }
    const dir = norm(sub(q, p.pos)), c = -dot(n, dir);
    if (c <= 1e-6) { back++; continue; }
    if (obstacles.some(b => segmentBlocked(p.pos, q, b))) { occ++; continue; }
    lit++; cosSum += c;
  }
  const area = surfaceArea(s), warnings: string[] = [];
  if (back > 0 && lit === 0 && outside < smp.length) warnings.push('Işık yüzeyin arka tarafına düşüyor (yüzey normali projektöre dönük değil).');
  if (occ > 0) warnings.push(`Yüzeyin %${(100 * occ / smp.length).toFixed(1)}'i engel nedeniyle gölgede.`);
  return {
    samples: smp.length, lit, occluded: occ, backfacing: back, outside,
    coverage: lit / smp.length, litAreaM2: area * lit / smp.length, surfaceAreaM2: area,
    avgIncidenceCos: lit ? cosSum / lit : 0, warnings,
  };
}
