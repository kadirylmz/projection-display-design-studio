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

export type LumenStandard = 'ansi' | 'iso' | 'center';

export interface LuxInput {
  ansiLumens: number[];          // her projektör için (lm)
  brightnessPct?: number;        // gerçek parlaklık yüzdesi 0–100 (varsayılan 100)
  width: number;                 // m — toplam görüntü genişliği
  height: number;                // m
  gain?: number;                 // varsayılan 1.0
  ambientLux?: number;           // ekran yüzeyindeki ortam aydınlatması
  overlapFraction?: number;      // 0..<1, komşu projektörler arası yatay örtüşme (genişliğin kesri)
  surfaceAngleDeg?: number;      // ışık yönü ile yüzey normali arası açı (0 = dik)
  lumenStandard?: LumenStandard; // 'ansi' (1.0), 'iso' (0.95), 'center' (0.82)
  opticalLossPct?: number;       // 0..90 — lens/optik motor kaybı (%)
  colorCalibrationLossPct?: number; // 0..50 — D65/Rec.709 renk kalibrasyonu kaybı (%)
  agingLossPct?: number;         // 0..50 — lamba/lazer yaşlanma payı (%)
  reflectance?: number;          // (0, 1] — yüzey yansıtma katsayısı ρ (varsayılan 1.0)
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
  nominalTotalLumens: number;
  ansiEquivalentLumens: number;
  isoEquivalentLumens: number;
  theoreticalLux: number;
  totalOpticalEfficiencyPct: number;
  lostLumens: number;
  singleProjectorLux: number;
  reflectance: number;
  theoreticalLuminanceNits: number;
  realisticLuminanceNits: number;
  realisticLuminanceFL: number;
  realisticAmbientLuminanceNits: number;
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
  const lumenStandard: LumenStandard = inp.lumenStandard ?? 'ansi';
  const opticalLossPct = inp.opticalLossPct ?? 0;
  if (opticalLossPct < 0 || opticalLossPct > 90) throw new RangeError('Optik kayıp [0,90] aralığında olmalı');
  const colorLossPct = inp.colorCalibrationLossPct ?? 0;
  if (colorLossPct < 0 || colorLossPct > 50) throw new RangeError('Kalibrasyon kaybı [0,50] aralığında olmalı');
  const agingLossPct = inp.agingLossPct ?? 0;
  if (agingLossPct < 0 || agingLossPct > 50) throw new RangeError('Yaşlanma kaybı [0,50] aralığında olmalı');
  const reflectance = inp.reflectance ?? 1.0;
  if (reflectance <= 0 || reflectance > 1) throw new RangeError('Yüzey yansıtma katsayısı (0,1] aralığında olmalı');

  const standardFactor = lumenStandard === 'center' ? 0.82 : lumenStandard === 'iso' ? 0.95 : 1.0;
  const combinedEff = (pct / 100)
    * standardFactor
    * (1 - opticalLossPct / 100)
    * (1 - colorLossPct / 100)
    * (1 - agingLossPct / 100);

  const nominalPer = inp.ansiLumens.slice();
  const nominalTotalLumens = nominalPer.reduce((a, b) => a + b, 0);
  const ansiEquivalentLumens = nominalTotalLumens * (lumenStandard === 'center' ? 0.82 : lumenStandard === 'iso' ? 1.05 : 1.0);
  const isoEquivalentLumens = ansiEquivalentLumens * 0.95;

  const per = nominalPer.map(l => l * combinedEff);
  const total = per.reduce((a, b) => a + b, 0);
  const lostLumens = Math.max(0, nominalTotalLumens - total);
  const totalOpticalEfficiencyPct = +(combinedEff * 100).toFixed(2);

  const area = inp.width * inp.height;
  const cos = Math.cos(ang * Math.PI / 180);
  const theoreticalLux = (nominalTotalLumens / area) * cos;
  const lumensPerM2 = total / area;
  const E = lumensPerM2 * cos;
  const singleProjectorLux = E / per.length;

  const L = E * gain / Math.PI;
  const La = amb * gain / Math.PI;
  const theoreticalLuminanceNits = theoreticalLux * gain / Math.PI;
  const realisticLuminanceNits = E * gain * reflectance / Math.PI;
  const realisticAmbientLuminanceNits = amb * gain * reflectance / Math.PI;

  return {
    totalLumens: total,
    perProjectorLumens: per,
    area,
    lumensPerM2,
    illuminanceLux: E,
    illuminanceFc: luxToFc(E),
    luminanceNits: L,
    luminanceFL: nitsToFL(L),
    ambientLuminanceNits: La,
    contrastRatioWithAmbient: La > 0 ? (L + La) / La : undefined,
    nominalTotalLumens,
    ansiEquivalentLumens,
    isoEquivalentLumens,
    theoreticalLux,
    totalOpticalEfficiencyPct,
    lostLumens,
    singleProjectorLux,
    reflectance,
    theoreticalLuminanceNits,
    realisticLuminanceNits,
    realisticLuminanceFL: nitsToFL(realisticLuminanceNits),
    realisticAmbientLuminanceNits,
    assumptions: [
      'Lambertian yüzey: L = E·gain·ρ/π',
      'Tüm akı görüntü alanına düşer (taşma/maskeleme kaybı yok)',
      'Düzgün (uniform) dağılım; ortalama değerdir',
      `Standart: ${lumenStandard.toUpperCase()} · Net Optik Verim: %${totalOpticalEfficiencyPct} · Yüzey ρ: ${reflectance}`,
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

export interface ViewingQualityInput {
  widthM: number;
  heightM: number;
  resW: number;
  resH: number;
  viewingDistanceM?: number;
  offAxisAngleDeg?: number;
  screenGain?: number;
  reflectance?: number;
  avgLux: number;
  ambientLux?: number;
  nativeContrast?: number;
  uniformityU0?: number;     // 0..1 veya 0..100
  uniformityU1?: number;     // 0..1 veya 0..100
  projectorCount?: number;
  overlapPct?: number;
  colorCalibrated?: boolean;
}

export interface ViewingQualityResult {
  viewingDistanceM: number;
  minViewingDistM: number;
  optimalViewingDistMinM: number;
  optimalViewingDistMaxM: number;
  maxViewingDistM: number;
  distanceRatioToHeight: number;
  viewingDistanceStatus: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  diagonalFovDeg: number;
  offAxisAngleDeg: number;
  halfGainAngleDeg: number;
  offAxisLuminanceDropPct: number;
  fovCategory: string;
  resW: number;
  resH: number;
  ppd: number;
  ppdVertical: number;
  ppdCenterH: number;
  ppdCenterV: number;
  ppdEdgeH: number;
  ppdEdgeV: number;
  arcminPerPixel: number;
  arcminPerPixelH: number;
  arcminPerPixelV: number;
  acuityRatio: number;
  sharpnessScorePct: number;
  sharpnessLabel: string;
  mmPerPx: number;
  ppi: number;
  retinaThresholdMm: number;
  museumThresholdMm: number;
  minRetinaDistM: number;
  minSmoothDistM: number;
  pixelVisibilityIndex: number;
  pixelVisibilityLabel: string;
  nativeContrast: number;
  ambientContrastRatio: number;
  effectiveSystemContrast: number;
  whiteLevelNits: number;
  blackLevelNits: number;
  contrastStandardGrade: string;
  deltaE2000: number;
  deltaCCTKelvin: number;
  offAxisColorShiftDeltaE: number;
  colorUniformityPct: number;
  colorUniformityLabel: string;
  luminanceUniformityU0Pct: number;
  luminanceUniformityU1Pct: number;
  centerToCornerDropPct: number;
  blendZoneRipplePct: number;
  brightnessUniformityLabel: string;
  overallQualityScorePct: number;
  overallQualityGrade: string;
  overallRecommendation: string;
}

/**
 * 7 Adımlı İzleme ve Görüntü Kalitesi Analizi + Toplam Kalite Özeti hesaplar.
 * AVIXA/SMPTE izleme mesafesi, FOV, PPD keskinlik, piksel görünürlüğü,
 * ACR kontrast oranı, ΔE2000 renk uniformitesi ve parlaklık homojenliğini değerlendirir.
 */
export function computeViewingQualityAnalysis(inp: ViewingQualityInput): ViewingQualityResult {
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const RAD2DEG = 180 / Math.PI;

  const widthM = Math.max(0.1, Number.isFinite(inp.widthM) ? inp.widthM : 1);
  const heightM = Math.max(0.1, Number.isFinite(inp.heightM) ? inp.heightM : 1);
  const resW = Math.max(64, Math.round(Number.isFinite(inp.resW) ? inp.resW : 1920));
  const resH = Math.max(64, Math.round(Number.isFinite(inp.resH) ? inp.resH : 1080));

  const viewingDistanceM = r2(
    inp.viewingDistanceM !== undefined && Number.isFinite(inp.viewingDistanceM) && inp.viewingDistanceM > 0
      ? inp.viewingDistanceM
      : Math.max(1.5, heightM * 2.5)
  );
  const offAxisAngleDeg = r1(Math.max(0, Math.min(75, inp.offAxisAngleDeg ?? 0)));
  const screenGain = Math.max(0.3, Math.min(3.0, inp.screenGain ?? 1.0));
  const reflectance = Math.max(0.1, Math.min(1.0, inp.reflectance ?? 0.85));
  const avgLux = Math.max(0, Number.isFinite(inp.avgLux) ? inp.avgLux : 0);
  const ambientLux = Math.max(0, Number.isFinite(inp.ambientLux ?? 0) ? (inp.ambientLux ?? 0) : 0);
  const nativeContrast = Math.max(50, inp.nativeContrast ?? 2000);
  const pjCount = Math.max(1, Math.round(inp.projectorCount ?? 1));
  const overlapPct = Math.max(0, Math.min(50, inp.overlapPct ?? 0));
  const colorCalibrated = Boolean(inp.colorCalibrated);

  const rawU0 = inp.uniformityU0 ?? 78;
  const u0Pct = Math.max(5, Math.min(100, rawU0 <= 1 ? rawU0 * 100 : rawU0));
  const rawU1 = inp.uniformityU1 ?? Math.min(100, u0Pct * 1.1);
  const u1Pct = Math.max(5, Math.min(100, rawU1 <= 1 ? rawU1 * 100 : rawU1));

  // 1. İzleme Mesafesi
  const minViewingDistM = Math.max(0.8, r1(heightM * 1.5));
  const optimalViewingDistMinM = r1(heightM * 2.0);
  const optimalViewingDistMaxM = r1(heightM * 4.0);
  const maxViewingDistM = r1(heightM * 6.0);
  const distanceRatioToHeight = r2(viewingDistanceM / heightM);

  let viewingDistanceStatus = 'İdeal İzleme Bölgesi';
  if (viewingDistanceM < minViewingDistM) {
    viewingDistanceStatus = 'Çok Yakın (Aşırı Bakış Açısı)';
  } else if (viewingDistanceM < optimalViewingDistMinM) {
    viewingDistanceStatus = 'Yakın / Sürükleyici (Müze İçi)';
  } else if (viewingDistanceM > maxViewingDistM) {
    viewingDistanceStatus = 'Çok Uzak (Detay Kaybı)';
  } else if (viewingDistanceM > optimalViewingDistMaxM) {
    viewingDistanceStatus = 'Uzak (Büyük Metin / Grafik)';
  }

  // 2. Görüş Açısı (FOV) ve Eksen Dışı Kayıp
  const horizontalFovDeg = r1(2 * Math.atan(widthM / (2 * viewingDistanceM)) * RAD2DEG);
  const verticalFovDeg = r1(2 * Math.atan(heightM / (2 * viewingDistanceM)) * RAD2DEG);
  const diagM = Math.hypot(widthM, heightM);
  const diagonalFovDeg = r1(2 * Math.atan(diagM / (2 * viewingDistanceM)) * RAD2DEG);

  const halfGainAngleDeg = screenGain <= 1.0
    ? Math.round(Math.min(85, 65 + (1 - screenGain) * 20))
    : Math.max(18, Math.round(65 / Math.pow(screenGain, 0.85)));

  const thetaRad = (offAxisAngleDeg * Math.PI) / 180;
  const halfRad = (Math.max(10, Math.min(89, halfGainAngleDeg)) * Math.PI) / 180;
  const cosHalf = Math.max(0.01, Math.cos(halfRad));
  const gainPower = Math.log(0.5) / Math.log(cosHalf);
  const offAxisFactor = offAxisAngleDeg <= 0 ? 1 : Math.pow(Math.max(0, Math.cos(thetaRad)), gainPower);
  const offAxisLuminanceDropPct = r1((1 - offAxisFactor) * 100);

  let fovCategory = 'Standart Sunum (25°–40°)';
  if (horizontalFovDeg >= 70) {
    fovCategory = 'Panoramik / Sürükleyici (>70°)';
  } else if (horizontalFovDeg >= 40) {
    fovCategory = 'Sinematik İdeal (40°–70° SMPTE)';
  } else if (horizontalFovDeg < 25) {
    fovCategory = 'Dar Görüş Açısı (<25°)';
  }

  // 3. Görüntü Keskinliği (Yatay & Dikey Ortalama PPD + Merkez / Kenar PPD + Arcmin/px)
  const effectiveFovDeg = Math.max(0.5, horizontalFovDeg);
  const effectiveVFovDeg = Math.max(0.5, verticalFovDeg);
  const ppd = r1(resW / effectiveFovDeg);
  const ppdV = r1(resH / effectiveVFovDeg);
  const ppdCenterH = r1((resW / Math.max(0.1, widthM)) * viewingDistanceM * (Math.PI / 180));
  const ppdCenterV = r1((resH / Math.max(0.1, heightM)) * viewingDistanceM * (Math.PI / 180));
  const cosHalfH = Math.cos((effectiveFovDeg / 2) * (Math.PI / 180));
  const cosHalfV = Math.cos((effectiveVFovDeg / 2) * (Math.PI / 180));
  const ppdEdgeH = r1(ppdCenterH / Math.max(0.05, cosHalfH * cosHalfH));
  const ppdEdgeV = r1(ppdCenterV / Math.max(0.05, cosHalfV * cosHalfV));
  const minAxisPpd = Math.min(ppd, ppdV);
  const arcminPerPixelH = r2(60 / Math.max(0.1, ppd));
  const arcminPerPixelV = r2(60 / Math.max(0.1, ppdV));
  const arcminPerPixel = r2(60 / Math.max(0.1, minAxisPpd));
  const acuityRatio = r2(minAxisPpd / 60);
  const sharpnessScorePct = Math.round(Math.max(10, Math.min(100, (minAxisPpd / 60) * 100)));

  let sharpnessLabel = 'Düşük Keskinlik (<25 PPD)';
  if (ppd >= 60) {
    sharpnessLabel = 'Retina / Ultra Keskin (≥60 PPD)';
  } else if (ppd >= 40) {
    sharpnessLabel = 'Çok Keskin (40–60 PPD)';
  } else if (ppd >= 25) {
    sharpnessLabel = 'Yeterli Netlik (25–40 PPD)';
  }

  // 4. Piksel Görünürlüğü (Screen-Door / Retina Mesafe Eşiği)
  const mmPerPx = r2((widthM * 1000) / resW);
  const ppi = r1(25.4 / Math.max(0.01, mmPerPx));
  const minRetinaDistM = r2((mmPerPx / 1000) / 0.000290888);
  const minSmoothDistM = r2(minRetinaDistM * 0.67);
  const retinaThresholdMm = r2(viewingDistanceM * 0.290888);
  const museumThresholdMm = r2(viewingDistanceM * 0.43633);
  const pixelVisibilityIndex = r2(viewingDistanceM / Math.max(0.01, minRetinaDistM));

  let pixelVisibilityLabel = 'Belirgin Piksel Gridi (Screen-Door)';
  if (pixelVisibilityIndex >= 1.0) {
    pixelVisibilityLabel = 'Piksel Görünmez (Retina Eşiği)';
  } else if (pixelVisibilityIndex >= 0.67) {
    pixelVisibilityLabel = 'Pürüzsüz / Kabul Edilebilir';
  } else if (pixelVisibilityIndex >= 0.45) {
    pixelVisibilityLabel = 'Hafif Piksel Dokusu Fark Edilir';
  }

  // 5. Kontrast Oranı (Native vs Ortam Işıklı ACR)
  const projNits = (avgLux * reflectance * screenGain) / Math.PI;
  const ambientNits = (ambientLux * reflectance) / Math.PI;
  const whiteLevelNits = r1(projNits + ambientNits);
  const hasValidAcrInputs = ambientLux > 0 && projNits > 0;
  const blackRawNits = hasValidAcrInputs ? ambientNits : 0;
  const blackLevelNits = Math.round(blackRawNits * 100) / 100;
  const ambientContrastRatio = hasValidAcrInputs && blackRawNits > 0.0001
    ? r1((projNits + ambientNits) / blackRawNits)
    : 0;
  const effectiveSystemContrast = ambientContrastRatio > 0
    ? r1(ambientContrastRatio * Math.max(0.4, 1 - offAxisLuminanceDropPct / 150))
    : 0;

  let contrastStandardGrade = 'UNKNOWN (Ortam Işığı / Doğal Siyah Tanımsız)';
  if (ambientContrastRatio >= 80) {
    contrastStandardGrade = 'Sinema / Yüksek Tahmini Ortam Kontrastı (≥80:1)';
  } else if (ambientContrastRatio >= 15) {
    contrastStandardGrade = 'Video / Sunum Tahmini Ortam Kontrastı (15:1–80:1)';
  } else if (ambientContrastRatio >= 7) {
    contrastStandardGrade = 'Temel Bilgi Tahmini Ortam Kontrastı (7:1–15:1)';
  } else if (ambientContrastRatio > 0) {
    contrastStandardGrade = 'Yetersiz Tahmini Ortam Kontrastı (<7:1 Ortam Yıkaması)';
  }

  // 6. Renk Uniformitesi (ΔE2000 & ΔCCT)
  const baseDeltaE = colorCalibrated ? 1.2 : 2.4;
  const multiPenalty = pjCount > 1
    ? (colorCalibrated ? 0.6 : 1.9) * Math.min(2.5, Math.sqrt(pjCount - 1))
    : 0;
  const gainPenalty = Math.max(0, screenGain - 1.0) * 1.1;
  const lumPenalty = Math.max(0, 80 - u0Pct) * 0.04;
  const deltaE2000 = r2(baseDeltaE + multiPenalty + gainPenalty + lumPenalty);
  const offAxisColorShiftDeltaE = r2((offAxisAngleDeg / 30) * (0.8 + Math.max(0, screenGain - 0.8) * 1.4));
  const deltaCCTKelvin = Math.round(deltaE2000 * (colorCalibrated ? 75 : 115));
  const colorUniformityPct = Math.round(
    Math.max(20, Math.min(99, 100 - (deltaE2000 + offAxisColorShiftDeltaE * 0.5) * 4.5))
  );

  let colorUniformityLabel = 'Kalibrasyon Gerekli (ΔE > 5.5)';
  if (deltaE2000 <= 2.0) {
    colorUniformityLabel = 'Referans Kalibrasyon (ΔE ≤ 2.0)';
  } else if (deltaE2000 <= 3.5) {
    colorUniformityLabel = 'İyi Renk Uyumu (ΔE 2.0–3.5)';
  } else if (deltaE2000 <= 5.5) {
    colorUniformityLabel = 'Fark Edilebilir Sapma (ΔE 3.5–5.5)';
  }

  // 7. Parlaklık Uniformitesi (U0, U1, Kenar Düşüşü, Blend Dalgalanması)
  const luminanceUniformityU0Pct = r1(u0Pct);
  const luminanceUniformityU1Pct = r1(u1Pct);
  const centerToCornerDropPct = r1(
    Math.max(0, Math.min(85, 100 - luminanceUniformityU1Pct + Math.max(0, screenGain - 1.0) * 8))
  );
  const blendZoneRipplePct = pjCount > 1
    ? r1(Math.max(2.0, (colorCalibrated ? 3.5 : 8.0) + Math.max(0, 18 - overlapPct) * 0.35))
    : 0;

  let brightnessUniformityLabel = 'Düşük Homojenlik (U0 < %50)';
  if (luminanceUniformityU0Pct >= 80) {
    brightnessUniformityLabel = 'Çok Homojen (U0 ≥ %80)';
  } else if (luminanceUniformityU0Pct >= 65) {
    brightnessUniformityLabel = 'İyi Düzgünlük (U0 %65–80)';
  } else if (luminanceUniformityU0Pct >= 50) {
    brightnessUniformityLabel = 'Orta / Kenar Düşüşü Var (U0 %50–65)';
  }

  // 8. TOPLAM İZLEME & GÖRÜNTÜ KALİTESİ ÖZETİ
  const distScore = viewingDistanceM >= optimalViewingDistMinM && viewingDistanceM <= optimalViewingDistMaxM
    ? 100
    : viewingDistanceM >= minViewingDistM && viewingDistanceM <= maxViewingDistM
      ? 78
      : 45;
  const angleScore = Math.max(
    30,
    100 - offAxisLuminanceDropPct * 1.4 - (horizontalFovDeg < 20 || horizontalFovDeg > 110 ? 15 : 0)
  );
  const pixScore = pixelVisibilityIndex >= 1.0
    ? 100
    : pixelVisibilityIndex >= 0.67
      ? 85
      : Math.max(30, Math.round(pixelVisibilityIndex * 110));
  const contrastScore = ambientContrastRatio >= 80
    ? 100
    : ambientContrastRatio >= 30
      ? 85
      : ambientContrastRatio >= 15
        ? 70
        : ambientContrastRatio >= 7
          ? 50
          : 25;
  const brightScore = Math.max(
    25,
    Math.min(100, Math.round(luminanceUniformityU0Pct * 1.15 - blendZoneRipplePct * 0.6))
  );

  const overallQualityScorePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        contrastScore * 0.22 +
        sharpnessScorePct * 0.18 +
        brightScore * 0.15 +
        colorUniformityPct * 0.15 +
        pixScore * 0.12 +
        distScore * 0.10 +
        angleScore * 0.08
      )
    )
  );

  let overallQualityGrade = 'D (Yetersiz — Müdahale Gerekli)';
  if (minAxisPpd < 20) {
    overallQualityGrade = overallQualityScorePct >= 50
      ? 'C (Düşük Eksen PPD < 20 · İyileştirme Önerilir)'
      : 'D (Düşük Eksen PPD < 20 · Müdahale Gerekli)';
  } else if (overallQualityScorePct >= 88) {
    overallQualityGrade = 'A+ (Referans / Müze Sinema Sınıfı)';
  } else if (overallQualityScorePct >= 78) {
    overallQualityGrade = 'A (Yüksek Sergi Kalitesi)';
  } else if (overallQualityScorePct >= 65) {
    overallQualityGrade = 'B (İyi / Standart Sunum)';
  } else if (overallQualityScorePct >= 50) {
    overallQualityGrade = 'C (Kabul Edilebilir / İyileştirme Önerilir)';
  }

  let overallRecommendation = 'İzleme geometrisi, keskinlik ve fotometrik değerler dengeli.';
  if (ambientContrastRatio < 15) {
    overallRecommendation = 'Ortam ışığını azaltın veya daha yüksek lümen / ALR perde kullanın.';
  } else if (pixelVisibilityIndex < 0.67) {
    overallRecommendation = 'İzleme mesafesini artırın veya daha yüksek çözünürlüklü projektör tercih edin.';
  } else if (deltaE2000 > 3.5) {
    overallRecommendation = 'Çoklu projektör renk ve gamma kalibrasyonu uygulayın.';
  } else if (luminanceUniformityU0Pct < 65) {
    overallRecommendation = 'Blend bölgesini ve kenar parlaklık uniformitesini optimize edin.';
  } else if (offAxisLuminanceDropPct > 25) {
    overallRecommendation = 'Daha geniş görüş açılı (düşük gain) perde veya izleyici yerleşimi seçin.';
  }

  return {
    viewingDistanceM,
    minViewingDistM,
    optimalViewingDistMinM,
    optimalViewingDistMaxM,
    maxViewingDistM,
    distanceRatioToHeight,
    viewingDistanceStatus,
    horizontalFovDeg,
    verticalFovDeg,
    diagonalFovDeg,
    offAxisAngleDeg,
    halfGainAngleDeg,
    offAxisLuminanceDropPct,
    fovCategory,
    resW,
    resH,
    ppd,
    ppdVertical: ppdV,
    ppdCenterH,
    ppdCenterV,
    ppdEdgeH,
    ppdEdgeV,
    arcminPerPixel,
    arcminPerPixelH,
    arcminPerPixelV,
    acuityRatio,
    sharpnessScorePct,
    sharpnessLabel,
    mmPerPx,
    ppi,
    retinaThresholdMm,
    museumThresholdMm,
    minRetinaDistM,
    minSmoothDistM,
    pixelVisibilityIndex,
    pixelVisibilityLabel,
    nativeContrast,
    ambientContrastRatio,
    effectiveSystemContrast,
    whiteLevelNits,
    blackLevelNits,
    contrastStandardGrade,
    deltaE2000,
    deltaCCTKelvin,
    offAxisColorShiftDeltaE,
    colorUniformityPct,
    colorUniformityLabel,
    luminanceUniformityU0Pct,
    luminanceUniformityU1Pct,
    centerToCornerDropPct,
    blendZoneRipplePct,
    brightnessUniformityLabel,
    overallQualityScorePct,
    overallQualityGrade,
    overallRecommendation,
  };
}
