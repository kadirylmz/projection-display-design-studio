/**
 * Müşteri sunumu ve teknik rapor üretici motoru (HTML/Yazdırılabilir PDF + SVG diyagram gömme).
 * Kabul Testi 10: Dışa aktarılan raporlar doğru proje verilerini ve diyagramları içermelidir.
 * Dil desteği: Türkçe ('tr') ve İngilizce ('en').
 */
import { solveProjection } from './throw';
import { computeLux } from './lux';
import { computeLayout, ProjectorSlot } from './multiproj';
import { Cabinet, ledFromCabinets } from './led';
import { analyze, Circuit, Load, Supply } from './electrical';
import { toSvg } from './drawing';
import { electricalSingleLine, ledElevation, mappingDrawing } from './drawings';
import { layoutToSvg } from './exporters';
import { round } from './units';
import { InterProjectorAnalysis } from './interprojector';

export type ReportLang = 'tr' | 'en';

export interface ReportSectionFlags {
  summary: boolean;
  room3d: boolean;
  architecturalPlan: boolean;
  interProjector: boolean;
  projection: boolean;
  lux: boolean;
  multiProjector: boolean;
  led: boolean;
  electrical: boolean;
  drawings2d: boolean;
  equipmentList: boolean;
  assumptionsAndWarnings: boolean;
}

export const DEFAULT_SECTIONS: ReportSectionFlags = {
  summary: true,
  room3d: true,
  architecturalPlan: true,
  interProjector: false,
  projection: true,
  lux: true,
  multiProjector: true,
  led: true,
  electrical: true,
  drawings2d: true,
  equipmentList: true,
  assumptionsAndWarnings: true,
};

export interface ReportProjectMeta {
  companyName: string;
  companyLogoDataUrl?: string;
  customer: string;
  projectName: string;
  location: string;
  category: string;
  date: string;
  revision: number;
  description: string;
  notes?: string;
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
  archPlanRotation?: 0 | 90 | 180 | 270;
}

export interface PhotometricReportSurface {
  surfaceId: string;
  surfaceName: string;
  surfaceType: string; // 'wall' | 'floor' | 'ceiling'
  widthM: number;
  heightM: number;
  projectorCount: number;
  avgLux: number;
  minLux: number;
  maxLux: number;
  uniformityU0: number; // Emin / Eavg
  uniformityU1: number; // Emin / Emax
  luminanceNits: number;
  luminanceFL: number;
  screenGain: number;
  ambientLux: number;
  ambientContrastRatio: number;
  isManualLux?: boolean;
  heatmapSnapshotUrl?: string;
  distributionRows?: {
    code: string;
    name?: string;
    rowName?: string;
    startX: number;
    endX: number;
    widthM: number;
    centerX: number;
    throwDistM: number;
    throwRatio: number;
    overlapText: string;
  }[];
}

export interface ReportPayload {
  lang: ReportLang;
  meta: ReportProjectMeta;
  sections: ReportSectionFlags;
  room3dSnapshotUrl?: string;
  room3dSnapshots?: string[];
  room3dNotes?: string;
  architecturalPlanSvg?: string;
  interProjectorAnalysis?: InterProjectorAnalysis;
  projection?: {
    screenName?: string;
    screenPhotoUrl?: string;
    projectorName: string;
    lensName: string;
    imageWidthM: number;
    distanceM: number;
    aspectW: number;
    aspectH: number;
    throwMin?: number;
    throwMax?: number;
    lensFrontProtrusionM?: number;
    ansiLumens?: number;
    resolution?: string;
    technology?: string;
    throwRatio?: number;
    verticalOffsetM?: number;
    horizontalOffsetM?: number;
  };
  lux?: {
    ansiLumens: number[];
    brightnessPct: number;
    widthM: number;
    heightM: number;
    gain: number;
    ambientLux: number;
  };
  photometricSurfaces?: PhotometricReportSurface[];
  mappingSlots?: ProjectorSlot[];
  led?: {
    cabinet: Cabinet;
    cols: number;
    rows: number;
    spareFraction: number;
  };
  electrical?: {
    loads: Load[];
    circuits: Circuit[];
    supply: Supply;
  };
  equipmentList?: { category: string; manufacturer: string; model: string; qty: number; notes?: string }[];
  plannerSurfaces?: any[];
  enabledSurfaceIds?: string[];
}

const T: Record<ReportLang, Record<string, string>> = {
  tr: {
    reportTitle: 'AV MÜHENDİSLİK & TASARIM RAPORU',
    customer: 'Müşteri',
    project: 'Proje Adı',
    location: 'Konum',
    category: 'Kategori',
    date: 'Tarih',
    revision: 'Revizyon',
    summary: '1. Proje Özeti',
    projection: '2. Projektör & Lens Hesaplamaları',
    lux: '3. Fotometrik (Lux & Parlaklık) Analizi',
    multi: '4. Çoklu Projektör & Piksel Haritalama',
    led: '5. LED Duvar Spesifikasyonları',
    electrical: '6. Elektrik Yük & Tek Hat Şeması',
    drawings: '7. 2B Teknik Çizimler',
    equipment: '8. Ekipman Listesi',
    assumptions: '9. Teknik Varsayımlar, Uyarılar ve Sınırlamalar',
    room3d: '3B Simülasyon & 2B Görsel Paftalar',
    archPlan: 'Mimari Yerleşim & CAD Paftası',
    interProjector: 'Projeksiyonlar Arası Montaj, Eksen ve Aralık Cetveli',
    projector: 'Projektör',
    lens: 'Lens',
    imgSize: 'Görüntü Boyutu (G × Y)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens → Yüzey Mesafesi',
    chassisDist: 'Şasi Ön Yüzü → Yüzey',
    status: 'Durum',
    achievable: 'Ulaşılabilir',
    notAchievable: 'Fiziksel Sınır Dışı',
    totalFlux: 'Toplam Işık Akısı',
    illuminance: 'Ortalama Aydınlatma (Lux)',
    luminance: 'Ekran Parlaklığı (Nit / fL)',
    canvasRes: 'Birleşik Kanvas Çözünürlüğü',
    overlapCount: 'Örtüşme Bölgesi Sayısı',
    physSize: 'Fiziksel Boyut',
    nativeRes: 'Native Çözünürlük',
    cabinets: 'Kabin Adedi (+Yedek)',
    powerWeight: 'Güç (Tipik/Maks) & Ağırlık',
    totalPower: 'Toplam Güç / Talep Gücü',
    mainBreaker: 'Önerilen Ana Kesici',
    item: 'Kalem',
    qty: 'Adet',
    notes: 'Notlar',
  },
  en: {
    reportTitle: 'AV ENGINEERING & DESIGN REPORT',
    customer: 'Customer',
    project: 'Project Name',
    location: 'Location',
    category: 'Category',
    date: 'Date',
    revision: 'Revision',
    summary: '1. Project Summary',
    projection: '2. Projector & Lens Calculations',
    lux: '3. Photometric (Lux & Brightness) Analysis',
    multi: '4. Multi-Projector & Pixel Mapping',
    led: '5. LED Wall Specifications',
    electrical: '6. Electrical Load & Single-Line Diagram',
    drawings: '7. 2D Technical Drawings',
    equipment: '8. Equipment List',
    assumptions: '9. Technical Assumptions, Warnings & Limitations',
    room3d: '3D Simulation & 2D Visual Layouts',
    archPlan: 'Architectural Layout & CAD Plan',
    interProjector: 'Inter-Projector Spacing & Mechanical Installation Schedule',
    projector: 'Projector',
    lens: 'Lens',
    imgSize: 'Image Dimensions (W × H)',
    diagonal: 'Diagonal',
    throwRatio: 'Throw Ratio',
    optDist: 'Lens-to-Surface Distance',
    chassisDist: 'Chassis-to-Surface Distance',
    status: 'Status',
    achievable: 'Achievable',
    notAchievable: 'Out of Physical Limits',
    totalFlux: 'Total Luminous Flux',
    illuminance: 'Average Illuminance (Lux)',
    luminance: 'Screen Luminance (Nits / fL)',
    canvasRes: 'Combined Canvas Resolution',
    overlapCount: 'Overlap Region Count',
    physSize: 'Physical Dimensions',
    nativeRes: 'Native Resolution',
    cabinets: 'Cabinet Quantity (+Spare)',
    powerWeight: 'Power (Typ/Max) & Weight',
    totalPower: 'Total Power / Demand Power',
    mainBreaker: 'Recommended Main Breaker',
    item: 'Item',
    qty: 'Qty',
    notes: 'Notes',
  },
};

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function generateSurfaceMultiSvg(s: any): string {
  const wM = +(s.effectiveWidthM || s.widthM || 10).toFixed(2);
  const hM = +(s.effectiveHeightM || s.heightM || 4).toFixed(2);
  const cols = Math.max(1, s.cols || 1);
  const rows = Math.max(1, s.rows || 1);
  const singleW = +(s.singleProjWidthM || (wM / cols)).toFixed(2);
  const singleH = +(s.singleProjHeightM || (hM / rows)).toFixed(2);
  const ovX = s.overlapX || 15;
  const ovY = s.overlapY || 10;

  const pad = 42;
  const canvasW = 920;
  const aspect = wM / Math.max(0.4, hM);
  const drawW = canvasW - pad * 2;
  const drawH = Math.max(160, Math.min(380, Math.round(drawW / aspect)));
  const canvasH = drawH + pad * 2 + 32;

  const scaleX = drawW / wM;
  const scaleY = drawH / hM;

  const rects: string[] = [];
  const overlaps: string[] = [];
  const labels: string[] = [];

  const ovRatioX = (s.projW && s.projW > 0 ? (s.ovPxX || 0) / s.projW : ovX / 100);
  const stepW_M = cols > 1 ? singleW * (1 - ovRatioX) : singleW;
  const stepH_M = rows > 1 ? singleH * 0.85 : singleH;

  const bgRect = '<rect x="' + pad + '" y="' + pad + '" width="' + drawW + '" height="' + drawH + '" fill="#0f172a" stroke="#334155" stroke-width="2" stroke-dasharray="6 4"/>';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xM = cols === 1 ? 0 : c * stepW_M;
      const yM = rows === 1 ? 0 : r * stepH_M;
      const xPx = pad + xM * scaleX;
      const yPx = pad + yM * scaleY;
      const wPx = Math.min(drawW, singleW * scaleX);
      const hPx = Math.min(drawH, singleH * scaleY);

      rects.push('<rect x="' + xPx.toFixed(1) + '" y="' + yPx.toFixed(1) + '" width="' + wPx.toFixed(1) + '" height="' + hPx.toFixed(1) + '" fill="' + (s.color || '#38bdf8') + '" fill-opacity="0.18" stroke="' + (s.color || '#38bdf8') + '" stroke-width="2"/>');

      const cx = xPx + wPx / 2;
      const cy = yPx + hPx / 2;
      labels.push(
        '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="4.5" fill="#fde047" stroke="#020617" stroke-width="1.2"/>' +
        '<line x1="' + (cx - 9).toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + (cx + 9).toFixed(1) + '" y2="' + cy.toFixed(1) + '" stroke="#fde047" stroke-width="1.4"/>' +
        '<line x1="' + cx.toFixed(1) + '" y1="' + (cy - 9).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + (cy + 9).toFixed(1) + '" stroke="#fde047" stroke-width="1.4"/>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (cy - 12).toFixed(1) + '" font-size="11.5" fill="#f8fafc" font-weight="bold" font-family="system-ui, sans-serif" text-anchor="middle">PJ ' + (c + 1) + (rows > 1 ? '.' + (r + 1) : '') + '</text>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (cy + 19).toFixed(1) + '" font-size="10" fill="#94a3b8" font-family="monospace" text-anchor="middle">' + (s.customW || 1920) + '×' + (s.customH || 1200) + ' px</text>'
      );

      if (c < cols - 1) {
        const nextXPx = pad + (c + 1) * stepW_M * scaleX;
        const ovWPx = (xPx + wPx) - nextXPx;
        if (ovWPx > 0) {
          overlaps.push(
            '<rect x="' + nextXPx.toFixed(1) + '" y="' + yPx.toFixed(1) + '" width="' + ovWPx.toFixed(1) + '" height="' + hPx.toFixed(1) + '" fill="#22c55e" fill-opacity="0.35" stroke="#16a34a" stroke-width="1.2" stroke-dasharray="3 3"/>' +
            '<text x="' + (nextXPx + ovWPx / 2).toFixed(1) + '" y="' + (yPx + hPx - 8).toFixed(1) + '" font-size="9" fill="#4ade80" font-family="sans-serif" font-weight="bold" text-anchor="middle">%' + ovX + ' Blend</text>'
          );
        }
      }
    }
  }

  const dimTop = '<text x="' + (canvasW / 2).toFixed(1) + '" y="' + (pad - 14).toFixed(1) + '" font-size="11.5" fill="#cbd5e1" font-family="monospace" font-weight="bold" text-anchor="middle">Yüzey Açınım Genişliği: ' + wM + ' m | Yükseklik: ' + hM + ' m</text>';
  const dimBot = '<text x="' + (canvasW / 2).toFixed(1) + '" y="' + (canvasH - 12).toFixed(1) + '" font-size="10.5" fill="#94a3b8" font-family="monospace" text-anchor="middle">Optik Lens Atımı: D = ' + s.throwDistM + 'm (TR: ' + s.throwRatio + ':1) · Çözünürlük: ' + (s.netW || '—') + '×' + (s.netH || '—') + ' px (' + (s.distMmPerPx || '—') + ' mm/px)</text>';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + canvasW + ' ' + canvasH + '" width="100%" height="auto" style="max-height: 380px; display: block; margin: auto;">' +
    '<rect width="100%" height="100%" fill="#070b14"/>' +
    bgRect +
    rects.join('') +
    overlaps.join('') +
    labels.join('') +
    dimTop +
    dimBot +
  '</svg>';
}

export function buildReportHtml(p: ReportPayload): string {
  const tr = T[p.lang];
  const m = p.meta;
  const warnings: string[] = [];
  const assumptions: string[] = [];
  const blocks: string[] = [];

  // 1. PROJE ÖZETİ
  if (p.sections.summary) {
    let elAnalysis: ReturnType<typeof analyze> | null = null;
    if (p.electrical) {
      try {
        elAnalysis = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
      } catch (err) {
        console.warn('Report electrical analyze fallback:', err);
      }
    }

    const totalPj = p.interProjectorAnalysis?.totalProjectors ?? (p.mappingSlots?.length ?? 1);
    const totalW = elAnalysis?.totalW ?? (p.interProjectorAnalysis?.totalPowerW ?? 0);
    const totalIbA = elAnalysis?.totalIbA ?? (totalW > 0 ? (totalW / (230 * 0.95)) : 0);
    const roomDims = p.interProjectorAnalysis?.roomDimensions;

    blocks.push(`<section class="report-section">
      <h2>${tr.summary}</h2>
      <p class="summary-desc">${esc(m.description || 'Bu rapor, mimari mekan içerisindeki projeksiyon yüzeylerinin, cihaz yerleşimlerinin, montaj eksen mesafelerinin ve elektrik altyapısının mühendislik detaylarını içermektedir.')}</p>
      
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-val text-sky">${totalPj} Adet</div>
          <div class="metric-lbl">Toplam Projektör</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-amber">${(totalW / 1000).toFixed(2)} kW</div>
          <div class="metric-lbl">Toplam Kurulu Güç (${Math.round(totalW)} W)</div>
        </div>
        <div class="metric-card">
          <div class="metric-val text-rose">${totalIbA.toFixed(1)} A</div>
          <div class="metric-lbl">Toplam İşletme Akımı (Ib)</div>
        </div>
        ${roomDims ? `
        <div class="metric-card">
          <div class="metric-val text-purple">${roomDims.widthM}m × ${roomDims.lengthM}m × ${roomDims.heightM}m</div>
          <div class="metric-lbl">Oda Ebatları (G × U × Y)</div>
        </div>` : ''}
      </div>
      
      ${m.notes ? `<div class="note-box"><b>${tr.notes}:</b> ${esc(m.notes)}</div>` : ''}
    </section>`);
  }

  // 2. 3B SİMÜLASYON & PERSPEKTİF ODA GÖRÜNÜŞÜ (Seçiliyse)
  const snapshots: string[] = (p.room3dSnapshots && p.room3dSnapshots.length > 0)
    ? p.room3dSnapshots
    : (m.room3dSnapshots && m.room3dSnapshots.length > 0)
      ? m.room3dSnapshots
      : (p.room3dSnapshotUrl || m.room3dSnapshotUrl ? [p.room3dSnapshotUrl || m.room3dSnapshotUrl!] : []);

  if (p.sections.room3d && (snapshots.length > 0 || p.interProjectorAnalysis)) {
    blocks.push(`<section class="report-section room3d-section">
      <h2>${tr.room3d}</h2>
      ${snapshots.length > 0 ? `
        <div class="three-d-gallery">
          ${snapshots.map((url, idx) => `
            <div class="three-d-card">
              <div class="three-d-card-label">Görsel #${idx + 1}</div>
              <img src="${esc(url)}" alt="3B Simülasyon Görünüşü #${idx + 1}" class="three-d-img" />
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-3d-box">
          <p>📸 <b>3B & 2B Görsel Simülasyonlar:</b> <i>"3D Oda", "2B Açınım" veya "CAD Çizim" sekmelerinden "📋 Rapora Ekle" butonuna tıklayarak istediğiniz kamera açısından 3B simülasyonları ve 2B açınım paftalarını buraya aktarabilirsiniz.</i></p>
        </div>
      `}
    </section>`);
  }

  // 3. PROJEKSİYONLAR ARASI MONTAJ, EKSEN VE ARALIK CETVELİ (INTER-PROJECTOR SPACING)
  if (p.sections.interProjector && p.interProjectorAnalysis) {
    const ip = p.interProjectorAnalysis;

    // Yüzey Özeti Tablosu
    const surfSummaryRows = ip.surfaceStats.map(s => `
      <tr>
        <td><b>${esc(s.surfaceName)}</b></td>
        <td>${s.surfaceType === 'floor' ? 'Zemin (Tavandan Aşağı)' : 'Dikey Duvar'}</td>
        <td>${s.surfaceWidthM}m × ${s.surfaceHeightM}m</td>
        <td><b>${s.projectorCount} Adet</b> (${s.cols}×${s.rows})</td>
        <td>${s.singleWidthM}m × ${s.singleHeightM}m</td>
        <td class="highlight-cell">${s.spacingM > 0 ? `${s.spacingM} m` : '—'}</td>
        <td class="highlight-cell">${s.overlapWidthM} m (%${s.overlapPct})</td>
        <td>D = ${s.throwDistM} m</td>
        <td>H = ${s.mountHeightM} m</td>
        <td><b>${s.totalPowerW} W</b></td>
      </tr>
    `).join('');

    // Tek Tek Her Projektörün Detaylı Montaj Cetveli
    const pjDetailRows = ip.projectors.map(pj => `
      <tr>
        <td class="pj-id-cell"><b>${esc(pj.id)}</b></td>
        <td>${esc(pj.surfaceName)}</td>
        <td class="measure-cell">${pj.leftEdgeDistM.toFixed(2)} m</td>
        <td class="measure-cell highlight-cell"><b>${pj.spacingToNextM !== null ? `${pj.spacingToNextM.toFixed(2)} m` : '— (Son Cihaz)'}</b></td>
        <td class="measure-cell">${pj.overlapWidthM.toFixed(2)} m (%${pj.overlapPct})</td>
        <td class="measure-cell">${pj.throwDistM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.mountHeightM.toFixed(2)} m</td>
        <td class="measure-cell">${pj.ceilingDistM.toFixed(2)} m</td>
        <td class="coord-cell">X: ${pj.worldPos[0].toFixed(2)}<br/>Z: ${pj.worldPos[2].toFixed(2)}</td>
        <td><span class="badge-circuit">${esc(pj.circuitId)}</span> (${esc(pj.circuitPhase)})</td>
      </tr>
    `).join('');

    // Köşe Geçişleri (Varsa)
    let cornerBlock = '';
    if (ip.cornerTransitions.length > 0) {
      const cornerRows = ip.cornerTransitions.map(c => `
        <tr>
          <td><b>${esc(c.cornerName)}</b></td>
          <td><b>${esc(c.fromProjId)} ↔ ${esc(c.toProjId)}</b></td>
          <td class="highlight-cell"><b>${c.euclideanDistM.toFixed(2)} m</b></td>
          <td>${c.angleDeg}°</td>
          <td>${esc(c.notes)}</td>
        </tr>
      `).join('');

      cornerBlock = `
        <h3 class="sub-heading">Köşe Geçişleri & 3B Lensler Arası Kuş Uçuşu Mesafeler</h3>
        <table class="compact-table">
          <thead>
            <tr>
              <th>Köşe Tanımı</th>
              <th>Cihaz Çifti</th>
              <th>3B Lens Mesafesi (D<sub>3D</sub>)</th>
              <th>Köşe Açısı</th>
              <th>Mühendislik Notu</th>
            </tr>
          </thead>
          <tbody>${cornerRows}</tbody>
        </table>
      `;
    }

    blocks.push(`<section class="report-section">
      <h2>${tr.interProjector}</h2>
      <p class="section-intro">Şantiye ve mekanik montaj ekiplerinin sahada lazer metre ile doğrudan uygulayabileceği eksen aralıkları, sol referans kenar mesafeleri, tavan askı borusu boyları ve linye bağlantıları aşağıda listelenmiştir.</p>

      <h3 class="sub-heading">Yüzey Bazlı Montaj & Eksen Özeti</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Yüzey</th>
            <th>Tip</th>
            <th>Fiziksel Ebat</th>
            <th>PJ Adet</th>
            <th>1 PJ Açınımı</th>
            <th>Eksen Aralığı (ΔX)</th>
            <th>Örtüşme (Blend)</th>
            <th>Atım (D)</th>
            <th>Yükseklik (H)</th>
            <th>Güç</th>
          </tr>
        </thead>
        <tbody>${surfSummaryRows}</tbody>
      </table>

      <h3 class="sub-heading">Bireysel Projektör Montaj & Mesafe Matrisi (Cihaz Başı Cetvel)</h3>
      <table class="compact-table pj-matrix-table">
        <thead>
          <tr>
            <th>Cihaz Kodu</th>
            <th>Yüzey</th>
            <th>Sol Kenara Mesafe</th>
            <th>Sonraki PJ Eksen Aralığı (ΔX)</th>
            <th>Blend Bölgesi</th>
            <th>Atım Mesafesi (D)</th>
            <th>Montaj Kotu (H)</th>
            <th>Tavandan Askı</th>
            <th>3B Koordinatlar (m)</th>
            <th>Linye & Faz</th>
          </tr>
        </thead>
        <tbody>${pjDetailRows}</tbody>
      </table>

      ${cornerBlock}

      <div class="guideline-card">
        <b>🛠 Mekanik Montaj & Şantiye Standartları:</b>
        <ul>
          <li><b>Eksen Hizalaması:</b> Komşu projektör eksen aralıkları (ΔX) montaj sırasında lazer nivo ve lazer şakül ile ±5mm tolerans sınırları içinde sabitlenmelidir.</li>
          <li><b>Titreşim Yalıtımı:</b> Truss ve tavan askı borularında titreşim emici kauçuk flanşlar kullanılmalı, havalandırma kanalları veya hoparlör sub-bass rezonanslarından izole edilmelidir.</li>
          <li><b>Isı & Servis Boşluğu:</b> Cihazların egzoz hava çıkışları önünde minimum 50cm, arka filtre emişlerinde minimum 30cm açık alan bırakılmalıdır.</li>
        </ul>
      </div>
    </section>`);
  }

  // 4. PROJEKSİYON & LENS HESAPLARI
  if (p.sections.projection && p.projection && p.projection.imageWidthM > 0 && p.projection.distanceM > 0) {
    const pr = p.projection;
    const res = solveProjection({
      imageWidth: pr.imageWidthM,
      distance: pr.distanceM,
      aspect: { w: pr.aspectW, h: pr.aspectH },
      throwRange: pr.throwMin && pr.throwMax ? { min: pr.throwMin, max: pr.throwMax } : undefined,
      lensFrontProtrusion: pr.lensFrontProtrusionM ?? 0,
    });
    warnings.push(...res.warnings);
    assumptions.push(...res.approximations);
    blocks.push(`<section class="report-section">
      <h2>${tr.projection}</h2>
      <table><tbody>
        ${pr.screenName ? `<tr><th>${p.lang === 'en' ? 'Screen Name' : 'Ekran Adı'}</th><td colspan="3"><b>${esc(pr.screenName)}</b></td></tr>` : ''}
        <tr><th>${tr.projector}</th><td>${esc(pr.projectorName)}</td><th>${tr.lens}</th><td>${esc(pr.lensName)}</td></tr>
        <tr><th>${tr.imgSize} &amp; ${p.lang === 'en' ? 'Area' : 'Alan'}</th><td>${round(res.imageWidth, 3)} × ${round(res.imageHeight, 3)} m · <b>${round(res.imageWidth * res.imageHeight, 2)} m²</b></td><th>${tr.diagonal}</th><td>${round(res.diagonal / 0.0254, 1)}" (${round(res.diagonal, 3)} m)</td></tr>
        <tr><th>${tr.throwRatio}</th><td>${round(res.throwRatio, 4)}:1</td><th>${tr.optDist}</th><td>${round(res.lensToSurface, 3)} m${Math.abs(res.chassisFrontToSurface - res.lensToSurface) > 0.005 ? ` (${p.lang === 'en' ? 'Chassis' : 'Şasi'}: ${round(res.chassisFrontToSurface, 3)} m)` : ''}</td></tr>

        ${pr.ansiLumens ? `<tr><th>${p.lang === 'en' ? 'Light Output (ANSI Lumens)' : 'Işık Gücü (ANSI Lümen)'}</th><td><b>${pr.ansiLumens.toLocaleString('tr-TR')} ANSI lm</b>${pr.technology ? ` · ${esc(pr.technology)}` : ''}</td><th>${p.lang === 'en' ? 'Resolution & Aspect' : 'Çözünürlük &amp; Oran'}</th><td>${pr.resolution ? esc(pr.resolution) : `${pr.aspectW}:${pr.aspectH}`}</td></tr>` : ''}
        ${res.distanceMin && res.distanceMax ? `<tr><th>${p.lang === 'en' ? 'Lens Throw Range' : 'Lens Mesafe Aralığı'}</th><td>${round(res.distanceMin, 2)} – ${round(res.distanceMax, 2)} m</td><th>${p.lang === 'en' ? 'Zoom Position' : 'Zoom Konumu'}</th><td>${res.zoomPosition !== undefined ? `%${round(res.zoomPosition * 100, 0)}` : '—'}</td></tr>` : ''}
      </tbody></table>
      ${(() => {
        // Ön Görünüş SVG (Ekran Boyutu)
        const fW = 380, fH = 190, fPad = 36;
        const fs = Math.min((fW - 2 * fPad) / Math.max(0.1, res.imageWidth), (fH - 2 * fPad) / Math.max(0.1, res.imageHeight));
        const pw = res.imageWidth * fs, ph = res.imageHeight * fs, fx = (fW - pw) / 2, fy = (fH - ph) / 2;
        const frontSvg = `<svg viewBox="0 0 ${fW} ${fH}" style="width:100%; height:175px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px;">
          ${pr.screenPhotoUrl ? `<image href="${pr.screenPhotoUrl}" x="${fx}" y="${fy}" width="${pw}" height="${ph}" preserveAspectRatio="xMidYMid slice" opacity="0.7" />` : ''}
          <rect x="${fx}" y="${fy}" width="${pw}" height="${ph}" fill="${pr.screenPhotoUrl ? 'none' : '#e0f2fe'}" stroke="#0284c7" stroke-width="2" />
          <line x1="${fx}" y1="${fy}" x2="${fx + pw}" y2="${fy + ph}" stroke="#0284c7" stroke-dasharray="4 3" opacity="0.5" />
          <text x="${fW / 2}" y="${fy - 8}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600">${round(res.imageWidth, 2)} m</text>
          <text x="${fx - 10}" y="${fH / 2}" text-anchor="middle" fill="#0f172a" font-size="11" font-weight="600" transform="rotate(-90 ${fx - 10} ${fH / 2})">${round(res.imageHeight, 2)} m</text>
          <text x="${fW / 2}" y="${fH / 2 + 2}" text-anchor="middle" fill="#0369a1" font-size="11" font-weight="600">${round(res.diagonal / 0.0254, 1)}" (${round(res.diagonal, 2)} m)</text>
          <text x="${fW / 2}" y="${fH / 2 + 16}" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="600">Alan: ${round(res.imageWidth * res.imageHeight, 2)} m²</text>
        </svg>`;

        // Yan Optik Kesit SVG (Atım Geometrisi)
        const sW = 380, sH = 190, sPad = 32;
        const spanY = Math.max(res.bounds.top, 0.2) - Math.min(res.bounds.bottom, -0.2);
        const ss = Math.min((sW - 2 * sPad - 50) / Math.max(0.2, res.lensToSurface), (sH - 2 * sPad) / Math.max(0.2, spanY));
        const sx0 = sPad + 24, sxs = sx0 + res.lensToSurface * ss;
        const syAxis = sPad + Math.max(res.bounds.top, 0.2) * ss;
        const syT = syAxis - res.bounds.top * ss, syB = syAxis - res.bounds.bottom * ss;
        const sideSvg = `<svg viewBox="0 0 ${sW} ${sH}" style="width:100%; height:175px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:4px;">
          <polygon points="${sx0},${syAxis} ${sxs},${syT} ${sxs},${syB}" fill="#38bdf8" fill-opacity="0.2" stroke="#0284c7" stroke-width="1.5" />
          <line x1="${sx0}" y1="${syAxis}" x2="${sxs}" y2="${syAxis}" stroke="#d97706" stroke-dasharray="4 3" />
          <rect x="${sx0 - 24}" y="${syAxis - 10}" width="24" height="20" fill="#475569" rx="2" />
          <circle cx="${sx0}" cy="${syAxis}" r="3.5" fill="#d97706" />
          <line x1="${sxs}" y1="${syT}" x2="${sxs}" y2="${syB}" stroke="#0f172a" stroke-width="3" />
          <text x="${(sx0 + sxs) / 2}" y="${syAxis - 6}" fill="#b45309" font-size="10" font-weight="600" text-anchor="middle">D = ${round(res.lensToSurface, 2)} m (TR ${round(res.throwRatio, 2)}:1)</text>
          <text x="${sxs + 5}" y="${(syT + syB) / 2 + 4}" fill="#0f172a" font-size="10" font-weight="600">H = ${round(res.imageHeight, 2)} m</text>
        </svg>`;

        return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div>
            <div style="font-size:11px; font-weight:600; color:#334155; margin-bottom:4px;">Ön Görünüş — ${pr.screenName ? esc(pr.screenName) : 'Ekran Boyutu'}</div>
            ${frontSvg}
          </div>
          <div>
            <div style="font-size:11px; font-weight:600; color:#334155; margin-bottom:4px;">Yan Optik Kesit — Atım Geometrisi</div>
            ${sideSvg}
          </div>
        </div>`;
      })()}
    </section>`);
  }

  // 5. FOTOMETRİK LUX & PARLAKLIK ANALİZİ (YÜZEY BAZLI AYRI LUX HARİTALARI & DAĞILIM CETVELLERİ)
  if (p.sections.lux) {
    if (p.photometricSurfaces && p.photometricSurfaces.length > 0) {
      const pSurfs = p.enabledSurfaceIds && p.enabledSurfaceIds.length > 0
        ? p.photometricSurfaces.filter(s => p.enabledSurfaceIds!.includes(s.surfaceId) || s.surfaceId.startsWith("quick-") || (s as any).isManualLux)
        : p.photometricSurfaces;

      const surfaceCards = pSurfs.map((s, idx) => {
        const avgL = Math.round(s.avgLux);
        const minL = Math.round(s.minLux);
        const maxL = Math.round(s.maxLux);
        const u0 = (s.uniformityU0 * 100).toFixed(1);
        const u1 = (s.uniformityU1 * 100).toFixed(1);
        const nits = Math.round(s.luminanceNits);
        const fl = s.luminanceFL.toFixed(1);
        const acr = Math.round(s.ambientContrastRatio);

        const luxStatusColor = avgL >= 300 && avgL <= 600 ? 'background:#dcfce7; color:#166534;' : avgL > 600 ? 'background:#e0f2fe; color:#0369a1;' : 'background:#fee2e2; color:#991b1b;';
        const luxStatusText = avgL >= 300 && avgL <= 600 ? '✓ Müze & Sergi İdeal (300–500 lx)' : avgL > 600 ? '✓ Yüksek Aydınlık (Canlı)' : '⚠ Düşük Aydınlık (Karartma Şart)';

        const uStatusColor = +u0 >= 60 ? 'background:#dcfce7; color:#166534;' : +u0 >= 40 ? 'background:#fef3c7; color:#92400e;' : 'background:#fee2e2; color:#991b1b;';
        const uStatusText = +u0 >= 60 ? '✓ Çok Yüksek Homojenlik' : +u0 >= 40 ? '✓ Kabul Edilebilir Düzgünlük' : '⚠ Köşelerde Kararma Riski';

        return `
        <div class="photometric-report-card">
          <div class="photometric-card-header">
            <div>
              <h3 class="surface-multi-card-title">${idx + 1}. ${esc(s.surfaceName)} — Fotometrik Aydınlık Analizi</h3>
              <div style="font-size: 11px; color: #475569; margin-top: 2px; display:flex; align-items:center; gap:8px;">
                <span>${s.widthM}m × ${s.heightM}m</span>
                <span style="background:#dcfce7; color:#166534; font-weight:700; padding:1px 6px; border-radius:4px; border:1px solid #bbf7d0;">
                  📐 Alan: ${(s.widthM * s.heightM).toFixed(2)} m²
                </span>
                <span>· ${s.projectorCount} Adet Projektör</span>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${s.isManualLux ? '<span class="badge-circuit" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">✏️ Manuel Saha Ölçümü</span>' : '<span class="badge-circuit" style="background:#e0f2fe; color:#0369a1;">⚡ Noktadan Noktaya Simülasyon</span>'}
              <span class="surface-multi-card-badge">${s.surfaceType === 'floor' ? 'Zemin / Floor' : s.surfaceType === 'ceiling' ? 'Tavan' : 'Duvar / Wall'}</span>
            </div>
          </div>

          <div class="photometric-grid-layout">
            <!-- Sol: 2B Isı Haritası Fotoğrafı -->
            <div class="heatmap-report-container">
              ${s.heatmapSnapshotUrl ? `
                <img src="${esc(s.heatmapSnapshotUrl)}" alt="${esc(s.surfaceName)} Lux Haritası" class="heatmap-report-img" />
                <div class="heatmap-report-caption">📸 2D Lux Isı Dağılımı ve Projektör Sınırları (${minL} lx → ${maxL} lx)</div>
              ` : `
                <div style="padding: 32px 16px; text-align: center; color: #94a3b8; font-size: 11px;">
                  <i>Fotometrik Isı Haritası görseli Lüks Hesaplayıcı sekmesinden aktarılacaktır.</i>
                </div>
              `}
            </div>

            <!-- Sağ: 4 Temel Fotometrik Metrik -->
            <div class="photometric-mini-metrics">
              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Ortalama Aydınlık (Lux)</div>
                <div class="photometric-mini-value" style="color: #0284c7;">${avgL} <span style="font-size:11px; font-weight:normal; color:#64748b;">lx</span></div>
                <div class="photometric-mini-sub">Min: <b>${minL}</b> / Max: <b>${maxL}</b> lx</div>
                <div class="photometric-mini-badge" style="${luxStatusColor}">${luxStatusText}</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Işık Düzgünlüğü (Uniformity)</div>
                <div class="photometric-mini-value" style="color: #059669;">%${u0}</div>
                <div class="photometric-mini-sub">U0 (Min/Ort): <b>%${u0}</b> · U1: <b>%${u1}</b></div>
                <div class="photometric-mini-badge" style="${uStatusColor}">${uStatusText}</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Gözlenen Parlaklık</div>
                <div class="photometric-mini-value" style="color: #d97706;">${nits} <span style="font-size:11px; font-weight:normal; color:#64748b;">cd/m²</span></div>
                <div class="photometric-mini-sub">${fl} fL · Ekran Gain: ${s.screenGain}x</div>
                <div class="photometric-mini-badge" style="background:#fef3c7; color:#92400e;">✓ Müze Kontrastı İçin İdeal</div>
              </div>

              <div class="photometric-mini-card">
                <div class="photometric-mini-title">Ortam Kontrastı (ACR)</div>
                <div class="photometric-mini-value" style="color: #7c3aed;">${acr}:1</div>
                <div class="photometric-mini-sub">Ortam Işığı: <b>${s.ambientLux} Lux</b></div>
                <div class="photometric-mini-badge" style="${acr >= 15 ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">${acr >= 15 ? '✓ Yüksek Okunabilirlik' : '⚠ Düşük Kontrast'}</div>
              </div>
            </div>
          </div>

          <!-- Işık Düzgünlüğü (Uniformity) Dinamik Açıklama Kutusu -->
          <div style="margin-top: 8px; margin-bottom: 8px; padding: 7px 10px; background: #f8fafc; border-left: 3.5px solid ${+u0 >= 75 ? '#059669' : +u0 >= 60 ? '#d97706' : '#dc2626'}; border-radius: 4px; font-size: 10.5px; color: #334155; line-height: 1.4;">
            <b>💡 Işık Düzgünlüğü (Uniformity / Homojenlik) Nedir?</b>
            Projeksiyon görüntüsünün merkezinden 4 köşesine doğru aydınlığın ne kadar dengeli dağıldığını gösterir (U0 = E_min / E_avg). 
            ${+u0 >= 75 
              ? `Bu kurulumdaki <b>%${u0}</b> düzgünlük oranı profesyonel müze standartlarına tam uygundur; köşelerde gözün algılayacağı kararma (vinyet) oluşmaz.`
              : +u0 >= 60 
              ? `Bu kurulumdaki <b>%${u0}</b> düzgünlük oranı genel mekanlar için kabul edilebilir toleranstadır; köşelerde standart optik düşüş görülür.`
              : `⚠ DİKKAT: <b>%${u0}</b> düzgünlük oranı düşüktür; ekranın köşe ve kenarlarında belirgin kararma (vinyet) ve ışık kaybı oluşur. Projektör adedi veya atım mesafesi artırılmalıdır.`}
          </div>

          <!-- Projektör Kapsama & Dağılım Cetveli -->
          ${s.distributionRows && s.distributionRows.length > 0 ? `
            <div style="margin-top: 10px;">
              <div style="font-size: 11px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                📏 Projektör Kapsama, Atım ve Bindirme (Overlap) Dağılım Cetveli:
              </div>
              <table class="compact-table" style="background:#ffffff; font-size:11px;">
                <thead style="background:#f1f5f9; color:#334155;">
                  <tr>
                    <th>Cihaz Kodu</th>
                    <th>Başlangıç</th>
                    <th>Bitiş</th>
                    <th>Açılan Genişlik</th>
                    <th>Optik Merkez (X)</th>
                    <th>Atım (D) / TR</th>
                    <th>Komşu Örtüşme (Blend)</th>
                  </tr>
                </thead>
                <tbody>
                  ${s.distributionRows.map((r) => `
                    <tr>
                      <td><b>${esc(r.code)}</b> ${r.rowName ? `<span style="font-size:10px; color:#64748b;">(${esc(r.rowName)})</span>` : ''}</td>
                      <td style="font-family:monospace;">${r.startX.toFixed(2)} m</td>
                      <td style="font-family:monospace;">${r.endX.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#059669; font-weight:bold;">${r.widthM.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#0284c7;">${r.centerX.toFixed(2)} m</td>
                      <td style="font-family:monospace; color:#475569;">D=${r.throwDistM.toFixed(2)}m (TR: ${r.throwRatio}:1)</td>
                      <td style="color:#b45309; font-weight:600;">${esc(r.overlapText)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
        `;
      }).join('');

      blocks.push(`<section class="report-section">
        <h2>${tr.lux}</h2>
        ${surfaceCards}
      </section>`);
    } else if (p.lux && p.lux.widthM > 0 && p.lux.heightM > 0 && p.lux.ansiLumens.length > 0) {
      const lx = computeLux({
        ansiLumens: p.lux.ansiLumens,
        brightnessPct: p.lux.brightnessPct,
        width: p.lux.widthM,
        height: p.lux.heightM,
        gain: p.lux.gain,
        ambientLux: p.lux.ambientLux,
      });
      assumptions.push(...lx.assumptions);
      blocks.push(`<section class="report-section">
        <h2>${tr.lux}</h2>
        <table><tbody>
          <tr><th>${tr.totalFlux}</th><td><b>${round(lx.totalLumens, 0)} ANSI Lümen</b></td><th>${tr.illuminance}</th><td><b>${round(lx.illuminanceLux, 1)} Lux</b> (${round(lx.illuminanceFc, 1)} fc)</td></tr>
          <tr><th>${tr.luminance}</th><td><b>${round(lx.luminanceNits, 1)} cd/m² (Nit)</b> (${round(lx.luminanceFL, 1)} fL)</td><th>Ekran Gain / Yansıtma</th><td>${p.lux.gain} Gain</td></tr>
        </tbody></table>
      </section>`);
    }
  }

  // 6. ÇOKLU PROJEKTÖR & KANVAS HARİTALAMA (YÜZEY BAZLI AYRI PAFTALAR: ZEMİN, SAĞ DUVAR, SOL DUVAR VB.)
  if (p.sections.multiProjector) {
    const surfsToRender = p.plannerSurfaces && p.plannerSurfaces.length > 0
      ? (p.enabledSurfaceIds && p.enabledSurfaceIds.length > 0
          ? p.plannerSurfaces.filter((s: any) => p.enabledSurfaceIds!.includes(s.id))
          : p.plannerSurfaces)
      : [];

    if (surfsToRender.length > 0) {
      const surfaceCardsHtml = surfsToRender.map((s: any, sIdx: number) => {
        const svg = generateSurfaceMultiSvg(s);
        const area = round(s.areaM2 || (s.effectiveWidthM * s.effectiveHeightM), 2);
        const totalPj = s.cols * s.rows;
        const totalPjWatt = totalPj * 1350;
        const totalLumens = totalPj * 6000;
        return [
          '<div class="surface-multi-card">',
          '  <div class="surface-multi-card-header">',
          '    <h3 class="surface-multi-card-title">',
          '      ' + (sIdx + 1) + '. ' + esc(s.name) + ' — Çoklu Projeksiyon Yerleşimi',
          '    </h3>',
          '    <span class="surface-multi-card-badge">',
          '      ' + s.cols + ' × ' + s.rows + ' = ' + totalPj + ' Projektör (' + (s.orient === 'portrait' ? 'Dikey/Portrait' : 'Yatay/Landscape') + ')',
          '    </span>',
          '  </div>',
          '  <table>',
          '    <tbody>',
          '      <tr>',
          '        <th>Fiziksel Boyut & Alan</th>',
          '        <td><b>' + s.effectiveWidthM + 'm × ' + s.effectiveHeightM + 'm</b> (' + area + ' m²)</td>',
          '        <th>Net İçerik Çözünürlüğü</th>',
          '        <td><b>' + s.netW + ' × ' + s.netH + ' px</b> (' + round((s.netW * s.netH) / 1000000, 2) + ' MP)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Projektör Başı Çözünürlük</th>',
          '        <td>' + (s.customW || 1920) + ' × ' + (s.customH || 1200) + ' px</td>',
          '        <th>Overlap (Bindirme) Oranı</th>',
          '        <td>Yatay: <b>%' + s.overlapX + '</b> (' + (s.ovPxX || 0) + ' px) | Dikey: <b>%' + s.overlapY + '</b> (' + (s.ovPxY || 0) + ' px)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Lens & Atım Mesafesi (D)</th>',
          '        <td><b>D = ' + s.throwDistM + ' m</b> (Atım Oranı: <b>' + s.throwRatio + ':1</b>)</td>',
          '        <th>Piksel Yoğunluğu & Kalite</th>',
          '        <td><b>' + (s.distMmPerPx || s.avgMmPerPx || '—') + ' mm/px</b> (İzleme Mesafesi: ' + s.viewDistM + 'm)</td>',
          '      </tr>',
          '      <tr>',
          '        <th>Kurulu Projektör Gücü</th>',
          '        <td>' + totalPj + ' Adet × 1350W = <b>' + totalPjWatt + ' W</b> (' + round(totalPjWatt / 1000, 2) + ' kW)</td>',
          '        <th>Tahmini Işık Akısı (Toplam)</th>',
          '        <td><b>~' + totalLumens.toLocaleString('tr-TR') + ' ANSI Lümen</b></td>',
          '      </tr>',
          '    </tbody>',
          '  </table>',
          '  <div class="diagram" style="margin-top: 10px;">',
          '    ' + svg,
          '  </div>',
          '</div>'
        ].join('\n');
      }).join('\n');

      blocks.push([
        '<section class="report-section">',
        '  <h2>' + tr.multi + ' (Yüzey Bazlı Ayrı Paftalar)</h2>',
        '  <p class="section-intro">Mekandaki projeksiyon yüzeyleri aşağıda bağımsız paftalar halinde detaylandırılmıştır. Zemin ve duvarlar ayrı ayrı ele alınmış olup her yüzeyin matrisi, overlap oranları, net çözünürlükleri ve optik parametreleri sunulmuştur.</p>',
        '  ' + surfaceCardsHtml,
        '</section>'
      ].join('\n'));
    } else if (p.mappingSlots && p.mappingSlots.length > 0) {
      const L = computeLayout(p.mappingSlots);
      warnings.push(...L.warnings);
      const svg = layoutToSvg(L, { gridStep: 200, showCoords: true });
      blocks.push('<section class="report-section"><h2>' + tr.multi + '</h2><p><b>' + tr.canvasRes + ':</b> ' + L.canvasW + ' × ' + L.canvasH + ' px &nbsp;|&nbsp; <b>' + tr.overlapCount + ':</b> ' + L.overlaps.length + '</p><div class="diagram">' + svg + '</div></section>');
    }
  }

  // 7. LED DUVAR SPESİFİKASYONLARI
  if (p.sections.led && p.led && p.led.cols > 0 && p.led.rows > 0) {
    const r = ledFromCabinets(p.led.cabinet, p.led.cols, p.led.rows, p.led.spareFraction, { voltage: 230, powerFactor: 1 });
    warnings.push(...r.warnings);
    assumptions.push(...r.approximations);
    const svg = toSvg(ledElevation(p.led.cabinet, p.led.cols, p.led.rows), { background: '#0f172a' });
    blocks.push(`<section class="report-section">
      <h2>${tr.led}</h2>
      <table><tbody>
        <tr><th>${tr.physSize}</th><td>${r.widthMm} × ${r.heightMm} mm (${round(r.areaM2, 2)} m²)</td><th>${tr.nativeRes}</th><td>${r.resX} × ${r.resY} px (pitch ${p.led.cabinet.pitchMm} mm)</td></tr>
        <tr><th>${tr.cabinets}</th><td>${r.qty} (${r.cols}×${r.rows}) + ${r.spareQty}</td><th>${tr.powerWeight}</th><td>${r.powerTypW ?? 0}/${r.powerMaxW ?? 0} W · ${round(r.weightKg ?? 0, 1)} kg</td></tr>
      </tbody></table>
      ${p.sections.drawings2d ? `<div class="diagram">${svg}</div>` : ''}
    </section>`);
  }

  // 8. ELEKTRİK YÜK & TEK HAT ŞEMASI
  if (p.sections.electrical && p.electrical) {
    const el = analyze(p.electrical.loads, p.electrical.circuits, p.electrical.supply);
    warnings.push(...el.warnings);
    assumptions.push(...el.assumptions);
    for (const c of el.circuits) warnings.push(...c.warnings.map(w => `${c.circuit.name}: ${w}`));
    const sld = toSvg(electricalSingleLine(p.electrical.loads, p.electrical.circuits, p.electrical.supply, el), { background: '#0b1220' });

    const circuitRows = el.circuits.map(c => `
      <tr>
        <td><b>${esc(c.circuit.name)}</b></td>
        <td><span class="badge-circuit">${esc(c.circuit.phase ?? 'L1')}</span></td>
        <td><b>${c.breakerA ?? 16} A</b> (B-Tipi)</td>
        <td>${c.circuit.cableMm2 ?? 2.5} mm² NYM / Halogen-Free</td>
        <td><b>${round(c.ibA, 1)} A</b></td>
        <td>${Math.round(c.powerW)} W</td>
        <td>${c.dropPct !== undefined ? `%${round(c.dropPct, 2)}` : '—'}</td>
        <td>${c.warnings.length === 0 ? '<span class="badge-success">✓ Uygun</span>' : `<span class="badge-danger">${esc(c.warnings.join(' | '))}</span>`}</td>
      </tr>
    `).join('');

    blocks.push(`<section class="report-section">
      <h2>${tr.electrical}</h2>
      <p><b>${tr.totalPower}:</b> ${Math.round(el.totalW)} W / ${Math.round(el.demandW)} W (Ib = ${round(el.totalIbA, 1)} A) &nbsp;|&nbsp; <b>${tr.mainBreaker}:</b> ${el.mainBreakerA ?? '—'} A</p>
      
      <div class="diagram cad-diagram">${sld}</div>

      <h3 class="sub-heading">Linye Dağıtım & Yük Dengeleme Tablosu</h3>
      <table class="compact-table">
        <thead>
          <tr>
            <th>Linye Adı</th>
            <th>Faz</th>
            <th>Sigorta Anma Akımı</th>
            <th>Kablo Kesiti</th>
            <th>Çalışma Akımı (Ib)</th>
            <th>Toplam Yük</th>
            <th>Gerilim Düşümü</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>${circuitRows}</tbody>
      </table>
    </section>`);
  }

  // 9. 2B TEKNİK CAD ÇİZİMLERİ (Mimari Yerleşim & Mapping Çizimi)
  {
    if (p.sections.architecturalPlan && p.architecturalPlanSvg) {
      blocks.push(`<section class="report-section">
        <h2>${tr.archPlan}</h2>
        <p class="section-intro">Aşağıdaki mimari yerleşim planında oda dış sınırları, projeksiyon cihazlarının tavandaki askı merkezleri, duvardan dik atım mesafeleri (D) ve 230V besleme prizleri şematik olarak gösterilmiştir.</p>
        <div class="diagram cad-diagram">${p.architecturalPlanSvg}</div>
        <div class="legend-row">
          <span><b style="color:#ef4444">🔴 Kırmızı Daire:</b> 230V 16A Priz Noktası</span>
          <span><b style="color:#0ea5e9">🟦 Mavi Kutu:</b> Projektör Askı Noktası</span>
          <span><b style="color:#10b981">📏 D:</b> Duvardan Lens Atım Mesafesi (m)</span>
          <span><b style="color:#f59e0b">📐 H:</b> Yerden Lens Montaj Kotu (m)</span>
        </div>
      </section>`);
    }

    if (p.sections.drawings2d && p.mappingSlots && p.mappingSlots.length > 0) {
      const L = computeLayout(p.mappingSlots);
      const cadSvg = toSvg(mappingDrawing(L), { background: '#0f172a' });
      blocks.push(`<section class="report-section"><h2>${tr.drawings}</h2><div class="diagram">${cadSvg}</div></section>`);
    }
  }

  // 10. EKİPMAN LİSTESİ (BOM)
  if (p.sections.equipmentList && p.equipmentList && p.equipmentList.length > 0) {
    const rows = p.equipmentList.map(e => `
      <tr>
        <td><b>${esc(e.category)}</b></td>
        <td>${esc(e.manufacturer)} ${esc(e.model)}</td>
        <td style="text-align:center"><b>${e.qty}</b></td>
        <td>${esc(e.notes ?? '—')}</td>
      </tr>
    `).join('');
    blocks.push(`<section class="report-section">
      <h2>${tr.equipment}</h2>
      <table class="compact-table">
        <thead>
          <tr>
            <th>${tr.category}</th>
            <th>${tr.item}</th>
            <th style="text-align:center">${tr.qty}</th>
            <th>${tr.notes}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`);
  }

  // 11. TEKNİK KABULLER & MÜHENDİSLİK ONAYI
  if (p.sections.assumptionsAndWarnings) {
    const wHtml = warnings.length ? `<ul class="warning-list">${[...new Set(warnings)].map(w => `<li class="warn">⚠ ${esc(w)}</li>`).join('')}</ul>` : '<p class="text-muted">Kritik bir mühendislik uyarısı bulunmamaktadır.</p>';
    const aHtml = assumptions.length ? `<ul class="assumption-list">${[...new Set(assumptions)].map(a => `<li>• ${esc(a)}</li>`).join('')}</ul>` : '';

    blocks.push(`<section class="report-section">
      <h2>${tr.assumptions}</h2>
      ${wHtml}
      ${aHtml}
    </section>`);
  }

  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8"/>
<title>${esc(m.projectName)} — ${tr.reportTitle}</title>
<style>
  :root {
    --primary: #0284c7;
    --primary-dark: #0369a1;
    --dark: #0f172a;
    --border: #cbd5e1;
    --bg-alt: #f8fafc;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #ffffff;
    margin: 0;
    padding: 32px;
    line-height: 1.5;
    font-size: 13px;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid var(--primary);
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .report-header h1 {
    font-size: 22px;
    margin: 0 0 4px;
    color: var(--primary-dark);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .company-title {
    font-size: 14px;
    color: #475569;
    font-weight: 600;
  }
  .header-logo {
    max-height: 64px;
    max-width: 220px;
    object-fit: contain;
  }
  
  .meta-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .meta-table th, .meta-table td {
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .meta-table th {
    background: #f1f5f9;
    color: #334155;
    width: 16%;
    font-weight: 600;
    text-align: left;
  }
  
  .report-section {
    margin-bottom: 32px;
    break-inside: avoid;
  }
  h2 {
    font-size: 16px;
    color: #0f172a;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 6px;
    margin: 24px 0 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub-heading {
    font-size: 13px;
    color: #334155;
    margin: 16px 0 8px;
    font-weight: 700;
  }
  .section-intro {
    font-size: 12px;
    color: #475569;
    margin-bottom: 12px;
  }
  
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .metric-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 12px;
    border-radius: 6px;
    text-align: center;
  }
  .metric-val {
    font-size: 18px;
    font-weight: 800;
    font-family: monospace;
    margin-bottom: 2px;
  }
  .metric-lbl {
    font-size: 11px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .text-sky { color: #0284c7; }
  .text-amber { color: #d97706; }
  .text-emerald { color: #059669; }
  .text-purple { color: #7c3aed; }
  .text-rose { color: #e11d48; }
  
  .three-d-gallery {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 12px 0;
  }
  .three-d-card {
    background: #090e17;
    border: 1px solid #1e293b;
    border-radius: 8px;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .three-d-card-label {
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
  }
  .three-d-img {
    width: 100%;
    height: auto;
    display: block;
    max-height: 82vh;
    object-fit: contain;
    background: #060911;
  }
  .empty-3d-box {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    padding: 16px;
    border-radius: 6px;
    color: #64748b;
    font-size: 12px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 10px 0;
  }
  th, td {
    border: 1px solid #cbd5e1;
    padding: 7px 10px;
    text-align: left;
  }
  th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
  }
  .compact-table th, .compact-table td {
    padding: 5px 8px;
    font-size: 11px;
  }
  .pj-matrix-table td {
    font-family: monospace;
    font-size: 11px;
  }
  .pj-id-cell {
    color: #0284c7;
  }
  .measure-cell {
    text-align: right;
  }
  .highlight-cell {
    background: #f0fdf4;
    color: #166534;
    font-weight: 700;
  }
  .coord-cell {
    font-size: 10px;
    color: #475569;
  }
  
  .diagram {
    margin: 14px 0;
    max-width: 100%;
    background: #090e17;
    border: 1px solid #334155;
    border-radius: 6px;
    overflow: hidden;
    padding: 8px;
  }
  .diagram svg {
    width: 100%;
    height: auto;
    max-height: 420px;
    display: block;
  }
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
    background: #f8fafc;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    margin-top: 6px;
  }
  
  .badge-circuit {
    display: inline-block;
    padding: 2px 6px;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
  }
  .badge-success {
    color: #15803d;
    font-weight: bold;
  }
  .badge-danger {
    color: #b91c1c;
    font-weight: bold;
  }
  .guideline-card {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    padding: 12px;
    border-radius: 6px;
    margin-top: 14px;
    font-size: 11px;
    color: #1e3a8a;
  }
  .guideline-card ul {
    margin: 6px 0 0 18px;
    padding: 0;
  }
  .guideline-card li {
    margin-bottom: 4px;
  }
  .surface-multi-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .photometric-report-card {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .photometric-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .photometric-grid-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 14px;
    align-items: start;
  }
  @media (max-width: 820px) {
    .photometric-grid-layout {
      grid-template-columns: 1fr;
    }
  }
  .heatmap-report-container {
    background: #070b14;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .heatmap-report-img {
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    border-radius: 4px;
    background: #020617;
  }
  .heatmap-report-caption {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 6px;
    font-family: monospace;
    text-align: center;
  }
  .photometric-mini-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .photometric-mini-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
  }
  .photometric-mini-title {
    font-size: 10.5px;
    color: #64748b;
    font-weight: 600;
  }
  .photometric-mini-value {
    font-size: 17px;
    font-weight: 800;
    font-family: monospace;
    margin: 2px 0;
  }
  .photometric-mini-sub {
    font-size: 10px;
    color: #475569;
  }
  .photometric-mini-badge {
    margin-top: 4px;
    font-size: 9.5px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }
  .surface-multi-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .surface-multi-card-title {
    margin: 0;
    color: #0284c7;
    font-size: 15px;
    font-weight: 700;
  }
  .surface-multi-card-badge {
    font-family: monospace;
    font-size: 12px;
    color: #0369a1;
    font-weight: bold;
    background: #e0f2fe;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #bae6fd;
  }
  .surface-multi-card table {
    margin-bottom: 12px;
    background: #ffffff;
  }
  .surface-multi-card th {
    background: #f1f5f9;
    color: #1e293b;
    font-weight: 600;
    width: 22%;
  }
  .surface-multi-card td {
    background: #ffffff;
    color: #1e293b;
  }
  .note-box {
    background: #fffbeb;
    border: 1px solid #fef3c7;
    padding: 10px 12px;
    border-radius: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: #92400e;
  }
  .warning-list { color: #b45309; padding-left: 20px; }
  .assumption-list { color: #475569; padding-left: 20px; font-size: 11px; }
  

  
  @media print {
    body { margin: 8mm; padding: 0; }
    .report-section { break-inside: avoid; page-break-after: auto; }
    .report-section.room3d-section { break-inside: auto; page-break-inside: auto; }
    .three-d-card + .three-d-card { break-before: page; page-break-before: always; }
    .three-d-img { width: 100%; max-height: 235mm; }
    .heatmap-report-img { width: 100%; max-height: 155mm; }
    .diagram svg { width: 100%; max-height: 220mm; }
  }
</style>
</head>
<body>

<header class="report-header">
  <div>
    <h1>${tr.reportTitle}</h1>
    <div class="company-title">${esc(m.companyName)}</div>
  </div>
  ${m.companyLogoDataUrl ? `<img src="${esc(m.companyLogoDataUrl)}" alt="logo" class="header-logo"/>` : ''}
</header>

<table class="meta-table">
  <tbody>
    <tr>
      <th>${tr.project}</th>
      <td><b>${esc(m.projectName)}</b></td>
      <th>${tr.customer}</th>
      <td><b>${esc(m.customer)}</b></td>
    </tr>
    <tr>
      <th>${tr.location}</th>
      <td>${esc(m.location)}</td>
      <th>${tr.category}</th>
      <td>${esc(m.category)}</td>
    </tr>
    <tr>
      <th>${tr.date}</th>
      <td>${esc(m.date)}</td>
      <th>${tr.revision}</th>
      <td><b>Rev ${m.revision}</b></td>
    </tr>
  </tbody>
</table>

${blocks.join('\n')}

</body>
</html>`;
}
