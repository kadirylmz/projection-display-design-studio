/**
 * Nötr 2B çizim modeli. CAD konvansiyonu: y YUKARI. Aynı modelden SVG ve DXF (AC1009/R12, ASCII) üretilir.
 * DWG yazılmaz (kapalı ikili biçim); DXF, CAD yazılımlarında DWG olarak kaydedilebilir.
 * DXF'te ASCII dışı karakterler \U+XXXX olarak kodlanır (R2007 öncesi DXF kuralı).
 */
export interface Layer { name: string; aci: number; hex: string }   // aci: AutoCAD renk indeksi
export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; layer: string }
  | { t: 'circle'; cx: number; cy: number; r: number; layer: string }
  | { t: 'text'; x: number; y: number; h: number; text: string; layer: string; anchor?: 'start' | 'middle' };

export interface Drawing { name: string; units: string; layers: Layer[]; prims: Prim[]; title?: string }

export const STD_LAYERS: Layer[] = [
  { name: 'GEOMETRI', aci: 7, hex: '#e2e8f0' },
  { name: 'PROJEKTOR', aci: 5, hex: '#38bdf8' },
  { name: 'IMAJ', aci: 3, hex: '#4ade80' },
  { name: 'OLCU', aci: 2, hex: '#facc15' },
  { name: 'METIN', aci: 7, hex: '#cbd5e1' },
  { name: 'ELEKTRIK', aci: 1, hex: '#f87171' },
  { name: 'ENGEL', aci: 30, hex: '#f59e0b' },
];

export function newDrawing(name: string, units: string, layers: Layer[] = STD_LAYERS): Drawing {
  return { name, units, layers, prims: [] };
}

export function bounds(d: Drawing) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const pt = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of d.prims) {
    if (p.t === 'line') { pt(p.x1, p.y1); pt(p.x2, p.y2); }
    else if (p.t === 'rect') { pt(p.x, p.y); pt(p.x + p.w, p.y + p.h); }
    else if (p.t === 'circle') { pt(p.cx - p.r, p.cy - p.r); pt(p.cx + p.r, p.cy + p.r); }
    else { const w = p.text.length * p.h * 0.6, ox = p.anchor === 'middle' ? w / 2 : 0; pt(p.x - ox, p.y); pt(p.x - ox + w, p.y + p.h); }
  }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function toSvg(d: Drawing, o: { pixelWidth?: number; background?: string; rotationDeg?: 0 | 90 | 180 | 270 | number } = {}): string {
  const b = bounds(d), m = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.04;
  const W = b.x1 - b.x0 + 2 * m, H = b.y1 - b.y0 + 2 * m;
  const sx = (x: number) => +(x - b.x0 + m).toFixed(4), sy = (y: number) => +(b.y1 - y + m).toFixed(4);
  const col = (l: string) => d.layers.find(x => x.name === l)?.hex ?? '#e2e8f0';
  const sw = Math.max(W, H) / 700;
  const bg = o.background ?? '#0b1220';
  const out = d.prims.map(p => {
    const c = col(p.layer);
    if (p.t === 'line') return `<line x1="${sx(p.x1)}" y1="${sy(p.y1)}" x2="${sx(p.x2)}" y2="${sy(p.y2)}" stroke="${c}" stroke-width="${sw}"/>`;
    if (p.t === 'rect') return `<rect x="${sx(p.x)}" y="${sy(p.y + p.h)}" width="${p.w}" height="${p.h}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
    if (p.t === 'circle') return `<circle cx="${sx(p.cx)}" cy="${sy(p.cy)}" r="${p.r}" fill="none" stroke="${c}" stroke-width="${sw}"/>`;
    const halo = (p.h * 0.18).toFixed(2);
    return `<text x="${sx(p.x)}" y="${sy(p.y)}" font-size="${p.h}" fill="${c}" paint-order="stroke fill" stroke="${bg}" stroke-width="${halo}" stroke-linejoin="round" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="600" text-anchor="${p.anchor ?? 'start'}">${esc(p.text)}</text>`;
  });

  const rot = ((o.rotationDeg ?? 0) % 360 + 360) % 360;
  let finalW = W;
  let finalH = H;
  let content = out.join('');

  if (rot === 90) {
    finalW = H;
    finalH = W;
    content = `<g transform="translate(${+finalW.toFixed(4)}, 0) rotate(90)">${content}</g>`;
  } else if (rot === 180) {
    finalW = W;
    finalH = H;
    content = `<g transform="translate(${+finalW.toFixed(4)}, ${+finalH.toFixed(4)}) rotate(180)">${content}</g>`;
  } else if (rot === 270) {
    finalW = H;
    finalH = W;
    content = `<g transform="translate(0, ${+finalH.toFixed(4)}) rotate(270)">${content}</g>`;
  }

  const size = o.pixelWidth ? ` width="${o.pixelWidth}" height="${Math.round(o.pixelWidth * finalH / finalW)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+finalW.toFixed(4)} ${+finalH.toFixed(4)}"${size}><rect width="100%" height="100%" fill="${bg}"/>${content}</svg>`;
}

const dxfText = (s: string) => [...s].map(ch => ch.charCodeAt(0) > 126 ? `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : ch).join('');
const num = (n: number) => (+n.toFixed(6)).toString();

export function toDxf(d: Drawing): string {
  const g: string[] = [];
  const pair = (code: number | string, v: string | number) => g.push(String(code), typeof v === 'number' ? num(v) : v);
  const layerNames = new Set(d.layers.map(l => l.name));
  for (const p of d.prims) if (!layerNames.has(p.layer)) throw new Error(`Tanımsız katman: ${p.layer}`);
  pair(0, 'SECTION'); pair(2, 'HEADER'); pair(9, '$ACADVER'); pair(1, 'AC1009'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'TABLES');
  pair(0, 'TABLE'); pair(2, 'LTYPE'); pair(70, 1);
  pair(0, 'LTYPE'); pair(2, 'CONTINUOUS'); pair(70, 0); pair(3, 'Solid line'); pair(72, 65); pair(73, 0); pair(40, 0);
  pair(0, 'ENDTAB');
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, d.layers.length);
  for (const l of d.layers) { pair(0, 'LAYER'); pair(2, l.name); pair(70, 0); pair(62, l.aci); pair(6, 'CONTINUOUS'); }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC');
  pair(0, 'SECTION'); pair(2, 'ENTITIES');
  const line = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
    pair(0, 'LINE'); pair(8, layer); pair(10, x1); pair(20, y1); pair(30, 0); pair(11, x2); pair(21, y2); pair(31, 0);
  };
  for (const p of d.prims) {
    if (p.t === 'line') line(p.x1, p.y1, p.x2, p.y2, p.layer);
    else if (p.t === 'rect') {
      line(p.x, p.y, p.x + p.w, p.y, p.layer); line(p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.layer);
      line(p.x + p.w, p.y + p.h, p.x, p.y + p.h, p.layer); line(p.x, p.y + p.h, p.x, p.y, p.layer);
    } else if (p.t === 'circle') { pair(0, 'CIRCLE'); pair(8, p.layer); pair(10, p.cx); pair(20, p.cy); pair(30, 0); pair(40, p.r); }
    else {
      pair(0, 'TEXT'); pair(8, p.layer); pair(10, p.x); pair(20, p.y); pair(30, 0); pair(40, p.h); pair(1, dxfText(p.text));
      if (p.anchor === 'middle') { pair(72, 1); pair(11, p.x); pair(21, p.y); pair(31, 0); }
    }
  }
  pair(0, 'ENDSEC'); pair(0, 'EOF');
  return g.join('\r\n') + '\r\n';
}

/** Test/doğrulama için: DXF'ten varlık listesi okur (yalnızca bu yazıcının ürettiği alt küme). */
export function parseDxfEntities(dxf: string) {
  const lines = dxf.split(/\r?\n/);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1]]);
  const out: { type: string; layer: string; v: Record<string, string> }[] = [];
  let inEnt = false, cur: (typeof out)[number] | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === '0' && v === 'SECTION' && pairs[i + 1][1] === 'ENTITIES') { inEnt = true; i++; continue; }
    if (!inEnt) continue;
    if (c === '0') { if (cur) out.push(cur); if (v === 'ENDSEC') return out; cur = { type: v, layer: '', v: {} }; continue; }
    if (cur) { if (c === '8') cur.layer = v; else cur.v[c] = v; }
  }
  return out;
}
