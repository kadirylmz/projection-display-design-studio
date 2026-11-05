import { LayoutResult, ProjectorSlot, horizontalBlendAt } from './engine/multiproj';
import { colorOf } from './engine/exporters';

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Birleşik kanvasın tamamı için profesyonel Pixel Map kalibrasyon / test deseni (1:1 piksel) üretir.
 * İçerik: Dama tahtası, 100 px koordinat ızgarası, köşegenler, merkez hedef halkaları,
 * her projektörün renkli sınır çerçevesi, örtüşme (blend) kuşakları ve piksel koordinat etiketleri.
 */
export function renderCanvasPixelMapPattern(L: LayoutResult, title = 'PIXEL MAP CANVAS'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = L.canvasW;
  c.height = L.canvasH;
  const g = c.getContext('2d')!;

  // 1. Arka plan dama tahtası (100x100 px)
  const cell = 100;
  for (let y = 0; y < L.canvasH; y += cell) {
    for (let x = 0; x < L.canvasW; x += cell) {
      g.fillStyle = ((x / cell + y / cell) % 2 === 0) ? '#0f172a' : '#1e293b';
      g.fillRect(x, y, Math.min(cell, L.canvasW - x), Math.min(cell, L.canvasH - y));
    }
  }

  // 2. 100 px ızgara ve koordinat etiketleri
  g.strokeStyle = '#334155';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= L.canvasW; x += cell) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, L.canvasH); }
  for (let y = 0; y <= L.canvasH; y += cell) { g.moveTo(0, y + 0.5); g.lineTo(L.canvasW, y + 0.5); }
  g.stroke();

  // 3. Kanvas köşegenleri ve merkez daireler
  g.strokeStyle = '#475569';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(L.canvasW, L.canvasH);
  g.moveTo(L.canvasW, 0); g.lineTo(0, L.canvasH);
  g.stroke();

  const rMax = Math.min(L.canvasW, L.canvasH) * 0.42;
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    g.beginPath();
    g.arc(L.canvasW / 2, L.canvasH / 2, rMax * frac, 0, Math.PI * 2);
    g.stroke();
  }

  // 4. Projektör bölgeleri ve aktif sınırlar
  L.slots.forEach((s, i) => {
    const col = colorOf(i);
    g.strokeStyle = col;
    g.lineWidth = 4;
    g.strokeRect(s.x + 2, s.y + 2, s.w - 4, s.h - 4);

    // Projektör merkezi artı işareti
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    g.beginPath();
    g.moveTo(cx - 40, cy); g.lineTo(cx + 40, cy);
    g.moveTo(cx, cy - 40); g.lineTo(cx, cy + 40);
    g.stroke();

    // Projektör bilgi kutusu
    const fs = Math.max(18, Math.round(Math.min(s.w, s.h) / 26));
    g.fillStyle = 'rgba(2, 6, 23, 0.78)';
    g.fillRect(cx - s.w * 0.28, cy - fs * 2.4, s.w * 0.56, fs * 4.8);
    g.strokeRect(cx - s.w * 0.28, cy - fs * 2.4, s.w * 0.56, fs * 4.8);

    g.fillStyle = col;
    g.font = `bold ${fs}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(`${s.label}${s.output ? ' [' + s.output + ']' : ''}`, cx, cy - fs * 0.8);
    g.fillStyle = '#f8fafc';
    g.font = `${Math.round(fs * 0.85)}px monospace`;
    g.fillText(`${s.w}×${s.h} px @ (${s.x}, ${s.y})`, cx, cy + fs * 0.4);
    const act = L.active[s.id];
    g.fillText(`Aktif: ${act.w}×${act.h} px`, cx, cy + fs * 1.5);
  });

  // 5. Örtüşme (Overlap / Blend) bölgeleri taraması
  for (const ov of L.overlaps) {
    g.fillStyle = 'rgba(250, 204, 21, 0.18)';
    g.fillRect(ov.x, ov.y, ov.w, ov.h);
    g.strokeStyle = '#facc15';
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.strokeRect(ov.x + 1, ov.y + 1, ov.w - 2, ov.h - 2);
    g.setLineDash([]);
    g.fillStyle = '#facc15';
    g.font = 'bold 16px monospace';
    g.textAlign = 'center';
    g.fillText(`BLEND ${ov.w}×${ov.h}`, ov.x + ov.w / 2, ov.y + 24);
  }

  // 6. Kanvas dış çerçevesi ve üst başlık
  g.strokeStyle = '#f8fafc';
  g.lineWidth = 4;
  g.strokeRect(2, 2, L.canvasW - 4, L.canvasH - 4);
  g.fillStyle = '#38bdf8';
  g.font = `bold ${Math.max(20, Math.round(L.canvasH / 36))}px monospace`;
  g.textAlign = 'left';
  g.fillText(`${title} — ${L.canvasW}×${L.canvasH} px`, 20, 38);

  return c;
}

export function svgToPng(svg: string, width: number): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const vb = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number);
      const c = document.createElement('canvas');
      c.width = width; c.height = Math.round(width * vb[3] / vb[2]);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('PNG üretilemedi')), 'image/png');
    };
    img.onerror = () => rej(new Error('SVG yüklenemedi'));
    img.src = url;
  });
}

/** Projektör çıkış çözünürlüğünde (1:1 piksel) kalibrasyon deseni üretir. */
export function renderTestPattern(s: ProjectorSlot, L: LayoutResult, gamma: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, s.w, s.h);
  const step = 100;
  g.strokeStyle = '#555'; g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= s.w; x += step) { g.moveTo(x + .5, 0); g.lineTo(x + .5, s.h); }
  for (let y = 0; y <= s.h; y += step) { g.moveTo(0, y + .5); g.lineTo(s.w, y + .5); }
  g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(1, 1, s.w - 2, s.h - 2);
  g.beginPath(); g.moveTo(s.w / 2, 0); g.lineTo(s.w / 2, s.h); g.moveTo(0, s.h / 2); g.lineTo(s.w, s.h / 2); g.stroke();
  g.beginPath(); g.arc(s.w / 2, s.h / 2, Math.min(s.w, s.h) / 2 - 4, 0, Math.PI * 2); g.stroke();
  // Harman bölgeleri: yatay harman sürüş değeri gri tonu olarak gösterilir
  const b = s.blend;
  if (b && (b.l || b.r)) {
    for (let x = 0; x < s.w; x++) {
      const v = horizontalBlendAt(s, x, gamma);
      if (v < 1) { const k = Math.round(v * 255); g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, s.h * 0.4, 1, s.h * 0.2); }
    }
  }
  const a = L.active[s.id];
  g.fillStyle = '#fff'; g.font = `${Math.round(s.h / 18)}px sans-serif`; g.textAlign = 'center';
  g.fillText(`${s.label}${s.output ? ' · ' + s.output : ''}`, s.w / 2, s.h * 0.2);
  g.fillText(`${s.w}×${s.h}  kanvas (${s.x},${s.y})`, s.w / 2, s.h * 0.3);
  g.fillText(`aktif ${a.w}×${a.h}`, s.w / 2, s.h * 0.8);
  return c;
}
