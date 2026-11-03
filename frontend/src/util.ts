import { LayoutResult, ProjectorSlot, horizontalBlendAt } from './engine/multiproj';

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
