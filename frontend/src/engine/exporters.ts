import { LayoutResult, ProjectorSlot, computeLayout } from './multiproj';

export const PALETTE = ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185', '#2dd4bf', '#f97316'];
export const colorOf = (i: number) => PALETTE[i % PALETTE.length];

export interface SvgOptions {
  gridStep?: number;               // piksel; 0/undefined = yok
  safeAreaPct?: number;            // ör. 90 → %5 kenar boşluğu
  rulers?: boolean;
  showOverlaps?: boolean;
  showCoords?: boolean;
  view?: { x: number; y: number; w: number; h: number };   // zoom/pan penceresi (kanvas pikseli)
  pixelWidth?: number;             // çıktı genişliği (px)
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Tek doğruluk kaynağı: ekranda gösterilen ve dışa aktarılan SVG aynı fonksiyondan çıkar. */
export function layoutToSvg(L: LayoutResult, o: SvgOptions = {}): string {
  const m = o.rulers ? 40 : 0;
  const v = o.view ?? { x: 0, y: 0, w: L.canvasW, h: L.canvasH };
  const fs = Math.max(v.w, v.h) / 60;         // yazı boyutu, görünür alana göre ölçeklenir
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${L.canvasW}" height="${L.canvasH}" fill="#0f172a" stroke="#94a3b8" stroke-width="${fs / 12}"/>`);
  if (o.gridStep && o.gridStep > 0) {
    const g: string[] = [];
    for (let x = 0; x <= L.canvasW; x += o.gridStep) g.push(`M${x} 0V${L.canvasH}`);
    for (let y = 0; y <= L.canvasH; y += o.gridStep) g.push(`M0 ${y}H${L.canvasW}`);
    parts.push(`<path d="${g.join('')}" stroke="#334155" stroke-width="${fs / 25}" fill="none"/>`);
  }
  L.slots.forEach((s, i) => {
    const c = colorOf(i), a = L.active[s.id];
    parts.push(`<rect data-id="${esc(s.id)}" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="${fs / 10}"/>`);
    if (a.w !== s.w || a.h !== s.h)
      parts.push(`<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="${c}" stroke-dasharray="${fs / 2} ${fs / 3}" stroke-width="${fs / 14}"/>`);
    if (s.blend) {
      const b = s.blend;
      if (b.l > 0) parts.push(`<rect x="${s.x}" y="${s.y}" width="${b.l}" height="${s.h}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-dasharray="${fs / 4}"/>`);
      if (b.r > 0) parts.push(`<rect x="${s.x + s.w - b.r}" y="${s.y}" width="${b.r}" height="${s.h}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-dasharray="${fs / 4}"/>`);
      if (b.t > 0) parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${b.t}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-dasharray="${fs / 4}"/>`);
      if (b.b > 0) parts.push(`<rect x="${s.x}" y="${s.y + s.h - b.b}" width="${s.w}" height="${b.b}" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-dasharray="${fs / 4}"/>`);
    }
    if (s.polygonMask && s.polygonMask.length >= 3) {
      const pts = s.polygonMask.map(p => `${s.x + p.x},${s.y + p.y}`).join(' ');
      parts.push(`<polygon points="${pts}" fill="${c}" fill-opacity="0.22" stroke="#facc15" stroke-width="${fs / 10}"/>`);
    }
    if (s.bezierMask && s.bezierMask.length >= 2) {
      const bm = s.bezierMask;
      const dPath: string[] = [`M ${s.x + bm[0].x} ${s.y + bm[0].y}`];
      for (let k = 0; k < bm.length; k++) {
        const cur = bm[k], nxt = bm[(k + 1) % bm.length];
        dPath.push(`C ${s.x + cur.cp2x} ${s.y + cur.cp2y}, ${s.x + nxt.cp1x} ${s.y + nxt.cp1y}, ${s.x + nxt.x} ${s.y + nxt.y}`);
      }
      parts.push(`<path d="${dPath.join(' ')} Z" fill="${c}" fill-opacity="0.22" stroke="#fb7185" stroke-width="${fs / 10}"/>`);
    }
    if (s.warp && s.warp.points.length === (s.warp.cols + 1) * (s.warp.rows + 1)) {
      const { cols, rows, points } = s.warp;
      const wp = (r: number, cl: number) => points[r * (cols + 1) + cl];
      const wLines: string[] = [];
      for (let r = 0; r <= rows; r++) {
        for (let cl = 0; cl < cols; cl++) {
          const p1 = wp(r, cl), p2 = wp(r, cl + 1);
          wLines.push(`M${s.x + p1.x} ${s.y + p1.y}L${s.x + p2.x} ${s.y + p2.y}`);
        }
      }
      for (let cl = 0; cl <= cols; cl++) {
        for (let r = 0; r < rows; r++) {
          const p1 = wp(r, cl), p2 = wp(r + 1, cl);
          wLines.push(`M${s.x + p1.x} ${s.y + p1.y}L${s.x + p2.x} ${s.y + p2.y}`);
        }
      }
      parts.push(`<path d="${wLines.join('')}" stroke="#38bdf8" stroke-opacity="0.65" stroke-width="${fs / 18}" fill="none"/>`);
      for (const pt of points) {
        parts.push(`<circle cx="${s.x + pt.x}" cy="${s.y + pt.y}" r="${fs / 5}" fill="#38bdf8"/>`);
      }
    }
    if (s.keystone && (Math.abs(s.keystone.vDeg) > 0.1 || Math.abs(s.keystone.hDeg) > 0.1)) {
      const vInset = Math.min(0.35, (Math.abs(s.keystone.vDeg) / 45) * 0.35) * (s.w * 0.5);
      const hInset = Math.min(0.35, (Math.abs(s.keystone.hDeg) / 45) * 0.35) * (s.h * 0.5);
      let tlX = s.x, tlY = s.y, trX = s.x + s.w, trY = s.y;
      let brX = s.x + s.w, brY = s.y + s.h, blX = s.x, blY = s.y + s.h;
      if (s.keystone.vDeg > 0.1) { tlX += vInset; trX -= vInset; }
      else if (s.keystone.vDeg < -0.1) { blX += vInset; brX -= vInset; }
      if (s.keystone.hDeg > 0.1) { trY += hInset; brY -= hInset; }
      else if (s.keystone.hDeg < -0.1) { tlY += hInset; blY -= hInset; }
      const kPts = `${tlX.toFixed(1)},${tlY.toFixed(1)} ${trX.toFixed(1)},${trY.toFixed(1)} ${brX.toFixed(1)},${brY.toFixed(1)} ${blX.toFixed(1)},${blY.toFixed(1)}`;
      parts.push(`<polygon data-keystone="${esc(s.id)}" points="${kPts}" fill="none" stroke="#f59e0b" stroke-width="${fs / 12}" stroke-dasharray="${fs / 2} ${fs / 3}"/>`);
    }
  });
  if (o.showOverlaps !== false)
    for (const r of L.overlaps)
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#f8fafc" fill-opacity="0.28" stroke="#f8fafc" stroke-width="${fs / 20}" stroke-dasharray="${fs / 4}"/>`);
  if (o.safeAreaPct && o.safeAreaPct < 100) {
    const k = (100 - o.safeAreaPct) / 200;
    parts.push(`<rect x="${L.canvasW * k}" y="${L.canvasH * k}" width="${L.canvasW * (1 - 2 * k)}" height="${L.canvasH * (1 - 2 * k)}" fill="none" stroke="#facc15" stroke-dasharray="${fs / 2}" stroke-width="${fs / 14}"/>`);
  }
  L.slots.forEach((s, i) => {
    const lines = [`${s.label}${s.output ? ' · ' + s.output : ''}`, `${s.w}×${s.h}`];
    if (o.showCoords !== false) lines.push(`(${s.x}, ${s.y}) → (${s.x + s.w}, ${s.y + s.h})`);
    lines.forEach((t, k) => parts.push(`<text x="${s.x + fs}" y="${s.y + fs * (1.6 + k * 1.4)}" fill="${colorOf(i)}" font-size="${fs}" font-family="sans-serif">${esc(t)}</text>`));
  });
  if (o.rulers) {
    const step = niceStep(v.w / 8);
    const t: string[] = [];
    for (let x = Math.ceil(v.x / step) * step; x <= v.x + v.w; x += step)
      t.push(`<line x1="${x}" y1="${v.y - m * v.w / 1000}" x2="${x}" y2="${v.y}" stroke="#94a3b8" stroke-width="${fs / 20}"/><text x="${x + fs / 4}" y="${v.y - fs / 3}" fill="#94a3b8" font-size="${fs * 0.8}" font-family="sans-serif">${x}</text>`);
    for (let y = Math.ceil(v.y / step) * step; y <= v.y + v.h; y += step)
      t.push(`<line x1="${v.x - m * v.w / 1000}" y1="${y}" x2="${v.x}" y2="${y}" stroke="#94a3b8" stroke-width="${fs / 20}"/><text x="${v.x - fs * 3.2}" y="${y - fs / 4}" fill="#94a3b8" font-size="${fs * 0.8}" font-family="sans-serif">${y}</text>`);
    parts.push(...t);
  }
  const pad = o.rulers ? fs * 3.5 : 0;
  const vb = `${v.x - pad} ${v.y - pad} ${v.w + pad} ${v.h + pad}`;
  const pw = o.pixelWidth;
  const size = pw ? ` width="${pw}" height="${Math.round(pw * (v.h + pad) / (v.w + pad))}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size} style="background:#020617">${parts.join('')}</svg>`;
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

/* ---------- JSON proje yapılandırması ---------- */
export interface MappingConfig {
  schema: 'av-studio.pixel-mapping';
  version: 1;
  contentCanvas: { w: number; h: number };
  gamma: number;
  projectors: ProjectorSlot[];
}

export function toConfig(slots: ProjectorSlot[], content: { w: number; h: number }, gamma = 2.2): MappingConfig {
  const L = computeLayout(slots);
  return { schema: 'av-studio.pixel-mapping', version: 1, contentCanvas: content, gamma, projectors: L.slots };
}

export function fromConfig(json: string): MappingConfig {
  const c = JSON.parse(json);
  if (c?.schema !== 'av-studio.pixel-mapping' || c.version !== 1) throw new Error('Tanınmayan yapılandırma biçimi');
  computeLayout(c.projectors);  // doğrular, hata fırlatır
  return c as MappingConfig;
}

/**
 * Medya sunucusu entegrasyonları için genişletme noktası.
 * UYARI: Henüz WATCHOUT/Resolume/MadMapper için doğrulanmış bir dışa aktarım uygulanmadı;
 * bu biçimlerin şartnamesi olmadan uyumluluk iddia edilmez.
 */
export interface ExportAdapter {
  id: string;
  name: string;
  /** Şartnamesi doğrulanmış bir uygulama varsa true */
  validated: boolean;
  export(config: MappingConfig): string | Uint8Array;
}
export const ADAPTERS: ExportAdapter[] = [
  { id: 'native-json', name: 'Yerel JSON', validated: true, export: c => JSON.stringify(c, null, 2) },
];
