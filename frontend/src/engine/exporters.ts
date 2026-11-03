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
