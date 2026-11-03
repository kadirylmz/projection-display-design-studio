/**
 * Fotometrik hesaplar (SI). Varsayımlar:
 *  - Lux (aydınlatma, lm/m²), lümen (ışık akısı), nit=cd/m² (parlaklık) ve foot-lambert AYRI büyüklüklerdir.
 *  - Yüzey Lambertian (ideal mat) kabul edilir; luminance L = E · gain / π  [cd/m²].
 *    Gain, mükemmel difüzöre (gain 1.0) göre bağıl ölçektir; gain ≠ 1 ekranlar için bu yalnızca eksen-üstü (on-axis) yaklaşımdır.
 *  - Ortam ışığı, ekran yüzeyindeki aydınlatma olarak verilir ve aynı yansıtma (gain/π) ile luminance'a çevrilir.
 *  - Yüzey eğimi: aydınlatma cos(θ) ile ölçeklenir (θ: yüzey normali ile ışık yönü arası).
 *  - Üretici ANSI lümen değeri ölçüm koşullarında (ortalama 9 nokta) verilir; lamba/lazer ömrü ve sıcaklık kayıpları dahil değildir.
 *  1 fL = 3.426259 cd/m²,  1 fc = 10.7639 lux (tanım gereği).
 */
import { assertPositive } from './units';

export const NITS_PER_FL = 3.4262590996; // 1 fL = (1/π) cd/ft² = 3.4262591 cd/m²
export const LUX_PER_FC = 10.763910417;

export const nitsToFL = (n: number) => n / NITS_PER_FL;
export const flToNits = (f: number) => f * NITS_PER_FL;
export const luxToFc = (l: number) => l / LUX_PER_FC;

export interface LuxInput {
  ansiLumens: number[];          // her projektör için (lm)
  brightnessPct?: number;        // gerçek parlaklık yüzdesi 0–100 (varsayılan 100)
  width: number;                 // m — toplam görüntü genişliği
  height: number;                // m
  gain?: number;                 // varsayılan 1.0
  ambientLux?: number;           // ekran yüzeyindeki ortam aydınlatması
  overlapFraction?: number;      // 0..<1, komşu projektörler arası yatay örtüşme (genişliğin kesri)
  surfaceAngleDeg?: number;      // ışık yönü ile yüzey normali arası açı (0 = dik)
}

export interface LuxResult {
  totalLumens: number;
  perProjectorLumens: number[];
  area: number;
  lumensPerM2: number;
  illuminanceLux: number;
  illuminanceFc: number;
  luminanceNits: number;
  luminanceFL: number;
  ambientLuminanceNits: number;
  contrastRatioWithAmbient?: number;
  assumptions: string[];
}

export function computeLux(inp: LuxInput): LuxResult {
  assertPositive('width', inp.width);
  assertPositive('height', inp.height);
  if (!inp.ansiLumens.length) throw new RangeError('En az bir projektör gerekli');
  inp.ansiLumens.forEach((l, i) => assertPositive(`ansiLumens[${i}]`, l));
  const pct = inp.brightnessPct ?? 100;
  if (pct <= 0 || pct > 100) throw new RangeError('Parlaklık yüzdesi (0,100] aralığında olmalı');
  const gain = inp.gain ?? 1;
  assertPositive('gain', gain);
  const amb = inp.ambientLux ?? 0;
  if (amb < 0) throw new RangeError('Ortam aydınlatması negatif olamaz');
  const ang = inp.surfaceAngleDeg ?? 0;
  if (ang < 0 || ang >= 90) throw new RangeError('Yüzey açısı [0,90) derece olmalı');

  const per = inp.ansiLumens.map(l => l * pct / 100);
  const total = per.reduce((a, b) => a + b, 0);
  const area = inp.width * inp.height;
  const lumensPerM2 = total / area;
  const cos = Math.cos(ang * Math.PI / 180);
  const E = lumensPerM2 * cos;
  const L = E * gain / Math.PI;
  const La = amb * gain / Math.PI;
  return {
    totalLumens: total, perProjectorLumens: per, area, lumensPerM2,
    illuminanceLux: E, illuminanceFc: luxToFc(E),
    luminanceNits: L, luminanceFL: nitsToFL(L),
    ambientLuminanceNits: La,
    contrastRatioWithAmbient: La > 0 ? (L + La) / La : undefined,
    assumptions: [
      'Lambertian yüzey: L = E·gain/π',
      'Tüm akı görüntü alanına düşer (taşma/maskeleme kaybı yok)',
      'Düzgün (uniform) dağılım; ortalama değerdir',
      'ANSI lümen üretici beyanıdır, yaşlanma dahil değil',
    ],
  };
}

export interface HeatmapInput {
  projectors: number;
  lumensEach: number;            // lm (yüzde uygulanmış)
  width: number; height: number; // toplam kanvas (m)
  overlapFraction: number;       // her komşu çifti için, tek projektör genişliğinin kesri
  blend: boolean;                // ideal lineer kenar harmanlama
  cornerUniformity: number;      // (0,1] köşe/merkez oranı — ÜRETİCİ spesifikasyonu veya ölçüm
  cols: number; rows: number;
}

/** Projektör genişliği w_p: n·w_p − (n−1)·o·w_p = W  */
export function projectorWidth(totalW: number, n: number, overlap: number): number {
  assertPositive('totalW', totalW);
  if (n < 1 || !Number.isInteger(n)) throw new RangeError('Projektör sayısı pozitif tam sayı olmalı');
  if (overlap < 0 || overlap >= 1) throw new RangeError('Örtüşme [0,1) olmalı');
  return totalW / (n - (n - 1) * overlap);
}

/**
 * Yüzey aydınlatma ısı haritası (lux). Model: her projektör kendi dikdörtgeninde
 * ortalama E_p = Φ/(w_p·H) üretir; merkezden köşeye KUADRATİK düşüşle köşe/merkez oranı
 * `cornerUniformity`'ye ulaşır (projektör ortalaması E_p olacak şekilde normalize edilir).
 * Örtüşmede bloklar toplanır; `blend` açıksa kenarlar lineer rampa ile ağırlıklandırılır (toplam = 1).
 * Bu bir YAKLAŞIK modeldir; gerçek ölçümün yerine geçmez.
 */
export function heatmap(h: HeatmapInput): { data: Float64Array; min: number; max: number; avg: number } {
  const wp = projectorWidth(h.width, h.projectors, h.overlapFraction);
  const step = wp * (1 - h.overlapFraction);
  const data = new Float64Array(h.cols * h.rows);
  const u = h.cornerUniformity;
  if (u <= 0 || u > 1) throw new RangeError('Köşe düzgünlüğü (0,1] olmalı');
  // Normalizasyon: düşüş f(r)=1-(1-u)r², r∈[0,1] (köşe=1). Dikdörtgen üzerinde ortalama f = 1-(1-u)(a²+b²)/3 ... r²=(x²+y²)/2 → ort r² = 1/3
  const meanF = 1 - (1 - u) / 3;
  const Ep = h.lumensEach / (wp * h.height);
  let min = Infinity, max = -Infinity, sum = 0;
  const ov = h.overlapFraction * wp;
  for (let j = 0; j < h.rows; j++) {
    for (let i = 0; i < h.cols; i++) {
      const X = (i + 0.5) / h.cols * h.width, Y = (j + 0.5) / h.rows;
      let e = 0;
      for (let p = 0; p < h.projectors; p++) {
        const x0 = p * step, lx = X - x0;
        if (lx < 0 || lx > wp) continue;
        const nx = lx / wp * 2 - 1, ny = Y * 2 - 1;
        const f = (1 - (1 - u) * (nx * nx + ny * ny) / 2) / meanF;
        let wgt = 1;
        if (h.blend && ov > 0) {
          if (p > 0 && lx < ov) wgt = Math.min(wgt, lx / ov);
          if (p < h.projectors - 1 && lx > wp - ov) wgt = Math.min(wgt, (wp - lx) / ov);
        }
        e += Ep * f * wgt;
      }
      data[j * h.cols + i] = e;
      if (e < min) min = e;
      if (e > max) max = e;
      sum += e;
    }
  }
  return { data, min, max, avg: sum / data.length };
}
