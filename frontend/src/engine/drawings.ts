import { Drawing, newDrawing, STD_LAYERS } from './drawing';
import { Cabinet, cabinetGrid, ledFromCabinets } from './led';
import { LayoutResult } from './multiproj';
import { Aabb, Projector3D, Surface, cornerDirs, frame, rayHit } from './room3d';
import { Circuit, ElectricalResult, Load, Supply } from './electrical';
import type { CalculatedSurface, PhysicalRoomConfig, SurfaceItem } from '../modules/ContentPlanner';

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

/** Standart Oda Planı (3D Sahne tabanlı) */
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

export interface ContentPlannerRoomPlanOptions {
  customProjectorQty?: number;
  perProjectorWatt?: number;
  showRoomDimensions?: boolean;      // Dış oda genişliği & boyu ölçü çizgileri
  showThrowDimensions?: boolean;     // Projektörün duvara atım mesafesi (D) ölçü çizgileri
  showProjectorLabels?: boolean;     // Projektör adları ve tavan askı kotu (H)
  showElectricalLabels?: boolean;    // Kırmızı 230V priz sembolleri ve watt etiketleri
  showFrustums?: boolean;            // Işık atım konileri (üçgen ışın çizgileri)
  showTitleBlock?: boolean;          // Sağ alt teknik antet ve lejant
}

/**
 * ELEKTRİKÇİ VE SAHA MONTAJ EKİBİ İÇİN NET CAD MİMARİ PROJEKSİYON YERLEŞİM PLANI (DXF / SVG)
 * - Her projektörün duvara olan dik montaj mesafesi (Throw Distance D) ve referans duvara uzaklık kotları
 * - Elektrik priz / besleme linye noktası (230V Priz Sembolü)
 * - Tavan askı kotu / yüksekliği (H)
 * - Her cihazın net koordinatları (X, Z) ve güç etiketi
 */
export function contentPlannerRoomPlan(
  physicalRoom: PhysicalRoomConfig,
  surfaces: (SurfaceItem | CalculatedSurface)[],
  options: ContentPlannerRoomPlanOptions = {}
): Drawing {
  const d = newDrawing('Mimari Projeksiyon & Elektrik Yerleşim Planı (CAD)', 'mm');
  const mm = 1000; // Metre -> Milimetre

  const {
    showRoomDimensions = true,
    showThrowDimensions = true,
    showProjectorLabels = true,
    showElectricalLabels = true,
    showFrustums = true,
    showTitleBlock = true,
  } = options;

  const walls = surfaces.filter(s => s.type === 'wall');
  const floor = surfaces.find(s => s.type === 'floor');

  const roomW = physicalRoom.enabled
    ? physicalRoom.widthM
    : walls[1]?.widthM || floor?.heightM || 8.5;
  const roomL = physicalRoom.enabled
    ? physicalRoom.lengthM
    : walls[0]?.widthM || floor?.widthM || 25.0;
  const roomH = physicalRoom.enabled
    ? physicalRoom.heightM
    : walls[0]?.heightM || 5.5;

  const hw = (roomW / 2) * mm;
  const hl = (roomL / 2) * mm;
  const t = Math.max(roomW, roomL) * mm / 55;
  const pWatt = options.perProjectorWatt || 450;

  // 1. FİZİKSEL ODA DUVARLARI VE MİMARİ KABUK
  d.prims.push({
    t: 'rect',
    x: -hw,
    y: -hl,
    w: roomW * mm,
    h: roomL * mm,
    layer: 'GEOMETRI',
  });

  // Köşe Kolonları (500x500 mm)
  const colSize = 500;
  [
    [-hw, -hl],
    [hw - colSize, -hl],
    [hw - colSize, hl - colSize],
    [-hw, hl - colSize],
  ].forEach(([cx, cy]) => {
    d.prims.push({ t: 'rect', x: cx, y: cy, w: colSize, h: colSize, layer: 'GEOMETRI' });
  });

  // 2. HER YÜZEYİN PROJEKTÖR YERLEŞİMİ, KOTLARI VE ELEKTRİK BESLEME NOKTALARI
  let totalPjCount = 0;

  walls.forEach((w, wIdx) => {
    const singleW = ('singleProjWidthM' in w && w.singleProjWidthM) ? w.singleProjWidthM : (w.throwDistM / Math.max(0.2, w.throwRatio));
    const stepW = singleW * 0.85; // %15 overlap
    const totalOptW = w.cols === 1 ? singleW : singleW + (w.cols - 1) * stepW;
    const throwM = w.throwDistM;
    const mountH = (w.projMountHeightM && w.projMountHeightM > 0)
      ? w.projMountHeightM
      : Math.max(2.2, w.heightM - 0.2);

    if (wIdx === 0) {
      // SOL UZUN DUVAR (X = -hw)
      const wallLen = Math.min(roomL, w.widthM) * mm;
      d.prims.push({
        t: 'line',
        x1: -hw + 15,
        y1: -wallLen / 2,
        x2: -hw + 15,
        y2: wallLen / 2,
        layer: 'IMAJ',
      });

      for (let c = 0; c < w.cols; c++) {
        totalPjCount++;
        const offsetZ = w.cols === 1 ? 0 : (-totalOptW / 2 + singleW / 2 + c * stepW) * mm;
        const targetZ = offsetZ;
        const targetX = -hw;
        const pjX = (-hw + throwM * mm);
        const pjZ = targetZ;

        // Projektör Şasisi (500x420 mm)
        d.prims.push({ t: 'rect', x: pjX - 210, y: pjZ - 250, w: 420, h: 500, layer: 'PROJEKTOR' });

        // Elektrik Prizi / Besleme Sembolü (Kırmızı Daire + 230V Soket)
        if (showElectricalLabels) {
          d.prims.push({ t: 'circle', cx: pjX, cy: pjZ + 320, r: 90, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX - 60, y1: pjZ + 320, x2: pjX + 60, y2: pjZ + 320, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ + 260, x2: pjX, y2: pjZ + 380, layer: 'ELEKTRIK' });
        }

        // Montaj ve Elektrik Etiketi
        if (showProjectorLabels || showElectricalLabels) {
          const parts: string[] = [];
          if (showProjectorLabels) parts.push(`PJ-Sol.${c + 1}`, `H=${mountH.toFixed(2)}m`);
          if (showElectricalLabels) parts.push(`${pWatt}W (230V)`);
          d.prims.push({
            t: 'text',
            x: pjX + 260,
            y: pjZ - 50,
            h: t * 0.65,
            text: parts.join(' | '),
            layer: 'METIN',
          });
        }

        // Duvara Dik Atım Mesafesi (Throw Distance) Ölçülendirme Çizgisi
        if (showThrowDimensions) {
          d.prims.push({ t: 'line', x1: targetX, y1: pjZ, x2: pjX, y2: pjZ, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: targetX, y1: pjZ - 120, x2: targetX, y2: pjZ + 120, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ - 120, x2: pjX, y2: pjZ + 120, layer: 'OLCU' });
          d.prims.push({
            t: 'text',
            x: (targetX + pjX) / 2,
            y: pjZ + 80,
            h: t * 0.6,
            text: `D = ${throwM.toFixed(2)} m (${Math.round(throwM * mm)} mm)`,
            layer: 'OLCU',
            anchor: 'middle',
          });
        }

        // Işık Atım Konisi (Frustum Üst Görünüş Üçgeni)
        if (showFrustums) {
          const halfSpanMm = (singleW * mm) / 2;
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX, y2: targetZ - halfSpanMm, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX, y2: targetZ + halfSpanMm, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: targetX, y1: targetZ - halfSpanMm, x2: targetX, y2: targetZ + halfSpanMm, layer: 'IMAJ' });
        }
      }
    } else if (wIdx === 1) {
      // ÖN KISA DUVAR (Z = -hl)
      const wallLen = Math.min(roomW, w.widthM) * mm;
      d.prims.push({
        t: 'line',
        x1: -wallLen / 2,
        y1: -hl + 15,
        x2: wallLen / 2,
        y2: -hl + 15,
        layer: 'IMAJ',
      });

      for (let c = 0; c < w.cols; c++) {
        totalPjCount++;
        const offsetX = w.cols === 1 ? 0 : (-totalOptW / 2 + singleW / 2 + c * stepW) * mm;
        const targetX = offsetX;
        const targetZ = -hl;
        const pjX = targetX;
        const pjZ = (-hl + throwM * mm);

        d.prims.push({ t: 'rect', x: pjX - 250, y: pjZ - 210, w: 500, h: 420, layer: 'PROJEKTOR' });

        if (showElectricalLabels) {
          d.prims.push({ t: 'circle', cx: pjX + 320, cy: pjZ, r: 90, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX + 260, y1: pjZ, x2: pjX + 380, y2: pjZ, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX + 320, y1: pjZ - 60, x2: pjX + 320, y2: pjZ + 60, layer: 'ELEKTRIK' });
        }

        if (showProjectorLabels || showElectricalLabels) {
          const parts: string[] = [];
          if (showProjectorLabels) parts.push(`PJ-Ön.${c + 1}`, `H=${mountH.toFixed(2)}m`);
          if (showElectricalLabels) parts.push(`${pWatt}W (230V)`);
          d.prims.push({
            t: 'text',
            x: pjX - 240,
            y: pjZ + 280,
            h: t * 0.65,
            text: parts.join(' | '),
            layer: 'METIN',
          });
        }

        // Ölçü Çizgisi
        if (showThrowDimensions) {
          d.prims.push({ t: 'line', x1: pjX, y1: targetZ, x2: pjX, y2: pjZ, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: pjX - 120, y1: targetZ, x2: pjX + 120, y2: targetZ, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: pjX - 120, y1: pjZ, x2: pjX + 120, y2: pjZ, layer: 'OLCU' });
          d.prims.push({
            t: 'text',
            x: pjX + 80,
            y: (targetZ + pjZ) / 2,
            h: t * 0.6,
            text: `D = ${throwM.toFixed(2)} m`,
            layer: 'OLCU',
          });
        }

        if (showFrustums) {
          const halfSpanMm = (singleW * mm) / 2;
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX - halfSpanMm, y2: targetZ, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX + halfSpanMm, y2: targetZ, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: targetX - halfSpanMm, y1: targetZ, x2: targetX + halfSpanMm, y2: targetZ, layer: 'IMAJ' });
        }
      }
    } else if (wIdx === 2) {
      // SAĞ UZUN DUVAR (X = +hw)
      const wallLen = Math.min(roomL, w.widthM) * mm;
      d.prims.push({
        t: 'line',
        x1: hw - 15,
        y1: -wallLen / 2,
        x2: hw - 15,
        y2: wallLen / 2,
        layer: 'IMAJ',
      });

      for (let c = 0; c < w.cols; c++) {
        totalPjCount++;
        const offsetZ = w.cols === 1 ? 0 : (-totalOptW / 2 + singleW / 2 + c * stepW) * mm;
        const targetZ = offsetZ;
        const targetX = hw;
        const pjX = (hw - throwM * mm);
        const pjZ = targetZ;

        d.prims.push({ t: 'rect', x: pjX - 210, y: pjZ - 250, w: 420, h: 500, layer: 'PROJEKTOR' });

        if (showElectricalLabels) {
          d.prims.push({ t: 'circle', cx: pjX, cy: pjZ + 320, r: 90, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX - 60, y1: pjZ + 320, x2: pjX + 60, y2: pjZ + 320, layer: 'ELEKTRIK' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ + 260, x2: pjX, y2: pjZ + 380, layer: 'ELEKTRIK' });
        }

        if (showProjectorLabels || showElectricalLabels) {
          const parts: string[] = [];
          if (showProjectorLabels) parts.push(`PJ-Sağ.${c + 1}`, `H=${mountH.toFixed(2)}m`);
          if (showElectricalLabels) parts.push(`${pWatt}W (230V)`);
          d.prims.push({
            t: 'text',
            x: pjX - 2000,
            y: pjZ - 50,
            h: t * 0.65,
            text: parts.join(' | '),
            layer: 'METIN',
          });
        }

        // Ölçü Çizgisi
        if (showThrowDimensions) {
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX, y2: pjZ, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: targetX, y1: pjZ - 120, x2: targetX, y2: pjZ + 120, layer: 'OLCU' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ - 120, x2: pjX, y2: pjZ + 120, layer: 'OLCU' });
          d.prims.push({
            t: 'text',
            x: (targetX + pjX) / 2,
            y: pjZ + 80,
            h: t * 0.6,
            text: `D = ${throwM.toFixed(2)} m`,
            layer: 'OLCU',
            anchor: 'middle',
          });
        }

        if (showFrustums) {
          const halfSpanMm = (singleW * mm) / 2;
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX - halfSpanMm, y2: targetZ, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: pjX, y1: pjZ, x2: targetX + halfSpanMm, y2: targetZ, layer: 'PROJEKTOR' });
          d.prims.push({ t: 'line', x1: targetX - halfSpanMm, y1: targetZ, x2: targetX + halfSpanMm, y2: targetZ, layer: 'IMAJ' });
        }
      }
    }
  });

  // ZEMİN PROJEKTÖRLERİ VARSA
  if (floor) {
    const singleW = ('singleProjWidthM' in floor && floor.singleProjWidthM) ? floor.singleProjWidthM : 6.0;
    const singleH = ('singleProjHeightM' in floor && floor.singleProjHeightM) ? floor.singleProjHeightM : 3.75;
    for (let r = 0; r < floor.rows; r++) {
      for (let c = 0; c < floor.cols; c++) {
        totalPjCount++;
        const tz = floor.cols === 1 ? 0 : -hl + (c + 0.5) * (roomL * mm / floor.cols);
        const tx = floor.rows === 1 ? 0 : -hw + (r + 0.5) * (roomW * mm / floor.rows);
        d.prims.push({ t: 'circle', cx: tx, cy: tz, r: 280, layer: 'PROJEKTOR' });
        if (showElectricalLabels) {
          d.prims.push({ t: 'circle', cx: tx, cy: tz + 380, r: 90, layer: 'ELEKTRIK' });
        }
        if (showFrustums) {
          d.prims.push({ t: 'rect', x: tx - (singleH * mm) / 2, y: tz - (singleW * mm) / 2, w: singleH * mm, h: singleW * mm, layer: 'IMAJ' });
        }
        if (showProjectorLabels || showElectricalLabels) {
          const parts: string[] = [];
          if (showProjectorLabels) parts.push(`Zemin-PJ.${c + 1}.${r + 1}`, `D=${floor.throwDistM}m`);
          if (showElectricalLabels) parts.push(`${pWatt}W`);
          d.prims.push({
            t: 'text',
            x: tx + 330,
            y: tz - 60,
            h: t * 0.55,
            text: parts.join(' | '),
            layer: 'METIN',
          });
        }
      }
    }
  }

  // Kullanıcı özel adet girdiyse başlıkta göster
  const displayQty = options.customProjectorQty ?? totalPjCount;

  // 3. DIŞ ODA ÖLÇÜLENDİRME ÇİZGİLERİ (MİMARİ KOTLAR)
  if (showRoomDimensions) {
    const dimOffset = 1500;
    // Yatay Oda Genişliği
    d.prims.push({ t: 'line', x1: -hw, y1: hl + dimOffset, x2: hw, y2: hl + dimOffset, layer: 'OLCU' });
    d.prims.push({ t: 'line', x1: -hw, y1: hl + dimOffset * 0.8, x2: -hw, y2: hl + dimOffset * 1.2, layer: 'OLCU' });
    d.prims.push({ t: 'line', x1: hw, y1: hl + dimOffset * 0.8, x2: hw, y2: hl + dimOffset * 1.2, layer: 'OLCU' });
    d.prims.push({ t: 'text', x: 0, y: hl + dimOffset + t * 0.4, h: t * 0.85, text: `ODA GENİŞLİĞİ: ${roomW.toFixed(2)} m (${Math.round(roomW * mm)} mm)`, layer: 'OLCU', anchor: 'middle' });

    // Dikey Oda Uzunluğu
    d.prims.push({ t: 'line', x1: hw + dimOffset, y1: -hl, x2: hw + dimOffset, y2: hl, layer: 'OLCU' });
    d.prims.push({ t: 'line', x1: hw + dimOffset * 0.8, y1: -hl, x2: hw + dimOffset * 1.2, y2: -hl, layer: 'OLCU' });
    d.prims.push({ t: 'line', x1: hw + dimOffset * 0.8, y1: hl, x2: hw + dimOffset * 1.2, y2: hl, layer: 'OLCU' });
    d.prims.push({ t: 'text', x: hw + dimOffset + t * 0.4, y: 0, h: t * 0.85, text: `ODA UZUNLUĞU: ${roomL.toFixed(2)} m (${Math.round(roomL * mm)} mm)`, layer: 'OLCU' });
  }

  // 4. ELEKTRİKÇİ VE MONTAJ EKİBİ İÇİN TEKNİK ANTET VE LEJANT
  if (showTitleBlock) {
    const dimOffset = 1500;
    d.prims.push({
      t: 'text',
      x: -hw,
      y: -hl - dimOffset - t * 0.5,
      h: t * 1.1,
      text: `MİMARİ PROJEKSİYON VE ELEKTRİK YERLEŞİM PLANI — TOPLAM ${displayQty} ADET PROJEKTÖR`,
      layer: 'METIN',
    });
    d.prims.push({
      t: 'text',
      x: -hw,
      y: -hl - dimOffset - t * 1.8,
      h: t * 0.75,
      text: `Mimari Ölçüler: ${roomW}m × ${roomL}m × Tavan: ${roomH}m | Birim Projektör: ${pWatt}W | Toplam Yük: ${displayQty * pWatt}W`,
      layer: 'METIN',
    });
    d.prims.push({
      t: 'text',
      x: -hw,
      y: -hl - dimOffset - t * 2.9,
      h: t * 0.65,
      text: `LEJANT: [Kırmızı Daire]: 230V 16A Priz / Besleme Linye Noktası  |  [Mavi Kutu]: Projektör Askı Noktası  |  D: Duvardan Atım Mesafesi (m)  |  H: Yerden Askı Yüksekliği (m)`,
      layer: 'METIN',
    });
  }

  return d;
}

export interface ElectricalSingleLineOptions {
  showBusSpecs?: boolean;        // Bara & Besleme bilgileri
  showBreakerSpecs?: boolean;    // Sigorta & Kesici akımları (16A B-Tipi)
  showCableSpecs?: boolean;      // Kablo kesiti ve mesafesi (3x2.5mm² / 25m / dU)
  showPhaseAndCurrent?: boolean; // Faz ve linye akımı (L1 | Ib: 9.8A)
  showLoadDetails?: boolean;     // Yük kutusu ve watt detayları
}

/**
 * ELEKTRİK MÜHENDİSLİĞİ VE SAHA TEKNİSYENİ İÇİN FERAH, OKUNAKLI TEK HAT ŞEMASI (SINGLE-LINE DIAGRAM)
 * - Geniş kolon aralığı (sp = 145) ile metinlerin çakışmasını ve birbirine girmesini tamamen engeller
 * - Seçmeli metin görünümü (seçenekler ile kapatılıp açılabilir)
 * - Pano ana kesici, RCD, linyeler ve gerilim düşümü hesapları net okunur
 */
export function electricalSingleLine(
  loads: Load[],
  circuits: Circuit[],
  s: Supply,
  res: ElectricalResult,
  options: ElectricalSingleLineOptions = {}
): Drawing {
  const d = newDrawing('Elektrik Tek Hat Şeması (Single-Line)', 'birim');
  const {
    showBusSpecs = true,
    showBreakerSpecs = true,
    showCableSpecs = true,
    showPhaseAndCurrent = true,
    showLoadDetails = true,
  } = options;

  // Ferah kolon genişliği: 145 birim (yazıların ve kutuların üst üste binmesini önler)
  const sp = 145;
  const h = 4.2;
  const n = Math.max(1, circuits.length);
  const busY = 0;
  const busW = Math.max(sp * n + 80, 240);

  // 1. BESLEME VE ANA PANO GİRİŞİ (ÜST KISIM)
  const boxW = 140;
  const boxH = 20;
  d.prims.push({ t: 'rect', x: busW / 2 - boxW / 2, y: 70, w: boxW, h: boxH, layer: 'ELEKTRIK' });
  d.prims.push({
    t: 'text',
    x: busW / 2,
    y: 78,
    h: h * 1.15,
    text: `ŞEBEKE: ${s.voltage} V ${s.phases === 3 ? '3 Faz (3P+N+PE)' : '1 Faz (1P+N+PE)'} 50 Hz`,
    layer: 'METIN',
    anchor: 'middle',
  });

  // Ana Kesici / Giriş Sigortası (70'den 0'a)
  const mainBrkA = res.mainBreakerA || (s.phases === 3 ? 63 : 40);
  breakerClean(
    d,
    busW / 2,
    70,
    busY,
    showBreakerSpecs ? `ANA KESİCİ: ${mainBrkA} A (30mA RCD)` : 'ANA KESİCİ'
  );

  // 2. ANA DAĞITIM BARASI (BUSBAR)
  d.prims.push({ t: 'line', x1: 20, y1: busY, x2: busW - 20, y2: busY, layer: 'ELEKTRIK' });
  d.prims.push({ t: 'line', x1: 20, y1: busY + 1.2, x2: busW - 20, y2: busY + 1.2, layer: 'ELEKTRIK' });

  if (showBusSpecs) {
    d.prims.push({
      t: 'text',
      x: busW / 2,
      y: busY + 6,
      h: h * 1.05,
      text: `ANA DAĞITIM BARASI (Cu) | Toplam Yük: ${Math.round(res.totalW)} W | Talep: ${Math.round(res.demandW)} W | Ib: ${res.totalIbA.toFixed(1)} A`,
      layer: 'METIN',
      anchor: 'middle',
    });
  }

  // 3. HER LİNYE İÇİN KOLON DAĞITIMI
  const byId = new Map(loads.map(l => [l.id, l]));

  circuits.forEach((c, i) => {
    const x = i * sp + sp / 2 + (busW - sp * n) / 2;
    const cr = res.circuits[i];

    // Linye Sigortası (0'dan -40'a)
    const brkLabel = showBreakerSpecs ? `${cr?.breakerA ?? 16} A (B-Tipi)` : 'Sigorta';
    breakerClean(d, x, busY, -40, brkLabel);

    // Linye Başlığı (Büyük ve Ferah)
    d.prims.push({
      t: 'text',
      x,
      y: -48,
      h: h * 1.15,
      text: c.name,
      layer: 'METIN',
      anchor: 'middle',
    });

    // Kablo Hattı Çizgisi
    d.prims.push({ t: 'line', x1: x, y1: -40, x2: x, y2: -105, layer: 'ELEKTRIK' });

    // Kablo Bilgisi
    if (showCableSpecs) {
      const cableCores = s.phases === 3 && c.phase === '3P' ? '5x' : '3x';
      const cableSize = `${cableCores}${c.cableMm2 ?? 2.5} mm² NYM / Halogen-Free`;
      d.prims.push({
        t: 'text',
        x,
        y: -64,
        h: h * 0.95,
        text: cableSize,
        layer: 'METIN',
        anchor: 'middle',
      });
      d.prims.push({
        t: 'text',
        x,
        y: -74,
        h: h * 0.88,
        text: `Mesafe: ${c.lengthM ?? 25} m | Gerilim Düşümü: %${cr?.dropPct?.toFixed(2) ?? '0.4'}`,
        layer: 'METIN',
        anchor: 'middle',
      });
    }

    // Faz ve Akım Bilgisi
    if (showPhaseAndCurrent) {
      d.prims.push({
        t: 'text',
        x,
        y: -86,
        h: h * 0.92,
        text: `Faz: ${c.phase} | Akım Ib: ${cr?.ibA.toFixed(1) ?? '-'} A`,
        layer: 'METIN',
        anchor: 'middle',
      });
    }

    // 4. LİNYEYE BAĞLI YÜKLER KUTUSU
    c.loadIds.forEach((id, k) => {
      const l = byId.get(id);
      if (!l) return;
      const yBox = -115 - k * 36;
      const loadBoxW = 126;
      const loadBoxH = 26;

      d.prims.push({
        t: 'rect',
        x: x - loadBoxW / 2,
        y: yBox - loadBoxH,
        w: loadBoxW,
        h: loadBoxH,
        layer: 'GEOMETRI',
      });

      // Yük Bağlantı Çizgisi
      d.prims.push({ t: 'line', x1: x, y1: -105, x2: x, y2: yBox, layer: 'ELEKTRIK' });

      if (showLoadDetails) {
        // Cihaz Adı ve Adet
        d.prims.push({
          t: 'text',
          x,
          y: yBox - 10,
          h: h * 1.05,
          text: `${l.name} (${l.qty} Adet)`,
          layer: 'METIN',
          anchor: 'middle',
        });
        // Güç ve Güç Faktörü (W & Cos fi)
        d.prims.push({
          t: 'text',
          x,
          y: yBox - 20,
          h: h * 0.9,
          text: `Toplam Güç: ${Math.round(l.qty * l.powerW)} W (Cos φ ${l.pf || 0.95})`,
          layer: 'METIN',
          anchor: 'middle',
        });
      }
    });
  });

  // 5. TEKNİK NOTLAR VE STANDART ANTETİ (ALT KISIM)
  const notesY = -185;
  d.prims.push({
    t: 'text',
    x: 20,
    y: notesY,
    h: h * 1.05,
    text: `⚡ ELEKTRİK PROJE NOTLARI: T.C. İç Tesisleri ve IEC 60898 Standartları | Linyelerde 3x2.5mm² Halogen-Free Kablo Kullanılacaktır.`,
    layer: 'METIN',
  });
  d.prims.push({
    t: 'text',
    x: 20,
    y: notesY - 12,
    h: h * 0.88,
    text: `Tüm prizler projeksiyon askı aparatının 50cm yakınına montaj edilecek olup, 30mA Kaçak Akım Rölesi korumalıdır.`,
    layer: 'METIN',
  });

  void STD_LAYERS;
  return d;
}

/** Ferah ve Net Okunan Kesici / Sigorta Sembolü */
function breakerClean(d: Drawing, x: number, yTop: number, yBot: number, label: string) {
  const mid = (yTop + yBot) / 2;
  // Üst iletken
  d.prims.push({ t: 'line', x1: x, y1: yTop, x2: x, y2: mid + 8, layer: 'ELEKTRIK' });
  // Kontak açılma çizgisi (Bıçak kontak)
  d.prims.push({ t: 'line', x1: x, y1: mid + 8, x2: x + 7, y2: mid - 5, layer: 'ELEKTRIK' });
  // Alt iletken
  d.prims.push({ t: 'line', x1: x, y1: mid - 8, x2: x, y2: yBot, layer: 'ELEKTRIK' });
  // Termik/Manyetik Koruma Çapraz İşareti
  d.prims.push({ t: 'line', x1: x - 3.5, y1: mid - 8, x2: x + 3.5, y2: mid - 8, layer: 'ELEKTRIK' });
  // Sigorta Etiketi (Sağda, net ve açıkça okunur)
  d.prims.push({ t: 'text', x: x + 10, y: mid - 2, h: 4.2, text: label, layer: 'METIN' });
}
