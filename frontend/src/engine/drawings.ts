import { Drawing, newDrawing, STD_LAYERS } from './drawing';
import { Cabinet, cabinetGrid, ledFromCabinets } from './led';
import { LayoutResult } from './multiproj';
import { Aabb, Projector3D, Surface, cornerDirs, frame, rayHit } from './room3d';
import { Circuit, ElectricalResult, Load, Supply } from './electrical';

/** LED duvar ön görünüşü (mm, y yukarı). */
export function ledElevation(cab: Cabinet, cols: number, rows: number): Drawing {
  const d = newDrawing('LED duvar ön görünüş', 'mm');
  const W = cols * cab.widthMm, H = rows * cab.heightMm, r = ledFromCabinets(cab, cols, rows);
  for (const c of cabinetGrid(cab, cols, rows)) {
    const y = H - (c.row + 1) * c.hMm;
    d.prims.push({ t: 'rect', x: c.xMm, y, w: c.wMm, h: c.hMm, layer: 'GEOMETRI' });
    if (cols * rows <= 200)
      d.prims.push({ t: 'text', x: c.xMm + c.wMm / 2, y: y + c.hMm / 2 - cab.heightMm * 0.03, h: cab.heightMm * 0.08, text: `${c.col + 1}-${c.row + 1}`, layer: 'METIN', anchor: 'middle' });
  }
  const t = Math.max(W, H) * 0.025, off = Math.max(W, H) * 0.06;
  d.prims.push(
    { t: 'line', x1: 0, y1: -off, x2: W, y2: -off, layer: 'OLCU' }, { t: 'line', x1: 0, y1: -off * 0.7, x2: 0, y2: -off * 1.2, layer: 'OLCU' }, { t: 'line', x1: W, y1: -off * 0.7, x2: W, y2: -off * 1.2, layer: 'OLCU' },
    { t: 'text', x: W / 2, y: -off - t * 1.4, h: t, text: `${W} mm`, layer: 'OLCU', anchor: 'middle' },
    { t: 'line', x1: W + off, y1: 0, x2: W + off, y2: H, layer: 'OLCU' }, { t: 'line', x1: W + off * 0.7, y1: 0, x2: W + off * 1.2, y2: 0, layer: 'OLCU' }, { t: 'line', x1: W + off * 0.7, y1: H, x2: W + off * 1.2, y2: H, layer: 'OLCU' },
    { t: 'text', x: W + off * 1.4, y: H / 2, h: t, text: `${H} mm`, layer: 'OLCU' },
    { t: 'text', x: 0, y: H + t, h: t, text: `LED duvar ${cols}x${rows} kabin | pitch ${cab.pitchMm} mm | ${r.resX}x${r.resY} px`, layer: 'METIN' },
  );
  return d;
}

/** Çoklu projektör piksel düzeni (px, y yukarı). */
export function mappingDrawing(L: LayoutResult): Drawing {
  const d = newDrawing('Piksel haritası', 'px');
  const t = Math.max(L.canvasW, L.canvasH) / 50;
  d.prims.push({ t: 'rect', x: 0, y: 0, w: L.canvasW, h: L.canvasH, layer: 'GEOMETRI' });
  for (const s of L.slots) {
    const y = L.canvasH - s.y - s.h;
    d.prims.push({ t: 'rect', x: s.x, y, w: s.w, h: s.h, layer: 'PROJEKTOR' });
    d.prims.push({ t: 'text', x: s.x + t / 2, y: y + s.h - t * 1.5, h: t, text: `${s.label}${s.output ? ' ' + s.output : ''}`, layer: 'METIN' });
    d.prims.push({ t: 'text', x: s.x + t / 2, y: y + s.h - t * 2.9, h: t * 0.8, text: `${s.w}x${s.h} @ (${s.x},${s.y})`, layer: 'METIN' });
  }
  for (const o of L.overlaps) d.prims.push({ t: 'rect', x: o.x, y: L.canvasH - o.y - o.h, w: o.w, h: o.h, layer: 'IMAJ' });
  d.prims.push({ t: 'text', x: 0, y: L.canvasH + t, h: t, text: `Kanvas ${L.canvasW}x${L.canvasH} px`, layer: 'OLCU' });
  return d;
}

/** Oda planı (üstten, mm): X→x, Z→y. */
export function roomPlan(room: { w: number; l: number; h: number }, projectors: Projector3D[], surfaces: Surface[], obstacles: Aabb[]): Drawing {
  const d = newDrawing('Oda planı (üstten)', 'mm');
  const mm = 1000, t = Math.max(room.w, room.l) * mm / 60;
  d.prims.push({ t: 'rect', x: (-room.w / 2) * mm, y: 0, w: room.w * mm, h: room.l * mm, layer: 'GEOMETRI' });
  for (const s of surfaces) {
    if (s.kind === 'plane') {
      const r = frame(s.yawDeg, s.pitchDeg).r, hw = s.width / 2;
      if (Math.hypot(r[0], r[2]) > 1e-6)
        d.prims.push({ t: 'line', x1: (s.center[0] - r[0] * hw) * mm, y1: (s.center[2] - r[2] * hw) * mm, x2: (s.center[0] + r[0] * hw) * mm, y2: (s.center[2] + r[2] * hw) * mm, layer: 'IMAJ' });
      else d.prims.push({ t: 'rect', x: (s.center[0] - s.width / 2) * mm, y: (s.center[2] - s.height / 2) * mm, w: s.width * mm, h: s.height * mm, layer: 'IMAJ' });
    } else if (s.kind === 'cylinder') {
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a0 = (s.startDeg + (s.endDeg - s.startDeg) * i / n) * Math.PI / 180, a1 = (s.startDeg + (s.endDeg - s.startDeg) * (i + 1) / n) * Math.PI / 180;
        d.prims.push({ t: 'line', x1: (s.center[0] + s.radius * Math.sin(a0)) * mm, y1: (s.center[2] + s.radius * Math.cos(a0)) * mm, x2: (s.center[0] + s.radius * Math.sin(a1)) * mm, y2: (s.center[2] + s.radius * Math.cos(a1)) * mm, layer: 'IMAJ' });
      }
    } else d.prims.push({ t: 'circle', cx: s.center[0] * mm, cy: s.center[2] * mm, r: s.radius * mm, layer: 'IMAJ' });
  }
  for (const o of obstacles) d.prims.push({ t: 'rect', x: o.min[0] * mm, y: o.min[2] * mm, w: (o.max[0] - o.min[0]) * mm, h: (o.max[2] - o.min[2]) * mm, layer: 'ENGEL' });
  for (const p of projectors) {
    d.prims.push({ t: 'rect', x: (p.pos[0] - 0.225) * mm, y: (p.pos[2] - 0.25) * mm, w: 450, h: 500, layer: 'PROJEKTOR' });
    const pts = cornerDirs(p).map(dir => {
      let best: { t: number; p: [number, number, number] } | null = null;
      for (const s of surfaces) { const h = rayHit(p.pos, dir, s); if (h && (!best || h.t < best.t)) best = h; }
      return best ? best.p : null;
    });
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4];
      if (a) d.prims.push({ t: 'line', x1: p.pos[0] * mm, y1: p.pos[2] * mm, x2: a[0] * mm, y2: a[2] * mm, layer: 'PROJEKTOR' });
      if (a && b) d.prims.push({ t: 'line', x1: a[0] * mm, y1: a[2] * mm, x2: b[0] * mm, y2: b[2] * mm, layer: 'IMAJ' });
    }
    d.prims.push({ t: 'text', x: (p.pos[0] + 0.3) * mm, y: p.pos[2] * mm, h: t * 0.8, text: `${p.label} TR ${p.throwRatio}`, layer: 'METIN' });
  }
  d.prims.push({ t: 'text', x: (-room.w / 2) * mm, y: room.l * mm + t, h: t, text: `Oda ${room.w} x ${room.l} x ${room.h} m (plan)`, layer: 'METIN' });
  return d;
}

/** Tek hat (single-line) şeması — basitleştirilmiş semboller, IEC 60617 uyumu iddia edilmez. */
export function electricalSingleLine(loads: Load[], circuits: Circuit[], s: Supply, res: ElectricalResult): Drawing {
  const d = newDrawing('Elektrik tek hat şeması', 'birim');
  const sp = 70, h = 3.2, n = Math.max(1, circuits.length);
  const busY = 0, busW = Math.max(sp * n, 120);
  // Besleme + ana koruma
  d.prims.push({ t: 'rect', x: busW / 2 - 30, y: 60, w: 60, h: 14, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'text', x: busW / 2, y: 64, h, text: `BESLEME ${s.voltage} V ${s.phases === 3 ? '3~' : '1~'} 50 Hz`, layer: 'METIN', anchor: 'middle' });
  breaker(d, busW / 2, 60, busY, res.mainBreakerA ? `Ana: ${res.mainBreakerA} A` : 'Ana: ?');
  d.prims.push({ t: 'line', x1: 0, y1: busY, x2: busW, y2: busY, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'text', x: 0, y: busY + 2, h, text: `BARA | Toplam ${Math.round(res.totalW)} W | Talep ${Math.round(res.demandW)} W | Ib ${res.totalIbA.toFixed(1)} A`, layer: 'METIN' });
  const byId = new Map(loads.map(l => [l.id, l]));
  circuits.forEach((c, i) => {
    const x = i * sp + sp / 2 + (busW - sp * n) / 2, cr = res.circuits[i];
    breaker(d, x, busY, -30, `${c.name} ${cr?.breakerA ?? '?'} A`, true);
    const cable = c.cableMm2 ? `${s.phases === 3 && c.phase === '3P' ? '5' : '3'}x${c.cableMm2} mm2${c.lengthM ? ' / ' + c.lengthM + ' m' : ''}${cr?.dropPct !== undefined ? ' dU %' + cr.dropPct.toFixed(1) : ''}` : 'kablo ?';
    d.prims.push({ t: 'line', x1: x, y1: -30, x2: x, y2: -62, layer: 'ELEKTRIK' });
    d.prims.push({ t: 'text', x: x + 2, y: -46, h: h * 0.85, text: cable, layer: 'METIN' });
    d.prims.push({ t: 'text', x: x + 2, y: -50, h: h * 0.85, text: `${c.phase} | Ib ${cr?.ibA.toFixed(1) ?? '-'} A`, layer: 'METIN' });
    c.loadIds.forEach((id, k) => {
      const l = byId.get(id); if (!l) return;
      const y = -66 - k * 14;
      d.prims.push({ t: 'rect', x: x - 30, y: y - 10, w: 60, h: 10, layer: 'GEOMETRI' });
      d.prims.push({ t: 'text', x, y: y - 4.5, h: h * 0.9, text: `${l.name} x${l.qty}`, layer: 'METIN', anchor: 'middle' });
      d.prims.push({ t: 'text', x, y: y - 8.8, h: h * 0.8, text: `${Math.round(l.qty * l.powerW)} W`, layer: 'METIN', anchor: 'middle' });
      if (k > 0) d.prims.push({ t: 'line', x1: x, y1: y + 4, x2: x, y2: y, layer: 'ELEKTRIK' });
    });
  });
  void STD_LAYERS;
  return d;
}

function breaker(d: Drawing, x: number, yTop: number, yBot: number, label: string, side = false) {
  const mid = (yTop + yBot) / 2;
  d.prims.push({ t: 'line', x1: x, y1: yTop, x2: x, y2: mid + 6, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'line', x1: x, y1: mid + 6, x2: x + 5, y2: mid - 4, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'line', x1: x, y1: mid - 6, x2: x, y2: yBot, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'line', x1: x - 2, y1: mid - 6, x2: x + 2, y2: mid - 6, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'text', x: x + 8, y: mid - 1, h: 3, text: label, layer: 'METIN' });
  void side;
}
