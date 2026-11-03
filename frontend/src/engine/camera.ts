/**
 * Kamera görüş alanı (ince-mercek/rektilineer model; distorsiyon yok).
 *   HFOV = 2·atan(s_w / (2f))        VFOV = 2·atan(s_h / (2f))
 *   Görünür genişlik @ d = 2·d·tan(HFOV/2) = s_w·d/f     (d: nesne uzaklığı, d ≫ f için)
 * Odaklama mesafesi yakınsa etkin odak uzaklığı değişir (breathing); bu model onu içermez.
 */
import { assertPositive } from './units';
import { V3, frame } from './room3d';

export interface CameraSpec { sensorW: number; sensorH: number; focal: number }   // hepsi mm

export function fov(c: CameraSpec) {
  assertPositive('sensorW', c.sensorW); assertPositive('sensorH', c.sensorH); assertPositive('focal', c.focal);
  const h = 2 * Math.atan(c.sensorW / (2 * c.focal)), v = 2 * Math.atan(c.sensorH / (2 * c.focal));
  return { hDeg: h * 180 / Math.PI, vDeg: v * 180 / Math.PI, hRad: h, vRad: v, dDeg: 2 * Math.atan(Math.hypot(c.sensorW, c.sensorH) / (2 * c.focal)) * 180 / Math.PI };
}

export function visibleSize(c: CameraSpec, distance: number) {
  assertPositive('distance', distance);
  const f = fov(c);
  return { width: 2 * distance * Math.tan(f.hRad / 2), height: 2 * distance * Math.tan(f.vRad / 2) };
}

/** Konu boyutunu çerçeveye sığdırmak için gereken odak uzaklığı (mm). */
export function focalForFraming(sensorMm: number, distance: number, visible: number): number {
  assertPositive('sensor', sensorMm); assertPositive('distance', distance); assertPositive('visible', visible);
  return sensorMm * distance / visible;
}

export function framing(c: CameraSpec, distance: number, subjectW: number, subjectH: number) {
  assertPositive('subjectW', subjectW); assertPositive('subjectH', subjectH);
  const v = visibleSize(c, distance);
  return { visible: v, fillW: subjectW / v.width, fillH: subjectH / v.height, fits: subjectW <= v.width && subjectH <= v.height };
}

/** Kamera piramidi köşeleri (yön vektörleri, birim uzaklık) ve verilen derinlikteki kesit köşeleri. */
export function frustumCorners(pos: V3, yawDeg: number, pitchDeg: number, c: CameraSpec, depth: number): V3[] {
  assertPositive('depth', depth);
  const fr = frame(yawDeg, pitchDeg), f = fov(c);
  const hw = depth * Math.tan(f.hRad / 2), hh = depth * Math.tan(f.vRad / 2);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map(([a, b]) => [
    pos[0] + fr.f[0] * depth + fr.r[0] * hw * a + fr.u[0] * hh * b,
    pos[1] + fr.f[1] * depth + fr.r[1] * hw * a + fr.u[1] * hh * b,
    pos[2] + fr.f[2] * depth + fr.r[2] * hw * a + fr.u[2] * hh * b,
  ]);
}
