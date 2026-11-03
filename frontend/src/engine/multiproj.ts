/**
 * Çoklu projektör düzeni (piksel uzayı, tamsayı).
 * Kanvas = sınırlayıcı kutu; çözünürlükler TOPLANMAZ, örtüşme çıkarılır:
 *   W_canvas = cols·w − (cols−1)·ox      H_canvas = rows·h − (rows−1)·oy
 * Yüzde → piksel dönüşümü: ox = round(pct/100 · w). Kullanılan gerçek yüzde ayrıca raporlanır.
 */
export interface Crop { l: number; r: number; t: number; b: number }

export interface ProjectorSlot {
  id: string;
  label: string;
  x: number; y: number;       // kanvas içindeki sol-üst piksel (serbest düzende negatif olabilir; sonuç normalize edilir)
  w: number; h: number;       // projektör çıkış çözünürlüğü
  output?: string;            // ör. "DP-1"
  crop?: Crop;                // maskelenen (kırpılan) piksel miktarları
  /** Harman bölgesi genişlikleri (piksel). Izgara düzeninde otomatik üretilir. */
  blend?: { l: number; r: number; t: number; b: number };
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface OverlapRegion extends Rect { a: string; b: string }

export interface LayoutResult {
  slots: ProjectorSlot[];     // origin normalize edilmiş
  canvasW: number; canvasH: number;
  naiveW: number; naiveH: number;     // yalnızca karşılaştırma için: çözünürlük toplamı (YANLIŞ değer, kullanma)
  overlaps: OverlapRegion[];
  active: Record<string, Rect>;       // projektörün kanvas üzerindeki aktif (kırpma sonrası) bölgesi
  warnings: string[];
}

export function pctToPx(pct: number, size: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) throw new RangeError('Örtüşme yüzdesi [0,100) olmalı');
  return Math.round(pct / 100 * size);
}

export function gridLayout(opts: {
  cols: number; rows: number; w: number; h: number; overlapX: number; overlapY: number; // piksel
  outputs?: string[];
}): ProjectorSlot[] {
  const { cols, rows, w, h, overlapX: ox, overlapY: oy } = opts;
  for (const [n, v] of [['cols', cols], ['rows', rows], ['w', w], ['h', h]] as const)
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`${n} pozitif tam sayı olmalı`);
  if (!Number.isInteger(ox) || !Number.isInteger(oy) || ox < 0 || oy < 0) throw new RangeError('Örtüşme negatif olmayan tam sayı piksel olmalı');
  if (ox >= w || oy >= h) throw new RangeError('Örtüşme projektör çözünürlüğünden küçük olmalı');
  if (cols > 1 && 2 * ox > w) throw new RangeError('Yatay örtüşme, projektör genişliğinin yarısını aşamaz (harman bölgeleri çakışır)');
  if (rows > 1 && 2 * oy > h) throw new RangeError('Dikey örtüşme, projektör yüksekliğinin yarısını aşamaz');
  const slots: ProjectorSlot[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      slots.push({
        id: `P${i + 1}`, label: `Projektör ${i + 1}`,
        x: c * (w - ox), y: r * (h - oy), w, h,
        output: opts.outputs?.[i],
        blend: { l: c > 0 ? ox : 0, r: c < cols - 1 ? ox : 0, t: r > 0 ? oy : 0, b: r < rows - 1 ? oy : 0 },
      });
    }
  return slots;
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

export function computeLayout(input: ProjectorSlot[]): LayoutResult {
  if (!input.length) throw new RangeError('En az bir projektör gerekli');
  const ids = new Set<string>();
  for (const s of input) {
    if (ids.has(s.id)) throw new RangeError(`Yinelenen projektör kimliği: ${s.id}`);
    ids.add(s.id);
    if (!Number.isInteger(s.w) || !Number.isInteger(s.h) || s.w < 1 || s.h < 1) throw new RangeError(`${s.id}: çözünürlük pozitif tam sayı olmalı`);
    if (!Number.isInteger(s.x) || !Number.isInteger(s.y)) throw new RangeError(`${s.id}: konum tam sayı piksel olmalı`);
    const c = s.crop;
    if (c && (c.l < 0 || c.r < 0 || c.t < 0 || c.b < 0 || c.l + c.r >= s.w || c.t + c.b >= s.h))
      throw new RangeError(`${s.id}: geçersiz kırpma`);
  }
  const minX = Math.min(...input.map(s => s.x)), minY = Math.min(...input.map(s => s.y));
  const slots = input.map(s => ({ ...s, x: s.x - minX, y: s.y - minY }));
  const canvasW = Math.max(...slots.map(s => s.x + s.w));
  const canvasH = Math.max(...slots.map(s => s.y + s.h));
  const overlaps: OverlapRegion[] = [];
  for (let i = 0; i < slots.length; i++)
    for (let j = i + 1; j < slots.length; j++) {
      const r = intersect(slots[i], slots[j]);
      if (r) overlaps.push({ ...r, a: slots[i].id, b: slots[j].id });
    }
  const active: Record<string, Rect> = {};
  for (const s of slots) {
    const c = s.crop ?? { l: 0, r: 0, t: 0, b: 0 };
    active[s.id] = { x: s.x + c.l, y: s.y + c.t, w: s.w - c.l - c.r, h: s.h - c.t - c.b };
  }
  // Kapsanmayan (boş) kanvas alanı uyarısı: piksel alanı karşılaştırması
  const warnings: string[] = [];
  let covered = 0;
  const rects = Object.values(active);
  // kapsanan alan = birleşim alanı (sıkıştırılmış koordinat taraması)
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap(r => [r.y, r.y + r.h]))].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++)
      if (rects.some(r => r.x <= xs[i] && r.x + r.w >= xs[i + 1] && r.y <= ys[j] && r.y + r.h >= ys[j + 1]))
        covered += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
  if (covered < canvasW * canvasH) warnings.push(`Kanvasın ${canvasW * canvasH - covered} pikseli hiçbir projektör tarafından kapsanmıyor (boşluk).`);
  return {
    slots, canvasW, canvasH,
    naiveW: input.reduce((a, s) => a + s.w, 0), naiveH: input.reduce((a, s) => a + s.h, 0),
    overlaps, active, warnings,
  };
}

/** Harman eğrisi: gelen projektör için ışık-lineer ağırlık t, sürüş değeri = t^(1/gamma). */
export function blendDrive(t: number, gamma: number): number {
  if (t < 0 || t > 1) throw new RangeError('t [0,1] olmalı');
  if (gamma <= 0) throw new RangeError('gamma > 0 olmalı');
  return Math.pow(t, 1 / gamma);
}

/** Projektör içinde, x konumu (projektör yerel pikseli) için yatay harman sürüş çarpanı. */
export function horizontalBlendAt(s: ProjectorSlot, px: number, gamma: number): number {
  const b = s.blend ?? { l: 0, r: 0, t: 0, b: 0 };
  let v = 1;
  if (b.l > 0 && px < b.l) v = Math.min(v, blendDrive((px + 0.5) / b.l, gamma));
  if (b.r > 0 && px >= s.w - b.r) v = Math.min(v, blendDrive((s.w - px - 0.5) / b.r, gamma));
  return v;
}
