/**
 * LED duvar mühendisliği. Birimler: mm (piksel aralığı, kabin boyutu), W, kg, V.
 * Formüller:
 *   Kabin çözünürlüğü  = kabin boyutu / pitch            (tam sayı olmalı; değilse uyarı)
 *   Toplam çözünürlük  = sütun · kabinPxX × satır · kabinPxY
 *   Fiziksel boyut     = sütun · kabinW × satır · kabinH
 *   Akım (tek faz)     = P / (V · PF)      — PF kullanıcı girdisidir (varsayılan 1.0)
 *   Yedek kabin        = ceil(adet · yedek%/100)
 * Bakış mesafesi: pitch(mm) ≈ minimum mesafe(m) pratik kuralıdır; YAKLAŞIK değerdir, standart değildir.
 */
import { assertPositive } from './units';

export interface Cabinet {
  pitchMm: number;
  widthMm: number; heightMm: number;
  resX?: number; resY?: number;           // verilmezse width/pitch
  weightKg?: number;
  powerTypW?: number; powerMaxW?: number;
}

export interface Electrical { voltage: number; powerFactor: number }

export interface LedResult {
  cols: number; rows: number; qty: number;
  widthMm: number; heightMm: number; diagonalMm: number; aspect: number; areaM2: number;
  resX: number; resY: number; totalPixels: number;
  cabResX: number; cabResY: number;
  weightKg?: number; powerTypW?: number; powerMaxW?: number;
  currentTypA?: number; currentMaxA?: number;
  spareQty: number;
  minViewingDistanceM: number;
  warnings: string[];
  approximations: string[];
}

export function cabinetResolution(c: Cabinet): { x: number; y: number; warnings: string[] } {
  assertPositive('pitch', c.pitchMm); assertPositive('cabinet.width', c.widthMm); assertPositive('cabinet.height', c.heightMm);
  const warnings: string[] = [];
  const fx = c.widthMm / c.pitchMm, fy = c.heightMm / c.pitchMm;
  const x = c.resX ?? Math.round(fx), y = c.resY ?? Math.round(fy);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1) throw new RangeError('Kabin çözünürlüğü pozitif tam sayı olmalı');
  if (Math.abs(fx - x) > 0.01 || Math.abs(fy - y) > 0.01)
    warnings.push(`Kabin boyutu/pitch (${fx.toFixed(3)}×${fy.toFixed(3)}) girilen çözünürlükle (${x}×${y}) tutarsız; boyutlar veya çözünürlük hatalı olabilir.`);
  return { x, y, warnings };
}

export function ledFromCabinets(c: Cabinet, cols: number, rows: number, spareFraction = 0, el?: Electrical): LedResult {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) throw new RangeError('Sütun/satır pozitif tam sayı olmalı');
  if (spareFraction < 0) throw new RangeError('Yedek oranı negatif olamaz');
  const r = cabinetResolution(c);
  const qty = cols * rows;
  const W = cols * c.widthMm, H = rows * c.heightMm;
  const warnings = [...r.warnings];
  const out: LedResult = {
    cols, rows, qty, widthMm: W, heightMm: H, diagonalMm: Math.hypot(W, H), aspect: W / H,
    areaM2: (W / 1000) * (H / 1000),
    resX: cols * r.x, resY: rows * r.y, totalPixels: cols * r.x * rows * r.y,
    cabResX: r.x, cabResY: r.y,
    spareQty: Math.ceil(qty * spareFraction - 1e-9),
    minViewingDistanceM: c.pitchMm,
    warnings,
    approximations: ['Bakış mesafesi pratik kural (pitch mm ≈ metre); doğrulanmış bir standart değildir.'],
  };
  if (c.weightKg !== undefined) out.weightKg = qty * c.weightKg;
  if (c.powerTypW !== undefined) out.powerTypW = qty * c.powerTypW;
  if (c.powerMaxW !== undefined) out.powerMaxW = qty * c.powerMaxW;
  if (el) {
    assertPositive('voltage', el.voltage); assertPositive('powerFactor', el.powerFactor);
    if (el.powerFactor > 1) throw new RangeError('Güç faktörü ≤ 1 olmalı');
    if (out.powerTypW !== undefined) out.currentTypA = out.powerTypW / (el.voltage * el.powerFactor);
    if (out.powerMaxW !== undefined) out.currentMaxA = out.powerMaxW / (el.voltage * el.powerFactor);
    out.approximations.push('Akım tek fazlı: I = P/(V·PF); faz dağılımı ve kalkış akımı dahil değildir.');
  }
  return out;
}

export type Rounding = 'ceil' | 'floor' | 'nearest';
const rnd = (v: number, m: Rounding) => {
  // kayan nokta gürültüsünü (ör. 4.000000001) tamsayı sınırında temizle
  const c = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v;
  return m === 'ceil' ? Math.ceil(c) : m === 'floor' ? Math.floor(c) : Math.round(c);
};

/** Mod C: hedef ekran boyutundan kabin adedi. */
export function cabinetsForSize(c: Cabinet, targetWmm: number, targetHmm: number, mode: Rounding = 'ceil') {
  assertPositive('targetW', targetWmm); assertPositive('targetH', targetHmm);
  const cols = Math.max(1, rnd(targetWmm / c.widthMm, mode)), rows = Math.max(1, rnd(targetHmm / c.heightMm, mode));
  return { cols, rows, widthErrorMm: cols * c.widthMm - targetWmm, heightErrorMm: rows * c.heightMm - targetHmm };
}

/** Mod A: fiziksel boyut + pitch → çözünürlük. Yuvarlama hatası ≤ pitch/2. */
export function resolutionFromSize(pitchMm: number, widthMm: number, heightMm: number) {
  assertPositive('pitch', pitchMm); assertPositive('width', widthMm); assertPositive('height', heightMm);
  const fx = widthMm / pitchMm, fy = heightMm / pitchMm;
  const resX = Math.round(fx), resY = Math.round(fy);
  return {
    resX, resY, exactX: fx, exactY: fy,
    widthErrorMm: resX * pitchMm - widthMm, heightErrorMm: resY * pitchMm - heightMm,
    toleranceMm: pitchMm / 2,
  };
}

/** Mod B: hedef çözünürlük + pitch → fiziksel boyut. */
export function sizeFromResolution(pitchMm: number, resX: number, resY: number) {
  assertPositive('pitch', pitchMm); assertPositive('resX', resX); assertPositive('resY', resY);
  return { widthMm: resX * pitchMm, heightMm: resY * pitchMm };
}

export interface CabinetCell { col: number; row: number; xMm: number; yMm: number; wMm: number; hMm: number; pxX: number; pxY: number }

export function cabinetGrid(c: Cabinet, cols: number, rows: number): CabinetCell[] {
  const r = cabinetResolution(c);
  const cells: CabinetCell[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
    cells.push({ col: i, row: j, xMm: i * c.widthMm, yMm: j * c.heightMm, wMm: c.widthMm, hMm: c.heightMm, pxX: i * r.x, pxY: j * r.y });
  return cells;
}

/* ---------- Kavisli duvar (plan görünüşü, dairesel yay) ---------- */
export interface CurvedCell { col: number; cx: number; cz: number; angleDeg: number }

/** Komşu kabinler arası açı θ = 2·asin(w/(2R)); kabinler yay üzerine kiriş olarak yerleşir. */
export function jointAngleFromRadius(cabWidthMm: number, radiusMm: number): number {
  assertPositive('cabinetWidth', cabWidthMm); assertPositive('radius', radiusMm);
  if (radiusMm < cabWidthMm / 2) throw new RangeError('Yarıçap kabin genişliğinin yarısından küçük olamaz');
  return 2 * Math.asin(cabWidthMm / (2 * radiusMm)) * 180 / Math.PI;
}
export function radiusFromJointAngle(cabWidthMm: number, angleDeg: number): number {
  assertPositive('cabinetWidth', cabWidthMm);
  if (!(angleDeg > 0 && angleDeg < 180)) throw new RangeError('Açı (0,180) derece olmalı');
  return cabWidthMm / (2 * Math.sin(angleDeg * Math.PI / 360));
}

/** Merkez eksen = z; yay merkezi (0,0) noktasında, yay −Z yönünde bakar. cx,cz kabin orta noktası. */
export function curvedLayout(cabWidthMm: number, cols: number, radiusMm: number) {
  const th = jointAngleFromRadius(cabWidthMm, radiusMm) * Math.PI / 180;
  const total = th * cols;
  if (total > 2 * Math.PI) throw new RangeError('Toplam yay 360°\'yi aşıyor');
  const cells: CurvedCell[] = [];
  for (let i = 0; i < cols; i++) {
    const a = (i - (cols - 1) / 2) * th;
    cells.push({ col: i, cx: radiusMm * Math.sin(a), cz: radiusMm * Math.cos(a), angleDeg: a * 180 / Math.PI });
  }
  const chord = 2 * radiusMm * Math.sin(Math.min(total, Math.PI) / 2);
  const sagitta = radiusMm * (1 - Math.cos(total / 2));
  return { cells, jointAngleDeg: th * 180 / Math.PI, totalAngleDeg: total * 180 / Math.PI, chordMm: chord, sagittaMm: sagitta, arcLengthMm: radiusMm * total };
}
