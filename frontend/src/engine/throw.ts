import { Aspect, diagonal, heightFromWidth } from './aspect';
import { assertPositive } from './units';

/**
 * Projeksiyon geometrisi (SI: metre).
 *   TR = D / W      D = W · TR      W = D / TR
 * D = LENS ön yüzünden (optik mesafe referansı) yüzeye mesafe.
 * Şasi–duvar mesafesi D'den farklıdır: lens ofseti ile düzeltilir (bkz. chassisToWall).
 */
export const throwRatio = (distance: number, width: number): number => {
  assertPositive('distance', distance);
  assertPositive('width', width);
  return distance / width;
};
export const distanceFromThrow = (width: number, tr: number): number => {
  assertPositive('width', width);
  assertPositive('throwRatio', tr);
  return width * tr;
};
export const widthFromThrow = (distance: number, tr: number): number => {
  assertPositive('distance', distance);
  assertPositive('throwRatio', tr);
  return distance / tr;
};

/**
 * Lens ön yüzü şasi arka referansından `lensFrontFromChassisFront` kadar öndeyse
 * (şasi ön yüzüne göre; öne taşıyorsa pozitif, içeride ise negatif),
 * şasi ön yüzü duvara D + lensFront kadar uzaktır. Şasi ARKA yüzü için chassisDepth eklenir.
 */
export function chassisToWall(
  lensToSurface: number,
  lensFrontProtrusion: number,
): { chassisFront: number } {
  return { chassisFront: lensToSurface + lensFrontProtrusion };
}

export interface ThrowRange { min: number; max: number }

export interface ZoomAnalysis {
  fixed: boolean;
  /** Bu genişlik için gereken throw ratio'nun kendisi */
  distanceMin: number;
  distanceMax: number;
}

/** Verilen görüntü genişliği için zoom lensin ulaşabildiği mesafe aralığı. */
export function distanceRange(width: number, tr: ThrowRange): ZoomAnalysis {
  assertPositive('width', width);
  validateRange(tr);
  return { fixed: tr.min === tr.max, distanceMin: width * tr.min, distanceMax: width * tr.max };
}

/** Verilen mesafe için ulaşılabilir görüntü genişliği aralığı. */
export function widthRange(distance: number, tr: ThrowRange): { min: number; max: number } {
  assertPositive('distance', distance);
  validateRange(tr);
  return { min: distance / tr.max, max: distance / tr.min };
}

function validateRange(tr: ThrowRange) {
  assertPositive('throw.min', tr.min);
  assertPositive('throw.max', tr.max);
  if (tr.min > tr.max) throw new RangeError('throw.min, throw.max değerinden büyük olamaz');
}

export type LensShiftReference = 'full-dimension' | 'half-dimension';

/**
 * Lens shift: görüntü merkezinin optik eksenden ofseti.
 * Üreticiler yüzdeyi farklı referansla verir (tüm yükseklik vs. yarım yükseklik);
 * bu nedenle referans AÇIKÇA belirtilmelidir. Dahili birim: görüntü boyutuna oranla (full-dimension).
 */
export function shiftToOffset(shift: number, imageDim: number, ref: LensShiftReference): number {
  assertPositive('imageDim', imageDim);
  return shift * imageDim * (ref === 'half-dimension' ? 0.5 : 1);
}
export function offsetToShift(offset: number, imageDim: number, ref: LensShiftReference): number {
  assertPositive('imageDim', imageDim);
  return offset / (imageDim * (ref === 'half-dimension' ? 0.5 : 1));
}

export interface ShiftLimits { min: number; max: number; reference: LensShiftReference }

export interface ProjectionInput {
  /** Hedef: ya genişlik+oran ya da (mesafe) */
  imageWidth?: number;
  distance?: number;
  throwRatio?: number;
  aspect: Aspect;
  throwRange?: ThrowRange;
  /** Lens ön yüzünün şasi ön yüzünden öne çıkma miktarı (m) */
  lensFrontProtrusion?: number;
  /** İstenen dikey/yatay görüntü merkezi ofseti (m) — optik eksene göre */
  verticalOffset?: number;
  horizontalOffset?: number;
  vShift?: ShiftLimits;
  hShift?: ShiftLimits;
}

export interface ProjectionResult {
  imageWidth: number;
  imageHeight: number;
  diagonal: number;
  throwRatio: number;
  lensToSurface: number;
  chassisFrontToSurface: number;
  distanceMin?: number;
  distanceMax?: number;
  /** 0 = en geniş (min TR), 1 = en tele (max TR) */
  zoomPosition?: number;
  /** Görüntü sınırları, optik eksen orijin (x sağ, y yukarı) */
  bounds: { left: number; right: number; top: number; bottom: number };
  achievable: boolean;
  warnings: string[];
  approximations: string[];
}

export function solveProjection(inp: ProjectionInput): ProjectionResult {
  const warnings: string[] = [];
  let W: number, D: number, TR: number;

  if (inp.imageWidth !== undefined && inp.distance !== undefined) {
    W = inp.imageWidth; D = inp.distance; TR = throwRatio(D, W);       // mod C
  } else if (inp.imageWidth !== undefined && inp.throwRatio !== undefined) {
    W = inp.imageWidth; TR = inp.throwRatio; D = distanceFromThrow(W, TR); // mod B
  } else if (inp.distance !== undefined && inp.throwRatio !== undefined) {
    D = inp.distance; TR = inp.throwRatio; W = widthFromThrow(D, TR);    // mod A
  } else {
    throw new Error('Yetersiz girdi: genişlik, mesafe ve throw ratio değerlerinden en az ikisi gerekli');
  }

  const H = heightFromWidth(W, inp.aspect);
  let achievable = true;
  let zoomPosition: number | undefined;
  let distanceMin: number | undefined;
  let distanceMax: number | undefined;

  if (inp.throwRange) {
    const z = distanceRange(W, inp.throwRange);
    distanceMin = z.distanceMin; distanceMax = z.distanceMax;
    const eps = 1e-9;
    if (TR < inp.throwRange.min - eps || TR > inp.throwRange.max + eps) {
      achievable = false;
      warnings.push(
        `Gereken throw ratio ${TR.toFixed(3)}, lens aralığı ${inp.throwRange.min}–${inp.throwRange.max} dışında.`);
    }
    zoomPosition = inp.throwRange.max === inp.throwRange.min
      ? undefined : (TR - inp.throwRange.min) / (inp.throwRange.max - inp.throwRange.min);
  }

  const vOff = inp.verticalOffset ?? 0;
  const hOff = inp.horizontalOffset ?? 0;
  checkShift('Dikey', vOff, H, inp.vShift, warnings) || (achievable = false);
  checkShift('Yatay', hOff, W, inp.hShift, warnings) || (achievable = false);

  const protrusion = inp.lensFrontProtrusion ?? 0;
  return {
    imageWidth: W, imageHeight: H, diagonal: diagonal(W, H), throwRatio: TR,
    lensToSurface: D, chassisFrontToSurface: D + protrusion,
    distanceMin, distanceMax, zoomPosition,
    bounds: { left: hOff - W / 2, right: hOff + W / 2, top: vOff + H / 2, bottom: vOff - H / 2 },
    achievable, warnings,
    approximations: ['İdeal (distorsiyonsuz, ince lens) model; üretici toleransları dahil değildir.'],
  };
}

function checkShift(label: string, offset: number, dim: number, lim: ShiftLimits | undefined, warnings: string[]): boolean {
  if (!lim) {
    if (offset !== 0) warnings.push(`${label} shift talep edildi ancak lens shift limiti tanımlı değil; doğrulanamadı.`);
    return true;
  }
  const s = offsetToShift(offset, dim, lim.reference);
  if (s < lim.min - 1e-9 || s > lim.max + 1e-9) {
    warnings.push(`${label} shift ${s.toFixed(3)} (${lim.reference}), limit ${lim.min}…${lim.max} dışında.`);
    return false;
  }
  return true;
}
