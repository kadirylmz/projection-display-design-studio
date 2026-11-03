/**
 * LCD/video duvarı. Birim: mm.
 *   Aktif alan (a_w × a_h) panelin görünür görüntü alanıdır (diagonaldan veya girişten).
 *   b = bir kenardaki çerçeve (bezel) genişliği; g = paneller arası montaj boşluğu.
 *   Görünür dikiş (seam) = 2b + g.
 *   Dış panel boyutu = a + 2b.
 *   Duvar dış genişliği = cols·(a_w+2b) + (cols−1)·g
 *   Görünür görüntü açıklığı = cols·a_w + (cols−1)·seam
 *   Çerçeve telafili kanvas (px) = cols·nativeW + (cols−1)·round(seam / pikselAralığı)
 */
import { Aspect, heightFromDiagonal, widthFromDiagonal } from './aspect';
import { assertPositive } from './units';

export interface LcdInput {
  activeWmm: number; activeHmm: number;
  bezelMm: number;               // her kenar
  gapMm?: number;                // paneller arası ek boşluk
  nativeW: number; nativeH: number;
  cols: number; rows: number;
}

export function activeAreaFromDiagonal(diagMm: number, aspect: Aspect) {
  return { activeWmm: widthFromDiagonal(diagMm, aspect), activeHmm: heightFromDiagonal(diagMm, aspect) };
}

export interface LcdResult {
  outerWmm: number; outerHmm: number;
  visibleWmm: number; visibleHmm: number;
  seamMm: number;
  resX: number; resY: number; totalPixels: number;
  areaM2: number; aspect: number;
  compensatedCanvasW: number; compensatedCanvasH: number;
  panelOuterWmm: number; panelOuterHmm: number;
  count: number;
}

export function lcdWall(i: LcdInput): LcdResult {
  assertPositive('activeW', i.activeWmm); assertPositive('activeH', i.activeHmm);
  if (i.bezelMm < 0 || (i.gapMm ?? 0) < 0) throw new RangeError('Çerçeve/boşluk negatif olamaz');
  for (const [n, v] of [['cols', i.cols], ['rows', i.rows], ['nativeW', i.nativeW], ['nativeH', i.nativeH]] as const)
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${n} pozitif tam sayı olmalı`);
  const g = i.gapMm ?? 0, b = i.bezelMm, seam = 2 * b + g;
  const pw = i.activeWmm + 2 * b, ph = i.activeHmm + 2 * b;
  const outerW = i.cols * pw + (i.cols - 1) * g, outerH = i.rows * ph + (i.rows - 1) * g;
  const visW = i.cols * i.activeWmm + (i.cols - 1) * seam, visH = i.rows * i.activeHmm + (i.rows - 1) * seam;
  const pitchX = i.activeWmm / i.nativeW, pitchY = i.activeHmm / i.nativeH;
  return {
    outerWmm: outerW, outerHmm: outerH, visibleWmm: visW, visibleHmm: visH, seamMm: seam,
    resX: i.cols * i.nativeW, resY: i.rows * i.nativeH, totalPixels: i.cols * i.rows * i.nativeW * i.nativeH,
    areaM2: (outerW / 1000) * (outerH / 1000), aspect: outerW / outerH,
    compensatedCanvasW: i.cols * i.nativeW + (i.cols - 1) * Math.round(seam / pitchX),
    compensatedCanvasH: i.rows * i.nativeH + (i.rows - 1) * Math.round(seam / pitchY),
    panelOuterWmm: pw, panelOuterHmm: ph, count: i.cols * i.rows,
  };
}
