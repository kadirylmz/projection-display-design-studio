import { assertPositive } from './units';

export interface Aspect { w: number; h: number }

export const PRESET_ASPECTS: Record<string, Aspect> = {
  '16:9': { w: 16, h: 9 },
  '16:10': { w: 16, h: 10 },
  '4:3': { w: 4, h: 3 },
  '17:9': { w: 17, h: 9 },
  '21:9': { w: 21, h: 9 },
  '1:1': { w: 1, h: 1 },
};

export function aspectRatio(a: Aspect): number {
  assertPositive('aspect.w', a.w);
  assertPositive('aspect.h', a.h);
  return a.w / a.h;
}

/** Genişlik → yükseklik: H = W · h/w */
export function heightFromWidth(width: number, a: Aspect): number {
  assertPositive('width', width);
  return width / aspectRatio(a);
}
/** Yükseklik → genişlik: W = H · w/h */
export function widthFromHeight(height: number, a: Aspect): number {
  assertPositive('height', height);
  return height * aspectRatio(a);
}
/** Diagonal → genişlik: W = d · w / √(w²+h²) */
export function widthFromDiagonal(diag: number, a: Aspect): number {
  assertPositive('diagonal', diag);
  return (diag * a.w) / Math.hypot(a.w, a.h);
}
export function heightFromDiagonal(diag: number, a: Aspect): number {
  assertPositive('diagonal', diag);
  return (diag * a.h) / Math.hypot(a.w, a.h);
}
export function diagonal(width: number, height: number): number {
  assertPositive('width', width);
  assertPositive('height', height);
  return Math.hypot(width, height);
}
